// ===== Callejero 9 — Controller (state machine) =====
// Conecta la lógica pura (rules.mjs) con la UI (index.html).
// Estados: SPLASH → BETTING → DEALING → PLAYER_ACTION → DEALER_ACTION → RESOLVE → BETTING…
//
// Flujo de apuestas:
//  1. El jugador selecciona una ficha (5/25/100) y hace click en una plaza.
//     Las fichas se apilan visualmente junto al placeholder de cartas.
//  2. Click en "Repartir cartas".
//  3. Acción de pedir/plantar por cada plaza apostada (izq→der). La plaza en
//     turno se resalta con un foco (`.seat--spotlight`).

import { showSplash } from '../_shared/splash.mjs';
import { createRng, DEMO_SERVER_SEED } from '../_shared/rng.mjs';
import { createDeck, isRedSuit } from '../_shared/deck.mjs';
import { createWallet } from '../_shared/wallet.mjs';
import {
  handScore,
  isNatural,
  mustDrawThird,
  POSITIONS,
} from './rules.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Bootstrap ----------
const wallet = createWallet({ startingBalance: 1000 });

let nonce = 1;
let roundHands = null;     // manos en curso de la ronda actual
let roundDeck = null;      // mazo de la ronda actual
let roundNaturals = null;

// 3 plazas jugables (humanas), orden visual izq→der
const PLAYER_SEATS = ['player3', 'player1', 'player2'];

// Apuestas principales por plaza
let bets = { player1: 0, player2: 0, player3: 0 };

// Ficha seleccionada en la fase de apuesta (5|25|100|null)
let selectedChip = null;

// ---------- DOM refs ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const balanceEl = $('#balance');
const seatEls = {
  player1: document.querySelector('[data-seat="player1"]'),
  player2: document.querySelector('[data-seat="player2"]'),
  player3: document.querySelector('[data-seat="player3"]'),
  bank: document.querySelector('[data-seat="bank"]'),
};

const phaseBet = $('#phase-bet');
const phaseAction = $('#phase-action');
const phaseResult = $('#phase-result');

const dealBtn = $('#deal-btn');
const betAmountEl = $('#bet-amount');
const hitBtn = $('#hit-btn');
const standBtn = $('#stand-btn');
const nextBtn = $('#next-btn');
const resultMsg = $('#result-msg');
const toast = $('#toast');

// ---------- Wallet ----------
wallet.onChange((bal) => {
  balanceEl.textContent = `$${bal.toFixed(2)}`;
});

// ---------- Render helpers ----------
function renderCard(card, faceDown = false) {
  const el = document.createElement('div');
  el.className = 'zy-card zy-card--enter';
  if (faceDown) {
    el.classList.add('zy-card--back');
    return el;
  }
  el.classList.add(isRedSuit(card.suit) ? 'zy-card--red' : 'zy-card--black');
  el.innerHTML = `
    <div class="zy-card__rank">${card.rank}<div class="zy-card__suit">${card.suit}</div></div>
    <div class="zy-card__center">${card.suit}</div>
    <div class="zy-card__rank" style="align-self:flex-end;transform:rotate(180deg)">${card.rank}<div class="zy-card__suit">${card.suit}</div></div>
  `;
  return el;
}

function restorePlaceholders(pos) {
  const seat = seatEls[pos];
  const cardsWrap = seat.querySelector('[data-cards]');
  cardsWrap.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const ph = document.createElement('div');
    ph.className = 'zy-card-placeholder';
    cardsWrap.appendChild(ph);
  }
  seat.classList.remove('seat--deal-ready', 'seat--spotlight');
}

function clearSeats() {
  for (const pos of POSITIONS) {
    if (pos === 'bank') {
      seatEls.bank.querySelector('[data-cards]').innerHTML = '';
      seatEls.bank.querySelector('[data-score]').textContent = '—';
      continue;
    }
    restorePlaceholders(pos);
    seatEls[pos].classList.remove('seat--winner', 'seat--loser', 'seat--spotlight');
    seatEls[pos].querySelector('[data-result]').textContent = '';
    seatEls[pos].querySelector('[data-result]').className = 'seat__result';
  }
}

// Limpia solo cartas (mantiene fichas) — llamado antes de repartir nueva ronda
function clearCardsOnly() {
  for (const pos of POSITIONS) {
    if (pos === 'bank') {
      seatEls.bank.querySelector('[data-cards]').innerHTML = '';
      seatEls.bank.querySelector('[data-score]').textContent = '—';
      continue;
    }
    const cardsWrap = seatEls[pos].querySelector('[data-cards]');
    cardsWrap.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const ph = document.createElement('div');
      ph.className = 'zy-card-placeholder';
      cardsWrap.appendChild(ph);
    }
    seatEls[pos].classList.remove('seat--deal-ready', 'seat--winner', 'seat--loser', 'seat--spotlight');
    seatEls[pos].querySelector('[data-score]').textContent = '—';
    seatEls[pos].querySelector('[data-result]').textContent = '';
    seatEls[pos].querySelector('[data-result]').className = 'seat__result';
  }
}

function setScore(pos, hand) {
  seatEls[pos].querySelector('[data-score]').textContent = handScore(hand);
}

function decomposeChips(amount) {
  const out = [];
  let rem = amount;
  for (const v of [100, 25, 5]) {
    while (rem >= v) {
      out.push(v);
      rem -= v;
    }
  }
  return out;
}

function renderChipStack(pos) {
  const seat = seatEls[pos];
  const stack = seat.querySelector('[data-chipstack]');
  if (!stack) return;
  stack.innerHTML = '';
  const stake = bets[pos];
  if (!stake) return;
  const chips = decomposeChips(stake).slice(0, 6);
  for (const val of chips) {
    const c = document.createElement('div');
    c.className = `chip--mini chip--mini-${val}`;
    stack.appendChild(c);
  }
  const label = document.createElement('span');
  label.className = 'chipstack__label';
  label.textContent = `$${stake}`;
  stack.appendChild(label);
}

function setBetVisual(pos) {
  const seat = seatEls[pos];
  const betEl = seat.querySelector('[data-bet]');
  const stake = bets[pos];
  if (betEl) betEl.textContent = stake ? `Apuesta: $${stake}` : '';
  renderChipStack(pos);
}

function showToast(msg, ms = 2000) {
  toast.textContent = msg;
  toast.classList.remove('toast--hidden');
  if (ms > 0) setTimeout(() => toast.classList.add('toast--hidden'), ms);
}

// ---------- Contador de saldo animado ----------
let balanceAnimating = false;
function animateBalance(from, to) {
  if (balanceAnimating) return;
  balanceAnimating = true;
  const duration = 600;
  const start = performance.now();
  const diff = to - from;
  function tick(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = from + diff * eased;
    balanceEl.textContent = `$${val.toFixed(2)}`;
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      balanceEl.textContent = `$${to.toFixed(2)}`;
      balanceAnimating = false;
    }
  }
  requestAnimationFrame(tick);
}

// ---------- Screen-flash + confetti ----------
function screenFlash(type) {
  const flash = document.createElement('div');
  flash.className = `flash-${type}`;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1000);
}
function spawnConfetti(count = 50) {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < count; i++) {
    const c = document.createElement('span');
    c.style.left = `${Math.random() * 100}%`;
    c.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    c.style.animationDelay = `${Math.random() * 0.5}s`;
    c.style.background = Math.random() > 0.5 ? 'var(--gold-400)' : 'var(--gold-300)';
    c.style.width = `${6 + Math.random() * 6}px`;
    c.style.height = `${10 + Math.random() * 8}px`;
    layer.appendChild(c);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}

function showPhase(phase) {
  [phaseBet, phaseAction, phaseResult].forEach((p) =>
    p.classList.add('controls__phase--hidden')
  );
  phase.classList.remove('controls__phase--hidden');
}

function labelOf(pos) {
  const idx = PLAYER_SEATS.indexOf(pos);
  if (idx === -1) return 'la Banca';
  return `Plaza ${idx + 1}`;
}

function totalBet() {
  return bets.player1 + bets.player2 + bets.player3;
}

function updateBetUI() {
  const t = totalBet();
  betAmountEl.textContent = `$${t}`;
  dealBtn.disabled = t === 0 || !wallet.canBet(t);
}

// ---------- BETTING: ficha equipada + click en plaza ----------
$$('.chip-pick[data-chip]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const val = parseInt(btn.dataset.chip, 10);
    selectedChip = val;
    $$('.chip-pick[data-chip]').forEach((b) =>
      b.classList.toggle('chip-pick--active', parseInt(b.dataset.chip, 10) === val)
    );
  })
);

PLAYER_SEATS.forEach((pos) => {
  seatEls[pos].addEventListener('click', () => {
    if (selectedChip === null) return;
    const next = bets[pos] + selectedChip;
    const others = totalBet() - bets[pos];
    if (wallet.canBet(others + next)) {
      bets[pos] = next;
      setBetVisual(pos);
      updateBetUI();
    } else {
      showToast('Saldo insuficiente', 1200);
    }
  });
});

$('#bet-clear').addEventListener('click', () => {
  PLAYER_SEATS.forEach((pos) => {
    bets[pos] = 0;
    seatEls[pos].querySelector('[data-chipstack]').innerHTML = '';
    seatEls[pos].querySelector('[data-bet]').textContent = '';
  });
  selectedChip = null;
  $$('.chip-pick').forEach((b) => b.classList.remove('chip-pick--active'));
  updateBetUI();
});

dealBtn.addEventListener('click', startRound);

// ---------- Round ----------
async function startRound() {
  const t = totalBet();
  if (t <= 0) return;
  if (!wallet.placeBet(t)) return;
  clearCardsOnly();
  const rng = createRng({
    serverSeed: DEMO_SERVER_SEED,
    clientSeed: 'demo-client-' + Date.now(),
    nonce: nonce++,
  });
  roundDeck = await createDeck({ rng, decks: 1 });
  roundHands = { player1: [], player2: [], player3: [], bank: [] };
  await dealPhase();
}

async function dealPhase() {
  resultMsg.textContent = 'Repartiendo…';
  resultMsg.className = 'result-msg';
  showPhase(phaseResult);

  for (const pos of PLAYER_SEATS) {
    const seat = seatEls[pos];
    if (bets[pos] > 0) {
      seat.classList.add('seat--deal-ready');
      seat.querySelector('[data-cards]').innerHTML = '';
    } else {
      seat.classList.remove('seat--deal-ready');
    }
  }
  seatEls.bank.querySelector('[data-cards]').innerHTML = '';

  for (let i = 0; i < 2; i++) {
    for (const pos of POSITIONS) {
      const card = await roundDeck.draw();
      roundHands[pos].push(card);
      const faceDown = pos === 'bank' && i === 0 ? false : pos === 'bank';
      if (pos === 'bank' || bets[pos] > 0) {
        seatEls[pos].querySelector('[data-cards]').appendChild(renderCard(card, faceDown));
      }
      await wait(120);
    }
  }

  roundNaturals = {};
  for (const pos of POSITIONS) roundNaturals[pos] = isNatural(roundHands[pos]);

  for (const p of PLAYER_SEATS) {
    if (bets[p] > 0) setScore(p, roundHands[p]);
  }

  if (roundNaturals.bank) {
    showToast('¡Natural de la Banca!');
    await wait(500);
    return bankPhase(true);
  }

  for (const p of PLAYER_SEATS) {
    if (roundNaturals[p] && bets[p] > 0) {
      showToast(`¡Natural en ${labelOf(p)}!`, 1500);
    }
  }

  return playerActionPhase();
}

// ---------- PLAYER ACTION ----------
async function playerActionPhase() {
  for (const pos of PLAYER_SEATS) {
    if (bets[pos] <= 0) continue;
    if (roundNaturals[pos]) continue;

    // Todas las plazas que no tienen natural y están apostadas deben elegir Pedir/Plantar
    seatEls[pos].classList.add('seat--spotlight');
    showPhase(phaseAction);

    const decision = await new Promise((resolve) => {
      const onHit = () => { cleanup(); resolve('hit'); };
      const onStand = () => { cleanup(); resolve('stand'); };
      const cleanup = () => {
        hitBtn.removeEventListener('click', onHit);
        standBtn.removeEventListener('click', onStand);
      };
      hitBtn.addEventListener('click', onHit);
      standBtn.addEventListener('click', onStand);
    });

    seatEls[pos].classList.remove('seat--spotlight');

    if (decision === 'hit') {
      const c = await roundDeck.draw();
      roundHands[pos].push(c);
      seatEls[pos].querySelector('[data-cards]').appendChild(renderCard(c));
      setScore(pos, roundHands[pos]);
      await wait(350);
    } else {
      await wait(300);
    }
  }
  return bankPhase(false);
}

// ---------- BANK ----------
async function bankPhase(bankHasNatural) {
  resultMsg.textContent = 'Turno de la Banca…';
  resultMsg.className = 'result-msg';
  showPhase(phaseResult);
  await wait(500);

  const bankCardsWrap = seatEls.bank.querySelector('[data-cards]');
  bankCardsWrap.innerHTML = '';
  for (const c of roundHands.bank) {
    bankCardsWrap.appendChild(renderCard(c, false));
  }
  setScore('bank', roundHands.bank);
  await wait(450);

  if (!bankHasNatural && handScore(roundHands.bank) <= 5) {
    showToast('La Banca pide carta', 1200);
    await wait(600);
    const c = await roundDeck.draw();
    roundHands.bank.push(c);
    bankCardsWrap.appendChild(renderCard(c));
    setScore('bank', roundHands.bank);
    await wait(350);
  }

  return resolveRound(bankHasNatural);
}

// ---------- RESOLVE ----------
// ¿La casa tiene natural de 9 con sus dos primeras cartas? Gana ante cualquier 9.
function bankHasNatural9() {
  return roundNaturals && roundNaturals.bank && handScore(roundHands.bank) === 9;
}

function computeTotalReceived() {
  const bs = handScore(roundHands.bank);
  const bnat9 = bankHasNatural9();
  let acc = 0;
  for (const p of PLAYER_SEATS) {
    if (bets[p] <= 0) continue;
    const ps = handScore(roundHands[p]);
    let outcome;
    if (bnat9 && ps === 9) outcome = 'lose';
    else if (ps > bs) outcome = 'win';
    else if (ps < bs) outcome = 'lose';
    else outcome = 'tie';
    if (outcome === 'win') acc += bets[p] * 2;
    else if (outcome === 'tie') acc += bets[p];
  }
  return acc;
}

async function resolveRound(bankHasNatural) {
  const bs = handScore(roundHands.bank);
  const bnat9 = bankHasNatural9();

  let totalStaked = 0;
  let totalReceived = 0;
  const playerResults = [];

  for (const p of PLAYER_SEATS) {
    if (bets[p] <= 0) continue;
    totalStaked += bets[p];
    const ps = handScore(roundHands[p]);
    let outcome;
    if (bnat9 && ps === 9) outcome = 'lose';
    else outcome = ps > bs ? 'win' : ps < bs ? 'lose' : 'tie';
    const payout = outcome === 'win' ? bets[p] * 2 : outcome === 'tie' ? bets[p] : 0;
    totalReceived += payout;

    const resEl = seatEls[p].querySelector('[data-result]');
    resEl.className = 'seat__result seat__result--' + outcome;
    resEl.textContent = outcome === 'win' ? 'Gana' : outcome === 'lose' ? 'Pierde' : 'Empate';
    if (outcome === 'win') {
      seatEls[p].classList.add('seat--winner');
    } else if (outcome === 'lose') {
      seatEls[p].classList.add('seat--loser');
    }

    playerResults.push({
      spot: PLAYER_SEATS.indexOf(p) + 1,
      outcome,
      payout: outcome === 'win' ? bets[p] : outcome === 'tie' ? bets[p] : bets[p],
    });
  }

  wallet.credit(totalReceived);
  pushPlayerResult(playerResults);

  // Contador animado de saldo + flash
  const prevBalance = wallet.balance - totalReceived;
  animateBalance(prevBalance, wallet.balance);
  if (net > 0) {
    screenFlash('win');
    if (totalReceived > totalStaked * 2) spawnConfetti();
  } else if (net < 0) {
    screenFlash('lose');
  }

  const net = totalReceived - totalStaked;
  resultMsg.textContent =
    net > 0 ? `¡Ganas $${net}!` :
    net < 0 ? `Pierdes $${-net}` :
    'Empate — recuperas tu apuesta';
  resultMsg.className =
    net > 0 ? 'result-msg result-msg--win' :
    net < 0 ? 'result-msg result-msg--lose' :
    'result-msg result-msg--tie';

  showPhase(phaseResult);
}

// ---------- NEXT ROUND ----------
nextBtn.addEventListener('click', () => {
  PLAYER_SEATS.forEach((pos) => {
    bets[pos] = 0;
    seatEls[pos].querySelector('[data-chipstack]').innerHTML = '';
    seatEls[pos].querySelector('[data-bet]').textContent = '';
  });
  clearSeats();
  selectedChip = null;
  $$('.chip-pick').forEach((b) => b.classList.remove('chip-pick--active'));
  updateBetUI();
  showPhase(phaseBet);
});

// ---------- MODAL DE REGLAS ----------
const rulesModal = $('#rules-modal');
const rulesBtn = $('#rules-btn');
function openRules() {
  rulesModal.classList.remove('modal--hidden');
  rulesModal.setAttribute('aria-hidden', 'false');
}
function closeRules() {
  rulesModal.classList.add('modal--hidden');
  rulesModal.setAttribute('aria-hidden', 'true');
}
rulesBtn.addEventListener('click', openRules);
rulesModal.querySelectorAll('[data-close]').forEach((el) =>
  el.addEventListener('click', closeRules)
);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !rulesModal.classList.contains('modal--hidden')) closeRules();
});

// ---------- Ticker de ganadores ----------
const tickerContent = $('#ticker-content');
const FAKE_NAMES = [
  'LuckyAce', 'ChipMaster', 'GoldRing', 'NightPlayer', 'RedDragon',
  'SilverFox', 'BlackSpade', 'HighRoller', 'CardShark', 'RoyalFlush',
  'DiamondHand', 'WildCard', 'AceHigh', 'KingPin', 'QueenBee',
  'JokerWild', 'ClubKing', 'HeartBreak', 'SmoothPlay', 'BigBetBob',
];
const FAKE_BETS = [5, 10, 25, 50, 100, 200];

function genFakeWin() {
  const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
  const spot = 1 + Math.floor(Math.random() * 3);
  const bet = FAKE_BETS[Math.floor(Math.random() * FAKE_BETS.length)];
  const win = Math.random() < 0.55;
  return { name, spot, bet, win, payout: win ? bet * 2 : bet };
}

function tickerItemHTML(w) {
  if (w.win) {
    return `<span class="ticker__item">
      <span class="t-name">${w.name}</span>
      <span class="t-spot">PLAZA ${w.spot}</span>
      <span class="t-win">+$${w.payout}</span>
    </span>`;
  }
  return `<span class="ticker__item">
    <span class="t-name">${w.name}</span>
    <span class="t-spot">PLAZA ${w.spot}</span>
    <span class="t-lose">−$${w.payout}</span>
  </span>`;
}

function buildTickerSeed(count = 14) {
  const items = [];
  for (let i = 0; i < count; i++) items.push(tickerItemHTML(genFakeWin()));
  tickerContent.innerHTML = items.join('') + items.join('');
}

function pushPlayerResult(results) {
  for (const r of results) {
    const item = document.createElement('span');
    item.className = 'ticker__item ticker__item--me';
    if (r.outcome === 'win') {
      item.innerHTML = `
        <span class="t-name">TÚ</span>
        <span class="t-spot">PLAZA ${r.spot}</span>
        <span class="t-win">+$${r.payout}</span>
      `;
    } else if (r.outcome === 'tie') {
      item.innerHTML = `
        <span class="t-name">TÚ</span>
        <span class="t-spot">PLAZA ${r.spot}</span>
        <span class="t-win">= $${r.payout}</span>
      `;
    } else {
      item.innerHTML = `
        <span class="t-name">TÚ</span>
        <span class="t-spot">PLAZA ${r.spot}</span>
        <span class="t-lose">−$${r.payout}</span>
      `;
    }
    tickerContent.insertBefore(item, tickerContent.firstChild);
  }
  while (tickerContent.children.length > 60) {
    tickerContent.removeChild(tickerContent.lastChild);
  }
}

setInterval(() => {
  const item = document.createElement('span');
  item.className = 'ticker__item';
  item.innerHTML = tickerItemHTML(genFakeWin());
  tickerContent.insertBefore(item, tickerContent.firstChild);
  while (tickerContent.children.length > 60) {
    tickerContent.removeChild(tickerContent.lastChild);
  }
}, 5000);

// ---------- Init ----------
(async function init() {
  buildTickerSeed();
  await showSplash({ durationMs: 2200 });
  updateBetUI();
  showPhase(phaseBet);
})();
