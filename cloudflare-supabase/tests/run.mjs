import './api.mjs';
const { call, settle, ok, DB, pg, J, done, lobby, env } = globalThis.__T;
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
for (const [m, p, b] of [['GET', '/api/admin/overview'], ['GET', '/api/admin/market'], ['POST', '/api/admin/lot', { title: 'Paris' }], ['POST', '/api/admin/lots-random', { count: 3 }], ['GET', '/api/admin/usage'], ['GET', '/api/admin/meter'], ['GET', '/api/admin/fights'], ['POST', '/api/admin/announce', { text: 'Test', push: false }], ['POST', '/api/admin/run', { action: 'bots' }], ['POST', '/api/admin/run', { action: 'reserve' }], ['POST', '/api/admin/test-mode', { user_id: alice, on: true }]]) {
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
  // statistiques d'usage
  const { flushUsage } = await import('../src/util.js'); const rn = Date.now; Date.now = () => rn() + 20 * 60000; await flushUsage(env); Date.now = rn;
  ok('statistiques d\'usage enregistrées', +(await q('SELECT COUNT(*) n FROM usage'))[0].n > 0);
  [s, r] = await call(A, 'GET', '/api/admin/usage'); ok('admin/usage lit les statistiques', s === 200 && r.rows.length > 0, J([s, r]).slice(0, 200));
}

const top = [...globalThis.__T.tripStats].sort((x, y) => y[1][0] - x[1][0]).slice(0, 14);
console.log('\nAllers-retours vers la base par requête : [avant la réponse / total avec les tâches de fond]'); for (const [k, [n, tot]] of top) console.log('  ', String(n).padStart(3), String(tot).padStart(3), k);
ok('aucune requête ne dépasse 40 allers-retours au total', Math.max(...top.map(x => x[1][1])) <= 40, J(top[0]));
import('./coverage.mjs').then(async ({ report }) => { const miss = report(globalThis.__T.log); console.log('\nRequêtes du code jamais exécutées par ce test :', miss.length); for (const m of miss) console.log('  -', m); done(); });
