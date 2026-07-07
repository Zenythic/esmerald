// ===== Zenythic — Callejero 9 · Reglas (lógica pura) =====
// Variante de baccarat. La Banca es siempre la casa (Zenythic) y no rota.
// 3 plazas jugables por el HUMANO, ordenadas izq→der. La casa cubre las apuestas activas.
//
// Reglas implementadas:
//  - Cada plaza jugable + banca recibe 2 cartas. Plazas no apostadas también se
//    reparten (forman parte del mazo) pero no se resuelven contra la casa.
//  - Natural: 8 o 9 con las dos primeras cartas.
//  - Pedir/Plantar plaza: 0–5 obliga a pedir; 6–7 se planta. El jugador decide
//    libremente por cada plaza apostada (recorrido izq→der).
//  - Banca: ≤5 pide tercera; 6–7 se planta.
//  - Puntuación: módulo 10 del valor baccarat (solo 0–9).
//  - Comparación individual: mayor puntaje gana la apuesta de la plaza.
//    Empate → devuelve la apuesta (sin ganancia).
//  - Excepción: si la casa obtiene un NATURAL DE 9 (9 con sus dos primeras cartas)
//    gana a todas las plazas, incluso si la plaza también suma 9 (natural o no).
//    Si la plaza suma 9 natural y la casa llega a 9 tras pedir (no natural), es empate.
//
// Esta lógica es 100% testeable en Node sin DOM.

import { baccaratValue } from '../_shared/deck.mjs';

export const POSITIONS = ['player1', 'player2', 'player3', 'bank'];

// Puntaje de una mano: suma de valores baccarat módulo 10 → 0..9
export function handScore(hand) {
  const sum = hand.reduce((acc, c) => acc + baccaratValue(c), 0);
  return sum % 10;
}

// ¿Es un natural (8 o 9 con las dos primeras cartas)?
export function isNatural(hand) {
  if (hand.length !== 2) return false;
  const s = handScore(hand);
  return s === 8 || s === 9;
}

// Decisión obligatoria de una mano según sus 2 cartas.
// true = pedir tercera carta, false = plantarse.
export function mustDrawThird(hand) {
  const s = handScore(hand);
  return s <= 5; // 0..5 pide, 6..7 planta
}

// Decisión de la casa (banca) tras sus 2 cartas.
export function bankMustDrawThird(bankHand) {
  return mustDrawThird(bankHand); // misma regla: ≤5 pide
}

// ¿Tiene la casa un natural de 9 con sus dos primeras cartas?
function bankHasNatural9(bankHand) {
  return bankHand.length === 2 && handScore(bankHand) === 9;
}

// Resolución de una mano de plaza contra la casa.
// Devuelve { outcome: 'win'|'lose'|'tie', playerScore, bankScore, payout }
//   payout = cuánto recibe el jugador (incluye su stake si gana o empata).
//   stake es la apuesta original de la plaza en esa mano.
//   bankNatural9 (bool): true si la casa tiene natural de 9 (9 con sus 2 primeras
//   cartas). En ese caso, ante un empate en 9 la casa gana.
export function resolveHand(playerHand, bankHand, stake, bankNatural9 = false) {
  const playerScore = handScore(playerHand);
  const bankScore = handScore(bankHand);
  let outcome;
  if (bankNatural9 && bankScore === 9 && playerScore === 9) {
    // Natural de 9 de la casa: gana incluso contra otro 9.
    outcome = 'lose';
  } else if (playerScore > bankScore) outcome = 'win';
  else if (playerScore < bankScore) outcome = 'lose';
  else outcome = 'tie';

  const payout =
    outcome === 'win' ? stake * 2 :   // recupera stake + gana igual
    outcome === 'tie' ? stake * 1 :   // recupera stake
    0;                                 // pierde

  return { outcome, playerScore, bankScore, payout };
}

// Apuesta de resultado: el jugador predice el puntaje final (0-9) de SU mano
// en una plaza. Si acierta, cobra 4× la apuesta de resultado.
//   predicted: número 0-9 que eligió el jugador.
//   playerHand: mano final del jugador en esa plaza.
//   stake: apuesta de resultado apostada.
// Devuelve { hit: bool, payout } (payout incluye el stake si acierta).
//
// Una plaza puede tener apuesta principal + apuesta de resultado de forma
// independiente: si no hay apuesta principal (stake=0), el resultado de la
// plaza sólo se mide contra el número predicho y NO se compara con la banca.
export function resolveOutcomeBet(predicted, playerHand, stake) {
  const playerScore = handScore(playerHand);
  const hit = predicted === playerScore;
  const payout = hit ? stake * 4 : 0; // 4× la apuesta (no recupera stake si falla)
  return { hit, playerScore, payout };
}

// Ejecuta una ronda completa DADO un mazo ya creado. Devuelve el estado final.
// seats: { player1: {type, stake, wantsThird?, outcome?: {val, stake}}, player2, player3 }
//   stake=0 + outcome.stake=0  → plaza no apostada (se reparte, no se resuelve contra la casa).
//   type 'human' respeta wantsThird; cualquier otro tipo sigue mustDrawThird.
//   outcome.val es la predicción 0-9 del jugador; outcome.stake es la apuesta de resultado.
//   Si la casa tiene natural de 9, se resuelve al instante y gana ante cualquier 9 de plaza.
// Devuelve { hands, naturals, earlyResolve, drawn, results }
//   results[p] = { outcome, playerScore, bankScore, payout, outcomeHit, outcomePayout }
export async function playRound(deck, seats) {
  const hands = {
    player1: [],
    player2: [],
    player3: [],
    bank: [],
  };
  for (let i = 0; i < 2; i++) {
    for (const pos of POSITIONS) {
      hands[pos].push(await deck.draw());
    }
  }

  const naturals = {};
  for (const pos of POSITIONS) naturals[pos] = isNatural(hands[pos]);

  // Si la banca tiene natural, resuelve al instante (sin pedir/plantar).
  let earlyResolve = null;
  if (naturals.bank) {
    const bankScore = handScore(hands.bank);
    const bankNat9 = bankScore === 9; // natural de 9 → gana ante 9 de la plaza
    earlyResolve = {};
    for (const p of ['player1', 'player2', 'player3']) {
      const seat = seats[p];
      const ps = handScore(hands[p]);
      const stake = seat?.stake ?? 0;
      const ob = seat?.outcome ?? { val: null, stake: 0 };
      let outcome;
      if (bankNat9 && ps === 9) outcome = 'lose';
      else if (ps > bankScore) outcome = 'win';
      else if (ps < bankScore) outcome = 'lose';
      else outcome = 'tie';
      const payout = outcome === 'win' ? stake * 2 : outcome === 'tie' ? stake : 0;
      const outcomeHit = ob.stake > 0 && ob.val === ps;
      const outcomePayout = outcomeHit ? ob.stake * 4 : 0;
      earlyResolve[p] = {
        outcome, payout, playerScore: ps, bankScore,
        outcomeHit, outcomePayout,
      };
    }
    return { hands, naturals, earlyResolve, drawn: { player1: [], player2: [], player3: [], bank: [] } };
  }

  const drawn = { player1: [], player2: [], player3: [], bank: [] };
  for (const p of ['player1', 'player2', 'player3']) {
    const seat = seats[p] ?? {};
    if (naturals[p]) continue;
    const wantsThird =
      seat.type === 'human'
        ? seat.wantsThird ?? mustDrawThird(hands[p])
        : mustDrawThird(hands[p]);
    if (wantsThird) {
      const c = await deck.draw();
      hands[p].push(c);
      drawn[p].push(c);
    }
  }

  if (bankMustDrawThird(hands.bank)) {
    const c = await deck.draw();
    hands.bank.push(c);
    drawn.bank.push(c);
  }

  const results = {};
  for (const p of ['player1', 'player2', 'player3']) {
    const seat = seats[p] ?? {};
    const stake = seat.stake ?? 0;
    const ob = seat.outcome ?? { val: null, stake: 0 };
    const base = resolveHand(hands[p], hands.bank, stake);
    const oRes = ob.stake > 0 && ob.val !== null
      ? resolveOutcomeBet(ob.val, hands[p], ob.stake)
      : { hit: false, payout: 0 };
    results[p] = {
      outcome: base.outcome,
      playerScore: base.playerScore,
      bankScore: base.bankScore,
      payout: base.payout,
      outcomeHit: oRes.hit,
      outcomePayout: oRes.payout,
    };
  }

  return { hands, naturals, earlyResolve: null, drawn, results };
}
