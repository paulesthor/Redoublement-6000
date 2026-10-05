-- Schéma D1 (SQLite). Les cartes ne sont enregistrées qu'au moment où elles sont tirées ;
-- le catalogue complet (titres, rangs) est servi en fichiers statiques (public/catalog).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL COLLATE NOCASE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 200,
  pack_stock INTEGER NOT NULL DEFAULT 10,
  test_mode INTEGER NOT NULL DEFAULT 0,
  packs_opened INTEGER NOT NULL DEFAULT 0,
  is_bot INTEGER NOT NULL DEFAULT 0,      -- joueurs simulés qui animent le marché
  pack_ts INTEGER NOT NULL,
  duel_wins INTEGER NOT NULL DEFAULT 0,
  duel_losses INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  friend_code TEXT UNIQUE            -- code secret contenu dans le QR code
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
  enriched INTEGER NOT NULL DEFAULT 0   -- 0 rien, 1 Wikipédia lu, 2 terminé (image cherchée sur Wikipédia puis Wikidata)
);
CREATE INDEX IF NOT EXISTS cards_title ON cards(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS cards_enriched ON cards(enriched) WHERE enriched >= 1;
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
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY,
  auction_id INTEGER NOT NULL REFERENCES auctions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bids_auction ON bids(auction_id);
CREATE TABLE IF NOT EXISTS achievements (
  user_id INTEGER NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS reserve (        -- cartes déjà complétées (texte + photo) tirées d'avance : les paquets s'ouvrent sans attente
  id INTEGER PRIMARY KEY,
  rarity TEXT NOT NULL,
  rank INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reserve_rarity ON reserve(rarity);
