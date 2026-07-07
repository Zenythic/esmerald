// ===== Zenythic — Bloqueo de landscape =====
// Detecta orientación landscape en móvil y bloquea el juego.
// Si por alguna razón se salta el overlay, elimina el contenido del juego.

export function initRotateLock() {
  // No bloquear en pantallas grandes (desktop / tablets grandes)
  function isMobileLandscape() {
    return (
      window.matchMedia('(orientation: landscape)').matches &&
      window.matchMedia('(max-width: 920px)').matches &&
      window.matchMedia('(max-height: 540px)').matches
    );
  }

  // Crea el overlay si no existe
  let lock = document.querySelector('.zy-rotate-lock');
  if (!lock) {
    lock = document.createElement('div');
    lock.className = 'zy-rotate-lock';
    lock.setAttribute('aria-hidden', 'true');
    lock.innerHTML = `
      <div class="zy-rotate-lock__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="#C9A961" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="2" width="10" height="20" rx="1.5"/>
          <line x1="11" y1="18" x2="13" y2="18"/>
          <path d="M21 12h-4M21 12l-1.5-1.5M21 12l-1.5 1.5"
                opacity="0.6" transform="translate(-2,0)"/>
        </svg>
      </div>
      <div>
        <div class="zy-rotate-lock__title">Gira tu dispositivo</div>
        <div class="zy-rotate-lock__text">
          Este juego se juega en vertical. Rota tu teléfono para continuar.
        </div>
      </div>
    `;
    document.body.appendChild(lock);
  }

  function apply() {
    if (isMobileLandscape()) {
      lock.classList.add('is-visible');
      lock.setAttribute('aria-hidden', 'false');
      // Elimina el contenido del juego tras un breve delay si sigue en landscape
      // (medida drástica de respaldo por si el overlay se salta)
      const stage = document.querySelector('.stage, .table');
      if (stage) {
        stage.style.visibility = 'hidden';
        stage.style.pointerEvents = 'none';
      }
    } else {
      lock.classList.remove('is-visible');
      lock.setAttribute('aria-hidden', 'true');
      const stage = document.querySelector('.stage, .table');
      if (stage) {
        stage.style.visibility = '';
        stage.style.pointerEvents = '';
      }
    }
  }

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 200));
}
