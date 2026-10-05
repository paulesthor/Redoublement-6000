'use strict';
// Remplit la table `cards`.
//   node seed.js            -> récupère les articles les plus vus de fr.wikipedia (nécessite Internet)
//   node seed.js --sample   -> charge data/sample-cards.json (hors-ligne, pour tester)
//   node seed.js --all     -> parcourt TOUTES les pages de fr.wikipedia (reprise automatique si interrompu)
//   options: --days=30 --count=2000 --limit=200000 (arrêt après N pages) --rps=5 (requêtes/s)
//   WIKI_API=https://fr.wikipedia.org/w/api.php (changeable)
// À lancer UNE fois (ou de temps en temps) : le jeu n'appelle plus jamais Wikipédia en direct,
// ce qui supprime l'essentiel du lag.
const fs = require('node:fs');
const path = require('node:path');
const { db, tx } = require('./db');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const API = process.env.WIKI_API || 'https://fr.wikipedia.org/w/api.php';
const UA = { 'User-Agent': 'WikimastersClone/1.0 (jeu prive entre amis)' };

const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const stats = (title, views) => {
  const base = Math.min(95, 15 + Math.log10(views + 1) * 12);
  const j = n => Math.max(5, Math.min(99, Math.round(base + ((hash(title + n) % 31) - 15))));
  return { atk: j('a'), def: j('d') };
};
function rarityFor(rank, total) {
  const p = rank / total;
  return p < 0.02 ? 'legendary' : p < 0.10 ? 'epic' : p < 0.35 ? 'rare' : 'common';
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  return null;
}

async function topViews(days) {
  const totals = new Map();
  const now = new Date(); now.setUTCDate(now.getUTCDate() - 2);
  for (let i = 0; i < days; i++) {
    const d = new Date(now); d.setUTCDate(d.getUTCDate() - i);
    const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), dd = String(d.getUTCDate()).padStart(2, '0');
    const j = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/fr.wikipedia/all-access/${y}/${m}/${dd}`);
    for (const a of j?.items?.[0]?.articles ?? []) {
      if (a.article.includes(':') || a.article === 'Accueil') continue;
      totals.set(a.article, (totals.get(a.article) || 0) + a.views);
    }
    process.stdout.write(`\rpages vues: jour ${i + 1}/${days}, ${totals.size} articles`);
  }
  console.log();
  return [...totals].sort((a, b) => b[1] - a[1]);
}

async function details(titles) {
  const out = new Map();
  const chunks = []; for (let i = 0; i < titles.length; i += 20) chunks.push(titles.slice(i, i + 20));
  let done = 0;
  const worker = async () => {
    while (chunks.length) {
      const chunk = chunks.pop();
      const q = new URLSearchParams({
        action: 'query', format: 'json', redirects: '1', prop: 'extracts|pageimages|info', inprop: 'url',
        exintro: '1', explaintext: '1', exlimit: 'max', exchars: '600', piprop: 'thumbnail', pithumbsize: '400',
        pilimit: 'max', titles: chunk.map(t => t.replace(/_/g, ' ')).join('|'),
      });
      const j = await getJson(API + '?' + q);
      for (const p of Object.values(j?.query?.pages ?? {})) {
        if (p.missing !== undefined || !p.extract || p.extract.length < 80) continue;
        out.set(p.title, { extract: p.extract.trim(), image: p.thumbnail?.source ?? null, url: p.fullurl });
      }
      process.stdout.write(`\rdétails: ${++done * 20}/${titles.length}`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log();
  return out;
}

function store(rows) {
  const ins = db.prepare(`INSERT INTO cards (title, extract, image, url, views, rarity, atk, def)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(title) DO UPDATE SET extract=excluded.extract, image=excluded.image, url=excluded.url,
      views=excluded.views, rarity=excluded.rarity, atk=excluded.atk, def=excluded.def`);
  tx(() => rows.forEach((r, i) => {
    const { atk, def } = stats(r.title, r.views);
    ins.run(r.title, r.extract, r.image, r.url, r.views, rarityFor(i, rows.length), atk, def);
  }));
  console.log(`${rows.length} cartes enregistrées.`);
}

// ---- mode --all : crawl de toutes les pages (reprise via la table meta) ----
function rerank() {
  // rareté = rang de popularité (vues si connues, sinon taille de l'article) sur toute la base
  const rows = all2('SELECT id, title, views, length FROM cards ORDER BY views DESC, length DESC');
  const upd = db.prepare('UPDATE cards SET rarity=?, atk=?, def=? WHERE id=?');
  tx(() => rows.forEach((r, i) => {
    const eff = r.views || Math.round(r.length / 20);
    const { atk, def } = stats(r.title, eff);
    upd.run(rarityFor(i, rows.length), atk, def, r.id);
  }));
  console.log(`Raretés recalculées sur ${rows.length} cartes.`);
}
const all2 = (sql, ...p) => db.prepare(sql).all(...p);

async function crawlAll() {
  const limit = +args.limit || Infinity, delay = 1000 / (+args.rps || 5);
  const getMeta = db.prepare("SELECT v FROM meta WHERE k='allpages_continue'");
  const setMeta = db.prepare("INSERT INTO meta (k,v) VALUES ('allpages_continue',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v");
  let cont = JSON.parse(getMeta.get()?.v || '{}'), seen = 0, stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\nArrêt demandé, fin de la requête en cours…'); });
  const views = new Map(); // vues connues seulement pour le top (option --days)
  if (args.days) for (const [t, v] of await topViews(+args.days)) views.set(t.replace(/_/g, ' '), v);
  const up = db.prepare(`INSERT INTO cards (title, extract, image, url, views, rarity, atk, def, length)
    VALUES (?,?,?,?,?, 'common', 10, 10, ?)
    ON CONFLICT(title) DO UPDATE SET extract=excluded.extract, image=COALESCE(excluded.image, cards.image),
      url=excluded.url, views=MAX(cards.views, excluded.views), length=excluded.length`);
  while (!stop && seen < limit) {
    const t0 = Date.now();
    const q = new URLSearchParams({
      action: 'query', format: 'json', generator: 'allpages', gapnamespace: '0', gapfilterredir: 'nonredirects', gaplimit: '20',
      prop: 'extracts|pageimages|info', inprop: 'url', exintro: '1', explaintext: '1', exlimit: 'max', exchars: '600',
      piprop: 'thumbnail', pithumbsize: '400', pilimit: 'max', ...cont,
    });
    const j = await getJson(API + '?' + q, 5);
    if (!j) { console.error('\nÉchec réseau répété, arrêt (relance pour reprendre).'); break; }
    tx(() => {
      for (const p of Object.values(j.query?.pages ?? {})) {
        if (!p.extract || p.extract.length < 80 || /peut (aussi )?désigner|peut faire référence à/i.test(p.extract.slice(0, 200))) continue;
        up.run(p.title, p.extract.trim(), p.thumbnail?.source ?? null, p.fullurl, views.get(p.title) || 0, p.length || 0);
        seen++;
      }
      if (j.continue) setMeta.run(JSON.stringify(j.continue));
      else { setMeta.run('{}'); stop = true; console.log('\nToutes les pages ont été parcourues.'); }
    });
    cont = j.continue || {};
    process.stdout.write(`\r${seen} pages enregistrées (reprise: ${cont.gapcontinue || 'fin'})      `);
    await new Promise(r => setTimeout(r, Math.max(0, delay - (Date.now() - t0))));
  }
  console.log();
  rerank();
}

(async () => {
  if (args.all) return crawlAll();
  if (args.sample) {
    const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sample-cards.json'), 'utf8'))
      .map(c => ({ ...c, image: null, url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(c.title.replace(/ /g, '_'))}` }))
      .sort((a, b) => b.views - a.views);
    return store(rows);
  }
  const count = +args.count || 2000;
  const top = (await topViews(+args.days || 30)).slice(0, Math.round(count * 1.3));
  if (!top.length) { console.error('Aucune donnée reçue : Wikipédia est-il accessible depuis cette machine ?'); process.exit(1); }
  const det = await details(top.map(([t]) => t));
  const rows = [];
  for (const [t, v] of top) {
    const d = det.get(t.replace(/_/g, ' '));
    if (d && rows.length < count) rows.push({ title: t.replace(/_/g, ' '), views: v, ...d });
  }
  store(rows);
})();
