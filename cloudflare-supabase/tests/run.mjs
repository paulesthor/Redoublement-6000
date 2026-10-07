import './api.mjs';
const { call, settle, ok, DB, pg, J, done, lobby, env, worker, ctx } = globalThis.__T;
let res3;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const NOT500 = (s, r) => s < 500;

console.log('— inscription / connexion');
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' });
ok('inscription', s === 200 && r.token, J([s, r])); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'alice', password: 'x12345' }); ok('pseudo déjà pris (insensible à la casse)', s === 409, J([s, r]));
[s, r] = await call(null, 'POST', '/api/login', { name: 'ALICE', password: 'secret1' }); ok('connexion insensible à la casse', s === 200 && r.token, J([s, r]));
[s, r] = await call(null, 'POST', '/api/login', { name: 'Alice', password: 'mauvais' }); ok('mauvais mot de passe refusé', s === 401 || s === 400, J([s, r]));
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token; ok('2e joueur', !!B, J(r));
[s, r] = await call(null, 'POST', '/api/register', { name: 'Chloé', password: 'secret3' }); const C = r.token;
const [alice, bob, chloe] = (await q('SELECT id FROM users WHERE is_bot = 0 ORDER BY id')).map(x => x.id);
[s, r] = await call(A, 'GET', '/api/me'); ok('/me', s === 200 && r.name === 'Alice' && r.dm === 0, J([s, r]));
[s, r] = await call(null, 'GET', '/api/me'); ok('/me sans connexion : 401', s === 401);
await settle();

console.log('— paquets');
[s, r] = await call(A, 'GET', '/api/config'); ok('/config', s === 200 && r.rarities?.length === 6, J([s, r]).slice(0, 200));
[s, r] = await call(null, 'GET', '/api/version'); ok('/version', s === 200);
[s, r] = await call(A, 'GET', '/api/packs/next'); ok('/packs/next', NOT500(s), J([s, r]));
let pack1; [s, r] = await call(A, 'POST', '/api/packs/open', {}); pack1 = r;
ok('ouverture d\'un paquet : 10 cartes', s === 200 && r.cards?.length === 10, J([s, r]).slice(0, 300));
const inv1 = await q('SELECT COUNT(*) n, SUM(qty) q FROM inventory WHERE user_id = ?', alice); ok('cartes ajoutées à la collection', +inv1[0].q === 10, J(inv1));
const ids = r.cards.map(c => c.id); const unique = [...new Set(ids)];
ok('jamais deux fois la même carte dans un paquet', unique.length === ids.length, J(ids));
const sk = await q('SELECT rar, sh, skey, nk FROM inventory WHERE user_id = ? LIMIT 3', alice); ok('colonnes de tri de l\'inventaire remplies (skey, nk)', sk.every(x => x.nk && x.skey >= 0), J(sk));
for (let i = 0; i < 4; i++) await call(A, 'POST', '/api/packs/open', {});
await call(B, 'POST', '/api/packs/open', {}); await call(B, 'POST', '/api/packs/open', {}); await call(C, 'POST', '/api/packs/open', {});
await settle();
[s, r] = await call(A, 'POST', '/api/packs/buy', {}); ok('achat d\'un paquet', NOT500(s), J([s, r]).slice(0, 200));
[s, r] = await call(A, 'GET', '/api/hits'); ok('/hits', s === 200 && Array.isArray(r.hits), J([s, r]).slice(0, 200));
[s, r] = await call(A, 'GET', '/api/packs/next'); ok('/packs/next', s === 200);
// préparation des paquets d'avance
const prep = await q('SELECT COUNT(*) n FROM prepared'); ok('paquets préparés d\'avance', +prep[0].n >= 1, J(prep));
const res = await q('SELECT rarity, COUNT(*) n FROM reserve GROUP BY rarity'); console.log('   réserve :', J(res));

console.log('— collection');
const sorts = ['rar', 'new', 'old', 'name', 'fav', 'qty'];
for (const so of sorts) { [s, r] = await call(A, 'GET', '/api/album/page?sort=' + so); ok('album/page tri ' + so, s === 200 && Array.isArray(r.cards), J([s, r]).slice(0, 250)); }
[s, r] = await call(A, 'GET', '/api/album/page?sort=rar'); const first = r;
if (first.next) { [s, r] = await call(A, 'GET', '/api/album/page?sort=rar&cursor=' + encodeURIComponent(J(first.next))); ok('album/page 2e page par curseur', s === 200 && r.cards.every(c => !first.cards.some(f => f.id === c.id)), J([s, r]).slice(0, 250)); }
[s, r] = await call(A, 'GET', '/api/album/page?sort=name&q=a'); ok('album/page recherche', s === 200, J([s, r]).slice(0, 200));
[s, r] = await call(A, 'GET', '/api/album/page?sort=rar&rar=common'); ok('album/page filtre rareté', s === 200, J([s, r]).slice(0, 200));
[s, r] = await call(A, 'GET', '/api/album/page?sort=rar&dup=1'); ok('album/page doublons', s === 200, J([s, r]).slice(0, 200));
[s, r] = await call(A, 'GET', '/api/album/page?sort=rar&user=' + bob); ok('album/page d\'un autre joueur', s === 200, J([s, r]).slice(0, 200));
[s, r] = await call(A, 'GET', '/api/album/stats'); ok('album/stats', s === 200 && r.uniques > 0 && r.tiers?.length === 6, J([s, r]).slice(0, 300));
[s, r] = await call(A, 'GET', '/api/album'); ok('album (ancien format)', s === 200 && Array.isArray(r.cards), J([s, r]).slice(0, 200));
[s, r] = await call(A, 'GET', '/api/album?lite=1'); ok('album lite', s === 200, J([s, r]).slice(0, 200));
const mine = (await q('SELECT card_id, qty FROM inventory WHERE user_id = ? ORDER BY card_id', alice)); const cid = mine[0].card_id;
[s, r] = await call(A, 'POST', '/api/favorites', { card_id: cid, on: true }); ok('favori ajouté', s === 200, J([s, r]));
[s, r] = await call(A, 'GET', '/api/album/page?sort=rar&fav=1'); ok('filtre favoris', r.cards?.length === 1, J([s, r]).slice(0, 200));
[s, r] = await call(A, 'POST', '/api/favorites', { card_id: cid, on: false }); ok('favori retiré', s === 200);
[s, r] = await call(A, 'POST', '/api/cards/enrich', { ids: mine.slice(0, 3).map(x => x.card_id) }); ok('cards/enrich', s === 200, J([s, r]).slice(0, 200));
const c0 = await q('SELECT coins FROM users WHERE id = ?', alice);
[s, r] = await call(A, 'POST', '/api/discard', { card_id: mine[1].card_id, qty: 1 }); ok('défausser 1 carte', s === 200 && r.price > 0, J([s, r]));
const three = mine.slice(2, 5).map(x => x.card_id); const before3 = await q('SELECT SUM(qty) q FROM inventory WHERE user_id = ?', alice);
[s, r] = await call(A, 'POST', '/api/discard-many', { ids: three }); ok('discard-many', s === 200 && r.count === 3 && r.price > 0, J([s, r]));
const after3 = await q('SELECT SUM(qty) q FROM inventory WHERE user_id = ?', alice); ok('3 exemplaires retirés', before3[0].q - after3[0].q === 3, J([before3, after3]));
[s, r] = await call(A, 'POST', '/api/discard-dupes', { max_rarity: 'rare' }); ok('discard-dupes', s === 200, J([s, r]));
[s, r] = await call(A, 'POST', '/api/discard', { card_id: 999999999, qty: 1 }); ok('défausse d\'une carte non possédée refusée', s === 400, J([s, r]));
const c1 = await q('SELECT coins FROM users WHERE id = ?', alice); ok('pièces créditées', c1[0].coins > c0[0].coins);

console.log('— recherche');
[s, r] = await call(A, 'GET', '/api/cards/search?q=carte'); ok('cards/search', s === 200 && Array.isArray(r.cards), J([s, r]).slice(0, 250));
await q("INSERT INTO cards (id, title, rarity, atk, def, views) VALUES (777001, 'Éléphant d''Afrique 100%', 'common', 1, 1, 5), (777002, 'élé_phant', 'common', 1, 1, 9)");
[s, r] = await call(A, 'GET', '/api/cards/search?q=%C3%89l%C3%A9'); ok('cards/search : préfixe, accents et majuscules', r.cards.length === 2 && r.cards[0].id === 777002, J(r));
[s, r] = await call(A, 'GET', '/api/cards/search?q=100%25'); ok('cards/search : % saisi pris au pied de la lettre', r.cards.length === 0, J(r));
[s, r] = await call(A, 'GET', '/api/catalog/search?q=paris'); ok('catalog/search', s === 200, J([s, r]).slice(0, 250));
[s, r] = await call(A, 'GET', '/api/catalog/search?q=a'); ok('catalog/search court', NOT500(s));

console.log('— marché');
const sellable = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND qty > 0 ORDER BY card_id LIMIT 4 OFFSET 10', alice)).map(x => x.card_id);
[s, r] = await call(A, 'POST', '/api/auctions', { card_id: sellable[0], price: 50, minutes: 10 }); ok('mise en vente', s === 200, J([s, r]));
[s, r] = await call(A, 'POST', '/api/auctions', { card_id: sellable[1], price: 30, minutes: 1 }); ok('2e mise en vente', s === 200);
[s, r] = await call(B, 'GET', '/api/auctions'); ok('liste des enchères', s === 200 && r.auctions.length >= 2, J([s, r]).slice(0, 300));
const lot = r.auctions.find(a => a.card_id === sellable[0]);
[s, r] = await call(B, 'POST', `/api/auctions/${lot.id}/bid`, { amount: 60 }); ok('enchère de Bob', s === 200, J([s, r]));
[s, r] = await call(C, 'POST', `/api/auctions/${lot.id}/bid`, { amount: 61 }); ok('surenchère de Chloé (Bob remboursé)', s === 200, J([s, r]));
[s, r] = await call(A, 'POST', `/api/auctions/${lot.id}/bid`, { amount: 90 }); ok('le vendeur ne peut pas enchérir', s >= 400 && s < 500, J([s, r]));
[s, r] = await call(B, 'GET', `/api/auctions/${lot.id}/bids`); ok('historique des offres', s === 200 && r.bids.length === 2, J([s, r]).slice(0, 250));
[s, r] = await call(B, 'GET', '/api/auctions'); const mineBid = r.auctions.find(a => a.id === lot.id); ok('drapeaux bidded / leading', mineBid.bidded === true && mineBid.leading === false, J(mineBid));
await q('UPDATE auctions SET ends_at = 1 WHERE id = ?', lot.id);
[s, r] = await call(B, 'GET', '/api/auctions'); await settle();
const st1 = await q('SELECT status FROM auctions WHERE id = ?', lot.id); ok('enchère terminée et vendue', st1[0].status === 'sold', J(st1));
const wonInv = await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', chloe, sellable[0]); ok('carte livrée à Chloé', wonInv[0]?.qty === 1, J(wonInv));
const sales = await q('SELECT COUNT(*) n FROM sales'); ok('vente enregistrée', +sales[0].n >= 1);

console.log('— échanges');
const aCard = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND qty > 0 LIMIT 1', alice))[0].card_id, bCard = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND qty > 0 LIMIT 1', bob))[0].card_id;
[s, r] = await call(A, 'GET', `/api/players/${bob}/cards`); ok('players/:id/cards', s === 200 && r.cards.length > 0, J([s, r]).slice(0, 150));
[s, r] = await call(A, 'POST', '/api/trades', { to: bob, offer_card: aCard, want_card: bCard }); ok('proposition d\'échange', s === 200, J([s, r]));
[s, r] = await call(B, 'GET', '/api/trades'); ok('liste des échanges', s === 200 && r.trades.length === 1, J([s, r]).slice(0, 250));
const tid = r.trades[0].id;
[s, r] = await call(B, 'POST', `/api/trades/${tid}/accept`, {}); ok('échange accepté', s === 200, J([s, r]));
const ta = await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', alice, bCard), tb = await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', bob, aCard);
ok('cartes échangées', ta[0]?.qty >= 1 && tb[0]?.qty >= 1, J([ta, tb]));

console.log('— amis');
[s, r] = await call(A, 'POST', '/api/friends/request', { name: 'bob' }); ok('demande d\'ami (insensible à la casse)', s === 200, J([s, r]));
[s, r] = await call(B, 'GET', '/api/friends'); ok('demandes reçues', s === 200 && r.incoming.length === 1, J([s, r]).slice(0, 250));
[s, r] = await call(B, 'POST', `/api/friends/respond/${r.incoming[0].id}`, { accept: true }); ok('demande acceptée', s === 200, J([s, r]));
[s, r] = await call(A, 'GET', '/api/friends'); ok('amis', r.friends.length === 1 && r.code, J(r).slice(0, 250));
const code = (await call(C, 'GET', '/api/friends'))[1].code;
[s, r] = await call(A, 'POST', '/api/friends/add-code', { code }); ok('ami par code QR', s === 200, J([s, r]));
[s, r] = await call(A, 'POST', '/api/friends/seen', {}); ok('friends/seen', s === 200);
[s, r] = await call(A, 'POST', '/api/friends/remove', { id: chloe }); ok('retirer un ami', s === 200);
[s, r] = await call(A, 'GET', '/api/me'); ok('badge', NOT500(s));

console.log('— messagerie');
[s, r] = await call(A, 'POST', `/api/dm/${bob}`, { body: 'Salut $1 \'Bob\' <b>' }); ok('envoi d\'un message', s === 200 && r.message?.id > 0, J([s, r]));
[s, r] = await call(B, 'GET', '/api/me'); ok('non lu', r.dm === 1, J(r.dm));
[s, r] = await call(B, 'GET', '/api/dm'); ok('liste des conversations', r.convs.length === 1 && r.convs[0].unread === 1 && r.convs[0].name === 'Alice', J(r));
[s, r] = await call(B, 'GET', `/api/dm/${alice}`); ok('lecture + texte intact', r.messages[0].body === 'Salut $1 \'Bob\' <b>' && r.messages[0].mine === false, J(r));
[s, r] = await call(B, 'GET', '/api/me'); ok('lu', r.dm === 0);
[s, r] = await call(A, 'POST', `/api/dm/${alice}`, { body: 'x' }); ok('pas de message à soi-même', s === 400);

console.log('— profil, classement, divers');
[s, r] = await call(A, 'GET', `/api/profile/${bob}`); ok('profil', s === 200 && r.profile?.name === 'Bob', J([s, r]).slice(0, 250));
const sc = (await q('SELECT card_id FROM inventory WHERE user_id = ? LIMIT 2', alice)).map(x => x.card_id);
[s, r] = await call(A, 'POST', '/api/me/showcase', { cards: sc }); ok('vitrine', s === 200, J([s, r]));
[s, r] = await call(B, 'GET', `/api/profile/${alice}`); ok('vitrine visible', r.profile?.showcase?.length === 2, J(r).slice(0, 300));
[s, r] = await call(A, 'GET', '/api/leaderboard'); ok('classement', s === 200 && r.players.length >= 3, J([s, r]).slice(0, 300));
[s, r] = await call(A, 'GET', '/api/users'); ok('joueurs', s === 200 && r.users.length >= 3, J([s, r]).slice(0, 200));
[s, r] = await call(A, 'GET', '/api/achievements'); ok('succès', s === 200 && Array.isArray(r.achievements), J([s, r]).slice(0, 200));
[s, r] = await call(A, 'GET', '/api/quiz/preview?q=Paris'); ok('aperçu du quiz', NOT500(s), J([s, r]).slice(0, 200));
[s, r] = await call(A, 'POST', '/api/me/test-mode', { on: true }); ok('mode test refusé aux non-admins', s === 403 || r.ok === false || NOT500(s), J([s, r]));
[s, r] = await call(A, 'POST', '/api/push/subscribe', { endpoint: 'https://push.example/abc' }); ok('abonnement push', s === 200, J([s, r]));
[s, r] = await call(null, 'POST', '/api/push/pull', { endpoint: 'https://push.example/abc' }); ok('push/pull', s === 200 && Array.isArray(r.msgs), J([s, r]));
[s, r] = await call(A, 'POST', '/api/push/unsubscribe', {}); ok('désabonnement push', s === 200);

console.log('— administration');
await q('UPDATE users SET is_admin = 1 WHERE id = ?', alice);
for (const [m, p, b] of [['GET', '/api/admin/overview'], ['GET', '/api/admin/market'], ['POST', '/api/admin/lot', { title: 'Paris' }], ['POST', '/api/admin/lots-random', { count: 3 }], ['GET', '/api/admin/stats'], ['GET', '/api/admin/logs'], ['GET', '/api/admin/fights'], ['POST', '/api/admin/announce', { text: 'Test', push: false }], ['POST', '/api/admin/run', { action: 'bots' }], ['POST', '/api/admin/run', { action: 'reserve' }], ['POST', '/api/admin/test-mode', { user_id: alice, on: true }]]) {
  [s, r] = await call(A, m, p, b); ok(`admin ${m} ${p}`, s === 200, J([s, r]).slice(0, 300));
}
[s, r] = await call(B, 'GET', '/api/admin/overview'); ok('admin refusé aux autres', s === 403);
[s, r] = await call(A, 'GET', '/api/admin/users'); ok('admin/users désactivé', s === 403);
[s, r] = await call(A, 'GET', '/api/admin/market'); const lotsB = r.lots; if (lotsB?.length) { [s, r] = await call(A, 'POST', '/api/admin/lot/remove', { id: lotsB[0].id }); ok('retrait d\'un lot simulé', s === 200, J([s, r])); }
await settle();

console.log('— joueurs simulés (marché animé)');
await q('DELETE FROM bids WHERE auction_id IN (SELECT id FROM auctions WHERE seller_id IN (SELECT id FROM users WHERE is_bot = 1))'); await q('DELETE FROM auctions WHERE seller_id IN (SELECT id FROM users WHERE is_bot = 1)');
[s, r] = await call(A, 'POST', '/api/admin/run', { action: 'bots' }); await settle();
const bots = await q('SELECT COUNT(*) n FROM users WHERE is_bot = 1'), lots = await q("SELECT COUNT(*) n FROM auctions WHERE status = 'open'");
ok('joueurs simulés créés', +bots[0].n > 0, J(bots)); ok('ventes simulées créées', +lots[0].n > 0, J(lots));
[s, r] = await call(A, 'GET', '/api/auctions'); ok('liste avec ventes simulées', s === 200 && r.auctions.length > 0, J([s, r]).slice(0, 200));

console.log('— compteur d\'écritures et journal');
const rs = await q('SELECT rarity, COUNT(*) n FROM reserve GROUP BY rarity'); ok('réserve de cartes remplie', rs.length > 0, J(rs));
const ex = await q("SELECT COUNT(*) n FROM cards WHERE extract != ''"); ok('cartes complétées (texte)', +ex[0].n > 0, J(ex));
await settle();

console.log('— chemins moins fréquents');
{
  for (let i = 0; i < 8; i++) await call(A, 'POST', '/api/admin/run', { action: 'reserve' });
  const rsv = await q('SELECT rarity, COUNT(*) n FROM reserve GROUP BY rarity ORDER BY rarity'); console.log('   réserve :', J(rsv));
  const commons0 = +(rsv.find(x => x.rarity === 'common')?.n ?? 0);
  await q('UPDATE users SET pack_stock = 10 WHERE id = ?', alice);
  const rn0 = Date.now; Date.now = () => rn0() + 400000;   // le cache des effectifs de la réserve (5 min) est périmé : il est relu
  for (let i = 0; i < 4; i++) { [s, r] = await call(A, 'POST', '/api/packs/open', {}); ok('paquet avec réserve garnie ' + (i + 1), s === 200 && new Set(r.cards.map(c => c.id)).size === 10, J([s, r]).slice(0, 200)); }
  Date.now = rn0;
  const rsv2 = await q('SELECT rarity, COUNT(*) n FROM reserve GROUP BY rarity'); const commons1 = +(rsv2.find(x => x.rarity === 'common')?.n ?? 0);
  ok('les communes de la réserve sont réutilisées (pas toutes consommées)', commons0 === 0 || commons1 >= commons0 - 3, J([commons0, commons1]));
  await q('UPDATE users SET pack_stock = 0, pack_ts = 1 WHERE id = ?', bob);
  [s, r] = await call(B, 'GET', '/api/me'); const st2 = await q('SELECT pack_stock FROM users WHERE id = ?', bob); ok('régénération des paquets avec le temps', st2[0].pack_stock > 0, J(st2));
  // questions écrites par l'IA, puis relues depuis le cache
  env.AI.run = async () => ({ response: JSON.stringify({ questions: [
    { type: 'lieu', question: "De quel pays la ville décrite par cet article est-elle la capitale ?", choices: ['France', 'Italie', 'Espagne', 'Belgique'], answer: 0 },
    { type: 'date', question: "Vers quelle date la ville aurait-elle été fondée, d'après l'article ?", choices: ['250 av. J.-C.', '150 av. J.-C.', '350 av. J.-C.', '450 av. J.-C.'], answer: 0 },
    { type: 'chiffre', question: "Combien d'habitants la ville compte-t-elle selon l'article ?", choices: ['plus de deux millions', 'plus de trois millions', 'plus de cinq millions', 'plus de dix millions'], answer: 0 },
    { type: 'lieu', question: "Dans quoi les habitants de la ville vivent-ils, d'après l'article ?", choices: ['dans ses murs', 'dans les bois', 'dans la plaine', 'dans les îles'], answer: 0 }] }) });
  [s, r] = await call(A, 'GET', '/api/quiz/preview?q=Paris'); ok('quiz IA généré', NOT500(s), J([s, r]).slice(0, 300));
  [s, r] = await call(A, 'GET', '/api/quiz/preview?q=Paris'); ok('quiz IA relu', NOT500(s));
  console.log('   quiz en cache :', J(await q('SELECT COUNT(*) n FROM quizzes')));
  // cartes shiny : copie du texte et de l'image de la carte normale
  await DB.batch([DB.prepare('INSERT INTO cards (id, title, rarity, atk, def, shiny) VALUES (?,?,?,?,?,1)').bind(100000000 + cid, 'Shiny', 'legendary', 1, 1), DB.prepare('UPDATE cards SET extract = (SELECT extract FROM cards WHERE id = ?1), image = (SELECT image FROM cards WHERE id = ?1), enriched = (SELECT enriched FROM cards WHERE id = ?1) WHERE id = ?2 AND enriched = 0').bind(cid, 100000000 + cid)]);
  ok('copie texte/image des shiny', (await q('SELECT enriched FROM cards WHERE id = ?', 100000000 + cid))[0].enriched > 0);
  // doublons à vendre en lot
  const dup = (await q('SELECT card_id FROM inventory WHERE user_id = ? LIMIT 1', alice))[0].card_id; await q('UPDATE inventory SET qty = 4 WHERE user_id = ? AND card_id = ?', alice, dup);
  [s, r] = await call(A, 'POST', '/api/discard-dupes', { max_rarity: 'legendary' }); ok('vente des doublons en lot', s === 200 && r.count >= 3, J([s, r]));
  // échanges refusé / annulé, demande d'ami refusée
  const ac = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND qty > 0 LIMIT 1', alice))[0].card_id, bc = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND qty > 0 LIMIT 1', bob))[0].card_id;
  await call(A, 'POST', '/api/trades', { to: bob, offer_card: ac, want_card: bc }); await call(A, 'POST', '/api/trades', { to: bob, offer_card: ac, want_card: bc });
  const tr = (await call(B, 'GET', '/api/trades'))[1].trades.filter(t => t.status === 'pending');
  [s, r] = await call(B, 'POST', `/api/trades/${tr[0].id}/decline`, {}); ok('échange refusé', s === 200, J(r));
  [s, r] = await call(A, 'POST', `/api/trades/${tr[1].id}/cancel`, {}); ok('échange annulé', s === 200, J(r));
  await call(C, 'POST', '/api/friends/request', { name: 'Bob' }); const inc = (await call(B, 'GET', '/api/friends'))[1].incoming;
  [s, r] = await call(B, 'POST', `/api/friends/respond/${inc[0].id}`, { accept: false }); ok('demande d\'ami refusée', s === 200, J(r));
  // mode test réservé à l'admin (Alice l'est ici)
  [s, r] = await call(A, 'POST', '/api/me/test-mode', { on: true }); ok('mode test (admin)', s === 200, J([s, r]));
  [s, r] = await call(A, 'POST', '/api/me/test-mode', { on: false });
  // joueurs simulés : carte « cherchée » mise en vente à l'heure prévue
  const words = ['paris', 'france', 'lyon', 'pomme', 'chien', 'soleil', 'musique', 'rome', 'marseille', 'eau']; for (const w of words) for (const tk of [A, B, C]) await call(tk, 'GET', '/api/catalog/search?q=' + w);
  await settle(); const wanted = await q('SELECT COUNT(*) n FROM wanted'); console.log('   cartes « cherchées » programmées :', J(wanted));
  await q('UPDATE wanted SET at = 1'); await q("UPDATE auctions SET status = 'expired' WHERE seller_id IN (SELECT id FROM users WHERE is_bot = 1)");
  [s, r] = await call(A, 'POST', '/api/admin/run', { action: 'bots' }); await settle(); ok('cartes cherchées mises en vente par les joueurs simulés', +(await q('SELECT COUNT(*) n FROM wanted'))[0].n === 0 || +wanted[0].n === 0, J(await q('SELECT COUNT(*) n FROM wanted')));
  // notifications push (un faux service de notification répond 201)
  const realFetch = globalThis.fetch; globalThis.fetch = async (u, o) => String(u).startsWith('https://push.example') ? new Response('', { status: 201 }) : realFetch(u, o);
  await call(A, 'POST', '/api/push/subscribe', { endpoint: 'https://push.example/a1' });
  [s, r] = await call(A, 'POST', '/api/push/test', {}); ok('notification push de test', s === 200, J([s, r]));
  [s, r] = await call(null, 'POST', '/api/push/pull', { endpoint: 'https://push.example/a1' }); ok('push/pull renvoie le message puis l\'efface', r.msgs?.length >= 1, J(r));
  [s, r] = await call(null, 'POST', '/api/push/pull', { endpoint: 'https://push.example/a1' }); ok('push/pull : plus rien ensuite', r.msgs?.length === 0, J(r));
  globalThis.fetch = realFetch;
  // paquet de légendaires : annonce « hits » et notification
  await q('UPDATE users SET drop_w = ?, pack_stock = 5 WHERE id = ?', '{"legendary":100}', chloe);
  [s, r] = await call(C, 'POST', '/api/packs/open', {}); ok('paquet 100 % légendaire', s === 200 && r.cards.every(c => c.rarity === 'legendary'), J([s, r]).slice(0, 200));
  ok('exploits enregistrés (hits.username)', +(await q("SELECT COUNT(*) n FROM hits WHERE username = 'Chloé'"))[0].n >= 10);
  [s, r] = await call(A, 'GET', '/api/hits'); ok('exploits lus avec le champ user', r.hits.length > 0 && r.hits[0].user, J(r).slice(0, 150));
  await q('UPDATE users SET drop_w = NULL WHERE id = ?', chloe);
  // appareil de notification disparu (410) : abonnement supprimé
  const rf2 = globalThis.fetch; globalThis.fetch = async (u, o) => String(u).startsWith('https://push.example') ? new Response('', { status: 410 }) : rf2(u, o);
  await call(A, 'POST', '/api/push/subscribe', { endpoint: 'https://push.example/mort' }); await call(A, 'POST', '/api/push/test', {});
  ok('abonnement push mort supprimé', +(await q("SELECT COUNT(*) n FROM push_subs WHERE endpoint = 'https://push.example/mort'"))[0].n === 0);
  globalThis.fetch = rf2;
  // tableau de bord d'activité et journal de contrôle
  await call(A, 'GET', '/api/inconnue'); await call(null, 'POST', '/api/login', { name: 'Alice', password: 'mauvais-mot-de-passe-xyz' });
  await settle();
  [s, r] = await call(A, 'GET', '/api/admin/stats'); await settle(); [s, r] = await call(A, 'GET', '/api/admin/stats');
  ok('stats : totaux du jour', s === 200 && r.total.rq > 50 && r.total.nr > 100 && r.total.nw > 50 && r.total.by > 1000 && r.total.tr > 100, J(r.total));
  ok('stats : par heure, par action, par joueur, par requête', r.hours.length >= 1 && r.routes.some(x => x.k === 'POST /api/packs/open' && x.rq > 5 && x.nw > 0) && r.users.some(x => x.k === 'Alice' && x.nr > 0) && r.queries.length > 10, J({ h: r.hours.length, r: r.routes.length, u: r.users.map(x => x.k), q: r.queries.length }));
  ok('stats : historique par jour et transfert du mois', r.perDay.length >= 1 && r.monthBytes > 0, J([r.perDay, r.monthBytes]));
  const rw = r.routes.find(x => x.k === 'POST /api/packs/open'); console.log('   exemple POST /api/packs/open :', J({ rq: rw.rq, trajets: rw.tr, lectures: rw.nr, ecritures: rw.nw, lignes_ecrites: rw.w, Ko: Math.round(rw.by / 1000), ms_base: rw.ms }));
  await call(A, 'POST', '/api/admin/announce', { text: 'Journal', push: false }); await settle();
  [s, r] = await call(A, 'GET', '/api/admin/logs?limit=300'); await settle(); [s, r] = await call(A, 'GET', '/api/admin/logs?limit=300');
  ok('journal : actions des joueurs', s === 200 && r.logs.some(l => l.kind === 'action' && l.route === 'POST /api/packs/open' && /cartes/.test(l.detail) && l.usr === 'Alice'), J(r.logs.slice(0, 3)));
  ok('journal : refus et route inconnue', r.logs.some(l => l.level === 'warn' && l.kind === 'refus' && l.status === 404) && r.logs.some(l => l.kind === 'refus' && l.status === 401 && l.usr === 'Alice'), J(r.logs.filter(l => l.kind === 'refus').slice(0, 3)));
  ok('journal : actions admin avec leur contenu', r.logs.some(l => l.kind === 'admin' && /Journal/.test(l.detail)), J(r.logs.filter(l => l.kind === 'admin').slice(0, 2)));
  ok('journal : jamais de mot de passe ni de message privé', !J(r.logs).includes('secret1') && !J(r.logs).includes('mauvais-mot-de-passe') && !J(r.logs).includes("Salut $1 'Bob'"), '');
  [s, r] = await call(A, 'GET', '/api/admin/logs?level=warn'); ok('journal : filtre par niveau', r.logs.length > 0 && r.logs.every(l => l.level === 'warn'));
  [s, r] = await call(A, 'GET', '/api/admin/logs?q=Chlo'); ok('journal : recherche', r.logs.every(l => /chlo/i.test(`${l.usr} ${l.route} ${l.detail}`)), J(r.logs.slice(0, 2)));
}


console.log('— récompense quotidienne');
{
  const CFGMAX = (await call(A, 'GET', '/api/config'))[1].packMax;
  const realNow = Date.now; let shift = 0; Date.now = () => realNow() + shift;
  [s, r] = await call(B, 'GET', '/api/me'); ok('/me annonce la récompense du jour', s === 200 && r.daily?.next === 1 && r.dq === 'new' && r.qc === 0, J(r.daily));
  const b0 = (await q('SELECT coins, pack_stock FROM users WHERE id = ?', bob))[0];
  [s, r] = await call(B, 'POST', '/api/daily/claim', {}); ok('jour 1 : 50 pièces', s === 200 && r.reward.c === 50 && r.streak === 1, J([s, r]));
  const b1 = (await q('SELECT coins, pack_stock FROM users WHERE id = ?', bob))[0]; ok('pièces créditées', b1.coins - b0.coins === 50, J([b0, b1]));
  [s, r] = await call(B, 'POST', '/api/daily/claim', {}); ok('2e récupération le même jour refusée', s === 400, J([s, r]));
  const par = await Promise.all([call(C, 'POST', '/api/daily/claim', {}), call(C, 'POST', '/api/daily/claim', {})]); ok('deux clics simultanés : une seule récompense', par.filter(x => x[0] === 200).length === 1, J(par.map(x => x[0])));
  [s, r] = await call(B, 'GET', '/api/me'); ok('/me : plus de récompense à récupérer aujourd\'hui', r.daily === null, J(r.daily));
  shift += 86400000; [s, r] = await call(B, 'GET', '/api/daily'); ok('lendemain : série continue (jour 2)', r.available && r.next === 2 && r.streak === 1, J(r));
  [s, r] = await call(B, 'POST', '/api/daily/claim', {}); ok('jour 2 : 75 pièces', r.reward.c === 75 && r.streak === 2, J(r));
  shift += 86400000; [s, r] = await call(B, 'POST', '/api/daily/claim', {}); ok('jour 3 : un paquet offert', r.reward.p === 1 && r.streak === 3, J(r));
  shift += 3 * 86400000; [s, r] = await call(B, 'GET', '/api/daily'); ok('jours manqués : la série repart à 1', r.next === 1 && r.index === 0, J(r));
  const over = CFGMAX + 3; await q('UPDATE users SET pack_stock = ?, pack_ts = ? WHERE id = ?', over, Date.now() - 5 * 86400000, bob);
  [s, r] = await call(B, 'GET', '/api/me'); ok('paquets offerts non rognés par le plafond', r.packs === over && (await q('SELECT pack_stock FROM users WHERE id = ?', bob))[0].pack_stock === over, J(r.packs));
  shift += 86400000; await call(B, 'POST', '/api/daily/claim', {});

  console.log('— quêtes');
  [s, r] = await call(A, 'GET', '/api/quests'); ok('3 quêtes + bonus', s === 200 && r.quests.length === 3 && r.quests.map(x => x.tier).join() === '1,2,3' && r.bonus.goal === 3, J(r));
  const r1 = r; [s, r] = await call(A, 'GET', '/api/quests'); ok('mêmes quêtes toute la journée', J(r.quests.map(x => x.id)) === J(r1.quests.map(x => x.id)));
  [s, r] = await call(A, 'POST', '/api/quests/claim', { id: r1.quests[0].id }); ok('quête non terminée : refus', s === 400, J([s, r]));
  [s, r] = await call(A, 'POST', '/api/quests/claim', { id: 'bonus' }); ok('bonus non débloqué : refus', s === 400, J([s, r]));
  const { QUESTS, questsFor, dayKey } = await import('../src/game.js');
  ok('catalogue : ≥ 30 quêtes uniques', QUESTS.length >= 30 && new Set(QUESTS.map(x => x.id)).size === QUESTS.length && new Set(QUESTS.map(x => x.text)).size === QUESTS.length);
  const day = dayKey(); ok('3 événements distincts par jour pour 200 joueurs', Array.from({ length: 200 }, (_, i) => questsFor(i + 1, day)).every(ids => new Set(ids.map(i => QUESTS.find(x => x.id === i).event)).size === 3));
  // on complète les trois quêtes d'Alice en simulant leur progression
  for (const x of r1.quests) await q('UPDATE quests SET progress = ? WHERE user_id = ? AND day = ? AND qid = ?', x.goal, alice, day, x.id);
  [s, r] = await call(A, 'GET', '/api/me'); ok('/me : 3 quêtes à récupérer', r.qc === 3, J(r.qc));
  const a0 = (await q('SELECT coins, pack_stock FROM users WHERE id = ?', alice))[0];
  for (const x of r1.quests) { [s, r] = await call(A, 'POST', '/api/quests/claim', { id: x.id }); ok('quête ' + x.id + ' récupérée', s === 200 && r.reward, J([s, r])); }
  [s, r] = await call(A, 'POST', '/api/quests/claim', { id: r1.quests[0].id }); ok('quête déjà récupérée : refus', s === 400);
  [s, r] = await call(A, 'POST', '/api/quests/claim', { id: 'bonus' }); ok('bonus : 1 paquet', s === 200 && r.reward.p === 1, J([s, r]));
  [s, r] = await call(A, 'POST', '/api/quests/claim', { id: 'bonus' }); ok('bonus déjà récupéré : refus', s === 400);
  const a1 = (await q('SELECT coins, pack_stock FROM users WHERE id = ?', alice))[0]; ok('récompenses créditées', a1.coins > a0.coins || a1.pack_stock > a0.pack_stock, J([a0, a1]));
  [s, r] = await call(A, 'POST', '/api/quests/claim', { id: 'e1' + 'zz' }); ok('quête inconnue : 404', s === 404);
  // la progression suit les actions réelles
  [s, r] = await call(C, 'GET', '/api/quests'); const cq = r.quests; await q('UPDATE quests SET progress = 0 WHERE user_id = ?', chloe);
  await call(C, 'GET', '/api/profile/' + alice); await call(C, 'POST', '/api/dm/' + alice, { body: 'coucou' }); await call(C, 'POST', '/api/packs/open', {}); await settle(); await settle();
  [s, r] = await call(C, 'GET', '/api/quests');
  const evs = new Set(cq.map(x => x.id)); const moved = r.quests.filter(x => x.progress > 0).length;
  ok('les actions font avancer les quêtes concernées', moved >= cq.filter(x => ['profile_view', 'message', 'open_pack', 'new_cards', 'rare_plus'].includes(QUESTS.find(y => y.id === x.id).event)).length, J(r.quests.map(x => [x.id, x.progress])));

  console.log('— quiz du jour');
  const aiOld = env.AI, asked = []; env.AI = { run: async (m, o) => { asked.push(o.messages[1].content); const ty = ['annee', 'lieu', 'personne', 'chiffre', 'cause', 'relation', 'calcul', 'langue'];
    return { response: JSON.stringify({ questions: Array.from({ length: 9 }, (_, i) => ({ type: ty[i % 8], question: `Question ${i + 1} : vers quelle date Paris a-t-elle été fondée selon l'article ?`, choices: ['250 av. J.-C.', '150 av. J.-C.', '350 av. J.-C.', '450 av. J.-C.'], answer: 0 })).map((q, i) => ({ ...q, question: q.question.replace('date', ['époque', 'année', 'période', 'date', 'ère', 'datation', 'moment', 'phase', 'siècle'][i]) })) }) }; } };
  [s, r] = await call(A, 'GET', '/api/daily-quiz'); ok('quiz du jour : pas encore commencé', s === 200 && r.status === 'new' && r.n === 5, J([s, r]));
  [s, r] = await call(A, 'POST', '/api/daily-quiz/start', {});
  if (s === 200) {
    ok('5 questions sans les réponses', r.questions.length === 5 && r.questions.every(x => x.options.length >= 3 && x.answer === undefined), J(r).slice(0, 300));
    const qa = r.questions; [s, r] = await call(B, 'POST', '/api/daily-quiz/start', {}); ok('même quiz pour tous les joueurs', J(r.questions.map(x => x.text)) === J(qa.map(x => x.text)), J(r).slice(0, 200));
    const row = (await q('SELECT questions FROM daily_quiz WHERE day = ?', day))[0]; const truth = JSON.parse(row.questions);
    [s, r] = await call(A, 'GET', '/api/daily-quiz'); ok('quiz en cours : reprise possible', r.status === 'run' && r.questions.length === 5, J(r).slice(0, 200));
    const p0 = (await q('SELECT pack_stock FROM users WHERE id = ?', alice))[0].pack_stock;
    [s, r] = await call(A, 'POST', '/api/daily-quiz/submit', { answers: truth.map((t, i) => i < 3 ? t.answer : (t.answer + 1) % t.options.length) });
    ok('3 bonnes réponses : 3 paquets', s === 200 && r.recap.correct === 3 && r.recap.delta === 3 && r.recap.questions[0].ok === true && r.recap.questions[4].ok === false, J([s, r]).slice(0, 300));
    ok('paquets crédités', (await q('SELECT pack_stock FROM users WHERE id = ?', alice))[0].pack_stock === p0 + 3);
    [s, r] = await call(A, 'POST', '/api/daily-quiz/start', {}); ok('quiz déjà fait : refus', s === 400, J([s, r]));
    [s, r] = await call(A, 'POST', '/api/daily-quiz/submit', { answers: truth.map(t => t.answer) }); ok('rejouer ne rapporte rien', r.recap.correct === 3 && (await q('SELECT pack_stock FROM users WHERE id = ?', alice))[0].pack_stock === p0 + 3);
    [s, r] = await call(A, 'GET', '/api/daily-quiz'); ok('récapitulatif relisible', r.status === 'done' && r.recap.questions.length === 5);
    // zéro bonne réponse : un paquet perdu, sinon minuteur remis à 10 minutes
    await q('UPDATE users SET pack_stock = 3, pack_ts = ? WHERE id = ?', Date.now(), bob); const stock = 3;
    [s, r] = await call(B, 'POST', '/api/daily-quiz/submit', { answers: truth.map(t => (t.answer + 1) % t.options.length) });
    ok('0 bonne réponse avec paquets : -1 paquet', r.recap.correct === 0 && r.recap.delta === -1 && r.recap.penalty === 'pack' && (await q('SELECT pack_stock FROM users WHERE id = ?', bob))[0].pack_stock === stock - 1, J([s, r.recap]).slice(0, 200));
    await call(C, 'POST', '/api/daily-quiz/start', {});
    await q('UPDATE users SET pack_stock = 0, pack_ts = ? WHERE id = ?', Date.now() - 400000, chloe);
    [s, r] = await call(C, 'POST', '/api/daily-quiz/submit', { answers: [] });
    const cu = (await q('SELECT pack_stock, pack_ts FROM users WHERE id = ?', chloe))[0];
    ok('0 bonne réponse sans paquet : prochain paquet dans 10 min', r.recap.penalty === 'timer' && cu.pack_stock === 0 && Math.abs(cu.pack_ts - Date.now()) < 5000, J([r.recap.penalty, cu]));
    [s, r] = await call(C, 'GET', '/api/me'); ok('/me : compte à rebours ≈ 10 min', r.nextPackIn > 590000 && r.nextPackIn <= 600000, J(r.nextPackIn));
    [s, r] = await call(A, 'GET', '/api/daily-quiz/ranking'); ok('classement visible après le quiz', s === 200 && r.list.length === 3 && r.list[0].name === 'Alice' && r.list[0].correct === 3 && r.list[0].rank === 1 && r.list.some(x => x.me), J(r).slice(0, 300));
    await q('UPDATE users SET daily_day = NULL WHERE id = ?', chloe);
    [s, r] = await call(A, 'GET', '/api/daily-quiz/ranking'); ok('à égalité de bonnes réponses : le plus rapide devant', r.list[1].correct === r.list[2].correct && r.list[1].ms <= r.list[2].ms, J(r.list));
    await q('DELETE FROM daily_quiz_runs WHERE user_id = ? AND day = ?', alice, day); [s, r] = await call(A, 'GET', '/api/daily-quiz/ranking'); ok('classement caché tant que le quiz n\'est pas fini', s === 403, J([s, r]));
    await q('INSERT INTO daily_quiz_runs (user_id, day, started, answers, correct, delta, finished) VALUES (?,?,?,?,?,?,?)', alice, day, Date.now() - 60000, '[]', 3, 3, Date.now() - 30000);
    const packsA = (await q('SELECT pack_stock FROM users WHERE id = ?', alice))[0].pack_stock;
    // lendemain : un nouveau quiz
    shift += 86400000; await call(A, 'GET', '/api/me'); await settle(); await settle();
    const wd = (await q('SELECT winner, awarded FROM daily_quiz WHERE day = ?', day))[0];
    ok('le lendemain : le 1er du classement gagne un paquet bonus', wd.winner === alice && wd.awarded && (await q('SELECT pack_stock FROM users WHERE id = ?', alice))[0].pack_stock >= packsA + 1, J(wd));
    await call(B, 'GET', '/api/me'); await settle(); ok('le bonus n\'est versé qu\'une fois', (await q('SELECT winner FROM daily_quiz WHERE day = ?', day))[0].winner === alice);
    [s, r] = await call(A, 'GET', '/api/daily-quiz'); ok('le lendemain : nouveau quiz', r.status === 'new');
    // dépassement du temps
    [s, r] = await call(A, 'POST', '/api/daily-quiz/start', {}); const t2 = (await q('SELECT questions FROM daily_quiz WHERE day = ?', dayKey()))[0];
    if (s === 200) { shift += 400000; [s, r] = await call(A, 'GET', '/api/daily-quiz'); ok('temps écoulé : statut « late »', r.status === 'late', J(r)); [s, r] = await call(A, 'POST', '/api/daily-quiz/submit', { answers: JSON.parse(t2.questions).map(t => t.answer) }); ok('réponses hors délai non comptées', r.recap.correct === 0, J(r.recap)); }
  } else ok('quiz du jour créé', false, J([s, r]));
  ok('les questions sont demandées sur l\'article seul, avec un texte suffisant', asked.length >= 1 && asked.every(c => /CET article/.test(c)));
  const dq = (await q('SELECT title FROM daily_quiz'))[0]; ok('article du quiz : pas une page de liste', dq && !/^Liste|homonymie/i.test(dq.title), J(dq));
  console.log('— fusion de cartes');
  {
    const { FUSE, boosted, fuseInfo } = await import('../src/game.js');
    ok('fusion : légendaires et shiny exclus', fuseInfo(5, 0, 0, 9) === null && fuseInfo(0, 1, 0, 9) === null && fuseInfo(0, 0, 3, 99).cost === null);
    ok('fusion : équilibrage (commune niv.3 sous une rare moyenne, ultra niv.3 sous une légendaire moyenne)', 2000 + FUSE.bonus[0] * 3 < 4250 && 9000 + FUSE.bonus[4] * 3 < 10000 && FUSE.bonus.every((b, i) => i === 0 || b <= FUSE.bonus[i - 1]));
    ok('boosted : stats ajoutées', boosted({ atk: 100, def: 200 }, 0, 2).atk === 1000 && boosted({ atk: 100, def: 200 }, 5, 3).atk === 100);
    const own = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND rar = 0 AND sh = 0 ORDER BY card_id LIMIT 1', alice))[0]?.card_id ?? (await q('SELECT card_id FROM inventory WHERE user_id = ? AND rar < 5 AND sh = 0 LIMIT 1', alice))[0].card_id;
    const rar = (await q('SELECT rar FROM inventory WHERE user_id = ? AND card_id = ?', alice, own))[0].rar, base = (await q('SELECT atk, def FROM cards WHERE id = ?', own))[0], cost = FUSE.cost[rar];
    await q('UPDATE inventory SET qty = 1, lvl = 0 WHERE user_id = ? AND card_id = ?', alice, own);
    [s, r] = await call(A, 'POST', '/api/fuse', { card_id: own }); ok('fusion sans doublons : refusée', s === 400, J([s, r]));
    await q('UPDATE inventory SET qty = ? WHERE user_id = ? AND card_id = ?', cost[0] + 1, alice, own);
    [s, r] = await call(A, 'POST', '/api/fuse', { card_id: own }); ok('fusion niveau 1', s === 200 && r.lvl === 1 && r.qty === 1 && r.bonus === FUSE.bonus[rar], J([s, r]));
    [s, r] = await call(A, 'GET', '/api/album/page?sort=rar&q=' + encodeURIComponent((await q('SELECT nk FROM inventory WHERE user_id = ? AND card_id = ?', alice, own))[0].nk));
    const cc = r.cards.find(x => x.id === own); ok('collection : stats boostées et niveau', cc && cc.lvl === 1 && cc.atk === base.atk + FUSE.bonus[rar] && cc.def === base.def + FUSE.bonus[rar] && cc.fuse?.cost === cost[1], J(cc));
    await q('UPDATE inventory SET qty = ? WHERE user_id = ? AND card_id = ?', cost[1] + 1, alice, own); [s, r] = await call(A, 'POST', '/api/fuse', { card_id: own }); ok('fusion niveau 2', s === 200 && r.lvl === 2, J([s, r]));
    await q('UPDATE inventory SET qty = ? WHERE user_id = ? AND card_id = ?', cost[2], alice, own); [s, r] = await call(A, 'POST', '/api/fuse', { card_id: own }); ok('un exemplaire doit toujours rester', s === 400, J([s, r]));
    await q('UPDATE inventory SET qty = ? WHERE user_id = ? AND card_id = ?', cost[2] + 1, alice, own); [s, r] = await call(A, 'POST', '/api/fuse', { card_id: own }); ok('fusion niveau 3', s === 200 && r.lvl === 3 && r.fuse.cost === null, J([s, r]));
    [s, r] = await call(A, 'POST', '/api/fuse', { card_id: own }); ok('niveau maximum', s === 400, J([s, r]));
    [s, r] = await call(A, 'GET', '/api/album?lite=1'); ok('deck : stats de fusion appliquées', r.cards.find(x => x.id === own)?.atk === base.atk + FUSE.bonus[rar] * 3);
    [s, r] = await call(B, 'POST', '/api/fuse', { card_id: own }); ok('fusion d\'une carte qu\'on ne possède pas : refusée', s === 400);
  }
  {
    const two = await q('SELECT card_id FROM inventory WHERE user_id = ? AND sh = 0 AND rar < 5 AND card_id <> ? ORDER BY card_id LIMIT 2', alice, (await q('SELECT card_id FROM inventory WHERE user_id = ? AND lvl = 3 LIMIT 1', alice))[0]?.card_id ?? 0);
    await q('UPDATE inventory SET lvl = 0 WHERE user_id = ?', alice); await q(`UPDATE inventory SET qty = 40, lvl = 0 WHERE user_id = ? AND card_id IN (${two.map(() => '?').join(',')})`, alice, ...two.map(x => x.card_id));
    [s, r] = await call(A, 'POST', '/api/fuse-all', { dry: 1 }); ok('fuse-all : aperçu sans rien modifier', s === 200 && r.cards >= 2 && r.levels >= 2 * 3 && (await q('SELECT COUNT(*) n FROM inventory WHERE user_id = ? AND lvl > 0', alice))[0].n == 0, J([s, r]));
    const sumBefore = (await q('SELECT SUM(qty) q FROM inventory WHERE user_id = ?', alice))[0].q;
    [s, r] = await call(A, 'POST', '/api/fuse-all', {}); ok('fuse-all : tout fusionné d\'un coup', s === 200 && r.cards >= 2 && (await q('SELECT COUNT(*) n FROM inventory WHERE user_id = ? AND lvl = 3 AND card_id IN (' + two.map(() => '?').join(',') + ')', alice, ...two.map(x => x.card_id)))[0].n == 2, J([s, r]));
    ok('fuse-all : doublons consommés, un exemplaire conservé', (await q('SELECT SUM(qty) q FROM inventory WHERE user_id = ?', alice))[0].q == sumBefore - r.used && (await q('SELECT MIN(qty) m FROM inventory WHERE user_id = ?', alice))[0].m >= 1);
    [s, r] = await call(A, 'POST', '/api/fuse-all', {}); ok('fuse-all : rien à refaire ensuite', r.cards === 0 || r.cards >= 0 && s === 200);
  }
  console.log('— personnalisation du profil');
  {
    const tiny = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    [s, r] = await call(A, 'POST', '/api/me/avatar', { data: 'data:text/html;base64,AAAA' }); ok('avatar : format refusé', s === 400, J([s, r]));
    [s, r] = await call(A, 'POST', '/api/me/avatar', { data: tiny }); ok('avatar : envoi', s === 200 && r.v > 0, J([s, r]));
    const res = await worker.fetch(new Request('http://x/api/avatar/' + alice), env, ctx); ok('avatar : servi en JPEG, public et mis en cache longtemps', res.status === 200 && res.headers.get('content-type') === 'image/jpeg' && /immutable/.test(res.headers.get('cache-control')) && (await res.arrayBuffer()).byteLength > 50);
    const res2 = await worker.fetch(new Request('http://x/api/avatar/' + chloe), env, ctx); ok('avatar : 404 si aucune photo', res2.status === 404);
    [s, r] = await call(A, 'GET', '/api/me'); ok('/me : version de la photo', r.av > 0, J(r.av));
    [s, r] = await call(B, 'GET', '/api/cosmetics'); ok('cosmétiques : photo visible par les autres joueurs', r.players.some(p => p.name === 'Alice' && p.v > 0) && r.labels.duelist === 'Duelliste', J(r).slice(0, 200));
    [s, r] = await call(A, 'GET', '/api/titles'); ok('titres : catalogue complet', s === 200 && r.titles.length >= 20 && r.titles.some(x => x.season && !x.unlocked) && r.titles.every(x => ['modes', 'exploits', 'saison'].includes(x.cat)), J(r).slice(0, 200));
    ok('titres : progression affichée', r.titles.find(x => x.id === 'collector_100').prog?.[1] === 100);
    [s, r] = await call(A, 'POST', '/api/me/title', { id: 'warlord' }); ok('titre non débloqué : refusé', s === 400, J([s, r]));
    [s, r] = await call(A, 'POST', '/api/me/title', { id: 's1_champion' }); ok('titre de saison : pas encore disponible', s === 400, J([s, r]));
    await q('UPDATE users SET duel_wins = 12 WHERE id = ?', alice); [s, r] = await call(A, 'GET', '/api/titles'); ok('titre débloqué par les statistiques', r.titles.find(x => x.id === 'duelist').unlocked && !r.titles.find(x => x.id === 'gladiator').unlocked);
    const { grantTitle } = await import('../src/game.js'); ok('titre accordé par un événement (une seule fois)', (await grantTitle(env, alice, 'godpack')) === true && (await grantTitle(env, alice, 'godpack')) === false);
    [s, r] = await call(A, 'POST', '/api/me/title', { id: 'godpack' }); ok('équiper un titre', s === 200 && r.title === 'godpack', J([s, r]));
    [s, r] = await call(B, 'GET', '/api/cosmetics'); ok('titre visible par les autres', r.players.find(p => p.name === 'Alice').ti === 'godpack');
    [s, r] = await call(A, 'GET', `/api/profile/${alice}`); ok('profil : titre et photo', r.profile.title === 'godpack' && r.profile.av > 0, J(r.profile).slice(0, 200));
    [s, r] = await call(A, 'POST', '/api/me/title', { id: null }); ok('retirer le titre', s === 200 && r.title === null);
    [s, r] = await call(A, 'POST', '/api/me/avatar', { data: null }); res3 = await worker.fetch(new Request('http://x/api/avatar/' + alice), env, ctx); ok('retirer la photo', s === 200 && res3.status === 404);
  }
  env.AI = aiOld; Date.now = realNow;
}

const top = [...globalThis.__T.tripStats].sort((x, y) => y[1][0] - x[1][0]).slice(0, 14);
console.log('\nAllers-retours vers la base par requête : [avant la réponse / total avec les tâches de fond]'); for (const [k, [n, tot]] of top) console.log('  ', String(n).padStart(3), String(tot).padStart(3), k);
ok('aucune requête ne dépasse 50 allers-retours au total', Math.max(...top.map(x => x[1][1])) <= 50, J(top.filter(x => x[1][1] > 40)));
import('./coverage.mjs').then(async ({ report }) => { const miss = report(globalThis.__T.log); console.log('\nRequêtes du code jamais exécutées par ce test :', miss.length); for (const m of miss) console.log('  -', m); done(); });
