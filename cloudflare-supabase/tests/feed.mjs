// Fil d'actualité : une publication par légendaire tirée, « J'aime », commentaires.
import './api.mjs';
const { call, settle, ok, DB, J, done, env } = globalThis.__T;
const CFG = (await import('../src/config.js')).default;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Cleo', password: 'secret3' }); const C = r.token;
const [alice, bob] = (await q("SELECT id FROM users WHERE name IN ('Alice','Bob') ORDER BY id")).map(x => +x.id);
[s, r] = await call(A, 'GET', '/api/feed'); ok('fil vide au départ', s === 200 && r.posts.length === 0 && r.more === false, J([s, r]));
[s] = await call(null, 'GET', '/api/feed'); ok('connexion requise', s === 401, s);
// des légendaires sortent des paquets : une publication chacune, au nom du joueur qui les a tirées
CFG.DROP.legendary = 3000; await q('UPDATE users SET pack_stock = 12, coins = 10000');
for (let i = 0; i < 4; i++) { await call(A, 'POST', '/api/packs/open', {}); await call(B, 'POST', '/api/packs/buy', {}); } await settle();
const legs = await q("SELECT i.user_id, COUNT(*) n FROM inventory i WHERE i.rar = 5 GROUP BY i.user_id"), total = legs.reduce((t, x) => t + +x.n, 0);
const posts = await q('SELECT user_id, COUNT(*) n FROM feed_posts GROUP BY user_id');
ok('une publication par légendaire tirée', total > 0 && posts.reduce((t, x) => t + +x.n, 0) === total, J([legs, posts]));
[s, r] = await call(C, 'GET', '/api/feed'); const p0 = r.posts[0];
ok('le fil montre la carte, le pseudo, 0 J\'aime', s === 200 && r.posts.length > 0 && p0.card?.rarity === 'legendary' && ['Alice', 'Bob'].includes(p0.user.name) && p0.likes === 0 && p0.liked === false && p0.comments === 0, J(p0));
ok('plus récent d\'abord', r.posts.every((p, i) => i === 0 || r.posts[i - 1].id > p.id));
[s, r] = await call(C, 'POST', '/api/feed/like', { post: p0.id }); ok('J\'aime', s === 200 && r.liked === true && r.likes === 1, J([s, r]));
[s, r] = await call(C, 'GET', '/api/feed'); ok('J\'aime visible, « déjà aimé » pour moi seulement', r.posts[0].likes === 1 && r.posts[0].liked === true && (await call(B, 'GET', '/api/feed'))[1].posts[0].liked === false);
[s, r] = await call(C, 'POST', '/api/feed/like', { post: p0.id }); ok('second appui : retire le J\'aime', r.liked === false && r.likes === 0, J(r));
[s] = await call(C, 'POST', '/api/feed/like', { post: 99999999 }); ok('publication inconnue : 404', s === 404, s);
[s, r] = await call(C, 'POST', '/api/feed/comment', { post: p0.id, text: '  Bravo   !!  ' }); ok('commentaire', s === 200 && r.comment.text === 'Bravo !!' && r.comment.mine === true && r.comment.id > 0, J([s, r]));
[s] = await call(C, 'POST', '/api/feed/comment', { post: p0.id, text: '   ' }); ok('commentaire vide refusé', s === 400, s);
[s, r] = await call(C, 'POST', '/api/feed/comment', { post: p0.id, text: 'x'.repeat(500) }); ok('commentaire tronqué à 200 caractères', s === 200 && r.comment.text.length === 200);
[s, r] = await call(B, 'GET', `/api/feed/${p0.id}/comments`); ok('liste des commentaires', s === 200 && r.comments.length === 2 && r.comments[0].name === 'Cleo' && r.comments[0].mine === false, J(r));
[s, r] = await call(B, 'GET', '/api/feed'); ok('aperçu : nombre et derniers commentaires', r.posts[0].comments === 2 && r.posts[0].last.length === 2, J(r.posts[0]));
const cid = (await q('SELECT id FROM feed_comments ORDER BY id LIMIT 1'))[0].id, owner = p0.user.name === 'Alice' ? A : B, stranger = owner === A ? B : A;
[s] = await call(stranger === B ? B : A, 'POST', '/api/feed/comment/delete', { id: cid }); ok('un autre joueur ne peut pas supprimer le commentaire de Cleo', s === 403, s);
[s] = await call(owner, 'POST', '/api/feed/comment/delete', { id: cid }); ok('le propriétaire de la publication peut supprimer', s === 200 && +(await q('SELECT COUNT(*) n FROM feed_comments WHERE id = ?', cid))[0].n === 0);
let limited = 0; for (let i = 0; i < CFG_LIMIT(); i++) { [s] = await call(C, 'POST', '/api/feed/comment', { post: p0.id, text: 'spam ' + i }); if (s === 429) limited++; }
function CFG_LIMIT() { return 25; }
ok('trop de commentaires en une heure : limité', limited > 0, limited);
// pagination
const many = await q('SELECT COUNT(*) n FROM feed_posts'); const n = +many[0].n;
[s, r] = await call(C, 'GET', '/api/feed'); ok('une page contient au plus 12 publications', r.posts.length === Math.min(12, n) && r.more === (n > 12), J([r.posts.length, r.more, n]));
if (n > 12) { [s, r] = await call(C, 'GET', `/api/feed?before=${r.posts.at(-1).id}`); ok('page suivante', r.posts.length > 0 && r.posts.every(p => p.id < 1e12)); }
done();
