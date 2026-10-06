// Questions de quiz générées par un petit modèle de langage (Workers AI, plan gratuit : 10 000 neurons / jour).
// - Les questions d'un article sont fabriquées UNE fois, puis gardées en base (table quizzes) : une bataille ne consomme du quota que pour des articles jamais vus.
// - Chaque réponse du modèle est vérifiée (format, choix distincts, bonne réponse présente dans le texte) ; ce qui ne passe pas est jeté.
// - Si le quota est épuisé, si le modèle échoue ou s'il n'y a pas de liaison AI, on retombe sur le générateur à règles (quiz.js) : la bataille ne casse jamais.
import { makeArticleQuestions, cleanText } from './quiz.js';

// Mistral Small 3.1 : le meilleur français disponible gratuitement (~60 neurons par article) ; Llama 3.1 8B en secours (~25 neurons).
const MODELS = ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct-fp8-fast'];
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function buildMessages(title, text) {
  const body = cleanText(text).slice(0, 2200);
  return [
    { role: 'system', content: 'Tu écris des questions de quiz de culture générale, en français, à partir d\'un article Wikipédia. Tu réponds UNIQUEMENT par un objet JSON valide, sans texte autour.' },
    { role: 'user', content: `Article : « ${title} »\n\nTexte :\n"""\n${body}\n"""\n\n` +
      'Écris 6 questions à choix multiples sur CET article. Elles doivent être variées et s\'adapter à son contenu : choisis parmi une date ou une année, un lieu, une personne, un chiffre, une définition, un synonyme ou le sens d\'un mot du texte, un vrai ou faux. Ne pose jamais deux questions du même type.\n' +
      'Règles :\n- Chaque question se comprend seule (cite le sujet) et ne donne pas sa propre réponse.\n- La bonne réponse est justifiée par le texte (sauf pour un synonyme).\n- 4 choix plausibles du même genre, un seul est correct. Pour un vrai ou faux : exactement 2 choix, "Vrai" et "Faux".\n- Phrases courtes (moins de 200 caractères), choix courts (moins de 80 caractères).\n' +
      'Réponds avec ce JSON exact : {"questions":[{"type":"annee","question":"…","choices":["…","…","…","…"],"answer":0}]} où "answer" est l\'indice (0 à 3) du bon choix.' },
  ];
}

/** Extrait le JSON de la réponse du modèle (texte brut, bloc ```json, ou objet déjà analysé) puis vérifie chaque question. */
export function parseQuestions(raw, title, text) {
  let data = raw;
  if (typeof raw === 'string') {
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) return [];
    try { data = JSON.parse(raw.slice(a, b + 1)); } catch { return []; }
  }
  const list = Array.isArray(data) ? data : data?.questions;
  if (!Array.isArray(list)) return [];
  const src = norm(text), out = [], seen = new Set();
  for (const q of list) {
    const question = String(q?.question ?? q?.text ?? '').replace(/\s+/g, ' ').trim();
    const choices = Array.isArray(q?.choices) ? q.choices.map(c => String(c).replace(/\s+/g, ' ').trim()) : null;
    let ans = q?.answer;
    if (typeof ans === 'string' && /^[A-D]$/i.test(ans.trim())) ans = 'ABCD'.indexOf(ans.trim().toUpperCase());
    ans = Number(ans);
    if (question.length < 12 || question.length > 260 || !choices || !Number.isInteger(ans) || ans < 0 || ans >= choices.length) continue;
    const tf = choices.length === 2 && choices.every(c => /^(vrai|faux)$/i.test(c));
    if (!(tf || choices.length === 4)) continue;
    if (choices.some(c => !c || c.length > 120) || new Set(choices.map(norm)).size !== choices.length) continue;
    const good = choices[ans], type = String(q?.type || '').toLowerCase();
    if (!tf) {
      const ng = norm(good);
      if (ng.length > 3 && norm(question).includes(ng)) continue;                          // la question donne la réponse
      const synonym = /synonym|sens|defin|mot/.test(type);
      if (!synonym) {
        const words = ng.split(' ').filter(Boolean);
        const hit = ng.length <= 40 ? src.includes(ng) : words.filter(w => src.includes(w)).length / words.length >= .6;
        if (!hit) continue;                                                                // une bonne réponse absente du texte est probablement inventée
      }
    }
    const key = norm(question);
    if (seen.has(key)) continue; seen.add(key);
    const head = tf && !/vrai ou faux/i.test(question) ? 'Vrai ou faux ? ' : '';
    out.push({ text: head + (norm(question).includes(norm(title)) ? question : `À propos de « ${title} » : ${question}`), options: tf ? ['Vrai', 'Faux'] : choices, answer: tf ? (/^vrai$/i.test(good) ? 0 : 1) : ans, ai: true });
  }
  return out;
}

let backoffUntil = 0;     // quota épuisé ou modèle saturé : on laisse la main aux règles quelques minutes
const lastError = { msg: null };
async function generate(env, card, text) {
  if (!env.AI || Date.now() < backoffUntil || env.AI_QUIZ === '0') return null;
  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, { messages: buildMessages(card.title, text), max_tokens: 1200, temperature: .5 });
      const raw = typeof out === 'string' ? out : (out?.response ?? out?.result?.response ?? out?.choices?.[0]?.message?.content ?? out);
      const qs = parseQuestions(raw, card.title, text);
      if (qs.length >= 3) return { qs, model };
      lastError.msg = `${model}: ${qs.length} question(s) valide(s)`;
    } catch (e) {
      lastError.msg = `${model}: ${e.message}`;
      if (/limit|quota|capacity|3040|4006|429/i.test(String(e.message))) { backoffUntil = Date.now() + 10 * 60000; return null; }
    }
  }
  return null;
}

/** Questions IA d'un article : lues en base, sinon générées puis gardées. Renvoie [] si l'IA n'est pas disponible. */
export async function aiQuestions(env, card, text) {
  try {
    const row = await env.DB.prepare('SELECT questions FROM quizzes WHERE card_id = ?').bind(card.id).first();
    if (row) return JSON.parse(row.questions);
  } catch { /* table absente : on génère quand même */ }
  const g = await generate(env, card, text);
  if (!g) return [];
  try { await env.DB.prepare('INSERT OR REPLACE INTO quizzes (card_id, questions, model, ts) VALUES (?,?,?,?)').bind(card.id, JSON.stringify(g.qs), g.model, Date.now()).run(); } catch { /* pas grave */ }
  return g.qs;
}
export const lastAiError = () => lastError.msg;

/** n questions pour un article : celles du modèle (tirées au hasard à chaque partie, choix mélangés), complétées par les règles si besoin. */
export async function battleQuestions(env, card, text, pool, n = 3) {
  const ai = shuffle(await aiQuestions(env, card, text)).slice(0, n).map(q => { const o = shuffle(q.options.map((t, i) => ({ t, ok: i === q.answer }))); return q.options.length === 2 ? q : { text: q.text, options: o.map(x => x.t), answer: o.findIndex(x => x.ok), ai: true }; });
  if (ai.length >= n) return ai;
  const rules = makeArticleQuestions(card, text, pool, n - ai.length);
  return shuffle([...ai, ...rules]);
}
