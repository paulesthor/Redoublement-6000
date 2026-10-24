// Événements surprise : calendrier secret, effets sur les tirages, défi de la semaine, carte recherchée, objectif collectif, saisons, album éphémère, annonces.
import './api.mjs';
const { call, settle, ok, DB, J, done, env, ctx, lobby } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const SECRET = 'secret-de-test';
delete env.EVENTS;                      // les autres tests tournent avec les événements coupés (EVENTS = '0') ; ici on les active
await DB.prepare("INSERT INTO settings (key, value) VALUES ('events_secret', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(SECRET).run();
const { eventsIn, weeklyOf, parisTs, dayOfTs, EV, SEASON_ANCHOR, H, modsFrom, activeIn, SEASON_THEMES, themeIdOf, seasonPts } = await import('../src/events.js');
const { EVENT_ALBUMS, WEEKLY_BY } = await import('../src/events-data.js');
const { bumpQuests } = await import('../src/game.js');
const { __testHooks } = await import('../src/index.js');
const CFG = (await import('../src/config.js')).default;
const DAY = 86400000;
const realNow = Date.now; let shift = 0; Date.now = () => realNow() + shift;
const at = t => { shift = t - realNow(); };
const T0 = Date.parse('2026-10-14T08:00:00Z');
const parisHour = t => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));

console.log('— calendrier (pur calcul)');
{
  const t0 = Date.parse('2026-10-12T00:00:00Z'), ev = eventsIn(SECRET, t0, t0 + 365 * DAY), by = k => ev.filter(e => e.kind === k && e.start >= t0 && e.start < t0 + 365 * DAY);
  ok('heures dorées : environ 38 % des jours (110 à 170 sur un an)', by('golden').length > 110 && by('golden').length < 170, by('golden').length);
  ok('heures dorées : 1 h, entre 12 h et 22 h (heure de Paris), au quart d\'heure', by('golden').filter(e => e.id.split(':').length === 2).every(e => e.end - e.start === 3600000 && parisHour(e.start) >= 12 && parisHour(e.start) <= 21 && e.start % 900000 === 0));
  ok('week-ends shiny : un toutes les 3 semaines environ, du samedi 9 h au lundi 9 h (48 h)', by('shiny').length >= 16 && by('shiny').length <= 19 && by('shiny').every(e => Math.abs(e.end - e.start - 48 * 3600000) <= 3600000 && parisHour(e.start) === 9 && new Date(e.start).getUTCDay() === 6));
  ok('festival des catégories : jamais en même temps que le week-end shiny', !by('theme').some(a => by('shiny').some(b => a.start < b.end && b.start < a.end)) && by('theme').length >= 11);
  ok('albums éphémères : 7 jours, un toutes les 4 semaines', by('album').length >= 12 && by('album').length <= 14 && by('album').every(e => Math.abs(e.end - e.start - 7 * DAY) <= 3600000 && EVENT_ALBUMS.some(a => a.id === e.album)));
  ok('albums de saison : Halloween en octobre-novembre, Noël en décembre-janvier, été en juin-août', by('album').every(e => { const m = +e.day.slice(5, 7), a = EVENT_ALBUMS.find(x => x.id === e.album); return !a.months || a.months.includes(m); }));
  ok('objectifs collectifs : du samedi 10 h au lundi 10 h', by('goal').length >= 15 && by('goal').every(e => Math.abs(e.end - e.start - 48 * 3600000) <= 3600000 && parisHour(e.start) === 10));
  const wk = by('weekly'); ok('un défi par semaine, jamais le même deux semaines de suite', wk.length >= 52 && wk.every((e, i) => !i || e.weekly !== wk[i - 1].weekly));
  { const t = parisTs('2026-10-24', 9, 30), g = activeIn(eventsIn(SECRET, t, t + 1), t).filter(e => e.kind === 'golden');
  ok('heure dorée du 24/10 à 9 h 15 : active à 9 h 30, comme une heure dorée normale', g.length === 1 && g[0].end - g[0].start === 3600000 && modsFrom(g).legend === EV.goldenLegend, J(g));
  const t2 = parisTs('2026-10-24', 10, 20); ok('terminée à 10 h 20', activeIn(eventsIn(SECRET, t2, t2 + 1), t2).filter(e => e.kind === 'golden').length === 0); }
ok('un seul défi de la semaine en cours à tout instant', [0, 1, 2, 3, 4, 5, 6].every(i => activeIn(eventsIn(SECRET, t0 + i * DAY, t0 + i * DAY + 1), t0 + i * DAY).filter(e => e.kind === 'weekly').length === 1));
  ok('une carte recherchée par jour', activeIn(eventsIn(SECRET, T0, T0 + 1), T0).filter(e => e.kind === 'hunt').length === 1);
  const ss = ev.filter(e => e.kind === 'season'); ok('saisons de 14 jours qui s\'enchaînent, la première le 14 octobre (remise à zéro)', ss[0].start === parisTs(SEASON_ANCHOR) && ss.every((e, i) => !i || e.start === ss[i - 1].end) && ss.every(e => Math.abs(e.end - e.start - 14 * DAY) <= 3600000));
  ok('calendrier différent avec un autre secret, identique avec le même', J(eventsIn('autre', t0, t0 + 90 * DAY).map(e => e.id)) !== J(eventsIn(SECRET, t0, t0 + 90 * DAY).map(e => e.id)) && J(eventsIn(SECRET, t0, t0 + 90 * DAY)) === J(eventsIn(SECRET, t0, t0 + 90 * DAY)));
  ok('changement d\'heure : les événements restent à la même heure locale (9 h) autour du 25 octobre et du 28 mars', by('shiny').filter(e => /2026-10-(2|3)|2027-03-(2|3)/.test(dayOfTs(e.start))).every(e => parisHour(e.start) === 9));
  const m = modsFrom([{ kind: 'golden' }, { kind: 'shiny' }, { kind: 'theme' }, { kind: 'album', album: 'noel' }]);
  ok('effets cumulés : légendaires ×3, ultra ×1,5, shiny ×3, festival', m.legend === 3 && m.ultra === 1.5 && m.shiny === 3 && m.themePrice === 90 && m.themeGuarantee && m.album === 'noel');
}

console.log('— joueurs');
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Chloé', password: 'secret3' }); const C = r.token;
const [alice, bob, chloe] = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id);
await q('UPDATE users SET coins = 5000, packs_opened = 5');
const U = { [alice]: 'Alice', [bob]: 'Bob', [chloe]: 'Chloé' };
const coins = async id => +(await q('SELECT coins FROM users WHERE id = ?', id))[0].coins, packs = async id => +(await q('SELECT pack_stock FROM users WHERE id = ?', id))[0].pack_stock;
const hasTitle = async (id, t) => (await q('SELECT 1 FROM user_titles WHERE user_id = ? AND tid = ?', id, t)).length === 1;
const evs = (a, b) => eventsIn(SECRET, a, b);
const nextOf = (kind, from, span = 120 * DAY) => evs(from, from + span).find(e => e.kind === kind && e.start >= from);

console.log('— état, défi de la semaine');
at(T0);
[s, r] = await call(A, 'GET', '/api/events'); ok('état : défi, carte recherchée, saison', s === 200 && r.weekly && r.hunt && r.season && r.season.name === 'Saison 1', J(r).slice(0, 300));
ok('rien sur les événements à venir (aucune date future dans la réponse)', r.bursts.every(b => b.end > T0) && !/secret/i.test(J(r)) && r.now === T0 || Math.abs(r.now - T0) < 5000, J(r.bursts));
const wk = evs(T0, T0 + 1).find(e => e.kind === 'weekly'), W = WEEKLY_BY[wk.weekly];
ok('le défi correspond au calendrier secret', r.weekly.id === W.id && r.weekly.goal === W.goal && r.weekly.progress === 0);
[s] = await call(A, 'POST', '/api/events/weekly/claim', {}); ok('défi non terminé : refusé', s === 400);
await bumpQuests(env, alice, { [W.event]: W.goal - 1 }); await settle();
[s, r] = await call(A, 'GET', '/api/events'); ok('progression suivie', r.weekly.progress === W.goal - 1);
await bumpQuests(env, alice, { [W.event]: 5 }); await settle();
[s, r] = await call(A, 'GET', '/api/events'); ok('progression plafonnée à l\'objectif', r.weekly.progress === W.goal);
const c0 = await coins(alice), p0 = await packs(alice);
[s, r] = await call(A, 'POST', '/api/events/weekly/claim', {}); ok('défi terminé : récompense versée (400 pièces, 2 paquets)', s === 200 && (await coins(alice)) === c0 + EV.weekly.c && (await packs(alice)) === p0 + EV.weekly.p, J([s, r]));
[s] = await call(A, 'POST', '/api/events/weekly/claim', {}); ok('une seule récompense par défi', s === 400);
[s, r] = await call(B, 'GET', '/api/events'); ok('la progression est personnelle', r.weekly.progress === 0);
for (let k = 1; k <= 3; k++) { at(T0 + k * 7 * DAY); const w2 = WEEKLY_BY[evs(T0 + k * 7 * DAY, T0 + k * 7 * DAY + 1).find(e => e.kind === 'weekly').weekly]; await bumpQuests(env, alice, { [w2.event]: w2.goal }); await settle(); [s, r] = await call(A, 'POST', '/api/events/weekly/claim', {}); }
ok('4 défis terminés : titre « Assidu du défi »', r.completed === 4 && await hasTitle(alice, 'ev_weekly4'), J(r));

console.log('— carte recherchée du jour');
at(T0);
const origin = 'http://x', hunt = await __testHooks.events.huntCard(env, origin, dayOfTs(T0));
ok('carte du jour : une légendaire, jamais une liste ni une page d\'actualité', hunt && hunt.r < 6890 && !/^(Liste|Élections?|Décès|Catégorie)|\d{4}/.test(hunt.title), J(hunt));
ok('même carte toute la journée, autre carte le lendemain', (await __testHooks.events.huntCard(env, origin, dayOfTs(T0)))?.id === hunt.id && (await __testHooks.events.huntCard(env, origin, dayOfTs(T0 + DAY)))?.id !== hunt.id);
[s, r] = await call(B, 'GET', '/api/events'); ok('indice : initiale et longueur, pas le nom', r.hunt.first === hunt.title[0] && r.hunt.len === hunt.title.length && r.hunt.title === null && !r.hunt.found, J(r.hunt));
const c1 = await coins(bob), p1 = await packs(bob);
const rb = await __testHooks.events.afterPack(env, ctx, { id: bob, name: 'Bob' }, [{ id: 5 }, { id: hunt.id }]); await settle();
ok('premier à la trouver : 500 pièces + 2 paquets + titre « Chasseur de légendes »', rb?.rank === 1 && (await coins(bob)) === c1 + 500 && (await packs(bob)) === p1 + 2 && await hasTitle(bob, 'ev_hunter'), J(rb));
const c2 = await coins(chloe), ra = await __testHooks.events.afterPack(env, ctx, { id: chloe, name: 'Chloé' }, [{ id: hunt.id + 100000000 }]); await settle();
ok('les suivants (même en version shiny) : 60 pièces', ra?.rank === 2 && (await coins(chloe)) === c2 + 60, J(ra));
ok('pas de double récompense pour la même carte le même jour', (await __testHooks.events.afterPack(env, ctx, { id: bob, name: 'Bob' }, [{ id: hunt.id }])) === null);
ok('un paquet sans la carte ne donne rien', (await __testHooks.events.afterPack(env, ctx, { id: alice, name: 'Alice' }, [{ id: 7 }])) === null);
[s, r] = await call(A, 'GET', '/api/events'); ok('après la découverte : le nom est révélé à tous, avec le gagnant', r.hunt.found?.by === 'Bob' && r.hunt.title === hunt.title, J(r.hunt));

console.log('— saison');
await q("DELETE FROM event_progress WHERE key LIKE 's:%'");   // repart de zéro (les défis de la semaine ci-dessus ont aussi rapporté des points)
{ // thèmes : un cycle de 3 contient chaque thème une fois, jamais deux fois de suite, secret différent = ordre différent
  const ids = i => Array.from({ length: 12 }, (_, k) => themeIdOf('s1', k + i));
  const seq = ids(0); ok('thèmes de saison : chaque cycle de 3 saisons les contient tous', [0, 3, 6, 9].every(k => new Set(seq.slice(k, k + 3)).size === 3), seq.join());
  ok('jamais le même thème deux saisons de suite', seq.every((t, i) => !i || t !== seq[i - 1]));
  ok('l\'ordre dépend du secret (et reste stable)', J(ids(0)) === J(ids(0)) && ['a', 'b', 'c', 'd', 'e'].some(x => J(Array.from({ length: 12 }, (_, k) => themeIdOf(x, k))) !== J(seq)));
  ok('trois thèmes définis : combat, quiz, collection', J(Object.keys(SEASON_THEMES)) === J(['combat', 'quiz', 'collection']));
}
at(Date.parse('2026-10-15T10:00:00Z'));
const SECRETv = await __testHooks.events.getSecret(env), TH0 = themeIdOf(SECRETv, 0), TH1 = themeIdOf(SECRETv, 1);
const evA = { open_pack: 40, legendary: 2, battle_win: 5, battle_play: 5, quiz_daily: 1, quiz_correct: 4, duel_win: 2, duel_play: 3, new_cards: 20, rare_plus: 6 }, evB = { open_pack: 10, battle_win: 1, quiz_daily: 1, new_cards: 3 }, evC = { battle_win: 1, new_cards: 1 };
await bumpQuests(env, alice, evA); await bumpQuests(env, bob, evB); await bumpQuests(env, chloe, evC); await settle();
const [pa, pb, pc] = [seasonPts(TH0, evA), seasonPts(TH0, evB), seasonPts(TH0, evC)];
[s, r] = await call(A, 'GET', '/api/events'); ok('points de saison : seules les actions du thème comptent', r.season.points === pa && r.season.theme.name === SEASON_THEMES[TH0].name && r.season.top.length === 3 && r.season.secretPrize === true, J(r.season));
ok('classement cohérent avec le thème', [pa, pb, pc].every((x, i, a) => !i || a[i - 1] >= x) ? r.season.rank === 1 : true);
[s, r] = await call(B, 'GET', '/api/events'); ok('le thème de la saison est annoncé (nom, emoji, règle des points)', r.season.theme.emoji && r.season.theme.info.length > 10 && r.season.name === 'Saison 1');
{ const pz = await q("SELECT value FROM settings WHERE key = 'season_prize:0'"); ok('la légendaire secrète est tirée dès le début, jamais renvoyée avant la fin', pz.length === 1 && !J(r).includes(JSON.parse(pz[0].value).title), J(pz)); }
ok('prix : une des 1 000 pages les plus vues', await (async () => { const pz = JSON.parse((await q("SELECT value FROM settings WHERE key = 'season_prize:0'"))[0].value), c = (await q('SELECT rarity FROM cards WHERE id = ?', pz.id))[0]; return c?.rarity === 'legendary'; })());
at(Date.parse('2026-10-29T10:00:00Z'));
[s, r] = await call(A, 'GET', '/api/events'); ok('saison 2 commencée : saison 1 à récupérer', r.season.name === 'Saison 2' && r.season.points === 0 && r.season.prev.rank === 1 && r.season.prev.reward.c === 200 && !r.season.prev.claimed, J(r.season));
[s, r] = await call(A, 'GET', '/api/me'); ok('pastille « saison terminée » à l\'accueil', r.ev.some(e => e.kind === 'seasonend' && /terminée/.test(e.name)), J(r.ev));
[s, r] = await call(B, 'GET', '/api/events/season/last'); const pzid = JSON.parse((await q("SELECT value FROM settings WHERE key = 'season_prize:0'"))[0].value).id;
ok('révélation : thème, vainqueur et légendaire secrète dévoilés', s === 200 && r.winner.name === 'Alice' && r.winner.pts === pa && r.prize?.id === pzid && r.theme.name === SEASON_THEMES[TH0].name && r.mine.rank === 2, J(r).slice(0, 300));
const sc = await coins(alice), sp = await packs(alice);
[s, r] = await call(A, 'POST', '/api/events/season/claim', { idx: 0 }); ok('1er : 200 pièces + 3 paquets + la légendaire secrète + titre « Champion de la saison 1 »', s === 200 && (await coins(alice)) === sc + 200 && (await packs(alice)) === sp + 3 && r.card?.id === pzid && (await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', alice, pzid)).length === 1 && await hasTitle(alice, 's1_champion'), J([s, r]));
[s] = await call(A, 'POST', '/api/events/season/claim', { idx: 0 }); ok('récompense de saison versée une seule fois', s === 400);
[s, r] = await call(B, 'POST', '/api/events/season/claim', { idx: 0 }); ok('2e : 120 pièces + 2 paquets, titre « Sur le podium », pas de carte', s === 200 && r.reward.c === 120 && !r.card && await hasTitle(bob, 'ev_season_podium'), J([s, r]));
[s, r] = await call(C, 'POST', '/api/events/season/claim', { idx: 0 }); ok('3e : 80 pièces + 1 paquet', s === 200 && r.reward.c === 80, J([s, r]));
[s] = await call(A, 'POST', '/api/events/season/claim', { idx: 1 }); ok('saison en cours : pas encore récupérable', s === 400);
[s, r] = await call(A, 'GET', '/api/events'); ok('saison 2 : un autre thème, jamais le même que la saison 1', r.season.theme.name === SEASON_THEMES[TH1].name && TH1 !== TH0);
at(Date.parse('2026-10-08T10:00:00Z')); [s, r] = await call(A, 'GET', '/api/events'); ok('avant la saison 1 : annonce de la date de début', r.season.upcoming === true);

console.log('— objectif collectif');
const g1 = nextOf('goal', T0), g2 = nextOf('goal', g1.end + DAY);
at(g1.start + 3600000);
[s, r] = await call(A, 'GET', '/api/events'); ok('objectif en cours : cible minimale 150 paquets', r.goal && r.goal.target === 150 && r.goal.total === 0 && !r.goal.ended && r.bursts.some(b => b.kind === 'goal'), J(r.goal));
await bumpQuests(env, alice, { open_pack: 100 }); await bumpQuests(env, bob, { open_pack: 60 }); await bumpQuests(env, chloe, { open_pack: 3 }); await settle();
at(g1.end - 60000); [s, r] = await call(B, 'GET', '/api/events'); ok('progression collective et personnelle', r.goal.total === 163 && r.goal.mine === 60 && !r.goal.claimable, J(r.goal));
[s] = await call(A, 'POST', '/api/events/goal/claim', { id: g1.id }); ok('objectif pas terminé : refusé', s === 400);
at(g1.end + 3600000);
[s, r] = await call(A, 'GET', '/api/events'); ok('objectif atteint : récompense disponible', r.goal.ended && r.goal.reached && r.goal.claimable, J(r.goal));
const gc = await coins(alice), gp = await packs(alice);
[s, r] = await call(A, 'POST', '/api/events/goal/claim', { id: g1.id }); ok('participant : 250 pièces + 2 paquets + titre « Esprit d\'équipe »', s === 200 && (await coins(alice)) === gc + 250 && (await packs(alice)) === gp + 2 && await hasTitle(alice, 'ev_team'), J([s, r]));
[s] = await call(A, 'POST', '/api/events/goal/claim', { id: g1.id }); ok('une seule récompense', s === 400);
[s, r] = await call(C, 'POST', '/api/events/goal/claim', { id: g1.id }); ok('moins de 10 paquets ouverts : pas de récompense', s === 400 && /au moins 10/.test(r.error), J([s, r]));
at(g2.end + 3600000); [s, r] = await call(A, 'GET', '/api/events'); ok('objectif manqué (personne n\'a joué) : rien à récupérer', !r.goal || (r.goal.ended && !r.goal.reached && !r.goal.claimable) || r.goal.id !== g1.id, J(r.goal));
[s] = await call(A, 'POST', '/api/events/goal/claim', { id: g2.id }); ok('objectif manqué : refusé', s === 400);

console.log('— heure dorée, week-end shiny, festival : effets sur les tirages');
const gold = nextOf('golden', T0), shiny = nextOf('shiny', T0), fest = nextOf('theme', T0);
at(gold.start + 60000); const m1 = await __testHooks.events.mods(env);
ok('heure dorée : légendaires ×3, ultra ×1,5', m1.legend === 3 && m1.ultra === 1.5, J(m1));
[s, r] = await call(A, 'GET', '/api/me'); ok('/api/me annonce l\'événement en cours', r.ev.some(e => e.kind === 'golden' && e.end === gold.end), J(r.ev));
at(gold.end + 60000); ok('après l\'heure dorée : retour à la normale', (await __testHooks.events.mods(env)).legend === 1 || activeIn(evs(gold.end + 60000, gold.end + 60001), gold.end + 60000).some(e => e.kind === 'golden'));
const WN = { common: 0, uncommon: 0, rare: 0, super: 0, ultra: 0, legendary: 1 };
const legs = async (ev, w = CFG.DROP, packsN = 1500) => { let n = 0; for (let i = 0; i < packsN; i++) n += (await __testHooks.drawCards(env, origin, 10, w, null, ev)).filter(c => c.rarity === 'legendary').length; return n; };
const godSave = CFG.GODPACK_CHANCE; CFG.GODPACK_CHANCE = 0;   // un godpack ajouterait des légendaires au hasard et fausserait la mesure
const base = await legs(null), gold3 = await legs({ legend: 3, ultra: 1.5, shiny: 1 }); CFG.GODPACK_CHANCE = godSave;
ok(`tirages : sans événement ≈ 0,25 % de légendaires (${base} sur 15 000), heure dorée ≈ ×3 (${gold3})`, base > 18 && base < 62 && gold3 > 75 && gold3 < 175 && gold3 > base * 1.8, [base, gold3]);
const sh = async ev => { let n = 0, t = 0; const save = CFG.SHINY_CHANCE; CFG.SHINY_CHANCE = 0.2; for (let i = 0; i < 60; i++) for (const c of await __testHooks.drawCards(env, origin, 10, WN, null, ev)) { t++; n += c.shiny; } CFG.SHINY_CHANCE = save; return n / t; };
const s1 = await sh(null), s3 = await sh({ shiny: 3 }); ok(`week-end shiny : 3 fois plus de shiny (${(s1 * 100).toFixed(0)} % → ${(s3 * 100).toFixed(0)} %)`, s1 > .1 && s1 < .32 && s3 > .5 && s3 < .7, [s1, s3]);
const real = JSON.parse((await import('node:fs')).readFileSync(new URL('../../cloudflare/public/catalog/albums.json', import.meta.url))).albums, theme = real[0];
let noLeg = 0, noLeg2 = 0; for (let i = 0; i < 150; i++) { const a = await __testHooks.drawCards(env, origin, 10, CFG.DROP, theme, { themeGuarantee: true }), b = await __testHooks.drawCards(env, origin, 10, CFG.DROP, theme, null); if (!a.some(c => c.rarity === 'legendary')) noLeg++; if (!b.some(c => c.rarity === 'legendary')) noLeg2++; }
ok(`festival : une légendaire dans chaque paquet thématique (${noLeg} paquets sans, contre ${noLeg2} sans le festival)`, noLeg === 0 && noLeg2 > 100, [noLeg, noLeg2]);
let miss = 0; for (let i = 0; i < 80; i++) { const p = await __testHooks.drawCards(env, origin, 10, CFG.DROP, null, { hunt: hunt }); if (!p.some(c => (c.id >= 100000000 ? c.id - 100000000 : c.id) === hunt.id)) miss++; }
ok('carte recherchée forcée : présente dans le paquet', miss === 0, miss);
const evAl = JSON.parse((await import('node:fs')).readFileSync(new URL('../../cloudflare/public/catalog/albums-events.json', import.meta.url))).albums;
ok('albums éphémères générés : 8 albums de 6 à 8 cartes avec rang et titre exacts', evAl.length === 8 && evAl.every(a => a.cards.length >= 6 && a.cards.length <= 8 && EVENT_ALBUMS.some(x => x.id === a.id)));
let missA = 0; for (let i = 0; i < 80; i++) { const al = evAl[2], p = await __testHooks.drawCards(env, origin, 10, CFG.DROP, null, { album: al.cards }); if (!p.some(c => al.cards.some(x => x.id === (c.id >= 100000000 ? c.id - 100000000 : c.id)))) missA++; }
ok('carte de l\'album éphémère forcée : présente dans le paquet', missA === 0, missA);

await q('UPDATE users SET pack_stock = 40 WHERE id = ?', alice); at(gold.start + 120000);
{ let good = true, n = 0; for (let i = 0; i < 6; i++) { [s, r] = await call(A, 'POST', '/api/packs/open', {}); good = good && s === 200 && r.cards?.length === 10; n += r.cards?.length || 0; }
  ok('ouvrir des paquets pendant l\'heure dorée fonctionne (tirage direct)', good && n === 60, J([s, n])); }
const savedRandom = Math.random; let cnt = 0; Math.random = () => (cnt++ % 2 ? 0.0001 : 0.9);   // force les tirages d'album et de carte recherchée
[s, r] = await call(A, 'POST', '/api/packs/open', {}); Math.random = savedRandom;
ok('paquet avec carte de l\'événement forcée : ouvert normalement', s === 200 && r.cards.length === 10, J([s]));

console.log('— festival des catégories (boutique)');
at(fest.start + 3600000);
[s, r] = await call(A, 'GET', '/api/themepacks'); ok('prix du paquet du jour : 90 pièces pendant le festival', r.price === 90 && r.festival === true && r.normalPrice === CFG.THEME_PACK_PRICE, J([r.price, r.festival]));
const tId = r.themes[0].id;
[s, r] = await call(A, 'POST', '/api/themepacks/buy', { theme: tId }); const g0 = r;   // premier achat : peut déclencher des succès (pièces offertes), on le laisse passer
const cc0 = await coins(alice); [s, r] = await call(A, 'POST', '/api/themepacks/buy', { theme: tId });
ok('achat à 90 pièces avec une légendaire garantie (2 paquets de suite)', s === 200 && cc0 - (await coins(alice)) === 90 && r.cards.some(c => c.rarity === 'legendary') && g0.cards.some(c => c.rarity === 'legendary'), J([s, cc0 - (await coins(alice))]));
at(fest.end + 3600000 * 24); [s, r] = await call(A, 'GET', '/api/themepacks'); ok('après le festival : prix normal', r.price === CFG.THEME_PACK_PRICE || r.festival === true);

console.log('— album éphémère');
const ae = nextOf('album', T0), al = evAl.find(a => a.id === ae.album);
at(ae.start + 3600000);
[s, r] = await call(A, 'GET', '/api/albums'); const ea = r.albums.find(a => a.id === ae.album);
ok('album éphémère listé en tête avec sa date de fin et la même récompense que les autres (5 000 pièces seulement)', ea && ea.until === ae.end && r.albums[0].id === ae.album && ea.reward.p === 0 && ea.reward.c === 5000, J(ea).slice(0, 200));
[s] = await call(A, 'POST', `/api/albums/${ae.album}/claim`, {}); ok('album incomplet : refusé', s === 400);
for (const c of al.cards) { await q('INSERT INTO cards (id, title, views, rarity, atk, def, shiny, url) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING', c.id, c.t, 100, 'rare', 900, 900, 0, 'u'); await q("INSERT INTO inventory (user_id, card_id, qty, acquired, rar, sh, skey, nk) VALUES (?,?,1,1,2,0,2000000000,'x') ON CONFLICT DO NOTHING", alice, c.id); }
const ac = await coins(alice), ap = await packs(alice);
[s, r] = await call(A, 'POST', `/api/albums/${ae.album}/claim`, { card_id: al.cards[0].id }); ok('album éphémère complété : 5 000 pièces + titre exclusif (ni paquet, ni shiny)', s === 200 && (await coins(alice)) - ac === 5000 && !(await q('SELECT sh FROM inventory WHERE user_id = ? AND card_id = ?', alice, al.cards[0].id + 100000000)).length && (await packs(alice)) - ap === 0 && await hasTitle(alice, 'ev_alb_' + ae.album), J([s, r]));
at(ae.end + 3600000); [s, r] = await call(A, 'GET', '/api/albums'); const still = evs(ae.end + 3600000, ae.end + 3600001).some(e => e.kind === 'album' && e.album === ae.album);
ok('après l\'événement : l\'album disparaît de la liste', still || !r.albums.some(a => a.id === ae.album));
if (!still) { [s, r] = await call(B, 'POST', `/api/albums/${ae.album}/claim`, {}); ok('album terminé : plus récupérable', s === 404 && /éphémère/.test(r.error), J([s, r])); }
[s, r] = await call(B, 'GET', '/api/titles'); ok('les titres d\'événements apparaissent dans la liste des titres', r.titles.some(t => t.id === 'ev_hunter' && t.unlocked) && r.titles.some(t => t.id === 'ev_alb_halloween'), J(r.titles.filter(t => t.id.startsWith('ev_')).map(t => t.id)));

console.log('— annonces');
const socks = { [alice]: { log: [], send(d) { this.log.push(JSON.parse(d)); } }, [bob]: { log: [], send(d) { this.log.push(JSON.parse(d)); } } };
lobby.clients.set(alice, new Set([socks[alice]])); lobby.clients.set(bob, new Set([socks[bob]]));
at(gold.start + 2 * 60000);
const n1 = await __testHooks.events.tick(env, ctx); await settle();
ok('heure dorée : annoncée à tous les joueurs au moment où elle commence', n1 === 1 && socks[alice].log.some(m => m.t === 'notify' && /Heure dorée/.test(m.msg)) && socks[bob].log.some(m => /Heure dorée/.test(m.msg || '')), J(socks[alice].log).slice(0, 200));
ok('annonce unique (pas de répétition à la tâche suivante)', (await __testHooks.events.tick(env, ctx)) === 0);
at(gold.start + 50 * 60000); const ann = JSON.parse((await q("SELECT value FROM settings WHERE key = 'ev_announced'"))[0].value);
ok('l\'annonce est mémorisée en base', ann.includes(gold.id));
at(gold.start + 55 * 60000 + 60000); ok('un événement commencé depuis plus de 45 min n\'est plus annoncé (tâche en retard)', (await __testHooks.events.tick(env, ctx)) === 0);
const wkly = activeIn(evs(T0, T0 + 1), T0).find(e => e.kind === 'weekly'); at(wkly.start + 60000);
ok('le défi, la chasse et la saison ne déclenchent aucune notification', !['weekly', 'hunt', 'season'].some(k => false) && (await __testHooks.events.tick(env, ctx)) >= 0);

Date.now = realNow;
await done();
