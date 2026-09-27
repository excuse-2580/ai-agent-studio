/**
 * AI Agent Studio — 应用入口
 * 负责：启动数据、主题、导航与路由
 */
import { icon } from './icons.js';
import { api } from './api.js';
import { toast } from './ui.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { renderAgents } from './views/agents.js';
import { renderChat } from './views/chat.js';
import { renderModels } from './views/models.js';
import { renderSettings } from './views/settings.js';
import { registerSW, watchInstallPrompt, isStandalone, isIOS, installPWA } from './pwa.js';

const NAV = [
  { id: 'agents', label: '智能体', icon: 'robot' },
  { id: 'chat', label: '对话', icon: 'chat' },
  { id: 'models', label: '模型', icon: 'chip' },
  { id: 'settings', label: '设置', icon: 'sliders' },
];

const ctx = {
  state: { agents: [], models: [], sessions: [], settings: {}, presets: [] },
  async reload() {
    ctx.state = await api.bootstrap();
    applyTheme(ctx.state.settings);
    paintNav();
  },
  go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },
};

/* ------------------------------------------------------------------ */
/* 导航                                                                */
/* ------------------------------------------------------------------ */

let current = 'agents';

function paintNav() {
  const rail = document.getElementById('rail');
  const navbar = document.getElementById('navbar');
  rail.innerHTML = '';
  navbar.innerHTML = '';

  const brand = document.createElement('div');
  brand.className = 'rail__brand';
  brand.innerHTML = `
    <svg viewBox="0 0 48 48" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="7" y="14" width="34" height="26" rx="10"/>
      <circle cx="16.5" cy="26" r="2" fill="currentColor" stroke="none"/>
      <circle cx="31.5" cy="26" r="2" fill="currentColor" stroke="none"/>
      <path d="M24 14V8"/><circle cx="24" cy="5" r="2.2" fill="currentColor" stroke="none"/>
    </svg>`;
  rail.appendChild(brand);

  NAV.forEach((item) => {
    const b = document.createElement('button');
    b.className = 'rail__item';
    b.setAttribute('aria-current', item.id === current ? 'page' : 'false');
    b.innerHTML = `<span class="rail__indicator">${icon(item.icon, { size: 24 })}</span><span class="rail__label">${item.label}</span>`;
    b.onclick = () => ctx.go(`#/${item.id}`);
    rail.appendChild(b);

    const nb = document.createElement('button');
    nb.className = 'navbar__item';
    nb.setAttribute('aria-current', item.id === current ? 'page' : 'false');
    nb.innerHTML = `<span class="navbar__indicator">${icon(item.icon, { size: 24 })}</span><span>${item.label}</span>`;
    nb.onclick = () => ctx.go(`#/${item.id}`);
    navbar.appendChild(nb);
  });

  const spacer = document.createElement('div');
  spacer.className = 'rail__spacer';
  rail.appendChild(spacer);

  const count = document.createElement('div');
  count.className = 'muted';
  count.style.cssText = 'font:var(--label-s);text-align:center;line-height:1.4;padding-bottom:8px';
  count.innerHTML = `<div>${ctx.state.agents.length}</div><div>智能体</div>`;
  rail.appendChild(count);
}

function paintTopbar(name) {
  const bar = document.getElementById('topbar');
  const item = NAV.find((n) => n.id === name) || NAV[0];
  const sub = {
    agents: `${ctx.state.agents.length} 个智能体 · ${ctx.state.models.length} 个模型源`,
    chat: `${ctx.state.sessions.length} 段对话`,
    models: `${ctx.state.models.length} 个模型源`,
    settings: '主题、模型与数据',
  }[name];

  bar.innerHTML = `
    <div class="grow" style="min-width:0">
      <h1 class="topbar__title">${item.label}</h1>
      <p class="topbar__sub">${sub || ''}</p>
    </div>
    <div class="topbar__actions">
      <button class="icon-btn" data-act="refresh" title="刷新">${icon('refresh', { size: 20 })}</button>
    </div>
  `;
  bar.querySelector('[data-act="refresh"]').onclick = async () => {
    await ctx.reload();
    route();
    toast('已刷新');
  };
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

async function route() {
  const hash = location.hash || '#/agents';
  const [name = 'agents', param = ''] = hash.replace(/^#\//, '').split('/');
  const view = document.getElementById('view');
  current = NAV.some((n) => n.id === name) ? name : 'agents';

  paintNav();
  paintTopbar(current);
  view.innerHTML = '';
  view.scrollTop = 0;

  try {
    if (current === 'agents') renderAgents(view, ctx);
    else if (current === 'chat') await renderChat(view, ctx, param || null);
    else if (current === 'models') renderModels(view, ctx);
    else if (current === 'settings') renderSettings(view, ctx);
  } catch (err) {
    view.innerHTML = `<div class="empty">${icon('alert', { size: 64 })}<p>${err?.message || '页面加载失败'}</p></div>`;
  }
}

/* ------------------------------------------------------------------ */
/* 全局交互                                                            */
/* ------------------------------------------------------------------ */

document.addEventListener('click', async (e) => {
  const copyBtn = e.target.closest?.('[data-copy]');
  if (copyBtn) {
    const code = decodeURIComponent(copyBtn.dataset.copy || '');
    const { copyText } = await import('./ui.js');
    copyText(code);
  }
});

window.addEventListener('hashchange', route);

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  try {
    ctx.state = await api.bootstrap();
  } catch (err) {
    document.getElementById('boot').innerHTML = `
      <div style="text-align:center;color:var(--error)">
        <p style="font:var(--title-m)">无法连接到本地服务</p>
        <p class="muted" style="font:var(--body-s)">${err?.message || ''}</p>
        <p class="muted" style="font:var(--body-s)">确认服务端正在运行：node server/index.js</p>
      </div>`;
    return;
  }

  applyTheme(ctx.state.settings);
  watchSystemTheme(() => applyTheme(ctx.state.settings));

  registerSW();
  watchInstallPrompt();

  document.getElementById('boot').remove();
  document.getElementById('app').hidden = false;

  await route();

  // 首次使用引导
  if (!localStorage.getItem('aas.guided')) {
    localStorage.setItem('aas.guided', '1');
    if (!ctx.state.models.length) {
      setTimeout(() => {
        toast('还没有模型源，先去「模型」添加一个吧（本地 .gguf 或云端 API 都行）', {
          actionLabel: '去添加',
          duration: 9000,
          onAction: () => ctx.go('#/models'),
        });
      }, 700);
    }
  }

  // 手机上提示「添加到主屏幕」
  const narrow = window.innerWidth <= 860;
  if (narrow && !isStandalone() && !localStorage.getItem('aas.installHint')) {
    setTimeout(() => {
      toast('把它添加到主屏幕，用起来跟 App 一样', {
        actionLabel: '安装',
        duration: 10000,
        onAction: async () => {
          localStorage.setItem('aas.installHint', '1');
          const ok = await installPWA();
          if (!ok) {
            toast(isIOS() ? '点浏览器「分享 → 添加到主屏幕」' : '浏览器菜单里选「安装应用」', { duration: 6000 });
          }
        },
      });
      localStorage.setItem('aas.installHint', '1');
    }, 2400);
  }
}

boot();
