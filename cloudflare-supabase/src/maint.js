// Entretien de la base (tâche planifiée) : garde la taille de la base sous la limite gratuite.
//  - petites purges regroupées en UN seul appel (journal, empreintes de connexion, notifications, compteurs anti-abus, statistiques) ;
//  - ramasse-miettes des cartes : supprime, par lots de 1 000 au plus une fois par heure, les cartes que PERSONNE n'utilise (ni collection, ni vues, ni enchères, ni échanges, ni ventes, ni favoris,
//    ni alertes, ni réserve, ni paquets préparés, ni expéditions). Aucune carte d'événement. Le jeu recrée une carte à l'instant où elle est tirée, rien n'est perdu pour les joueurs.
import { one, all, run, st } from './util.js';
import { pruneLogs } from './logs.js';
import { ensureGameSchema } from './game.js';

const DAY = 86400000;
export const GC_BATCH = 1000;
export const gcEveryMs = () => globalThis.__GC_MS ?? 3600000;

export async function purgeSmall(env, now = Date.now()) {
  await ensureGameSchema(env); await pruneLogs(env);   // le journal garde 14 jours
  const day = new Date(now - 14 * DAY).toISOString().slice(0, 10);
  await env.DB.batch([
    st(env, "DELETE FROM event_progress WHERE key LIKE 'ip:%' AND n < ?", Math.floor((now - 90 * DAY) / 1000)),
    st(env, 'DELETE FROM push_msgs WHERE ts < ?', now - 3 * DAY),
    st(env, 'DELETE FROM login_fails WHERE first < ?', now - 2 * DAY),
    st(env, 'DELETE FROM usage WHERE day < ?', day),
    st(env, 'DELETE FROM hits WHERE id < (SELECT COALESCE(MAX(id), 0) - 500 FROM hits)'),
  ]);
}

/** Un lot du ramasse-miettes des cartes (au plus une fois par heure). Renvoie le nombre de cartes supprimées. */
export async function gcCards(env, now = Date.now()) {
  const last = +((await one(env, "SELECT value FROM settings WHERE key = 'cards_gc_ts'"))?.value || 0);
  if (now - last < gcEveryMs()) return 0;
  await run(env, "INSERT INTO settings (key, value) VALUES ('cards_gc_ts', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", String(now));
  const cursor = +((await one(env, "SELECT value FROM settings WHERE key = 'cards_gc_cursor'"))?.value || 0);
  const gone = await all(env, `DELETE FROM cards WHERE id IN (
      SELECT c.id FROM cards c WHERE c.id > ? AND c.id < 200000000
        AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.card_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM card_seen s WHERE s.card_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM auctions a WHERE a.card_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM trades t WHERE t.offer_card = c.id OR t.want_card = c.id)
        AND NOT EXISTS (SELECT 1 FROM sales v WHERE v.card_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM favorites f WHERE f.card_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM price_alerts p WHERE p.card_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM wanted w WHERE w.card_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM legend_taken l WHERE l.card_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM reserve r WHERE r.id = c.id)
        AND NOT EXISTS (SELECT 1 FROM prepared pr WHERE pr.cards LIKE '%"id":' || c.id || ',%')
        AND NOT EXISTS (SELECT 1 FROM expeditions e WHERE e.cards LIKE '%"id":' || c.id || ',%')
      ORDER BY c.id LIMIT ${GC_BATCH}) RETURNING id`, cursor);
  const next = gone.length < GC_BATCH ? 0 : Math.max(...gone.map(r => +r.id));   // fin de la table : on repart du début au prochain passage
  await run(env, "INSERT INTO settings (key, value) VALUES ('cards_gc_cursor', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", String(next));
  return gone.length;
}

export async function maintenance(env) {
  const out = { purge: false, cards: 0 };
  try { await purgeSmall(env); out.purge = true; } catch (e) { console.error('purge', e); }
  try { out.cards = await gcCards(env); } catch (e) { console.error('ramasse-miettes des cartes', e); }
  return out;
}
