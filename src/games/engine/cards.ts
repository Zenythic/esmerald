// ===== Baraja y operaciones de cartas (compartido) =====
import type { Card, Rank, Suit } from './types';
import type { Rng } from './rng';

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['espadas', 'corazones', 'diamantes', 'treboles'];

/**
 * Valor de una carta en el contexto indicado.
 * - 'baccarat': A=1, figuras=0, demás su número (módulo 10 al sumar la mano).
 */
export function rankValue(rank: Rank, context: 'baccarat'): number {
  if (context === 'baccarat') {
    if (rank === 'A') return 1;
    if (rank === 'J' || rank === 'Q' || rank === 'K') return 0;
    const n = parseInt(rank, 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/** Crea una baraja francesa completa de 52 cartas con su valor ya calculado. */
export function createDeck(context: 'baccarat' = 'baccarat'): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, value: rankValue(rank, context) });
    }
  }
  return deck;
}

/** Mezcla la baraja in-place con Fisher-Yates usando el RNG central. */
export function shuffle(deck: Card[], rng: Rng): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Devuelve una baraja nueva ya mezclada (atajo). */
export function newShuffledDeck(rng: Rng, context: 'baccarat' = 'baccarat'): Card[] {
  return shuffle(createDeck(context), rng);
}

/** Saca n cartas del principio de la baraja y las devuelve (muta el deck). */
export function draw(deck: Card[], n: number): Card[] {
  return deck.splice(0, n);
}
