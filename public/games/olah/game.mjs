// ===== Olah — Controller (state machine) =====
// Estados: SPLASH → BETTING → CLIMBING → (STOP | SINK | MAXED) → RESOLVE → BETTING…
//
// Side-scroller: el barco FORTUNA navega mientras la imagen de la ola (olas.png)
// "rueda" de derecha a izquierda en bucle como fondo. Las olas son obstáculos que
// el barco TREPA en automático; cada ola coronada eleva el multiplicador (crash
// continuo). El jugador pulsa "Detener" cuando quiera; si el multiplicador en vivo
// alcanza el umbral de hundimiento, el barco se hunde (bust).
//
// Assets (sprites): fondo.png (estático, cover) + olas.png (rodando en bucle) +
// barco.png (sprite del barco). La capa .wave-obstacle es un montículo local bajo
// el barco que escala con el tamaño de la ola actual.

import { showSplash } from '../_shared/splash.mjs';
import { createRng, DEMO_SERVER_SEED } from '../_shared/rng.mjs';
import { createWallet } from '../_shared/wallet.mjs';
import {
  MAX_MULT,
  rollCrashThreshold,
  rollWaveSize,
  isSinking,
  liveMultiplier,
  resolveCashout,
  resolveSink,
  resolveMaxed,
  waveSizesTable,
} from './rules.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Estado ----------
const wallet = createWallet({ startingBalance: 1000 });
let nonce = 1;
let currentBet = 0;
let stake = 0;
let rng = null;

let crashThreshold = MAX_MULT;   // umbral de hundimiento de la ronda
let prevCrestMult = 1;           // multiplicador al coronar la ola anterior
let crestedCount = 0;            // olas coronadas
let currentWave = null;          // { key, label, step, climbMs }
let nextWave = null;             // tamaño de la próxima ola (pre-cargado)
let climbStart = 0;              // performance.now() del inicio de la ola actual
let liveMult = 1;                // multiplicador en vivo
let running = false;             // ¿está el bucle de remonte activo?
let rafId = 0;
let lastFrame = 0;
let history = [];

// Inclinación máxima del barco al trepar, según el tamaño de la ola.
const TILT_BY_SIZE = { small: 8, medium: 14, large: 20, huge: 28 };

// ---------- DOM refs ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const balanceEl = $('#balance');
const stage = document.querySelector('.stage');
const boat = $('#boat');
const waveObstacle = $('#wave-obstacle');
const waveInfoSize = $('#wave-info-size');
const multFill = $('#mult-fill');
const multPlate = $('#mult-plate');
const plateMult = $('#plate-mult');
const currentMultEl = $('#current-mult');
const cashoutValueEl = $('#cashout-value');
const crestedCountEl = $('#crested-count');
const historyEl = $('#history');
const toast = $('#toast');

const phaseBet = $('#phase-bet');
const phasePlay = $('#phase-play');
const phaseResult = $('#phase-result');
const startBtn = $('#start-btn');
const betAmountEl = $('#bet-amount');
const stopBtn = $('#stop-btn');
const stopValue = $('#stop-value');
const nextBtn = $('#next-btn');
const resultMsg = $('#result-msg');

// ---------- Wallet ----------
wallet.onChange((bal) => {
  balanceEl.textContent = `$${bal.toFixed(2)}`;
});

// ---------- Helpers de visualización ----------
function pct01(mult) {
  return Math.max(0, Math.min(1, (mult - 1) / (MAX_MULT - 1)));
}
function fmtMult(m) {
  return `${(Math.round(m * 100) / 100).toFixed(2)}x`;
}
function applyMultClass(m) {
  currentMultEl.classList.remove('mult--low', 'mult--mid', 'mult--high', 'mult--mega');
  if (m > 15) currentMultEl.classList.add('mult--mega');
  else if (m > 5) currentMultEl.classList.add('mult--high');
  else if (m > 2) currentMultEl.classList.add('mult--mid');
  else currentMultEl.classList.add('mult--low');
}
function applyStopUrgency(m) {
  stopBtn.classList.remove('stop--urgent', 'stop--hot');
  if (m >= 5) stopBtn.classList.add('stop--hot');
  else if (m >= 1.5) stopBtn.classList.add('stop--urgent');
}
function applyDepth(crested) {
  if (crested >= 7) stage.dataset.depth = 'critical';
  else if (crested >= 4) stage.dataset.depth = 'deep';
  else stage.dataset.depth = 'normal';
}

function renderLiveMult(m) {
  liveMult = m;
  const p = pct01(m);
  multFill.style.height = `${p * 100}%`;
  multPlate.style.bottom = `${p * 100}%`;
  plateMult.textContent = fmtMult(m);
  currentMultEl.innerHTML = `${(Math.round(m * 100) / 100).toFixed(2)}<span>x</span>`;
  applyMultClass(m);
  const loot = stake ? stake * m : 0;
  cashoutValueEl.textContent = `$${loot.toFixed(2)}`;
  stopValue.textContent = `$${loot.toFixed(2)}`;
  applyStopUrgency(m);
}

function applyWaveSize(wave) {
  waveObstacle.classList.remove('size--small', 'size--medium', 'size--large', 'size--huge');
  waveObstacle.classList.add(`size--${wave.key}`);
  waveInfoSize.textContent = wave.label.toUpperCase();
  waveInfoSize.className = `wave-info__size size--${wave.key}`;
}

// Posiciona el barco según el progreso del remonte de la ola actual.
function tiltBoat(progress, wave) {
  const max = TILT_BY_SIZE[wave.key] ?? 12;
  const deg = -max * progress;                       // se echa atrás al subir
  const lift = (waveObstacle.offsetHeight || 60) * 0.55 * progress;
  boat.style.setProperty('--tilt', `${deg}deg`);
  boat.style.setProperty('--lift', `${lift}px`);
  boat.style.transform = `translateX(-50%) translateY(${-lift}px) rotate(${deg}deg)`;
}

// Pausa/reanuda el rodaje de la ola (animación CSS) según el estado del juego.
function setWavesRolling(active) {
  stage.classList.toggle('is-stopped', !active);
}

// ---------- Toast ----------
function showToast(msg, ms = 2000) {
  toast.textContent = msg;
  toast.classList.remove('toast--hidden');
  if (ms > 0) setTimeout(() => toast.classList.add('toast--hidden'), ms);
}

// ---------- Screen-flash / confetti ----------
function screenFlash(type) {
  const flash = document.createElement('div');
  flash.className = `flash-${type}`;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1000);
}
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

// ---------- Phases ----------
function showPhase(phase) {
  [phaseBet, phasePlay, phaseResult].forEach((p) =>
    p.classList.add('controls__phase--hidden')
  );
  phase.classList.remove('controls__phase--hidden');
}

// ---------- Buffer de la próxima ola ----------
// rng.next() es async, pero tick es un callback síncrono del rAF. Precargamos el
// tamaño de la SIGUIENTE ola nada más empezar la actual. Las olas duran >1s y el
// RNG resuelve en microsegundos, así que nextWave siempre estará listo al coronar.
function preloadNextWave() {
  if (!rng) return;
  rng.next().then((v) => {
    nextWave = rollWaveSize(v);
  });
}

// ---------- BETTING ----------
function updateBetUI() {
  betAmountEl.textContent = `$${currentBet}`;
  startBtn.disabled = currentBet === 0 || !wallet.canBet(currentBet);
}

$$('.chip').forEach((btn) =>
  btn.addEventListener('click', () => {
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
  currentBet = 0;
  updateBetUI();
});
startBtn.addEventListener('click', startVoyage);

// ---------- Iniciar travesía ----------
async function startVoyage() {
  if (!wallet.placeBet(currentBet)) return;
  stake = currentBet;
  crestedCount = 0;
  prevCrestMult = 1;
  liveMult = 1;
  rng = createRng({
    serverSeed: DEMO_SERVER_SEED,
    clientSeed: 'olah-' + Date.now(),
    nonce: nonce++,
  });

  // Samplea el umbral de hundimiento y el tamaño de la primera ola (2 consumos).
  crashThreshold = rollCrashThreshold(await rng.next());
  currentWave = rollWaveSize(await rng.next());
  preloadNextWave();

  // Reset visual
  boat.classList.remove('boat--sinking');
  waveObstacle.classList.remove('is-breaking');
  boat.style.transform = 'translateX(-50%) translateY(0) rotate(0deg)';
  applyDepth(0);
  applyWaveSize(currentWave);
  waveObstacle.classList.add('is-active');
  renderLiveMult(1);
  crestedCountEl.textContent = '0';
  setWavesRolling(true);
  showPhase(phasePlay);
  showToast('¡Zarpando!', 1200);

  // Arranque del remonte
  running = true;
  climbStart = performance.now();
  lastFrame = climbStart;
  rafId = requestAnimationFrame(tick);
}

// ---------- Bucle de remonte (rAF) ----------
function tick(now) {
  if (!running) return;

  const dt = Math.min(50, now - lastFrame);          // delta de tiempo (ms), capado
  lastFrame = now;

  const elapsed = now - climbStart;
  const progress = elapsed / currentWave.climbMs;

  // Multiplicador en vivo durante esta ola (capado en la cresta).
  const pCap = Math.min(progress, 1);
  const m = liveMultiplier(prevCrestMult, currentWave.step, pCap);

  // ¿Hundimiento? El multiplicador en vivo alcanzó el umbral.
  if (isSinking(m, crashThreshold)) {
    renderLiveMult(m);
    tiltBoat(pCap, currentWave);
    return sink(m);
  }

  // ¿Coronó la ola?
  if (progress >= 1) {
    prevCrestMult = prevCrestMult + currentWave.step;
    crestedCount += 1;
    crestedCountEl.textContent = String(crestedCount);
    applyDepth(crestedCount);
    boat.classList.remove('boat--crest');
    void boat.offsetWidth;
    boat.classList.add('boat--crest');

    // ¿Gran ola (50x)?
    if (prevCrestMult >= MAX_MULT) {
      renderLiveMult(MAX_MULT);
      tiltBoat(0, currentWave);
      return maxOut();
    }
    // ¿El nuevo base ya supera el umbral? (ola que rompe en la cresta)
    if (isSinking(prevCrestMult, crashThreshold)) {
      renderLiveMult(prevCrestMult);
      return sink(prevCrestMult);
    }

    // Siguiente ola: tamaño pre-cargado y volvemos a precargar la próxima.
    currentWave = nextWave ?? rollWaveSize(0.5);
    preloadNextWave();
    applyWaveSize(currentWave);
    climbStart = now;
    renderLiveMult(prevCrestMult);
    tiltBoat(0, currentWave);
    rafId = requestAnimationFrame(tick);
    return;
  }

  // Avance normal
  renderLiveMult(m);
  tiltBoat(pCap, currentWave);
  rafId = requestAnimationFrame(tick);
}

// ---------- Detenerse (cashout) ----------
stopBtn.addEventListener('click', () => {
  if (!running) return;
  stopClimb();
  const res = resolveCashout(stake, liveMult);
  endVoyage(res, false);
});

function stopClimb() {
  running = false;
  cancelAnimationFrame(rafId);
  setWavesRolling(false);
}

// ---------- Hundimiento ----------
function sink(atMult) {
  stopClimb();
  waveObstacle.classList.add('is-breaking');
  boat.classList.add('boat--sinking');
  screenFlash('bust');
  setTimeout(() => {
    const res = resolveSink(stake);
    endVoyage(res, true, atMult);
  }, 900);
}

// ---------- Gran ola ----------
function maxOut() {
  stopClimb();
  screenFlash('win');
  spawnConfetti();
  const res = resolveMaxed(stake);
  setTimeout(() => endVoyage(res, false, MAX_MULT, true), 600);
}

// ---------- Fin de la travesía ----------
function endVoyage(res, busted, atMult = res.multiplier, maxed = false) {
  wallet.settle(stake, res.payout);
  pushPlayerWin({ busted, maxed, multiplier: atMult, payout: res.payout, crested: crestedCount });

  history.unshift({
    multiplier: busted ? 0 : res.multiplier,
    payout: res.payout,
    busted,
    maxed,
    crested: crestedCount,
  });
  history = history.slice(0, 6);
  renderHistory();

  if (busted) {
    resultMsg.textContent = `¡Hundimiento! El barco se fue a pique a ${fmtMult(atMult)}. Perdiste $${stake}.`;
    resultMsg.className = 'result-msg result-msg--lose';
  } else if (maxed) {
    resultMsg.textContent = `¡GRAN OLA! Llegaste a 50x y cobras $${res.payout}.`;
    resultMsg.className = 'result-msg result-msg--win';
  } else {
    resultMsg.textContent = `Te detuviste a ${fmtMult(atMult)}. Cobras $${res.payout} (${res.net >= 0 ? '+' : ''}$${res.net}).`;
    resultMsg.className = res.net >= 0 ? 'result-msg result-msg--win' : 'result-msg result-msg--lose';
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
        ? `<li class="history__bust"><span>OLA ${h.crested + 1} · HUNDIDO</span><span>−$${stake}</span></li>`
        : `<li><span>${h.maxed ? 'GRAN OLA' : 'Detenido'} · ${h.crested}</span><span class="history__mult">${fmtMult(h.multiplier)}</span></li>`
    )
    .join('');
}

// ---------- Otra travesía ----------
nextBtn.addEventListener('click', () => {
  crestedCount = 0;
  prevCrestMult = 1;
  liveMult = 1;
  stake = 0;
  rng = null;
  currentBet = 0;
  nextWave = null;
  boat.classList.remove('boat--sinking');
  waveObstacle.classList.remove('is-breaking', 'is-active');
  boat.style.transform = 'translateX(-50%) translateY(0) rotate(0deg)';
  waveObstacle.style.transform = '';
  applyDepth(0);
  renderLiveMult(1);
  crestedCountEl.textContent = '0';
  updateBetUI();
  showPhase(phaseBet);
});

// ---------- Modal de reglas + tabla ----------
function buildRulesTable() {
  const body = $('#rules-table-body');
  if (!body) return;
  body.innerHTML = '';
  for (const s of waveSizesTable()) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.label}</td>
      <td>+${s.step.toFixed(2)}x</td>
      <td>${Math.round(s.weight * 100)}%</td>
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
  if (e.key === 'Escape' && !rulesModal.classList.contains('modal--hidden')) closeRules();
});

// ---------- Ticker de ganadores ----------
const tickerContent = $('#ticker-content');
const FAKE_NAMES = [
  'CapitánLuna', 'MarinoSol', 'OlaDorada', 'FortunaSea', 'TimonelX',
  'BrisaTropical', 'Naucler', 'PilotoAzul', 'MareaAlta', 'Salvavidas',
  'PerlaRoja', 'TravesíaZ', 'Marinero9', 'CostaDorada', 'AlbatrosReal',
  'BrisaSuave', 'AnclaRota', 'CorrienteViva', 'EspumaBlanca', 'PirateGent',
];
const FAKE_BETS = [5, 10, 25, 50, 100, 200, 500];

function genFakeWin() {
  const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
  const bet = FAKE_BETS[Math.floor(Math.random() * FAKE_BETS.length)];
  const sizes = waveSizesTable();
  const size = sizes[Math.floor(Math.random() * sizes.length)];
  const busted = Math.random() < 0.4;
  let mult;
  if (busted) {
    mult = +(1 + Math.random() * (size.step * (1 + Math.random() * 4))).toFixed(2);
  } else {
    mult = +(1 + Math.random() * 6).toFixed(2);
  }
  const payout = busted ? bet : +(bet * mult).toFixed(2);
  return { name, size: size.label, mult, payout, busted };
}

function tickerItemHTML(w) {
  if (w.busted) {
    return `<span class="ticker__item">
      <span class="t-name">${w.name}</span>
      <span class="t-wave">OLA ${w.size}</span>
      <span class="t-bust">HUNDIDO −$${w.payout}</span>
    </span>`;
  }
  return `<span class="ticker__item">
    <span class="t-name">${w.name}</span>
    <span class="t-wave">OLA ${w.size}</span>
    <span class="t-win">${fmtMult(w.mult)} · +$${w.payout}</span>
  </span>`;
}

function buildTickerSeed(count = 14) {
  const items = [];
  for (let i = 0; i < count; i++) items.push(tickerItemHTML(genFakeWin()));
  tickerContent.innerHTML = items.join('') + items.join('');
}

function pushPlayerWin(r) {
  const item = document.createElement('span');
  item.className = 'ticker__item ticker__item--me';
  if (r.busted) {
    item.innerHTML = `
      <span class="t-name">TÚ</span>
      <span class="t-wave">OLA ${r.crested + 1}</span>
      <span class="t-bust">HUNDIDO −$${stake}</span>
    `;
  } else {
    item.innerHTML = `
      <span class="t-name">TÚ</span>
      <span class="t-wave">${r.maxed ? 'GRAN OLA' : 'OLA ' + r.crested}</span>
      <span class="t-win">${fmtMult(r.multiplier)} · +$${r.payout}</span>
    `;
  }
  tickerContent.insertBefore(item, tickerContent.firstChild);
  while (tickerContent.children.length > 60) tickerContent.removeChild(tickerContent.lastChild);
}

setInterval(() => {
  const item = document.createElement('span');
  item.className = 'ticker__item';
  item.innerHTML = tickerItemHTML(genFakeWin());
  tickerContent.insertBefore(item, tickerContent.firstChild);
  while (tickerContent.children.length > 60) tickerContent.removeChild(tickerContent.lastChild);
}, 4500);

// ---------- Init ----------
(async function init() {
  buildRulesTable();
  buildTickerSeed();
  applyDepth(0);
  renderLiveMult(1);
  setWavesRolling(false);
  updateBetUI();
  showPhase(phaseBet);
  await showSplash({ durationMs: 2200, title: 'OLAH' });
})();
