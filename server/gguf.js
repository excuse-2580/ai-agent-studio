/**
 * 本地 .gguf 模型扫描与 llama.cpp 启动命令生成
 */
import fs from 'node:fs';
import path from 'node:path';

const SCAN_LIMIT = 4000; // 最多遍历的文件目录节点数，防止扫爆

/**
 * 扫描目录中的 .gguf 文件
 * @param {string[]} dirs
 */
export function scanGGUF(dirs = []) {
  const found = [];
  const seenDirs = new Set();

  for (const dir of dedupe(dirs)) {
    if (!dir || seenDirs.has(dir)) continue;
    seenDirs.add(dir);
    if (!fs.existsSync(dir)) continue;
    walk(dir, 0, found);
  }

  found.sort((a, b) => b.size - a.size);
  return found;
}

function walk(dir, depth, out) {
  if (depth > 6 || out.length > 200) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= SCAN_LIMIT) return;
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        walk(full, depth + 1, out);
      } else if (entry.name.toLowerCase().endsWith('.gguf')) {
        const st = fs.statSync(full);
        out.push({
          name: entry.name,
          path: full,
          size: st.size,
          sizeText: formatBytes(st.size),
          params: guessParams(entry.name),
          quant: guessQuant(entry.name),
          family: guessFamily(entry.name),
          mtime: st.mtimeMs,
        });
      }
    } catch {
      /* 忽略无权访问的文件 */
    }
  }
}

/**
 * 为某个 gguf 生成 llama-server 启动命令
 */
export function buildCommand(ggufPath, opts = {}) {
  const { port = 8080, ctx = 4096, gpuLayers = 0, threads, binary = 'llama-server', extra = '' } = opts;
  const quoted = /\s/.test(ggufPath) ? `"${ggufPath}"` : ggufPath;
  const parts = [binary, '-m', quoted, '-c', String(ctx), '--port', String(port), '--host', '127.0.0.1'];
  if (Number(gpuLayers) > 0) parts.push('-ngl', String(gpuLayers));
  if (Number(threads) > 0) parts.push('-t', String(threads));
  if (extra) parts.push(extra.trim());
  return parts.join(' ');
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

/* --------------------------- 文件名推断 --------------------------- */

function guessParams(name) {
  const n = name.toLowerCase();
  const m =
    n.match(/(\d+(?:[._]\d+)?)\s*b(?:-|_|\.|$)/) ||
    n.match(/[-_](?:(\d+)x)?(\d+(?:[._]\d+)?)b/) ||
    n.match(/(\d+(?:[._]\d+)?)b[-_]/);
  if (!m) return '';
  const raw = (m[2] || m[1] || '').replace('_', '.');
  const num = Number(raw);
  if (!Number.isFinite(num)) return '';
  if (m[1] && m[2] && /x/i.test(m[0])) {
    // 形如 8x7b 的 MoE 结构
    return `${m[1]}x${m[2]}B (MoE)`;
  }
  return `${num < 1 ? Math.round(num * 1000) + 'M' : num + 'B'}`;
}

function guessQuant(name) {
  const n = name.toLowerCase();
  const table = [
    ['q2_k', 'Q2_K'],
    ['q3_k_s', 'Q3_K_S'],
    ['q3_k_m', 'Q3_K_M'],
    ['q3_k_l', 'Q3_K_L'],
    ['q4_0', 'Q4_0'],
    ['q4_k_s', 'Q4_K_S'],
    ['q4_k_m', 'Q4_K_M'],
    ['q5_0', 'Q5_0'],
    ['q5_k_s', 'Q5_K_S'],
    ['q5_k_m', 'Q5_K_M'],
    ['q6_k', 'Q6_K'],
    ['q8_0', 'Q8_0'],
    ['f16', 'F16'],
    ['f32', 'F32'],
    ['bf16', 'BF16'],
    ['iq4_xs', 'IQ4_XS'],
  ];
  for (const [key, label] of table) if (n.includes(key)) return label;
  return '';
}

function guessFamily(name) {
  const n = name.toLowerCase();
  const table = [
    ['qwen2.5', 'Qwen2.5'],
    ['qwen2', 'Qwen2'],
    ['qwen', 'Qwen'],
    ['llama-3.1', 'Llama 3.1'],
    ['llama-3.2', 'Llama 3.2'],
    ['llama-3', 'Llama 3'],
    ['llama-2', 'Llama 2'],
    ['llama', 'Llama'],
    ['gemma-2', 'Gemma 2'],
    ['gemma', 'Gemma'],
    ['mistral', 'Mistral'],
    ['mixtral', 'Mixtral'],
    ['deepseek', 'DeepSeek'],
    ['phi-3', 'Phi-3'],
    ['phi', 'Phi'],
    ['glm', 'GLM'],
    ['yi', 'Yi'],
    ['baichuan', 'Baichuan'],
    ['internlm', 'InternLM'],
    ['starcoder', 'StarCoder'],
    ['codellama', 'CodeLlama'],
  ];
  for (const [key, label] of table) if (n.includes(key)) return label;
  return '';
}

function dedupe(arr) {
  return [...new Set(arr.filter(Boolean).map((d) => String(d).trim()))];
}
