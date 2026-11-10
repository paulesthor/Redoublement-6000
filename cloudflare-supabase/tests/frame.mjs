// Cadre de photo : le joueur choisit parmi les cadres gagnés (ou aucun, ou automatique).
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
const [, a] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret1' }); const B = a.token;
const [, c] = await call(null, 'POST', '/api/register', { name: 'Eve', password: 'secret2' }); const E = c.token;
const bob = +(await DB.prepare("SELECT id FROM users WHERE name = 'Bob'").all()).results[0].id;
await DB.prepare("INSERT INTO plan_progress (user_id, joined, perks) VALUES (?, 2, ?) ON CONFLICT (user_id) DO UPDATE SET perks = excluded.perks").bind(bob, JSON.stringify(['frame_star', 'frame_gold'])).run();
const mine = async () => (await call(B, 'GET', '/api/cosmetics'))[1].players.find(p => p.name === 'Bob')?.fr ?? null;
let [s, r] = await call(B, 'GET', '/api/me/frame');
ok('cadres gagnés listés, choix automatique', s === 200 && r.owned.map(f => f.id).join() === 'frame_gold,frame_star' && r.choice === 'auto' && r.shown === 'frame_gold', J(r));
ok('automatique : le plus prestigieux est affiché', await mine() === 'frame_gold');
[s, r] = await call(B, 'POST', '/api/me/frame', { frame: 'frame_star' });
ok('choix d\'un cadre gagné', s === 200 && await mine() === 'frame_star' && (await call(B, 'GET', '/api/me/frame'))[1].choice === 'frame_star', J(r));
[s, r] = await call(B, 'POST', '/api/me/frame', { frame: 'gold_outline' }); ok('cadre non gagné refusé', s === 403, J([s, r]));
[s, r] = await call(B, 'POST', '/api/me/frame', { frame: 'invente' }); ok('cadre inconnu refusé', s === 403);
await call(B, 'POST', '/api/me/frame', { frame: 'none' }); ok('« aucun » : plus de cadre affiché', await mine() === null && (await call(B, 'GET', '/api/me/frame'))[1].choice === 'none');
await call(B, 'POST', '/api/me/frame', { frame: 'auto' }); ok('retour à l\'automatique', await mine() === 'frame_gold');
// un joueur sans cadre : rien à choisir, et on ne peut pas s'en attribuer un
[s, r] = await call(E, 'GET', '/api/me/frame'); ok('joueur sans cadre : liste vide', r.owned.length === 0 && r.shown === null);
[s, r] = await call(E, 'POST', '/api/me/frame', { frame: 'frame_star' }); ok('joueur sans cadre : choix refusé', s === 403);
// cadre perdu après un choix : retour automatique
await call(B, 'POST', '/api/me/frame', { frame: 'frame_gold' });
await DB.prepare("UPDATE plan_progress SET perks = ? WHERE user_id = ?").bind(JSON.stringify(['frame_star']), bob).run();
ok('cadre choisi puis perdu : le cadre restant s\'affiche', await mine() === 'frame_star');
done();
