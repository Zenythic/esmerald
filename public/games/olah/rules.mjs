// ===== Zenythic — Olah · Reglas (lógica pura) =====
// Premisa: el barco "FORTUNA" remonta olas una tras otra. El multiplicador sube
// de forma CONTINUA (estilo crash) mientras el barco escala cada ola. El jugador
// puede detenerse en cualquier instante y cobrar el multiplicador en vivo. Si la
// ola supera al barco (el multiplicador alcanza el umbral de hundimiento), este
// se hunde y pierde todo.
//
// Modelo provably-fair (crash): al iniciar la ronda se samplea un UMBRAL DE
// HUNDIMIENTO C a partir del RNG:
//     C = clamp( RTP / u , RTP , MAX_MULT )
// El barco se hunde en el instante en que el multiplicador en vivo m(t) >= C.
// La probabilidad de sobrevivir hasta el multiplicador m es P(m < C) = RTP / m
// (para m >= RTP), lo que fija el edge de la casa en (1 - RTP).
//
// Las OLAS son hitos visuales con TAMAÑO aleatorio (pequeña/mediana/grande/enorme).
// Cada ola aporta un SALTO de multiplicador proporcional a su tamaño: las olas
// grandes suben más rápido el multiplicador → alcanzan C antes → más peligro.
// Así, el tamaño de la ola codifica de forma natural "más multiplicador, más riesgo".

export const RTP_TARGET = 0.95;
export const MAX_MULT = 50;          // tope de la barra de multiplicador (gran ola)
export const MIN_CRASH = 1.0;         // nunca se hunde por debajo de 1x (arranque garantizado)

// Tamaños de ola: peso (probabilidad), step (salto que se AÑADE al multiplicador
// en vivo al coronar la ola) y climbMs (duración visual relativa del remonte).
// Olas más grandes = step mayor = llegan antes a C = más riesgo.
const WAVE_SIZES = [
  { key: 'small',  label: 'Pequeña', weight: 0.50, step: 0.10, climbMs: 1150 },
  { key: 'medium', label: 'Mediana', weight: 0.28, step: 0.22, climbMs: 1450 },
  { key: 'large',  label: 'Grande',  weight: 0.15, step: 0.45, climbMs: 1750 },
  { key: 'huge',   label: 'Enorme',  weight: 0.07, step: 0.90, climbMs: 2050 },
];

// ---- Umbral de hundimiento (punto de crash) ----
// Determinista a partir de un valor del RNG en [0,1).
export function rollCrashThreshold(rngValue) {
  if (rngValue <= 0) return MAX_MULT; // suerte máxima: el barco llega al tope
  const c = RTP_TARGET / rngValue;
  return Math.min(Math.max(c, MIN_CRASH), MAX_MULT);
}

// ---- Tamaño de la siguiente ola ----
// Determinista a partir de un valor del RNG en [0,1).
export function rollWaveSize(rngValue) {
  const r = clamp01(rngValue);
  let acc = 0;
  for (const s of WAVE_SIZES) {
    acc += s.weight;
    if (r < acc) return s;
  }
  return WAVE_SIZES[WAVE_SIZES.length - 1];
}

// ---- ¿El multiplicador en vivo alcanza el umbral de hundimiento? ----
export function isSinking(liveMult, crashThreshold) {
  return liveMult >= crashThreshold;
}

// ---- Multiplicador en vivo durante el remonte de una ola ----
// base    = multiplicador al coronar la ola anterior (empieza en 1).
// step    = salto que aporta esta ola.
// progress = 0..1 (0 = pie de la ola, 1 = cresta).
// Easing: el barco arranca con ímpetu y frena al acercarse a la cresta
// (tensión: ¿logrará coronarla?). easeOutQuad.
export function liveMultiplier(base, step, progress) {
  const x = clamp01(progress);
  const e = 1 - (1 - x) * (1 - x);
  return base + step * e;
}

// ---- Resoluciones de pago ----

// Detención voluntaria: cobra apuesta × multiplicador en vivo.
export function resolveCashout(stake, multiplier) {
  const m = Math.max(1, multiplier);
  const payout = Math.round(stake * m * 100) / 100;
  return { payout, multiplier: m, net: payout - stake, busted: false, maxed: false };
}

// Hundimiento: pierde todo.
export function resolveSink(stake) {
  return { payout: 0, multiplier: 0, net: -stake, busted: true, maxed: false };
}

// Gran ola: alcanza el multiplicador máximo sin hundirse.
export function resolveMaxed(stake) {
  const payout = Math.round(stake * MAX_MULT * 100) / 100;
  return { payout, multiplier: MAX_MULT, net: payout - stake, busted: false, maxed: true };
}

// ---- Tabla de tamaños de ola (para el modal de reglas / verificación) ----
export function waveSizesTable() {
  return WAVE_SIZES.map((s) => ({ ...s }));
}

// ---- Helpers ----
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
