// « Le Dernier Tsar » : démo d'un jeu de cartes à glisser (style Reigns). Tu joues un courtisan qui veut prendre la place du tsar.
// Tout est local : texte, SVG et animations CSS. Aperçu réservé à l'administrateur.
const ENDS_KEY = 'wm_tsar_ends';
const TOTAL_ENDS = 20;
const clamp = v => Math.max(0, Math.min(100, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- générateur de personnages : visage, barbe, coiffe, vêtement, accessoire ----------
const SKIN = ['#f0c9a0', '#e3b184', '#f6d7b8', '#d99f73'];
function face(o) {
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
  return `<svg viewBox="0 0 200 210" class="ts-face" aria-hidden="true"><path d="M30 210c4-34 34-50 70-50s66 16 70 50z" fill="${coat}"/><path d="M84 160l16 16 16-16" fill="none" stroke="${trim}" stroke-width="5"/>${extra}
    <rect x="88" y="132" width="24" height="30" fill="${skin}"/><ellipse cx="100" cy="108" rx="40" ry="46" fill="${skin}"/>${eyes}${o.dead ? '' : '<path d="M92 130c5 3 11 3 16 0" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>'}${beard}${hat}<circle cx="100" cy="116" r="4" fill="#00000014"/></svg>`;
}

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

export function startTsar(host, opts = {}) {
  let found = []; try { found = JSON.parse(localStorage.getItem(ENDS_KEY) || '[]'); } catch {}
  let S, card = null, stopped = false, busy = false;
  const fresh = () => ({ g: [50, 50, 50, 50], day: 1, flags: {}, seen: [], last: null });
  const save = () => { try { localStorage.setItem(ENDS_KEY, JSON.stringify(found)); } catch {} };
  host.innerHTML = `<div class="ts-root" id="ts-root"><div class="ts-top"><button class="ts-x" id="ts-x" aria-label="Quitter">✕</button><div class="ts-gauges" id="ts-gauges"></div><div class="ts-day" id="ts-day"></div></div>
    <div class="ts-stage" id="ts-stage"></div></div>`;
  const $ = id => host.querySelector('#' + id);
  $('ts-x').onclick = () => { stopped = true; opts.onExit?.(); };

  const drawGauges = (preview) => {
    $('ts-gauges').innerHTML = GAUGES.map(([n, ic], i) => {
      const v = S.g[i], pv = preview ? preview[i] : 0;
      return `<div class="ts-g ${v <= 15 || v >= 85 ? 'warn' : ''}" title="${n}"><div class="ts-gfill"><i style="height:${v}%"></i></div><span>${ic}</span><b class="ts-dot" style="--s:${Math.min(14, 5 + Math.abs(pv) * 0.35)}px;opacity:${pv ? 1 : 0}"></b></div>`;
    }).join('');
  };
  const pickCard = () => {
    const f = S.flags, ready = [];
    if (f.poison && f.access) ready.push('samovar'); if (f.train && f.guard) ready.push('train'); if (f.bear && f.access) ready.push('bear');
    if (ready.length && S.day > 4 && Math.random() < 0.75) return { final: ready[Math.floor(Math.random() * ready.length)] };
    let pool = C.filter(c => !S.seen.includes(c.id));
    if (!pool.length) { S.seen = []; pool = C.filter(c => c.id !== S.last); }
    return pool[Math.floor(Math.random() * pool.length)];
  };
  const finalCard = k => ({
    id: 'final_' + k, who: k === 'bear' ? { hat: 'ushanka', beard: 'full', coat: '#5a4636', skin: 3 } : k === 'train' ? { hat: 'cap', cap: '#2a3a52', beard: 'pointy', extra: 'sash', coat: '#2a3a52', brow: 'angry' } : { hat: 'toque', beard: 'mustache', extra: 'apron', coat: '#8a8a8a', skin: 1 },
    name: { samovar: 'Ivan, cuisinier impérial', train: 'Général Orlov', bear: 'Piotr, dresseur d\'ours' }[k],
    text: { samovar: 'Le samovar du tsar est prêt. Il ne manque que votre signe de tête.', train: 'Le train impérial passe sur le pont ce soir. Les rails, eux, sont un peu fatigués.', bear: 'Le tsar visite le cirque ce soir. L\'ours a jeûné exprès.' }[k],
    L: ['Renoncer', [0, 8, 0, 4]], R: ['Donner le signal', [0, 0, 0, 0]], final: k });

  function showEnd(key) {
    const e = END[key], isNew = !found.includes(key); if (isNew) { found.push(key); save(); }
    opts.onEnd?.(key, isNew);
    $('ts-stage').innerHTML = `<div class="ts-end ${e.kind}"><div class="ts-endart"><div class="ts-endface">${face(e.who)}</div><div class="ts-endicon">${e.icon}</div></div>
      <div class="ts-stamp ${e.kind}">${e.kind === 'win' ? 'ВЫ ЦАРЬ' : 'КОНЕЦ'}</div><h2>${esc(e.t)}</h2><p>${esc(e.txt)}</p>
      <div class="ts-count">Fin n° ${Object.keys(END).indexOf(key) + 1} · ${found.length} / ${TOTAL_ENDS} fins découvertes ${isNew ? '<b>nouveau !</b>' : ''}</div>
      <div class="ts-endbtns"><button id="ts-again">Rejouer</button><button class="plain" id="ts-quit">Quitter</button></div></div>`;
    $('ts-again').onclick = () => begin(); $('ts-quit').onclick = () => { stopped = true; opts.onExit?.(); };
    $('ts-day').textContent = ''; drawGauges(null);
  }
  function renderCard(c) {
    card = c; busy = false;
    $('ts-day').textContent = `Jour ${S.day}`;
    $('ts-stage').innerHTML = `<p class="ts-say" id="ts-say">${esc(c.text)}</p>
      <div class="ts-cardwrap"><div class="ts-card" id="ts-card">${face(c.who)}</div><div class="ts-ch ts-chl" id="ts-chl">${esc(c.L[0])}</div><div class="ts-ch ts-chr" id="ts-chr">${esc(c.R[0])}</div></div>
      <div class="ts-name">${esc(c.name)}</div><div class="ts-hint">← glisse la carte →</div>`;
    bind(); drawGauges(null);
  }
  function bind() {
    const el = $('ts-card'), W = () => host.clientWidth; let x0 = 0, dx = 0, drag = false;
    const apply = () => {
      const r = dx / 14; el.style.transform = `translateX(${dx}px) rotate(${r}deg)`;
      const side = dx < 0 ? card.L : card.R, k = Math.min(1, Math.abs(dx) / 90);
      $('ts-chl').style.opacity = dx < 0 ? k : 0; $('ts-chr').style.opacity = dx > 0 ? k : 0;
      el.style.setProperty('--tint', dx < 0 ? '#2a4a6a' : '#6a2a2a'); el.style.setProperty('--tk', k * 0.5);
      drawGauges(k > 0.4 ? side[1] : null);
    };
    el.onpointerdown = e => { if (busy) return; drag = true; x0 = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.classList.add('drag'); };
    el.onpointermove = e => { if (!drag) return; dx = e.clientX - x0; apply(); };
    const up = () => {
      if (!drag) return; drag = false; el.classList.remove('drag');
      if (Math.abs(dx) > 90) return choose(dx < 0 ? 0 : 1);
      dx = 0; el.style.transform = ''; $('ts-chl').style.opacity = 0; $('ts-chr').style.opacity = 0; el.style.setProperty('--tk', 0); drawGauges(null);
    };
    el.onpointerup = up; el.onpointercancel = up;
  }
  function choose(i) {
    if (busy) return; busy = true;
    const c = card, side = i === 0 ? c.L : c.R, el = $('ts-card');
    el.classList.remove('drag'); el.style.transition = 'transform .35s ease-in, opacity .35s'; el.style.transform = `translateX(${i === 0 ? -140 : 140}vw) rotate(${i === 0 ? -30 : 30}deg)`; el.style.opacity = 0;
    if (c.final && i === 1) return setTimeout(() => !stopped && showEnd(c.final), 380);
    const fx = side[1]; S.g = S.g.map((v, k) => clamp(v + fx[k])); if (side[2]) S.flags[side[2]] = true;
    if (!c.final) { S.seen.push(c.id); S.last = c.id; } S.day++;
    setTimeout(() => {
      if (stopped) return;
      for (let k = 0; k < 4; k++) { if (S.g[k] <= 0) return showEnd(LOSE_KEY[k][0]); if (S.g[k] >= 100) return showEnd(LOSE_KEY[k][1]); }
      const n = pickCard(); renderCard(n.final ? finalCard(n.final) : n);
    }, 360);
    drawGauges(null);
  }
  function begin() { S = fresh(); drawGauges(null); renderCard(pickCard()); }
  begin();
  return { stop() { stopped = true; }, state: () => S, found: () => found, finals: () => Object.keys(END), forceEnd: k => showEnd(k) };
}
