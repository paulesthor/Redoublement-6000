'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'data', 'game.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 3000;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL COLLATE NOCASE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 200,
  pack_stock INTEGER NOT NULL DEFAULT 5,
  pack_ts INTEGER NOT NULL,
  duel_wins INTEGER NOT NULL DEFAULT 0,
  duel_losses INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  title TEXT UNIQUE NOT NULL,
  extract TEXT NOT NULL,
  image TEXT,
  url TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  rarity TEXT NOT NULL,
  atk INTEGER NOT NULL,
  def INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_rarity ON cards(rarity);
CREATE TABLE IF NOT EXISTS inventory (
  user_id INTEGER NOT NULL REFERENCES users(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  qty INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id)
);
CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  start_price INTEGER NOT NULL,
  bid INTEGER NOT NULL DEFAULT 0,
  bidder_id INTEGER REFERENCES users(id),
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS auctions_open ON auctions(status, ends_at);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id),
  to_id INTEGER NOT NULL REFERENCES users(id),
  offer_card INTEGER NOT NULL REFERENCES cards(id),
  want_card INTEGER NOT NULL REFERENCES cards(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created INTEGER NOT NULL
);
`);

/** Exécute fn dans une transaction (BEGIN IMMEDIATE) ; rollback si exception. */
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { db, tx };
