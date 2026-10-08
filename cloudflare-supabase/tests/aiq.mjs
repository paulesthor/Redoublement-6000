import './api.mjs';
const { DB, env, ok, J, done } = globalThis.__T;
const { aiQuestions, battleQuestions } = await import('../src/aiquiz.js');
const text = "La Tour Eiffel est une tour de fer puddlé de 330 mètres de hauteur située à Paris, construite par Gustave Eiffel en 1889 pour l'Exposition universelle. Elle accueille environ sept millions de visiteurs par an et pesait 7300 tonnes avant ajout des antennes.";
const good = { questions: [
 { type: 'annee', question: "En quelle année la Tour Eiffel a-t-elle été construite ?", choices: ['1887', '1889', '1891', '1893'], answer: 1 },
 { type: 'chiffre', question: "Quelle est la hauteur de la tour ?", choices: ['300 mètres', '330 mètres', '350 mètres', '310 mètres'], answer: 1 },
 { type: 'personne', question: "Qui a construit la tour de fer puddlé ?", choices: ['Gustave Eiffel', 'Gustave Courbet', 'Eugène Delacroix', 'Henri Matisse'], answer: 0 },
 { type: 'chiffre', question: "Combien de tonnes pesait la tour avant les antennes ?", choices: ['7300 tonnes', '7100 tonnes', '7500 tonnes', '7700 tonnes'], answer: 0 },
]};
let calls = 0, shape = 'string';
const e2 = { ...env, AI: { run: async () => { calls++; const s = JSON.stringify(good); return shape === 'string' ? { response: s } : shape === 'obj' ? { response: good } : { choices: [{ message: { content: s } }] }; } } };
const card = { id: 424242, title: 'Tour Eiffel' };
for (const sh of ['string', 'obj', 'chat']) { shape = sh; await DB.prepare('DELETE FROM quizzes').run();
  const q = await aiQuestions(e2, card, text, 3); console.log(sh, q.length, J(q[0] || null).slice(0, 120)); ok('IA ' + sh, q.length === 3 && q.every(x => x.ai !== false)); }
const row = await DB.prepare('SELECT * FROM quizzes').first(); console.log(J(row).slice(0, 200));
const b = await battleQuestions(e2, card, text, { cards: [] }, 3); ok('battleQuestions', b.length === 3 && b.every(x => x.ai), J(b));
const bad = { ...env, AI: { run: async () => { throw new Error('modèle indisponible'); } } };
await aiQuestions(bad, { id: 777, title: 'Autre' }, text, 3); await new Promise(r => setTimeout(r, 300));
const er = await DB.prepare("SELECT value FROM settings WHERE key = 'ai_last_error'").first(); ok('erreur IA enregistrée', er && /indisponible/.test(er.value), J(er));
{ const { extendEnv } = await import('../src/pg.js'); const raw = {}; Object.defineProperty(raw, 'AI', { value: { run: 1 }, enumerable: false }); raw.X = 2;
  const w = extendEnv(raw, { DB: 3 }); ok('liaison non énumérable (AI) conservée', w.AI?.run === 1 && w.X === 2 && w.DB === 3, J(Object.keys(w))); }
done();
