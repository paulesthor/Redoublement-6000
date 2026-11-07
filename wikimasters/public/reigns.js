// « Le Dernier Tsar » : démo d'un jeu de cartes à glisser (style Reigns). Tu joues un courtisan qui veut prendre la place du tsar.
// Tout est local : texte, SVG et animations CSS. Aperçu réservé à l'administrateur.
const ENDS_KEY = 'wm_tsar_ends';
const TOTAL_ENDS = 20;
const clamp = v => Math.max(0, Math.min(100, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- générateur de personnages : visage, barbe, coiffe, vêtement, accessoire ----------
const SKIN = ['#f0c9a0', '#e3b184', '#f6d7b8', '#d99f73'];
function faceInner(o) {
  const skin = SKIN[o.skin ?? 0], coat = o.coat || '#6b1d1d', trim = o.trim || '#f4d56b', hair = o.hair || '#3a2a20';
  const beard = { none: '', full: `<path d="M62 112c4 38 24 48 38 48s34-10 38-48c-10 14-24 18-38 18s-28-4-38-18z" fill="${hair}"/>`, pointy: `<path d="M80 128c4 30 14 38 20 44 6-6 16-14 20-44-12 8-28 8-40 0z" fill="${hair}"/>`, mustache: `<path d="M74 122c8-8 18-6 26 0 8-6 18-8 26 0-6 10-18 10-26 4-8 6-20 6-26-4z" fill="${hair}"/>` }[o.beard || 'none'];
  const hat = { none: `<path d="M60 84c0-26 18-40 40-40s40 14 40 40c-10-12-24-18-40-18s-30 6-40 18z" fill="${hair}"/>`,
    ushanka: `<path d="M56 92c-2-34 20-52 44-52s46 18 44 52c-8-8-14-10-20-10H76c-6 0-12 2-20 10z" fill="#5a4636"/><rect x="52" y="86" width="96" height="14" rx="7" fill="#7b6048"/><circle cx="100" cy="64" r="7" fill="${trim}"/>`,
    crown: `<path d="M64 88V52l18 18 18-28 18 28 18-18v36z" fill="${trim}" stroke="#b8902a" stroke-width="3"/><circle cx="100" cy="46" r="5" fill="#c0161d"/>`,
    cap: `<path d="M58 90c0-28 18-42 42-42s42 14 42 42z" fill="${o.cap || '#3b5a3a'}"/><rect x="54" y="86" width="92" height="10" rx="4" fill="#1f2d1f"/><path d="M92 62l8-10 8 10z" fill="${trim}"/>`,
    toque: `<path d="M64 88c-14-6-14-26 2-30 2-14 20-18 34-10 14-8 32-4 34 10 16 4 16 24 2 30z" fill="#fff"/><rect x="64" y="84" width="72" height="10" fill="#e8e8e8"/>`,
    mitre: `<path d="M70 90c0-30 14-52 30-60 16 8 30 30 30 60z" fill="#e8dfc7" stroke="${trim}" stroke-width="4"/><path d="M100 40v44M84 62h32" stroke="${trim}" stroke-width="5"/>` }[o.hat || 'none'];
  const eyes = o.dead ? `<path d="M80 102l12 12m0-12L80 114M108 102l12 12m0-12l-12 12" stroke="#2a1a14" stroke-width="4" stroke-linecap="round"/>`
    : `<circle cx="86" cy="108" r="4.500" fill="#2a1a14"/><circle cx="114" cy="108" r="4.500" fill="#2a1a14"/>${o.brow === 'angry' ? '<path d="M76 98l20 6M124 98l-20 6" stroke="#2a1a14" stroke-width="4" stroke-linecap="round"/>' : '<path d="M78 98h16M106 98h16" stroke="#2a1a14" stroke-width="3" stroke-linecap="round"/>'}`;
  const extra = { none: '', medals: `<circle cx="78" cy="196" r="6" fill="${trim}"/><circle cx="96" cy="200" r="6" fill="#c0161d"/><circle cx="114" cy="196" r="6" fill="${trim}"/>`, sash: `<path d="M64 168l72 40" stroke="#c0161d" stroke-width="12"/>`, apron: `<path d="M74 168h52v40H74z" fill="#f7f2e4"/>`, cross: `<path d="M100 172v22M90 180h20" stroke="${trim}" stroke-width="5"/>`, bear: '' }[o.extra || 'none'];
  return `<path d="M30 210c4-34 34-50 70-50s66 16 70 50z" fill="${coat}"/><path d="M84 160l16 16 16-16" fill="none" stroke="${trim}" stroke-width="5"/>${extra}
    <rect x="88" y="132" width="24" height="30" fill="${skin}"/><ellipse cx="100" cy="108" rx="40" ry="46" fill="${skin}"/>${eyes}${o.dead ? '' : '<path d="M92 130c5 3 11 3 16 0" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>'}${beard}${hat}<circle cx="100" cy="116" r="4" fill="#00000014"/>`;
}

const face = o => `<svg viewBox="0 0 200 210" class="ts-face" aria-hidden="true">${faceInner(o)}</svg>`;

// ---------- les cartes (démo : 12 cartes, 3 façons de tuer le tsar, 8 fins ratées) ----------
// fx : [Complices, Discrétion, Argent, Faveur] ; flag : ce que ce choix prépare
const C = [
  { id: 'cook', who: { hat: 'toque', beard: 'mustache', extra: 'apron', coat: '#8a8a8a', skin: 1 }, name: 'Ivan, cuisinier impérial', text: 'Le tsar réclame un nouveau thé. J\'ai un… additif. Il est sans goût, sans odeur, et sans lendemain.', L: ['Non, merci', [0, 5, 0, 5]], R: ['Gardons-le', [8, -8, 0, 0], 'poison'] },
  { id: 'guard', who: { hat: 'cap', cap: '#3b5a3a', beard: 'full', extra: 'medals', coat: '#3b4a3b', skin: 0 }, name: 'Dimitri, garde du palais', text: 'On me doit trois mois de solde, et ma loyauté a faim.', L: ['Tant pis', [-12, 5, 0, 0]], R: ['Payer (−15 ₽)', [14, -4, -15, 0], 'guard'] },
  { id: 'priest', who: { hat: 'mitre', beard: 'full', extra: 'cross', coat: '#4a2a5a', skin: 2, hair: '#cfc7b8' }, name: 'Père Anatoli', text: 'Dieu bénit le tsar. Mais Dieu, lui, n\'a rien dit de précis sur ses successeurs.', L: ['Sois discret', [0, 8, 0, 0]], R: ['Bénis-moi', [6, -6, 0, 8]] },
  { id: 'general', who: { hat: 'cap', cap: '#2a3a52', beard: 'pointy', extra: 'sash', coat: '#2a3a52', skin: 0, brow: 'angry' }, name: 'Général Orlov', text: 'Mon train blindé attend vos ordres. Il ne sait pas où il va, mais il y va vite.', L: ['Plus tard', [-5, 0, 0, 0]], R: ['Réservez-le', [10, -10, 0, 0], 'train'] },
  { id: 'tamer', who: { hat: 'ushanka', beard: 'full', extra: 'none', coat: '#5a4636', skin: 3 }, name: 'Piotr, dresseur d\'ours', text: 'L\'ours de cirque adore le tsar. Je dis « adore » ; lui dit « goûte ».', L: ['Surtout pas', [0, 6, 0, 3]], R: ['Entraînez-le', [8, -9, -8, 0], 'bear'] },
  { id: 'tsar', who: { hat: 'crown', beard: 'pointy', extra: 'medals', coat: '#7a1620', skin: 0, hair: '#8a6a3a' }, name: 'Sa Majesté le Tsar', text: 'Courtisan ! Venez dîner ce soir. Je suis d\'excellente humeur, ce qui est rare.', L: ['Prétexter la fièvre', [0, 6, 0, -14]], R: ['J\'accepte avec joie', [0, -3, 0, 14], 'access'] },
  { id: 'spy', who: { hat: 'none', beard: 'mustache', extra: 'none', coat: '#222', skin: 2, hair: '#1a1a1a', brow: 'angry' }, name: 'Boris, de l\'Okhrana', text: 'On parle de vous dans de petites pièces fermées. Je peux faire cesser ça.', L: ['Dénoncer un rival', [-14, 12, 0, 10]], R: ['Payer (−20 ₽)', [0, 18, -20, 0]] },
  { id: 'peasant', who: { hat: 'ushanka', beard: 'full', extra: 'none', coat: '#6b5a3a', skin: 3, hair: '#6a5a4a' }, name: 'Un paysan', text: 'Le peuple a faim, mon seigneur. Le peuple a toujours faim, mais là, il insiste.', L: ['Qu\'il patiente', [-10, 0, 0, 6]], R: ['Ouvrir les greniers', [12, 0, -14, -4]] },
  { id: 'banker', who: { hat: 'none', beard: 'mustache', extra: 'none', coat: '#2a2a3a', skin: 2, hair: '#8a8a8a' }, name: 'Le banquier Rosenbaum', text: 'Je finance les révolutions qui rapportent. Voulez-vous une avance sur la vôtre ?', L: ['Pas de dettes', [0, 4, 0, 0]], R: ['Un petit prêt', [4, -6, 25, 0]] },
  { id: 'student', who: { hat: 'none', beard: 'none', extra: 'none', coat: '#3a4a6a', skin: 0, hair: '#5a3a2a', brow: 'angry' }, name: 'Un étudiant exalté', text: 'Camarade ! J\'ai fabriqué une bombe. Elle est petite, mais très motivée.', L: ['Fuir', [-6, 4, 0, 4]], R: ['L\'enrôler', [14, -14, 0, -4]] },
  { id: 'lady', who: { hat: 'none', beard: 'none', extra: 'none', coat: '#7a2a52', skin: 2, hair: '#2a1a14' }, name: 'Comtesse Vera', text: 'Les murs du palais ont des oreilles. J\'ai les yeux, les oreilles et un éventail.', L: ['Éviter', [0, 5, 0, 0]], R: ['Séduire l\'info', [8, -8, 0, 6]] },
  { id: 'accountant', who: { hat: 'none', beard: 'none', extra: 'none', coat: '#8a7a5a', skin: 1, hair: '#6a6a6a' }, name: 'Le comptable', text: 'Les caisses sont vides. Je précise qu\'elles l\'étaient déjà hier, mais plus sincèrement.', L: ['Fermez les yeux', [0, 0, -6, 5]], R: ['Faire une quête', [-4, 0, 14, -6]] },
];
// les fins : dénouement, titre, texte, scène
const END = {
  samovar: { kind: 'win', t: 'Le thé du soir', txt: 'Le tsar boit son thé jusqu\'au bout, par politesse. La Russie vous confie la couronne le lendemain, un peu trop vite pour que ce soit un hasard.', icon: '☕', who: { hat: 'crown', beard: 'pointy', coat: '#7a1620', dead: true, hair: '#8a6a3a' } },
  train: { kind: 'win', t: 'Le train de 17 h 42', txt: 'Le train impérial arrive à l\'heure, c\'est la première fois en 40 ans. Il arrive aussi sans les voitures du tsar.', icon: '🚂', who: { hat: 'crown', beard: 'pointy', coat: '#7a1620', dead: true, hair: '#8a6a3a' } },
  bear: { kind: 'win', t: 'L\'ours du cirque', txt: 'L\'ours a très bien joué son rôle. Le dresseur sera décoré, l\'ours aussi, et vous, vous êtes couronné. Tout le monde est content, sauf le tsar.', icon: '🐻', who: { hat: 'crown', beard: 'pointy', coat: '#7a1620', dead: true, hair: '#8a6a3a' } },
  c0: { kind: 'lose', t: 'Seul au palais', txt: 'Plus un complice. Le tsar découvre que vous complotez tout seul, ce qu\'il juge presque touchant, avant de vous envoyer en Sibérie.', icon: '🧊', who: { hat: 'ushanka', coat: '#444', beard: 'full', hair: '#666' } },
  c1: { kind: 'lose', t: 'Trop de monde', txt: 'Vous avez tellement de complices que l\'un d\'eux, par inadvertance, parle à un journaliste.', icon: '📰', who: { hat: 'none', coat: '#444', beard: 'mustache', brow: 'angry' } },
  d0: { kind: 'lose', t: 'Démasqué', txt: 'Tout le palais sait. Même le chat impérial vous regarde de travers. On vous invite à une « conversation » avec l\'Okhrana.', icon: '👁️', who: { hat: 'none', coat: '#222', beard: 'mustache', hair: '#1a1a1a', brow: 'angry' } },
  d1: { kind: 'lose', t: 'Trop discret', txt: 'Vous êtes tellement discret que personne ne remarque votre disparition. Ni votre complot.', icon: '🫥', who: { hat: 'none', coat: '#ccc', beard: 'none' } },
  a0: { kind: 'lose', t: 'Ruiné', txt: 'Les caisses sont vides, les complices partent, les huissiers arrivent. Vous finissez comptable. C\'est pire.', icon: '💸', who: { hat: 'none', coat: '#8a7a5a', beard: 'none', hair: '#6a6a6a' } },
  a1: { kind: 'lose', t: 'Trop riche', txt: 'Une fortune pareille ne s\'explique pas. On enquête, et on découvre que vous êtes le seul à ne pas payer d\'impôts.', icon: '💰', who: { hat: 'none', coat: '#2a2a3a', beard: 'mustache', hair: '#8a8a8a' } },
  f0: { kind: 'lose', t: 'Disgracié', txt: 'Le tsar vous écarte de la cour. Vous passez le reste de votre règne imaginaire à vendre des cartes postales.', icon: '📉', who: { hat: 'none', coat: '#6b1d1d', beard: 'none' } },
  f1: { kind: 'lose', t: 'Favori éternel', txt: 'Le tsar vous aime tellement qu\'il vous adopte. Impossible de lui succéder : vous êtes maintenant son fils, et vous devez attendre.', icon: '🤗', who: { hat: 'crown', coat: '#7a1620', beard: 'pointy', hair: '#8a6a3a' } },
};
const GAUGES = [['Complices', '👥'], ['Discrétion', '🕵️'], ['Argent', '🪙'], ['Faveur', '👑']];
const LOSE_KEY = [['c0', 'c1'], ['d0', 'd1'], ['a0', 'a1'], ['f0', 'f1']];


// actions jouées à l'écran pour chaque choix : [gauche, droite] ; « prep:x » = un moyen préparé qui s'épingle au tableau du complot
const ACTS = { cook: ['leave', 'prep:poison'], guard: ['leave', 'pay:guard'], priest: ['leave', 'bless'], general: ['leave', 'prep:train'], tamer: ['leave', 'prep:bear'], tsar: ['turn', 'dine'],
  spy: ['denounce', 'pay'], peasant: ['leave', 'feed'], banker: ['leave', 'gain'], student: ['flee', 'join'], lady: ['leave', 'chat'], accountant: ['leave', 'gain'] };
const ITEM = { poison: '🧪', guard: '🪪', train: '🚂', bear: '🐻', access: '💌' };
const PIN_AT = { poison: [30, 62], guard: [62, 62], train: [30, 98], bear: [62, 98], access: [94, 80] };   // épingles du tableau (coordonnées de la scène 390 × 380)
const SW = 390, SH = 380, FRONT = 372, BACK = 302;
const X = x => x / SW * 100, Y = y => (SH - y) / SH * 100;   // x, y de la scène → % gauche, % bas

// ---------- personnages en pied (marchent, saluent, versent…) ----------
const PANTS = '#2a2430', BOOT = '#14100f';
function body(o) {
  const coat = o.coat || '#6b1d1d', skin = SKIN[o.skin ?? 0];
  return `<svg viewBox="0 0 120 230" class="ts-svg" aria-hidden="true"><g class="bob">
    <g class="leg l"><rect x="41" y="150" width="18" height="62" rx="8" fill="${PANTS}"/><rect x="36" y="204" width="28" height="14" rx="6" fill="${BOOT}"/></g>
    <g class="leg r"><rect x="61" y="150" width="18" height="62" rx="8" fill="${PANTS}"/><rect x="56" y="204" width="28" height="14" rx="6" fill="${BOOT}"/></g>
    <g class="arm l"><rect x="23" y="98" width="15" height="54" rx="7.500" fill="${coat}"/><circle cx="30.500" cy="154" r="7" fill="${skin}"/></g>
    <rect x="35" y="94" width="50" height="66" rx="13" fill="${coat}"/><rect x="35" y="132" width="50" height="7" fill="#00000040"/>
    <g class="arm r"><rect x="82" y="98" width="15" height="54" rx="7.500" fill="${coat}"/><circle cx="89.500" cy="154" r="7" fill="${skin}"/></g>
    <g transform="translate(10 -8) scale(.5)">${faceInner(o)}</g></g></svg>`;
}
const BEAR = `<svg viewBox="0 0 170 120" class="ts-svg" aria-hidden="true"><g class="bob">
  <g class="leg l"><rect x="40" y="70" width="18" height="44" rx="8" fill="#4a2f1c"/></g><g class="leg r"><rect x="104" y="70" width="18" height="44" rx="8" fill="#4a2f1c"/></g>
  <ellipse cx="82" cy="62" rx="62" ry="38" fill="#6b4428"/>
  <g class="leg r"><rect x="62" y="74" width="18" height="40" rx="8" fill="#5a3a22"/></g><g class="leg l"><rect x="122" y="74" width="18" height="40" rx="8" fill="#5a3a22"/></g>
  <circle cx="138" cy="38" r="27" fill="#6b4428"/><circle cx="128" cy="16" r="9" fill="#6b4428"/><circle cx="152" cy="18" r="9" fill="#6b4428"/>
  <ellipse cx="152" cy="46" rx="15" ry="11" fill="#d9b48a"/><circle cx="160" cy="42" r="4" fill="#222"/><circle cx="136" cy="34" r="3.500" fill="#fff"/><circle cx="137" cy="34" r="1.800" fill="#222"/>
  <path d="M146 53q8 6 16 0" stroke="#fff" stroke-width="2.500" fill="none"/></g></svg>`;
const SILH = `<svg viewBox="0 0 60 100" class="ts-svg"><path d="M30 6c10 0 16 8 16 18 0 7-4 12-8 15 10 6 18 20 18 40v21H4V79c0-20 8-34 18-40-4-3-8-8-8-15C14 14 20 6 30 6z" fill="#0b0508" stroke="#f4d56b33" stroke-width="2"/><circle cx="24" cy="24" r="2.200" fill="#f4d56b"/><circle cx="36" cy="24" r="2.200" fill="#f4d56b"/></svg>`;
const SAMOVAR = `<svg viewBox="0 0 70 90" class="ts-svg"><rect x="28" y="2" width="14" height="14" fill="#8a6a2a"/><path d="M12 30c0-10 10-14 23-14s23 4 23 14v38c0 8-10 14-23 14S12 76 12 68z" fill="#d9a82a" stroke="#8a6a2a" stroke-width="3"/><rect x="2" y="42" width="12" height="6" rx="3" fill="#8a6a2a"/><rect x="56" y="36" width="12" height="6" rx="3" fill="#8a6a2a"/><circle cx="35" cy="50" r="7" fill="#f4d56b"/><rect x="22" y="82" width="26" height="6" fill="#6a4a1a"/></svg>`;
const TRAIN = `<svg viewBox="0 0 150 60" class="ts-svg"><rect x="4" y="22" width="86" height="26" rx="4" fill="#2a3a52"/><rect x="90" y="12" width="40" height="36" rx="4" fill="#c0161d"/><rect x="98" y="2" width="12" height="14" fill="#14100f"/><rect x="96" y="18" width="14" height="12" fill="#f4d56b"/><circle cx="22" cy="50" r="8" fill="#14100f"/><circle cx="52" cy="50" r="8" fill="#14100f"/><circle cx="108" cy="50" r="8" fill="#14100f"/><circle cx="124" cy="50" r="8" fill="#14100f"/><path d="M130 30l14 14v6h-14z" fill="#8a6a2a"/></svg>`;
const CROWN = `<svg viewBox="0 0 60 40" class="ts-svg"><path d="M4 36V10l14 12 12-18 12 18 14-12v26z" fill="#f4d56b" stroke="#b8902a" stroke-width="2.500"/><circle cx="30" cy="12" r="3" fill="#c0161d"/></svg>`;
const GOLD = '#f4d56b';
const HINTS = ['← glisse ou touche un choix →', 'Choisis vite, le tsar a de l\'appétit et les gardes de la gâchette.', 'Une mauvaise décision, un petit voyage en Sibérie. Bonne chance, couillon.', 'Tu peux aussi attendre la mort naturelle du tsar, mais elle est lente.', 'Réfléchis bien : ici, une connerie se paie cash.', 'Le complot, c\'est comme la vodka : trop tôt ou trop tard, ça finit mal.', 'Glisse, camarade. Ce n\'est pas plus compliqué que de te faire dénoncer.', 'Les murs ont des oreilles. Les oreilles ont des yeux. Les yeux ont des fusils.'];

export function startTsar(host, opts = {}) {
  let found = []; try { found = JSON.parse(localStorage.getItem(ENDS_KEY) || '[]'); } catch {}
  let S, card = null, stopped = false, busy = true, vis = null, prevCo = 0, prevEy = 0, prevMood = '';
  const pins = new Set();
  const fresh = () => ({ g: [50, 55, 50, 55], day: 1, flags: {}, seen: [], last: null });
  const save = () => { try { localStorage.setItem(ENDS_KEY, JSON.stringify(found)); } catch {} };
  const W = ms => new Promise(r => setTimeout(r, stopped ? 0 : ms));
  host.innerHTML = `<div class="ts-root"><div class="ts-top"><button class="ts-x" id="ts-x" aria-label="Quitter">✕</button><div class="ts-gauges" id="ts-gauges"></div><div class="ts-day" id="ts-day"></div></div>
    <div class="ts-scene" id="ts-scene">
      <svg class="ts-bg" viewBox="0 0 390 380" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="tsw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0c14"/><stop offset="1" stop-color="#5a1a22"/></linearGradient><linearGradient id="tsf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2418"/><stop offset="1" stop-color="#1c110c"/></linearGradient></defs>
        <rect width="390" height="262" fill="url(#tsw)"/><g stroke="#00000030" stroke-width="2">${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 44} 0v262"/>`).join('')}</g>
        <rect y="256" width="390" height="10" fill="#7a5a2a"/><rect y="262" width="390" height="118" fill="url(#tsf)"/><g stroke="#00000040" stroke-width="2">${Array.from({ length: 7 }, (_, i) => `<path d="M0 ${278 + i * 17}h390"/>`).join('')}</g>
        <rect x="118" y="26" width="8" height="236" fill="#2a0a10"/><rect x="238" y="26" width="8" height="236" fill="#2a0a10"/><path d="M0 0h390v24l-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8z" fill="#c0161d"/>
        <path d="M290 262v-90q0-30 30-30h50q20 0 20 30v90z" fill="#2a0a10" stroke="${GOLD}" stroke-width="3"/><rect x="300" y="196" width="80" height="14" rx="4" fill="#7a1620"/></svg>
      <div class="ts-win" id="ts-win"><svg viewBox="0 0 100 130" preserveAspectRatio="none"><rect width="100" height="130" fill="#0d1a38"/><circle cx="78" cy="26" r="11" fill="#f6efd8"/><path d="M0 110q20-24 36-6t30-8 34 10v24H0z" fill="#e8eef8"/><path d="M14 110v-22q8-14 16 0v22zM50 110v-30q9-16 18 0v30z" fill="#1a1230"/></svg><div class="ts-trainwrap" id="ts-trainwrap">${TRAIN}</div></div>
      <div class="ts-board" id="ts-board"><b>COMPLOT</b></div>
      <div class="ts-portrait" id="ts-portrait"></div>
      <div class="ts-chest" id="ts-chest"></div>
      <div id="ts-plotters"></div><div id="ts-eyes"></div>
      <div class="ts-table" id="ts-table"><div class="ts-top2"></div><span class="ts-sam">${SAMOVAR}</span><span class="ts-cup">🍵</span></div>
      <div id="ts-actors"></div><div id="ts-fx"></div></div>
    <div class="ts-panel" id="ts-panel"></div></div>`;
  const $ = id => host.querySelector('#' + id), scene = $('ts-scene'), actors = $('ts-actors'), fxl = $('ts-fx');
  $('ts-x').onclick = () => { stopped = true; opts.onExit?.(); };

  // ----- personnages -----
  const mk = (o, x, { lane = FRONT, w = 90, flip = 1, cls = '' } = {}) => {
    const e = document.createElement('div'); e.className = 'ts-actor ' + cls; e.style.cssText = `left:${X(x)}%;bottom:${Y(lane)}%;width:${w / SW * 100}%;--f:${flip}`;
    e.innerHTML = o === 'bear' ? BEAR : body(o); actors.append(e); return e;
  };
  const move = async (e, x, ms, flip) => { if (flip) e.style.setProperty('--f', flip); e.classList.add('walk'); e.style.transition = `left ${ms}ms linear`; e.style.left = X(x) + '%'; await W(ms); e.classList.remove('walk'); };
  const centre = e => { const r = e.getBoundingClientRect(), s = scene.getBoundingClientRect(); return { x: r.left + r.width / 2 - s.left, y: r.top + r.height * 0.45 - s.top }; };
  const pt = e => e && e.getBoundingClientRect ? centre(e) : e;
  const fly = (txt, from, to, ms = 800, size = 24) => {
    const a = pt(from), b = pt(to), s = document.createElement('span'); s.className = 'ts-fly'; s.textContent = txt; s.style.cssText = `left:${a.x}px;top:${a.y}px;font-size:${size}px`; fxl.append(s);
    const an = s.animate([{ transform: 'translate(-50%,-50%) scale(.6)' }, { transform: `translate(calc(-50% + ${(b.x - a.x) / 2}px),calc(-50% + ${(b.y - a.y) / 2 - 50}px)) scale(1.2)`, offset: .5 }, { transform: `translate(calc(-50% + ${b.x - a.x}px),calc(-50% + ${b.y - a.y}px)) scale(.9)` }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
    return an.finished.catch(() => {}).then(() => s.remove());
  };
  const burst = async (txt, at, n = 6) => { const p = pt(at); await Promise.all(Array.from({ length: n }, (_, i) => { const s = document.createElement('span'); s.className = 'ts-fly'; s.textContent = txt; s.style.cssText = `left:${p.x}px;top:${p.y}px;font-size:${18 + (i % 3) * 5}px`; fxl.append(s); const ang = i / n * Math.PI * 2; return s.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * 46}px),calc(-50% + ${Math.sin(ang) * 40 - 24}px)) scale(1.1)`, opacity: 0 }], { duration: 800, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {}).then(() => s.remove()); })); };
  const bubble = (e, txt, ms = 1100) => { if (!e) return; const b = document.createElement('div'); b.className = 'ts-bub'; b.textContent = txt; e.append(b); setTimeout(() => b.remove(), ms); };
  const shake = () => { scene.classList.remove('shake'); void scene.offsetWidth; scene.classList.add('shake'); };
  const flash = async () => { const f = document.createElement('div'); f.className = 'ts-flash'; scene.append(f); await W(420); f.remove(); };
  const act = (e, cls, ms) => { e.classList.add(cls); return W(ms).then(() => e.classList.remove(cls)); };

  // ----- décor vivant : il reflète les jauges et les moyens préparés -----
  const player = mk({ hat: 'none', hair: '#5a3a2a', coat: '#3a4a6a', beard: 'none', skin: 0, extra: 'sash' }, 250, { flip: -1, cls: 'player' });
  const tsarO = mood => ({ hat: 'crown', beard: 'pointy', extra: 'medals', coat: '#7a1620', skin: 0, hair: '#8a6a3a', brow: mood === 'angry' ? 'angry' : '' });
  const tsarEl = mk(tsarO(''), 342, { lane: 232, w: 74, flip: -1, cls: 'tsar sit' });
  player.insertAdjacentHTML('beforeend', `<div class="ts-crown">${CROWN}</div>`); tsarEl.insertAdjacentHTML('beforeend', `<div class="ts-crown on">${CROWN}</div>`);
  const decor = () => {
    const [co, di, ar, fa] = S.g;
    // coffre : de plus en plus de pièces
    const n = Math.round(ar / 12.5), open = n >= 4;
    $('ts-chest').innerHTML = `<svg viewBox="0 0 90 70"><g class="lid ${open ? 'open' : ''}"><path d="M8 28q0-18 37-18t37 18z" fill="#7a4a22" stroke="#3a2210" stroke-width="3"/></g><rect x="8" y="28" width="74" height="38" rx="4" fill="#8a5a2a" stroke="#3a2210" stroke-width="3"/><rect x="40" y="34" width="10" height="12" fill="${GOLD}"/>
      ${Array.from({ length: n }, (_, i) => `<ellipse cx="${20 + (i % 4) * 16}" cy="${30 - Math.floor(i / 4) * 7 - (i % 2) * 2}" rx="9" ry="4.500" fill="${GOLD}" stroke="#b8902a" stroke-width="1.500"/>`).join('')}${n <= 1 ? '<path d="M14 36l12 10M64 36L52 48" stroke="#ffffff55" stroke-width="1.500"/>' : ''}</svg>`;
    // complices : silhouettes encapuchonnées au fond
    const k = Math.round(co / 17), spots = [[70, 0], [96, 4], [122, 0], [150, 4], [176, 0], [202, 4]];
    $('ts-plotters').innerHTML = spots.map(([x, dy], i) => `<div class="ts-sil ${i < k ? 'on' : ''} ${i < k && i >= prevCo ? 'pop' : ''}" style="left:${X(x)}%;bottom:${Y(BACK - dy)}%;width:${34 / SW * 100}%">${SILH}</div>`).join(''); prevCo = k;
    // yeux dans les murs : plus on est repéré, plus il y en a
    const e = Math.round((100 - di) / 25), eyes = [[40, 176], [150, 214], [262, 220], [372, 150]];
    $('ts-eyes').innerHTML = eyes.map(([x, y], i) => `<div class="ts-eye ${i < e ? 'on' : ''} ${i < e && i >= prevEy ? 'pop' : ''}" style="left:${X(x)}%;bottom:${Y(y)}%">👀</div>`).join(''); prevEy = e;
    // tableau du complot : un objet épinglé par moyen préparé
    $('ts-board').innerHTML = '<b>COMPLOT</b>' + Object.entries(PIN_AT).map(([f, [x, y]]) => `<span class="ts-pin ${S.flags[f] ? 'on' : ''} ${S.flags[f] && !pins.has(f) ? 'pop' : ''}" style="left:${(x - 14) / 96 * 100}%;top:${(y - 44) / 80 * 100}%">${ITEM[f]}</span>`).join(''); Object.keys(S.flags).forEach(f => pins.add(f));
    // portrait et humeur du tsar : la faveur
    const mood = fa < 32 ? 'angry' : fa > 68 ? 'happy' : 'neutral';
    $('ts-portrait').innerHTML = `<svg viewBox="0 0 70 84"><rect x="3" y="3" width="64" height="78" rx="5" fill="#1a0d10" stroke="${GOLD}" stroke-width="4"/><g transform="translate(5 8) scale(.3)">${faceInner(tsarO(mood))}</g>${fa < 22 ? '<path d="M8 8l20 30-8 14 22 28" stroke="#fff" stroke-width="1.800" fill="none"/>' : ''}</svg>`;
    $('ts-portrait').classList.toggle('glow', fa > 68);
    if (mood !== prevMood && !S.dead) { tsarEl.querySelector('g[transform]').innerHTML = faceInner(tsarO(mood)); prevMood = mood; }
    $('ts-gauges').replaceChildren(...gaugeEls());
  };
  const gaugeEls = (preview) => GAUGES.map(([n, ic], i) => { const d = document.createElement('div'), v = S.g[i], pv = preview ? preview[i] : 0; d.className = 'ts-g' + (v <= 15 || v >= 85 ? ' warn' : ''); d.innerHTML = `<div class="ts-gfill"><i style="height:${v}%"></i></div><span>${ic}</span><b class="ts-dot" style="--s:${Math.min(14, 5 + Math.abs(pv) * .35)}px;opacity:${pv ? 1 : 0}"></b>`; return d; });
  const preview = fx => $('ts-gauges').replaceChildren(...gaugeEls(fx));

  // ----- tirage des cartes -----
  const pickCard = () => {
    const f = S.flags, ready = [];
    if (f.poison && f.access) ready.push('samovar'); if (f.train && f.guard) ready.push('train'); if (f.bear && f.access) ready.push('bear');
    if (ready.length && S.day > 4 && Math.random() < 0.75) return { final: ready[Math.floor(Math.random() * ready.length)] };
    let pool = C.filter(c => !S.seen.includes(c.id));
    if (!pool.length) { S.seen = []; pool = C.filter(c => c.id !== S.last); }
    return pool[Math.floor(Math.random() * pool.length)];
  };
  const finalCard = k => ({ id: 'final_' + k, who: { samovar: { hat: 'toque', beard: 'mustache', extra: 'apron', coat: '#8a8a8a', skin: 1 }, train: { hat: 'cap', cap: '#2a3a52', beard: 'pointy', extra: 'sash', coat: '#2a3a52', brow: 'angry' }, bear: { hat: 'ushanka', beard: 'full', coat: '#5a4636', skin: 3 } }[k],
    name: { samovar: 'Ivan, cuisinier impérial', train: 'Général Orlov', bear: 'Piotr, dresseur d\'ours' }[k],
    text: { samovar: 'Le samovar du tsar est prêt. Il ne manque que votre signe de tête.', train: 'Le train impérial passe sur le pont ce soir. Les rails, eux, sont un peu fatigués.', bear: 'Le tsar visite le cirque ce soir. L\'ours a jeûné exprès.' }[k],
    L: ['Renoncer', [0, 8, 0, 4]], R: ['Donner le signal', [0, 0, 0, 0]], final: k });

  // ----- panneau de dialogue et de choix -----
  const pips = fx => fx.map((v, i) => v ? `<i style="--s:${Math.min(11, 5 + Math.abs(v) * .3)}px" title="${GAUGES[i][0]}"></i>` : '').join('');
  function panel(c) {
    $('ts-panel').className = 'ts-panel';
    $('ts-panel').innerHTML = `<div class="ts-name">${esc(c.name)}</div><p class="ts-say">${esc(c.text)}</p>
      <div class="ts-choices"><button id="ts-l" data-i="0"><span>${esc(c.L[0])}</span><em>${pips(c.L[1])}</em></button><button id="ts-r" data-i="1"><span>${esc(c.R[0])}</span><em>${pips(c.R[1])}</em></button></div>
      <div class="ts-hint">${HINTS[Math.floor(Math.random() * HINTS.length)]}</div>`;
    const p = $('ts-panel'); let x0 = 0, dx = 0, drag = false;
    p.onpointerdown = e => { if (busy) return; if (e.target.closest('button')) { const i = +e.target.closest('button').dataset.i; preview((i ? c.R : c.L)[1]); } drag = true; x0 = e.clientX; dx = 0; };
    p.onpointermove = e => { if (!drag || busy) return; dx = e.clientX - x0; if (Math.abs(dx) > 8) { p.style.transform = `translateX(${dx * .4}px) rotate(${dx / 60}deg)`; preview((dx < 0 ? c.L : c.R)[1]); p.classList.toggle('left', dx < 0); p.classList.toggle('right', dx > 0); } };
    const up = e => { if (!drag) return; drag = false; p.style.transform = ''; p.classList.remove('left', 'right'); preview(null); if (busy) return; if (Math.abs(dx) > 70) return choose(dx < 0 ? 0 : 1); if (Math.abs(dx) < 8) { const b = e.target.closest?.('button'); if (b) choose(+b.dataset.i); } };
    p.onpointerup = up; p.onpointercancel = () => { drag = false; p.style.transform = ''; preview(null); };
  }

  // ----- les actions jouées à l'écran -----
  const chestEl = () => $('ts-chest');
  const EXIT = async (v, flip = 1) => { if (!v) return; await move(v, -70, 1300, flip); v.remove(); };
  const ACT = {
    async leave(v, c, ap, i) { ap(); bubble(v, i ? '🙂' : '😒'); await W(500); await EXIT(v, 1); },
    async turn(v, c, ap) { player.style.setProperty('--f', 1); bubble(player, '🙄'); ap(); await W(700); player.style.setProperty('--f', -1); },
    async flee(v, c, ap) { ap(); bubble(v, '😱'); await EXIT(v, 1); },
    async pay(v, c, ap) { await Promise.all(Array.from({ length: 5 }, (_, i) => W(i * 120).then(() => fly('🪙', chestEl(), v, 700)))); ap(); await act(v, 'hop', 500); await EXIT(v, 1); },
    async gain(v, c, ap) { await Promise.all(Array.from({ length: 5 }, (_, i) => W(i * 120).then(() => fly('🪙', v, chestEl(), 800)))); ap(); await act(v, 'hop', 500); await EXIT(v, 1); },
    async bless(v, c, ap) { act(v, 'raise', 1100); await W(400); await burst('✨', player, 8); ap(); await W(500); await EXIT(v, 1); },
    async join(v, c, ap) { v.style.transition = 'left 1s linear, bottom 1s linear, width 1s linear, opacity .8s'; v.classList.add('walk'); v.style.left = X(120) + '%'; v.style.bottom = Y(BACK) + '%'; v.style.width = 34 / SW * 100 + '%'; v.style.setProperty('--f', 1); await W(1000); v.style.opacity = 0; ap(); await W(700); v.remove(); },
    async denounce(v, c, ap) { act(v, 'raise', 900); const r = mk({ hat: 'none', beard: 'full', coat: '#555', hair: '#444' }, 130, { lane: BACK, w: 44, flip: 1 }); bubble(r, '❗', 900); await W(300); await move(r, -60, 1000, 1); r.remove(); ap(); await W(300); await EXIT(v, 1); },
    async feed(v, c, ap) { await burst('🌾', v, 7); ap(); await act(v, 'hop', 500); await EXIT(v, 1); },
    async chat(v, c, ap) { bubble(v, '💬', 1200); bubble(player, '🤫', 1200); await burst('💋', { x: (centre(v).x + centre(player).x) / 2, y: centre(v).y - 20 }, 4); ap(); await W(500); await EXIT(v, 1); },
    async dine(v, c, ap) { const t = $('ts-table'); t.classList.add('on'); await move(player, 262, 900, -1); bubble(player, '🍷', 1200); await burst('🍷', t, 5); await fly('💌', tsarEl, $('ts-board'), 900); ap(); await W(300); await move(player, 250, 700, -1); t.classList.remove('on'); },
    async prep(v, c, ap, i, flag) { act(v, 'raise', 900); await fly(ITEM[flag], v, $('ts-board'), 1000); ap(); bubble(v, '🤫', 800); await W(500); await EXIT(v, 1); },
  };
  async function choose(i) {
    if (busy) return; busy = true;
    const c = card, side = i ? c.R : c.L, ac = (ACTS[c.id] || ['leave', 'leave'])[i];
    $('ts-panel').classList.add('hide'); preview(null);
    const ap = () => { S.g = S.g.map((v, k) => clamp(v + side[1][k])); if (side[2]) S.flags[side[2]] = true; decor(); };
    if (c.final) { if (!i) { ap(); await EXIT(vis, 1); return next(); } vis?.remove(); return playEnd(c.final); }
    const [kind, arg] = ac.split(':'); S.seen.push(c.id); S.last = c.id; S.day++;
    await (ACT[kind] || ACT.leave)(vis, c, ap, i, arg);
    if (stopped) return;
    for (let k = 0; k < 4; k++) { if (S.g[k] <= 0) return playEnd(LOSE_KEY[k][0]); if (S.g[k] >= 100) return playEnd(LOSE_KEY[k][1]); }
    next();
  }

  // ----- fins : la scène se joue, puis le bilan -----
  async function playEnd(key) {
    const e = END[key]; S.dead = true; $('ts-panel').classList.add('hide'); vis?.remove(); vis = null;
    const standUp = () => { tsarEl.classList.remove('sit'); tsarEl.style.transition = 'bottom .3s'; tsarEl.style.bottom = Y(FRONT) + '%'; };
    const crown = async (from = tsarEl) => { await fly('👑', from, player, 1000, 34); player.querySelector('.ts-crown').classList.add('on'); tsarEl.querySelector('.ts-crown').classList.remove('on'); await burst('✨', player, 10); };
    const dead = () => { tsarEl.querySelector('g[transform]').innerHTML = faceInner({ ...tsarO(''), dead: true }); tsarEl.classList.add('slump'); };
    if (key === 'samovar') {
      const cook = mk({ hat: 'toque', beard: 'mustache', extra: 'apron', coat: '#8a8a8a', skin: 1 }, -50, { w: 84 }); $('ts-table').classList.add('on'); move(player, 70, 1000, 1);
      await move(cook, 262, 1900, 1); act(cook, 'raise', 900); await W(300); await burst('☠️', $('ts-table'), 5); $('ts-table').classList.add('green'); await W(900);
      bubble(tsarEl, '🍵', 1400); await W(1500); dead(); shake(); await flash(); await crown();
    } else if (key === 'train') {
      const tw = $('ts-trainwrap'); bubble(tsarEl, '🚂', 1200); tsarEl.style.transition = 'opacity .8s'; tsarEl.style.opacity = 0; await W(900); tw.classList.add('run'); await W(1500); tw.classList.add('fall'); await W(700); shake(); await burst('💥', $('ts-win'), 8); await flash(); await W(300); await crown($('ts-win'));
    } else if (key === 'bear') {
      const bear = mk('bear', -80, { w: 112, lane: FRONT }); await move(bear, 292, 2200, 1); bubble(tsarEl, '😨', 900); standUp(); await W(500);
      shake(); await burst('🐾', bear, 6); dead(); await W(300); await crown(); bear.remove();
    } else if (['c0', 'c1', 'd0', 'a1'].includes(key)) {
      const g1 = mk({ hat: 'cap', cap: '#2a3a52', coat: '#2a3a52', beard: 'mustache', brow: 'angry' }, -60, { w: 84 }), g2 = mk({ hat: 'cap', cap: '#2a3a52', coat: '#2a3a52', beard: 'full', brow: 'angry' }, -150, { w: 84 });
      move(g2, 180, 1800, 1); await move(g1, 205, 1700, 1); bubble(player, '😰', 1200); act(player, 'raise', 1200); bubble(g1, '❗', 1000); await W(1300); await Promise.all([move(g1, -80, 1700, -1), move(g2, -80, 1700, -1), move(player, -20, 1700, -1)]); g1.remove(); g2.remove();
    } else if (key === 'f0' || key === 'a0') { bubble(tsarEl, '👉', 1100); await W(900); await Promise.all([move(player, 470, 2100, 1), burst('❄️', player, 5)]); }
    else if (key === 'd1') { bubble(player, '🫥', 1200); player.style.transition = 'opacity 1.8s'; player.style.opacity = .12; await W(1900); }
    else if (key === 'f1') { standUp(); await W(350); await move(tsarEl, 286, 1100, -1); await burst('❤️', { x: centre(player).x, y: centre(player).y - 30 }, 6); await W(600); }
    if (stopped) return;
    const isNew = !found.includes(key); if (isNew) { found.push(key); save(); } opts.onEnd?.(key, isNew);
    const p = $('ts-panel'); p.className = 'ts-panel end ' + e.kind; p.style.transform = '';
    p.innerHTML = `<div class="ts-stamp ${e.kind}">${e.kind === 'win' ? 'ВЫ ЦАРЬ' : 'КОНЕЦ'}</div><h2>${esc(e.t)}</h2><p class="ts-say">${esc(e.txt)}</p>
      <div class="ts-count">Fin n° ${Object.keys(END).indexOf(key) + 1} · ${found.length} / ${TOTAL_ENDS} fins découvertes ${isNew ? '<b>nouveau !</b>' : ''}</div>
      <div class="ts-endbtns"><button id="ts-again">Rejouer</button><button class="plain" id="ts-quit">Quitter</button></div>`;
    $('ts-again').onclick = () => begin(); $('ts-quit').onclick = () => { stopped = true; opts.onExit?.(); };
    $('ts-day').textContent = '';
  }

  // ----- un tour : le visiteur arrive, parle, attend ton choix -----
  async function next() {
    if (stopped) return; busy = true;
    const n = pickCard(), c = n.final ? finalCard(n.final) : n; card = c; $('ts-day').textContent = `Jour ${S.day}`;
    if (c.id === 'tsar') { vis = null; bubble(tsarEl, '🗣️', 1200); }
    else { const v = vis = mk(c.who, -60, { w: 86, flip: 1 }); await move(v, 150, 1500, 1); if (stopped || S.dead || vis !== v) { v.remove(); return; } bubble(v, '💬', 1100); }
    if (S.dead) return; panel(c); busy = false;
  }
  function begin() {
    S = fresh(); pins.clear(); prevCo = prevEy = 0; prevMood = ''; actors.querySelectorAll('.actor-tmp').forEach(e => e.remove());
    [...actors.children].forEach(e => { if (e !== player && e !== tsarEl) e.remove(); });
    player.style.cssText = `left:${X(250)}%;bottom:${Y(FRONT)}%;width:${90 / SW * 100}%;--f:-1`; player.querySelector('.ts-crown').classList.remove('on');
    tsarEl.style.cssText = `left:${X(342)}%;bottom:${Y(232)}%;width:${74 / SW * 100}%;--f:-1`; tsarEl.classList.add('sit'); tsarEl.classList.remove('slump'); tsarEl.querySelector('.ts-crown').classList.add('on'); $('ts-table').classList.remove('on', 'green');
    const tw = $('ts-trainwrap'); tw.classList.remove('run', 'fall');
    decor(); next();
  }
  begin();
  return { stop() { stopped = true; }, state: () => S, found: () => found, finals: () => Object.keys(END), forceEnd: k => playEnd(k) };
}
