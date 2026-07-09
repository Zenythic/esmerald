// ===== Luck - ensamblaje inicial de escena =====
// La lógica de tragaperras vendrá después. Por ahora solo preparamos el lienzo
// 1246x701 y montamos las capas numeradas.

import { showSplash } from '../_shared/splash.mjs';
import { createWallet } from '../_shared/wallet.mjs';
import {
  BET_STEP,
  BONUS_FREE_SPINS,
  BONUS_ITEMS,
  BONUS_RETRIGGER_SPINS,
  BONUS_TRIGGER_WILDS,
  JACKPOT_MULTIPLIERS,
  MAX_BET,
  PAYTABLE,
  REEL_GRID,
  REEL_ITEMS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  UI_AREAS,
  clampBet,
  isBonusSymbolKey,
  reelColumnGeometries,
  reelGridPosition,
  resolveSlotSpin,
} from './rules.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BASE_REEL_SPEED = 1150;
const WILD_SPEED_BOOST = 650;

const stageShell = document.querySelector('.luck-stage');
const viewport = document.querySelector('#luck-viewport');
const scene = document.querySelector('#luck-scene');
const reelsLayer = document.querySelector('#reels-layer');
const paylineLayer = document.querySelector('#payline-layer');
const bonusHud = document.querySelector('#bonus-hud');
const bonusSpinsLeftEl = document.querySelector('#bonus-spins-left');
const areaEls = [...document.querySelectorAll('[data-area]')];

const balanceEl = document.querySelector('#balance');
const tickerContent = document.querySelector('#ticker-content');
const toast = document.querySelector('#toast');
const pcLock = document.querySelector('#pc-lock');
const grandPrizeEl = document.querySelector('#grand-prize');
const majorPrizeEl = document.querySelector('#major-prize');
const minorPrizeEl = document.querySelector('#minor-prize');
const betDisplayEl = document.querySelector('#bet-display');
const winDisplayEl = document.querySelector('#win-display');
const betDownBtn = document.querySelector('#bet-down');
const betUpBtn = document.querySelector('#bet-up');
const autoSpinBtn = document.querySelector('#auto-spin-btn');
const spinBtn = document.querySelector('#spin-btn');
const helpBtn = document.querySelector('#help-btn');
const topHelpBtn = document.querySelector('#top-help-btn');
const musicBtn = document.querySelector('#music-btn');
const autoModal = document.querySelector('#auto-modal');
const helpModal = document.querySelector('#help-modal');
const stopAutoBtn = document.querySelector('#stop-auto-btn');
const autoChoiceBtns = [...document.querySelectorAll('[data-autospins]')];
const autoBetPreview = document.querySelector('#auto-bet-preview');
const rulesPaytableBody = document.querySelector('#rules-paytable-body');

let currentBet = 0;
let lastWin = 0;
let isSpinning = false;
let activeSpin = null;
let autoSpinsLeft = 0;
let stopAuto = false;
let audioCtx = null;
let musicTimer = null;
let musicOn = false;
let toastTimer = 0;
let inBonusMode = false;
let bonusSpinsLeft = 0;
let bonusTotalWin = 0;
let bonusStake = 0;
const wallet = createWallet({ startingBalance: 1000 });

const SYMBOL_LABELS = {
  wild: 'Wild',
  z: 'Z',
  diamond: 'Diamante',
  crown: 'Corona',
  star: 'Estrella',
  bell: 'Campana',
  bar: 'Bar',
  coin: 'Moneda',
  cherry: 'Cereza',
};

const TICKER_NAMES = [
  'LuckyZ',
  'MinaDorada',
  'ReelKing',
  'LaiaFan',
  'Zeta77',
  'SpinNova',
  'FuegoRojo',
  'OroNoche',
  'TripleWild',
  'CasinoRitual',
  'NocheZ',
  'BrilloMax',
];
const TICKER_BETS = [10, 20, 30, 50, 80, 100, 150, 200];

function fitScene() {
  const availableWidth = stageShell?.clientWidth || window.innerWidth;
  const availableHeight = stageShell?.clientHeight || window.innerHeight;
  const scale = Math.min(
    availableWidth / SCENE_WIDTH,
    availableHeight / SCENE_HEIGHT,
    1
  );

  viewport.style.width = `${SCENE_WIDTH * scale}px`;
  viewport.style.height = `${SCENE_HEIGHT * scale}px`;
  scene.style.transform = `scale(${scale})`;
}

function randomIndex(max) {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function randomFloat() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] / 0x100000000;
  }
  return Math.random();
}

function randomBonusItem() {
  return BONUS_ITEMS[randomIndex(BONUS_ITEMS.length)];
}

function randomItem({ bonusMode = false } = {}) {
  if (bonusMode && randomFloat() < 0.22) {
    return randomBonusItem();
  }
  return REEL_ITEMS[randomIndex(REEL_ITEMS.length)];
}

function hasWild(items) {
  return items.some((item) => item.key === 'wild');
}

function wildRows(items) {
  return items
    .map((item, row) => (item.key === 'wild' ? row : -1))
    .filter((row) => row >= 0);
}

function countGridWilds(columns) {
  return columns.flat().filter((item) => item.key === 'wild').length;
}

function countGridBonusItems(columns) {
  return columns.flat().filter((item) => isBonusSymbolKey(item.key)).length;
}

function formatMoney(amount) {
  const value = Number.isFinite(amount) ? amount : 0;
  const hasDecimals = Math.abs(value % 1) > 0.001;
  return `${value.toLocaleString('es-ES', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  })}$`;
}

function formatTopMoney(amount) {
  const value = Number.isFinite(amount) ? amount : 0;
  const hasDecimals = Math.abs(value % 1) > 0.001;
  return `$${value.toLocaleString('es-ES', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  })}`;
}

function showToast(message, ms = 1700) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('toast--hidden');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.add('toast--hidden');
  }, ms);
}

function tickerItemHTML({ name, bet, win }) {
  return `<span class="ticker__item">
    <span class="t-name">${name}</span>
    <span class="t-bet">${formatTopMoney(bet)}</span>
    <span class="t-win">+${formatTopMoney(win)}</span>
  </span>`;
}

function genFakeTickerWin() {
  const name = TICKER_NAMES[randomIndex(TICKER_NAMES.length)];
  const bet = TICKER_BETS[randomIndex(TICKER_BETS.length)];
  const multiplier = [2, 3, 5, 8, 12, 20, 35][randomIndex(7)];
  return { name, bet, win: bet * multiplier };
}

function buildTickerSeed(count = 14) {
  if (!tickerContent) return;
  const items = Array.from({ length: count }, () => tickerItemHTML(genFakeTickerWin()));
  tickerContent.innerHTML = items.join('') + items.join('');
}

function pushPlayerResult(bet, win) {
  if (!tickerContent || win <= 0) return;
  const item = document.createElement('span');
  item.className = 'ticker__item ticker__item--me';
  item.innerHTML = `
    <span class="t-name">TU</span>
    <span class="t-bet">${formatTopMoney(bet)}</span>
    <span class="t-win">+${formatTopMoney(win)}</span>
  `;
  tickerContent.insertBefore(item, tickerContent.firstChild);
  while (tickerContent.children.length > 64) {
    tickerContent.removeChild(tickerContent.lastChild);
  }
}

function buildRulesPaytable() {
  if (!rulesPaytableBody) return;
  const order = ['wild', 'z', 'diamond', 'crown', 'star', 'bell', 'bar', 'coin', 'cherry'];
  rulesPaytableBody.innerHTML = '';
  for (const key of order) {
    const row = document.createElement('tr');
    const payouts = PAYTABLE[key];
    row.innerHTML = `
      <td>${SYMBOL_LABELS[key] || key}</td>
      <td>x${payouts[3]}</td>
      <td>x${payouts[4]}</td>
      <td>x${payouts[5]}</td>
    `;
    rulesPaytableBody.appendChild(row);
  }
}

function isPhoneLikeViewport() {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const narrowSide = Math.min(window.innerWidth, window.innerHeight);
  const wideSide = Math.max(window.innerWidth, window.innerHeight);
  return coarsePointer && narrowSide <= 820 && wideSide <= 1180;
}

function updatePcLock() {
  const locked = isPhoneLikeViewport();
  pcLock?.classList.toggle('is-visible', locked);
  pcLock?.setAttribute('aria-hidden', String(!locked));
  document.body.classList.toggle('is-pc-locked', locked);
}

function applyUiAreas() {
  for (const el of areaEls) {
    const area = UI_AREAS[el.dataset.area];
    if (!area) continue;

    el.style.setProperty('--area-x', `${area.x}px`);
    el.style.setProperty('--area-y', `${area.y}px`);
    el.style.setProperty('--area-w', `${area.width}px`);
    el.style.setProperty('--area-h', `${area.height}px`);
  }
}

function maxBetByBalance() {
  return Math.min(MAX_BET, Math.floor(wallet.balance / BET_STEP) * BET_STEP);
}

function normalizeCurrentBet() {
  currentBet = Math.min(clampBet(currentBet), maxBetByBalance());
}

function updateBonusHud() {
  bonusHud?.classList.toggle('bonus-hud--hidden', !inBonusMode);
  if (bonusSpinsLeftEl) bonusSpinsLeftEl.textContent = String(bonusSpinsLeft);
  scene.classList.toggle('is-bonus-mode', inBonusMode);
}

function updateHud() {
  if (!isSpinning) normalizeCurrentBet();
  grandPrizeEl.textContent = formatMoney(currentBet * JACKPOT_MULTIPLIERS.grand);
  majorPrizeEl.textContent = formatMoney(currentBet * JACKPOT_MULTIPLIERS.major);
  minorPrizeEl.textContent = formatMoney(currentBet * JACKPOT_MULTIPLIERS.minor);
  betDisplayEl.textContent = formatMoney(currentBet);
  winDisplayEl.textContent = formatMoney(lastWin);
  if (balanceEl) balanceEl.textContent = formatTopMoney(wallet.balance);
  if (autoBetPreview) autoBetPreview.textContent = formatMoney(currentBet);

  updateBonusHud();
  betDownBtn.disabled = isSpinning || inBonusMode || currentBet <= 0;
  betUpBtn.disabled = isSpinning || inBonusMode || currentBet >= maxBetByBalance();
  spinBtn.disabled = isSpinning || inBonusMode || currentBet <= 0 || !wallet.canBet(currentBet);
  autoSpinBtn.disabled = isSpinning || inBonusMode || currentBet <= 0 || !wallet.canBet(currentBet);
  autoSpinBtn.classList.toggle('is-running', autoSpinsLeft > 0 && !stopAuto);
}

function changeBet(delta) {
  if (isSpinning || inBonusMode) return;
  const nextBet = clampBet(currentBet + delta);
  const maxBet = maxBetByBalance();
  if (delta > 0 && nextBet > maxBet) {
    showToast('Saldo insuficiente');
  }
  currentBet = Math.min(nextBet, maxBet);
  updateHud();
}

function createSymbol(item, index, yStep, { highlightWild = false } = {}) {
  const symbol = document.createElement('img');
  const classNames = ['slot-symbol'];
  if (highlightWild && item.key === 'wild') classNames.push('slot-symbol--wild');
  if (isBonusSymbolKey(item.key)) classNames.push('slot-symbol--bonus');
  symbol.className = classNames.join(' ');
  symbol.src = item.file;
  symbol.alt = '';
  symbol.decoding = 'async';
  symbol.draggable = false;
  symbol.dataset.item = item.key;
  symbol.style.top = `${REEL_GRID.symbolHeight / 2 + index * yStep}px`;
  return symbol;
}

function itemByKey(key) {
  return [...REEL_ITEMS, ...BONUS_ITEMS].find((item) => item.key === key) || { key, file: '' };
}

function buildStrip(items, yStep, { highlightFinalWilds = false } = {}) {
  const strip = document.createElement('div');
  strip.className = 'reel-strip';
  strip.style.height = `${(items.length - 1) * yStep + REEL_GRID.symbolHeight}px`;

  items.forEach((item, index) => {
    strip.appendChild(createSymbol(item, index, yStep, {
      highlightWild: highlightFinalWilds && index < REEL_GRID.rows,
    }));
  });

  return strip;
}

function visibleItemsFromStrip(strip) {
  return [...strip.querySelectorAll('.slot-symbol')]
    .slice(0, REEL_GRID.rows)
    .map((symbol) => ({
      key: symbol.dataset.item,
      file: itemByKey(symbol.dataset.item).file,
    }));
}

function randomVisibleItems() {
  return Array.from({ length: REEL_GRID.rows }, () => randomItem());
}

function settleColumn(columnEl, items = randomVisibleItems()) {
  const yStep = Number(columnEl.dataset.yStep);
  columnEl.classList.remove('is-spinning', 'is-looping', 'is-suspense', 'is-chain-2', 'is-chain-3');
  columnEl.innerHTML = '';
  columnEl.appendChild(buildStrip(items, yStep, { highlightFinalWilds: true }));
}

function buildReelColumns() {
  if (!reelsLayer) return;

  reelsLayer.innerHTML = '';

  for (const geometry of reelColumnGeometries()) {
    const column = document.createElement('div');
    column.className = 'reel-column';
    column.dataset.column = String(geometry.column + 1);
    column.dataset.yStep = String(geometry.yStep);
    column.style.setProperty('--reel-x', `${geometry.x}px`);
    column.style.setProperty('--reel-y', `${geometry.y}px`);
    column.style.setProperty('--reel-w', `${geometry.width}px`);
    column.style.setProperty('--reel-h', `${geometry.height}px`);
    reelsLayer.appendChild(column);
    settleColumn(column);
  }
}

function spawnWildBurst(columnIndex, rowIndex, chainLevel) {
  if (!reelsLayer) return;

  const position = reelGridPosition(columnIndex, rowIndex);
  const burst = document.createElement('div');
  burst.className = 'wild-burst';
  burst.style.setProperty('--burst-x', `${position.x}px`);
  burst.style.setProperty('--burst-y', `${position.y}px`);
  burst.style.transform = `translate(-50%, -50%) scale(${1 + chainLevel * 0.08})`;

  const sparkCount = 12 + chainLevel * 5;
  for (let i = 0; i < sparkCount; i++) {
    const spark = document.createElement('span');
    spark.className = 'wild-spark';
    const angle = (Math.PI * 2 * i) / sparkCount + randomFloat() * 0.45;
    const distance = 42 + randomFloat() * (36 + chainLevel * 12);
    spark.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    spark.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    spark.style.setProperty('--rot', `${Math.round(randomFloat() * 720)}deg`);
    spark.style.setProperty('--spark-size', `${4 + randomFloat() * 5}px`);
    spark.style.animationDelay = `${randomIndex(100)}ms`;
    burst.appendChild(spark);
  }

  reelsLayer.appendChild(burst);
  setTimeout(() => burst.remove(), 1200);
}

function celebrateWilds(columnIndex, items, chainLevel) {
  const rows = wildRows(items);
  if (rows.length > 0) playWildSound();
  for (const row of rows) {
    spawnWildBurst(columnIndex, row, chainLevel);
  }
}

function activateSuspense(columnEl, chainLevel) {
  columnEl.classList.add('is-suspense');
  columnEl.classList.toggle('is-chain-2', chainLevel >= 2);
  columnEl.classList.toggle('is-chain-3', chainLevel >= 3);
}

function clearRemainingSuspense(columns, startIndex) {
  for (let i = startIndex; i < columns.length; i++) {
    columns[i].classList.remove('is-suspense', 'is-chain-2', 'is-chain-3');
  }
}

function resetReelState(columnEl) {
  columnEl.classList.remove('is-spinning', 'is-looping', 'is-suspense', 'is-chain-2', 'is-chain-3');
}

function clearWinHighlights() {
  paylineLayer.innerHTML = '';
  for (const symbol of reelsLayer.querySelectorAll('.slot-symbol--win')) {
    symbol.classList.remove('slot-symbol--win');
    symbol.classList.remove('slot-symbol--bonus-win');
  }
}

function makeReelRuntime(columnEl, index, { bonusMode = false } = {}) {
  const yStep = Number(columnEl.dataset.yStep);
  const poolSize = 30 + index * 2;
  const items = Array.from({ length: poolSize }, () => randomItem({ bonusMode }));
  const strip = buildStrip(items, yStep);

  columnEl.innerHTML = '';
  columnEl.appendChild(strip);
  resetReelState(columnEl);
  columnEl.classList.add('is-spinning');
  columnEl.style.setProperty('--y-step', `${yStep}px`);

  return {
    columnEl,
    index,
    strip,
    yStep,
    offset: -yStep,
    speed: BASE_REEL_SPEED,
    targetSpeed: BASE_REEL_SPEED,
    stopped: false,
    stopRequested: false,
    finalItems: null,
  };
}

function cycleRuntimeSymbols(runtime) {
  while (runtime.offset >= 0) {
    runtime.offset -= runtime.yStep;
    const last = runtime.strip.lastElementChild;
    if (!last) return;

    runtime.strip.insertBefore(last, runtime.strip.firstElementChild);
    [...runtime.strip.children].forEach((symbol, index) => {
      symbol.style.top = `${REEL_GRID.symbolHeight / 2 + index * runtime.yStep}px`;
    });
  }
}

function requestRuntimeStop(runtime) {
  if (runtime.stopRequested || runtime.stopped) return;
  runtime.stopRequested = true;
}

function finishRuntimeStop(runtime) {
  const remaining = -runtime.offset;
  const step = Math.min(Math.max(runtime.speed / 38, 6), Math.max(remaining * 0.24, 8));
  runtime.offset += step;

  if (runtime.offset >= -0.75) {
    runtime.offset = 0;
    runtime.stopped = true;
    runtime.finalItems = visibleItemsFromStrip(runtime.strip);
    const settledStrip = buildStrip(runtime.finalItems, runtime.yStep, {
      highlightFinalWilds: true,
    });
    runtime.columnEl.innerHTML = '';
    runtime.columnEl.appendChild(settledStrip);
    runtime.strip = settledStrip;
    runtime.strip.style.transform = 'translateY(0)';
    resetReelState(runtime.columnEl);
    return;
  }
  runtime.strip.style.transform = `translateY(${runtime.offset}px)`;
}

function animateRuntimes(runtimes, onComplete) {
  let lastNow = performance.now();

  function frame(now) {
    const dt = Math.min((now - lastNow) / 1000, 0.034);
    lastNow = now;

    let allStopped = true;
    for (const runtime of runtimes) {
      if (runtime.stopped) continue;

      allStopped = false;
      if (runtime.stopRequested) {
        finishRuntimeStop(runtime);
        continue;
      }

      runtime.speed += (runtime.targetSpeed - runtime.speed) * Math.min(1, dt * 5);
      runtime.offset += runtime.speed * dt;
      cycleRuntimeSymbols(runtime);
      runtime.strip.style.transform = `translateY(${runtime.offset}px)`;
    }

    if (allStopped) {
      onComplete();
      return;
    }

    activeSpin.raf = requestAnimationFrame(frame);
  }

  activeSpin.raf = requestAnimationFrame(frame);
}

function speedUpRemaining(runtimes, startIndex, chainLevel) {
  const target = BASE_REEL_SPEED + chainLevel * WILD_SPEED_BOOST;
  for (let i = startIndex; i < runtimes.length; i++) {
    if (!runtimes[i].stopped) {
      runtimes[i].targetSpeed = target;
    }
  }
}

async function runSpinTimeline(runtimes) {
  let wildChain = 0;

  for (let index = 0; index < runtimes.length; index++) {
    const runtime = runtimes[index];

    if (wildChain > 0) {
      activateSuspense(runtime.columnEl, wildChain);
      await wait(3000 + (wildChain - 1) * 650);
    } else {
      await wait(index === 0 ? 1300 : 720);
    }

    requestRuntimeStop(runtime);
    while (!runtime.stopped) {
      await wait(32);
    }

    const finalItems = runtime.finalItems || visibleItemsFromStrip(runtime.strip);
    if (hasWild(finalItems)) {
      wildChain += 1;
      celebrateWilds(index, finalItems, wildChain);
      speedUpRemaining(runtimes, index + 1, wildChain);

      if (wildChain >= 3) {
        scene.classList.add('is-bonus-tease');
      }

      await wait(420 + wildChain * 140);
    } else {
      wildChain = 0;
      clearRemainingSuspense(runtimes.map((runtimeState) => runtimeState.columnEl), index + 1);
      speedUpRemaining(runtimes, index + 1, 0);
      await wait(120);
    }
  }
}

function spinReels({ bonusMode = false } = {}) {
  const columns = [...reelsLayer.querySelectorAll('.reel-column')];
  const runtimes = columns.map((column, index) => makeReelRuntime(column, index, { bonusMode }));

  if (activeSpin?.raf) cancelAnimationFrame(activeSpin.raf);
  scene.classList.remove('is-bonus-tease');
  activeSpin = { raf: 0 };

  return new Promise((resolve) => {
    animateRuntimes(runtimes, () => {
      const result = runtimes.map((runtime) => runtime.finalItems || visibleItemsFromStrip(runtime.strip));
      activeSpin = null;
      resolve(result);
    });

    runSpinTimeline(runtimes);
  });
}

function drawWinLine(win, order) {
  const points = win.positions.map(({ column, row }) => {
    const position = reelGridPosition(column, row);
    return `${position.x},${position.y}`;
  });
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('class', 'payline-path');
  line.setAttribute('points', points.join(' '));
  line.style.animationDelay = `${order * 110}ms`;
  paylineLayer.appendChild(line);
}

function markWinningSymbols(wins) {
  const seen = new Set();
  for (const win of wins) {
    for (const { column, row } of win.positions) {
      const key = `${column}:${row}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const columnEl = reelsLayer.querySelector(`.reel-column[data-column="${column + 1}"]`);
      const symbol = columnEl?.querySelectorAll('.slot-symbol')[row];
      symbol?.classList.add('slot-symbol--win');
      if (symbol && isBonusSymbolKey(symbol.dataset.item)) {
        symbol.classList.add('slot-symbol--bonus-win');
      }
    }
  }
}

function spawnBonusBurst(columnIndex, rowIndex, multiplier) {
  if (!reelsLayer) return;

  const position = reelGridPosition(columnIndex, rowIndex);
  const burst = document.createElement('div');
  burst.className = 'bonus-burst';
  burst.style.setProperty('--burst-x', `${position.x}px`);
  burst.style.setProperty('--burst-y', `${position.y}px`);

  const label = document.createElement('span');
  label.className = 'bonus-burst__label';
  label.textContent = `x${multiplier}`;
  burst.appendChild(label);

  reelsLayer.appendChild(burst);
  setTimeout(() => burst.remove(), 1100);
}

function celebrateBonusMultipliers(wins) {
  const seen = new Set();
  let strongest = 1;
  for (const win of wins) {
    for (const bonus of win.bonusPositions || []) {
      const key = `${bonus.column}:${bonus.row}:${bonus.multiplier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      strongest = Math.max(strongest, bonus.multiplier);
      spawnBonusBurst(bonus.column, bonus.row, bonus.multiplier);
    }
  }
  if (seen.size > 0) {
    playBonusWinSound(strongest);
  }
}

function showWins(wins) {
  clearWinHighlights();
  wins.slice(0, 8).forEach(drawWinLine);
  markWinningSymbols(wins);
  celebrateBonusMultipliers(wins);
}

function ensureAudio() {
  if (!audioCtx) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioCtx = new AudioContextCtor();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration = 0.12, type = 'sine', gainValue = 0.045) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.02);
}

function playSpinSound() {
  playTone(150, 0.08, 'sawtooth', 0.025);
  setTimeout(() => playTone(210, 0.08, 'sawtooth', 0.022), 70);
}

function playWinSound() {
  [523, 659, 784, 1046].forEach((freq, index) => {
    setTimeout(() => playTone(freq, 0.12, 'triangle', 0.04), index * 90);
  });
}

function playWildSound() {
  [880, 1174, 1760].forEach((freq, index) => {
    setTimeout(() => playTone(freq, 0.1, 'square', 0.025), index * 55);
  });
}

function playBonusIntroSound() {
  [392, 523, 659, 880, 1174].forEach((freq, index) => {
    setTimeout(() => playTone(freq, 0.13, index % 2 === 0 ? 'triangle' : 'square', 0.035), index * 90);
  });
}

function playBonusWinSound(multiplier = 1) {
  const gain = multiplier >= 50 ? 0.048 : 0.034;
  [784, 987, 1318].forEach((freq, index) => {
    setTimeout(() => playTone(freq, 0.1, 'triangle', gain), index * 70);
  });
}

function playBonusRetriggerSound() {
  [659, 880, 1174, 1567, 2093].forEach((freq, index) => {
    setTimeout(() => playTone(freq, 0.12, 'square', 0.032), index * 65);
  });
}

function startMusic() {
  ensureAudio();
  if (musicTimer) return;

  const notes = [220, 261.63, 329.63, 392, 329.63, 261.63];
  let step = 0;
  musicTimer = setInterval(() => {
    if (!musicOn) return;
    playTone(notes[step % notes.length], 0.18, 'triangle', 0.018);
    if (step % 2 === 0) playTone(notes[(step + 2) % notes.length] / 2, 0.22, 'sine', 0.012);
    step += 1;
  }, 320);
}

function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

function toggleMusic() {
  musicOn = !musicOn;
  musicBtn.classList.toggle('is-on', musicOn);
  musicBtn.setAttribute('aria-pressed', String(musicOn));
  musicBtn.setAttribute('aria-label', musicOn ? 'Desactivar musica' : 'Activar musica');
  if (musicOn) startMusic();
  else stopMusic();
}

function openModal(modal) {
  updateHud();
  modal.classList.remove('game-modal--hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  modal.classList.add('game-modal--hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function closeAllModals() {
  closeModal(autoModal);
  closeModal(helpModal);
}

function preloadSceneImages() {
  const sources = [
    ...[...document.querySelectorAll('.scene-layer[src], .character[src]')].map((image) => image.src),
    ...REEL_ITEMS.map((item) => item.file),
    ...BONUS_ITEMS.map((item) => item.file),
  ];

  return Promise.all(
    sources.map((src) => {
      return new Promise((resolve) => {
        const image = new Image();
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
        image.src = src;
      });
    })
  );
}

async function playSpinCycle(stake, { bonusMode = false } = {}) {
  clearWinHighlights();
  updateHud();
  playSpinSound();

  const result = await spinReels({ bonusMode });
  await wait(120);
  const resolved = resolveSlotSpin(result, stake);
  if (resolved.wins.length > 0) {
    showWins(resolved.wins);
    playWinSound();
  }

  return {
    result,
    resolved,
    wildCount: countGridWilds(result),
    bonusCount: countGridBonusItems(result),
  };
}

function flashBonusFrenzy(ms = 1800) {
  scene.classList.add('is-bonus-frenzy');
  window.setTimeout(() => {
    scene.classList.remove('is-bonus-frenzy');
  }, ms);
}

async function runBonusMode(stake) {
  inBonusMode = true;
  bonusStake = stake;
  bonusTotalWin = 0;
  bonusSpinsLeft += BONUS_FREE_SPINS;
  stopAuto = true;
  playBonusIntroSound();
  flashBonusFrenzy(2300);
  showToast(`BONUS ACTIVADO: ${BONUS_FREE_SPINS} giros gratis`, 2600);
  updateHud();
  await wait(950);

  while (bonusSpinsLeft > 0) {
    bonusSpinsLeft -= 1;
    updateHud();
    showToast(`Giro gratis: quedan ${bonusSpinsLeft}`, 1050);

    const { resolved, wildCount, bonusCount } = await playSpinCycle(bonusStake, {
      bonusMode: true,
    });

    if (resolved.payout > 0) {
      bonusTotalWin = Math.round((bonusTotalWin + resolved.payout) * 100) / 100;
      lastWin = bonusTotalWin;
      wallet.credit(resolved.payout);
      pushPlayerResult(bonusStake, resolved.payout);
      showToast(`Bonus +${formatMoney(resolved.payout)} · Total ${formatMoney(bonusTotalWin)}`, 1900);
    } else if (bonusCount > 0) {
      showToast('Multiplicador sin linea', 1200);
    }

    if (wildCount >= BONUS_TRIGGER_WILDS) {
      bonusSpinsLeft += BONUS_RETRIGGER_SPINS;
      playBonusRetriggerSound();
      flashBonusFrenzy(2600);
      showToast(`4 WILDS: +${BONUS_RETRIGGER_SPINS} giros gratis`, 2400);
    }

    updateHud();
    await wait(resolved.payout > 0 || wildCount >= BONUS_TRIGGER_WILDS ? 1250 : 650);
  }

  inBonusMode = false;
  bonusStake = 0;
  scene.classList.remove('is-bonus-frenzy');
  showToast(`Bonus terminado: ${formatMoney(bonusTotalWin)}`, 2600);
  updateHud();
  await wait(500);
}

async function spin() {
  if (isSpinning || currentBet <= 0) return false;
  if (!wallet.canBet(currentBet)) {
    showToast('Saldo insuficiente');
    updateHud();
    return false;
  }

  const stake = currentBet;
  if (!wallet.placeBet(stake)) {
    showToast('Saldo insuficiente');
    updateHud();
    return false;
  }

  isSpinning = true;
  lastWin = 0;
  const { resolved, wildCount } = await playSpinCycle(stake);
  lastWin = resolved.payout;
  wallet.settle(stake, lastWin);
  if (resolved.wins.length > 0) {
    showToast(`Ganaste ${formatMoney(lastWin)}`);
    pushPlayerResult(stake, lastWin);
  }

  if (wildCount >= BONUS_TRIGGER_WILDS) {
    await runBonusMode(stake);
  }

  isSpinning = false;
  updateHud();
  return true;
}

async function runAutoSpins(count) {
  if (currentBet <= 0 || isSpinning) return;
  if (!wallet.canBet(currentBet)) {
    showToast('Saldo insuficiente');
    updateHud();
    return;
  }
  autoSpinsLeft = count;
  stopAuto = false;
  closeModal(autoModal);
  updateHud();

  while (autoSpinsLeft > 0 && !stopAuto && currentBet > 0 && wallet.canBet(currentBet)) {
    const didSpin = await spin();
    if (!didSpin) break;
    autoSpinsLeft -= 1;
    updateHud();
    if (autoSpinsLeft > 0 && !stopAuto) await wait(650);
  }

  if (autoSpinsLeft > 0 && !wallet.canBet(currentBet)) {
    showToast('Saldo insuficiente');
  }
  autoSpinsLeft = 0;
  stopAuto = false;
  updateHud();
}

betDownBtn.addEventListener('click', () => changeBet(-BET_STEP));
betUpBtn.addEventListener('click', () => changeBet(BET_STEP));
spinBtn.addEventListener('click', spin);
autoSpinBtn.addEventListener('click', () => openModal(autoModal));
helpBtn.addEventListener('click', () => openModal(helpModal));
topHelpBtn?.addEventListener('click', () => openModal(helpModal));
musicBtn.addEventListener('click', toggleMusic);
stopAutoBtn.addEventListener('click', () => {
  stopAuto = true;
  closeModal(autoModal);
  updateHud();
});
autoChoiceBtns.forEach((button) => {
  button.addEventListener('click', () => runAutoSpins(Number(button.dataset.autospins)));
});
document.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', closeAllModals);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAllModals();
});

(async function init() {
  buildRulesPaytable();
  buildTickerSeed();
  wallet.onChange(updateHud);
  fitScene();
  updatePcLock();
  applyUiAreas();
  updateHud();
  window.addEventListener('resize', () => {
    fitScene();
    updatePcLock();
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      fitScene();
      updatePcLock();
    }, 200);
  });
  window.setInterval(() => {
    if (!tickerContent) return;
    const template = document.createElement('template');
    template.innerHTML = tickerItemHTML(genFakeTickerWin()).trim();
    const item = template.content.firstElementChild;
    tickerContent.insertBefore(item, tickerContent.firstChild);
    while (tickerContent.children.length > 64) {
      tickerContent.removeChild(tickerContent.lastChild);
    }
  }, 4800);

  await Promise.all([
    preloadSceneImages(),
    showSplash({ durationMs: 1400, title: 'LUCK' }),
  ]);

  buildReelColumns();
})();
