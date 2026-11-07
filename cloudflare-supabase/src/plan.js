// Mode communiste : les 12 paliers du Plan quinquennal et leurs récompenses.
// Les paliers se calculent sur le total de wikiroubles GAGNÉS depuis le début de l'événement (les 500 de départ ne comptent pas).
// L'économie en wikiroubles n'existe pas encore : en attendant, l'administrateur dispose d'un bouton de démonstration qui ajoute des wikiroubles gagnés.
// Récompenses : paquets, wikiroubles, titres de profil, cadres, souvenirs (cartes à garder après l'événement) et, au palier 6, le thème rouge conservé.
export const PLAN_MILESTONES = [
  { id: 1, at: 150, name: 'Camarade', text: 'Première distribution : le Parti note votre nom, avec une faute.', packs: 1, wr: 0, title: 'plan_1' },
  { id: 2, at: 500, name: 'Premier souvenir', text: 'Une fiche rare sort des archives. Elle est à vous pour toujours, même après le Plan.', packs: 0, wr: 100, perk: 'souvenir_1' },
  { id: 3, at: 900, name: 'Cadre de l\'Étoile rouge', text: 'Un cadre rouge pour votre profil : l\'étoile brille, le budget aussi.', packs: 2, wr: 0, perk: 'frame_star' },
  { id: 4, at: 1400, name: 'Brigadier', text: 'Vous encadrez maintenant d\'autres camarades, qui n\'ont rien demandé.', packs: 0, wr: 150, title: 'plan_2' },
  { id: 5, at: 2000, name: 'Colis de ravitaillement', text: 'Trois colis, une saucisse et une note d\'excuses.', packs: 3, wr: 0 },
  { id: 6, at: 2600, name: 'Héros du Plan', text: 'Le Parti vous laisse le drapeau : le thème rouge « Camarade » reste dans vos Réglages après l\'événement.', packs: 0, wr: 200, title: 'plan_3', perk: 'theme_urss' },
  { id: 7, at: 3200, name: 'Cadre Faucille et Marteau', text: 'Un deuxième cadre, plus lourd. Il ne se porte pas à la légère.', packs: 0, wr: 200, perk: 'frame_hammer' },
  { id: 8, at: 3800, name: 'Stakhanoviste', text: 'Vous avez dépassé la norme de 300 %. Le Parti relève la norme.', packs: 3, wr: 0, title: 'plan_4' },
  { id: 9, at: 4400, name: 'Prime du Politburo', text: 'Une enveloppe épaisse, prise sur la prime de quelqu\'un d\'autre.', packs: 0, wr: 300 },
  { id: 10, at: 4900, name: 'Cadre du Politburo', text: 'Cadre doré. Il est en plastique, mais la dorure est réglementaire.', packs: 4, wr: 0, perk: 'frame_gold' },
  { id: 11, at: 5400, name: 'Second souvenir', text: 'Une carte légendaire des archives, rangée à part pour vous. On ne pose pas de questions.', packs: 0, wr: 0, title: 'plan_5', perk: 'souvenir_2' },
  { id: 12, at: 6000, name: 'Héros de l\'Union soviétique', text: 'Le Plan est accompli. Vous entrez dans les manuels, au chapitre des remerciements.', packs: 5, wr: 500, title: 'plan_6' },
];
export const PLAN_TITLES = [
  { id: 'plan_1', label: 'Camarade', desc: 'Plan quinquennal : atteins le palier 1' },
  { id: 'plan_2', label: 'Brigadier', desc: 'Plan quinquennal : atteins le palier 4' },
  { id: 'plan_3', label: 'Héros du Plan', desc: 'Plan quinquennal : atteins le palier 6' },
  { id: 'plan_4', label: 'Stakhanoviste', desc: 'Plan quinquennal : atteins le palier 8' },
  { id: 'plan_5', label: 'Commissaire du peuple', desc: 'Plan quinquennal : atteins le palier 11' },
  { id: 'plan_6', label: 'Héros de l\'Union soviétique', desc: 'Plan quinquennal : atteins le palier 12' },
];
export const PLAN_TABLES = [
  'CREATE TABLE IF NOT EXISTS plan_progress (user_id BIGINT PRIMARY KEY, earned BIGINT NOT NULL DEFAULT 0, wr BIGINT NOT NULL DEFAULT 0, claimed TEXT NOT NULL DEFAULT \'[]\', perks TEXT NOT NULL DEFAULT \'[]\')',
  'ALTER TABLE plan_progress ENABLE ROW LEVEL SECURITY',
];

export function installPlan(d) {
  const { route, bad, one, run, st, ensureGameSchema, grantTitle } = d;
  const list = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  async function rowOf(env, uid) {
    await ensureGameSchema(env);
    let r = await one(env, 'SELECT * FROM plan_progress WHERE user_id = ?', uid);
    if (!r) { await run(env, "INSERT INTO plan_progress (user_id) VALUES (?) ON CONFLICT DO NOTHING", uid); r = await one(env, 'SELECT * FROM plan_progress WHERE user_id = ?', uid); }
    return r;
  }
  const view = r => ({
    milestones: PLAN_MILESTONES.map(m => ({ ...m, title: m.title ? PLAN_TITLES.find(t => t.id === m.title)?.label : null })),
    earned: +r.earned, wr: +r.wr, claimed: list(r.claimed), perks: list(r.perks),
    totals: { packs: PLAN_MILESTONES.reduce((t, m) => t + m.packs, 0), wr: PLAN_MILESTONES.reduce((t, m) => t + m.wr, 0), max: PLAN_MILESTONES[PLAN_MILESTONES.length - 1].at },
  });
  const gate = user => { if (!user.is_admin) bad('Le Plan quinquennal est en aperçu : réservé à l\'administrateur pour l\'instant', 403); };

  route('GET', '/api/plan', async ({ env, user }) => { gate(user); return view(await rowOf(env, user.id)); });
  // démonstration : ajoute des wikiroubles « gagnés » (l'économie du mode n'existe pas encore)
  route('POST', '/api/plan/earn', async ({ env, user, body }) => {
    gate(user);
    const n = Math.floor(+body.amount); if (!Number.isFinite(n) || n < 1 || n > 2000) bad('Montant invalide (1 à 2000)', 400);
    await rowOf(env, user.id);
    await run(env, 'UPDATE plan_progress SET earned = earned + ? WHERE user_id = ?', n, user.id);
    return view(await rowOf(env, user.id));
  });
  route('POST', '/api/plan/reset', async ({ env, user }) => {
    gate(user); await rowOf(env, user.id);
    await run(env, "UPDATE plan_progress SET earned = 0, wr = 0, claimed = '[]', perks = '[]' WHERE user_id = ?", user.id);
    return view(await rowOf(env, user.id));
  });
  route('POST', '/api/plan/claim', async ({ env, user, body }) => {
    gate(user);
    const m = PLAN_MILESTONES.find(x => x.id === Math.floor(+body.id)); if (!m) bad('Palier inconnu', 404);
    const r = await rowOf(env, user.id), claimed = list(r.claimed);
    if (claimed.includes(m.id)) bad('Récompense déjà récupérée', 409);
    if (+r.earned < m.at) bad('Pas assez de wikiroubles gagnés pour ce palier', 400);
    const next = JSON.stringify([...claimed, m.id].sort((a, b) => a - b));
    const perks = m.perk ? JSON.stringify([...new Set([...list(r.perks), m.perk])]) : r.perks;
    const upd = await run(env, 'UPDATE plan_progress SET claimed = ?, wr = wr + ?, perks = ? WHERE user_id = ? AND claimed = ?', next, m.wr, perks, user.id, r.claimed);   // une seule fois, même depuis deux appareils
    if (!upd.meta.changes) bad('Récompense déjà récupérée', 409);
    if (m.packs) await env.DB.batch([st(env, 'UPDATE users SET pack_stock = pack_stock + ? WHERE id = ?', m.packs, user.id)]);
    const titleNew = m.title ? await grantTitle(env, user.id, m.title) : false;
    return { ok: true, id: m.id, packs: m.packs, wr: m.wr, title: m.title ? PLAN_TITLES.find(t => t.id === m.title).label : null, titleNew, perk: m.perk ?? null };
  });
  return { PLAN_MILESTONES };
}
