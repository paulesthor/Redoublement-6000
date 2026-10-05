'use strict';
// Réserve d'articles "frais" : un worker d'arrière-plan tire des articles aléatoires sur Wikipédia,
// les enregistre en base (avec photo, résumé, vues) et les met en file. L'ouverture d'un booster ne
// fait donc JAMAIS d'appel réseau : elle pioche dans la file en mémoire.
const { db } = require('./db');
const { stats, rarityByViews } = require('./cardutil');

const API = process.env.WIKI_API || 'https://fr.wikipedia.org/w/api.php';
const REST = process.env.WIKI_REST || 'https://wikimedia.org/api/rest_v1';
const UA = { 'User-Agent': 'WikimastersClone/1.0 (jeu prive entre amis)' };
const TARGET = { common: +process.env.FRESH_TARGET || 40, rare: 15, epic: 3, legendary: 0 }; // taille visée de chaque file
const BATCH = 10;

const fresh = { common: [], rare: [], epic: [], legendary: [] }; // ids prêts à être tirés, par rareté
let running = false, failures = 0, onNew = () => {};

const upsert = db.prepare(`INSERT INTO cards (title, extract, image, url, views, rarity, atk, def, length)
  VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(title) DO NOTHING`);
const byTitle = db.prepare('SELECT id, rarity FROM cards WHERE title=?');

async function getJson(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
async function monthlyViews(title) {
  const d = new Date(); d.setUTCDate(1);
  const end = new Date(d); d.setUTCMonth(d.getUTCMonth() - 1);
  const f = x => x.toISOString().slice(0, 10).replace(/-/g, '');
  const j = await getJson(`${REST}/metrics/pageviews/per-article/fr.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${f(d)}/${f(end)}`);
  return j?.items?.reduce((s, i) => s + i.views, 0) ?? 0;
}

async function fetchBatch() {
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'random', grnnamespace: '0', grnlimit: String(BATCH), grnfilterredir: 'nonredirects',
    prop: 'extracts|pageimages|info', inprop: 'url', exintro: '1', explaintext: '1', exlimit: 'max', exchars: '600',
    piprop: 'thumbnail', pithumbsize: '400', pilimit: 'max',
  });
  const j = await getJson(API + '?' + q);
  if (!j?.query?.pages) throw new Error('réponse Wikipédia vide');
  const pages = Object.values(j.query.pages).filter(p =>
    p.extract && p.extract.length >= 80 && !/^(Liste|Chronologie|Saison|Palmarès) /.test(p.title) && !/peut (aussi )?désigner|peut faire référence à/i.test(p.extract.slice(0, 200)));
  const withViews = await Promise.all(pages.map(async p => ({ p, v: await monthlyViews(p.title) })));
  const ids = [];
  for (const { p, v } of withViews) {
    const { atk, def } = stats(p.title, v);
    upsert.run(p.title, p.extract.trim(), p.thumbnail?.source ?? null, p.fullurl, v, rarityByViews(v), atk, def, p.length || 0);
    const row = byTitle.get(p.title);
    ids.push({ id: row.id, rarity: row.rarity }); onNew(row.id, row.rarity);
  }
  return ids;
}

const needMore = () => Object.keys(TARGET).some(r => fresh[r].length < TARGET[r] && r !== 'epic' && r !== 'legendary');

/** Remplit les files en arrière-plan ; ne bloque jamais l'appelant. */
async function refill() {
  if (running || process.env.LIVE_FETCH === '0') return;
  running = true;
  let loops = 0;
  try {
    // le tirage est uniforme : les articles rares/épiques sont peu fréquents, on borne donc le nombre de lots
    while (needMore() && failures < 5 && loops++ < 25) {
      try {
        for (const { id, rarity } of await fetchBatch()) if (fresh[rarity].length < 4 * (TARGET[rarity] || 1)) fresh[rarity].push(id);
        failures = 0;
      } catch (e) { failures++; console.warn(`[live] ${e.message} (essai ${failures}/5)`); await new Promise(r => setTimeout(r, 1000 * failures)); }
    }
  } finally {
    running = false;
    if (failures >= 5) setTimeout(() => { failures = 0; refill(); }, 60000).unref(); // on réessaie dans 1 min
  }
}

module.exports = {
  /** Callback appelé pour chaque carte nouvellement connue (pour mettre à jour les pools du serveur). */
  setOnNew(fn) { onNew = fn; },
  /** Retire un article aléatoire de la rareté demandée (ou null si la file est vide) et relance le remplissage. */
  takeFresh(rarity) {
    const id = fresh[rarity]?.shift() ?? null;
    if (fresh.common.length < TARGET.common / 2 || fresh.rare.length < TARGET.rare / 2) refill();
    return id;
  },
  refill,
  fetchBatch, // utilisé par `seed.js --random=N`
  size: () => Object.fromEntries(Object.entries(fresh).map(([r, a]) => [r, a.length])),
};
