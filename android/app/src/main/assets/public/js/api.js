/**
 * 与后端通信的轻量封装
 *
 * 服务地址可配置：
 *   - 浏览器 / PWA 同机访问时为空（相对路径，同源）
 *   - 手机访问局域网里的电脑、或 APK 打包后，填入 http://192.168.x.x:5178
 */
const BASE_KEY = 'aas.apiBase';

export function getBase() {
  try {
    return (localStorage.getItem(BASE_KEY) || '').trim().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function setBase(url) {
  const v = String(url || '').trim().replace(/\/+$/, '');
  try {
    if (v) localStorage.setItem(BASE_KEY, v);
    else localStorage.removeItem(BASE_KEY);
  } catch {
    /* noop */
  }
  return v;
}

/** 拼接成完整 URL */
function toUrl(path) {
  const base = getBase();
  return base ? `${base}${path}` : path;
}

async function request(method, url, body) {
  const res = await fetch(toUrl(url), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok || (payload && payload.ok === false)) {
    const msg = payload?.error || `请求失败（HTTP ${res.status}）`;
    const err = new Error(msg);
    err.detail = payload?.detail || '';
    err.status = res.status;
    throw err;
  }
  return payload?.data ?? payload;
}

export const api = {
  bootstrap: () => request('GET', '/api/bootstrap'),

  /* 智能体 */
  createAgent: (data) => request('POST', '/api/agents', data),
  updateAgent: (id, data) => request('PUT', `/api/agents/${id}`, data),
  deleteAgent: (id) => request('DELETE', `/api/agents/${id}`),
  duplicateAgent: (id) => request('POST', `/api/agents/${id}/duplicate`),

  /* 模型源 */
  createModel: (data) => request('POST', '/api/models', data),
  updateModel: (id, data) => request('PUT', `/api/models/${id}`, data),
  deleteModel: (id) => request('DELETE', `/api/models/${id}`),
  testModel: (id) => request('POST', `/api/models/${id}/test`),
  testProbe: (data) => request('POST', '/api/models/test', data),
  listRemoteModels: (id) => request('GET', `/api/models/${id}/models`),

  /* 本地 GGUF */
  scanGGUF: (dirs) => request('POST', '/api/gguf/scan', { dirs }),
  ggufCommand: (data) => request('POST', '/api/gguf/command', data),

  /* 会话 */
  listSessions: (agentId) => request('GET', `/api/sessions${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`),
  createSession: (agentId, title) => request('POST', '/api/sessions', { agentId, title }),
  getSession: (id) => request('GET', `/api/sessions/${id}`),
  renameSession: (id, title) => request('PATCH', `/api/sessions/${id}`, { title }),
  deleteSession: (id) => request('DELETE', `/api/sessions/${id}`),
  clearMessages: (id) => request('DELETE', `/api/sessions/${id}/messages`),
  dropLastAssistant: (id) => request('DELETE', `/api/sessions/${id}/last`),
  stop: (id) => request('POST', `/api/sessions/${id}/stop`),

  /* 数据 */
  exportAll: () => request('GET', '/api/export'),
  importAll: (data) => request('POST', '/api/import', data),

  /* 设置 */
  getSettings: () => request('GET', '/api/settings'),
  updateSettings: (data) => request('PUT', '/api/settings', data),
  resetAll: () => request('POST', '/api/settings/reset'),

  /**
   * 流式对话：读取后端 SSE，逐个事件回调
   * @returns {Promise<{text:string, thinking:string}>}
   */
  async chatStream(sessionId, content, { onEvent, signal, regen = false } = {}) {
    const res = await fetch(toUrl(`/api/sessions/${sessionId}/chat`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, regen }),
      signal,
    });

    if (!res.ok) {
      let msg = `对话失败（HTTP ${res.status}）`;
      try {
        const j = await res.json();
        msg = j?.error || msg;
      } catch {
        /* noop */
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const result = { text: '', thinking: '' };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const { event, data } = parseBlock(block);
        if (!event) continue;
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch {
          /* noop */
        }
        if (event === 'delta') result.text += parsed.text || '';
        if (event === 'thinking') result.thinking += parsed.text || '';
        if (event === 'replace') {
          result.text = parsed.text || '';
          result.thinking = parsed.thinking || '';
        }
        onEvent?.(event, parsed);
      }
    }
    return result;
  },
};

function parseBlock(block) {
  let event = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  return { event, data };
}
