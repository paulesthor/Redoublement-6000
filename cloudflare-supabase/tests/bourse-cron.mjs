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
done();
