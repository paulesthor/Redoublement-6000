'use strict';
// Règles partagées entre seed.js (import massif) et live.js (articles tirés à la volée).
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

function stats(title, views) {
  const base = Math.min(95, 15 + Math.log10(views + 1) * 12);
  const j = n => Math.max(5, Math.min(99, Math.round(base + ((hash(title + n) % 31) - 15))));
  return { atk: j('a'), def: j('d') };
}
/** Rareté par rang de popularité (import massif). */
function rarityFor(rank, total) {
  const p = rank / total;
  return p < 0.02 ? 'legendary' : p < 0.10 ? 'epic' : p < 0.35 ? 'rare' : 'common';
}
/** Rareté par vues mensuelles absolues (article isolé, sans classement). */
function rarityByViews(v) {
  return v >= 150000 ? 'legendary' : v >= 20000 ? 'epic' : v >= 3000 ? 'rare' : 'common';
}
module.exports = { stats, rarityFor, rarityByViews };
