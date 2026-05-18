const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
function evaluateResult(c1, c2, c3) {
  const lo = Math.min(c1.value, c2.value);
  const hi = Math.max(c1.value, c2.value);
  if (c3.value === lo || c3.value === hi) return 'replay';
  if (c3.value > lo && c3.value < hi) return 'win';
  return 'lose';
}
const c1 = { suit: '♠', rank: '2', value: RANK_VALUES['2'] };
const c2 = { suit: '♥', rank: '5', value: RANK_VALUES['5'] };
const c3 = { suit: '♦', rank: '8', value: RANK_VALUES['8'] };
console.log('Result for 2, 5, 8:', evaluateResult(c1, c2, c3));
