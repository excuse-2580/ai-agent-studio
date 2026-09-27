/**
 * 视图：设置 —— 主题 / 动态取色 / 对话行为 / 数据管理
 */
import { icon } from '../icons.js';
import { api } from '../api.js';
import { field, sliderField, showDialog, confirmDialog, toast } from '../ui.js';
import { PRESET_SEEDS } from '../theme.js';

export function renderSettings(mount, ctx) {
  const s = ctx.state.settings;

  const page = document.createElement('div');
  page.className = 'page';
  page.style.maxWidth = '860px';

  /* ---------------- 外观 ---------------- */
  page.appendChild(section('外观', 'palette'));
  const look = document.createElement('div');
  look.className = 'card card--outlined';

  look.appendChild(
    settingRow({
      title: '主题',
      desc: '浅色 / 深色 / 跟随系统',
      control: segmented(
        [
          { label: '浅色', value: 'light', icon: 'sun' },
          { label: '深色', value: 'dark', icon: 'moon' },
          { label: '跟随系统', value: 'system', icon: 'wifi' },
        ],
        s.theme,
        async (v) => {
          await api.updateSettings({ theme: v });
          await ctx.reload();
        }
      ),
    })
  );

  look.appendChild(divider());

  // 主色
  const colorWrap = document.createElement('div');
  colorWrap.style.padding = '14px 16px';
  const colorTitle = document.createElement('p');
  colorTitle.style.cssText = 'margin:0;font:var(--body-l)';
  colorTitle.textContent = '主色（动态取色）';
  const colorDesc = document.createElement('p');
  colorDesc.className = 'muted';
  colorDesc.style.cssText = 'margin:2px 0 10px;font:var(--body-s)';
  colorDesc.textContent = '换个种子色，整个界面跟着变';
  const swatches = document.createElement('div');
  swatches.className = 'swatch-row';
  PRESET_SEEDS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c;
    b.setAttribute('aria-pressed', c.toLowerCase() === String(s.seedColor).toLowerCase() ? 'true' : 'false');
    b.setAttribute('aria-label', c);
    b.innerHTML = b.getAttribute('aria-pressed') === 'true' ? icon('check', { size: 20 }) : '';
    b.onclick = async () => {
      await api.updateSettings({ seedColor: c });
      await ctx.reload();
    };
    swatches.appendChild(b);
  });
  const customRow = document.createElement('div');
  customRow.className = 'row';
  customRow.style.marginTop = '12px';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = normalizeHex(s.seedColor);
  colorInput.style.cssText =
    'width:56px;height:40px;padding:0;border:1px solid var(--outline-variant);border-radius:8px;background:none;cursor:pointer';
  const hexField = field({ label: '自定义色值', value: s.seedColor, mono: true });
  hexField.el.style.flex = '1';
  customRow.appendChild(colorInput);
  customRow.appendChild(hexField.el);
  const applyBtn = document.createElement('button');
  applyBtn.className = 'btn btn--tonal btn--sm';
  applyBtn.textContent = '应用';
  applyBtn.onclick = async () => {
    const v = normalizeHex(hexField.get());
    await api.updateSettings({ seedColor: v });
    toast('主色已更新');
    await ctx.reload();
  };
  customRow.appendChild(applyBtn);
  colorInput.addEventListener('input', () => hexField.set(colorInput.value));
  colorWrap.append(colorTitle, colorDesc, swatches, customRow);
  look.appendChild(colorWrap);

  look.appendChild(divider());

  const fontSlider = sliderField({
    label: '界面缩放',
    value: s.fontScale || 1,
    min: 0.85,
    max: 1.35,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  });
  const fontRow = document.createElement('div');
  fontRow.style.padding = '10px 16px 16px';
  fontRow.appendChild(fontSlider.el);
  fontSlider.input.addEventListener('change', async () => {
    await api.updateSettings({ fontScale: fontSlider.get() });
    await ctx.reload();
  });
  look.appendChild(fontRow);

  page.appendChild(look);

  /* ---------------- 对话 ---------------- */
  page.appendChild(section('对话', 'chat'));
  const chat = document.createElement('div');
  chat.className = 'card card--outlined';
  chat.appendChild(
    settingRow({
      title: '流式输出',
      desc: '像打字一样逐字显示；关掉则等模型全部生成完再显示',
      control: toggle(s.stream !== false, async (v) => {
        await api.updateSettings({ stream: v });
        await ctx.reload();
      }),
    })
  );
  chat.appendChild(divider());
  chat.appendChild(
    settingRow({
      title: '显示思考过程',
      desc: '部分模型（如 DeepSeek-R1）会先输出推理内容',
      control: toggle(s.showThinking !== false, async (v) => {
        await api.updateSettings({ showThinking: v });
        await ctx.reload();
      }),
    })
  );
  page.appendChild(chat);

  /* ---------------- 本地模型 ---------------- */
  page.appendChild(section('本地模型', 'hardDrive'));
  const local = document.createElement('div');
  local.className = 'card card--outlined';
  const dirField = field({
    label: 'GGUF 扫描目录（英文逗号分隔）',
    value: (s.ggufDirs || []).join(','),
    mono: true,
    support: '在「模型」页面点击扫描时会用到',
  });
  const dirWrap = document.createElement('div');
  dirWrap.style.padding = '14px 16px';
  dirWrap.appendChild(dirField.el);
  const saveDirs = document.createElement('button');
  saveDirs.className = 'btn btn--tonal btn--sm';
  saveDirs.style.marginTop = '8px';
  saveDirs.textContent = '保存目录';
  saveDirs.onclick = async () => {
    await api.updateSettings({ ggufDirs: dirField.get().split(',').map((x) => x.trim()).filter(Boolean) });
    toast('已保存');
  };
  dirWrap.appendChild(saveDirs);
  local.appendChild(dirWrap);
  page.appendChild(local);

  /* ---------------- 数据 ---------------- */
  page.appendChild(section('数据', 'hardDrive'));
  const data = document.createElement('div');
  data.className = 'card card--outlined';

  data.appendChild(
    settingRow({
      title: '导出全部数据',
      desc: '智能体、模型源与对话记录打包成 JSON',
      control: iconButton('download', async () => {
        const blob = new Blob([JSON.stringify(await api.exportAll(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ai-agent-studio-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('已导出');
      }),
    })
  );
  data.appendChild(divider());
  data.appendChild(
    settingRow({
      title: '导入数据',
      desc: '用之前导出的 JSON 覆盖当前数据',
      control: iconButton('upload', () => importData(ctx)),
    })
  );
  data.appendChild(divider());
  data.appendChild(
    settingRow({
      title: '恢复出厂设置',
      desc: '清空所有智能体、模型源与对话',
      control: iconButton('trash', async () => {
        const yes = await confirmDialog({
          title: '清空所有数据？',
          message: '包括智能体、模型源和全部对话记录，无法恢复。建议先导出备份。',
          confirmText: '全部清空',
          danger: true,
        });
        if (!yes) return;
        await api.resetAll();
        toast('已恢复出厂设置');
        await ctx.reload();
        ctx.go('#/agents');
      }, true),
    })
  );
  page.appendChild(data);

  /* ---------------- 关于 ---------------- */
  page.appendChild(section('关于', 'info'));
  const about = document.createElement('div');
  about.className = 'card card--filled';
  about.innerHTML = `
    <div class="row" style="gap:14px;align-items:flex-start">
      ${icon('robot', { size: 28 })}
      <div class="grow">
        <p style="margin:0;font:var(--title-m)">AI Agent Studio</p>
        <p class="muted" style="margin:6px 0 0;font:var(--body-s);line-height:1.7">
          一个完全在你自己电脑上运行的智能体工作台：自由创建、删除、设定 AI 智能体，
          可以接本地 .gguf 模型，也可以接任意云端大模型。数据只保存在本机。
        </p>
        <div class="row row--wrap" style="margin-top:12px">
          <span class="tag">${icon('chip', { size: 14 })} 零依赖 · Node.js</span>
          <span class="tag">${icon('palette', { size: 14 })} Material Design 3</span>
          <span class="tag">${icon('lock', { size: 14 })} 数据本地存储</span>
        </div>
      </div>
    </div>
  `;
  page.appendChild(about);

  mount.appendChild(page);
}

/* ------------------------------------------------------------------ */
/* 小组件                                                              */
/* ------------------------------------------------------------------ */

function section(text, iconName) {
  const el = document.createElement('div');
  el.className = 'section-title';
  el.innerHTML = `${icon(iconName, { size: 18 })}<span>${text}</span>`;
  return el;
}

function divider() {
  const d = document.createElement('hr');
  d.className = 'divider';
  d.style.margin = '0';
  return d;
}

function settingRow({ title, desc, control }) {
  const el = document.createElement('div');
  el.className = 'setting-row';
  const left = document.createElement('div');
  left.className = 'grow';
  left.innerHTML = `<p class="setting-row__title">${title}</p><p class="setting-row__desc">${desc}</p>`;
  el.appendChild(left);
  const c = document.createElement('div');
  c.className = 'setting-row__control';
  c.appendChild(control);
  el.appendChild(c);
  return el;
}

function segmented(items, current, onChange) {
  const el = document.createElement('div');
  el.className = 'segmented';
  items.forEach((it) => {
    const b = document.createElement('button');
    b.className = 'segmented__item';
    b.setAttribute('aria-pressed', it.value === current ? 'true' : 'false');
    b.innerHTML = `${icon(it.icon, { size: 18 })}<span>${it.label}</span>`;
    b.onclick = () => onChange(it.value);
    el.appendChild(b);
  });
  return el;
}

function toggle(on, onChange) {
  const el = document.createElement('button');
  el.className = 'switch';
  el.setAttribute('role', 'switch');
  el.setAttribute('aria-checked', on ? 'true' : 'false');
  el.innerHTML = '<span class="switch__knob"></span>';
  el.onclick = async () => {
    const next = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', next ? 'true' : 'false');
    await onChange(next);
  };
  return el;
}

function iconButton(iconName, onClick, danger = false) {
  const b = document.createElement('button');
  b.className = `icon-btn${danger ? ' icon-btn--danger' : ''}`;
  b.innerHTML = icon(iconName, { size: 20 });
  b.onclick = onClick;
  return b;
}

async function importData(ctx) {
  const ta = document.createElement('textarea');
  ta.className = 'field__textarea';
  ta.rows = 6;
  ta.placeholder = '把导出的 JSON 内容粘贴到这里';
  const picked = await showDialog({
    title: '导入数据',
    support: '会覆盖当前的全部数据',
    content: ta,
    actions: [
      { label: '取消', value: null, variant: 'text' },
      { label: '导入', value: 'ok', variant: 'filled' },
    ],
  });
  if (picked !== 'ok') return;
  try {
    const data = JSON.parse(ta.value);
    await api.importAll(data);
    toast('导入成功');
    await ctx.reload();
  } catch (err) {
    toast('导入失败：' + (err.message || 'JSON 格式有误'));
  }
}

function normalizeHex(v) {
  const s = String(v || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
  return '#7C5CFF';
}
