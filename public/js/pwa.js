/**
 * PWA：Service Worker 注册 + 安装到主屏幕
 */

let deferredPrompt = null;

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isInstallable() {
  return isStandalone() ? false : !!deferredPrompt || isIOS();
}

/** 弹出安装提示；已经被安装或浏览器不支持时返回 false */
export async function installPWA() {
  if (isStandalone()) return false;
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  }
  return false;
}

/** 注册 Service Worker（离线可用） */
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // 本地 http（非 localhost）也能跑，但只在安全上下文注册
  const secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              // 有新版本，刷新即可生效
              window.dispatchEvent(new CustomEvent('sw-updated'));
            }
          });
        });
      })
      .catch(() => {
        /* 注册失败不影响使用 */
      });
  });

  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    // 首次接管时不刷新，避免打断用户
  });
}

/** 监听浏览器的安装条件，供 UI 判断是否显示入口 */
export function watchInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa-installable'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
}
