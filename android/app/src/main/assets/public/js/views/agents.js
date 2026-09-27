/**
 * 视图：智能体库 —— 创建 / 编辑 / 复制 / 删除智能体，自由设定人设
 */
import { icon } from '../icons.js';
import { api } from '../api.js';
import { field, sliderField, column, showDialog, confirmDialog, toast, showMenu } from '../ui.js';
import { tintFromHex, PRESET_SEEDS } from '../theme.js';

const EMOJIS = ['🐺', '✨', '🤖', '🧠', '🎨', '🛠️', '📚', '🌏', '🔮', '🍀', '🦊', '🐱', '🚀', '💡', '🎭', '☕'];

const PROMPT_TEMPLATES = [
  {
    label: '通用助手',
    value:
      '你是一个友善、高效、表达清晰的中文助手。回答时先给结论，再补充必要细节；不确定时如实说明，绝不编造事实。',
  },
  {
    label: '编程搭档',
    value:
      '你是一位资深软件工程师。给出可直接运行的代码，关键处加简短注释；发现用户代码中的隐患要主动指出。默认用中文回复，代码标识符保持英文。',
  },
  {
    label: '角色扮演',
    value:
      '你现在扮演「{{角色名}}」。性格：{{性格}}；说话方式：{{语气}}；背景：{{背景设定}}。全程保持角色一致，用第一人称对话，不要跳出角色解释自己是 AI。',
  },
  {
    label: '写作创作',
    value:
      '你是一位文字功底深厚的创作者。根据用户给出的主题与要求创作，注重画面感与节奏，避免空话套话；除非用户要求，不要解释创作思路。',
  },
  {
    label: '翻译润色',
    value:
      '你是专业的中英双语翻译与文字润色专家。翻译忠实原文、符合目标语言习惯；润色保留作者语气，只改表达不改意思。只输出结果，不要解释。',
  },
  {
    label: '学习导师',
    value:
      '你是一位耐心的老师。用通俗类比讲解概念，先讲直觉再讲细节；每讲完一段用一个小问题确认用户是否理解，鼓励用户多问。',
  },
];

let searchTerm = '';
let activeTag = null;

export function renderAgents(mount, ctx) {
  const { state } = ctx;

  const page = document.createElement('div');
  page.className = 'page';

  /* ---------- 搜索与筛选 ---------- */
  const search = document.createElement('div');
  search.style.cssText = 'position:relative;max-width:420px;margin:4px 0 12px';
  search.innerHTML = `
    <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--on-surface-variant);display:flex">${icon('search', {
      size: 20,
    })}</span>
    <input class="field__input" style="padding-left:44px;border-radius:var(--shape-full);height:48px" placeholder="搜索智能体…" value="${escapeAttr(
      searchTerm
    )}" />
  `;
  const input = search.querySelector('input');
  input.addEventListener('input', () => {
    searchTerm = input.value.trim().toLowerCase();
    paint();
  });

  const tags = [...new Set(state.agents.flatMap((a) => a.tags || []))].filter(Boolean);
  const chipRow = document.createElement('div');
  chipRow.className = 'row row--wrap';
  chipRow.style.margin = '0 0 8px';
  if (tags.length) {
    chipRow.appendChild(chipEl('全部', !activeTag, () => {
      activeTag = null;
      renderAgents(mount, ctx);
    }));
    tags.forEach((t) => {
      chipRow.appendChild(
        chipEl(t, activeTag === t, () => {
          activeTag = activeTag === t ? null : t;
          renderAgents(mount, ctx);
        })
      );
    });
  }

  const grid = document.createElement('div');
  grid.className = 'grid';

  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.innerHTML = `
    ${icon('robot', { size: 64 })}
    <p style="font:var(--title-m);margin:0;color:var(--on-surface)">还没有智能体</p>
    <p style="margin:0">点右下角的按钮，创造属于你的第一个 AI 伙伴</p>
  `;

  page.appendChild(search);
  page.appendChild(chipRow);
  page.appendChild(grid);
  mount.appendChild(page);

  /* ---------- FAB ---------- */
  const fab = document.createElement('button');
  fab.className = 'fab fab--dock fab--extended';
  fab.innerHTML = `${icon('plus', { size: 24 })}<span>新建智能体</span>`;
  fab.onclick = () => openAgentForm(null, ctx);
  mount.appendChild(fab);

  function paint() {
    const list = state.agents.filter((a) => {
      const hitSearch =
        !searchTerm ||
        a.name.toLowerCase().includes(searchTerm) ||
        (a.systemPrompt || '').toLowerCase().includes(searchTerm) ||
        (a.tags || []).join(' ').toLowerCase().includes(searchTerm);
      const hitTag = !activeTag || (a.tags || []).includes(activeTag);
      return hitSearch && hitTag;
    });

    grid.innerHTML = '';
    if (!list.length) {
      grid.appendChild(empty);
      return;
    }
    list.forEach((a) => grid.appendChild(agentCard(a, ctx)));
  }

  paint();
}

function agentCard(agent, ctx) {
  const model = ctx.state.models.find((m) => m.id === agent.modelId);
  const card = document.createElement('div');
  card.className = 'card card--interactive agent-card elevation-0';
  card.tabIndex = 0;
  card.dataset.id = agent.id;

  card.innerHTML = `
    <div class="agent-card__avatar" style="background:${tintFromHex(agent.color)}">${agent.emoji || '✨'}</div>
    <div class="grow">
      <h3 class="agent-card__name">${escapeHtml(agent.name)}</h3>
      <p class="agent-card__desc">${escapeHtml(agent.systemPrompt || '（未设置人设）')}</p>
      <div class="agent-card__meta">
        <span class="tag">${icon(model ? 'chip' : 'alert', { size: 14 })} ${escapeHtml(model ? model.name : '未绑定模型')}</span>
        ${(agent.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        <span class="muted" style="font:var(--body-s)">温度 ${agent.temperature} · 记忆 ${agent.contextMessages} 条</span>
      </div>
    </div>
    <button class="icon-btn agent-card__actions" aria-label="更多操作">${icon('more', { size: 20 })}</button>
  `;

  const openMenu = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    showMenu({ getBoundingClientRect: () => rect }, [
      { label: '开始聊天', iconName: 'chat', value: 'chat' },
      { label: '编辑设定', iconName: 'edit', value: 'edit' },
      { label: '创建副本', iconName: 'copy', value: 'dup' },
      { divider: true },
      { label: '删除', iconName: 'trash', value: 'del', danger: true },
    ]).then(async (v) => {
      if (v === 'chat') await startChat(agent.id, ctx);
      if (v === 'edit') await openAgentForm(agent, ctx);
      if (v === 'dup') {
        await api.duplicateAgent(agent.id);
        toast('已创建副本');
        await ctx.reload();
      }
      if (v === 'del') await removeAgent(agent, ctx);
    });
  };

  card.querySelector('.agent-card__actions').onclick = openMenu;
  card.onclick = () => startChat(agent.id, ctx);
  card.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startChat(agent.id, ctx);
    }
  };
  return card;
}

/* ------------------------------------------------------------------ */
/* 表单                                                                */
/* ------------------------------------------------------------------ */

export async function openAgentForm(existing, ctx) {
  const { models } = ctx.state;
  const isEdit = !!existing;

  const fName = field({ label: '名称', value: existing?.name || '', support: '给它一个好记的名字' });
  const fEmoji = field({ label: '头像（表情）', value: existing?.emoji || '✨', support: '也可以直接粘贴任意 emoji' });
  const fColor = field({ label: '主题色（#RRGGBB）', value: existing?.color || '#7C5CFF', support: '决定头像底色与卡片高亮', mono: true });
  const fPrompt = field({
    label: '人设 / 系统提示词',
    value: existing?.systemPrompt || '',
    textarea: true,
    rows: 8,
    support: '越具体，它越懂你。可用下方模板一键填充',
  });
  const fGreeting = field({ label: '开场白（可选）', value: existing?.greeting || '', support: '进入对话时它说的第一句话' });
  const fTags = field({ label: '标签（逗号分隔）', value: (existing?.tags || []).join('，'), support: '方便在库中筛选' });
  const fTemp = sliderField({ label: '创造力 Temperature', value: existing?.temperature ?? 0.7, min: 0, max: 2, step: 0.05 });
  const fTopP = sliderField({ label: '采样范围 Top P', value: existing?.topP ?? 0.9, min: 0.1, max: 1, step: 0.05 });
  const fMax = field({ label: '单次最大 Token', value: existing?.maxTokens ?? 2048, type: 'number', min: 64, max: 32768, mono: true });
  const fCtx = field({ label: '携带历史消息数', value: existing?.contextMessages ?? 20, type: 'number', min: 2, max: 200, mono: true });

  const picker = modelPicker(models, existing?.modelId);
  const emojiPick = emojiPicker(fEmoji, existing?.emoji || '✨');
  const colorPick = colorPicker(fColor, existing?.color || '#7C5CFF');
  const tmplRow = templateRow(fPrompt);

  const body = column(
    [
      fName,
      row2(fEmoji, fColor),
      emojiPick,
      colorPick,
      divider('人设'),
      tmplRow,
      fPrompt,
      fGreeting,
      divider('模型与参数'),
      picker.el,
      row2(fMax, fCtx),
      fTemp,
      fTopP,
      fTags,
    ],
    { gap: '12px' }
  );

  const result = await showDialog({
    title: isEdit ? '编辑智能体' : '新建智能体',
    support: isEdit ? '改动会立即生效' : '设定好之后可以随时再改',
    content: body,
    iconName: 'robot',
    wide: true,
    actions: [
      { label: '取消', value: null, variant: 'text' },
      {
        label: isEdit ? '保存' : '创建',
        value: 'save',
        variant: 'filled',
        onClick: () => {
          if (!fName.get().trim()) {
            toast('请先填写名称');
            fName.focus();
            return false;
          }
          return true;
        },
      },
    ],
  });

  if (result !== 'save') return null;

  const payload = {
    name: fName.get().trim(),
    emoji: fEmoji.get().trim() || '✨',
    color: normalizeColor(fColor.get()),
    systemPrompt: fPrompt.get(),
    greeting: fGreeting.get(),
    modelId: picker.get(),
    temperature: fTemp.get(),
    topP: fTopP.get(),
    maxTokens: Number(fMax.get()) || 2048,
    contextMessages: Number(fCtx.get()) || 20,
    tags: fTags
      .get()
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
  };

  try {
    const agent = isEdit ? await api.updateAgent(existing.id, payload) : await api.createAgent(payload);
    toast(isEdit ? '设定已保存' : `已创建「${agent.name}」`);
    await ctx.reload();
    return agent;
  } catch (err) {
    toast(err.message || '保存失败');
    return null;
  }
}

async function removeAgent(agent, ctx) {
  const yes = await confirmDialog({
    title: `删除「${agent.name}」？`,
    message: '它的全部对话记录也会一起删除，且无法恢复。',
    confirmText: '删除',
    danger: true,
  });
  if (!yes) return;
  await api.deleteAgent(agent.id);
  toast('已删除');
  await ctx.reload();
}

export async function startChat(agentId, ctx) {
  const session = await api.createSession(agentId);
  await ctx.reload();
  ctx.go(`#/chat/${session.id}`);
}

/* ------------------------------------------------------------------ */
/* 小组件                                                              */
/* ------------------------------------------------------------------ */

function chipEl(label, active, onClick) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.setAttribute('aria-pressed', active ? 'true' : 'false');
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function row2(a, b) {
  const el = document.createElement('div');
  el.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px';
  el.appendChild(a.el);
  el.appendChild(b.el);
  return { el };
}

function divider(text) {
  const d = document.createElement('div');
  d.className = 'section-title';
  d.textContent = text;
  d.style.margin = '8px 0 0';
  return d;
}

function emojiPicker(target, current) {
  const el = document.createElement('div');
  el.className = 'row row--wrap';
  EMOJIS.forEach((e) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.style.cssText = 'width:44px;padding:0;justify-content:center;font-size:20px';
    b.setAttribute('aria-pressed', e === current ? 'true' : 'false');
    b.textContent = e;
    b.onclick = () => {
      target.set(e);
      el.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
    };
    el.appendChild(b);
  });
  target.input.addEventListener('input', () => {
    el.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c.textContent === target.get() ? 'true' : 'false'));
  });
  return el;
}

function colorPicker(target, current) {
  const el = document.createElement('div');
  el.className = 'row row--wrap';
  PRESET_SEEDS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = tintFromHex(c);
    b.style.boxShadow = `inset 0 0 0 2px ${c}`;
    b.setAttribute('aria-pressed', c.toLowerCase() === String(current).toLowerCase() ? 'true' : 'false');
    b.setAttribute('aria-label', c);
    b.onclick = () => {
      target.set(c);
      el.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
    };
    el.appendChild(b);
  });
  return el;
}

function templateRow(target) {
  const el = document.createElement('div');
  el.className = 'row row--wrap';
  PROMPT_TEMPLATES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'chip chip--input';
    b.innerHTML = `${icon('sparkles', { size: 16 })}<span>${t.label}</span>`;
    b.onclick = () => {
      target.set(t.value);
      toast(`已填入「${t.label}」模板`);
    };
    el.appendChild(b);
  });
  return el;
}

function modelPicker(models, currentId) {
  const el = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'section-title';
  label.style.margin = '4px 0 0';
  label.textContent = models.length ? '绑定模型源' : '绑定模型源（还没有可用的模型源）';
  el.appendChild(label);

  const row = document.createElement('div');
  row.className = 'row row--wrap';
  if (!models.length) {
    const tip = document.createElement('p');
    tip.className = 'muted';
    tip.style.font = 'var(--body-s)';
    tip.innerHTML = '先到「模型」页面添加一个模型源（本地 .gguf 或云端 API），之后就能在这里绑定。';
    row.appendChild(tip);
  }

  let selected = currentId || null;
  const mk = (id, text, iconName) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('aria-pressed', id === selected ? 'true' : 'false');
    b.innerHTML = `${icon(iconName, { size: 16 })}<span>${escapeHtml(text)}</span>`;
    b.onclick = () => {
      selected = id;
      row.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
    };
    row.appendChild(b);
  };

  mk(null, '跟随默认模型', 'bolt');
  models.forEach((m) => mk(m.id, m.name, m.type === 'custom' ? 'cloud' : 'chip'));
  el.appendChild(row);
  return { el, get: () => selected };
}

function normalizeColor(v) {
  const s = String(v || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
  return '#7C5CFF';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
