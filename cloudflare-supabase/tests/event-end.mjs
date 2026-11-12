// Clôture automatique de l'événement à l'heure, podium et bilan personnel.
import './api.mjs';
const { call, ok, DB, J, done, env, worker, ctx, settle } = globalThis.__T;
const { COMMU } = await import('../src/plan.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const mk = async n => { await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); const [, l] = await call(null, 'POST', '/api/login', { name: n, password: 'secret1' }); return l.token; };
const A = await mk('Alice'); await DB.prepare("UPDATE users SET is_admin = 1 WHERE name = 'Alice'").run();
const names = ['Bob', 'Carole', 'Dimitri', 'Eva']; const T = {};
for (const n of names) { T[n] = await mk(n); await DB.prepare("UPDATE users SET coins = 1000 WHERE name = ?").bind(n).run(); }
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' });
for (const n of names) await call(T[n], 'POST', '/api/commu/join', {});
const uid = async n => +(await q("SELECT id FROM users WHERE name = ?", n))[0].id;
const set = async (n, earned, ts, claimed, perks) => DB.prepare("UPDATE plan_progress SET earned = ?, earn_ts = ?, claimed = ?, perks = ? WHERE user_id = ?").bind(earned, ts, JSON.stringify(claimed), JSON.stringify(perks), await uid(n)).run();
await set('Bob', 5000, 1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], ['souvenir_1', 'frame_star', 'anim_urss', 'theme_urss', 'frame_hammer', 'theme_siberie', 'frame_gold', 'souvenir_2', 'theme_or']);
await set('Carole', 3200, 2, [1, 2, 3, 4, 5, 6, 7, 8], ['souvenir_1', 'frame_star', 'anim_urss', 'theme_urss', 'frame_hammer']);
await set('Dimitri', 700, 3, [1, 2], ['souvenir_1']);
await set('Eva', 0, 4, [], []);
await DB.prepare("INSERT INTO settings (key, value) VALUES ('commu_pot', '1200') ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();
// avant l'heure : rien ne se ferme
let [s, v] = await call(T['Carole'], 'GET', '/api/commu'); ok('avant l\'heure : l\'événement reste ouvert', v.on === true && !v.done, J({ on: v.on, done: v.done }));
[s, v] = await call(T['Carole'], 'GET', '/api/commu/final'); ok('écran de fin refusé avant la clôture', s === 409);
// à l'heure : la première visite clôt l'événement
const real = Date.now; Date.now = () => COMMU.ENDS_AT + 5000;
const coins0 = +(await q("SELECT coins c FROM users WHERE name = 'Bob'"))[0].c;
[s, v] = await call(T['Carole'], 'GET', '/api/commu');
ok('à l\'heure : clôture automatique (terminé, fermé)', v.done === true && v.on === false && v.doneAt >= COMMU.ENDS_AT, J({ done: v.done, on: v.on, doneAt: v.doneAt }));
const win = (await call(T['Bob'], 'GET', '/api/commu'))[1].winner;
ok('le premier (Bob, 5 000 points) est le gagnant', win?.name === 'Bob' && win.prize === 1200, J(win));
ok('la cagnotte est versée au gagnant, une seule fois', +(await q("SELECT coins c FROM users WHERE name = 'Bob'"))[0].c === coins0 + 1200);
for (let i = 0; i < 3; i++) await call(T['Dimitri'], 'GET', '/api/commu'); await worker.scheduled({}, { ...env }, ctx); await settle();
ok('visites et tâche planifiée suivantes : pas de second versement', +(await q("SELECT coins c FROM users WHERE name = 'Bob'"))[0].c === coins0 + 1200);
ok('le gagnant reçoit le titre et le cadre doré', (await q("SELECT perks FROM plan_progress WHERE user_id = ?", await uid('Bob')))[0].perks.includes('gold_outline'));
// écran de fin
[s, v] = await call(T['Dimitri'], 'GET', '/api/commu/final');
ok('podium : Bob, Carole, Dimitri', s === 200 && v.podium.map(p => p.name).join() === 'Bob,Carole,Dimitri' && v.podium[0].points === 5000, J(v.podium));
ok('Dimitri : 3e sur 4 inscrits, 2 paliers', v.me.rank === 3 && v.total === 4 && v.me.level === 2, J(v.me));
ok('Dimitri : récompenses cumulées (30+60 wikibidou, 1 colis, 100 ₽, 1 souvenir)', v.me.rewards.coins === 90 && v.me.rewards.packs === 1 && v.me.rewards.wr === 100 && v.me.rewards.souvenirs === 1, J(v.me.rewards));
[s, v] = await call(T['Bob'], 'GET', '/api/commu/final');
ok('Bob : 1er, 12 paliers, titres dont Staline, 3 thèmes, 3 cadres + cadre doré', v.me.rank === 1 && v.me.level === 12 && v.me.rewards.titles.includes('Staline') && v.me.rewards.themes === 3 && v.me.rewards.frames === 4 && v.me.rewards.souvenirs === 2, J(v.me.rewards));
[s, v] = await call(T['Eva'], 'GET', '/api/commu/final'); ok('Eva : dernière, zéro palier, rien à montrer', v.me.rank === 4 && v.me.level === 0 && v.me.rewards.coins === 0, J(v.me));
// la tâche planifiée seule suffit aussi (aucune visite)
Date.now = real;
await DB.prepare("UPDATE settings SET value = '0' WHERE key IN ('commu_done')").run(); await DB.prepare("UPDATE settings SET value = '1' WHERE key = 'commu_on'").run(); await DB.prepare("DELETE FROM settings WHERE key = 'commu_auto_finish'").run();
Date.now = () => COMMU.ENDS_AT + 60000; await worker.scheduled({}, { ...env }, ctx); await settle();
ok('tâche planifiée seule : l\'événement se clôt sans visite', (await q("SELECT value FROM settings WHERE key = 'commu_done'"))[0].value === '1');
Date.now = real;
done();
