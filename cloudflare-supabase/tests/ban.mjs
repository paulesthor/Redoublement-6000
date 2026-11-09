// Suspension d'un compte : aucune action, aucun paquet gratuit, aucun gain de pièces ; levée sans rattrapage ; réservée à l'administrateur.
import './api.mjs';
const { call, ok, DB, J, done, worker, env } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const reg = async n => { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); return r.token; };
const ADM = await reg('Chef'), MICH = await reg('Michelleclebresil'), BOB = await reg('Bob');
await q("UPDATE users SET is_admin = 1 WHERE name = 'Chef'"); await q("UPDATE users SET coins = 1000, pack_stock = 5 WHERE name IN ('Michelleclebresil','Bob')");
const uid = async n => +(await q('SELECT id FROM users WHERE name = ?', n))[0].id, mid = await uid('Michelleclebresil');
const row = async () => (await q('SELECT coins, pack_stock, pack_ts FROM users WHERE id = ?', mid))[0];
let [s, v] = await call(MICH, 'POST', '/api/admin/ban', { name: 'Bob' }); ok('suspension réservée à l\'administrateur', s === 403, s);
[s] = await call(ADM, 'POST', '/api/admin/ban', { name: 'Chef' }); ok('on ne suspend pas un administrateur', s === 400, s);
[s] = await call(ADM, 'POST', '/api/admin/ban', { name: 'Fantome' }); ok('joueur introuvable : 404', s === 404, s);
[s, v] = await call(MICH, 'GET', '/api/me'); ok('avant : le joueur joue normalement', s === 200 && !v.banned && v.packs >= 5, J(v).slice(0, 80));
[s, v] = await call(ADM, 'POST', '/api/admin/ban', { name: 'michelleclebresil' }); ok('suspension posée (nom insensible à la casse)', s === 200 && v.banned === true, J(v));
const before = await row();
[s, v] = await call(MICH, 'GET', '/api/me'); ok('/me répond « suspendu » sans paquets', s === 200 && v.banned === true && v.packs === 0 && /suspendu/.test(v.banMsg), J(v).slice(0, 120));
for (const [m, path, body] of [['GET', '/api/packs/next'], ['POST', '/api/packs/open', {}], ['POST', '/api/daily/claim', {}], ['GET', '/api/auctions'], ['POST', '/api/hilo/start', { stake: 10 }], ['GET', '/api/album/stats'], ['GET', '/api/commu'], ['POST', '/api/commu/join', {}], ['GET', '/api/camp'], ['GET', '/api/daily-quiz'], ['GET', '/api/leaderboard'], ['POST', '/api/quests/claim', { id: 'x' }]]) {
  [s, v] = await call(MICH, m, path, body); ok(`suspendu : ${m} ${path} refusé`, s === 403 && v.banned === true, `${s} ${J(v).slice(0, 80)}`);
}
// un salon de duel (WebSocket) refuse aussi un compte suspendu
const tok = (await q("SELECT token FROM sessions WHERE user_id = ?", mid))[0].token;
const wsRes = await env.LOBBY.get('x').fetch(new Request('http://x/ws?token=' + tok, { headers: { Upgrade: 'websocket' } }));
ok('salon des duels : refusé (403)', wsRes.status === 403, wsRes.status);
// gains de pièces mis de côté (vente d'une enchère terminée, etc.) : simulés par une hausse directe
await q('UPDATE users SET coins = coins + 300 WHERE id = ?', mid);
const mid2 = await row(); ok('les gains de pièces sont mis de côté pendant la suspension', mid2.coins === before.coins, J({ avant: before.coins, après: mid2.coins }));
await q('UPDATE users SET coins = coins - 50 WHERE id = ?', mid).catch(() => {}); ok('les dépenses sont refusées aussi', (await row()).coins === before.coins);
[s, v] = await call(ADM, 'GET', '/api/admin/bans'); ok('liste des comptes suspendus', v.banned.length === 1 && v.banned[0].name === 'Michelleclebresil', J(v));
[s, v] = await call(ADM, 'GET', '/api/admin/investigate?name=Michelleclebresil'); ok('l\'enquête indique « suspendu »', v.player.banned === true, J(v.player));
[s] = await call(BOB, 'GET', '/api/packs/next'); ok('les autres joueurs ne sont pas touchés', s === 200, s);
// levée : pas de paquets de rattrapage, pièces mises de côté rendues
await q('UPDATE users SET pack_ts = ? WHERE id = ?', Date.now() - 48 * 3600000, mid);
[s, v] = await call(ADM, 'POST', '/api/admin/ban', { name: 'Michelleclebresil', ban: false }); ok('suspension levée', s === 200 && v.banned === false, J(v));
const after = await row();
ok('levée : aucun paquet de rattrapage pour les 48 h de suspension', after.pack_stock === before.pack_stock && Date.now() - after.pack_ts < 60000, J({ stock: after.stock, ts: Date.now() - after.pack_ts }));
ok('levée : les pièces gagnées pendant la suspension sont rendues', after.coins === before.coins + 300, J({ avant: before.coins, après: after.coins }));
[s, v] = await call(MICH, 'GET', '/api/me'); ok('après : le joueur rejoue', s === 200 && !v.banned, J(v).slice(0, 80));
[s] = await call(MICH, 'GET', '/api/packs/next'); ok('après : les routes de jeu sont de nouveau ouvertes', s === 200, s);
done();
