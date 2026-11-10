// Les marchés sont construits par la tâche planifiée et rangés en base ; les joueurs les lisent sans rien reconstruire.
import './api.mjs';
const { call, ok, DB, J, done, env, worker, ctx, settle } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const reg = async n => { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); return r.token; };
const BOB = await reg('Bob');
const today = async () => (await q("SELECT COUNT(*) n FROM bourse_market WHERE slot < 100 AND day = ?", new Date().toISOString().slice(0, 10)))[0].n;
const before = +(await q('SELECT COUNT(*) n FROM bourse_market WHERE slot < 100'))[0].n;
await worker.scheduled({}, { ...env }, ctx); await settle();
const after = +(await q('SELECT COUNT(*) n FROM bourse_market WHERE slot < 100'))[0].n;
ok('la tâche planifiée construit le marché du jour (aucune visite nécessaire)', after > before && after >= 4, J({ before, after }));
const [s, v] = await call(BOB, 'GET', '/api/bourse'); ok('un joueur lit le marché déjà rangé en base', s === 200 && v.market.length === after && !v.why, J({ s, n: v.market?.length, why: v.why }));
await worker.scheduled({}, { ...env }, ctx); await settle();
ok('un second passage ne reconstruit rien', +(await q('SELECT COUNT(*) n FROM bourse_market WHERE slot < 100'))[0].n === after);

// paris en attente : la tâche planifiée règle les deux bourses (classique et marché noir) sans aucune visite
globalThis.__PV_PACE = 0;
const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
await DB.prepare("UPDATE users SET coins = 1000 WHERE name = 'Bob'").run();
const bobId = +(await q("SELECT id FROM users WHERE name = 'Bob'"))[0].id;
await DB.prepare("INSERT INTO bourse_market (day, slot, id, title, series, ref, status) VALUES (?,?,?,?,?,?,'open'), (?,?,?,?,?,?,'open')").bind(yest, 0, 1, 'Paris', '[1,1,1,1,1,1,1]', 1, yest, 100, 2, 'Rome', '[1,1,1,1,1,1,1]', 1).run();
await DB.prepare("INSERT INTO bourse_bets (user_id, day, slot, dir, stake) VALUES (?,?,0,'up',10), (?,?,100,'up',10)").bind(bobId, yest, bobId, yest).run();
await DB.prepare("INSERT INTO plan_progress (user_id, joined, wr) VALUES (?, 2, 100) ON CONFLICT (user_id) DO UPDATE SET joined = 2").bind(bobId).run();
await DB.prepare("INSERT INTO settings (key, value) VALUES ('commu_on','1'), ('commu_scope','all') ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();
globalThis.__PV = (t, d) => d === yest ? 50 : 1;
await worker.scheduled({}, { ...env }, ctx); await settle();
const left = +(await q("SELECT COUNT(*) n FROM bourse_bets WHERE user_id = ? AND day = ? AND settled = 0", bobId, yest))[0].n;
ok('tâche planifiée : les paris en attente des deux bourses sont réglés', left === 0, J({ left, bets: await q('SELECT slot, settled, payout FROM bourse_bets WHERE user_id = ?', bobId) }));

// anciens paris bloqués : marché déjà réglé, pari jamais payé (règlement interrompu) -> repris une seule fois par la tâche planifiée
const old = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
await DB.prepare("INSERT INTO bourse_market (day, slot, id, title, series, ref, status, actual) VALUES (?,?,?,?,?,?,'done',50), (?,?,?,?,?,?,'done',50)").bind(old, 1, 3, 'Lyon', '[1,1,1,1,1,1,1]', 1, old, 101, 4, 'Kiev', '[1,1,1,1,1,1,1]', 1).run();
await DB.prepare("INSERT INTO bourse_bets (user_id, day, slot, dir, stake) VALUES (?,?,1,'up',100), (?,?,101,'up',100)").bind(bobId, old, bobId, old).run();
const c0 = +(await q('SELECT coins c FROM users WHERE id = ?', bobId))[0].c, w0 = +(await q('SELECT wr FROM plan_progress WHERE user_id = ?', bobId))[0].wr;
await worker.scheduled({}, { ...env }, ctx); await settle(); await worker.scheduled({}, { ...env }, ctx); await settle();
const c1 = +(await q('SELECT coins c FROM users WHERE id = ?', bobId))[0].c, w1 = +(await q('SELECT wr FROM plan_progress WHERE user_id = ?', bobId))[0].wr;
ok('bourse classique : pari bloqué repris et payé une seule fois (100 x 1,8)', c1 - c0 === 180 && (await q("SELECT settled FROM bourse_bets WHERE user_id = ? AND day = ? AND slot = 1", bobId, old))[0].settled === 1, J({ c0, c1 }));
ok('marché noir : pari bloqué repris, mise rendue + gain, une seule fois', w1 - w0 >= 100 && w1 - w0 <= 180 && (await q("SELECT settled FROM bourse_bets WHERE user_id = ? AND day = ? AND slot = 101", bobId, old))[0].settled === 1, J({ w0, w1 }));
done();
