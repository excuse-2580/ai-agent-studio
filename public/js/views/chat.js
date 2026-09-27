/**
 * 视图：对话 —— 流式输出、会话管理、模型热切换
 */
import { icon } from '../icons.js';
import { api } from '../api.js';
import { renderMarkdown, escapeHtml } from '../markdown.js';
import { toast, confirmDialog, showMenu, showDialog, copyText, formatTime } from '../ui.js';
import { tintFromHex } from '../theme.js';

let controller = null;
let generating = false;

export async function renderChat(mount, ctx, sessionId) {
  const all = ctx.state.sessions || [];
  let currentId = sessionId || all[0]?.id || null;

  const wrap = document.createElement('div');
  wrap.className = 'chat';
  mount.appendChild(wrap);

  const aside = document.createElement('aside');
  aside.className = 'chat__aside';
  aside.innerHTML = `
    <div class="chat__aside-head">
      <div class="row">
        <button class="icon-btn" data-act="close-aside" title="收起">${icon('back', { size: 20 })}</button>
        <span class="grow" style="font:var(--title-s)">对话</span>
      </div>
      <button class="btn btn--tonal btn--sm" data-act="new-session" style="width:100%">${icon('plus', {
        size: 18,
      })}<span>新对话</span></button>
    </div>
    <div class="chat__list"></div>
  `;
  wrap.appendChild(aside);

  const main = document.createElement('section');
  main.className = 'chat__main';
  main.innerHTML = `
    <div class="row" style="padding:8px 12px;border-bottom:1px solid var(--outline-variant);background:var(--surface-container);gap:8px">
      <button class="icon-btn" data-act="open-aside" style="display:none">${icon('menu', { size: 20 })}</button>
      <div class="grow" data-role="head" style="min-width:0"></div>
      <button class="chip" data-act="model">${icon('chip', { size: 16 })}<span data-role="model-name">模型</span></button>
      <button class="icon-btn" data-act="more" title="更多">${icon('more', { size: 20 })}</button>
    </div>
    <div class="messages"><div class="messages__inner"></div></div>
    <div class="composer">
      <div class="composer__inner">
        <textarea class="composer__input" rows="1" placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"></textarea>
        <button class="icon-btn icon-btn--filled" data-act="send" title="发送">${icon('send', { size: 20 })}</button>
      </div>
      <p class="composer__hint">内容由你选择的模型生成，请注意甄别</p>
    </div>
  `;
  wrap.appendChild(main);

  const listEl = aside.querySelector('.chat__list');
  const headEl = main.querySelector('[data-role="head"]');
  const inner = main.querySelector('.messages__inner');
  const scroller = main.querySelector('.messages');
  const input = main.querySelector('.composer__input');
  const sendBtn = main.querySelector('[data-act="send"]');
  const modelBtn = main.querySelector('[data-act="model"]');
  const modelName = main.querySelector('[data-role="model-name"]');
  const asideToggle = main.querySelector('[data-act="open-aside"]');

  if (window.innerWidth <= 1000) asideToggle.style.display = 'grid';

  asideToggle.onclick = () => aside.classList.add('chat__aside--open');
  aside.querySelector('[data-act="close-aside"]').onclick = () => aside.classList.remove('chat__aside--open');
  aside.querySelector('[data-act="new-session"]').onclick = () => newSession(ctx, currentId);

  main.querySelector('[data-act="more"]').onclick = (e) =>
    showMenu(e.currentTarget, [
      { label: '重命名对话', iconName: 'edit', value: 'rename' },
      { label: '清空消息', iconName: 'refresh', value: 'clear' },
      { label: '导出为 Markdown', iconName: 'download', value: 'export' },
      { divider: true },
      { label: '删除对话', iconName: 'trash', value: 'del', danger: true },
    ]).then((v) => onMore(v));

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  sendBtn.onclick = () => send();
  modelBtn.onclick = (e) => openModelMenu(e.currentTarget);

  /* ---------------- 数据 ---------------- */
  let session = currentId ? await api.getSession(currentId) : null;

  async function paintAside() {
    listEl.innerHTML = '';
    const sessions = ctx.state.sessions || [];
    if (!sessions.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.style.cssText = 'font:var(--body-s);padding:12px';
      p.textContent = '还没有对话，点上面的按钮开始';
      listEl.appendChild(p);
      return;
    }
    sessions.forEach((s) => {
      const agent = ctx.state.agents.find((a) => a.id === s.agentId);
      const b = document.createElement('button');
      b.className = 'session-item';
      b.setAttribute('aria-selected', s.id === currentId ? 'true' : 'false');
      b.innerHTML = `
        <span style="font-size:18px">${agent?.emoji || '✨'}</span>
        <span class="grow" style="min-width:0">
          <span class="session-item__title" style="display:block;font:var(--label-l)">${escapeHtml(s.title || '新的对话')}</span>
          <span class="muted" style="display:block;font:var(--body-s);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(
            s.preview || agent?.name || ''
          )}</span>
        </span>
      `;
      b.onclick = async () => {
        if (generating) return toast('正在生成中，请先停止');
        aside.classList.remove('chat__aside--open');
        ctx.go(`#/chat/${s.id}`);
      };
      listEl.appendChild(b);
    });
  }

  function paintHead() {
    const agent = ctx.state.agents.find((a) => a.id === session?.agentId);
    if (!agent) {
      headEl.innerHTML = '<span class="muted">未选择智能体</span>';
      return;
    }
    headEl.innerHTML = `
      <div class="row" style="gap:10px;min-width:0">
        <span style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:${tintFromHex(
          agent.color
        )};font-size:18px">${agent.emoji || '✨'}</span>
        <span style="min-width:0">
          <span style="display:block;font:var(--title-s);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(
            agent.name
          )}</span>
          <span class="muted" style="display:block;font:var(--body-s)">${escapeHtml(agent.greeting || agent.systemPrompt || '').slice(
            0,
            28
          )}</span>
        </span>
      </div>
    `;
    const model = resolveModel(agent);
    modelName.textContent = model ? model.name : '未绑定模型';
    modelBtn.title = model ? `${model.name} · ${model.model}` : '点击绑定模型源';
  }

  function resolveModel(agent) {
    if (!agent) return null;
    if (agent.modelId) return ctx.state.models.find((m) => m.id === agent.modelId) || null;
    return ctx.state.models.find((m) => m.enabled) || null;
  }

  function paintMessages() {
    inner.innerHTML = '';
    const agent = ctx.state.agents.find((a) => a.id === session?.agentId);
    if (!session) {
      inner.innerHTML = `<div class="empty">${icon('chat', { size: 64 })}<p style="font:var(--title-m);color:var(--on-surface);margin:0">开始一段对话</p><p style="margin:0">先在「智能体」里创建一个伙伴，或点左上角「新对话」</p></div>`;
      return;
    }
    if (!session.messages.length && agent?.greeting) {
      inner.appendChild(messageEl({ role: 'assistant', content: agent.greeting }, agent, { ghost: true }));
    }
    session.messages.forEach((m) => inner.appendChild(messageEl(m, agent)));
    scrollBottom(true);
  }

  function scrollBottom(force = false) {
    const near = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 220;
    if (force || near) scroller.scrollTop = scroller.scrollHeight;
  }

  function messageEl(msg, agent, { ghost = false } = {}) {
    const isUser = msg.role === 'user';
    const el = document.createElement('div');
    el.className = `msg ${isUser ? 'msg--user' : 'msg--assistant'}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg__avatar';
    if (isUser) {
      avatar.style.cssText = 'background:var(--surface-container-highest);color:var(--on-surface-variant)';
      avatar.innerHTML = icon('user', { size: 18 });
    } else {
      avatar.style.background = tintFromHex(agent?.color || '#7C5CFF');
      avatar.textContent = agent?.emoji || '✨';
    }
    el.appendChild(avatar);

    const col = document.createElement('div');
    col.style.cssText = 'min-width:0;flex:1;display:flex;flex-direction:column;gap:4px;align-items:' + (isUser ? 'flex-end' : 'flex-start');

    if (msg.reasoning) {
      const th = document.createElement('details');
      th.className = 'msg__thinking';
      th.style.maxWidth = 'min(680px, 78%)';
      th.innerHTML = `<summary style="cursor:pointer;color:var(--on-surface-variant)">思考过程</summary><div style="margin-top:6px;white-space:pre-wrap">${escapeHtml(
        msg.reasoning
      )}</div>`;
      col.appendChild(th);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg__bubble md';
    bubble.innerHTML = renderMarkdown(msg.content || '');
    col.appendChild(bubble);

    if (!ghost) {
      const bar = document.createElement('div');
      bar.className = 'row';
      bar.style.cssText = 'gap:2px;opacity:.55';
      bar.innerHTML = `
        <button class="icon-btn" data-act="copy" title="复制">${icon('copy', { size: 16 })}</button>
        ${isUser ? '' : `<button class="icon-btn" data-act="regen" title="重新生成">${icon('refresh', { size: 16 })}</button>`}
        <span class="muted" style="font:var(--label-s);padding:0 6px">${formatTime(msg.ts)}</span>
      `;
      bar.querySelector('[data-act="copy"]').onclick = () => copyText(msg.content || '');
      const regen = bar.querySelector('[data-act="regen"]');
      if (regen) regen.onclick = () => regenerate();
      col.appendChild(bar);
    }

    el.appendChild(col);
    return el;
  }

  /* ---------------- 发送 ---------------- */
  async function send() {
    if (generating) return;
    const text = input.value.trim();
    if (!text) return;
    if (!session) return toast('请先创建一个对话');

    const agent = ctx.state.agents.find((a) => a.id === session.agentId);
    if (!resolveModel(agent)) {
      toast('还没有可用模型源，先去「模型」页面添加一个');
      ctx.go('#/models');
      return;
    }

    input.value = '';
    input.style.height = 'auto';
    session.messages.push({ role: 'user', content: text, ts: Date.now() });
    paintMessages();

    await runStream(text);
  }

  async function runStream(text, { regen = false } = {}) {
    generating = true;
    setSendingUI(true);
    const agent = ctx.state.agents.find((a) => a.id === session.agentId);

    const holder = document.createElement('div');
    holder.className = 'msg msg--assistant';
    const avatar = document.createElement('div');
    avatar.className = 'msg__avatar';
    avatar.style.background = tintFromHex(agent?.color || '#7C5CFF');
    avatar.textContent = agent?.emoji || '✨';
    const col = document.createElement('div');
    col.style.cssText = 'min-width:0;flex:1;display:flex;flex-direction:column;gap:4px;align-items:flex-start';
    const think = document.createElement('details');
    think.className = 'msg__thinking';
    think.style.display = 'none';
    think.innerHTML = '<summary style="cursor:pointer">思考中…</summary><div data-role="think-body"></div>';
    const bubble = document.createElement('div');
    bubble.className = 'msg__bubble md';
    bubble.innerHTML = '<span class="caret"></span>';
    col.appendChild(think);
    col.appendChild(bubble);
    holder.appendChild(avatar);
    holder.appendChild(col);
    inner.appendChild(holder);
    scrollBottom(true);

    controller = new AbortController();
    let buf = '';
    let thinkBuf = '';
    let last = 0;

    const paint = () => {
      bubble.innerHTML = renderMarkdown(buf) + '<span class="caret"></span>';
      if (thinkBuf) {
        think.style.display = '';
        think.querySelector('[data-role="think-body"]').textContent = thinkBuf;
      }
      scrollBottom();
    };

    try {
      await api.chatStream(session.id, text, {
        signal: controller.signal,
        regen,
        onEvent: (event, data) => {
          if (event === 'delta') {
            buf += data.text || '';
          } else if (event === 'thinking') {
            thinkBuf += data.text || '';
          } else if (event === 'replace') {
            buf = data.text || '';
            thinkBuf = data.thinking || '';
          } else if (event === 'error') {
            throw new Error(data.message || '生成失败');
          } else if (event === 'done' && data?.session) {
            session = data.session;
          }
          const t = Date.now();
          if (t - last > 50) {
            last = t;
            paint();
          }
        },
      });
      paint();
    } catch (err) {
      if (err?.name !== 'AbortError') {
        bubble.innerHTML = renderMarkdown(buf) + `<p style="color:var(--error);font:var(--body-s);margin-top:8px">⚠ ${escapeHtml(
          err.message || '生成失败'
        )}</p>`;
      }
    } finally {
      bubble.innerHTML = renderMarkdown(buf || '（已停止）');
      generating = false;
      setSendingUI(false);
      controller = null;
      await ctx.reload({ keepView: true });
      paintAside();
    }
  }

  async function regenerate() {
    if (generating) return;
    const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return toast('没有可重新生成的消息');
    await api.dropLastAssistant(session.id);
    session = await api.getSession(session.id);
    paintMessages();
    await runStream(lastUser.content, { regen: true });
  }

  function setSendingUI(on) {
    if (on) {
      sendBtn.innerHTML = icon('stop', { size: 20 });
      sendBtn.title = '停止生成';
      sendBtn.onclick = stop;
    } else {
      sendBtn.innerHTML = icon('send', { size: 20 });
      sendBtn.title = '发送';
      sendBtn.onclick = () => send();
    }
  }

  async function stop() {
    controller?.abort();
    try {
      await fetch(`/api/sessions/${session.id}/stop`, { method: 'POST' });
    } catch {
      /* noop */
    }
  }

  /* ---------------- 菜单动作 ---------------- */
  async function onMore(v) {
    if (!session) return;
    if (v === 'rename') {
      const f = await showDialog({
        title: '重命名对话',
        content: `<input class="field__input" id="rn" value="${escapeHtml(session.title)}" />`,
        actions: [
          { label: '取消', value: null, variant: 'text' },
          { label: '保存', value: 'ok', variant: 'filled' },
        ],
      });
      if (f === 'ok') {
        const val = document.getElementById('rn')?.value?.trim();
        if (val) {
          await api.renameSession(session.id, val);
          toast('已重命名');
          await ctx.reload({ keepView: true });
          paintAside();
          paintHead();
        }
      }
    }
    if (v === 'clear') {
      const yes = await confirmDialog({ title: '清空这段对话？', message: '消息会被删除，智能体设定保留。', confirmText: '清空', danger: true });
      if (yes) {
        session = await api.clearMessages(session.id);
        paintMessages();
        toast('已清空');
      }
    }
    if (v === 'export') exportMarkdown();
    if (v === 'del') {
      const yes = await confirmDialog({ title: '删除这段对话？', message: '删除后无法恢复。', confirmText: '删除', danger: true });
      if (!yes) return;
      await api.deleteSession(session.id);
      toast('已删除');
      await ctx.reload();
      ctx.go('#/chat');
    }
  }

  function exportMarkdown() {
    const agent = ctx.state.agents.find((a) => a.id === session.agentId);
    const lines = [`# ${session.title}`, '', `> 智能体：${agent?.name || '未知'} · 导出于 ${new Date().toLocaleString('zh-CN')}`, ''];
    session.messages.forEach((m) => {
      lines.push(`### ${m.role === 'user' ? '我' : agent?.name || '智能体'}`);
      lines.push('');
      lines.push(m.content || '');
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${session.title || '对话'}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出 Markdown');
  }

  async function openModelMenu(anchor) {
    const agent = ctx.state.agents.find((a) => a.id === session?.agentId);
    if (!agent) return toast('请先选择智能体');
    const items = [
      { label: '跟随默认模型', iconName: 'bolt', value: null },
      ...ctx.state.models.map((m) => ({ label: `${m.name}（${m.model}）`, iconName: 'chip', value: m.id })),
      { divider: true },
      { label: '去管理模型源', iconName: 'sliders', value: '__manage' },
    ];
    const v = await showMenu(anchor, items);
    if (v === '__manage') return ctx.go('#/models');
    if (v === undefined) return;
    await api.updateAgent(agent.id, { modelId: v });
    await ctx.reload({ keepView: true });
    paintHead();
    toast('已切换模型');
  }

  async function newSession(context, fromId) {
    const agents = context.state.agents;
    if (!agents.length) {
      toast('先创建一个智能体吧');
      return context.go('#/agents');
    }
    let agentId = context.state.sessions.find((s) => s.id === fromId)?.agentId;
    if (!agentId || !agents.some((a) => a.id === agentId)) {
      if (agents.length === 1) {
        agentId = agents[0].id;
      } else {
        const anchor = aside.querySelector('[data-act="new-session"]');
        agentId = await showMenu(anchor, agents.map((a) => ({ label: a.name, iconName: 'robot', value: a.id })));
        if (!agentId) return;
      }
    }
    const s = await api.createSession(agentId);
    await context.reload();
    context.go(`#/chat/${s.id}`);
  }

  /* ---------------- 初始渲染 ---------------- */
  paintAside();
  paintHead();
  paintMessages();

  return {
    async update(nextId) {
      if (nextId && nextId !== currentId) {
        currentId = nextId;
        session = await api.getSession(currentId);
        paintAside();
        paintHead();
        paintMessages();
      }
    },
  };
}
