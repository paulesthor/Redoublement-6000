-- À appliquer UNE fois sur une base D1 créée avant l'arrivée des amis (npx wrangler d1 execute wikimasters --remote --file=migrations-friends.sql)
ALTER TABLE users ADD COLUMN friend_code TEXT;
UPDATE users SET friend_code = lower(hex(randomblob(5))) WHERE friend_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_friend_code ON users(friend_code);
CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL REFERENCES users(id),
  friend_id INTEGER NOT NULL REFERENCES users(id),
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 1,
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
