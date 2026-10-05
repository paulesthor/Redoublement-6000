'use strict';
const CFG = require('./config');

const SHINY_OFFSET = 100000000; // id d'une variante shiny = id de la page + SHINY_OFFSET
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Statistiques fixes d'une page : déterministes (titre + rareté), donc identiques à chaque tirage. */
function stats(title, rarity, shiny = false) {
  const [lo, hi] = shiny ? CFG.SHINY_RANGE : CFG.STAT_RANGE[rarity];
  const best = lo + hash(title + '|best') % (hi - lo + 1);
  const other = Math.round(best * (0.5 + (hash(title + '|other') % 501) / 1000)); // entre 50 % et 100 % de la meilleure
  return hash(title + '|side') % 2 === 0 ? { atk: best, def: other } : { atk: other, def: best };
}

/** Bornes de rang [début, fin[ de chaque rareté pour un catalogue de n pages (rang 0 = la plus populaire). */
function rankRanges(n, shares = CFG.CATALOG_SHARE) {
  const ranges = {}; let start = 0, acc = 0;
  const order = [...CFG.RARITIES].reverse(); // légendaire d'abord
  for (const r of order) {
    acc += shares[r];
    const end = r === 'common' ? n : Math.min(n, Math.round(n * acc / 100));
    ranges[r] = [start, end]; start = end;
  }
  return ranges;
}
module.exports = { SHINY_OFFSET, hash, stats, rankRanges };
