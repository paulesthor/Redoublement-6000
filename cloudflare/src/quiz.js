// Questions sur un article précis, fabriquées à partir de son propre texte (aucun service d'IA) :
//   - phrase à compléter : on masque une date, un nombre ou un nom propre de l'article, les autres choix sont plausibles ;
//   - vrai ou faux : une phrase de l'article, telle quelle ou avec une date / un nom remplacé.
// Si l'article est trop court pour fournir 3 questions, on complète avec la description à retrouver, puis le nombre de vues.
const CAP = 'A-ZÀ-ÖØ-Þ', LOW = 'a-zà-öø-ÿ';
const MONTHS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre';
const STOP = new Set(['Le', 'La', 'Les', 'Un', 'Une', 'Des', 'Du', 'De', 'Il', 'Elle', 'Ils', 'Elles', 'On', 'Ce', 'Cet', 'Cette', 'Ces', 'Son', 'Sa', 'Ses', 'Leur', 'Leurs',
  'En', 'Dans', 'Au', 'Aux', 'Par', 'Pour', 'Sur', 'Sous', 'Avec', 'Sans', 'Entre', 'Après', 'Avant', 'Selon', 'Mais', 'Ainsi', 'Puis', 'Depuis', 'Lors', 'Pendant', 'Alors',
  'Premier', 'Première', 'Seconde', 'Deuxième', 'Troisième', 'Nord', 'Sud', 'Est', 'Ouest', 'Monsieur', 'Madame', 'Mme', 'Dr', 'Saint', 'Sainte']);
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const pickN = (arr, n) => shuffle(arr).slice(0, n);
const uniq = a => [...new Set(a)];

/** Nettoie un extrait Wikipédia : prononciations, crochets, retours à la ligne ; coupe la dernière phrase si elle est tronquée. */
export function cleanText(t) {
  t = String(t || '').replace(/\[[^\]]*\]/g, ' ').replace(/\((?:[^()]*[\/ˈʁɛɔœʔ][^()]*)\)/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  if (/(…|\.\.\.)$/.test(t)) t = t.replace(/(…|\.\.\.)$/, '').replace(/[^.!?]*$/, '').trim();
  return t;
}
export function sentencesOf(text) {
  return cleanText(text).split(new RegExp(`(?<=[.!?])\\s+(?=[${CAP}«"(])`)).map(s => s.trim()).filter(s => s.length >= 45 && s.length <= 450 && !/homonymie/i.test(s));
}

/** Noms propres au milieu d'une phrase (jamais le premier mot). */
export function entitiesIn(sentence, bad = new Set()) {
  const out = [];
  const re = new RegExp(`(?:^|[^${CAP}${LOW}0-9'’-])([${CAP}][${CAP}${LOW}'’-]{2,}(?:\\s+(?:(?:de|du|des|la|le|von|van|di|da)\\s+)?[${CAP}][${CAP}${LOW}'’-]{2,})*)`, 'g');
  let m;
  while ((m = re.exec(sentence))) {
    const text = m[1], idx = m.index + m[0].length - text.length;
    if (idx < 2 || /^[«"(\s]*$/.test(sentence.slice(0, idx))) continue;
    if (STOP.has(text.split(/\s+/)[0]) || bad.has(text.toLowerCase())) continue;
    out.push({ text, idx });
  }
  return out;
}
const placesOf = texts => uniq(texts.flatMap(t => sentencesOf(t).flatMap(sn => [...sn.matchAll(new RegExp(`\\b(?:à|au|aux|en|dans|près de|sur|d['’])\\s*(${ENT})`, 'g'))].map(m => m[1])))).filter(e => e.length <= 28);
const entityPool = texts => uniq(texts.flatMap(t => sentencesOf(t).flatMap(s => entitiesIn(s).map(e => e.text)))).filter(e => e.length <= 28);

function replaceOnce(s, what, by) { const i = s.indexOf(what); return i < 0 ? s : s.slice(0, i) + by + s.slice(i + what.length); }
const maskAll = (s, what) => s.split(what).join('████');
/** Phrase longue : on garde ~130 caractères de chaque côté du trou. */
const show = s => {
  if (s.length <= 280) return s;
  const i = Math.max(0, s.indexOf('████')), a = Math.max(0, i - 130), b = Math.min(s.length, i + 134);
  let t = s.slice(a, b);
  if (a > 0) t = '… ' + t.replace(/^\S*\s/, '');
  if (b < s.length) t = t.replace(/\s\S*$/, '') + ' …';
  return t;
};
const fmtNum = n => (Math.abs(n) >= 1e4 ? Math.round(n).toLocaleString('fr-FR') : String(n)).replace(/ | /g, ' ');

function yearOptions(y) {
  const offs = pickN([-40, -30, -25, -20, -15, -12, -10, -7, -5, -3, -2, -1, 1, 2, 3, 5, 7, 10, 12, 15, 20, 25, 30, 40], 12);
  const ds = [];
  for (const o of offs) { const d = y + o; if (d >= 100 && d <= 2026 && d !== y && !ds.includes(d)) ds.push(d); if (ds.length === 3) break; }
  return ds.length === 3 ? ds : null;
}
function numberOptions(v) {
  const factors = pickN([.5, .6, .75, .8, 1.25, 1.5, 2, 3], 8), ds = [];
  for (const f of factors) {
    let d = v * f; d = d >= 100 ? Math.round(d / 10 ** (String(Math.round(d)).length - 2)) * 10 ** (String(Math.round(d)).length - 2) : Math.round(d * 10) / 10;
    if (d > 0 && d !== v && !ds.includes(d)) ds.push(d); if (ds.length === 3) break;
  }
  return ds.length === 3 ? ds : null;
}


const ENT = `[${CAP}][${CAP}${LOW}'’-]{2,}(?:\\s+(?:(?:de|du|des|la|le|von|van|di|da)\\s+)?[${CAP}][${CAP}${LOW}'’-]{2,})*`;
const WHEN = `(?:\\d{1,2}(?:er)?\\s+(?:${MONTHS})\\s+|(?:${MONTHS})\\s+)?`;
const variant = (...opts) => opts[Math.floor(Math.random() * opts.length)];
/** Faits précis d'une phrase (naissance, mort, création, lieu, auteur) : chacun donne une question à la française. */
function natural(sentence, ctx) {
  const out = [], title = ctx.title, T = `« ${title} »`;
  const yearOpts = y => { const ds = yearOptions(y); return ds ? [y, ...ds].sort((a, b) => a - b) : null; };
  const placeOpts = place => {
    const low = place.toLowerCase();
    const own = ctx.articlePlaces.filter(x => x.toLowerCase() !== low && !low.includes(x.toLowerCase()) && !x.toLowerCase().includes(low));
    const o = uniq([...shuffle(own), ...shuffle(ctx.poolPlaces)]).filter(x => x.toLowerCase() !== low).slice(0, 3);
    return o.length === 3 ? shuffle([place, ...o]) : null;
  };
  const addYear = (kind, re, phraser) => {
    const m = sentence.match(re); if (!m) return;
    const y = +m[2], opts = yearOpts(y); if (!opts || y < 476 || y > 2026) return;
    out.push({ kind, make: () => ({ text: phraser(m), options: opts.map(String), answer: opts.indexOf(y) }) });
  };
  const addPlace = (kind, re, phraser, idx = 3) => {
    const m = sentence.match(re); if (!m) return;
    const place = m[idx].trim().replace(/\s+(et|en|dans)$/i, ''), opts = placeOpts(place); if (!opts || ctx.titleWords.has(place.toLowerCase())) return;
    out.push({ kind, make: () => ({ text: phraser(m), options: opts, answer: opts.indexOf(place) }) });
  };
  const born = `(né|née)\\s+(?:le\\s+|en\\s+|vers\\s+)?${WHEN}(\\d{3,4})`, died = `(mort|morte|décédé|décédée)\\s+(?:le\\s+|en\\s+|vers\\s+)?${WHEN}(\\d{3,4})`;
  const pro = g => (/e$/.test(g) ? 'elle' : 'il');
  addYear('birthYear', new RegExp(`\\b${born}`), m => variant(`En quelle année ${title} est-${pro(m[1])} ${m[1]} ?`, `Quelle est l'année de naissance de ${T} ?`, `${T} : en quelle année cette personne est-elle née ?`));
  addYear('deathYear', new RegExp(`\\b${died}`), m => variant(`En quelle année ${title} est-${pro(m[1])} ${m[1]} ?`, `Quelle est l'année de décès de ${T} ?`));
  addPlace('birthPlace', new RegExp(`\\b${born}(?:\\s+${MONTHS}\\s+\\d{4})?\\s+(?:à|au|aux|en|dans)\\s+(${ENT})`), m => variant(`Où ${title} est-${pro(m[1])} ${m[1]} ?`, `Dans quel lieu ${T} est-${pro(m[1])} ${m[1]} ?`));
  addPlace('deathPlace', new RegExp(`\\b${died}(?:\\s+${MONTHS}\\s+\\d{4})?\\s+(?:à|au|aux|en|dans)\\s+(${ENT})`), m => variant(`Où ${title} est-${pro(m[1])} ${m[1]} ?`, `Dans quel lieu ${T} est-${pro(m[1])} ${m[1]} ?`));
  addYear('created', new RegExp(`\\b(fondé|fondée|créé|créée|inauguré|inaugurée|construit|construite|publié|publiée|sorti|sortie|ouvert|ouverte|achevé|achevée|bâti|bâtie)\\b[^.]{0,60}?\\b(?:en|le|depuis|dès)\\s+${WHEN}(\\d{4})`, 'i'),
    m => { const v = m[1].toLowerCase(), f = /e$/.test(v) ? 'elle' : 'il'; return variant(`En quelle année ${T} a-t-${f} été ${v} ?`, `Quand ${T} a-t-${f} été ${v} (année) ?`); });
  addPlace('located', /\b(situé|située|localisé|localisée|établi|établie|implanté|implantée)\b[^.]{0,30}?\b(?:à|au|aux|en|dans|sur)\s+(${ENT})/.source ? new RegExp(`\\b(situé|située|localisé|localisée|établi|établie|implanté|implantée)\\b[^.]{0,30}?\\b(?:à|au|aux|en|dans|sur)\\s+(${ENT})`) : null,
    () => variant(`Où se trouve ${T} ?`, `Dans quel lieu est situé ${T} ?`), 2);
  const byRe = new RegExp(`\\b(écrit|écrite|réalisé|réalisée|dirigé|dirigée|composé|composée|fondé|fondée|créé|créée|construit|construite|peint|peinte|conçu|conçue|publié|publiée|inventé|inventée|découvert|découverte)\\s+par\\s+(${ENT})`);
  const bm = sentence.match(byRe);
  if (bm && !ctx.titleWords.has(bm[2].toLowerCase())) {
    const who = bm[2], low = who.toLowerCase();
    const own = ctx.articleEntities.filter(x => !low.includes(x.toLowerCase()) && !x.toLowerCase().includes(low));
    const o = uniq([...shuffle(own.filter(x => x.includes(' '))), ...shuffle(ctx.poolEntities.filter(x => x.includes(' '))), ...shuffle(own)]).filter(x => x.toLowerCase() !== low).slice(0, 3);
    if (o.length === 3) out.push({ kind: 'by', make: () => { const opts = shuffle([who, ...o]); return { text: variant(`${T} a été ${bm[1]} par qui ?`, `Par qui ${T} a-t-${/e$/.test(bm[1]) ? 'elle' : 'il'} été ${bm[1]} ?`), options: opts, answer: opts.indexOf(who) }; } });
  }
  return out;
}

/** « X est un footballeur international portugais, né… » -> « un footballeur international portugais » */
export function definitionOf(sentence) {
  const m = sentence.match(/\b(?:est|sont|était|fut)\s+((?:un|une|le|la|l['’]|les|des)\s*[^,.;()]{4,80}?)(?=\s*(?:[,.;(]|$)|\s(?:né|née|qui|dont|situé|située|fondé|fondée|créé|créée|basé|basée|à base|de la|du|des)\b)/);
  const d = m?.[1]?.trim();
  return d && d.length >= 8 && d.length <= 70 ? d : null;
}
/** Surnoms et autres noms entre guillemets (« le Roi-Soleil », « CR7 »…) dans une phrase qui annonce un nom alternatif. */
export function aliasesIn(sentence) {
  if (!/\b(dit|dite|surnommé|surnommée|appelé|appelée|nommé|nommée|connu|connue|alias|ou)\b/i.test(sentence)) return [];
  return [...sentence.matchAll(/«\s*([^»]{2,40}?)\s*»/g)].map(m => m[1].trim()).filter(a => a.length >= 2 && !/^(le|la|les|l')\s*$/i.test(a));
}

/** Fabrique, pour une phrase, la liste des questions possibles. */
function candidates(sentence, ctx) {
  const list = [], title = ctx.title;
  const head = `À propos de « ${title} »`;
  list.push(...natural(sentence, ctx));
  // 0) définition / surnom (question sans afficher la phrase)
  if (ctx.first) {
    const d = definitionOf(sentence);
    if (d) {
      const art = d.split(/\s+/)[0].toLowerCase().replace(/’/, "'"), others = ctx.poolDefs.filter(x => x !== d && x.split(/\s+/)[0].toLowerCase().replace(/’/, "'") === art);
      if (others.length >= 3) list.push({ kind: 'def', make: () => { const opts = shuffle([d, ...pickN(others, 3)]); return { text: `Que désigne « ${title} » ?`, options: opts, answer: opts.indexOf(d) }; } });
    }
    const al = aliasesIn(sentence).filter(a => !ctx.titleWords.has(a.toLowerCase()));
    if (al.length) {
      const a = al[0], others = ctx.poolQuotes.filter(x => x.toLowerCase() !== a.toLowerCase() && !sentence.includes(x)).filter(x => Math.abs(x.length - a.length) <= 12);
      if (others.length >= 3) list.push({ kind: 'alias', make: () => { const opts = shuffle([a, ...pickN(others, 3)]); return { text: `Quel autre nom ou surnom est donné à « ${title} » ?`, options: opts, answer: opts.indexOf(a) }; } });
    }
  }
  // 1) année
  const years = [...sentence.matchAll(/\b(\d{3,4})\b/g)].map(m => +m[1]).filter(y => y >= 476 && y <= 2026);
  if (years.length) {
    const y = years[0], ds = yearOptions(y);
    if (ds) list.push({ kind: 'year', make: () => { const opts = [y, ...ds].sort((a, b) => a - b); return { text: `${head}, complète la phrase :\n« ${show(maskAll(sentence, String(y)))} »`, options: opts.map(String), answer: opts.indexOf(y) }; },
      tf: sentence.length <= 280 ? () => { const alt = ds[0]; return { true: sentence, fake: replaceOnce(sentence, String(y), String(alt)) }; } : undefined });
  }
  // 2) nombre avec unité
  const nm = sentence.match(/(\d{1,3}(?:[  ]\d{3})+|\d+(?:,\d+)?)\s?(habitants|km²|km|mètres|kg|%|millions|milliards|ans|membres|épisodes|saisons|titres|départements|communes|buts|matchs|pays|langues|espèces)\b/);
  if (nm) {
    const raw = nm[1], v = parseFloat(raw.replace(/[  ]/g, '').replace(',', '.')), ds = Number.isFinite(v) ? numberOptions(v) : null;
    if (ds && v >= 3 && !(v >= 476 && v <= 2026 && !nm[2].match(/habitants|km|m|kg|%/))) list.push({ kind: 'num', make: () => {
      const opts = [v, ...ds].sort((a, b) => a - b); return { text: `${head}, complète la phrase :\n« ${show(replaceOnce(sentence, nm[0], '████ ' + nm[2]))} »`, options: opts.map(fmtNum), answer: opts.indexOf(v) }; } });
  }
  // 3) nom propre
  const ents = entitiesIn(sentence, ctx.titleWords);
  if (ents.length) {
    const e = ents[0].text, own = ctx.articleEntities.filter(x => x.toLowerCase() !== e.toLowerCase() && !e.toLowerCase().includes(x.toLowerCase()) && !x.toLowerCase().includes(e.toLowerCase()));
    const sameLen = x => Math.abs(x.split(/\s+/).length - e.split(/\s+/).length) <= 1;
    const others = uniq([...shuffle(own.filter(sameLen)), ...shuffle(ctx.poolEntities.filter(sameLen))]).filter(x => x.toLowerCase() !== e.toLowerCase()).slice(0, 3);
    if (others.length === 3) list.push({ kind: 'ent', make: () => { const opts = shuffle([e, ...others]); return { text: `${head}, complète la phrase :\n« ${show(maskAll(sentence, e))} »`, options: opts, answer: opts.indexOf(e) }; },
      tf: sentence.length <= 280 ? () => ({ true: sentence, fake: replaceOnce(sentence, e, others[0]) }) : undefined });
  }
  return list;
}
const tfQuestion = (title, t) => { const real = Math.random() < .5; return { text: `À propos de « ${title} », vrai ou faux ?\n« ${real ? t.true : t.fake} »`, options: ['Vrai', 'Faux'], answer: real ? 0 : 1 }; };

/**
 * Trois questions (par défaut) sur un article précis.
 * card : { id, title, extract, views } — text : texte de l'article (le plus long possible) — pool : { cards: [{ title, extract, views }] } autres articles pour les mauvaises réponses.
 */
export function makeArticleQuestions(card, text, pool, n = 3) {
  const title = card.title, titleWords = new Set(title.toLowerCase().split(/[^a-zà-öø-ÿ0-9]+/).filter(w => w.length > 2).concat(title.toLowerCase()));
  const sents = sentencesOf(text || card.extract);
  const ctx = { title, titleWords, articleEntities: uniq(sents.flatMap(s => entitiesIn(s, titleWords).map(e => e.text))), poolEntities: entityPool(pool.cards.map(c => c.extract || '')) };
  ctx.articlePlaces = placesOf([text || card.extract]); ctx.poolPlaces = placesOf(pool.cards.map(c => c.extract || ''));
  ctx.poolDefs = uniq(pool.cards.map(c => definitionOf(sentencesOf(c.extract || '')[0] || '')).filter(Boolean));
  ctx.poolQuotes = uniq(pool.cards.flatMap(c => sentencesOf(c.extract || '').slice(0, 2).flatMap(aliasesIn)));
  const per = sents.map((s, i) => ({ s, c: candidates(s, { ...ctx, first: i === 0 }) })).filter(x => x.c.length);
  const out = [], used = new Set(), usedKind = new Set();
  const NATURAL = new Set(['birthYear', 'birthPlace', 'deathYear', 'deathPlace', 'created', 'located', 'by', 'def', 'alias']);
  const CLOZE = new Set(['year', 'num', 'ent']);
  // toutes les questions possibles, mélangées à chaque partie ; les questions précises passent avant les phrases à trous
  const pool_ = shuffle(per.flatMap(x => x.c.map(c => ({ ...c, s: x.s })))).sort((a, b) => (NATURAL.has(b.kind) - NATURAL.has(a.kind)) * (Math.random() < .8 ? 1 : 0));
  const add = (c, asTf = false) => { used.add(c.s); usedKind.add(c.kind); out.push(asTf ? tfQuestion(title, c.tf()) : c.make()); };
  // 1re passe : un type de question par article, au maximum 2 phrases à trous
  let clozes = 0;
  for (const c of pool_) {
    if (out.length >= n) break;
    if (usedKind.has(c.kind) || (CLOZE.has(c.kind) && (used.has(c.s) || clozes >= 2))) continue;
    if (CLOZE.has(c.kind)) clozes++;
    add(c);
  }
  // 2e passe : on complète avec n'importe quelle autre question (vrai/faux compris)
  for (const c of pool_) {
    if (out.length >= n) break;
    if (used.has(c.s) && CLOZE.has(c.kind)) continue;
    if (usedKind.has(c.kind) && !c.tf) continue;
    if (c.tf && Math.random() < .5 && !used.has(c.s)) add(c, true); else if (!usedKind.has(c.kind)) add(c);
  }
  // repli : description à retrouver, puis nombre de vues
  const others = shuffle(pool.cards.filter(p => p.title !== title));
  let descDone = false;
  while (out.length < n) {
    const clip = c => { const t = cleanText(c.extract).replace(new RegExp((c.title || '').split(/\s+/).filter(w => w.length > 2).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '$^', 'gi'), '█████'); return t.length > 150 ? t.slice(0, 147).replace(/\s+\S*$/, '') + '…' : t; };
    if (!descDone && card.extract && card.extract.length > 80 && others.filter(o => o.extract).length >= 3) {
      const opts = shuffle([card, ...others.filter(o => o.extract).slice(0, 3)]);
      descDone = true;
      out.push({ text: `Quelle description correspond à « ${title} » ?`, options: opts.map(clip), answer: opts.indexOf(card) });
    } else {
      const o = others[out.length] || { title: 'France', views: 100000 };
      out.push({ text: `« ${title} » est-elle plus consultée sur Wikipédia que « ${o.title} » ?`, options: ['Oui', 'Non'], answer: (card.views ?? 0) >= (o.views ?? 0) ? 0 : 1 });
    }
  }
  return shuffle(out.slice(0, n));
}
