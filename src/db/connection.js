const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = path.join(__dirname, '../../bankeru.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
  initializeTables();
});

function initializeTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        username TEXT UNIQUE,
        chips INTEGER DEFAULT ${config.DEFAULT_CHIPS},
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_wallet (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        balance INTEGER DEFAULT 0
      )
    `);
    db.run(`INSERT OR IGNORE INTO platform_wallet (id, balance) VALUES (1, 0)`);
  });
}

const get = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  );

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    })
  );

module.exports = { get, run };
