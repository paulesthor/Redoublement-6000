// Camp du Goulag (jeu de gestion satirique) : paliers de progression et récompenses pour le mode classique.
// La progression elle-même vit sur le téléphone ; le serveur borne les primes : une seule fois chacune, jamais avant un délai minimum depuis le début (même un joueur parfait ne peut pas aller plus vite).
export const MILESTONES = [
  { id: 1, p: 0.5, minH: 1, name: 'Contremaître stagiaire', text: 'Le Parti vous prête un sifflet. Il siffle, mais pas dans le bon sens.', coins: 40, packs: 0, title: 'camp_1' },
  { id: 2, p: 1, minH: 4, name: 'Chef de brigade', text: 'Premier plan accompli. On vous remet une médaille, puis on vous la reprend pour l\'inventaire.', coins: 100, packs: 1, title: 'camp_2' },
  { id: 3, p: 1.5, minH: 8, name: 'Prime de rendement', text: 'Une enveloppe du ministère. Elle contient un mot gentil et un peu d\'argent.', coins: 80, packs: 0 },
  { id: 4, p: 2, minH: 12, name: 'Directeur adjoint', text: 'Deuxième plan accompli. Le camp est transféré, vous aussi, avec vos bagages et votre dossier (qui est arrivé avant vous).', coins: 200, packs: 0, title: 'camp_3' },
  { id: 5, p: 2.5, minH: 17, name: 'Colis du Parti', text: 'Deux paquets, trois blagues, et une lettre d\'excuses pour le retard.', coins: 120, packs: 2 },
  { id: 6, p: 3, minH: 22, name: 'Directeur du camp', text: 'Troisième plan accompli. On vous donne un bureau, un tampon et un nom sur la porte (mal orthographié).', coins: 250, packs: 0, title: 'camp_4' },
  { id: 7, p: 3.5, minH: 28, name: 'Prime de la délégation', text: 'Les étrangers ont tout aimé et rien compris. Le Parti paie.', coins: 180, packs: 3 },
  { id: 8, p: 4, minH: 34, name: 'Commissaire du peuple', text: 'Quatrième plan accompli. Vous êtes désormais autorisé à tamponner les tampons des autres.', coins: 350, packs: 0, title: 'camp_5' },
  { id: 9, p: 5, minH: 46, name: 'Grande médaille du Politburo', text: 'Cinquième plan accompli. Elle est en chocolat, mais le Politburo a promis qu\'elle était en or.', coins: 500, packs: 4 },
  { id: 10, p: 6, minH: 60, name: 'Héros du Travail Socialiste', text: 'Le camp est complet, le plan est rempli, le froid est reconnaissant. Vous entrez dans l\'Histoire, en note de bas de page.', coins: 800, packs: 5, title: 'camp_6' },
];
export const CAMP_TITLES = [
  { id: 'camp_1', label: 'Contremaître stagiaire', desc: 'Camp du Goulag : atteins le palier 1' },
  { id: 'camp_2', label: 'Chef de brigade', desc: 'Camp du Goulag : accomplis le plan n° 1' },
  { id: 'camp_3', label: 'Directeur adjoint', desc: 'Camp du Goulag : accomplis le plan n° 2' },
  { id: 'camp_4', label: 'Directeur du camp', desc: 'Camp du Goulag : accomplis le plan n° 3' },
  { id: 'camp_5', label: 'Commissaire du peuple', desc: 'Camp du Goulag : accomplis le plan n° 4' },
  { id: 'camp_6', label: 'Héros du Travail Socialiste', desc: 'Camp du Goulag : termine toute l\'édition' },
];
export const CAMP_TABLES = [
  'CREATE TABLE IF NOT EXISTS camp_progress (user_id BIGINT PRIMARY KEY, start BIGINT NOT NULL, claimed TEXT NOT NULL DEFAULT \'[]\', perks TEXT NOT NULL DEFAULT \'[]\')',
  'ALTER TABLE camp_progress ENABLE ROW LEVEL SECURITY',
];

export function installCamp(d) {
  const { route, bad, one, run, st, now, ensureGameSchema, grantTitle } = d;
  const list = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  async function rowOf(env, uid) {
    await ensureGameSchema(env);
    let r = await one(env, 'SELECT * FROM camp_progress WHERE user_id = ?', uid);
    if (!r) { await run(env, "INSERT INTO camp_progress (user_id, start, claimed, perks) VALUES (?,?,'[]','[]') ON CONFLICT DO NOTHING", uid, now()); r = await one(env, 'SELECT * FROM camp_progress WHERE user_id = ?', uid); }
    return r;
  }
  const view = r => ({ milestones: MILESTONES.map(m => ({ id: m.id, p: m.p, minH: m.minH, name: m.name, text: m.text, coins: m.coins, packs: m.packs, title: m.title ? CAMP_TITLES.find(t => t.id === m.title)?.label : null, perk: m.perk ?? null })),
    claimed: list(r.claimed), perks: list(r.perks), hours: Math.max(0, (now() - +r.start) / 3600000), totalCoins: MILESTONES.reduce((t, m) => t + m.coins, 0), totalPacks: MILESTONES.reduce((t, m) => t + m.packs, 0) });
  const gate = user => { if (!user.is_admin) bad('Le camp est en aperçu : réservé à l\'administrateur pour l\'instant', 403); };

  route('GET', '/api/camp', async ({ env, user }) => { gate(user); return view(await rowOf(env, user.id)); });
  route('POST', '/api/camp/claim', async ({ env, user, body }) => {
    gate(user);
    const m = MILESTONES.find(x => x.id === Math.floor(+body.id)); if (!m) bad('Palier inconnu', 404);
    const r = await rowOf(env, user.id), claimed = list(r.claimed);
    if (claimed.includes(m.id)) bad('Prime déjà récupérée', 409);
    const p = +body.p; if (!Number.isFinite(p) || p < m.p) bad('Progression insuffisante pour ce palier', 400);
    const hours = (now() - +r.start) / 3600000; if (hours < m.minH) bad(`Le Parti exige un délai : encore ${Math.ceil((m.minH - hours) * 60)} min avant cette prime`, 400);
    const next = JSON.stringify([...claimed, m.id].sort((a, b) => a - b));
    const upd = await run(env, 'UPDATE camp_progress SET claimed = ? WHERE user_id = ? AND claimed = ?', next, user.id, r.claimed);      // une seule fois, même si deux appareils réclament en même temps
    if (!upd.meta.changes) bad('Prime déjà récupérée', 409);
    const ops = [];
    if (m.coins || m.packs) ops.push(st(env, 'UPDATE users SET coins = coins + ?, pack_stock = pack_stock + ? WHERE id = ?', m.coins, m.packs, user.id));
    if (m.perk) ops.push(st(env, 'UPDATE camp_progress SET perks = ? WHERE user_id = ?', JSON.stringify([...new Set([...list(r.perks), m.perk])]), user.id));
    if (ops.length) await env.DB.batch(ops);
    const title = m.title ? await grantTitle(env, user.id, m.title) : false;
    return { ok: true, id: m.id, coins: m.coins, packs: m.packs, title: m.title ? CAMP_TITLES.find(t => t.id === m.title).label : null, titleNew: title, perk: m.perk ?? null };
  });
  return { MILESTONES };
}
