import CFG from './config.js';
import { SHINY_OFFSET, SHARD, RANK, stats, urlOf, caseSql, HttpError, bad, json, one, all, run, st, placeholders, cardRows,
  userFromToken, hash, hashPw, randomHex, notify, searchBucket, flushUsage, randomPool, isQuotaError, nextResetMs, QUOTA_MSG, meter, takeMeter, recHttp } from './util.js';
import { withDb } from './pg.js';
import { handleMigrate } from './migrate.js';
import { secure } from './secure.js';
import { installEconomy } from './economy.js';
import { installEvents } from './events.js';
import { EVENT_ALBUMS } from './events-data.js';
import { logEvent, flushLogs, readLogs, pruneLogs } from './logs.js';
import { ACH, achievements, statsFromInventory } from './achievements.js';
import { battleQuestions, aiQuestions, dailyQuestions, lastAiError, tryModel } from './aiquiz.js';
import { getVapid, pushTo, wake, pull } from './push.js';
import { dayKey, msToMidnight, DAILY, dailyState, QUESTS, QUEST, BONUS, questsFor, ensureGameSchema, bumpQuests, FUSE, boosted, fuseInfo, tPayouts, TITLES, TITLE, TITLE_CATS, grantTitle, syncTitles } from './game.js';
export { Lobby } from './lobby.js';

const { PACK_EVERY, PACK_MAX, PACK_SIZE, SELL, POINTS, RARITIES } = CFG;
/** Fait avancer les quêtes du joueur, en tâche de fond (ne ralentit jamais la réponse). */
const bq = (env, ctx, uid, ev) => ctx?.waitUntil(bumpQuests(env, uid, ev));
const UA = { 'User-Agent': 'WikimastersClone/1.0 (https://github.com/paulesthor/Redoublement-6000; jeu prive entre amis)' };
const now = () => Date.now();

// ---------- catalogue (fichiers statiques /catalog/*.json, servis par Workers Assets) ----------
let metaCache = null;
const shardCache = new Map();
async function assetJson(env, origin, path) {
  const r = await env.ASSETS.fetch(new Request(origin + path));
  if (!r.ok) bad(`Catalogue introuvable (${path}) : lance build-catalog puis redéploie`, 503);
  return r.json();
}
async function getMeta(env, origin) {
  return (metaCache ??= await assetJson(env, origin, '/catalog/meta.json'));
}
async function entryAt(env, origin, rank) {
  const sid = Math.floor(rank / SHARD);
  let shard = shardCache.get(sid);
  if (!shard) {
    shard = await assetJson(env, origin, `/catalog/${sid}.json`);
    shardCache.set(sid, shard);
    if (shardCache.size > 40) shardCache.delete(shardCache.keys().next().value);
  }
  return shard[rank % SHARD]; // [id, titre, vues]
}

// ---------- tirage ----------
function pickRarity(ranges, min = 0, w = CFG.DROP) {
  let avail = RARITIES.filter(r => RANK[r] >= min && ranges[r][1] > ranges[r][0] && w[r] > 0);
  if (!avail.length) avail = RARITIES.filter(r => ranges[r][1] > ranges[r][0]);           // poids personnalisés inutilisables : taux normaux
  if (!avail.length) bad('Catalogue vide', 503);
  let roll = Math.random() * avail.reduce((s, r) => s + (w[r] > 0 ? w[r] : CFG.DROP[r]), 0);
  for (const r of avail) { if ((roll -= (w[r] > 0 ? w[r] : CFG.DROP[r])) < 0) return r; }
  return avail.at(-1);
}
/** Taux de drop personnalisés d'un joueur (réglés par l'admin), ou les taux normaux. */
function userWeights(u) {
  try { const w = u?.drop_w && JSON.parse(u.drop_w); return w && RARITIES.some(r => w[r] > 0) ? Object.fromEntries(RARITIES.map(r => [r, Math.max(0, +w[r] || 0)])) : CFG.DROP; } catch { return CFG.DROP; }
}
/** Raretés d'un GODPACK : uniquement des ultra rares et des légendaires, au moins une légendaire. */
const godRarities = n => { const r = Array.from({ length: n }, () => Math.random() < CFG.GODPACK_LEGEND ? 'legendary' : 'ultra'); if (!r.includes('legendary')) r[Math.floor(Math.random() * n)] = 'legendary'; return r; };
/** Raretés dont les cartes de la réserve sont réutilisées (lecture seule) : elles ne coûtent presque aucune écriture. */
const REUSE = { common: 1, uncommon: 1 }, REUSE_RENEW = 0.25;
const reserveCountsCache = { t: 0, v: {} };
async function reserveCounts(env) {
  if (now() - reserveCountsCache.t > 300000) { reserveCountsCache.v = Object.fromEntries((await all(env, 'SELECT rarity, COUNT(*) n, MIN(id) lo, MAX(id) hi FROM reserve GROUP BY rarity')).map(r => [r.rarity, r])); reserveCountsCache.t = now(); }
  return reserveCountsCache.v;
}
async function drawCards(env, origin, n, w = CFG.DROP, theme = null, ev = null) {
  const { ranges } = await getMeta(env, origin);
  if (ev && (ev.legend > 1 || ev.ultra > 1)) w = { ...w, legendary: w.legendary * ev.legend, ultra: w.ultra * ev.ultra };     // heure dorée
  if (theme) w = { ...w, legendary: w.legendary * CFG.THEME_LEGEND_MULT };               // paquet thématique : plus de légendaires, toutes de la catégorie
  const god = !theme && n === PACK_SIZE && Math.random() < CFG.GODPACK_CHANCE;           // très rare : tout le paquet est ultra rare ou légendaire
  const rarities = god ? godRarities(n) : ev?.allCommon ? Array.from({ length: n }, () => 'common') : Array.from({ length: n }, () => pickRarity(ranges, 0, w));   // allCommon : faux godpack
  if (theme && ev?.themeGuarantee && !rarities.includes('legendary')) rarities[Math.floor(Math.random() * n)] = 'legendary';   // festival des catégories : une légendaire garantie
  // 1) cartes déjà prêtes dans la réserve (une requête groupée) ; 2) sinon tirage direct dans le catalogue
  let claimed = rarities.map(() => null);
  try {
    // raretés basses : la carte est relue sans être retirée (aucune écriture), et seulement renouvelée une fois sur REUSE_RENEW ; autres raretés : retirée à chaque tirage
    const counts = await reserveCounts(env);
    // carte au hasard sans parcourir la table : on part d'un identifiant tiré entre le plus petit et le plus grand (une seule ligne lue)
    const reads = rarities.map(r => theme && r === 'legendary' ? st(env, 'SELECT id FROM reserve WHERE false') : REUSE[r] && counts[r]?.n > 0 ? st(env, 'SELECT id FROM reserve WHERE rarity = ? AND id >= ? LIMIT 1', r, counts[r].lo + Math.floor(Math.random() * (counts[r].hi - counts[r].lo + 1))) : null);
    const res = await env.DB.batch(rarities.map((r, i) => reads[i] ?? st(env, 'DELETE FROM reserve WHERE id = (SELECT id FROM reserve WHERE rarity = ? LIMIT 1) RETURNING id', r)));
    claimed = res.map(x => x.results?.[0]?.id ?? null);
    const renew = claimed.filter((id, i) => id && reads[i] && Math.random() < REUSE_RENEW);
    if (renew.length) { reserveCountsCache.t = 0; env.DB.batch(renew.map(id => st(env, 'DELETE FROM reserve WHERE id = ?', id))).catch(() => {}); }
  } catch { /* table absente ou erreur : tirage direct */ }
  const ready = claimed.filter(Boolean);
  const rows = new Map(ready.length ? (await all(env, `SELECT id, title, views FROM cards WHERE id IN (${placeholders(ready.length)})`, ...ready)).map(r => [r.id, r]) : []);
  const taken = new Set();
  const used = new Set();                                                       // jamais deux fois la même carte dans un paquet
  const themed = theme ? theme.cards.slice() : null;
  const picks = rarities.map((rarity0, i) => {
    let rarity = rarity0;
    if (themed && rarity === 'legendary') {                                     // carte légendaire de la catégorie, jamais deux fois la même dans le paquet
      if (themed.length) { const [c] = themed.splice(Math.floor(Math.random() * themed.length), 1); return { rarity, rank: c.r }; }
      rarity = 'ultra';                                                           // toutes les cartes de la catégorie sont déjà dans ce paquet : la suivante est une ultra rare
    }
    if (claimed[i] && rows.has(claimed[i]) && !used.has(claimed[i])) { used.add(claimed[i]); return { rarity, ready: rows.get(claimed[i]) }; }
    const [a, b] = ranges[rarity];
    for (let tries = 0; ; tries++) {
      const rank = a + Math.floor(Math.random() * (b - a));
      if (!taken.has(rank) || tries >= 30) { taken.add(rank); return { rarity, rank }; }
    }
  });
  // cartes d'événement : la carte recherchée du jour et une carte de l'album éphémère remplacent une carte de basse rareté du paquet
  for (const c of theme ? [] : [ev?.hunt && { r: ev.hunt.r }, ev?.album?.length && { r: ev.album[Math.floor(Math.random() * ev.album.length)].r }].filter(Boolean)) {
    if (picks.some(p => p.rank === c.r)) continue;
    const slot = picks.findIndex(p => !p.ready && (p.rarity === 'common' || p.rarity === 'uncommon')), i = slot >= 0 ? slot : picks.findIndex(p => p.rarity !== 'legendary');
    if (i >= 0) picks[i] = { rarity: RARITIES.find(r => c.r >= ranges[r][0] && c.r < ranges[r][1]) ?? 'common', rank: c.r };
  }
  const entries = await Promise.all(picks.map(p => p.ready ? null : entryAt(env, origin, p.rank)));
  return picks.map((p, i) => {
    const [page, title, views] = p.ready ? [p.ready.id, p.ready.title, p.ready.views] : entries[i];
    const shiny = p.rarity === 'legendary' && Math.random() < CFG.SHINY_CHANCE * (ev?.shiny || 1);
    return { id: shiny ? page + SHINY_OFFSET : page, title, views, rarity: p.rarity, shiny: shiny ? 1 : 0, ...(god ? { god: 1 } : {}), ...stats(title, p.rarity, shiny) };
  });
}
const insertCard = (env, c) => st(env, 'INSERT OR IGNORE INTO cards (id, title, views, rarity, atk, def, shiny, url) VALUES (?,?,?,?,?,?,?,?)',
  c.id, c.title, c.views, c.rarity, c.atk, c.def, c.shiny, urlOf(c.title));
/** Rang de rareté (0..5) d'une colonne de rareté. */
const rarIdx = col => caseSql(col, RANK);
/** Ajoute des exemplaires à la collection. L'inventaire garde une copie des champs de tri (rareté, nom, popularité) : la collection se pagine ainsi sans relire la table des cartes. */
const addCard = (env, uid, cid, n = 1) => st(env,
  `INSERT INTO inventory (user_id, card_id, qty, acquired, rar, sh, skey, nk, fav)
   SELECT ?1, c.id, ?2, ?3, ${rarIdx('c.rarity')}, c.shiny, ${rarIdx('c.rarity')}::bigint * 1000000000 + LEAST(c.views, 999999999), lower(c.title), 0 FROM cards c WHERE c.id = ?4
   ON CONFLICT(user_id, card_id) DO UPDATE SET qty = inventory.qty + excluded.qty`, uid, n, now(), cid);   // acquired = première obtention : un doublon ne réécrit plus l'index de date (économie d'écritures D1)

// ---------- description + image via l'API MediaWiki, conservées en base ----------
// enriched : 0 = rien, 1 = Wikipédia lu (image éventuellement manquante), 2 = terminé (Wikidata consulté pour les pages sans photo)
const IMG_PROPS = ['P18', 'P154', 'P41', 'P94']; // image, logo, drapeau, armoiries (par ordre de préférence)
async function wikidataImages(qids) {
  const out = new Map();
  if (!qids.length) return { out, ok: true };
  const params = new URLSearchParams({ action: 'wbgetentities', ids: qids.join('|'), props: 'claims', format: 'json' });
  try {
    const r = await fetch('https://www.wikidata.org/w/api.php?' + params, { headers: UA });
    if (!r.ok) return { out, ok: false };
    const j = await r.json();
    for (const [q, e] of Object.entries(j.entities || {})) {
      for (const prop of IMG_PROPS) {
        const name = e.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
        if (typeof name === 'string') { out.set(q, `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=400`); break; }
      }
    }
    return { out, ok: true };
  } catch { return { out, ok: false }; }
}
// fichiers à ignorer quand on cherche une illustration dans le corps de l'article (icônes, bandeaux, logos de projets…)
const BAD_FILE = /\.(svg|ogg|oga|ogv|webm|mid|midi|pdf|tiff?|djvu)$|^Fichier:(Commons-logo|Logo[ _]disambig|Wiki|Ambox|Question|Disambig|Edit-|Crystal|Nuvola|Folder|Symbol|Padlock|Increase|Decrease|Loupe|Portail|OOjs|Gnome|Stub|Information|Gtk|Merge|Text[ _]|Translation|Bandeau|Lock|Quote|Arrow|Replacement)/i;
const WP = 'https://fr.wikipedia.org/w/api.php?';
async function wpJson(params) {
  try { const r = await fetch(WP + new URLSearchParams({ action: 'query', format: 'json', ...params }), { headers: UA }); if (r.ok) return (await r.json()).query ?? {}; } catch { /* hors-ligne */ }
  return null;
}
const wpPages = (extra) => wpJson({
  prop: 'extracts|pageimages|pageprops', ppprop: 'wikibase_item', exintro: '1', explaintext: '1', exlimit: 'max', exchars: '600',
  piprop: 'thumbnail', pithumbsize: '400', pilimit: 'max', pilicense: 'any', redirects: '1', ...extra,
}).then(q => q?.pages ?? null);

/** Illustrations présentes dans le corps de l'article (y compris images non libres, usage privé) pour les pages sans « image principale ». */
async function articleImages(pids, titleOf = new Map()) {
  const out = new Map();
  if (!pids.length) return { out, ok: true };
  const q = await wpJson({ pageids: pids.join('|'), prop: 'images', imlimit: 'max' });
  if (!q?.pages) return { out, ok: false };
  const cand = new Map(); // titre de fichier -> pid
  for (const pid of pids) {
    const files = (q.pages[pid]?.images || []).map(i => i.title).filter(t => !BAD_FILE.test(t));
    const words = (titleOf.get(pid) || '').toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter(w => w.length >= 4);
    const score = f => (/\.jpe?g$/i.test(f) ? 1 : 0) + (words.some(w => f.toLowerCase().includes(w)) ? 2 : 0); // un nom de fichier qui ressemble au titre est plus fiable
    files.sort((a, b) => score(b) - score(a));
    for (const t of files.slice(0, 2)) cand.set(t, pid);
  }
  const titles = [...cand.keys()].slice(0, 50);
  if (!titles.length) return { out, ok: true };
  const info = await wpJson({ titles: titles.join('|'), prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: '400' });
  if (!info?.pages) return { out, ok: false };
  for (const f of Object.values(info.pages)) {
    const ii = f.imageinfo?.[0], pid = cand.get(f.title);
    if (ii?.thumburl && pid && ii.width >= 150 && ii.height >= 150 && !out.has(pid)) out.set(pid, ii.thumburl);
  }
  return { out, ok: true };
}

async function enrich(env, ids) {
  const rows = ids.length ? await all(env, `SELECT id, title FROM cards WHERE (enriched = 0 OR (enriched = 1 AND image IS NULL)) AND id IN (${placeholders(ids.length)})`, ...ids) : [];
  const titleOf = new Map(rows.map(r => [r.id >= SHINY_OFFSET ? r.id - SHINY_OFFSET : r.id, r.title]));
  const pages = [...titleOf.keys()];
  for (let i = 0; i < pages.length; i += 20) {
    const chunk = pages.slice(i, i + 20);
    const found = await wpPages({ pageids: chunk.join('|') });
    if (!found) continue;
    const got = new Map(); // pid -> page ({} = page introuvable ; absent = erreur réseau, on réessaiera)
    for (const pid of chunk) {
      let p = found[pid];
      if (!p || p.title !== titleOf.get(pid)) { // l'identifiant ne correspond plus au titre (page renommée, ancien catalogue…) : on cherche par titre
        const byTitle = await wpPages({ titles: titleOf.get(pid) });
        if (!byTitle) continue;
        p = Object.values(byTitle)[0];
        if (!p || p.missing !== undefined) p = {};
      }
      got.set(pid, p);
    }
    const noThumb = [...got].filter(([, p]) => !p.thumbnail).map(([pid]) => pid);
    const wdQ = noThumb.filter(pid => got.get(pid).pageprops?.wikibase_item);
    const [art, wd] = await Promise.all([articleImages(noThumb, titleOf), wikidataImages(wdQ.map(pid => got.get(pid).pageprops.wikibase_item))]);
    if (!got.size) continue;
    await env.DB.batch([...got].map(([pid, p]) => {
      const image = p.thumbnail?.source ?? art.out.get(pid) ?? wd.out.get(p.pageprops?.wikibase_item) ?? null;
      const done = image || (art.ok && wd.ok) ? 2 : 1; // 1 = on réessaiera plus tard (source injoignable)
      return st(env, 'UPDATE cards SET extract = ?, image = COALESCE(?, image), enriched = ? WHERE id IN (?, ?)', (p.extract || '').trim(), image, done, pid, pid + SHINY_OFFSET);
    }));
  }
}


// ---------- succès ----------
async function userStats(env, uid) {
  const [u, inv, mk] = await Promise.all([
    one(env, 'SELECT duel_wins wins, packs_opened packs, coins FROM users WHERE id = ?', uid),
    all(env, 'SELECT rar, sh shiny, COUNT(*) n FROM inventory WHERE user_id = ? GROUP BY rar, sh', uid).then(rows => rows.map(r => ({ rarity: RARITIES[r.rar], shiny: r.shiny, n: r.n }))),
    one(env, "SELECT (SELECT COUNT(*) FROM auctions WHERE seller_id = ? AND status = 'sold') sold, (SELECT COUNT(*) FROM auctions WHERE bidder_id = ? AND status = 'sold') won, (SELECT COUNT(*) FROM friends WHERE user_id = ?) friends", uid, uid, uid),
  ]);
  return { ...u, ...mk, ...statsFromInventory(inv, RARITIES) };
}
/** Débloque les succès atteints (récompense en pièces + notification). */
async function checkAchievements(env, ctx, user) {
  const stats = await userStats(env, user.id);
  const have = new Set((await all(env, 'SELECT key FROM achievements WHERE user_id = ?', user.id)).map(r => r.key));
  let unlocked = 0;
  for (const a of achievements(stats).filter(a => a.done && !have.has(a.k))) {
    const ins = await run(env, 'INSERT OR IGNORE INTO achievements (user_id, key, ts) VALUES (?,?,?)', user.id, a.k, now());
    if (!ins.meta.changes) continue;
    await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', a.r, user.id);
    notify(env, ctx, { t: 'notify', msg: `Succès débloqué : ${a.t} (+${a.r} pièces)` }, user.id);
    unlocked++;
  }
  if (unlocked) bq(env, ctx, user.id, { achievement: unlocked });
  const ti = await syncTitles(env, user.id).catch(() => null);
  ti?.added.forEach(id => notify(env, ctx, { t: 'notify', msg: `Nouveau titre débloqué : « ${TITLE[id].label} » !` }, user.id));
  return stats;
}
const lastCheck = new Map();
const lastPrep = new Map();

// ---------- recherche dans tout le catalogue ----------
const bucketCache = new Map();
async function rankOf(env, origin, title) {
  const b = searchBucket(title);
  let list = bucketCache.get(b);
  if (!list) {
    list = await assetJson(env, origin, `/catalog/s/${b}.json`);
    bucketCache.set(b, list);
    if (bucketCache.size > 200) bucketCache.delete(bucketCache.keys().next().value);
  }
  return list.find(e => e[1] === title)?.[0] ?? null;
}
// ---------- paquets du joueur ----------
async function refreshPacks(env, u) {
  const elapsed = Math.floor((now() - u.pack_ts) / PACK_EVERY);
  if (elapsed > 0 && u.pack_stock < PACK_MAX) {   // au-delà du plafond (paquets offerts), rien à recharger
    const stock = Math.min(PACK_MAX, u.pack_stock + elapsed);
    const ts = stock >= PACK_MAX ? now() : u.pack_ts + elapsed * PACK_EVERY;
    await run(env, 'UPDATE users SET pack_stock = ?, pack_ts = ? WHERE id = ?', stock, ts, u.id);
    u.pack_stock = stock; u.pack_ts = ts;
  }
  return u;
}
/** Le mode test (paquets illimités) n'existe que pour un administrateur, même si la colonne a été activée autrement. */
const testOn = u => !!(u.test_mode && u.is_admin);
const publicUser = u => ({
  id: u.id, name: u.name, coins: u.coins, packs: u.pack_stock, wins: u.duel_wins, losses: u.duel_losses,
  av: u.avatar_v ?? null, title: u.title ?? null, test: testOn(u), admin: !!u.is_admin, nextPackIn: u.pack_stock >= PACK_MAX ? 0 : Math.max(0, u.pack_ts + PACK_EVERY - now()),
});

async function finishPack(env, ctx, user, drawn, spent = 0, fake = false) {
  // TOUT part en un seul aller-retour vers la base (une transaction) : lecture « déjà possédées », écritures, relecture des cartes et des favoris
  const ids = [...new Set(drawn.map(c => c.id))], ph = placeholders(ids.length);
  const god = drawn.some(c => c.god), hitsOf = drawn.filter(c => c.rarity === 'legendary');
  const res = await env.DB.batch([
    st(env, `SELECT card_id FROM inventory WHERE user_id = ? AND card_id IN (${ph})`, user.id, ...ids),
    ...drawn.map(c => insertCard(env, c)),
    ...drawn.map(c => addCard(env, user.id, c.id)),
    ...drawn.filter(c => c.shiny).map(c => st(env, 'UPDATE cards SET extract = (SELECT extract FROM cards WHERE id = ?1), image = (SELECT image FROM cards WHERE id = ?1), enriched = (SELECT enriched FROM cards WHERE id = ?1) WHERE id = ?2 AND enriched = 0 AND EXISTS (SELECT 1 FROM cards WHERE id = ?1)', c.id - SHINY_OFFSET, c.id)),
    st(env, 'UPDATE users SET packs_opened = packs_opened + 1 WHERE id = ?', user.id),
    ...(god ? [st(env, 'INSERT INTO hits (username, title, shiny, ts) VALUES (?,?,?,?)', user.name, 'un GODPACK', 0, now())] : []),
    ...hitsOf.map(c => st(env, 'INSERT INTO hits (username, title, shiny, ts) VALUES (?,?,?,?)', user.name, c.title, c.shiny, now())),
    st(env, `SELECT * FROM cards WHERE id IN (${ph})`, ...ids),
    st(env, `SELECT card_id FROM favorites WHERE user_id = ? AND card_id IN (${ph})`, user.id, ...ids),
  ]);
  const before = new Set(res[0].results.map(r => r.card_id)), rows = new Map(res.at(-2).results.map(c => [c.id, c])), favs = new Set(res.at(-1).results.map(r => r.card_id));
  if (now() - (lastCheck.get(user.id) || 0) > 900000) { lastCheck.set(user.id, now()); ctx.waitUntil(checkAchievements(env, ctx, user).catch(() => {})); }   // la vérification relit toute la collection : au plus toutes les 15 min
  const seen = new Set();
  const cards = drawn.map(c => { const isNew = !before.has(c.id) && !seen.has(c.id); seen.add(c.id); return { ...rows.get(c.id), isNew, fav: favs.has(c.id) ? 1 : 0 }; })
    .sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || b.shiny - a.shiny);
  if (god) {                                                                  // annonce à tout le monde
    notify(env, ctx, { t: 'hit', user: user.name, title: 'un GODPACK', shiny: false, ts: now() });
    notify(env, ctx, { t: 'notify', msg: `${user.name} vient d'ouvrir un GODPACK !`, except: user.id });
  }
  for (const c of cards.filter(c => c.rarity === 'legendary')) notify(env, ctx, { t: 'hit', user: user.name, title: c.title, shiny: !!c.shiny, ts: now() });
  if (god) ctx.waitUntil(grantTitle(env, user.id, 'godpack').then(n => n && notify(env, ctx, { t: 'notify', msg: 'Nouveau titre débloqué : « Touché par les dieux » !' }, user.id)));
  ctx.waitUntil(events.afterPack(env, ctx, user, drawn));                      // carte recherchée du jour
  bq(env, ctx, user.id, { open_pack: 1, new_cards: cards.filter(c => c.isNew).length, rare_plus: cards.filter(c => RANK[c.rarity] >= 2).length, legendary: cards.filter(c => c.rarity === 'legendary').length, spend: spent });
  return { cards, god, ...(fake ? { fake: true } : {}) };
}


// ---------- réserve de cartes prêtes (texte + photo déjà récupérés) ----------
// Un tirage prend ses cartes dans cette réserve quand elle en a : plus aucune attente de Wikipédia à l'ouverture.
// La tâche planifiée la remplit en continu avec des pages tirées au hasard (même loi que le tirage direct).
const RESERVE_TARGET = { common: 250, uncommon: 120, rare: 80, super: 18, ultra: 12, legendary: 9 };   // raretés basses : grosse réserve relue sans écriture
const ASSET_ORIGIN = 'https://assets.local';
async function refillReserve(env, max = 30) {
  const { ranges } = await getMeta(env, ASSET_ORIGIN);
  const have = Object.fromEntries((await all(env, 'SELECT rarity, COUNT(*) n FROM reserve GROUP BY rarity')).map(r => [r.rarity, r.n]));
  const want = [];
  for (let k = 0; k < max; k++) {                                   // on comble d'abord les raretés les plus dégarnies (en proportion)
    const r = RARITIES.map(x => [x, (RESERVE_TARGET[x] - (have[x] || 0)) / RESERVE_TARGET[x]]).sort((a, b) => b[1] - a[1])[0];
    if (r[1] <= 0) break;
    want.push(r[0]); have[r[0]] = (have[r[0]] || 0) + 1;
  }
  if (!want.length) return 0;
  const picks = want.map(rarity => ({ rarity, rank: ranges[rarity][0] + Math.floor(Math.random() * (ranges[rarity][1] - ranges[rarity][0])) }));
  const entries = await Promise.all(picks.map(p => entryAt(env, ASSET_ORIGIN, p.rank)));
  const items = picks.map((p, i) => ({ ...p, id: entries[i][0], title: entries[i][1], views: entries[i][2] }));
  await env.DB.batch(items.map(c => insertCard(env, { ...c, shiny: 0, ...stats(c.title, c.rarity, false) })));
  const ids = items.map(c => c.id);
  await enrich(env, ids);
  const ok = new Set((await all(env, `SELECT id FROM cards WHERE extract != '' AND id IN (${placeholders(ids.length)})`, ...ids)).map(r => r.id));
  const keep = items.filter(c => ok.has(c.id));
  if (keep.length) await env.DB.batch(keep.map(c => st(env, 'INSERT OR IGNORE INTO reserve (id, rarity, rank) VALUES (?,?,?)', c.id, c.rarity, c.rank)));
  return keep.length;
}

let lastRefill = 0;
/** Remplissage de la réserve à la demande (au plus toutes les 30 s par instance) : la tâche planifiée n'est qu'un renfort. */
function maybeRefill(env, ctx) {
  if (now() - lastRefill < 120000) return;
  lastRefill = now();
  ctx.waitUntil(refillReserve(env).catch(e => console.error('refillReserve', e)));
}


// ---------- paquets préparés d'avance ----------
// Dès que le joueur arrive (ou après chaque ouverture), on tire et on complète (texte + photos) ses prochains paquets :
// ils s'ouvrent ensuite instantanément, les uns après les autres. Rien n'est ajouté à la collection avant l'ouverture.
const PREPARE_MAX = 1;
const preparing = new Set();
async function prepareFor(env, ctx, user, stock) {
  if (user.is_bot || preparing.has(user.id)) return;
  const want = Math.min(PREPARE_MAX, Math.max(stock, testOn(user) ? PREPARE_MAX : 0, user.coins >= CFG.PACK_PRICE ? 1 : 0));
  if (want < 1) return;
  preparing.add(user.id);
  try {
    const wk = user.drop_w ?? '';                       // empreinte des taux de drop : un paquet préparé avec d'autres taux est jeté
    await run(env, 'DELETE FROM prepared WHERE user_id = ? AND w != ?', user.id, wk);
    const have = (await one(env, 'SELECT COUNT(*) n FROM prepared WHERE user_id = ?', user.id)).n;
    for (let k = have; k < want; k++) {
      const drawn = await drawCards(env, ASSET_ORIGIN, PACK_SIZE, userWeights(user));
      const ids = [...new Set(drawn.map(c => c.id))];
      await env.DB.batch(drawn.map(c => insertCard(env, c)));
      await enrich(env, ids);
      await env.DB.batch([
        ...drawn.filter(c => c.shiny).map(c => st(env, 'UPDATE cards SET extract = (SELECT extract FROM cards WHERE id = ?1), image = (SELECT image FROM cards WHERE id = ?1), enriched = (SELECT enriched FROM cards WHERE id = ?1) WHERE id = ?2 AND enriched = 0 AND EXISTS (SELECT 1 FROM cards WHERE id = ?1)', c.id - SHINY_OFFSET, c.id)),
        st(env, 'INSERT INTO prepared (user_id, cards, ts, w) VALUES (?,?,?,?)', user.id, JSON.stringify(drawn), now(), wk),
      ]);
    }
  } finally { preparing.delete(user.id); }
}
/** Le plus ancien paquet préparé du joueur (ou null). */
async function takePrepared(env, uid, wk = '') {
  const res = await env.DB.batch([                                         // un seul aller-retour : on jette les paquets aux anciens taux, puis on prend le plus ancien
    st(env, 'DELETE FROM prepared WHERE user_id = ? AND w != ?', uid, wk),
    st(env, 'DELETE FROM prepared WHERE id = (SELECT id FROM prepared WHERE user_id = ? ORDER BY id LIMIT 1) RETURNING cards', uid),
  ]).catch(() => null);
  const row = res?.[1]?.results?.[0];
  try { return row ? JSON.parse(row.cards) : null; } catch { return null; }
}

// ---------- joueurs simulés : ils mettent des cartes en vente et enchérissent ----------
const BOT_NAMES = ['Camille_75', 'Mathis.B', 'LéoDu13', 'Inès_Cards', 'Nolan', 'Zoé_Wiki', 'Hugo_Collect', 'Manon', 'Théo_Lyon', 'Sarah.M', 'Ethan_FR', 'Jade_Cartes',
  'Lucas_Bdx', 'Chloé.R', 'Maël', 'Anaïs_34', 'Romain_Wiki', 'Lina', 'Axel_Lille', 'Eva.D', 'Tom_Collec', 'Louise_59', 'Noah', 'Clara_Nice'];
const BOT_PRICE = { common: [2, 6], uncommon: [5, 14], rare: [12, 36], super: [40, 110], ultra: [120, 320], legendary: [350, 900] };
const BOT_MIX = [['common', .30], ['uncommon', .27], ['rare', .23], ['super', .12], ['ultra', .06], ['legendary', .02]];
const BOT_MINUTES = [[60, .3], [360, .3], [720, .2], [1440, .2]];
const BOT_LISTINGS = 30;                 // ventes simulées ouvertes en permanence
const BOT_NEW_PER_TICK = 5;
const pickW = list => { let r = Math.random() * list.reduce((t, x) => t + x[1], 0); for (const [v, w] of list) if ((r -= w) < 0) return v; return list.at(-1)[0]; };
const rand = (a, b) => a + Math.random() * (b - a);
/** Envie des joueurs pour une page : 0,2 (page très peu vue) à 1 (des dizaines de milliers de vues par mois). Plus une page est visitée, plus elle est convoitée. */
const demand = views => Math.min(1, Math.max(.2, Math.log10(Math.max(1, views)) / 5));
let lastBot = 0;

/** Chance qu'une carte cherchée soit mise en vente par un joueur simulé : plus la carte est rare, moins c'est probable (la recherche ne garantit plus rien). */
const WISH_CHANCE = { common: .40, uncommon: .30, rare: .22, super: .14, ultra: .08, legendary: .04 };
/** Tirage décidé une fois par heure pour un même joueur et une même carte : chercher 20 fois la même carte ne change pas le résultat. */
const wishRoll = (uid, c) => hash(`${uid}:${c.id}:${Math.floor(now() / 3600e3)}`) / 4294967296 < (WISH_CHANCE[c.rarity] ?? .1);
/** Une carte cherchée par un joueur peut (parfois) être mise en vente par un joueur simulé, à un moment aléatoire dans l'heure. */
async function wishListing(env, c) {
  const busy = await one(env, "SELECT 1 x FROM auctions WHERE card_id = ? AND (status = 'open' OR ends_at > ?)", c.id, now() - 6 * 3600e3);
  if (busy) return;
  await env.DB.batch([
    insertCard(env, { id: c.id, title: c.title, views: c.views, rarity: c.rarity, shiny: 0, atk: c.atk, def: c.def }),
    st(env, 'INSERT OR IGNORE INTO wanted (card_id, at) VALUES (?,?)', c.id, now() + Math.round(rand(2, 58) * 60000)),
  ]);
}

/** Joueurs simulés (créés au besoin) : ils vendent et enchérissent à la place de vrais joueurs. */
async function getBots(env) {
  let bots = await all(env, 'SELECT id, name FROM users WHERE is_bot = 1');
  if (bots.length < BOT_NAMES.length) {
    await env.DB.batch(BOT_NAMES.map(n => st(env, "INSERT OR IGNORE INTO users (name, salt, hash, coins, pack_stock, pack_ts, created, is_bot) VALUES (?,?,?,?,?,?,?,1)", n, 'bot', '!', 1e9, 0, now(), now())));
    bots = await all(env, 'SELECT id, name FROM users WHERE is_bot = 1');
  }
  return bots;
}
/** Prix de départ d'une vente simulée : prix moyen du marché s'il existe, sinon fourchette de la rareté ; une page très visitée coûte un peu plus. */
const botPrice = (rarity, views, avg) => { const [lo, hi] = BOT_PRICE[rarity], d = demand(views); return Math.max(1, Math.round((avg ?? rand(lo, hi)) * rand(.8, 1.3) * (.85 + .5 * d))); };

async function botTick(env, ctx, force = false) {
  if (!force && now() - lastBot < 150000) return;
  lastBot = now();
  const bots = await getBots(env);
  if (!bots.length) return;
  const botName = new Map(bots.map(b => [b.id, b.name]));
  const open = await all(env, `SELECT a.id, a.seller_id, a.bid, a.bidder_id, a.start_price, a.ends_at, a.card_id, c.rarity, c.title, c.views, c.extract, ${AVG} avg_price,
    (SELECT COUNT(*) FROM bids WHERE auction_id = a.id) nb
    FROM auctions a JOIN cards c ON c.id = a.card_id WHERE a.status = 'open' AND a.ends_at > ?`, now());
  const botOpen = open.filter(a => botName.has(a.seller_id));
  const openCards = new Set(open.map(a => a.card_id));
  const stmts = [];

  // 1) ventes demandées par une recherche, arrivées à échéance
  const due = await all(env, 'SELECT w.card_id, c.rarity, c.views FROM wanted w JOIN cards c ON c.id = w.card_id WHERE w.at <= ? LIMIT 6', now());
  const listings = [];                                              // { cardId, rarity, views }
  for (const w of due) { stmts.push(st(env, 'DELETE FROM wanted WHERE card_id = ?', w.card_id)); if (!openCards.has(w.card_id)) { listings.push({ cardId: w.card_id, rarity: w.rarity, views: w.views }); openCards.add(w.card_id); } }

  // 2) catalogue vivant : on garde ~45 ventes simulées ouvertes
  const missing = Math.max(0, Math.min(BOT_NEW_PER_TICK, BOT_LISTINGS - botOpen.length - listings.length));
  if (missing) {
    const { ranges } = await getMeta(env, ASSET_ORIGIN);
    const picks = Array.from({ length: missing }, () => { const rarity = pickW(BOT_MIX); return { rarity, rank: ranges[rarity][0] + Math.floor(rand(0, ranges[rarity][1] - ranges[rarity][0])) }; });
    const entries = await Promise.all(picks.map(p => entryAt(env, ASSET_ORIGIN, p.rank)));
    picks.forEach((p, i) => {
      const [id, title, views] = entries[i];
      if (openCards.has(id)) return;
      openCards.add(id);
      stmts.push(insertCard(env, { id, title, views, rarity: p.rarity, shiny: 0, ...stats(title, p.rarity, false) }));
      listings.push({ cardId: id, rarity: p.rarity, views, fresh: true });
    });
  }
  if (listings.length) {
    const ids = listings.map(l => l.cardId);
    const avgRows = await all(env, `SELECT card_id, CAST(ROUND(AVG(price)) AS INTEGER) p FROM sales WHERE card_id IN (${placeholders(ids.length)}) GROUP BY card_id`, ...ids);
    const avg = new Map(avgRows.map(r => [r.card_id, r.p]));
    for (const l of listings) {
      const [lo, hi] = BOT_PRICE[l.rarity], d = demand(l.views);
      const price = Math.max(1, Math.round((avg.get(l.cardId) ?? rand(lo, hi)) * rand(.8, 1.3) * (.85 + .5 * d)));   // une page très visitée se vend un peu plus cher
      const seller = bots[Math.floor(Math.random() * bots.length)];
      stmts.push(st(env, 'INSERT INTO auctions (seller_id, card_id, start_price, ends_at) VALUES (?,?,?,?)', seller.id, l.cardId, price, now() + Math.round(pickW(BOT_MINUTES) * 60000 * rand(.2, 1))));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);

  // 3) description + photo des cartes mises en vente (en arrière-plan, quelques-unes par passage)
  const bare = [...new Set([...open.filter(a => !a.extract).map(a => a.card_id), ...listings.map(l => l.cardId)])].slice(0, 20);
  if (bare.length) ctx?.waitUntil(enrich(env, bare).catch(() => {}));

  // 4) enchères des joueurs simulés (au plus 4 par passage). Plus la page est visitée, plus on se l'arrache.
  let bidsLeft = 4;
  for (const a of open.sort(() => Math.random() - .5)) {
    if (bidsLeft <= 0) break;
    const d = demand(a.views), humanSeller = !botName.has(a.seller_id), humanLeads = a.bidder_id && !botName.has(a.bidder_id);
    const value = a.avg_price ?? (BOT_PRICE[a.rarity][0] + BOT_PRICE[a.rarity][1]) / 2;
    const maxBids = 2 + Math.round(4 * d);
    let p;
    if (humanSeller) p = a.nb === 0 ? .04 + .30 * d * d : a.nb < maxBids ? .02 + .16 * d * d : 0;   // une vente de joueur reçoit des offres selon la demande
    else if (humanLeads) p = a.nb < maxBids + 2 ? (a.ends_at - now() < 3 * 3600e3 ? .05 + .35 * d * d : .02 + .12 * d * d) : 0; // un humain qui enchérit attire des rivaux
    else p = a.nb < maxBids ? .02 + .08 * d : 0;                    // les ventes entre simulés montent doucement
    if (Math.random() >= p) continue;
    const min = Math.max(a.start_price, a.bid + 1);
    const amount = a.bid ? min + Math.max(0, Math.round(a.bid * rand(.03, .12 + .08 * d))) : min;
    if (amount > value * (1.2 + 1.2 * d) + 3) continue;             // plafond selon l'envie : on surpaye plus pour une page populaire
    const bot = bots.filter(b => b.id !== a.seller_id && b.id !== a.bidder_id)[Math.floor(Math.random() * (bots.length - 1))];
    if (!bot) continue;
    const ends = a.ends_at - now() < 30000 ? now() + 30000 : a.ends_at;
    const won = await run(env, "UPDATE auctions SET bid = ?, bidder_id = ?, ends_at = ? WHERE id = ? AND bid = ? AND status = 'open'", amount, bot.id, ends, a.id, a.bid);
    if (!won.meta.changes) continue;
    bidsLeft--;
    await run(env, 'INSERT INTO bids (auction_id, user_id, amount, ts) VALUES (?,?,?,?)', a.id, bot.id, amount, now());
    if (humanLeads) await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', a.bid, a.bidder_id);   // l'humain surenchéri est remboursé
    const others = new Set((await all(env, 'SELECT DISTINCT user_id FROM bids WHERE auction_id = ?', a.id)).map(r => r.user_id));
    others.add(a.seller_id);
    for (const uid of others) {
      if (botName.has(uid) || uid === bot.id || uid === a.seller_id) continue;   // pas de notification au vendeur pour l'offre d'un joueur simulé (trop nombreuses)
      const msg = uid === a.bidder_id ? `Tu as été surenchéri sur « ${a.title} » : ${amount} pièces par ${bot.name}`
        : `${bot.name} a enchéri ${amount} pièces sur « ${a.title} »`;
      notify(env, ctx, { t: 'notify', msg }, uid);
    }
    (auctionsCache.t = 0, notify(env, ctx, { t: 'refresh', what: 'auctions' }));
  }
}

/** Alertes de prix : prévient les joueurs dont le seuil est franchi par une vente (« ≥ » pour une hausse, « ≤ » pour une baisse), puis retire l'alerte. */
async function checkAlerts(env, ctx, cid, price, title) {
  try {
    await ensureGameSchema(env);
    const rows = await all(env, "SELECT user_id, dir, price FROM price_alerts WHERE card_id = ? AND ((dir = 'up' AND ? >= price) OR (dir = 'down' AND ? <= price))", cid, price, price);
    for (const r of rows) { notify(env, ctx, { t: 'notify', msg: `📈 Alerte prix : « ${title} » vient de se vendre ${price} pièces (seuil ${r.dir === 'up' ? '≥' : '≤'} ${r.price}).` }, r.user_id); await run(env, 'DELETE FROM price_alerts WHERE user_id = ? AND card_id = ? AND dir = ?', r.user_id, cid, r.dir); }
  } catch (e) { console.error('alertes', e); }
}

// ---------- enchères : règlement à la demande (pas de minuteur côté Workers) ----------
async function settleAuctions(env, ctx) {
  const due = await all(env, "SELECT * FROM auctions WHERE status = 'open' AND ends_at <= ? LIMIT 5", now());
  for (const a of due) {
    const claimed = await run(env, "UPDATE auctions SET status = ? WHERE id = ? AND status = 'open'", a.bidder_id ? 'sold' : 'expired', a.id);
    if (!claimed.meta.changes) continue; // déjà réglée par une autre requête
    const card = await one(env, 'SELECT title FROM cards WHERE id = ?', a.card_id);
    const flags = new Map((await all(env, 'SELECT id, is_bot FROM users WHERE id IN (?, ?)', a.seller_id, a.bidder_id ?? a.seller_id)).map(r => [r.id, r.is_bot]));
    const sellerBot = !!flags.get(a.seller_id), bidderBot = !!(a.bidder_id && flags.get(a.bidder_id)); // les joueurs simulés ne gardent pas de cartes
    if (a.bidder_id) {
      await env.DB.batch([
        ...(sellerBot ? [] : [st(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', a.bid, a.seller_id)]),
        ...(bidderBot ? [] : [addCard(env, a.bidder_id, a.card_id)]),
        st(env, 'INSERT INTO sales (card_id, price, ts) VALUES (?,?,?)', a.card_id, a.bid, now()),
      ]);
      ctx?.waitUntil(checkAlerts(env, ctx, a.card_id, a.bid, card.title));
      if (!bidderBot) bq(env, ctx, a.bidder_id, { win_auction: 1 });
      if (!sellerBot) bq(env, ctx, a.seller_id, { sale_done: 1 });
      if (!bidderBot) notify(env, ctx, { t: 'notify', msg: `Tu as remporté « ${card.title} » pour ${a.bid} pièces` }, a.bidder_id);
      if (!sellerBot) notify(env, ctx, { t: 'notify', msg: `« ${card.title} » vendu ${a.bid} pièces` }, a.seller_id);
    } else if (!sellerBot) {
      await addCard(env, a.seller_id, a.card_id).run();
      notify(env, ctx, { t: 'notify', msg: `Enchère sans offre : « ${card.title} » t'est rendue.` }, a.seller_id);
    }
    (auctionsCache.t = 0, notify(env, ctx, { t: 'refresh', what: 'auctions' }));
  }
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, fn, auth = true) =>
  routes.push({ method, label: method + ' ' + pattern, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, auth });

const newSession = async (env, uid) => {
  const token = randomHex(24);
  await run(env, 'INSERT INTO sessions (token, user_id, created) VALUES (?,?,?)', token, uid, now());
  return { token };
};
/** Limite les essais de connexion (devinette de mot de passe) et les créations de compte en rafale : par pseudo et par adresse IP. */
const THROTTLE = { login: [8, 15 * 60000], register: [20, 3600000] }, IP_FACTOR = 5;   // une adresse partagée (wifi d'une famille) tolère 5 fois plus d'essais qu'un seul pseudo
async function throttleCheck(env, kind, keys) {
  await ensureGameSchema(env);
  const [max, win] = THROTTLE[kind];
  const rows2 = await all(env, `SELECT k, n FROM login_fails WHERE k IN (${placeholders(keys.length)}) AND first > ?`, ...keys.map(k => kind + ':' + k), now() - win);
  if (rows2.some(r => r.n >= (r.k.includes(':ip:') || kind === 'register' ? max * (kind === 'login' ? IP_FACTOR : 1) : max))) bad(kind === 'login' ? 'Trop d’essais : réessaie dans quelques minutes' : 'Trop de créations de compte depuis cette connexion, réessaie plus tard', 429);
}
const throttleHit = (env, kind, keys) => env.DB.batch(keys.map(k => st(env, `INSERT INTO login_fails (k, n, first) VALUES (?, 1, ?) ON CONFLICT (k) DO UPDATE SET n = CASE WHEN login_fails.first > ? THEN login_fails.n + 1 ELSE 1 END, first = CASE WHEN login_fails.first > ? THEN login_fails.first ELSE ? END`, kind + ':' + k, now(), now() - THROTTLE[kind][1], now() - THROTTLE[kind][1], now())));
const clientIp = req => req.headers.get('cf-connecting-ip') || 'inconnue';
route('POST', '/api/register', async ({ env, body, req }) => {
  const name = String(body.name || '').trim(), pw = String(body.password || '');
  if (!/^[\p{L}\p{N}_-]{2,20}$/u.test(name)) bad('Pseudo : 2 à 20 caractères (lettres, chiffres, _ -)');
  if (pw.length < 6) bad('Mot de passe trop court (6 min.)');
  if (pw.length > 200) bad('Mot de passe trop long');
  if (env.INVITE_CODE && body.invite !== env.INVITE_CODE) bad('Code d’invitation invalide', 403);
  const ip = clientIp(req);
  await throttleCheck(env, 'register', [ip]);
  if (await one(env, 'SELECT 1 FROM users WHERE lower(name) = lower(?)', name)) bad('Pseudo déjà pris', 409);
  const salt = randomHex(16);
  const r = await run(env, 'INSERT INTO users (name, salt, hash, coins, pack_stock, pack_ts, created, friend_code) VALUES (?,?,?,?,?,?,?,?)',
    name, salt, await hashPw(pw, salt), CFG.START_COINS, CFG.START_PACKS, now(), now(), randomHex(5));
  await throttleHit(env, 'register', [ip]);
  return newSession(env, r.meta.last_row_id);
}, false);
route('POST', '/api/login', async ({ env, body, req }) => {
  const name = String(body.name || '').trim().toLowerCase().slice(0, 40), keys = ['n:' + name, 'ip:' + clientIp(req)];
  await throttleCheck(env, 'login', keys);
  const u = await one(env, 'SELECT * FROM users WHERE lower(name) = lower(?)', String(body.name || '').trim());
  if (!u || (await hashPw(String(body.password || '').slice(0, 200), u.salt)) !== u.hash) { await throttleHit(env, 'login', keys); bad('Pseudo ou mot de passe incorrect', 401); }
  await run(env, 'DELETE FROM login_fails WHERE k = ?', 'login:' + keys[0]);
  return newSession(env, u.id);
}, false);
route('POST', '/api/logout', async ({ req, env }) => { await run(env, 'DELETE FROM sessions WHERE token = ?', (req.headers.get('authorization') || '').replace('Bearer ', '')); return { ok: true }; });
route('POST', '/api/me/password', async ({ env, req, user, body }) => {
  const old = String(body.old || ''), pw = String(body.password || '');
  if ((await hashPw(old.slice(0, 200), user.salt)) !== user.hash) bad('Mot de passe actuel incorrect', 403);
  if (pw.length < 6 || pw.length > 200) bad('Nouveau mot de passe : 6 caractères minimum');
  const salt = randomHex(16), cur = (req.headers.get('authorization') || '').replace('Bearer ', '');
  await env.DB.batch([st(env, 'UPDATE users SET salt = ?, hash = ? WHERE id = ?', salt, await hashPw(pw, salt), user.id), st(env, 'DELETE FROM sessions WHERE user_id = ? AND token <> ?', user.id, cur)]);   // les autres appareils sont déconnectés
  return { ok: true };
});
/** Pastilles du jeu : récompense quotidienne dispo, quêtes à récupérer, quiz du jour pas encore fait. */
async function gameBadges(env, uid) {
  await ensureGameSchema(env);
  const day = dayKey();
  const [d, q, z, ex] = await Promise.all([
    one(env, 'SELECT daily_day, daily_streak FROM users WHERE id = ?', uid),
    all(env, 'SELECT qid, progress, claimed FROM quests WHERE user_id = ? AND day = ?', uid, day),
    one(env, 'SELECT finished FROM daily_quiz_runs WHERE user_id = ? AND day = ?', uid, day),
    one(env, "SELECT COUNT(*) n FROM expeditions WHERE user_id = ? AND status = 'out' AND ends <= ?", uid, now()),
  ]);
  const ds = dailyState(d ?? {}), ids = questsFor(uid, day);
  const qc = q.filter(r => ids.includes(r.qid) && !r.claimed && r.progress >= QUEST[r.qid].goal).length;
  return { daily: ds.available ? { streak: ds.streak, next: ds.next, index: ds.index, rewards: DAILY } : null, qc, dq: z ? (z.finished ? 'done' : 'run') : 'new', ex: +(ex?.n || 0) };
}
route('GET', '/api/me', async ({ env, ctx, user }) => {
  // toutes les 10 min seulement : le calcul relit toute la collection (milliers de lignes)
  if (now() - (lastCheck.get(user.id) || 0) > 1200000) { lastCheck.set(user.id, now()); ctx.waitUntil(checkAchievements(env, ctx, user).catch(() => {})); }
  const u = await refreshPacks(env, user);
  if (now() - (lastPrep.get(user.id) || 0) > 20000) { lastPrep.set(user.id, now()); ctx.waitUntil(prepareFor(env, ctx, u, u.pack_stock).catch(e => console.error('prepareFor', e))); }
  ctx.waitUntil(settleDailyWinners(env, ctx).catch(() => {}));
  if (now() - lastBourse > 600000) { lastBourse = now(); ctx.waitUntil(economy.settleBourse(env, ctx).catch(() => {})); }
  const [badge, dm, extra] = await Promise.all([friendBadge(env, user.id), one(env, 'SELECT COALESCE(SUM(unread), 0) n FROM convs WHERE user_id = ?', user.id).catch(() => null), gameBadges(env, user.id).catch(() => ({}))]);   // lectures en parallèle
  const ev = await events.brief(env).catch(() => []);                           // événements en cours (bannière de l'accueil)
  return { ...publicUser(u), badge, dm: dm?.n ?? 0, ...extra, ev };
});
// images des paquets préparés : le client les met en cache avant l'ouverture
route('GET', '/api/packs/next', async ({ env, user }) => {
  const rows = await all(env, 'SELECT cards FROM prepared WHERE user_id = ? ORDER BY id LIMIT 2', user.id);
  const ids = rows.flatMap(r => { try { return JSON.parse(r.cards).map(c => c.id); } catch { return []; } });
  const imgs = ids.length ? await all(env, `SELECT image FROM cards WHERE image IS NOT NULL AND id IN (${placeholders(ids.length)})`, ...ids) : [];
  return { ready: rows.length, images: imgs.map(r => r.image) };
});
route('GET', '/api/achievements', async ({ env, ctx, user }) => {
  const stats = await checkAchievements(env, ctx, user);
  const got = new Map((await all(env, 'SELECT key, ts FROM achievements WHERE user_id = ?', user.id)).map(r => [r.key, r.ts]));
  return { achievements: achievements(stats).map(a => ({ k: a.k, t: a.t, d: a.d, n: a.n, r: a.r, value: a.value, done: got.has(a.k), ts: got.get(a.k) || null })) };
});
const profileCache = new Map();               // id -> { t, v } : la partie lourde du profil (statistiques) est gardée 60 s
/** Cartes de la vitrine d'un joueur : seulement celles qu'il possède encore, dans l'ordre choisi. */
async function showcaseOf(env, uid, raw) {
  let ids = []; try { ids = JSON.parse(raw || '[]'); } catch { /* vitrine illisible : vide */ }
  ids = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger).slice(0, 3);
  if (!ids.length) return [];
  const rows = await all(env, `SELECT c.id, c.title, c.rarity, c.shiny, c.image, c.atk, c.def, c.views, substr(c.extract, 1, 400) extract, c.enriched FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ? AND i.card_id IN (${placeholders(ids.length)})`, uid, ...ids);
  const by = new Map(rows.map(c => [c.id, c]));
  return ids.map(id => by.get(id)).filter(Boolean);
}
route('GET', '/api/profile/:id', async ({ env, ctx, user, params }) => {
  const id = +params.id;
  if (id !== user.id) bq(env, ctx, user.id, { profile_view: 1 });
  let hit = profileCache.get(id);
  if (!hit || now() - hit.t > 60000) {
    const u = await one(env, 'SELECT id, name, duel_wins wins, duel_losses losses, packs_opened packs, showcase, title, avatar_v av FROM users WHERE id = ? AND is_bot = 0', id);
    if (!u) bad('Joueur introuvable', 404);
    const inv = (await all(env, 'SELECT rar, sh shiny, COUNT(*) n FROM inventory WHERE user_id = ? GROUP BY rar, sh', id)).map(r => ({ rarity: RARITIES[r.rar], shiny: r.shiny, n: r.n }));
    const score = inv.reduce((t, r) => t + (POINTS[r.rarity] || 0) * r.n, 0) + u.wins * 10;
    const top = await all(env, 'SELECT card_id FROM inventory WHERE user_id = ? ORDER BY skey DESC, card_id DESC LIMIT 6', id);   // meilleures cartes : lues dans l'ordre de l'index, sans parcourir toute la collection
    const det = top.length ? new Map((await all(env, `SELECT id, title, rarity, shiny, image, atk, def FROM cards WHERE id IN (${placeholders(top.length)})`, ...top.map(t => t.card_id))).map(c => [c.id, c])) : new Map();
    const best = top.map(t => det.get(t.card_id)).filter(Boolean);
    const ach = await all(env, 'SELECT key, ts FROM achievements WHERE user_id = ? ORDER BY ts DESC', id);
    const { showcase: sc, ...rest } = u;
    hit = { t: now(), v: { ...rest, uniques: inv.reduce((t, r) => t + r.n, 0), score, best, achievements: ach, total: ACH.length, showcase: await showcaseOf(env, id, sc),
      byRarity: Object.fromEntries(RARITIES.map(r => [r, inv.filter(x => x.rarity === r).reduce((t, x) => t + x.n, 0)])) } };
    profileCache.set(id, hit);
  }
  const fr = await one(env, 'SELECT 1 x FROM friends WHERE user_id = ? AND friend_id = ?', user.id, id);
  return { profile: { ...hit.v, isMe: id === user.id, isFriend: !!fr } };
});
// vitrine : jusqu'à trois cartes de sa collection, exposées sur son profil
route('POST', '/api/me/showcase', async ({ env, ctx, user, body }) => {
  const ids = [...new Set((Array.isArray(body.cards) ? body.cards : []).map(Number).filter(Number.isInteger))];
  if (ids.length > 3) bad('Trois cartes au maximum dans la vitrine');
  if (ids.length) {
    const own = new Set((await all(env, `SELECT card_id FROM inventory WHERE user_id = ? AND card_id IN (${placeholders(ids.length)})`, user.id, ...ids)).map(r => r.card_id));
    if (!ids.every(i => own.has(i))) bad('Tu ne possèdes pas une de ces cartes');
  }
  await run(env, 'UPDATE users SET showcase = ? WHERE id = ?', JSON.stringify(ids), user.id);
  profileCache.delete(user.id);
  if (ids.length) bq(env, ctx, user.id, { showcase: 1 });
  return { ok: true, showcase: await showcaseOf(env, user.id, JSON.stringify(ids)) };
});

// ---------- personnalisation du profil : photo et titre ----------
// La photo (carré de 192 px, JPEG) est gardée dans une table à part pour ne pas alourdir la ligne du joueur ; l'adresse contient la version, donc le navigateur la garde un an.
route('GET', '/api/avatar/:id', async ({ env, params }) => {
  await ensureGameSchema(env);
  const row = await one(env, 'SELECT data FROM avatars WHERE user_id = ?', +params.id);
  if (!row) return new Response('', { status: 404, headers: { 'cache-control': 'public, max-age=300' } });
  const bin = Uint8Array.from(atob(row.data), c => c.charCodeAt(0));
  return new Response(bin, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
}, false);
route('POST', '/api/me/avatar', async ({ env, user, body }) => {
  await ensureGameSchema(env);
  if (body.data === null) {
    await env.DB.batch([st(env, 'DELETE FROM avatars WHERE user_id = ?', user.id), st(env, 'UPDATE users SET avatar_v = NULL WHERE id = ?', user.id)]);
    return { ok: true, v: null };
  }
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
  if (!m) bad('Image invalide (JPEG attendu)');
  if (m[1].length > 90000) bad('Image trop lourde');
  const v = now();
  await env.DB.batch([st(env, 'INSERT INTO avatars (user_id, data, ts) VALUES (?,?,?) ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, ts = excluded.ts', user.id, m[1], v), st(env, 'UPDATE users SET avatar_v = ? WHERE id = ?', v, user.id)]);
  return { ok: true, v };
});
route('GET', '/api/cosmetics', async ({ env }) => {
  await ensureGameSchema(env);
  const rows = await all(env, 'SELECT id, name, avatar_v v, title ti FROM users WHERE is_bot = 0 AND (avatar_v IS NOT NULL OR title IS NOT NULL)');
  return { players: rows, labels: Object.fromEntries(TITLES.map(x => [x.id, x.label])) };
});
route('GET', '/api/titles', async ({ env, ctx, user }) => {
  const { owned, added, ctx: c } = await syncTitles(env, user.id);
  added.forEach(id => notify(env, ctx, { t: 'notify', msg: `Nouveau titre débloqué : « ${TITLE[id].label} » !` }, user.id));
  const cur = (await one(env, 'SELECT title FROM users WHERE id = ?', user.id))?.title ?? null;
  return { current: cur, cats: TITLE_CATS, titles: TITLES.map(x => ({ id: x.id, cat: x.cat, label: x.label, desc: x.desc, season: !!x.season, unlocked: owned.has(x.id), prog: !owned.has(x.id) && x.prog ? x.prog(c) : null })) };
});
route('POST', '/api/me/title', async ({ env, user, body }) => {
  await ensureGameSchema(env);
  const id = body.id === null ? null : String(body.id);
  if (id !== null) {
    if (!TITLE[id]) bad('Titre inconnu', 404);
    if (!(await one(env, 'SELECT 1 x FROM user_titles WHERE user_id = ? AND tid = ?', user.id, id))) { const { owned } = await syncTitles(env, user.id); if (!owned.has(id)) bad('Titre pas encore débloqué'); }
  }
  await run(env, 'UPDATE users SET title = ? WHERE id = ?', id, user.id);
  profileCache.delete(user.id);
  return { ok: true, title: id };
});

route('GET', '/api/version', async () => ({ v: CFG.VERSION, db: 'supabase' }), false);
route('GET', '/api/config', async ({ env, origin }) => {
  const meta = await getMeta(env, origin);
  return {
    rarities: RARITIES, labels: CFG.LABELS, drop: CFG.DROP, sell: CFG.SELL, shinyChance: CFG.SHINY_CHANCE, catalog: meta.n, godpack: CFG.GODPACK_CHANCE,
    vapid: (await getVapid(env)).pub, version: CFG.VERSION, packSize: PACK_SIZE, packPrice: CFG.PACK_PRICE, packEveryMin: PACK_EVERY / 60000, packMax: PACK_MAX, fuse: FUSE, ach: ACH.map(a => ({ k: a.k, t: a.t })),
  };
}, false);

route('POST', '/api/me/test-mode', async ({ env, user, body }) => {
  if (!user.is_admin) bad('Le mode test est réservé à l’administrateur', 403);
  await run(env, 'UPDATE users SET test_mode = ? WHERE id = ?', body.on ? 1 : 0, user.id);
  return { ok: true };
});
route('POST', '/api/packs/open', async ({ env, ctx, user, origin }) => {
  maybeRefill(env, ctx);
  const u = await refreshPacks(env, user);
  if (!testOn(u)) {                                      // mode test : paquets illimités
    if (u.pack_stock < 1) bad('Plus de booster disponible, patiente un peu !');
    const wasFull = u.pack_stock >= PACK_MAX;
    const claimed = await run(env, 'UPDATE users SET pack_stock = pack_stock - 1, pack_ts = CASE WHEN ? = 1 THEN ? ELSE pack_ts END WHERE id = ? AND pack_stock >= 1', wasFull ? 1 : 0, now(), u.id);
    if (!claimed.meta.changes) bad('Plus de booster disponible, patiente un peu !');
  }
  const fake = await fakeGod(env, u), evm = fake ? { allCommon: true } : await events.drawMods(env, origin);
  const drawn = (!fake && !evm.direct && await takePrepared(env, u.id, u.drop_w ?? '')) || await drawCards(env, origin, PACK_SIZE, userWeights(u), null, evm);
  ctx.waitUntil(prepareFor(env, ctx, u, Math.max(0, u.pack_stock - (testOn(u) ? 0 : 1))).catch(e => console.error('prepareFor', e)));   // le paquet suivant se prépare pendant l'animation
  return finishPack(env, ctx, user, drawn, 0, fake);
});
/** Ouvre 10 boosters d'un coup (même tirage que /api/packs/open, paquet après paquet) : renvoie les 10 tirages pour l'animation « dix paquets en ligne ». */
const OPEN_MANY = 10;
route('POST', '/api/packs/open10', async ({ env, ctx, user, origin }) => {
  maybeRefill(env, ctx);
  const u = await refreshPacks(env, user);
  if (!testOn(u)) {
    if (u.pack_stock < OPEN_MANY) bad(`Il te faut ${OPEN_MANY} boosters (tu en as ${u.pack_stock})`);
    const wasFull = u.pack_stock >= PACK_MAX;
    const claimed = await run(env, 'UPDATE users SET pack_stock = pack_stock - ?, pack_ts = CASE WHEN ? = 1 THEN ? ELSE pack_ts END WHERE id = ? AND pack_stock >= ?', OPEN_MANY, wasFull ? 1 : 0, now(), u.id, OPEN_MANY);
    if (!claimed.meta.changes) bad(`Il te faut ${OPEN_MANY} boosters`);
  }
  const packs = [];
  try {
    for (let k = 0; k < OPEN_MANY; k++) {
      const fake = await fakeGod(env, u), evm = fake ? { allCommon: true } : await events.drawMods(env, origin);
      const drawn = (!fake && !evm.direct && await takePrepared(env, u.id, u.drop_w ?? '')) || await drawCards(env, origin, PACK_SIZE, userWeights(u), null, evm);
      packs.push(await finishPack(env, ctx, user, drawn, 0, fake));
    }
  } catch (e) {                                              // tirage impossible en route : les boosters non ouverts sont rendus
    if (!testOn(u) && packs.length < OPEN_MANY) await run(env, 'UPDATE users SET pack_stock = pack_stock + ? WHERE id = ?', OPEN_MANY - packs.length, u.id).catch(() => {});
    throw e;
  }
  ctx.waitUntil(prepareFor(env, ctx, u, Math.max(0, u.pack_stock - (testOn(u) ? 0 : OPEN_MANY))).catch(e => console.error('prepareFor', e)));
  return { packs };
});
/** Achète et ouvre 10 boosters d'un coup (10 × le prix d'un booster). */
route('POST', '/api/packs/buy10', async ({ env, ctx, user, origin }) => {
  maybeRefill(env, ctx);
  const total = CFG.PACK_PRICE * OPEN_MANY;
  const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', total, user.id, total);
  if (!paid.meta.changes) bad(`Pas assez de pièces (${total} requises)`);
  const packs = [];
  try {
    for (let k = 0; k < OPEN_MANY; k++) {
      const fake = await fakeGod(env, user), evm = fake ? { allCommon: true } : await events.drawMods(env, origin);
      const drawn = (!fake && !evm.direct && await takePrepared(env, user.id, user.drop_w ?? '')) || await drawCards(env, origin, PACK_SIZE, userWeights(user), null, evm);
      packs.push(await finishPack(env, ctx, user, drawn, CFG.PACK_PRICE, fake));
    }
  } catch (e) {                                              // tirage impossible en route : les paquets non ouverts sont remboursés
    await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', CFG.PACK_PRICE * (OPEN_MANY - packs.length), user.id).catch(() => {});
    throw e;
  }
  ctx.waitUntil(prepareFor(env, ctx, { ...user, coins: user.coins - total }, user.pack_stock).catch(e => console.error('prepareFor', e)));
  return { packs };
});
/** Plaisanterie rare : un paquet sur 250 est un FAUX godpack (l'animation de godpack, puis un doigt d'honneur et dix communes). PRANK = '0' la coupe (tests). */
const fakeGod = async (env, user) => {
  if (env.PRANK === '0') return false;
  await ensureGameSchema(env);
  // victimes désignées : leur PROCHAIN paquet est un faux godpack (une seule fois, mémorisé en base pour ne jamais se répéter)
  if (FAKE_NEXT.includes(String(user?.name || '').toLowerCase()) && (await run(env, 'INSERT INTO event_claims (key, user_id, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', 'fakegod:' + String(user.name).toLowerCase(), user.id, now())).meta.changes > 0) return true;
  return Math.random() < CFG.FAKE_GOD_CHANCE;
};
const FAKE_NEXT = ['fourniseur2caca'];
route('POST', '/api/packs/buy', async ({ env, ctx, user, origin }) => {
  maybeRefill(env, ctx);
  const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', CFG.PACK_PRICE, user.id, CFG.PACK_PRICE);
  if (!paid.meta.changes) bad(`Pas assez de pièces (${CFG.PACK_PRICE} requises)`);
  const fake = await fakeGod(env, user), evm = fake ? { allCommon: true } : await events.drawMods(env, origin);
  const drawn = (!fake && !evm.direct && await takePrepared(env, user.id, user.drop_w ?? '')) || await drawCards(env, origin, PACK_SIZE, userWeights(user), null, evm);
  ctx.waitUntil(prepareFor(env, ctx, { ...user, coins: user.coins - CFG.PACK_PRICE }, user.pack_stock).catch(e => console.error('prepareFor', e)));
  return finishPack(env, ctx, user, drawn, CFG.PACK_PRICE, fake);
});
route('POST', '/api/cards/enrich', async ({ env, body }) => {
  const ids = (body.ids || []).map(Number).filter(Number.isFinite).slice(0, 40);
  await enrich(env, ids);
  return { cards: (await cardRows(env, ids)).map(c => ({ id: c.id, extract: c.extract, image: c.image, enriched: c.enriched })) };
});
route('GET', '/api/hits', async ({ env }) => ({
  hits: (await all(env, 'SELECT username AS user, title, shiny, ts FROM hits ORDER BY id DESC LIMIT 10')).map(h => ({ ...h, shiny: !!h.shiny })),
}));

const AVG = '(SELECT CAST(ROUND(AVG(price)) AS INTEGER) FROM (SELECT price FROM sales WHERE card_id = c.id ORDER BY id DESC LIMIT 10))';
route('POST', '/api/favorites', async ({ env, ctx, user, body }) => {
  const id = +body.card_id;
  if (body.on) {
    if (!(await one(env, 'SELECT 1 x FROM inventory WHERE user_id = ? AND card_id = ?', user.id, id))) bad('Tu ne possèdes pas cette carte');
    await run(env, 'INSERT OR IGNORE INTO favorites (user_id, card_id, ts) VALUES (?,?,?)', user.id, id, now());
  } else await run(env, 'DELETE FROM favorites WHERE user_id = ? AND card_id = ?', user.id, id);
  await run(env, 'UPDATE inventory SET fav = ? WHERE user_id = ? AND card_id = ?', body.on ? 1 : 0, user.id, id);
  if (body.on) bq(env, ctx, user.id, { favorite: 1 });
  return { ok: true };
});
// ---- collection paginée : 40 cartes par page, tri et filtres faits par la base grâce aux colonnes de tri de l'inventaire ----
const PAGE = 40;
const SORTS = {                     // colonnes de l'ordre (index inventory_*) et sens ; la dernière colonne départage toujours (card_id)
  rar: { cols: ['skey', 'card_id'], dir: 'DESC' }, new: { cols: ['acquired', 'card_id'], dir: 'DESC' }, old: { cols: ['acquired', 'card_id'], dir: 'ASC' },
  name: { cols: ['nk', 'card_id'], dir: 'ASC' }, qty: { cols: ['qty', 'card_id'], dir: 'DESC' }, fav: { cols: ['fav', 'skey', 'card_id'], dir: 'DESC' }, lvl: { cols: ['lvl', 'skey', 'card_id'], dir: 'DESC' },
};
route('GET', '/api/album/page', async ({ env, user, query }) => {
  await ensureGameSchema(env);
  const uid = query.get('user') ? +query.get('user') : user.id;
  if (uid !== user.id && !(await one(env, 'SELECT 1 x FROM users WHERE id = ? AND is_bot = 0', uid))) bad('Joueur introuvable', 404);
  const sort = SORTS[query.get('sort')] ?? SORTS.rar, { cols, dir } = sort;
  const where = ['i.user_id = ?'], args = [uid];
  const r = RANK[query.get('rar')];
  if (r !== undefined) { where.push('i.skey >= ? AND i.skey < ?'); args.push(r * 1e9, (r + 1) * 1e9); }
  if (query.get('fav')) where.push('i.fav = 1');
  if (query.get('fused')) where.push('i.lvl > 0');
  if (query.get('dup')) where.push('i.qty > 1');
  const q = String(query.get('q') || '').toLowerCase().replace(/[%_\\]/g, '').trim().slice(0, 60);
  if (q) { where.push('i.nk ILIKE ?'); args.push(`%${q}%`); }
  let cur = null; try { cur = JSON.parse(query.get('cursor') || 'null'); } catch { /* ignoré */ }
  if (Array.isArray(cur) && cur.length === cols.length) {
    where.push(`(${cols.map(c => 'i.' + c).join(', ')}) ${dir === 'DESC' ? '<' : '>'} (${cols.map(() => '?').join(', ')})`); args.push(...cur);
  }
  const order = cols.map(c => `i.${c} ${dir}`).join(', ');
  const rows = await all(env, `SELECT i.card_id, i.qty, i.acquired, i.fav, i.skey, i.nk, i.lvl FROM inventory i WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${PAGE + 1}`, ...args);
  const more = rows.length > PAGE, page = rows.slice(0, PAGE);
  const det = page.length ? new Map((await all(env, `SELECT c.*, ${AVG} AS avg_price FROM cards c WHERE c.id IN (${placeholders(page.length)})`, ...page.map(x => x.card_id))).map(c => [c.id, c])) : new Map();
  const cards = page.map(x => { const c = det.get(x.card_id), rar = RANK[c.rarity]; return { ...boosted(c, rar, x.lvl), qty: x.qty, acquired: x.acquired, fav: x.fav, ...(uid === user.id ? { fuse: fuseInfo(rar, c.shiny, x.lvl, x.qty) } : {}) }; });
  return { cards, next: more ? cols.map(c => page.at(-1)[c === 'card_id' ? 'card_id' : c]) : null };
});
const statsCache = new Map();         // userId -> { t, v } : relire toute la collection coûte cher, on garde le résultat 60 s (vidé par les ventes)
let rarityAvgCache = { t: 0, v: null };
route('GET', '/api/album/stats', async ({ env, user, origin }) => {
  const hit = statsCache.get(user.id);
  if (hit && now() - hit.t < 120000) return hit.v;
  const [agg, meta] = await Promise.all([
    all(env, 'SELECT rar, sh, COUNT(*) u, SUM(qty) q, SUM(CASE WHEN qty > 1 THEN qty - 1 ELSE 0 END) d FROM inventory WHERE user_id = ? GROUP BY rar, sh', user.id),
    getMeta(env, origin),
  ]);
  if (now() - rarityAvgCache.t > 600000) rarityAvgCache = { t: now(), v: Object.fromEntries((await all(env, 'SELECT c.rarity, CAST(ROUND(AVG(s.price)) AS INTEGER) p, COUNT(*) n FROM sales s JOIN cards c ON c.id = s.card_id GROUP BY c.rarity')).map(r => [r.rarity, { avg: r.p, n: r.n }])) };
  const have = Object.fromEntries(RARITIES.map(r => [r, 0]));
  let uniques = 0, copies = 0, dupes = 0, worth = 0;
  const tiers = RARITIES.map(r => ({ r, n: 0, price: 0 }));
  for (const x of agg) {
    const rar = RARITIES[x.rar]; uniques += x.u; copies += x.q; dupes += x.d; worth += x.q * SELL[rar];
    if (!x.sh) have[rar] += x.u;
    for (let k = x.rar; k < RARITIES.length; k++) { tiers[k].n += x.d; tiers[k].price += x.d * SELL[rar]; }
  }
  const v = { uniques, copies, dupes, worth, have, tiers, total: Object.fromEntries(RARITIES.map(r => [r, meta.ranges[r][1] - meta.ranges[r][0]])), rarityAvg: rarityAvgCache.v };
  statsCache.set(user.id, { t: now(), v });
  return v;
});
route('GET', '/api/album', async ({ env, user, origin, query }) => {
  if (query.get('lite')) {                                          // version allégée (choix du deck) : pas de description, pas de prix moyen
    await ensureGameSchema(env);
    return { cards: (await all(env, `SELECT c.id, c.title, c.rarity, c.atk, c.def, c.image, c.shiny, c.views, i.qty, i.acquired, i.card_id ord, i.lvl FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ?`, user.id)).map(c => boosted(c, RANK[c.rarity], c.lvl)) };
  }
  const meta = await getMeta(env, origin);
  const cards = await all(env, `SELECT c.*, i.qty, i.acquired, i.card_id AS ord, ${AVG} AS avg_price, (SELECT 1 FROM favorites f WHERE f.user_id = i.user_id AND f.card_id = i.card_id) AS fav FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ?
    ORDER BY ${caseSql('c.rarity', Object.fromEntries(RARITIES.map(r => [r, RARITIES.length - 1 - RANK[r]])))}, c.shiny DESC, c.views DESC`, user.id);
  const total = Object.fromEntries(RARITIES.map(r => [r, meta.ranges[r][1] - meta.ranges[r][0]]));
  const rarityAvg = Object.fromEntries((await all(env, 'SELECT c.rarity, CAST(ROUND(AVG(s.price)) AS INTEGER) p, COUNT(*) n FROM sales s JOIN cards c ON c.id = s.card_id GROUP BY c.rarity'))
    .map(r => [r.rarity, { avg: r.p, n: r.n }]));
  return { cards, total, rarityAvg };
});

// ---------- paquets thématiques : les légendaires du paquet viennent toutes d'une même catégorie ----------
/** Les deux catégories du jour (les mêmes pour tous, tirées au hasard, renouvelées à minuit). */
async function todaysThemes(env, origin) {
  const day = dayKey(), all_ = (await albumList(env, origin)).filter(a => a.cards.length && a.cards.every(c => Number.isInteger(c.r)));
  // on garde les deux albums à l'empreinte la plus petite pour ce jour : ajouter ou retirer un album ne change presque jamais les catégories du jour (seulement si le nouveau est tiré)
  return all_.map(a => [hash(day + ':' + a.id), a]).sort((x, y) => x[0] - y[0] || (x[1].id < y[1].id ? -1 : 1)).slice(0, 2).map(x => x[1]);
}
route('GET', '/api/themepacks', async ({ env, origin }) => ({
  price: (await events.mods(env)).themePrice ?? CFG.THEME_PACK_PRICE, normalPrice: CFG.THEME_PACK_PRICE, festival: !!(await events.mods(env)).themeGuarantee, mult: CFG.THEME_LEGEND_MULT, resetIn: msToMidnight(),
  themes: (await todaysThemes(env, origin)).map(a => ({ id: a.id, name: a.name, emoji: a.emoji, blurb: a.blurb, count: a.cards.length, sample: a.cards.slice(0, 3).map(c => c.t) })),
}));
/** Catégorie du jour demandée par le joueur, ou erreur. */
async function themeAsked(env, origin, id) {
  const asked = (await albumList(env, origin)).find(a => a.id === String(id || ''));
  if (!asked) bad('Catégorie inconnue', 404);
  const theme = (await todaysThemes(env, origin)).find(a => a.id === asked.id);
  if (!theme) bad('Cette catégorie n’est pas disponible aujourd’hui : reviens demain, deux nouvelles catégories sont tirées chaque jour', 400);
  return theme;
}
route('POST', '/api/themepacks/buy', async ({ env, ctx, user, body, origin }) => {
  const theme = await themeAsked(env, origin, body.theme);
  const evm = await events.drawMods(env, origin), price = evm.themePrice ?? CFG.THEME_PACK_PRICE;
  const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', price, user.id, price);
  if (!paid.meta.changes) bad(`Pas assez de pièces (${price} requises)`);
  let drawn;
  try { drawn = await drawCards(env, origin, PACK_SIZE, userWeights(user), theme, evm); }
  catch (e) { await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', price, user.id); throw e; }   // tirage impossible : remboursé
  return finishPack(env, ctx, { ...user, coins: user.coins - price }, drawn, price);
});
/** 10 paquets de la catégorie du jour d'un coup (10 × le prix, festival compris). */
route('POST', '/api/themepacks/buy10', async ({ env, ctx, user, body, origin }) => {
  const theme = await themeAsked(env, origin, body.theme);
  const evm0 = await events.drawMods(env, origin), price = evm0.themePrice ?? CFG.THEME_PACK_PRICE, total = price * OPEN_MANY;
  const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', total, user.id, total);
  if (!paid.meta.changes) bad(`Pas assez de pièces (${total} requises)`);
  const packs = [];
  try {
    for (let k = 0; k < OPEN_MANY; k++) {
      const evm = k ? await events.drawMods(env, origin) : evm0;
      packs.push(await finishPack(env, ctx, { ...user, coins: user.coins - total }, await drawCards(env, origin, PACK_SIZE, userWeights(user), theme, evm), price));
    }
  } catch (e) {
    await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', price * (OPEN_MANY - packs.length), user.id).catch(() => {});
    throw e;
  }
  return { packs };
});

// ---------- paris sur les combats en cours (les paris et les combats vivent dans le Durable Object) ----------
route('GET', '/api/fights/live', async ({ env, user }) => (await (await env.LOBBY.get(env.LOBBY.idFromName('main')).fetch('https://lobby/live?uid=' + user.id)).json()));
route('POST', '/api/fights/bet', async ({ env, user, body }) => {
  const r = await lobbyCall(env, '/bet', { uid: user.id, name: user.name, battle: String(body.battle || ''), side: body.side, stake: body.stake }), j = await r.json();
  if (!r.ok) bad(j.error || 'Pari impossible', r.status === 404 ? 404 : 400);
  return j;
});

// ---------- bourse, « plus ou moins », cours des cartes, banque, dividendes, expéditions (voir economy.js) ----------
const economy = installEconomy({ route, bad, one, all, run, st, placeholders, notify, bq, addCard, insertCard, entryAt, getMeta, stats, statsCache, ensureGameSchema, dayKey, msToMidnight, hash, CFG, now,
  albumCount: async (env, uid) => +(await one(env, 'SELECT COUNT(*) n FROM album_claims WHERE user_id = ?', uid)).n });

// ---------- événements surprise (voir events.js) ----------
const events = installEvents({ route, bad, one, all, run, st, notify, ensureGameSchema, CFG, now, entryAt, getMeta, assetOrigin: ASSET_ORIGIN,
  albumGroups: (env, origin) => albumList(env, origin), eventAlbums: (env, origin) => eventAlbums(env, origin) });

// ---------- albums thématiques : séries de cartes légendaires (dictateurs, footballeurs…), récompense à la complétion ----------
export const __testHooks = { resetAlbums: () => { albumsCache = null; }, get events() { return events; }, drawCards };   // utilisé par les tests pour changer de fichier d'albums
let albumsCache = null, albumImgs = { t: 0, m: new Map() };
const albumList = async (env, origin) => { try { return (albumsCache ??= (await assetJson(env, origin, '/catalog/albums.json')).albums); } catch { return []; } };   // pas encore de fichier d'albums : liste vide
const ALBUM_COINS = 5000;                                    // pièces pour un album complété, + une carte de l'album au choix en shiny
const albumReward = a => a.ev ? events.eventAlbumReward(a) : ({ c: ALBUM_COINS, p: a.cards.length >= 8 ? 2 : 1 });
/** Albums éphémères (cartes + dates), lus une fois dans le catalogue statique. */
let eventAlbumsCache = null;
const eventAlbums = async (env, origin) => { try { return (eventAlbumsCache ??= (await assetJson(env, origin, '/catalog/albums-events.json')).albums); } catch { return []; } };
/** Albums affichés et récupérables : les albums permanents + l'album éphémère du moment (avec sa date de fin). */
async function albumsAll(env, origin) {
  const base = await albumList(env, origin), m = await events.mods(env);
  if (!m.album) return base;
  const e = (await events.activeNow(env)).find(x => x.kind === 'album'), a = (await eventAlbums(env, origin)).find(x => x.id === m.album);
  return a && e ? [{ ...a, ev: { until: e.end } }, ...base] : base;
}
route('GET', '/api/albums', async ({ env, user, origin }) => {
  await ensureGameSchema(env);
  const albums = await albumsAll(env, origin), ids = [...new Set(albums.flatMap(a => a.cards.map(c => c.id)))];
  if (!ids.length) return { albums: [] };
  if (now() - albumImgs.t > 600000) {                                     // photos des cartes déjà connues du jeu : partagées entre joueurs, relues toutes les 10 min
    const rows = await all(env, `SELECT id, image FROM cards WHERE image IS NOT NULL AND id IN (${placeholders(ids.length)})`, ...ids);
    albumImgs = { t: now(), m: new Map(rows.map(r => [r.id, r.image])) };
  }
  const [own, claimed] = await Promise.all([
    all(env, `SELECT card_id FROM inventory WHERE user_id = ? AND (card_id IN (${placeholders(ids.length)}) OR card_id IN (${placeholders(ids.length)}))`, user.id, ...ids, ...ids.map(i => i + SHINY_OFFSET)),
    all(env, 'SELECT album FROM album_claims WHERE user_id = ?', user.id),
  ]);
  const have = new Set(own.map(r => (r.card_id >= SHINY_OFFSET ? r.card_id - SHINY_OFFSET : r.card_id))), done = new Set(claimed.map(r => r.album));
  const haveNorm = new Set(own.filter(r => r.card_id < SHINY_OFFSET).map(r => r.card_id)), haveShiny = new Set(own.filter(r => r.card_id >= SHINY_OFFSET).map(r => r.card_id - SHINY_OFFSET));
  return { albums: albums.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, blurb: a.blurb, reward: albumReward(a), claimed: done.has(a.id), ...(a.ev ? { until: a.ev.until } : {}),
    cards: a.cards.map(c => ({ id: c.id, t: c.t, own: have.has(c.id), shiny: haveShiny.has(c.id), pick: haveNorm.has(c.id) && !haveShiny.has(c.id), img: have.has(c.id) ? albumImgs.m.get(c.id) ?? null : null })) })) };
});
route('POST', '/api/albums/:id/claim', async ({ env, ctx, user, params, body, origin }) => {
  await ensureGameSchema(env);
  const a = (await albumsAll(env, origin)).find(x => x.id === params.id);
  if (!a) bad(params.id && EVENT_ALBUMS.some(x => x.id === params.id) ? 'Cet album éphémère n\'est plus disponible' : 'Album inconnu', 404);
  const ids = a.cards.map(c => c.id);
  const inv = await all(env, `SELECT card_id FROM inventory WHERE user_id = ? AND (card_id IN (${placeholders(ids.length)}) OR card_id IN (${placeholders(ids.length)}))`, user.id, ...ids, ...ids.map(i => i + SHINY_OFFSET));
  const n = new Set(inv.map(r => (r.card_id >= SHINY_OFFSET ? r.card_id - SHINY_OFFSET : r.card_id))).size;
  if (n < ids.length) bad(`Il te manque ${ids.length - n} carte${ids.length - n > 1 ? 's' : ''} pour terminer cet album`);
  // la carte transformée en shiny : uniquement une carte de l'album dont le joueur a un exemplaire normal et pas encore de version shiny
  const norm = new Set(inv.filter(r => r.card_id < SHINY_OFFSET).map(r => r.card_id)), shin = new Set(inv.filter(r => r.card_id >= SHINY_OFFSET).map(r => r.card_id - SHINY_OFFSET));
  const eligible = ids.filter(i => norm.has(i) && !shin.has(i)), pid = Math.floor(+body.card_id) || 0;
  if (eligible.length && !eligible.includes(pid)) bad('Choisis une carte de cet album à transformer en shiny');
  const first = await run(env, 'INSERT INTO album_claims (user_id, album, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', user.id, a.id, now());
  if (!first.meta.changes) bad('Récompense déjà récupérée');
  const rw = albumReward(a), pick = eligible.length ? await one(env, 'SELECT id, title, views, rarity FROM cards WHERE id = ?', pid) : null, sid = pick ? pid + SHINY_OFFSET : 0;
  await env.DB.batch([
    ...(pick ? [
      insertCard(env, { id: sid, title: pick.title, views: pick.views, rarity: pick.rarity, shiny: 1, ...stats(pick.title, pick.rarity, true) }),
      st(env, 'UPDATE cards SET extract = (SELECT extract FROM cards WHERE id = ?1), image = (SELECT image FROM cards WHERE id = ?1), enriched = (SELECT enriched FROM cards WHERE id = ?1) WHERE id = ?2 AND enriched = 0', pid, sid),
      addCard(env, user.id, sid),
      st(env, 'UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND card_id = ? AND qty >= 1', user.id, pid),
      st(env, 'DELETE FROM inventory WHERE user_id = ? AND card_id = ? AND qty <= 0', user.id, pid),
    ] : []),
    st(env, 'UPDATE users SET coins = coins + ?, pack_stock = pack_stock + ? WHERE id = ?', rw.c, rw.p, user.id),
  ]);
  statsCache.delete(user.id); profileCache.delete(user.id);
  notify(env, ctx, { t: 'notify', msg: `Album « ${a.name} » complété : +${rw.c} pièces et ${rw.p} paquet${rw.p > 1 ? 's' : ''}${pick ? `, et « ${pick.title} » est devenue shiny` : ''} !` }, user.id);
  if (a.ev) await events.titleNotify(env, ctx, user.id, 'ev_alb_' + a.id);
  const ti = await syncTitles(env, user.id).catch(() => null);
  ti?.added.forEach(id => notify(env, ctx, { t: 'notify', msg: `Nouveau titre débloqué : « ${TITLE[id].label} » !` }, user.id));
  return { ok: true, reward: rw, shiny: pick ? { id: sid, title: pick.title } : null };
});

// ---------- fusion de doublons : la carte monte de niveau (+ATK/+DEF) ----------
route('POST', '/api/fuse', async ({ env, ctx, user, body }) => {
  await ensureGameSchema(env);
  const id = +body.card_id;
  const row = await one(env, 'SELECT i.qty, i.lvl, i.rar, i.sh, c.title FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ? AND i.card_id = ?', user.id, id);
  if (!row) bad('Tu ne possèdes pas cette carte');
  const f = fuseInfo(row.rar, row.sh, row.lvl, row.qty);
  if (!f) bad(row.sh ? 'Les cartes shiny ne peuvent pas être fusionnées' : 'Les cartes légendaires sont déjà au sommet');
  if (f.cost === null) bad('Cette carte est déjà au niveau maximum');
  if (!f.can) bad(`Il faut ${f.cost + 1} exemplaires (tu en as ${row.qty}) : ${f.cost} sont consommés, un est conservé`);
  const done = await run(env, 'UPDATE inventory SET qty = qty - ?, lvl = lvl + 1 WHERE user_id = ? AND card_id = ? AND lvl = ? AND qty >= ?', f.cost, user.id, id, row.lvl, f.cost + 1);
  if (!done.meta.changes) bad('Fusion impossible, réessaie');
  statsCache.delete(user.id); profileCache.delete(user.id);
  bq(env, ctx, user.id, { fuse: 1 });
  const qty = row.qty - f.cost, lvl = row.lvl + 1;
  return { ok: true, title: row.title, lvl, qty, bonus: FUSE.bonus[row.rar] * lvl, fuse: fuseInfo(row.rar, row.sh, lvl, qty) };
});
// fusionne d'un coup toutes les cartes qui ont assez de doublons (autant de niveaux que possible) ; body.dry = simple aperçu
route('POST', '/api/fuse-all', async ({ env, ctx, user, body }) => {
  await ensureGameSchema(env);
  const max = RANK[body.max_rarity] ?? 4;
  const rows = await all(env, 'SELECT card_id, qty, lvl, rar FROM inventory WHERE user_id = ? AND sh = 0 AND rar <= ? AND rar < 5 AND lvl < ? AND qty > 1', user.id, Math.min(max, 4), FUSE.max);
  const plan = [];
  for (const r of rows) {
    let qty = r.qty, lvl = r.lvl;
    while (lvl < FUSE.max && qty >= FUSE.cost[r.rar][lvl] + 1) { qty -= FUSE.cost[r.rar][lvl]; lvl++; }
    if (lvl > r.lvl) plan.push({ ...r, to: lvl, left: qty });
  }
  const sum = { cards: plan.length, levels: plan.reduce((t, p) => t + p.to - p.lvl, 0), used: plan.reduce((t, p) => t + p.qty - p.left, 0) };
  if (body.dry || !plan.length) return sum;
  await env.DB.batch(plan.map(p => st(env, 'UPDATE inventory SET qty = ?, lvl = ? WHERE user_id = ? AND card_id = ? AND qty = ? AND lvl = ?', p.left, p.to, user.id, p.card_id, p.qty, p.lvl)));
  statsCache.delete(user.id); profileCache.delete(user.id);
  bq(env, ctx, user.id, { fuse: plan.length });
  return sum;
});
route('POST', '/api/discard', async ({ env, ctx, user, body }) => {
  const cid = +body.card_id, want = Math.max(1, Math.floor(+body.qty || 1));
  const c = await one(env, 'SELECT c.rarity, i.qty FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ? AND i.card_id = ?', user.id, cid);
  if (!c) bad('Tu ne possèdes pas cette carte');
  const qty = Math.min(want, c.qty), price = SELL[c.rarity] * qty;
  const taken = await run(env, 'UPDATE inventory SET qty = qty - ? WHERE user_id = ? AND card_id = ? AND qty >= ?', qty, user.id, cid, qty);
  if (!taken.meta.changes) bad('Tu ne possèdes pas cette carte');
  await env.DB.batch([
    st(env, 'DELETE FROM inventory WHERE user_id = ? AND card_id = ? AND qty <= 0', user.id, cid),
    st(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', price, user.id),
  ]);
  statsCache.delete(user.id);
  bq(env, ctx, user.id, { discard: qty });
  return { price };
});
// défausse un exemplaire de chacune des cartes choisies (sélection multiple dans la collection)
route('POST', '/api/discard-many', async ({ env, ctx, user, body }) => {
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger))].slice(0, 100);
  if (!ids.length) bad('Aucune carte choisie');
  const rows = await all(env, `SELECT card_id, qty, rar FROM inventory WHERE user_id = ? AND card_id IN (${placeholders(ids.length)}) AND qty >= 1`, user.id, ...ids);
  if (!rows.length) bad('Tu ne possèdes plus ces cartes');
  const price = rows.reduce((t, r) => t + SELL[RARITIES[r.rar]], 0), got = rows.map(r => r.card_id);
  await env.DB.batch([
    ...got.map(id => st(env, 'UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND card_id = ? AND qty >= 1', user.id, id)),
    st(env, `DELETE FROM inventory WHERE user_id = ? AND card_id IN (${placeholders(got.length)}) AND qty <= 0`, user.id, ...got),
    st(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', price, user.id),
  ]);
  statsCache.delete(user.id);
  bq(env, ctx, user.id, { discard: rows.length });
  return { price, count: rows.length };
});
// vend tous les exemplaires en trop (on garde 1 exemplaire) des cartes de rareté <= max_rarity
route('POST', '/api/discard-dupes', async ({ env, ctx, user, body }) => {
  const max = RANK[body.max_rarity] ?? 0;
  const agg = await one(env, `SELECT COALESCE(SUM((qty - 1) * ${byRar(SELL, 'rar')}), 0) price, COALESCE(SUM(qty - 1), 0) count FROM inventory WHERE user_id = ? AND qty > 1 AND rar <= ?`, user.id, max);
  if (!agg.count) return { price: 0, count: 0 };
  await env.DB.batch([
    st(env, 'UPDATE inventory SET qty = 1 WHERE user_id = ? AND qty > 1 AND rar <= ?', user.id, max),
    st(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', agg.price, user.id),
  ]);
  statsCache.delete(user.id);
  bq(env, ctx, user.id, { discard: agg.count });
  return { price: agg.price, count: agg.count };
});

route('GET', '/api/users', async ({ env, user }) => {
  const [onlineRes, rows] = await Promise.all([
    env.LOBBY.get(env.LOBBY.idFromName('main')).fetch('https://lobby/online').then(r => r.json()).catch(() => ({ ids: [] })),
    all(env, 'SELECT id, name FROM users WHERE is_bot = 0 ORDER BY name'),
  ]);
  const online = new Set(onlineRes.ids);
  return { users: rows.map(u => ({ ...u, online: online.has(u.id), me: u.id === user.id })) };
});
// ---------- messagerie privée ----------
const dmLast = new Map();                                          // anti-spam : un message toutes les 1,2 s au plus, 20 par minute
async function dmPeer(env, id) {
  const p = await one(env, 'SELECT id, name FROM users WHERE id = ? AND is_bot = 0', +id);
  if (!p) bad('Joueur introuvable', 404);
  return p;
}
route('GET', '/api/dm', async ({ env, user }) => ({
  convs: await all(env, `SELECT c.peer_id, u.name, c.last_ts, c.last_body, c.last_mine, c.unread FROM convs c JOIN users u ON u.id = c.peer_id WHERE c.user_id = ? ORDER BY c.last_ts DESC LIMIT 60`, user.id),
}));
route('GET', '/api/dm/:peer', async ({ env, user, params, query }) => {
  const peer = await dmPeer(env, params.peer), a = Math.min(user.id, peer.id), b = Math.max(user.id, peer.id), before = +query.get('before') || 0;
  const rows = await all(env, `SELECT id, from_id, body, ts FROM dms WHERE a = ? AND b = ? ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT 60`, ...(before ? [a, b, before] : [a, b]));
  await run(env, 'UPDATE convs SET unread = 0 WHERE user_id = ? AND peer_id = ? AND unread > 0', user.id, peer.id);   // ne coûte une écriture que s'il y avait des messages non lus
  return { peer, messages: rows.reverse().map(m => ({ id: m.id, mine: m.from_id === user.id, body: m.body, ts: m.ts })), more: rows.length === 60 };
});
route('POST', '/api/dm/:peer', async ({ env, ctx, user, params, body }) => {
  const peer = await dmPeer(env, params.peer);
  if (peer.id === user.id) bad('Tu ne peux pas t’écrire à toi-même');
  const text = String(body.body ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 500);
  if (!text) bad('Message vide');
  const h = (dmLast.get(user.id) ?? []).filter(t => now() - t < 60000);
  if (h.length && now() - h.at(-1) < 1200) bad('Doucement : un message à la fois');
  if (h.length >= 20) bad('Trop de messages : attends une minute');
  dmLast.set(user.id, [...h, now()]);
  const a = Math.min(user.id, peer.id), b = Math.max(user.id, peer.id), ts = now(), preview = text.slice(0, 120);
  const res = await env.DB.batch([
    st(env, 'INSERT INTO dms (a, b, from_id, body, ts) VALUES (?,?,?,?,?)', a, b, user.id, text, ts),
    st(env, `INSERT INTO convs (user_id, peer_id, last_ts, last_body, last_mine, unread) VALUES (?,?,?,?,1,0)
      ON CONFLICT(user_id, peer_id) DO UPDATE SET last_ts = excluded.last_ts, last_body = excluded.last_body, last_mine = 1, unread = 0`, user.id, peer.id, ts, preview),
    st(env, `INSERT INTO convs (user_id, peer_id, last_ts, last_body, last_mine, unread) VALUES (?,?,?,?,0,1)
      ON CONFLICT(user_id, peer_id) DO UPDATE SET last_ts = excluded.last_ts, last_body = excluded.last_body, last_mine = 0, unread = convs.unread + 1`, peer.id, user.id, ts, preview),
  ]);
  bq(env, ctx, user.id, { message: 1 });
  notify(env, ctx, { t: 'dm', from: user.id, name: user.name, body: preview, ts }, peer.id);
  return { ok: true, message: { id: res[0].meta.last_row_id, mine: true, body: text, ts } };
});
route('GET', '/api/catalog/search', async ({ env, ctx, origin, user, query }) => {
  const q = (query.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return { cards: [] };
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: q, gsrnamespace: '0', gsrlimit: '20',
    prop: 'pageimages|extracts', piprop: 'thumbnail', pithumbsize: '300', pilimit: 'max', pilicense: 'any',
    exintro: '1', explaintext: '1', exchars: '220', exlimit: 'max',
  });
  // les recherches déjà faites (par n'importe quel joueur) sont gardées 24 h dans le cache Cloudflare
  const ck = new Request('https://cache.local/wpsearch?q=' + encodeURIComponent(q.toLowerCase()));
  let pages = null;
  const hit = await caches.default.match(ck).catch(() => null);
  if (hit) pages = await hit.json();
  else {
    try { const r = await fetch('https://fr.wikipedia.org/w/api.php?' + params, { headers: UA }); if (r.ok) pages = (await r.json()).query?.pages; } catch { /* hors-ligne */ }
    if (pages) ctx.waitUntil(caches.default.put(ck, new Response(JSON.stringify(pages), { headers: { 'Cache-Control': 'max-age=86400' } })).catch(() => {}));
  }
  if (!pages) bad('Recherche indisponible, réessaie dans un instant', 503);
  const { ranges } = await getMeta(env, origin);
  const hits = Object.values(pages).sort((a, b) => a.index - b.index);
  const cards = (await Promise.all(hits.map(async p => {
    const rank = await rankOf(env, origin, p.title);
    if (rank == null) return null;
    const rarity = RARITIES.find(r => rank >= ranges[r][0] && rank < ranges[r][1]);
    const e = await entryAt(env, origin, rank);
    return { id: e[0], title: p.title, rarity, rank, views: e[2], image: p.thumbnail?.source ?? null, extract: (p.extract || '').trim(), ...stats(p.title, rarity, false), enriched: 2 };
  }))).filter(Boolean);
  if (q.length >= 3) bq(env, ctx, user.id, { search: 1 });
  if (cards[0] && q.length >= 3 && !(user.is_admin && query.get('admin'))) if (wishRoll(user.id, cards[0])) ctx.waitUntil(wishListing(env, cards[0]).catch(() => {}));   // la carte cherchée sera peut-être bientôt en vente (pas garanti)
  const own = cards.length ? await all(env, `SELECT card_id, SUM(qty) qty FROM inventory WHERE user_id = ? AND card_id IN (${placeholders(cards.length)}) GROUP BY card_id`, user.id, ...cards.map(c => c.id)) : [];
  const owned = new Map(own.map(r => [r.card_id, r.qty]));
  const ever = cards.length ? await all(env, `SELECT card_id, ts FROM card_seen WHERE user_id = ? AND card_id IN (${placeholders(cards.length)})`, user.id, ...cards.map(c => c.id)).catch(() => []) : [];
  const seenAt = new Map(ever.map(r => [r.card_id, r.ts]));
  return { cards: cards.map(c => ({ ...c, owned: owned.get(c.id) || 0, ever: seenAt.has(c.id), first: seenAt.get(c.id) || 0 })) };
});

// aperçu des questions qui seraient posées pour un article (utile pour tester le modèle) : /api/quiz/preview?q=TotalEnergies
route('GET', '/api/quiz/preview', async ({ env, user, query }) => {
  if (!user.is_admin) bad('Réservé à l’administrateur', 403);   // consomme le quota de l'IA
  const q = (query.get('q') || '').trim().slice(0, 80);
  if (!q) bad('Donne un titre : ?q=TotalEnergies');
  const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts', exintro: '1', explaintext: '1', exchars: '2500', redirects: '1', titles: q });
  let page = null;
  try { const r = await fetch('https://fr.wikipedia.org/w/api.php?' + params, { headers: UA }); if (r.ok) page = Object.values((await r.json()).query?.pages ?? {})[0]; } catch { /* hors-ligne */ }
  if (!page || page.missing !== undefined || !page.extract) bad('Article introuvable ou Wikipédia injoignable', 404);
  const card = { id: page.pageid, title: page.title, extract: page.extract.slice(0, 600), views: 0 };
  const pool = await randomPool(env, 30);
  const only = query.get('model');                 // ?model=@cf/... : essaie ce modèle seul, sans rien enregistrer
  if (only) {
    if (!/^@cf\/[\w./-]+$/.test(only)) bad('Modèle invalide');
    try { const r = await tryModel(env, only, card, page.extract); return { modele: only, questions_valides: r.qs.length, duree_ms: r.ms, usage: r.usage, debut_reponse: r.qs.length ? undefined : r.sample, questions: r.qs.map(x => ({ question: x.text, choix: x.options, bonne_reponse: x.options[x.answer] })) }; }
    catch (e) { return { modele: only, erreur: String(e.message || e).slice(0, 200) }; }
  }
  const cached = !!(await one(env, 'SELECT 1 x FROM quizzes WHERE card_id = ?', card.id));
  const ai = (await aiQuestions(env, card, page.extract)).length;
  const questions = await battleQuestions(env, card, page.extract, { cards: pool }, 3);
  return { title: card.title, ia: !!env.AI, deja_en_base: cached, questions_ia_disponibles: ai, derniere_erreur_ia: ai ? null : lastAiError(), questions: questions.map(x => ({ source: x.ai ? 'ia' : 'regles', question: x.text, choix: x.options, bonne_reponse: x.options[x.answer] })) };
});
let lbCache = { t: 0, v: null };                                        // classement partagé : lecture lourde (toutes les collections), gardé 60 s
const byRar = (map, col = 'i.rar') => `CASE ${col} ${RARITIES.map((r, k) => `WHEN ${k} THEN ${map[r]}`).join(' ')} ELSE 0 END`;   // valeur selon le rang de rareté
route('GET', '/api/leaderboard', async ({ env }) => (now() - lbCache.t < 60000 && lbCache.v) || (lbCache = { t: now(), v: {
  players: await all(env, `SELECT u.id, u.name, u.duel_wins wins, u.duel_losses losses,
    COALESCE(SUM(${byRar(POINTS)}), 0) + u.duel_wins * 10 AS score, COUNT(i.card_id) AS uniques
    FROM users u LEFT JOIN inventory i ON i.user_id = u.id WHERE u.is_bot = 0 GROUP BY u.id ORDER BY score DESC LIMIT 50`),
} }).v);

let auctionsCache = { t: 0, rows: null };                         // la liste est la même pour tous (hors drapeaux « à moi / en tête ») : lue au plus toutes les 8 s
route('GET', '/api/auctions', async ({ env, ctx, user }) => {
  ctx.waitUntil(botTick(env, ctx).catch(e => console.error('botTick', e)));   // le marché reste animé même sans tâche planifiée
  maybeRefill(env, ctx);
  await settleAuctions(env, ctx);
  if (now() - auctionsCache.t > 8000 || !auctionsCache.rows) {
    auctionsCache = { t: now(), rows: await all(env, `SELECT a.id, a.start_price, a.bid, a.ends_at, a.seller_id, a.bidder_id, s.name seller, s.is_bot seller_bot, b.name bidder,
    c.id card_id, c.title, c.image, c.rarity, c.atk, c.def, ${AVG} avg_price,
    (SELECT COUNT(*) FROM bids WHERE auction_id = a.id) bids FROM auctions a JOIN cards c ON c.id = a.card_id
    JOIN users s ON s.id = a.seller_id LEFT JOIN users b ON b.id = a.bidder_id WHERE a.status = 'open' ORDER BY a.ends_at`) };
  }
  const mineBids = new Set((await all(env, 'SELECT DISTINCT auction_id id FROM bids WHERE user_id = ?', user.id)).map(r => r.id));   // enchères où j'ai déjà misé (index bids_user)
  return { auctions: auctionsCache.rows.map(a => ({ ...a, mine: a.seller_id === user.id, leading: a.bidder_id === user.id, bidded: mineBids.has(a.id) })) };
});
route('POST', '/api/auctions', async ({ env, ctx, user, body }) => {
  const price = Math.floor(+body.price), minutes = Math.min(1440, Math.max(1, Math.floor(+body.minutes || 10)));
  if (!(price >= 1 && price <= 1e6)) bad('Prix invalide');
  const taken = await run(env, 'UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND card_id = ? AND qty > 0', user.id, +body.card_id);
  if (!taken.meta.changes) bad('Tu ne possèdes pas cette carte');
  await env.DB.batch([
    st(env, 'DELETE FROM inventory WHERE user_id = ? AND card_id = ? AND qty <= 0', user.id, +body.card_id),
    st(env, 'INSERT INTO auctions (seller_id, card_id, start_price, ends_at) VALUES (?,?,?,?)', user.id, +body.card_id, price, now() + minutes * 60000),
  ]);
  const card = await one(env, 'SELECT title FROM cards WHERE id = ?', +body.card_id);
  notify(env, ctx, { t: 'notify', msg: `${user.name} met « ${card.title} » aux enchères (${price} pièces)`, except: user.id });
  (auctionsCache.t = 0, notify(env, ctx, { t: 'refresh', what: 'auctions' }));
  bq(env, ctx, user.id, { sell_auction: 1 });
  return { ok: true };
});
// met en vente plusieurs cartes d'un coup (une enchère par carte, même durée) ; une carte refusée n'empêche pas les autres
route('POST', '/api/auctions/many', async ({ env, ctx, user, body }) => {
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40), minutes = Math.min(1440, Math.max(1, Math.floor(+body.minutes || 360)));
  if (!items.length) bad('Aucune carte choisie');
  const done = [], failed = [], seen = new Set();
  for (const it of items) {
    const cid = +it.card_id, price = Math.floor(+it.price);
    try {
      if (!Number.isInteger(cid) || seen.has(cid)) throw new HttpError(400, 'Carte en double');
      seen.add(cid);
      if (!(price >= 1 && price <= 1e6)) throw new HttpError(400, 'Prix invalide');
      const taken = await run(env, 'UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND card_id = ? AND qty > 0', user.id, cid);
      if (!taken.meta.changes) throw new HttpError(400, 'Tu ne possèdes pas cette carte');
      await env.DB.batch([
        st(env, 'DELETE FROM inventory WHERE user_id = ? AND card_id = ? AND qty <= 0', user.id, cid),
        st(env, 'INSERT INTO auctions (seller_id, card_id, start_price, ends_at) VALUES (?,?,?,?)', user.id, cid, price, now() + minutes * 60000),
      ]);
      done.push(cid);
    } catch (e) { if (!(e instanceof HttpError)) throw e; failed.push({ card_id: cid, error: e.message }); }
  }
  if (done.length) {
    statsCache.delete(user.id);
    notify(env, ctx, { t: 'notify', msg: `${user.name} met ${done.length} carte${done.length > 1 ? 's' : ''} aux enchères`, except: user.id });
    (auctionsCache.t = 0, notify(env, ctx, { t: 'refresh', what: 'auctions' }));
    bq(env, ctx, user.id, { sell_auction: done.length });
  }
  return { ok: true, listed: done.length, failed };
});
route('GET', '/api/auctions/:id/bids', async ({ env, params }) => ({
  bids: await all(env, 'SELECT b.amount, b.ts, u.name, u.id user_id, u.is_bot bot FROM bids b JOIN users u ON u.id = b.user_id WHERE b.auction_id = ? ORDER BY b.id DESC LIMIT 50', +params.id),
}));
route('POST', '/api/auctions/:id/bid', async ({ env, ctx, user, params, body }) => {
  await settleAuctions(env, ctx);
  const amount = Math.floor(+body.amount);
  const a = await one(env, "SELECT * FROM auctions WHERE id = ? AND status = 'open'", +params.id);
  if (!a || a.ends_at <= now()) bad('Enchère terminée');
  if (a.seller_id === user.id) bad('Tu ne peux pas enchérir sur ta propre vente');
  const min = Math.max(a.start_price, a.bid + 1);
  if (!(amount >= min)) bad(`Offre minimale : ${min} pièces`);
  const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', amount, user.id, amount);
  if (!paid.meta.changes) bad('Pas assez de pièces');
  const ends = a.ends_at - now() < 30000 ? now() + 30000 : a.ends_at; // anti-snipe
  const won = await run(env, "UPDATE auctions SET bid = ?, bidder_id = ?, ends_at = ? WHERE id = ? AND bid = ? AND status = 'open'", amount, user.id, ends, a.id, a.bid);
  if (!won.meta.changes) { await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', amount, user.id); bad('Quelqu’un a surenchéri entre-temps, réessaie'); }
  await run(env, 'INSERT INTO bids (auction_id, user_id, amount, ts) VALUES (?,?,?,?)', a.id, user.id, amount, now());
  if (a.bidder_id) await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', a.bid, a.bidder_id);
  const title = (await one(env, 'SELECT title FROM cards WHERE id = ?', a.card_id)).title;
  const others = new Set((await all(env, 'SELECT DISTINCT user_id FROM bids WHERE auction_id = ?', a.id)).map(r => r.user_id));
  others.add(a.seller_id);
  for (const uid of others) {
    if (uid === user.id) continue;
    const msg = uid === a.seller_id ? `${user.name} enchérit ${amount} pièces sur ta « ${title} »`
      : uid === a.bidder_id ? `Tu as été surenchéri sur « ${title} » : ${amount} pièces par ${user.name}`
      : `${user.name} a enchéri ${amount} pièces sur « ${title} »`;
    notify(env, ctx, { t: 'notify', msg }, uid);
  }
  (auctionsCache.t = 0, notify(env, ctx, { t: 'refresh', what: 'auctions' }));
  bq(env, ctx, user.id, { bid: 1, spend: amount });
  return { ok: true };
});

route('GET', '/api/trades', async ({ env, user }) => ({
  trades: await all(env, `SELECT t.id, t.status, t.from_id, t.to_id, f.name from_name, o.name to_name,
    c1.id offer_id, c1.title offer_title, c1.rarity offer_rarity, c2.id want_id, c2.title want_title, c2.rarity want_rarity
    FROM trades t JOIN users f ON f.id = t.from_id JOIN users o ON o.id = t.to_id
    JOIN cards c1 ON c1.id = t.offer_card JOIN cards c2 ON c2.id = t.want_card
    WHERE t.status = 'pending' AND (t.from_id = ? OR t.to_id = ?) ORDER BY t.id DESC`, user.id, user.id),
}));
// Recherche d'une carte à demander : parmi les cartes déjà connues du jeu (tirées au moins une fois)
route('GET', '/api/players/:id/cards', async ({ env, params }) => {
  const id = +params.id;
  if (!(await one(env, 'SELECT 1 x FROM users WHERE id = ? AND is_bot = 0', id))) bad('Joueur introuvable', 404);
  return { cards: await all(env, 'SELECT c.id, c.title, c.rarity, c.atk, c.def, c.image, c.shiny, c.views, i.qty FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ?', id) };
});
route('GET', '/api/cards/search', async ({ env, query }) => {
  const q = (query.get('q') || '').trim();
  if (q.length < 2) return { cards: [] };
  const like = q.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';          // début du titre, sans tenir compte des majuscules (l'index cards_title sert ce type de recherche)
  return { cards: await all(env, `SELECT id, title, rarity, shiny FROM cards WHERE shiny = 0 AND lower(title) LIKE ? ORDER BY views DESC LIMIT 15`, like) };
});
route('POST', '/api/trades', async ({ env, ctx, user, body }) => {
  const to = +body.to;
  if (to === user.id || !(await one(env, 'SELECT 1 FROM users WHERE id = ?', to))) bad('Destinataire invalide');
  if (!(await one(env, 'SELECT 1 FROM inventory WHERE user_id = ? AND card_id = ?', user.id, +body.offer_card))) bad('Tu ne possèdes pas la carte proposée');
  if (!(await one(env, 'SELECT 1 FROM inventory WHERE user_id = ? AND card_id = ?', to, +body.want_card))) bad('Ce joueur ne possède pas la carte demandée');
  await run(env, 'INSERT INTO trades (from_id, to_id, offer_card, want_card, created) VALUES (?,?,?,?,?)', user.id, to, +body.offer_card, +body.want_card, now());
  bq(env, ctx, user.id, { trade_propose: 1 });
  notify(env, ctx, { t: 'notify', msg: `${user.name} te propose un échange !` }, to);
  notify(env, ctx, { t: 'refresh', what: 'trades' }, to);
  return { ok: true };
});
route('POST', '/api/trades/:id/:action', async ({ env, ctx, user, params }) => {
  const t = await one(env, "SELECT * FROM trades WHERE id = ? AND status = 'pending'", +params.id);
  if (!t) bad('Échange introuvable', 404);
  const setStatus = s => run(env, "UPDATE trades SET status = ? WHERE id = ? AND status = 'pending'", s, t.id);
  if (params.action === 'cancel') { if (t.from_id !== user.id) bad('Interdit', 403); await setStatus('cancelled'); }
  else if (params.action === 'decline') { if (t.to_id !== user.id) bad('Interdit', 403); await setStatus('declined'); }
  else if (params.action === 'accept') {
    if (t.to_id !== user.id) bad('Interdit', 403);
    if (!(await setStatus('done')).meta.changes) bad('Échange introuvable', 404);
    const take = (uid, cid) => run(env, 'UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND card_id = ? AND qty > 0', uid, cid);
    if (!(await take(t.from_id, t.offer_card)).meta.changes) { await run(env, "UPDATE trades SET status = 'pending' WHERE id = ?", t.id); bad("L'un de vous n'a plus la carte concernée"); }
    if (!(await take(t.to_id, t.want_card)).meta.changes) {
      await env.DB.batch([addCard(env, t.from_id, t.offer_card), st(env, "UPDATE trades SET status = 'pending' WHERE id = ?", t.id)]);
      bad("L'un de vous n'a plus la carte concernée");
    }
    await env.DB.batch([
      st(env, 'DELETE FROM inventory WHERE qty <= 0'),
      addCard(env, t.to_id, t.offer_card), addCard(env, t.from_id, t.want_card),
    ]);
    bq(env, ctx, t.to_id, { trade_done: 1 }); bq(env, ctx, t.from_id, { trade_done: 1 });
  } else bad('Action inconnue', 404);
  const other = t.from_id === user.id ? t.to_id : t.from_id;
  notify(env, ctx, { t: 'refresh', what: 'trades' }, other);
  notify(env, ctx, { t: 'notify', msg: `Échange mis à jour (${params.action}).` }, other);
  return { ok: true };
});

// ---------- récompense quotidienne, quêtes, quiz du jour ----------
const dailyOf = async (env, uid) => { await ensureGameSchema(env); return (await one(env, 'SELECT daily_day, daily_streak FROM users WHERE id = ?', uid)) ?? {}; };
route('GET', '/api/daily', async ({ env, user }) => ({ ...dailyState(await dailyOf(env, user.id)), resetIn: msToMidnight() }));
route('POST', '/api/daily/claim', async ({ env, user }) => {
  const st0 = dailyState(await dailyOf(env, user.id));
  if (!st0.available) bad('Récompense déjà récupérée aujourd’hui');
  const rw = DAILY[st0.index], c = rw.c || 0, p = rw.p || 0;
  const got = await run(env, 'UPDATE users SET daily_day = ?, daily_streak = ?, coins = coins + ?, pack_stock = pack_stock + ? WHERE id = ? AND daily_day IS DISTINCT FROM ?', st0.today, st0.next, c, p, user.id, st0.today);
  if (!got.meta.changes) bad('Récompense déjà récupérée aujourd’hui');
  return { ok: true, reward: rw, streak: st0.next, ...dailyState({ daily_day: st0.today, daily_streak: st0.next }), resetIn: msToMidnight() };
});

const questView = (q, row) => ({ id: q.id, tier: q.tier, text: q.text, goal: q.goal, reward: q.reward, progress: row?.progress ?? 0, claimed: !!row?.claimed });
async function questsOf(env, uid) {
  await ensureGameSchema(env);
  const day = dayKey(), ids = questsFor(uid, day);
  await env.DB.batch([...ids, BONUS.id].map(id => st(env, 'INSERT INTO quests (user_id, day, qid) VALUES (?,?,?) ON CONFLICT DO NOTHING', uid, day, id)));
  const rows = new Map((await all(env, 'SELECT qid, progress, claimed FROM quests WHERE user_id = ? AND day = ?', uid, day)).map(r => [r.qid, r]));
  const list = ids.map(id => questView(QUEST[id], rows.get(id)));
  const claimedN = list.filter(q => q.claimed).length, b = rows.get(BONUS.id);
  return { day, resetIn: msToMidnight(), quests: list, bonus: { text: BONUS.text, goal: BONUS.goal, reward: BONUS.reward, progress: claimedN, claimed: !!b?.claimed } };
}
route('GET', '/api/quests', async ({ env, user }) => questsOf(env, user.id));
route('POST', '/api/quests/claim', async ({ env, user, body }) => {
  await ensureGameSchema(env);
  const day = dayKey(), id = String(body.id || ''), q = id === BONUS.id ? BONUS : QUEST[id];
  if (!q || (id !== BONUS.id && !questsFor(user.id, day).includes(id))) bad('Quête inconnue', 404);
  if (id === BONUS.id) {
    const n = (await one(env, "SELECT COUNT(*) n FROM quests WHERE user_id = ? AND day = ? AND qid <> 'bonus' AND claimed = 1", user.id, day)).n;
    if (n < BONUS.goal) bad('Récupère d’abord les 3 quêtes');
  }
  const goal = q.goal;
  const ok = await run(env, 'UPDATE quests SET claimed = 1 WHERE user_id = ? AND day = ? AND qid = ? AND claimed = 0 AND (progress >= ? OR qid = ?)', user.id, day, id, goal, 'bonus');
  if (!ok.meta.changes) bad('Quête non terminée ou déjà récupérée');
  const rw = q.reward;
  await run(env, 'UPDATE users SET coins = coins + ?, pack_stock = pack_stock + ? WHERE id = ?', rw.c || 0, rw.p || 0, user.id);
  return { ok: true, reward: rw, ...(await questsOf(env, user.id)) };
});

const QUIZ_N = 5, QUIZ_SECS = 300;
/** Choisit un article UR+ à partir d'une graine et fabrique 5 questions IA sur lui. Renvoie null si rien de convenable n'a été trouvé. */
async function buildQuiz(env, origin, seed) {
  const { ranges } = await getMeta(env, origin), top = ranges.ultra[1];   // articles de rareté UR ou légendaire seulement
  let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  for (let k = 0; k < 12; k++) {                             // article choisi au hasard (même pour tous) ; on passe au suivant s'il est peu adapté ou si l'IA ne donne pas assez de questions
    const e = await entryAt(env, origin, (h + k * 7919) % top);
    if (/^(Liste|Listes|Élections?|Championnat|Saison|Catégorie|Portail)\b|homonymie|^\d{4}\b/i.test(e[1])) continue;   // des pages de listes ou de résultats font de mauvaises questions
    const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts', exintro: '1', explaintext: '1', exchars: '3500', redirects: '1', titles: e[1] });
    let page = null;
    try { const r = await fetch('https://fr.wikipedia.org/w/api.php?' + params, { headers: UA }); if (r.ok) page = Object.values((await r.json()).query?.pages ?? {})[0]; } catch { /* hors-ligne */ }
    if (!page?.extract || page.extract.length < 600) continue;
    const qs = await dailyQuestions(env, { id: e[0], title: page.title, extract: page.extract.slice(0, 600), views: e[2] }, page.extract, QUIZ_N);   // toutes les questions portent sur cet article
    if (qs.length < QUIZ_N) continue;
    return { title: page.title, extract: page.extract.slice(0, 600), questions: JSON.stringify(qs.slice(0, QUIZ_N).map(x => ({ text: x.text, options: x.options, answer: x.answer }))) };
  }
  return null;
}
async function dailyQuiz(env, origin, day) {
  const have = await one(env, 'SELECT * FROM daily_quiz WHERE day = ?', day);
  if (have && have.model === 'ia2') return have;
  if (have) await env.DB.batch([st(env, 'DELETE FROM daily_quiz WHERE day = ?', day), st(env, 'DELETE FROM daily_quiz_runs WHERE day = ?', day)]);   // quiz de l'ancienne version (questions hors sujet) : remplacé
  const q = await buildQuiz(env, origin, 'quiz' + day);
  if (!q) bad('Le quiz du jour n’est pas disponible pour le moment, réessaie dans un instant', 503);
  await run(env, 'INSERT INTO daily_quiz (day, title, extract, questions, model, created) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING', day, q.title, q.extract, q.questions, 'ia2', now());
  return one(env, 'SELECT * FROM daily_quiz WHERE day = ?', day);
}
const recap = (quiz, run_) => {
  const qs = JSON.parse(quiz.questions), ans = JSON.parse(run_.answers || '[]');
  return { title: quiz.title, correct: run_.correct, total: qs.length, delta: run_.delta, penalty: run_.correct === 0 ? (run_.delta < 0 ? 'pack' : 'timer') : null,
    questions: qs.map((q, i) => ({ text: q.text, options: q.options, answer: q.answer, given: ans[i] ?? -1, ok: ans[i] === q.answer })) };
};
/** Vainqueur de la veille : le meilleur score (puis le temps total le plus court) gagne un paquet en plus. Réglé au premier passage de la nouvelle journée. */
let lastSettle = 0, lastBourse = 0;
async function settleDailyWinners(env, ctx, force = false) {
  if (!force && now() - lastSettle < 300000) return;
  lastSettle = now();
  await ensureGameSchema(env);
  const days = await all(env, 'SELECT day FROM daily_quiz WHERE day < ? AND awarded IS NULL AND NOT EXISTS (SELECT 1 FROM daily_quiz_runs r WHERE r.day = daily_quiz.day AND r.finished IS NULL AND r.started > ?) ORDER BY day LIMIT 3', dayKey(), now() - QUIZ_SECS * 1000 - 30000);
  for (const { day } of days) {
    const claim = await run(env, 'UPDATE daily_quiz SET awarded = ? WHERE day = ? AND awarded IS NULL', now(), day);
    if (!claim.meta.changes) continue;
    const w = await one(env, 'SELECT user_id FROM daily_quiz_runs WHERE day = ? AND finished IS NOT NULL AND correct > 0 ORDER BY correct DESC, finished - started ASC, user_id LIMIT 1', day);
    if (!w) continue;
    await env.DB.batch([st(env, 'UPDATE users SET pack_stock = pack_stock + 1 WHERE id = ?', w.user_id), st(env, 'UPDATE daily_quiz SET winner = ? WHERE day = ?', w.user_id, day)]);
    notify(env, ctx, { t: 'notify', msg: `Tu as remporté le quiz du jour (${day}) : +1 paquet bonus !` }, w.user_id);
    if (await grantTitle(env, w.user_id, 'quiz_champ')) notify(env, ctx, { t: 'notify', msg: 'Nouveau titre débloqué : « Roi du quiz » !' }, w.user_id);
  }
}
route('GET', '/api/daily-quiz/ranking', async ({ env, ctx, user }) => {
  await ensureGameSchema(env);
  const day = dayKey();
  if (!(await one(env, 'SELECT 1 x FROM daily_quiz_runs WHERE user_id = ? AND day = ? AND finished IS NOT NULL', user.id, day))) bad('Termine d’abord le quiz pour voir le classement', 403);
  await settleDailyWinners(env, ctx, true);
  const [list, prev] = await Promise.all([
    all(env, 'SELECT r.user_id id, u.name, r.correct, r.finished - r.started ms FROM daily_quiz_runs r JOIN users u ON u.id = r.user_id WHERE r.day = ? AND r.finished IS NOT NULL ORDER BY r.correct DESC, r.finished - r.started ASC, r.user_id LIMIT 50', day),
    one(env, 'SELECT u.name, r.correct, r.finished - r.started ms FROM daily_quiz d JOIN users u ON u.id = d.winner JOIN daily_quiz_runs r ON r.user_id = d.winner AND r.day = d.day WHERE d.day = ?', dayKey(now() - 86400000)),
  ]);
  return { day, resetIn: msToMidnight(), list: list.map((x, i) => ({ ...x, rank: i + 1, me: x.id === user.id })), yesterday: prev ?? null };
});
route('GET', '/api/daily-quiz', async ({ env, user }) => {
  await ensureGameSchema(env);
  const day = dayKey(), quiz = await one(env, 'SELECT * FROM daily_quiz WHERE day = ?', day), r = await one(env, 'SELECT * FROM daily_quiz_runs WHERE user_id = ? AND day = ?', user.id, day);
  if (r?.finished && quiz) return { status: 'done', day, resetIn: msToMidnight(), recap: recap(quiz, r) };
  if (r && quiz) {
    const left = r.started + QUIZ_SECS * 1000 - now();
    if (left > 0) return { status: 'run', day, resetIn: msToMidnight(), secs: Math.ceil(left / 1000), questions: JSON.parse(quiz.questions).map(q => ({ text: q.text, options: q.options })) };
  }
  return { status: r ? 'late' : 'new', day, resetIn: msToMidnight(), n: QUIZ_N, secs: QUIZ_SECS };
});
route('POST', '/api/daily-quiz/start', async ({ env, origin, user }) => {
  await ensureGameSchema(env);
  const day = dayKey(), quiz = await dailyQuiz(env, origin, day);
  const mine = await one(env, 'SELECT * FROM daily_quiz_runs WHERE user_id = ? AND day = ?', user.id, day);
  if (mine?.finished) bad('Tu as déjà fait le quiz du jour');
  if (!mine) await run(env, 'INSERT INTO daily_quiz_runs (user_id, day, started) VALUES (?,?,?) ON CONFLICT DO NOTHING', user.id, day, now());
  const r = await one(env, 'SELECT * FROM daily_quiz_runs WHERE user_id = ? AND day = ?', user.id, day);
  const left = Math.max(0, r.started + QUIZ_SECS * 1000 - now());
  return { status: 'run', day, secs: Math.ceil(left / 1000), questions: JSON.parse(quiz.questions).map(q => ({ text: q.text, options: q.options })) };
});
route('POST', '/api/daily-quiz/submit', async ({ env, ctx, user, body }) => {
  await ensureGameSchema(env);
  const day = dayKey(), quiz = await one(env, 'SELECT * FROM daily_quiz WHERE day = ?', day), r = await one(env, 'SELECT * FROM daily_quiz_runs WHERE user_id = ? AND day = ?', user.id, day);
  if (!quiz || !r) bad('Commence d’abord le quiz', 400);
  if (r.finished) return { ok: true, status: 'done', recap: recap(quiz, r) };
  const qs = JSON.parse(quiz.questions), late = now() > r.started + QUIZ_SECS * 1000 + 15000;
  const given = qs.map((_, i) => { const v = Array.isArray(body.answers) ? body.answers[i] : null; return Number.isInteger(v) ? v : -1; });
  const correct = late ? 0 : given.reduce((t, v, i) => t + (v === qs[i].answer ? 1 : 0), 0);
  let delta = correct;
  const claim = await run(env, 'UPDATE daily_quiz_runs SET answers = ?, correct = ?, delta = ?, finished = ? WHERE user_id = ? AND day = ? AND finished IS NULL', JSON.stringify(given), correct, correct, now(), user.id, day);
  if (!claim.meta.changes) { const r2 = await one(env, 'SELECT * FROM daily_quiz_runs WHERE user_id = ? AND day = ?', user.id, day); return { ok: true, status: 'done', recap: recap(quiz, r2) }; }
  let u = await one(env, 'SELECT * FROM users WHERE id = ?', user.id);
  if (correct > 0) await run(env, 'UPDATE users SET pack_stock = pack_stock + ? WHERE id = ?', correct, user.id);
  else {                                                     // aucune bonne réponse : un paquet en moins, ou à défaut le minuteur repart à 10 minutes
    u = await refreshPacks(env, u);
    const lost = u.pack_stock >= 1 ? await run(env, 'UPDATE users SET pack_stock = pack_stock - 1 WHERE id = ? AND pack_stock >= 1', user.id) : null;
    if (lost?.meta.changes) delta = -1;
    else { delta = 0; await run(env, 'UPDATE users SET pack_ts = ? WHERE id = ?', now(), user.id); }
    await run(env, 'UPDATE daily_quiz_runs SET delta = ? WHERE user_id = ? AND day = ?', delta, user.id, day);
  }
  bq(env, ctx, user.id, { quiz_daily: 1, quiz_correct: correct });
  if (correct === QUIZ_N) ctx.waitUntil(grantTitle(env, user.id, 'quiz_perfect').then(n => n && notify(env, ctx, { t: 'notify', msg: 'Nouveau titre débloqué : « Sans faute » !' }, user.id)));
  return { ok: true, status: 'done', recap: recap(quiz, { ...r, answers: JSON.stringify(given), correct, delta }) };
});

// ---------- tournois : 4 joueurs, mise en pièces ; les combats se jouent dans le Durable Object (demi-finales, puis finale et match pour la 3e place) ----------
const T_MAX_AGE = 48 * 3600000, T_STAKE = [10, 5000];
const tName = id => `Tournoi n°${id}`;
const lobbyCall = (env, path, body) => env.LOBBY.get(env.LOBBY.idFromName('main')).fetch('https://lobby' + path, { method: 'POST', body: JSON.stringify(body) });
async function cancelTournament(env, ctx, id, msg) {
  const claim = await run(env, "UPDATE tournaments SET status = 'cancelled', ended = ? WHERE id = ? AND status = 'open'", now(), id);
  if (!claim.meta.changes) return false;
  const ps = await all(env, 'SELECT user_id FROM tournament_players WHERE tid = ?', id), t = await one(env, 'SELECT stake FROM tournaments WHERE id = ?', id);
  if (ps.length) await env.DB.batch([...ps.map(p => st(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', t.stake, p.user_id)), st(env, 'DELETE FROM tournament_players WHERE tid = ?', id)]);
  ps.forEach(p => notify(env, ctx, { t: 'notify', msg: `${tName(id)} : ${msg}` }, p.user_id));
  return true;
}
async function cleanTournaments(env, ctx) {
  await ensureGameSchema(env);
  for (const { id } of await all(env, "SELECT id FROM tournaments WHERE status = 'open' AND created <= ? LIMIT 5", now() - T_MAX_AGE)) await cancelTournament(env, ctx, id, 'pas assez de joueurs après 48 h : tournoi annulé, mises remboursées.');
}
route('GET', '/api/tournaments', async ({ env, ctx, user }) => {
  await cleanTournaments(env, ctx);
  const rows = await all(env, `SELECT t.id, t.creator, t.stake, t.maxp, t.status, t.stage, t.created, u.name cname, (SELECT COUNT(*) FROM tournament_players p WHERE p.tid = t.id) n FROM tournaments t JOIN users u ON u.id = t.creator
    WHERE t.status IN ('open', 'running') OR (t.status = 'done' AND t.ended >= ?) ORDER BY t.id DESC LIMIT 40`, now() - 3 * 86400000);
  const mine = new Set((await all(env, 'SELECT tid FROM tournament_players WHERE user_id = ?', user.id)).map(r => r.tid));
  return { tournaments: rows.map(t => ({ ...t, joined: mine.has(t.id), size: t.maxp })), min: T_STAKE[0], max: T_STAKE[1] };
});
route('POST', '/api/tournaments', async ({ env, ctx, user, body }) => {
  await ensureGameSchema(env);
  const stake = Math.floor(+body.stake), size = +body.size === 8 ? 8 : 4;
  if (!(stake >= T_STAKE[0] && stake <= T_STAKE[1])) bad(`Mise entre ${T_STAKE[0]} et ${T_STAKE[1]} pièces`);
  const active = (await one(env, "SELECT COUNT(*) n FROM tournament_players p JOIN tournaments t ON t.id = p.tid WHERE p.user_id = ? AND t.status IN ('open', 'running')", user.id)).n;
  if (active >= 2) bad('Tu participes déjà à 2 tournois en cours');
  const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', stake, user.id, stake);
  if (!paid.meta.changes) bad('Pas assez de pièces pour miser');
  const ins = await run(env, 'INSERT INTO tournaments (creator, stake, maxp, created) VALUES (?,?,?,?)', user.id, stake, size, now());
  await run(env, 'INSERT INTO tournament_players (tid, user_id, joined) VALUES (?,?,?)', ins.meta.last_row_id, user.id, now());
  notify(env, ctx, { t: 'notify', msg: `${user.name} ouvre un tournoi : mise ${stake} pièces, ${size} joueurs.`, except: user.id });
  notify(env, ctx, { t: 'refresh', what: 'tournaments' });
  return { ok: true, id: ins.meta.last_row_id };
});
const getT = async (env, id) => { const t = await one(env, 'SELECT t.*, u.name cname FROM tournaments t JOIN users u ON u.id = t.creator WHERE t.id = ?', id); if (!t) bad('Tournoi introuvable', 404); return t; };
route('POST', '/api/tournaments/:id/join', async ({ env, ctx, user, params }) => {
  await ensureGameSchema(env);
  const t = await getT(env, +params.id);
  if (t.status !== 'open') bad('Les inscriptions sont fermées');
  if (await one(env, 'SELECT 1 x FROM tournament_players WHERE tid = ? AND user_id = ?', t.id, user.id)) bad('Tu es déjà inscrit');
  const active = (await one(env, "SELECT COUNT(*) n FROM tournament_players p JOIN tournaments x ON x.id = p.tid WHERE p.user_id = ? AND x.status IN ('open', 'running')", user.id)).n;
  if (active >= 2) bad('Tu participes déjà à 2 tournois en cours');
  const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', t.stake, user.id, t.stake);
  if (!paid.meta.changes) bad('Pas assez de pièces pour miser');
  const ins = await run(env, "INSERT INTO tournament_players (tid, user_id, joined) SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM tournament_players WHERE tid = ?1) < ?4 AND (SELECT status FROM tournaments WHERE id = ?1) = 'open' ON CONFLICT DO NOTHING", t.id, user.id, now(), t.maxp);
  if (!ins.meta.changes) { await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', t.stake, user.id); bad('Le tournoi est complet'); }
  const n = (await one(env, 'SELECT COUNT(*) n FROM tournament_players WHERE tid = ?', t.id)).n;
  notify(env, ctx, { t: 'notify', msg: `${user.name} rejoint ${tName(t.id)} (${n}/${t.maxp}).` }, t.creator);
  if (n >= t.maxp) { const go = await run(env, "UPDATE tournaments SET status = 'running', started = ? WHERE id = ? AND status = 'open'", now(), t.id); if (go.meta.changes) await lobbyCall(env, '/tour/start', { id: t.id }); }   // complet : les demi-finales démarrent
  notify(env, ctx, { t: 'refresh', what: 'tournaments' });
  return { ok: true, started: n >= t.maxp };
});
route('POST', '/api/tournaments/:id/leave', async ({ env, ctx, user, params }) => {
  await ensureGameSchema(env);
  const t = await getT(env, +params.id);
  if (t.status !== 'open') bad('Impossible de quitter un tournoi lancé');
  if (t.creator === user.id) { await cancelTournament(env, ctx, t.id, 'annulé par son créateur, mises remboursées.'); notify(env, ctx, { t: 'refresh', what: 'tournaments' }); return { ok: true, cancelled: true }; }
  const out = await run(env, 'DELETE FROM tournament_players WHERE tid = ? AND user_id = ?', t.id, user.id);
  if (!out.meta.changes) bad('Tu n’es pas inscrit');
  await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', t.stake, user.id);
  notify(env, ctx, { t: 'refresh', what: 'tournaments' });
  return { ok: true };
});
route('GET', '/api/tournaments/:id', async ({ env, ctx, user, params }) => {
  await ensureGameSchema(env);
  const t = await getT(env, +params.id);
  const players = await all(env, 'SELECT p.user_id id, u.name, p.payout FROM tournament_players p JOIN users u ON u.id = p.user_id WHERE p.tid = ? ORDER BY p.joined', t.id);
  let br = null; try { br = t.bracket ? JSON.parse(t.bracket) : null; } catch { /* tableau illisible */ }
  return { id: t.id, stake: t.stake, status: t.status, creator: t.creator, creatorName: t.cname, size: t.maxp, stage: t.stage, bracket: br, preview: tPayouts(t.maxp, t.stake),
    players: players.map(p => ({ ...p, me: p.id === user.id, net: t.status === 'done' ? (p.payout || 0) - t.stake : null })), joined: players.some(p => p.id === user.id) };
});

// ---------- amis ----------
// Par pseudo : demande à valider par l'autre joueur. Par QR code (code secret de l'ami) : ajout immédiat des deux côtés.
const friendBadge = async (env, uid) => (await one(env, `SELECT (SELECT COUNT(*) FROM friend_requests WHERE to_id = ? AND status = 'pending')
  + (SELECT COUNT(*) FROM friends WHERE user_id = ? AND seen = 0) AS n`, uid, uid)).n;
const areFriends = async (env, a, b) => !!(await one(env, 'SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?', a, b));
const makeFriends = (env, a, b, unseenFor = null) => env.DB.batch([ // unseenFor = joueur qui doit voir la pastille rouge
  st(env, 'INSERT OR IGNORE INTO friends (user_id, friend_id, created, seen) VALUES (?,?,?,?)', a, b, now(), unseenFor === a ? 0 : 1),
  st(env, 'INSERT OR IGNORE INTO friends (user_id, friend_id, created, seen) VALUES (?,?,?,?)', b, a, now(), unseenFor === b ? 0 : 1),
  st(env, "UPDATE friend_requests SET status = 'accepted' WHERE status = 'pending' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))", a, b, b, a),
]);
route('GET', '/api/friends', async ({ env, user }) => {
  // le présent et les trois listes sont lus en parallèle
  const [onlineRes, friends, incoming, outgoing] = await Promise.all([
    env.LOBBY.get(env.LOBBY.idFromName('main')).fetch('https://lobby/online').then(r => r.json()).catch(() => ({ ids: [] })),
    all(env, 'SELECT u.id, u.name, f.created, f.seen FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.name', user.id),
    all(env, "SELECT r.id, u.name, r.created FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? AND r.status = 'pending' ORDER BY r.id DESC", user.id),
    all(env, "SELECT r.id, u.name FROM friend_requests r JOIN users u ON u.id = r.to_id WHERE r.from_id = ? AND r.status = 'pending' ORDER BY r.id DESC", user.id),
  ]);
  const online = new Set(onlineRes.ids);
  return { code: user.friend_code, friends: friends.map(f => ({ ...f, isNew: !f.seen, online: online.has(f.id) })), incoming, outgoing };
});
route('POST', '/api/friends/request', async ({ env, ctx, user, body }) => {
  const target = await one(env, 'SELECT id, name FROM users WHERE lower(name) = lower(?) AND is_bot = 0', String(body.name || '').trim());
  if (!target) bad('Aucun joueur avec ce pseudo', 404);
  if (target.id === user.id) bad('Tu ne peux pas t’ajouter toi-même');
  if (await areFriends(env, user.id, target.id)) bad(`${target.name} est déjà dans tes amis`);
  if (await one(env, "SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'", user.id, target.id)) bad('Demande déjà envoyée');
  if (await one(env, "SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'", target.id, user.id)) { // il t'avait déjà invité : on accepte
    await makeFriends(env, user.id, target.id, target.id);
    bq(env, ctx, user.id, { friend: 1 }); bq(env, ctx, target.id, { friend: 1 });
    notify(env, ctx, { t: 'friend', kind: 'accepted', name: user.name }, target.id);
    return { status: 'friends', name: target.name };
  }
  await run(env, 'INSERT INTO friend_requests (from_id, to_id, created) VALUES (?,?,?)', user.id, target.id, now());
  notify(env, ctx, { t: 'friend', kind: 'request', name: user.name }, target.id);
  return { status: 'sent', name: target.name };
});
route('POST', '/api/friends/respond/:id', async ({ env, ctx, user, params, body }) => {
  const r = await one(env, "SELECT * FROM friend_requests WHERE id = ? AND to_id = ? AND status = 'pending'", +params.id, user.id);
  if (!r) bad('Demande introuvable', 404);
  if (body.accept) {
    await makeFriends(env, user.id, r.from_id, r.from_id);
    bq(env, ctx, user.id, { friend: 1 }); bq(env, ctx, r.from_id, { friend: 1 });
    notify(env, ctx, { t: 'friend', kind: 'accepted', name: user.name }, r.from_id);
  } else await run(env, "UPDATE friend_requests SET status = 'declined' WHERE id = ?", r.id);
  return { ok: true };
});
route('POST', '/api/friends/add-code', async ({ env, ctx, user, body }) => {
  const owner = await one(env, 'SELECT id, name FROM users WHERE friend_code = ?', String(body.code || '').trim());
  if (!owner) bad('QR code invalide', 404);
  if (owner.id === user.id) bad('C’est ton propre QR code');
  if (await areFriends(env, user.id, owner.id)) return { status: 'already', name: owner.name };
  await makeFriends(env, user.id, owner.id, owner.id);
  bq(env, ctx, user.id, { friend: 1 }); bq(env, ctx, owner.id, { friend: 1 });
  notify(env, ctx, { t: 'friend', kind: 'added', name: user.name }, owner.id);
  return { status: 'friends', name: owner.name };
});
route('POST', '/api/friends/remove', async ({ env, user, body }) => {
  await run(env, 'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', user.id, +body.id, +body.id, user.id);
  return { ok: true };
});
route('POST', '/api/friends/seen', async ({ env, user }) => { await run(env, 'UPDATE friends SET seen = 1 WHERE user_id = ?', user.id); return { ok: true }; });


// ---------- notifications push ----------
route('POST', '/api/push/subscribe', async ({ env, user, body }) => {
  const ep = String(body.endpoint || '');
  if (!/^https:\/\//.test(ep) || ep.length > 1000) bad('Abonnement invalide');
  await run(env, 'INSERT INTO push_subs (endpoint, user_id, ts) VALUES (?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, ts = excluded.ts', ep, user.id, now());
  return { ok: true };
});
route('POST', '/api/push/unsubscribe', async ({ env, user, body }) => {
  await run(env, 'DELETE FROM push_subs WHERE user_id = ?' + (body.endpoint ? ' AND endpoint = ?' : ''), ...(body.endpoint ? [user.id, String(body.endpoint)] : [user.id]));
  return { ok: true };
});
route('POST', '/api/push/test', async ({ env, user }) => ({ sent: await pushTo(env, user.id, 'Clodo Wiki', 'Les notifications fonctionnent !', 'test') }));
// lu par le service worker quand un push arrive (l'endpoint de l'appareil sert d'identifiant)
route('POST', '/api/push/pull', async ({ env, body }) => ({ msgs: await pull(env, String(body.endpoint || '')) }), false);

// ---------- administration (réservée aux comptes is_admin) ----------
const admin = fn => async ctx => { if (!ctx.user.is_admin) bad('Réservé à l’administrateur', 403); return fn(ctx); };
const onlineIds = async env => { try { return (await (await env.LOBBY.get(env.LOBBY.idFromName('main')).fetch('https://lobby/online')).json()).ids; } catch { return []; } };
route('GET', '/api/admin/overview', admin(async ({ env }) => {
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const n = async (sql, ...p) => (await one(env, sql, ...p)).n;
  const [users, bots, cards, owned, auctions, packs, coins, subs, quizzes, aiToday, reserve, bids] = await Promise.all([
    n('SELECT COUNT(*) n FROM users WHERE is_bot = 0'), n('SELECT COUNT(*) n FROM users WHERE is_bot = 1'), n('SELECT COUNT(*) n FROM cards'),
    n('SELECT COALESCE(SUM(qty),0) n FROM inventory'), n("SELECT COUNT(*) n FROM auctions WHERE status = 'open'").catch(() => 0), n('SELECT COALESCE(SUM(packs_opened),0) n FROM users'),
    n('SELECT COALESCE(SUM(coins),0) n FROM users WHERE is_bot = 0'), n('SELECT COUNT(*) n FROM push_subs'), n('SELECT COUNT(*) n FROM quizzes'),
    n('SELECT COUNT(*) n FROM quizzes WHERE ts >= ?', day.getTime()), n('SELECT COUNT(*) n FROM reserve'), n('SELECT COUNT(*) n FROM bids'),
  ]);
  const aiErr = (await one(env, "SELECT value FROM settings WHERE key = 'ai_last_error'").catch(() => null))?.value ?? null;
  return { users, bots, cards, owned, auctions, packs, coins, subs, quizzes, aiToday, aiErr, reserve, bids, online: (await onlineIds(env)).length, version: CFG.VERSION };
}));
route('GET', '/api/admin/users', admin(async ({ env }) => {
  const online = new Set(await onlineIds(env));
  const rows = await all(env, `SELECT u.id, u.name, u.coins, u.pack_stock packs, u.packs_opened, u.duel_wins wins, u.duel_losses losses, u.test_mode test, u.is_admin admin, u.created, u.drop_w,
    (SELECT COUNT(*) FROM inventory i WHERE i.user_id = u.id) cards, (SELECT COUNT(*) FROM push_subs p WHERE p.user_id = u.id) devices FROM users u WHERE u.is_bot = 0 ORDER BY u.id`);
  return { defaults: CFG.DROP, rarities: RARITIES, labels: CFG.LABELS, users: rows.map(r => { let drop = null; try { drop = r.drop_w ? JSON.parse(r.drop_w) : null; } catch { /* ignoré */ } const { drop_w, ...rest } = r; return { ...rest, drop, online: online.has(r.id) }; }) };
}));
route('POST', '/api/admin/give', admin(async ({ env, ctx, body }) => {
  const id = +body.user_id, coins = Math.trunc(+body.coins || 0), packs = Math.trunc(+body.packs || 0);
  const u = await one(env, 'SELECT id, name, coins, pack_stock FROM users WHERE id = ? AND is_bot = 0', id);
  if (!u) bad('Joueur introuvable', 404);
  if (Math.abs(coins) > 1e7 || Math.abs(packs) > 1e4) bad('Quantité trop grande');
  await run(env, 'UPDATE users SET coins = GREATEST(0, coins + ?), pack_stock = GREATEST(0, pack_stock + ?) WHERE id = ?', coins, packs, id);
  const parts = [coins && `${coins > 0 ? '+' : ''}${coins} pièces`, packs && `${packs > 0 ? '+' : ''}${packs} paquets`].filter(Boolean);
  if (parts.length && (coins > 0 || packs > 0)) notify(env, ctx, { t: 'notify', msg: `Cadeau de l'admin : ${parts.join(' et ')}` }, id);
  return { ok: true, name: u.name };
}));
route('POST', '/api/admin/test-mode', admin(async ({ env, body }) => { await run(env, 'UPDATE users SET test_mode = ? WHERE id = ? AND is_bot = 0 AND is_admin = 1', body.on ? 1 : 0, +body.user_id); return { ok: true }; }));   // jamais pour un joueur ordinaire
route('POST', '/api/admin/password', admin(async ({ env, body }) => {
  const pw = String(body.password || ''); if (pw.length < 4) bad('Mot de passe trop court (4 min.)');
  const u = await one(env, 'SELECT id, name FROM users WHERE id = ? AND is_bot = 0', +body.user_id); if (!u) bad('Joueur introuvable', 404);
  const salt = randomHex(16);
  await env.DB.batch([st(env, 'UPDATE users SET salt = ?, hash = ? WHERE id = ?', salt, await hashPw(pw, salt), u.id), st(env, 'DELETE FROM sessions WHERE user_id = ?', u.id)]);   // le joueur devra se reconnecter
  return { ok: true, name: u.name };
}));
route('POST', '/api/admin/drop', admin(async ({ env, body }) => {
  const id = +body.user_id, u = await one(env, 'SELECT id, name FROM users WHERE id = ? AND is_bot = 0', id);
  if (!u) bad('Joueur introuvable', 404);
  let json = null;
  if (body.weights) {
    const w = Object.fromEntries(RARITIES.map(r => [r, Math.round(Math.min(1000, Math.max(0, +body.weights[r] || 0)) * 1000) / 1000]));
    if (!RARITIES.some(r => w[r] > 0)) bad('Au moins une rareté doit avoir un taux supérieur à 0');
    json = JSON.stringify(w);
  }
  await env.DB.batch([st(env, 'UPDATE users SET drop_w = ? WHERE id = ?', json, id), st(env, 'DELETE FROM prepared WHERE user_id = ?', id)]);   // les paquets déjà préparés avaient les anciens taux
  return { ok: true, name: u.name, custom: !!json };
}));
route('GET', '/api/admin/cards', admin(async ({ env, query }) => {
  const id = +query.get('user_id'), q = String(query.get('q') || '').trim();
  const rows = await all(env, `SELECT c.id, c.title, c.rarity, c.shiny, i.qty FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ? ${q ? 'AND c.title ILIKE ?' : ''}
    ORDER BY i.qty DESC, c.title LIMIT 40`, ...(q ? [id, `%${q.replace(/[%_]/g, '')}%`] : [id]));
  return { cards: rows, total: (await one(env, 'SELECT COALESCE(SUM(qty),0) n, COUNT(*) u FROM inventory WHERE user_id = ?', id)) };
}));
route('POST', '/api/admin/take-card', admin(async ({ env, body }) => {
  const uid = +body.user_id, cid = +body.card_id;
  const row = await one(env, 'SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', uid, cid);
  if (!row) bad('Cette carte n’est pas dans la collection du joueur', 404);
  const n = body.qty === 'all' ? row.qty : Math.min(row.qty, Math.max(1, Math.trunc(+body.qty) || 1));
  await env.DB.batch([st(env, 'UPDATE inventory SET qty = qty - ? WHERE user_id = ? AND card_id = ?', n, uid, cid), st(env, 'DELETE FROM inventory WHERE user_id = ? AND card_id = ? AND qty <= 0', uid, cid),
    st(env, 'DELETE FROM favorites WHERE user_id = ? AND card_id = ? AND NOT EXISTS (SELECT 1 FROM inventory WHERE user_id = ? AND card_id = ?)', uid, cid, uid, cid)]);
  statsCache.delete(uid);
  return { ok: true, removed: n, left: row.qty - n };
}));
// ---- enchères « truquées » par l'admin : vendues sous le pseudo d'un joueur simulé ----
route('GET', '/api/admin/market', admin(async ({ env }) => {
  const bots = await getBots(env);
  const lots = await all(env, `SELECT a.id, a.start_price, a.bid, a.bidder_id, a.ends_at, c.title, c.rarity, c.shiny, u.name seller FROM auctions a JOIN cards c ON c.id = a.card_id JOIN users u ON u.id = a.seller_id
    WHERE a.status = 'open' AND a.ends_at > ? AND u.is_bot = 1 ORDER BY a.id DESC LIMIT 25`, now());
  return { bots: bots.map(b => ({ id: b.id, name: b.name })), lots, rarities: RARITIES, labels: CFG.LABELS };
}));
route('POST', '/api/admin/lot', admin(async ({ env, ctx, origin, body }) => {
  const title = String(body.title || '').trim(); if (!title) bad('Choisis une carte');
  const rank = await rankOf(env, origin, title); if (rank == null) bad('Cette page n’est pas dans le catalogue', 404);
  const { ranges } = await getMeta(env, origin), rarity = RARITIES.find(r => rank >= ranges[r][0] && rank < ranges[r][1]);
  const [id, t, views] = await entryAt(env, origin, rank);
  if (await one(env, "SELECT 1 x FROM auctions WHERE card_id = ? AND status = 'open'", id)) bad('Cette carte est déjà en vente');
  const bots = await getBots(env), seller = body.seller_id ? bots.find(b => b.id === +body.seller_id) : bots[Math.floor(Math.random() * bots.length)];
  if (!seller) bad('Vendeur simulé introuvable', 404);
  const mins = Math.min(1440, Math.max(5, Math.trunc(+body.minutes) || 360));
  const avg = (await one(env, 'SELECT CAST(ROUND(AVG(price)) AS INTEGER) p FROM sales WHERE card_id = ?', id))?.p ?? null;
  const price = body.price > 0 ? Math.min(1e7, Math.trunc(+body.price)) : botPrice(rarity, views, avg);
  await env.DB.batch([insertCard(env, { id, title: t, views, rarity, shiny: 0, ...stats(t, rarity, false) }),
    st(env, 'INSERT INTO auctions (seller_id, card_id, start_price, ends_at) VALUES (?,?,?,?)', seller.id, id, price, now() + mins * 60000)]);
  ctx.waitUntil(enrich(env, [id]).catch(() => {}));
  (auctionsCache.t = 0, notify(env, ctx, { t: 'refresh', what: 'auctions' }));
  return { ok: true, title: t, rarity, price, seller: seller.name };
}));
route('POST', '/api/admin/lots-random', admin(async ({ env, ctx, origin, body }) => {
  const n = Math.min(30, Math.max(1, Math.trunc(+body.count) || 1)), want = RARITIES.includes(body.rarity) ? body.rarity : null;
  const mins = body.minutes ? Math.min(1440, Math.max(5, Math.trunc(+body.minutes))) : null;
  const bots = await getBots(env), { ranges } = await getMeta(env, origin);
  const open = new Set((await all(env, "SELECT card_id FROM auctions WHERE status = 'open'")).map(r => r.card_id));
  const picks = Array.from({ length: n * 2 }, () => { const rarity = want ?? pickW(BOT_MIX); return { rarity, rank: ranges[rarity][0] + Math.floor(rand(0, ranges[rarity][1] - ranges[rarity][0])) }; });
  const entries = await Promise.all(picks.map(p => entryAt(env, origin, p.rank)));
  const chosen = [];
  picks.forEach((p, i) => { const [id, title, views] = entries[i]; if (chosen.length < n && !open.has(id)) { open.add(id); chosen.push({ id, title, views, rarity: p.rarity }); } });
  if (!chosen.length) bad('Aucune carte disponible, réessaie');
  const avgRows = await all(env, `SELECT card_id, CAST(ROUND(AVG(price)) AS INTEGER) p FROM sales WHERE card_id IN (${placeholders(chosen.length)}) GROUP BY card_id`, ...chosen.map(c => c.id));
  const avg = new Map(avgRows.map(r => [r.card_id, r.p]));
  await env.DB.batch(chosen.flatMap(c => [insertCard(env, { id: c.id, title: c.title, views: c.views, rarity: c.rarity, shiny: 0, ...stats(c.title, c.rarity, false) }),
    st(env, 'INSERT INTO auctions (seller_id, card_id, start_price, ends_at) VALUES (?,?,?,?)', bots[Math.floor(Math.random() * bots.length)].id, c.id, botPrice(c.rarity, c.views, avg.get(c.id) ?? null),
      now() + Math.round((mins ?? pickW(BOT_MINUTES) * rand(.2, 1)) * 60000))]));
  ctx.waitUntil(enrich(env, chosen.map(c => c.id).slice(0, 20)).catch(() => {}));
  (auctionsCache.t = 0, notify(env, ctx, { t: 'refresh', what: 'auctions' }));
  return { ok: true, added: chosen.length, cards: chosen.map(c => c.title) };
}));
route('POST', '/api/admin/lot/remove', admin(async ({ env, ctx, body }) => {
  const r = await run(env, "DELETE FROM auctions WHERE id = ? AND status = 'open' AND bidder_id IS NULL AND seller_id IN (SELECT id FROM users WHERE is_bot = 1)", +body.id);
  if (!r.meta.changes) bad('Retrait impossible : la vente a déjà reçu une offre ou n’est pas simulée');
  (auctionsCache.t = 0, notify(env, ctx, { t: 'refresh', what: 'auctions' }));
  return { ok: true };
}));
const statsFromDO = async (env, days) => env.LOBBY.get(env.LOBBY.idFromName('main')).fetch('https://lobby/meter?days=' + days).then(x => x.json()).catch(() => ({ days: [] }));
/** Tableau de bord : activité par jour (14 jours) et détail du jour choisi (par heure, par action, par joueur, par requête SQL). */
route('GET', '/api/admin/stats', admin(async ({ env, query }) => {
  const r = await statsFromDO(env, 14), days = r.days ?? [];
  const sum = items => items.filter(([k]) => k.startsWith('T:')).reduce((t, [, x]) => { for (const f of Object.keys(x)) t[f] = (t[f] || 0) + x[f]; return t; }, {});
  const perDay = days.map(d => ({ day: d.day, ...sum(d.items) }));
  const day = query.get('day') && days.find(d => d.day === query.get('day')) ? query.get('day') : days.at(-1)?.day ?? new Date().toISOString().slice(0, 10);
  const items = days.find(d => d.day === day)?.items ?? [];
  const pick = p => items.filter(([k]) => k.startsWith(p)).map(([k, x]) => ({ k: k.slice(p.length), ...x }));
  const month = days.filter(d => d.day.slice(0, 7) === day.slice(0, 7)).reduce((t, d) => t + (sum(d.items).by || 0), 0);
  return { day, perDay, total: perDay.find(d => d.day === day) ?? {}, hours: pick('T:'), routes: pick('R:'), users: pick('U:'), queries: pick('Q:').sort((a, b) => ((b.nr || 0) + (b.nw || 0)) - ((a.nr || 0) + (a.nw || 0))).slice(0, 60), monthBytes: month };
}));
/** Journal de log et de contrôle (table logs de Supabase, 14 jours). */
route('GET', '/api/admin/logs', admin(async ({ env, query }) => { await flushLogs(env, true); return readLogs(env, { level: query.get('level') || '', kind: query.get('kind') || '', q: (query.get('q') || '').slice(0, 60), before: +query.get('before') || 0, limit: +query.get('limit') || 100 }); }));
route('GET', '/api/admin/fights', admin(async ({ env }) => ({ events: await all(env, 'SELECT ts, battle, players, kind, detail FROM fight_events ORDER BY id DESC LIMIT 80') })));
route('POST', '/api/admin/announce', admin(async ({ env, ctx, body }) => {
  const text = String(body.text || '').trim().slice(0, 180); if (!text) bad('Message vide');
  notify(env, ctx, { t: 'notify', msg: text });
  let sent = 0;
  if (body.push !== false) {
    const ids = (await all(env, 'SELECT DISTINCT user_id FROM push_subs LIMIT 20')).map(r => r.user_id);   // 20 joueurs max par envoi (limite de requêtes d'un Worker)
    for (const uid of ids) sent += await pushTo(env, uid, 'Clodo Wiki', text, 'announce').catch(() => 0);
  }
  return { ok: true, push: sent };
}));
route('POST', '/api/admin/run', admin(async ({ env, ctx, body }) => {
  if (body.action === 'bots') await botTick(env, ctx, true);
  else if (body.action === 'reserve') await refillReserve(env, 10);
  else bad('Action inconnue');
  return { ok: true };
}));

// ---------- point d'entrée ----------
let flushing = false;
/** Envoie les statistiques au Durable Object (cumul du jour) et écrit le journal en attente. */
async function flushAll(env0) {
  const items = takeMeter();
  await Promise.all([
    items.length ? env0.LOBBY.get(env0.LOBBY.idFromName('main')).fetch('https://lobby/meter', { method: 'POST', body: JSON.stringify(items) }).catch(e => console.error('meter', e)) : null,
    flushLogs(env0, true),
  ]);
}
/** Après chaque requête : on attend un instant (pour grouper les requêtes simultanées) puis on envoie statistiques et journal. Un Worker peut disparaître à tout moment : on ne compte pas sur une requête future. */
function flushSoon(env0, ctx) {
  if (flushing) return;
  flushing = true;
  ctx.waitUntil((async () => {
    await new Promise(r => setTimeout(r, globalThis.__FLUSH_MS ?? 300));
    flushing = false;
    await flushAll(env0);
  })());
}
/** Routes dont le succès n'est pas écrit au journal (trop fréquentes ou sans intérêt). */
const QUIET = /^POST \/api\/(push\/pull|cards\/enrich|friends\/seen)$/;
/** Résumé d'une action réussie pour le journal de contrôle (jamais de mot de passe, jamais le contenu d'un message). */
function actionDetail(r, body, out) {
  if (/^POST \/api\/admin\//.test(r.label)) return JSON.stringify(body).slice(0, 250);
  if (out?.cards?.length) return `${out.cards.length} cartes` + (out.cards.filter(c => c.rarity === 'legendary').length ? `, ${out.cards.filter(c => c.rarity === 'legendary').length} légendaire(s)` : '') + (out.god ? ' · GODPACK' : '');
  if (body?.amount) return `offre ${body.amount}`;
  if (body?.price && body?.card_id) return `vente à ${body.price}`;
  if (out?.price != null) return `+${out.price} pièces` + (out.count ? ` (${out.count})` : '');
  if (body?.name && /register|login/.test(r.label)) return String(body.name).slice(0, 40);
  return '';
}
async function api(req, env0, ctx, url) {
  const t0 = Date.now();
  const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
  const label = r?.label ?? `${req.method} ${url.pathname.slice(0, 60)}`;
  let env = meter(env0, 'R:' + label), user = null, status = 200, err = null, body = {}, out;
  try {
    if (!r) bad('Route inconnue', 404);
    if (/^\/api\/admin\/(users|give|password|drop|cards|take-card)$/.test(url.pathname)) bad('Fonction retirée : plus aucun réglage des joueurs (pièces, paquets, cartes, taux) depuis l\'administration', 403);
    const params = url.pathname.match(r.re).groups || {};
    if (r.auth) {
      user = await userFromToken(env, (req.headers.get('authorization') || '').replace('Bearer ', ''));
      if (!user) bad('Non connecté', 401);
      env = meter(env0, 'R:' + label, 'U:' + user.name);
    }
    if (req.method === 'POST') {
      if (+req.headers.get('content-length') > 250000) bad('Requête trop volumineuse', 413);
      try { body = await req.json(); } catch { body = {}; }
    }
    out = await r.fn({ env, ctx, user, params, body, req, query: url.searchParams, origin: url.origin });
    return out instanceof Response ? out : json(out);
  } catch (e) { err = e; status = e instanceof HttpError ? e.code : 500; throw e; }
  finally {
    const ms = Date.now() - t0, who = user?.name ?? (label.includes('/login') || label.includes('/register') ? String(body?.name ?? '').slice(0, 40) : null);
    recHttp(['R:' + label, user && 'U:' + user.name], ms, status);
    const base = { user: who, route: label, status, ms };
    if (status >= 500) logEvent({ ...base, level: 'error', kind: isQuotaError(err) ? 'base' : 'erreur', detail: err?.message });
    else if (status >= 400) logEvent({ ...base, level: 'warn', kind: 'refus', detail: err?.message });
    else if (ms > 1500) logEvent({ ...base, level: 'warn', kind: 'lent', detail: `${ms} ms` });
    else if (req.method === 'POST' && !QUIET.test(label)) logEvent({ ...base, level: 'info', kind: /\/api\/admin\//.test(label) ? 'admin' : 'action', detail: actionDetail(r, body, out) });
    flushSoon(env0, ctx);
  }
}

async function handle(req, env, ctx) {
    env = withDb(env);
    const url = new URL(req.url);
    try {
      const mig = await handleMigrate(req, env, url); if (mig) return mig;
      if (url.pathname === '/ws') return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(req);
      if (url.pathname.startsWith('/api/')) return await api(req, env, ctx, url);
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (!(e instanceof HttpError) && !/Paramètre numérique invalide/.test(String(e?.message))) console.error(e);
      if (isQuotaError(e)) return json({ error: QUOTA_MSG, quota: true, until: nextResetMs() }, 503);   // message clair quand la limite gratuite de la base est atteinte
      if (/Paramètre numérique invalide/.test(String(e?.message))) return json({ error: 'Valeur numérique invalide' }, 400);   // un nombre absurde envoyé par un client : refus, pas une panne
      return json({ error: e instanceof HttpError ? e.message : 'Erreur serveur' }, (e instanceof HttpError && e.code) || 500);
    }
}

export default {
  async scheduled(event, env0, ctx) {
    const env = meter(withDb(env0), 'R:tâche planifiée');
    ctx.waitUntil((async () => {
      const t0 = Date.now();
      const e1 = await botTick(env, ctx, true).then(() => null, e => e), e2 = await refillReserve(env).then(() => null, e => e);
      for (const e of [e1, e2]) if (e) console.error('cron', e);
      await events.tick(env, ctx).catch(e => console.error('événements', e));            // annonce les événements qui viennent de commencer
      logEvent({ level: e1 || e2 ? 'error' : 'info', kind: 'cron', route: 'tâche planifiée', ms: Date.now() - t0, detail: e1 || e2 ? String((e1 || e2).message).slice(0, 300) : 'marché animé, réserve remplie' });
      await pruneLogs(withDb(env0)).catch(() => {});
      await flushAll(withDb(env0));
    })());
  },
  async fetch(req, env, ctx) { return secure(await handle(req, env, ctx)); },
};
export { pickRarity, userWeights, wishRoll, WISH_CHANCE };   // exportés pour les tests
