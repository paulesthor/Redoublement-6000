// Colis du Parti : quiz de l'événement (colis gagnés dans le mode communiste, jamais dans le classique) et colis offerts avec compte à rebours.
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
let [, r] = await call(null, 'POST', '/api/register', { name: 'Chef', password: 'secret1' }); const ADM = r.token;
[, r] = await call(null, 'POST', '/api/register', { name: 'Ana', password: 'secret2' }); const ANA = r.token;
[, r] = await call(null, 'POST', '/api/register', { name: 'Nina', password: 'secret3' }); const NINA = r.token;
await q("UPDATE users SET is_admin = 1 WHERE name = 'Chef'"); await q("UPDATE users SET coins = 1000 WHERE name IN ('Ana','Nina')");
await call(ADM, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(ANA, 'POST', '/api/commu/join', {}); await call(NINA, 'POST', '/api/commu/join', {});
const idOf = async n => (await q('SELECT id FROM users WHERE name = ?', n))[0].id, ana = await idOf('Ana'), nina = await idOf('Nina');
const evPacks = async id => +(await q('SELECT packs p FROM plan_progress WHERE user_id = ?', id))[0].p, classic = async id => (await q('SELECT pack_stock s, pack_ts t FROM users WHERE id = ?', id))[0];
// 1. quiz : bonnes réponses -> colis du mode communiste
const c0 = await classic(ana), e0 = await evPacks(ana);
let [s, v] = await call(ANA, 'GET', '/api/daily-quiz'); const qday = v.day;
await q('INSERT INTO daily_quiz (day, title, extract, questions, model, created) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING', qday, 'Test', '', JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ text: 'Question ' + i, options: ['a', 'b', 'c', 'd'], answer: i % 4 }))), 'ia2', Date.now());
[s, v] = await call(ANA, 'POST', '/api/daily-quiz/start', {}); ok('quiz de l\'événement démarré', s === 200 && String(v.day).startsWith('cm:'), J(v).slice(0, 60));
const quiz = (await q('SELECT questions FROM daily_quiz WHERE day = ?', v.day))[0], answers = JSON.parse(quiz.questions).map(x => x.answer);
[s, v] = await call(ANA, 'POST', '/api/daily-quiz/submit', { answers }); ok('quiz : tout juste', s === 200 && v.recap.correct === answers.length && v.recap.delta === answers.length, J(v).slice(0, 90));
ok('quiz : les colis gagnés vont au mode communiste', await evPacks(ana) === e0 + answers.length, `${await evPacks(ana)} / ${e0 + answers.length}`);
const c1 = await classic(ana); ok('quiz : aucun paquet ajouté au jeu classique', c1.s === c0.s, J({ c0, c1 }));
// 2. aucune bonne réponse : un colis en moins (mode communiste), jeu classique intact ; plus de colis : rien, pas de minuteur
const en0 = await evPacks(nina), cn0 = await classic(nina);
await call(NINA, 'POST', '/api/daily-quiz/start', {}); [s, v] = await call(NINA, 'POST', '/api/daily-quiz/submit', { answers: [] });
ok('quiz raté : -1 colis du mode communiste', v.recap.delta === -1 && await evPacks(nina) === en0 - 1, J(v.recap.delta));
const cn1 = await classic(nina); ok('quiz raté : jeu classique intact (stock et minuteur)', cn1.s === cn0.s && cn1.t === cn0.t, J({ cn0, cn1 }));
// 3. colis offerts : un toutes les 30 minutes, 5 en réserve, compte à rebours
await q('UPDATE plan_progress SET packs = 0 WHERE user_id = ?', ana);
const nowS = Math.floor(Date.now() / 1000);
await q("UPDATE event_progress SET n = ? WHERE key = 'cm:packts' AND user_id = ?", nowS - 95 * 60, ana);
[, v] = await call(ANA, 'GET', '/api/commu'); ok('95 minutes : 3 colis offerts, prochain dans 25 min environ', v.packs === 3 && v.nextPackIn > 24 * 60000 && v.nextPackIn <= 25 * 60000 + 2000, J({ p: v.packs, n: v.nextPackIn }));
await q("UPDATE event_progress SET n = ? WHERE key = 'cm:packts' AND user_id = ?", nowS - 600 * 60, ana);
[, v] = await call(ANA, 'GET', '/api/commu'); ok('réserve plafonnée à 5, plus de compte à rebours', v.packs === 5 && v.nextPackIn === 0, J({ p: v.packs, n: v.nextPackIn }));
[, v] = await call(ANA, 'GET', '/api/commu'); ok('réserve pleine : aucune accumulation', v.packs === 5);
await q('UPDATE plan_progress SET packs = 0 WHERE user_id = ?', ana); await q("UPDATE event_progress SET n = ? WHERE key = 'cm:packts' AND user_id = ?", nowS - 95 * 60, ana);
await call(ADM, 'POST', '/api/commu/pause', { paused: true }); [, v] = await call(ANA, 'GET', '/api/commu'); ok('pause : le compte à rebours est gelé', v.packs === 0, v.packs);
await call(ADM, 'POST', '/api/commu/pause', { paused: false }); [, v] = await call(ANA, 'GET', '/api/commu'); ok('reprise : le compte à rebours repart de zéro (pas de colis pour la durée de la pause)', v.packs === 0 && v.nextPackIn > 29 * 60000, J({ p: v.packs, n: v.nextPackIn }));
done();
