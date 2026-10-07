'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let RAR = {}, RANK = {}; // remplis depuis /api/config (raretés, libellés)
// Session : le jeton reste valable tant que le joueur ne se déconnecte pas. On le garde dans localStorage et, en secours, dans un cookie d'un an.
const store = {
  get() {
    try { const t = localStorage.getItem('wm_token'); if (t) return t; } catch { /* stockage bloqué */ }
    const m = document.cookie.match(/(?:^|; )wm_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  },
  set(t) {
    try { localStorage.setItem('wm_token', t); } catch { /* stockage bloqué */ }
    document.cookie = `wm_token=${encodeURIComponent(t)}; max-age=31536000; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    try { navigator.storage?.persist?.(); } catch { /* non supporté */ }  // demande au navigateur de ne pas effacer les données du site
  },
  clear() {
    try { localStorage.removeItem('wm_token'); } catch { /* stockage bloqué */ }
    document.cookie = 'wm_token=; max-age=0; path=/';
  },
};
const BUILD = '5.1';   // numéro de build de l'interface (affiché en bas du profil)
// journal discret (40 derniers évènements) : sert à comprendre un écran blanc ou un rechargement ; visible en touchant 5 fois la ligne « Build » du profil
const LOADED = new Date();
const hms = d => d.toLocaleTimeString('fr-FR');
function jlog(txt) { try { const l = JSON.parse(localStorage.getItem('wm_log') || '[]'); l.push([Date.now(), txt]); localStorage.setItem('wm_log', JSON.stringify(l.slice(-40))); } catch { /* stockage indisponible */ } }
{ const nav = performance.getEntriesByType?.('navigation')?.[0]; jlog(`chargement de la page (${nav?.type || '?'}${nav?.transferSize === 0 ? ', depuis le cache' : ''}) — build ${BUILD}`); }
window.addEventListener('error', e => jlog('erreur : ' + String(e.message).slice(0, 90)));
window.addEventListener('unhandledrejection', e => jlog('promesse rejetée : ' + String(e.reason?.message || e.reason).slice(0, 90)));
window.addEventListener('pageshow', e => { if (e.persisted) jlog('page restaurée depuis le cache du navigateur'); });
navigator.serviceWorker?.addEventListener('controllerchange', () => jlog('nouvelle version installée (service worker)'));
let token = store.get(), me = null, cfg = null, tab = 'packs', ws = null, online = new Set();
let game = null; // duel de quiz ou combat en cours
let tick, lastPack = null;

// Lectures de listes : on répond tout de suite avec la dernière réponse connue (< 30 s) et on la rafraîchit en arrière-plan.
// Si les données ont changé et que rien n'est en cours de saisie, la vue se redessine toute seule. Toute écriture vide ce cache.
const SWR = /^\/(album\/stats|auctions|friends|leaderboard|users|trades|achievements|hits)$/;
// la collection est lourde à lire côté serveur (milliers de lignes) : on la garde longtemps ; elle est vidée par toute action du joueur et par les évènements serveur (enchère gagnée, échange…)
const TTL = { '/album/stats': 600000, '/leaderboard': 120000 }, REVAL = { '/album/stats': 300000, '/leaderboard': 60000 };
const gcache = new Map();
function revalidate(path) {
  const before = gcache.get(path)?.raw;
  return fetchJson(path).then(({ raw }) => {
    if (before && raw !== before && path !== '/hits' && !game && $('#modal').hidden && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) render();
  }).catch(() => {});
}
async function api(path, body) {
  if (body) { gcache.clear(); return fetchJson(path, body).then(r => r.j); }
  if (SWR.test(path)) {
    const c = gcache.get(path);
    const ttl = TTL[path] ?? 30000, again = REVAL[path] ?? 2000, age = c ? Date.now() - c.t : 0;
    if (c && age < ttl) { if (age > again && !c.busy) { c.busy = true; revalidate(path).finally(() => { c.busy = false; }); } return JSON.parse(c.raw); }
  }
  return fetchJson(path).then(r => r.j);
}
async function fetchJson(path, body) {
  const r = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await r.text();
  let j = {}; try { j = JSON.parse(raw); } catch { /* réponse vide */ }
  if (r.status === 401 && token) logout();
  if (!r.ok) { if (j.quota) showQuota(j.until); const err = new Error(j.error || 'Erreur'); err.status = r.status; throw err; }
  if (quotaBar && Date.now() - quotaAt > 8000) hideQuota();   // la base répond à nouveau (on laisse 8 s après la dernière erreur pour ne pas clignoter)
  if (!body && SWR.test(path)) gcache.set(path, { t: Date.now(), raw });
  return { j, raw };
}
// ---------- limite gratuite de la base atteinte ----------
let quotaBar = null, quotaTimer = null, quotaAt = 0;
function showQuota(until) {
  quotaAt = Date.now();
  if (!quotaBar) { quotaBar = document.createElement('div'); quotaBar.className = 'quotabar'; document.body.append(quotaBar); }
  const paint = () => { const s = Math.max(0, Math.round(((until || Date.now()) - Date.now()) / 60000)); quotaBar.innerHTML = `<b>Limite de requêtes atteinte pour aujourd'hui</b><span>Le jeu revient tout seul à minuit UTC (2 h du matin en France)${until ? `, dans environ ${Math.floor(s / 60)} h ${String(s % 60).padStart(2, '0')} min` : ''}. Rien n'est perdu.</span>`; };
  paint(); clearInterval(quotaTimer); quotaTimer = setInterval(paint, 30000);
}
function hideQuota() { quotaBar?.remove(); quotaBar = null; clearInterval(quotaTimer); }
function toast(msg) { const d = document.createElement('div'); d.textContent = msg; $('#toast').append(d); setTimeout(() => d.remove(), 3500); }
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };
const fmt = n => (n ?? 0).toLocaleString('fr-FR');

// ---------- connexion ----------
async function auth(kind) {
  $('#a-err').textContent = '';
  try {
    const r = await fetch('/api/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('#a-name').value, password: $('#a-pw').value, invite: $('#a-invite').value }) });
    const j = await r.json(); if (!r.ok) { if (j.quota) showQuota(j.until); throw new Error(j.error); }
    token = j.token; store.set(token); start();
  } catch (e) { $('#a-err').textContent = e.message; }
}
$('#a-login').onclick = () => auth('login'); $('#a-register').onclick = () => auth('register');
async function logout() {
  try { await Promise.race([api('/push/unsubscribe', {}), new Promise(r => setTimeout(r, 900))]); } catch { /* hors ligne : tant pis */ }   // cet appareil ne doit plus recevoir les notifications de ce compte
  store.clear(); location.reload();
}

// ---------- websocket ----------
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + token);
  ws.onmessage = e => onWs(JSON.parse(e.data));
  ws.onopen = () => { jlog('connexion temps réel ouverte'); if (document.visibilityState !== 'visible') send({ t: 'vis', v: false }); };
  ws.onclose = () => { jlog('connexion temps réel coupée'); if (token) setTimeout(connect, 1500); };
}
// ---------- mises à jour automatiques ----------
/** Met l'appli à jour : supprime le service worker et tous les caches (indépendant de la version du service worker installé), puis recharge. */
async function applyUpdate(target, force = false) {
  let last = null; try { last = JSON.parse(sessionStorage.getItem('wm_upd') || 'null'); } catch { /* stockage indisponible */ }
  if (!force && last && last.v === target && Date.now() - last.t < 120000) return false;      // tentative toute récente pour cette version : pas de boucle
  try { sessionStorage.setItem('wm_upd', JSON.stringify({ v: target, t: Date.now() })); } catch { /* stockage indisponible */ }
  jlog(`mise à jour ${BUILD} → ${target}`);
  const veil = document.createElement('div'); veil.className = 'updveil'; veil.innerHTML = '<div><b>Mise à jour…</b><span>Une nouvelle version arrive</span></div>'; document.body.append(veil);
  try { await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.unregister())); } catch { /* pas de service worker */ }
  try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* pas de cache */ }
  location.reload();
  return true;
}
/** Compare la version du serveur à celle de l'appli. Au calme : mise à jour immédiate ; en pleine partie, ou si l'automatique a échoué : bandeau à toucher. */
let updBanner = false;
async function checkVersion(server) {
  try {
    const v = server ?? (await (await fetch('/api/version', { cache: 'no-store' })).json()).v;
    if (!v || v === BUILD) return;
    const busy = game || document.getElementById('reveal') || !$('#modal').hidden;
    if (!busy && await applyUpdate(v)) return;
    if (updBanner) return; updBanner = true;
    const b = document.createElement('div'); b.className = 'pushbar';
    b.innerHTML = `<p><b>Nouvelle version disponible (${esc(v)})</b><br>${busy ? 'Touche pour mettre à jour (ta partie en cours sera quittée).' : 'La mise à jour automatique n\'a pas abouti : touche pour la forcer.'}</p><button id="upd-go">Mettre à jour</button>`;
    $('#app').prepend(b); $('#upd-go').onclick = () => applyUpdate(v, true);
  } catch { /* hors ligne */ }
}
setInterval(() => { if (document.visibilityState === 'visible') checkVersion(); }, 5 * 60000);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  jlog(document.visibilityState === 'visible' ? 'retour sur l\'appli' : 'appli en arrière-plan');
  send({ t: 'vis', v: document.visibilityState === 'visible' });                         // le serveur sait si on regarde l'écran : sinon il envoie une notification
  if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
  checkVersion();
  if (!token || !me) return;
  const away = Date.now() - hiddenAt;
  if (!ws || ws.readyState > 1) connect();                  // la connexion a été coupée en arrière-plan (le serveur renvoie alors l'état de la partie)
  else send({ t: 'sync' });                                   // connexion encore ouverte mais peut-être sourde : on redemande l'état de la partie
  refreshMe().then(() => { if (me.daily && dailyShown !== new Date().toDateString() && $('#modal').hidden && !game) dailyModal(); if (!game && away > 30000) render(); }).catch(() => {});   // nouveau jour : la récompense réapparaît   // pas de reconstruction de l'écran pour un simple aller-retour rapide
});
const send = o => ws?.readyState === 1 && ws.send(JSON.stringify(o));
function onWs(m) {
  if (m.t === 'online') { online = new Set(m.ids); if (tab === 'duel' && !game) render(); }
  else if (m.t === 'notify' || m.t === 'info') { toast(m.msg); refreshMe(); }
  else if (m.t === 'error') { if (m.quota) showQuota(m.until); toast(m.msg); }
  else if (m.t === 'friend') onFriend(m);
  else if (m.t === 'dm') onDm(m);
  else if (m.t === 'hit') { recentHits.unshift(m); showHits(recentHits); }
  else if (m.t === 'refresh') { gcache.clear(); if ((tab === (m.what === 'auctions' ? 'market' : m.what) || (m.what === 'tournaments' && tab === 'tournament')) && !game) render(); if (m.what === 'auctions' && lotOpen) lotSheet(lotOpen); refreshMe(); }
  else if (m.t === 'challenge') {
    $('#modal').hidden = false;
    $('#modal').innerHTML = `<div><h2>Défi</h2><p>${esc(m.name)} te propose un ${m.mode === 'battle' ? 'combat de cartes' : m.mode === 'stake' ? 'duel à la mise : vous misez chacun une carte et le gagnant garde les deux' : 'duel de quiz'}.</p>
      <div class="row"><button id="ok">Accepter</button><button id="no" class="plain">Refuser</button></div></div>`;
    $('#ok').onclick = () => { send({ t: 'accept', from: m.from, mode: m.mode }); $('#modal').hidden = true; };
    $('#no').onclick = () => { send({ t: 'decline', from: m.from }); $('#modal').hidden = true; };
  }
  else if (/^(duel|battle|bf_|game_)|^(question|reveal)$/.test(m.t)) gameEvent(m);
}


// ---------- ventes aux enchères ----------
const DURATIONS = [[60, '1 h'], [360, '6 h'], [720, '12 h'], [1440, '24 h']];
function sellSheet(c) {
  return new Promise(resolve => {
    const m = $('#modal'); let mins = 360;
    m.hidden = false;
    const start = c.avg_price ?? sellValue(c) * 3;
    m.innerHTML = `<div><h2>Mettre aux enchères</h2><p class="mut">${esc(c.title)} · prix moyen du marché : ${c.avg_price ?? 'aucune vente'}</p>
      <label class="fld">Prix de départ (pièces)<input id="sp" type="number" inputmode="numeric" value="${start}"></label>
      <div class="fld" style="margin-bottom:6px">Durée de l'enchère</div>
      <div class="chips wrap" id="sd">${DURATIONS.map(([v, l]) => `<button data-m="${v}" class="${v === mins ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="row"><button id="s-ok">Mettre en vente</button><button id="s-no" class="plain">Annuler</button></div></div>`;
    const close = () => { m.hidden = true; m.innerHTML = ''; resolve(); };
    $('#sd').onclick = e => { const b = e.target.closest('button'); if (!b) return; mins = +b.dataset.m; $('#sd').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    $('#s-no').onclick = close; m.onclick = e => { if (e.target === m) close(); };
    $('#s-ok').onclick = safe(async () => {
      await api('/auctions', { card_id: c.id, price: $('#sp').value, minutes: mins });
      toast('Mise en vente'); close(); render();
    });
  });
}

let lotOpen = null, ACH_NAMES = [];
async function lotSheet(id) {
  const m = $('#modal'); lotOpen = id;
  const [{ auctions }, { bids }] = await Promise.all([api('/auctions'), api(`/auctions/${id}/bids`)]);
  const a = auctions.find(x => x.id == id);
  if (!a) { m.hidden = true; lotOpen = null; return; }
  const min = Math.max(a.start_price, a.bid + 1);
  m.hidden = false;
  m.innerHTML = `<div class="detail"><h2>${esc(a.title)}</h2>
    <p class="mut"><span class="rar ${a.rarity}">${RAR[a.rarity]}</span> · par ${a.seller_bot ? esc(a.seller) : `<a href="#" class="plink" data-pl="${a.seller_id}">${esc(a.seller)}</a>`} · prix moyen ${a.avg_price ?? '—'}</p>
    <div class="lotbox"><div><small>${a.bid ? 'Meilleure offre' : 'Mise de départ'}</small><b>${ico('coin')}${a.bid || a.start_price}</b>${a.bid ? `<small>${esc(a.bidder)}${a.leading ? ' (toi)' : ''}</small>` : ''}</div>
      <div class="time" data-end="${a.ends_at}">${ico('clock')}<span></span></div></div>
    ${a.mine ? '<p class="mut">C\'est ta vente.</p>' : `<label class="fld">Ton offre (minimum ${min})<input id="bid-v" type="number" inputmode="numeric" value="${min}"></label>
      <div class="chips wrap" id="bid-q">${[0, 5, 10, 25].map(d => `<button data-d="${d}">${d ? '+' + d : 'Min'}</button>`).join('')}</div>
      <div class="row"><button id="bid-ok">Enchérir</button><button id="bid-no" class="plain">Fermer</button></div>`}
    ${a.mine ? '<div class="row"><button id="bid-no" class="plain">Fermer</button></div>' : ''}
    <h3 class="hist-h">Historique des offres</h3>
    <div class="hist">${bids.length ? bids.map(b => `<div><span>${b.bot ? esc(b.name) : `<a href="#" class="plink" data-pl="${b.user_id}">${esc(b.name)}</a>`}</span><b>${ico('coin')}${b.amount}</b><em>${new Date(b.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</em></div>`).join('') : '<p class="mut">Aucune offre pour l\'instant.</p>'}</div></div>`;
  m.querySelectorAll('.plink').forEach(a => a.onclick = e => { e.preventDefault(); lotOpen = null; clearInterval(lotTick); playerSheet(a.dataset.pl); });
  const close = () => { m.hidden = true; m.innerHTML = ''; lotOpen = null; clearInterval(lotTick); };
  const upd = () => { const t = m.querySelector('[data-end]'); if (t) { const ms = t.dataset.end - Date.now(); t.querySelector('span').textContent = timeLeft(ms); t.classList.toggle('hot', ms < 60000); } };
  clearInterval(lotTick); upd(); lotTick = setInterval(upd, 1000);
  $('#bid-no').onclick = close; m.onclick = e => { if (e.target === m) close(); };
  if (!a.mine) {
    $('#bid-q').onclick = e => { const b = e.target.closest('button'); if (b) $('#bid-v').value = min + +b.dataset.d; };
    $('#bid-ok').onclick = safe(async () => {
      await api(`/auctions/${id}/bid`, { amount: $('#bid-v').value });
      toast('Offre envoyée'); await refreshMe(); await lotSheet(id); if (tab === 'market') render();
    });
  }
}
let lotTick = null;

// ---------- dialogues (remplacent prompt/confirm, plus agréables au doigt) ----------
function ask(title, fields = [], { text = '', ok = 'Valider' } = {}) {
  return new Promise(resolve => {
    const m = $('#modal');
    m.hidden = false;
    m.innerHTML = `<div><h2>${esc(title)}</h2>${text ? `<p class="mut">${esc(text)}</p>` : ''}${fields.map((f, i) => `<label class="fld">${esc(f.label)}${f.options
      ? `<select data-i="${i}">${f.options.map(([v, l]) => `<option value="${v}" ${v == f.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
      : `<input data-i="${i}" type="${f.type || 'text'}" ${f.type === 'number' ? 'inputmode="numeric"' : ''} value="${esc(f.value ?? '')}">`}</label>`).join('')}
      <div class="row"><button id="ask-ok">${esc(ok)}</button><button id="ask-no" class="plain">Annuler</button></div></div>`;
    const close = v => { m.hidden = true; m.innerHTML = ''; resolve(v); };
    $('#ask-ok').onclick = () => close([...m.querySelectorAll('[data-i]')].map(el => el.value));
    $('#ask-no').onclick = () => close(null);
    m.onclick = e => { if (e.target === m) close(null); };
    m.querySelector('input')?.focus();
  });
}

// ---------- composants ----------
const sellValue = c => cfg.sell[c.rarity];
const ABBR = { common: 'C', uncommon: 'PC', rare: 'R', super: 'SR', ultra: 'UR', legendary: 'L' };
/** Thème d'une page sans photo, deviné d'après sa description : sert à choisir l'icône de la carte. */
const TOPICS = [
  ['film', /\b(film|long métrage|court métrage|série télévisée|téléfilm|dessin animé|anime|épisode)\b/i],
  ['note', /\b(album|chanteu|chanson|single|groupe de (musique|rock|rap|metal|pop)|compositeu|musicien|orchestre|opéra|symphonie|rappeu)\b/i],
  ['book', /\b(roman|livre|ouvrage|bande dessinée|manga|nouvelle|essai|revue|journal|écrivain|poète|auteur)\b/i],
  ['leaf', /\b(espèce|genre|famille|plante|arbre|oiseau|insecte|poisson|mammifère|champignon|papillon|reptile|amphibien|coléoptère|araignée|fleur|végétal|animal|bactérie|taxon)\b/i],
  ['pin', /\b(commune|village|ville|département|région|province|canton|arrondissement|district|île|montagne|fleuve|rivière|lac|pays|capitale|quartier|comté|municipalité|préfecture|localité|gare|aéroport|cap|vallée)\b/i],
  ['building', /\b(château|église|cathédrale|musée|bâtiment|stade|pont|monument|université|école|hôpital|abbaye|palais|tour|chapelle|théâtre|usine)\b/i],
  ['trophy', /\b(championnat|tournoi|coupe|saison|match|compétition|jeux olympiques|élection|bataille|guerre|attentat|festival|grand prix|course)\b/i],
  ['person', /\b(né|née|footballeu|joueu|acteur|actrice|homme politique|femme politique|député|sénateur|président|ministre|peintre|sculpteur|réalisat|cycliste|athlète|nageu|pilote|entraîneu|journaliste|philosophe|scientifique|médecin|militaire|général|roi|reine|empereur|pape|évêque|saint|personnalité|artiste|dirigeant)\b|\(\d{3,4}\s*[-–]/i],
];
const topic = c => { const t = (c.extract || '').slice(0, 240); for (const [k, re] of TOPICS) if (re.test(t)) return k; return 'spark'; };
const noimg = c => `<svg class="ic big"><use href="#i-${topic(c)}"/></svg>`;
const cardIndex = new Map(); // cartes affichées, pour la fiche détaillée au toucher
const cardHtml = (c, { acts = '', tag = '', cls = '', extra = '', lazy = false, star = false } = {}) => (cardIndex.set(c.id, c), `<div class="card ${c.rarity} ${c.shiny ? 'shiny' : ''} ${c.lvl ? 'lv' + c.lvl : ''} ${cls}" data-id="${c.id}">
  <div class="img ${c.image ? '' : 'noimg'}" ${c.image ? (lazy ? `data-bg="${esc(c.image)}"` : `style="background-image:url('${esc(c.image)}')"`) : ''}>${c.image ? '' : noimg(c)}<span class="chip">${ABBR[c.rarity]}</span></div>
  <div class="tags">${star ? `<button class="starbtn ${c.fav ? 'on' : ''}" data-fav="${c.id}" aria-label="Favori" title="Favori"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="sh" d="M12 3.4l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16.4 6.8 19.3 8 13.5 3.6 9.5l5.9-.7z"/><path class="st" d="M12 3.4l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16.4 6.8 19.3 8 13.5 3.6 9.5l5.9-.7z"/></svg></button>` : ''}${c.isNew ? '<span class="tag new">Nouveau</span>' : ''}${c.qty > 1 ? `<span class="tag">×${c.qty}</span>` : tag}${c.shiny ? '<span class="tag shiny">Shiny</span>' : ''}${c.lvl ? `<span class="tag lvl">★${c.lvl}</span>` : ''}</div>
  <div class="body"><div class="t">${esc(c.title)}</div>
    <div class="meta"><span class="rar ${c.rarity}">${RAR[c.rarity]}</span><span>ATK <b>${fmt(c.atk)}</b></span><span>DEF <b>${fmt(c.def)}</b></span></div>${extra}</div>
  ${acts ? `<div class="acts">${acts}</div>` : ''}</div>`);

/** Longue liste : on dessine 60 cartes puis la suite à l'approche du bas (une collection de 1 000+ cartes ne bloque plus le téléphone). */
let chunkObs = null;
function chunked(box, items, html, after, step = 60) {
  chunkObs?.disconnect();
  let n = 0; box.innerHTML = '';
  const sentinel = document.createElement('div'); sentinel.style.cssText = 'grid-column:1/-1;height:1px'; box.append(sentinel);
  const more = () => {
    const part = items.slice(n, n + step); n += part.length;
    sentinel.insertAdjacentHTML('beforebegin', part.map(html).join(''));
    after?.(box);
    if (n >= items.length) { chunkObs?.disconnect(); sentinel.remove(); }
  };
  chunkObs = new IntersectionObserver(es => { if (es[0].isIntersecting) more(); }, { rootMargin: '900px 0px' });
  more(); if (n < items.length) chunkObs.observe(sentinel);
}

/** Les prochains paquets sont préparés par le serveur : on met leurs images en cache avant l'ouverture. */
const prefetched = new Set();
async function prefetchNext() {
  try { (await api('/packs/next')).images.forEach(u => { if (!prefetched.has(u)) { prefetched.add(u); new Image().src = u; } }); } catch { /* pas grave */ }
}
const schedulePrefetch = () => [2500, 8000, 16000].forEach(ms => setTimeout(prefetchNext, ms));

/** Images de fond chargées seulement quand la carte approche de l'écran (album de centaines de cartes). */
let lazyObs = null;
function lazyImages(root) {
  const els = root.querySelectorAll('[data-bg]');
  if (!('IntersectionObserver' in window)) { els.forEach(e => { e.style.backgroundImage = `url('${e.dataset.bg}')`; }); return; }
  lazyObs ??= new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    const e = en.target; lazyObs.unobserve(e); e.style.backgroundImage = `url('${e.dataset.bg}')`; e.removeAttribute('data-bg');
  }), { rootMargin: '600px 0px' });
  els.forEach(e => lazyObs.observe(e));
}

/** Fiche détaillée d'une carte (toucher une carte). */
function showCard(id) {
  const c = cardIndex.get(+id); if (!c) return;
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="detail"><div class="card ${c.rarity} ${c.shiny ? 'shiny' : ''} ${c.lvl ? 'lv' + c.lvl : ''}" style="margin-bottom:12px">
      <div class="img big ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}>${c.image ? '' : noimg(c)}<span class="chip">${ABBR[c.rarity]}</span></div>
      <div class="body"><div class="t">${esc(c.title)}</div>
        <div class="meta"><span class="rar ${c.rarity}">${RAR[c.rarity]}${c.shiny ? ' · Shiny' : ''}</span><span>ATK <b>${fmt(c.atk)}</b></span><span>DEF <b>${fmt(c.def)}</b></span></div></div></div>
    ${fuseBox(c)}<p class="extract">${c.extract ? esc(c.extract) : '<span class="mut">Description en cours de chargement…</span>'}</p>
    <p class="mut">Défausse : ${sellValue(c)} pièces${c.avg_price != null ? ` · prix moyen au marché : ${c.avg_price}` : ''}</p>
    <div class="row"><a class="btn" href="https://fr.wikipedia.org/wiki/${encodeURIComponent(c.title.replace(/ /g, '_'))}" target="_blank" rel="noopener">Lire sur Wikipédia</a><button class="plain" id="det-close">Fermer</button></div></div>`;
  $('#det-close').onclick = () => { m.hidden = true; m.innerHTML = ''; };
  m.onclick = e => { if (e.target === m) { m.hidden = true; m.innerHTML = ''; } };
  const fb = $('#fuse-go');
  if (fb) fb.onclick = safe(async () => {
    fb.disabled = true;
    const r = await api('/fuse', { card_id: c.id });
    c.atk = c.atk - (c.bonus || 0) + r.bonus; c.def = c.def - (c.bonus || 0) + r.bonus; c.bonus = r.bonus; c.lvl = r.lvl; c.qty = r.qty; c.fuse = r.fuse;
    try { navigator.vibrate?.([20, 30, 40]); } catch { /* non supporté */ }
    showCard(c.id); const box = $('.detail'); box.classList.add('fused'); sparks(box, 30);
    toast(`${c.title} passe au niveau ${r.lvl} : +${r.bonus} ATK et DEF`);
    if (tab === 'album') render();
  });
}
/** Encadré de fusion de la fiche d'une carte (uniquement dans sa propre collection). */
function fuseBox(c) {
  const f = c.fuse; if (!f) return '';
  const stars = Array.from({ length: f.max }, (_, i) => `<i class="${i < f.lvl ? 'on' : ''}">★</i>`).join('');
  const body = f.cost === null ? '<p class="mut">Niveau maximum atteint.</p>'
    : `<p class="mut">Fusionne <b>${f.cost} doublons</b> pour passer au niveau ${f.lvl + 1} : <b>+${f.gain} ATK et DEF</b>.</p>
      <button class="primary" id="fuse-go" ${f.can ? '' : 'disabled'}>Fusionner (${f.cost} doublons)</button>${f.can ? '' : `<p class="mut dsmall">Il te faut ${f.cost + 1} exemplaires (tu en as ${c.qty}) : un reste toujours dans ta collection.</p>`}`;
  return `<div class="fusebox"><div class="fh"><b>Fusion</b><span class="fstars">${stars}</span></div>${c.bonus ? `<p class="mut" style="margin:0 0 4px">Bonus actuel : +${c.bonus} ATK et DEF</p>` : ''}${body}</div>`;
}
/** Étoile des favoris : mise à jour immédiate, enregistrée en arrière-plan. */
let albumFilter = '';
async function toggleFav(id) {
  const c = cardIndex.get(id); if (!c) return;
  const on = !c.fav, paint = v => { c.fav = v ? 1 : 0; (lastPack?.cards || []).forEach(x => { if (x.id === id) x.fav = v ? 1 : 0; }); document.querySelectorAll(`[data-fav="${id}"]`).forEach(b => b.classList.toggle('on', v)); };
  paint(on);
  try { await api('/favorites', { card_id: id, on }); toast(on ? 'Ajoutée aux favoris' : 'Retirée des favoris'); if (tab === 'album' && albumFilter === 'fav' && !on) render(); }
  catch (e) { paint(!on); toast(e.message); }
}
document.addEventListener('click', e => {
  const star = e.target.closest('[data-fav]');
  if (star) { e.stopPropagation(); e.preventDefault(); toggleFav(+star.dataset.fav); }
}, true);
document.addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (!card || e.target.closest('button, a') || card.classList.contains('pick') || !$('#modal').hidden) return;
  showCard(card.dataset.id);
});

/**
 * Chargement chronologique des photos : par vagues dans l'ordre de révélation (2 premières cartes, puis 3, puis le reste).
 * Seule la première vague est attendue avant l'ouverture ; chaque carte garde une promesse `_ready` que l'écran de révélation attend un instant.
 */
function loadProgressive(r) {
  const ordered = [...r.cards].sort((a, b) => RANK[a.rarity] - RANK[b.rarity] || (a.shiny | 0) - (b.shiny | 0));
  const need = c => !c.extract || (!c.image && c.enriched < 2);
  const waves = [ordered.slice(0, 2), ordered.slice(2, 5), ordered.slice(5)].map(list => {
    const todo = list.filter(need);
    const p = todo.length ? api('/cards/enrich', { ids: todo.map(c => c.id) }).then(({ cards }) => {
      const by = new Map(cards.map(x => [x.id, x]));
      todo.forEach(c => { const x = by.get(c.id); if (x) Object.assign(c, { extract: x.extract, image: x.image, enriched: x.enriched }); if (c.image) new Image().src = c.image; }); // l'image est mise en cache avant d'être affichée
    }).catch(() => {}) : Promise.resolve();
    list.forEach(c => { c._ready = p; });
    return p;
  });
  return waves[0];
}

/** Récupère description + image des cartes d'un tirage qui n'en ont pas encore (attend au plus ~3 s). */
async function fillMissing(r) {
  const ids = r.cards.filter(c => !c.extract || (!c.image && c.enriched < 2)).map(c => c.id);
  if (!ids.length) return;
  try {
    const { cards } = await Promise.race([api('/cards/enrich', { ids }), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 9000))]);
    const by = new Map(cards.map(x => [x.id, x]));
    r.cards.forEach(c => { const x = by.get(c.id); if (x) Object.assign(c, { extract: x.extract, image: x.image, enriched: x.enriched }); });
  } catch { /* on affiche sans : la carte se complétera plus tard */ }
}

// ---------- vues ----------

const GROUP = { packs: 'packs', album: 'album', search: 'search', duel: 'duel', rank: 'rank', ach: 'rank', market: 'market', trades: 'market', friends: 'friends', msg: 'msg', chat: 'msg', quests: 'more', dquiz: 'more', settings: 'more', customize: 'more', tournaments: 'more', tournament: 'more', admin: 'more' };
const ico = (name, cls = '') => `<svg class="ic ${cls}"><use href="#i-${name}"/></svg>`;
const pageHead = (title, sub = '') => `<div class="pagehead"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
/** Contrôle segmenté : ouvre une autre vue du même groupe (ex. Enchères / Échanges). */
const seg = (items, current) => `<div class="seg">${items.map(([k, label]) => `<button class="${k === current ? 'on' : ''}" data-seg="${k}">${esc(label)}</button>`).join('')}</div>`;
const bindSeg = v => v.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { tab = b.dataset.seg; render(); });
const avColor = name => `hsl(${[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 62% 68%)`;
// photos et titres des joueurs : { nom -> { id, v: version de la photo, ti: titre équipé } }, rechargés régulièrement
let COS = new Map(), TLABELS = {}, cosAt = 0;
async function loadCosmetics(force = false) {
  if (!force && Date.now() - cosAt < 60000) return;
  cosAt = Date.now();
  try { const d = await api('/cosmetics'); COS = new Map(d.players.map(p => [p.name, p])); TLABELS = d.labels; } catch { /* sans photos pour cette fois */ }
}
const avatar = (name, on = false) => { const c = COS.get(name); return `<span class="av ${on ? 'on' : ''} ${c?.v ? 'ph' : ''}" style="--avc:${avColor(name)}">${c?.v ? `<img src="/api/avatar/${c.id}?v=${c.v}" alt="" loading="lazy" onerror="this.remove()">` : ''}${esc(String(name)[0]?.toUpperCase() || '?')}</span>`; };
const ttl = name => { const t = COS.get(name)?.ti; return t && TLABELS[t] ? `<span class="ttl">${esc(TLABELS[t])}</span>` : ''; };
const timeLeft = ms => { const r = Math.max(0, Math.round(ms / 1000)); return r >= 3600 ? `${Math.floor(r / 3600)} h ${Math.floor(r % 3600 / 60)} min` : r >= 60 ? `${Math.floor(r / 60)} min ${r % 60} s` : `${r} s`; };
const RANK_SEG = [['rank', 'Classement'], ['ach', 'Succès']];
const MARKET_SEG = [['market', 'Enchères'], ['trades', 'Échanges']];

/** Liste paginée : charge les pages du serveur au fil du défilement (une page de plus quand le bas approche). */
function pager(box, { fetchPage, tile, root = null, empty = 'Aucune carte ne correspond.', onPage }) {
  let params = {}, cursor = null, done = false, busy = false, gen = 0;
  const items = [], sentinel = document.createElement('div');
  sentinel.style.cssText = 'grid-column:1/-1;height:1px';
  const obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more(); }, { root, rootMargin: '700px 0px' });
  async function more() {
    if (busy || done) return;
    busy = true; const g = gen;
    try {
      const r = await fetchPage(params, cursor); if (g !== gen) return;
      items.push(...r.cards); cursor = r.next; done = !r.next;
      if (!items.length) box.innerHTML = `<div class="empty" style="grid-column:1/-1">${typeof empty === 'function' ? empty(params) : empty}</div>`;
      else sentinel.insertAdjacentHTML('beforebegin', r.cards.map(tile).join(''));
      onPage?.(r.cards, box);
    } catch (e) { toast(e.message); }
    finally { if (g === gen) { busy = false; if (!done) { obs.unobserve(sentinel); obs.observe(sentinel); } } }   // ré-observer relance le chargement si le bas est encore visible
  }
  return {
    items,
    reset(p = {}) { gen++; params = p; cursor = null; done = false; busy = false; items.length = 0; obs.disconnect(); box.innerHTML = ''; box.append(sentinel); more(); },
    stop() { gen++; obs.disconnect(); },
  };
}
const qs = o => new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null))).toString();
const cardPage = (user) => (p, cur) => api('/album/page?' + qs({ ...p, user, cursor: cur ? JSON.stringify(cur) : '' }));

/** Fenêtre « bibliothèque » : recherche par nom, filtre par rareté, une touche sur une carte la choisit. `user` = joueur dont on regarde les cartes (le sien par défaut). Renvoie la carte, ou null si on annule. */
function cardPicker(title, { user } = {}) {
  return new Promise(resolve => {
    const m = $('#modal'); m.hidden = false;
    m.innerHTML = `<div class="picker"><h2>${esc(title)}</h2>
      <div class="search wide">${ico('search')}<input id="cp-q" placeholder="Chercher par nom" autocomplete="off"></div>
      <div class="chips" id="cp-r"><button class="on" data-r="">Toutes</button>${cfg.rarities.map(r => `<button data-r="${r}" style="--cc:var(--${r})">${RAR[r]}</button>`).join('')}</div>
      <div class="pgrid" id="cp-g"></div><div class="row"><button class="plain" id="cp-x">Annuler</button></div></div>`;
    const tile = c => `<button class="ptile ${c.rarity} ${c.shiny ? 'shiny' : ''}" data-id="${c.id}" style="--c:var(--${c.shiny ? 'shiny' : c.rarity})"><div class="pimg ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}><span class="chip">${ABBR[c.rarity]}</span>${c.qty > 1 ? `<span class="qty">×${c.qty}</span>` : ''}</div><b>${esc(c.title)}</b><small>ATK ${fmt(c.atk)} · DEF ${fmt(c.def)}</small></button>`;
    const P = pager($('#cp-g'), { fetchPage: cardPage(user), tile, root: $('#cp-g'), empty: 'Aucune carte ne correspond.' });
    let q = '', rf = '', t;
    const go = () => P.reset({ sort: 'rar', rar: rf, q });
    const done = c => { P.stop(); m.hidden = true; m.innerHTML = ''; m.onclick = null; resolve(c); };
    $('#cp-q').oninput = e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); go(); }, 300); };
    $('#cp-r').onclick = e => { const b = e.target.closest('button'); if (!b) return; rf = b.dataset.r; $('#cp-r').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); go(); };
    $('#cp-g').onclick = e => { const t = e.target.closest('.ptile'); if (t) done(P.items.find(c => c.id === +t.dataset.id) || null); };
    $('#cp-x').onclick = () => done(null);
    m.onclick = e => { if (e.target === m) done(null); };
    go();
  });
}
const views = {
  async packs(v) {
    const d = cfg.drop, tot = Object.values(d).reduce((a, b) => a + b, 0), pct = x => +(x / tot * 100).toFixed(2);
    v.innerHTML = `<div class="hero"><button class="info" id="rates-btn" aria-label="Taux de drop" title="Taux de drop">?</button><h1>Ouvrir un paquet</h1>
      <p class="sub">Découvre ${cfg.packSize} nouvelles cartes Wikipédia</p>
      <div class="packart" id="packart">${packSvg('full', { anim: false })}</div>
      <div class="pk-actions"><button id="open" ${me.packs || me.test ? '' : 'disabled'}>Ouvrir</button>
      <div class="stock"><div class="pips">${Array.from({ length: 10 }, (_, i) => `<i class="${i < me.packs ? 'on' : ''}"></i>`).join('')}</div>
        <p>${me.test ? '<b>∞</b> paquets · mode test' : `<b>${me.packs}</b> paquet${me.packs > 1 ? 's' : ''} disponible${me.packs > 1 ? 's' : ''} · prochain dans <b id="cd"></b>`}</p></div>
      <button id="buy" class="plain buy" ${me.coins >= cfg.packPrice ? '' : 'disabled'}>Acheter et ouvrir · ${cfg.packPrice} pièces</button></div>
      <div class="lastpack" id="lastpack" hidden><h3 class="sec">Dernier tirage</h3><div id="out" class="grid"></div></div></div>`;
    // hauteur disponible sous l'en-tête et au-dessus de la barre du bas : les espaces de l'accueil s'en déduisent en pourcentage
    const hero = v.querySelector('.hero');
    const setAvail = () => {
      if (!hero.isConnected) return window.removeEventListener('resize', setAvail);
      const nav = document.querySelector('aside nav').getBoundingClientRect();
      const bottom = innerWidth <= 820 ? nav.height : 0;
      const free = Math.max(300, innerHeight - hero.getBoundingClientRect().top - scrollY - bottom - 6);
      hero.style.setProperty('--avail', free + 'px');
      const over = document.documentElement.scrollHeight - innerHeight;           // marges du bas de la page : une passe de correction
      if (over > 0 && !hero.querySelector('.rates[open]')) hero.style.setProperty('--avail', Math.max(300, free - over) + 'px');
      fitLock();
    };
    setAvail(); window.addEventListener('resize', setAvail);
    const show = r => {
      lastPack = r; $('#lastpack').hidden = false; $('#out').innerHTML = [...r.cards].sort((a, b) => RANK[b.rarity] - RANK[a.rarity]).map(c => cardHtml(c, { star: true })).join('');
    };
    if (lastPack) show(lastPack);
    // ouverture animée : les cartes arrivent une par une, de la moins rare à la plus rare
    const openAnimated = path => safe(async () => {
      $('#open').disabled = $('#buy').disabled = true; $('#open').textContent = 'Ouverture…';
      // la requête part tout de suite et le paquet se déchire pendant ce temps : le chargement est masqué par l'animation
      const cardsPromise = (async () => {
        const r = await api(path, {});
        schedulePrefetch();                         // le serveur prépare déjà le paquet suivant : on précharge ses images
        await loadProgressive(r);                   // seules les premières cartes sont attendues, les autres arrivent pendant qu'on les regarde
        lastPack = r;
        refreshMe().catch(() => {});
        r.cards.god = !!r.god;                      // paquet exceptionnel : l'animation d'ouverture le met en scène
        return r.cards;
      })();
      cardsPromise.catch(() => {});
      try { await playReveal(cardsPromise, { labels: RAR, rank: RANK, fmt, cardHtml, noimg }); }
      finally { render(); }
    });
    $('#rates-btn').onclick = () => {
      const m = $('#modal'); m.hidden = false;
      m.innerHTML = `<div><h2>Taux de drop</h2><div class="ratelist">${cfg.rarities.map(r => `<div><span class="rar ${r}">${RAR[r]}</span><b>${pct(d[r])} %</b></div>`).join('')}</div>
        <p class="mut" style="margin:12px 0 0;font-size:13px">Une légendaire a ${+(cfg.shinyChance * 100).toFixed(2)} % de chance d'être shiny. <b style="color:var(--fg)">GODPACK</b> : un paquet sur ${fmt(Math.round(1 / (cfg.godpack || .001)))} ne contient que des ultra rares et des légendaires (au moins une). Catalogue : ${fmt(cfg.catalog)} pages. Aucune garantie : tout dépend de la chance.</p>
        <div class="row"><button class="plain" id="rt-close">Fermer</button></div></div>`;
      const close = () => { m.hidden = true; m.innerHTML = ''; };
      $('#rt-close').onclick = close; m.onclick = e => { if (e.target === m) close(); };
    };
    $('#open').onclick = openAnimated('/packs/open');
    $('#buy').onclick = openAnimated('/packs/buy');
    const t0 = Date.now(), next = me.nextPackIn;
    tick = setInterval(() => {
      const cd = $('#cd'); if (!cd) return;
      const s = Math.max(0, Math.round((next - (Date.now() - t0)) / 1000));
      cd.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s === 0) { clearInterval(tick); refreshMe().then(() => render()); }
    }, 500);
  },

  async album(v) {
    const S = await api('/album/stats');
    const { uniques, copies, dupes, worth, have, tiers, total, rarityAvg } = S;
    const bulkDefault = (tiers.filter((t, i) => i <= 1 && t.n).at(-1) || tiers.find(t => t.n) || tiers[0]).r;
    let rar = albumFilter, sort = 'rar', q = '', dup = false;
    v.innerHTML = `${pageHead('Collection', `${uniques} cartes uniques`)}
      <div class="tiles">
        <div class="tile"><b>${uniques}</b><span>cartes uniques</span></div>
        <div class="tile"><b>${copies}</b><span>exemplaires</span></div>
        <div class="tile"><b>${dupes}</b><span>doublons</span></div>
        <div class="tile gold"><b>${fmt(worth)}</b><span>valeur estimée (pièces)</span></div>
      </div>
      <details class="panel progd" ${innerWidth > 820 ? 'open' : ''}><summary>Progression <span class="mut">${cfg.rarities.map(r => `${have[r] || 0}`).join(' · ')}</span></summary><div class="prog" style="margin:12px 0 0">${cfg.rarities.map(r => `<div><div class="top"><span class="rar ${r}">${RAR[r]}</span><span>${have[r] || 0} / ${fmt(total[r])}</span></div>
        <div class="bar" style="color:var(--${r})"><i style="width:${Math.max((have[r] || 0) ? 3 : 0, (have[r] || 0) / (total[r] || 1) * 100)}%;background:var(--${r})"></i></div>
        <span class="mut" style="font-size:11.5px">vente moy. ${rarityAvg[r] ? fmt(rarityAvg[r].avg) : '—'}</span></div>`).join('')}</div></details>
      <div class="toolbar">
        <div class="search">${ico('search')}<input id="flt" placeholder="Rechercher une carte" autocomplete="off"></div>
        <select id="srt"><option value="fav">Tri : favoris d'abord</option><option value="new">Tri : plus récentes</option><option value="old">Tri : plus anciennes</option><option value="rar" selected>Tri : rareté</option><option value="name">Tri : nom</option><option value="qty">Tri : quantité</option><option value="lvl">Tri : niveau de fusion</option></select>
        <label class="row" style="gap:8px;color:var(--mut);font-size:13px"><input type="checkbox" id="dup"> doublons</label>
        <div class="chips" id="chips"><button class="${rar === '' ? 'on' : ''}" data-r="">Toutes</button><button class="${rar === 'fav' ? 'on' : ''}" data-r="fav" style="--cc:var(--gold-fav)">★ Favoris</button><button class="${rar === 'fused' ? 'on' : ''}" data-r="fused" style="--cc:#ffd45e">✦ Fusionnées</button>${cfg.rarities.map(r => `<button class="${rar === r ? 'on' : ''}" data-r="${r}" style="--cc:var(--${r})">${RAR[r]}</button>`).join('')}</div>
      </div>
      <div class="bulk">
        <select id="bulk-r" aria-label="Rareté maximale">${tiers.map(t => `<option value="${t.r}" ${t.r === bulkDefault ? 'selected' : ''}>${RAR[t.r]} et moins · ${t.n} carte${t.n > 1 ? 's' : ''} · +${fmt(t.price)}</option>`).join('')}</select>
        <button class="plain" id="bulk-go">Vendre</button><button class="plain" id="fuse-all">Tout fusionner</button><button class="plain" id="selmode">Sélectionner</button></div>
      <div class="grid" id="g"></div>
      <div class="selbar" id="selbar" hidden><span id="selinfo2"></span><button class="plain" id="sel-cancel">Annuler</button><button id="sel-go">Défausser</button></div>`;
    // sélection multiple : un appui sur chaque carte, puis une seule défausse
    let selMode = false; const picked = new Map();
    const markPicked = root => root.querySelectorAll('.card').forEach(el => el.classList.toggle('picked', picked.has(+el.dataset.id)));
    const selSync = () => {
      const n = picked.size, gain = [...picked.values()].reduce((t, c) => t + sellValue(c), 0);
      $('#g').classList.toggle('selecting', selMode); $('#selmode').textContent = selMode ? 'Terminer' : 'Sélectionner';
      $('#selbar').hidden = !selMode; $('#selinfo2').innerHTML = n ? `<b>${n}</b> carte${n > 1 ? 's' : ''} · +${fmt(gain)} pièces` : 'Touche les cartes à défausser';
      $('#sel-go').disabled = !n; $('#sel-go').textContent = n ? `Défausser (${n})` : 'Défausser';
    };
    $('#selmode').onclick = () => { selMode = !selMode; if (!selMode) { picked.clear(); markPicked($('#g')); } selSync(); };
    $('#sel-cancel').onclick = () => { selMode = false; picked.clear(); markPicked($('#g')); selSync(); };
    $('#g').addEventListener('click', e => {                         // en mode sélection, un appui sur une carte la coche (étoile et boutons désactivés)
      if (!selMode) return;
      e.stopPropagation(); e.preventDefault();
      const el = e.target.closest('.card'); if (!el) return;
      const id = +el.dataset.id, c = P.items.find(x => x.id === id); if (!c) return;
      if (picked.has(id)) picked.delete(id); else picked.set(id, c);
      el.classList.toggle('picked', picked.has(id)); selSync();
    }, true);
    $('#sel-go').onclick = safe(async () => {
      const list = [...picked.values()]; if (!list.length) return;
      const gain = list.reduce((t, c) => t + sellValue(c), 0), last = list.filter(c => c.qty === 1).length;
      if (!(await ask(`Défausser ${list.length} carte${list.length > 1 ? 's' : ''} ?`, [], { text: `Un exemplaire de chaque pour ${fmt(gain)} pièces.${last ? ` ${last} ${last > 1 ? 'sont tes dernières' : 'est ta dernière'} (elles quitteront ta collection).` : ''}`, ok: 'Défausser' }))) return;
      const r = await api('/discard-many', { ids: list.map(c => c.id) }); toast(`${r.count} cartes défaussées, +${fmt(r.price)} pièces`); await refreshMe(); render();
    });
    // les cartes arrivent 40 par 40 depuis le serveur (tri et filtres faits par la base)
    const P = pager($('#g'), {
      fetchPage: cardPage(), root: null,
      tile: c => cardHtml(c, {
        lazy: true, star: true,
        extra: `<div class="meta">Défausse <b>${sellValue(c)}</b> · Marché <b>${c.avg_price ?? '—'}</b></div>`,
        acts: `<button class="plain" data-d="${c.id}">Défausser</button><button class="plain" data-a="${c.id}">Vendre</button>`,
      }),
      empty: p => p.fav ? 'Aucun favori pour l\'instant.<br>Touche l\'étoile ★ d\'une carte.' : 'Aucune carte ne correspond.',
      onPage: (page, box) => {
        lazyImages(box); markPicked(box);
        // photos manquantes : on retente en arrière-plan (Wikipédia, puis Wikidata) et on remplace seulement les cartes concernées
        const need = page.filter(c => !c.image && c.enriched < 2).slice(0, 20);
        if (need.length) api('/cards/enrich', { ids: need.map(c => c.id) }).then(({ cards: got }) => {
          for (const x of got) {
            const c = page.find(k => k.id === x.id); if (!c || !x.image) continue;
            c.image = x.image; c.extract ||= x.extract; c.enriched = x.enriched;
            const el = box.querySelector(`.card[data-id="${c.id}"]`); if (el) { el.outerHTML = cardHtml(c, { lazy: true, star: true, extra: `<div class="meta">Défausse <b>${sellValue(c)}</b> · Marché <b>${c.avg_price ?? '—'}</b></div>`, acts: `<button class="plain" data-d="${c.id}">Défausser</button><button class="plain" data-a="${c.id}">Vendre</button>` }); lazyImages(box); }
          }
        }).catch(() => {});
      },
    });
    const load = () => P.reset({ sort, ...(rar === 'fav' ? { fav: 1 } : rar === 'fused' ? { fused: 1 } : rar ? { rar } : {}), q, dup: dup ? 1 : '' });
    // un seul gestionnaire pour tous les boutons (les cartes arrivent par pages)
    $('#g').onclick = safe(async e => {
      const bd = e.target.closest('[data-d]'), ba = e.target.closest('[data-a]');
      if (bd) {
        const c = P.items.find(x => x.id == bd.dataset.d);
        if (c.qty === 1 && !(await ask('Défausser ?', [], { text: `Ta dernière « ${c.title} » pour ${sellValue(c)} pièces.`, ok: 'Défausser' }))) return;
        const r = await api('/discard', { card_id: c.id, qty: 1 }); toast(`+${r.price} pièces`); await refreshMe(); render();
      } else if (ba) await sellSheet(P.items.find(x => x.id == ba.dataset.a));
    });
    let t; $('#flt').oninput = e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(); }, 300); };
    $('#srt').onchange = e => { sort = e.target.value; load(); };
    $('#dup').onchange = e => { dup = e.target.checked; load(); };
    $('#chips').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      rar = albumFilter = b.dataset.r; $('#chips').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); load();
    };
    const bulkSync = () => { const t = tiers.find(x => x.r === $('#bulk-r').value); $('#bulk-go').disabled = !t.n; return t; };
    $('#bulk-r').onchange = bulkSync; bulkSync();
    $('#bulk-go').onclick = safe(async () => {
      const t = bulkSync(); if (!t.n) return;
      if (!(await ask('Vendre les doublons ?', [], { text: `${t.n} carte${t.n > 1 ? 's' : ''} jusqu'à « ${RAR[t.r]} » pour ${fmt(t.price)} pièces. Un exemplaire de chaque carte est conservé.`, ok: 'Vendre' }))) return;
      const r = await api('/discard-dupes', { max_rarity: t.r }); toast(`${r.count} cartes vendues, +${r.price} pièces`); await refreshMe(); render();
    });
    $('#fuse-all').onclick = safe(async () => {
      const p = await api('/fuse-all', { dry: 1 });
      if (!p.cards) return toast('Aucune carte n\'a assez de doublons à fusionner');
      if (!(await ask('Tout fusionner ?', [], { text: `${p.cards} carte${p.cards > 1 ? 's' : ''} gagnent ${p.levels} niveau${p.levels > 1 ? 'x' : ''} en consommant ${p.used} doublons. Un exemplaire de chaque carte est conservé.`, ok: 'Fusionner' }))) return;
      const r = await api('/fuse-all', {}); toast(`${r.cards} carte${r.cards > 1 ? 's' : ''} fusionnée${r.cards > 1 ? 's' : ''} (+${r.levels} niveau${r.levels > 1 ? 'x' : ''})`); render();
    });
    load();
  },

  async search(v) {
    v.innerHTML = `${pageHead('Recherche', 'Retrouve n\'importe quelle page de Wikipédia et sa rareté')}
      <div class="search wide">${ico('search')}<input id="gq" placeholder="Nom d'une page (ex. Tour Eiffel)" autocomplete="off" enterkeyhint="search"></div>
      <div id="gr" class="grid"><div class="empty" style="grid-column:1/-1">Tape au moins 2 lettres.<br>Les ${fmt(cfg.catalog)} pages du catalogue sont cherchables.</div></div>`;
    let timer = null, seq = 0;
    const run = async () => {
      const q = $('#gq').value.trim(), my = ++seq, box = $('#gr');
      if (q.length < 2) { box.innerHTML = '<div class="empty" style="grid-column:1/-1">Tape au moins 2 lettres.</div>'; return; }
      box.innerHTML = '<div class="empty" style="grid-column:1/-1">Recherche…</div>';
      try {
        const { cards } = await api('/catalog/search?q=' + encodeURIComponent(q));
        if (my !== seq) return;
        box.innerHTML = cards.length ? cards.map(c => cardHtml(c, { tag: c.owned ? `<span class="tag new">Possédée ×${c.owned}</span>` : '', extra: `<div class="meta">Rang <b>#${fmt(c.rank ?? 0)}</b></div>` })).join('')
          : '<div class="empty" style="grid-column:1/-1">Aucune page trouvée.</div>';
      } catch (e) { if (my === seq) box.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(e.message)}</div>`; }
    };
    $('#gq').oninput = () => { clearTimeout(timer); timer = setTimeout(run, 350); };
    $('#gq').onkeydown = e => { if (e.key === 'Enter') { clearTimeout(timer); run(); } };
  },

  async duel(v) {
    const { users } = await api('/users');
    const MODES = [['quiz', 'Quiz'], ['battle', 'Combat'], ['stake', 'Duel à la mise']];
    const INFO = {
      quiz: '<b>Duel de quiz</b> : 5 questions identiques pour les deux joueurs, les réponses rapides rapportent plus. Le gagnant empoche des pièces.',
      battle: '<b>Combat de cartes</b> : chacun choisit 3 cartes (PV de départ = somme de leurs DEF). À tour de rôle, un joueur attaque avec une carte et l\'autre répond à 3 questions sur son article : chaque mauvaise réponse coûte le tiers de l\'ATK. Le plus de PV à la fin gagne : +50 pièces (moitié moins contre un joueur simulé).',
      stake: '<b>Duel à la mise</b> : chacun mise <b>une carte</b>. Chaque carte attaque une fois, avec <b>6 questions</b> sur son article (chaque erreur coûte 1/6 de l\'ATK). Celui qui garde le plus de PV <b>remporte les deux cartes</b>, le perdant perd la sienne. Égalité : chacun reprend la sienne. Les cartes misées sont mises de côté pendant le duel.',
    };
    const label = { quiz: 'Défier', battle: 'Défier', stake: 'Miser une carte' };
    v.innerHTML = `${pageHead('Combats', 'Défie un joueur connecté')}
      <div class="seg" id="dm-seg">${MODES.map(([k, l]) => `<button data-dm="${k}" class="${k === duelMode ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="panel rulesd" style="margin-bottom:12px"><p class="mut" style="margin:0">${INFO[duelMode]}</p></div>
      ${duelMode === 'battle' ? `<button id="vs-bot" class="botbtn">${ico('sword')} Combat contre un joueur simulé</button>` : ''}
      <div class="list">${users.map(u => `<div class="item row1 tap ${u.me ? 'me' : ''}" data-pl="${u.id}">${avatar(u.name, online.has(u.id))}
        <div class="grow"><div class="nm">${esc(u.name)}${u.me ? ' (toi)' : ''}${ttl(u.name)}</div><div class="sub">${online.has(u.id) ? 'En ligne' : 'Hors ligne'}</div></div>
        ${u.me ? '' : `<div class="acts"><button data-id="${u.id}" data-mode="${duelMode}" ${online.has(u.id) ? '' : 'disabled'}>${label[duelMode]}</button></div>`}</div>`).join('')}</div>`;
    bindPlayers(v);
    $('#dm-seg').onclick = e => { const b = e.target.closest('[data-dm]'); if (!b) return; duelMode = b.dataset.dm; render(); };
    v.querySelectorAll('[data-id]').forEach(b => b.onclick = () => send({ t: 'challenge', to: +b.dataset.id, mode: b.dataset.mode }));
    $('#vs-bot')?.addEventListener('click', () => send({ t: 'challenge_bot' }));
  },

  async market(v) {
    const { auctions } = await api('/auctions');
    const cur = a => a.bid || a.start_price;
    const SORTS = {
      end: ['Bientôt terminées', (x, y) => x.ends_at - y.ends_at], recent: ['Plus récentes', (x, y) => y.id - x.id],
      up: ['Prix croissant', (x, y) => cur(x) - cur(y)], down: ['Prix décroissant', (x, y) => cur(y) - cur(x)],
      rar: ['Rareté', (x, y) => RANK[y.rarity] - RANK[x.rarity] || cur(y) - cur(x)], bids: ['Plus d\'offres', (x, y) => (y.bids || 0) - (x.bids || 0)],
    };
    const row = a => `<div class="item lot" style="--c:var(--${a.rarity})">
          <div class="thumb ${a.image ? '' : 'noimg'}" ${a.image ? `style="background-image:url('${esc(a.image)}')"` : ''}>${a.image ? '' : noimg(a)}<span class="chip" style="--c:var(--${a.rarity})">${ABBR[a.rarity]}</span></div>
          <div class="info"><div class="nm">${esc(a.title)}</div>
            <div class="sub"><span class="rar ${a.rarity}">${RAR[a.rarity]}</span><span>par ${esc(a.seller)}</span><span>prix moyen ${a.avg_price ?? '—'}</span><span>${a.bids || 0} offre${a.bids > 1 ? 's' : ''}</span></div>
            <div class="price">${ico('coin')}${cur(a)}<span class="mut" style="font-size:12px;font-weight:400;font-family:var(--f-body)">${a.bid ? `${esc(a.bidder)}${a.leading ? ' (toi)' : ''}` : 'mise de départ'}</span></div>
            <div class="time" data-end="${a.ends_at}">${ico('clock')}<span></span></div></div>
          <div class="acts" style="align-self:center">${a.mine ? '<span class="mut">Ta vente</span>' : a.leading ? '<span class="mut" style="color:var(--ok,#4ade80)">En tête</span>' : a.bidded ? '<span class="mut" style="color:#f87171">Dépassé</span>' : ''}<button class="${a.mine ? 'plain' : ''}" data-lot="${a.id}">${a.mine ? 'Voir' : 'Enchérir'}</button></div></div>`;
    v.innerHTML = `${pageHead('Marché', `${auctions.length} enchère${auctions.length > 1 ? 's' : ''} entre joueurs`)}${seg(MARKET_SEG, 'market')}
      <div class="toolbar mk">
        <div class="search">${ico('search')}<input id="mk-q" placeholder="Chercher une carte ou un vendeur" autocomplete="off" value="${esc(mk.q)}"></div>
        <select id="mk-s" aria-label="Tri">${Object.entries(SORTS).map(([k, [l]]) => `<option value="${k}" ${k === mk.sort ? 'selected' : ''}>Tri : ${l}</option>`).join('')}</select>
        <div class="chips" id="mk-c"><button data-f="" class="on">Toutes</button><button data-f="bid">Mes enchères (${auctions.filter(a => a.bidded || a.leading).length})</button><button data-f="lead">Je suis en tête</button><button data-f="mine">Mes ventes</button>${cfg.rarities.map(r => `<button data-f="${r}" style="--cc:var(--${r})">${RAR[r]}</button>`).join('')}</div>
      </div>
      <div class="list" id="lots"></div>`;
    const draw = () => {
      const q = mk.q.trim().toLowerCase();
      const list = auctions.filter(a => (!q || a.title.toLowerCase().includes(q) || a.seller.toLowerCase().includes(q))
        && (!mk.f || (mk.f === 'mine' ? a.mine : mk.f === 'lead' ? a.leading : mk.f === 'bid' ? (a.bidded || a.leading) : a.rarity === mk.f))).sort(SORTS[mk.sort][1]);
      $('#lots').innerHTML = list.length ? list.map(row).join('') : `<div class="empty">${auctions.length ? 'Aucune enchère ne correspond.' : 'Aucune enchère en cours.<br>Mets une carte en vente depuis ta collection.'}</div>`;
      $('#mk-c').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.f === mk.f));
      $('#lots').querySelectorAll('[data-lot]').forEach(b => b.onclick = safe(() => lotSheet(b.dataset.lot)));
      upd();
    };
    const upd = () => v.querySelectorAll('[data-end]').forEach(s => { const ms = s.dataset.end - Date.now(); s.querySelector('span').textContent = timeLeft(ms); s.classList.toggle('hot', ms < 60000); });
    bindSeg(v);
    $('#mk-q').oninput = e => { mk.q = e.target.value; draw(); };
    $('#mk-s').onchange = e => { mk.sort = e.target.value; draw(); };
    $('#mk-c').onclick = e => { const b = e.target.closest('button'); if (!b) return; mk.f = b.dataset.f; draw(); };
    draw(); tick = setInterval(upd, 1000);
  },

  async trades(v) {
    const [{ trades }, { users }] = await Promise.all([api('/trades'), api('/users')]);
    const others = users.filter(u => !u.me);
    let give = null, want = null;
    const slot = (c, label) => `<small>${label}</small>` + (c ? `<div class="tpick ${c.rarity}" style="--c:var(--${c.shiny ? 'shiny' : c.rarity})"><div class="pimg ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}><span class="chip">${ABBR[c.rarity]}</span></div><b>${esc(c.title)}</b></div><em>Changer</em>` : '<span class="plus">+</span><em>Choisir une carte</em>');
    v.innerHTML = `${pageHead('Marché', 'Échange des cartes avec un joueur')}${seg(MARKET_SEG, 'trades')}
      <div class="panel"><h3>Proposer un échange</h3>${others.length ? `<div class="tform">
        <select id="t-to" aria-label="Joueur">${others.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
        <div class="tslots"><button class="tslot" id="t-offs"></button><div class="tarrow" aria-hidden="true">⇄</div><button class="tslot" id="t-wants"></button></div>
        <button id="t-go" disabled>Proposer l'échange</button></div>` : '<p class="mut">Aucun autre joueur pour le moment.</p>'}</div>
      ` + (trades.length ? `<h3 class="sec">En attente</h3><div class="list">${trades.map(t => {
        const mine = t.from_id === me.id;
        return `<div class="item tap" data-pl="${mine ? t.to_id : t.from_id}">${avatar(mine ? t.to_name : t.from_name)}<div class="grow"><div class="nm">${mine ? 'Toi' : esc(t.from_name)} → ${mine ? esc(t.to_name) : 'toi'}</div>
          <div class="sub"><span><b style="color:var(--fg)">${esc(t.offer_title)}</b> contre <b style="color:var(--fg)">${esc(t.want_title)}</b></span></div></div>
          <div class="acts">${mine ? `<button class="plain" data-a="cancel" data-id="${t.id}">Annuler</button>` : `<button data-a="accept" data-id="${t.id}">Accepter</button><button class="plain" data-a="decline" data-id="${t.id}">Refuser</button>`}</div></div>`;
      }).join('')}</div>` : '<div class="empty">Aucun échange en attente.</div>');
    bindSeg(v); bindPlayers(v);
    if (others.length) {
      const paint = () => { $('#t-offs').innerHTML = slot(give, 'Tu donnes'); $('#t-wants').innerHTML = slot(want, 'Tu veux'); $('#t-go').disabled = !(give && want); };
      paint();
      $('#t-to').onchange = () => { want = null; paint(); };
      $('#t-offs').onclick = async () => { const c = await cardPicker('Quelle carte donnes-tu ?'); if (c) { give = c; paint(); } };
      $('#t-wants').onclick = safe(async () => {
        const id = +$('#t-to').value, name = others.find(u => u.id === id).name;
        const c = await cardPicker(`Quelle carte veux-tu à ${name} ?`, { user: id }); if (c) { want = c; paint(); }
      });
      $('#t-go').onclick = safe(async () => {
        await api('/trades', { to: $('#t-to').value, offer_card: give.id, want_card: want.id }); toast('Proposition envoyée'); render();
      });
    }
    v.querySelectorAll('[data-a]').forEach(b => b.onclick = safe(async () => { await api(`/trades/${b.dataset.id}/${b.dataset.a}`, {}); await refreshMe(); render(); }));
  },

  async friends(v) {
    const f = await api('/friends');
    const link = `${location.origin}/?friend=${f.code}`;
    v.innerHTML = `${pageHead('Amis', `${f.friends.length} ami${f.friends.length > 1 ? 's' : ''}`)}
      ${f.incoming.length ? `<div class="panel"><h3>Demandes reçues</h3><div class="list">${f.incoming.map(r => `<div class="item row1">${avatar(r.name)}<div class="grow"><div class="nm">${esc(r.name)}</div><div class="sub">veut devenir ton ami</div></div>
        <div class="acts"><button data-resp="${r.id}" data-ok="1">Accepter</button><button class="plain" data-resp="${r.id}">Refuser</button></div></div>`).join('')}</div></div>` : ''}
      <div class="panel addfriend"><h3>Ajouter un ami</h3>
        <div class="fr-add"><input id="fr-name" placeholder="Pseudo du joueur" autocapitalize="off" autocomplete="off"><button id="fr-send">Demander</button></div>
        ${f.outgoing.length ? `<p class="mut" style="margin:6px 0 0;font-size:12.5px">En attente : ${f.outgoing.map(r => esc(r.name)).join(', ')}</p>` : ''}
        <div class="qrrow"><div class="qrwrap" id="qr"></div>
          <div class="qrside"><p class="mut">Ton QR code : un ami qui le scanne devient ton ami tout de suite.</p>
            <button id="fr-scan">${ico('qr')} Scanner</button><button class="plain" id="fr-copy">Copier mon lien</button></div></div></div>
      <h3 class="sec">Mes amis</h3>
      ${f.friends.length ? `<div class="list">${f.friends.map(a => `<div class="item tap" data-pl="${a.id}">${avatar(a.name, a.online)}<div class="grow"><div class="nm">${esc(a.name)}${ttl(a.name)}${a.isNew ? '<span class="newtag">Nouveau</span>' : ''}</div><div class="sub">${a.online ? 'En ligne' : 'Hors ligne'}</div></div>
        <div class="acts"><button class="plain" data-rm="${a.id}">Retirer</button></div></div>`).join('')}</div>` : '<div class="empty">Aucun ami pour l\'instant.<br>Partage ton QR code ou envoie une demande par pseudo.</div>'}`;
    try { const qr = qrcode(0, 'M'); qr.addData(link); qr.make(); $('#qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch { $('#qr').textContent = link; }
    $('#fr-send').onclick = safe(async () => {
      const name = $('#fr-name').value.trim(); if (!name) return;
      const r = await api('/friends/request', { name });
      toast(r.status === 'friends' ? `${r.name} est maintenant ton ami` : `Demande envoyée à ${r.name}`); render();
    });
    $('#fr-scan').onclick = scanQr;
    $('#fr-copy').onclick = safe(async () => { await navigator.clipboard.writeText(link); toast('Lien copié'); });
    v.querySelectorAll('[data-resp]').forEach(b => b.onclick = safe(async () => {
      await api(`/friends/respond/${b.dataset.resp}`, { accept: !!b.dataset.ok }); await refreshMe(); render();
    }));
    v.querySelectorAll('[data-rm]').forEach(b => b.onclick = safe(async () => {
      if (!(await ask('Retirer cet ami ?', [], { ok: 'Retirer' }))) return;
      await api('/friends/remove', { id: +b.dataset.rm }); render();
    }));
    if (f.friends.some(a => a.isNew)) api('/friends/seen', {}).then(refreshMe).catch(() => {}); // efface la pastille rouge
  },

  async ach(v) {
    const { achievements: list } = await api('/achievements');
    const done = list.filter(a => a.done).length;
    v.innerHTML = `${pageHead('Succès', `${done} / ${list.length} débloqués`)}${seg(RANK_SEG, 'ach')}
      <div class="achlist">${list.map(a => `<div class="ach ${a.done ? 'done' : ''}"><div class="medal">${ico(a.done ? 'trophy' : 'shield')}</div>
        <div class="grow"><div class="nm">${esc(a.t)}</div><div class="sub">${esc(a.d)}</div>
          ${a.done ? '' : `<div class="bar"><i style="width:${Math.round(a.value / a.n * 100)}%"></i></div><div class="sub">${fmt(a.value)} / ${fmt(a.n)}</div>`}</div>
        <div class="rw">${ico('coin')}${a.r}</div></div>`).join('')}</div>`;
    bindSeg(v);
  },

  async rank(v) {
    const { players } = await api('/leaderboard');
    v.innerHTML = `${pageHead('Classement', 'Score = valeur des cartes uniques (selon la rareté) + 10 par victoire')}${seg(RANK_SEG, 'rank')}
      <div class="list">${players.map((p, i) => `<div class="item tap r${i + 1} ${p.id === me.id ? 'me' : ''}" data-pl="${p.id}"><span class="rank-n">${i + 1}</span>${avatar(p.name, online.has(p.id))}
        <div class="grow"><div class="nm">${esc(p.name)}${ttl(p.name)}</div><div class="sub"><span>${p.uniques} cartes</span><span>${p.wins} V / ${p.losses} D</span><span>${fmt(p.coins)} pièces</span></div></div>
        <div class="score">${fmt(p.score)}<small>points</small></div></div>`).join('')}</div>`;
    bindSeg(v); bindPlayers(v);
  },
};

// ---------- quiz & combat en cours ----------
let lastEvt = 0;
function gameEvent(m) {
  if (m.t === 'game_none') {                                       // le serveur n'a plus (ou pas) de partie pour moi
    if (game && game.view !== 'end') { game = null; toast('La partie a été interrompue (le serveur a redémarré). Aucune perte.'); render(); }
    return;
  }
  if (m.t === 'bf_error') { game = null; if (m.quota) showQuota(Date.now() + 1); toast(m.quota ? 'Limite de requêtes atteinte pour aujourd\'hui : le combat est annulé, sans perte.' : 'Erreur du serveur pendant le combat. Aucune perte : relance un combat.'); render(); return; }
  lastEvt = Date.now();
  tab = 'duel'; markTab();
  const t = m.time;                                                // `time` = temps restant (rejeu après reconnexion), `full` = durée totale pour la barre
  if (m.t === 'duel_start') { if (!(game && game.id === m.id && game.kind === 'quiz')) game = { kind: 'quiz', id: m.id, names: m.names, score: {}, view: 'wait' }; }
  else if (m.t === 'question') game = { ...game, view: 'q', q: { ...m, time: m.full ?? t }, picked: m.picked ?? null, reveal: null, end: Date.now() + t };
  else if (m.t === 'reveal') { game.reveal = m; game.score = m.score; }
  else if (m.t === 'duel_end') { game = { ...game, view: 'end', result: m }; refreshMe(); }
  else if (m.t === 'battle_start') { if (!(game && game.id === m.id && game.view === 'pick')) game = { kind: 'battle', id: m.id, names: m.names, rounds: m.rounds, view: 'pick', sel: [], tour: m.tour, stake: m.stake }; }
  else if (m.t === 'battle_wait') game = { ...game, kind: 'battle', id: m.id, view: 'wait', waitMsg: m.msg };
  else if (m.t === 'battle_prep') game = { ...game, view: 'wait', waitMsg: 'Préparation des questions…' };
  else if (m.t === 'bf_start') {
    game = { kind: 'fight', id: m.id, names: m.names, view: 'fight', f: { ...m, phase: 'intro' } };
    for (const c of Object.values(m.deck).flat()) if (c.image) new Image().src = c.image;   // photos déjà chargées quand les cartes apparaissent
  }
  else if (m.t === 'bf_turn') Object.assign(game.f, { turn: m.turn, attacker: m.attacker, defender: m.defender, left: m.left, hp: m.hp, phase: 'pick', card: null, q: null, res: null, picked: null, sent: false, summary: null, end: Date.now() + t, time: m.full ?? t });
  else if (m.t === 'bf_card') Object.assign(game.f, { card: m.card, hp: m.hp, phase: 'card' });
  else if (m.t === 'bf_q') Object.assign(game.f, { q: m, picked: null, sent: false, res: null, phase: 'q', end: Date.now() + t, time: m.full ?? t, hp: m.hp });
  else if (m.t === 'bf_picked') game.f.picked = m.choice;
  else if (m.t === 'bf_a') { Object.assign(game.f, { res: m, hp: m.hp, phase: 'a' }); if (!m.ok) fx = { kind: 'hit', m }; }
  else if (m.t === 'bf_turn_end') { Object.assign(game.f, { summary: m, hp: m.hp, phase: 'turnend' }); if (m.wrong >= 3) fx = { kind: 'fatal', m }; else if (m.wrong === 0) fx = { kind: 'wall', m }; }
  else if (m.t === 'bf_wait') { if (game?.f) game.f.wait = { names: m.names, until: m.until }; }
  else if (m.t === 'bf_resume') { if (game?.f) game.f.wait = null; }
  else if (m.t === 'bf_end') { game = { ...game, kind: 'fight', view: 'end', result: m }; refreshMe(); }
  else if (m.t === 'battle_cancel') game = null;
  renderGame();
  if (fx) { const e = fx; fx = null; if (game?.f) fightFx(e); }
}
// ---------- animations de combat : moqueries, tremblements, confettis ----------
let fx = null;
const pickOf = arr => arr[Math.floor(Math.random() * arr.length)];
const TAUNT = {
  miss: ['Raté 🤡', 'Même pas proche…', 'Aïe, ça pique 💀', 'Retourne réviser !', 'C\'était pourtant facile', 'Wikipédia pleure 😭'],
  hit: ['Touché 💥', 'Bien envoyé 🎯', 'Il a pas vu venir', 'Ça fait mal 😈'],
  fatal: ['FATALITY ☠️', 'HUMILIATION TOTALE', 'Zéro sur trois 🤡', 'Une vraie leçon 📚'],
  wall: ['Mur imprenable 🛡️', 'Rien ne passe !', 'Attaque ridicule 😴'],
};
function stamp(text, cls, ms = 1400) {
  const s = document.createElement('div'); s.className = 'fxstamp ' + cls; s.innerHTML = text; document.body.append(s); setTimeout(() => s.remove(), ms);
}
function rain(chars, n = 26, ms = 3200) {
  const box = document.createElement('div'); box.className = 'fxrain'; box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) { const e = document.createElement('i'); e.textContent = pickOf(chars); e.style.cssText = `left:${Math.random() * 100}%;animation-delay:${Math.random() * 1.4}s;animation-duration:${2 + Math.random() * 1.6}s;font-size:${18 + Math.random() * 22}px`; box.append(e); }
  document.body.append(box); setTimeout(() => box.remove(), ms + 1500);
}
function shake(el) { el?.classList.remove('shake'); void el?.offsetWidth; el?.classList.add('shake'); }
function fightFx({ kind, m }) {
  const f = game.f, iDef = f.defender === me.id, buzz = p => { try { navigator.vibrate?.(p); } catch { /* non supporté */ } };
  const nm = id => esc(game.names[id]);
  if (kind === 'hit') {
    shake($('#fshell'));
    if (iDef) { stamp(`${pickOf(TAUNT.miss)}<small>−${fmt(m.dmg)} PV</small>`, 'bad'); buzz([60, 30, 60]); }
    else { stamp(`${pickOf(TAUNT.hit)}<small>${nm(f.defender)} −${fmt(m.dmg)} PV</small>`, 'good'); buzz(25); }
  } else if (kind === 'fatal') {
    shake($('#fshell')); rain(iDef ? ['🤡', '💀', '🗑️'] : ['🔥', '💥', '⚔️'], 22);
    stamp(`${pickOf(TAUNT.fatal)}<small>${iDef ? 'Tu as tout raté…' : nm(f.defender) + ' n\'a rien vu venir'}</small>`, iDef ? 'bad big' : 'good big', 2000); buzz([100, 40, 100, 40, 200]);
  } else if (kind === 'wall') {
    stamp(`${pickOf(TAUNT.wall)}<small>${iDef ? 'Tu as tout bloqué' : nm(f.defender) + ' a tout bloqué'}</small>`, iDef ? 'good' : 'bad', 1500);
  }
}
/** Écran de fin : le gagnant triomphe, le perdant se fait chambrer. */
function endFx(r) {
  const win = r.winner === me.id, lose = r.winner !== null && !win;
  if (r.winner === null) return;
  const gap = Math.abs(r.hp[r.a] - r.hp[r.b]), crush = gap > .6 * Math.max(r.max[r.a], r.max[r.b]), hu = !!r.forfeit && lose;
  const top = win ? (crush ? pickOf(['ÉCRASÉ 🔥', 'DOMINATION TOTALE', 'FATALITY ☠️']) : pickOf(['GG 👑', 'VICTOIRE 🏆', 'Sans pitié 😎'])) : (hu ? 'FORFAIT 🐔' : crush ? pickOf(['HUMILIÉ 🤡', 'PULVÉRISÉ 💀', 'ANÉANTI 🗑️']) : pickOf(['PERDU 😭', 'DÉFAITE 🤡', 'Retente ta chance 🥲']));
  const sub = win ? `${esc(r.names[r.a === me.id ? r.b : r.a])} s'incline, ${fmt(gap)} PV d'écart` : `${esc(r.names[r.winner])} t'a mis ${fmt(gap)} PV d'écart${crush ? ' : c\'est la honte' : ''}`;
  rain(win ? ['🎉', '👑', '🏆', '✨', '🔥'] : ['🤡', '💩', '🍅', '😭', '🗑️'], 34, 4500);
  stamp(`${top}<small>${sub}</small>`, (win ? 'good' : 'bad') + ' big', 2800);
  try { navigator.vibrate?.(win ? [60, 30, 60, 30, 200] : [300, 100, 300]); } catch { /* non supporté */ }
  document.body.classList.add(win ? 'fx-win' : 'fx-lose'); setTimeout(() => document.body.classList.remove('fx-win', 'fx-lose'), 4500);
}
// surveillance : si plus rien n'arrive pendant une partie, on redemande l'état au serveur (et on abandonne s'il n'y a plus de partie)
setInterval(() => { if (game && game.view !== 'end' && game.view !== 'pick' && Date.now() - lastEvt > 40000) { lastEvt = Date.now(); if (ws?.readyState === 1) send({ t: 'sync' }); else connect(); } }, 5000);
/** Barre de temps animée par le navigateur (pas de minuteur JavaScript) : part du temps restant et se vide en continu. */
function runBar(el, remaining, full) {
  if (!el) return;
  el.style.transition = 'none'; el.style.width = Math.max(0, Math.min(100, remaining / full * 100)) + '%'; void el.offsetWidth;
  el.style.transition = `width ${Math.max(0, remaining)}ms linear`; el.style.width = '0%';
}
async function renderGame() {
  const v = $('#view'); clearInterval(tick);
  if (!game) return render();
  const names = o => Object.entries(game.names).map(([id, n]) => `${esc(n)} : <b>${o?.[id] ?? 0}</b>`).join(' · ');
  if (game.view === 'wait') return v.innerHTML = pageHead(game.kind === 'quiz' ? 'Duel de quiz' : 'Combat', game.waitMsg || 'Début dans un instant…');
  if (game.kind === 'quiz' && game.view === 'q') {
    const q = game.q, rv = game.reveal;
    v.innerHTML = `${pageHead(`Question ${q.n} / ${q.total}`)}<p class="mut">${names(game.score)}</p><div class="qbar"><i id="tb" style="width:100%"></i></div>
      <p style="white-space:pre-wrap">${esc(q.text)}</p>` + q.options.map((o, i) =>
        `<button class="opt ${rv ? (i === rv.answer ? 'ok' : (rv.picks[me.id] === i ? 'ko' : '')) : (game.picked === i ? 'sel' : '')}" data-i="${i}" ${rv || game.picked !== null ? 'disabled' : ''}>${esc(o)}</button>`).join('');
    v.querySelectorAll('.opt').forEach(b => b.onclick = () => { game.picked = +b.dataset.i; send({ t: 'answer', id: game.id, choice: game.picked }); renderGame(); });
    if (!rv) runBar($('#tb'), game.end - Date.now(), q.time); else $('#tb').style.width = '0%';
  } else if (game.kind === 'fight' && game.view === 'fight') {
    const f = game.f, nm = id => esc(game.names[id]), iAtt = f.attacker === me.id, iDef = f.defender === me.id;
    const bar = id => { const pct = Math.max(0, Math.round((f.hp[id] ?? 0) / (f.max[id] || 1) * 100)); return `<div class="hpb ${id === me.id ? 'me' : ''}" data-id="${id}"><div class="hpt"><span>${nm(id)}${id === me.id ? ' (toi)' : ''}</span><b>${fmt(f.hp[id] ?? 0)} PV</b></div><div class="hpbar"><i style="width:${pct}%"></i></div></div>`; };
    const mini = (c, cls = '', attrs = '') => `<div class="bcard ${c.lvl ? 'lv' + c.lvl : ''} ${cls}" ${attrs} style="--c:var(--${c.shiny ? 'shiny' : c.rarity})"><div class="bi ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}>${c.image ? '' : noimg(c)}</div>
      <b>${esc(c.title)}${c.lvl ? ` <span class="lvlst">★${c.lvl}</span>` : ''}</b><span class="st"><em>ATK <i>${fmt(c.atk)}</i></em><em>DEF <i>${fmt(c.def)}</i></em></span></div>`;
    const back = `<div class="bcard back"><div class="bi noimg">?</div><b>Carte cachée</b></div>`;
    const deckRow = id => `<div class="deckrow"><small>${nm(id)}</small><div>${f.deck[id].map(c => { const used = f.left?.[id] && !f.left[id].includes(c.id); return id === me.id || used ? mini(c, used ? 'used' : '') : back; }).join('')}</div></div>`;   // les cartes de l'adversaire restent cachées tant qu'il ne les a pas jouées
    let body = '';
    if (f.phase === 'intro') {
      body = `<p class="mut" style="text-align:center">Les decks sont prêts. ${nm(f.first)} attaque en premier.</p>${deckRow(f.a)}${deckRow(f.b)}`;
    } else if (f.phase === 'pick') {
      body = iAtt ? `<p class="bq-text">À toi d'attaquer : choisis une carte.</p><div class="qbar"><i id="tb" style="width:100%"></i></div>
        <div class="deckrow"><div>${f.deck[me.id].filter(c => f.left[me.id].includes(c.id)).map(c => mini(c, 'pickable', `data-card="${c.id}"`)).join('')}</div></div>${deckRow(f.defender)}`
        : `<p class="bq-text">${nm(f.attacker)} choisit une carte pour t'attaquer…</p><div class="qbar"><i id="tb" style="width:100%"></i></div>${deckRow(f.attacker)}${deckRow(me.id)}`;
    } else {
      const q = f.q, r = f.res, dots = [0, 1, 2].map(i => `<i class="${q && i < q.k - (r ? 0 : 1) ? 'done' : ''} ${q && i === q.k - 1 ? 'cur' : ''}"></i>`).join('');
      body = `<div class="atkcard">${mini(f.card)}<div class="atkinfo"><small>Attaque de ${nm(f.attacker)}</small><b>${fmt(f.card.atk)} ATK</b><span>−${fmt(Math.round(f.card.atk / 3))} PV par mauvaise réponse</span></div></div>`;
      if (q) {
        const right = r ? r.right : null;
        const res = r ? `<div class="bres ${r.ok ? 'win' : 'lose'}"><b>${r.ok ? 'Bonne réponse — aucun dégât' : `${f.picked === null ? 'Temps écoulé' : 'Mauvaise réponse'} — ${nm(f.defender)} perd ${fmt(r.dmg)} PV`}</b></div>` : '';
        body += `<p class="mut" style="margin:4px 0 2px">Question <b>${q.k} / ${q.kTotal}</b> · ${iDef ? 'tu réponds' : nm(f.defender) + ' répond'}</p>
          <p class="bq-text">${esc(q.text)}</p><div class="qbar"><i id="tb" style="width:${r ? 0 : 100}%"></i></div>${res}` +
          q.options.map((o, i) => `<button class="opt ${r ? (i === right ? 'ok' : (f.picked === i ? 'ko' : '')) : (f.picked === i ? 'sel' : '')}" data-i="${i}" ${(r || f.picked !== null || !iDef) ? 'disabled' : ''}>${esc(o)}</button>`).join('');
      }
      if (f.phase === 'turnend' && f.summary) body += `<div class="panel bres ${f.summary.wrong === 0 ? 'win' : ''}"><b>Fin de l'attaque</b><p>${f.summary.wrong} mauvaise${f.summary.wrong > 1 ? 's' : ''} réponse${f.summary.wrong > 1 ? 's' : ''} sur ${Q_PER_CARD_UI} : ${nm(f.defender)} perd ${fmt(f.summary.lost)} PV.</p></div>`;
    }
    // l'écran est monté une seule fois : ensuite on ne met à jour que les PV (avec animation) et la zone centrale
    let sh = v.querySelector('#fshell');
    if (!sh || sh.dataset.gid !== game.id) {
      v.innerHTML = `${pageHead('Combat')}<div id="fshell" data-gid="${game.id}"><div class="bwait" id="fwait" hidden></div><div class="hpwrap">${bar(f.a)}${bar(f.b)}</div><p class="mut" id="fturn" style="text-align:center;margin:4px 0 8px"></p><div id="fbody"></div></div>`;
      sh = v.querySelector('#fshell');
    } else {
      for (const id of [f.a, f.b]) {
        const el = sh.querySelector(`.hpb[data-id="${id}"]`), nv = f.hp[id] ?? 0, old = +el.dataset.hp;
        el.querySelector('.hpbar i').style.width = Math.max(0, Math.round(nv / (f.max[id] || 1) * 100)) + '%';
        el.querySelector('.hpt b').textContent = fmt(nv) + ' PV';
        if (old > nv) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); const d = document.createElement('em'); d.className = 'dmgpop'; d.textContent = '−' + fmt(old - nv); el.append(d); setTimeout(() => d.remove(), 1100); }
      }
    }
    for (const id of [f.a, f.b]) sh.querySelector(`.hpb[data-id="${id}"]`).dataset.hp = f.hp[id] ?? 0;
    $('#fturn').textContent = f.turn ? `Tour ${f.turn} / ${f.total}` : '';
    const fb = $('#fbody'), key = f.turn + ':' + (f.phase === 'q' || f.phase === 'a' ? 'q' + f.q?.k : f.phase);
    fb.innerHTML = body;
    if (fb.dataset.key !== key) { fb.dataset.key = key; fb.classList.remove('fin'); void fb.offsetWidth; fb.classList.add('fin'); }
    fb.querySelectorAll('[data-card]').forEach(el => el.onclick = () => {
      if (f.sent) return; f.sent = true; el.classList.add('chosen');
      send({ t: 'bf_pick', id: game.id, card: +el.dataset.card });
    });
    fb.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (f.picked !== null || f.sent) return; f.picked = +b.dataset.i; f.sent = true;
      fb.querySelectorAll('.opt').forEach(x => { x.disabled = true; x.classList.toggle('sel', x === b); });   // réaction immédiate, sans attendre le serveur
      send({ t: 'bf_answer', id: game.id, choice: f.picked });
    });
    if (f.end && (f.phase === 'pick' || (f.phase === 'q' && !f.res))) runBar($('#tb'), f.end - Date.now(), f.time);
    // adversaire déconnecté : le combat est en pause, personne n'est pénalisé ; compte à rebours avant forfait
    const fw = $('#fwait');
    if (f.wait) {
      const paint = () => { const s = Math.max(0, Math.round((f.wait.until - Date.now()) / 1000)); fw.hidden = false; fw.innerHTML = `<b>⏸ Combat en pause</b><span>${esc(f.wait.names.join(' et '))} ${f.wait.names.length > 1 ? 'sont déconnectés' : 'est déconnecté'}. On ${f.wait.names.length > 1 ? 'les' : 'l\''}attend encore ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s.</span>`; };
      paint(); tick = setInterval(paint, 1000);
    } else fw.hidden = true;
  } else if (game.kind === 'battle' && game.view === 'pick') {
    const known = new Map();                       // cartes vues (pour afficher le nom des cartes choisies même après un changement de filtre)
    let q = '', rf = '', t;
    v.innerHTML = `${pageHead(game.stake ? 'Duel à la mise — choisis la carte que tu mises' : `${game.tour || 'Combat'} — choisis ${game.rounds} cartes`)}${game.stake ? '<p class="mut" style="margin:-10px 0 10px">Si tu perds, tu perds cette carte. Si tu gagnes, tu gardes la tienne et prends celle de ton adversaire.</p>' : ''}
      <p class="mut" id="selinfo" style="margin:0 0 8px"></p>
      <div class="sticky-bar"><button id="go" disabled>Valider le deck</button></div>
      <div class="search wide">${ico('search')}<input id="pq" placeholder="Chercher parmi tes cartes" autocomplete="off"></div>
      <div class="chips" id="pchips" style="margin-bottom:10px"><button class="on" data-r="">Toutes</button>${cfg.rarities.map(r => `<button data-r="${r}" style="--cc:var(--${r})">${RAR[r]}</button>`).join('')}</div>
      <div class="grid" id="pg"></div>`;
    // aucune redessinée complète à chaque clic : on ne met à jour que les cartes concernées
    const mark = () => {
      $('#selinfo').innerHTML = game.sel.length ? `PV de départ = somme des DEF. Deck : <b>${game.sel.map(id => esc(known.get(id)?.title ?? '…')).join(' · ')}</b>` : 'Tes PV de départ sont la somme des DEF de tes 3 cartes. Tu choisis en même temps que l\'adversaire.';
      $('#go').disabled = game.sel.length !== game.rounds; $('#go').textContent = `Valider le deck (${game.sel.length}/${game.rounds})`;
      $('#pg').querySelectorAll('.card').forEach(el => {
        const i = game.sel.indexOf(+el.dataset.id); el.classList.toggle('sel', i >= 0);
        let n = el.querySelector('.pickno');
        if (i >= 0) { if (!n) { n = document.createElement('span'); n.className = 'pickno'; el.append(n); } n.textContent = i + 1; } else n?.remove();
      });
    };
    const P = pager($('#pg'), { fetchPage: cardPage(), tile: c => (known.set(c.id, c), cardHtml(c, { cls: 'pick', lazy: true })), onPage: (page, box) => { lazyImages(box); mark(); } });
    const fill = () => P.reset({ sort: 'rar', rar: rf, q });
    $('#pg').onclick = e => {
      const el = e.target.closest('.card'); if (!el) return;
      const id = +el.dataset.id, i = game.sel.indexOf(id);
      if (i >= 0) game.sel.splice(i, 1); else if (game.sel.length < game.rounds) game.sel.push(id);
      mark();
    };
    $('#pq').oninput = e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); fill(); }, 300); };
    $('#pchips').onclick = e => { const b = e.target.closest('button'); if (!b) return; rf = b.dataset.r; $('#pchips').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); fill(); };
    $('#go').onclick = () => { send({ t: 'pick', id: game.id, cards: game.sel }); v.innerHTML = pageHead('Combat', 'Deck validé, en attente de l’adversaire…'); };
    mark(); fill();
  } else if (game.view === 'end') {
    const r = game.result;
    if (game.kind === 'quiz') {
      v.innerHTML = `${pageHead(r.winner === null ? 'Égalité' : r.winner === me.id ? 'Victoire' : 'Défaite')}<div class="panel">${names(r.score)}</div><button id="back">Retour</button>`;
    } else {
      if (!r.fxDone) { r.fxDone = true; endFx(r); }
      const bar = id => `<div class="hpb ${id === me.id ? 'me' : ''}"><div class="hpt"><span>${esc(r.names[id])}${id === me.id ? ' (toi)' : ''}</span><b>${fmt(r.hp[id])} / ${fmt(r.max[id])} PV</b></div><div class="hpbar"><i style="width:${Math.round(r.hp[id] / (r.max[id] || 1) * 100)}%"></i></div></div>`;
      const sk = r.stake?.cards ? `<div class="panel stakeres"><h3>${r.winner === null ? 'Chacun reprend sa carte' : r.winner === me.id ? 'Tu remportes la carte de ' + esc(r.names[r.winner === r.a ? r.b : r.a]) : 'Tu perds ta carte'}</h3><p class="mut" style="margin:0">${[r.a, r.b].map(u => `${esc(r.names[u])} : <b>${esc(r.stake.cards[u].title)}</b>`).join(' · ')}</p></div>` : '';
      v.innerHTML = `<div class="endwrap ${r.winner === null ? '' : r.winner === me.id ? 'won' : 'lost'}">${pageHead(r.winner === null ? 'Égalité' : r.winner === me.id ? 'Victoire 👑' : 'Défaite 🤡')}</div><div class="hpwrap">${bar(r.a)}${bar(r.b)}</div>${sk}
        <p class="mut" style="text-align:center">${r.winner === null ? 'Autant de PV de chaque côté.' : (r.forfeit ? `${esc(r.names[r.forfeit])} a quitté la partie : ${esc(r.names[r.winner])} gagne par forfait.` : `${esc(r.names[r.winner])} termine avec le plus de PV.`)}</p><p><button id="back" style="margin-top:12px">Retour</button></p>`;
    }
    $('#back').onclick = () => { const tr = game.result?.tour; game = null; if (tr) tab = 'tournaments'; render(); };
  }
}

// ---------- amis : notification à l'écran + pastille rouge ----------
let bannerTimer;
function banner(title, text, onclick) {
  const b = $('#banner');
  b.hidden = false; b.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  b.onclick = () => { b.hidden = true; onclick?.(); };
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 7000);
}
function onFriend(m) {
  const text = { request: `${m.name} t'a envoyé une demande d'ami`, added: `${m.name} t'a ajouté en ami`, accepted: `${m.name} a accepté ta demande d'ami` }[m.kind];
  banner('Amis', text, () => { game = null; tab = 'friends'; render(); });
  try { navigator.vibrate?.(30); } catch { /* non supporté */ }
  refreshMe().catch(() => {});
  if (tab === 'friends' && !game) render();
}
/** Ajoute un ami grâce au code secret lu dans son QR code. */
async function addByCode(code) {
  try {
    const r = await api('/friends/add-code', { code });
    toast(r.status === 'already' ? `${r.name} est déjà ton ami` : `${r.name} ajouté en ami !`);
    game = null; tab = 'friends'; render();
  } catch (e) { toast(e.message); }
}
function parseScannedCode(raw) {
  const txt = String(raw || '').trim();
  try { const c = new URL(txt).searchParams.get('friend'); if (c) return c; } catch { /* pas une URL */ }
  const m = txt.match(/friend=([a-f0-9]{6,})/i);
  if (m) return m[1];
  return /^[a-f0-9]{8,12}$/i.test(txt) ? txt : '';
}
let jsqrPromise = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return (jsqrPromise ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'jsQR.js'; s.onload = () => res(window.jsQR); s.onerror = () => { jsqrPromise = null; rej(new Error('jsQR')); };
    document.head.append(s);
  }));
}
let scan = null; // { stream, raf, active }
function stopScanner() {
  if (!scan) return;
  scan.active = false; cancelAnimationFrame(scan.raf);
  scan.stream?.getTracks().forEach(t => t.stop());
  const v = $('#scan-video'); if (v) v.srcObject = null;
  $('#scan-overlay').hidden = true; scan = null;
}
async function scanQr() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Caméra indisponible ici : utilise l’appareil photo de ton téléphone sur le QR code de ton ami.');
  const ov = $('#scan-overlay'), video = $('#scan-video'), hint = $('#scan-hint');
  scan = { stream: null, raf: 0, active: true };
  const current = scan;
  ov.hidden = false; hint.textContent = 'Autorise l’accès à la caméra…';
  $('#scan-close').onclick = stopScanner;
  try {
    try { current.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
    catch (e) { if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e; current.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
  } catch (e) {
    stopScanner();
    return toast(e.name === 'NotAllowedError' ? 'Accès à la caméra refusé : autorise-le dans les réglages du navigateur.' : 'Impossible d’ouvrir la caméra.');
  }
  if (!current.active) { current.stream.getTracks().forEach(t => t.stop()); return; }  // fermé pendant l'autorisation
  video.setAttribute('playsinline', ''); video.muted = true;
  video.srcObject = current.stream;
  try { await video.play(); } catch { /* lecture automatique bloquée : la vidéo démarrera au toucher */ }
  hint.textContent = 'Vise le QR code de ton ami';
  const found = raw => {
    const code = parseScannedCode(raw);
    if (!code) { hint.textContent = 'QR code non reconnu, réessaie'; return false; }
    try { navigator.vibrate?.(20); } catch { /* non supporté */ }
    stopScanner(); addByCode(code); return true;
  };
  let detector = null;
  if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch { /* repli sur jsQR */ } }
  if (detector) {                                   // Chrome / Android
    const tick = async () => {
      if (!current.active) return;
      try { const r = await detector.detect(video); if (r.length && found(r[0].rawValue)) return; } catch { /* image pas prête */ }
      current.raf = requestAnimationFrame(tick);
    };
    current.raf = requestAnimationFrame(tick);
    return;
  }
  let jsQR;                                         // iPhone / Safari / Firefox : décodage image par image avec jsQR
  try { jsQR = await loadJsQR(); } catch { stopScanner(); return toast('Scanner indisponible : utilise l’appareil photo de ton téléphone.'); }
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if (!current.active) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
      const w = canvas.width = video.videoWidth, h = canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, w, h);
      try { const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); if (r?.data && found(r.data)) return; } catch { /* image illisible */ }
    }
    current.raf = requestAnimationFrame(tick);
  };
  current.raf = requestAnimationFrame(tick);
}

// ---------- bandeau des tirages légendaires ----------
function showHits(list) {
  if (!list.length) return;
  const h = list[0];
  $('#hits-text').classList.remove('mut');
  $('#hits-text').textContent = list.slice(0, 3).map(x => `${x.user} a obtenu ${x.title}${x.shiny ? ' (shiny)' : ''}`).join('   ·   ');
}
const recentHits = [];

// ---------- squelette ----------
const EXTRA = new Set(['search', 'rank', 'msg', 'friends', 'more']);   // onglets rangés sous « Plus » sur téléphone
function markTab() { const g = GROUP[tab]; document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === g || (b.dataset.tab === 'more' && EXTRA.has(g)))); }
/** Copie l'en-tête de chaque colonne dans les cellules (data-label) : le CSS mobile affiche les lignes comme des fiches. */
function labelTables(root) {
  root.querySelectorAll('table').forEach(t => {
    const heads = [...t.querySelectorAll('tr:first-child th')].map(h => h.textContent.trim());
    if (!heads.length) return;
    t.querySelectorAll('tr').forEach(tr => [...tr.children].forEach((td, i) => { if (td.tagName === 'TD' && heads[i]) td.dataset.label = heads[i]; }));
  });
}
// Page qui tient dans l'écran : on verrouille le défilement (plus de rebond ni de ligne cachée). Se recalcule dès que la hauteur change.
function fitLock() {
  const el = document.documentElement, fits = !game && el.scrollHeight <= innerHeight + 1;
  if (fits !== el.classList.contains('fit')) el.classList.toggle('fit', fits);   // pas de bascule inutile (elle faisait re-calculer la mise en page)
}
if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => fitLock()); ro.observe(document.querySelector('#view')); ro.observe(document.querySelector('#app')); }
document.fonts?.ready.then(() => fitLock());
window.addEventListener('resize', fitLock); document.addEventListener('toggle', fitLock, true);
const Q_PER_CARD_UI = 3;
const SKELETON = '<div class="skel"><i class="sk-h"></i><i class="sk-p"></i><div class="sk-g"><i></i><i></i><i></i><i></i></div></div>';
// ---------- administration : tableau de bord d'activité et journal de contrôle ----------
const ko = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' Go' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + ' Ko';
const localHour = (day, h) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h)).getHours();
let statsSort = 'ops';
async function adminStats(box, day) {
  const d = await api('/admin/stats' + (day ? '?day=' + day : ''));
  const t = d.total, trips = t.tr || 0, avg = trips ? Math.round((t.ms || 0) / trips) : 0, GO5 = 5e9;
  const card = (k, v, sub = '') => `<div><span>${k}</span><b>${v}</b>${sub ? `<small class="mut">${sub}</small>` : ''}</div>`;
  const hours = Array.from({ length: 24 }, (_, h) => d.hours.find(x => +x.k === h) ?? { k: h });
  const peak = Math.max(1, ...hours.map(h => (h.nr || 0) + (h.nw || 0)));
  const METRICS = { ops: ['Instructions', x => (x.nr || 0) + (x.nw || 0)], rq: ['Requêtes', x => x.rq || 0], nw: ['Écritures', x => x.nw || 0], nr: ['Lectures', x => x.nr || 0], by: ['Données', x => x.by || 0], ms: ['Temps base', x => x.ms || 0] };
  const val = (m, x) => m === 'by' ? ko(x.by || 0) : m === 'ms' ? ((x.ms || 0) / 1000).toFixed(1) + ' s' : fmt(METRICS[m][1](x));
  const rank = (title, list) => {
    const f = METRICS[statsSort][1], rows = list.filter(x => f(x) > 0).sort((p, q) => f(q) - f(p)).slice(0, 12), top = Math.max(1, ...rows.map(f));
    return `<h3 class="sec">${title}</h3><div class="stlist">${rows.map(x => `<div class="strow" style="--p:${Math.round(f(x) / top * 100)}%"><div class="stn">${esc(x.k)}</div><b>${val(statsSort, x)}</b>
      <small>${fmt(x.rq || 0)} req · ${fmt(x.tr || 0)} trajets · ${fmt(x.nr || 0)} lect. · ${fmt(x.nw || 0)} écr. · ${ko(x.by || 0)}${x.tr ? ` · ${Math.round((x.ms || 0) / x.tr)} ms/trajet` : ''}${x.e5 ? ` · <i class="bad">${x.e5} erreur(s)</i>` : ''}</small></div>`).join('') || '<p class="mut">Rien pour l\'instant.</p>'}</div>`;
  };
  box.innerHTML = `<div class="chips" id="st-days" style="margin-bottom:8px;overflow-x:auto">${d.perDay.slice().reverse().map(p => `<button data-day="${p.day}" class="${p.day === d.day ? 'on' : ''}">${p.day.slice(8)}/${p.day.slice(5, 7)} · ${fmt(p.rq || 0)}</button>`).join('')}</div>
    <p class="mut" style="margin:0 0 8px;font-size:12.5px">Jour UTC ${esc(d.day)} (de 2 h à 2 h en France). Les chiffres arrivent avec environ une minute de retard ; on garde 14 jours d'historique.</p>
    <div class="admgrid">
      ${card('Requêtes HTTP', fmt(t.rq || 0), `${fmt(t.e5 || 0)} erreur(s) serveur · ${fmt(t.e4 || 0)} refus · ${fmt(t.slow || 0)} lente(s)`)}
      ${card('Allers-retours Supabase', fmt(trips), avg ? `${avg} ms en moyenne` : '')}
      ${card('Lectures (SELECT)', fmt(t.nr || 0), `${fmt(t.r || 0)} lignes renvoyées`)}
      ${card('Écritures', fmt(t.nw || 0), `${fmt(t.w || 0)} lignes touchées`)}
      ${card('Données renvoyées', ko(t.by || 0), 'transfert sortant estimé')}
      ${card('Ce mois-ci', ko(d.monthBytes || 0), `sur 5 Go gratuits (${Math.min(100, Math.round((d.monthBytes || 0) / GO5 * 100))} %)`)}
    </div>
    <h3 class="sec">Activité par heure <span class="mut" style="font-weight:400;font-size:12px">(<i class="lg r"></i> lectures <i class="lg w"></i> écritures, heure locale)</span></h3>
    <div class="hbars">${hours.map(h => { const lh = localHour(d.day, +h.k), nr = h.nr || 0, nw = h.nw || 0; return `<div title="${lh} h : ${fmt(h.rq || 0)} requêtes, ${fmt(nr)} lectures, ${fmt(nw)} écritures, ${ko(h.by || 0)}"><i class="w" style="height:${nw / peak * 100}%"></i><i class="r" style="height:${nr / peak * 100}%"></i><em>${lh % 3 ? '' : lh}</em></div>`; }).join('')}</div>
    <div class="chips wrap" id="st-sort" style="margin:12px 0 0">${Object.entries(METRICS).map(([k, [l]]) => `<button data-s="${k}" class="${k === statsSort ? 'on' : ''}">Trier : ${l}</button>`).join('')}</div>
    ${rank('Par joueur', d.users)}${rank('Par action', d.routes)}${rank('Par requête SQL', d.queries)}`;
  $('#st-days').onclick = e => { const b = e.target.closest('[data-day]'); if (b) adminStats(box, b.dataset.day).catch(x => toast(x.message)); };
  $('#st-sort').onclick = e => { const b = e.target.closest('[data-s]'); if (b) { statsSort = b.dataset.s; adminStats(box, d.day).catch(x => toast(x.message)); } };
}
const LOGF = { '': ['Tout', ''], error: ['Erreurs', 'level=error'], warn: ['Alertes', 'level=warn'], action: ['Actions', 'kind=action'], admin: ['Admin', 'kind=admin'], cron: ['Tâche planifiée', 'kind=cron'] };
let logFilter = '', logQuery = '';
async function adminLogs(box, before = 0, append = false) {
  const qs = `${LOGF[logFilter][1]}${logQuery ? '&q=' + encodeURIComponent(logQuery) : ''}${before ? '&before=' + before : ''}`;
  const d = await api('/admin/logs?' + qs);
  const day0 = new Date().toDateString();
  const row = e => { const dt = new Date(+e.ts); return `<div class="lg-${e.level}"><b>${dt.toDateString() === day0 ? '' : dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' '}${hms(dt)}</b> <span class="lv ${e.level}">${e.level === 'error' ? 'ERREUR' : e.level === 'warn' ? 'ALERTE' : e.kind === 'admin' ? 'ADMIN' : 'info'}</span> ${e.usr ? `<u>${esc(e.usr)}</u> ` : ''}<code>${esc(e.route)}</code>${e.status ? ` <span class="${e.status >= 400 ? 'bad' : ''}">${e.status}</span>` : ''}${e.ms ? ` <small>${e.ms} ms</small>` : ''}${e.detail ? ` <em>${esc(e.detail)}</em>` : ''}</div>`; };
  if (!append) {
    box.innerHTML = `<div class="chips wrap" id="lg-f" style="margin-bottom:8px">${Object.entries(LOGF).map(([k, [l]]) => `<button data-f="${k}" class="${k === logFilter ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="search wide" style="margin-bottom:8px">${ico('search')}<input id="lg-q" placeholder="Joueur, action ou texte" autocomplete="off" value="${esc(logQuery)}"></div>
      <p class="mut" style="margin:0 0 6px;font-size:12.5px">24 dernières heures : <b class="bad">${d.last24h.error || 0}</b> erreur(s) · <b>${d.last24h.warn || 0}</b> alerte(s) · ${d.last24h.info || 0} action(s). Journal conservé 14 jours. <button class="plain" id="lg-r" style="padding:4px 10px;margin-left:6px">Actualiser</button></p>
      <div class="jlog logbox" id="lg-box"></div>`;
    $('#lg-f').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { logFilter = b.dataset.f; adminLogs(box).catch(x => toast(x.message)); } };
    let tm; $('#lg-q').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { logQuery = e.target.value.trim(); adminLogs(box).catch(x => toast(x.message)); }, 350); };
    $('#lg-r').onclick = () => adminLogs(box).catch(x => toast(x.message));
  }
  const lb = $('#lg-box'); lb.querySelector('.more')?.remove();
  lb.insertAdjacentHTML('beforeend', d.logs.map(row).join('') || (append ? '' : '<p class="mut">Aucune entrée.</p>'));
  if (d.logs.length >= 100) { lb.insertAdjacentHTML('beforeend', '<button class="plain more" style="margin:8px 0">Plus ancien</button>'); lb.querySelector('.more').onclick = () => adminLogs(box, d.logs.at(-1).id, true).catch(x => toast(x.message)); }
}
let adminTab = 'overview';   // l'onglet « Joueurs » (pièces, paquets, cartes, taux) a été retiré
views.admin = async v => {
  jlog('ouverture de l\'administration');
  if (!me.admin) { jlog('administration refusée : compte non admin'); toast('Ce compte n\'est pas administrateur.'); tab = 'packs'; return render(); }
  const seg = [['overview', 'Aperçu'], ['stats', 'Tableau de bord'], ['logs', 'Journal'], ['market', 'Enchères'], ['announce', 'Annonce'], ['tools', 'Outils']];
  v.innerHTML = `${pageHead('Administration', `Build ${BUILD}`)}<div class="chips wrap" id="adm-tabs" style="margin-bottom:12px">${seg.map(([k, l]) => `<button data-k="${k}" class="${k === adminTab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="adm"></div>`;
  $('#adm-tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; adminTab = b.dataset.k; $('#adm-tabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); adminBody(); };
  const adminBody = async () => {
    const box = $('#adm'); box.innerHTML = '<p class="mut" style="text-align:center;padding:24px 0">Chargement…</p>';
    try { await adminLoad(box); } catch (e) { jlog('administration : ' + e.message); box.innerHTML = `<div class="panel"><b>Impossible de charger</b><p class="mut">${esc(e.message)}</p><button id="adm-retry">Réessayer</button></div>`; $('#adm-retry').onclick = adminBody; }
  };
  const adminLoad = async box => {
    if (adminTab === 'overview') {
      const o = await api('/admin/overview');
      const rows = [['Joueurs', o.users], ['En ligne maintenant', o.online], ['Joueurs simulés', o.bots], ['Paquets ouverts', fmt(o.packs)], ['Cartes possédées', fmt(o.owned)], ['Cartes en base', fmt(o.cards)], ['Pièces en circulation', fmt(o.coins)],
        ['Enchères ouvertes', o.auctions], ['Offres placées', fmt(o.bids)], ['Appareils notifiés', o.subs], ['Réserve de cartes prêtes', o.reserve], ['Questions IA (articles)', fmt(o.quizzes)], ['Questions IA aujourd\'hui', `${o.aiToday} / ≈ 250`], ['Version serveur', o.version]];
      box.innerHTML = `<div class="admgrid">${rows.map(([k, x]) => `<div><span>${k}</span><b>${x}</b></div>`).join('')}</div>`;
    } else if (adminTab === 'users') {
      const { users, defaults, rarities, labels } = await api('/admin/users');
      const pct = w => { const t = rarities.reduce((s, r) => s + (+w[r] || 0), 0) || 1; return r => +((+w[r] || 0) / t * 100).toFixed(2); };
      box.innerHTML = users.map(u => `<div class="admuser" data-id="${u.id}"><div class="admhead"><b>${esc(u.name)}</b>${u.admin ? ' <small>admin</small>' : ''}${u.drop ? ' <small class="cust">taux perso</small>' : ''}<span class="dot ${u.online ? 'on' : ''}"></span><small>${u.online ? 'en ligne' : ''}</small></div>
        <p class="mut">${fmt(u.coins)} pièces · ${u.packs} paquets · ${u.cards} cartes · ${u.packs_opened} ouverts · ${u.wins}V/${u.losses}D · ${u.devices} appareil${u.devices > 1 ? 's' : ''} notifié${u.devices > 1 ? 's' : ''}</p>
        <div class="admrow"><input type="number" inputmode="numeric" min="0" placeholder="pièces" class="a-c"><input type="number" inputmode="numeric" min="0" placeholder="paquets" class="a-p"></div>
        <div class="admrow"><button class="a-give">Donner</button><button class="plain a-take">Retirer</button></div>
        <div class="admrow"><button class="plain a-cards">Cartes…</button><button class="plain a-drop">Taux de drop…</button></div>
        <div class="admrow">${u.admin ? `<button class="plain a-test">Mode test : ${u.test ? 'oui' : 'non'}</button>` : ''}<button class="plain a-pw">Mot de passe</button></div>
        <div class="admpanel" hidden></div></div>`).join('');
      const panel = (card, kind) => { const p = card.querySelector('.admpanel'), same = p.dataset.kind === kind && !p.hidden; p.hidden = same; p.dataset.kind = same ? '' : kind; return same ? null : p; };
      const cardList = async (p, id) => {
        const q = p.querySelector('.ac-q').value.trim(), r = await api(`/admin/cards?user_id=${id}&q=${encodeURIComponent(q)}`);
        p.querySelector('.ac-list').innerHTML = (r.cards.map(c => `<div class="acrow" data-cid="${c.id}"><span class="acn"><i class="rd" style="background:var(--${c.shiny ? 'shiny' : c.rarity})"></i>${esc(c.title)}${c.shiny ? ' ✦' : ''}</span><b>×${c.qty}</b><button class="plain ac-1">−1</button><button class="plain ac-all">Tout</button></div>`).join('')) || '<p class="mut">Aucune carte.</p>';
        p.querySelector('.ac-info').textContent = `${fmt(r.total.n)} carte${r.total.n > 1 ? 's' : ''} au total, ${fmt(r.total.u)} différente${r.total.u > 1 ? 's' : ''}${r.cards.length === 40 ? ' · 40 premières affichées, précise ta recherche' : ''}`;
      };
      box.onclick = safe(async e => {
        const card = e.target.closest('.admuser'); if (!card) return; const id = +card.dataset.id, u = users.find(x => x.id === id);
        const num = c => Math.abs(+card.querySelector(c).value || 0);
        if (e.target.closest('.a-give') || e.target.closest('.a-take')) {
          const sign = e.target.closest('.a-take') ? -1 : 1, coins = num('.a-c') * sign, packs = num('.a-p') * sign;
          if (!coins && !packs) return toast('Indique des pièces et/ou des paquets');
          if (sign < 0 && !confirm(`Retirer ${num('.a-c') ? num('.a-c') + ' pièces ' : ''}${num('.a-p') ? num('.a-p') + ' paquets ' : ''}à ${u.name} ?`)) return;
          await api('/admin/give', { user_id: id, coins, packs }); toast(`${u.name} : mis à jour`); adminBody();
        } else if (e.target.closest('.a-test')) { await api('/admin/test-mode', { user_id: id, on: !u.test }); adminBody(); }
        else if (e.target.closest('.a-pw')) {
          const pw = prompt(`Nouveau mot de passe pour ${u.name} (il sera déconnecté) :`); if (!pw) return;
          await api('/admin/password', { user_id: id, password: pw }); toast('Mot de passe changé');
        } else if (e.target.closest('.a-cards')) {
          const p = panel(card, 'cards'); if (!p) return;
          p.innerHTML = `<input class="ac-q" placeholder="Chercher une carte de ${esc(u.name)}…" autocomplete="off"><p class="mut ac-info" style="margin:6px 0"></p><div class="ac-list"></div>`;
          let t; p.querySelector('.ac-q').oninput = () => { clearTimeout(t); t = setTimeout(() => cardList(p, id).catch(err => toast(err.message)), 250); };
          await cardList(p, id);
        } else if (e.target.closest('.ac-1') || e.target.closest('.ac-all')) {
          const row = e.target.closest('.acrow'), all = !!e.target.closest('.ac-all'), name = row.querySelector('.acn').textContent;
          if (!confirm(`Retirer ${all ? 'toutes les copies de' : '1 exemplaire de'} « ${name} » à ${u.name} ?`)) return;
          await api('/admin/take-card', { user_id: id, card_id: +row.dataset.cid, qty: all ? 'all' : 1 });
          await cardList(card.querySelector('.admpanel'), id); toast('Carte retirée');
        } else if (e.target.closest('.a-drop')) {
          const p = panel(card, 'drop'); if (!p) return;
          const cur = u.drop || defaults;
          p.innerHTML = `<p class="mut" style="margin:0 0 8px">Poids de tirage de chaque rareté (plus c'est grand, plus c'est fréquent). Les pourcentages sont recalculés automatiquement.</p>
            <div class="dgrid">${rarities.map(r => `<label style="--cc:var(--${r})"><span>${esc(labels[r])}</span><input type="number" inputmode="decimal" step="any" min="0" max="1000" data-r="${r}" value="${cur[r]}"><em data-p="${r}"></em></label>`).join('')}</div>
            <div class="admrow"><button class="ad-save">Enregistrer</button><button class="plain ad-reset">Taux normaux</button></div>
            <div class="admrow"><button class="plain ad-pre" data-m="2">Chance ×2</button><button class="plain ad-pre" data-m="0.5">Malchance ÷2</button></div>`;
          const read = () => Object.fromEntries(rarities.map(r => [r, +p.querySelector(`[data-r="${r}"]`).value || 0]));
          const paint = () => { const w = read(), f = pct(w); rarities.forEach(r => { p.querySelector(`[data-p="${r}"]`).textContent = f(r) + ' %'; }); };
          p.oninput = paint; paint();
          p.onclick = safe(async ev => {
            if (ev.target.closest('.ad-pre')) {                                  // multiplie le poids des raretés au-dessus de « commune » : on garde le reste inchangé
              const m = +ev.target.closest('.ad-pre').dataset.m;
              rarities.forEach((r, k) => { if (k > 0) p.querySelector(`[data-r="${r}"]`).value = +(defaults[r] * m).toFixed(3); else p.querySelector(`[data-r="${r}"]`).value = defaults[r]; }); paint();
            } else if (ev.target.closest('.ad-save')) {
              await api('/admin/drop', { user_id: id, weights: read() }); toast(`Taux de ${u.name} enregistrés`); adminBody();
            } else if (ev.target.closest('.ad-reset')) {
              await api('/admin/drop', { user_id: id, weights: null }); toast(`Taux normaux pour ${u.name}`); adminBody();
            }
          });
        }
      });
    } else if (adminTab === 'stats') await adminStats(box);
    else if (adminTab === 'logs') await adminLogs(box);
    else if (adminTab === 'market') {
      const m = await api('/admin/market'); let pick = null, mins = 360, rmins = 0;
      const durs = [[60, '1 h'], [360, '6 h'], [720, '12 h'], [1440, '24 h']];
      const chips = (id, cur, withAuto) => `<div class="chips wrap" id="${id}">${withAuto ? `<button data-m="0" class="${cur === 0 ? 'on' : ''}">Variée</button>` : ''}${durs.map(([v, l]) => `<button data-m="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      box.innerHTML = `<div class="panel"><b>Cacher une carte précise dans le marché</b>
          <p class="mut">Elle est mise en vente sous le pseudo d'un joueur simulé : personne ne peut deviner que c'est toi.</p>
          <div class="search wide">${ico('search')}<input id="ml-q" placeholder="Chercher une page Wikipédia…" autocomplete="off"></div>
          <div id="ml-res" class="mlres"></div>
          <div id="ml-form" hidden>
            <p class="mlsel" id="ml-sel"></p>
            <label class="fld">Prix de départ (vide = prix du marché)<input id="ml-price" type="number" inputmode="numeric" min="1" placeholder="Automatique"></label>
            <div class="fld" style="margin:8px 0 6px">Durée</div>${chips('ml-d', mins, false)}
            <label class="fld" style="margin-top:10px">Vendeur<select id="ml-seller"><option value="">Un joueur simulé au hasard</option>${m.bots.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>
            <div class="row"><button id="ml-go">Mettre en vente</button></div>
          </div></div>
        <div class="panel"><b>Ajouter des cartes au hasard</b>
          <p class="mut">Des ventes réalistes sous des pseudos simulés, pour garnir le marché d'un coup.</p>
          <div class="admrow"><input id="rd-n" type="number" inputmode="numeric" min="1" max="30" value="5" style="max-width:90px"><select id="rd-r"><option value="">Raretés variées</option>${m.rarities.map(r => `<option value="${r}">${esc(m.labels[r])} seulement</option>`).join('')}</select></div>
          <div class="fld" style="margin:8px 0 6px">Durée</div>${chips('rd-d', rmins, true)}
          <div class="row"><button id="rd-go">Ajouter</button></div></div>
        <div class="panel"><b>Ventes simulées ouvertes</b><p class="mut">Tu peux retirer celles qui n'ont reçu aucune offre.</p>
          <div id="ml-lots">${m.lots.map(l => `<div class="acrow" data-id="${l.id}"><span class="acn"><i class="rd" style="background:var(--${l.shiny ? 'shiny' : l.rarity})"></i>${esc(l.title)}</span><small class="mut">${esc(l.seller)}</small><b>${fmt(l.bid || l.start_price)}</b>${l.bidder_id ? '<small class="mut">offre</small>' : '<button class="plain ml-rm">Retirer</button>'}</div>`).join('') || '<p class="mut">Aucune.</p>'}</div></div>`;
      const durClick = (id, set) => { $(id).onclick = e => { const b = e.target.closest('button'); if (!b) return; set(+b.dataset.m); $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }; };
      durClick('#ml-d', v => { mins = v; }); durClick('#rd-d', v => { rmins = v; });
      let t; $('#ml-q').oninput = () => {
        clearTimeout(t); const q = $('#ml-q').value.trim();
        if (q.length < 2) { $('#ml-res').innerHTML = ''; return; }
        t = setTimeout(async () => {
          try {
            const r = await api(`/catalog/search?q=${encodeURIComponent(q)}&admin=1`);
            $('#ml-res').innerHTML = r.cards.map((c, i) => `<button class="plain mlitem" data-i="${i}"><i class="rd" style="background:var(--${c.rarity})"></i><span>${esc(c.title)}</span><small>${esc(m.labels[c.rarity])} · ${fmt(c.views)} vues</small></button>`).join('') || '<p class="mut">Aucun résultat dans le catalogue.</p>';
            $('#ml-res').onclick = e => { const b = e.target.closest('.mlitem'); if (!b) return; pick = r.cards[+b.dataset.i]; $('#ml-sel').innerHTML = `Carte choisie : <b>${esc(pick.title)}</b> (${esc(m.labels[pick.rarity])})`; $('#ml-form').hidden = false; $('#ml-res').innerHTML = ''; };
          } catch (err) { $('#ml-res').innerHTML = `<p class="mut">${esc(err.message)}</p>`; }
        }, 350);
      };
      $('#ml-go').onclick = safe(async () => {
        if (!pick) return toast('Choisis une carte');
        const r = await api('/admin/lot', { title: pick.title, price: +$('#ml-price').value || 0, minutes: mins, seller_id: +$('#ml-seller').value || 0 });
        toast(`« ${r.title} » en vente par ${r.seller} (${fmt(r.price)})`); adminBody();
      });
      $('#rd-go').onclick = safe(async () => {
        $('#rd-go').disabled = true;
        try { const r = await api('/admin/lots-random', { count: +$('#rd-n').value || 1, rarity: $('#rd-r').value, minutes: rmins }); toast(`${r.added} carte${r.added > 1 ? 's' : ''} ajoutée${r.added > 1 ? 's' : ''} au marché`); adminBody(); } finally { $('#rd-go').disabled = false; }
      });
      $('#ml-lots').onclick = safe(async e => { const b = e.target.closest('.ml-rm'); if (!b) return; await api('/admin/lot/remove', { id: +b.closest('.acrow').dataset.id }); toast('Vente retirée'); adminBody(); });
    } else if (adminTab === 'announce') {
      box.innerHTML = `<p class="mut">Le message s'affiche en bulle chez les joueurs connectés et part en notification chez ceux qui l'ont activée.</p>
        <textarea id="an-t" rows="3" maxlength="180" placeholder="Ex. : Nouvelle mise à jour disponible, rechargez l'appli !" style="width:100%"></textarea>
        <label class="switch"><span>Envoyer aussi en notification</span><input type="checkbox" id="an-p" checked></label>
        <div class="row"><button id="an-go">Envoyer à tous</button><button class="plain" id="an-me">Test sur moi</button></div>`;
      $('#an-go').onclick = safe(async () => { const text = $('#an-t').value.trim(); if (!text) return toast('Écris un message'); const r = await api('/admin/announce', { text, push: $('#an-p').checked }); toast(`Envoyé (${r.push} notification${r.push > 1 ? 's' : ''})`); $('#an-t').value = ''; });
      $('#an-me').onclick = safe(async () => { const r = await api('/push/test', {}); toast(r.sent ? 'Notification envoyée' : 'Aucun appareil abonné sur ton compte'); });
    } else {
      box.innerHTML = `<div class="panel"><b>Marché</b><p class="mut">Fait agir les joueurs simulés tout de suite (ventes, enchères).</p><button id="t-bots">Animer le marché</button></div>
        <div class="panel"><b>Réserve de cartes</b><p class="mut">Prépare des cartes complétées (texte + photo) pour que les paquets s'ouvrent sans attente.</p><button id="t-res">Remplir la réserve</button></div>
        <div class="panel"><b>Journal des combats</b><p class="mut">Début, pauses, reprises, fin et erreurs des derniers combats (pour comprendre pourquoi l'un s'arrête).</p><button class="plain" id="t-fights">Afficher</button></div>
        <div class="panel"><b>Journal de l'appli</b><p class="mut">Les 40 derniers évènements sur cet appareil.</p><button class="plain" id="t-log">Afficher</button></div>`;
      const act = (id, action, msg) => { $(id).onclick = safe(async () => { $(id).disabled = true; try { await api('/admin/run', { action }); toast(msg); } finally { $(id).disabled = false; } }); };
      act('#t-bots', 'bots', 'Marché animé'); act('#t-res', 'reserve', 'Réserve remplie');
      $('#t-fights').onclick = safe(async () => {
        const { events } = await api('/admin/fights');
        $('#t-fights').closest('.panel').insertAdjacentHTML('beforeend', `<div class="jlog" style="margin-top:10px">${events.map(e => `<div><b>${hms(new Date(e.ts))}</b> ${esc(e.battle)} · ${esc(e.players)} · <span class="${e.kind === 'erreur' ? 'bad' : ''}">${esc(e.kind)}</span> ${esc(e.detail)}</div>`).join('') || 'Aucun combat enregistré.'}</div>`);
        $('#t-fights').remove();
      });
      $('#t-log').onclick = () => { $('#adm').insertAdjacentHTML('beforeend', `<div class="jlog panel">${(JSON.parse(localStorage.getItem('wm_log') || '[]')).slice().reverse().map(([t, x]) => `<div><b>${hms(new Date(t))}</b> ${esc(x)}</div>`).join('') || 'Vide'}</div>`); $('#t-log').remove(); };
    }
  };
  adminBody();   // sans attendre : la vue est déjà dessinée, sinon le squelette (affiché après 140 ms) l'écraserait
};

views.player = async v => {
  const { profile: p } = await api('/profile/' + playerId).catch(e => { toast(e.message); return {}; });
  if (!p) { tab = playerFrom; return render(); }
  const names = Object.fromEntries(ACH_NAMES.map(x => [x.k, x.t]));
  const vcard = (c, i) => { cardIndex.set(c.id, { ...c, qty: 1 }); return `<button class="vcard ${c.rarity} ${c.shiny ? 'shiny' : ''}" data-c="${c.id}" data-slot="${i}" style="--c:var(--${c.shiny ? 'shiny' : c.rarity})"><div class="vimg ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}>${c.image ? '' : noimg(c)}<span class="chip">${ABBR[c.rarity]}</span></div><b>${esc(c.title)}</b><small>ATK ${fmt(c.atk)} · DEF ${fmt(c.def)}</small></button>`; };
  v.innerHTML = `<button class="plain backbtn" id="pp-back">← Retour</button>
    <div class="profile big">${avatar(p.name, online.has(p.id))}<div><h1 class="pname">${esc(p.name)}</h1>${ttl(p.name) ? `<div>${ttl(p.name)}</div>` : ''}${p.isMe ? '<span class="mut">C\'est toi</span>' : p.isFriend ? '<span class="newtag">Ami</span>' : ''}
      <div class="mut">${p.wins} victoire${p.wins > 1 ? 's' : ''} · ${p.losses} défaite${p.losses > 1 ? 's' : ''}</div></div></div>
    <div class="tiles"><div class="tile"><b>${fmt(p.score)}</b><span>points</span></div><div class="tile"><b>${fmt(p.uniques)}</b><span>cartes uniques</span></div><div class="tile"><b>${fmt(p.packs)}</b><span>paquets ouverts</span></div></div>
    <h3 class="hist-h">Vitrine</h3>
    <div class="vitrine">${[0, 1, 2].map(i => p.showcase[i] ? vcard(p.showcase[i], i) : p.isMe ? `<button class="vslot" data-add="${i}"><span>+</span><small>Ajouter</small></button>` : '<div class="vslot empty"></div>').join('')}</div>
    ${p.isMe ? '<p class="mut" style="margin:8px 0 0;font-size:13px">Expose jusqu\'à 3 cartes de ta collection sur ton profil. Touche une carte pour la voir, la changer ou la retirer.</p>' : !p.showcase.length ? `<p class="mut" style="margin:8px 0 0;font-size:13px">${esc(p.name)} n'expose aucune carte pour l'instant.</p>` : ''}
    <div class="rarbar" style="margin-top:16px">${cfg.rarities.map(r => `<span style="--c:var(--${r})" title="${RAR[r]}"><b>${p.byRarity[r] || 0}</b>${ABBR[r]}</span>`).join('')}</div>
    ${p.best.length ? `<h3 class="hist-h">Meilleures cartes</h3><div class="minis">${p.best.map(c => `<div class="mini ${c.shiny ? 'shiny' : ''}" style="--c:var(--${c.shiny ? 'shiny' : c.rarity})" title="${esc(c.title)}">
      <div class="mi ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}>${c.image ? '' : noimg(c)}</div><span>${esc(c.title)}</span></div>`).join('')}</div>` : ''}
    <h3 class="hist-h">Succès · ${p.achievements.length} / ${p.total}</h3>
    ${p.achievements.length ? `<div class="chips wrap">${p.achievements.slice(0, 12).map(x => `<button class="plain" style="pointer-events:none">${esc(names[x.key] || x.key)}</button>`).join('')}</div>` : '<p class="mut">Aucun succès pour l\'instant.</p>'}
    <div class="row" style="margin-top:16px">${!p.isMe && !p.isFriend ? '<button id="pl-add">Ajouter en ami</button>' : p.isMe ? '<button id="pl-ach">Mes succès</button><button class="plain" id="pl-cus">Personnaliser</button>' : ''}</div>`;
  $('#pp-back').onclick = () => { tab = playerFrom; render(); };
  $('#pl-add')?.addEventListener('click', safe(async () => { await api('/friends/request', { name: p.name }); toast('Demande envoyée'); }));
  $('#pl-ach')?.addEventListener('click', () => { tab = 'ach'; render(); });
  $('#pl-cus')?.addEventListener('click', () => { tab = 'customize'; render(); });
  const ids = () => p.showcase.map(c => c.id);
  const save = safe(async list => { await api('/me/showcase', { cards: list }); toast('Vitrine mise à jour'); render(); });
  const choose = async (slot) => {
    const c = await cardPicker('Quelle carte exposer dans ta vitrine ?'); if (!c) return;
    if (ids().includes(c.id) && ids()[slot] !== c.id) return toast('Cette carte est déjà dans ta vitrine');
    const list = ids(); list[slot] = c.id; save(list.filter(Boolean));
  };
  v.querySelectorAll('[data-add]').forEach(b => b.onclick = () => choose(+b.dataset.add));
  v.querySelectorAll('.vcard').forEach(b => b.onclick = () => {
    const c = p.showcase[+b.dataset.slot];
    if (!p.isMe) return showCard(c.id);
    const m = $('#modal'); m.hidden = false;
    m.innerHTML = `<div><h2>${esc(c.title)}</h2><p class="mut">Que veux-tu faire de cette carte dans ta vitrine ?</p><div class="col"><button id="vc-see">Voir la carte</button><button class="plain" id="vc-chg">Changer de carte</button><button class="plain" id="vc-rm" style="color:#ff8a80">Retirer de la vitrine</button><button class="plain" id="vc-x">Fermer</button></div></div>`;
    const close = () => { m.hidden = true; m.innerHTML = ''; };
    $('#vc-x').onclick = close; m.onclick = e => { if (e.target === m) close(); };
    $('#vc-see').onclick = () => showCard(c.id);
    $('#vc-chg').onclick = () => { close(); choose(+b.dataset.slot); };
    $('#vc-rm').onclick = () => { close(); save(ids().filter(i => i !== c.id)); };
  });
};
let lastRenderKey = '';
const render = safe(async () => {
  clearInterval(tick); markTab();
  const key = tab + ':' + (tab === 'player' ? playerId : ''), keepY = key === lastRenderKey ? window.scrollY : 0;   // même page qui se rafraîchit (enchère, évènement serveur) : on ne remonte pas en haut
  lastRenderKey = key;
  if (tab === 'duel' && game) return renderGame();
  const v = $('#view'), sk = setTimeout(() => { v.innerHTML = SKELETON; }, 140);   // squelette si les données tardent
  try { await views[tab](v); } finally { clearTimeout(sk); }
  labelTables($('#view'));
  const down = () => window.scrollTo(0, document.documentElement.scrollHeight);
  if (tab === 'chat') { down(); requestAnimationFrame(down); setTimeout(down, 120); setTimeout(down, 400); }   // une conversation s'ouvre sur le dernier message
  else window.scrollTo(0, keepY);
  fitLock(); setTimeout(fitLock, 250); setTimeout(fitLock, 1000);
});
async function refreshMe() {
  me = await api('/me');
  { const c = COS.get(me.name) ?? { id: me.id, name: me.name }; c.id = me.id; c.v = me.av; c.ti = me.title; COS.set(me.name, c); }
  loadCosmetics();
  document.querySelector('nav [data-tab=friends]')?.classList.toggle('has-badge', me.badge > 0);
  document.querySelector('nav [data-tab=msg]')?.classList.toggle('has-badge', me.dm > 0);
  document.querySelector('nav [data-tab=more]')?.classList.toggle('has-badge', me.dm > 0 || me.badge > 0 || me.qc > 0 || me.dq === 'new' || !!me.daily);
  $('#me').innerHTML = `<span class="pill">${ico('packs')}${me.test ? '∞' : me.packs}</span><span class="pill gold">${ico('coin')}${fmt(me.coins)}</span><button class="avatar ${me.av ? 'ph' : ''}" id="profile" aria-label="Profil">${me.av ? `<img src="/api/avatar/${me.id}?v=${me.av}" alt="" onerror="this.remove()">` : ''}${esc(me.name[0]?.toUpperCase() || '?')}</button>`;
  $('#profile').onclick = profileSheet;
}
const bindPlayers = root => root.querySelectorAll('[data-pl]').forEach(el => el.onclick = e => { if (e.target.closest('button')) return; playerSheet(el.dataset.pl); });
/** Profil d'un joueur : stats, meilleures cartes, succès. */
/** Ouvre la page d'un joueur (profil, vitrine, meilleures cartes, succès). */
let playerId = null, playerFrom = 'packs';
// ---------- messagerie privée ----------
let chatPeer = null, chatName = '';
const openChat = (id, name) => { chatPeer = +id; chatName = name || ''; game = null; tab = 'chat'; render(); };
function onDm(m) {
  try { navigator.vibrate?.(25); } catch { /* non supporté */ }
  if (tab === 'chat' && chatPeer === m.from && !game) { render(); return; }               // la conversation est ouverte : le message s'affiche (et est lu)
  banner(m.name, m.body, () => openChat(m.from, m.name));
  refreshMe().catch(() => {});
  if (tab === 'msg' && !game) render();
}
const msgTime = ts => { const d = new Date(ts), t = new Date(), hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === t.toDateString() ? hm : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + hm; };
views.msg = async v => {
  const { convs } = await api('/dm');
  v.innerHTML = `${pageHead('Messages', 'Messages privés entre joueurs')}<button id="dm-new">${ico('chat')} Nouveau message</button>
    <div class="list" style="margin-top:12px">${convs.length ? convs.map(c => `<div class="item tap ${c.unread ? 'unread' : ''}" data-peer="${c.peer_id}" data-name="${esc(c.name)}">${avatar(c.name, online.has(c.peer_id))}
      <div class="grow"><div class="nm">${esc(c.name)}${ttl(c.name)}${c.unread ? `<span class="newtag">${c.unread}</span>` : ''}</div><div class="sub dmprev">${c.last_mine ? 'Toi : ' : ''}${esc(c.last_body)}</div></div><small class="mut">${msgTime(c.last_ts)}</small></div>`).join('') : '<div class="empty">Aucune conversation pour l\'instant.<br>Écris à un joueur avec « Nouveau message ».</div>'}</div>`;
  v.querySelectorAll('[data-peer]').forEach(el => el.onclick = () => openChat(el.dataset.peer, el.dataset.name));
  $('#dm-new').onclick = safe(async () => {
    const { users } = await api('/users'), list = users.filter(u => !u.me);
    $('#modal').hidden = false;
    $('#modal').innerHTML = `<div><h2>Nouveau message</h2><div class="list" style="max-height:55vh;overflow:auto">${list.map(u => `<div class="item tap" data-u="${u.id}" data-name="${esc(u.name)}">${avatar(u.name, u.online)}<div class="grow"><div class="nm">${esc(u.name)}</div><div class="sub">${u.online ? 'En ligne' : 'Hors ligne'}</div></div></div>`).join('') || '<p class="mut">Aucun autre joueur.</p>'}</div><div class="row"><button class="plain" id="dm-x">Fermer</button></div></div>`;
    $('#dm-x').onclick = () => { $('#modal').hidden = true; };
    $('#modal').querySelectorAll('[data-u]').forEach(el => el.onclick = () => { $('#modal').hidden = true; openChat(el.dataset.u, el.dataset.name); });
  });
};
views.chat = async v => {
  if (!chatPeer) { tab = 'msg'; return render(); }
  const r = await api('/dm/' + chatPeer).catch(e => { toast(e.message); return null; });
  if (!r) { tab = 'msg'; return render(); }
  chatName = r.peer.name; refreshMe().catch(() => {});
  const bubble = m => `<div class="bub ${m.mine ? 'me' : ''}"><span>${esc(m.body)}</span><small>${msgTime(m.ts)}</small></div>`;
  v.innerHTML = `<button class="plain backbtn" id="ch-back">← Messages</button>
    <div class="chathead">${avatar(chatName, online.has(chatPeer))}<b>${esc(chatName)}</b>${ttl(chatName)}</div>
    <div class="chatlog" id="ch-log">${r.messages.length ? r.messages.map(bubble).join('') : '<p class="mut" style="text-align:center;margin:30px 0">Aucun message. Dis bonjour !</p>'}</div>
    <form class="composer" id="ch-form"><input id="ch-in" maxlength="500" placeholder="Ton message…" autocomplete="off" enterkeyhint="send"><button type="submit">Envoyer</button></form>`;
  $('#ch-back').onclick = () => { tab = 'msg'; render(); };
  const log = $('#ch-log'); window.scrollTo(0, document.body.scrollHeight);
  $('#ch-form').onsubmit = safe(async e => {
    e.preventDefault();
    const inp = $('#ch-in'), body = inp.value.trim(); if (!body) return;
    inp.value = ''; inp.focus();
    const tmp = { mine: true, body, ts: Date.now() };
    log.querySelector('p.mut')?.remove(); log.insertAdjacentHTML('beforeend', bubble(tmp)); const el = log.lastElementChild; el.classList.add('sending');
    window.scrollTo(0, document.body.scrollHeight);
    try { await api('/dm/' + chatPeer, { body }); el.classList.remove('sending'); }
    catch (err) { el.remove(); inp.value = body; toast(err.message); }
  });
};
const mk = { q: '', sort: 'end', f: '' };                       // recherche, tri et filtre du marché (gardés quand la liste se rafraîchit)
function openPlayer(id) {
  const m = $('#modal'); m.hidden = true; m.innerHTML = ''; lotOpen = null; clearInterval(lotTick);
  if (tab !== 'player') playerFrom = tab;                        // pour le bouton Retour
  playerId = +id; GROUP.player = GROUP[playerFrom] ?? 'friends'; tab = 'player'; render();
}
const playerSheet = openPlayer;                                  // anciens appels : même page

// ---------- notifications push ----------
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const u8 = b64 => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
/** 'ok' : actif · 'off' : possible mais pas activé · 'denied' : refusé dans les réglages · 'install' : iPhone, ajouter d'abord à l'écran d'accueil · 'none' : impossible ici */
async function pushState() {
  if (isIOS && !standalone()) return 'install';
  if (!pushSupported()) return 'none';
  if (Notification.permission === 'denied') return 'denied';
  try { const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(no, 3000))]); return Notification.permission === 'granted' && await reg.pushManager.getSubscription() ? 'ok' : 'off'; } catch { return 'none'; }
}
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées : autorise-les dans les réglages du téléphone');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(cfg.vapid) });
  await api('/push/subscribe', { endpoint: sub.endpoint });
}
async function disablePush() {
  const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
  if (sub) { await api('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
}
/** Au démarrage : réattache cet appareil au compte connecté (changement de compte, abonnement renouvelé) et propose d'activer si ce n'est pas fait. */
async function pushStartup() {
  try {
    const st = await pushState();
    if (st === 'ok') { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); await api('/push/subscribe', { endpoint: sub.endpoint }); return; }
    if ((st !== 'off' && st !== 'install') || localStorage.getItem('wm_push_ask') === '1') return;
    const bar = document.createElement('div'); bar.className = 'pushbar';
    bar.innerHTML = st === 'install'
      ? `<p><b>Reçois les notifications</b><br>Ajoute d'abord l'appli à l'écran d'accueil : bouton Partager, puis « Sur l'écran d'accueil », et rouvre-la depuis l'icône.</p><button class="plain" id="pb-no">OK</button>`
      : `<p><b>Active les notifications</b><br>Enchères dépassées, défis, demandes d'amis… même téléphone verrouillé.</p><div><button id="pb-yes">Activer</button><button class="plain" id="pb-no">Plus tard</button></div>`;
    $('#app').prepend(bar);
    const close = () => { try { localStorage.setItem('wm_push_ask', '1'); } catch { /* stockage indisponible */ } bar.remove(); };
    $('#pb-no').onclick = close;
    if (st === 'off') $('#pb-yes').onclick = async () => { try { await enablePush(); toast('Notifications activées'); } catch (e) { toast(e.message); } close(); };
  } catch { /* pas de notifications ici */ }
}
function profileSheet() {
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div><div class="profile tapp" id="pf-head" role="button" tabindex="0">${avatar(me.name)}<div><b>${esc(me.name)}</b><div class="mut">${me.wins} victoire${me.wins > 1 ? 's' : ''} · ${me.losses} défaite${me.losses > 1 ? 's' : ''}</div></div><span class="chev" aria-hidden="true">Voir ma page ›</span></div>
    <div class="row"><span class="pill gold">${ico('coin')}${fmt(me.coins)} pièces</span><span class="pill">${ico('packs')}${me.packs} paquets</span></div>
    ${me.admin ? `<label class="switch"><span>Mode test<small>Ouvrir des paquets à l'infini</small></span><input type="checkbox" id="pf-test" ${me.test ? 'checked' : ''}></label>` : ''}
    <label class="switch"><span>Sons<small>Déchirure et ouverture des paquets</small></span><input type="checkbox" id="pf-snd" ${localStorage.getItem('wm_sound') === '0' ? '' : 'checked'}></label>
    <label class="switch" id="pf-pushrow"><span>Notifications<small id="pf-pushtxt">Vérification…</small></span><input type="checkbox" id="pf-push" disabled></label>
    ${me.admin ? '<button class="plain" id="pf-admin" style="width:100%;margin-top:16px">Administration</button>' : ''}
    <p class="build" id="build">Build ${BUILD} · chargé à ${hms(LOADED)}${cfg?.version && cfg.version !== BUILD ? ` · serveur ${esc(cfg.version)} — recharge l'appli` : ''}</p>
    <div class="row pfbtns" style="margin-top:18px"><button class="plain" id="pf-me" style="flex:1">Mon profil</button><button class="plain" id="pf-close" style="flex:1">Fermer</button><button class="plain" id="pf-out" style="flex:1;color:#ff8a80">Déconnexion</button></div></div>`;
  $('#pf-close').onclick = () => { m.hidden = true; m.innerHTML = ''; };
  $('#pf-out').onclick = logout;
  let taps = 0; $('#build').onclick = () => {
    if (++taps < 5) return; taps = 0;
    let l = []; try { l = JSON.parse(localStorage.getItem('wm_log') || '[]'); } catch { /* vide */ }
    m.innerHTML = `<div><h2>Journal</h2><p class="mut" style="margin:0 0 8px">Build ${BUILD} · chargé à ${hms(LOADED)}</p><div class="jlog">${l.slice().reverse().map(([t, x]) => `<div><b>${hms(new Date(t))}</b> ${esc(x)}</div>`).join('') || 'Vide'}</div><div class="row"><button class="plain" id="jl-close">Fermer</button></div></div>`;
    $('#jl-close').onclick = () => { m.hidden = true; m.innerHTML = ''; };
  };
  $('#pf-me').onclick = $('#pf-head').onclick = () => playerSheet(me.id);
  if (me.admin) $('#pf-admin').onclick = () => { m.hidden = true; m.innerHTML = ''; tab = 'admin'; render(); };
  pushState().then(st => {
    const t = $('#pf-pushtxt'), c = $('#pf-push'); if (!t) return;
    t.textContent = { ok: 'Activées sur cet appareil', off: 'Enchères, défis, amis… même écran verrouillé', denied: 'Bloquées : autorise-les dans les réglages du téléphone', install: 'Ajoute d\'abord l\'appli à l\'écran d\'accueil (Partager → Sur l\'écran d\'accueil)', none: 'Non disponibles sur ce navigateur' }[st];
    c.checked = st === 'ok'; c.disabled = !(st === 'ok' || st === 'off');
    c.onchange = async () => { c.disabled = true; try { if (c.checked) { await enablePush(); toast('Notifications activées'); api('/push/test', {}).catch(() => {}); } else { await disablePush(); toast('Notifications désactivées'); } } catch (e) { c.checked = !c.checked; toast(e.message); } c.disabled = false; };
  });
  $('#pf-snd').onchange = e => { try { localStorage.setItem('wm_sound', e.target.checked ? '1' : '0'); } catch { /* stockage indisponible */ } };
  if (me.admin) $('#pf-test').onchange = safe(async e => { await api('/me/test-mode', { on: e.target.checked }); await refreshMe(); toast(e.target.checked ? 'Mode test activé' : 'Mode test désactivé'); if (tab === 'packs') render(); });
  m.onclick = e => { if (e.target === m) { m.hidden = true; m.innerHTML = ''; } };
}
// ---------- récompense quotidienne, quêtes, quiz du jour ----------
const rewardChips = (rw, big = false) => `<span class="rw ${big ? 'big' : ''}">${rw.c ? `<em>${ico('coin')}+${rw.c}</em>` : ''}${rw.p ? `<em class="pk">${ico('packs')}+${rw.p}</em>` : ''}</span>`;
const hmLeft = ms => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
function sparks(host, n = 26) {
  const c = ['#f5c542', '#ffffff', '#86c4f5', '#ee91bc', '#c09aec'], d = document.createElement('div'); d.className = 'sparks';
  d.innerHTML = Array.from({ length: n }, () => { const a = Math.random() * 6.28, r = 90 + Math.random() * 170; return `<span style="--x:${Math.round(Math.cos(a) * r)}px;--y:${Math.round(Math.sin(a) * r)}px;--s:${4 + Math.round(Math.random() * 6)}px;--c:${c[Math.floor(Math.random() * c.length)]};--d:${Math.round(Math.random() * 250)}ms"></span>`; }).join('');
  host.append(d); setTimeout(() => d.remove(), 2600);
}
let dailyShown = '';
/** Fenêtre de bienvenue : la récompense du jour, avec les 7 jours de la série. */
function dailyModal(d = me.daily) {
  if (!d) return;
  dailyShown = new Date().toDateString();
  const m = $('#modal'), close = () => { m.hidden = true; m.innerHTML = ''; };
  const slot = (rw, i) => `<div class="dslot ${i < d.index ? 'past' : i === d.index ? 'now' : ''} ${i === 6 ? 'last' : ''}"><small>Jour ${i + 1}</small>${rewardChips(rw)}${i < d.index ? '<i class="ck">✓</i>' : ''}</div>`;
  m.hidden = false;
  m.innerHTML = `<div class="daily" role="dialog" aria-label="Récompense quotidienne"><span class="halo" aria-hidden="true"></span>
    <p class="dk">Récompense quotidienne</p><h2>Bon retour, ${esc(me.name)} !</h2>
    <p class="mut">${d.streak > 0 ? `Série en cours : <b>${d.streak} jour${d.streak > 1 ? 's' : ''}</b>. Reviens chaque jour pour la garder !` : 'Reviens chaque jour pour allonger ta série et gagner de plus gros cadeaux.'}</p>
    <div class="dgrid">${d.rewards.map(slot).join('')}</div>
    <div class="dgift" id="dgift"><span>${ico('spark')}</span>${rewardChips(d.rewards[d.index], true)}</div>
    <button id="d-claim" class="primary big">Récupérer</button><p class="mut dsmall">Nouvelle récompense à minuit.</p></div>`;
  m.onclick = e => { if (e.target === m && $('#d-claim')) close(); };
  $('#d-claim').onclick = safe(async () => {
    $('#d-claim').disabled = true;
    const r = await api('/daily/claim', {});
    const box = $('.daily'); box.classList.add('claimed'); sparks(box, 34); try { navigator.vibrate?.([30, 40, 30]); } catch { /* non supporté */ }
    $('.dslot.now')?.classList.add('got');
    const b = $('#d-claim'); b.textContent = 'Super !'; b.disabled = false; b.onclick = () => { close(); refreshMe().catch(() => {}); if (tab === 'packs') render(); };
    await refreshMe();
  });
}

const TIERS = { 1: ['Facile', 'easy'], 2: ['Moyen', 'mid'], 3: ['Difficile', 'hard'] };
views.quests = async v => {
  const d = await api('/quests'), end = Date.now() + d.resetIn;
  const card = q => `<div class="quest ${q.claimed ? 'done' : q.progress >= q.goal ? 'ready' : ''} t${q.tier}"><div class="qt"><span class="tier ${TIERS[q.tier][1]}">${TIERS[q.tier][0]}</span>${rewardChips(q.reward)}</div>
    <b>${esc(q.text)}</b><div class="qp"><div class="qbar"><i style="width:${Math.min(100, Math.round(q.progress / q.goal * 100))}%"></i></div><small>${Math.min(q.progress, q.goal)} / ${q.goal}</small></div>
    ${q.claimed ? '<span class="qok">✓ Récupérée</span>' : q.progress >= q.goal ? `<button class="primary" data-claim="${q.id}">Récupérer</button>` : ''}</div>`;
  const b = d.bonus, bReady = !b.claimed && b.progress >= b.goal;
  v.innerHTML = `${pageHead('Quêtes du jour', 'Trois défis par jour, de nouveaux à minuit.')}<p class="mut qreset">${ico('clock')} Nouvelles quêtes dans <b id="q-left">${hmLeft(d.resetIn)}</b></p>
    <div class="quests">${d.quests.map(card).join('')}
    <div class="quest bonus ${b.claimed ? 'done' : bReady ? 'ready' : ''}"><div class="qt"><span class="tier gold">Bonus</span>${rewardChips(b.reward)}</div><b>${esc(b.text)}</b>
      <div class="qp"><div class="qbar"><i style="width:${Math.round(Math.min(b.progress, b.goal) / b.goal * 100)}%"></i></div><small>${Math.min(b.progress, b.goal)} / ${b.goal}</small></div>
      ${b.claimed ? '<span class="qok">✓ Récupéré</span>' : bReady ? '<button class="primary" data-claim="bonus">Récupérer le bonus</button>' : ''}</div></div>`;
  tick = setInterval(() => { const e = $('#q-left'); if (e) e.textContent = hmLeft(end - Date.now()); if (end < Date.now()) { clearInterval(tick); render(); } }, 20000);
  v.querySelectorAll('[data-claim]').forEach(btn => btn.onclick = safe(async () => {
    btn.disabled = true; const el = btn.closest('.quest');
    const r = await api('/quests/claim', { id: btn.dataset.claim }); sparks(el, 18); try { navigator.vibrate?.(30); } catch { /* non supporté */ }
    toast(`Récompense : ${[r.reward.c ? `${r.reward.c} pièces` : '', r.reward.p ? `${r.reward.p} paquet${r.reward.p > 1 ? 's' : ''}` : ''].filter(Boolean).join(' + ')}`);
    await refreshMe(); setTimeout(() => tab === 'quests' && render(), 650);
  }));
};

let dqRun = null;   // quiz en cours : { day, qs, i, answers, endAt }
const dqRecap = (v, rc, d) => {
  const verdict = rc.correct === rc.total ? 'Sans faute !' : rc.correct >= 3 ? 'Bien joué !' : rc.correct > 0 ? 'Pas mal !' : 'Aïe…';
  const gain = rc.delta > 0 ? `<div class="dqgain">${Array.from({ length: rc.delta }, (_, i) => `<span style="--i:${i}">${ico('packs')}</span>`).join('')}<b>+${rc.delta} paquet${rc.delta > 1 ? 's' : ''}</b></div>`
    : rc.penalty === 'pack' ? `<div class="dqgain bad"><b>−1 paquet</b><small>Aucune bonne réponse : un paquet t'est retiré.</small></div>`
    : rc.penalty === 'timer' ? `<div class="dqgain bad"><b>Minuteur remis à 10 min</b><small>Aucune bonne réponse et plus de paquet à perdre : le prochain arrive dans 10 minutes.</small></div>` : '';
  v.innerHTML = `<div class="dqend"><span class="halo" aria-hidden="true"></span><p class="dk">Quiz du jour · ${esc(rc.title)}</p><div class="dqscore"><b>${rc.correct}</b><span>/ ${rc.total}</span></div><h2>${verdict}</h2>${gain}
    <div class="dqlist">${rc.questions.map((q, i) => `<div class="dqrow ${q.ok ? 'ok' : 'ko'}"><span class="dqn">${q.ok ? '✓' : '✗'}</span><div><b>${esc(q.text)}</b>
      <small>${q.ok ? '' : q.given >= 0 ? `Ta réponse : ${esc(q.options[q.given])}<br>` : 'Pas de réponse<br>'}Bonne réponse : <em>${esc(q.options[q.answer])}</em></small></div></div>`).join('')}</div>
    <p class="mut dsmall">Prochain quiz à minuit${d?.resetIn ? ` (dans ${hmLeft(d.resetIn)})` : ''}.</p>
    <div class="row"><button class="primary" id="dq-packs">Ouvrir mes paquets</button><button class="plain" id="dq-quests">Mes quêtes</button></div></div>`;
  $('#dq-packs').onclick = () => { tab = 'packs'; render(); }; $('#dq-quests').onclick = () => { tab = 'quests'; render(); };
  api('/daily-quiz/ranking').then(rk => {
    const t = ms => ms >= 60000 ? `${Math.floor(ms / 60000)} min ${String(Math.round(ms % 60000 / 1000)).padStart(2, '0')} s` : `${(ms / 1000).toFixed(1)} s`;
    const box = document.createElement('div'); box.className = 'dqrank';
    box.innerHTML = `<h3 class="sec">Classement du jour</h3><p class="mut dsmall" style="text-align:left;margin:0 0 8px">Le 1er gagne <b>+1 paquet bonus</b> à minuit (meilleur score, puis temps le plus court).</p>
      <div class="list">${rk.list.map(x => `<div class="item r${x.rank} ${x.me ? 'me' : ''}"><span class="rank-n">${x.rank}</span>${avatar(x.name)}<div class="grow"><div class="nm">${esc(x.name)}${x.me ? ' (toi)' : ''}${ttl(x.name)}</div><div class="sub">${x.correct} / 5 · ${t(x.ms)}</div></div></div>`).join('')}</div>
      ${rk.yesterday ? `<p class="mut dsmall">Vainqueur d'hier : <b>${esc(rk.yesterday.name)}</b> (${rk.yesterday.correct} / 5 en ${t(rk.yesterday.ms)})</p>` : ''}`;
    $('.dqend')?.querySelector('.row')?.before(box);
  }).catch(() => {});
  if (rc.delta > 0) sparks($('.dqend'), 30);
  refreshMe().catch(() => {});
};
async function dqFinish(v) {
  clearInterval(tick); const run = dqRun; dqRun = null;
  v.innerHTML = '<div class="dqend"><p class="mut" style="text-align:center">Correction en cours…</p></div>';
  const r = await api('/daily-quiz/submit', { answers: run ? run.answers : [] });
  dqRecap(v, r.recap, null);
}
function dqQuestion(v) {
  const run = dqRun, q = run.qs[run.i];
  v.innerHTML = `${pageHead(`Question ${run.i + 1} / ${run.qs.length}`, 'Quiz du jour')}<div class="dqdots">${run.qs.map((_, i) => `<i class="${i < run.i ? 'done' : i === run.i ? 'cur' : ''}"></i>`).join('')}</div>
    <div class="qbar"><i id="dq-bar" style="width:100%"></i></div><p class="mut dqtime">${ico('clock')} <span id="dq-t"></span></p>
    <p class="dqtext">${esc(q.text)}</p>${q.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join('')}`;
  const paint = () => { const left = Math.max(0, Math.round((run.endAt - Date.now()) / 1000)); const t = $('#dq-t'); if (t) t.textContent = `Temps restant : ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; const bar = $('#dq-bar'); if (bar) bar.style.width = Math.min(100, left / run.total * 100) + '%'; if (left <= 0) dqFinish(v).catch(e => toast(e.message)); };
  paint(); clearInterval(tick); tick = setInterval(paint, 1000);
  v.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    v.querySelectorAll('.opt').forEach(x => x.disabled = true); b.classList.add('sel'); run.answers[run.i] = +b.dataset.i;
    setTimeout(() => { if (dqRun !== run) return; run.i++; run.i >= run.qs.length ? dqFinish(v).catch(e => toast(e.message)) : dqQuestion(v); }, 420);
  });
}
views.dquiz = async v => {
  let d = await api('/daily-quiz');
  if (d.status === 'late') { dqRun = null; const r = await api('/daily-quiz/submit', { answers: [] }); return dqRecap(v, r.recap, d); }
  if (d.status === 'done') { dqRun = null; return dqRecap(v, d.recap, d); }
  if (d.status === 'run') {
    if (!dqRun || dqRun.day !== d.day) dqRun = { day: d.day, qs: d.questions, i: 0, answers: [], total: 300 };
    dqRun.endAt = Date.now() + d.secs * 1000; return dqQuestion(v);
  }
  v.innerHTML = `<div class="dqintro"><span class="halo" aria-hidden="true"></span><p class="dk">Défi du jour</p><h1>Quiz du jour</h1><p class="mut">Le même quiz pour tous les joueurs, sur un article tiré au hasard.</p>
    <ul class="dqrules"><li><b>${d.n} questions</b> à choix multiples, ${d.secs / 60} minutes en tout</li><li>${ico('packs')}<span><b>+1 paquet</b> par bonne réponse</span></li><li class="bad">${ico('shield')}<span>Aucune bonne réponse : <b>−1 paquet</b> (ou minuteur remis à 10 min si tu n'en as plus)</span></li><li>Un seul essai par jour</li></ul>
    <button id="dq-go" class="primary big">Commencer</button><p class="mut dsmall">Nouveau quiz à minuit (dans ${hmLeft(d.resetIn)}).</p></div>`;
  $('#dq-go').onclick = safe(async () => {
    $('#dq-go').disabled = true; const s = await api('/daily-quiz/start', {});
    dqRun = { day: s.day, qs: s.questions, i: 0, answers: [], total: 300, endAt: Date.now() + s.secs * 1000 }; refreshMe().catch(() => {}); dqQuestion(v);
  });
};

// ---------- tournois : 4 joueurs, mise en pièces, demi-finales puis finale et match pour la 3ᵉ place ----------
let tourId = null;
let duelMode = 'quiz';
const TLAB = { r1: 'Demi-finale', final: 'Finale', cons: 'Match pour la 3ᵉ place' }, ordn = i => i === 0 ? '1er' : `${i + 1}ᵉ`;
views.tournaments = async v => {
  const d = await api('/tournaments');
  const row = t => `<div class="item tap trow" data-t="${t.id}"><div class="grow"><div class="nm">Tournoi n°${t.id} <span class="tstate ${t.status}">${{ open: 'Ouvert', running: 'En cours', done: 'Terminé' }[t.status]}</span></div><div class="sub">Créé par ${esc(t.cname)} · ${t.n} / ${t.size} joueurs${t.joined ? ' · inscrit' : ''}</div></div><b class="tstake">${ico('coin')}${fmt(t.stake)}</b></div>`;
  const live = d.tournaments.filter(t => t.status !== 'done'), done = d.tournaments.filter(t => t.status === 'done');
  v.innerHTML = `${pageHead('Tournois', 'Mise des pièces, 4 joueurs, combats de cartes')}
    <div class="panel tnew"><h3>Créer un tournoi</h3><p class="mut" style="margin:0 0 10px">Chacun mise la même somme. Demi-finales en même temps, puis finale et match pour la 3ᵉ place : les <b>2 premiers gagnent</b> (la mise des 2 derniers se partage), les <b>2 derniers perdent</b> leur mise.</p>
      <div class="row"><input id="t-stake" type="number" inputmode="numeric" min="${d.min}" max="${d.max}" value="100" aria-label="Mise"><button class="primary" id="t-new">Ouvrir (mise ${'<span id="t-s">100</span>'})</button></div></div>
    <h3 class="sec">En cours</h3><div class="list">${live.map(row).join('') || '<p class="mut">Aucun tournoi ouvert pour l\'instant.</p>'}</div>
    ${done.length ? `<h3 class="sec">Terminés récemment</h3><div class="list">${done.map(row).join('')}</div>` : ''}`;
  $('#t-stake').oninput = e => { $('#t-s').textContent = e.target.value || '0'; };
  $('#t-new').onclick = safe(async () => { const r = await api('/tournaments', { stake: +$('#t-stake').value }); toast('Tournoi ouvert, mise payée'); await refreshMe(); tourId = r.id; tab = 'tournament'; render(); });
  v.querySelectorAll('[data-t]').forEach(el => el.onclick = () => { tourId = +el.dataset.t; tab = 'tournament'; render(); });
};
views.tournament = async v => {
  const t = await api('/tournaments/' + tourId), nm = id => t.bracket?.names?.[id] ?? t.players.find(p => p.id === id)?.name ?? '?';
  const match = m => `<div class="tmatch ${m.s}"><small>${TLAB[m.k]}</small><div class="tvs"><b class="${m.w === m.a ? 'w' : m.w ? 'l' : ''}">${esc(nm(m.a))}</b><span>vs</span><b class="${m.w === m.b ? 'w' : m.w ? 'l' : ''}">${esc(nm(m.b))}</b></div><em>${{ wait: 'En attente des joueurs…', live: 'Combat en cours', done: `Vainqueur : ${esc(nm(m.w))}` }[m.s]}</em></div>`;
  const pay = t.preview;
  v.innerHTML = `${pageHead(`Tournoi n°${t.id}`, `Mise ${fmt(t.stake)} pièces par joueur`)}<p><button class="plain" id="t-back">← Tous les tournois</button></p>
    <div class="panel"><div class="tpot"><span>${ico('coin')} Cagnotte</span><b>${fmt(t.stake * t.size)}</b></div>
      <div class="tpay">${pay.map((p, i) => `<div class="${p > t.stake ? 'up' : 'down'}"><small>${ordn(i)}</small><b>${p > t.stake ? '+' + fmt(p - t.stake) : '−' + fmt(t.stake)}</b></div>`).join('')}</div></div>
    <h3 class="sec">Joueurs (${t.players.length} / ${t.size})</h3><div class="list">${t.players.map(p => `<div class="item row1 ${p.me ? 'me' : ''}">${avatar(p.name)}<div class="grow"><div class="nm">${esc(p.name)}${p.me ? ' (toi)' : ''}${ttl(p.name)}</div><div class="sub">${t.status === 'done' ? `${p.net >= 0 ? '+' : '−'}${fmt(Math.abs(p.net))} pièces` : ''}</div></div></div>`).join('')}</div>
    ${t.bracket ? `<h3 class="sec">${t.status === 'done' ? 'Résultat' : t.bracket.stage === 'r1' ? 'Demi-finales' : 'Finale et 3ᵉ place'}</h3><div class="tbracket">${t.bracket.matches.map(match).join('')}</div>` : ''}
    ${t.bracket?.rank ? `<div class="panel"><h3>Classement final</h3>${t.bracket.rank.map((u, i) => `<div class="trank ${i < 2 ? 'win' : ''}"><span>${ordn(i)}</span><b>${esc(nm(u))}</b></div>`).join('')}</div>` : ''}
    ${t.status === 'open' ? `<div class="row">${t.joined ? `<button class="plain" id="t-leave">${t.creator === me.id ? 'Annuler le tournoi' : 'Me retirer'}</button>` : `<button class="primary" id="t-join">Rejoindre (mise ${fmt(t.stake)})</button>`}</div><p class="mut dsmall">Le tournoi démarre dès que 4 joueurs sont inscrits, et reste ouvert 48 h au maximum.</p>` : ''}
    ${t.status === 'running' ? '<p class="mut dsmall">Reste connecté : ton match démarre dès que ton adversaire est là (10 minutes maximum d\'attente, sinon forfait). Les combats sont les mêmes que d\'habitude.</p>' : ''}`;
  $('#t-back').onclick = () => { tab = 'tournaments'; render(); };
  if ($('#t-join')) $('#t-join').onclick = safe(async () => { const r = await api(`/tournaments/${t.id}/join`, {}); toast(r.started ? 'Tournoi lancé ! Les demi-finales commencent.' : 'Inscrit, mise payée'); await refreshMe(); render(); });
  if ($('#t-leave')) $('#t-leave').onclick = safe(async () => { if (!(await ask(t.creator === me.id ? 'Annuler le tournoi ?' : 'Te retirer ?', [], { text: 'Les mises sont remboursées.', ok: 'Confirmer' }))) return; await api(`/tournaments/${t.id}/leave`, {}); await refreshMe(); tab = 'tournaments'; render(); });
};

// ---------- réglages : thèmes, texte, animations, vibrations, notifications ----------
const THEME_LIST = [['dark', 'Sombre', '#07070b', '#ecebe6', 'Le thème d\'origine'], ['midnight', 'Minuit', '#000', '#ecebe6', 'Noir total, économise la batterie'], ['ocean', 'Océan', '#0d1726', '#8fd0ff', 'Bleu nuit'], ['forest', 'Forêt', '#0d1a13', '#9be3b0', 'Vert profond'],
  ['violet', 'Violet', '#171027', '#d2b4ff', 'Mauve nocturne'], ['light', 'Clair', '#f2f1ee', '#222', 'Fond blanc'], ['beige', 'Beige', '#efe6d3', '#6b5a3a', 'Papier chaleureux'], ['auto', 'Automatique', 'linear-gradient(135deg,#07070b 50%,#f2f1ee 50%)', '#888', 'Suit ton téléphone']];
const pref = (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } window.applyPrefs?.(); };
views.settings = async v => {
  const th = pref('wm_theme', 'dark'), tx = pref('wm_text', 'm');
  const sw = (id, label, sub, on) => `<label class="switch"><span>${label}<small>${sub}</small></span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}></label>`;
  v.innerHTML = `${pageHead('Réglages', 'Apparence, jeu et notifications')}
    <div class="setgrp"><h3>Thème</h3><div class="themes">${THEME_LIST.map(([k, l, bg, ac, d]) => `<button class="theme ${k === th ? 'on' : ''}" data-th="${k}"><span class="sw" style="background:${bg}"><i style="background:${ac}"></i></span><span><b>${l}</b><small>${d}</small></span></button>`).join('')}</div></div>
    <div class="setgrp"><h3>Taille du texte</h3><div class="seg" id="tx-seg">${[['s', 'Petit'], ['m', 'Normal'], ['l', 'Grand'], ['xl', 'Très grand']].map(([k, l]) => `<button data-tx="${k}" class="${k === tx ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="setgrp"><h3>Jeu</h3><div class="panel">
      ${sw('st-snd', 'Sons', 'Déchirure et ouverture des paquets', pref('wm_sound', '1') !== '0')}
      ${sw('st-vib', 'Vibrations', 'Combats, ouvertures, récompenses', pref('wm_vibe', '1') !== '0')}
      ${sw('st-mot', 'Animations', 'Désactive-les pour un affichage plus sobre', pref('wm_motion', '1') !== '0')}
      ${sw('st-fast', 'Ouverture rapide des paquets', 'Les cartes s\'affichent sans la mise en scène', pref('wm_fast', '0') === '1')}<button class="plain" id="st-god" style="width:100%;margin-top:10px">Revoir l'animation GODPACK</button></div></div>
    <div class="setgrp"><h3>Notifications</h3><div class="panel"><label class="switch"><span>Notifications<small id="st-pushtxt">Vérification…</small></span><input type="checkbox" id="st-push" disabled></label></div></div>
    <div class="setgrp"><h3>Compte</h3><div class="row"><button class="plain" id="st-me" style="flex:1">Mon profil</button><button class="plain" id="st-out" style="flex:1;color:#ff8a80">Déconnexion</button></div>
      <p class="build">Build ${BUILD}${cfg?.version && cfg.version !== BUILD ? ` · serveur ${esc(cfg.version)} — recharge l'appli` : ''}</p></div>`;
  v.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { setPref('wm_theme', b.dataset.th); v.querySelectorAll('[data-th]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#tx-seg').onclick = e => { const b = e.target.closest('[data-tx]'); if (!b) return; setPref('wm_text', b.dataset.tx); $('#tx-seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#st-snd').onchange = e => setPref('wm_sound', e.target.checked ? '1' : '0');
  $('#st-vib').onchange = e => { setPref('wm_vibe', e.target.checked ? '1' : '0'); if (e.target.checked) { toast('Vibrations activées (rechargement conseillé)'); try { navigator.vibrate?.(40); } catch { /* non supporté */ } } };
  $('#st-mot').onchange = e => setPref('wm_motion', e.target.checked ? '1' : '0');
  $('#st-fast').onchange = e => setPref('wm_fast', e.target.checked ? '1' : '0');
  $('#st-god').onclick = () => window.previewGod?.();
  $('#st-me').onclick = () => playerSheet(me.id); $('#st-out').onclick = logout;
  pushState().then(st => {
    const t = $('#st-pushtxt'), c = $('#st-push'); if (!t) return;
    t.textContent = { ok: 'Activées sur cet appareil', off: 'Enchères, défis, amis… même écran verrouillé', denied: 'Bloquées : autorise-les dans les réglages du téléphone', install: 'Ajoute d\'abord l\'appli à l\'écran d\'accueil (Partager → Sur l\'écran d\'accueil)', none: 'Non disponibles sur ce navigateur' }[st] || '';
    c.checked = st === 'ok'; c.disabled = !(st === 'ok' || st === 'off');
    c.onchange = async () => { c.disabled = true; try { if (c.checked) { await enablePush(); toast('Notifications activées'); api('/push/test', {}).catch(() => {}); } else { await disablePush(); toast('Notifications désactivées'); } } catch (e) { c.checked = !c.checked; toast(e.message); } c.disabled = false; };
  });
};

// ---------- personnalisation du profil : photo et titre ----------
views.customize = async v => {
  const d = await api('/titles'); await loadCosmetics(true);
  const cur = d.current;
  const card = t => `<button class="titlecard ${t.unlocked ? 'ok' : ''} ${t.season ? 'season' : ''} ${cur === t.id ? 'on' : ''}" data-ti="${t.id}" ${t.unlocked ? '' : 'disabled'}>
    <b>${esc(t.label)}</b><small>${t.season ? 'Saison 1 · bientôt' : esc(t.desc)}</small>
    ${t.unlocked ? (cur === t.id ? '<em>Équipé</em>' : '<em>Débloqué</em>') : t.prog ? `<div class="qbar"><i style="width:${Math.min(100, Math.round(t.prog[0] / t.prog[1] * 100))}%"></i></div><small>${fmt(Math.min(t.prog[0], t.prog[1]))} / ${fmt(t.prog[1])}</small>` : `<em class="lock">Verrouillé</em>`}</button>`;
  const n = d.titles.filter(t => t.unlocked).length;
  v.innerHTML = `${pageHead('Mon profil', 'Photo et titre affichés partout dans le jeu')}
    <div class="panel avpanel"><div class="avbig">${avatar(me.name)}</div><div class="grow"><b>${esc(me.name)}</b>${cur ? `<div>${ttl(me.name)}</div>` : '<div class="mut">Aucun titre équipé</div>'}
      <div class="row" style="margin-top:10px"><button id="av-pick">${me.av ? 'Changer la photo' : 'Ajouter une photo'}</button>${me.av ? '<button class="plain" id="av-del">Retirer</button>' : ''}<button class="plain" id="pf-view">Voir ma page</button></div></div>
      <input type="file" id="av-file" accept="image/*" hidden></div>
    <h3 class="sec">Titres · ${n} / ${d.titles.length} débloqués</h3>
    ${cur ? '<p><button class="plain" id="ti-none">Ne plus afficher de titre</button></p>' : ''}
    ${Object.entries(d.cats).map(([k, l]) => `<h3 class="sec" style="margin-top:14px">${esc(l)}</h3><div class="titles">${d.titles.filter(t => t.cat === k).map(card).join('')}</div>`).join('')}`;
  $('#pf-view').onclick = () => playerSheet(me.id);
  $('#av-pick').onclick = () => $('#av-file').click();
  $('#av-file').onchange = e => { const f = e.target.files[0]; if (f) cropSheet(f); e.target.value = ''; };
  $('#av-del')?.addEventListener('click', safe(async () => { await api('/me/avatar', { data: null }); await refreshMe(); await loadCosmetics(true); toast('Photo retirée'); render(); }));
  $('#ti-none')?.addEventListener('click', safe(async () => { await api('/me/title', { id: null }); await refreshMe(); await loadCosmetics(true); render(); }));
  v.querySelectorAll('[data-ti]').forEach(b => b.onclick = safe(async () => { await api('/me/title', { id: b.dataset.ti }); await refreshMe(); await loadCosmetics(true); toast('Titre équipé'); render(); }));
};
/** Recadrage de la photo : on déplace l'image au doigt, on zoome avec le curseur ; le résultat est un carré JPEG de 192 px. */
async function cropSheet(file) {
  let bmp; try { bmp = await createImageBitmap(file); } catch { return toast('Image illisible'); }
  const m = $('#modal'), S = 240, OUT = 192;
  m.hidden = false;
  m.innerHTML = `<div class="cropsheet"><h2>Ta photo</h2><p class="mut" style="margin:0 0 10px">Glisse pour cadrer, zoome avec le curseur.</p>
    <div class="cropbox" id="cb" style="width:${S}px;height:${S}px"><canvas id="cv" width="${S}" height="${S}"></canvas><span class="cropring"></span></div>
    <input type="range" id="cz" min="1" max="4" step="0.01" value="1" style="width:100%;margin:12px 0">
    <div class="row"><button id="cs-ok" style="flex:1">Enregistrer</button><button class="plain" id="cs-no" style="flex:1">Annuler</button></div></div>`;
  const cv = $('#cv'), cx = cv.getContext('2d'), base = Math.max(S / bmp.width, S / bmp.height);
  let z = 1, ox = 0, oy = 0;
  const clamp = () => { const w = bmp.width * base * z, h = bmp.height * base * z; ox = Math.min(0, Math.max(S - w, ox)); oy = Math.min(0, Math.max(S - h, oy)); };
  const draw = () => { clamp(); cx.fillStyle = '#000'; cx.fillRect(0, 0, S, S); cx.drawImage(bmp, ox, oy, bmp.width * base * z, bmp.height * base * z); };
  const center = () => { ox = (S - bmp.width * base * z) / 2; oy = (S - bmp.height * base * z) / 2; };
  center(); draw();
  $('#cz').oninput = e => { const nz = +e.target.value, cxm = (S / 2 - ox) / (bmp.width * base * z), cym = (S / 2 - oy) / (bmp.height * base * z); z = nz; ox = S / 2 - cxm * bmp.width * base * z; oy = S / 2 - cym * bmp.height * base * z; draw(); };
  let drag = null;
  $('#cb').onpointerdown = e => { drag = { x: e.clientX - ox, y: e.clientY - oy }; $('#cb').setPointerCapture(e.pointerId); };
  $('#cb').onpointermove = e => { if (!drag) return; ox = e.clientX - drag.x; oy = e.clientY - drag.y; draw(); };
  $('#cb').onpointerup = $('#cb').onpointercancel = () => { drag = null; };
  const close = () => { m.hidden = true; m.innerHTML = ''; bmp.close?.(); };
  $('#cs-no').onclick = close;
  $('#cs-ok').onclick = safe(async () => {
    $('#cs-ok').disabled = true;
    const out = document.createElement('canvas'); out.width = out.height = OUT;
    out.getContext('2d').drawImage(cv, 0, 0, S, S, 0, 0, OUT, OUT);
    await api('/me/avatar', { data: out.toDataURL('image/jpeg', 0.82) });
    close(); await refreshMe(); await loadCosmetics(true); toast('Photo enregistrée'); render();
  });
}
/** Menu « Plus » : tous les écrans qui ne tiennent pas dans la barre du bas, rangés par thème. D'autres écrans (quêtes, boutique…) viendront s'y ajouter. */
function moreSheet() {
  const m = $('#modal'), close = () => { m.hidden = true; m.innerHTML = ''; };
  const g = GROUP[tab];
  const T = (key, icon, label, sub, badge = 0) => `<button class="mtile ${tab === key ? 'on' : ''}" data-go="${key}"><span class="mi">${ico(icon)}</span><b>${label}</b><small>${sub}</small>${badge ? `<i class="mb">${badge > 9 ? '9+' : badge}</i>` : ''}</button>`;
  m.hidden = false;
  m.innerHTML = `<div class="moresheet" role="dialog" aria-label="Menu"><span class="grab" aria-hidden="true"></span>
    <div class="mhead">${avatar(me.name)}<div><b>${esc(me.name)}</b><small>${fmt(me.coins)} pièces · ${me.test ? '∞' : me.packs} paquet${me.packs > 1 ? 's' : ''}</small></div><button class="plain mx" id="mo-x" aria-label="Fermer">✕</button></div>
    <h3>Jouer</h3><div class="mgrid">${T('dquiz', 'book', 'Quiz du jour', me.dq === 'done' ? 'Terminé · à demain' : 'Gagne des paquets', me.dq === 'new' ? 1 : 0)}${T('quests', 'medal', 'Quêtes', 'Défis du jour', me.qc)}${T('tournaments', 'trophy', 'Tournois', 'Mise et combats à 4')}${T('daily', 'spark', 'Récompense', me.daily ? 'À récupérer !' : 'Déjà reçue · à demain', me.daily ? 1 : 0)}</div>
    <h3>Explorer</h3><div class="mgrid">${T('search', 'search', 'Chercher', 'Trouver une carte')}${T('rank', 'trophy', 'Classement', 'Les meilleurs joueurs')}${T('ach', 'medal', 'Succès', 'Objectifs et primes')}${T('trades', 'swap', 'Échanges', 'Troquer des cartes')}</div>
    <h3>Social</h3><div class="mgrid">${T('msg', 'chat', 'Messages', 'Écrire à un joueur', me.dm)}${T('friends', 'friends', 'Amis', 'QR code, demandes', me.badge)}</div>
    <h3>Mon compte</h3><div class="mgrid">${T('profile', 'user', 'Mon profil', 'Vitrine et stats')}${T('customize', 'medal', 'Personnaliser', 'Photo et titres')}${T('settings', 'gear', 'Réglages', 'Thèmes, sons, notifications')}${me.admin ? T('admin', 'shield', 'Admin', 'Tableau de bord, journal') : ''}</div></div>`;
  $('#mo-x').onclick = close; m.onclick = e => { if (e.target === m) close(); };
  m.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    const k = b.dataset.go; close();
    if (k === 'profile') return playerSheet(me.id);
    if (k === 'daily') return me.daily ? dailyModal() : toast('Tu as déjà récupéré ta récompense du jour, reviens demain !');
    lastPack = null; tab = k; if (game?.view === 'end') game = null; render();
  });
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { if (b.dataset.tab === 'more') return moreSheet(); if (tab !== b.dataset.tab) lastPack = null; tab = b.dataset.tab; if (game?.view === 'end') game = null; render(); });
async function start() {
  $('#auth').hidden = true;                       // pas de formulaire de connexion qui clignote quand on est déjà connecté
  $('#boot').hidden = false;
  let ok = false;
  for (let essai = 0; essai < 8 && !ok; essai++) {  // réseau absent ou serveur qui démarre : on réessaie sans déconnecter
    try {
      const [c, , h] = await Promise.all([api('/config'), refreshMe(), api('/hits'), loadCosmetics(true)]);   // trois appels en parallèle au démarrage
      if (c.version && c.version !== BUILD) { if (await applyUpdate(c.version)) return; setTimeout(() => checkVersion(c.version), 2500); }   // appli ouverte depuis un cache plus ancien que le serveur : on se met à jour avant d'afficher quoi que ce soit
      cfg = c; RAR = cfg.labels; RANK = Object.fromEntries(cfg.rarities.map((r, i) => [r, i]));
      showHits(h.hits); ACH_NAMES = cfg.ach || [];
      ok = true;
    } catch (e) {
      if (e.status === 401) return;               // jeton refusé : logout() a déjà ramené à la connexion
      $('#boot').textContent = 'Connexion au serveur…';
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  $('#boot').hidden = true;
  if (!ok) { $('#auth').hidden = false; $('#a-err').textContent = 'Serveur injoignable. Réessaie dans un instant (tu restes connecté).'; return; } $('#app').hidden = false; connect(); render();
  setTimeout(() => ['/auctions', '/friends'].forEach(p => api(p).catch(() => {})), 1500); schedulePrefetch();   // pré-chargement des onglets suivants
  let pending = null; try { pending = localStorage.getItem('wm_friend_code'); localStorage.removeItem('wm_friend_code'); } catch { /* stockage indisponible */ }
  if (pending) addByCode(pending);
  setTimeout(pushStartup, 2500);
  setTimeout(() => { if (me.daily && $('#modal').hidden && !game) dailyModal(); }, 900);   // première connexion du jour : la récompense s'affiche
}
const urlCode = new URLSearchParams(location.search).get('friend');
if (urlCode) { try { localStorage.setItem('wm_friend_code', urlCode); } catch { /* stockage indisponible */ } history.replaceState(null, '', location.pathname); }
if (!token && urlCode) $('#a-friend').hidden = false;
if (token) start();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
