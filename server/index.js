/**
 * AI Agent Studio — 服务端
 * 零依赖：仅使用 Node 内置模块（Node >= 18，需要全局 fetch）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

import * as store from './store.js';
import * as providers from './providers.js';
import * as gguf from './gguf.js';

const PUBLIC_DIR = path.join(store.ROOT, 'public');
const PORT = Number(process.env.PORT || store.load().settings.serverPort || 5178);
const HOST = process.env.HOST || '0.0.0.0';

/** 正在生成的请求，用于「停止生成」 */
const inflight = new Map();

/* ------------------------------------------------------------------ */
/* 工具                                                                 */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const ok = (res, data) => sendJSON(res, 200, { ok: true, data });
const fail = (res, status, message, extra = {}) => sendJSON(res, status, { ok: false, error: message, ...extra });

async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sessionIdFromPath(pathname) {
  const m = pathname.match(/^\/api\/sessions\/([^/]+)/);
  return m ? m[1] : null;
}

/* ------------------------------------------------------------------ */
/* 路由                                                                 */
/* ------------------------------------------------------------------ */

const routes = {
  /* ---------------- 启动数据 ---------------- */
  'GET /api/bootstrap': (req, res) => {
    ok(res, {
      agents: store.listAgents(),
      models: store.listModels(),
      sessions: store.listSessions(),
      settings: store.getSettings(),
      presets: store.PROVIDER_PRESETS,
      version: 1,
    });
  },

  /* ---------------- 智能体 ---------------- */
  'POST /api/agents': async (req, res) => {
    const body = await readBody(req);
    if (!body.name || !String(body.name).trim()) return fail(res, 400, '请填写智能体名称');
    ok(res, store.createAgent(body));
  },

  'PUT /api/agents/:id': async (req, res, { params }) => {
    const body = await readBody(req);
    const agent = store.updateAgent(params.id, body);
    if (!agent) return fail(res, 404, '智能体不存在');
    ok(res, agent);
  },

  'DELETE /api/agents/:id': (req, res, { params }) => {
    const done = store.deleteAgent(params.id);
    if (!done) return fail(res, 404, '智能体不存在');
    inflight.delete(params.id);
    ok(res, { id: params.id });
  },

  'POST /api/agents/:id/duplicate': (req, res, { params }) => {
    const copy = store.duplicateAgent(params.id);
    if (!copy) return fail(res, 404, '智能体不存在');
    ok(res, copy);
  },

  /* ---------------- 模型源 ---------------- */
  'POST /api/models': async (req, res) => {
    const body = await readBody(req);
    if (!body.name || !String(body.name).trim()) return fail(res, 400, '请填写模型源名称');
    if (!body.baseURL || !String(body.baseURL).trim()) return fail(res, 400, '请填写 API 地址');
    ok(res, store.createModel(body));
  },

  'PUT /api/models/:id': async (req, res, { params }) => {
    const body = await readBody(req);
    const model = store.updateModel(params.id, body);
    if (!model) return fail(res, 404, '模型源不存在');
    ok(res, model);
  },

  'DELETE /api/models/:id': (req, res, { params }) => {
    const done = store.deleteModel(params.id);
    if (!done) return fail(res, 404, '模型源不存在');
    ok(res, { id: params.id });
  },

  'GET /api/models/:id/models': async (req, res, { params }) => {
    const model = store.getModel(params.id);
    if (!model) return fail(res, 404, '模型源不存在');
    try {
      const models = await providers.listRemoteModels(model);
      ok(res, { models });
    } catch (err) {
      fail(res, err.status || 502, err.message, { detail: err.detail || '' });
    }
  },

  'POST /api/models/test': async (req, res) => {
    const body = await readBody(req);
    const probe = {
      baseURL: body.baseURL,
      apiKey: body.apiKey ?? '',
      model: body.model || '',
    };
    if (!probe.baseURL) return fail(res, 400, '请填写 API 地址');
    const result = await providers.testConnection(probe);
    ok(res, result);
  },

  'POST /api/models/:id/test': async (req, res, { params }) => {
    const model = store.getModel(params.id);
    if (!model) return fail(res, 404, '模型源不存在');
    const result = await providers.testConnection(model);
    ok(res, result);
  },

  /* ---------------- 本地 GGUF ---------------- */
  'POST /api/gguf/scan': async (req, res) => {
    const body = await readBody(req);
    const dirs = Array.isArray(body.dirs) && body.dirs.length ? body.dirs : store.getSettings().ggufDirs;
    const files = gguf.scanGGUF(dirs);
    ok(res, { dirs, files });
  },

  'POST /api/gguf/command': async (req, res) => {
    const body = await readBody(req);
    if (!body.ggufPath) return fail(res, 400, '缺少 gguf 路径');
    const command = gguf.buildCommand(body.ggufPath, body);
    ok(res, {
      command,
      baseURL: `http://127.0.0.1:${body.port || 8080}/v1`,
    });
  },

  /* ---------------- 会话 ---------------- */
  'GET /api/sessions': (req, res, { query }) => {
    ok(res, store.listSessions(query.agentId));
  },

  'POST /api/sessions': async (req, res) => {
    const body = await readBody(req);
    if (!body.agentId) return fail(res, 400, '缺少 agentId');
    if (!store.getAgent(body.agentId)) return fail(res, 404, '智能体不存在');
    ok(res, store.createSession(body.agentId, body.title));
  },

  'GET /api/sessions/:id': (req, res, { params }) => {
    const s = store.getSession(params.id);
    if (!s) return fail(res, 404, '会话不存在');
    ok(res, s);
  },

  'PATCH /api/sessions/:id': async (req, res, { params }) => {
    const body = await readBody(req);
    const s = store.renameSession(params.id, body.title);
    if (!s) return fail(res, 404, '会话不存在');
    ok(res, s);
  },

  'DELETE /api/sessions/:id': (req, res, { params }) => {
    const done = store.deleteSession(params.id);
    if (!done) return fail(res, 404, '会话不存在');
    ok(res, { id: params.id });
  },

  'DELETE /api/sessions/:id/messages': (req, res, { params }) => {
    const s = store.clearSessionMessages(params.id);
    if (!s) return fail(res, 404, '会话不存在');
    ok(res, s);
  },

  'DELETE /api/sessions/:id/last': (req, res, { params }) => {
    const s = store.popLastAssistant(params.id);
    if (!s) return fail(res, 404, '会话不存在');
    ok(res, s);
  },

  /* ---------------- 数据导入导出 ---------------- */
  'GET /api/export': (req, res) => ok(res, store.exportData()),

  'POST /api/import': async (req, res) => {
    const body = await readBody(req, 20 * 1024 * 1024);
    if (!body || typeof body !== 'object') return fail(res, 400, '数据格式不正确');
    ok(res, { agents: store.importData(body).agents.length });
  },

  /* ---------------- 对话（流式 SSE） ---------------- */
  'POST /api/sessions/:id/chat': async (req, res, { params }) => {
    const body = await readBody(req);
    const content = String(body.content ?? '').trim();
    const session = store.getSession(params.id);
    if (!session) return fail(res, 404, '会话不存在');

    const agent = store.getAgent(session.agentId);
    if (!agent) return fail(res, 404, '智能体不存在');

    const model = agent.modelId ? store.getModel(agent.modelId) : store.listModels().find((m) => m.enabled);
    if (!model) return fail(res, 400, '还没有可用的模型源，请先到「模型」页面添加一个');
    if (!model.model) return fail(res, 400, `模型源「${model.name}」还没有指定模型名称`);

    if (inflight.has(session.id)) {
      return fail(res, 409, '这个会话正在生成中，请先等待或点停止');
    }

    // 重新生成时 user 消息已经在历史里，不需要再追加
    const appendUser = !body.regen;
    if (appendUser) store.appendMessage(session.id, 'user', content);

    const allMessages = store.getSession(session.id).messages;
    const end = appendUser ? allMessages.length - 1 : allMessages.length;
    const history = allMessages
      .slice(Math.max(0, end - agent.contextMessages), end)
      .filter((m) => m.role === 'user' || m.role === 'assistant');

    const messages = [{ role: 'system', content: agent.systemPrompt }, ...history];

    const controller = new AbortController();
    inflight.set(session.id, controller);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const emit = (event, payload) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    emit('start', { sessionId: session.id, agentId: agent.id, model: model.name });

    let full = '';
    let thinking = '';
    const useStream = body.stream !== false && store.getSettings().stream !== false;

    try {
      if (useStream) {
        try {
          for await (const delta of providers.streamChat(model, messages, {
            temperature: agent.temperature,
            topP: agent.topP,
            maxTokens: agent.maxTokens,
            signal: controller.signal,
          })) {
            if (controller.signal.aborted) break;
            if (delta.type === 'thinking') {
              thinking += delta.text;
              emit('thinking', { text: delta.text });
            } else {
              full += delta.text;
              emit('delta', { text: delta.text });
            }
          }
        } catch (err) {
          if (!controller.signal.aborted && err?.retryNoStream) {
            // 服务端不支持流式，降级为一次性返回
            const once = await providers.chatOnce(model, messages, {
              temperature: agent.temperature,
              topP: agent.topP,
              maxTokens: agent.maxTokens,
              signal: controller.signal,
            });
            full = once.content || '';
            thinking = once.reasoning || '';
            emit('replace', { text: full, thinking });
          } else {
            throw err;
          }
        }
      } else {
        const once = await providers.chatOnce(model, messages, {
          temperature: agent.temperature,
          topP: agent.topP,
          maxTokens: agent.maxTokens,
          signal: controller.signal,
        });
        full = once.content || '';
        thinking = once.reasoning || '';
        emit('replace', { text: full, thinking });
      }

      if (controller.signal.aborted) {
        emit('aborted', { text: full });
      }

      if (full || thinking) {
        store.appendMessage(session.id, 'assistant', full || '（空回复）', thinking ? { reasoning: thinking } : {});
      } else if (!controller.signal.aborted) {
        store.appendMessage(session.id, 'assistant', '（模型没有返回内容）');
      }
      emit('done', { text: full, thinking, session: store.getSession(session.id) });
    } catch (err) {
      const message = err?.message || String(err);
      emit('error', { message, detail: err?.detail || '' });
    } finally {
      inflight.delete(session.id);
      res.end();
    }
  },

  'POST /api/sessions/:id/stop': (req, res, { params }) => {
    const controller = inflight.get(params.id);
    if (!controller) return ok(res, { stopped: false });
    controller.abort();
    inflight.delete(params.id);
    ok(res, { stopped: true });
  },

  /* ---------------- 设置 ---------------- */
  'GET /api/settings': (req, res) => ok(res, store.getSettings()),

  'PUT /api/settings': async (req, res) => {
    const body = await readBody(req);
    ok(res, store.updateSettings(body));
  },

  'POST /api/settings/reset': (req, res) => {
    ok(res, store.reset().settings);
  },
};

/* ------------------------------------------------------------------ */
/* 匹配与启动                                                           */
/* ------------------------------------------------------------------ */

function matchRoute(method, pathname) {
  for (const key of Object.keys(routes)) {
    const [m, p] = key.split(' ');
    if (m !== method) continue;
    const keyParts = p.split('/');
    const urlParts = pathname.split('/');
    if (keyParts.length !== urlParts.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < keyParts.length; i++) {
      const kp = keyParts[i];
      const up = urlParts[i];
      if (kp.startsWith(':')) params[kp.slice(1)] = decodeURIComponent(up);
      else if (kp !== up) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler: routes[key], params };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (pathname.startsWith('/api/')) {
    const query = Object.fromEntries(url.searchParams.entries());
    const matched = matchRoute(req.method, pathname);
    if (!matched) return fail(res, 404, `接口不存在：${req.method} ${pathname}`);
    try {
      await matched.handler(req, res, { params: matched.params, query });
    } catch (err) {
      console.error(`[api] ${req.method} ${pathname}`, err);
      if (!res.headersSent) fail(res, 500, err?.message || '服务器内部错误');
      else res.end();
    }
    return;
  }

  // 静态资源
  serveStatic(req, res, pathname);
});

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) {
      // SPA 兜底
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, buf) => {
        if (e2) {
          res.writeHead(404).end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(buf);
      });
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      'Content-Length': st.size,
    });
    fs.createReadStream(target).pipe(res);
  });
}

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log('');
  console.log('  ╭───────────────────────────────────────────────╮');
  console.log('  │   AI Agent Studio 已启动                      │');
  console.log('  ╰───────────────────────────────────────────────╯');
  console.log('');
  console.log(`  ▸ 本地访问：  http://localhost:${PORT}`);
  console.log(`  ▸ 数据文件：  ${store.STORE_FILE}`);
  console.log(`  ▸ 停止服务：  Ctrl + C`);
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  端口 ${PORT} 已被占用，换一个：PORT=5179 npm start\n`);
    process.exit(1);
  }
  throw err;
});
