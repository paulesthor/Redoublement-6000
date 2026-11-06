// Démo : « Directeur du Camp » — jeu de gestion incrémental, satire de la bureaucratie soviétique (humour noir de pacotille, sans cruauté montrée).
const SAVE_KEY = 'wm_gulag_demo_v1', OFFLINE_MAX = 2 * 3600, GROWTH = 1.15;
const GRADES = ['Contremaître stagiaire', 'Chef de brigade', 'Directeur adjoint', 'Directeur du camp', 'Commissaire du peuple', 'Héros du Travail Socialiste'];

const WORKSHOPS = [
  { id: 'scierie', icon: 'tree', name: 'Scierie « Les Bouleaux Heureux »', desc: 'Les bouleaux ne sont pas consultés. Ils sont ravis quand même.', base: 15, inc: 0.6, mgr: ['Contremaître Ivan « Le Sourire »', 'Ne sourit jamais, mais le rendement, lui, si.', 300] },
  { id: 'mine', icon: 'cart', name: 'Mine « Éclat du Prolétariat »', desc: 'Le charbon est noir, l\'avenir est rouge, le plafond tient par la foi.', base: 130, inc: 4.2, mgr: ['Ingénieur Petrov, « expert »', 'Diplôme obtenu par correspondance, au même endroit.', 2600] },
  { id: 'kolkhoze', icon: 'beet', name: 'Kolkhoze de betteraves', desc: 'Rendement record sur le papier. Sur le terrain, c\'est de la neige.', base: 950, inc: 23, mgr: ['Présidente Galina', 'Compte les betteraves deux fois, les pensionnaires une.', 18000] },
  { id: 'couture', icon: 'hat', name: 'Atelier de chapkas officielles', desc: 'Les chapkas ne tiennent pas chaud, la propagande si.', base: 7000, inc: 135, mgr: ['Couturière Nadia', 'A cousu un jour sa propre convocation dans une doublure.', 130000] },
  { id: 'samovar', icon: 'urn', name: 'Usine de samovars', desc: 'Pour le thé du Politburo. Le vôtre est dans le rapport.', base: 52000, inc: 820, mgr: ['Chef d\'atelier Boris', 'Fait bouillir l\'eau et les nerfs avec la même passion.', 950000] },
  { id: 'rapports', icon: 'paper', name: 'Bureau des Rapports en triple exemplaire', desc: 'Il produit du papier qui produit du papier qui produit du plan.', base: 410000, inc: 5300, mgr: ['Secrétaire Olga', 'Tamponne même dans son sommeil, et ça compte pour le plan.', 7200000] },
];
const STAFF = [
  { id: 'poete', name: 'Le Poète', text: 'Écrit des odes au Parti que personne ne lit. +0,25 de faveur par seconde.', cost: 1800 },
  { id: 'prof', name: 'Le Professeur de chimie', text: 'Optimise tout, y compris les rations. Production +25 %.', cost: 26000 },
  { id: 'espion', name: 'Le Faux Espion', text: 'Espionne pour trois pays qui n\'existent pas. Le risque d\'inspection monte 40 % moins vite.', cost: 190000 },
  { id: 'comptable', name: 'La Comptable', text: 'Sait faire dire aux chiffres ce qu\'on veut. Les rapports falsifiés rapportent +30 %.', cost: 1600000 },
];
const EVENTS = [
  { t: 'Inspection du Politburo', x: 'Un inspecteur arrive demain. Il est annoncé depuis six mois, mais personne n\'a lu la lettre.', a: ['Repeindre tout en rouge', { r: -1, f: 4, k: -20 }, 'Les murs sont rouges, comme l\'avenir.'], b: ['Cacher les registres dans la neige', { f: -3, k: 15 }, 'La neige garde un secret. Jusqu\'au dégel.'] },
  { t: 'Tempête de neige', x: 'La production est à l\'arrêt. Le froid, lui, travaille à plein régime.', a: ['Déclarer un record de fraîcheur', { r: -1, f: 5 }, 'Le Politburo félicite votre froid.'], b: ['Travailler quand même', { r: 3, k: 10 }, 'On n\'a perdu que quelques doigts. Ils ne servaient pas au rapport.'] },
  { t: 'Un pensionnaire se dit cousin du ministre', x: 'Il a une lettre, un sourire, et probablement un cousin.', a: ['Le croire', { f: -6, k: -10 }, 'Il est parti en vacances. Le ministre n\'a jamais su qu\'il avait un cousin.'], b: ['L\'envoyer à la scierie', { r: 2, k: 5 }, 'Il scie avec conviction. La parenté s\'arrête là.'] },
  { t: 'Ordre contradictoire du ministère', x: '« Produisez plus avec moins de bois. » Signé, « Le Ministère du Bois (service des économies de bois). »', a: ['Appliquer les deux ordres', { r: -2, f: 6 }, 'Un modèle d\'efficacité : on produit du plan, plus de bois.'], b: ['Perdre le courrier', { f: -2, k: 10 }, 'Le courrier a été perdu. Il est retrouvé dans trois ans.'] },
  { t: 'Pénurie de crayons', x: 'Impossible de signer les rapports. Le plan est suspendu à un morceau de graphite.', a: ['Signer à la craie', { r: -0.5, k: 5 }, 'La craie est solide, la signature moins.'], b: ['Demander au Politburo (délai : 3 ans)', { r: -1, f: 2 }, 'Votre demande a été enregistrée dans l\'armoire des demandes.'] },
  { t: 'Visite du Commissaire avec photographe', x: 'On veut du camp heureux sur la photo. Le camp n\'est pas habitué.', a: ['Dresser un banquet en carton', { r: -3, f: 10 }, 'Le carton a eu un grand succès. On en a mangé l\'ensemble.'], b: ['Montrer la réalité', { f: -15, k: 25 }, 'Vous êtes bien honnête. C\'est dommage pour votre carrière.'] },
  { t: 'La comptable trouve une erreur de 40 000 roubles', x: 'Elle ne dit pas qui l\'a faite. Elle regarde le plafond. Le plafond regarde ailleurs.', a: ['L\'effacer', { r: 2, k: 15 }, 'L\'erreur n\'a jamais existé. Elle est juste très discrète.'], b: ['La classer en « dépense de moral »', { r: -2, f: 3 }, 'Le moral est soutenu. Personne ne sait lequel.'] },
  { t: 'Le poète écrit une ode à l\'inspecteur', x: 'Quatre-vingts strophes, aucune rime. Le Parti trouve ça très moderne.', a: ['La publier', { r: -1, f: 6 }, 'L\'inspecteur est ému. Le poète aussi : on l\'a augmenté d\'un manteau.'], b: ['La confisquer pour manque de rimes', { f: -2, k: -5 }, 'Le poète a retrouvé son goût du silence.'] },
  { t: 'Colis du Parti : 400 kg de médailles, 0 kg de pain', x: 'On ne mange pas les médailles, mais on peut les compter.', a: ['Distribuer les médailles', { r: -1, f: 8 }, 'Le camp est décoré. Il a toujours faim, mais avec panache.'], b: ['Les fondre et les vendre', { r: 5, k: 20 }, 'L\'or est ravi de servir une meilleure cause. Le Parti, un peu moins.'] },
  { t: 'Un loup demande un emploi', x: 'Il s\'est présenté au poste de garde avec un CV. Le CV est un lapin.', a: ['L\'embaucher', { r: 2, k: 5 }, 'Il est excellent. Personne n\'ose le contredire.'], b: ['Le promouvoir directement', { r: 4, f: -3 }, 'Il est désormais chef de service. Il est toujours un loup, mais avec un bureau.'] },
  { t: 'Grève du chauffage', x: 'Le froid refuse de se mettre au travail, il a un syndicat.', a: ['Réquisitionner le froid', { r: 1, f: 2 }, 'Le froid s\'exécute, la tête haute et les pieds gelés.'], b: ['Brûler les archives', { r: 3, k: -15, f: -5 }, 'Il fait enfin chaud. Les archives aussi, avant de partir.'] },
  { t: 'Le Politburo demande un rapport sur le rapport', x: 'Délai : hier. Le rapport est urgent, il est en retard de trente ans.', a: ['Écrire le rapport du rapport', { r: -1, f: 7 }, 'Le rapport du rapport est un chef-d\'œuvre. Il n\'a pas de lecteur.'], b: ['Écrire le rapport du rapport du rapport', { r: -3, f: 15 }, 'Le Politburo est conquis. Il demande déjà la suite.'] },
];
const HEADLINES = ['PRAVDA : la production de bonheur dépasse les objectifs de 140 %.', 'Le froid est une ressource renouvelable, rappelle le ministère.', 'Les bouleaux de la région confirment, à l\'unanimité, être heureux.', 'Aucune évasion signalée : la Sibérie est jugée trop spacieuse.', 'Le Parti rappelle que le pain n\'est pas obligatoire, mais le plan si.', 'Découverte : le plan quinquennal peut être rempli en quatre ans et onze mois, dans l\'esprit.', 'Le directeur du camp voisin a été promu. On ne sait pas où.', 'Météo : −31 °C, ressentis −31 °C. Le ministère de la Météo n\'a pas de commentaire.', 'Le Politburo félicite chaleureusement ses propres félicitations.', 'Pénurie de papier : on écrit désormais les rapports sur les rapports.', 'Une délégation étrangère visite le camp et le trouve « très organisé ». Elle n\'est jamais repartie.', 'Tout va bien, camarade. La neige est de la poudre de bonheur.'];

const ICONS = {
  tree: '<path d="M12 2 5 12h4l-3 6h12l-3-6h4z"/><rect x="11" y="18" width="2" height="4"/>', cart: '<path d="M3 8h14l-2 8H5z"/><circle cx="7" cy="19" r="2"/><circle cx="15" cy="19" r="2"/><path d="M17 8l4-4"/>',
  beet: '<circle cx="12" cy="15" r="6"/><path d="M12 9c-1-4-4-5-6-5 1 3 3 5 6 5zm0 0c1-4 4-5 6-5-1 3-3 5-6 5z"/>', hat: '<path d="M4 15c0-6 3-10 8-10s8 4 8 10z"/><rect x="3" y="15" width="18" height="4" rx="1.5"/>',
  urn: '<path d="M8 4h8l-1 3H9z"/><path d="M7 7h10l1 11c0 2-2 3-6 3s-6-1-6-3z"/><path d="M18 10l3-1"/>', paper: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 14h7M9 17h5"/>',
};
const icon = n => `<svg class="gl-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${ICONS[n]}</svg>`;
const fmt = n => { n = Math.floor(n); if (n < 10000) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); const u = ['', ' k', ' M', ' Md', ' Bn']; let i = 0, v = n; while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; } return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace('.', ',') + u[i]; };
const fx = n => n < 10 ? n.toFixed(1).replace('.', ',') : fmt(n);
const pick = a => a[(Math.random() * a.length) | 0];

export function startGulag(host, opts = {}) {
  const fresh = () => ({ r: 0, produced: 0, plan: 0, planProd: 0, own: Object.fromEntries(WORKSHOPS.map(w => [w.id, 0])), mgr: {}, staff: {}, favor: 55, risk: 10, cd: 0, nextEv: 50, t: Date.now(), history: [] });
  let S; try { S = { ...fresh(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { S = fresh(); }
  S.own = { ...fresh().own, ...S.own };
  const planTarget = n => 25000 * Math.pow(7, n);
  const permMult = () => 1 + 0.25 * S.plan;
  const mult = () => permMult() * (S.staff.prof ? 1.25 : 1);
  const wIncome = w => w.inc * S.own[w.id] * (S.mgr[w.id] ? 2 : 1);
  const income = () => WORKSHOPS.reduce((t, w) => t + wIncome(w), 0) * mult();
  const cost = w => Math.ceil(w.base * Math.pow(GROWTH, S.own[w.id]));
  const saveNow = () => { try { S.t = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* stockage indisponible */ } };

  host.innerHTML = `<div class="gl"><header class="gl-top"><div class="gl-head"><button class="gl-exit" id="gl-exit">Quitter</button><div class="gl-title"><small>Camp n° 7</small><b>Directeur du Camp</b></div><div class="gl-grade" id="gl-grade"></div></div>
    <div class="gl-money"><span id="gl-r">0</span><small>wikiroubles</small><em id="gl-ps">+0 / s</em></div>
    <div class="gl-bars"><div><label>Plan quinquennal <b id="gl-plan"></b></label><div class="gl-bar"><i id="gl-planbar"></i></div></div><div><label>Faveur du Politburo</label><div class="gl-bar fav"><i id="gl-fav"></i></div></div><div><label>Risque d'inspection</label><div class="gl-bar risk"><i id="gl-risk"></i></div></div></div>
    <div class="gl-actions"><button id="gl-fake">Falsifier le rapport</button><button id="gl-bribe" class="alt">Pot-de-vin</button></div></header>
    <nav class="gl-tabs" id="gl-tabs"><button data-k="w" class="on">Ateliers</button><button data-k="s">Pensionnaires</button><button data-k="d">Décrets</button></nav>
    <main class="gl-body" id="gl-body"></main><footer class="gl-ticker"><span id="gl-news"></span></footer><div class="gl-modal" id="gl-modal"></div></div>`;
  const $ = id => host.querySelector('#' + id);
  let tab = 'w', stopped = false, eventOpen = false, newsI = 0;
  const log = (txt) => { S.history.unshift(txt); S.history = S.history.slice(0, 18); if (tab === 'd') renderBody(); };

  function renderBody() {
    const b = $('gl-body');
    if (tab === 'w') b.innerHTML = WORKSHOPS.map(w => { const c = cost(w), inc = wIncome(w) * mult(), n = S.own[w.id], m = S.mgr[w.id];
      return `<section class="gl-card" data-w="${w.id}"><div class="gl-ico">${icon(w.icon)}</div><div class="gl-info"><h3>${w.name}</h3><p>${w.desc}</p><div class="gl-stats"><span>Niveau <b>${n}</b></span><span>${inc ? '+' + fx(inc) + ' / s' : 'à bâtir'}</span>${m ? '<span class="ok">cadre en poste</span>' : ''}</div>
        <div class="gl-btns"><button data-buy="${w.id}">${n ? 'Améliorer' : 'Bâtir'} · ${fmt(c)}</button>${!m && n ? `<button class="alt" data-mgr="${w.id}" title="${w.mgr[1]}">${w.mgr[0]} · ${fmt(w.mgr[2])}</button>` : ''}</div>${m ? `<p class="gl-mgr">${w.mgr[0]} : ${w.mgr[1]}</p>` : ''}</div></section>`; }).join('');
    else if (tab === 's') b.innerHTML = STAFF.map(p => `<section class="gl-card"><div class="gl-info"><h3>${p.name}</h3><p>${p.text}</p><div class="gl-btns">${S.staff[p.id] ? '<span class="ok">en poste (et il le sait)</span>' : `<button data-staff="${p.id}">Recruter · ${fmt(p.cost)}</button>`}</div></div></section>`).join('');
    else b.innerHTML = `<section class="gl-card"><div class="gl-info"><h3>Journal du camp</h3>${S.history.length ? S.history.map(h => `<p class="gl-log">${h}</p>`).join('') : '<p>Rien à signaler. Ce qui est, évidemment, très suspect.</p>'}</div></section><section class="gl-card"><div class="gl-info"><h3>Règles du Politburo</h3><p>Remplis le plan quinquennal avant que la faveur tombe à zéro. Ne laisse pas le risque d'inspection atteindre 100 %. Les rapports falsifiés aident beaucoup, jusqu'à ce qu'ils n'aident plus.</p></div></section>`;
    refresh();
  }
  function refresh() {
    const inc = income();
    $('gl-r').textContent = fmt(S.r); $('gl-ps').textContent = '+' + fx(inc) + ' / s'; $('gl-grade').textContent = GRADES[Math.min(GRADES.length - 1, S.plan)];
    const tgt = planTarget(S.plan), p = Math.min(1, S.planProd / tgt); $('gl-plan').textContent = `n° ${S.plan + 1} — ${Math.floor(p * 100)} %`; $('gl-planbar').style.width = p * 100 + '%';
    $('gl-fav').style.width = Math.max(0, Math.min(100, S.favor)) + '%'; $('gl-risk').style.width = Math.max(0, Math.min(100, S.risk)) + '%';
    $('gl-fake').disabled = S.cd > 0 || eventOpen; $('gl-fake').textContent = S.cd > 0 ? `Falsifier le rapport (${Math.ceil(S.cd)} s)` : 'Falsifier le rapport';
    const bribe = Math.ceil(inc * 90 + 150); $('gl-bribe').textContent = `Pot-de-vin · ${fmt(bribe)}`; $('gl-bribe').disabled = S.r < bribe || S.risk < 5 || eventOpen;
    host.querySelectorAll('[data-buy]').forEach(bt => { bt.disabled = S.r < cost(WORKSHOPS.find(w => w.id === bt.dataset.buy)); });
    host.querySelectorAll('[data-mgr]').forEach(bt => { bt.disabled = S.r < WORKSHOPS.find(w => w.id === bt.dataset.mgr).mgr[2]; });
    host.querySelectorAll('[data-staff]').forEach(bt => { bt.disabled = S.r < STAFF.find(x => x.id === bt.dataset.staff).cost; });
  }
  const gain = v => { S.r += v; if (v > 0) { S.produced += v; S.planProd += v; } };
  function toast(msg, kind = '') { const m = $('gl-modal'); m.innerHTML = `<div class="gl-note ${kind}">${msg}</div>`; m.classList.add('show', 'note'); setTimeout(() => { if (!eventOpen) { m.classList.remove('show', 'note'); m.innerHTML = ''; } }, 2600); }

  function popup(html, onClose) { const m = $('gl-modal'); eventOpen = true; m.classList.remove('note'); m.classList.add('show'); m.innerHTML = html; refresh(); m.querySelector('[data-close]')?.addEventListener('click', () => { m.classList.remove('show'); m.innerHTML = ''; eventOpen = false; onClose?.(); refresh(); }); return m; }
  function applyEffect(e) { const inc = income(); if (e.r) gain(Math.max(-S.r, e.r * 60 * inc)); S.favor = Math.max(0, Math.min(100, S.favor + (e.f || 0))); S.risk = Math.max(0, Math.min(100, S.risk + (e.k || 0) * (e.k > 0 && S.staff.espion ? 0.6 : 1))); }
  function showEvent() {
    const ev = pick(EVENTS), m = popup(`<div class="gl-event"><div class="gl-stamp">ORDRE DU JOUR</div><h2>${ev.t}</h2><p>${ev.x}</p><div class="gl-choices"><button data-c="a">${ev.a[0]}</button><button data-c="b" class="alt">${ev.b[0]}</button></div></div>`);
    m.querySelectorAll('[data-c]').forEach(bt => bt.addEventListener('click', () => {
      const o = ev[bt.dataset.c]; applyEffect(o[1]); log(`${ev.t} : ${o[0].toLowerCase()}.`);
      m.innerHTML = `<div class="gl-event"><div class="gl-stamp ok">APPROUVÉ</div><h2>${o[0]}</h2><p>${o[2]}</p><button data-close>Au suivant, camarade</button></div>`;
      m.querySelector('[data-close]').onclick = () => { m.classList.remove('show'); m.innerHTML = ''; eventOpen = false; refresh(); };
    }));
  }
  function inspection() {
    const loss = S.r * 0.5; S.r -= loss; S.risk = 30; S.favor = Math.max(0, S.favor - 15); log('Inspection surprise : la moitié du trésor a été « mise à l\'abri ».');
    popup(`<div class="gl-event"><div class="gl-stamp bad">INSPECTION</div><h2>Surprise !</h2><p>Les inspecteurs ont trouvé ce que vous cachiez, et aussi ce que vous ne cachiez pas. Ils ont « mis à l'abri » ${fmt(loss)} wikiroubles. Pour votre sécurité, bien sûr.</p><button data-close>Merci pour la vigilance</button></div>`);
  }
  function dismissed() {
    const s0 = S.plan; S = { ...fresh(), plan: s0 }; saveNow(); renderBody();
    popup(`<div class="gl-event"><div class="gl-stamp bad">RELEVÉ DE VOS FONCTIONS</div><h2>Le Politburo vous remercie</h2><p>La faveur est tombée à zéro. Vous êtes promu au camp n° 8, section « anciens directeurs », où vous êtes accueilli avec les honneurs, un manteau et une pelle. Le camp n° 7 a déjà un nouveau directeur : c'est vous, mais avec un meilleur sourire.</p><button data-close>Reprendre le poste (de zéro)</button></div>`);
  }
  function planDone() {
    const m = popup(`<div class="gl-event"><div class="gl-stamp ok">PLAN ACCOMPLI</div><h2>Plan quinquennal n° ${S.plan + 1} rempli</h2><p>Terminé en quatre ans et onze mois, à ce que dit le rapport. On vous décore et on vous remet à zéro : le Parti adore les nouveaux départs, surtout avec les mêmes chiffres. Bonus permanent : production +25 %. Nouveau grade : <b>${GRADES[Math.min(GRADES.length - 1, S.plan + 1)]}</b>.</p><button data-close>Au prochain plan !</button></div>`);
    m.querySelector('[data-close]').addEventListener('click', () => { const p = S.plan + 1, staff = S.staff, hist = S.history; S = { ...fresh(), plan: p, staff, history: hist }; log(`Plan n° ${p} accompli. Médaille reçue, et aussitôt reprise pour inventaire.`); saveNow(); renderBody(); });
  }

  // ---------- actions ----------
  host.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || eventOpen) return;
    if (t.id === 'gl-exit') return opts.onExit?.();
    if (t.dataset.k) { tab = t.dataset.k; host.querySelectorAll('#gl-tabs button').forEach(b => b.classList.toggle('on', b === t)); return renderBody(); }
    if (t.dataset.buy) { const w = WORKSHOPS.find(x => x.id === t.dataset.buy), c = cost(w); if (S.r >= c) { S.r -= c; S.own[w.id]++; renderBody(); } return; }
    if (t.dataset.mgr) { const w = WORKSHOPS.find(x => x.id === t.dataset.mgr); if (S.r >= w.mgr[2]) { S.r -= w.mgr[2]; S.mgr[w.id] = 1; log(`${w.mgr[0]} embauché. Il a signé sans lire, comme tout le monde.`); renderBody(); } return; }
    if (t.dataset.staff) { const p = STAFF.find(x => x.id === t.dataset.staff); if (S.r >= p.cost) { S.r -= p.cost; S.staff[p.id] = 1; log(`${p.name} rejoint l'équipe. Il n'a pas été consulté.`); renderBody(); } return; }
    if (t.id === 'gl-fake' && S.cd <= 0) { const g = income() * 180 * (S.staff.comptable ? 1.3 : 1) + 20; gain(g); S.risk = Math.min(100, S.risk + 22 * (S.staff.espion ? 0.6 : 1)); S.favor = Math.min(100, S.favor + 6); S.cd = 40; toast(`Rapport falsifié : +${fmt(g)} ₽ sur le papier. Le papier est très satisfait.`, 'ok'); log('Rapport falsifié. Le papier a tout accepté.'); refresh(); return; }
    if (t.id === 'gl-bribe') { const b = Math.ceil(income() * 90 + 150); if (S.r >= b) { S.r -= b; S.risk = Math.max(0, S.risk - 35); toast('Pot-de-vin versé. Il s\'appelle « frais de représentation ».', 'ok'); log('Frais de représentation versés à un inspecteur sans nom.'); refresh(); } return; }
  });

  // ---------- boucle ----------
  const away = Math.min(OFFLINE_MAX, (Date.now() - (S.t || Date.now())) / 1000);
  renderBody();
  if (away > 60 && income() > 0) { const g = income() * away * 0.5; gain(g); setTimeout(() => toast(`Pendant votre absence (${Math.round(away / 60)} min), le plan a avancé tout seul : +${fmt(g)} ₽. Personne ne sait comment.`, 'ok'), 500); }
  let last = performance.now(), acc = 0, saveAcc = 0;
  const timer = setInterval(() => {
    if (stopped) return; const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
    if (!eventOpen) {
      gain(income() * dt); S.cd = Math.max(0, S.cd - dt);
      S.favor = Math.max(0, Math.min(100, S.favor - 0.035 * dt + (S.staff.poete ? 0.25 * dt : 0) + 0.0001 * dt * income() ** 0.5));
      S.risk = Math.max(0, Math.min(100, S.risk + (0.05 * (S.staff.espion ? 0.6 : 1) - 0.12) * dt + 0.015 * dt));
      S.nextEv -= dt;
      if (S.planProd >= planTarget(S.plan)) planDone();
      else if (S.favor <= 0) dismissed();
      else if (S.risk >= 100) inspection();
      else if (S.nextEv <= 0) { S.nextEv = 45 + Math.random() * 35; showEvent(); }
    }
    acc += dt; saveAcc += dt; if (acc >= 0.2) { acc = 0; refresh(); }
    newsI += dt; if (newsI > 9) { newsI = 0; $('gl-news').textContent = pick(HEADLINES); $('gl-news').classList.remove('in'); void $('gl-news').offsetWidth; $('gl-news').classList.add('in'); }
    if (saveAcc > 5) { saveAcc = 0; saveNow(); }
  }, 100);
  $('gl-news').textContent = pick(HEADLINES); $('gl-news').classList.add('in');
  const onHide = () => saveNow(); document.addEventListener('visibilitychange', onHide);
  return {
    stop() { stopped = true; clearInterval(timer); saveNow(); document.removeEventListener('visibilitychange', onHide); host.innerHTML = ''; },
    state: () => S, _debug: { gain: v => { gain(v); refresh(); }, event: showEvent, inspection, planDone, dismissed, set: o => { Object.assign(S, o); refresh(); }, income },
  };
}
