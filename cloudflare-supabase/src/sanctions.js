// Sanctions : gains de pièces suspendus et épargne gelée pendant N jours pour certains pseudos.
// - Dépenses interdites : routes fermées (SPEND_ROUTE dans index.js) et le déclencheur refuse toute baisse de pièces.
// - Gains suspendus : un déclencheur PostgreSQL sur users met de côté (table coin_freeze.held) toute augmentation de pièces, quelle que soit son origine
//   (quêtes, ventes, duels, banque, dividendes…) ; Les pièces mises de côté sont rendues à la fin de la sanction.
// - Épargne gelée : ni dépôt, ni retrait, ni intérêts jusqu'à la fin.
// La sanction est posée une seule fois (au premier passage du joueur ou de la tâche planifiée après la mise en ligne), jamais renouvelée.
import { ensureGameSchema } from './game.js';
import { st } from './util.js';

const DAY = 86400000;
/** Pseudos sanctionnés (comparés sans majuscules, accents ni séparateurs) → durée en jours. */
export const SANCTIONS = {};   // aucune sanction de pièces en cours (ex. { pseudo: { days: 5 } }) ; le blocage du Plus ou moins est dans economy.js (HILO_BLOCKED)
export const SANCTION_MSG = 'T\'avais qu\'à pas tricher gros sac à merde.';
/** Malus de chance (jamais annoncé aux joueurs) : légendaires et godpack divisés dans les paquets normaux et les paquets du jour. */
export const HANDICAPS = {};   // aucun malus de chance en cours (ex. { pseudo: { legend: 3, god: 3 } })
export const normName = n => String(n || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

export const handicapOf = u => HANDICAPS[normName(u?.name)] || null;

export function installSanctions(d) {
  const { one, all, run, now } = d;
  let cache = { t: 0, map: new Map() };
  /** Sanctions en cours, relues au plus une fois par minute : Map(joueur → fin de sanction en ms). */
  async function table(env) {
    if (now() - cache.t > 60000) {
      await ensureGameSchema(env);
      const rows = await all(env, 'SELECT user_id, until FROM coin_freeze');
      cache = { t: now(), map: new Map(rows.map(r => [r.user_id, +r.until])) };
    }
    return cache.map;
  }
  /** Fin de la sanction du joueur (ms), ou 0 s'il n'est pas sanctionné en ce moment. */
  async function until(env, uid) { const u = (await table(env)).get(uid) || 0; return u > now() ? u : 0; }
  /** Pose la sanction (une seule fois) si le pseudo est dans la liste, puis renvoie la fin de sanction en cours (ou 0). */
  async function check(env, user) {
    const rule = SANCTIONS[normName(user?.name)];
    if (!rule) return 0;
    await ensureGameSchema(env);
    const end = now() + rule.days * DAY;
    const ins = await run(env, 'INSERT INTO coin_freeze (user_id, until, held, ts) VALUES (?,?,0,?) ON CONFLICT (user_id) DO NOTHING', user.id, end, now());
    if (ins.meta.changes) {                                                     // épargne : aucun intérêt avant la fin (le calcul part du jour de fin)
      await run(env, 'UPDATE savings SET acc_day = ? WHERE user_id = ?', Math.floor(end / DAY), user.id).catch(() => {});
      cache.t = 0;
    }
    return until(env, user.id);
  }
  /** Rend les pièces mises de côté quand la sanction est terminée. */
  async function release(env) {
    const rows = await all(env, 'SELECT user_id, held FROM coin_freeze WHERE until <= ? AND held > 0', now());
    for (const r of rows) {                                                      // une seule transaction : pièces rendues puis compteur remis à zéro (appelé par la seule tâche planifiée)
      await env.DB.batch([
        st(env, `UPDATE users SET coins = coins + COALESCE((SELECT held FROM coin_freeze WHERE user_id = ? AND until <= ?), 0) WHERE id = ?`, r.user_id, now(), r.user_id),
        st(env, 'UPDATE coin_freeze SET held = 0 WHERE user_id = ? AND until <= ?', r.user_id, now()),
      ]);
    }
    cache.t = 0; return rows.length;                                            // le tableau des sanctions en cours sera relu
  }
  /** Opération unique : lève toutes les sanctions de pièces en cours (gains mis de côté rendus, épargne dégelée, dépenses de nouveau possibles). */
  async function lift(env) {
    await ensureGameSchema(env);
    const first = await run(env, 'INSERT INTO event_claims (key, user_id, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', 'sanction-lift-1', 0, now());
    if (!first.meta.changes) return 0;
    const rows = await all(env, 'SELECT user_id FROM coin_freeze WHERE until > ?', now());
    await run(env, 'UPDATE coin_freeze SET until = ? WHERE until > ?', now() - 5000, now());
    for (const r of rows) await run(env, 'UPDATE savings SET acc_day = ? WHERE user_id = ?', Math.floor(now() / DAY), r.user_id).catch(() => {});   // les intérêts reprennent aujourd'hui
    cache.t = 0;
    await release(env);
    return rows.length;
  }
  /** Tâche planifiée : pose les sanctions des pseudos listés (même s'ils ne se connectent pas) et libère celles qui sont finies. */
  async function tick(env) {
    await ensureGameSchema(env);
    const users = await all(env, 'SELECT id, name FROM users WHERE is_bot = 0');
    for (const u of users) if (SANCTIONS[normName(u.name)]) await check(env, u);
    return release(env);
  }
  return { until, check, release, tick, lift, heldOf: async (env, uid) => +((await one(env, 'SELECT held FROM coin_freeze WHERE user_id = ?', uid))?.held || 0) };
}
