// ===== Zenythic — Wallet del jugador =====
// En el demo: fichas virtuales con saldo inicial.
// En producción: este mismo interface talks to the operator balance API.

export function createWallet({ startingBalance = 1000 } = {}) {
  let balance = startingBalance;
  const listeners = new Set();

  function emit() {
    listeners.forEach((fn) => fn(balance));
  }

  return {
    get balance() {
      return balance;
    },
    canBet(amount) {
      return amount > 0 && amount <= balance;
    },
    placeBet(amount) {
      if (!this.canBet(amount)) return false;
      balance -= amount;
      emit();
      return true;
    },
    credit(amount) {
      balance += amount;
      emit();
    },
    /** Resolución de una apuesta: paga `payout` (incluye la propia apuesta si corresponde). */
    settle(stake, payout) {
      // stake ya fue descontado en placeBet
      balance += payout;
      emit();
      return balance;
    },
    onChange(fn) {
      listeners.add(fn);
      fn(balance);
      return () => listeners.delete(fn);
    },
  };
}
