const { get, run } = require('./connection');
const config = require('../config');

// Atomic upsert — no check-then-insert race condition
async function getOrCreate(telegramId, username) {
  if (!username) username = 'Player';

  // Try by telegram ID first
  if (telegramId) {
    const user = await get('SELECT * FROM users WHERE telegram_id = ?', [String(telegramId)]);
    if (user) {
      if (user.username !== username) {
        await run('UPDATE users SET username = ? WHERE id = ?', [username, user.id]);
        user.username = username;
      }
      return user;
    }
  }

  // Try by username
  const byName = await get('SELECT * FROM users WHERE username = ?', [username]);
  if (byName) {
    if (telegramId && !byName.telegram_id) {
      await run('UPDATE users SET telegram_id = ? WHERE id = ?', [String(telegramId), byName.id]);
      byName.telegram_id = String(telegramId);
    }
    return byName;
  }

  // INSERT OR IGNORE guards against concurrent inserts on the same username
  const params = telegramId
    ? [String(telegramId), username, config.DEFAULT_CHIPS]
    : [null, username, config.DEFAULT_CHIPS];

  const result = await run(
    'INSERT OR IGNORE INTO users (telegram_id, username, chips) VALUES (?, ?, ?)',
    params
  );

  if (result.lastID) {
    return {
      id: result.lastID,
      telegram_id: telegramId ? String(telegramId) : null,
      username,
      chips: config.DEFAULT_CHIPS,
      wins: 0,
      losses: 0,
    };
  }

  // Another process won the race — fetch the existing row
  return get('SELECT * FROM users WHERE username = ?', [username]);
}

async function getById(userId) {
  return get('SELECT * FROM users WHERE id = ?', [userId]);
}

async function deductChips(userId, amount) {
  return run('UPDATE users SET chips = chips - ? WHERE id = ?', [amount, userId]);
}

async function refundChips(userId, amount) {
  return run('UPDATE users SET chips = chips + ? WHERE id = ?', [amount, userId]);
}

async function recordWin(userId) {
  return run('UPDATE users SET wins = wins + 1 WHERE id = ?', [userId]);
}

async function recordLoss(userId) {
  return run('UPDATE users SET losses = losses + 1 WHERE id = ?', [userId]);
}

async function setTheme(userId, themeId) {
  return run('UPDATE users SET theme = ? WHERE id = ?', [themeId, userId]);
}

async function unlockTheme(userId, themeId, cost) {
  const user = await getById(userId);
  if (!user) throw new Error('User not found');
  if (user.chips < cost) throw new Error('Insufficient chips');

  const unlocked = JSON.parse(user.unlocked_themes || '["casino","midnight"]');
  if (unlocked.includes(themeId)) return user;

  unlocked.push(themeId);
  await run(
    'UPDATE users SET chips = chips - ?, unlocked_themes = ?, theme = ? WHERE id = ?',
    [cost, JSON.stringify(unlocked), themeId, userId]
  );
  return getById(userId);
}

module.exports = { getOrCreate, getById, deductChips, refundChips, recordWin, recordLoss, setTheme, unlockTheme };
