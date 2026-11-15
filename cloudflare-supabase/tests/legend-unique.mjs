// Règle d'événement « pas de doublon de légendaire » (désactivée par défaut, à activer pour le prochain événement).
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
{ const { COMMU } = await import('../src/plan.js'); COMMU.ENDS_AT = 9e15; }   // date de fin réelle dépassée : ce test ne concerne pas la clôture
const { EVENT_RULES, EVENT_WEIGHTS } = await import('../src/commu-cards.js');
const mk = async n => { await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); const [, l] = await call(null, 'POST', '/api/login', { name: n, password: 'secret1' }); return l.token; };
const A = await mk('Alice'); await DB.prepare("UPDATE users SET is_admin = 1 WHERE name = 'Alice'").run(); const B = await mk('Bob'), C = await mk('Carole');
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' });
for (const [n, t] of [['Bob', B], ['Carole', C]]) { await DB.prepare("UPDATE users SET coins = 1000 WHERE name = ?").bind(n).run(); await call(t, 'POST', '/api/commu/join', {}); await DB.prepare("UPDATE plan_progress SET packs = 60 WHERE user_id = (SELECT id FROM users WHERE name = ?)").bind(n).run(); }
const w0 = EVENT_WEIGHTS.legendary; EVENT_WEIGHTS.legendary = 1e9;      // quasi tout est légendaire : on teste la règle à grande échelle
async function openMany(tok, n) { const legs = []; for (let i = 0; i < n; i++) { const [s, r] = await call(tok, 'POST', '/api/commu/open', {}); if (s !== 200) throw new Error('ouverture refusée ' + s + ' ' + J(r)); legs.push(...r.cards.filter(c => c.rarity === 'legendary').map(c => ({ id: c.id, isNew: c.isNew }))); } return legs; }
// 1. règle désactivée (état actuel) : des doublons apparaissent
EVENT_RULES.uniqueLegends = false;
const off = await openMany(B, 15), offIds = new Set(off.map(x => x.id));
ok('règle désactivée : le tirage reste inchangé (des doublons apparaissent)', off.length === 150 && offIds.size < 150, J({ tirées: off.length, differentes: offIds.size }));
// 2. règle activée : 15 colis = 150 légendaires toutes différentes
EVENT_RULES.uniqueLegends = true;
const on = await openMany(C, 15), onIds = new Set(on.map(x => x.id));
ok('règle activée : 150 légendaires tirées, toutes différentes', on.length === 150 && onIds.size === 150, J({ tirées: on.length, differentes: onIds.size }));
ok('chacune est une nouveauté pour le joueur', on.every(x => x.isNew));
// 3. toutes obtenues : les doublons redeviennent possibles, sans erreur
const more = await openMany(C, 2); ok('collection complète : le tirage continue (doublons permis)', more.length > 0 && more.every(x => onIds.has(x.id)));
EVENT_WEIGHTS.legendary = w0; EVENT_RULES.uniqueLegends = false;
done();
