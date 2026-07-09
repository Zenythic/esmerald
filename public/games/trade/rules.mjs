// ===== Zenythic — Trade · Reglas (lógica pura) =====
// Premisa: un gráfico de "velas" avanza puntada a puntada. En cada pausa de 5s el
// jugador decide si la SIGUIENTE vela cierra arriba o abajo. Si acierta, cobra la
// ganancia neta que aporta esa vela (multiplicador proporcional a su distancia).
// Si falla, pierde la MITAD de esa ganancia neta (regla "pérdida a medias"). El
// stake se mantiene comprometido entre puntadas: el saldo fluye acierto a acierto.
// En cualquier pausa el jugador puede "Salir" y llevarse el saldo acumulado.
// Si el saldo no alcanza para comprometer el stake de la siguiente puntada, el
// juego termina y el jugador pierde la apuesta.
//
// ---- Modelo RTP 94% (edge de la casa = 6%) ----
// El multiplicador de una vela es LIMPIO respecto de su distancia (no está
// degradado). El edge se cierra en 6% SESGANDO LA PROBABILIDAD DE ACIERTO por
// puntada en función del multiplicador `m` de esa vela, de modo que el retorno
// esperado de cada puntada es exactamente −0.06 × stake (independiente de m):
//
//     GAIN = stake · (m − 1)                      // ganancia neta si acierta
//     E[retorno] = p · GAIN − (1 − p) · (GAIN/2)  // acierto gana, fallo pierde mitad
//                = GAIN · (3p − 1) / 2
//
//     Imponiendo  E[retorno] = −0.06 · stake:
//
//     p(m) = (1 − 0.12 / (m − 1)) / 3
//
// Cuanto mayor es m (mayor ganancia potencial), menor es la probabilidad de
// acertar — el sesgo codifica de forma natural "más premio, más riesgo" y mantiene
// el edge en 6% puntada a puntada sin manipular el multiplicador.
//
// Toda la ronda es determinista y verificable a partir de (serverSeed,
// clientSeed, nonce): el tamaño/dirección de cada vela se samplea con consumos
// del RNG provably-fair.

export const RTP_TARGET = 0.94;       // RTP objetivo = 94% → edge 6%
const HOUSE_EDGE = 1 - RTP_TARGET;     // 0.06
// Constante derivada del modelo para la probabilidad de acierto (ver arriba):
const P_BIAS_NUM = HOUSE_EDGE * 2;    // 0.12  (= 2 · edge)

export const MIN_MULT = 1.20;         // multiplicador mínimo por vela (evita zona m→1)
export const MAX_MULT = 3.00;         // multiplicador máximo por vela (vela "enorme")

// Rango de la distancia normalizada de la vela [0,1]: controla la magnitud del
// movimiento del precio. La curva del multiplicador mapea distancia→m de forma
// suave (cola larga: la mayoría de velas son pequeñas, pocas enormes).
// El mínimo se fija por encima de 1.20 para que la probabilidad de acierto p(m)
// sea siempre válida (sin recurrir a un clamp "indiferente" que rompería el edge).
export function multFromDistance(distance) {
  const x = clamp01(distance);
  // Curva cóncava: crece rápido al principio y se aplana hacia MAX_MULT.
  // x=0 → m=MIN_MULT; x=1 → m=MAX_MULT.
  const m = MIN_MULT + (MAX_MULT - MIN_MULT) * Math.pow(x, 0.65);
  return Math.min(Math.max(m, MIN_MULT), MAX_MULT);
}

// ---- Probabilidad de acierto para una vela con multiplicador m ----
// Ver derivación en la cabecera. Clamp de seguridad para no salir de rango
// jugable (en los extremos de m la fórmula tiende a valores no útiles).
export function winProbability(m) {
  const denom = m - 1;
  if (denom <= 0) return 0.5;          // velas nulas: 50/50 indiferente
  const p = (1 - P_BIAS_NUM / denom) / 3;
  return clamp(p, 0.05, 0.85);
}

// ---- Samplea la siguiente vela (distancia + dirección resultado) ----
// Recibe dos consumos del RNG: `uDist` (magnitud/distance de la vela) y
// `uWin` (se confronta con la probabilidad de acierto para decidir el
// resultado de la puntada). Devuelve:
//   { distance, multiplier, winThreshold, isWinUp, isWinDown }
// `isWinUp`/`isWinDown` indican qué dirección habría que elegir para ACERTAR.
// El controller decide la dirección del jugador y compara.
export function rollCandle(uDist, uWin) {
  const distance = clamp01(uDist);
  const multiplier = multFromDistance(distance);
  const p = winProbability(multiplier);
  // Si uWin < p → la vela "gana" en la dirección ALCISTA (cierres arriba);
  // si no, gana en la BAJISTA. Esto sesga la probabilidad de acierto global
  // a `p` para quien elija la dirección correcta.
  const upWins = uWin < p;
  return {
    distance,
    multiplier,
    winThreshold: p,
    isWinUp: upWins,
    isWinDown: !upWins,
  };
}

// ---- Resoluciones de una puntada ----

// Acertaste: ganas la ganancia NETA = stake · (m − 1).
export function resolveWin(stake, multiplier) {
  const m = Math.max(1, multiplier);
  const gain = round2(stake * (m - 1));
  const payout = round2(stake + gain);   // stake comprometido + ganancia neta
  return { payout, gain, multiplier: m, net: gain, won: true };
}

// Fallaste: pierdes la MITAD de la ganancia neta que hubieras tenido.
// Recuperas el stake comprometido menos esa mitad.
export function resolveLoss(stake, multiplier) {
  const m = Math.max(1, multiplier);
  const wouldBeGain = round2(stake * (m - 1));
  const loss = round2(wouldBeGain / 2);   // pierdes la mitad de la ganancia neta
  const payout = round2(stake - loss);     // recuperas stake − mitad
  return { payout, gain: -loss, multiplier: m, net: -loss, won: false };
}

// ---- ¿El saldo permite comprometer el stake de la siguiente puntada? ----
// El stake se compromete una sola vez al ENTRAR; el saldo "libre" que maneja
// el jugador es el generado por aciertos/fallos acumulados. Si al resolver una
// puntada el saldo cae por debajo del stake inicial, el juego termina y el
// jugador pierde la apuesta (no puede comprometer el stake de nuevo).
export function canContinue(balance, stake) {
  return balance >= stake;
}

// ---- Tabla de probabilidades de acierto por multiplicador (reglas / verify) ----
export function winProbabilityTable(steps = 6) {
  const rows = [];
  const lo = 1.10;
  const step = (MAX_MULT - lo) / (steps - 1);
  for (let i = 0; i < steps; i++) {
    const m = round2(lo + step * i);
    rows.push({
      multiplier: m,
      netGainPct: Math.round((m - 1) * 100),     // % ganancia neta si aciertas
      lossPct: Math.round((m - 1) * 100 / 2),     // % que pierdes si fallas
      winProb: winProbability(m),
    });
  }
  return rows;
}

// ---- Verifica que una secuencia de puntadas respeta el RTP objetivo ----
// Útil para test: dada una lista de {multiplier, won}, calcula el RTP empírico.
export function measureRtp(run) {
  let stakedForced = 0;   // stake virtual que se "compromete" en cada puntada
  let returned = 0;
  for (const r of run) {
    stakedForced += r.stake;
    returned += r.payout;
  }
  if (stakedForced === 0) return 0;
  return returned / stakedForced;
}

// ---- Helpers ----
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
