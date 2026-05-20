const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
  '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: RANK_VALUES[rank] });
    }
  }
  return shuffle(deck);
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Returns { card, deck } — never mutates the input deck
function dealCard(deck) {
  const fresh = deck.length < 10 ? makeDeck() : [...deck];
  const card = fresh[fresh.length - 1];
  return { card, deck: fresh.slice(0, fresh.length - 1) };
}

// Returns 'win' | 'lose' | 'replay'
function evaluateResult(c1, c2, c3) {
  const lo = Math.min(c1.value, c2.value);
  const hi = Math.max(c1.value, c2.value);
  if (c3.value === lo || c3.value === hi) return 'replay';
  if (c3.value > lo && c3.value < hi) return 'win';
  return 'lose';
}

module.exports = { makeDeck, dealCard, evaluateResult };
