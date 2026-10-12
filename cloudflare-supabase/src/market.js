// Marché animé : chaque jour, deux cartes légendaires tirées au hasard (parmi celles qui n'existent pas encore) sont vendues aux enchères pendant 12 h par le « Marché ».
// L'argent payé disparaît du jeu (le Marché ne touche rien) ; une légendaire invendue retourne dans la réserve. Actif seulement avec les légendaires uniques.
import { claimLegend, uniqueOn } from './unique.js';
import { parisTs } from './events.js';

export const MARKET = { seller: 'Marché', hours: 12, slots: [9, 21], start: 300 };   // lots à 9 h et 21 h (Paris), 12 h chacun : un lot est toujours ouvert

export function installMarket(d) {
  const { one, all, run, st, now, dayKey, getMeta, entryAt, insertCard, stats, enrich, notify, ensureGameSchema, assetOrigin } = d;
  let sellerId = null; const seen = new Set();                                   // créneaux déjà traités par cette instance (évite une requête à chaque appel)
  /** Compte système qui met les lots en vente (impossible de s'y connecter, jamais payé). */
  async function seller(env) {
    if (sellerId) return sellerId;
    await run(env, "INSERT INTO users (name, salt, hash, coins, pack_stock, pack_ts, created, is_bot) VALUES (?,?,?,?,?,?,?,1) ON CONFLICT DO NOTHING", MARKET.seller, 'bot', '!', 0, 0, 0, now());
    return (sellerId = (await one(env, 'SELECT id FROM users WHERE name = ?', MARKET.seller)).id);
  }
  /** Crée les lots du jour dont l'heure est passée (au plus un par créneau, jamais deux fois). Renvoie le nombre de lots créés. */
  async function tick(env, ctx, origin = assetOrigin) {
    if (!(await uniqueOn(env))) return 0;
    await ensureGameSchema(env);
    const t = now(), day = dayKey(t), yday = dayKey(t - 86400000);
    let made = 0;
    for (const ds of [yday, day]) for (const h of MARKET.slots) {
      const start = parisTs(ds, h), end = start + MARKET.hours * 3600000;
      if (t < start || t >= end) continue;                                      // seulement le lot dont la fenêtre est ouverte maintenant
      if (seen.has(`${ds}:${h}`)) continue; seen.add(`${ds}:${h}`);
      const first = await run(env, 'INSERT INTO event_claims (key, user_id, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', `mkt:${ds}:${h}`, 0, t);
      if (!first.meta.changes) continue;
      const { ranges } = await getMeta(env, origin), [a, b] = ranges.legendary;
      let lot = null;
      for (let tries = 0; !lot && tries < 60; tries++) {
        const e = await entryAt(env, origin, a + Math.floor(Math.random() * (b - a)));
        if (await claimLegend(env, e[0])) lot = e;
      }
      if (!lot) continue;
      const [id, title, views] = lot, sid = await seller(env);
      await env.DB.batch([
        insertCard(env, { id, title, views, rarity: 'legendary', shiny: 0, ...stats(title, 'legendary', false) }),
        st(env, 'INSERT INTO auctions (seller_id, card_id, start_price, ends_at) VALUES (?,?,?,?)', sid, id, MARKET.start, end),
      ]);
      ctx?.waitUntil(enrich(env, [id]).catch(() => {}));
      notify(env, ctx, { t: 'notify', msg: `🏷️ Nouvelle légendaire aux enchères : « ${title} » (mise de départ ${MARKET.start}, ${MARKET.hours} h) !` });
      notify(env, ctx, { t: 'refresh', what: 'auctions' });
      made++;
    }
    return made;
  }
  return { tick, seller };
}
