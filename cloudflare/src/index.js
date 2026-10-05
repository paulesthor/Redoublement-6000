import CFG from './config.js';
import { SHINY_OFFSET, SHARD, RANK, stats, urlOf, caseSql, HttpError, bad, json, one, all, run, st, placeholders, cardRows,
  userFromToken, hashPw, randomHex, notify, searchBucket } from './util.js';
export { Lobby } from './lobby.js';

const { PACK_EVERY, PACK_MAX, PACK_SIZE, SELL, POINTS, RARITIES } = CFG;
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
function pickRarity(ranges, min = 0) {
  const avail = RARITIES.filter(r => RANK[r] >= min && ranges[r][1] > ranges[r][0]);
  if (!avail.length) bad('Catalogue vide', 503);
  let roll = Math.random() * avail.reduce((s, r) => s + CFG.DROP[r], 0);
  for (const r of avail) { if ((roll -= CFG.DROP[r]) < 0) return r; }
  return avail.at(-1);
}
async function drawCards(env, origin, n) {
  const { ranges } = await getMeta(env, origin);
  // pages distinctes dans un même booster (re-tirage si doublon, borné pour les très petits catalogues)
  const taken = new Set();
  const draw = min => {
    for (let tries = 0; ; tries++) {
      const rarity = pickRarity(ranges, min), [a, b] = ranges[rarity];
      const rank = a + Math.floor(Math.random() * (b - a));
      if (!taken.has(rank) || tries >= 30) { taken.add(rank); return { rarity, rank }; }
    }
  };
  const picks = Array.from({ length: n }, () => draw(0));
  const entries = await Promise.all(picks.map(p => entryAt(env, origin, p.rank)));
  return picks.map((p, i) => {
    const [page, title, views] = entries[i];
    const shiny = p.rarity === 'legendary' && Math.random() < CFG.SHINY_CHANCE;
    return { id: shiny ? page + SHINY_OFFSET : page, title, views, rarity: p.rarity, shiny: shiny ? 1 : 0, ...stats(title, p.rarity, shiny) };
  });
}
const insertCard = (env, c) => st(env, 'INSERT OR IGNORE INTO cards (id, title, views, rarity, atk, def, shiny, url) VALUES (?,?,?,?,?,?,?,?)',
  c.id, c.title, c.views, c.rarity, c.atk, c.def, c.shiny, urlOf(c.title));
const addCard = (env, uid, cid, n = 1) => st(env,
  'INSERT INTO inventory (user_id, card_id, qty) VALUES (?,?,?) ON CONFLICT(user_id, card_id) DO UPDATE SET qty = qty + excluded.qty', uid, cid, n);

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
async function articleImages(pids) {
  const out = new Map();
  if (!pids.length) return { out, ok: true };
  const q = await wpJson({ pageids: pids.join('|'), prop: 'images', imlimit: 'max' });
  if (!q?.pages) return { out, ok: false };
  const cand = new Map(); // titre de fichier -> pid
  for (const pid of pids) {
    const files = (q.pages[pid]?.images || []).map(i => i.title).filter(t => !BAD_FILE.test(t));
    files.sort((a, b) => /\.jpe?g$/i.test(b) - /\.jpe?g$/i.test(a));
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
    const art = await articleImages(noThumb);
    const wdQ = noThumb.filter(pid => !art.out.has(pid) && got.get(pid).pageprops?.wikibase_item);
    const wd = await wikidataImages(wdQ.map(pid => got.get(pid).pageprops.wikibase_item));
    if (!got.size) continue;
    await env.DB.batch([...got].map(([pid, p]) => {
      const image = p.thumbnail?.source ?? art.out.get(pid) ?? wd.out.get(p.pageprops?.wikibase_item) ?? null;
      const done = image || (art.ok && wd.ok) ? 2 : 1; // 1 = on réessaiera plus tard (source injoignable)
      return st(env, 'UPDATE cards SET extract = ?, image = COALESCE(?, image), enriched = ? WHERE id IN (?, ?)', (p.extract || '').trim(), image, done, pid, pid + SHINY_OFFSET);
    }));
  }
}

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
  if (elapsed > 0) {
    const stock = Math.min(PACK_MAX, u.pack_stock + elapsed);
    const ts = stock >= PACK_MAX ? now() : u.pack_ts + elapsed * PACK_EVERY;
    await run(env, 'UPDATE users SET pack_stock = ?, pack_ts = ? WHERE id = ?', stock, ts, u.id);
    u.pack_stock = stock; u.pack_ts = ts;
  }
  return u;
}
const publicUser = u => ({
  id: u.id, name: u.name, coins: u.coins, packs: u.pack_stock, wins: u.duel_wins, losses: u.duel_losses,
  nextPackIn: u.pack_stock >= PACK_MAX ? 0 : Math.max(0, u.pack_ts + PACK_EVERY - now()),
});

async function finishPack(env, ctx, user, drawn) {
  // tout est écrit en un seul lot (une seule transaction côté D1)
  const ids = [...new Set(drawn.map(c => c.id))];
  const before = new Set((await all(env, `SELECT card_id FROM inventory WHERE user_id = ? AND card_id IN (${placeholders(ids.length)})`, user.id, ...ids)).map(r => r.card_id));
  await env.DB.batch([
    ...drawn.map(c => insertCard(env, c)),
    ...drawn.map(c => addCard(env, user.id, c.id)),
  ]);
  const rows = new Map((await cardRows(env, ids)).map(c => [c.id, c]));
  const seen = new Set();
  const cards = drawn.map(c => { const isNew = !before.has(c.id) && !seen.has(c.id); seen.add(c.id); return { ...rows.get(c.id), isNew }; })
    .sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || b.shiny - a.shiny);
  // description/image : récupérées en arrière-plan ; le client les redemande via /api/cards/enrich
  ctx.waitUntil(enrich(env, ids).catch(() => {}));
  const legends = cards.filter(c => c.rarity === 'legendary');
  if (legends.length) {
    await env.DB.batch(legends.map(c => st(env, 'INSERT INTO hits (user, title, shiny, ts) VALUES (?,?,?,?)', user.name, c.title, c.shiny, now())));
    for (const c of legends) notify(env, ctx, { t: 'hit', user: user.name, title: c.title, shiny: !!c.shiny, ts: now() });
  }
  return { cards };
}

// ---------- enchères : règlement à la demande (pas de minuteur côté Workers) ----------
async function settleAuctions(env, ctx) {
  const due = await all(env, "SELECT * FROM auctions WHERE status = 'open' AND ends_at <= ? LIMIT 5", now());
  for (const a of due) {
    const claimed = await run(env, "UPDATE auctions SET status = ? WHERE id = ? AND status = 'open'", a.bidder_id ? 'sold' : 'expired', a.id);
    if (!claimed.meta.changes) continue; // déjà réglée par une autre requête
    const card = await one(env, 'SELECT title FROM cards WHERE id = ?', a.card_id);
    if (a.bidder_id) {
      await env.DB.batch([
        st(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', a.bid, a.seller_id),
        addCard(env, a.bidder_id, a.card_id),
        st(env, 'INSERT INTO sales (card_id, price, ts) VALUES (?,?,?)', a.card_id, a.bid, now()),
      ]);
      notify(env, ctx, { t: 'notify', msg: `Tu as remporté « ${card.title} » pour ${a.bid} pièces` }, a.bidder_id);
      notify(env, ctx, { t: 'notify', msg: `« ${card.title} » vendu ${a.bid} pièces` }, a.seller_id);
    } else {
      await addCard(env, a.seller_id, a.card_id).run();
      notify(env, ctx, { t: 'notify', msg: `Enchère sans offre : « ${card.title} » t'est rendue.` }, a.seller_id);
    }
    notify(env, ctx, { t: 'refresh', what: 'auctions' });
  }
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, fn, auth = true) =>
  routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, auth });

const newSession = async (env, uid) => {
  const token = randomHex(24);
  await run(env, 'INSERT INTO sessions (token, user_id, created) VALUES (?,?,?)', token, uid, now());
  return { token };
};
route('POST', '/api/register', async ({ env, body }) => {
  const name = String(body.name || '').trim(), pw = String(body.password || '');
  if (!/^[\p{L}\p{N}_-]{2,20}$/u.test(name)) bad('Pseudo : 2 à 20 caractères (lettres, chiffres, _ -)');
  if (pw.length < 4) bad('Mot de passe trop court (4 min.)');
  if (env.INVITE_CODE && body.invite !== env.INVITE_CODE) bad('Code d’invitation invalide', 403);
  if (await one(env, 'SELECT 1 FROM users WHERE name = ?', name)) bad('Pseudo déjà pris', 409);
  const salt = randomHex(16);
  const r = await run(env, 'INSERT INTO users (name, salt, hash, coins, pack_stock, pack_ts, created, friend_code) VALUES (?,?,?,?,?,?,?,?)',
    name, salt, await hashPw(pw, salt), CFG.START_COINS, CFG.START_PACKS, now(), now(), randomHex(5));
  return newSession(env, r.meta.last_row_id);
}, false);
route('POST', '/api/login', async ({ env, body }) => {
  const u = await one(env, 'SELECT * FROM users WHERE name = ?', String(body.name || '').trim());
  if (!u || (await hashPw(String(body.password || ''), u.salt)) !== u.hash) bad('Pseudo ou mot de passe incorrect', 401);
  return newSession(env, u.id);
}, false);
route('GET', '/api/me', async ({ env, user }) => ({ ...publicUser(await refreshPacks(env, user)), badge: await friendBadge(env, user.id) }));

route('GET', '/api/config', async ({ env, origin }) => {
  const meta = await getMeta(env, origin);
  return {
    rarities: RARITIES, labels: CFG.LABELS, drop: CFG.DROP, sell: CFG.SELL, shinyChance: CFG.SHINY_CHANCE, catalog: meta.n,
    packSize: PACK_SIZE, packPrice: CFG.PACK_PRICE, packEveryMin: PACK_EVERY / 60000, packMax: PACK_MAX,
  };
}, false);

route('POST', '/api/packs/open', async ({ env, ctx, user, origin }) => {
  const u = await refreshPacks(env, user);
  if (u.pack_stock < 1) bad('Plus de booster disponible, patiente un peu !');
  const wasFull = u.pack_stock >= PACK_MAX;
  const claimed = await run(env, 'UPDATE users SET pack_stock = pack_stock - 1, pack_ts = CASE WHEN ? THEN ? ELSE pack_ts END WHERE id = ? AND pack_stock >= 1', wasFull ? 1 : 0, now(), u.id);
  if (!claimed.meta.changes) bad('Plus de booster disponible, patiente un peu !');
  return finishPack(env, ctx, user, await drawCards(env, origin, PACK_SIZE));
});
route('POST', '/api/packs/buy', async ({ env, ctx, user, origin }) => {
  const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', CFG.PACK_PRICE, user.id, CFG.PACK_PRICE);
  if (!paid.meta.changes) bad(`Pas assez de pièces (${CFG.PACK_PRICE} requises)`);
  return finishPack(env, ctx, user, await drawCards(env, origin, PACK_SIZE));
});
route('POST', '/api/cards/enrich', async ({ env, body }) => {
  const ids = (body.ids || []).map(Number).filter(Number.isFinite).slice(0, 40);
  await enrich(env, ids);
  return { cards: (await cardRows(env, ids)).map(c => ({ id: c.id, extract: c.extract, image: c.image, enriched: c.enriched })) };
});
route('GET', '/api/hits', async ({ env }) => ({
  hits: (await all(env, 'SELECT user, title, shiny, ts FROM hits ORDER BY id DESC LIMIT 10')).map(h => ({ ...h, shiny: !!h.shiny })),
}));

const AVG = '(SELECT CAST(ROUND(AVG(price)) AS INTEGER) FROM (SELECT price FROM sales WHERE card_id = c.id ORDER BY id DESC LIMIT 10))';
route('GET', '/api/album', async ({ env, user, origin }) => {
  const meta = await getMeta(env, origin);
  const cards = await all(env, `SELECT c.*, i.qty, ${AVG} AS avg_price FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ?
    ORDER BY ${caseSql('c.rarity', Object.fromEntries(RARITIES.map(r => [r, RARITIES.length - 1 - RANK[r]])))}, c.shiny DESC, c.views DESC`, user.id);
  const total = Object.fromEntries(RARITIES.map(r => [r, meta.ranges[r][1] - meta.ranges[r][0]]));
  const rarityAvg = Object.fromEntries((await all(env, 'SELECT c.rarity, CAST(ROUND(AVG(s.price)) AS INTEGER) p, COUNT(*) n FROM sales s JOIN cards c ON c.id = s.card_id GROUP BY c.rarity'))
    .map(r => [r.rarity, { avg: r.p, n: r.n }]));
  return { cards, total, rarityAvg };
});

route('POST', '/api/discard', async ({ env, user, body }) => {
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
  return { price };
});
// vend tous les exemplaires en trop (on garde 1 exemplaire) des cartes de rareté <= max_rarity
route('POST', '/api/discard-dupes', async ({ env, user, body }) => {
  const max = RANK[body.max_rarity] ?? 0;
  const rars = RARITIES.filter(r => RANK[r] <= max);
  const where = `i.user_id = ? AND i.qty > 1 AND c.rarity IN (${placeholders(rars.length)})`;
  const agg = await one(env, `SELECT COALESCE(SUM((i.qty - 1) * ${caseSql('c.rarity', SELL)}), 0) price, COALESCE(SUM(i.qty - 1), 0) count
    FROM inventory i JOIN cards c ON c.id = i.card_id WHERE ${where}`, user.id, ...rars);
  if (!agg.count) return { price: 0, count: 0 };
  await env.DB.batch([
    st(env, `UPDATE inventory SET qty = 1 WHERE user_id = ? AND qty > 1 AND card_id IN (SELECT id FROM cards WHERE rarity IN (${placeholders(rars.length)}))`, user.id, ...rars),
    st(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', agg.price, user.id),
  ]);
  return { price: agg.price, count: agg.count };
});

route('GET', '/api/users', async ({ env, user }) => {
  const online = new Set((await (await env.LOBBY.get(env.LOBBY.idFromName('main')).fetch('https://lobby/online')).json()).ids);
  return { users: (await all(env, 'SELECT id, name FROM users ORDER BY name')).map(u => ({ ...u, online: online.has(u.id), me: u.id === user.id })) };
});
route('GET', '/api/catalog/search', async ({ env, origin, user, query }) => {
  const q = (query.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return { cards: [] };
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: q, gsrnamespace: '0', gsrlimit: '20',
    prop: 'pageimages|extracts', piprop: 'thumbnail', pithumbsize: '300', pilimit: 'max', pilicense: 'any',
    exintro: '1', explaintext: '1', exchars: '220', exlimit: 'max',
  });
  let pages = null;
  try { const r = await fetch('https://fr.wikipedia.org/w/api.php?' + params, { headers: UA }); if (r.ok) pages = (await r.json()).query?.pages; } catch { /* hors-ligne */ }
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
  const own = cards.length ? await all(env, `SELECT card_id, SUM(qty) qty FROM inventory WHERE user_id = ? AND card_id IN (${placeholders(cards.length)}) GROUP BY card_id`, user.id, ...cards.map(c => c.id)) : [];
  const owned = new Map(own.map(r => [r.card_id, r.qty]));
  return { cards: cards.map(c => ({ ...c, owned: owned.get(c.id) || 0 })) };
});

route('GET', '/api/leaderboard', async ({ env }) => ({
  players: await all(env, `SELECT u.id, u.name, u.coins, u.duel_wins wins, u.duel_losses losses,
    COALESCE(SUM(${caseSql('c.rarity', POINTS)}), 0) + u.duel_wins * 10 AS score, COUNT(c.id) AS uniques
    FROM users u LEFT JOIN inventory i ON i.user_id = u.id LEFT JOIN cards c ON c.id = i.card_id GROUP BY u.id ORDER BY score DESC LIMIT 50`),
}));

route('GET', '/api/auctions', async ({ env, ctx, user }) => {
  await settleAuctions(env, ctx);
  const rows = await all(env, `SELECT a.id, a.start_price, a.bid, a.ends_at, a.seller_id, a.bidder_id, s.name seller, b.name bidder,
    c.id card_id, c.title, c.image, c.rarity, c.atk, c.def, ${AVG} avg_price,
    (SELECT COUNT(*) FROM bids WHERE auction_id = a.id) bids FROM auctions a JOIN cards c ON c.id = a.card_id
    JOIN users s ON s.id = a.seller_id LEFT JOIN users b ON b.id = a.bidder_id WHERE a.status = 'open' ORDER BY a.ends_at`);
  return { auctions: rows.map(a => ({ ...a, mine: a.seller_id === user.id, leading: a.bidder_id === user.id })) };
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
  notify(env, ctx, { t: 'refresh', what: 'auctions' });
  return { ok: true };
});
route('GET', '/api/auctions/:id/bids', async ({ env, params }) => ({
  bids: await all(env, 'SELECT b.amount, b.ts, u.name FROM bids b JOIN users u ON u.id = b.user_id WHERE b.auction_id = ? ORDER BY b.id DESC LIMIT 50', +params.id),
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
  notify(env, ctx, { t: 'refresh', what: 'auctions' });
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
route('GET', '/api/cards/search', async ({ env, query }) => {
  const q = (query.get('q') || '').trim();
  if (q.length < 2) return { cards: [] };
  const hi = q.slice(0, -1) + String.fromCharCode(q.charCodeAt(q.length - 1) + 1);
  return { cards: await all(env, `SELECT id, title, rarity, shiny FROM cards WHERE shiny = 0 AND title COLLATE NOCASE >= ? AND title COLLATE NOCASE < ? ORDER BY views DESC LIMIT 15`, q, hi) };
});
route('POST', '/api/trades', async ({ env, ctx, user, body }) => {
  const to = +body.to;
  if (to === user.id || !(await one(env, 'SELECT 1 FROM users WHERE id = ?', to))) bad('Destinataire invalide');
  if (!(await one(env, 'SELECT 1 FROM inventory WHERE user_id = ? AND card_id = ?', user.id, +body.offer_card))) bad('Tu ne possèdes pas la carte proposée');
  if (!(await one(env, 'SELECT 1 FROM cards WHERE id = ?', +body.want_card))) bad('Carte demandée inconnue');
  await run(env, 'INSERT INTO trades (from_id, to_id, offer_card, want_card, created) VALUES (?,?,?,?,?)', user.id, to, +body.offer_card, +body.want_card, now());
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
  } else bad('Action inconnue', 404);
  const other = t.from_id === user.id ? t.to_id : t.from_id;
  notify(env, ctx, { t: 'refresh', what: 'trades' }, other);
  notify(env, ctx, { t: 'notify', msg: `Échange mis à jour (${params.action}).` }, other);
  return { ok: true };
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
  const online = new Set((await (await env.LOBBY.get(env.LOBBY.idFromName('main')).fetch('https://lobby/online')).json()).ids);
  return {
    code: user.friend_code,
    friends: (await all(env, 'SELECT u.id, u.name, f.created, f.seen FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.name', user.id))
      .map(f => ({ ...f, isNew: !f.seen, online: online.has(f.id) })),
    incoming: await all(env, "SELECT r.id, u.name, r.created FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? AND r.status = 'pending' ORDER BY r.id DESC", user.id),
    outgoing: await all(env, "SELECT r.id, u.name FROM friend_requests r JOIN users u ON u.id = r.to_id WHERE r.from_id = ? AND r.status = 'pending' ORDER BY r.id DESC", user.id),
  };
});
route('POST', '/api/friends/request', async ({ env, ctx, user, body }) => {
  const target = await one(env, 'SELECT id, name FROM users WHERE name = ?', String(body.name || '').trim());
  if (!target) bad('Aucun joueur avec ce pseudo', 404);
  if (target.id === user.id) bad('Tu ne peux pas t’ajouter toi-même');
  if (await areFriends(env, user.id, target.id)) bad(`${target.name} est déjà dans tes amis`);
  if (await one(env, "SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'", user.id, target.id)) bad('Demande déjà envoyée');
  if (await one(env, "SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'", target.id, user.id)) { // il t'avait déjà invité : on accepte
    await makeFriends(env, user.id, target.id, target.id);
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
  notify(env, ctx, { t: 'friend', kind: 'added', name: user.name }, owner.id);
  return { status: 'friends', name: owner.name };
});
route('POST', '/api/friends/remove', async ({ env, user, body }) => {
  await run(env, 'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', user.id, +body.id, +body.id, user.id);
  return { ok: true };
});
route('POST', '/api/friends/seen', async ({ env, user }) => { await run(env, 'UPDATE friends SET seen = 1 WHERE user_id = ?', user.id); return { ok: true }; });

// ---------- point d'entrée ----------
async function api(req, env, ctx, url) {
  const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
  if (!r) bad('Route inconnue', 404);
  const params = url.pathname.match(r.re).groups || {};
  let user = null;
  if (r.auth) {
    user = await userFromToken(env, (req.headers.get('authorization') || '').replace('Bearer ', ''));
    if (!user) bad('Non connecté', 401);
  }
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { body = {}; } }
  return json(await r.fn({ env, ctx, user, params, body, query: url.searchParams, origin: url.origin }));
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/ws') return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(req);
      if (url.pathname.startsWith('/api/')) return await api(req, env, ctx, url);
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      return json({ error: e instanceof HttpError ? e.message : 'Erreur serveur' }, e.code || 500);
    }
  },
};
