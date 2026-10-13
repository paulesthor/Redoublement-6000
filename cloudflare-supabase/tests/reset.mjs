// Annonce de la remise à zéro : choix de 3 cartes légendaires, verrouillage à la date, pastille de l'accueil.
import './api.mjs';
const { call, settle, ok, DB, J, done, env } = globalThis.__T;
const { RESET_AT } = await import('../src/reset.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const clock0 = Date.now; Date.now = () => RESET_AT - 3600000;   // l'horloge réelle a dépassé la date : on se place une heure avant minuit
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
const [alice, bob] = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id);
const mkCard = async (id, title, rarity, views = 1000 + id) => { await q('INSERT INTO cards (id, title, views, rarity, atk, def, shiny, url) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING', id, title, views, rarity, 5, 5, id > 90000000 ? 1 : 0, 'u'); };
const give = async (uid, id, rar, sh = 0) => q('INSERT INTO inventory (user_id, card_id, qty, acquired, rar, sh, skey, nk, fav) VALUES (?,?,1,?,?,?,?,?,0) ON CONFLICT DO NOTHING', uid, id, Date.now(), rar, sh, rar * 1e9, 't' + id);
for (const [id, t, v] of [[7001, 'Légende A', 9000], [7002, 'Légende B', 8000], [7003, 'Légende C', 7000], [7004, 'Légende D', 6000]]) { await mkCard(id, t, 'legendary', v); await give(alice, id, 5); }
await mkCard(90007001, 'Légende A (shiny)', 'legendary'); await give(alice, 90007001, 5, 1);
await mkCard(7100, 'Commune', 'common'); await give(alice, 7100, 0); await give(bob, 7003, 5);
delete env.RESET;   // les tests des autres fichiers coupent l'annonce ; ici on la veut
[s, r] = await call(A, 'GET', '/api/reset'); ok('liste : mes légendaires non shiny, les plus populaires d\'abord', s === 200 && J(r.legendaries.map(c => c.id)) === '[7001,7002,7003,7004]' && r.max === 3 && r.chosen === false && r.locked === false, J(r));
[s, r] = await call(A, 'GET', '/api/me'); ok('/me : annonce, pastille de l\'accueil, pas encore choisi', r.reset?.chosen === false && r.reset.at === RESET_AT && r.ev.some(e => e.kind === 'reset'), J([r.reset, r.ev]));
[s, r] = await call(A, 'POST', '/api/reset/choose', { cards: [7001, 7002, 7003, 7004] }); ok('4 cartes : refusé', s === 400, J([s, r]));
[s, r] = await call(A, 'POST', '/api/reset/choose', { cards: [] }); ok('aucune carte alors qu\'on en possède : refusé', s === 400, J([s, r]));
[s, r] = await call(A, 'POST', '/api/reset/choose', { cards: [7001, 7100] }); ok('une carte non légendaire : refusée', s === 400, J([s, r]));
[s, r] = await call(A, 'POST', '/api/reset/choose', { cards: [90007001] }); ok('une carte shiny : refusée', s === 400, J([s, r]));
[s, r] = await call(A, 'POST', '/api/reset/choose', { cards: [7002, 7002, 7003] }); ok('choix enregistré (doublons ignorés)', s === 200 && J(r.picks) === '[7002,7003]', J([s, r]));
[s, r] = await call(B, 'POST', '/api/reset/choose', { cards: [7001] }); ok('la carte d\'un autre joueur : refusée', s === 400, J([s, r]));
[s, r] = await call(A, 'POST', '/api/reset/choose', { cards: [7001, 7002, 7004] }); ok('choix modifiable', s === 200);
[s, r] = await call(A, 'GET', '/api/reset'); ok('choix relu', r.chosen === true && J(r.picks) === '[7001,7002,7004]', J(r));
[s, r] = await call(A, 'GET', '/api/me'); ok('/me : choix fait', r.reset.chosen === true);
const none = await call(null, 'POST', '/api/register', { name: 'Carl', password: 'secret3' }); const C = none[1].token;
[s, r] = await call(C, 'POST', '/api/reset/choose', { cards: [] }); ok('sans légendaire : « rien à choisir » accepté', s === 200 && J(r.picks) === '[]', J([s, r]));
[s, r] = await call(null, 'GET', '/api/reset'); ok('connexion requise', s === 401);
const realNow = Date.now; Date.now = () => RESET_AT + 1000;
try {
  [s, r] = await call(A, 'POST', '/api/reset/choose', { cards: [7001] }); ok('après la date : choix fermés', s === 403, J([s, r]));
  [s, r] = await call(A, 'GET', '/api/me'); ok('après la date : plus d\'annonce ni de pastille', !r.reset && !r.ev.some(e => e.kind === 'reset'), J([r.reset, r.ev]));
  [s, r] = await call(A, 'GET', '/api/reset'); ok('après la date : verrouillé, choix conservés', r.locked === true && J(r.picks) === '[7001,7002,7004]', J(r));
} finally { Date.now = realNow; }
// maintenance : de minuit jusqu'à la fin de la remise à zéro (ou levée à la main), joueurs bloqués, administrateurs libres
await q('UPDATE users SET is_admin = 1 WHERE id = ?', alice); let tt = RESET_AT - 60000; Date.now = () => tt;
try {
  [s, r] = await call(B, 'GET', '/api/me'); ok('avant minuit : pas de maintenance', !r.maintenance && r.reset);
  tt = RESET_AT + 1000;
  [s, r] = await call(B, 'GET', '/api/me'); ok('après minuit : /me annonce la maintenance au joueur', s === 200 && r.maintenance === true, J(r.maintenance));
  [s, r] = await call(B, 'POST', '/api/packs/open', {}); ok('joueur : le jeu est bloqué (503 « Maintenance »)', s === 503 && /Maintenance/.test(r.error), J([s, r]));
  [s, r] = await call(B, 'GET', '/api/auctions'); ok('joueur : même les lectures sont bloquées', s === 503);
  [s] = await call(null, 'GET', '/api/version'); ok('la version reste lisible', s === 200);
  [s, r] = await call(A, 'GET', '/api/me'); ok('administrateur : bandeau seulement, jeu libre', s === 200 && r.maintenance === 'admin', J(r.maintenance));
  [s] = await call(A, 'GET', '/api/auctions'); ok('administrateur : peut jouer et préparer', s === 200);
  [s, r] = await call(A, 'POST', '/api/admin/maintenance', { off: true }); tt += 11000; [s, r] = await call(B, 'GET', '/api/me'); ok('maintenance levée à la main : le joueur rejoue', !r.maintenance && (await call(B, 'GET', '/api/auctions'))[0] === 200);
  await call(A, 'POST', '/api/admin/maintenance', { off: false }); tt += 11000; [s, r] = await call(B, 'GET', '/api/me'); ok('maintenance rétablie', r.maintenance === true);
  await q("INSERT INTO settings (key, value) VALUES ('reset_done', '1') ON CONFLICT (key) DO UPDATE SET value = '1'"); tt += 11000;
  [s, r] = await call(B, 'GET', '/api/me'); ok('remise à zéro faite : la maintenance se termine toute seule', !r.maintenance);
} finally { Date.now = realNow; await q("DELETE FROM settings WHERE key IN ('reset_done', 'maintenance_off')"); }
Date.now = clock0; env.RESET = '0';
[s, r] = await call(A, 'GET', '/api/me'); ok('annonce coupable (tests des autres fichiers)', !r.reset && !r.maintenance);
done();
