/**
 * 视图：模型 —— 本地 .gguf（llama.cpp / Ollama / LM Studio）与云端大模型 API
 */
import { icon } from '../icons.js';
import { api } from '../api.js';
import { field, column, showDialog, confirmDialog, toast, showMenu, copyText } from '../ui.js';

export function renderModels(mount, ctx) {
  const { state } = ctx;

  const page = document.createElement('div');
  page.className = 'page';
  page.style.maxWidth = '960px';

  /* ---------- 说明 ---------- */
  const intro = document.createElement('div');
  intro.className = 'card card--filled';
  intro.style.margin = '4px 0 16px';
  intro.innerHTML = `
    <div class="row" style="align-items:flex-start;gap:12px">
      ${icon('bolt', { size: 22 })}
      <div class="grow">
        <b style="font:var(--title-s)">一个地址搞定所有模型</b>
        <p class="muted" style="font:var(--body-s);margin:6px 0 0;line-height:1.6">
          本地 .gguf 用 llama.cpp 起一个本地服务，云端大模型填官方地址，它们都是
          OpenAI 兼容协议，这里统一用「API 地址 + 密钥 + 模型名」三个字段接入。
        </p>
      </div>
    </div>
  `;
  page.appendChild(intro);

  /* ---------- 模型源列表 ---------- */
  const listTitle = document.createElement('div');
  listTitle.className = 'section-title';
  listTitle.innerHTML = `${icon('chip', { size: 18 })}<span>模型源（${state.models.length}）</span>`;
  page.appendChild(listTitle);

  const list = document.createElement('div');
  list.className = 'stack';
  list.style.gap = '10px';
  page.appendChild(list);

  if (!state.models.length) {
    const empty = document.createElement('div');
    empty.className = 'card card--outlined';
    empty.innerHTML = `<p class="muted" style="margin:0;font:var(--body-m)">还没有模型源。添加后才能和智能体聊天～</p>`;
    list.appendChild(empty);
  } else {
    state.models.forEach((m) => list.appendChild(modelRow(m, ctx)));
  }

  /* ---------- 本地 GGUF ---------- */
  const ggufTitle = document.createElement('div');
  ggufTitle.className = 'section-title';
  ggufTitle.innerHTML = `${icon('hardDrive', { size: 18 })}<span>本地 .gguf 模型</span>`;
  page.appendChild(ggufTitle);

  const ggufCard = document.createElement('div');
  ggufCard.className = 'card card--outlined';
  ggufCard.innerHTML = `
    <p class="muted" style="font:var(--body-s);margin:0 0 12px;line-height:1.6">
      扫描本机目录里的 <code class="mono">.gguf</code> 文件，一键生成 llama.cpp 启动命令；
      服务跑起来后，再把它登记成模型源就能在对话里使用。
    </p>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
      <label class="field grow">
        <span class="field__label">扫描目录（多个用英文逗号分隔）</span>
        <input class="field__input" data-role="dirs" value="${escapeAttr((state.settings.ggufDirs || []).join(','))}" />
      </label>
      <button class="btn btn--tonal" data-act="scan">${icon('search', { size: 18 })}<span>扫描</span></button>
    </div>
    <div data-role="result" style="margin-top:12px"></div>
  `;
  page.appendChild(ggufCard);

  const dirsInput = ggufCard.querySelector('[data-role="dirs"]');
  const resultEl = ggufCard.querySelector('[data-role="result"]');
  ggufCard.querySelector('[data-act="scan"]').onclick = async () => {
    const dirs = dirsInput.value.split(',').map((s) => s.trim()).filter(Boolean);
    await api.updateSettings({ ggufDirs: dirs });
    resultEl.innerHTML = `<p class="muted" style="font:var(--body-s)">扫描中…</p>`;
    try {
      const { files } = await api.scanGGUF(dirs);
      if (!files.length) {
        resultEl.innerHTML = `<p class="muted" style="font:var(--body-s);margin:0">没有找到 .gguf 文件。确认目录是否正确，或把模型文件放进去再试。</p>`;
        return;
      }
      resultEl.innerHTML = '';
      files.forEach((f) => resultEl.appendChild(ggufRow(f, ctx)));
    } catch (err) {
      resultEl.innerHTML = `<p style="color:var(--error);font:var(--body-s);margin:0">${escapeHtml(err.message)}</p>`;
    }
  };

  /* ---------- 上手指南 ---------- */
  const guide = document.createElement('details');
  guide.className = 'card card--outlined';
  guide.style.marginTop = '16px';
  guide.innerHTML = `
    <summary style="cursor:pointer;font:var(--title-s)">本地 GGUF 快速上手</summary>
    <div class="md" style="margin-top:12px;font:var(--body-m);line-height:1.7">
      <ol>
        <li>安装 <b>llama.cpp</b>：macOS 用 <code class="mono">brew install llama.cpp</code>，Windows 用 <code class="mono">winget install llama.cpp</code>，也可以去 GitHub Releases 下载预编译包。</li>
        <li>把 <code class="mono">.gguf</code> 模型文件放到任意目录（例如 <code class="mono">~/models</code>）。</li>
        <li>在上面扫描到模型后，点「生成启动命令」并复制执行，本地服务默认监听 <code class="mono">127.0.0.1:8080</code>。</li>
        <li>回到顶部添加模型源，类型选「本地模型 · llama.cpp」，地址填 <code class="mono">http://127.0.0.1:8080/v1</code>，测试连接通过后即可开聊。</li>
      </ol>
      <p class="muted" style="font:var(--body-s)">显存不足时把 <code class="mono">-ngl</code>（GPU 层数）调小或设为 0 纯 CPU 运行；上下文 <code class="mono">-c</code> 越大占用内存越多。</p>
    </div>
  `;
  page.appendChild(guide);

  mount.appendChild(page);

  /* ---------- FAB ---------- */
  const fab = document.createElement('button');
  fab.className = 'fab fab--dock fab--extended';
  fab.innerHTML = `${icon('plus', { size: 24 })}<span>添加模型源</span>`;
  fab.onclick = (e) => openModelForm(null, ctx, { anchor: e.currentTarget });
  mount.appendChild(fab);
}

function modelRow(model, ctx) {
  const preset = ctx.state.presets?.find((p) => p.type === model.type);
  const row = document.createElement('div');
  row.className = 'card card--outlined model-row';
  row.innerHTML = `
    <div class="model-row__icon">${icon(preset?.icon || 'cloud', { size: 22 })}</div>
    <div class="grow" style="min-width:0">
      <p class="model-row__name">${escapeHtml(model.name)} <span class="dot ${model.enabled ? 'dot--on' : 'dot--off'}" title="${
    model.enabled ? '已启用' : '已停用'
  }"></span></p>
      <p class="model-row__url">${escapeHtml(model.baseURL)}</p>
      <p class="muted" style="font:var(--body-s);margin:2px 0 0">模型：<code class="mono">${escapeHtml(
        model.model || '（未指定）'
      )}</code> · 上下文 ${model.contextLength}</p>
    </div>
    <button class="icon-btn" data-act="more" title="更多">${icon('more', { size: 20 })}</button>
  `;

  row.querySelector('[data-act="more"]').onclick = (e) =>
    showMenu(e.currentTarget, [
      { label: '测试连接', iconName: 'wifi', value: 'test' },
      { label: '拉取模型列表', iconName: 'refresh', value: 'list' },
      { label: '编辑', iconName: 'edit', value: 'edit' },
      { label: model.enabled ? '停用' : '启用', iconName: 'eye', value: 'toggle' },
      { divider: true },
      { label: '删除', iconName: 'trash', value: 'del', danger: true },
    ]).then(async (v) => {
      if (!v) return;
      if (v === 'test') {
        toast('正在测试连接…');
        const r = await api.testModel(model.id);
        toast(`${r.ok ? '✅' : '❌'} ${r.message}（${r.latencyMs} ms）`, { duration: 6000 });
      }
      if (v === 'list') {
        try {
          const { models } = await api.listRemoteModels(model.id);
          if (!models.length) return toast('这个服务没有返回模型列表');
          const picked = await showMenu(e.currentTarget, models.slice(0, 40).map((m) => ({ label: m, iconName: 'chip', value: m })));
          if (picked) {
            await api.updateModel(model.id, { model: picked });
            toast(`已切换为 ${picked}`);
            await ctx.reload();
          }
        } catch (err) {
          toast(err.message || '拉取失败');
        }
      }
      if (v === 'edit') await openModelForm(model, ctx);
      if (v === 'toggle') {
        await api.updateModel(model.id, { enabled: !model.enabled });
        await ctx.reload();
      }
      if (v === 'del') {
        const yes = await confirmDialog({
          title: `删除「${model.name}」？`,
          message: '绑定了它的智能体会回到「跟随默认模型」。',
          confirmText: '删除',
          danger: true,
        });
        if (!yes) return;
        await api.deleteModel(model.id);
        toast('已删除');
        await ctx.reload();
      }
    });

  return row;
}

function ggufRow(file, ctx) {
  const el = document.createElement('div');
  el.className = 'gguf-item';
  el.innerHTML = `
    <div class="grow" style="min-width:0">
      <p style="margin:0;font:var(--title-s);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(file.name)}</p>
      <p class="muted" style="margin:2px 0 0;font:var(--body-s)">
        ${file.sizeText}${file.params ? ` · ${escapeHtml(file.params)}` : ''}${file.quant ? ` · ${escapeHtml(file.quant)}` : ''}${
    file.family ? ` · ${escapeHtml(file.family)}` : ''
  }
      </p>
      <p class="muted mono" style="margin:2px 0 0;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(
        file.path
      )}</p>
    </div>
    <button class="btn btn--tonal btn--sm" data-act="cmd">${icon('terminal', { size: 16 })}<span>启动命令</span></button>
  `;
  el.querySelector('[data-act="cmd"]').onclick = () => showCommand(file, ctx);
  return el;
}

async function showCommand(file, ctx) {
  const fPort = field({ label: '端口', value: '8080', type: 'number', mono: true });
  const fCtx = field({ label: '上下文长度 -c', value: '4096', type: 'number', mono: true });
  const fGpu = field({ label: 'GPU 层数 -ngl（0 = 纯 CPU）', value: '0', type: 'number', mono: true });
  const fBin = field({ label: '可执行文件名', value: 'llama-server', mono: true });

  const out = document.createElement('div');
  const render = async () => {
    const { command, baseURL } = await api.ggufCommand({
      ggufPath: file.path,
      port: Number(fPort.get()) || 8080,
      ctx: Number(fCtx.get()) || 4096,
      gpuLayers: Number(fGpu.get()) || 0,
      binary: fBin.get() || 'llama-server',
    });
    out.innerHTML = `
      <p class="muted" style="font:var(--body-s);margin:12px 0 0">在终端执行：</p>
      <pre class="cmd">${escapeHtml(command)}</pre>
      <div class="row row--wrap" style="margin-top:12px">
        <button class="btn btn--tonal btn--sm" data-act="copy">${icon('copy', { size: 16 })}<span>复制命令</span></button>
        <button class="btn btn--filled btn--sm" data-act="register">${icon('plus', { size: 16 })}<span>登记为模型源</span></button>
      </div>
      <p class="muted" style="font:var(--body-s);margin:10px 0 0">服务启动后地址是 <code class="mono">${escapeHtml(baseURL)}</code></p>
    `;
    out.querySelector('[data-act="copy"]').onclick = () => copyText(command);
    out.querySelector('[data-act="register"]').onclick = async () => {
      await api.createModel({
        name: file.name.replace(/\.gguf$/i, '').slice(0, 40),
        type: 'llamacpp',
        baseURL,
        apiKey: '',
        model: 'local-model',
        ggufPath: file.path,
        contextLength: Number(fCtx.get()) || 4096,
      });
      toast('已登记，记得先启动本地服务');
      await ctx.reload();
      document.querySelector('.dialog__actions .btn--text')?.click();
    };
  };

  [fPort, fCtx, fGpu, fBin].forEach((f) => f.input.addEventListener('change', render));
  await render();

  await showDialog({
    title: '启动命令',
    support: `模型：${file.name}`,
    iconName: 'terminal',
    content: column([fPort, fCtx, fGpu, fBin, out], { gap: '10px' }),
    actions: [{ label: '关闭', value: null, variant: 'text' }],
  });
}

/* ------------------------------------------------------------------ */
/* 添加 / 编辑模型源                                                    */
/* ------------------------------------------------------------------ */

export async function openModelForm(existing, ctx, { anchor } = {}) {
  let preset = null;

  if (!existing) {
    const presets = ctx.state.presets || [];
    const picked = await showMenu(
      anchor || document.body,
      presets.map((p) => ({ label: p.label, iconName: p.icon, value: p.type }))
    );
    if (!picked) return null;
    preset = presets.find((p) => p.type === picked);
  } else {
    preset = (ctx.state.presets || []).find((p) => p.type === existing.type) || { type: existing.type, label: '自定义' };
  }

  const fName = field({ label: '名称', value: existing?.name || preset?.label || '', support: '只是显示用，随便起' });
  const fBase = field({
    label: 'API 地址',
    value: existing?.baseURL || preset?.baseURL || '',
    mono: true,
    support: preset?.desc || '例如 http://127.0.0.1:8080/v1',
  });
  const fKey = field({
    label: 'API Key（本地服务可留空）',
    value: existing?.apiKey || preset?.apiKey || '',
    mono: true,
    type: 'password',
  });
  const fModel = field({
    label: '模型名称',
    value: existing?.model || preset?.model || '',
    mono: true,
    support: '不清楚就点「测试连接」，会列出可用模型',
  });
  const fCtx = field({ label: '上下文长度', value: existing?.contextLength || 4096, type: 'number', mono: true });

  const status = document.createElement('p');
  status.className = 'muted';
  status.style.cssText = 'font:var(--body-s);margin:0;min-height:18px';

  const body = column([fName, fBase, fKey, fModel, fCtx, status], { gap: '12px' });

  const result = await showDialog({
    title: existing ? '编辑模型源' : `添加：${preset?.label || '模型源'}`,
    iconName: preset?.icon || 'cloud',
    content: body,
    actions: [
      { label: '取消', value: null, variant: 'text' },
      {
        label: '测试连接',
        value: '__test',
        variant: 'outlined',
        keepOpen: true,
        onClick: async () => {
          status.textContent = '正在连接…';
          const r = await api.testProbe({ baseURL: fBase.get(), apiKey: fKey.get(), model: fModel.get() });
          status.textContent = `${r.ok ? '✅' : '❌'} ${r.message}（${r.latencyMs} ms）`;
          if (r.ok && r.models?.length && !fModel.get().trim()) {
            fModel.set(r.models[0]);
            status.textContent += ` · 已自动填入模型 ${r.models[0]}`;
          }
          return false;
        },
      },
      {
        label: existing ? '保存' : '添加',
        value: 'save',
        variant: 'filled',
        onClick: () => {
          if (!fName.get().trim()) {
            toast('请填写名称');
            fName.focus();
            return false;
          }
          if (!fBase.get().trim()) {
            toast('请填写 API 地址');
            fBase.focus();
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
    type: preset?.type || existing?.type || 'custom',
    baseURL: fBase.get().trim(),
    apiKey: fKey.get().trim(),
    model: fModel.get().trim(),
    contextLength: Number(fCtx.get()) || 4096,
  };

  try {
    if (existing) await api.updateModel(existing.id, payload);
    else await api.createModel(payload);
    toast(existing ? '已保存' : '模型源已添加');
    await ctx.reload();
  } catch (err) {
    toast(err.message || '保存失败');
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
