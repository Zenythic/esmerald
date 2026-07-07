// ===== Zenythic — Baraja estándar =====
// Consume un RNG (de _shared/rng.mjs) para ser provably-fair.
// Exporta createDeck({ rng }) y utilidades de robo.

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Construye una baraja de 52 cartas (sin barajar)
export function freshDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

// Fisher–Yates usando el RNG provably-fair (async)
export async function shuffle(deck, rng) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = await rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Crea una baraja lista para robar
export async function createDeck({ rng, decks = 1 }) {
  let cards = [];
  for (let d = 0; d < decks; d++) cards = cards.concat(freshDeck());
  cards = await shuffle(cards, rng);

  return {
    get remaining() {
      return cards.length;
    },
    async draw() {
      if (cards.length === 0) throw new Error('Mazo vacío');
      return cards.shift();
    },
    async drawN(n) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(await this.draw());
      return out;
    },
  };
}

// Valor de una carta para juegos tipo baccarat (0–9). A=1, 10/J/Q/K=0, resto su número.
export function baccaratValue(card) {
  if (card.rank === 'A') return 1;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 0;
  return parseInt(card.rank, 10);
}

// Color para pintar palos rojos (corazones/diamantes)
export function isRedSuit(suit) {
  return suit === '♥' || suit === '♦';
}
