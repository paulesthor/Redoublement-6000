// Atelier des lutins de Noël : simulation déterministe, essais limités, score rejoué par le serveur, têtes de joueurs volontaires.
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
await import('../src/noel.js');
const E = globalThis.ElfSim;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const mk = async n => { await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); const [, l] = await call(null, 'POST', '/api/login', { name: n, password: 'secret1' }); return l.token; };
const A = await mk('Alice'); await DB.prepare("UPDATE users SET is_admin = 1 WHERE name = 'Alice'").run(); const B = await mk('Bob'); const C = await mk('Carl');

// joueur automatique : touche les pièces utiles, siffle prudemment
function bot(n, whistleBelow) {
  const lv = E.level(n), st = E.create(), inputs = [];
  for (let T = 0; T < E.DUR; T++) {
    const acts = [];
    for (const p of lv.parts) if (E.alive(p, T) && !st.taken[p.id] && T - p.t >= 2 && E.route(st, p) >= 0) { acts.push([0, p.id]); inputs.push([T, 0, p.id]); break; }
    if (whistleBelow) st.elves.forEach((e, i) => { if (e.cool === 0 && e.strike === 0 && e.stress < whistleBelow && e.buf.length) { acts.push([1, i]); inputs.push([T, 1, i]); } });
    E.step(st, lv, acts);
  }
  return { inputs, score: E.score(st), gifts: st.gifts };
}
ok('niveau stable', J(E.level(5)) === J(E.level(5)) && E.level(1).parts.length > 100);
const b0 = bot(5, 0), b1 = bot(5, 500), b2 = bot(5, 1000);
ok('rejeu identique au jeu en direct', E.play(E.level(5), b1.inputs).score === b1.score && E.play(E.level(5), b0.inputs).score === b0.score, J([b0.score, b1.score]));
ok('le sifflet prudent rapporte plus que pas de sifflet', b1.score > b0.score, J([b0.score, b1.score]));
ok('siffler à outrance déclenche des grèves : score effondré', b2.score < b0.score, J([b0.score, b2.score]));
ok('actions invalides ignorées (pièce inexistante, tick hors limites, type inconnu)', E.play(E.level(5), [[0, 0, 9999], [5000, 0, 1], [3, 7, 1], [-4, 0, 0], ['x']]).score === 0);
ok('pas plus de 600 actions retenues', E.play(E.level(5), Array.from({ length: 5000 }, (_, i) => [i % 900, 1, i % 2])).elves.length === 2);
ok('flocons : 1 pour 40 points, plafond 120', E.flocons(400) === 10 && E.flocons(1e6) === 120);

// serveur
Date.now = () => Date.parse('2026-12-05T10:00:00+01:00');
let [s, r] = await call(B, 'GET', '/api/noel/atel'); ok('événement fermé : refusé', s === 403);
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'all' });
[s, r] = await call(B, 'GET', '/api/noel/atel'); ok('niveau du jour = 5, les deux têtes proposées par défaut', s === 200 && r.n === 5 && r.used === 0 && Array.isArray(r.heads) && r.heads.length === 2, J(r).slice(0, 100));
[s, r] = await call(B, 'POST', '/api/noel/atel/submit', { n: 5, a: 1, inputs: b1.inputs }); ok('envoi sans essai commencé refusé', s === 400);
[s, r] = await call(B, 'POST', '/api/noel/atel/start', { n: 5 }); ok('essai 1 commencé', s === 200 && r.attempt === 1);
[s, r] = await call(B, 'POST', '/api/noel/atel/submit', { n: 5, a: 1, score: 99999, gifts: 99, inputs: b1.inputs });
ok('score calculé par le serveur (le score envoyé est ignoré)', s === 200 && r.score === b1.score && r.gifts === b1.gifts, J({ s: r.score, exp: b1.score }));
ok('flocons = score / 40', r.flocons === E.flocons(b1.score) && r.gained === r.flocons, J({ fl: r.flocons }));
[s, r] = await call(B, 'POST', '/api/noel/atel/submit', { n: 5, a: 1, inputs: b1.inputs }); ok('un essai ne se rejoue pas', s === 409);
await call(B, 'POST', '/api/noel/atel/start', { n: 5 });
[s, r] = await call(B, 'POST', '/api/noel/atel/submit', { n: 5, a: 2, inputs: [] }); ok('partie vide : score 0, rien de retiré', s === 200 && r.score === 0 && r.best === b1.score && r.gained === 0, J({ best: r.best }));
await call(B, 'POST', '/api/noel/atel/start', { n: 5 }); [s, r] = await call(B, 'POST', '/api/noel/atel/start', { n: 5 }); ok('quatrième essai refusé', s === 409);
[s, r] = await call(B, 'POST', '/api/noel/atel/submit', { n: 5, a: 3, inputs: 'triche' }); ok('entrée invalide refusée', s === 400);
// envois simultanés
await call(C, 'POST', '/api/noel/atel/start', { n: 5 });
const both = await Promise.all([call(C, 'POST', '/api/noel/atel/submit', { n: 5, a: 1, inputs: b1.inputs }), call(C, 'POST', '/api/noel/atel/submit', { n: 5, a: 1, inputs: b1.inputs })]);
ok('envois simultanés : un seul accepté', both.filter(x => x[0] === 200).length === 1, J(both.map(x => x[0])));
const cf = (await q("SELECT n FROM event_progress WHERE key = 'nl:flocons' AND user_id = (SELECT id FROM users WHERE name = 'Carl')"))[0];
ok('flocons de Carl créditées une seule fois', +cf.n === E.flocons(b1.score), J(cf));
// têtes des lutins : envoyées par l'administrateur, affichées seulement après confirmation de l'accord
const JPG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xFF, 0xD9]).toString('base64');
[s, r] = await call(B, 'POST', '/api/noel/atel/head', { slot: 0, data: JPG }); ok('seul l\'administrateur envoie une tête', s === 403);
[s, r] = await call(A, 'POST', '/api/noel/atel/head', { slot: 5, data: JPG }); ok('poste inconnu refusé', s === 400);
[s, r] = await call(A, 'POST', '/api/noel/atel/head', { slot: 0, data: 'AAAA' + 'A'.repeat(20) }); ok('fichier qui n\'est pas un JPEG refusé', s === 400);
[s, r] = await call(A, 'POST', '/api/noel/atel/head', { slot: 0, data: 'é' }); ok('contenu invalide refusé', s === 400);
[s, r] = await call(A, 'POST', '/api/noel/atel/head', { slot: 0, data: JPG }); ok('tête 1 enregistrée', s === 200);
[s, r] = await call(A, 'POST', '/api/noel/atel/head', { slot: 1, data: JPG }); ok('tête 2 enregistrée', s === 200);
[s, r] = await call(A, 'POST', '/api/noel/atel/heads-ok', { ok: false }); [s, r] = await call(C, 'GET', '/api/noel/atel'); ok('têtes masquées par l\'administrateur : aucune tête affichée', r.heads.length === 0);
[s, r] = await call(null, 'GET', '/api/noel/atel/head/0'); ok('et l\'image n\'est pas servie', s === 404);
[s, r] = await call(B, 'POST', '/api/noel/atel/heads-ok', { ok: true }); ok('seul l\'administrateur confirme', s === 403);
[s, r] = await call(A, 'POST', '/api/noel/atel/heads-ok', { ok: true }); ok('accord confirmé', s === 200);
[s, r] = await call(C, 'GET', '/api/noel/atel'); ok('les deux têtes sont proposées', r.heads.length === 2 && r.heads[0].slot === 0 && r.heads[1].v > 0, J(r.heads));
[s, r] = await call(null, 'GET', '/api/noel/atel/head/1'); ok('image servie', s === 200);
[s, r] = await call(A, 'POST', '/api/noel/atel/heads-ok', { ok: false }); [s, r] = await call(C, 'GET', '/api/noel/atel'); ok('retrait immédiat de l\'accord : plus aucune tête', r.heads.length === 0);
[s, r] = await call(A, 'POST', '/api/noel/atel/head', { slot: 0, data: null }); [s, r] = await call(A, 'GET', '/api/noel/atel/heads-admin'); ok('suppression d\'une tête envoyée : retour à la tête d\'origine', s === 200 && r.custom[0] === false && r.custom[1] === true && r.builtin[0] === true, J(r));
done();
