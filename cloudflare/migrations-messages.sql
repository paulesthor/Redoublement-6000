
-- messagerie privée : une ligne par message (a < b = les deux joueurs), et un résumé par joueur et par conversation (liste, non lus)
CREATE TABLE IF NOT EXISTS dms (id INTEGER PRIMARY KEY, a INTEGER NOT NULL, b INTEGER NOT NULL, from_id INTEGER NOT NULL, body TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS dms_conv ON dms(a, b, id);
CREATE TABLE IF NOT EXISTS convs (user_id INTEGER NOT NULL, peer_id INTEGER NOT NULL, last_ts INTEGER NOT NULL, last_body TEXT NOT NULL, last_mine INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, peer_id));
