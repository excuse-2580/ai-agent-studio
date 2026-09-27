/**
 * 极简 Markdown 渲染器（够用于对话输出：标题 / 列表 / 引用 / 表格 / 代码 / 行内样式）
 * 所有内容先做 HTML 转义，避免注入。
 */

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function escapeHtml(s) {
  return esc(s);
}

export function renderMarkdown(src) {
  if (!src) return '';
  const blocks = [];
  let text = String(src).replace(/\r\n/g, '\n');

  // 1) 抽出围栏代码块
  text = text.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push({ lang: lang || '', code: code.replace(/\n$/, '') });
    return `\u0000CODE${blocks.length - 1}\u0000`;
  });

  // 2) 抽出行内代码
  const inlines = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    inlines.push(code);
    return `\u0000INL${inlines.length - 1}\u0000`;
  });

  text = esc(text);

  // 3) 块级解析
  const lines = text.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 占位：代码块
    const codeMatch = line.match(/^\u0000CODE(\d+)\u0000$/);
    if (codeMatch) {
      const b = blocks[Number(codeMatch[1])];
      out.push(
        `<div class="code-block"><span class="code-block__lang">${b.lang || 'code'}</span>${copyBtn(
          b.code
        )}<pre><code>${esc(b.code)}</code></pre></div>`
      );
      i++;
      continue;
    }

    // 表格
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        body.push(splitRow(lines[i]));
        i++;
      }
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
          body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          `</tbody></table>`
      );
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lv = Math.min(h[1].length, 4);
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
      i++;
      continue;
    }

    // 分割线
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line) || /^\s*---+\s*$/.test(line)) {
      out.push('<hr/>');
      i++;
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${buf.map((l) => `<p>${inline(l)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // 列表
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && (/^\s*[-*+]\s+/.test(lines[i]) || /^\s*\d+[.)]\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    // 空行
    if (!line.trim()) {
      i++;
      continue;
    }

    // 段落（合并连续非空行）
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,4}\s|[-*+]\s|\d+[.)]\s|>|\|)/.test(lines[i]) && !/^\u0000CODE\d+\u0000$/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) out.push(`<p>${para.map((l) => inline(l)).join('<br/>')}</p>`);
    else i++;
  }

  let html = out.join('\n');

  // 4) 还原行内代码
  html = html.replace(/\u0000INL(\d+)\u0000/g, (_, idx) => `<code>${esc(inlines[Number(idx)])}</code>`);
  return html;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function copyBtn(code) {
  return `<button class="icon-btn icon-btn--sm code-block__copy" data-copy="${encodeURIComponent(code)}" title="复制代码">${COPY_SVG}</button>`;
}

const COPY_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

/** 行内样式：粗体 / 斜体 / 删除线 / 链接 */
function inline(s) {
  let t = s;
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?=$|[^*])/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g, (_, label, href) => `<a href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>`);
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`);
  return t;
}
