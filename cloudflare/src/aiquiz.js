// Questions de quiz générées par un petit modèle de langage (Workers AI, plan gratuit : 10 000 neurons / jour).
// - Les questions d'un article sont fabriquées UNE fois, puis gardées en base (table quizzes) : une bataille ne consomme du quota que pour des articles jamais vus.
// - Chaque réponse du modèle est vérifiée (format, choix distincts, bonne réponse présente dans le texte) ; ce qui ne passe pas est jeté.
// - Si le quota est épuisé, si le modèle échoue ou s'il n'y a pas de liaison AI, on retombe sur le générateur à règles (quiz.js) : la bataille ne casse jamais.
import { makeArticleQuestions, cleanText } from './quiz.js';

// Mistral Small 3.1 : le meilleur français disponible gratuitement (~50 neurons par article) ; Llama 3.1 8B en secours (~20 neurons).
const MODELS = ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct-fp8-fast'];
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export const QUIZ_VERSION = 'v2';            // changer ce numéro force la régénération de toutes les questions gardées en base
const KINDS = 'annee|lieu|personne|chiffre|cause|relation|calcul|langue';
export function buildMessages(title, text) {
  const body = cleanText(text).slice(0, 3500);
  return [
    { role: 'system', content: 'Tu es un auteur de quiz de culture générale exigeant, de niveau expert. Tu écris en français des questions DIFFICILES à partir d\'un article Wikipédia. Tu réponds UNIQUEMENT par un objet JSON valide, sans texte autour.' },
    { role: 'user', content: `Article : « ${title} »\n\nTexte :\n"""\n${body}\n"""\n\n` +
      'Écris 4 questions à choix multiples DIFFICILES sur CET article (les 3 meilleures seront gardées).\n' +
      'Niveau : pour quelqu\'un qui connaît déjà le sujet. Ne pose pas de question dont la réponse est dans la première phrase ou évidente. Privilégie les détails précis du texte : dates, chiffres, lieux, noms, causes, conséquences, ordre des événements, liens entre personnes ou éléments.\n' +
      'Au moins 2 questions demandent un raisonnement : relier deux informations du texte, comparer, déduire une conséquence ou calculer (écart entre deux années, ordre de grandeur) à partir du texte.\n' +
      'Règles impératives :\n' +
      '- Chaque question a EXACTEMENT 4 choix et un seul est correct. Jamais de vrai ou faux, jamais de oui ou non, jamais « aucune de ces réponses ».\n' +
      '- Les 3 mauvaises réponses sont très crédibles : même nature, même ordre de grandeur, même époque que la bonne, proches d\'elle. Aucun choix absurde.\n' +
      '- INTERDIT : les questions de synonyme, de définition d\'un mot ou de sens d\'un mot. Exception : si l\'article porte sur une langue étrangère ou un mot étranger, tu peux poser une question de vocabulaire ou de traduction (type "langue").\n' +
      '- La bonne réponse se trouve dans le texte (ou s\'en déduit). La question ne contient ni la réponse ni d\'indice évident, et ne répète pas les mots de la bonne réponse.\n' +
      '- Les 4 choix ont une longueur voisine : la bonne réponse n\'est PAS plus longue ni plus détaillée que les mauvaises (au moins une mauvaise réponse est aussi longue qu\'elle). Place la bonne réponse à des indices variés.\n' +
      '- Chaque question se comprend seule (cite le sujet), moins de 220 caractères ; choix de moins de 80 caractères.\n' +
      `Réponds avec ce JSON exact : {"questions":[{"type":"${KINDS}","question":"…","choices":["…","…","…","…"],"answer":0}]} où "type" est l'un de ces mots et "answer" l'indice (0 à 3) du bon choix.` },
  ];
}

/** Extrait le JSON de la réponse du modèle (texte brut, bloc ```json, ou objet déjà analysé) puis vérifie chaque question : 4 choix, pas de vrai/faux ni oui/non, pas de synonyme, réponse non devinable. */
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
  const words = s => norm(s).split(' ').filter(w => w.length >= 5);
  for (const q of list) {
    const question = String(q?.question ?? q?.text ?? '').replace(/\s+/g, ' ').trim();
    const choices = Array.isArray(q?.choices) ? q.choices.map(c => String(c).replace(/\s+/g, ' ').trim()) : null;
    let ans = q?.answer;
    if (typeof ans === 'string' && /^[A-D]$/i.test(ans.trim())) ans = 'ABCD'.indexOf(ans.trim().toUpperCase());
    ans = Number(ans);
    const type = String(q?.type || '').toLowerCase();
    if (question.length < 12 || question.length > 260 || !choices || choices.length !== 4 || !Number.isInteger(ans) || ans < 0 || ans > 3) continue;   // exactement 4 choix
    if (choices.some(c => !c || c.length > 120) || new Set(choices.map(norm)).size !== 4) continue;
    if (/vrai ou faux|vrai\s*\/\s*faux/i.test(question) || choices.some(c => /^(vrai|faux|oui|non)\.?$/i.test(c))) continue;             // jamais de vrai/faux ni de oui/non
    if (choices.some(c => /aucune? (de ces|des) (réponses|propositions)|toutes (ces|les) (réponses|propositions)|les deux|ni l'un ni l'autre/i.test(c))) continue;
    const foreign = type === 'langue';
    if (!foreign && (/synonym|défin|definition|sens|mot/.test(type) || /\b(synonyme|antonyme|signifie|veut dire|sens du mot|définition du mot|que désigne le terme|comment appelle-t-on)\b/i.test(question))) continue;   // pas de synonymes, sauf langues étrangères
    const good = choices[ans], ng = norm(good);
    if (ng.length > 3 && norm(question).includes(ng)) continue;                                // la question donne la réponse
    if (!foreign && type !== 'calcul') {
      const w = ng.split(' ').filter(Boolean);
      const hit = w.filter(x => src.includes(x)).length / w.length >= .6;                  // au moins 60 % des mots de la bonne réponse viennent du texte
      if (!hit) continue;                                                                    // une bonne réponse absente du texte est probablement inventée
    }
    const tw = new Set(words(title)), qw = new Set(words(question).filter(x => !tw.has(x))), overlap = c => words(c).filter(x => qw.has(x)).length;
    if (overlap(good) > 0 && choices.every((c, i) => i === ans || overlap(c) === 0)) continue;   // seule la bonne réponse reprend des mots de la question : trop facile à deviner
    const others = choices.filter((_, i) => i !== ans).map(c => c.length);
    if (good.length > Math.max(...others) * 1.15 + 3) continue;                              // la bonne réponse ne doit pas être reconnaissable à sa longueur
    const key = norm(question);
    if (seen.has(key)) continue; seen.add(key);
    out.push({ type, text: norm(question).includes(norm(title)) ? question : `À propos de « ${title} » : ${question}`, options: choices, answer: ans, ai: true });
  }
  return out;
}
/** Garde 3 questions en variant les types autant que possible. */
export function pickThree(qs) {
  const picked = [];
  for (const q of qs) if (picked.length < 3 && !picked.some(p => p.type === q.type)) picked.push(q);
  for (const q of qs) if (picked.length < 3 && !picked.includes(q)) picked.push(q);
  return picked.slice(0, 3).map(({ type, ...q }) => q);
}

/** Essai d'un modèle précis, sans rien enregistrer (comparaison des modèles). */
export async function tryModel(env, model, card, text) {
  const t0 = Date.now();
  const out = await env.AI.run(model, { messages: buildMessages(card.title, text), max_tokens: 1200, temperature: .5 });
  const raw = typeof out === 'string' ? out : (out?.response ?? out?.result?.response ?? out?.choices?.[0]?.message?.content ?? out);
  return { qs: parseQuestions(raw, card.title, text), usage: out?.usage ?? null, ms: Date.now() - t0, sample: typeof raw === 'string' ? raw.slice(0, 160) : null };
}
let backoffUntil = 0;     // quota épuisé ou modèle saturé : on laisse la main aux règles quelques minutes
const lastError = { msg: null };
// Mistral (le plus fin, ~39 neurons par article) tant qu'on en a généré moins de MISTRAL_PER_DAY aujourd'hui ; ensuite Llama 8B (~15 neurons, 2,6 fois plus d'articles par jour).
const MISTRAL_PER_DAY = 120;
let mistralCount = { n: 0, at: 0 };
async function modelOrder(env) {
  if (Date.now() - mistralCount.at > 60000) {
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    try { mistralCount = { n: (await env.DB.prepare("SELECT COUNT(*) n FROM quizzes WHERE model LIKE '%mistral%' AND ts >= ?").bind(day.getTime()).first()).n, at: Date.now() }; } catch { mistralCount = { n: 0, at: Date.now() }; }
  }
  return mistralCount.n < MISTRAL_PER_DAY ? MODELS : [...MODELS].reverse();
}
async function generate(env, card, text) {
  if (!env.AI || Date.now() < backoffUntil || env.AI_QUIZ === '0') return null;
  for (const model of await modelOrder(env)) {
    try {
      const out = await env.AI.run(model, { messages: buildMessages(card.title, text), max_tokens: 1200, temperature: .5 });
      const raw = typeof out === 'string' ? out : (out?.response ?? out?.result?.response ?? out?.choices?.[0]?.message?.content ?? out);
      const qs = parseQuestions(raw, card.title, text);
      if (qs.length >= 3) return { qs: pickThree(qs), model: model + '|' + QUIZ_VERSION };
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
    const row = await env.DB.prepare('SELECT questions, model FROM quizzes WHERE card_id = ?').bind(card.id).first();
    if (row && String(row.model).endsWith('|' + QUIZ_VERSION)) return JSON.parse(row.questions);      // questions d'une ancienne version : on les régénère
  } catch { /* table absente : on génère quand même */ }
  const g = await generate(env, card, text);
  if (!g) return [];
  try { await env.DB.prepare('INSERT OR REPLACE INTO quizzes (card_id, questions, model, ts) VALUES (?,?,?,?)').bind(card.id, JSON.stringify(g.qs), g.model, Date.now()).run(); if (/mistral/.test(g.model)) mistralCount.n++; } catch { /* pas grave */ }
  return g.qs;
}
export const lastAiError = () => lastError.msg;

/** n questions pour un article : celles du modèle (tirées au hasard à chaque partie, choix mélangés), complétées par les règles si besoin. */
export async function battleQuestions(env, card, text, pool, n = 3) {
  const ai = shuffle(await aiQuestions(env, card, text)).slice(0, n).map(q => { const o = shuffle(q.options.map((t, i) => ({ t, ok: i === q.answer }))); return { text: q.text, options: o.map(x => x.t), answer: o.findIndex(x => x.ok), ai: true }; });   // choix mélangés à chaque partie
  if (ai.length >= n) return ai;
  const rules = makeArticleQuestions(card, text, pool, n - ai.length);
  return shuffle([...ai, ...rules]);
}
