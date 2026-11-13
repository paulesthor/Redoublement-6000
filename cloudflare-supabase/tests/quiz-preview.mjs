// Aperçu administrateur du quiz du jour (questions et bonnes réponses).
import './api.mjs';
const { call, ok, DB, J, done, env } = globalThis.__T;
// Wikipédia factice : un long extrait ; IA factice : quatre questions à choix
const long = "Le Kremlin de Moscou est une forteresse fortifiée au cœur de la capitale russe, construite à partir de 1156 puis agrandie par Ivan III en 1485. Son enceinte de briques rouges mesure 2 235 mètres et compte vingt tours. Il abrite la résidence du président et plusieurs cathédrales du XVe siècle. ".repeat(4);
const realFetch = globalThis.fetch; globalThis.fetch = async (u, o) => String(u).includes('exchars=3500') ? new Response(JSON.stringify({ query: { pages: { 1: { pageid: 1, title: 'Kremlin de Moscou', extract: long } } } }), { status: 200 }) : realFetch(u, o);
const good = { questions: [
 { type: 'annee', question: 'En quelle année la construction a-t-elle commencé ?', choices: ['1056', '1156', '1256', '1356'], answer: 1 },
 { type: 'chiffre', question: 'Quelle est la longueur de l\'enceinte ?', choices: ['2 035 mètres', '2 235 mètres', '2 435 mètres', '2 635 mètres'], answer: 1 },
 { type: 'chiffre', question: 'Combien de tours compte l\'enceinte ?', choices: ['dix', 'quinze', 'vingt', 'vingt-cinq'], answer: 2 },
 { type: 'personne', question: 'Qui a agrandi la forteresse en 1485 ?', choices: ['Ivan III', 'Pierre Ier', 'Ivan IV', 'Nicolas II'], answer: 0 },
 { type: 'annee', question: 'À quel siècle datent plusieurs cathédrales du site ?', choices: ['XIIe siècle', 'XIVe siècle', 'XVe siècle', 'XVIIe siècle'], answer: 2 },
 { type: 'chiffre', question: 'Combien de mètres mesure l\'enceinte de briques rouges ?', choices: ['2 135', '2 235', '2 335', '2 435'], answer: 1 }] };
env.AI = { run: async () => ({ response: JSON.stringify(good) }) };
const mk = async n => { await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); const [, l] = await call(null, 'POST', '/api/login', { name: n, password: 'secret1' }); return l.token; };
const A = await mk('Alice'); await DB.prepare("UPDATE users SET is_admin = 1 WHERE name = 'Alice'").run(); const B = await mk('Bob');
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' });
let [s, r] = await call(B, 'GET', '/api/admin/quiz-today?event=1'); ok('réservé à l\'administrateur', s === 403, s);
[s, r] = await call(A, 'GET', '/api/admin/quiz-today?event=1');
ok('quiz de l\'événement : article, questions et bonnes réponses', s === 200 && r.day.startsWith('cm:') && r.title && r.questions.length >= 3 && r.questions.every(q => q.options.length >= 2 && q.good === q.options[q.answer]), J(r).slice(0, 300));
const [s2, r2] = await call(A, 'GET', '/api/admin/quiz-today?event=1'); ok('même quiz à la deuxième demande (le même pour tous)', JSON.stringify(r2.questions) === JSON.stringify(r.questions));
[s, r] = await call(A, 'GET', '/api/admin/quiz-today'); ok('quiz du jeu normal : jour différent', s === 200 && !r.day.startsWith('cm:'));
done();
