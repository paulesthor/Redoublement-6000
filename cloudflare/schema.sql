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
  is_admin INTEGER NOT NULL DEFAULT 0,    -- menu d'administration
  showcase TEXT,                          -- vitrine : JSON des (au plus 3) cartes exposées sur le profil
  drop_w TEXT,                            -- taux de drop personnalisés (JSON par rareté), réglés par l'admin
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
CREATE TABLE IF NOT EXISTS inventory (
  user_id INTEGER NOT NULL REFERENCES users(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  qty INTEGER NOT NULL,
  acquired INTEGER,                   -- date de la dernière obtention (tri par date)
  rar INTEGER NOT NULL DEFAULT 0,     -- copies des champs de tri de la carte : la collection se pagine sans relire la table cards
  sh INTEGER NOT NULL DEFAULT 0,
  skey INTEGER NOT NULL DEFAULT 0,    -- rang de rareté * 1e9 + popularité
  nk TEXT NOT NULL DEFAULT '',        -- titre en minuscules
  fav INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS prepared (        -- paquets tirés et complétés d'avance pour un joueur (non encore ouverts)
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  cards TEXT NOT NULL,
  ts INTEGER NOT NULL,
  w TEXT NOT NULL DEFAULT ''           -- taux de drop utilisés (users.drop_w) : un paquet préparé avec d'autres taux est jeté
);
CREATE INDEX IF NOT EXISTS prepared_user ON prepared(user_id, id);
CREATE TABLE IF NOT EXISTS wanted (          -- cartes cherchées par un joueur : un joueur simulé les met en vente à l'heure indiquée
  card_id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wanted_at ON wanted(at);
CREATE TABLE IF NOT EXISTS quizzes (         -- questions d'un article écrites par le modèle de langage (une seule génération par article)
  card_id INTEGER PRIMARY KEY,
  questions TEXT NOT NULL,
  model TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (       -- cartes marquées d'une étoile
  user_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- clés VAPID des notifications, etc.
CREATE TABLE IF NOT EXISTS push_subs (        -- appareils abonnés aux notifications (un joueur peut en avoir plusieurs)
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs(user_id);
CREATE TABLE IF NOT EXISTS push_msgs (        -- notifications en attente de lecture par le service worker
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL,                       -- appareil destinataire
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tag TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_msgs_ep ON push_msgs(endpoint);
CREATE INDEX IF NOT EXISTS inventory_skey ON inventory(user_id, skey, card_id);
CREATE INDEX IF NOT EXISTS inventory_acq ON inventory(user_id, acquired, card_id);
CREATE INDEX IF NOT EXISTS inventory_nk ON inventory(user_id, nk, card_id);
CREATE INDEX IF NOT EXISTS inventory_fav ON inventory(user_id, fav, skey, card_id);

CREATE TABLE IF NOT EXISTS fight_events (     -- journal des combats (début, pauses, reprises, fin, erreurs) : sert à comprendre pourquoi un combat s'arrête
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  battle TEXT NOT NULL,
  players TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS fight_events_ts ON fight_events(ts);

CREATE TABLE IF NOT EXISTS usage (            -- lignes lues par type de requête et par jour (limite gratuite D1 : 5 millions par jour)
  day TEXT NOT NULL,
  sig TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  rows INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, sig)
);

CREATE INDEX IF NOT EXISTS bids_user ON bids(user_id, auction_id);

-- messagerie privée : une ligne par message (a < b = les deux joueurs), et un résumé par joueur et par conversation (liste, non lus)
CREATE TABLE IF NOT EXISTS dms (id INTEGER PRIMARY KEY, a INTEGER NOT NULL, b INTEGER NOT NULL, from_id INTEGER NOT NULL, body TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS dms_conv ON dms(a, b, id);
CREATE TABLE IF NOT EXISTS convs (user_id INTEGER NOT NULL, peer_id INTEGER NOT NULL, last_ts INTEGER NOT NULL, last_body TEXT NOT NULL, last_mine INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, peer_id));
