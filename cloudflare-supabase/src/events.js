// Événements surprise : heure dorée, week-end shiny, festival des catégories, album éphémère, objectif collectif, défi de la semaine, chasse à la carte du jour, saisons.
// Rien n'est écrit à la main : le calendrier est tiré au sort à partir d'un SECRET gardé en base (table settings, clé events_secret), jamais exposé par l'API.
// Le serveur ne révèle un événement qu'au moment où il commence (bannière, notification, page « Événements »). Tout est calculé, rien n'est planifié en base.
import { grantTitle, syncTitles, TITLE, onTrack } from './game.js';
import { EVENT_ALBUMS, WEEKLY_BY, WEEKLY } from './events-data.js';

const DAY = 86400000, HOUR = 3600000;
export const WEEK_ANCHOR = '2026-01-05';      // un lundi : les semaines, week-ends et blocs sont comptés à partir de là
export const SEASON_ANCHOR = '2026-10-12';    // un lundi : début de la saison 1 (saisons de 14 jours qui s'enchaînent)
export const SEASON_DAYS = 14;

/** Réglages des événements (taux, récompenses). */
export const EV = {
  goldenLegend: 3, goldenUltra: 1.5, shinyMult: 3, themePrice: 90,
  albumChance: 0.08, huntChance: 0.007,                                        // part des paquets qui contiennent une carte de l'album éphémère / la carte recherchée du jour
  goldenPerDay: 38,                                                          // chance (en %) qu'une heure dorée tombe un jour donné
  weekly: { c: 400, p: 2, titleAfter: 4 },
  hunt: { first: { c: 500, p: 2 }, other: { c: 60 } },
  goal: { minPlayers: 10, perPlayer: 40, min: 150, c: 250, p: 2, minOpen: 10 }, // objectif = 40 paquets par joueur (150 au minimum) ; il faut avoir ouvert 10 paquets pour être récompensé
  album: { coinsPerCard: 225, p: 3 },
  season: { pts: { open_pack: 1, legendary: 8, battle_win: 6, battle_play: 2, duel_win: 5, quiz_daily: 5, quiz_correct: 1, trade_done: 4, sale_done: 3, win_auction: 4, fuse: 3, expedition: 3, bourse_bet: 1 },
    rewards: [{ c: 1000, p: 3 }, { c: 600, p: 2 }, { c: 400, p: 1 }], part: { min: 50, c: 150, p: 1 }, tiny: { c: 50 } },
};
const ALWAYS_ON = new Set(['weekly', 'hunt', 'season']);
const PUSH_KINDS = new Set(['golden', 'shiny', 'theme', 'album', 'goal']);   // les seuls événements annoncés par notification
export const KINDS = {
  golden: { name: 'Heure dorée', emoji: '✨', desc: `Pendant 1 heure, les légendaires sont ${EV.goldenLegend} fois plus fréquentes et les ultra rares ${EV.goldenUltra} fois dans tous les paquets.` },
  shiny: { name: 'Week-end shiny', emoji: '💎', desc: `Les légendaires ont ${EV.shinyMult} fois plus de chances d'être shiny, jusqu'à lundi 9 h.` },
  theme: { name: 'Festival des catégories', emoji: '🎪', desc: `Les paquets thématiques coûtent ${EV.themePrice} pièces et contiennent une légendaire garantie, jusqu'à lundi 9 h.` },
  album: { name: 'Album éphémère', emoji: '🎁', desc: 'Une série de cartes à compléter en 7 jours, avec récompense et titre exclusifs. Elles tombent bien plus souvent dans les paquets.' },
  goal: { name: 'Objectif collectif', emoji: '🎯', desc: 'Tous les joueurs ouvrent des paquets ensemble : si l\'objectif est atteint avant la fin, tous ceux qui ont participé sont récompensés.' },
  weekly: { name: 'Défi de la semaine', emoji: '🏅', desc: '' },
  hunt: { name: 'Carte recherchée', emoji: '🔎', desc: '' },
  season: { name: 'Saison', emoji: '🏆', desc: '' },
};

// ---------- temps (heure de Paris) ----------
const dnum = ds => Math.floor(Date.parse(ds + 'T12:00:00Z') / DAY);
const dstr = n => new Date(n * DAY + DAY / 2).toISOString().slice(0, 10);
const dowOf = ds => new Date(ds + 'T12:00:00Z').getUTCDay();
const fmtParis = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const parisOff = ts => { const p = Object.fromEntries(fmtParis.formatToParts(new Date(ts)).map(x => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000; };
/** Instant (ms) de « jour » à h:m heure de Paris. */
export const parisTs = (ds, h = 0, m = 0) => { const [y, mo, d] = ds.split('-').map(Number), base = Date.UTC(y, mo - 1, d, h, m); return base - parisOff(base - parisOff(base)); };
export const dayOfTs = t => { const p = Object.fromEntries(fmtParis.formatToParts(new Date(t)).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
const A0 = dnum(WEEK_ANCHOR), S0 = dnum(SEASON_ANCHOR);

/** Nombre pseudo-aléatoire de 32 bits, stable pour les mêmes paramètres (le premier est le secret). */
export const H = (...parts) => {
  const s = parts.join('|'); let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0; h ^= h >>> 16;
  return h >>> 0;
};

/** Défi de la semaine du lundi donné : les défis passent tous une fois dans un ordre mélangé (par secret), sans jamais se répéter d'une semaine à l'autre. */
export function weeklyOf(secret, monday) {
  const wk = Math.floor((dnum(monday) - A0) / 7), n = WEEKLY.length, cycle = Math.floor(wk / n);
  const order = c => { const o = WEEKLY.map(w => w.id).sort((x, y) => H(secret, 'wc', c, x) - H(secret, 'wc', c, y) || (x < y ? -1 : 1)); return o; };
  let o = order(cycle);
  const prevLast = order(cycle - 1).at(-1) === (o[0]) ? true : false;
  if (prevLast) o = [o[1], o[0], ...o.slice(2)];                               // le premier du cycle ne répète pas le dernier du cycle précédent
  const pos = ((wk % n) + n) % n;
  return WEEKLY_BY[o[pos]];
}

/** Tous les événements qui recoupent [t0, t1[ (passés, en cours ou à venir dans cet intervalle). */
export function eventsIn(secret, t0, t1) {
  const out = [], push = e => { if (e.end > t0 && e.start < t1) out.push(e); };
  const a = dnum(dayOfTs(t0)) - 30, b = dnum(dayOfTs(t1)) + 1;
  for (let n = a; n <= b; n++) {
    const ds = dstr(n);
    if (H(secret, 'gold', ds) % 100 < EV.goldenPerDay) {
      const hour = 12 + H(secret, 'goldh', ds) % 10, min = [0, 15, 30, 45][H(secret, 'goldm', ds) % 4], start = parisTs(ds, hour, min);
      push({ id: 'golden:' + ds, kind: 'golden', start, end: start + HOUR });
    }
    push({ id: 'hunt:' + ds, kind: 'hunt', start: parisTs(ds, 0, 0), end: parisTs(dstr(n + 1), 0, 0), day: ds });
    if (dowOf(ds) === 1) {
      const w = weeklyOf(secret, ds);
      push({ id: 'weekly:' + ds, kind: 'weekly', start: parisTs(ds, 0, 0), end: parisTs(dstr(n + 7), 0, 0), day: ds, weekly: w.id });
    }
  }
  const w0 = Math.floor((a - A0) / 7) - 1, w1 = Math.floor((b - A0) / 7) + 1;
  const shinyWeek = wk => { const blk = Math.floor(wk / 3); return wk === blk * 3 + H(secret, 'shiny', blk) % 3; };
  const rawTheme = wk => { const blk = Math.floor((wk + 1) / 4); return wk === blk * 4 - 1 + H(secret, 'theme', blk) % 4; };
  const themeWeek = wk => (rawTheme(wk) && !shinyWeek(wk)) || (rawTheme(wk - 1) && shinyWeek(wk - 1));   // jamais en même temps que le week-end shiny : il glisse d'une semaine
  const goalWeek = wk => { const blk = Math.floor((wk + 2) / 3); return wk === blk * 3 - 2 + H(secret, 'goal', blk) % 3; };
  for (let wk = w0; wk <= w1; wk++) {
    const sat = dstr(A0 + wk * 7 + 5), mon = dstr(A0 + wk * 7 + 7);
    if (shinyWeek(wk)) push({ id: 'shiny:' + sat, kind: 'shiny', start: parisTs(sat, 9), end: parisTs(mon, 9) });
    if (themeWeek(wk)) push({ id: 'theme:' + sat, kind: 'theme', start: parisTs(sat, 9), end: parisTs(mon, 9) });
    if (goalWeek(wk)) push({ id: 'goal:' + sat, kind: 'goal', start: parisTs(sat, 10), end: parisTs(mon, 10), day: sat });
  }
  const b0 = Math.floor((a - A0) / 28) - 1, b1 = Math.floor((b - A0) / 28) + 1;
  for (let bk = b0; bk <= b1; bk++) {
    const start = dstr(A0 + bk * 28 + H(secret, 'albd', bk) % 21), month = +start.slice(5, 7);
    const pool = EVENT_ALBUMS.flatMap(a => (a.months?.includes(month) ? [a, a, a] : a.months ? [] : [a])), album = pool[H(secret, 'alb', bk) % pool.length];
    push({ id: 'album:' + start, kind: 'album', start: parisTs(start, 10), end: parisTs(dstr(dnum(start) + 7), 10), album: album.id, day: start });
  }
  const s0 = Math.floor((a - S0) / SEASON_DAYS) - 1, s1 = Math.floor((b - S0) / SEASON_DAYS) + 1;
  for (let s = Math.max(0, s0); s <= s1; s++) {
    const st = dstr(S0 + s * SEASON_DAYS), en = dstr(S0 + (s + 1) * SEASON_DAYS);
    push({ id: 'season:' + st, kind: 'season', start: parisTs(st, 0), end: parisTs(en, 0), idx: s, day: st });
  }
  return out.sort((x, y) => x.start - y.start);
}
export const activeIn = (list, t) => list.filter(e => e.start <= t && t < e.end);
/** Effets des événements en cours sur les tirages. */
export function modsFrom(active) {
  const m = { legend: 1, ultra: 1, shiny: 1, themePrice: null, themeGuarantee: false, album: null };
  for (const e of active) {
    if (e.kind === 'golden') { m.legend *= EV.goldenLegend; m.ultra *= EV.goldenUltra; }
    if (e.kind === 'shiny') m.shiny *= EV.shinyMult;
    if (e.kind === 'theme') { m.themePrice = EV.themePrice; m.themeGuarantee = true; }
    if (e.kind === 'album') m.album = e.album;
  }
  return m;
}
export const seasonName = idx => `Saison ${idx + 1}`;
const OK_TITLE = t => !/^(Liste|Listes|Élections?|Décès|Catégorie|Portail|Wikipédia|Saison)\b|\d{4}|\(homonymie\)|\((mini-)?série|\(téléfilm|\(film|\(émission|^.{1,3}$/i.test(t);
const clampTitle = (id, fallback) => (TITLE[id] ? id : fallback);

export function installEvents(d) {
  const { route, bad, one, all, run, st, notify, ensureGameSchema, CFG, now, entryAt, getMeta, albumGroups, eventAlbums } = d;
  let secretCache = null;
  /** Secret du calendrier : créé au premier usage, gardé en base, jamais renvoyé par l'API. */
  async function getSecret(env) {
    if (secretCache) return secretCache;
    await ensureGameSchema(env);
    let row = await one(env, "SELECT value FROM settings WHERE key = 'events_secret'");
    if (!row) {
      const v = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
      await run(env, "INSERT INTO settings (key, value) VALUES ('events_secret', ?) ON CONFLICT (key) DO NOTHING", v);
      row = await one(env, "SELECT value FROM settings WHERE key = 'events_secret'");
    }
    return (secretCache = row.value);
  }
  // événements autour de l'instant présent, recalculés au plus une fois par minute
  let near = { at: 0, list: [] };
  async function nearby(env, t = now()) {
    const secret = await getSecret(env);
    if (Math.floor(t / 60000) !== near.at) near = { at: Math.floor(t / 60000), list: eventsIn(secret, t - 10 * DAY, t + 1) };
    return env.EVENTS === '0' ? near.list.filter(e => ALWAYS_ON.has(e.kind)) : near.list;      // EVENTS = '0' : événements surprise coupés (tests, ou si on veut les arrêter)
  }
  async function activeNow(env, t = now()) { return activeIn(await nearby(env, t), t); }
  async function mods(env) { return { ...modsFrom(await activeNow(env)) }; }

  // ---------- carte recherchée du jour (légendaire, tirée au sort) ----------
  const huntCache = new Map();
  async function huntCard(env, origin, day = dayOfTs(now())) {
    if (huntCache.has(day)) return huntCache.get(day);
    const secret = await getSecret(env), { ranges } = await getMeta(env, origin), N = ranges.legendary[1];
    let card = null;
    for (let i = 0; i < 80 && !card; i++) {
      const rank = (H(secret, 'huntcard', day) + i * 7919) % N, e = await entryAt(env, origin, rank);
      if (e && OK_TITLE(e[1])) card = { id: e[0], title: e[1], r: rank };
    }
    if (huntCache.size > 4) huntCache.clear();
    huntCache.set(day, card);
    return card;
  }
  /** Modificateurs de tirage pour UN paquet : effets continus (heure dorée, shiny, festival) + tirages au sort de l'album éphémère et de la carte recherchée. */
  async function drawMods(env, origin) {
    if (env.EVENTS === '0') return { legend: 1, ultra: 1, shiny: 1, themeGuarantee: false, themePrice: null, direct: false };
    const m = await mods(env), out = { legend: m.legend, ultra: m.ultra, shiny: m.shiny, themeGuarantee: m.themeGuarantee, themePrice: m.themePrice };
    try {
      if (m.album && Math.random() < EV.albumChance) { const a = (await eventAlbums(env, origin)).find(x => x.id === m.album); if (a) out.album = a.cards; }
      if (Math.random() < EV.huntChance) { const h = await huntCard(env, origin); if (h) out.hunt = h; }
    } catch (e) { console.error('drawMods', e); }
    out.direct = out.legend > 1 || out.ultra > 1 || out.shiny > 1 || !!out.album || !!out.hunt;     // un paquet préparé d'avance ne peut pas en profiter : tirage direct
    return out;
  }

  // ---------- suivi des actions (défi de la semaine, points de saison, objectif collectif) ----------
  const up = (env, key, uid, n) => st(env, 'INSERT INTO event_progress (key, user_id, n) VALUES (?,?,?) ON CONFLICT (key, user_id) DO UPDATE SET n = event_progress.n + excluded.n', key, uid, Math.round(n));
  async function track(env, uid, ev) {
    const act = await activeNow(env), stmts = [];
    const wk = act.find(e => e.kind === 'weekly'); if (wk) { const w = WEEKLY_BY[wk.weekly]; if (ev[w.event] > 0) stmts.push(up(env, 'w:' + wk.day, uid, ev[w.event])); }
    const se = act.find(e => e.kind === 'season'); if (se) { let pts = 0; for (const [k, v] of Object.entries(ev)) pts += (EV.season.pts[k] || 0) * (v || 0); if (pts >= 1) stmts.push(up(env, 's:' + se.idx, uid, pts)); }
    const go = act.find(e => e.kind === 'goal'); if (go && ev.open_pack > 0) stmts.push(up(env, 'g:' + go.id, uid, ev.open_pack));
    if (stmts.length) await env.DB.batch(stmts);
  }
  onTrack(track);

  // ---------- récompenses ----------
  const give = async (env, uid, r) => { if (r.c || r.p) await run(env, 'UPDATE users SET coins = coins + ?, pack_stock = pack_stock + ? WHERE id = ?', r.c || 0, r.p || 0, uid); };
  const rwText = r => [r.c ? `${r.c} pièces` : '', r.p ? `${r.p} paquet${r.p > 1 ? 's' : ''}` : ''].filter(Boolean).join(' et ');
  const claimOnce = async (env, key, uid) => (await run(env, 'INSERT INTO event_claims (key, user_id, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', key, uid, now())).meta.changes > 0;
  const titleNotify = async (env, ctx, uid, id) => { if (id && await grantTitle(env, uid, id)) notify(env, ctx, { t: 'notify', msg: `Nouveau titre débloqué : « ${TITLE[id].label} » !` }, uid); };

  /** Après l'ouverture d'un paquet : la carte recherchée du jour est-elle dedans ? */
  async function afterPack(env, ctx, user, drawn) {
    try {
      const day = dayOfTs(now()), h = await huntCard(env, d.assetOrigin, day);
      if (!h || !drawn.some(c => (c.id >= 100000000 ? c.id - 100000000 : c.id) === h.id)) return null;
      await ensureGameSchema(env);
      const ins = await run(env, 'INSERT INTO event_hunt (day, user_id, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', day, user.id, now());
      if (!ins.meta.changes) return null;
      const rank = +(await one(env, 'SELECT COUNT(*) n FROM event_hunt WHERE day = ? AND (ts < (SELECT ts FROM event_hunt WHERE day = ? AND user_id = ?) OR (ts = (SELECT ts FROM event_hunt WHERE day = ? AND user_id = ?) AND user_id < ?))', day, day, user.id, day, user.id, user.id)).n + 1;
      const rw = rank === 1 ? EV.hunt.first : EV.hunt.other;
      await give(env, user.id, rw);
      notify(env, ctx, { t: 'notify', msg: rank === 1 ? `🔎 Tu as trouvé la carte recherchée du jour (« ${h.title} ») en premier ! +${rwText(rw)}` : `🔎 Tu as aussi trouvé la carte recherchée du jour (« ${h.title} ») : +${rwText(rw)}` }, user.id);
      if (rank === 1) { notify(env, ctx, { t: 'notify', msg: `🔎 ${user.name} a trouvé la carte recherchée du jour : « ${h.title} » !`, except: user.id }); await titleNotify(env, ctx, user.id, 'ev_hunter'); notify(env, ctx, { t: 'refresh', what: 'events' }); }
      return { rank, reward: rw };
    } catch (e) { console.error('afterPack', e); return null; }
  }

  // ---------- annonces (tâche planifiée toutes les 15 min) ----------
  async function announceText(env, e) {
    if (e.kind === 'album') { const a = EVENT_ALBUMS.find(x => x.id === e.album); return `${a.emoji} Album éphémère « ${a.name} » ! 7 jours pour le compléter : récompense et titre exclusifs, cartes bien plus fréquentes dans les paquets.`; }
    if (e.kind === 'goal') return '🎯 Objectif collectif ! Ouvrez des paquets ensemble avant lundi 10 h : si l\'objectif est atteint, tous les participants sont récompensés.';
    return `${KINDS[e.kind].emoji} ${KINDS[e.kind].name} ! ${KINDS[e.kind].desc}`;
  }
  async function tick(env, ctx) {
    const t = now(), fresh = activeIn(await nearby(env, t), t).filter(e => PUSH_KINDS.has(e.kind) && t - e.start < 45 * 60000);
    if (!fresh.length) return 0;
    const row = await one(env, "SELECT value FROM settings WHERE key = 'ev_announced'"); let done = []; try { done = JSON.parse(row?.value || '[]'); } catch { /* ignoré */ }
    const todo = fresh.filter(e => !done.includes(e.id)); if (!todo.length) return 0;
    await run(env, "INSERT INTO settings (key, value) VALUES ('ev_announced', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", JSON.stringify([...done, ...todo.map(e => e.id)].slice(-40)));
    const users = await all(env, 'SELECT id FROM users WHERE is_bot = 0 LIMIT 500');
    for (const e of todo) { const msg = await announceText(env, e); for (const u of users) await notify(env, ctx, { t: 'notify', msg }, u.id); }
    notify(env, ctx, { t: 'refresh', what: 'events' });
    return todo.length;
  }

  // ---------- état complet pour un joueur ----------
  const briefOf = e => ({ id: e.id, kind: e.kind, name: e.kind === 'album' ? `Album « ${EVENT_ALBUMS.find(x => x.id === e.album)?.name} »` : KINDS[e.kind].name, emoji: e.kind === 'album' ? EVENT_ALBUMS.find(x => x.id === e.album)?.emoji : KINDS[e.kind].emoji, end: e.end, ...(e.album ? { album: e.album } : {}) });
  async function brief(env) { const t = now(); return (await activeNow(env, t)).filter(e => PUSH_KINDS.has(e.kind)).map(briefOf); }
  const targetOf = async (env, ev) => {
    await run(env, "INSERT INTO event_progress (key, user_id, n) SELECT ?, 0, GREATEST(?, ? * COUNT(*)) FROM users WHERE is_bot = 0 AND packs_opened > 0 ON CONFLICT (key, user_id) DO NOTHING", 'gt:' + ev.id, EV.goal.min, EV.goal.perPlayer);
    return +(await one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = 0', 'gt:' + ev.id)).n;
  };
  async function stateFor(env, user, origin) {
    await ensureGameSchema(env);
    const t = now(), list = await nearby(env, t), act = activeIn(list, t), out = { now: t, bursts: act.filter(e => PUSH_KINDS.has(e.kind)).map(briefOf).map(b => ({ ...b, desc: b.kind === 'album' ? KINDS.album.desc : KINDS[b.kind].desc })) };
    // défi de la semaine
    const wk = act.find(e => e.kind === 'weekly');
    if (wk) {
      const w = WEEKLY_BY[wk.weekly];
      const [pr, cl, done] = await Promise.all([one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', 'w:' + wk.day, user.id), one(env, 'SELECT 1 x FROM event_claims WHERE key = ? AND user_id = ?', 'w:' + wk.day, user.id), one(env, "SELECT COUNT(*) n FROM event_claims WHERE key LIKE 'w:%' AND user_id = ?", user.id)]);
      out.weekly = { id: w.id, text: w.text, goal: w.goal, progress: Math.min(+(pr?.n || 0), w.goal), claimed: !!cl, until: wk.end, reward: EV.weekly, completed: +done.n, titleAfter: EV.weekly.titleAfter };
    }
    // carte recherchée
    const hu = act.find(e => e.kind === 'hunt');
    if (hu) {
      const h = await huntCard(env, origin, hu.day);
      if (h) {
        const [first, mine] = await Promise.all([one(env, 'SELECT h.ts, u.name FROM event_hunt h JOIN users u ON u.id = h.user_id WHERE h.day = ? ORDER BY h.ts, h.user_id LIMIT 1', hu.day), one(env, 'SELECT 1 x FROM event_hunt WHERE day = ? AND user_id = ?', hu.day, user.id)]);
        const groups = await albumGroups(env, origin), cat = groups.find(a => a.cards.some(c => c.id === h.id));
        out.hunt = { until: hu.end, first: h.title[0], len: h.title.length, category: cat ? cat.name : null, found: first ? { by: first.name, ts: +first.ts } : null, mine: !!mine, title: first || mine ? h.title : null, reward: EV.hunt };
      }
    }
    // objectif collectif (en cours, ou terminé depuis moins de 5 jours)
    const go = [...list].reverse().find(e => e.kind === 'goal' && e.start <= t && t - e.end < 5 * DAY);
    if (go) {
      const target = await targetOf(env, go), [tot, mine, cl] = await Promise.all([one(env, 'SELECT COALESCE(SUM(n), 0) n FROM event_progress WHERE key = ? AND user_id > 0', 'g:' + go.id), one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', 'g:' + go.id, user.id), one(env, 'SELECT 1 x FROM event_claims WHERE key = ? AND user_id = ?', 'g:' + go.id, user.id)]);
      const ended = go.end <= t, total = +tot.n, n = +(mine?.n || 0), reached = total >= target;
      out.goal = { id: go.id, until: go.end, ended, target, total, mine: n, minOpen: EV.goal.minOpen, reached, claimed: !!cl, claimable: ended && reached && n >= EV.goal.minOpen && !cl, reward: { c: EV.goal.c, p: EV.goal.p } };
    }
    // saison
    const se = act.find(e => e.kind === 'season');
    if (se) {
      const [mine, top, cnt] = await Promise.all([one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', 's:' + se.idx, user.id),
        all(env, 'SELECT p.user_id id, u.name, p.n FROM event_progress p JOIN users u ON u.id = p.user_id WHERE p.key = ? AND u.is_bot = 0 ORDER BY p.n DESC, p.user_id LIMIT 5', 's:' + se.idx),
        one(env, 'SELECT COUNT(*) n FROM event_progress p WHERE p.key = ? AND p.n > COALESCE((SELECT n FROM event_progress WHERE key = ? AND user_id = ?), 0)', 's:' + se.idx, 's:' + se.idx, user.id)]);
      const pts = +(mine?.n || 0);
      out.season = { idx: se.idx, name: seasonName(se.idx), until: se.end, points: pts, rank: pts > 0 ? +cnt.n + 1 : null, top: top.map(r => ({ id: r.id, name: r.name, pts: +r.n })), pointsInfo: EV.season.pts, rewards: EV.season.rewards, part: EV.season.part };
      if (se.idx > 0) out.season.prev = await prevSeason(env, user.id, se.idx - 1);
    } else if (t < parisTs(SEASON_ANCHOR)) out.season = { upcoming: true, start: parisTs(SEASON_ANCHOR), name: seasonName(0) };
    // album éphémère en cours
    const al = act.find(e => e.kind === 'album');
    if (al) out.album = { id: al.album, name: EVENT_ALBUMS.find(x => x.id === al.album).name, until: al.end };
    return out;
  }
  const seasonReward = (rank, pts) => rank && rank <= 3 ? { ...EV.season.rewards[rank - 1], tier: rank } : pts >= EV.season.part.min ? { c: EV.season.part.c, p: EV.season.part.p, tier: 4 } : pts > 0 ? { ...EV.season.tiny, tier: 5 } : null;
  async function prevSeason(env, uid, idx) {
    const key = 's:' + idx, mine = await one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', key, uid), pts = +(mine?.n || 0);
    if (!pts) return null;
    const [r, cl] = await Promise.all([one(env, 'SELECT COUNT(*) n FROM event_progress WHERE key = ? AND n > ?', key, pts), one(env, 'SELECT 1 x FROM event_claims WHERE key = ? AND user_id = ?', 'sc:' + idx, uid)]);
    const rank = +r.n + 1;
    return { idx, name: seasonName(idx), points: pts, rank, reward: seasonReward(rank, pts), claimed: !!cl };
  }

  route('GET', '/api/events', async ({ env, user, origin }) => stateFor(env, user, origin));
  route('POST', '/api/events/weekly/claim', async ({ env, ctx, user }) => {
    await ensureGameSchema(env);
    const act = await activeNow(env), wk = act.find(e => e.kind === 'weekly'); if (!wk) bad('Aucun défi en cours');
    const w = WEEKLY_BY[wk.weekly], pr = await one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', 'w:' + wk.day, user.id);
    if (+(pr?.n || 0) < w.goal) bad('Le défi n\'est pas encore terminé');
    if (!(await claimOnce(env, 'w:' + wk.day, user.id))) bad('Récompense déjà récupérée');
    await give(env, user.id, EV.weekly);
    const n = +(await one(env, "SELECT COUNT(*) n FROM event_claims WHERE key LIKE 'w:%' AND user_id = ?", user.id)).n;
    if (n >= EV.weekly.titleAfter) await titleNotify(env, ctx, user.id, 'ev_weekly4');
    return { ok: true, reward: EV.weekly, completed: n };
  });
  route('POST', '/api/events/goal/claim', async ({ env, ctx, user, body }) => {
    await ensureGameSchema(env);
    const t = now(), go = (await nearby(env, t)).find(e => e.kind === 'goal' && e.id === String(body.id || '')); if (!go || go.end > t) bad('Cet objectif n\'est pas terminé');
    const target = await targetOf(env, go), tot = +(await one(env, 'SELECT COALESCE(SUM(n), 0) n FROM event_progress WHERE key = ? AND user_id > 0', 'g:' + go.id)).n, mine = +((await one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', 'g:' + go.id, user.id))?.n || 0);
    if (tot < target) bad('L\'objectif n\'a pas été atteint cette fois-ci');
    if (mine < EV.goal.minOpen) bad(`Il fallait ouvrir au moins ${EV.goal.minOpen} paquets pendant l'événement`);
    if (!(await claimOnce(env, 'g:' + go.id, user.id))) bad('Récompense déjà récupérée');
    const rw = { c: EV.goal.c, p: EV.goal.p }; await give(env, user.id, rw); await titleNotify(env, ctx, user.id, 'ev_team');
    return { ok: true, reward: rw };
  });
  route('POST', '/api/events/season/claim', async ({ env, ctx, user, body }) => {
    await ensureGameSchema(env);
    const idx = Math.floor(+body.idx), t = now(), se = (await nearby(env, t)).find(e => e.kind === 'season' && e.idx === idx);
    if (!se || se.end > t) bad('Cette saison n\'est pas terminée');
    const prev = await prevSeason(env, user.id, idx); if (!prev?.reward) bad('Tu n\'as pas marqué de points cette saison');
    if (!(await claimOnce(env, 'sc:' + idx, user.id))) bad('Récompense déjà récupérée');
    await give(env, user.id, prev.reward);
    const k = idx + 1;
    if (prev.rank === 1) await titleNotify(env, ctx, user.id, clampTitle(`s${k}_champion`, 'ev_season_champ'));
    else if (prev.rank <= 3) await titleNotify(env, ctx, user.id, 'ev_season_podium');
    if (prev.points >= EV.season.part.min) await titleNotify(env, ctx, user.id, clampTitle(`s${k}_veteran`, 'ev_season_vet'));
    return { ok: true, reward: prev.reward, rank: prev.rank };
  });
  /** Récompense de l'album éphémère : plus généreuse que celle d'un album normal + titre exclusif. */
  const eventAlbumReward = a => ({ c: EV.album.coinsPerCard * a.cards.length, p: EV.album.p });

  return { mods, drawMods, huntCard, afterPack, tick, brief, stateFor, activeNow, getSecret, eventAlbumReward, titleNotify, track, nearby };
}
