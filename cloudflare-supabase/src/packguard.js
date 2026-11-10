// Garde-fou des ouvertures de paquets : un paquet (ou des pièces) pris au début d'une ouverture ne peut plus se perdre.
// Avant de prendre le paquet, un « marqueur » est posé dans la MÊME transaction (table event_progress, clé « po:<type>:<secondes>:<hasard> ») ; il est effacé quand l'ouverture est terminée.
// Si l'ouverture échoue et que le remboursement échoue lui aussi (limite d'appels atteinte, Worker interrompu, base injoignable), le marqueur reste : il est remboursé plus tard,
// par la tâche planifiée et à la prochaine ouverture de l'appli du joueur. Un marqueur n'est remboursé qu'une fois (verrouillé pendant l'opération).
export const GUARD_AGE_S = 150;       // un marqueur plus vieux que 2 min 30 s est une ouverture abandonnée
const REFUND = {                      // type -> requête de remboursement (le premier ? est la valeur, le second le joueur)
  o: 'UPDATE users SET pack_stock = pack_stock + 1 WHERE id = ?1 AND EXISTS (SELECT 1 FROM event_progress WHERE key = ?2 AND user_id = ?1 FOR UPDATE)',
  c: 'UPDATE plan_progress SET packs = packs + 1 WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM event_progress WHERE key = ?2 AND user_id = ?1 FOR UPDATE)',
  b: 'UPDATE users SET coins = coins + ?3 WHERE id = ?1 AND EXISTS (SELECT 1 FROM event_progress WHERE key = ?2 AND user_id = ?1 FOR UPDATE)',
};
export function installPackGuard(d) {
  const { st, run, all, now, ensureGameSchema, randomHex } = d;
  const mark = (type, extra = '') => `po:${type}${extra}:${Math.floor(now() / 1000)}:${randomHex(4)}`;
  const priceOf = key => +(/^po:b(\d+):/.exec(key)?.[1] || 0);
  const typeOf = key => key.split(':')[1][0];
  /** Prend le paquet : marqueur + prise dans une transaction. Renvoie { ok, key } ; ok = false si la prise a été refusée (plus de stock). */
  async function take(env, uid, claimStmt, type, extra = '') {
    await ensureGameSchema(env);
    const key = mark(type, extra);
    const res = await env.DB.batch([st(env, 'INSERT INTO event_progress (key, user_id, n) VALUES (?,?,?)', key, uid, Math.floor(now() / 1000)), claimStmt]);
    if (!res[1].meta.changes) { await run(env, 'DELETE FROM event_progress WHERE key = ? AND user_id = ?', key, uid).catch(() => {}); return { ok: false, key }; }
    return { ok: true, key };
  }
  /** Ouverture réussie : le marqueur disparaît (rien à rembourser). */
  const release = (env, uid, key) => run(env, 'DELETE FROM event_progress WHERE key = ? AND user_id = ?', key, uid).catch(() => {});
  const stmtFor = (env, uid, key) => st(env, REFUND[typeOf(key)], uid, key, priceOf(key));
  /** Ouverture échouée : remboursement + effacement du marqueur dans une seule transaction (jamais l'un sans l'autre). Si cela échoue aussi, le rattrapage s'en charge. */
  const refund = (env, uid, key) => env.DB.batch([stmtFor(env, uid, key), st(env, 'DELETE FROM event_progress WHERE key = ? AND user_id = ?', key, uid)]).catch(e => { console.error('remboursement différé', e?.message); });
  /** Rattrapage : rembourse les ouvertures abandonnées (d'un joueur, ou de tous si uid est omis). */
  async function repair(env, uid = null) {
    const cut = Math.floor(now() / 1000) - GUARD_AGE_S;
    const rows = await all(env, `SELECT key, user_id FROM event_progress WHERE key LIKE 'po:%' AND n < ?${uid ? ' AND user_id = ?' : ''} LIMIT 30`, ...(uid ? [cut, uid] : [cut]));
    for (const r of rows) {
      if (!REFUND[typeOf(r.key)]) { await run(env, 'DELETE FROM event_progress WHERE key = ? AND user_id = ?', r.key, r.user_id).catch(() => {}); continue; }
      await refund(env, +r.user_id, r.key);
    }
    return rows.length;
  }
  return { take, release, refund, repair };
}
