'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'data', 'game.db'));
const hasCards = db.prepare("SELECT 1 FROM sqlite_master WHERE name='cards'").get();
if (hasCards && !db.prepare("SELECT 1 FROM pragma_table_info('cards') WHERE name='rank'").get()) {
  throw new Error('Ancien schéma de base détecté : supprime data/game.db (ou ton DB_PATH) puis relance `npm run seed`.');
}
const hasUsers = db.prepare("SELECT 1 FROM sqlite_master WHERE name='users'").get();
if (hasUsers && !db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='test_mode'").get()) db.exec('ALTER TABLE users ADD COLUMN test_mode INTEGER NOT NULL DEFAULT 0');
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
  test_mode INTEGER NOT NULL DEFAULT 0,
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
  id INTEGER PRIMARY KEY,          -- id de la page Wikipédia (+100000000 pour la variante shiny)
  title TEXT NOT NULL,
  extract TEXT NOT NULL DEFAULT '',
  image TEXT,
  url TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  rarity TEXT NOT NULL,
  atk INTEGER NOT NULL DEFAULT 0,
  def INTEGER NOT NULL DEFAULT 0,
  length INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,                    -- 0 = page la plus consultée ; NULL pour les variantes shiny
  shiny INTEGER NOT NULL DEFAULT 0,
  enriched INTEGER NOT NULL DEFAULT 0 -- 0 rien, 1 Wikipédia lu, 2 terminé (image cherchée sur Wikipédia puis Wikidata)
);
CREATE INDEX IF NOT EXISTS cards_rank ON cards(rank);
CREATE INDEX IF NOT EXISTS cards_title ON cards(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS cards_enriched ON cards(enriched) WHERE enriched >= 1;
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
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
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY,
  auction_id INTEGER NOT NULL REFERENCES auctions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bids_auction ON bids(auction_id);
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  price INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sales_card ON sales(card_id, id);
CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL REFERENCES users(id),
  friend_id INTEGER NOT NULL REFERENCES users(id),
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 1,      -- 0 = nouvel ami que ce joueur n'a pas encore vu (pastille rouge)
  PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id),
  to_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests(to_id, status);
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

// code d'ami secret (dans le QR code) : ajouté aux bases créées avant l'arrivée des amis
try { db.exec('ALTER TABLE users ADD COLUMN friend_code TEXT'); } catch { /* déjà présente */ }
for (const u of db.prepare('SELECT id FROM users WHERE friend_code IS NULL').all()) {
  db.prepare('UPDATE users SET friend_code = ? WHERE id = ?').run(require('node:crypto').randomBytes(5).toString('hex'), u.id);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_friend_code ON users(friend_code)');

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
