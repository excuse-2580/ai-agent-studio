/**
 * 主题：明暗切换 + 动态取色（Material You 风格）
 * 主色由种子色推导出色相/饱和度，交给 CSS 变量生成整套 tonal palette
 */

const PRESET_SEEDS = [
  '#7C5CFF', // 紫（默认）
  '#00A39B', // 青
  '#E8710A', // 橙
  '#D6336C', // 玫红
  '#2E7D32', // 绿
  '#1565C0', // 蓝
  '#C2185B', // 洋红
  '#8D6E63', // 棕
];

export { PRESET_SEEDS };

let media = null;

export function applyTheme(settings) {
  const root = document.documentElement;

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;
  root.dataset.theme = theme;

  const { h, s } = hexToHsl(settings.seedColor || '#7C5CFF');
  root.style.setProperty('--seed-h', String(Math.round(h)));
  root.style.setProperty('--seed-s', `${Math.max(38, Math.min(100, Math.round(s)))}%`);

  const scale = Number(settings.fontScale) || 1;
  document.body.style.zoom = scale === 1 ? '' : String(scale);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#141218' : '#fef7ff');
}

export function watchSystemTheme(onChange) {
  media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => onChange?.(media.matches ? 'dark' : 'light');
  media.addEventListener?.('change', handler);
  return () => media.removeEventListener?.('change', handler);
}

/** #RRGGBB -> { h, s, l } */
export function hexToHsl(hex) {
  let str = String(hex || '').trim().replace('#', '');
  if (str.length === 3) str = str.split('').map((c) => c + c).join('');
  if (str.length !== 6 || /[^0-9a-f]/i.test(str)) str = '7C5CFF';
  const r = parseInt(str.slice(0, 2), 16) / 255;
  const g = parseInt(str.slice(2, 4), 16) / 255;
  const b = parseInt(str.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** 智能体头像底色：从 hex 生成柔和容器色 */
export function tintFromHex(hex, { dark = true, alpha = 0.22 } = {}) {
  const { h, s } = hexToHsl(hex);
  return `hsl(${Math.round(h)} ${Math.max(30, Math.min(90, s))}% ${dark ? 32 : 90}%)`;
}

export function isDark() {
  return document.documentElement.dataset.theme !== 'light';
}
