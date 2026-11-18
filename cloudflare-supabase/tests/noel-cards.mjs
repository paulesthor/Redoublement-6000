// Noël : portes mélangées, album de Noël, cadeau du 25, photos des joueurs, cartes de joueurs et hotte.
import './api.mjs';
const { call, ok, DB, J, done, settle } = globalThis.__T;
const { DOORS } = await import('../src/noel.js');
const { NCARD, PCARD_BASE, HOTTE_COST } = await import('../src/noel-cards.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const mk = async n => { await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); const [, l] = await call(null, 'POST', '/api/login', { name: n, password: 'secret1' }); return l.token; };
const A = await mk('Alice'); await DB.prepare("UPDATE users SET is_admin = 1 WHERE name = 'Alice'").run(); const B = await mk('Bob');
const [alice, bob] = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id);
const JPG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]).toString('base64');
const flo = (uid, n) => DB.prepare("INSERT INTO event_progress (key, user_id, n) VALUES ('nl:flocons', ?, ?) ON CONFLICT (key, user_id) DO UPDATE SET n = ?").bind(uid, n, n).run();

console.log('— calendrier : mêmes cadeaux, dates mélangées');
{ const { DOORS: D } = await import('../src/noel.js'), coins = D.map(o => o.coins), packs = D.map(o => o.packs);
  ok('les 24 cadeaux sont toujours les mêmes (même total de pièces et de paquets)', coins.reduce((t, x) => t + x, 0) === 1160 && packs.reduce((t, x) => t + x, 0) === 18, coins.reduce((t, x) => t + x, 0) + ' / ' + packs.reduce((t, x) => t + x, 0));
  ok('la date des cadeaux est mélangée (plus l\'ordre d\'origine)', coins.join() !== [20, 20, 25, 25, 30, 45, 30, 30, 35, 35, 40, 60, 40, 45, 45, 50, 50, 80, 55, 55, 60, 65, 70, 150].join());
  ok('le gros lot (150 pièces, 5 paquets) tombe entre le 18 et le 24', D.findIndex(o => o.coins === 150 && o.packs === 5) >= 17);
  ok('les textes restent liés au jour (porte 24 : « La grande porte »)', /grande porte/.test(D[23].text) && /moitié/.test(D[11].text));
  ok('chaque porte garde un cadeau', D.every(o => o.coins > 0)); }

console.log('— fermé : rien n\'est visible');
let [s, r] = await call(B, 'GET', '/api/noel/hotte'); ok('événement fermé : hotte refusée', s === 403);
[s, r] = await call(B, 'POST', '/api/noel/photo', { data: JPG, consent: true }); ok('événement fermé : envoi de photo refusé', s === 403);
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
[s, r] = await call(B, 'GET', '/api/albums'); ok('réservé à l\'administrateur : l\'album de Noël est invisible pour les joueurs', s === 200 && !r.albums.some(a => a.id === 'noel'));
[s, r] = await call(A, 'GET', '/api/albums'); const na = r.albums.find(a => a.id === 'noel'); ok('administrateur : album de Noël de 5 cartes en tête de liste', r.albums[0].id === 'noel' && na.cards.length === 5 && na.cards.every(c => c.own === false) && /Noël/.test(na.name), J(na));

console.log('— hotte');
[s, r] = await call(A, 'GET', '/api/noel/hotte'); ok('hotte : coût et réserve de cartes', s === 200 && r.cost === HOTTE_COST && r.pool === 5 && r.flocons === 0, J(r));
[s, r] = await call(A, 'POST', '/api/noel/hotte', { n: 1 }); ok('hotte : refusée sans assez de flocons', s === 400, J(r));
await flo(alice, HOTTE_COST * 7);
[s, r] = await call(A, 'POST', '/api/noel/hotte', { n: 1 }); ok('hotte : un tirage coûte 60 flocons et donne une carte de Noël', s === 200 && r.cards.length === 1 && r.flocons === HOTTE_COST * 6 && r.cards[0].id >= 90000000 && r.cards[0].isNew === true, J(r));
[s, r] = await call(A, 'POST', '/api/noel/hotte', { n: 5 }); ok('hotte : cinq tirages d\'un coup', s === 200 && r.cards.length === 5 && r.flocons === HOTTE_COST, J(r));
[s, r] = await call(A, 'POST', '/api/noel/hotte', { n: 6 }); ok('hotte : six tirages refusés', s === 400);
const inv = await q('SELECT card_id, qty, rar FROM inventory WHERE user_id = ? AND card_id >= 90000000', alice);
ok('hotte : les cartes sont dans la collection (légendaires), les doublons s\'additionnent', inv.length >= 1 && inv.every(x => +x.rar === 5) && inv.reduce((t, x) => t + +x.qty, 0) === 6, J(inv));
await Promise.all([call(A, 'POST', '/api/noel/hotte', { n: 1 }), call(A, 'POST', '/api/noel/hotte', { n: 1 })]);
ok('hotte : deux tirages simultanés avec les flocons d\'un seul, un seul passe', (await q("SELECT n FROM event_progress WHERE key = 'nl:flocons' AND user_id = ?", alice))[0].n === 0 && inv.length >= 1);

console.log('— album de Noël');
[s, r] = await call(A, 'POST', '/api/albums/noel/claim', {}); ok('album : récompense refusée tant qu\'il manque des cartes', s === 400, J(r));
for (const id of Object.values(NCARD).slice(0, 5)) await q('INSERT INTO inventory (user_id, card_id, qty, acquired, rar, sh, skey, nk, fav) VALUES (?,?,1,1,5,0,5000001000,?,0) ON CONFLICT DO NOTHING', alice, id, 'x');
const c0 = (await q('SELECT coins FROM users WHERE id = ?', alice))[0].coins;
[s, r] = await call(A, 'POST', '/api/albums/noel/claim', {}); ok('album complet : 5 000 pièces', s === 200 && r.reward.c === 5000 && +(await q('SELECT coins FROM users WHERE id = ?', alice))[0].coins === +c0 + 5000, J(r));
[s, r] = await call(A, 'POST', '/api/albums/noel/claim', {}); ok('album : récompense une seule fois', s === 400);
[s, r] = await call(B, 'POST', '/api/albums/noel/claim', {}); ok('album : inconnu pour un joueur sans accès à Noël', s === 404);

console.log('— cadeau du 25 décembre');
[s, r] = await call(A, 'GET', '/api/noel/gift'); ok('cadeau : pas encore disponible avant le 25', s === 200 && r.available === false && r.claimed === false, J(r));
[s, r] = await call(A, 'POST', '/api/noel/gift', {}); ok('cadeau : refusé avant le 25', s === 403, J(r));
[s, r] = await call(A, 'POST', '/api/noel/gift', { day: 25 }); ok('administrateur : aperçu du 25, la carte arrive', s === 200 && r.card.id === NCARD.nativite && /Petit Jésus/.test(r.card.title) && r.card.isNew, J(r));
ok('cadeau : la carte est légendaire dans la collection', (await q('SELECT rar FROM inventory WHERE user_id = ? AND card_id = ?', alice, NCARD.nativite))[0].rar == 5);
[s, r] = await call(A, 'POST', '/api/noel/gift', { day: 25 }); ok('cadeau : une seule fois', s === 409);
[s, r] = await call(A, 'POST', '/api/noel/gift/reset', {}); [s, r] = await call(A, 'POST', '/api/noel/gift', { day: 25 }); ok('administrateur : peut reprendre le cadeau pour revoir l\'animation', s === 200);
[s, r] = await call(B, 'POST', '/api/noel/gift/reset', {}); ok('remise à zéro du cadeau : réservée à l\'administrateur', s === 403);
const real = Date.now; Date.now = () => Date.parse('2026-12-25T09:00:00+01:00');
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'all' });
[s, r] = await call(B, 'GET', '/api/noel/gift'); ok('le 25 : disponible pour tous les joueurs', r.available === true && r.claimed === false, J(r));
[s, r] = await call(B, 'POST', '/api/noel/gift', {}); ok('le 25 : chaque joueur reçoit la carte légendaire', s === 200 && r.card.id === NCARD.nativite, J(r));
[s, r] = await call(B, 'POST', '/api/noel/gift', {}); ok('le 25 : une seule fois par joueur', s === 409);
Date.now = real; await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });

console.log('— photos et cartes de joueurs');
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'all' });
[s, r] = await call(B, 'POST', '/api/noel/photo', { data: JPG }); ok('photo : refusée sans consentement', s === 400, J(r));
[s, r] = await call(B, 'POST', '/api/noel/photo', { data: 'abc!', consent: true }); ok('photo : refusée si ce n\'est pas une image', s === 400);
[s, r] = await call(B, 'POST', '/api/noel/photo', { data: Buffer.from('PNGxxxxxxxxxxxx').toString('base64'), consent: true }); ok('photo : JPEG uniquement', s === 400);
[s, r] = await call(B, 'POST', '/api/noel/photo', { data: 'A'.repeat(340000), consent: true }); ok('photo : trop lourde refusée', s === 400);
[s, r] = await call(B, 'POST', '/api/noel/photo', { data: JPG, consent: true }); ok('photo : envoyée avec consentement', s === 200 && r.ok);
[s, r] = await call(B, 'GET', '/api/noel/photo'); ok('photo : le joueur voit qu\'elle est envoyée, sans carte pour l\'instant', r.sent === true && r.card === null, J(r));
[s, r] = await call(B, 'GET', '/api/noel/photos-admin'); ok('liste des photos : réservée à l\'administrateur', s === 403);
[s, r] = await call(B, 'GET', '/api/noel/photo-img/' + bob); ok('photo d\'un joueur : jamais visible par un joueur', s === 403);
[s, r] = await call(A, 'GET', '/api/noel/photos-admin'); ok('administrateur : voit la photo envoyée par Bob', s === 200 && r.photos.length === 1 && r.photos[0].name === 'Bob' && r.photos[0].card === null && r.base.length === 6, J(r));
[s] = await call(A, 'GET', '/api/noel/photo-img/' + bob); ok('administrateur : peut récupérer la photo pour l\'IA', s === 200);
[s, r] = await call(B, 'POST', '/api/noel/pcard', { uid: bob, title: 'Bob', extract: 'x' }); ok('création de carte : réservée à l\'administrateur', s === 403);
[s, r] = await call(A, 'POST', '/api/noel/pcard', { uid: bob, title: 'B', extract: 'x' }); ok('création de carte : titre trop court refusé', s === 400);
const ART = 'Bob de l\'Atelier est un lutin de seconde classe. Il a longtemps cru que le salaire était une légende. Aucune source ne contredit cette thèse.';
[s, r] = await call(A, 'POST', '/api/noel/pcard', { uid: bob, title: 'Bob de l\'Atelier', extract: ART, data: JPG }); ok('administrateur : crée la carte de Bob (article complet + image)', s === 200 && r.id === PCARD_BASE + bob, J(r));
const card = (await q('SELECT title, extract, image, rarity, enriched FROM cards WHERE id = ?', PCARD_BASE + bob))[0];
ok('carte de joueur : article, image servie par le jeu, rareté ultra, jamais réécrite par Wikipédia', card.extract === ART && /^\/api\/noel\/card\/\d+\?v=/.test(card.image) && card.rarity === 'ultra' && +card.enriched === 2, J(card));
[s] = await call(null, 'GET', card.image.split('?')[0]); ok('image de la carte : publique (cartoon seulement)', s === 200);
[s] = await call(null, 'GET', '/api/noel/card/' + (PCARD_BASE + alice)); ok('image inexistante : 404', s === 404);
[s] = await call(null, 'GET', '/api/noel/card/1234'); ok('image hors plage de Noël : 404', s === 404);
[s, r] = await call(B, 'GET', '/api/noel/photo'); ok('le joueur voit sa carte une fois créée', r.card && r.card.title === 'Bob de l\'Atelier', J(r));
[s, r] = await call(A, 'GET', '/api/noel/hotte'); ok('hotte : la carte du joueur entre dans la réserve de tirage (6 cartes)', r.pool === 6, J(r));
[s, r] = await call(A, 'POST', '/api/noel/pcard', { uid: bob, title: 'Bob de l\'Atelier (2)', extract: ART }); const card2 = (await q('SELECT title, image FROM cards WHERE id = ?', PCARD_BASE + bob))[0];
ok('modifier l\'article garde l\'image', s === 200 && card2.title.endsWith('(2)') && /\/api\/noel\/card\//.test(card2.image), J(card2));
await flo(alice, HOTTE_COST * 40); const got = new Set(); for (let i = 0; i < 8; i++) { const [, x] = await call(A, 'POST', '/api/noel/hotte', { n: 5 }); (x.cards || []).forEach(c => got.add(c.id)); }
ok('hotte : la carte de Bob sort au bout de quelques tirages (non unique, pour tout le monde)', got.has(PCARD_BASE + bob), [...got].join());
[s, r] = await call(B, 'POST', '/api/noel/photo/delete', {}); [s, r] = await call(B, 'GET', '/api/noel/photo'); ok('le joueur peut retirer sa photo', r.sent === false);
[s, r] = await call(A, 'POST', '/api/noel/pcard', { uid: bob, remove: true }); ok('administrateur : peut supprimer une carte de joueur', s === 200 && (await q('SELECT 1 x FROM cards WHERE id = ?', PCARD_BASE + bob)).length === 0);
// images des cartes de l'album
[s, r] = await call(A, 'POST', '/api/noel/card-art', { id: NCARD.renne, data: JPG }); ok('administrateur : envoie l\'image d\'une carte de l\'album', s === 200);
ok('carte de l\'album : image servie par le jeu', /^\/api\/noel\/card\/90000001\?v=/.test((await q('SELECT image FROM cards WHERE id = ?', NCARD.renne))[0].image));
[s, r] = await call(A, 'POST', '/api/noel/card-art', { id: 12, data: JPG }); ok('image : carte inconnue refusée', s === 404);
[s, r] = await call(B, 'POST', '/api/noel/card-art', { id: NCARD.renne, data: JPG }); ok('image : réservée à l\'administrateur', s === 403);
[s, r] = await call(A, 'POST', '/api/noel/card-art', { id: NCARD.renne, data: 'xx' }); ok('image : JPEG obligatoire', s === 400);
[s, r] = await call(A, 'GET', '/api/albums'); ok('album de Noël : les images apparaissent', r.albums[0].cards.find(c => c.id === NCARD.renne).own === true && !!r.albums[0].cards.find(c => c.id === NCARD.renne).img);
done();
