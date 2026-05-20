class BotStrategy {
  // Returns the chip amount the bot will bet (0 = pass)
  decide({ tableCards, pot, chips }) {
    const [c1, c2] = tableCards;
    if (!c1 || !c2) return 0;

    const lo = Math.min(c1.value, c2.value);
    const hi = Math.max(c1.value, c2.value);
    const spread = hi - lo;

    let bet = 0;
    if (spread <= 1) {
      bet = 0;
    } else if (spread >= 10) {
      bet = Math.min(pot, 50);
    } else {
      bet = Math.min(pot, Math.floor((spread / 12) * 40));
    }

    return Math.min(bet, chips);
  }
}

module.exports = new BotStrategy();
