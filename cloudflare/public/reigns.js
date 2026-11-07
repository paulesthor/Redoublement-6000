// « Le Dernier Tsar » : démo d'un jeu de cartes à glisser (style Reigns). Tu joues un courtisan qui veut prendre la place du tsar.
// Tout est local : texte, SVG et animations CSS. Aperçu réservé à l'administrateur.
const ENDS_KEY = 'wm_tsar_ends';
const TOTAL_ENDS = 21;
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
    tophat: `<rect x="62" y="30" width="76" height="58" fill="#111"/><rect x="46" y="84" width="108" height="10" rx="4" fill="#111"/><rect x="62" y="72" width="76" height="9" fill="#f4d56b"/>`,
    mitre: `<path d="M70 90c0-30 14-52 30-60 16 8 30 30 30 60z" fill="#e8dfc7" stroke="${trim}" stroke-width="4"/><path d="M100 40v44M84 62h32" stroke="${trim}" stroke-width="5"/>` }[o.hat || 'none'];
  const eyes = o.dead ? `<path d="M80 102l12 12m0-12L80 114M108 102l12 12m0-12l-12 12" stroke="#2a1a14" stroke-width="4" stroke-linecap="round"/>`
    : `<circle cx="86" cy="108" r="4.500" fill="#2a1a14"/><circle cx="114" cy="108" r="4.500" fill="#2a1a14"/>${o.brow === 'angry' ? '<path d="M76 98l20 6M124 98l-20 6" stroke="#2a1a14" stroke-width="4" stroke-linecap="round"/>' : '<path d="M78 98h16M106 98h16" stroke="#2a1a14" stroke-width="3" stroke-linecap="round"/>'}`;
  const extra = { none: '', medals: `<circle cx="78" cy="196" r="6" fill="${trim}"/><circle cx="96" cy="200" r="6" fill="#c0161d"/><circle cx="114" cy="196" r="6" fill="${trim}"/>`, sash: `<path d="M64 168l72 40" stroke="#c0161d" stroke-width="12"/>`, apron: `<path d="M74 168h52v40H74z" fill="#f7f2e4"/>`, cross: `<path d="M100 172v22M90 180h20" stroke="${trim}" stroke-width="5"/>`, tie: `<path d="M100 166l-9 14 9 28 9-28z" fill="#c0161d"/><path d="M84 160l16 14 16-14" fill="#fff"/>`, bear: '' }[o.extra || 'none'];
  return `<path d="M30 210c4-34 34-50 70-50s66 16 70 50z" fill="${coat}"/><path d="M84 160l16 16 16-16" fill="none" stroke="${trim}" stroke-width="5"/>${extra}
    <rect x="88" y="132" width="24" height="30" fill="${skin}"/><ellipse cx="100" cy="108" rx="40" ry="46" fill="${skin}"/>${eyes}${o.dead ? '' : '<path d="M92 130c5 3 11 3 16 0" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>'}${beard}${hat}<circle cx="100" cy="116" r="4" fill="#00000014"/>`;
}

const face = o => `<svg viewBox="0 0 200 210" class="ts-face" aria-hidden="true">${faceInner(o)}</svg>`;

const PANTS = '#2a2430', BOOT = '#14100f', NAVY = '#16358a';
function body(o) {
  const coat = o.adidas ? NAVY : (o.coat || '#6b1d1d'), skin = SKIN[o.skin ?? 0], pants = o.adidas ? NAVY : PANTS;
  const st = o.adidas ? (x, y, h) => `<rect x="${x}" y="${y}" width="2.600" height="${h}" fill="#fff"/><rect x="${x + 4.500}" y="${y}" width="2.600" height="${h}" fill="#fff"/>` : () => '';
  return `<svg viewBox="0 0 120 230" class="ts-svg" aria-hidden="true"><g class="bob">
    <g class="leg l"><rect x="41" y="150" width="18" height="62" rx="8" fill="${pants}"/>${st(47, 152, 56)}<rect x="36" y="204" width="28" height="14" rx="6" fill="${BOOT}"/></g>
    <g class="leg r"><rect x="61" y="150" width="18" height="62" rx="8" fill="${pants}"/>${st(67, 152, 56)}<rect x="56" y="204" width="28" height="14" rx="6" fill="${BOOT}"/></g>
    <g class="arm l"><rect x="23" y="98" width="15" height="54" rx="7.500" fill="${coat}"/>${st(27, 100, 48)}<circle cx="30.500" cy="154" r="7" fill="${skin}"/></g>
    <rect x="35" y="94" width="50" height="66" rx="13" fill="${coat}"/>${o.adidas ? '<path d="M60 96v62" stroke="#ffffff55" stroke-width="2"/><path d="M42 118l14-8M42 126l14-8M42 134l14-8" stroke="#fff" stroke-width="3" opacity=".9"/>' : ''}<rect x="35" y="132" width="50" height="7" fill="#00000040"/>
    <g class="arm r"><rect x="82" y="98" width="15" height="54" rx="7.500" fill="${coat}"/>${st(86, 100, 48)}<circle cx="89.500" cy="154" r="7" fill="${skin}"/></g>
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

const END = {
  samovar: { kind: 'win', t: 'Le thé du soir', txt: 'Le tsar boit son thé jusqu\'au bout, par politesse. La Russie vous confie la couronne le lendemain, un peu trop vite pour que ce soit un hasard.' },
  train: { kind: 'win', t: 'Le train de 17 h 42', txt: 'Le train impérial arrive à l\'heure, c\'est la première fois en 40 ans. Il arrive aussi sans les voitures du tsar.' },
  bear: { kind: 'win', t: 'L\'ours du cirque', txt: 'L\'ours a très bien joué son rôle. Le dresseur sera décoré, l\'ours aussi, et vous, vous êtes couronné. Tout le monde est content, sauf le tsar.' },
  x_samovar: { kind: 'lose', t: 'Le goûteur', txt: 'Le goûteur du tsar boit en premier. Il s\'effondre, ravi d\'avoir servi. Le tsar sourit, vous aussi, mais plus pour longtemps.' },
  x_train: { kind: 'lose', t: 'Une vache sur les rails', txt: 'Le train freine à trois mètres du tsar. Il vous remercie pour cette belle surprise… pour la vache.' },
  x_bear: { kind: 'lose', t: 'L\'ours a un nouvel ami', txt: 'L\'ours adore le tsar. Il devient ministre de la Défense, et vous, son serveur de vodka. Bon courage.' },
  late: { kind: 'lose', t: 'Mort naturelle', txt: 'Le tsar meurt de vieillesse pendant votre réunion de planification. Quelqu\'un d\'autre prend le trône. Ce con.' },
  capi: { kind: 'fun', stamp: 'USA ! USA !', t: 'Le Tsar Burger', txt: 'Le tsar découvre le capitalisme, ouvre 4 000 franchises de burgers et loue le Kremlin sur Airbnb. Le palais devient un fast-food, la vodka un soda, et vous, le manager de nuit. Salaire : une frite par jour. God bless Russia.' },
  rave: { kind: 'fun', stamp: 'ХАРДБАС', t: 'Hardbass au palais', txt: 'Tout le monde est content. Le tsar, les gardes, l\'ours et même le prêtre dansent en survêt Adidas sur de la techno russe. Personne n\'est mort, personne n\'est tsar. La Russie est sauvée par un caisson de basse.' },
  vodka: { kind: 'fun', stamp: 'ЗА ЗДОРОВЬЕ', t: 'Concours de vodka', txt: 'Le tsar vous défie à la vodka. À la huitième tournée, vous dansez sur la table ; à la douzième, plus personne ne sait qui est tsar. Le cuisinier s\'assoit sur le trône pendant que vous ronflez tous les deux.' },
  babouchka: { kind: 'win', t: 'Le tricot fatal', txt: 'Une babouchka tricote une écharpe de douze mètres pour le tsar. Elle la lui enroule autour du cou avec beaucoup d\'amour et très peu de rigueur. Vous héritez de la couronne, et de l\'écharpe.' },
  cat: { kind: 'fun', stamp: 'МЯУ', t: 'Le chat du palais', txt: 'Le chat fixe la couronne depuis trois ans. Vous la lui donnez. Il s\'assoit sur le trône, daigne vous regarder et vous nomme valet de pied. Personne ne remarque la différence avec le tsar précédent.' },
  strike: { kind: 'win', t: 'Grève générale', txt: 'Le cuisinier, le général, le prêtre et même l\'ours entrent dans la salle avec des pancartes. Le tsar signe l\'abdication pour qu\'on le laisse déjeuner. Vous vous proclamez successeur, à l\'unanimité de ceux qui n\'ont pas osé dire non.' },
  c0: { kind: 'lose', t: 'Seul au palais', txt: 'Plus un complice. Le tsar découvre que vous complotez tout seul, ce qu\'il juge presque touchant, avant de vous envoyer en Sibérie.' },
  c1: { kind: 'lose', t: 'Trop de monde', txt: 'Vous avez tellement de complices que l\'un d\'eux, par inadvertance, parle à un journaliste.' },
  d0: { kind: 'lose', t: 'Démasqué', txt: 'Tout le palais sait. Même le chat impérial vous regarde de travers. On vous invite à une « conversation » avec l\'Okhrana.' },
  d1: { kind: 'lose', t: 'Trop discret', txt: 'Vous êtes tellement discret que personne ne remarque votre disparition. Ni votre complot.' },
  a0: { kind: 'lose', t: 'Ruiné', txt: 'Les caisses sont vides, les complices partent, les huissiers arrivent. Vous finissez comptable. C\'est pire.' },
  a1: { kind: 'lose', t: 'Trop riche', txt: 'Une fortune pareille ne s\'explique pas. On enquête, et on découvre que vous êtes le seul à ne pas payer d\'impôts.' },
  f0: { kind: 'lose', t: 'Disgracié', txt: 'Le tsar vous écarte de la cour. Vous passez le reste de votre règne imaginaire à vendre des cartes postales.' },
  f1: { kind: 'lose', t: 'Favori éternel', txt: 'Le tsar vous aime tellement qu\'il vous adopte. Impossible de lui succéder : vous êtes maintenant son fils, et vous devez attendre.' },
};

// ---------- constantes de la scène ----------
const SW = 390, SH = 380, FRONT = 372, BACK = 302;
const X = x => x / SW * 100, Y = y => (SH - y) / SH * 100;   // x, y de la scène → % gauche, % bas
const GOLD = '#f4d56b';
const mini = (vb, inner) => `<svg viewBox="${vb}" class="ts-ico" aria-hidden="true">${inner}</svg>`;

// ---------- particules et objets dessinés (aucune émoticône) ----------
const PART = {
  coin: mini('0 0 24 24', '<circle cx="12" cy="12" r="10" fill="#f4d56b" stroke="#b8902a" stroke-width="2"/><circle cx="12" cy="12" r="5.500" fill="none" stroke="#b8902a" stroke-width="1.500"/>'),
  spark: mini('0 0 24 24', '<path d="M12 1l2.600 8.400L23 12l-8.400 2.600L12 23l-2.600-8.400L1 12l8.400-2.600z" fill="#fff6c2"/>'),
  smoke: mini('0 0 24 24', '<circle cx="12" cy="12" r="10" fill="#cfcfcf" opacity=".85"/>'),
  green: mini('0 0 24 24', '<circle cx="12" cy="12" r="10" fill="#5aff6a" opacity=".8"/>'),
  heart: mini('0 0 24 24', '<path d="M12 21s-9-6-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z" fill="#e0314b"/>'),
  note: mini('0 0 24 24', '<path d="M9 18V5l11-2v13" fill="none" stroke="#fff" stroke-width="2.400"/><circle cx="6.500" cy="18" r="3.500" fill="#fff"/><circle cx="17.500" cy="16" r="3.500" fill="#fff"/>'),
  bill: mini('0 0 24 24', '<rect x="1" y="5" width="22" height="14" rx="2" fill="#5fbf6a" stroke="#2f7a3a" stroke-width="1.500"/><circle cx="12" cy="12" r="3.500" fill="none" stroke="#2f7a3a" stroke-width="1.500"/>'),
  paw: mini('0 0 24 24', '<ellipse cx="12" cy="16" rx="6" ry="5" fill="#4a2f1c"/><circle cx="4.500" cy="10" r="2.600" fill="#4a2f1c"/><circle cx="9.500" cy="5.500" r="2.600" fill="#4a2f1c"/><circle cx="14.500" cy="5.500" r="2.600" fill="#4a2f1c"/><circle cx="19.500" cy="10" r="2.600" fill="#4a2f1c"/>'),
  boom: mini('0 0 24 24', '<path d="M12 0l3 7 7-3-3 7 7 2-7 3 4 7-8-3-3 8-3-8-8 3 4-7-7-3 7-2-3-7 7 3z" fill="#ff8a1f"/><path d="M12 5l2 5 5-1-3 4 4 3-5 0-1 5-2-5-5 2 2-5-5-2 5-1-1-5z" fill="#ffe14a"/>'),
  star: mini('0 0 24 24', '<path d="M12 2l3 7h7l-5.500 4.500L18.500 21 12 16.500 5.500 21 7.500 13.500 2 9h7z" fill="#f4d56b"/>'),
  dust: mini('0 0 24 24', '<circle cx="12" cy="12" r="8" fill="#8a7a6a" opacity=".7"/>'),
  snow: mini('0 0 24 24', '<circle cx="12" cy="12" r="6" fill="#fff"/>'),
};
const PROP = {
  vial: '<svg viewBox="0 0 20 38"><rect x="7" y="1" width="6" height="7" rx="1.500" fill="#8a6a2a"/><path d="M7 8h6v4l4 8v14a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V20l4-8z" fill="#d9f0e0" stroke="#7aa088" stroke-width="1.600"/><path d="M4 24h12v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#3fdc5a"/><circle cx="9" cy="29" r="1.500" fill="#b6ffc3"/></svg>',
  timetable: '<svg viewBox="0 0 30 38"><rect x="2" y="1" width="26" height="36" rx="2" fill="#f1e6c8" stroke="#8a7a52" stroke-width="1.600"/><path d="M6 8h18M6 13h18M6 18h18" stroke="#8a7a52" stroke-width="1.400"/><rect x="6" y="23" width="14" height="6" rx="1" fill="#2a3a52"/><rect x="20" y="21" width="5" height="8" fill="#c0161d"/><circle cx="9" cy="31" r="1.800" fill="#222"/><circle cx="17" cy="31" r="1.800" fill="#222"/></svg>',
  invite: '<svg viewBox="0 0 40 30"><rect x="1.500" y="2" width="37" height="26" rx="2" fill="#f6efd8" stroke="#8a7a52" stroke-width="1.600"/><path d="M2 3l18 14L38 3" fill="none" stroke="#8a7a52" stroke-width="1.600"/><circle cx="20" cy="17" r="5" fill="#c0161d" stroke="#8a1a1a" stroke-width="1.400"/></svg>',
  cup: '<svg viewBox="0 0 20 24"><path d="M3 4h14l-2 17H5z" fill="#f6efd8" fill-opacity=".35" stroke="#e8dfc7" stroke-width="1.600"/><rect x="5" y="9" width="10" height="9" fill="#b3601c" opacity=".8"/><path d="M17 8c4 0 4 8 0 8" fill="none" stroke="#e8dfc7" stroke-width="1.600"/></svg>',
  cow: '<svg viewBox="0 0 70 46"><rect x="8" y="10" width="46" height="22" rx="8" fill="#fff" stroke="#222" stroke-width="2"/><rect x="14" y="14" width="10" height="8" fill="#222"/><rect x="34" y="18" width="12" height="9" fill="#222"/><rect x="12" y="30" width="5" height="14" fill="#fff" stroke="#222" stroke-width="2"/><rect x="44" y="30" width="5" height="14" fill="#fff" stroke="#222" stroke-width="2"/><rect x="50" y="4" width="16" height="16" rx="4" fill="#fff" stroke="#222" stroke-width="2"/><rect x="58" y="14" width="8" height="6" fill="#f0a8a8"/><circle cx="56" cy="10" r="1.600" fill="#222"/><path d="M52 4l-2-4M62 4l2-4" stroke="#222" stroke-width="2"/></svg>',
  burger: '<svg viewBox="0 0 40 34"><path d="M4 14q16-16 32 0z" fill="#d98a2b"/><rect x="3" y="16" width="34" height="4" rx="2" fill="#5fbf3a"/><rect x="2" y="20" width="36" height="5" rx="2" fill="#6b3a1a"/><path d="M3 26h34q0 7-17 7T3 26z" fill="#d98a2b"/><circle cx="12" cy="10" r="1" fill="#f6efd8"/><circle cx="20" cy="8" r="1" fill="#f6efd8"/><circle cx="27" cy="11" r="1" fill="#f6efd8"/></svg>',
  fries: '<svg viewBox="0 0 34 40"><g fill="#f4c542"><rect x="6" y="2" width="4" height="22"/><rect x="11" y="0" width="4" height="24"/><rect x="16" y="3" width="4" height="22"/><rect x="21" y="1" width="4" height="24"/><rect x="26" y="4" width="4" height="20"/></g><path d="M3 22h28l-4 17H7z" fill="#da291c" stroke="#fff" stroke-width="1.600"/></svg>',
  soda: '<svg viewBox="0 0 26 40"><rect x="11" y="0" width="3" height="10" fill="#fff"/><path d="M3 8h20l-3 30H6z" fill="#da291c" stroke="#fff" stroke-width="1.600"/><rect x="4" y="14" width="18" height="8" fill="#fff" opacity=".85"/></svg>',
  speaker: '<svg viewBox="0 0 40 56"><rect x="2" y="2" width="36" height="52" rx="4" fill="#16161c" stroke="#555" stroke-width="2"/><circle cx="20" cy="18" r="8" fill="#2a2a34" stroke="#888" stroke-width="2"/><circle cx="20" cy="38" r="12" fill="#2a2a34" stroke="#888" stroke-width="2"/><circle cx="20" cy="38" r="5" fill="#444"/></svg>',
  disco: '<svg viewBox="0 0 40 50"><path d="M20 0v10" stroke="#aaa" stroke-width="2"/><circle cx="20" cy="30" r="18" fill="#d6dce8"/><path d="M4 24h32M3 32h34M8 40h24M20 12v36M10 16v28M30 16v28" stroke="#8a93a8" stroke-width="1.400"/><path d="M12 22h6v6h-6zM24 34h6v6h-6zM22 18h5v5h-5z" fill="#fff"/></svg>',
  eyes: '<svg viewBox="0 0 34 14"><ellipse cx="9" cy="7" rx="7" ry="5.500" fill="#fff"/><ellipse cx="25" cy="7" rx="7" ry="5.500" fill="#fff"/><circle cx="10.500" cy="7" r="2.800" fill="#1a1a1a"/><circle cx="26.500" cy="7" r="2.800" fill="#1a1a1a"/></svg>',
  cat: '<svg viewBox="0 0 40 30"><ellipse cx="18" cy="21" rx="15" ry="8" fill="#e8c28a"/><circle cx="31" cy="16" r="7" fill="#e8c28a"/><path d="M26 11l1-6 4 4M33 9l3-5 1 7" fill="#e8c28a"/><path d="M8 20c-6 0-8-6-4-9" fill="none" stroke="#e8c28a" stroke-width="3.500" stroke-linecap="round"/><path d="M29 15h3M31 18q2 1 4 0" stroke="#7a4a1a" stroke-width="1.200" fill="none"/></svg>',
  eagle: '<svg viewBox="0 0 44 40"><path d="M22 6c-2-4-7-3-8 1 3 0 5 2 5 4-8-2-15-6-18-9 0 9 5 17 13 20l-2 8h10l-2-8c8-3 13-11 13-20-3 3-10 7-18 9 0-2 2-4 5-4-1-4-6-5-8-1z" fill="#d9a82a" stroke="#8a6a1a" stroke-width="1.600"/><circle cx="14" cy="6" r="1.200" fill="#222"/><circle cx="30" cy="6" r="1.200" fill="#222"/></svg>',
  candle: '<svg viewBox="0 0 16 34"><ellipse class="fl" cx="8" cy="7" rx="3.200" ry="6" fill="#ffb347"/><rect x="5" y="12" width="6" height="18" fill="#f6efd8"/><rect x="2" y="29" width="12" height="4" rx="1" fill="#8a6a2a"/></svg>',
};
const GICON = {
  people: mini('0 0 24 24', '<circle cx="8" cy="8" r="3.500" fill="currentColor"/><circle cx="17" cy="9" r="3" fill="currentColor"/><path d="M1 21v-3a7 7 0 0 1 14 0v3zM14 21v-2a6 6 0 0 1 9 -5v7z" fill="currentColor"/>'),
  eye: mini('0 0 24 24', '<path d="M1 12q11-12 22 0-11 12-22 0z" fill="none" stroke="currentColor" stroke-width="2.200"/><circle cx="12" cy="12" r="3.600" fill="currentColor"/>'),
  coin: mini('0 0 24 24', '<circle cx="12" cy="12" r="9.500" fill="none" stroke="currentColor" stroke-width="2.200"/><path d="M12 6v12M9 9.500q3-2 6 0M9 14.500q3 2 6 0" fill="none" stroke="currentColor" stroke-width="1.800"/>'),
  crown: mini('0 0 24 24', '<path d="M3 19V8l5 4 4-7 4 7 5-4v11z" fill="currentColor"/>'),
};
const GAUGES = [['Complices', GICON.people], ['Discrétion', GICON.eye], ['Argent', GICON.coin], ['Faveur', GICON.crown]];
const LOSE_KEY = [['c0', 'c1'], ['d0', 'd1'], ['a0', 'a1'], ['f0', 'f1']];

// ---------- décors des autres lieux ----------
const LOC = {
  kitchen: `<rect width="390" height="262" fill="#c9b48a"/><g stroke="#00000022" stroke-width="2">${Array.from({ length: 13 }, (_, i) => `<path d="M${i * 30} 0v262"/>`).join('')}${Array.from({ length: 9 }, (_, i) => `<path d="M0 ${i * 30}h390"/>`).join('')}</g>
    <rect y="256" width="390" height="10" fill="#6a4a2a"/><rect y="262" width="390" height="118" fill="#5a4a3a"/><g stroke="#00000040" stroke-width="2">${Array.from({ length: 6 }, (_, i) => `<path d="M0 ${278 + i * 20}h390"/>`).join('')}</g>
    <rect x="24" y="120" width="130" height="142" rx="6" fill="#222"/><rect x="34" y="132" width="110" height="60" rx="3" fill="#111" stroke="#444" stroke-width="2"/><rect x="30" y="204" width="118" height="10" fill="#444"/>
    <circle cx="52" cy="112" r="16" fill="#555" stroke="#888" stroke-width="3"/><circle cx="92" cy="110" r="14" fill="#6a6a6a" stroke="#999" stroke-width="3"/><circle cx="130" cy="112" r="16" fill="#555" stroke="#888" stroke-width="3"/>
    <rect x="76" y="40" width="30" height="70" fill="#333"/><g fill="#555" stroke="#222" stroke-width="2"><circle cx="190" cy="40" r="14"/><circle cx="230" cy="48" r="11"/><circle cx="268" cy="40" r="14"/></g><g stroke="#333" stroke-width="3"><path d="M190 0v26M230 0v37M268 0v26"/></g>
    <rect x="180" y="104" width="170" height="8" fill="#6a4a2a"/><rect x="180" y="150" width="170" height="8" fill="#6a4a2a"/><g fill="#d8c9a3" stroke="#6a5a3a" stroke-width="2"><rect x="192" y="84" width="22" height="20" rx="4"/><rect x="226" y="84" width="22" height="20" rx="4"/><rect x="296" y="84" width="22" height="20" rx="4"/><rect x="326" y="130" width="22" height="20" rx="4"/></g>`,
  station: `<defs><linearGradient id="tsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26304f"/><stop offset="1" stop-color="#6a5a7a"/></linearGradient></defs><rect width="390" height="262" fill="url(#tsk)"/><circle cx="320" cy="50" r="16" fill="#f6efd8"/>
    <path d="M0 170l40-36 36 30 50-50 60 52 40-24 56 40 50-30 58 38v72H0z" fill="#3a3a5a"/><rect y="226" width="390" height="40" fill="#2a2a3a"/><rect y="262" width="390" height="118" fill="#4a4a52"/><rect y="262" width="390" height="8" fill="#7a7a82"/>
    <g stroke="#111" stroke-width="4"><path d="M0 236h390M0 250h390"/></g><g stroke="#4a3a2a" stroke-width="6">${Array.from({ length: 14 }, (_, i) => `<path d="M${i * 30 + 6} 230v26"/>`).join('')}</g>
    <rect x="20" y="40" width="46" height="46" rx="23" fill="#f6efd8" stroke="${GOLD}" stroke-width="4"/><path d="M43 48v20l12 8" stroke="#222" stroke-width="3" fill="none"/><rect x="95" y="20" width="6" height="200" fill="#222"/><circle cx="98" cy="22" r="9" fill="#fff6c2"/><rect x="290" y="20" width="6" height="200" fill="#222"/><circle cx="293" cy="22" r="9" fill="#fff6c2"/>
    <rect x="150" y="60" width="120" height="30" rx="4" fill="#c0161d" stroke="${GOLD}" stroke-width="3"/><text x="210" y="82" text-anchor="middle" fill="#fff" font-size="18" font-weight="900" font-family="system-ui">ГАРА</text>`,
  menagerie: `<rect width="390" height="262" fill="#a82a2a"/><g fill="#f1e6c8">${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 78} 0h39v262h-39z"/>`).join('')}</g><path d="M0 0h390v34q-33 18-65 0-33 18-65 0-33 18-65 0-33 18-65 0-33 18-65 0-33 18-65 0z" fill="#c9a82a"/>
    <rect y="262" width="390" height="118" fill="#c9a060"/><g fill="#a07a3a" opacity=".5">${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 47) % 390}" cy="${272 + (i * 31) % 100}" r="${2 + i % 3}"/>`).join('')}</g>
    <rect x="22" y="110" width="150" height="152" fill="#2a1a10" opacity=".55"/><g stroke="#555" stroke-width="5"><path d="M22 110v152M52 110v152M82 110v152M112 110v152M142 110v152M172 110v152M22 110h150M22 262h150"/></g>
    <path d="M200 70l30 24-30 24-30-24z" fill="${GOLD}" stroke="#8a6a1a" stroke-width="3"/><circle cx="330" cy="70" r="26" fill="#f6efd8" stroke="${GOLD}" stroke-width="5"/><path d="M316 70h28M330 56v28" stroke="#c0161d" stroke-width="5"/>
    <g fill="#6a4a1a"><rect x="262" y="236" width="70" height="26" rx="6"/><rect x="268" y="226" width="58" height="14" rx="6" fill="#d9b84a"/></g>`,
  dining: `<rect width="390" height="262" fill="#1f3a2a"/><g stroke="#ffffff18" stroke-width="2">${Array.from({ length: 13 }, (_, i) => `<path d="M${i * 30} 0v262"/>`).join('')}</g><rect y="256" width="390" height="10" fill="#7a5a2a"/><rect y="262" width="390" height="118" fill="#3b2418"/>
    <g stroke="#00000040" stroke-width="2">${Array.from({ length: 6 }, (_, i) => `<path d="M0 ${278 + i * 20}h390"/>`).join('')}</g>
    <rect x="96" y="30" width="78" height="120" rx="30" fill="#0d1a38" stroke="${GOLD}" stroke-width="5"/><circle cx="148" cy="62" r="9" fill="#f6efd8"/><rect x="216" y="30" width="78" height="120" rx="30" fill="#0d1a38" stroke="${GOLD}" stroke-width="5"/>
    <rect x="30" y="268" width="330" height="22" rx="4" fill="#7a4a22"/><rect x="30" y="288" width="330" height="8" fill="#4a2a12"/><rect x="48" y="296" width="12" height="64" fill="#4a2a12"/><rect x="330" y="296" width="12" height="64" fill="#4a2a12"/>
    <g fill="#f6efd8" stroke="#8a7a52" stroke-width="1.500">${[70, 120, 170, 220, 270, 320].map(x => `<ellipse cx="${x}" cy="272" rx="14" ry="4"/>`).join('')}</g><g fill="#f6efd8">${[95, 195, 295].map(x => `<rect x="${x - 3}" y="248" width="6" height="22"/>`).join('')}</g>`,
  capi: null,
};
function locBg(name) { return `<svg viewBox="0 0 390 380" preserveAspectRatio="none" aria-hidden="true">${LOC[name]}</svg>`; }
const CAPI = (() => {
  const stripes = Array.from({ length: 7 }, (_, i) => `<rect x="14" y="${36 + i * 10}" width="116" height="10" fill="${i % 2 ? '#fff' : '#b22234'}"/>`).join('');
  const stars = Array.from({ length: 12 }, (_, i) => `<circle cx="${22 + (i % 4) * 12}" cy="${44 + Math.floor(i / 4) * 11}" r="2" fill="#fff"/>`).join('');
  return `<svg viewBox="0 0 390 380" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="tschk" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#fff"/><rect width="13" height="13" fill="#da291c"/><rect x="13" y="13" width="13" height="13" fill="#da291c"/></pattern></defs>
    <rect width="390" height="262" fill="#ffd23a"/><rect width="390" height="26" fill="#da291c"/><rect y="256" width="390" height="10" fill="#b01f14"/><rect y="262" width="390" height="118" fill="url(#tschk)"/>
    <g class="ts-flag">${stripes}<rect x="14" y="36" width="52" height="40" fill="#3c3b6e"/>${stars}<rect x="12" y="30" width="3" height="120" fill="#555"/></g>
    <rect x="140" y="30" width="120" height="92" rx="12" fill="#da291c" stroke="#fff" stroke-width="3"/><path d="M158 100V62q0-20 17-20t20 30q3-30 20-30t17 20v38" fill="none" stroke="#ffc72c" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><text x="200" y="118" text-anchor="middle" fill="#fff" font-size="13" font-weight="900" font-family="system-ui">MacTsar</text>
    <rect x="278" y="34" width="98" height="92" rx="6" fill="#222" stroke="#ffc72c" stroke-width="3"/><g fill="#fff" font-family="system-ui" font-size="9.500" font-weight="700"><text x="286" y="52">BIG TSAR ...... 9 ₽</text><text x="286" y="68">FRITES KREMLIN . 4 ₽</text><text x="286" y="84">MCSAMOVAR ..... 3 ₽</text><text x="286" y="100">COCA-VODKA .... 5 ₽</text><text x="286" y="116" fill="#ffc72c">MENU GOULAG : 1 ₽</text></g>
    <rect x="238" y="246" width="152" height="56" rx="4" fill="#da291c" stroke="#fff" stroke-width="3"/><rect x="238" y="240" width="152" height="10" fill="#fff"/><g stroke="#555" stroke-width="2"><path d="M60 0v20M330 0v20"/></g><circle cx="60" cy="24" r="10" fill="#fff6c2"/><circle cx="330" cy="24" r="10" fill="#fff6c2"/></svg>`;
})();

// ---------- les cartes ----------
// loc : le lieu où le visiteur t'emmène si tu acceptes ; flag : ce que ça prépare ; fx : [Complices, Discrétion, Argent, Faveur]
const C = [
  { id: 'cook', who: { hat: 'toque', beard: 'mustache', extra: 'apron', coat: '#8a8a8a', skin: 1 }, name: 'Ivan, cuisinier impérial', text: 'Le tsar réclame un nouveau thé. J\'ai une fiole : sans goût, sans odeur, sans lendemain. Je peux vous la montrer en cuisine, puis la poser sur la table du salon ?', L: ['Non, merci', [0, 5, 0, 5]], R: ['Montre-moi', [8, -8, 0, 0], 'poison'] },
  { id: 'guard', who: { hat: 'cap', cap: '#3b5a3a', beard: 'full', extra: 'medals', coat: '#3b4a3b', skin: 0 }, name: 'Dimitri, garde du palais', text: 'On me doit trois mois de solde, et ma loyauté a faim. Payez-moi, et mes hommes regarderont ailleurs au passage d\'un certain train.', L: ['Tant pis', [-12, 5, 0, 0]], R: ['Payer (−15 ₽)', [14, -4, -15, 0], 'guard'] },
  { id: 'priest', who: { hat: 'mitre', beard: 'full', extra: 'cross', coat: '#4a2a5a', skin: 2, hair: '#cfc7b8' }, name: 'Père Anatoli', text: 'Dieu bénit le tsar. Mais Dieu, lui, n\'a rien dit de précis sur ses successeurs.', L: ['Sois discret', [0, 8, 0, 0]], R: ['Bénis-moi', [6, -6, 0, 8]] },
  { id: 'general', who: { hat: 'cap', cap: '#2a3a52', beard: 'pointy', extra: 'sash', coat: '#2a3a52', skin: 0, brow: 'angry' }, name: 'Général Orlov', text: 'Mon train blindé attend vos ordres. Venez à la gare : je vous remets l\'horaire du convoi impérial, et je le poserai sur la table du salon.', L: ['Plus tard', [-5, 0, 0, 0]], R: ['Allons-y', [10, -10, 0, 0], 'train'] },
  { id: 'tamer', who: { hat: 'ushanka', beard: 'full', extra: 'none', coat: '#5a4636', skin: 3 }, name: 'Piotr, dresseur d\'ours', text: 'L\'ours de cirque adore le tsar. Je dis « adore » ; lui dit « goûte ». Passons à la ménagerie : je vous le prête, il attendra dans le salon.', L: ['Surtout pas', [0, 6, 0, 3]], R: ['Voyons l\'ours', [8, -9, -8, 0], 'bear'] },
  { id: 'tsar', who: { hat: 'crown', beard: 'pointy', extra: 'medals', coat: '#7a1620', skin: 0, hair: '#8a6a3a' }, name: 'Sa Majesté le Tsar', text: 'Courtisan ! Venez dîner ce soir à ma table. Je suis d\'excellente humeur, ce qui est rare.', L: ['Prétexter la fièvre', [0, 6, 0, -14]], R: ['J\'accepte avec joie', [0, -3, 0, 14], 'access'] },
  { id: 'spy', who: { hat: 'none', beard: 'mustache', extra: 'none', coat: '#222', skin: 2, hair: '#1a1a1a', brow: 'angry' }, name: 'Boris, de l\'Okhrana', text: 'On parle de vous dans de petites pièces fermées. Je peux faire cesser ça.', L: ['Dénoncer un rival', [-14, 12, 0, 10]], R: ['Payer (−20 ₽)', [0, 18, -20, 0]] },
  { id: 'peasant', who: { hat: 'ushanka', beard: 'full', extra: 'none', coat: '#6b5a3a', skin: 3, hair: '#6a5a4a' }, name: 'Un paysan', text: 'Le peuple a faim, mon seigneur. Le peuple a toujours faim, mais là, il insiste.', L: ['Qu\'il patiente', [-10, 0, 0, 6]], R: ['Ouvrir les greniers', [12, 0, -14, -4]] },
  { id: 'banker', who: { hat: 'none', beard: 'mustache', extra: 'none', coat: '#2a2a3a', skin: 2, hair: '#8a8a8a' }, name: 'Le banquier Rosenbaum', text: 'Je finance les révolutions qui rapportent. Voulez-vous une avance sur la vôtre ?', L: ['Pas de dettes', [0, 4, 0, 0]], R: ['Un petit prêt', [4, -6, 25, 0]] },
  { id: 'student', who: { hat: 'none', beard: 'none', extra: 'none', coat: '#3a4a6a', skin: 0, hair: '#5a3a2a', brow: 'angry' }, name: 'Un étudiant exalté', text: 'Camarade ! J\'ai fabriqué une bombe. Elle est petite, mais très motivée.', L: ['Fuir', [-6, 4, 0, 4]], R: ['L\'enrôler', [14, -14, 0, -4]] },
  { id: 'lady', who: { hat: 'none', beard: 'none', extra: 'none', coat: '#7a2a52', skin: 2, hair: '#2a1a14' }, name: 'Comtesse Vera', text: 'Les murs du palais ont des oreilles. J\'ai les yeux, les oreilles et un éventail.', L: ['Éviter', [0, 5, 0, 0]], R: ['Séduire l\'info', [8, -8, 0, 6]] },
  { id: 'accountant', who: { hat: 'none', beard: 'none', extra: 'none', coat: '#8a7a5a', skin: 1, hair: '#6a6a6a' }, name: 'Le comptable', text: 'Les caisses sont vides. Je précise qu\'elles l\'étaient déjà hier, mais plus sincèrement.', L: ['Fermez les yeux', [0, 0, -6, 5]], R: ['Faire une quête', [-4, 0, 14, -6]] },
];
const EXTRA = [
  { id: 'vodka', who: { hat: 'crown', beard: 'pointy', extra: 'medals', coat: '#7a1620', skin: 0, hair: '#8a6a3a' }, name: 'Sa Majesté le Tsar', text: 'Courtisan ! Un concours de vodka, vous et moi. Le dernier debout garde la couronne, l\'autre garde le seau.', L: ['Refuser poliment', [0, 4, 0, -10]], R: ['Relever le défi', [0, 0, 0, 0]] },
  { id: 'babouchka', who: { hat: 'none', beard: 'none', extra: 'none', coat: '#6a3a5a', skin: 2, hair: '#d8d8d8' }, name: 'Babouchka Nadia', text: 'Mon petit, j\'ai tricoté une écharpe pour notre père le tsar. Douze mètres. Il aura chaud, il aura très chaud. Tu la lui offres de ma part ?', L: ['Pas maintenant', [0, 4, 0, 0]], R: ['Je m\'en charge', [0, 0, 0, 0]] },
  { id: 'catcard', who: 'cat', name: 'Le chat du palais', text: 'Miaou. (Il fixe la couronne du tsar depuis trois ans, sans cligner des yeux.)', L: ['Le chasser', [0, 3, 0, 4]], R: ['Lui donner la couronne', [0, 0, 0, 0]] },
];
const DJ = { id: 'dj', who: { hat: 'cap', cap: NAVY, adidas: true, coat: NAVY, beard: 'none', skin: 0, hair: '#222' }, name: 'DJ Vlad le Squatteur', text: 'Camarade, j\'ai des enceintes, 40 kilos de hardbass et un tsar qui s\'ennuie. On fait une fête ?', L: ['Pas ce soir', [0, 5, 0, -2]], R: ['Balance le son !', [0, 0, 0, 0]] };
const BROKER = { id: 'broker', who: { hat: 'tophat', coat: '#1a1a2a', extra: 'tie', beard: 'none', skin: 2 }, name: 'Brad, de Wall Street', text: 'Sire, j\'ai une idée : privatisons tout. La Russie, mais en franchise. Avec des frites et un drapeau en plus.', L: ['Jamais !', [0, 4, 0, -2]], R: ['Privatise tout !', [0, 0, 0, 0]] };
const ROUTES = { samovar: ['poison', 'access'], train: ['train', 'guard'], bear: ['bear', 'access'] };
const BRIEF = ['Ton but : prendre la place du tsar.', 'Il te faut un moyen et un accès. Chaque personnage qui t\'aide laisse une trace dans la salle : regarde la table, le fond, les murs.', 'Garde l\'équilibre : une jauge à 0 ou à 100, et c\'est la fin. Tu as 14 jours.'];
const HINTS = ['Glisse ou touche un choix.', 'Choisis vite : le tsar a de l\'appétit et les gardes de la gâchette.', 'Une mauvaise décision, un petit voyage en Sibérie. Bonne chance, couillon.', 'Tu peux aussi attendre la mort naturelle du tsar, mais elle est lente.', 'Réfléchis bien : ici, une connerie se paie cash.', 'Le complot, c\'est comme la vodka : trop tôt ou trop tard, ça finit mal.', 'Les murs ont des oreilles. Les oreilles ont des yeux. Les yeux ont des fusils.'];

const THRONE = `<svg class="ts-bg thr" viewBox="0 0 390 380" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="tsw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0c14"/><stop offset="1" stop-color="#5a1a22"/></linearGradient><linearGradient id="tsf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2418"/><stop offset="1" stop-color="#1c110c"/></linearGradient></defs>
        <rect width="390" height="262" fill="url(#tsw)"/><g stroke="#00000030" stroke-width="2">${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 44} 0v262"/>`).join('')}</g>
        <rect y="256" width="390" height="10" fill="#7a5a2a"/><rect y="262" width="390" height="118" fill="url(#tsf)"/><g stroke="#00000040" stroke-width="2">${Array.from({ length: 7 }, (_, i) => `<path d="M0 ${278 + i * 17}h390"/>`).join('')}</g>
        <rect x="118" y="26" width="8" height="236" fill="#2a0a10"/><rect x="238" y="26" width="8" height="236" fill="#2a0a10"/><path d="M0 0h390v24l-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8-20 8-20-8z" fill="#c0161d"/>
        <path d="M290 262v-90q0-30 30-30h50q20 0 20 30v90z" fill="#2a0a10" stroke="${GOLD}" stroke-width="3"/><rect x="300" y="196" width="80" height="14" rx="4" fill="#7a1620"/>
        <rect x="30" y="316" width="320" height="56" rx="3" fill="#6a1420" stroke="#f4d56b99" stroke-width="3"/><rect x="40" y="324" width="300" height="40" fill="none" stroke="#f4d56b55" stroke-width="2" stroke-dasharray="10 6"/>
        <path d="M98 24h18v70l-9 12-9-12z" fill="#c0161d" stroke="#f4d56b" stroke-width="2"/><path d="M248 24h18v70l-9 12-9-12z" fill="#c0161d" stroke="#f4d56b" stroke-width="2"/><circle cx="107" cy="52" r="4" fill="#f4d56b"/><circle cx="257" cy="52" r="4" fill="#f4d56b"/>
        <path d="M0 250h390" stroke="#f4d56b55" stroke-width="2"/><g stroke="#00000055" stroke-width="2"><rect x="8" y="150" width="10" height="26" rx="2" fill="#4a2f14"/></g></svg>`;

export function startTsar(host, opts = {}) {
  let found = []; try { found = JSON.parse(localStorage.getItem(ENDS_KEY) || '[]'); } catch {}
  let AC = null;
  let unlocked = false, music = null;
  const unlock = () => { if (unlocked) return; unlocked = true; try {   // un lecteur silencieux (1 s réelle de silence) fait sortir aussi le son synthétisé quand l'iPhone est en mode silencieux
    const n = 8000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))); a.loop = true; a.volume = .01; a.play().catch(() => { unlocked = false; }); } catch { /* audio indisponible */ } };
  const stopMusic = () => { if (music) { try { music.pause(); } catch {} music = null; } };
  const playMusic = (src, { loop = false, volume = .8, fallback } = {}) => { if (opts.sound === false) return; stopMusic(); try { const a = new Audio(src); a.loop = loop; a.volume = volume; music = a; a.addEventListener('error', () => { if (music === a) { music = null; fallback?.(); } }); a.play().catch(() => fallback?.()); } catch { fallback?.(); } };
  const ctx = () => { if (opts.sound === false) return null; unlock(); try { AC ||= new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch { return null; } };
  const tone = (f, t, d, { type = 'sine', g = .2, to = 0, at = 0 } = {}) => { const c = ctx(); if (!c) return; const o = c.createOscillator(), gn = c.createGain(), s = c.currentTime + at + t; o.type = type; o.frequency.setValueAtTime(f, s); if (to) o.frequency.exponentialRampToValueAtTime(to, s + d); gn.gain.setValueAtTime(.0001, s); gn.gain.linearRampToValueAtTime(g, s + Math.min(.02, d / 4)); gn.gain.exponentialRampToValueAtTime(.0001, s + d); o.connect(gn).connect(c.destination); o.start(s); o.stop(s + d + .05); };
  const noise = (t, d, { g = .3, lp = 1800 } = {}) => { const c = ctx(); if (!c) return; const n = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain(); f.type = 'lowpass'; f.frequency.value = lp; gn.gain.value = g; s.buffer = buf; s.connect(f).connect(gn).connect(c.destination); s.start(c.currentTime + t); };
  const SFX = {
    blip: () => tone(520, 0, .09, { type: 'square', g: .08 }), no: () => tone(220, 0, .12, { type: 'square', g: .08 }),
    coin: () => { tone(988, 0, .08, { type: 'square', g: .07 }); tone(1319, .07, .22, { type: 'square', g: .07 }); },
    poison: () => { for (let i = 0; i < 7; i++) tone(300 + Math.random() * 300, i * .09, .12, { to: 700, g: .09 }); tone(180, .6, .5, { type: 'sawtooth', to: 60, g: .1 }); },
    boom: () => { noise(0, .7, { g: .5, lp: 700 }); tone(90, 0, .5, { to: 30, g: .5 }); },
    zap: () => tone(1200, 0, .25, { type: 'sawtooth', to: 200, g: .08 }),
    stamp: () => { tone(110, 0, .18, { to: 40, g: .5 }); noise(0, .1, { g: .25, lp: 3000 }); },
    whistle: () => { tone(700, 0, .55, { type: 'sawtooth', g: .08 }); tone(880, .02, .55, { type: 'sawtooth', g: .08 }); },
    growl: () => { tone(75, 0, .8, { type: 'sawtooth', to: 55, g: .2 }); tone(80, 0, .8, { type: 'square', to: 50, g: .08 }); },
    win: () => [262, 330, 392, 523, 392, 523, 659].forEach((f, i) => tone(f, i * .13, i > 5 ? .6 : .16, { type: 'square', g: .1 })),
    lose: () => [392, 370, 349, 330].forEach((f, i) => tone(f, i * .32, i === 3 ? 1 : .32, { type: 'sawtooth', to: f * .94, g: .1 })),
    funeral: () => [196, 196, 196, 233, 208, 208, 196, 196].forEach((f, i) => tone(f, i * .55, .5, { type: 'triangle', g: .18 })),
    cash: () => { [1318, 1760, 2093].forEach((f, i) => tone(f, i * .09, .35, { type: 'triangle', g: .12 })); noise(0, .05, { g: .15, lp: 6000 }); },
    // hymne américain : enregistrement de l'US Army Field Band (domaine public) ; en secours, une version synthétisée
    anthem: () => playMusic('tsar-usa.mp3', { volume: .85, fallback: () => SFX.anthemSynth() }),
    anthemSynth: () => { const N = { C4: 261.63, E4: 329.63, Fs4: 369.99, G4: 392, C5: 523.25, D5: 587.33, E5: 659.25, A4: 440, B4: 493.88 }, sc = [['G4', .75], ['E4', .25], ['C4', 1], ['E4', 1], ['G4', 1], ['C5', 2], ['E5', .75], ['D5', .25], ['C5', 1], ['E4', 1], ['Fs4', 1], ['G4', 2]]; let t = 0; for (const [n, b] of sc) { tone(N[n], t, b * .5 * .95, { type: 'sawtooth', g: .09 }); t += b * .5; } },
    cheer: () => { noise(0, 1.2, { g: .12, lp: 2500 }); },
    // hardbass : morceau original (grosse caisse saturée, basse sur le contre-temps, arpège de synthé) ; en secours, une grosse caisse synthétisée
    beat: () => playMusic('tsar-hardbass.mp3', { loop: true, volume: .9, fallback: () => SFX.beatSynth() }),
    beatSynth: () => { for (let i = 0; i < 24; i++) { const t = i * .4; tone(150, t, .22, { to: 40, g: .5 }); tone([55, 55, 65, 49][i % 4], t + .2, .2, { type: 'sawtooth', g: .12 }); if (i % 2) noise(t + .2, .05, { g: .08, lp: 7000 }); } },
  };
  const beat = () => SFX.beat();
  let S, card = null, stopped = false, busy = true, vis = null, prevCo = 0, prevEy = 0, prevMood = '', loc = 'throne';
  const fresh = () => ({ g: [50, 55, 50, 55], day: 1, max: 14, flags: {}, seen: [], last: null, nextFinal: 3, dj: false, bro: false, dead: false });
  const save = () => { try { localStorage.setItem(ENDS_KEY, JSON.stringify(found)); } catch {} };
  const W = ms => new Promise(r => setTimeout(r, stopped ? 0 : ms));
  const sparks = n => Array.from({ length: n }, (_, i) => `<b class="ts-snow" style="left:${(i * 83) % 96}%;animation-delay:${(i * .37) % 3}s;animation-duration:${2.6 + (i % 4) * .6}s"></b>`).join('');
  host.innerHTML = `<div class="ts-root"><div class="ts-top"><button class="ts-x" id="ts-x" aria-label="Quitter"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/></svg></button><div class="ts-gauges" id="ts-gauges"></div><div class="ts-day" id="ts-day"></div></div>
    <div class="ts-scene" id="ts-scene" data-loc="throne">
      ${THRONE}
      <div class="ts-win thr"><svg viewBox="0 0 100 130" preserveAspectRatio="none"><rect width="100" height="130" fill="#0d1a38"/><circle cx="78" cy="26" r="11" fill="#f6efd8"/><path d="M0 110q20-24 36-6t30-8 34 10v24H0z" fill="#e8eef8"/><path d="M14 110v-22q8-14 16 0v22zM50 110v-30q9-16 18 0v30z" fill="#1a1230"/></svg>${sparks(12)}</div>
      <div class="ts-portrait thr" id="ts-portrait"></div><div class="ts-chest thr" id="ts-chest"></div>
      <div class="ts-chand thr"><svg viewBox="0 0 90 70"><path d="M45 0v20M10 40q35 22 70 0" stroke="#f4d56b" stroke-width="3" fill="none"/><rect x="38" y="16" width="14" height="10" rx="3" fill="#f4d56b"/>${[10, 27, 45, 63, 80].map((x, i) => `<rect x="${x - 3}" y="${i % 2 ? 34 : 38}" width="6" height="12" fill="#f6efd8"/><ellipse class="fl" cx="${x}" cy="${i % 2 ? 30 : 34}" rx="3.500" ry="6" fill="#ffb347" style="animation-delay:${i * .3}s"/>`).join('')}</svg></div>
      <div class="ts-candle thr" style="left:${X(112)}%;top:${125 / SH * 100}%">${PROP.candle}</div><div class="ts-candle thr" style="left:${X(252)}%;top:${125 / SH * 100}%">${PROP.candle}</div>
      <div class="ts-eagle thr">${PROP.eagle}</div><div class="ts-clock thr"><i></i></div><div class="ts-cat thr">${PROP.cat}<span>z z</span></div>
      <div id="ts-plotters" class="thr"></div><div id="ts-eyes" class="thr"></div>
      <div class="ts-table thr" id="ts-table"><div class="ts-top2"></div><span class="ts-sam">${SAMOVAR}</span>
        <span class="ts-prop vial">${PROP.vial}</span><span class="ts-prop timetable">${PROP.timetable}</span><span class="ts-prop invite">${PROP.invite}</span></div>
      ${['kitchen', 'station', 'menagerie', 'dining'].map(n => `<div class="ts-loc" data-l="${n}">${locBg(n)}${n === 'kitchen' ? `<span class="ts-shelfvial" id="ts-shelfvial">${PROP.vial}</span>` : ''}${n === 'station' ? `<div class="ts-stntrain" id="ts-stntrain">${TRAIN}<i class="ts-carface" id="ts-carface"></i></div><span class="ts-cow" id="ts-cow">${PROP.cow}</span>` : ''}${n === 'menagerie' ? '<div class="ts-bars" id="ts-bars"><svg viewBox="0 0 150 152"><g stroke="#555" stroke-width="5"><path d="M0 0v152M30 0v152M60 0v152M90 0v152M120 0v152M150 0v152M0 2h150"/></g></svg></div>' : ''}</div>`).join('')}
      <div class="ts-loc" data-l="capi">${CAPI}<span class="ts-cp b1">${PROP.burger}</span><span class="ts-cp b2">${PROP.fries}</span><span class="ts-cp b3">${PROP.soda}</span></div>
      <div id="ts-actors"></div><div id="ts-fx"></div><div class="ts-wipe" id="ts-wipe"></div></div>
    <div class="ts-panel" id="ts-panel"></div></div>`;
  const $ = id => host.querySelector('#' + id), scene = $('ts-scene'), actors = $('ts-actors'), fxl = $('ts-fx');
  $('ts-x').onclick = () => { stopped = true; stopMusic(); opts.onExit?.(); };
  host.addEventListener('pointerdown', () => { if (opts.sound !== false) unlock(); }, { once: true });

  // ----- personnages -----
  const mk = (o, x, { lane = FRONT, w = 90, flip = 1, cls = '' } = {}) => {
    const e = document.createElement('div'); e.className = 'ts-actor ' + cls; e.style.cssText = `left:${X(x)}%;bottom:${Y(lane)}%;width:${w / SW * 100}%;--f:${flip};z-index:${lane >= FRONT - 20 ? 5 : 1}`;
    e.innerHTML = o === 'bear' ? BEAR : o === 'cat' ? `<div class="ts-catwalk">${PROP.cat}</div>` : body(o); actors.append(e); return e;
  };
  const move = async (e, x, ms, flip) => { if (flip) e.style.setProperty('--f', flip); e.classList.add('walk'); e.style.transition = `left ${ms}ms linear`; e.style.left = X(x) + '%'; await W(ms); e.classList.remove('walk'); };
  const centre = e => { const r = e.getBoundingClientRect(), s = scene.getBoundingClientRect(); return { x: r.left + r.width / 2 - s.left, y: r.top + r.height * .45 - s.top }; };
  const pt = e => e && e.getBoundingClientRect ? centre(e) : e;
  const piece = (kind, size) => { const s = document.createElement('span'); s.className = 'ts-fly'; s.innerHTML = PART[kind]; s.style.width = size + 'px'; s.style.height = size + 'px'; return s; };
  const fly = (kind, from, to, ms = 800, size = 22) => {
    const a = pt(from), b = pt(to), s = piece(kind, size); s.style.left = a.x + 'px'; s.style.top = a.y + 'px'; fxl.append(s);
    return s.animate([{ transform: 'translate(-50%,-50%) scale(.6)' }, { transform: `translate(calc(-50% + ${(b.x - a.x) / 2}px),calc(-50% + ${(b.y - a.y) / 2 - 50}px)) scale(1.2)`, offset: .5 }, { transform: `translate(calc(-50% + ${b.x - a.x}px),calc(-50% + ${b.y - a.y}px)) scale(.9)` }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' }).finished.catch(() => {}).then(() => s.remove());
  };
  const burst = (kind, at, n = 6, size = 20) => { const p = pt(at); return Promise.all(Array.from({ length: n }, (_, i) => { const s = piece(kind, size + (i % 3) * 5); s.style.left = p.x + 'px'; s.style.top = p.y + 'px'; fxl.append(s); const ang = i / n * Math.PI * 2; return s.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * 48}px),calc(-50% + ${Math.sin(ang) * 40 - 24}px)) scale(1.1)`, opacity: 0 }], { duration: 800, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {}).then(() => s.remove()); })); };
  const bubble = (e, txt = '...', ms = 1200) => { if (!e) return; const b = document.createElement('div'); b.className = 'ts-bub'; b.textContent = txt; e.append(b); setTimeout(() => b.remove(), ms); };
  const shake = () => { SFX.boom(); scene.classList.remove('shake'); void scene.offsetWidth; scene.classList.add('shake'); };
  const flash = async () => { SFX.zap(); const f = document.createElement('div'); f.className = 'ts-flash'; scene.append(f); await W(420); f.remove(); };
  const act = (e, cls, ms) => { e.classList.add(cls); return W(ms).then(() => e.classList.remove(cls)); };
  const hold = (e, key) => { let h = e.querySelector('.ts-hold'); if (!h) { h = document.createElement('div'); h.className = 'ts-hold'; e.append(h); } h.innerHTML = PROP[key]; e.classList.add('holding'); };
  const unhold = e => e.classList.remove('holding');
  const showProp = (name, on = true) => { const p = $('ts-table').querySelector('.' + name); p.classList.toggle('on', on); if (on) { p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop'); } };

  // ----- lieux : on y va à pied, le décor change -----
  const setLoc = name => { loc = name; scene.dataset.loc = name; };
  const wipe = async fn => { const w = $('ts-wipe'); w.classList.add('on'); await W(450); fn(); await W(120); w.classList.remove('on'); await W(380); };
  async function travel(party, name) {
    await Promise.all(party.map((p, i) => W(i * 180).then(() => move(p.e, 450, 1500, 1))));
    await wipe(() => { setLoc(name); party.forEach(p => { p.e.style.transition = 'none'; p.e.style.left = X(-60) + '%'; }); });
    await Promise.all(party.map((p, i) => W(i * 260).then(() => move(p.e, p.x, 1500, 1))));
  }
  const behind = async (v, x) => { v.style.transition = 'bottom .6s, width .6s'; v.style.bottom = Y(BACK) + '%'; v.style.width = 64 / SW * 100 + '%'; v.style.zIndex = 1; await W(600); await move(v, x, 1300, 1); };
  const dropOnTable = async (v, prop) => { await behind(v, 300); unhold(v); showProp(prop); SFX.blip(); await W(500); await move(v, -70, 1900, -1); v.remove(); };

  // ----- les personnages de base de la salle du trône -----
  const PLAYER_O = { hat: 'none', hair: '#5a3a2a', coat: '#3a4a6a', beard: 'none', skin: 0, extra: 'sash' };
  const tsarO = mood => ({ hat: 'crown', beard: 'pointy', extra: 'medals', coat: '#7a1620', skin: 0, hair: '#8a6a3a', brow: mood === 'angry' ? 'angry' : '' });
  const player = mk(PLAYER_O, 250, { flip: -1, cls: 'player' });
  const tsarEl = mk(tsarO(''), 342, { lane: 232, w: 74, flip: -1, cls: 'tsar sit thr' });
  player.insertAdjacentHTML('beforeend', `<div class="ts-crown">${CROWN}</div>`); tsarEl.insertAdjacentHTML('beforeend', `<div class="ts-crown on">${CROWN}</div>`);
  const relook = (el, o) => { el.querySelector('svg').outerHTML = body(o); };
  const toThrone = () => { tsarEl.classList.remove('away'); tsarEl.classList.add('thr'); tsarEl.style.transition = 'none'; tsarEl.style.left = X(342) + '%'; tsarEl.style.bottom = Y(232) + '%'; tsarEl.classList.add('sit'); tsarEl.style.zIndex = 5; };

  const decor = () => {
    const [co, di, ar, fa] = S.g;
    const n = Math.round(ar / 12.5), open = n >= 4;
    $('ts-chest').innerHTML = `<svg viewBox="0 0 90 70"><g class="lid ${open ? 'open' : ''}"><path d="M8 28q0-18 37-18t37 18z" fill="#7a4a22" stroke="#3a2210" stroke-width="3"/></g><rect x="8" y="28" width="74" height="38" rx="4" fill="#8a5a2a" stroke="#3a2210" stroke-width="3"/><rect x="40" y="34" width="10" height="12" fill="${GOLD}"/>
      ${Array.from({ length: n }, (_, i) => `<ellipse cx="${20 + (i % 4) * 16}" cy="${30 - Math.floor(i / 4) * 7 - (i % 2) * 2}" rx="9" ry="4.500" fill="${GOLD}" stroke="#b8902a" stroke-width="1.500"/>`).join('')}${n <= 1 ? '<path d="M14 36l12 10M64 36L52 48" stroke="#ffffff55" stroke-width="1.500"/>' : ''}</svg>`;
    const k = Math.round(co / 17), spots = [[70, 0], [96, 4], [122, 0], [150, 4], [176, 0], [202, 4]];
    $('ts-plotters').innerHTML = spots.map(([x, dy], i) => `<div class="ts-sil ${i < k ? 'on' : ''} ${i < k && i >= prevCo ? 'pop' : ''}" style="left:${X(x)}%;bottom:${Y(BACK - dy)}%;width:${34 / SW * 100}%">${SILH}</div>`).join(''); prevCo = k;
    const e = Math.round((100 - di) / 25), eyes = [[40, 176], [150, 214], [262, 220], [372, 150]];
    $('ts-eyes').innerHTML = eyes.map(([x, y], i) => `<div class="ts-eye ${i < e ? 'on' : ''} ${i < e && i >= prevEy ? 'pop' : ''}" style="left:${X(x)}%;bottom:${Y(y)}%">${PROP.eyes}</div>`).join(''); prevEy = e;
    ['vial', 'timetable', 'invite'].forEach(p => { const f = { vial: 'poison', timetable: 'train', invite: 'access' }[p], el = $('ts-table').querySelector('.' + p); if (!!S.flags[f] !== el.classList.contains('on') && !el.dataset.busy) el.classList.toggle('on', !!S.flags[f]); });
    const mood = fa < 32 ? 'angry' : fa > 68 ? 'happy' : 'neutral';
    $('ts-portrait').innerHTML = `<svg viewBox="0 0 70 84"><rect x="3" y="3" width="64" height="78" rx="5" fill="#1a0d10" stroke="${GOLD}" stroke-width="4"/><g transform="translate(5 8) scale(.3)">${faceInner(tsarO(mood))}</g>${fa < 22 ? '<path d="M8 8l20 30-8 14 22 28" stroke="#fff" stroke-width="1.800" fill="none"/>' : ''}</svg>`;
    $('ts-portrait').classList.toggle('glow', fa > 68);
    if (mood !== prevMood && !S.dead) { tsarEl.querySelector('g[transform]').innerHTML = faceInner(tsarO(mood)); prevMood = mood; }
    $('ts-gauges').replaceChildren(...gaugeEls());
  };
  const gaugeEls = preview => GAUGES.map(([n, ic], i) => { const d = document.createElement('div'), v = S.g[i], pv = preview ? preview[i] : 0; d.className = 'ts-g' + (v <= 15 || v >= 85 ? ' warn' : ''); d.title = n; d.innerHTML = `<div class="ts-gfill"><i style="height:${v}%"></i></div><span>${ic}</span><b class="ts-dot" style="--s:${Math.min(14, 5 + Math.abs(pv) * .35)}px;opacity:${pv ? 1 : 0}"></b>`; return d; });
  const preview = fx => $('ts-gauges').replaceChildren(...gaugeEls(fx));

  // ----- tirage des cartes -----
  const readyRoutes = () => Object.entries(ROUTES).filter(([, need]) => need.every(n => S.flags[n])).map(([k]) => k);
  let forced = null;
  const pickCard = () => {
    if (forced) { const f = [...C, ...EXTRA, DJ, BROKER].find(x => x.id === forced); forced = null; if (f) return f; }
    const ready = readyRoutes();
    if (ready.length && S.day >= S.nextFinal) return { final: ready[Math.floor(Math.random() * ready.length)] };
    if (!S.dj && S.day >= 4 && Math.random() < .15) { S.dj = true; return DJ; }
    if (!S.bro && S.day >= 4 && Math.random() < .15) { S.bro = true; return BROKER; }
    let pool = [...C, ...EXTRA].filter(c => !S.seen.includes(c.id) && (!['vodka', 'babouchka', 'catcard'].includes(c.id) || S.day >= 3));
    if (!pool.length) { S.seen = []; pool = C.filter(c => c.id !== S.last); }
    if (S.day <= 7) { const en = pool.filter(c => ['cook', 'general', 'tamer', 'guard', 'tsar'].includes(c.id)); if (en.length && Math.random() < .7) pool = en; }
    return pool[Math.floor(Math.random() * pool.length)];
  };
  const chance = () => Math.max(10, Math.min(90, Math.round((S.g[0] + S.g[1]) / 2)));
  const finalCard = k => ({ id: 'final_' + k, who: { samovar: { hat: 'toque', beard: 'mustache', extra: 'apron', coat: '#8a8a8a', skin: 1 }, train: { hat: 'cap', cap: '#2a3a52', beard: 'pointy', extra: 'sash', coat: '#2a3a52', brow: 'angry' }, bear: { hat: 'ushanka', beard: 'full', coat: '#5a4636', skin: 3 } }[k],
    name: { samovar: 'Ivan, cuisinier impérial', train: 'Général Orlov', bear: 'Piotr, dresseur d\'ours' }[k],
    text: { samovar: 'La fiole est sur la table, le tsar prendra son thé ce soir. Il ne manque que votre signe de tête.', train: 'L\'horaire est sur la table, la garde regardera ailleurs. Le convoi impérial passe ce soir sur le pont, et les rails sont un peu fatigués.', bear: 'L\'ours attend dans le salon, et le tsar dîne ici ce soir. Il a jeûné exprès, le pauvre.' }[k],
    L: ['Renoncer', [0, 8, 0, 4]], R: ['Donner le signal', [0, 0, 0, 0]], final: k });

  // ----- panneau de dialogue et de choix -----
  function panel(c) {
    const p = $('ts-panel'); p.className = 'ts-panel';
    p.innerHTML = `<div class="ts-name">${esc(c.name)}</div><p class="ts-say">${esc(c.text)}</p>
      <div class="ts-choices"><button id="ts-l" data-i="0"><span>${esc(c.L[0])}</span></button><button id="ts-r" data-i="1"><span>${esc(c.R[0])}</span></button></div>
      <div class="ts-hint">${HINTS[Math.floor(Math.random() * HINTS.length)]}</div>`;
    let x0 = 0, dx = 0, drag = false;
    p.onpointerdown = e => { if (busy) return; if (e.target.closest('button')) { const i = +e.target.closest('button').dataset.i; preview((i ? c.R : c.L)[1]); } drag = true; x0 = e.clientX; dx = 0; };
    p.onpointermove = e => { if (!drag || busy) return; dx = e.clientX - x0; if (Math.abs(dx) > 8) { p.style.transform = `translateX(${dx * .4}px) rotate(${dx / 60}deg)`; preview((dx < 0 ? c.L : c.R)[1]); p.classList.toggle('left', dx < 0); p.classList.toggle('right', dx > 0); } };
    const up = e => { if (!drag) return; drag = false; p.style.transform = ''; p.classList.remove('left', 'right'); preview(null); if (busy) return; if (Math.abs(dx) > 70) return choose(dx < 0 ? 0 : 1); if (Math.abs(dx) < 8) { const b = e.target.closest?.('button'); if (b) choose(+b.dataset.i); } };
    p.onpointerup = up; p.onpointercancel = () => { drag = false; p.style.transform = ''; preview(null); };
  }

  // ----- les scènes jouées pour chaque choix -----
  const chestEl = () => $('ts-chest');
  const EXIT = async (v, flip = 1) => { if (!v) return; await move(v, -70, 1300, flip); v.remove(); };
  const settle = e => { e.classList.add('thr'); };
  const ACT = {
    async vodka(v, c, ap) { ap(); vis = null; v?.remove(); await playEnd('vodka'); },
    async scarf(v, c, ap) { ap(); vis = null; await playEnd('babouchka', v); },
    async catend(v, c, ap) { ap(); vis = null; await playEnd('cat', v); },
    async rave(v, c, ap) { ap(); vis = null; v?.remove(); await playEnd('rave'); },
    async capi(v, c, ap) { ap(); vis = null; v?.remove(); await playEnd('capi'); },
    async leave(v, c, ap, i) { ap(); bubble(v, i ? 'Da.' : 'Hm.'); await W(500); await EXIT(v, 1); },
    async turn(v, c, ap) { player.style.setProperty('--f', 1); bubble(player, '...'); ap(); await W(700); player.style.setProperty('--f', -1); },
    async flee(v, c, ap) { ap(); bubble(v, '!'); await EXIT(v, 1); },
    async pay(v, c, ap) {
      await Promise.all(Array.from({ length: 5 }, (_, i) => W(i * 120).then(() => fly('coin', chestEl(), v, 700))));
      ap(); await act(v, 'hop', 500);
      if (c.id === 'guard') { bubble(v, 'À vos ordres.', 1400); v.style.transition = 'bottom .6s, width .6s'; v.style.bottom = Y(BACK) + '%'; v.style.width = 58 / SW * 100 + '%'; v.style.zIndex = 1; await W(600); await move(v, 205, 1200, -1); settle(v); v.classList.add('ally'); v.style.setProperty('--f', -1); }
      else await EXIT(v, 1);
    },
    async gain(v, c, ap) { await Promise.all(Array.from({ length: 5 }, (_, i) => W(i * 120).then(() => fly('coin', v, chestEl(), 800)))); ap(); await act(v, 'hop', 500); await EXIT(v, 1); },
    async bless(v, c, ap) { act(v, 'raise', 1100); await W(400); await burst('spark', player, 8); ap(); await W(500); await EXIT(v, 1); },
    async join(v, c, ap) { v.style.transition = 'left 1s linear, bottom 1s linear, width 1s linear, opacity .8s'; v.classList.add('walk'); v.style.left = X(120) + '%'; v.style.bottom = Y(BACK) + '%'; v.style.width = 34 / SW * 100 + '%'; v.style.setProperty('--f', 1); await W(1000); v.style.opacity = 0; ap(); await W(700); v.remove(); },
    async denounce(v, c, ap) { act(v, 'raise', 900); const r = mk({ hat: 'none', beard: 'full', coat: '#555', hair: '#444' }, 130, { lane: BACK, w: 44, flip: 1 }); bubble(r, '!', 900); await W(300); await move(r, -60, 1000, 1); r.remove(); ap(); await W(300); await EXIT(v, 1); },
    async feed(v, c, ap) { await burst('dust', v, 7); ap(); await act(v, 'hop', 500); await EXIT(v, 1); },
    async chat(v, c, ap) { bubble(v, '...', 1200); bubble(player, 'Chut.', 1200); await burst('heart', { x: (centre(v).x + centre(player).x) / 2, y: centre(v).y - 20 }, 4); ap(); await W(500); await EXIT(v, 1); },
    // le cuisinier montre sa fiole en cuisine, puis la dépose sur la table du salon
    async cook(v, c, ap) {
      await travel([{ e: v, x: 160 }, { e: player, x: 250 }], 'kitchen'); player.style.setProperty('--f', -1);
      await move(v, 215, 900, 1); await W(400); $('ts-shelfvial').classList.add('gone'); hold(v, 'vial'); SFX.blip(); await W(400);
      act(v, 'raise', 900); bubble(v, 'Sans goût.', 1400); await burst('spark', v, 5); await W(1300); ap();
      await travel([{ e: v, x: 150 }, { e: player, x: 250 }], 'throne'); player.style.setProperty('--f', -1); $('ts-shelfvial').classList.remove('gone');
      await dropOnTable(v, 'vial');
    },
    // le général remet l'horaire du convoi à la gare, puis le dépose sur la table
    async general(v, c, ap) {
      await travel([{ e: v, x: 150 }, { e: player, x: 250 }], 'station'); player.style.setProperty('--f', -1);
      const tr = $('ts-stntrain'); tr.classList.add('arrive'); SFX.whistle(); await W(500); burst('smoke', { x: scene.clientWidth * .5, y: scene.clientHeight * .6 }, 5, 30); await W(1400);
      hold(v, 'timetable'); act(v, 'raise', 900); bubble(v, 'Convoi à 17 h 42.', 1600); await W(1700); ap();
      tr.classList.remove('arrive'); await travel([{ e: v, x: 150 }, { e: player, x: 250 }], 'throne'); player.style.setProperty('--f', -1);
      await dropOnTable(v, 'timetable');
    },
    // le dresseur ouvre la cage, l'ours nous suit et s'installe dans le salon
    async tamer(v, c, ap) {
      await travel([{ e: v, x: 190 }, { e: player, x: 270 }], 'menagerie'); player.style.setProperty('--f', -1);
      const bear = mk('bear', 92, { lane: FRONT - 36, w: 112, flip: 1 }); bear.style.zIndex = 1; bubble(v, 'Il est doux.', 1200); await W(900);
      act(v, 'raise', 900); SFX.blip(); $('ts-bars').classList.add('open'); await W(900); SFX.growl(); await move(bear, 150, 1100, 1); bear.style.transition = 'bottom .5s'; bear.style.bottom = Y(FRONT) + '%'; bear.style.zIndex = 5; ap(); await W(500);
      await travel([{ e: v, x: 190 }, { e: bear, x: 120 }, { e: player, x: 250 }], 'throne'); player.style.setProperty('--f', -1);
      $('ts-bars').classList.remove('open'); await move(bear, 78, 1200, -1); bear.classList.add('sleep', 'ally'); settle(bear); bear.dataset.role = 'bear'; await W(300); await EXIT(v, 1);
    },
    // le dîner chez le tsar : on change de salle, puis une invitation est déposée sur la table
    async dine(v, c, ap) {
      tsarEl.classList.remove('sit', 'thr'); tsarEl.style.transition = 'bottom .3s'; tsarEl.style.bottom = Y(FRONT) + '%'; await W(350);
      await travel([{ e: tsarEl, x: 300 }, { e: player, x: 110 }], 'dining'); tsarEl.classList.remove('away');
      [tsarEl, player].forEach(e => { e.classList.add('sit'); e.style.transition = 'bottom .3s'; e.style.bottom = Y(292) + '%'; }); player.style.setProperty('--f', 1); tsarEl.style.setProperty('--f', -1); await W(500);
      const sv = mk({ hat: 'none', beard: 'none', coat: '#e8e8e8', extra: 'apron', skin: 1, hair: '#222' }, -60, { lane: BACK + 14, w: 66 }); hold(sv, 'cup'); await move(sv, 205, 1700, 1); unhold(sv); bubble(tsarEl, 'À votre santé !', 1600); act(tsarEl, 'raise', 1000); act(player, 'raise', 1000); SFX.coin(); await W(1300); ap();
      await move(sv, -70, 1400, -1); sv.remove();
      tsarEl.classList.remove('sit'); player.classList.remove('sit'); tsarEl.style.bottom = Y(FRONT) + '%'; player.style.bottom = Y(FRONT) + '%'; await W(350);
      await travel([{ e: tsarEl, x: 330 }, { e: player, x: 250 }], 'throne'); player.style.setProperty('--f', -1); toThrone(); tsarEl.style.setProperty('--f', -1);
      const page = mk({ hat: 'cap', cap: '#7a1620', coat: '#7a1620', extra: 'none', beard: 'none', skin: 0 }, -60, { lane: BACK, w: 56 }); hold(page, 'invite'); await dropOnTable(page, 'invite');
    },
  };
  const ACTS = { vodka: ['leave', 'vodka'], babouchka: ['leave', 'scarf'], catcard: ['leave', 'catend'], dj: ['leave', 'rave'], broker: ['leave', 'capi'], cook: ['leave', 'cook'], guard: ['leave', 'pay'], priest: ['leave', 'bless'], general: ['leave', 'general'], tamer: ['leave', 'tamer'], tsar: ['turn', 'dine'], spy: ['denounce', 'pay'], peasant: ['leave', 'feed'], banker: ['leave', 'gain'], student: ['flee', 'join'], lady: ['leave', 'chat'], accountant: ['leave', 'gain'] };
  async function choose(i) {
    if (busy) return; busy = true; SFX.blip();
    const c = card, side = i ? c.R : c.L;
    $('ts-panel').classList.add('hide'); preview(null);
    const ap = () => { S.g = S.g.map((v, k) => clamp(v + side[1][k])); if (side[2]) S.flags[side[2]] = true; decor(); };
    if (c.final) {
      if (!i) { ap(); S.nextFinal = S.day + 2; S.day++; await EXIT(vis, 1); if (S.day > S.max) return playEnd('late'); return next(); }
      return playEnd(Math.random() * 100 < chance() ? c.final : 'x_' + c.final);
    }
    const kind = (ACTS[c.id] || ['leave', 'leave'])[i]; S.seen.push(c.id); S.last = c.id; S.day++;
    const v = vis;
    await (ACT[kind] || ACT.leave)(v, c, ap, i);
    if (stopped || S.dead) return;
    if (S.day > S.max) return playEnd('late');
    if (S.g[0] >= 80 && S.g[3] <= 30) return playEnd('strike');                       // le peuple descend dans la salle : grève générale
    S.g[1] = Math.min(S.g[1], 94); if (S.g[1] >= 94 && S.g[0] <= 25) return playEnd('d1');   // trop discret, seul au fond de la salle
    for (let k = 0; k < 4; k++) { if (S.g[k] <= 0) return playEnd(LOSE_KEY[k][0]); if (S.g[k] >= 100) return playEnd(LOSE_KEY[k][1]); }
    next();
  }

  // ----- fins : la scène se joue, puis le bilan -----
  async function playEnd(key, actor) {
    const e = END[key]; S.dead = true; S.end = key; $('ts-panel').classList.add('hide'); if (!actor) vis?.remove(); vis = null;
    if (loc !== 'throne' && key !== 'capi' && !['train', 'x_train'].includes(key)) { setLoc('throne'); toThrone(); }
    const standUp = () => { tsarEl.classList.remove('sit'); tsarEl.style.transition = 'bottom .3s'; tsarEl.style.bottom = Y(FRONT) + '%'; };
    const crown = async (from = tsarEl) => { await fly('star', from, player, 900, 28); await fly('coin', from, player, 700, 24); player.querySelector('.ts-crown').classList.add('on'); tsarEl.querySelector('.ts-crown').classList.remove('on'); await burst('spark', player, 10); };
    const dead = () => { tsarEl.querySelector('g[transform]').innerHTML = faceInner({ ...tsarO(''), dead: true }); tsarEl.classList.add('slump'); };
    const arrest = async () => {
      const g1 = mk({ hat: 'cap', cap: '#2a3a52', coat: '#2a3a52', beard: 'mustache', brow: 'angry' }, -60, { w: 84 }), g2 = mk({ hat: 'cap', cap: '#2a3a52', coat: '#2a3a52', beard: 'full', brow: 'angry' }, -150, { w: 84 });
      move(g2, 180, 1800, 1); await move(g1, 205, 1700, 1); bubble(player, 'Non !', 1200); act(player, 'raise', 1200); bubble(g1, 'Au nom du tsar.', 1300); await W(1400); await Promise.all([move(g1, -80, 1700, -1), move(g2, -80, 1700, -1), move(player, -20, 1700, -1)]); g1.remove(); g2.remove();
    };
    // le cuisinier prend la fiole sur la table et la verse dans le samovar du tsar
    const poison = async () => {
      const cook = mk({ hat: 'toque', beard: 'mustache', extra: 'apron', coat: '#8a8a8a', skin: 1 }, -50, { w: 70, lane: BACK }); move(player, 70, 1000, 1);
      await move(cook, 262, 1900, 1); showProp('vial', false); hold(cook, 'vial'); SFX.blip(); await W(500); await move(cook, 300, 600, 1); act(cook, 'raise', 900); await W(300); unhold(cook); await burst('green', $('ts-table'), 6, 24); SFX.poison(); $('ts-table').classList.add('green'); await W(900);
      return cook;
    };
    if (key === 'samovar') {
      const cook = await poison(); await move(cook, -60, 1700, -1); cook.remove(); hold(tsarEl, 'cup'); act(tsarEl, 'raise', 1200); bubble(tsarEl, 'Excellent thé.', 1400); await W(1600); dead(); unhold(tsarEl); shake(); await flash(); await crown();
    } else if (key === 'x_samovar') {
      await poison(); const t = mk({ hat: 'none', coat: '#555', beard: 'full', hair: '#444' }, -50, { w: 80 }); hold(t, 'cup'); await move(t, 232, 1400, 1); unhold(t); await W(600); t.classList.add('slump'); shake(); bubble(tsarEl, '...', 1300); await W(1400); await arrest();
    } else if (key === 'train' || key === 'x_train') {
      const gen = mk({ hat: 'cap', cap: '#2a3a52', beard: 'pointy', extra: 'sash', coat: '#2a3a52', brow: 'angry' }, -60, { w: 86 });
      tsarEl.classList.add('away'); await travel([{ e: gen, x: 120 }, { e: player, x: 250 }], 'station'); player.style.setProperty('--f', -1);
      const tr = $('ts-stntrain'), face = $('ts-carface'); face.innerHTML = `<svg viewBox="0 0 200 210">${faceInner({ ...tsarO(''), hat: 'crown' })}</svg>`; tr.classList.add('run'); SFX.whistle(); await W(1800);
      if (key === 'train') { tr.classList.add('fall'); await W(800); shake(); await burst('boom', { x: scene.clientWidth * .52, y: scene.clientHeight * .6 }, 6, 36); await flash(); await burst('smoke', { x: scene.clientWidth * .52, y: scene.clientHeight * .6 }, 7, 34); await crown({ x: scene.clientWidth * .52, y: scene.clientHeight * .65 }); }
      else { $('ts-cow').classList.add('on'); await W(400); tr.classList.add('stall'); SFX.growl(); await burst('smoke', { x: scene.clientWidth * .5, y: scene.clientHeight * .62 }, 6, 30); await W(1100); bubble(gen, 'Une vache...', 1500); bubble(player, 'Non.', 1500); await W(1600); await move(player, 470, 2000, 1); }
    } else if (key === 'bear' || key === 'x_bear') {
      let bear = actors.querySelector('[data-role=bear]'); if (!bear) { bear = mk('bear', 78, { w: 112 }); bear.dataset.role = 'bear'; }
      bear.classList.remove('sleep'); await move(bear, 292, 2200, 1); SFX.growl();
      if (key === 'bear') { bubble(tsarEl, '!', 900); standUp(); await W(500); shake(); await burst('paw', bear, 6, 24); dead(); await W(300); await crown(); }
      else { standUp(); await W(300); await burst('heart', bear, 6); bubble(tsarEl, 'Bon toutou.', 1300); bubble(player, '...', 1300); act(tsarEl, 'hop', 600); await W(1500); }
    } else if (key === 'late') {
      bubble(tsarEl, 'Zzz...', 1200); await W(1300); dead(); bubble(player, 'Hm.', 1200); await W(900);
      const u = mk({ hat: 'none', hair: '#222', coat: '#2a2a3a', beard: 'mustache', skin: 2 }, -60, { w: 86 }); await move(u, 150, 1500, 1); bubble(u, 'Pratique.', 1300); await fly('star', tsarEl, u, 1000, 30); await W(500);
    } else if (key === 'vodka') {
      $('ts-table').classList.add('on'); await move(player, 262, 900, -1); bubble(tsarEl, 'За здоровье !', 1400); bubble(player, 'Na zdorovie !', 1400); act(tsarEl, 'raise', 1000); act(player, 'raise', 1000); SFX.coin(); await W(1400);
      for (let i = 0; i < 3; i++) { SFX.blip(); await burst('spark', i % 2 ? tsarEl : player, 5, 20); await W(500); }
      bubble(tsarEl, '...', 1000); await W(900); tsarEl.classList.add('slump'); player.classList.add('slump'); shake();
      const cook = mk({ hat: 'toque', beard: 'mustache', extra: 'apron', coat: '#8a8a8a', skin: 1 }, -50, { w: 84 }); await move(cook, 342, 1700, 1); bubble(cook, 'À moi.', 1200); await W(900);
    } else if (key === 'babouchka') {
      const n = actor; if (n) { bubble(n, 'Il aura chaud.', 1400); await W(900); await move(n, 300, 1400, 1); }
      const sc = document.createElement('div'); sc.className = 'ts-scarf'; scene.append(sc); SFX.blip(); await W(1400); bubble(tsarEl, '!', 900); shake(); tsarEl.classList.add('slump'); await W(900); n?.remove(); await crown(); sc.remove();
    } else if (key === 'cat') {
      const k = actor || mk('cat', -50, { w: 64 }); standUp(); bubble(tsarEl, '?', 900); await W(700); tsarEl.classList.add('away'); k.style.transition = 'left 1.2s linear'; await move(k, 330, 1500, 1); k.style.transition = 'bottom .5s'; k.style.bottom = Y(240) + '%'; await W(600);
      const cr = document.createElement('div'); cr.className = 'ts-catcrown'; cr.innerHTML = CROWN; k.append(cr); await burst('star', k, 8, 22); bubble(k, 'Miaou.', 1800); await W(1800);
    } else if (key === 'strike') {
      const crowd = [[{ hat: 'toque', beard: 'mustache', extra: 'apron', coat: '#8a8a8a', skin: 1 }, -40], [{ hat: 'cap', cap: '#2a3a52', beard: 'pointy', extra: 'sash', coat: '#2a3a52', skin: 0 }, -110], [{ hat: 'mitre', beard: 'full', extra: 'cross', coat: '#4a2a5a', skin: 2, hair: '#cfc7b8' }, -180], [{ hat: 'ushanka', beard: 'full', coat: '#5a4636', skin: 3 }, -250]].map(([o, x]) => mk(o, x, { w: 80 }));
      const bear = mk('bear', -340, { w: 100 }); const sign = document.createElement('div'); sign.className = 'ts-banner'; sign.textContent = 'ПЛАН'; scene.append(sign);
      crowd.forEach((c, i) => { act(c, 'raise', 3000); move(c, 60 + i * 55, 2100 + i * 150, 1); }); await move(bear, 20, 2300, 1); sign.classList.add('on'); bubble(crowd[0], 'Grève !', 1600); bubble(crowd[2], 'Nous voulons du pain.', 1800); await W(1800);
      bubble(tsarEl, 'Je signe.', 1400); await W(1500); standUp(); await move(tsarEl, 470, 1700, 1); await crown({ x: scene.clientWidth * .9, y: scene.clientHeight * .5 }); sign.remove();
    } else if (key === 'rave') {
      scene.classList.add('rave'); const lights = document.createElement('div'); lights.className = 'ts-lights'; scene.append(lights);
      const spk = ['4%', '84%'].map(l => { const d = document.createElement('div'); d.className = 'ts-spk'; d.style.left = l; d.innerHTML = PROP.speaker; scene.append(d); return d; });
      const ball = document.createElement('div'); ball.className = 'ts-disco'; ball.innerHTML = PROP.disco; scene.append(ball);
      relook(player, { ...PLAYER_O, adidas: true, coat: NAVY, extra: 'none' }); relook(tsarEl, { ...tsarO(''), adidas: true, coat: NAVY, extra: 'none' }); tsarEl.querySelector('g[transform]')?.setAttribute('transform', 'translate(10 -8) scale(.5)');
      standUp(); player.classList.add('dance'); await move(tsarEl, 300, 900, -1); tsarEl.classList.add('dance');
      const crew = [[{ hat: 'mitre', beard: 'full', hair: '#cfc7b8', skin: 2 }, 60], [{ hat: 'toque', beard: 'mustache', skin: 1 }, 118], [{ hat: 'cap', cap: NAVY, beard: 'pointy', skin: 0 }, 176], [{ hat: 'ushanka', beard: 'full', skin: 3 }, 205], [{ hat: 'none', hair: '#222', beard: 'none', skin: 2 }, 350]];
      const dancers = crew.map(([o, x], i) => { const d = mk({ ...o, adidas: true, coat: NAVY }, x, { w: 80, lane: i % 2 ? BACK + 20 : FRONT }); d.classList.add('dance'); d.style.animationDelay = (i * .12) + 's'; return d; });
      const bear = mk('bear', 20, { w: 100 }); bear.classList.add('dance'); bear.insertAdjacentHTML('beforeend', '<i class="ts-shades"></i>');
      beat(); ['note', 'note', 'star', 'note', 'spark'].forEach((k, i) => setTimeout(() => burst(k, i % 2 ? player : tsarEl, 5, 22), i * 700)); bubble(tsarEl, 'ХАРДБАС !', 2600); bubble(dancers[0], 'Cyka bass', 2400); await W(5200);
    } else if (key === 'capi') {
      SFX.cash(); await flash(); standUp(); tsarEl.classList.remove('thr'); setLoc('capi'); await W(300);
      relook(tsarEl, { hat: 'tophat', coat: '#1a1a2a', extra: 'tie', beard: 'none', skin: 0 }); tsarEl.querySelector('g[transform]')?.setAttribute('transform', 'translate(10 -8) scale(.5)');
      relook(player, { hat: 'cap', cap: '#da291c', coat: '#da291c', extra: 'apron', beard: 'none', skin: 0, hair: '#5a3a2a' });
      const crew = [320, 360].map(x => mk({ hat: 'cap', cap: '#da291c', coat: '#da291c', extra: 'apron', beard: 'none', skin: 1 }, x, { w: 70, lane: BACK + 40 }));
      await move(tsarEl, 195, 1100, -1); tsarEl.classList.add('dance'); SFX.anthem(); bubble(tsarEl, 'Welcome !', 2600);
      for (let i = 0; i < 6; i++) setTimeout(() => burst('bill', i % 2 ? tsarEl : player, 6, 26), i * 800);
      crew.forEach(c => { act(c, 'raise', 1000); bubble(c, 'USA !', 2400); }); bubble(player, 'Frites ?', 2400); await W(1500); SFX.cheer(); await W(4200);
    } else if (['c0', 'c1', 'd0', 'a1'].includes(key)) { await arrest(); }
    else if (key === 'f0' || key === 'a0') { bubble(tsarEl, 'Dehors.', 1100); await W(900); await Promise.all([move(player, 470, 2100, 1), burst('snow', player, 5)]); }
    else if (key === 'd1') { bubble(player, '...', 1200); player.style.transition = 'opacity 1.8s'; player.style.opacity = .12; await W(1900); }
    else if (key === 'f1') { standUp(); await W(350); await move(tsarEl, 286, 1100, -1); await burst('heart', { x: centre(player).x, y: centre(player).y - 30 }, 6); await W(600); }
    if (stopped) return;
    const isNew = !found.includes(key); if (isNew) { found.push(key); save(); } opts.onEnd?.(key, isNew);
    const p = $('ts-panel'); p.className = 'ts-panel end ' + e.kind; p.style.transform = ''; setTimeout(() => SFX.stamp(), 380); if (e.kind === 'win') SFX.win(); else if (key === 'late') SFX.funeral(); else if (e.kind === 'lose') SFX.lose();
    p.innerHTML = `<div class="ts-stamp ${e.kind}">${e.stamp || (e.kind === 'win' ? 'ВЫ ЦАРЬ' : 'КОНЕЦ')}</div><h2>${esc(e.t)}</h2><p class="ts-say">${esc(e.txt)}</p>
      <div class="ts-count">Fin n° ${Object.keys(END).indexOf(key) + 1} · ${found.length} / ${TOTAL_ENDS} fins découvertes ${isNew ? '<b>nouveau !</b>' : ''}</div>
      <div class="ts-endbtns"><button id="ts-again">Rejouer</button><button class="plain" id="ts-quit">Quitter</button></div>`;
    $('ts-again').onclick = () => { stopMusic(); begin(); }; $('ts-quit').onclick = () => { stopped = true; stopMusic(); opts.onExit?.(); };
    $('ts-day').textContent = '';
  }

  // ----- un tour : le visiteur arrive, parle, attend ton choix -----
  async function next() {
    if (stopped) return; busy = true;
    const n = pickCard(), c = n.final ? finalCard(n.final) : n; card = c; $('ts-day').textContent = `Jour ${S.day} / ${S.max}`;
    if (c.id === 'tsar') { vis = null; bubble(tsarEl, '...', 1200); }
    else { const v = vis = mk(c.who, -60, { w: 86, flip: 1 }); await move(v, 150, 1500, 1); if (stopped || S.dead || vis !== v) { v.remove(); return; } bubble(v, '...', 1100); }
    if (S.dead) return; panel(c); busy = false;
  }
  const guards = () => { [304, 386].forEach(x => { const g = mk({ hat: 'cap', cap: '#2a3a52', coat: '#2a3a52', beard: 'mustache', brow: 'angry' }, x, { lane: BACK + 4, w: 44, flip: -1, cls: 'guard thr' }); g.insertAdjacentHTML('beforeend', '<i class="ts-spear"></i>'); }); };
  function briefing() {
    busy = true; $('ts-day').textContent = '';
    const p = $('ts-panel'); p.className = 'ts-panel brief'; p.style.transform = '';
    p.innerHTML = `<div class="ts-name">Ton objectif</div><h2>Prendre la place du tsar</h2><div class="ts-brief">${BRIEF.map(t => `<p>${esc(t)}</p>`).join('')}</div><button id="ts-go">Commencer le complot</button>`;
    $('ts-go').onclick = () => { ctx(); SFX.blip(); if (!S.dead) next(); };
  }
  function begin() {
    S = fresh(); setLoc('throne'); scene.classList.remove('rave', 'capi'); scene.querySelectorAll('.ts-lights,.ts-spk,.ts-disco').forEach(e => e.remove());
    [...actors.children].forEach(e => { if (e !== player && e !== tsarEl) e.remove(); }); player.classList.remove('dance', 'slump', 'sit', 'holding'); tsarEl.classList.remove('dance', 'away', 'holding'); tsarEl.classList.add('thr');
    relook(player, PLAYER_O); relook(tsarEl, tsarO('')); tsarEl.style.opacity = ''; player.style.opacity = ''; player.style.transition = 'none';
    player.style.left = X(250) + '%'; player.style.bottom = Y(FRONT) + '%'; player.style.setProperty('--f', -1); player.querySelector('.ts-crown').classList.remove('on');
    tsarEl.style.cssText = `left:${X(342)}%;bottom:${Y(232)}%;width:${74 / SW * 100}%;--f:-1;z-index:5`; tsarEl.classList.add('sit'); tsarEl.classList.remove('slump'); tsarEl.querySelector('.ts-crown').classList.add('on');
    $('ts-table').classList.remove('green'); ['vial', 'timetable', 'invite'].forEach(p => $('ts-table').querySelector('.' + p).classList.remove('on', 'pop'));
    $('ts-shelfvial').classList.remove('gone'); $('ts-stntrain').classList.remove('run', 'fall', 'stall', 'arrive'); $('ts-cow').classList.remove('on'); $('ts-bars').classList.remove('open');
    prevCo = prevEy = 0; prevMood = ''; decor(); guards(); briefing();
  }
  begin();
  return { music: () => music ? { src: music.src.split('/').pop(), playing: !music.paused } : null, stop() { stopped = true; stopMusic(); }, deal: id => { forced = id; }, state: () => S, found: () => found, finals: () => Object.keys(END), forceEnd: k => playEnd(k) };
}
