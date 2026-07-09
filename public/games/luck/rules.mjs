// ===== Zenythic - Luck rules/config (pure module) =====
// Game logic will live here. For the visual assembly pass, this module exports
// the fixed scene contract and the canonical layer order.

export const SCENE_WIDTH = 1246;
export const SCENE_HEIGHT = 701;

export const CHARACTER_LAYER = 4;

export const REEL_GRID = {
  columns: 5,
  rows: 3,
  firstCenter: { x: 356, y: 254 },
  lastCenter: { x: 1000, y: 542 },
  symbolWidth: 135,
  symbolHeight: 121.5,
};

export const REEL_ITEMS = [
  { key: 'bar', file: './assets/items/item_bar.png' },
  { key: 'bell', file: './assets/items/item_bell.png' },
  { key: 'cherry', file: './assets/items/item_cherry.png' },
  { key: 'coin', file: './assets/items/item_coin.png' },
  { key: 'crown', file: './assets/items/item_crown.png' },
  { key: 'diamond', file: './assets/items/item_diamond.png' },
  { key: 'star', file: './assets/items/item_star.png' },
  { key: 'wild', file: './assets/items/item_wild.png' },
  { key: 'z', file: './assets/items/item_z.png' },
];

export const BONUS_ITEMS = [
  { key: 'bonus_x1', file: './assets/items/item_bonus_x1.png' },
  { key: 'bonus_x2', file: './assets/items/item_bonus_x2.png' },
  { key: 'bonus_x3', file: './assets/items/item_bonus_x3.png' },
  { key: 'bonus_x5', file: './assets/items/item_bonus_x5.png' },
  { key: 'bonus_x10', file: './assets/items/item_bonus_x10.png' },
  { key: 'bonus_x20', file: './assets/items/item_bonus_x20.png' },
  { key: 'bonus_x50', file: './assets/items/item_bonus_x50.png' },
  { key: 'bonus_x100', file: './assets/items/item_bonus_x100.png' },
  { key: 'bonus_x500', file: './assets/items/item_bonus_x500.png' },
];

export const BONUS_FREE_SPINS = 8;
export const BONUS_RETRIGGER_SPINS = 3;
export const BONUS_TRIGGER_WILDS = 4;
export const MAX_BONUS_LINE_MULTIPLIER = 500;

export const BET_STEP = 10;
export const MIN_BET = 0;
export const MAX_BET = 1000;

export const JACKPOT_MULTIPLIERS = {
  grand: 1000,
  major: 100,
  minor: 20,
};

export const UI_AREAS = {
  grandPrize: { x: 332, y: 144, width: 209, height: 28 },
  majorPrize: { x: 970, y: 147, width: 191, height: 26 },
  minorPrize: { x: 970, y: 76, width: 191, height: 26 },
  betDisplay: { x: 427, y: 657, width: 91, height: 48 },
  betDown: { x: 347, y: 654, width: 64, height: 61 },
  betUp: { x: 507, y: 654, width: 64, height: 61 },
  autoSpinButton: { x: 849, y: 653, width: 64, height: 61 },
  spinButton: { x: 995, y: 654, width: 155, height: 70 },
  winDisplay: { x: 674, y: 656, width: 152, height: 50 },
  helpButton: { x: 1193, y: 53, width: 64, height: 61 },
  musicButton: { x: 1196, y: 132, width: 64, height: 61 },
};

export const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [0, 2, 1, 2, 0],
];

export const PAYTABLE = {
  wild: { 3: 12, 4: 60, 5: 300 },
  z: { 3: 8, 4: 40, 5: 180 },
  diamond: { 3: 6, 4: 28, 5: 120 },
  crown: { 3: 5, 4: 22, 5: 90 },
  star: { 3: 4, 4: 18, 5: 70 },
  bell: { 3: 3, 4: 12, 5: 45 },
  bar: { 3: 3, 4: 10, 5: 40 },
  coin: { 3: 2, 4: 8, 5: 30 },
  cherry: { 3: 1, 4: 5, 5: 20 },
};

export const SCENE_LAYERS = [
  {
    order: 1,
    key: 'background',
    file: './assets/scenes/capa1_fondo.webp',
  },
  {
    order: 2,
    key: 'jackpots',
    file: './assets/scenes/capa2_multiplicadores.webp',
  },
  {
    order: 3,
    key: 'machineBackground',
    file: './assets/scenes/capa3_fondo.webp',
  },
  {
    order: 3.1,
    key: 'machine',
    file: './assets/scenes/capa3_maquina.webp',
  },
  {
    order: 5,
    key: 'bottomControls',
    file: './assets/scenes/capa5_botonesInferiores.webp',
  },
  {
    order: 6,
    key: 'playerBadge',
    file: './assets/scenes/capa6_iconoPJ.webp',
  },
  {
    order: 7,
    key: 'topRightButtons',
    file: './assets/scenes/capa7_BotonesARRIBADERECHA.webp',
  },
];

export function sceneLayerOrder() {
  return SCENE_LAYERS.map((layer) => layer.order);
}

export function reelGridPosition(column, row) {
  const { xStep, yStep } = reelGridSpacing();

  return {
    column,
    row,
    x: REEL_GRID.firstCenter.x + xStep * column,
    y: REEL_GRID.firstCenter.y + yStep * row,
  };
}

export function reelGridSpacing() {
  return {
    xStep: (REEL_GRID.lastCenter.x - REEL_GRID.firstCenter.x) / (REEL_GRID.columns - 1),
    yStep: (REEL_GRID.lastCenter.y - REEL_GRID.firstCenter.y) / (REEL_GRID.rows - 1),
  };
}

export function reelColumnGeometry(column) {
  const { yStep } = reelGridSpacing();
  const x = reelGridPosition(column, 0).x;
  const firstY = REEL_GRID.firstCenter.y;
  const lastY = REEL_GRID.lastCenter.y;

  return {
    column,
    x,
    y: (firstY + lastY) / 2,
    width: REEL_GRID.symbolWidth,
    height: lastY - firstY + REEL_GRID.symbolHeight,
    yStep,
  };
}

export function reelColumnGeometries() {
  return Array.from({ length: REEL_GRID.columns }, (_, column) => reelColumnGeometry(column));
}

export function reelGridPositions() {
  const positions = [];
  for (let row = 0; row < REEL_GRID.rows; row++) {
    for (let column = 0; column < REEL_GRID.columns; column++) {
      positions.push(reelGridPosition(column, row));
    }
  }
  return positions;
}

export function activeLineBet(totalBet) {
  if (totalBet <= 0) return 0;
  return totalBet / PAYLINES.length;
}

export function isBonusSymbolKey(key) {
  return typeof key === 'string' && key.startsWith('bonus_x');
}

export function bonusMultiplierFromKey(key) {
  if (!isBonusSymbolKey(key)) return 1;
  const multiplier = Number(key.replace('bonus_x', ''));
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

export function resolvePayline(symbols, lineIndex, totalBet) {
  const line = PAYLINES[lineIndex];
  const lineSymbols = line.map((row, column) => symbols[column]?.[row]?.key);
  let best = null;

  for (const symbolKey of Object.keys(PAYTABLE)) {
    let count = 0;
    const bonusPositions = [];
    let bonusMultiplier = 1;

    for (const landedKey of lineSymbols) {
      if (landedKey !== symbolKey && landedKey !== 'wild' && !isBonusSymbolKey(landedKey)) break;

      if (isBonusSymbolKey(landedKey)) {
        const lineRow = line[count];
        bonusPositions.push({
          column: count,
          row: lineRow,
          multiplier: bonusMultiplierFromKey(landedKey),
        });
        bonusMultiplier *= bonusMultiplierFromKey(landedKey);
      }
      count += 1;
    }

    if (count < 3) continue;

    const multiplier = PAYTABLE[symbolKey][count] || 0;
    if (multiplier <= 0) continue;

    bonusMultiplier = Math.min(bonusMultiplier, MAX_BONUS_LINE_MULTIPLIER);
    const basePayout = activeLineBet(totalBet) * multiplier;
    const payout = basePayout * bonusMultiplier;
    if (!best || payout > best.payout) {
      best = {
        lineIndex,
        symbolKey,
        count,
        multiplier,
        bonusMultiplier,
        bonusPositions,
        basePayout,
        payout,
        rows: line.slice(0, count),
        positions: line.slice(0, count).map((row, column) => ({ column, row })),
      };
    }
  }

  if (!best) return null;
  return { ...best, payout: Math.round(best.payout * 100) / 100 };
}

export function resolveSlotSpin(symbols, totalBet) {
  const wins = PAYLINES
    .map((_, lineIndex) => resolvePayline(symbols, lineIndex, totalBet))
    .filter(Boolean);
  const payout = wins.reduce((sum, win) => sum + win.payout, 0);
  return {
    wins,
    payout: Math.round(payout * 100) / 100,
    lineBet: activeLineBet(totalBet),
  };
}

export function clampBet(amount) {
  const stepped = Math.round(amount / BET_STEP) * BET_STEP;
  return Math.min(Math.max(stepped, MIN_BET), MAX_BET);
}

export function resolveTestSpinPayout(stake, rngValue) {
  if (stake <= 0) return 0;

  const r = clamp01(rngValue);
  let multiplier = 0;
  if (r > 0.995) multiplier = 10;
  else if (r > 0.97) multiplier = 5;
  else if (r > 0.9) multiplier = 2;
  else if (r > 0.75) multiplier = 1;
  else if (r > 0.55) multiplier = 0.5;

  return Math.round(stake * multiplier);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
