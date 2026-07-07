// ===== Zenythic — Splash de carga =====
// Overlay full-screen con el logo Zenythic + barra de progreso dorada.
// Uso: import { showSplash } from './_shared/splash.mjs'; await showSplash({ durationMs: 2200 });

export function showSplash({ durationMs = 2200, title = 'ZENYTHIC' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'zy-splash';
    overlay.innerHTML = `
      <div class="zy-splash__inner">
        <svg class="zy-splash__mark" viewBox="0 0 48 48" width="72" height="72" aria-hidden="true">
          <path class="zy-splash__z" d="M10 12 H38 L14 36 H38" fill="none" stroke="#C9A961"
                stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"
                pathLength="100" />
        </svg>
        <div class="zy-splash__wordmark">${title}</div>
        <div class="zy-splash__bar"><span class="zy-splash__fill"></span></div>
        <div class="zy-splash__hint">Cargando…</div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Forzar reflow para que las transiciones arranquen
    overlay.offsetWidth;

    const fill = overlay.querySelector('.zy-splash__fill');
    fill.style.transition = `width ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    requestAnimationFrame(() => {
      fill.style.width = '100%';
    });

    setTimeout(() => {
      overlay.classList.add('zy-splash--leaving');
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 450);
    }, durationMs);
  });
}
