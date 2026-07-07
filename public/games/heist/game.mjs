// ===== Heist — Controller (state machine) =====
// Estados: SPLASH → BETTING → PLAYING → (OPENING→SUCCESS|BUST | CASHOUT | MAXED) → RESOLVE → BETTING…
//
// Apertura animada: el dial de la caja se va llenando. Si la caja va a fallar,
// explota en un punto aleatorio de la animación (failPoint).

import { showSplash } from '../_shared/splash.mjs';
import { createRng, DEMO_SERVER_SEED } from '../_shared/rng.mjs';
import { createWallet } from '../_shared/wallet.mjs';
import {
  MAX_VAULTS,
  VAULT_TABLE,
  accumulatedMultiplier,
  openVault,
  resolvePayout,
  getTableState,
  vaultConfig,
  cashoutMultiplier,
} from './rules.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

// Duración base de la animación de apertura del dial (ms)
const DIAL_DURATION = 1300;

// ---------- Estado ----------
const wallet = createWallet({ startingBalance: 1000 });
let nonce = 1;
let currentBet = 0;
let openedCount = 0;     // cajas abiertas con éxito
let wins = [];           // multiplicadores ganados (array de números)
let stake = 0;
let rng = null;
let history = [];
let isAnimating = false; // bloquea clicks durante la animación

// ---------- DOM refs ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const balanceEl = $('#balance');
const vaultsGrid = $('#vaults-grid');
const currentMultEl = $('#current-mult');
const nextRangeEl = $('#next-range');
const inkChanceEl = $('#ink-chance');
const cashoutValueEl = $('#cashout-value');
const openedCountEl = $('#opened-count');
const lootEl = $('#loot');
const historyEl = $('#history');
const toast = $('#toast');

const phaseBet = $('#phase-bet');
const phasePlay = $('#phase-play');
const phaseResult = $('#phase-result');
const startBtn = $('#start-btn');
const betAmountEl = $('#bet-amount');
const openBtn = $('#open-btn');
const cashoutBtn = $('#cashout-btn');
const cashoutBtnValue = $('#cashout-btn-value');
const openBtnMult = $('#open-btn-mult');
const nextBtn = $('#next-btn');
const resultMsg = $('#result-msg');

// ---------- Wallet ----------
wallet.onChange((bal) => {
  balanceEl.textContent = `$${bal.toFixed(2)}`;
});

// ---------- Construir cajas ----------
// Las cajas NO muestran rango ni probabilidad. Solo el número y el dial vacío.
// El multiplicador se revela únicamente al abrir con éxito.
function buildVaults() {
  vaultsGrid.innerHTML = '';
  for (let i = 0; i < MAX_VAULTS; i++) {
    const box = document.createElement('div');
    box.className = 'box box--locked';
    box.dataset.idx = i;
    // 12 ticks cada 30°
    let ticks = '';
    for (let t = 0; t < 12; t++) {
      ticks += `<span style="transform:rotate(${t * 30}deg)"></span>`;
    }
    box.innerHTML = `
      <div class="box__dial">
        <svg class="box__dial-svg" viewBox="0 0 48 48" width="48" height="48">
          <circle class="box__dial-track" cx="24" cy="24" r="20" />
          <circle class="box__dial-progress" cx="24" cy="24" r="20" />
        </svg>
        <div class="box__dial-ticks">${ticks}</div>
        <div class="box__dial-needle"></div>
      </div>
      <span class="box__num">CAJA ${String(i + 1).padStart(2, '0')}</span>
      <span class="box__mult"></span>
      <span class="box__engrave">ZENYTHIC</span>
    `;
    vaultsGrid.appendChild(box);
  }
}

function resetVaultsToLocked() {
  $$('.box').forEach((b, i) => {
    b.className = 'box box--locked';
    b.style.transform = '';
    // resetea el progreso del dial y la aguja
    const prog = b.querySelector('.box__dial-progress');
    if (prog) {
      prog.style.strokeDashoffset = '';
      prog.style.transition = '';
    }
    const needle = b.querySelector('.box__dial-needle');
    if (needle) {
      needle.style.transition = '';
      needle.style.transform = 'rotate(0deg)';
    }
    const mult = b.querySelector('.box__mult');
    if (mult) mult.textContent = '';
  });
  // La primera caja se muestra como "lista" durante la apuesta
  if (vaultsGrid.children[0]) {
    vaultsGrid.children[0].classList.add('box--idle');
  }
}

function setNextBoxActive() {
  // marca las ya abiertas como opened
  for (let i = 0; i < openedCount; i++) {
    const b = vaultsGrid.children[i];
    b.className = 'box box--opened';
  }
  // marca la próxima como activa
  const next = vaultsGrid.children[openedCount];
  if (next) {
    next.className = 'box box--active';
  }
}

function markBoxSuccess(idx, mult) {
  const box = vaultsGrid.children[idx];
  if (!box) return;
  box.classList.remove('box--active', 'box--idle');
  box.classList.add('box--revealing');
  const multEl = box.querySelector('.box__mult');
  if (multEl) {
    multEl.textContent = `${mult}x`;
    // clase de tamaño/color según multiplicador
    multEl.classList.remove('box__mult--low', 'box__mult--mid', 'box__mult--high', 'box__mult--mega');
    if (mult > 15) multEl.classList.add('box__mult--mega');
    else if (mult > 5) multEl.classList.add('box__mult--high');
    else if (mult > 2) multEl.classList.add('box__mult--mid');
    else multEl.classList.add('box__mult--low');
    multEl.classList.remove('box__mult--pop');
    void multEl.offsetWidth; // reflow para reiniciar animación
    multEl.classList.add('box__mult--pop');
  }
  // marca el dial como completo (verde)
  const prog = box.querySelector('.box__dial-progress');
  if (prog) prog.style.strokeDashoffset = '0';
  // streak: a partir de 3 cajas abiertas, todas laten
  if (openedCount + 1 >= 3) {
    $$('.box--opened').forEach((b) => b.classList.add('box--streak'));
  }
  // profundidad de la stage: tensión creciente
  updateDepth();
}

// ---------- Profundidad de la stage (tensión ambiental) ----------
function updateDepth() {
  const stage = document.querySelector('.stage');
  if (!stage) return;
  if (openedCount >= 7) stage.dataset.depth = 'critical';
  else if (openedCount >= 4) stage.dataset.depth = 'deep';
  else stage.dataset.depth = 'normal';
}

function markBoxBusted(idx) {
  const box = vaultsGrid.children[idx];
  if (!box) return;
  box.classList.remove('box--active');
  box.classList.add('box--busted');
}

// ---------- Animación del dial ----------
// Devuelve una promesa que se resuelve con { success, result }.
// La animación dura DIAL_DURATION. Si la caja va a fallar, explota en failPoint
// (0..1) de la duración.
async function animateOpen(idx, failRoll, multRoll) {
  const box = vaultsGrid.children[idx];
  if (!box) return { success: false };

  const result = openVault(openedCount, wins, failRoll, multRoll);
  const dialDuration = result.success
    ? DIAL_DURATION
    : Math.max(250, result.failPoint * DIAL_DURATION);

  const progress = box.querySelector('.box__dial-progress');
  const needle = box.querySelector('.box__dial-needle');
  const trackLen = 2 * Math.PI * 20; // r=20

  // configura el círculo de progreso
  progress.style.strokeDasharray = trackLen;
  progress.style.strokeDashoffset = trackLen;
  // resetea la aguja a 0 sin transición antes de animar
  if (needle) {
    needle.style.transition = 'none';
    needle.style.transform = 'rotate(0deg)';
  }
  // fuerza reflow para que las transiciones arranquen limpias
  box.offsetWidth;

  // anima el trazo y la aguja con easing tenso
  const easing = 'cubic-bezier(0.5, 0, 0.75, 0)';
  progress.style.transition = `stroke-dashoffset ${dialDuration}ms ${easing}`;
  // aguja gira de 0° a (failPoint o 1) × 360°
  const needleEnd = (result.success ? 1 : result.failPoint) * 360;
  if (needle) {
    needle.style.transition = `transform ${dialDuration}ms ${easing}`;
    requestAnimationFrame(() => {
      needle.style.transform = `rotate(${needleEnd}deg)`;
    });
  }
  requestAnimationFrame(() => {
    progress.style.strokeDashoffset = result.success ? '0' : trackLen * (1 - result.failPoint);
  });

  box.classList.add('box--opening');

  // Si va a fallar: temblor creciente en el último 40% de la animación
  let shakeInterval = null;
  if (!result.success) {
    const shakeStart = dialDuration * 0.6;
    setTimeout(() => {
      let intensity = 0;
      shakeInterval = setInterval(() => {
        intensity = Math.min(intensity + 0.3, 3);
        const dx = (Math.random() - 0.5) * intensity * 2;
        const dy = (Math.random() - 0.5) * intensity * 2;
        box.style.transform = `translate(${dx}px, ${dy}px)`;
      }, 50);
    }, shakeStart);
  }

  await wait(dialDuration);
  if (shakeInterval) clearInterval(shakeInterval);
  box.style.transform = '';

  if (!result.success) {
    // explota en este punto
    box.classList.remove('box--opening');
    box.classList.add('box--exploding');
    await wait(400);
  } else {
    box.classList.remove('box--opening');
  }

  return result;
}

// ---------- Paneles ----------
// NO se revela información sobre rangos ni probabilidades.
function updatePanels() {
  const s = getTableState(openedCount, wins);
  currentMultEl.innerHTML = `${s.accumulated.toFixed(2)}<span>x</span>`;
  // color del multiplicador acumulado según tamaño
  currentMultEl.classList.remove('mult--low', 'mult--mid', 'mult--high', 'mult--mega');
  if (s.accumulated > 15) currentMultEl.classList.add('mult--mega');
  else if (s.accumulated > 5) currentMultEl.classList.add('mult--high');
  else if (s.accumulated > 2) currentMultEl.classList.add('mult--mid');
  else currentMultEl.classList.add('mult--low');

  openedCountEl.innerHTML = `${openedCount}<span>/${MAX_VAULTS}</span>`;

  const loot = stake ? (stake * s.accumulated) : 0;
  lootEl.textContent = `$${loot.toFixed(2)}`;
  cashoutValueEl.textContent = `$${loot.toFixed(2)}`;
  cashoutBtnValue.textContent = `$${loot.toFixed(2)}`;

  // Urgencia del cashout según multiplicador acumulado
  cashoutBtn.classList.remove('cashout--urgent', 'cashout--hot');
  if (s.accumulated >= 5) cashoutBtn.classList.add('cashout--hot');
  else if (s.accumulated >= 1.5) cashoutBtn.classList.add('cashout--urgent');
}

// ---------- Toast ----------
function showToast(msg, ms = 2000) {
  toast.textContent = msg;
  toast.classList.remove('toast--hidden');
  if (ms > 0) setTimeout(() => toast.classList.add('toast--hidden'), ms);
}

// ---------- Splash de tinta ----------
function inkSplashAt(x, y) {
  const splash = document.createElement('div');
  splash.className = 'ink-splash ink-splash--show';
  splash.style.setProperty('--x', `${x}px`);
  splash.style.setProperty('--y', `${y}px`);
  document.body.appendChild(splash);
  // esquirdas negras que saltan
  const shardCount = 10;
  for (let i = 0; i < shardCount; i++) {
    const shard = document.createElement('div');
    shard.className = 'ink-shard';
    shard.style.left = `${x}px`;
    shard.style.top = `${y}px`;
    const angle = (Math.PI * 2 * i) / shardCount + Math.random() * 0.5;
    const dist = 80 + Math.random() * 120;
    shard.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    shard.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
    shard.style.setProperty('--tr', `${Math.random() * 540}deg`);
    document.body.appendChild(shard);
    setTimeout(() => shard.remove(), 950);
  }
  setTimeout(() => splash.remove(), 1400);
}

// ---------- Confetti dorado del Gran Golpe ----------
function spawnConfetti(count = 60) {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < count; i++) {
    const c = document.createElement('span');
    c.style.left = `${Math.random() * 100}%`;
    c.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    c.style.animationDelay = `${Math.random() * 0.5}s`;
    c.style.background = Math.random() > 0.5 ? 'var(--gold-400)' : 'var(--gold-300)';
    c.style.width = `${6 + Math.random() * 6}px`;
    c.style.height = `${10 + Math.random() * 8}px`;
    layer.appendChild(c);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}

// ---------- Screen-flash ----------
function screenFlash(type) {
  const flash = document.createElement('div');
  flash.className = `flash-${type}`;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1000);
}

// ---------- Phases ----------
function showPhase(phase) {
  [phaseBet, phasePlay, phaseResult].forEach((p) =>
    p.classList.add('controls__phase--hidden')
  );
  phase.classList.remove('controls__phase--hidden');
}

function setControlsDisabled(disabled) {
  openBtn.disabled = disabled;
  cashoutBtn.disabled = disabled;
}

// ---------- BETTING ----------
function updateBetUI() {
  betAmountEl.textContent = `$${currentBet}`;
  startBtn.disabled = currentBet === 0 || !wallet.canBet(currentBet);
}

$$('.chip').forEach((btn) =>
  btn.addEventListener('click', () => {
    if (isAnimating) return;
    const chip = parseInt(btn.dataset.chip, 10);
    if (wallet.canBet(currentBet + chip)) {
      currentBet += chip;
      updateBetUI();
    } else {
      showToast('Saldo insuficiente', 1200);
    }
  })
);
$('#bet-clear').addEventListener('click', () => {
  if (isAnimating) return;
  currentBet = 0;
  updateBetUI();
});
startBtn.addEventListener('click', startHeist);

// ---------- Iniciar heist ----------
function startHeist() {
  if (!wallet.placeBet(currentBet)) return;
  stake = currentBet;
  openedCount = 0;
  wins = [];
  isAnimating = false;
  rng = createRng({
    serverSeed: DEMO_SERVER_SEED,
    clientSeed: 'heist-' + Date.now(),
    nonce: nonce++,
  });
  resetVaultsToLocked();
  updateDepth();
  setNextBoxActive();
  updatePanels();
  setControlsDisabled(false);
  showPhase(phasePlay);
  showToast('Golpe en marcha', 1500);
}

// ---------- Abrir siguiente caja ----------
async function openNext() {
  if (isAnimating || !rng) return;
  if (openedCount >= MAX_VAULTS) return;
  isAnimating = true;
  setControlsDisabled(true);

  // consume 2 valores del RNG
  const failRoll = await rng.next();
  const multRoll = await rng.next();

  const idx = openedCount;
  const result = await animateOpen(idx, failRoll, multRoll);

  if (!result.success) {
    // TINTA
    const box = vaultsGrid.children[idx];
    const rect = box?.getBoundingClientRect();
    if (rect) {
      inkSplashAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    markBoxBusted(idx);
    await wait(900);
    isAnimating = false;
    return endHeist(true);
  }

  // ÉXITO
  wins.push(result.multiplier);
  openedCount += 1;
  markBoxSuccess(idx, result.multiplier);
  updatePanels();
  showToast(`¡+${result.multiplier}x!`, 1100);
  // Esperar a que se vea el multiplicador antes de deslizar la caja
  await wait(isMobile() ? 1000 : 350);
  // Ahora deslizar: marca la caja como opened y activa la siguiente
  setNextBoxActive();

  // ¿Llegó al máximo?
  if (openedCount >= MAX_VAULTS) {
    showToast('¡GRAN GOLPE! 🎉', 2500);
    await wait(1300);
    isAnimating = false;
    return endHeist(false, true);
  }

  isAnimating = false;
  setControlsDisabled(false);
}
openBtn.addEventListener('click', openNext);

// ---------- Retirarse ----------
function cashout() {
  if (isAnimating) return;
  endHeist(false, false);
}
cashoutBtn.addEventListener('click', cashout);

// ---------- Fin de la heist ----------
function endHeist(busted, maxed = false) {
  const res = resolvePayout(stake, wins, busted);
  wallet.settle(stake, res.payout);

  history.unshift({
    multiplier: busted ? 0 : res.multiplier,
    payout: res.payout,
    busted,
    maxed,
    boxes: openedCount,
  });
  history = history.slice(0, 6);
  renderHistory();
  pushPlayerWin({ busted, boxes: openedCount, multiplier: res.multiplier, payout: res.payout });

  if (busted) {
    screenFlash('bust');
    resultMsg.textContent = `¡Tinta! Perdiste $${stake}. El golpe fracasó en la caja ${openedCount + 1}.`;
    resultMsg.className = 'result-msg result-msg--lose';
  } else if (maxed) {
    screenFlash('win');
    spawnConfetti();
    resultMsg.textContent = `¡GRAN GOLPE! Cobras $${res.payout} (${res.multiplier.toFixed(2)}x).`;
    resultMsg.className = 'result-msg result-msg--win';
  } else {
    resultMsg.textContent = `Te retiraste con $${res.payout} (${res.multiplier.toFixed(2)}x). ${res.net >= 0 ? '+' : ''}$${res.net}.`;
    resultMsg.className =
      res.net >= 0 ? 'result-msg result-msg--win' : 'result-msg result-msg--lose';
  }
  showPhase(phaseResult);
}

function renderHistory() {
  if (history.length === 0) {
    historyEl.innerHTML = '<li class="history__empty">Sin historial aún</li>';
    return;
  }
  historyEl.innerHTML = history
    .map((h) =>
      h.busted
        ? `<li class="history__bust"><span>CAJA ${h.boxes + 1} · TINTA</span><span>−$${stake}</span></li>`
        : `<li><span>${h.maxed ? 'GOLPE' : 'Retiro'} · ${h.boxes}</span><span class="history__mult">${h.multiplier.toFixed(2)}x</span></li>`
    )
    .join('');
}

// ---------- Otra ronda ----------
nextBtn.addEventListener('click', () => {
  openedCount = 0;
  wins = [];
  stake = 0;
  rng = null;
  currentBet = 0;
  resetVaultsToLocked();
  updateDepth();
  updatePanels();
  updateBetUI();
  showPhase(phaseBet);
});

// ---------- Modal de reglas + tabla ----------
function buildRulesTable() {
  const body = $('#rules-table-body');
  if (!body) return;
  body.innerHTML = '';
  for (let i = 0; i < MAX_VAULTS; i++) {
    const cfg = VAULT_TABLE[i];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${cfg.multMin}x – ${cfg.multMax}x</td>
      <td>${Math.round(cfg.failChance * 100)}%</td>
    `;
    body.appendChild(tr);
  }
}

const rulesModal = $('#rules-modal');
function openRules() {
  rulesModal.classList.remove('modal--hidden');
  rulesModal.setAttribute('aria-hidden', 'false');
}
function closeRules() {
  rulesModal.classList.add('modal--hidden');
  rulesModal.setAttribute('aria-hidden', 'true');
}
$('#rules-btn')?.addEventListener('click', openRules);
$$('#rules-modal [data-close]').forEach((el) =>
  el.addEventListener('click', closeRules)
);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !rulesModal.classList.contains('modal--hidden')) {
    closeRules();
  }
});

// ---------- Ticker de ganadores ----------
const tickerContent = $('#ticker-content');
const FAKE_NAMES = [
  'LadrónAnón', 'GhostVault', 'NeonBandit', 'SafeCracker', 'InkRunner',
  'GoldRush', 'NightFox', 'ShadowHeist', 'QuickHand', 'BrassKnuckles',
  'SilentBob', 'AceThief', 'IronMask', 'VelvetGlove', 'BlackJackal',
  'MidnightOwl', 'RustyKey', 'CrimsonGhost', 'SilverTongue', 'BrickWall',
];
const FAKE_BETS = [5, 10, 25, 50, 100, 200, 500];

function genFakeWin() {
  const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
  const box = 1 + Math.floor(Math.random() * 10);
  const bet = FAKE_BETS[Math.floor(Math.random() * FAKE_BETS.length)];
  // multiplicador plausible según caja
  const cfg = vaultConfig(box - 1);
  const mult = +(cfg.multMin + Math.random() * (cfg.multMax - cfg.multMin)).toFixed(2);
  const payout = +(bet * mult).toFixed(2);
  return { name, box, mult, payout, busted: Math.random() < 0.3 };
}

function tickerItemHTML(w) {
  if (w.busted) {
    return `<span class="ticker__item">
      <span class="t-name">${w.name}</span>
      <span class="t-box">CAJA ${w.box}</span>
      <span class="t-bust">TINTA −$${w.payout}</span>
    </span>`;
  }
  return `<span class="ticker__item">
    <span class="t-name">${w.name}</span>
    <span class="t-box">CAJA ${w.box}</span>
    <span class="t-win">+${w.mult}x · $${w.payout}</span>
  </span>`;
}

function buildTickerSeed(count = 14) {
  const items = [];
  for (let i = 0; i < count; i++) items.push(tickerItemHTML(genFakeWin()));
  // duplicar para loop infinito
  tickerContent.innerHTML = items.join('') + items.join('');
}

// Añade una victoria real del jugador al ticker
function pushPlayerWin(result) {
  const item = document.createElement('span');
  item.className = 'ticker__item ticker__item--me';
  if (result.busted) {
    item.innerHTML = `
      <span class="t-name">TÚ</span>
      <span class="t-box">CAJA ${result.boxes + 1}</span>
      <span class="t-bust">TINTA −$${stake}</span>
    `;
  } else {
    item.innerHTML = `
      <span class="t-name">TÚ</span>
      <span class="t-box">CAJA ${result.boxes}</span>
      <span class="t-win">+${result.multiplier.toFixed(2)}x · $${result.payout}</span>
    `;
  }
  // inserta al principio del contenido
  tickerContent.insertBefore(item, tickerContent.firstChild);
  // limita para no crecer indefinidamente
  while (tickerContent.children.length > 60) {
    tickerContent.removeChild(tickerContent.lastChild);
  }
}

// Refresca el ticker periódicamente con victorias falsas
setInterval(() => {
  const item = document.createElement('span');
  item.className = 'ticker__item';
  item.innerHTML = tickerItemHTML(genFakeWin());
  tickerContent.insertBefore(item, tickerContent.firstChild);
  while (tickerContent.children.length > 60) {
    tickerContent.removeChild(tickerContent.lastChild);
  }
}, 4500);

// ---------- Init ----------
(async function init() {
  buildVaults();
  buildRulesTable();
  buildTickerSeed();
  await showSplash({ durationMs: 2200, title: 'HEIST' });
  resetVaultsToLocked();
  updateDepth();
  updatePanels();
  updateBetUI();
  showPhase(phaseBet);
})();
