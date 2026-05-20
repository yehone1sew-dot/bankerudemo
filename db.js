const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'bankeru.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeTables();
  }
});

function initializeTables() {
  db.serialize(() => {
    // Create users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        username TEXT UNIQUE,
        chips INTEGER DEFAULT 1000,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0
      )
    `);

    // Create platform wallet table
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_wallet (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        balance INTEGER DEFAULT 0
      )
    `);

    // Seed platform wallet if not exists
    db.run(`
      INSERT OR IGNORE INTO platform_wallet (id, balance) VALUES (1, 0)
    `);
  });
}

// Wrap DB calls in Promises for clean async/await syntax
const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// Database service methods
const dbService = {
  async getOrCreateUser(telegramId, username) {
    if (!username) username = 'Player';
    
    try {
      let user = null;
      
      // 1. Try fetching by telegram ID first
      if (telegramId) {
        user = await get('SELECT * FROM users WHERE telegram_id = ?', [String(telegramId)]);
        if (user) {
          // Sync username if it changed
          if (user.username !== username) {
            await run('UPDATE users SET username = ? WHERE id = ?', [username, user.id]);
            user.username = username;
          }
          return user;
        }
      }
      
      // 2. Try fetching by username
      user = await get('SELECT * FROM users WHERE username = ?', [username]);
      if (user) {
        // Link telegram ID if it was missing
        if (telegramId && !user.telegram_id) {
          await run('UPDATE users SET telegram_id = ? WHERE id = ?', [String(telegramId), user.id]);
          user.telegram_id = String(telegramId);
        }
        return user;
      }
      
      // 3. User does not exist, create new
      const defaultChips = 1000;
      let result;
      if (telegramId) {
        result = await run(
          'INSERT INTO users (telegram_id, username, chips) VALUES (?, ?, ?)',
          [String(telegramId), username, defaultChips]
        );
      } else {
        result = await run(
          'INSERT INTO users (username, chips) VALUES (?, ?)',
          [username, defaultChips]
        );
      }
      
      return {
        id: result.lastID,
        telegram_id: telegramId ? String(telegramId) : null,
        username,
        chips: defaultChips,
        wins: 0,
        losses: 0
      };
    } catch (e) {
      console.error('Error in getOrCreateUser:', e);
      throw e;
    }
  },

  async getUserById(userId) {
    return get('SELECT * FROM users WHERE id = ?', [userId]);
  },

  async updateUserChips(userId, chips) {
    return run('UPDATE users SET chips = ? WHERE id = ?', [chips, userId]);
  },

  async deductChips(userId, amount) {
    return run('UPDATE users SET chips = chips - ? WHERE id = ?', [amount, userId]);
  },

  async refundChips(userId, amount) {
    return run('UPDATE users SET chips = chips + ? WHERE id = ?', [amount, userId]);
  },

  async recordRoundWinOnly(userId) {
    return run('UPDATE users SET wins = wins + 1 WHERE id = ?', [userId]);
  },

  async recordRoundLossOnly(userId) {
    return run('UPDATE users SET losses = losses + 1 WHERE id = ?', [userId]);
  },

  async recordLoss(userId, amount) {
    // Increment loss count and decrease chips by amount
    return run(
      'UPDATE users SET chips = chips - ?, losses = losses + 1 WHERE id = ?',
      [amount, userId]
    );
  },

  async addPlatformFee(amount) {
    if (amount <= 0) return;
    return run('UPDATE platform_wallet SET balance = balance + ? WHERE id = 1', [amount]);
  },

  async getPlatformBalance() {
    const row = await get('SELECT balance FROM platform_wallet WHERE id = 1');
    return row ? row.balance : 0;
  },

  async resetPlatformBalance() {
    return run('UPDATE platform_wallet SET balance = 0 WHERE id = 1');
  }
};

module.exports = dbService;
