// ===== Zenythic — RNG Provably-Fair =====
// Generador determinista a partir de (serverSeed, clientSeed, nonce).
// Permite verificación post-ronda: revelado el serverSeed, el cliente puede
// recomputar y comprobar que el resultado no fue manipulado.
//
// Algoritmo: hash SHA-256 de "serverSeed:clientSeed:nonce" produce 32 bytes;
// se consume de 4 en 4 bytes como entero de 32 bits → float [0,1).
// Si se agotan los bytes, se re-hashea con un contador.

const enc = new TextEncoder();

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convierte hasta 8 hex chars (32 bits) a float [0,1)
function bytesToFloat(hexBytes) {
  // Toma 8 hex chars (32 bits) → entero → / 2^32
  const int = parseInt(hexBytes.slice(0, 8), 16);
  return int / 0x100000000;
}

export function createRng({ serverSeed, clientSeed, nonce = 0 }) {
  let state = { serverSeed, clientSeed, nonce };
  let buffer = '';   // stream hexadecimal actual
  let cursor = 0;    // posición de lectura en el buffer
  let page = 0;      // página de re-hash

  async function refill() {
    const material = `${state.serverSeed}:${state.clientSeed}:${state.nonce}:${page}`;
    buffer = await sha256Hex(material); // 64 hex chars = 32 bytes
    cursor = 0;
    page++;
  }

  async function nextFloat() {
    // Necesitamos al menos 8 hex chars (32 bits)
    if (cursor + 8 > buffer.length) {
      await refill();
    }
    const chunk = buffer.slice(cursor, cursor + 8);
    cursor += 8;
    return bytesToFloat(chunk);
  }

  return {
    get seeds() {
      return { ...state };
    },
    // float [0,1)
    async next() {
      return nextFloat();
    },
    // entero [0, max)
    async int(max) {
      return Math.floor((await nextFloat()) * max);
    },
    // entero [min, max] inclusive
    async intRange(min, max) {
      return min + (await this.int(max - min + 1));
    },
  };
}

// Helper para demos sin backend: hash fijo y clientSeed variable.
export const DEMO_SERVER_SEED = 'zenythic-demo-seed-0001-fixed';
