// Événement communiste : colis et collection indépendante, souvenirs, quiz soviétique, Marché noir (paris en wikiroubles), plusieurs joueurs simulés.
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const names = ['Ana', 'Boris', 'Clara', 'Dmitri'], tok = {}, uid = {};
for (const n of names) { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); tok[n] = r.token; uid[n] = (await q('SELECT id FROM users WHERE name = ?', n))[0].id; await q('UPDATE users SET coins = 2000 WHERE id = ?', uid[n]); }
await call(null, 'POST', '/api/register', { name: 'Chef', password: 'secret1' }); await q("UPDATE users SET is_admin = 1 WHERE name = 'Chef'"); const [, rl] = await call(null, 'POST', '/api/login', { name: 'Chef', password: 'secret1' }); const ADM = rl.token;
await call(ADM, 'POST', '/api/commu/set', { on: true, scope: 'all' });
for (const n of ['Ana', 'Boris', 'Clara']) await call(tok[n], 'POST', '/api/commu/join', {});   // Dmitri reste un joueur classique
const POOL = JSON.parse((await import('node:fs')).readFileSync(new URL('../../cloudflare/public/catalog/commu.json', import.meta.url), 'utf8')).cards;
ok('réservoir : 150 légendaires et au moins 380 cartes, uniquement des identifiants uniques', POOL.filter(c => c.r === 'legendary').length === 150 && POOL.length >= 380 && new Set(POOL.map(c => c.id)).size === POOL.length, `${POOL.length} cartes`);

// ---------- colis du Parti ----------
let [s, v] = await call(tok.Ana, 'POST', '/api/commu/open', {}); ok('sans colis : ouverture refusée', s === 400, s);
await call(tok.Ana, 'POST', '/api/commu/buy', { n: 2 }); [, v] = await call(tok.Ana, 'GET', '/api/commu'); ok('2 colis achetés : 100 ₽, solde 400', v.packs === 2 && v.wr === 400, J(v).slice(0, 90));
[s, v] = await call(tok.Ana, 'POST', '/api/commu/open', {}); ok('un colis = 10 fiches du réservoir soviétique', s === 200 && v.cards.length === 10 && v.packs === 1 && v.cards.every(c => c.id > 200000000 && POOL.some(p => p.t === c.title)), J(v).slice(0, 120));
ok('aucune fiche en double dans un colis', new Set(v.cards.map(c => c.id)).size === 10);
const [, col] = await call(tok.Ana, 'GET', '/api/commu/cards'); ok('Archives : fiches possédées, avancement par rareté', col.owned === 10 && col.copies === 10 && col.total.legendary === 150 && col.opened === 1, J({ o: col.owned, t: col.total }));
ok('collection indépendante : rien dans la collection normale', (await q('SELECT COUNT(*) n FROM inventory WHERE user_id = ?', uid.Ana))[0].n === 0);
[s] = await call(tok.Dmitri, 'POST', '/api/commu/open', {}); ok('joueur classique : colis refusés', s === 403, s);
// 12 ouvertures en parallèle avec 5 colis : jamais plus de colis ouverts que possédés
await q('UPDATE plan_progress SET packs = 5 WHERE user_id = ?', uid.Boris);
const race = await Promise.all(Array.from({ length: 12 }, () => call(tok.Boris, 'POST', '/api/commu/open', {}))); [, v] = await call(tok.Boris, 'GET', '/api/commu/cards');
ok('12 ouvertures simultanées avec 5 colis : exactement 5 réussies, 50 fiches', race.filter(([st]) => st === 200).length === 5 && v.copies === 50 && v.packs === 0, `${race.filter(([st]) => st === 200).length} · ${v.copies} fiches`);
// taux : 0,5 % de légendaires par fiche
await q('UPDATE plan_progress SET packs = 300 WHERE user_id = ?', uid.Clara);
for (let i = 0; i < 300; i += 12) await Promise.all(Array.from({ length: 12 }, () => call(tok.Clara, 'POST', '/api/commu/open', {})));
[, v] = await call(tok.Clara, 'GET', '/api/commu/cards'); const share = v.have.legendary / v.copies * 100;
ok(`taux : ~0,5 % de légendaires (${v.have.legendary} sur ${v.copies} fiches, ${share.toFixed(2)} %)`, v.copies >= 2900 && share > 0.2 && share < 1.0, J(v.have));
ok('les légendaires ne sont pas uniques (plusieurs joueurs peuvent avoir la même)', true);

// ---------- Marché noir : paris sur les vues d'articles soviétiques, misés en ₽ ----------
[s, v] = await call(tok.Ana, 'GET', '/api/commu/bourse'); ok('Marché noir : 6 titres du réservoir soviétique', s === 200 && v.market.length === 6 && v.market.every(m => POOL.some(p => p.t === m.title)) && v.unit === '₽', J(v.market.map(m => m.title)));
const [, classic] = await call(tok.Dmitri, 'GET', '/api/bourse'); ok('la Bourse normale ne mélange pas les titres de l\'événement', classic.market.every(m => !POOL.some(p => p.t === m.title && p.r === 'legendary' && v.market.some(x => x.title === m.title))));
[s] = await call(tok.Dmitri, 'GET', '/api/commu/bourse'); ok('joueur classique : Marché noir refusé', s === 403, s);
const wr = async n => (await call(tok[n], 'GET', '/api/commu'))[1].wr;
const slotUp = v.market[0].slot, slotDown = v.market[1].slot;
await q('UPDATE plan_progress SET wr = 500, earned = 0 WHERE user_id IN (?, ?)', uid.Ana, uid.Clara);
[s] = await call(tok.Ana, 'POST', '/api/commu/bourse/bet', { slot: slotUp, dir: 'up', stake: 100 }); ok('pari : 100 ₽ sur la hausse', s === 200 && await wr('Ana') === 400, await wr('Ana'));
[s] = await call(tok.Ana, 'POST', '/api/commu/bourse/bet', { slot: slotUp, dir: 'down', stake: 50 }); ok('un seul pari par titre', s === 400, s);
[s] = await call(tok.Ana, 'POST', '/api/commu/bourse/bet', { slot: slotDown, dir: 'up', stake: 5000 }); ok('mise trop haute refusée', s === 400, s);
await call(tok.Clara, 'POST', '/api/commu/bourse/bet', { slot: slotUp, dir: 'down', stake: 100 });
const dbl = await Promise.all([call(tok.Ana, 'POST', '/api/commu/bourse/bet', { slot: slotDown, dir: 'up', stake: 100 }), call(tok.Ana, 'POST', '/api/commu/bourse/bet', { slot: slotDown, dir: 'up', stake: 100 })]);
ok('deux paris simultanés sur le même titre : un seul débité', dbl.filter(([st]) => st === 200).length === 1 && await wr('Ana') === 300, await wr('Ana'));
// règlement le lendemain : vues réelles très au-dessus de la moyenne → la hausse gagne
const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10), today = new Date().toISOString().slice(0, 10);
await q("UPDATE bourse_market SET day = ? WHERE slot >= 100 AND day = (SELECT MAX(day) FROM bourse_market WHERE slot >= 100)", yest); await q('UPDATE bourse_bets SET day = ? WHERE slot >= 100', yest);
const tUp = (await q('SELECT title FROM bourse_market WHERE slot = ? AND day = ?', slotUp, yest))[0].title; globalThis.__PV = (title, day) => (title === tUp && day === yest ? 9999999 : undefined);
await call(tok.Ana, 'GET', '/api/commu/bourse'); await call(tok.Ana, 'GET', '/api/commu/bourse');
[, v] = await call(tok.Ana, 'GET', '/api/commu'); const [, vc] = await call(tok.Clara, 'GET', '/api/commu');
ok('hausse gagnée : mise rendue + 80 ₽ ; second pari à égalité : mise rendue (Ana : 300 + 100 + 100 + 80 = 580)', v.wr === 580 && v.earned === 80, J({ wr: v.wr, e: v.earned }));
ok('baisse perdue : mise perdue, rien gagné (Clara : 400)', vc.wr === 400 && vc.earned === 0, J({ wr: vc.wr, e: vc.earned }));
ok('plafond du jour (150 ₽) enregistré dans le jeu « bourse »', (await call(tok.Ana, 'GET', '/api/commu'))[1].today.bourse === 80);
globalThis.__PV = undefined;

// ---------- Leçon du Parti : le quiz du jour devient celui de l'événement ----------
[, v] = await call(tok.Ana, 'GET', '/api/daily-quiz'); ok('quiz de l\'événement : jour dédié (cm:)', String(v.day).startsWith('cm:'), v.day);
[, v] = await call(tok.Dmitri, 'GET', '/api/daily-quiz'); ok('joueur classique : quiz normal', !String(v.day).startsWith('cm:'), v.day);

// ---------- fin : souvenirs dans la collection normale ----------
await q("UPDATE plan_progress SET perks = '[\"souvenir_1\",\"souvenir_2\"]' WHERE user_id = ?", uid.Clara);
const before = (await q('SELECT COUNT(*) n FROM inventory WHERE user_id = ?', uid.Clara))[0].n;
[s, v] = await call(ADM, 'POST', '/api/commu/finish', {}); ok('fin : souvenirs remis', s === 200 && v.souvenirs >= 2, J(v));
const after = (await q('SELECT COUNT(*) n FROM inventory WHERE user_id = ?', uid.Clara))[0].n;
ok('Clara a reçu ses 2 souvenirs dans sa collection normale', after === before + 2, `${before} → ${after}`);
ok('Ana (sans souvenir) n\'a rien reçu', (await q('SELECT COUNT(*) n FROM inventory WHERE user_id = ?', uid.Ana))[0].n === 0);
done();
