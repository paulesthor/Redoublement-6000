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
    'ALTER TABLE daily_quiz ADD COLUMN IF NOT EXISTS winner BIGINT',
    'ALTER TABLE daily_quiz ADD COLUMN IF NOT EXISTS awarded BIGINT',
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
