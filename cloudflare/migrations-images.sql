-- À appliquer UNE fois sur une base D1 existante (npx wrangler d1 execute wikimasters --remote --file=migrations-images.sql)
DROP INDEX IF EXISTS cards_enriched;
CREATE INDEX IF NOT EXISTS cards_enriched ON cards(enriched) WHERE enriched >= 1;
