/**
 * 通用 UI 组件：Snackbar / Dialog / Bottom Sheet / Menu / 表单字段
 */
import { icon } from './icons.js';

const scrimEl = () => document.getElementById('scrim');
const dialogRoot = () => document.getElementById('dialog-root');
const sheetRoot = () => document.getElementById('sheet-root');
const snackRoot = () => document.getElementById('snackbar-root');

let openLayers = 0;

function showScrim(onClick) {
  const s = scrimEl();
  s.hidden = false;
  s.onclick = () => onClick?.();
  openLayers++;
}
function hideScrim() {
  openLayers = Math.max(0, openLayers - 1);
  if (openLayers === 0) {
    const s = scrimEl();
    s.hidden = true;
    s.onclick = null;
  }
}

/* ------------------------------------------------------------------ */
/* Snackbar                                                            */
/* ------------------------------------------------------------------ */
export function toast(message, { actionLabel, onAction, duration = 4200 } = {}) {
  const el = document.createElement('div');
  el.className = 'snackbar';
  const span = document.createElement('span');
  span.textContent = message;
  el.appendChild(span);
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'snackbar__action';
    btn.textContent = actionLabel;
    btn.onclick = () => {
      onAction?.();
      close();
    };
    el.appendChild(btn);
  }
  snackRoot().appendChild(el);
  let timer = setTimeout(close, duration);
  function close() {
    clearTimeout(timer);
    el.style.transition = 'opacity 160ms, transform 160ms';
    el.style.opacity = '0';
    el.style.transform = 'translateY(12px)';
    setTimeout(() => el.remove(), 180);
  }
  return close;
}

/* ------------------------------------------------------------------ */
/* Dialog                                                             */
/* ------------------------------------------------------------------ */
/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.support]
 * @param {Node|string} [opts.content]
 * @param {Array<{label:string,value:any,variant?:string,keepOpen?:boolean,onClick?:Function}>} opts.actions
 * @param {boolean} [opts.sheet] 窄屏或长表单用底部抽屉
 * @returns {Promise<any>}
 */
export function showDialog({ title, headline = title, support = '', content = '', actions = [], iconName, sheet = false, wide = false }) {
  return new Promise((resolve) => {
    const root = sheet ? sheetRoot() : dialogRoot();
    root.hidden = false;
    showScrim(() => finish(null));

    const box = document.createElement('div');
    box.className = sheet ? 'sheet' : 'dialog';
    if (wide) box.style.width = 'min(760px, 100%)';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    if (sheet) {
      const handle = document.createElement('div');
      handle.className = 'sheet__handle';
      box.appendChild(handle);
    }

    if (iconName) {
      const ic = document.createElement('div');
      ic.className = 'dialog__icon';
      ic.innerHTML = icon(iconName, { size: 24 });
      box.appendChild(ic);
    }

    const h = document.createElement('h2');
    h.className = 'dialog__headline';
    h.textContent = headline;
    box.appendChild(h);

    if (support) {
      const sp = document.createElement('p');
      sp.className = 'dialog__support';
      sp.innerHTML = support;
      box.appendChild(sp);
    }

    const body = document.createElement('div');
    body.className = 'dialog__body';
    if (typeof content === 'string') body.innerHTML = content;
    else if (content) body.appendChild(content);
    box.appendChild(body);

    const actionBar = document.createElement('div');
    actionBar.className = 'dialog__actions';
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = `btn ${a.variant ? `btn--${a.variant}` : 'btn--text'}`;
      btn.textContent = a.label;
      btn.onclick = () => {
        const keep = a.onClick?.();
        if (a.keepOpen || keep === false) return;
        finish(a.value ?? a.label);
      };
      actionBar.appendChild(btn);
    });
    box.appendChild(actionBar);

    root.appendChild(box);
    const firstInput = box.querySelector('input, textarea');
    setTimeout(() => firstInput?.focus(), 60);

    function onKey(e) {
      if (e.key === 'Escape') finish(null);
    }
    document.addEventListener('keydown', onKey);

    function finish(value) {
      document.removeEventListener('keydown', onKey);
      hideScrim();
      box.remove();
      root.hidden = true;
      resolve(value);
    }
  });
}

export function confirmDialog({ title, message, confirmText = '确定', cancelText = '取消', danger = false }) {
  return showDialog({
    title,
    support: message,
    iconName: danger ? 'alert' : 'info',
    actions: [
      { label: cancelText, value: false, variant: 'text' },
      { label: confirmText, value: true, variant: danger ? 'danger-filled' : 'filled' },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */
export function showMenu(anchor, items) {
  return new Promise((resolve) => {
    const menu = document.createElement('div');
    menu.className = 'menu';
    items.forEach((it) => {
      if (it.divider) {
        const d = document.createElement('div');
        d.className = 'menu__divider';
        menu.appendChild(d);
        return;
      }
      const b = document.createElement('button');
      b.className = `menu__item${it.danger ? ' menu__item--danger' : ''}`;
      b.innerHTML = `${it.iconName ? icon(it.iconName, { size: 20 }) : ''}<span>${it.label}</span>`;
      b.onclick = () => {
        cleanup();
        resolve(it.value ?? it.label);
      };
      menu.appendChild(b);
    });

    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = Math.min(rect.left, window.innerWidth - mw - 8);
    let top = rect.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 4);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${top}px`;

    showScrim(() => {
      cleanup();
      resolve(null);
    });

    function onKey(e) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    }
    document.addEventListener('keydown', onKey);

    function cleanup() {
      document.removeEventListener('keydown', onKey);
      hideScrim();
      menu.remove();
    }
  });
}

/* ------------------------------------------------------------------ */
/* 表单字段                                                            */
/* ------------------------------------------------------------------ */
/**
 * 单个 MD3 文本字段
 */
export function field({
  label,
  value = '',
  support = '',
  textarea = false,
  rows = 4,
  type = 'text',
  placeholder = '',
  mono = false,
  required = false,
  min,
  max,
  step,
}) {
  const wrap = document.createElement('label');
  wrap.className = 'field';

  const input = document.createElement(textarea ? 'textarea' : 'input');
  input.className = textarea ? 'field__textarea' : 'field__input';
  if (textarea) {
    input.rows = rows;
  } else {
    input.type = type;
  }
  input.value = value ?? '';
  if (placeholder) input.placeholder = placeholder;
  if (mono && !textarea) input.style.fontFamily = 'var(--font-mono)';
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  if (step !== undefined) input.step = step;

  const lab = document.createElement('span');
  lab.className = 'field__label';
  lab.textContent = label;
  wrap.appendChild(lab);
  wrap.appendChild(input);

  const sup = document.createElement('span');
  sup.className = 'field__support';
  sup.textContent = support;
  wrap.appendChild(sup);

  const sync = () => wrap.classList.toggle('is-filled', !!input.value);
  input.addEventListener('focus', () => wrap.classList.add('is-active'));
  input.addEventListener('blur', () => wrap.classList.remove('is-active'));
  input.addEventListener('input', sync);
  sync();

  return {
    el: wrap,
    input,
    get: () => input.value,
    set: (v) => {
      input.value = v;
      sync();
    },
    focus: () => input.focus(),
    required,
  };
}

/** MD3 Slider 字段 */
export function sliderField({ label, value = 0.7, min = 0, max = 1, step = 0.05, format = (v) => v.toFixed(2) }) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.style.padding = '4px 0 0';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;font:var(--label-m);color:var(--on-surface-variant)';
  const name = document.createElement('span');
  name.textContent = label;
  const val = document.createElement('span');
  val.style.cssText = 'margin-left:auto;color:var(--primary);font:var(--label-l)';
  head.appendChild(name);
  head.appendChild(val);
  wrap.appendChild(head);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'slider';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;
  wrap.appendChild(input);

  const paint = () => {
    const pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--val', `${pct}%`);
    val.textContent = format(Number(input.value));
  };
  input.addEventListener('input', paint);
  paint();

  return { el: wrap, input, get: () => Number(input.value), set: (v) => { input.value = v; paint(); } };
}

/** 把若干节点塞进一个垂直容器 */
export function column(nodes, { gap = '16px', cls = '' } = {}) {
  const el = document.createElement('div');
  el.className = cls;
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = gap;
  nodes.forEach((n) => {
    if (!n) return;
    el.appendChild(typeof n === 'string' ? textNode(n) : n.el ? n.el : n);
  });
  return el;
}

function textNode(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
}

/* ------------------------------------------------------------------ */
/* 其他小工具                                                          */
/* ------------------------------------------------------------------ */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板');
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('已复制到剪贴板');
      return true;
    } catch {
      toast('复制失败，请手动选择');
      return false;
    } finally {
      ta.remove();
    }
  }
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

export function relTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}
