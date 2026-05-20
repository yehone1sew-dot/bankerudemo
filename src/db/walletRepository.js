const { get, run } = require('./connection');

async function getBalance() {
  const row = await get('SELECT balance FROM platform_wallet WHERE id = 1');
  return row ? row.balance : 0;
}

async function addFee(amount) {
  if (amount <= 0) return;
  return run('UPDATE platform_wallet SET balance = balance + ? WHERE id = 1', [amount]);
}

async function resetBalance() {
  return run('UPDATE platform_wallet SET balance = 0 WHERE id = 1');
}

module.exports = { getBalance, addFee, resetBalance };
