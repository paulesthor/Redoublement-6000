// Récompense quotidienne, quêtes du jour, quiz du jour : règles, catalogue de quêtes, suivi de progression.
import { st } from './util.js';

const TZ = 'Europe/Paris';
/** Jour de jeu (« YYYY-MM-DD », heure de Paris) : tout se remet à zéro à minuit, heure française. */
export const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ });
/** Millisecondes restantes avant minuit (heure de Paris). */
export function msToMidnight(t = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return 86400000 - ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000;
}

// ---------- récompense quotidienne : 7 jours de série, puis on recommence ----------
export const DAILY = [{ c: 50 }, { c: 75 }, { p: 1 }, { c: 100 }, { p: 1, c: 50 }, { c: 150 }, { p: 3, c: 300 }];
/** État du joueur : a-t-il déjà pris sa récompense aujourd'hui, et laquelle prendra-t-il ? */
export function dailyState(u, t = Date.now()) {
  const today = dayKey(t), yesterday = dayKey(t - 86400000);
  const claimed = u.daily_day === today, streak = u.daily_streak || 0;
  const next = claimed ? streak : (u.daily_day === yesterday ? streak + 1 : 1);
  return { today, available: !claimed, streak: claimed ? streak : Math.max(0, next - 1), next, index: (next - 1) % 7, rewards: DAILY };
}

// ---------- fusion de cartes ----------
// Fusionner des doublons d'une carte la fait monter de niveau (3 au maximum) : +ATK et +DEF fixes, plus importants pour les petites raretés.
// Une commune au niveau 3 (+1350) rattrape une peu commune moyenne mais reste sous une rare moyenne ; les légendaires et les shiny ne fusionnent pas.
export const FUSE = {
  max: 3,
  bonus: [450, 400, 300, 200, 100, 0],                                                  // par niveau, indexé par rang de rareté (commune … légendaire)
  cost: [[2, 3, 5], [2, 3, 5], [2, 3, 4], [2, 2, 3], [2, 2, 2]],                          // doublons consommés pour passer au niveau 1, 2, 3
};
export const fusionBonus = (rar, lvl) => (FUSE.bonus[rar] || 0) * (lvl || 0);
/** Carte avec ses stats de fusion appliquées (rar = rang de rareté). */
export const boosted = (c, rar, lvl) => { const b = fusionBonus(rar, lvl); return b ? { ...c, atk: c.atk + b, def: c.def + b, lvl, bonus: b } : { ...c, lvl: lvl || 0, bonus: 0 }; };
/** Offre de fusion d'une carte de son propriétaire (null si elle ne peut pas fusionner). */
export const fuseInfo = (rar, shiny, lvl, qty) => {
  if (shiny || rar >= 5) return null;
  const cost = lvl < FUSE.max ? FUSE.cost[rar][lvl] : null;
  return { lvl, max: FUSE.max, cost, gain: FUSE.bonus[rar], can: cost !== null && qty >= cost + 1 };
};

// ---------- catalogue de quêtes (3 par jour et par joueur : une facile, une moyenne, une difficile) ----------
// c = pièces, p = paquets. L'événement (event) est compté par le serveur à chaque action du joueur.
const E = (id, tier, text, event, goal, reward) => ({ id, tier, text, event, goal, reward });
export const QUESTS = [
  E('e1', 1, 'Ouvre 1 paquet', 'open_pack', 1, { c: 25 }), E('e2', 1, 'Ouvre 2 paquets', 'open_pack', 2, { c: 30 }),
  E('e3', 1, 'Mets 1 carte en favori', 'favorite', 1, { c: 20 }), E('e4', 1, 'Fais 1 enchère', 'bid', 1, { c: 25 }),
  E('e5', 1, 'Défausse 3 cartes', 'discard', 3, { c: 25 }), E('e6', 1, 'Envoie 1 message à un joueur', 'message', 1, { c: 20 }),
  E('e7', 1, 'Regarde le profil d\'un autre joueur', 'profile_view', 1, { c: 15 }), E('e8', 1, 'Cherche 2 cartes dans le catalogue', 'search', 2, { c: 20 }),
  E('e9', 1, 'Mets 1 carte en vente aux enchères', 'sell_auction', 1, { c: 30 }), E('e10', 1, 'Fais le quiz du jour', 'quiz_daily', 1, { c: 40 }),
  E('e11', 1, 'Joue 1 duel de quiz', 'duel_play', 1, { c: 30 }), E('e12', 1, 'Expose une carte dans ta vitrine', 'showcase', 1, { c: 20 }),
  E('m1', 2, 'Ouvre 3 paquets', 'open_pack', 3, { c: 60 }), E('m2', 2, 'Dépense 150 pièces', 'spend', 150, { c: 60 }),
  E('m3', 2, 'Obtiens 3 cartes rares ou mieux', 'rare_plus', 3, { c: 70 }), E('m4', 2, 'Remporte 1 combat de cartes', 'battle_win', 1, { c: 80 }),
  E('m5', 2, 'Joue 2 combats de cartes', 'battle_play', 2, { c: 60 }), E('m6', 2, 'Fais 3 enchères', 'bid', 3, { c: 60 }),
  E('m7', 2, 'Remporte 1 enchère', 'win_auction', 1, { c: 80 }), E('m8', 2, 'Réponds juste à 4 questions de combat', 'battle_correct', 4, { c: 70 }),
  E('m9', 2, 'Gagne 1 duel de quiz', 'duel_win', 1, { c: 80 }), E('m10', 2, 'Propose un échange à un joueur', 'trade_propose', 1, { c: 60 }),
  E('m11', 2, 'Envoie 1 demande d\'ami', 'friend', 1, { c: 50 }), E('m12', 2, 'Fusionne 1 carte', 'fuse', 1, { c: 70 }),
  E('h1', 3, 'Ouvre 5 paquets', 'open_pack', 5, { p: 1 }), E('h2', 3, 'Obtiens 1 carte légendaire', 'legendary', 1, { p: 2 }),
  E('h3', 3, 'Remporte 2 combats de cartes', 'battle_win', 2, { p: 1 }), E('h4', 3, 'Réponds juste à 10 questions de combat', 'battle_correct', 10, { p: 1 }),
  E('h5', 3, 'Termine 1 échange', 'trade_done', 1, { p: 1 }), E('h6', 3, 'Vends 1 carte aux enchères', 'sale_done', 1, { p: 1 }),
  E('h7', 3, 'Dépense 300 pièces', 'spend', 300, { p: 1 }), E('h8', 3, 'Obtiens 5 cartes rares ou mieux', 'rare_plus', 5, { p: 1 }),
  E('h9', 3, 'Réponds juste à 5 questions du quiz du jour', 'quiz_correct', 5, { p: 1 }), E('h10', 3, 'Gagne 3 duels de quiz', 'duel_win', 3, { p: 1 }),
];
export const QUEST = Object.fromEntries(QUESTS.map(q => [q.id, q]));
export const BONUS = { id: 'bonus', goal: 3, reward: { p: 1 }, text: 'Récupère les 3 quêtes du jour' };

const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
const mulberry = a => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** Les 3 quêtes d'un joueur pour un jour : toujours les mêmes pour (joueur, jour), trois événements différents. */
export function questsFor(uid, day) {
  const rnd = mulberry(fnv(`${uid}:${day}`)), out = [], used = new Set();
  for (const tier of [1, 2, 3]) {
    const pool = QUESTS.filter(q => q.tier === tier && !used.has(q.event));
    const q = pool[Math.floor(rnd() * pool.length)]; out.push(q.id); used.add(q.event);
  }
  return out;
}

// ---------- base de données : tables créées au premier besoin ----------
let ready = false;
export async function ensureGameSchema(env) {
  if (ready) return;
  const stmts = [
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_day TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_streak INTEGER NOT NULL DEFAULT 0',
    'CREATE TABLE IF NOT EXISTS quests (user_id BIGINT NOT NULL, day TEXT NOT NULL, qid TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, claimed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day, qid))',
    'CREATE TABLE IF NOT EXISTS daily_quiz (day TEXT PRIMARY KEY, title TEXT NOT NULL, extract TEXT NOT NULL DEFAULT \'\', questions TEXT NOT NULL, model TEXT, created BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS daily_quiz_runs (user_id BIGINT NOT NULL, day TEXT NOT NULL, started BIGINT NOT NULL, answers TEXT, correct INTEGER, delta INTEGER, finished BIGINT, PRIMARY KEY (user_id, day))',
    'ALTER TABLE inventory ADD COLUMN IF NOT EXISTS lvl BIGINT NOT NULL DEFAULT 0',
    'CREATE INDEX IF NOT EXISTS inventory_lvl ON inventory(user_id, lvl DESC, skey DESC, card_id DESC)',
    'ALTER TABLE daily_quiz ADD COLUMN IF NOT EXISTS winner BIGINT',
    'ALTER TABLE daily_quiz ADD COLUMN IF NOT EXISTS awarded BIGINT',
    'CREATE TABLE IF NOT EXISTS tournaments (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, creator BIGINT NOT NULL, stake BIGINT NOT NULL, maxp INTEGER NOT NULL DEFAULT 4, status TEXT NOT NULL DEFAULT \'open\', stage TEXT, bracket TEXT, created BIGINT NOT NULL, started BIGINT, ended BIGINT)',
    'CREATE TABLE IF NOT EXISTS tournament_players (tid BIGINT NOT NULL, user_id BIGINT NOT NULL, joined BIGINT NOT NULL, payout BIGINT, PRIMARY KEY (tid, user_id))',
    'CREATE TABLE IF NOT EXISTS album_claims (user_id BIGINT NOT NULL, album TEXT NOT NULL, ts BIGINT NOT NULL, PRIMARY KEY (user_id, album))',
    'ALTER TABLE album_claims ENABLE ROW LEVEL SECURITY',
    'CREATE TABLE IF NOT EXISTS login_fails (k TEXT PRIMARY KEY, n INTEGER NOT NULL, first BIGINT NOT NULL)',
    'ALTER TABLE login_fails ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_v BIGINT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT',
    'CREATE TABLE IF NOT EXISTS avatars (user_id BIGINT PRIMARY KEY, data TEXT NOT NULL, ts BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS user_titles (user_id BIGINT NOT NULL, tid TEXT NOT NULL, ts BIGINT NOT NULL, PRIMARY KEY (user_id, tid))',
    'ALTER TABLE avatars ENABLE ROW LEVEL SECURITY', 'ALTER TABLE user_titles ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY', 'ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE quests ENABLE ROW LEVEL SECURITY', 'ALTER TABLE daily_quiz ENABLE ROW LEVEL SECURITY', 'ALTER TABLE daily_quiz_runs ENABLE ROW LEVEL SECURITY',
  ].map(s => env.DB.prepare(s));
  try { await env.DB.batch(stmts); } catch (e) { await new Promise(r => setTimeout(r, 200)); await env.DB.batch(stmts); }   // deux Workers qui créent en même temps : le second réessaie
  ready = true;
}

const seen = new Set();
/** Une action du joueur : fait avancer ses quêtes du jour. `ev` = { open_pack: 1, new_cards: 4, … }. Ne bloque jamais le jeu (erreurs ignorées). */
export async function bumpQuests(env, uid, ev) {
  try {
    if (!uid || !Object.values(ev).some(Boolean)) return;
    await ensureGameSchema(env);
    const day = dayKey(), ids = questsFor(uid, day), key = uid + ':' + day, stmts = [];
    if (!seen.has(key)) for (const id of [...ids, BONUS.id]) stmts.push(st(env, 'INSERT INTO quests (user_id, day, qid) VALUES (?,?,?) ON CONFLICT DO NOTHING', uid, day, id));
    for (const id of ids) { const q = QUEST[id], n = ev[q.event]; if (n) stmts.push(st(env, 'UPDATE quests SET progress = LEAST(progress + ?, ?) WHERE user_id = ? AND day = ? AND qid = ? AND claimed = 0', Math.round(n), q.goal, uid, day, id)); }
    if (stmts.length) await env.DB.batch(stmts);
    seen.add(key); if (seen.size > 5000) seen.clear();
  } catch (e) { console.error('bumpQuests', e); }
}

// ---------- tournois (4 joueurs : deux demi-finales, puis finale et match pour la 3e place) ----------
/** Gains par rang (1er, 2e, 3e, 4e…) : la moitié haute récupère sa mise plus les mises de la moitié basse (pondérées par le rang), la moitié basse perd sa mise. */
export function tPayouts(n, stake) {
  const w = Math.floor(n / 2), pool = (n - w) * stake, weights = Array.from({ length: w }, (_, i) => w - i), sum = weights.reduce((t, x) => t + x, 0);
  const out = Array.from({ length: n }, () => 0);
  let given = 0; for (let i = 0; i < w; i++) { const s = Math.floor(pool * weights[i] / sum); out[i] = stake + s; given += s; }
  if (w) out[0] += pool - given;
  return out;
}

// ---------- titres à débloquer (profil) ----------
// calc : débloqué automatiquement d'après les statistiques ; sans calc : accordé par un événement (grantTitle) ; season : réservé aux futures saisons.
const TI = (id, cat, label, desc, calc, prog) => ({ id, cat, label, desc, calc, prog });
export const TITLE_CATS = { modes: 'Modes de jeu', exploits: 'Exploits et collection', saison: 'Saisons' };
export const TITLES = [
  TI('duelist', 'modes', 'Duelliste', 'Gagne 10 duels ou combats', c => c.wins >= 10, c => [c.wins, 10]),
  TI('gladiator', 'modes', 'Gladiateur', 'Gagne 50 duels ou combats', c => c.wins >= 50, c => [c.wins, 50]),
  TI('warlord', 'modes', 'Seigneur de guerre', 'Gagne 200 duels ou combats', c => c.wins >= 200, c => [c.wins, 200]),
  TI('stake_win', 'modes', 'Voleur de cartes', 'Remporte un duel à la mise'),
  TI('tour_play', 'modes', 'Compétiteur', 'Dispute un tournoi'),
  TI('tour_champ', 'modes', 'Champion de tournoi', 'Termine 1er d\'un tournoi'),
  TI('quiz_perfect', 'modes', 'Sans faute', '5 / 5 au quiz du jour'),
  TI('quiz_champ', 'modes', 'Roi du quiz', 'Termine 1er du classement du quiz du jour'),
  TI('fusion_master', 'modes', 'Maître fusionneur', 'Amène 3 cartes au niveau de fusion maximum', c => c.lvl3 >= 3, c => [c.lvl3, 3]),
  TI('streak_7', 'modes', 'Fidèle', '7 jours de connexion d\'affilée', c => c.streak >= 7, c => [c.streak, 7]),
  TI('streak_30', 'modes', 'Inconditionnel', '30 jours de connexion d\'affilée', c => c.streak >= 30, c => [c.streak, 30]),
  TI('godpack', 'exploits', 'Touché par les dieux', 'Ouvre un GODPACK'),
  TI('shiny', 'exploits', 'Chasseur de shiny', 'Possède une carte shiny', c => c.shiny >= 1, c => [c.shiny, 1]),
  TI('legend3', 'exploits', 'Légendaire', 'Possède 3 cartes légendaires différentes', c => c.leg >= 3, c => [c.leg, 3]),
  TI('legend10', 'exploits', 'Panthéon', 'Possède 10 cartes légendaires différentes', c => c.leg >= 10, c => [c.leg, 10]),
  TI('ultra25', 'exploits', 'Élite', 'Possède 25 cartes ultra rares ou mieux', c => c.ultra >= 25, c => [c.ultra, 25]),
  TI('collector_100', 'exploits', 'Collectionneur', '100 cartes différentes', c => c.uniques >= 100, c => [c.uniques, 100]),
  TI('collector_500', 'exploits', 'Archiviste', '500 cartes différentes', c => c.uniques >= 500, c => [c.uniques, 500]),
  TI('collector_1000', 'exploits', 'Bibliothécaire d\'Alexandrie', '1 000 cartes différentes', c => c.uniques >= 1000, c => [c.uniques, 1000]),
  TI('album_1', 'exploits', 'Album complet', 'Complète un album thématique', c => c.albums >= 1, c => [c.albums, 1]),
  TI('album_5', 'exploits', 'Maître des albums', 'Complète 5 albums thématiques', c => c.albums >= 5, c => [c.albums, 5]),
  TI('album_15', 'exploits', 'Encyclopédiste', 'Complète 15 albums thématiques', c => c.albums >= 15, c => [c.albums, 15]),
  TI('packs_100', 'exploits', 'Ouvreur', 'Ouvre 100 paquets', c => c.packs >= 100, c => [c.packs, 100]),
  TI('packs_1000', 'exploits', 'Machine à boosters', 'Ouvre 1 000 paquets', c => c.packs >= 1000, c => [c.packs, 1000]),
  { id: 's1_champion', cat: 'saison', label: 'Champion de la saison 1', desc: 'Titre exclusif de la saison 1', season: true },
  { id: 's1_veteran', cat: 'saison', label: 'Vétéran de la saison 1', desc: 'Titre exclusif de la saison 1', season: true },
];
export const TITLE = Object.fromEntries(TITLES.map(t => [t.id, t]));
/** Accorde un titre (une seule fois). Renvoie vrai s'il vient d'être débloqué. */
export async function grantTitle(env, uid, id) {
  try {
    if (!uid || !TITLE[id]) return false;
    await ensureGameSchema(env);
    const r = await env.DB.prepare('INSERT INTO user_titles (user_id, tid, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(uid, id, Date.now()).run();
    return !!r.meta.changes;
  } catch (e) { console.error('grantTitle', e); return false; }
}
/** Débloque les titres qui dépendent des statistiques ; renvoie { owned: Set, added: [id] , ctx }. */
export async function syncTitles(env, uid) {
  await ensureGameSchema(env);
  const one = async (sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results[0];
  const [u, agg, owned, alb] = await Promise.all([
    one('SELECT duel_wins, packs_opened, daily_streak FROM users WHERE id = ?', uid),
    one('SELECT COUNT(*) uniques, COALESCE(SUM(CASE WHEN rar = 5 AND sh = 0 THEN 1 ELSE 0 END), 0) leg, COALESCE(SUM(CASE WHEN sh = 1 THEN 1 ELSE 0 END), 0) shiny, COALESCE(SUM(CASE WHEN lvl >= 3 THEN 1 ELSE 0 END), 0) lvl3, COALESCE(SUM(CASE WHEN rar >= 4 OR sh = 1 THEN 1 ELSE 0 END), 0) ultra FROM inventory WHERE user_id = ?', uid),
    env.DB.prepare('SELECT tid FROM user_titles WHERE user_id = ?').bind(uid).all(),
    one('SELECT COUNT(*) n FROM album_claims WHERE user_id = ?', uid),
  ]);
  const ctx = { wins: +(u?.duel_wins || 0), packs: +(u?.packs_opened || 0), streak: +(u?.daily_streak || 0), uniques: +agg.uniques, leg: +agg.leg, shiny: +agg.shiny, lvl3: +agg.lvl3, ultra: +agg.ultra, albums: +(alb?.n || 0) };
  const have = new Set(owned.results.map(r => r.tid)), added = [];
  for (const t of TITLES) if (t.calc && !have.has(t.id) && t.calc(ctx)) added.push(t.id);
  if (added.length) { await env.DB.batch(added.map(id => env.DB.prepare('INSERT INTO user_titles (user_id, tid, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(uid, id, Date.now()))); added.forEach(id => have.add(id)); }
  return { owned: have, added, ctx };
}

/** Étape d'un tournoi à 4 ou 8 joueurs : tour 1 = tout le monde ; ensuite les gagnants et les perdants de chaque groupe se séparent (W / L) jusqu'à des matchs de classement. */
export function tourLabel(n, round, path) {
  const rounds = Math.log2(n);
  if (round === rounds) { const idx = [...path].reduce((t, c) => t * 2 + (c === 'L' ? 1 : 0), 0); return idx === 0 ? 'Finale' : `Match pour la ${1 + 2 * idx}ᵉ place`; }
  if (round === 1) return n === 4 ? 'Demi-finale' : 'Quart de finale';
  return path.startsWith('W') ? 'Demi-finale' : 'Demi-finale de classement';
}
