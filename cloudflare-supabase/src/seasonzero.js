// Remise à zéro de la saison 0 : cartes fondateur (une légendaire gardée par joueur, avec un halo « bêta »), état de départ, bilan, titre « Pionnier ».
// Une opération d'administration, déclenchée à la main après vérification : sauvegarde des tables, puis tout dans UNE transaction.
export const START = { coins: 500, packs: 10 };
/** Décisions de l'administrateur : « Mia Khalifa » (rang 650 du catalogue) pour lui, « Patrick Pouyanné » interdit à un joueur précis. */
export const GIFT = { id: 9105390, rank: 650 }, BAN_ID = 8420956;
export const FOUNDER_TITLE = 'saison0';
/** Tables vidées (comptes, amis, avatars, messages, sessions et catalogue de cartes sont conservés). */
export const WIPE = ['inventory', 'favorites', 'card_seen', 'auctions', 'bids', 'sales', 'trades', 'expeditions', 'savings', 'quests', 'daily_quiz_runs', 'event_progress', 'event_hunt', 'price_alerts',
  'achievements', 'user_titles', 'album_claims', 'bourse_bets', 'bourse_market', 'fight_bets', 'hilo_games', 'hits', 'prepared', 'tournament_players', 'tournaments', 'fight_events', 'wanted', 'coin_freeze', 'legend_taken'];
/** Tables sauvegardées avant la remise à zéro (copie intégrale, dans la même base). */
export const BACKUP = ['users', ...WIPE, 'event_claims', 'reset_choices'];
/** Clés d'opérations uniques à conserver (elles ne doivent pas se rejouer sur la nouvelle saison). */
const KEEP_CLAIMS = "key LIKE 'exped-%' OR key LIKE 'sanction-%' OR key LIKE 'fakegod:%' OR key LIKE 'mkt:%'";

const shuffle = (a, rnd = Math.random) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
/**
 * Choisit la carte fondateur de chaque joueur. Joueurs traités dans un ordre tiré au sort ; chacun reçoit la première de ses cartes proposées (dans un ordre tiré au sort) qui n'est pas déjà prise ;
 * sinon une autre de ses légendaires libre ; sinon une légendaire au hasard (randomCard(prises) → identifiant). Aucune carte n'est donnée deux fois.
 * players: [id] ; picks: Map(id → [cartes proposées]) ; owned: Map(id → [légendaires non shiny possédées]).
 */
export async function planFounders({ players, picks, owned, randomCard, rnd = Math.random, forced = new Map(), banned = new Map() }) {
  const used = new Set(), out = new Map(), wanted = new Set([...picks.values()].flat());   // cartes proposées par quelqu'un : on évite de les donner en « lot de consolation » à un autre
  for (const [uid, id] of forced) { used.add(id); out.set(uid, { id, source: 'offerte', asked: (picks.get(uid) ?? []).length }); }   // cartes imposées d'abord
  for (const uid of shuffle(players.filter(u => !forced.has(u)), rnd)) {
    const ban = banned.get(uid) ?? new Set(), mine = new Set(owned.get(uid) ?? []), asked = shuffle((picks.get(uid) ?? []).filter(id => mine.has(id) && !ban.has(id)), rnd);
    let id = asked.find(c => !used.has(c)), source = 'choix';
    if (id === undefined) {
      const rest = [...mine].filter(c => !used.has(c) && !ban.has(c) && !asked.includes(c)), free = rest.filter(c => !wanted.has(c));
      id = shuffle(free.length ? free : rest, rnd)[0]; source = 'collection';
    }
    if (id === undefined) { id = await randomCard(new Set([...used, ...ban])); source = 'hasard'; }
    used.add(id); out.set(uid, { id, source, asked: (picks.get(uid) ?? []).length });
  }
  return out;
}

export function installSeasonZero(d) {
  const { all, one, run, st, now, ensureGameSchema, CFG, RARITIES, entryAt, getMeta, insertCard, stats, addCard, assetOrigin, afterReset, uniqueRefresh } = d;
  const DAY = 86400000;
  const done = async env => (await one(env, "SELECT value FROM settings WHERE key = 'reset_done'"))?.value ?? null;
  /** Légendaire au hasard qui n'existe pas encore (hors cartes déjà attribuées dans ce tirage). */
  async function randomCard(env, used) {
    const { ranges } = await getMeta(env, assetOrigin), [a, b] = ranges.legendary;
    for (let i = 0; i < 200; i++) { const e = await entryAt(env, assetOrigin, a + Math.floor(Math.random() * (b - a))); if (!used.has(e[0])) { d.fresh?.set(e[0], e); return e[0]; } }
    throw new Error('Aucune légendaire disponible');
  }
  /** Bilan de la saison 0 de chaque joueur, calculé avant l'effacement. */
  async function recaps(env, humans) {
    const inv = await all(env, 'SELECT i.user_id, i.rar, COUNT(*) n, SUM(i.qty) q FROM inventory i JOIN users u ON u.id = i.user_id AND u.is_bot = 0 GROUP BY i.user_id, i.rar');
    const users = new Map((await all(env, 'SELECT id, name, coins, packs_opened, duel_wins, duel_losses, created FROM users WHERE is_bot = 0')).map(u => [u.id, u]));
    const score = new Map(); for (const u of humans) score.set(u, (users.get(u).duel_wins || 0) * 10);
    for (const r of inv) if (score.has(r.user_id)) score.set(r.user_id, score.get(r.user_id) + (CFG.POINTS[RARITIES[r.rar]] || 0) * r.n);
    const order = [...score.entries()].sort((x, y) => y[1] - x[1]).map(e => e[0]), out = new Map();
    // trois requêtes groupées pour tous les joueurs (la limite gratuite est d'environ 50 appels par requête : jamais une requête par joueur)
    const bestBy = new Map((await all(env, 'SELECT DISTINCT ON (i.user_id) i.user_id, c.title, c.rarity, c.views FROM inventory i JOIN users u ON u.id = i.user_id AND u.is_bot = 0 JOIN cards c ON c.id = i.card_id ORDER BY i.user_id, i.rar DESC, c.views DESC')).map(r => [+r.user_id, r]));
    const soldBy = new Map((await all(env, "SELECT seller_id uid, COUNT(*) n, COALESCE(SUM(bid), 0) s FROM auctions WHERE status = 'sold' GROUP BY seller_id")).map(r => [+r.uid, r]));
    const boughtBy = new Map((await all(env, "SELECT bidder_id uid, COUNT(*) n FROM auctions WHERE status = 'sold' AND bidder_id IS NOT NULL GROUP BY bidder_id")).map(r => [+r.uid, r]));
    for (const uid of humans) {
      const u = users.get(uid), mine = inv.filter(r => r.user_id === uid), best = bestBy.get(uid), sold = soldBy.get(uid), bought = boughtBy.get(uid);
      out.set(uid, { coins: +u.coins, packs: +u.packs_opened, cards: mine.reduce((t, r) => t + +r.q, 0), uniques: mine.reduce((t, r) => t + +r.n, 0), legendary: +(mine.find(r => r.rar === 5)?.n || 0),
        best: best ? { title: best.title, rarity: best.rarity, views: +best.views } : null, rank: order.indexOf(uid) + 1, players: humans.length, score: score.get(uid), sold: +(sold?.n || 0), soldCoins: +(sold?.s || 0), bought: +(bought?.n || 0),
        wins: +u.duel_wins, losses: +u.duel_losses, days: Math.max(1, Math.round((now() - u.created) / DAY)) });
    }
    return out;
  }
  /** Prévisualisation (dry) ou exécution de la remise à zéro. */
  async function reset(env, { dry = false } = {}) {
    await ensureGameSchema(env);
    if (await done(env)) throw Object.assign(new Error('La remise à zéro a déjà eu lieu'), { status: 409 });
    const humans = (await all(env, 'SELECT id FROM users WHERE is_bot = 0 ORDER BY id')).map(u => +u.id);
    const picks = new Map((await all(env, 'SELECT user_id, picks FROM reset_choices')).map(r => { let p = []; try { p = JSON.parse(r.picks); } catch { /* ignoré */ } return [+r.user_id, p]; }));
    const owned = new Map(); for (const r of await all(env, 'SELECT user_id, card_id FROM inventory WHERE rar = 5 AND sh = 0')) { (owned.get(+r.user_id) ?? owned.set(+r.user_id, []).get(+r.user_id)).push(+r.card_id); }
    d.fresh = new Map();
    const userRows = await all(env, 'SELECT id, name, is_admin FROM users WHERE is_bot = 0 ORDER BY id'), names = new Map(userRows.map(u => [+u.id, u.name]));
    // décisions de l'administrateur : sa carte fondateur est imposée, et un joueur précis ne peut pas recevoir une carte précise
    const forced = new Map(), banned = new Map(), boss = userRows.find(u => +u.is_admin), michel = userRows.find(u => /michel/i.test(u.name) && /bresil/i.test(u.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    if (boss) { forced.set(+boss.id, GIFT.id); d.fresh.set(GIFT.id, await entryAt(env, assetOrigin, GIFT.rank)); }
    if (michel && +michel.id !== +boss?.id) banned.set(+michel.id, new Set([BAN_ID]));
    const founders = await planFounders({ players: humans, picks, owned, randomCard: used => randomCard(env, used), forced, banned });
    const recapOf = await recaps(env, humans);
    const cardRows = new Map((await all(env, `SELECT id, title, views, rarity FROM cards WHERE id IN (${[...new Set([...founders.values()].map(f => f.id))].map(() => '?').join(',')})`, ...[...new Set([...founders.values()].map(f => f.id))])).map(c => [+c.id, c]));
    if (new Set([...founders.values()].map(f => f.id)).size !== humans.length) throw new Error('Cartes fondateur en double : opération annulée (rien n\'a été modifié)');   // garde-fou : une légendaire = un seul exemplaire
    const plan = humans.map(uid => { const f = founders.get(uid), c = cardRows.get(f.id) ?? (d.fresh.get(f.id) ? { id: f.id, title: d.fresh.get(f.id)[1], views: d.fresh.get(f.id)[2], rarity: 'legendary' } : null); return { user: names.get(uid), id: uid, card: f.id, title: c?.title, source: f.source, asked: f.asked, coins: recapOf.get(uid).coins, cards: recapOf.get(uid).cards, legendary: recapOf.get(uid).legendary }; });
    if (dry) return { dry: true, players: plan.length, plan, wipe: WIPE, backup: BACKUP.map(t => 'bk_s0_' + t) };
    const t = now(), stmts = [];
    // Sauvegardes d'abord, par petits groupes (chaque appel a sa propre limite de temps côté Supabase ; CREATE … IF NOT EXISTS : on peut recommencer sans écraser une sauvegarde déjà faite)
    for (let i = 0; i < BACKUP.length; i += 6) {
      const part = []; for (const tb of BACKUP.slice(i, i + 6)) part.push(st(env, `CREATE TABLE IF NOT EXISTS bk_s0_${tb} AS SELECT * FROM ${tb}`), st(env, `ALTER TABLE bk_s0_${tb} ENABLE ROW LEVEL SECURITY`));   // RLS : jamais lisibles par l'API publique
      await env.DB.batch(part);
    }
    stmts.push(st(env, `TRUNCATE ${WIPE.join(', ')}`));                          // instantané (un DELETE sur de grosses tables dépassait la limite de temps)
    stmts.push(st(env, `DELETE FROM event_claims WHERE NOT (${KEEP_CLAIMS})`));
    stmts.push(st(env, `UPDATE users SET coins = ?, pack_stock = ?, pack_ts = ?, packs_opened = 0, test_mode = 0, showcase = NULL, drop_w = NULL, duel_wins = 0, duel_losses = 0, daily_day = NULL, daily_streak = 0, div_day = NULL, title = ? WHERE is_bot = 0`, START.coins, START.packs, t, FOUNDER_TITLE));
    for (const uid of humans) {
      const f = founders.get(uid), c = cardRows.get(f.id), fresh = d.fresh.get(f.id);
      if (!c && fresh) stmts.push(insertCard(env, { id: fresh[0], title: fresh[1], views: fresh[2], rarity: 'legendary', shiny: 0, ...stats(fresh[1], 'legendary', false) }));
      stmts.push(st(env, 'UPDATE cards SET beta = 1 WHERE id = ?', f.id), addCard(env, uid, f.id), st(env, 'INSERT INTO legend_taken (card_id, ts) VALUES (?,?) ON CONFLICT DO NOTHING', f.id, t));
      stmts.push(st(env, 'INSERT INTO user_titles (user_id, tid, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', uid, FOUNDER_TITLE, t));
      const title = c?.title ?? fresh?.[1] ?? '';
      stmts.push(st(env, 'INSERT INTO season0_recap (user_id, data, founder, seen, ts) VALUES (?,?,?,0,?) ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, founder = excluded.founder, seen = 0, ts = excluded.ts',
        uid, JSON.stringify(recapOf.get(uid)), JSON.stringify({ id: f.id, title, source: f.source, asked: f.asked }), t));
    }
    stmts.push(st(env, "INSERT INTO settings (key, value) VALUES ('unique_on', '1') ON CONFLICT (key) DO UPDATE SET value = '1'"), st(env, "INSERT INTO settings (key, value) VALUES ('reset_done', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", String(t)));
    await env.DB.batch(stmts);                                                   // une seule transaction : tout ou rien
    uniqueRefresh?.(); afterReset?.();
    return { ok: true, players: plan.length, plan };
  }
  return { reset, done, recapOf: (env, uid) => one(env, 'SELECT data, founder, seen FROM season0_recap WHERE user_id = ?', uid),
    markSeen: (env, uid) => run(env, 'UPDATE season0_recap SET seen = 1 WHERE user_id = ?', uid) };
}
