-- Schéma D1 (SQLite). Les cartes ne sont enregistrées qu'au moment où elles sont tirées ;
-- le catalogue complet (titres, rangs) est servi en fichiers statiques (public/catalog).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL COLLATE NOCASE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 200,
  pack_stock INTEGER NOT NULL DEFAULT 10,
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
  title TEXT NOT NULL,
  extract TEXT NOT NULL DEFAULT '',
  image TEXT,
  url TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  rarity TEXT NOT NULL,
  atk INTEGER NOT NULL DEFAULT 0,
  def INTEGER NOT NULL DEFAULT 0,
  shiny INTEGER NOT NULL DEFAULT 0,
  enriched INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cards_title ON cards(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS cards_enriched ON cards(enriched) WHERE enriched = 1;
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
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  price INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sales_card ON sales(card_id, id);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id),
  to_id INTEGER NOT NULL REFERENCES users(id),
  offer_card INTEGER NOT NULL REFERENCES cards(id),
  want_card INTEGER NOT NULL REFERENCES cards(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hits (
  id INTEGER PRIMARY KEY,
  user TEXT NOT NULL,
  title TEXT NOT NULL,
  shiny INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);
