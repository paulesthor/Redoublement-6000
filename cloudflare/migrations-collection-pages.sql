ALTER TABLE inventory ADD COLUMN rar INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN sh INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN skey INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN nk TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN fav INTEGER NOT NULL DEFAULT 0;
UPDATE inventory SET acquired = rowid WHERE acquired IS NULL;
UPDATE inventory SET rar = x.r, sh = x.sh, skey = x.r * 1000000000 + MIN(x.views, 999999999), nk = lower(x.title)
  FROM (SELECT id, title, views, shiny sh, CASE rarity WHEN 'common' THEN 0 WHEN 'uncommon' THEN 1 WHEN 'rare' THEN 2 WHEN 'super' THEN 3 WHEN 'ultra' THEN 4 ELSE 5 END r FROM cards) x
  WHERE x.id = inventory.card_id;
UPDATE inventory SET fav = 1 WHERE EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = inventory.user_id AND f.card_id = inventory.card_id);
CREATE INDEX IF NOT EXISTS inventory_skey ON inventory(user_id, skey, card_id);
CREATE INDEX IF NOT EXISTS inventory_acq ON inventory(user_id, acquired, card_id);
CREATE INDEX IF NOT EXISTS inventory_nk ON inventory(user_id, nk, card_id);
CREATE INDEX IF NOT EXISTS inventory_qty ON inventory(user_id, qty, card_id);
CREATE INDEX IF NOT EXISTS inventory_fav ON inventory(user_id, fav, skey, card_id);
CREATE INDEX IF NOT EXISTS inventory_stats ON inventory(user_id, rar, sh, qty);
