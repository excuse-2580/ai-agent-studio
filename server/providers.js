/**
 * 模型调用层：统一走 OpenAI 兼容的 /chat/completions
 * 本地 GGUF（llama.cpp server / Ollama / LM Studio）与云端大模型用同一套协议，
 * 所以这里是唯一的请求出口，方便统一做流式解析、超时与降级。
 */

const DEFAULT_TIMEOUT = 120_000;

export class ProviderError extends Error {
  constructor(message, { status = 500, detail = '' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.detail = detail;
  }
}

function endpoint(baseURL) {
  const base = String(baseURL || '').trim().replace(/\/+$/, '');
  if (!base) throw new ProviderError('模型源缺少 API 地址', { status: 400 });
  // 允许直接填到 /v1/chat/completions，也允许只填 /v1
  if (/\/chat\/completions$/.test(base)) return base;
  return `${base}/chat/completions`;
}

function headersOf(model) {
  const h = { 'Content-Type': 'application/json' };
  if (model.apiKey) h.Authorization = `Bearer ${model.apiKey}`;
  return h;
}

/**
 * 拉取模型源上可用的模型 id 列表
 */
export async function listRemoteModels(model, { timeout = 15_000 } = {}) {
  const base = String(model.baseURL || '').trim().replace(/\/+$/, '');
  if (!base) throw new ProviderError('模型源缺少 API 地址', { status: 400 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${base}/models`, {
      method: 'GET',
      headers: headersOf(model),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ProviderError(`拉取模型列表失败（HTTP ${res.status}）`, {
        status: 502,
        detail: text.slice(0, 300),
      });
    }
    const json = await res.json();
    const arr = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return arr
      .map((m) => (typeof m === 'string' ? m : m?.id || m?.name || m?.model))
      .filter(Boolean)
      .sort();
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err?.name === 'AbortError') throw new ProviderError('连接超时', { status: 504 });
    throw new ProviderError(`无法连接到 ${base}`, { status: 502, detail: String(err?.message || err) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 连通性测试：优先拉模型列表，失败则退化成一次极短的对话请求
 */
export async function testConnection(model, { timeout = 20_000 } = {}) {
  const started = Date.now();
  try {
    const models = await listRemoteModels(model, { timeout });
    return {
      ok: true,
      latencyMs: Date.now() - started,
      message: models.length ? `连接成功，发现 ${models.length} 个模型` : '连接成功',
      models,
    };
  } catch (err) {
    if (err?.status && err.status !== 502 && err.status !== 504) {
      return { ok: false, latencyMs: Date.now() - started, message: err.message, detail: err.detail };
    }
    // 有些本地服务不实现 /models，用一次真实对话探测
    try {
      await chatOnce(model, [{ role: 'user', content: 'hi' }], { maxTokens: 8, timeout });
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: '连接成功（该服务未提供模型列表接口，已用对话探测）',
        models: [],
      };
    } catch (e2) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: e2?.message || '连接失败',
        detail: e2?.detail || '',
      };
    }
  }
}

export async function chatOnce(model, messages, { temperature, topP, maxTokens, timeout = DEFAULT_TIMEOUT, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(endpoint(model.baseURL), {
      method: 'POST',
      headers: headersOf(model),
      signal: ctrl.signal,
      body: JSON.stringify({
        model: model.model || 'local-model',
        messages,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        stream: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ProviderError(`模型返回错误（HTTP ${res.status}）`, { status: 502, detail: text.slice(0, 500) });
    }
    const json = await res.json();
    const choice = json?.choices?.[0];
    return {
      content: choice?.message?.content ?? '',
      reasoning: choice?.message?.reasoning_content ?? '',
      usage: json?.usage || null,
    };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err?.name === 'AbortError') throw new ProviderError('请求超时或被取消', { status: 504 });
    throw new ProviderError(`请求失败：${err?.message || err}`, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 流式对话：产出 { type: 'thinking' | 'content', text } 增量
 */
export async function* streamChat(model, messages, opts = {}) {
  const { temperature, topP, maxTokens, timeout = DEFAULT_TIMEOUT, signal } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });

  let res;
  try {
    res = await fetch(endpoint(model.baseURL), {
      method: 'POST',
      headers: headersOf(model),
      signal: ctrl.signal,
      body: JSON.stringify({
        model: model.model || 'local-model',
        messages,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        stream: true,
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') throw new ProviderError('请求超时或被取消', { status: 504 });
    throw new ProviderError(`无法连接到 ${model.baseURL}`, { status: 502, detail: String(err?.message || err) });
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    clearTimeout(timer);
    // 服务端不支持流式，交给上层降级为非流式
    throw new ProviderError(`模型返回错误（HTTP ${res.status}）`, { status: 502, detail: text.slice(0, 500), retryNoStream: true });
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const reader = res.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const payload = parseSSE(chunk);
        if (!payload) continue;
        if (payload === '[DONE]') return;
        const delta = payload?.choices?.[0]?.delta || {};
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
          yield { type: 'thinking', text: delta.reasoning_content };
        }
        if (typeof delta.content === 'string' && delta.content) {
          yield { type: 'content', text: delta.content };
        }
      }
    }
    // 兼容没有以空行收尾的实现
    const tail = parseSSE(buffer);
    if (tail && tail !== '[DONE]') {
      const delta = tail?.choices?.[0]?.delta || {};
      if (delta.content) yield { type: 'content', text: delta.content };
    }
  } catch (err) {
    if (err?.name !== 'AbortError') throw new ProviderError('读取模型输出中断', { status: 502, detail: String(err?.message || err) });
  } finally {
    clearTimeout(timer);
    try {
      reader.cancel();
    } catch {
      /* noop */
    }
  }
}

function parseSSE(chunk) {
  const lines = String(chunk).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data) continue;
    if (data === '[DONE]') return '[DONE]';
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return null;
}
