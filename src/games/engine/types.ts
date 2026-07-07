// ===== Núcleo compartido de juegos Zenythic =====
// Tipos base usados por TODOS los juegos de cartas.

export type Suit = 'espadas' | 'corazones' | 'diamantes' | 'treboles';

export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K';

export interface Card {
  rank: Rank;
  suit: Suit;
  /** Valor ya calculado según el contexto del juego. En baccarat: 0-9. */
  value: number;
}

/** Identifica de forma única una carta para animaciones (key de React/loop). */
export function cardId(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

/** ¿Es un palo rojo? (para pintar el símbolo). */
export function isRedSuit(s: Suit): boolean {
  return s === 'corazones' || s === 'diamantes';
}

const SUIT_SYMBOL: Record<Suit, string> = {
  espadas: '♠',
  corazones: '♥',
  diamantes: '♦',
  treboles: '♣',
};

export function suitSymbol(s: Suit): string {
  return SUIT_SYMBOL[s];
}
