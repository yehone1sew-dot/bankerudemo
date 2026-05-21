const Database = require('better-sqlite3');
const path = require('path');
const config = require('../config');

const dbPath = path.join(__dirname, '../../bankeru.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

function initializeTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      username TEXT UNIQUE,
      chips INTEGER DEFAULT ${config.DEFAULT_CHIPS},
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      theme TEXT DEFAULT '${config.DEFAULT_THEME}',
      unlocked_themes TEXT DEFAULT '["casino","midnight"]'
    )
  `);

  // Migrate existing databases that predate the theme columns
  try { db.exec(`ALTER TABLE users ADD COLUMN theme TEXT DEFAULT '${config.DEFAULT_THEME}'`); } catch (_) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN unlocked_themes TEXT DEFAULT '["casino","midnight"]'`); } catch (_) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_wallet (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance INTEGER DEFAULT 0
    )
  `);
  db.exec(`INSERT OR IGNORE INTO platform_wallet (id, balance) VALUES (1, 0)`);
}

initializeTables();

const get = (sql, params = []) =>
  Promise.resolve(db.prepare(sql).get(...params));

const run = (sql, params = []) => {
  const info = db.prepare(sql).run(...params);
  return Promise.resolve({ lastID: info.lastInsertRowid, changes: info.changes });
};

module.exports = { get, run };
