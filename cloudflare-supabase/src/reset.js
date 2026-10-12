// Remise à zéro annoncée : chaque joueur propose jusqu'à 3 cartes légendaires (une seule sera tirée au sort et conservée, avec un halo « bêta »).
// Ce module ne gère que l'annonce et le recueil des choix ; l'opération de remise à zéro elle-même est séparée.
export const RESET_AT = Date.UTC(2026, 9, 13, 22, 0, 0);   // mercredi 14 octobre 2026, 00 h 00 (heure de Paris, UTC+2)
export const RESET_PICKS = 3;

export function installReset(d) {
  const { route, bad, one, all, run, now, ensureGameSchema, placeholders } = d;
  /** Cartes légendaires (hors shiny) du joueur, les plus populaires d'abord. */
  const legendaries = (env, uid) => all(env, 'SELECT c.id, c.title, c.image, c.views FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ? AND i.rar = 5 AND i.sh = 0 ORDER BY c.views DESC, c.id LIMIT 400', uid);
  const picksOf = async (env, uid) => { const r = await one(env, 'SELECT picks FROM reset_choices WHERE user_id = ?', uid); try { return r ? JSON.parse(r.picks) : null; } catch { return null; } };
  route('GET', '/api/reset', async ({ env, user }) => {
    await ensureGameSchema(env);
    const [cards, picks] = await Promise.all([legendaries(env, user.id), picksOf(env, user.id)]);
    return { at: RESET_AT, locked: now() >= RESET_AT, max: RESET_PICKS, picks: picks ?? [], chosen: picks !== null, legendaries: cards };
  });
  route('POST', '/api/reset/choose', async ({ env, user, body }) => {
    await ensureGameSchema(env);
    if (now() >= RESET_AT) bad('Les choix sont fermés : la remise à zéro est en cours', 403);
    const ids = [...new Set((Array.isArray(body.cards) ? body.cards : []).map(x => Math.floor(+x)).filter(x => Number.isFinite(x) && x > 0))];
    if (ids.length > RESET_PICKS) bad(`${RESET_PICKS} cartes au maximum`);
    const owned = new Set((await legendaries(env, user.id)).map(c => c.id));
    if (!ids.length && owned.size) bad('Choisis au moins une carte (ou laisse faire le hasard en ne validant rien)');
    if (ids.some(id => !owned.has(id))) bad('Seules tes cartes légendaires (non shiny) peuvent être proposées');
    await run(env, 'INSERT INTO reset_choices (user_id, picks, ts) VALUES (?,?,?) ON CONFLICT (user_id) DO UPDATE SET picks = excluded.picks, ts = excluded.ts', user.id, JSON.stringify(ids), now());
    return { ok: true, picks: ids };
  });
  return { at: RESET_AT, chosen: async (env, uid) => !!(await one(env, 'SELECT 1 x FROM reset_choices WHERE user_id = ?', uid)) };
}
