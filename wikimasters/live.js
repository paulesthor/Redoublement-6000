'use strict';
// Catalogue + enrichissement paresseux, comme WikiMasters :
//  - le catalogue (titre, vues, rang, rareté) vient des exports officiels de Wikipédia (`seed.js --dump`) ;
//  - la description et l'image d'une carte sont récupérées via l'API MediaWiki PUIS conservées en base ;
//  - une réserve en mémoire d'articles déjà enrichis, par rareté, rend l'ouverture d'un booster instantanée.
const { db } = require('./db');
const CFG = require('./config');
const { SHINY_OFFSET, stats, rankRanges } = require('./cardutil');

const API = process.env.WIKI_API || 'https://fr.wikipedia.org/w/api.php';
const UA = { 'User-Agent': 'WikimastersClone/1.0 (jeu prive entre amis)' };

const q = {
  byRank: db.prepare('SELECT id FROM cards WHERE rank = ?'),
  rows: n => db.prepare(`SELECT id, title, rarity, shiny, enriched, atk, extract, image FROM cards WHERE id IN (${Array(n).fill('?').join(',')})`),
  setStats: db.prepare('UPDATE cards SET atk=?, def=? WHERE id=?'),
  setInfo: db.prepare('UPDATE cards SET extract=?, image=?, url=?, enriched=1 WHERE id=?'),
  copyShiny: db.prepare('UPDATE cards SET extract=?, image=?, url=?, enriched=1 WHERE id=?'),
  count: db.prepare('SELECT COUNT(*) n FROM cards WHERE shiny = 0'),
  meta: db.prepare("SELECT v FROM meta WHERE k='ranges'"),
};
const urlOf = title => 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));

// ---- catalogue ----
let ranges = null; // { rarity: [début, fin[ }
function loadRanges() {
  const stored = q.meta.get();
  if (stored) ranges = JSON.parse(stored.v);
  else {
    const n = q.count.get().n;
    ranges = n ? rankRanges(n) : null;
  }
  return ranges;
}
const catalogSize = () => (ranges ? Object.values(ranges).reduce((m, r) => Math.max(m, r[1]), 0) : 0);
const total = rarity => (ranges ? ranges[rarity][1] - ranges[rarity][0] : 0);

/** Id d'une page tirée uniformément parmi les pages d'une rareté (sans toucher au réseau). */
function randomId(rarity) {
  if (!ranges) return null;
  const [a, b] = ranges[rarity];
  if (b <= a) return null;
  return q.byRank.get(a + Math.floor(Math.random() * (b - a)))?.id ?? null;
}

/** Calcule et enregistre les stats fixes d'une carte si elles ne le sont pas encore. */
function ensureStats(id) {
  const r = db.prepare('SELECT id, title, rarity, shiny, atk FROM cards WHERE id=?').get(id);
  if (r && !r.atk) { const s = stats(r.title, r.rarity, !!r.shiny); q.setStats.run(s.atk, s.def, id); }
}

/** Transforme une légendaire en sa variante shiny (stats propres, description copiée de la page de base). */
function toShiny(id) {
  const sid = id + SHINY_OFFSET;
  const base = db.prepare('SELECT title, extract, image, url, enriched FROM cards WHERE id=?').get(id);
  if (!base || !db.prepare('SELECT 1 FROM cards WHERE id=?').get(sid)) return id;
  ensureStats(sid);
  if (base.enriched) q.copyShiny.run(base.extract, base.image, base.url || urlOf(base.title), sid);
  return sid;
}

// ---- enrichissement via l'API MediaWiki ----
async function getJson(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
/** Récupère description + image des cartes non enrichies, les conserve en base. Renvoie { done, todo }. */
async function enrich(ids) {
  const baseIds = [...new Set(ids.map(i => (i >= SHINY_OFFSET ? i - SHINY_OFFSET : i)))];
  const todo = baseIds.length ? q.rows(baseIds.length).all(...baseIds).filter(r => !r.enriched) : [];
  let done = 0;
  const out = () => ({ done, todo: todo.length });
  for (let i = 0; i < todo.length; i += 20) {
    const chunk = todo.slice(i, i + 20);
    const params = new URLSearchParams({
      action: 'query', format: 'json', pageids: chunk.map(r => r.id).join('|'), prop: 'extracts|pageimages',
      exintro: '1', explaintext: '1', exlimit: 'max', exchars: '600', piprop: 'thumbnail', pithumbsize: '400', pilimit: 'max',
    });
    const j = await getJson(API + '?' + params);
    if (!j?.query?.pages) continue; // réseau indisponible : on réessaiera plus tard
    const pages = j.query.pages;
    db.exec('BEGIN');
    try {
      for (const r of chunk) {
        const p = pages[r.id] || {};
        q.setInfo.run((p.extract || '').trim(), p.thumbnail?.source ?? null, urlOf(r.title), r.id);
        if (r.rarity === 'legendary' && db.prepare('SELECT 1 FROM cards WHERE id=?').get(r.id + SHINY_OFFSET)) toShiny(r.id);
        done++;
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); console.warn('[enrich]', e.message); }
  }
  return out();
}
/** Enrichit en attendant au plus `ms` millisecondes (l'ouverture d'un booster ne doit pas traîner). */
const enrichWithin = (ids, ms) => Promise.race([enrich(ids).catch(() => ({ done: 0, todo: 0 })), new Promise(r => setTimeout(r, ms))]);

// ---- réserve d'articles prêts ----
const reserve = Object.fromEntries(CFG.RARITIES.map(r => [r, []]));
let running = false, failures = 0;

async function refill() {
  if (running || process.env.LIVE_FETCH === '0' || !ranges) return;
  running = true;
  try {
    while (failures < 5) {
      const want = [];
      for (const r of CFG.RARITIES) {
        const missing = Math.min(CFG.RESERVE[r] - reserve[r].length, total(r));
        for (let i = 0; i < missing; i++) { const id = randomId(r); if (id != null && !reserve[r].includes(id)) want.push([r, id]); }
      }
      if (!want.length) break;
      const { done, todo } = await enrich(want.map(w => w[1]));
      if (todo && !done) { failures++; console.warn(`[live] API Wikipédia indisponible (essai ${failures}/5)`); await new Promise(r => setTimeout(r, 1000 * failures)); continue; }
      failures = 0;
      for (const [r, id] of want) { ensureStats(id); reserve[r].push(id); }
    }
  } finally {
    running = false;
    if (failures >= 5) setTimeout(() => { failures = 0; refill(); }, 60000).unref();
  }
}

module.exports = {
  loadRanges, catalogSize, total, randomId, ensureStats, toShiny, enrich, enrichWithin, refill,
  /** Retire une carte déjà enrichie de la réserve pour cette rareté (ou null) et relance le remplissage. */
  take(rarity) {
    const id = reserve[rarity].shift() ?? null;
    if (reserve[rarity].length < CFG.RESERVE[rarity] / 2) refill();
    return id;
  },
  size: () => Object.fromEntries(Object.entries(reserve).map(([r, a]) => [r, a.length])),
};
