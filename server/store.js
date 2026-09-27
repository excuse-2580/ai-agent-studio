/**
 * 数据层：纯 Node 内置模块，数据以单个 JSON 文件保存在 data/store.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

export const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
export const DATA_DIR = path.join(ROOT, 'data');
export const STORE_FILE = path.join(DATA_DIR, 'store.json');

const SCHEMA_VERSION = 1;

export const id = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
export const now = () => Date.now();

/* ------------------------------------------------------------------ */
/* 默认数据                                                             */
/* ------------------------------------------------------------------ */

export const PROVIDER_PRESETS = [
  {
    type: 'llamacpp',
    label: '本地模型 · llama.cpp (GGUF)',
    desc: '用 llama.cpp / llama-server 加载本地 .gguf 文件，OpenAI 兼容端口',
    baseURL: 'http://127.0.0.1:8080/v1',
    apiKey: '',
    model: 'local-model',
    icon: 'memory',
    local: true,
  },
  {
    type: 'ollama',
    label: '本地模型 · Ollama',
    desc: 'Ollama 本地服务，同样可以跑 GGUF 量化模型',
    baseURL: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
    model: 'llama3',
    icon: 'pets',
    local: true,
  },
  {
    type: 'lmstudio',
    label: '本地模型 · LM Studio',
    desc: 'LM Studio 内置本地服务器',
    baseURL: 'http://127.0.0.1:1234/v1',
    apiKey: 'lm-studio',
    model: 'local-model',
    icon: 'desktop_windows',
    local: true,
  },
  {
    type: 'openai',
    label: '云端 · OpenAI',
    desc: 'api.openai.com，支持 GPT 系列',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    icon: 'cloud',
    local: false,
  },
  {
    type: 'deepseek',
    label: '云端 · DeepSeek 深度求索',
    desc: '性价比高，中文能力强',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    icon: 'cloud',
    local: false,
  },
  {
    type: 'moonshot',
    label: '云端 · Moonshot 月之暗面',
    desc: 'Kimi 系列，长上下文',
    baseURL: 'https://api.moonshot.cn/v1',
    apiKey: '',
    model: 'moonshot-v1-8k',
    icon: 'cloud',
    local: false,
  },
  {
    type: 'zhipu',
    label: '云端 · 智谱 GLM',
    desc: 'open.bigmodel.cn',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'glm-4-flash',
    icon: 'cloud',
    local: false,
  },
  {
    type: 'siliconflow',
    label: '云端 · SiliconFlow 硅基流动',
    desc: '聚合多家开源模型的云端推理',
    baseURL: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    icon: 'cloud',
    local: false,
  },
  {
    type: 'custom',
    label: '自定义 · OpenAI 兼容端点',
    desc: '任何实现了 /v1/chat/completions 的服务',
    baseURL: '',
    apiKey: '',
    model: '',
    icon: 'tune',
    local: false,
  },
];

const DEMO_AGENTS = [
  {
    name: '万能小助手',
    emoji: '🐺',
    color: '#7C5CFF',
    systemPrompt:
      '你是一个友善、高效、表达清晰的中文助手。回答时优先给出结论，再补充必要的细节；不确定时要如实说明，不要编造。',
    greeting: '嗨！我是万能小助手，有什么想聊的？',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048,
    contextMessages: 20,
    tags: ['通用'],
  },
  {
    name: '代码搭子',
    emoji: '🛠️',
    color: '#00A39B',
    systemPrompt:
      '你是一位资深软件工程师。给出可直接运行的代码，关键处加简短注释；发现用户代码里的隐患要主动指出。默认用中文回复，代码标识符保持英文。',
    greeting: '把代码贴过来，我帮你看看～',
    temperature: 0.3,
    topP: 0.9,
    maxTokens: 4096,
    contextMessages: 16,
    tags: ['编程'],
  },
  {
    name: '翻译润色官',
    emoji: '🌏',
    color: '#E8710A',
    systemPrompt:
      '你是专业的中英双语翻译与文字润色专家。翻译忠实原文、符合目标语言习惯；润色时保留作者语气，只改表达不改意思。输出只给结果，不要解释。',
    greeting: '要翻译什么？中英日韩都行～',
    temperature: 0.4,
    topP: 0.9,
    maxTokens: 2048,
    contextMessages: 8,
    tags: ['文字'],
  },
];

function defaultSettings() {
  return {
    theme: 'dark', // light | dark | system
    seedColor: '#7C5CFF',
    fontScale: 1,
    stream: true,
    showThinking: true,
    defaultModelId: null,
    ggufDirs: [path.join(ROOT, 'models'), path.join(os.homedir(), 'models')],
    serverPort: 5178,
  };
}

function defaultStore() {
  const agents = DEMO_AGENTS.map((a) => ({
    id: id('ag'),
    ...a,
    modelId: null,
    createdAt: now(),
    updatedAt: now(),
  }));
  return {
    version: SCHEMA_VERSION,
    agents,
    models: [],
    sessions: [],
    settings: defaultSettings(),
  };
}

/* ------------------------------------------------------------------ */
/* 读写                                                                 */
/* ------------------------------------------------------------------ */

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    cache = {
      ...defaultStore(),
      ...parsed,
      settings: { ...defaultSettings(), ...(parsed.settings || {}) },
    };
  } catch {
    cache = defaultStore();
    save();
  }
  return cache;
}

export function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_FILE);
  return cache;
}

export function reset() {
  cache = defaultStore();
  save();
  return cache;
}

/* ------------------------------------------------------------------ */
/* 智能体                                                               */
/* ------------------------------------------------------------------ */

export function listAgents() {
  return load().agents;
}

export function getAgent(agentId) {
  return load().agents.find((a) => a.id === agentId) || null;
}

export function createAgent(payload) {
  const db = load();
  const agent = {
    id: id('ag'),
    name: (payload.name || '未命名智能体').trim(),
    emoji: payload.emoji || '✨',
    color: payload.color || '#7C5CFF',
    systemPrompt: payload.systemPrompt || '你是一个乐于助人的 AI 助手。',
    greeting: payload.greeting || '',
    modelId: payload.modelId ?? null,
    temperature: num(payload.temperature, 0.7, 0, 2),
    topP: num(payload.topP, 0.9, 0, 1),
    maxTokens: num(payload.maxTokens, 2048, 64, 32768),
    contextMessages: num(payload.contextMessages, 20, 2, 200),
    tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 8) : [],
    createdAt: now(),
    updatedAt: now(),
  };
  db.agents.unshift(agent);
  save();
  return agent;
}

export function updateAgent(agentId, patch) {
  const db = load();
  const agent = db.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  const fields = [
    'name',
    'emoji',
    'color',
    'systemPrompt',
    'greeting',
    'modelId',
    'temperature',
    'topP',
    'maxTokens',
    'contextMessages',
    'tags',
  ];
  for (const f of fields) {
    if (patch[f] === undefined) continue;
    if (['temperature', 'topP', 'maxTokens', 'contextMessages'].includes(f)) {
      agent[f] = num(patch[f], agent[f]);
    } else {
      agent[f] = patch[f];
    }
  }
  agent.updatedAt = now();
  save();
  return agent;
}

export function deleteAgent(agentId) {
  const db = load();
  const before = db.agents.length;
  db.agents = db.agents.filter((a) => a.id !== agentId);
  db.sessions = db.sessions.filter((s) => s.agentId !== agentId);
  save();
  return before !== db.agents.length;
}

export function duplicateAgent(agentId) {
  const db = load();
  const src = db.agents.find((a) => a.id === agentId);
  if (!src) return null;
  const copy = {
    ...src,
    id: id('ag'),
    name: `${src.name} 副本`,
    createdAt: now(),
    updatedAt: now(),
  };
  const i = db.agents.findIndex((a) => a.id === agentId);
  db.agents.splice(i + 1, 0, copy);
  save();
  return copy;
}

/* ------------------------------------------------------------------ */
/* 模型源                                                               */
/* ------------------------------------------------------------------ */

export function listModels() {
  return load().models;
}

export function getModel(modelId) {
  return load().models.find((m) => m.id === modelId) || null;
}

export function createModel(payload) {
  const db = load();
  const model = {
    id: id('md'),
    name: (payload.name || '未命名模型源').trim(),
    type: payload.type || 'custom',
    baseURL: trimSlash(payload.baseURL || ''),
    apiKey: payload.apiKey || '',
    model: payload.model || '',
    ggufPath: payload.ggufPath || '',
    contextLength: num(payload.contextLength, 4096, 512, 1024000),
    enabled: payload.enabled !== false,
    createdAt: now(),
    updatedAt: now(),
  };
  db.models.unshift(model);
  save();
  return model;
}

export function updateModel(modelId, patch) {
  const db = load();
  const model = db.models.find((m) => m.id === modelId);
  if (!model) return null;
  for (const f of ['name', 'type', 'apiKey', 'model', 'ggufPath', 'enabled']) {
    if (patch[f] !== undefined) model[f] = patch[f];
  }
  if (patch.baseURL !== undefined) model.baseURL = trimSlash(patch.baseURL);
  if (patch.contextLength !== undefined) model.contextLength = num(patch.contextLength, model.contextLength);
  model.updatedAt = now();
  save();
  return model;
}

export function deleteModel(modelId) {
  const db = load();
  const before = db.models.length;
  db.models = db.models.filter((m) => m.id !== modelId);
  db.agents.forEach((a) => {
    if (a.modelId === modelId) a.modelId = null;
  });
  save();
  return before !== db.models.length;
}

/* ------------------------------------------------------------------ */
/* 会话                                                                 */
/* ------------------------------------------------------------------ */

export function listSessions(agentId) {
  const db = load();
  return db.sessions
    .filter((s) => !agentId || s.agentId === agentId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => ({
      id: s.id,
      agentId: s.agentId,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
      preview: lastUserPreview(s),
    }));
}

function lastUserPreview(session) {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const m = session.messages[i];
    if (m.role === 'user') return String(m.content).slice(0, 60);
  }
  return '';
}

export function getSession(sessionId) {
  return load().sessions.find((s) => s.id === sessionId) || null;
}

export function createSession(agentId, title = '新的对话') {
  const db = load();
  const session = {
    id: id('se'),
    agentId,
    title,
    createdAt: now(),
    updatedAt: now(),
    messages: [],
  };
  db.sessions.unshift(session);
  save();
  return session;
}

export function deleteSession(sessionId) {
  const db = load();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  save();
  return before !== db.sessions.length;
}

export function clearSessionMessages(sessionId) {
  const s = getSession(sessionId);
  if (!s) return null;
  s.messages = [];
  s.updatedAt = now();
  save();
  return s;
}

export function renameSession(sessionId, title) {
  const s = getSession(sessionId);
  if (!s) return null;
  s.title = String(title || '').slice(0, 60) || '新的对话';
  s.updatedAt = now();
  save();
  return s;
}

export function appendMessage(sessionId, role, content, extra = {}) {
  const s = getSession(sessionId);
  if (!s) return null;
  const msg = { role, content, ts: now(), ...extra };
  s.messages.push(msg);
  s.updatedAt = now();
  if (role === 'user' && s.messages.filter((m) => m.role === 'user').length === 1) {
    s.title = String(content).slice(0, 24) || s.title;
  }
  save();
  return msg;
}

/** 重新生成：丢弃最后一条助手消息 */
export function popLastAssistant(sessionId) {
  const s = getSession(sessionId);
  if (!s) return null;
  const last = s.messages[s.messages.length - 1];
  if (last && last.role === 'assistant') {
    s.messages.pop();
    s.updatedAt = now();
    save();
  }
  return s;
}

/** 整体导入（覆盖） */
export function importData(data) {
  const base = defaultStore();
  cache = {
    version: SCHEMA_VERSION,
    agents: Array.isArray(data?.agents) ? data.agents : base.agents,
    models: Array.isArray(data?.models) ? data.models : [],
    sessions: Array.isArray(data?.sessions) ? data.sessions : [],
    settings: { ...base.settings, ...(data?.settings || {}) },
  };
  save();
  return cache;
}

export function exportData() {
  return load();
}

export function updateLastAssistant(sessionId, content) {
  const s = getSession(sessionId);
  if (!s) return null;
  const last = s.messages[s.messages.length - 1];
  if (last && last.role === 'assistant') {
    last.content = content;
    s.updatedAt = now();
    save();
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* 设置                                                                 */
/* ------------------------------------------------------------------ */

export function getSettings() {
  return load().settings;
}

export function updateSettings(patch) {
  const db = load();
  db.settings = { ...db.settings, ...patch };
  save();
  return db.settings;
}

/* ------------------------------------------------------------------ */
/* 工具                                                                 */
/* ------------------------------------------------------------------ */

function num(v, fallback, min = -Infinity, max = Infinity) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function trimSlash(u) {
  return String(u || '').trim().replace(/\/+$/, '');
}
