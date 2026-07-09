// ===== Trade — Controller (mercado global continuo) =====
// Mercado: el gráfico avanza SOLO de forma permanente, hage o no jugador.
//   mkt: LIVE (puntadas de relleno) → DECISION (pausa 10s) → RESOLVE (cierra
//        puntada apostable) → loop. Nunca se detiene esperando al jugador.
// Jugador: OUT (no apostando) | IN (apostando). El jugador ENTRAR en caliente:
//   placeBet en cualquier momento del ciclo y se une a la próxima DECISION.
//   En DECISION tiene 10s para pulsar ARRIBA/ABAJO; si no elige → decisión
//   ALEATORIA automática. El botón RETIRARSE (cashout) está disponible siempre
//   mientras IN: en cualquier estado pulsa y cobras el saldo + reintegro stake.
// Validación arriba/abajo: una puntada "arriba" si close > open (apertura =
// último cierre), "abajo" si close < open. NO se compara con la línea de
// referencia (que solo es visual, fija en el centro).
// Pago: acierto → ganas la ganancia neta stake·(m−1); fallo → pierdes la mitad
//   y el juego continúa; si el saldo no alcanza el stake → fin de sesión.

import { showSplash } from '../_shared/splash.mjs';
import { createRng, DEMO_SERVER_SEED } from '../_shared/rng.mjs';
import { createWallet } from '../_shared/wallet.mjs';
import {
  MAX_MULT,
  MIN_MULT,
  multFromDistance,
  rollCandle,
  resolveWin,
  resolveLoss,
  winProbabilityTable,
} from './rules.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Parámetros ----------
const DECISION_MS = 10000;           // 10 segundos de decisión
const TICKS_BETWEEN_DECISIONS = 4;   // puntadas de "relleno" entre pausas
const TICK_LIVE_MS = 700;            // duración visual de una puntada de relleno
const RESOLVE_ANIM_MS = 700;         // duración de la animación de cierre
const RESULT_HOLD_MS = 1200;         // pausa mostrando el resultado antes de seguir
const VIEWBOX_W = 1000;
const VIEWBOX_H = 600;
const PRICE_START = 100.0;

// ---------- Estado del MERCADO (global, siempre corriendo) ----------
const mkt = {
  phase: 'LIVE',        // LIVE | DECISION | RESOLVE
  price: PRICE_START,
  historyPoints: [PRICE_START],
  nextCandle: null,     // puntada pre-sampleada para la próxima DECISION
  openPrice: PRICE_START,// precio de apertura de la puntada actual (último cierre)
  tickCount: 0,
  fillTicksLeft: TICKS_BETWEEN_DECISIONS,
  rafId: 0,
  lastFrame: 0,
  tickStart: 0,
  liveAnim: null,       // datos de la puntada de relleno en animación
  resolveAnim: null,    // datos de la puntada apostable en animación de cierre
  rng: createRng({ serverSeed: DEMO_SERVER_SEED, clientSeed: 'trade-market', nonce: 0 }),
  nonce: 1,
  decisionCountdownTimer: 0,
  decisionDeadline: 0,
};

// ---------- Estado del JUGADOR ----------
const player = {
  in: false,
  stake: 0,                       // apuesta inicial comprometida (100)
  bankroll: 0,                    // capital de juego dedicado: sube/baja con aciertos/fallos
  referencePrice: PRICE_START,    // línea de referencia = precio al entrar; fija
  chosenDir: null,                // 'up' | 'down' elegido en la DECISION actual
  history: [],
  currentBet: 0,
};

// ---------- Wallet ----------
const wallet = createWallet({ startingBalance: 1000 });

// ---------- DOM refs ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const balanceEl = $('#balance');
const stage = document.querySelector('.stage');
const gridLayer = $('#chart-grid');
const nextPreviewLayer = $('#next-preview');
const priceLine = $('#price-line');
const refLine = $('#ref-line');
const refLabel = $('#ref-label');
const axisY = $('#axis-y');
const chartLine = $('#chart-line');
const chartArea = $('#chart-area');
const liveSeg = $('#live-seg');
const chartHead = $('#chart-head');
const decisionPanel = $('#decision-panel');
const toast = $('#toast');

const priceEl = $('#price');
const tickCountEl = $('#tick-count');
const candleMultEl = $('#candle-mult');
const stakeValueEl = $('#stake-value');
const winGainEl = $('#win-gain');
const lossAmountEl = $('#loss-amount');
const historyEl = $('#history');
const upCountEl = $('#up-count');
const downCountEl = $('#down-count');
const exitValueEl = $('#exit-value');
const joinBtn = $('#join-btn');
const stakePill = $('#stake-pill');
const stakePillValue = $('#stake-pill-value');

const phaseBet = $('#phase-bet');
const phasePlay = $('#phase-play');
const phaseResolve = $('#phase-resolve');
const phaseEnd = $('#phase-end');
const startBtn = $('#start-btn');
const betAmountEl = $('#bet-amount');
const upBtn = $('#up-btn');
const downBtn = $('#down-btn');
const exitBtn = $('#exit-btn');
const restartBtn = $('#restart-btn');
const resultMsg = $('#result-msg');
const resultMsgResolve = $('#result-msg-resolve');
const endMsg = $('#end-msg');

// ---------- Wallet helpers ----------
wallet.onChange((bal) => {
  balanceEl.textContent = `${bal.toFixed(2)}`;
});
// Pérdida a medias: descuenta |amount| del saldo libre (sin bajar de 0).
wallet.debitLoss = function (amount) {
  const loss = Math.min(Math.abs(amount), this.balance);
  if (loss > 0) this.credit(-loss);
  this.emit && this.emit();
};

// ---------- Helpers de UI ----------
function fmtMult(m) {
  return `${(Math.round(m * 100) / 100).toFixed(2)}x`;
}
function showToast(msg, variant = '', ms = 1600) {
  toast.textContent = msg;
  toast.className = 'toast' + (variant ? ` toast--${variant}` : '');
  toast.classList.remove('toast--hidden');
  if (ms > 0) setTimeout(() => toast.classList.add('toast--hidden'), ms);
}
function screenFlash(type) {
  const flash = document.createElement('div');
  flash.className = `flash-${type}`;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1000);
}
function spawnConfetti(count = 50) {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < count; i++) {
    const c = document.createElement('span');
    c.style.left = `${Math.random() * 100}%`;
    c.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    c.style.animationDelay = `${Math.random() * 0.5}s`;
    c.style.background = Math.random() > 0.5 ? 'var(--gold-400)' : 'var(--up)';
    c.style.width = `${6 + Math.random() * 6}px`;
    c.style.height = `${10 + Math.random() * 8}px`;
    layer.appendChild(c);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}
function showPhase(phase) {
  [phaseBet, phasePlay, phaseResolve, phaseEnd].forEach((p) =>
    p.classList.add('controls__phase--hidden')
  );
  phase.classList.remove('controls__phase--hidden');
}
function setStageState(s) {
  // 'decision' solo si el jugador está dentro; el mercado decide su fase por separado
  if (player.in && mkt.phase === 'DECISION') stage.dataset.state = 'decision';
  else stage.dataset.state = s;
}

// Indicadores a la derecha de cada flecha: monto potencial de ganancia neta.
// Bug #2: antes era un contador de segundos (sólo en DECISION → faltaba en LIVE).
// Ahora muestra, para cada dirección, la ganancia neta potencial:
//   ARRIBA = bankroll · (m − 1)  con un estimador de m basado en cuánto se ha
//   movido el precio desde la referencia. A medida que el mercado avanza, el
//   monto "crece" con el bankroll y con el movimiento del precio.
function estimateMultiplier() {
  if (mkt.nextCandle) return mkt.nextCandle.multiplier;
  // En LIVE no hay nextCandle: estimamos m por la distancia del precio a la ref.
  const ref = player.in ? player.referencePrice : PRICE_START;
  const dist = Math.min(1, Math.abs(mkt.price - ref) / (ref * 0.06));
  const m = MIN_MULT + (MAX_MULT - MIN_MULT) * Math.pow(dist, 0.65);
  return Math.min(Math.max(m, MIN_MULT), MAX_MULT);
}

function updateCallCounts() {
  if (!player.in) {
    if (upCountEl) upCountEl.textContent = '';
    if (downCountEl) downCountEl.textContent = '';
    return;
  }
  const betBase = Math.max(0, player.bankroll);
  const m = estimateMultiplier();
  const gain = Math.round(betBase * (m - 1) * 100) / 100;
  // ARRIBA: ganancia si aciertas arriba; ABAJO: ganancia si aciertas abajo.
  // Ambas direcciones comparten la misma ganancia neta (el resultado es
  // simétrico en magnitud); mostramos el monto que crece con el juego.
  const loss = Math.max(0, Math.round(gain / 2 * 100) / 100);
  const upAmt = gain;
  const downAmt = gain;
  if (upCountEl) upCountEl.textContent = `+$${upAmt}`;
  if (downCountEl) downCountEl.textContent = `+$${downAmt}`;
}

// ---------- Gráfico: rango Y (centrado en la línea de referencia del jugador) ----------
let priceMin = PRICE_START - 5;
let priceMax = PRICE_START + 5;

function recomputeRange() {
  // La línea de referencia del jugador (precio al entrar) queda FIJA en el
  // centro vertical; el rango Y se expande simétricamente para que toda la
  // polilínea quepa. Si el jugador no está dentro, la referencia es el precio
  // inicial del mercado y el rango sigue el histórico.
  const ref = player.in ? player.referencePrice : PRICE_START;
  let lo = mkt.price, hi = mkt.price;
  for (const p of mkt.historyPoints) {
    lo = Math.min(lo, p);
    hi = Math.max(hi, p);
  }
  const dist = Math.max(
    Math.abs(ref - lo),
    Math.abs(hi - ref),
    PRICE_START * 0.05
  );
  const pad = Math.max(1, dist * 0.18);
  const half = dist + pad;
  priceMin = ref - half;
  priceMax = ref + half;
}
function priceToY(p) {
  const t = (p - priceMin) / (priceMax - priceMin || 1);
  return VIEWBOX_H - t * VIEWBOX_H;
}

// ---------- Gráfico: grilla y eje ----------
function buildGrid() {
  gridLayer.innerHTML = '';
  for (let i = 1; i < 5; i++) {
    const y = (VIEWBOX_H / 5) * i;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'grid-h');
    line.setAttribute('x1', 0); line.setAttribute('y1', y);
    line.setAttribute('x2', VIEWBOX_W); line.setAttribute('y2', y);
    gridLayer.appendChild(line);
  }
  for (let i = 1; i < 10; i++) {
    const x = (VIEWBOX_W / 10) * i;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'grid-v');
    line.setAttribute('x1', x); line.setAttribute('y1', 0);
    line.setAttribute('x2', x); line.setAttribute('y2', VIEWBOX_H);
    gridLayer.appendChild(line);
  }
}
function renderAxisY() {
  axisY.innerHTML = '';
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const p = priceMax - ((priceMax - priceMin) / steps) * i;
    const span = document.createElement('span');
    span.textContent = p.toFixed(1);
    axisY.appendChild(span);
  }
}

// ---------- Gráfico: polilínea ----------
function pointX(idx) {
  const n = Math.max(mkt.historyPoints.length, 12);
  return (VIEWBOX_W / n) * idx + (VIEWBOX_W / n) / 2;
}
function renderLine() {
  const pts = mkt.historyPoints.map((p, i) => `${pointX(i)},${priceToY(p)}`).join(' ');
  chartLine.setAttribute('points', pts);
  if (mkt.historyPoints.length >= 2) {
    const lastX = pointX(mkt.historyPoints.length - 1);
    const firstX = pointX(0);
    chartArea.setAttribute('points', `${firstX},${VIEWBOX_H} ${pts} ${lastX},${VIEWBOX_H}`);
  } else {
    chartArea.setAttribute('points', '');
  }
  if (mkt.historyPoints.length >= 2) {
    const last = mkt.historyPoints[mkt.historyPoints.length - 1];
    const prev = mkt.historyPoints[mkt.historyPoints.length - 2];
    chartLine.classList.toggle('is-up', last >= prev);
    chartLine.classList.toggle('is-down', last < prev);
  } else {
    chartLine.classList.remove('is-up', 'is-down');
  }
}
function renderLiveSeg() {
  const animating = mkt.liveAnim || mkt.resolveAnim;
  if (animating && mkt.historyPoints.length > 0) {
    const lastIdx = mkt.historyPoints.length - 1;
    const x1 = pointX(lastIdx);
    const y1 = priceToY(mkt.historyPoints[lastIdx]);
    const x2 = pointX(lastIdx + 1);
    const y2 = priceToY(mkt.price);
    liveSeg.setAttribute('x1', x1); liveSeg.setAttribute('y1', y1);
    liveSeg.setAttribute('x2', x2); liveSeg.setAttribute('y2', y2);
    liveSeg.style.opacity = '1';
  } else {
    liveSeg.style.opacity = '0';
  }
}
function renderHead() {
  const animating = mkt.liveAnim || mkt.resolveAnim;
  if (mkt.historyPoints.length === 0 && !animating) {
    chartHead.style.opacity = '0';
    return;
  }
  const px = animating ? pointX(mkt.historyPoints.length) : pointX(mkt.historyPoints.length - 1);
  const py = priceToY(mkt.price);
  chartHead.setAttribute('cx', px);
  chartHead.setAttribute('cy', py);
  chartHead.style.opacity = '1';
  chartHead.classList.toggle('is-up', mkt.price >= PRICE_START);
  chartHead.classList.toggle('is-down', mkt.price < PRICE_START);
}
function renderNextPreview() {
  nextPreviewLayer.innerHTML = '';
  if (mkt.phase !== 'DECISION' || !mkt.nextCandle || !player.in) return;
  const i = mkt.historyPoints.length;
  const cx = pointX(i);
  const magnitude = (mkt.nextCandle.multiplier - 1) / (MAX_MULT - 1);
  const swing = (priceMax - priceMin) * 0.22 * (0.4 + magnitude);
  const upY = priceToY(mkt.price + swing);
  const downY = priceToY(mkt.price - swing);
  const baseY = priceToY(mkt.price);
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'preview-candle');
  const base = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  base.setAttribute('class', 'preview-candle__ghost');
  base.setAttribute('cx', cx); base.setAttribute('cy', baseY); base.setAttribute('r', 6);
  g.appendChild(base);
  const arcUp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arcUp.setAttribute('class', 'preview-candle__arc preview-candle__arc-up');
  arcUp.setAttribute('d', `M ${cx} ${baseY} Q ${cx + 40} ${baseY - (baseY - upY) * 0.4} ${cx} ${upY}`);
  g.appendChild(arcUp);
  const arcDown = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arcDown.setAttribute('class', 'preview-candle__arc preview-candle__arc-down');
  arcDown.setAttribute('d', `M ${cx} ${baseY} Q ${cx + 40} ${baseY + (downY - baseY) * 0.4} ${cx} ${downY}`);
  g.appendChild(arcDown);
  const arrUp = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  arrUp.setAttribute('class', 'preview-candle__arrow up');
  arrUp.setAttribute('x1', cx); arrUp.setAttribute('y1', baseY);
  arrUp.setAttribute('x2', cx); arrUp.setAttribute('y2', upY);
  g.appendChild(arrUp);
  const arrDown = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  arrDown.setAttribute('class', 'preview-candle__arrow down');
  arrDown.setAttribute('x1', cx); arrDown.setAttribute('y1', baseY);
  arrDown.setAttribute('x2', cx); arrDown.setAttribute('y2', downY);
  g.appendChild(arrDown);
  nextPreviewLayer.appendChild(g);
}
function renderPriceLine() {
  const y = priceToY(mkt.price);
  priceLine.setAttribute('x1', 0); priceLine.setAttribute('x2', VIEWBOX_W);
  priceLine.setAttribute('y1', y); priceLine.setAttribute('y2', y);
}
function renderReferenceLine() {
  if (!player.in) {
    refLine.style.opacity = '0';
    refLabel.style.opacity = '0';
    return;
  }
  refLine.style.opacity = '';
  refLabel.style.opacity = '';
  const y = VIEWBOX_H / 2;
  refLine.setAttribute('x1', 0); refLine.setAttribute('x2', VIEWBOX_W);
  refLine.setAttribute('y1', y); refLine.setAttribute('y2', y);
  refLabel.setAttribute('y', y - 6);
  refLabel.textContent = player.referencePrice.toFixed(2);
}
function renderAll() {
  recomputeRange();
  renderAxisY();
  renderLine();
  renderLiveSeg();
  renderHead();
  renderReferenceLine();
  renderPriceLine();
  renderNextPreview();
  priceEl.textContent = mkt.price.toFixed(2);
  priceEl.classList.toggle('is-up', mkt.price >= PRICE_START);
  priceEl.classList.toggle('is-down', mkt.price < PRICE_START);
  tickCountEl.textContent = String(mkt.tickCount);
  setStageState(stage.dataset.state === 'decision' ? 'decision' : 'live');
  // Bug #2: refresca montos ARRIBA/ABAJO en cada frame (crecen con el precio)
  updateCallCounts();
}

// ---------- Panel de estado del jugador ----------
function updateBetPanels() {
  // Bankroll dedicado: la apuesta inicial es el capital de juego. Sube con
  // aciertos y baja con fallos; cuando llega a 0 la partida termina.
  const br = player.in ? player.bankroll : 0;
  // El 'stake por vela' = bankroll actual (juegas proporcional a tu capital).
  const betBase = player.in ? Math.max(0, player.bankroll) : 0;
  const m = (player.in && mkt.nextCandle) ? mkt.nextCandle.multiplier : 1;
  const gain = Math.round(betBase * (m - 1) * 100) / 100;
  const loss = Math.max(0, Math.round(gain / 2 * 100) / 100);

  // Contador superior derecho (stake-pill) + barra de estado: bankroll en juego
  if (stakePillValue) stakePillValue.textContent = `${br.toFixed(2)}`;
  stakeValueEl.textContent = `${br.toFixed(2)}`;
  winGainEl.textContent = `+${gain}`;
  lossAmountEl.textContent = `−${loss}`;
  candleMultEl.textContent = (player.in && mkt.nextCandle) ? fmtMult(m) : '—';
  // RETIRARSE muestra lo que te llevas = bankroll actual
  exitValueEl.textContent = `${br.toFixed(2)}`;
  // Bug #2: refresca los montos de los botones ARRIBA/ABAJO (crecen con el juego)
  updateCallCounts();
}

// ============================================================
//  MERCADO GLOBAL — bucle permanente (siempre corriendo)
// ============================================================
async function precomputeNextCandle() {
  mkt.rng = mkt.rng || createRng({
    serverSeed: DEMO_SERVER_SEED,
    clientSeed: 'trade-market-' + mkt.nonce,
    nonce: mkt.nonce++,
  });
  const uDist = await mkt.rng.next();
  const uWin = await mkt.rng.next();
  const c = rollCandle(uDist, uWin);
  const dir = c.isWinUp ? 1 : -1;
  const open = mkt.price;                       // apertura = último cierre del mercado
  const magnitude = c.distance;
  const swing = magnitude * (mkt.price * 0.04) * (0.6 + Math.random() * 0.8);
  const close = +(open + dir * swing).toFixed(4);
  const high = Math.max(open, close) + Math.random() * swing * 0.3;
  const low = Math.min(open, close) - Math.random() * swing * 0.3;
  mkt.nextCandle = {
    open, close,
    high: +high.toFixed(4),
    low: +low.toFixed(4),
    up: close > open,                          // ARRIBA = cierre por encima de la apertura
    distance: c.distance,
    multiplier: c.multiplier,
    winDir: close > open ? 'up' : 'down',       // dirección real de la puntada (vs apertura)
  };
  updateBetPanels();
  renderNextPreview();
}

// --- Fase LIVE: puntadas de relleno (random walk cosmético) ---
function startFillTick() {
  mkt.phase = 'LIVE';
  setStageState('live');
  mkt.tickStart = performance.now();
  mkt.lastFrame = mkt.tickStart;
  mkt.liveAnim = { open: mkt.price };
  mkt.liveAnim.cosmeticDir = Math.random() > 0.5 ? 1 : -1;
  mkt.liveAnim.cosmeticSwing = (0.002 + Math.random() * 0.006) * mkt.price;
  mkt.rafId = requestAnimationFrame(fillTickLoop);
}
function fillTickLoop(now) {
  const elapsed = now - mkt.tickStart;
  const prog = Math.min(1, elapsed / TICK_LIVE_MS);
  if (mkt.liveAnim) {
    const a = mkt.liveAnim;
    const wob = Math.sin(elapsed / 120) * a.cosmeticSwing;
    mkt.price = +(a.open + a.cosmeticDir * prog * a.cosmeticSwing * 4 + wob).toFixed(4);
    renderAll();
  }
  if (prog >= 1) {
    finalizeFillCandle();
    mkt.fillTicksLeft -= 1;
    if (mkt.fillTicksLeft <= 0) {
      enterDecision();
    } else {
      startFillTick();
    }
    return;
  }
  mkt.rafId = requestAnimationFrame(fillTickLoop);
}
function finalizeFillCandle() {
  mkt.historyPoints.push(+mkt.price.toFixed(4));
  mkt.historyPoints = mkt.historyPoints.slice(-60);
  mkt.tickCount += 1;
  mkt.liveAnim = null;
  renderAll();
}

// --- Fase DECISION: pausa de 10s ---
async function enterDecision() {
  mkt.phase = 'DECISION';
  cancelAnimationFrame(mkt.rafId);
  mkt.liveAnim = null;
  // Precarga la próxima puntada apostable (puede tardar un tick async)
  precomputeNextCandle();   // no await: se renderiza cuando llegue
  renderAll();
  window.dispatchEvent(new CustomEvent('trade:decision-start'));
  // El mercado queda en pausa; el jugador (si dentro) tiene 10s.
  mkt.decisionDeadline = performance.now() + DECISION_MS;
  clearTimeout(mkt.decisionCountdownTimer);
  mkt.decisionCountdownTimer = setTimeout(() => resolveMarket(), DECISION_MS);
  tickCountdownLoop();
}
function tickCountdownLoop() {
  if (mkt.phase !== 'DECISION') return;
  const remaining = mkt.decisionDeadline - performance.now();
  // Urgencia visual en los últimos 2.5s si el jugador sigue dentro.
  const urgent = remaining < 2500 && player.in;
  upBtn.classList.toggle('is-urgent', urgent);
  downBtn.classList.toggle('is-urgent', urgent);
  updateCallCounts();
  if (remaining > 0) requestAnimationFrame(tickCountdownLoop);
}

// --- Resolución del mercado: cierra la puntada apostable ---
function resolveMarket() {
  if (mkt.phase !== 'DECISION') return;
  if (!mkt.nextCandle) {
    // salvaguarda: si por timing la puntada aún no se sampleó, reintenta en 60ms
    mkt.decisionCountdownTimer = setTimeout(resolveMarket, 60);
    return;
  }
  mkt.phase = 'RESOLVE';
  // Determinar la decisión del jugador (o aleatoria si no eligió)
  let chosen = null;
  let auto = false;
  if (player.in) {
    chosen = player.chosenDir;
    if (!chosen) {
      chosen = Math.random() < 0.5 ? 'up' : 'down';
      auto = true;
      showToast('Sin elección → aleatorio', 1400);
    }
  }
  player.chosenDir = null;
  animateCandleClose(mkt.nextCandle, chosen, auto);
}

function animateCandleClose(candle, chosen, auto) {
  const a = { open: candle.open, target: candle.close, start: performance.now() };
  mkt.resolveAnim = { open: a.open };
  const won = chosen ? (candle.winDir === chosen) : false;
  function frame(now) {
    const p = Math.min(1, (now - a.start) / RESOLVE_ANIM_MS);
    const e = 1 - Math.pow(1 - p, 3);
    mkt.price = +(a.open + (a.target - a.open) * e).toFixed(4);
    renderAll();
    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      finalizeResolvedCandle(candle, chosen, won, auto);
    }
  }
  requestAnimationFrame(frame);
}

function finalizeResolvedCandle(candle, chosen, won, auto) {
  mkt.historyPoints.push(+candle.close.toFixed(4));
  mkt.historyPoints = mkt.historyPoints.slice(-60);
  mkt.tickCount += 1;
  mkt.price = candle.close;
  mkt.resolveAnim = null;
  mkt.nextCandle = null;
  renderAll();

  // Pago del jugador (si está dentro y eligió o fue aleatorio).
  // La apuesta por vela es el BANKROLL actual (capital dedicado).
  if (player.in && chosen) {
    const betBase = Math.max(0, player.bankroll);
    let res;
    if (won) {
      res = resolveWin(betBase, candle.multiplier);
      player.bankroll = Math.round((player.bankroll + res.gain) * 100) / 100;
      showToast(auto ? `Aleatorio ¡acierto! +$${res.gain}` : `¡Acertaste! +$${res.gain}`, 'win', 1600);
      screenFlash('win');
      if (res.multiplier >= MAX_MULT * 0.8) spawnConfetti(40);
    } else {
      res = resolveLoss(betBase, candle.multiplier);
      player.bankroll = Math.round((player.bankroll + res.net) * 100) / 100;
      showToast(auto ? `Aleatorio fallo −$${Math.abs(res.net)}` : `Fallaste −$${Math.abs(res.net)}`, 'lose', 1600);
      screenFlash('bust');
    }
    const dirSym = candle.up ? '▲' : '▼';
    const yourSym = chosen === candle.winDir ? '✓' : '✗';
    const msg = `${dirSym} ${candle.up ? 'ARRIBA' : 'ABAJO'} ${yourSym} ${won ? '+$' + res.gain : '−$' + Math.abs(res.net)} (${fmtMult(candle.multiplier)})${auto ? ' · AUTO' : ''}`;
    resultMsgResolve.textContent = msg;
    resultMsgResolve.className = `result-msg result-msg--${won ? 'win' : 'lose'}`;
    if (mkt.phase === 'RESOLVE' && player.in) {
      upBtn.disabled = true;
      downBtn.disabled = true;
    }

    player.history.unshift({
      dir: candle.winDir,
      chosen,
      won,
      auto,
      multiplier: candle.multiplier,
      net: res.net,
    });
    player.history = player.history.slice(0, 8);
    renderHistory();
    pushPlayerResult(won, res.net, candle.multiplier);
    updateBetPanels();

    // ¿Puede seguir? La partida termina si el bankroll dedicado se agota.
    if (player.bankroll <= 0) {
      player.bankroll = 0;
      updateBetPanels();
      setTimeout(() => endSession(false), 600);
      return;
    }
  }

  // El mercado sigue solo, tras el hold del resultado
  setTimeout(() => {
    mkt.fillTicksLeft = TICKS_BETWEEN_DECISIONS;
    // Si el jugador sigue dentro, re-habilitar botones en la próxima DECISION
    if (player.in) {
      showPhase(phasePlay);
      resultMsgResolve.textContent = 'Esperando la próxima puntada…';
      resultMsgResolve.className = 'result-msg result-msg--idle';
    }
    startFillTick();
  }, RESULT_HOLD_MS);
}

// ============================================================
//  JUGADOR — entrada en caliente, decisión, retirada
// ============================================================
function updateBetUI() {
  betAmountEl.textContent = `$${player.currentBet}`;
  startBtn.disabled = player.currentBet === 0 || !wallet.canBet(player.currentBet) || player.in;
}

$$('.chip').forEach((btn) =>
  btn.addEventListener('click', () => {
    if (player.in) return;
    const chip = parseInt(btn.dataset.chip, 10);
    if (wallet.canBet(player.currentBet + chip)) {
      player.currentBet += chip;
      updateBetUI();
    } else {
      showToast('Saldo insuficiente', 1200);
    }
  })
);
$('#bet-clear').addEventListener('click', () => {
  if (player.in) return;
  player.currentBet = 0;
  updateBetUI();
});
startBtn.addEventListener('click', joinMarket);

// Cancelar la fase de apuesta: vuelve al estado de apuesta (limpia el monto).
$('#bet-cancel')?.addEventListener('click', () => {
  if (player.in) return;
  player.currentBet = 0;
  updateBetUI();
  showPhase(phaseBet);
  resultMsgResolve.textContent = 'Observa el mercado. Elige tu apuesta y entra.';
  resultMsgResolve.className = 'result-msg result-msg--idle';
});

// El jugador ENTRA al mercado en caliente: compromete el stake y se une al
// ciclo actual (haya empezado el mercado en LIVE, DECISION o RESOLVE).
function joinMarket() {
  if (player.in) return;
  if (!wallet.placeBet(player.currentBet)) return;
  player.stake = player.currentBet;          // apuesta inicial comprometida
  player.bankroll = player.currentBet;        // ¡ese monto es el capital de juego!
  player.currentBet = 0;
  player.referencePrice = mkt.price;   // línea de referencia = precio al entrar
  player.in = true;
  player.chosenDir = null;
  player.history = [];
  renderHistory();
  exitBtn.hidden = false;
  if (stakePill) stakePill.hidden = false;    // contador superior derecho: bankroll
  updateBetPanels();
  showPhase(phasePlay);
  resultMsgResolve.textContent = '¡Entras al mercado! Espera la próxima puntada…';
  resultMsgResolve.className = 'result-msg result-msg--idle';
  showToast('¡Entras al mercado!', 1400);
  // Si ya estamos en DECISION, habilitar botones ahora.
  if (mkt.phase === 'DECISION') enableDecisionButtons();
  updateBetUI();
}

// Habilita los botones ARRIBA/ABAJO para el jugador (durante DECISION).
function enableDecisionButtons() {
  upBtn.disabled = false;
  downBtn.disabled = false;
  upBtn.classList.remove('is-active', 'is-up', 'is-urgent');
  downBtn.classList.remove('is-active', 'is-down', 'is-urgent');
  updateCallCounts();
}
// Cuando empieza una DECISION y el jugador está dentro, habilitar botones.
window.addEventListener('trade:decision-start', () => {
  if (player.in) enableDecisionButtons();
});

upBtn.addEventListener('click', () => choose('up'));
downBtn.addEventListener('click', () => choose('down'));

function choose(dir) {
  if (mkt.phase !== 'DECISION') return;
  if (!player.in) return;
  player.chosenDir = dir;
  upBtn.disabled = true;
  downBtn.disabled = true;
  upBtn.classList.remove('is-urgent');
  downBtn.classList.remove('is-urgent');
  updateCallCounts();
  if (dir === 'up') upBtn.classList.add('is-active', 'is-up');
  else downBtn.classList.add('is-active', 'is-down');
  showToast(`Elegiste ${dir === 'up' ? 'ARRIBA ▲' : 'ABAJO ▼'}`, 1100);
}

// RETIRARSE (cashout): disponible SIEMPRE mientras el jugador esté dentro.
// En cualquier estado del mercado, pulsa y cobras el saldo + reintegro del stake.
exitBtn.addEventListener('click', () => {
  if (!player.in) return;
  // Si hay una decisión en curso con elección, ignórala (te retiras antes).
  player.chosenDir = null;
  // Bug #1: al salir en DECISION, cancelar el timer de resolve PERO dejar que el
  // mercado continúe (si no, queda congelado para siempre). Re-arrancamos el
  // bucle LIVE desde donde esté el precio actual.
  clearTimeout(mkt.decisionCountdownTimer);
  mkt.phase = 'LIVE';         // fuerza salida de DECISION → detiene tickCountdownLoop
  mkt.fillTicksLeft = TICKS_BETWEEN_DECISIONS;
  cancelAnimationFrame(mkt.rafId);
  mkt.resolveAnim = null;
  endSession(true);
  startFillTick();            // el mercado sigue corriendo sin jugador
});

function endSession(cashedOut) {
  if (!player.in) return;
  const finalBankroll = Math.max(0, player.bankroll);
  player.in = false;
  upBtn.disabled = true;
  downBtn.disabled = true;
  exitBtn.hidden = true;
  if (stakePill) stakePill.hidden = true;   // oculta el contador al salir
  if (cashedOut) {
    // Te llevas el bankroll que te quede (reintegro al saldo general).
    if (finalBankroll > 0) wallet.credit(finalBankroll);
    endMsg.textContent = `Te retiraste con ${wallet.balance.toFixed(2)}.`;
    endMsg.className = 'result-msg result-msg--end';
  } else {
    // Bankroll agotado → se acabó la partida (pierdes la apuesta inicial).
    endMsg.textContent = `Se acabó tu capital de juego. Pierdes la apuesta de ${player.stake}.`;
    endMsg.className = 'result-msg result-msg--lose';
  }
  player.stake = 0;
  player.bankroll = 0;
  player.chosenDir = null;
  updateBetPanels();
  renderAll();
  showPhase(phaseEnd);
  // El mercado sigue corriendo (no se detiene): un nuevo jugador puede entrar.
}

restartBtn.addEventListener('click', () => {
  player.currentBet = 0;
  updateBetUI();
  showPhase(phaseBet);
});

// Botón ENTRAR — eliminado del DOM: el jugador entra por los controles (startBtn).
// Sin handler de joinBtn; las guardas null-safe previenen errores.

// ---------- Historial ----------
function renderHistory() {
  if (player.history.length === 0) {
    historyEl.innerHTML = '<li class="history__empty">Sin historial aún</li>';
    return;
  }
  const arrows = { up: '▲', down: '▼' };
  historyEl.innerHTML = player.history
    .map((h) =>
      `<li class="history__${h.won ? 'win' : 'lose'}">
        <span>${arrows[h.dir] || '·'} ${h.chosen === h.dir ? '✓' : '✗'}${h.auto ? ' ⚡' : ''}</span>
        <span class="history__mult">${fmtMult(h.multiplier)}</span>
        <span>${h.won ? '+' : '−'}$${Math.abs(h.net)}</span>
      </li>`
    )
    .join('');
}

// ---------- Modal de reglas ----------
function buildRulesTable() {
  const body = $('#rules-table-body');
  if (!body) return;
  body.innerHTML = '';
  for (const r of winProbabilityTable()) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtMult(r.multiplier)}</td>
      <td>+${r.netGainPct}%</td>
      <td>−${r.lossPct}%</td>
      <td>${Math.round(r.winProb * 100)}%</td>
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

// ---------- Ticker de "traders" ----------
const tickerContent = $('#ticker-content');
const FAKE_NAMES = [
  'TraderX', 'BullDorada', 'BearKiller', 'Candelista', 'LongShot',
  'ShortVivo', 'BrokerZ', 'FaithUp', 'DownHill', 'PipMaster',
  'VelaVerde', 'RojoFuego', 'GapHunter', 'FiboMan', 'RsiNinja',
  'OsoDorado', 'ToroSalvaje', 'Mercado9', 'PrecioAlto', 'SoporteZ',
];
const FAKE_BETS = [5, 10, 25, 50, 100, 200];
function genFakeWin() {
  const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
  const bet = FAKE_BETS[Math.floor(Math.random() * FAKE_BETS.length)];
  const mult = +(1.2 + Math.random() * 1.7).toFixed(2);
  const won = Math.random() < 0.55;
  const net = won ? +(bet * (mult - 1)).toFixed(2) : +(-(bet * (mult - 1)) / 2).toFixed(2);
  return { name, dir: Math.random() > 0.5 ? '▲' : '▼', won, mult, net };
}
function tickerItemHTML(w) {
  const cls = w.won ? 't-win' : 't-bust';
  const sign = w.won ? '+' : '−';
  return `<span class="ticker__item">
    <span class="t-name">${w.name}</span>
    <span class="t-dir">${w.dir} ${fmtMult(w.mult)}</span>
    <span class="${cls}">${sign}$${Math.abs(w.net)}</span>
  </span>`;
}
function buildTickerSeed(count = 14) {
  const items = [];
  for (let i = 0; i < count; i++) items.push(tickerItemHTML(genFakeWin()));
  tickerContent.innerHTML = items.join('') + items.join('');
}
function pushPlayerResult(won, net, mult) {
  const item = document.createElement('span');
  item.className = 'ticker__item ticker__item--me';
  const sign = won ? '+' : '−';
  item.innerHTML = `
    <span class="t-name">TÚ</span>
    <span class="t-dir">${fmtMult(mult)}</span>
    <span class="${won ? 't-win' : 't-bust'}">${sign}$${Math.abs(net)}</span>
  `;
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
  buildGrid();
  renderAxisY();
  renderAll();
  updateBetPanels();
  updateBetUI();
  setStageState('idle');
  if (stakePill) stakePill.hidden = true;
  showPhase(phaseBet);
  resultMsgResolve.textContent = 'Observa el mercado. Elige tu apuesta y entra.';
  resultMsgResolve.className = 'result-msg result-msg--idle';
  await showSplash({ durationMs: 1800, title: 'TRADE' });
  // Arranca el mercado global (corre para siempre, hage o no jugador)
  mkt.fillTicksLeft = TICKS_BETWEEN_DECISIONS;
  startFillTick();
})();
