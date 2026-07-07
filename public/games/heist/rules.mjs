// ===== Zenythic — Heist · Reglas (lógica pura) =====
// Premisa: ladrón abriendo cajas fuertes. Cada caja tiene un MULTIPLICADOR ALEATORIO
// dentro de un rango que crece con la profundidad. El jugador no sabe cuánto va a sacar
// hasta abrir — la esperanza del "quizás esta me da x50" es el motor del juego.
//
// RTP = 95%. Calibración por caja:
//   (1 - failChance) × E[multiplicador] = 0.95
//   => failChance = 1 - 0.95 / E[multiplicador]
//
// donde E[m] = multMin + (multMax - multMin) × alpha/(alpha+1)
//
// Las cajas NO muestran rango ni probabilidad — solo el multiplicador al abrir con éxito.
// Máximo 10 cajas. Multiplicadores se ACUMULAN (producto).

export const MAX_VAULTS = 10;
export const RTP_TARGET = 0.95;

// Rangos por caja + sesgo (alpha). El sesgo aplasta la distribución hacia el mínimo,
// pero deja una cola larga que llega al máximo — la esperanza del gran golpe.
// Los failChance se DERIVAN automáticamente abajo para garantizar RTP=95%.
const VAULT_CONFIG = [
  // [multMin, multMax, alpha]   — alpha bajo = más sesgo a valores bajos
  [1.05, 1.35, 0.50],  // caja 1
  [1.10, 1.65, 0.48],  // caja 2
  [1.15, 2.10, 0.46],  // caja 3
  [1.20, 2.80, 0.44],  // caja 4
  [1.30, 3.80, 0.42],  // caja 5
  [1.40, 5.50, 0.40],  // caja 6
  [1.55, 8.00, 0.38],  // caja 7
  [1.70, 12.00, 0.36], // caja 8
  [1.90, 20.00, 0.34], // caja 9
  [2.20, 50.00, 0.32], // caja 10
];

// Valor esperado del multiplicador de la caja i (con sesgo alpha).
function expectedMult(openedCount) {
  const [min, max, alpha] = VAULT_CONFIG[Math.min(openedCount, VAULT_CONFIG.length - 1)];
  return min + (max - min) * (alpha / (alpha + 1));
}

// failChance derivado para RTP=95% por caja.
function derivedFailChance(openedCount) {
  const e = expectedMult(openedCount);
  return Math.max(0.01, Math.min(0.97, 1 - RTP_TARGET / e));
}

// Tabla pre-calculada (exportada para verificación / UI interna).
export const VAULT_TABLE = VAULT_CONFIG.map(([min, max, alpha], i) => {
  const eMult = min + (max - min) * (alpha / (alpha + 1));
  const fail = derivedFailChance(i);
  return { multMin: min, multMax: max, alpha, eMult, failChance: fail };
});

export function vaultConfig(openedCount) {
  return VAULT_TABLE[Math.min(openedCount, VAULT_TABLE.length - 1)];
}

export function canOpen(openedCount) {
  return openedCount < MAX_VAULTS;
}

export function accumulatedMultiplier(wins) {
  return wins.reduce((acc, m) => acc * m, 1);
}

// Multiplicador aleatorio sesgado a bajo, con cola larga hacia el máximo.
export function rollMultiplier(openedCount, rngValue) {
  const cfg = vaultConfig(openedCount);
  const t = Math.pow(clamp01(rngValue), 1 / cfg.alpha);
  const mult = cfg.multMin + t * (cfg.multMax - cfg.multMin);
  return Math.round(mult * 100) / 100;
}

// Momento de fallo durante la animación del dial (0 = inicio, 1 = final).
export function rollFailPoint(rngValue) {
  return clamp01(rngValue);
}

// Determina el resultado de abrir la siguiente caja.
// Consume failRoll (para fail/éxito) y multRoll (para el multiplicador).
export function openVault(openedCount, wins, failRoll, multRoll) {
  const cfg = vaultConfig(openedCount);

  if (failRoll < cfg.failChance) {
    return {
      success: false,
      failPoint: rollFailPoint(failRoll / cfg.failChance),
      multiplier: 0,
      accumulated: accumulatedMultiplier(wins),
    };
  }
  const mult = rollMultiplier(openedCount, multRoll);
  return {
    success: true,
    multiplier: mult,
    accumulated: accumulatedMultiplier([...wins, mult]),
  };
}

export function cashoutMultiplier(wins) {
  return accumulatedMultiplier(wins);
}

export function resolvePayout(stake, wins, busted) {
  if (busted) return { payout: 0, multiplier: 0, net: -stake };
  const mult = cashoutMultiplier(wins);
  const payout = Math.round(stake * mult * 100) / 100;
  return { payout, multiplier: mult, net: payout - stake };
}

export function getTableState(openedCount, wins) {
  const cfg = vaultConfig(openedCount);
  const accumulated = accumulatedMultiplier(wins);
  return {
    opened: openedCount,
    remaining: MAX_VAULTS - openedCount,
    accumulated,
    nextRange: { min: cfg.multMin, max: cfg.multMax },
    nextFailChance: cfg.failChance,
    canOpen: canOpen(openedCount),
  };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
