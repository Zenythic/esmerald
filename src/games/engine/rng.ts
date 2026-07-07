// ===== RNG centralizado de Zenythic =====
// Único punto por el que pasa toda la aleatoriedad de los juegos.
// Por ahora delega en Math.random (demo). La firma queda lista para conectar
// un RNG provably-fair (seed + hash server/client) sin tocar los juegos.

export interface Rng {
  /** flotante en [0, 1) */
  next(): number;
  /** entero en [0, max) */
  int(max: number): number;
}

/** RNG por defecto (demo). Sustituible por uno provably-fair más adelante. */
export const defaultRng: Rng = {
  next: () => Math.random(),
  int: (max) => Math.floor(Math.random() * max),
};
