// Démo : « Directeur du Camp » — jeu de gestion incrémental, satire de la bureaucratie soviétique (humour noir de pacotille, sans cruauté montrée).
/** Rythme : cibles de production de chaque plan, calibrées (simulation) pour qu'un joueur « médian » (7 min toutes les 50 min) finisse les 6 plans en ~3 jours. */
export const PLAN_TARGETS = [1.4e10, 2.4e12, 6.7e13, 1.7e16, 3.8e17, 1.1e20];
/** Délai réglementaire minimum de chaque plan (heures réelles) : même un joueur parfait ne peut pas finir l'édition en moins de 60 h. */
export const PLAN_MIN_H = [4, 8, 10, 12, 12, 14];
const SAVE_KEY = 'wm_gulag_demo_v2', OFFLINE_MAX = 2 * 3600, GROWTH = 1.15;
const GRADES = ['Contremaître stagiaire', 'Chef de brigade', 'Directeur adjoint', 'Directeur du camp', 'Commissaire du peuple', 'Héros du Travail Socialiste'];

const WORKSHOPS = [
  { id: 'scierie', icon: 'tree', name: 'Scierie « Les Bouleaux Heureux »', desc: 'Les bouleaux ne sont pas consultés. Ils sont ravis quand même.', base: 15, inc: 0.6, mgr: ['Contremaître Ivan « Le Sourire »', 'Ne sourit jamais, mais le rendement, lui, si.', 300] },
  { id: 'mine', icon: 'cart', name: 'Mine « Éclat du Prolétariat »', desc: 'Le charbon est noir, l\'avenir est rouge, le plafond tient par la foi.', base: 130, inc: 4.2, mgr: ['Ingénieur Petrov, « expert »', 'Diplôme obtenu par correspondance, au même endroit.', 2600] },
  { id: 'kolkhoze', icon: 'beet', name: 'Kolkhoze de betteraves', desc: 'Rendement record sur le papier. Sur le terrain, c\'est de la neige.', base: 950, inc: 23, mgr: ['Présidente Galina', 'Compte les betteraves deux fois, les pensionnaires une.', 18000] },
  { id: 'couture', icon: 'hat', name: 'Atelier de chapkas officielles', desc: 'Les chapkas ne tiennent pas chaud, la propagande si.', base: 7000, inc: 135, mgr: ['Couturière Nadia', 'A cousu un jour sa propre convocation dans une doublure.', 130000] },
  { id: 'samovar', icon: 'urn', name: 'Usine de samovars', desc: 'Pour le thé du Politburo. Le vôtre est dans le rapport.', base: 52000, inc: 820, mgr: ['Chef d\'atelier Boris', 'Fait bouillir l\'eau et les nerfs avec la même passion.', 950000] },
  { id: 'rapports', icon: 'paper', name: 'Bureau des Rapports en triple exemplaire', desc: 'Il produit du papier qui produit du papier qui produit du plan.', base: 410000, inc: 5300, mgr: ['Secrétaire Olga', 'Tamponne même dans son sommeil, et ça compte pour le plan.', 7200000] },
];
const UNLOCKS = [
  { plan: 1, id: 'orkol', icon: 'cart', name: 'Mine d\'or de Kolyma', desc: 'On y trouve de l\'or, du froid, et un taux de rendement que le froid trouve exagéré.', base: 3.2e6, inc: 3.8e4, mgr: ['Géologue Semionov', 'Découvre de l\'or partout, surtout dans les rapports.', 2.6e7] },
  { plan: 1, id: 'tampons', icon: 'paper', name: 'Usine de tampons officiels', desc: 'Un tampon par minute, un refus par tampon.', base: 2.4e7, inc: 2.6e5, mgr: ['Chef de service Anatoli', 'Tamponne la nuit pour ne pas être vu en train de tamponner.', 1.9e8] },
  { plan: 2, id: 'nickel', icon: 'urn', name: 'Fonderie de nickel de Norilsk', desc: 'Le nickel est brillant, l\'air un peu moins.', base: 2e8, inc: 2e6, mgr: ['Ingénieur Fedor', 'Respire peu et travaille beaucoup, par économie.', 1.6e9] },
  { plan: 2, id: 'cheminee', icon: 'urn', name: 'Cheminée record du monde', desc: 'Elle fume tellement que le ciel s\'est excusé de lui faire de l\'ombre.', base: 1.6e9, inc: 1.5e7, mgr: ['Fumiste Gleb', 'Dit qu\'il y a un record de fumée. Il a raison, c\'est le problème.', 1.3e10] },
  { plan: 3, id: 'charbon', icon: 'cart', name: 'Charbonnage polaire de Vorkouta', desc: 'Sous l\'aurore boréale, le charbon brille presque joyeusement.', base: 1.3e10, inc: 1.1e8, mgr: ['Mineur-chef Piotr', 'A trouvé du charbon dans une mine de charbon. On le décore.', 1e11] },
  { plan: 3, id: 'rail', icon: 'cart', name: 'Chemin de fer du Grand Nord', desc: 'Le train arrive à l\'heure. Il suffit de ne pas préciser laquelle.', base: 1.1e11, inc: 9e8, mgr: ['Chef de gare Ilya', 'Siffle quand il passe un train, et quand il n\'en passe pas.', 9e11] },
  { plan: 4, id: 'complexe', icon: 'urn', name: 'Complexe industriel n° 1', desc: 'Un complexe qui sert à construire d\'autres complexes.', base: 9e11, inc: 7e9, mgr: ['Directeur Zinoviev', 'Dirige parfaitement, sauf les directions.', 7e12] },
  { plan: 4, id: 'radio', icon: 'paper', name: 'Radio-télévision du Plan', desc: 'Diffuse uniquement les bonnes nouvelles. Elle en invente chaque soir.', base: 7e12, inc: 5.5e10, mgr: ['Présentatrice Vera', 'Sourit pendant que les chiffres pleurent.', 5.6e13] },
  { plan: 5, id: 'vitrine', icon: 'hat', name: 'Vitrine pour délégations étrangères', desc: 'Tout est neuf, propre et vide. Les touristes adorent.', base: 6e13, inc: 4.5e11, mgr: ['Guide Natacha', 'Explique que « tout va très bien » en six langues.', 4.8e14] },
  { plan: 5, id: 'statue', icon: 'hat', name: 'Statue du Directeur (en carton)', desc: 'Il y a un budget pour le bronze. Il est dans le bureau du directeur.', base: 5e14, inc: 4e12, mgr: ['Sculpteur Dimitri', 'Ne sculpte plus depuis qu\'il a vu le budget.', 4e15] },
];
const REGION_NAMES = ['Camp n° 7 — la taïga', 'Kolyma — les mines d\'or', 'Norilsk — nickel et fumées', 'Vorkouta — charbon polaire', 'Grand Nord — complexe industriel', 'Cité modèle du socialisme'];
const ALL = [...WORKSHOPS, ...UNLOCKS.map(u => ({ ...u }))];
const STAFF = [
  { id: 'poete', name: 'Le Poète', text: 'Écrit des odes au Parti que personne ne lit. +0,25 de faveur par seconde.', cost: 1800 },
  { id: 'prof', name: 'Le Professeur de chimie', text: 'Optimise tout, y compris les rations. Production +25 %.', cost: 26000 },
  { id: 'espion', name: 'Le Faux Espion', text: 'Espionne pour trois pays qui n\'existent pas. Le risque d\'inspection monte 40 % moins vite.', cost: 190000 },
  { id: 'comptable', name: 'La Comptable', text: 'Sait faire dire aux chiffres ce qu\'on veut. Les rapports falsifiés rapportent +30 %.', cost: 1600000 },
];
const EVENTS = [
  { t: 'Inspection du Politburo', x: 'Un inspecteur arrive demain. Il est annoncé depuis six mois, mais personne n\'a lu la lettre.', a: ['Repeindre tout en rouge', { r: -8, f: 4, k: -20 }, 'Les murs sont rouges, comme l\'avenir. La peinture a coûté un peu plus que prévu.'], b: ['Cacher les registres dans la neige', { f: -8, k: 25 }, 'La neige garde un secret. Jusqu\'au dégel, et l\'inspecteur est arrivé avec le dégel.'] },
  { t: 'Tempête de neige', x: 'La production est à l\'arrêt. Le froid, lui, travaille à plein régime.', a: ['Déclarer un record de fraîcheur', { r: -6, f: 5, k: 5 }, 'Le Politburo félicite votre froid. Il n\'a pas félicité votre budget.'], b: ['Travailler quand même', { r: 5, k: 15, f: -6 }, 'On n\'a perdu que quelques doigts, ils ne servaient pas au rapport. Le médecin n\'est pas d\'accord.'] },
  { t: 'Un pensionnaire se dit cousin du ministre', x: 'Il a une lettre, un sourire, et probablement un cousin.', a: ['Le croire', { f: -8, k: -10, r: -3 }, 'Il est parti en vacances aux frais du camp. Le ministre n\'a jamais su qu\'il avait un cousin.'], b: ['L\'envoyer à la scierie', { r: 3, k: 12, f: -3 }, 'Il scie avec conviction. Le vrai cousin arrive dans trois semaines avec des questions.'] },
  { t: 'Ordre contradictoire du ministère', x: '« Produisez plus avec moins de bois. » Signé, « Le Ministère du Bois (service des économies de bois). »', a: ['Appliquer les deux ordres', { r: -5, f: 6, k: 5 }, 'Un modèle d\'efficacité : on produit du plan, plus de bois. Ça se voit au budget.'], b: ['Perdre le courrier', { f: -6, k: 15, r: 1 }, 'Le courrier a été perdu. Il est retrouvé dans trois ans, avec les intérêts.'] },
  { t: 'Pénurie de crayons', x: 'Impossible de signer les rapports. Le plan est suspendu à un morceau de graphite.', a: ['Signer à la craie', { r: -2, k: 10, f: -2 }, 'La craie est solide, la signature moins. Le Parti ne signera plus avec vous.'], b: ['Demander au Politburo (délai : 3 ans)', { r: -4, f: 3 }, 'Votre demande a été enregistrée dans l\'armoire des demandes. Elle y retrouvera les autres.'] },
  { t: 'Visite du Commissaire avec photographe', x: 'On veut du camp heureux sur la photo. Le camp n\'est pas habitué.', a: ['Dresser un banquet en carton', { r: -10, f: 12, k: 5 }, 'Le carton a eu un grand succès. On l\'a mangé en entier, c\'est le seul repas de la semaine. Il fallait le payer.'], b: ['Montrer la réalité', { f: -18, k: 25, r: 2 }, 'Vous êtes très honnête. C\'est dommage pour votre carrière, et pour votre sommeil.'] },
  { t: 'La comptable trouve une erreur de 40 000 roubles', x: 'Elle ne dit pas qui l\'a faite. Elle regarde le plafond. Le plafond regarde ailleurs.', a: ['L\'effacer', { r: 4, k: 20 }, 'L\'erreur n\'a jamais existé. Elle est juste très discrète, et très surveillée.'], b: ['La classer en « dépense de moral »', { r: -5, f: 3, k: -5 }, 'Le moral est soutenu. Personne ne sait lequel. Le budget, si.'] },
  { t: 'Le poète écrit une ode à l\'inspecteur', x: 'Quatre-vingts strophes, aucune rime. Le Parti trouve ça très moderne.', a: ['La publier', { r: -3, f: 7, k: 8 }, 'L\'inspecteur est ému. L\'imprimerie aussi : elle réclame des sous.'], b: ['La confisquer pour manque de rimes', { f: -5, k: -5, r: -1 }, 'Le poète a retrouvé son goût du silence. Le Parti, un peu moins le goût de vous.'] },
  { t: 'Colis du Parti : 400 kg de médailles, 0 kg de pain', x: 'On ne mange pas les médailles, mais on peut les compter.', a: ['Distribuer les médailles', { r: -4, f: 8, k: 5 }, 'Le camp est décoré. Il a toujours faim, mais avec panache. Les médailles se perdent vite.'], b: ['Les fondre et les vendre', { r: 8, k: 25, f: -6 }, 'L\'or est ravi de servir une meilleure cause. Le Parti, un peu moins.'] },
  { t: 'Un loup demande un emploi', x: 'Il s\'est présenté au poste de garde avec un CV. Le CV est un lapin.', a: ['L\'embaucher', { r: 3, k: 8, f: -3 }, 'Il est excellent. Personne n\'ose le contredire, ni le surveiller.'], b: ['Le promouvoir directement', { r: 5, f: -8, k: 5 }, 'Il est désormais chef de service. Il est toujours un loup, mais avec un bureau, et un cousin.'] },
  { t: 'Grève du chauffage', x: 'Le froid refuse de se mettre au travail, il a un syndicat.', a: ['Réquisitionner le froid', { r: -2, f: 3, k: 8 }, 'Le froid s\'exécute, la tête haute et les pieds gelés. Il a gardé la facture.'], b: ['Brûler les archives', { r: 5, k: -15, f: -10 }, 'Il fait enfin chaud. Les archives aussi, avant de partir. Le Parti n\'a pas trouvé ça drôle.'] },
  { t: 'Le Politburo demande un rapport sur le rapport', x: 'Délai : hier. Le rapport est urgent, il est en retard de trente ans.', a: ['Écrire le rapport du rapport', { r: -3, f: 7, k: 5 }, 'Le rapport du rapport est un chef-d\'œuvre. Il n\'a pas de lecteur, mais un budget.'], b: ['Écrire le rapport du rapport du rapport', { r: -9, f: 15, k: 5 }, 'Le Politburo est conquis. Il demande déjà la suite, et vous a envoyé la facture du papier.'] },
  { t: 'Contrôle des stocks', x: 'On vous demande de compter les patates. Il y en a moins que dans le rapport. Ou plus. Ce n\'est pas clair.', a: ['Compter les vraies patates', { r: -6, f: -4 }, 'Il en manque beaucoup. Le froid les a mangées, d\'après le rapport du froid.'], b: ['Compter ce qui est écrit', { k: 18, f: 2 }, 'Le compte est bon, au papier près. Le papier est d\'accord, pas l\'inspecteur.'] },
  { t: 'Un rhume traverse le camp', x: 'Le froid est fier de son travail. Le médecin, lui, n\'a pas de médicaments, mais beaucoup d\'optimisme.', a: ['Arrêt maladie collectif', { r: -8, f: -3 }, 'Tout le monde se repose. Le plan, lui, ne se repose pas et vous le rappelle.'], b: ['Soigner à la vodka', { r: 2, k: 12, f: -5 }, 'Tout le monde va très bien, surtout ceux qui ne tiennent plus debout.'] },
  { t: 'Dénonciation anonyme', x: 'Quelqu\'un vous a dénoncé. L\'écriture ressemble étrangement à la vôtre, mais plus soignée.', a: ['Démentir énergiquement', { f: -6, k: -8 }, 'Vous avez tout démenti. Le Parti a trouvé cela suspect.'], b: ['Reconnaître et s\'excuser', { f: 2, k: 20, r: -4 }, 'Vous êtes sincère. C\'est bien vu, et très noté dans le dossier.'] },
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

export const _DATA = { ALL, STAFF, GROWTH };
export function startGulag(host, opts = {}) {
  const fresh = () => ({ r: 0, produced: 0, plan: 0, planProd: 0, own: Object.fromEntries(ALL.map(w => [w.id, 0])), mgr: {}, staff: {}, favor: 55, risk: 10, cd: 0, nextEv: 50, t: Date.now(), history: [], audits: [], planStart: Date.now() });
  let S; try { S = { ...fresh(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { S = fresh(); }
  S.own = { ...fresh().own, ...S.own }; S.plan = S.plan || 0; S.audits = S.audits || []; S.planStart = S.planStart || Date.now();
  const planTarget = n => PLAN_TARGETS[n] ?? PLAN_TARGETS[PLAN_TARGETS.length - 1] * Math.pow(80, n - PLAN_TARGETS.length + 1);
  const gateLeft = () => Math.max(0, (PLAN_MIN_H[S.plan] ?? 14) * 3600 - (Date.now() - S.planStart) / 1000);
  const hm = sec => { const m = Math.ceil(sec / 60), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };
  const planFrac = () => Math.min(1, Math.log10(1 + S.planProd) / Math.log10(planTarget(S.plan)));   // barre à l'échelle logarithmique : elle avance régulièrement même quand la production explose
  const permMult = () => 1 + 0.25 * S.plan;
  const mult = () => permMult() * (S.staff.prof ? 1.25 : 1);
  const wIncome = w => w.inc * S.own[w.id] * (S.mgr[w.id] ? 2 : 1);
  const income = () => ALL.filter(w => (w.plan || 0) <= S.plan).reduce((t, w) => t + wIncome(w), 0) * mult();
  const cost = w => Math.ceil(w.base * Math.pow(GROWTH, S.own[w.id]));
  const campScore = () => ALL.reduce((t, w) => t + (S.own[w.id] || 0) + (S.mgr[w.id] ? 2 : 0), 0) + Object.keys(S.staff).length * 4 + 25 * S.plan;
  let camp = null, sceneMod = null;
  const STAGE_AT_P = [0, 0.03, 0.09, 0.18, 0.30, 0.45, 0.65, 0.85];
  const stageNow = () => { const P = (S.plan + planFrac()) / PLAN_TARGETS.length; let st = 0; STAGE_AT_P.forEach((t, i) => { if (P >= t) st = i; }); return st; };
  const syncScene = () => { if (!camp || !sceneMod) return; const st = stageNow(); camp.sync({ stage: st, plan: S.plan }); $('gl-region').textContent = REGION_NAMES[S.plan % REGION_NAMES.length]; $('gl-stage').textContent = `Étape ${st + 1}/8 — ${sceneMod.STAGES[st]}`; };
  const saveNow = () => { try { S.t = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* stockage indisponible */ } };

  host.innerHTML = `<div class="gl"><header class="gl-top"><div class="gl-head"><button class="gl-exit" id="gl-exit">Quitter</button><div class="gl-title"><small id="gl-region">Camp n° 7</small><b>Directeur du Camp</b></div><div class="gl-grade" id="gl-grade"></div></div></header>
    <div class="gl-scene" id="gl-scene"><div class="gl-hud"><div class="gl-money"><span id="gl-r">0</span><small>kopeks du Plan</small><em id="gl-ps">+0 / s</em></div></div>
      <div class="gl-bars"><div><label>Plan <b id="gl-plan"></b></label><div class="gl-bar"><i id="gl-planbar"></i></div></div><div><label>Faveur</label><div class="gl-bar fav"><i id="gl-fav"></i></div></div><div><label>Risque</label><div class="gl-bar risk"><i id="gl-risk"></i></div></div></div><div class="gl-stage" id="gl-stage"></div><button class="gl-zoom" id="gl-zoom">Agrandir</button></div>
    <div class="gl-actions"><button id="gl-fake">Falsifier le rapport</button><button id="gl-bribe" class="alt">Pot-de-vin</button></div>
    <nav class="gl-tabs" id="gl-tabs"><button data-k="w" class="on">Ateliers</button><button data-k="s">Pensionnaires</button><button data-k="p" id="gl-tabp">Primes</button><button data-k="d">Décrets</button></nav>
    <main class="gl-body" id="gl-body"></main><footer class="gl-ticker"><span id="gl-news"></span></footer><div class="gl-modal" id="gl-modal"></div></div>`;
  const $ = id => host.querySelector('#' + id);
  let tab = 'w', stopped = false, eventOpen = false, newsI = 0;
  const log = (txt) => { S.history.unshift(txt); S.history = S.history.slice(0, 18); if (tab === 'd') renderBody(); };

  function renderBody() {
    const b = $('gl-body');
    if (tab === 'w') b.innerHTML = ALL.filter(w => (w.plan || 0) <= S.plan).map(w => { const c = cost(w), inc = wIncome(w) * mult(), n = S.own[w.id], m = S.mgr[w.id];
      return `<section class="gl-card" data-w="${w.id}"><div class="gl-ico">${icon(w.icon)}</div><div class="gl-info"><h3>${w.name}</h3><p>${w.desc}</p><div class="gl-stats"><span>Niveau <b>${n}</b></span><span>${inc ? '+' + fx(inc) + ' / s' : 'à bâtir'}</span>${m ? '<span class="ok">cadre en poste</span>' : ''}</div>
        <div class="gl-btns"><button data-buy="${w.id}">${n ? 'Améliorer' : 'Bâtir'} · ${fmt(c)}</button>${!m && n ? `<button class="alt" data-mgr="${w.id}" title="${w.mgr[1]}">${w.mgr[0]} · ${fmt(w.mgr[2])}</button>` : ''}</div>${m ? `<p class="gl-mgr">${w.mgr[0]} : ${w.mgr[1]}</p>` : ''}</div></section>`; }).join('') + (S.plan < 5 ? `<section class="gl-card gl-locked"><div class="gl-info"><h3>Prochain plan : ${REGION_NAMES[S.plan + 1]}</h3><p>${ALL.filter(w => w.plan === S.plan + 1).map(w => w.name).join(' · ')}</p><p class="gl-mgr">Accomplissez le plan n° ${S.plan + 1} pour transférer votre camp et débloquer ces ateliers.</p></div></section>` : '');
    else if (tab === 's') b.innerHTML = STAFF.map(p => `<section class="gl-card"><div class="gl-info"><h3>${p.name}</h3><p>${p.text}</p><div class="gl-btns">${S.staff[p.id] ? '<span class="ok">en poste (et il le sait)</span>' : `<button data-staff="${p.id}">Recruter · ${fmt(p.cost)}</button>`}</div></div></section>`).join('');
    else if (tab === 'p') { renderPrimes(b); return; }
    else b.innerHTML = `<section class="gl-card"><div class="gl-info"><h3>Journal du camp</h3>${S.history.length ? S.history.map(h => `<p class="gl-log">${h}</p>`).join('') : '<p>Rien à signaler. Ce qui est, évidemment, très suspect.</p>'}</div></section><section class="gl-card"><div class="gl-info"><h3>Règles du Politburo</h3><p class="gl-mgr">Rythme prévu : environ 3 jours en jouant 7 minutes toutes les 50 minutes. Chaque plan a un délai réglementaire minimum (4 h, 8 h, 10 h, 12 h, 12 h, 14 h) : on ne bâcle pas un plan quinquennal.</p><div class="gl-btns"><button class="alt" data-reset>Recommencer la démo à zéro</button></div><p>Remplis le plan quinquennal avant que la faveur tombe à zéro. Ne laisse pas le risque d'inspection atteindre 100 %. Les rapports falsifiés aident beaucoup, jusqu'à ce qu'ils n'aident plus.</p></div></section>`;
    refresh(); syncScene();
  }
  // ---------- primes : paliers et récompenses du mode classique ----------
  let camp0 = null;
  const progressP = () => S.plan + planFrac();
  const hoursNow = () => camp0 && !camp0.error ? camp0.hours + (Date.now() - camp0.at) / 3600000 : 0;
  async function loadCamp() { if (!opts.api) { camp0 = { error: 'Primes indisponibles ici.' }; return; } try { camp0 = await opts.api('/camp'); camp0.at = Date.now(); } catch (e) { camp0 = { error: e.message || 'Primes indisponibles.' }; } if (tab === 'p') renderBody(); else refresh(); }
  const claimable = () => camp0 && !camp0.error ? camp0.milestones.filter(m => !camp0.claimed.includes(m.id) && progressP() >= m.p && hoursNow() >= m.minH) : [];
  function renderPrimes(b) {
    if (!camp0) { b.innerHTML = '<section class="gl-card"><div class="gl-info"><p>Le Parti consulte ses archives…</p></div></section>'; loadCamp(); return; }
    if (camp0.error) { b.innerHTML = `<section class="gl-card"><div class="gl-info"><h3>Primes</h3><p>${camp0.error}</p></div></section>`; return; }
    const P = progressP(), h = hoursNow(), got = camp0.claimed.length;
    b.innerHTML = `<section class="gl-card gl-sum"><div class="gl-info"><h3>Primes du Parti : ${got} / ${camp0.milestones.length}</h3><p>Chaque palier donne une prime <b>dans le jeu normal</b> : wikibidou, paquets, titres de profil, et au palier 4 le <b>thème rouge « Camarade »</b> à garder à vie. Total possible : ${fmt(camp0.totalCoins)} wikibidou et ${camp0.totalPacks} paquets.</p></div></section>` + camp0.milestones.map(m => {
      const done = camp0.claimed.includes(m.id), reachedP = P >= m.p, reachedT = h >= m.minH, ready = !done && reachedP && reachedT;
      const status = done ? '<span class="ok">Prime récupérée</span>' : !reachedP ? `<span>Progression : ${Math.min(99, Math.floor(P / m.p * 100))} %</span>` : !reachedT ? `<span>Délai réglementaire : encore ${hm((m.minH - h) * 3600)}</span>` : '<span class="ok">Prête</span>';
      const rew = [`${fmt(m.coins)} wikibidou`, m.packs ? `${m.packs} paquet${m.packs > 1 ? 's' : ''}` : '', m.title ? `titre « ${m.title} »` : '', m.perk ? 'thème rouge « Camarade » (à vie)' : ''].filter(Boolean).join(' · ');
      return `<section class="gl-card ${done ? 'gl-done' : ''}"><div class="gl-ico gl-num">${m.id}</div><div class="gl-info"><h3>${m.name}</h3><p>${m.text}</p><div class="gl-stats"><span>${rew}</span></div><div class="gl-stats">${status}</div>${ready ? `<div class="gl-btns"><button data-claim="${m.id}">Récupérer la prime</button></div>` : ''}</div></section>`;
    }).join('');
  }
  async function claim(id) {
    const m = camp0?.milestones.find(x => x.id === id); if (!m) return;
    try {
      const r = await opts.api('/camp/claim', { id, p: progressP() }); camp0.claimed.push(id); if (r.perk) camp0.perks = [...(camp0.perks || []), r.perk];
      opts.onReward?.();
      log(`Prime n° ${id} (« ${m.name} ») récupérée : ${m.coins} wikibidou.`);
      popup(`<div class="gl-event"><div class="gl-stamp ok">PRIME DU PARTI</div><h2>${m.name}</h2><p>${m.text}</p><p class="gl-fx">${[`+${fmt(r.coins)} wikibidou`, r.packs ? `+${r.packs} paquet${r.packs > 1 ? 's' : ''}` : '', r.title ? `titre « ${r.title} »` : '', r.perk ? 'thème rouge « Camarade » débloqué (Réglages → Thème)' : ''].filter(Boolean).join(' · ')}</p><button data-close>Pour la gloire du Plan</button></div>`, () => { if (tab === 'p') renderBody(); });
    } catch (e) { toast(e.message || 'Le Parti refuse', 'bad'); if (tab === 'p') renderBody(); }
  }
  function refresh() {
    const inc = income();
    $('gl-r').textContent = fmt(S.r); $('gl-ps').textContent = '+' + fx(inc) + ' / s'; $('gl-grade').textContent = GRADES[Math.min(GRADES.length - 1, S.plan)];
    const p = planFrac(); $('gl-plan').textContent = `n° ${S.plan + 1} — ${Math.floor(p * 100)} %${gateLeft() > 0 ? ` · ${hm(gateLeft())}` : ''}`; $('gl-planbar').style.width = p * 100 + '%';
    $('gl-fav').style.width = Math.max(0, Math.min(100, S.favor)) + '%'; $('gl-risk').style.width = Math.max(0, Math.min(100, S.risk)) + '%';
    $('gl-fake').disabled = S.cd > 0 || eventOpen; $('gl-fake').textContent = S.cd > 0 ? `Falsifier le rapport (${Math.ceil(S.cd)} s)` : 'Falsifier le rapport';
    const bribe = Math.ceil(inc * 90 + 150); $('gl-bribe').textContent = `Pot-de-vin · ${fmt(bribe)}`; $('gl-bribe').disabled = S.r < bribe || S.risk < 5 || eventOpen;
    const cl = claimable().length, tp = host.querySelector('#gl-tabp'); if (tp) tp.textContent = cl ? `Primes · ${cl}` : 'Primes';
    host.querySelectorAll('[data-buy]').forEach(bt => { bt.disabled = S.r < cost(ALL.find(w => w.id === bt.dataset.buy)); });
    host.querySelectorAll('[data-mgr]').forEach(bt => { bt.disabled = S.r < ALL.find(w => w.id === bt.dataset.mgr).mgr[2]; });
    host.querySelectorAll('[data-staff]').forEach(bt => { bt.disabled = S.r < STAFF.find(x => x.id === bt.dataset.staff).cost; });
  }
  const gain = v => { S.r += v; if (v > 0) { S.produced += v; S.planProd += v; } };
  function toast(msg, kind = '') { const m = $('gl-modal'); m.innerHTML = `<div class="gl-note ${kind}">${msg}</div>`; m.classList.add('show', 'note'); setTimeout(() => { if (!eventOpen) { m.classList.remove('show', 'note'); m.innerHTML = ''; } }, 2600); }

  function popup(html, onClose) { const m = $('gl-modal'); eventOpen = true; m.classList.remove('note'); m.classList.add('show'); m.innerHTML = html; refresh(); m.querySelector('[data-close]')?.addEventListener('click', () => { m.classList.remove('show'); m.innerHTML = ''; eventOpen = false; onClose?.(); refresh(); }); return m; }
  const fxText = e => [e.r ? `${e.r > 0 ? '+' : '−'}${Math.abs(e.r)} min de production` : '', e.f ? `faveur ${e.f > 0 ? '+' : '−'}${Math.abs(e.f)}` : '', e.k ? `risque ${e.k > 0 ? '+' : '−'}${Math.abs(e.k)}` : ''].filter(Boolean).join(' · ');
  function applyEffect(e) { const inc = income(); if (e.r) gain(Math.max(-S.r, e.r * 60 * inc)); S.favor = Math.max(0, Math.min(100, S.favor + (e.f || 0))); S.risk = Math.max(0, Math.min(100, S.risk + (e.k || 0) * (e.k > 0 && S.staff.espion ? 0.6 : 1))); }
  function showEvent() {
    const ev = pick(EVENTS), m = popup(`<div class="gl-event"><div class="gl-stamp">ORDRE DU JOUR</div><h2>${ev.t}</h2><p>${ev.x}</p><div class="gl-choices"><button data-c="a">${ev.a[0]}</button><button data-c="b" class="alt">${ev.b[0]}</button></div></div>`);
    m.querySelectorAll('[data-c]').forEach(bt => bt.addEventListener('click', () => {
      const o = ev[bt.dataset.c]; applyEffect(o[1]); log(`${ev.t} : ${o[0].toLowerCase()}.`);
      m.innerHTML = `<div class="gl-event"><div class="gl-stamp ok">APPROUVÉ</div><h2>${o[0]}</h2><p>${o[2]}</p><p class="gl-fx">${fxText(o[1])}</p><button data-close>Au suivant, camarade</button></div>`;
      m.querySelector('[data-close]').onclick = () => { m.classList.remove('show'); m.innerHTML = ''; eventOpen = false; refresh(); };
    }));
  }
  function audit() {
    if (S.risk < 40) { toast('Contre-vérification du rapport : rien à signaler (c\'est suspect, mais personne ne l\'a remarqué).', 'ok'); return; }
    const loss = Math.min(S.r * 0.25, income() * 900); S.r -= loss; S.favor = Math.max(0, S.favor - 10); S.risk = Math.min(100, S.risk + 10); log(`Contre-vérification : le rapport falsifié ne tient pas. Amende de ${fmt(loss)} kop.`);
    popup(`<div class="gl-event"><div class="gl-stamp bad">CONTRE-VÉRIFICATION</div><h2>Le rapport ne tient pas</h2><p>Un comptable zélé a refait les calculs. Il a trouvé que « 40 % de patates » ne se trouve dans aucun tableau. Amende : <b>${fmt(loss)} kopeks</b>, faveur −10, risque +10.</p><button data-close>Je plaide l'erreur de frappe</button></div>`);
  }
  function inspection() {
    const loss = S.r * 0.5; S.r -= loss; S.risk = 30; S.favor = Math.max(0, S.favor - 15); const lost = Object.keys(S.mgr); let muted = ''; if (lost.length) { const id = lost[(Math.random() * lost.length) | 0], w = ALL.find(x => x.id === id); delete S.mgr[id]; muted = ` Au passage, ${w.mgr[0]} est muté « là où le Parti a besoin de lui » (c'est-à-dire plus loin que le camp).`; } log('Inspection surprise : la moitié du trésor a été « mise à l\'abri ».' + muted);
    popup(`<div class="gl-event"><div class="gl-stamp bad">INSPECTION</div><h2>Surprise !</h2><p>Les inspecteurs ont trouvé ce que vous cachiez, et aussi ce que vous ne cachiez pas. Ils ont « mis à l'abri » ${fmt(loss)} kopeks du Plan. Pour votre sécurité, bien sûr.${muted}</p><button data-close>Merci pour la vigilance</button></div>`);
  }
  function dismissed() {
    const s0 = S.plan, ps = S.planStart; S = { ...fresh(), plan: s0, planStart: ps }; saveNow(); renderBody(); syncScene();
    popup(`<div class="gl-event"><div class="gl-stamp bad">RELEVÉ DE VOS FONCTIONS</div><h2>Le Politburo vous remercie</h2><p>La faveur est tombée à zéro. Vous êtes promu au camp n° 8, section « anciens directeurs », où vous êtes accueilli avec les honneurs, un manteau et une pelle. Le camp n° 7 a déjà un nouveau directeur : c'est vous, mais avec un meilleur sourire.</p><button data-close>Reprendre le poste (de zéro)</button></div>`);
  }
  function planDone() {
    const next = S.plan + 1, region = REGION_NAMES[next % REGION_NAMES.length], news = ALL.filter(w => w.plan === next).map(w => w.name);
    const m = popup(`<div class="gl-event"><div class="gl-stamp ok">PLAN ACCOMPLI</div><h2>Plan quinquennal n° ${S.plan + 1} rempli</h2><p>Terminé en quatre ans et onze mois, à ce que dit le rapport. Le Parti vous décore et transfère votre camp : <b>${region}</b>. Rien n'est perdu, tout est « réaffecté ».</p><p>Production +25 % pour toujours. Nouveau grade : <b>${GRADES[Math.min(GRADES.length - 1, next)]}</b>.${news.length ? ` Nouveaux ateliers : ${news.join(', ')}.` : ''}</p><button data-close>${next >= PLAN_TARGETS.length ? 'Continuer à produire (sans fin, camarade)' : `En route pour le plan n° ${next + 1} !`}</button></div>`);
    camp?.celebrate();
    if (next >= PLAN_TARGETS.length) m.querySelector('.gl-stamp').textContent = 'ÉDITION TERMINÉE';
    m.querySelector('[data-close]').addEventListener('click', () => { S.plan = next; S.planProd = 0; S.planStart = Date.now(); S.favor = Math.min(100, S.favor + 15); S.risk = Math.max(0, S.risk - 20); log(`Plan n° ${next} accompli. Le camp est transféré : ${region}. Médaille reçue, et aussitôt reprise pour inventaire.`); saveNow(); renderBody(); });
  }

  // ---------- actions ----------
  host.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || eventOpen) return;
    if (t.id === 'gl-exit') return opts.onExit?.();
    if (t.dataset.reset !== undefined) { if (t.dataset.sure) { S = fresh(); saveNow(); tab = 'w'; host.querySelectorAll('#gl-tabs button').forEach(b => b.classList.toggle('on', b.dataset.k === 'w')); renderBody(); return; } t.dataset.sure = '1'; t.textContent = 'Sûr ? Tout sera perdu (rappuyer pour confirmer)'; return; }
    if (t.id === 'gl-zoom') { const big = $('gl-scene').classList.toggle('big'); t.textContent = big ? 'Réduire' : 'Agrandir'; return; }
    if (t.dataset.claim) { claim(+t.dataset.claim); return; }
    if (t.dataset.k) { tab = t.dataset.k; host.querySelectorAll('#gl-tabs button').forEach(b => b.classList.toggle('on', b === t)); return renderBody(); }
    if (t.dataset.buy) { const w = ALL.find(x => x.id === t.dataset.buy), c = cost(w); if (S.r >= c) { S.r -= c; S.own[w.id]++; renderBody(); } return; }
    if (t.dataset.mgr) { const w = ALL.find(x => x.id === t.dataset.mgr); if (S.r >= w.mgr[2]) { S.r -= w.mgr[2]; S.mgr[w.id] = 1; log(`${w.mgr[0]} embauché. Il a signé sans lire, comme tout le monde.`); renderBody(); } return; }
    if (t.dataset.staff) { const p = STAFF.find(x => x.id === t.dataset.staff); if (S.r >= p.cost) { S.r -= p.cost; S.staff[p.id] = 1; log(`${p.name} rejoint l'équipe. Il n'a pas été consulté.`); renderBody(); } return; }
    if (t.id === 'gl-fake' && S.cd <= 0) {
      const g = income() * 150 * (S.staff.comptable ? 1.3 : 1) + 20; gain(g); S.risk = Math.min(100, S.risk + 30 * (S.staff.espion ? 0.6 : 1)); S.favor = Math.min(100, S.favor + 2); S.cd = 40; S.audits.push(60 + Math.random() * 120);
      log('Rapport falsifié. Le papier a tout accepté, pour l\'instant.');
      if (Math.random() < 0.22) { const l = Math.min(S.r * 0.12, income() * 400); S.r -= l; S.favor = Math.max(0, S.favor - 8); toast(`Un vérificateur zélé a remarqué le rapport : amende de ${fmt(l)} kop. et faveur −8.`, 'bad'); log('Un vérificateur zélé a relevé une incohérence. Il a reçu une prime.'); }
      else toast(`Rapport falsifié : +${fmt(g)} kop. sur le papier. Un contrôle de cohérence est prévu dans quelques instants…`, 'ok');
      refresh(); return; }
    if (t.id === 'gl-bribe') { const b = Math.ceil(income() * 90 + 150); if (S.r >= b) { S.r -= b; S.risk = Math.max(0, S.risk - 35); toast('Pot-de-vin versé. Il s\'appelle « frais de représentation ».', 'ok'); log('Frais de représentation versés à un inspecteur sans nom.'); refresh(); } return; }
  });

  // ---------- boucle ----------
  const rawAway = Math.max(0, (Date.now() - (S.t || Date.now())) / 1000), away = Math.min(OFFLINE_MAX, rawAway);
  renderBody(); loadCamp();
  import('./gulag-scene.js').then(m => { if (stopped) return; sceneMod = m; try { camp = m.createCamp($('gl-scene')); syncScene(); } catch (e) { camp = null; $('gl-scene').classList.add('nowebgl'); } }).catch(() => { $('gl-scene').classList.add('nowebgl'); });
  if (away > 60 && income() > 0) {
    const g = income() * away * 0.5, dur = (() => { const m = Math.round(rawAway / 60), h = Math.floor(m / 60); return h ? `${h} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : `${m} min`; })(), capped = rawAway > OFFLINE_MAX;
    gain(g); S.t = Date.now();
    setTimeout(() => popup(`<div class="gl-event"><div class="gl-stamp ok">RAPPORT D'ABSENCE</div><h2>Bon retour, camarade</h2><p>Vous étiez absent <b>${dur}</b>. Pendant ce temps, le camp a continué à produire tout seul (à 50 %, le directeur adjoint est un peu paresseux) et vous a rapporté <b>${fmt(g)} kopeks du Plan</b>.${capped ? ' Au-delà de 2 heures, le camp se met en grève du zèle : le reste n\'a pas été compté.' : ''}</p><p class="gl-fx">+${fmt(g)} kopeks</p><button data-close>Merci, camarade directeur adjoint</button></div>`), 300);
  }
  let last = performance.now(), acc = 0, saveAcc = 0, acc2 = 0;
  const timer = setInterval(() => {
    if (stopped) return; const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
    if (!eventOpen) {
      gain(income() * dt); S.cd = Math.max(0, S.cd - dt);
      S.favor = Math.max(0, Math.min(100, S.favor - 0.035 * dt + (S.staff.poete ? 0.25 * dt : 0) + 0.0001 * dt * income() ** 0.5));
      S.risk = Math.max(0, Math.min(100, S.risk + (0.05 * (S.staff.espion ? 0.6 : 1) - 0.12) * dt + 0.015 * dt));
      S.nextEv -= dt;
      for (let i = S.audits.length - 1; i >= 0; i--) { S.audits[i] -= dt; if (S.audits[i] <= 0) { S.audits.splice(i, 1); audit(); break; } }
      if (S.planProd >= planTarget(S.plan) && gateLeft() <= 0) planDone();
      else if (acc2 >= 5 && (acc2 = 0, syncScene(), false)) { /* mise à jour de l'étape visible */ }
      else if (S.favor <= 0) dismissed();
      else if (S.risk >= 100) inspection();
      else if (S.nextEv <= 0) { S.nextEv = 45 + Math.random() * 35; showEvent(); }
    }
    acc += dt; saveAcc += dt; acc2 += dt; if (acc >= 0.2) { acc = 0; refresh(); }
    newsI += dt; if (newsI > 9) { newsI = 0; $('gl-news').textContent = pick(HEADLINES); $('gl-news').classList.remove('in'); void $('gl-news').offsetWidth; $('gl-news').classList.add('in'); }
    if (saveAcc > 5) { saveAcc = 0; saveNow(); }
  }, 100);
  $('gl-news').textContent = pick(HEADLINES); $('gl-news').classList.add('in');
  const onHide = () => saveNow(); document.addEventListener('visibilitychange', onHide);
  return {
    stop() { stopped = true; clearInterval(timer); saveNow(); camp?.stop(); document.removeEventListener('visibilitychange', onHide); host.innerHTML = ''; },
    state: () => S, _debug: { camp: () => camp, gain: v => { gain(v); refresh(); }, event: showEvent, inspection, planDone, dismissed, set: o => { Object.assign(S, o); renderBody(); }, income },
  };
}
