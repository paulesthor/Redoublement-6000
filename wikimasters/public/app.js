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
let token = store.get(), me = null, cfg = null, tab = 'packs', ws = null, online = new Set();
let game = null; // duel de quiz ou combat en cours
let tick, lastPack = null;

async function api(path, body) {
  const r = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) logout();
  if (!r.ok) { const err = new Error(j.error || 'Erreur'); err.status = r.status; throw err; }
  return j;
}
function toast(msg) { const d = document.createElement('div'); d.textContent = msg; $('#toast').append(d); setTimeout(() => d.remove(), 3500); }
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };
const fmt = n => (n ?? 0).toLocaleString('fr-FR');

// ---------- connexion ----------
async function auth(kind) {
  $('#a-err').textContent = '';
  try {
    const r = await fetch('/api/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('#a-name').value, password: $('#a-pw').value, invite: $('#a-invite').value }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    token = j.token; store.set(token); start();
  } catch (e) { $('#a-err').textContent = e.message; }
}
$('#a-login').onclick = () => auth('login'); $('#a-register').onclick = () => auth('register');
function logout() { store.clear(); location.reload(); }

// ---------- websocket ----------
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + token);
  ws.onmessage = e => onWs(JSON.parse(e.data));
  ws.onclose = () => { if (token) setTimeout(connect, 1500); };
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !token || !me) return;
  if (!ws || ws.readyState > 1) connect();                  // la connexion a été coupée en arrière-plan
  refreshMe().then(() => { if (!game) render(); }).catch(() => {});
});
const send = o => ws?.readyState === 1 && ws.send(JSON.stringify(o));
function onWs(m) {
  if (m.t === 'online') { online = new Set(m.ids); if (tab === 'duel' && !game) render(); }
  else if (m.t === 'notify' || m.t === 'info') { toast(m.msg); refreshMe(); }
  else if (m.t === 'error') toast(m.msg);
  else if (m.t === 'friend') onFriend(m);
  else if (m.t === 'hit') { recentHits.unshift(m); showHits(recentHits); }
  else if (m.t === 'refresh') { if (tab === (m.what === 'auctions' ? 'market' : m.what) && !game) render(); if (m.what === 'auctions' && lotOpen) lotSheet(lotOpen); refreshMe(); }
  else if (m.t === 'challenge') {
    $('#modal').hidden = false;
    $('#modal').innerHTML = `<div><h2>Défi</h2><p>${esc(m.name)} te propose un ${m.mode === 'battle' ? 'combat de cartes' : 'duel de quiz'}.</p>
      <div class="row"><button id="ok">Accepter</button><button id="no" class="plain">Refuser</button></div></div>`;
    $('#ok').onclick = () => { send({ t: 'accept', from: m.from, mode: m.mode }); $('#modal').hidden = true; };
    $('#no').onclick = () => { send({ t: 'decline', from: m.from }); $('#modal').hidden = true; };
  }
  else if (/^(duel|battle)|^(question|reveal)$/.test(m.t)) gameEvent(m);
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

let lotOpen = null;
async function lotSheet(id) {
  const m = $('#modal'); lotOpen = id;
  const [{ auctions }, { bids }] = await Promise.all([api('/auctions'), api(`/auctions/${id}/bids`)]);
  const a = auctions.find(x => x.id == id);
  if (!a) { m.hidden = true; lotOpen = null; return; }
  const min = Math.max(a.start_price, a.bid + 1);
  m.hidden = false;
  m.innerHTML = `<div class="detail"><h2>${esc(a.title)}</h2>
    <p class="mut"><span class="rar ${a.rarity}">${RAR[a.rarity]}</span> · par ${esc(a.seller)} · prix moyen ${a.avg_price ?? '—'}</p>
    <div class="lotbox"><div><small>${a.bid ? 'Meilleure offre' : 'Mise de départ'}</small><b>${ico('coin')}${a.bid || a.start_price}</b>${a.bid ? `<small>${esc(a.bidder)}${a.leading ? ' (toi)' : ''}</small>` : ''}</div>
      <div class="time" data-end="${a.ends_at}">${ico('clock')}<span></span></div></div>
    ${a.mine ? '<p class="mut">C\'est ta vente.</p>' : `<label class="fld">Ton offre (minimum ${min})<input id="bid-v" type="number" inputmode="numeric" value="${min}"></label>
      <div class="chips wrap" id="bid-q">${[0, 5, 10, 25].map(d => `<button data-d="${d}">${d ? '+' + d : 'Min'}</button>`).join('')}</div>
      <div class="row"><button id="bid-ok">Enchérir</button><button id="bid-no" class="plain">Fermer</button></div>`}
    ${a.mine ? '<div class="row"><button id="bid-no" class="plain">Fermer</button></div>' : ''}
    <h3 class="hist-h">Historique des offres</h3>
    <div class="hist">${bids.length ? bids.map(b => `<div><span>${esc(b.name)}</span><b>${ico('coin')}${b.amount}</b><em>${new Date(b.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</em></div>`).join('') : '<p class="mut">Aucune offre pour l\'instant.</p>'}</div></div>`;
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
const cardHtml = (c, { acts = '', tag = '', cls = '', extra = '' } = {}) => (cardIndex.set(c.id, c), `<div class="card ${c.rarity} ${c.shiny ? 'shiny' : ''} ${cls}" data-id="${c.id}">
  <div class="img ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}>${c.image ? '' : noimg(c)}<span class="chip">${ABBR[c.rarity]}</span></div>
  <div class="tags">${c.isNew ? '<span class="tag new">Nouveau</span>' : ''}${c.qty > 1 ? `<span class="tag">×${c.qty}</span>` : tag}${c.shiny ? '<span class="tag shiny">Shiny</span>' : ''}</div>
  <div class="body"><div class="t">${esc(c.title)}</div>
    <div class="meta"><span class="rar ${c.rarity}">${RAR[c.rarity]}</span><span>ATK <b>${fmt(c.atk)}</b></span><span>DEF <b>${fmt(c.def)}</b></span></div>${extra}</div>
  ${acts ? `<div class="acts">${acts}</div>` : ''}</div>`);

/** Fiche détaillée d'une carte (toucher une carte). */
function showCard(id) {
  const c = cardIndex.get(+id); if (!c) return;
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="detail"><div class="card ${c.rarity} ${c.shiny ? 'shiny' : ''}" style="margin-bottom:12px">
      <div class="img big ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}>${c.image ? '' : noimg(c)}<span class="chip">${ABBR[c.rarity]}</span></div>
      <div class="body"><div class="t">${esc(c.title)}</div>
        <div class="meta"><span class="rar ${c.rarity}">${RAR[c.rarity]}${c.shiny ? ' · Shiny' : ''}</span><span>ATK <b>${fmt(c.atk)}</b></span><span>DEF <b>${fmt(c.def)}</b></span></div></div></div>
    <p class="extract">${c.extract ? esc(c.extract) : '<span class="mut">Description en cours de chargement…</span>'}</p>
    <p class="mut">Défausse : ${sellValue(c)} pièces${c.avg_price != null ? ` · prix moyen au marché : ${c.avg_price}` : ''}</p>
    <div class="row"><a class="btn" href="https://fr.wikipedia.org/wiki/${encodeURIComponent(c.title.replace(/ /g, '_'))}" target="_blank" rel="noopener">Lire sur Wikipédia</a><button class="plain" id="det-close">Fermer</button></div></div>`;
  $('#det-close').onclick = () => { m.hidden = true; m.innerHTML = ''; };
  m.onclick = e => { if (e.target === m) { m.hidden = true; m.innerHTML = ''; } };
}
document.addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (!card || e.target.closest('button, a') || card.classList.contains('pick') || !$('#modal').hidden) return;
  showCard(card.dataset.id);
});

/** Récupère description + image des cartes d'un tirage qui n'en ont pas encore (attend au plus ~3 s). */
async function fillMissing(r) {
  const ids = r.cards.filter(c => !c.extract || (!c.image && c.enriched < 2)).map(c => c.id);
  if (!ids.length) return;
  try {
    const { cards } = await Promise.race([api('/cards/enrich', { ids }), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 3000))]);
    const by = new Map(cards.map(x => [x.id, x]));
    r.cards.forEach(c => { const x = by.get(c.id); if (x) Object.assign(c, { extract: x.extract, image: x.image, enriched: x.enriched }); });
  } catch { /* on affiche sans : la carte se complétera plus tard */ }
}

// ---------- vues ----------
const GROUP = { packs: 'packs', album: 'album', search: 'search', duel: 'duel', rank: 'duel', market: 'market', trades: 'market', friends: 'friends' };
const ico = (name, cls = '') => `<svg class="ic ${cls}"><use href="#i-${name}"/></svg>`;
const pageHead = (title, sub = '') => `<div class="pagehead"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
/** Contrôle segmenté : ouvre une autre vue du même groupe (ex. Enchères / Échanges). */
const seg = (items, current) => `<div class="seg">${items.map(([k, label]) => `<button class="${k === current ? 'on' : ''}" data-seg="${k}">${esc(label)}</button>`).join('')}</div>`;
const bindSeg = v => v.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { tab = b.dataset.seg; render(); });
const avColor = name => `hsl(${[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 62% 68%)`;
const avatar = (name, on = false) => `<span class="av ${on ? 'on' : ''}" style="--avc:${avColor(name)}">${esc(String(name)[0]?.toUpperCase() || '?')}</span>`;
const timeLeft = ms => { const r = Math.max(0, Math.round(ms / 1000)); return r >= 3600 ? `${Math.floor(r / 3600)} h ${Math.floor(r % 3600 / 60)} min` : r >= 60 ? `${Math.floor(r / 60)} min ${r % 60} s` : `${r} s`; };
const COMBAT_SEG = [['duel', 'Combats'], ['rank', 'Classement']];
const MARKET_SEG = [['market', 'Enchères'], ['trades', 'Échanges']];

const views = {
  async packs(v) {
    const d = cfg.drop, tot = Object.values(d).reduce((a, b) => a + b, 0), pct = x => +(x / tot * 100).toFixed(2);
    v.innerHTML = `<div class="hero"><h1>Ouvrir un paquet</h1>
      <p class="sub">Découvre ${cfg.packSize} nouvelles cartes Wikipédia</p>
      <div class="packart" id="packart">${packSvg('full')}</div>
      <button id="open" ${me.packs || me.test ? '' : 'disabled'}>Ouvrir</button>
      <div class="stock"><div class="pips">${Array.from({ length: cfg.packMax }, (_, i) => `<i class="${i < me.packs ? 'on' : ''}"></i>`).join('')}</div>
        <p>${me.test ? '<b>∞</b> paquets · mode test' : `<b>${me.packs}</b> / ${cfg.packMax} paquets disponibles${me.packs < cfg.packMax ? ` · prochain dans <b id="cd"></b>` : ''}`}</p></div>
      <button id="buy" class="plain buy" ${me.coins >= cfg.packPrice ? '' : 'disabled'}>Acheter et ouvrir · ${cfg.packPrice} pièces</button>
      <details class="panel rates"><summary>Taux de drop</summary>
        <div class="ratelist">${cfg.rarities.map(r => `<div><span class="rar ${r}">${RAR[r]}</span><b>${pct(d[r])} %</b></div>`).join('')}</div>
        <p class="mut" style="margin:12px 0 0;font-size:13px">Une légendaire a ${+(cfg.shinyChance * 100).toFixed(2)} % de chance d'être shiny. Catalogue : ${fmt(cfg.catalog)} pages. Aucune garantie : tout dépend de la chance.</p></details>
      <div class="lastpack" id="lastpack" hidden><h3 class="sec">Dernier tirage</h3><div id="out" class="grid"></div></div></div>`;
    const show = r => {
      lastPack = r; $('#lastpack').hidden = false; $('#out').innerHTML = [...r.cards].sort((a, b) => RANK[b.rarity] - RANK[a.rarity]).map(c => cardHtml(c)).join('');
    };
    if (lastPack) show(lastPack);
    // ouverture animée : les cartes arrivent une par une, de la moins rare à la plus rare
    const openAnimated = path => safe(async () => {
      $('#open').disabled = $('#buy').disabled = true; $('#open').textContent = 'Ouverture…';
      // la requête part tout de suite et le paquet se déchire pendant ce temps : le chargement est masqué par l'animation
      const cardsPromise = (async () => {
        const r = await api(path, {});
        await fillMissing(r);                       // description + image prêtes avant d'afficher la carte
        lastPack = r;
        refreshMe().catch(() => {});
        return r.cards;
      })();
      cardsPromise.catch(() => {});
      try { await playReveal(cardsPromise, { labels: RAR, rank: RANK, fmt, cardHtml, noimg }); }
      finally { render(); }
    });
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
    const { cards, total, rarityAvg } = await api('/album');
    const value = c => c.avg_price ?? sellValue(c);
    const have = {}; cards.forEach(c => { if (!c.shiny) have[c.rarity] = (have[c.rarity] || 0) + 1; });
    const worth = cards.reduce((s, c) => s + value(c) * c.qty, 0);
    const dupes = cards.reduce((s, c) => s + c.qty - 1, 0);
    let rar = '';
    v.innerHTML = `${pageHead('Collection', `${cards.length} cartes uniques`)}
      <div class="tiles">
        <div class="tile"><b>${cards.length}</b><span>cartes uniques</span></div>
        <div class="tile"><b>${cards.reduce((s, c) => s + c.qty, 0)}</b><span>exemplaires</span></div>
        <div class="tile"><b>${dupes}</b><span>doublons</span></div>
        <div class="tile gold"><b>${fmt(worth)}</b><span>valeur estimée (pièces)</span></div>
      </div>
      <div class="panel"><h3>Progression</h3><div class="prog" style="margin:0">${cfg.rarities.map(r => `<div><div class="top"><span class="rar ${r}">${RAR[r]}</span><span>${have[r] || 0} / ${fmt(total[r] ?? 0)}</span></div>
        <div class="bar" style="color:var(--${r})"><i style="width:${Math.max((have[r] || 0) ? 3 : 0, (have[r] || 0) / (total[r] || 1) * 100)}%;background:var(--${r})"></i></div>
        <span class="mut" style="font-size:11.5px">vente moy. ${rarityAvg[r] ? fmt(rarityAvg[r].avg) : '—'}</span></div>`).join('')}</div></div>
      <div class="toolbar">
        <div class="search">${ico('search')}<input id="flt" placeholder="Rechercher une carte" autocomplete="off"></div>
        <select id="srt"><option value="rar">Tri : rareté</option><option value="name">Tri : nom</option><option value="qty">Tri : quantité</option><option value="val">Tri : valeur</option></select>
        <label class="row" style="gap:8px;color:var(--mut);font-size:13px"><input type="checkbox" id="dup"> doublons</label>
        <div class="chips" id="chips"><button class="on" data-r="">Toutes</button>${cfg.rarities.map(r => `<button data-r="${r}" style="--cc:var(--${r})">${RAR[r]}</button>`).join('')}</div>
      </div>
      <div class="row" style="margin-bottom:14px">
        <button class="plain" data-bulk="common" ${dupes ? '' : 'disabled'}>Vendre les doublons communs</button>
        <button class="plain" data-bulk="uncommon" ${dupes ? '' : 'disabled'}>… jusqu'aux peu communes</button></div>
      <div class="grid" id="g"></div>`;
    const draw = () => {
      const f = $('#flt').value.toLowerCase(), s = $('#srt').value, d = $('#dup').checked;
      const list = cards.filter(c => c.title.toLowerCase().includes(f) && (!rar || c.rarity === rar) && (!d || c.qty > 1));
      list.sort({ rar: (a, b) => RANK[b.rarity] - RANK[a.rarity] || b.views - a.views, name: (a, b) => a.title.localeCompare(b.title, 'fr'),
        qty: (a, b) => b.qty - a.qty, val: (a, b) => value(b) - value(a) }[s]);
      $('#g').innerHTML = list.map(c => cardHtml(c, {
        extra: `<div class="meta">Défausse <b>${sellValue(c)}</b> · Marché <b>${c.avg_price ?? '—'}</b></div>`,
        acts: `<button class="plain" data-d="${c.id}">Défausser</button><button class="plain" data-a="${c.id}">Vendre</button>`,
      })).join('') || '<div class="empty" style="grid-column:1/-1">Aucune carte ne correspond.</div>';
      $('#g').querySelectorAll('[data-d]').forEach(b => b.onclick = safe(async () => {
        const c = cards.find(x => x.id == b.dataset.d);
        if (c.qty === 1 && !(await ask('Défausser ?', [], { text: `Ta dernière « ${c.title} » pour ${sellValue(c)} pièces.`, ok: 'Défausser' }))) return;
        const r = await api('/discard', { card_id: c.id, qty: 1 }); toast(`+${r.price} pièces`); await refreshMe(); render();
      }));
      $('#g').querySelectorAll('[data-a]').forEach(b => b.onclick = safe(async () => {
        const c = cards.find(x => x.id == b.dataset.a);
        await sellSheet(c);
      }));
    };
    ['flt', 'srt', 'dup'].forEach(id => $('#' + id).oninput = draw);
    $('#chips').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      rar = b.dataset.r; $('#chips').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw();
    };
    v.querySelectorAll('[data-bulk]').forEach(b => b.onclick = safe(async () => {
      if (!(await ask('Vendre les doublons ?', [], { text: 'Un exemplaire de chaque carte est conservé.', ok: 'Vendre' }))) return;
      const r = await api('/discard-dupes', { max_rarity: b.dataset.bulk }); toast(`${r.count} cartes vendues, +${r.price} pièces`); await refreshMe(); render();
    }));
    draw();
    // photos manquantes : on retente en arrière-plan (Wikipédia, puis Wikidata) et on complète les cartes sans recharger la page
    const need = cards.filter(c => !c.image && c.enriched < 2).slice(0, 40);
    if (need.length) api('/cards/enrich', { ids: need.map(c => c.id) }).then(({ cards: got }) => {
      let changed = false;
      for (const x of got) {
        const c = cards.find(k => k.id === x.id); if (!c) continue;
        if (x.image && !c.image) { c.image = x.image; changed = true; }
        c.extract ||= x.extract; c.enriched = x.enriched;
      }
      if (changed && $('#g')) draw();
    }).catch(() => {});
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
    v.innerHTML = `${pageHead('Combats', 'Défie un joueur connecté')}${seg(COMBAT_SEG, 'duel')}
      <div class="panel"><p class="mut" style="margin:0"><b style="color:var(--fg)">Quiz</b> : 5 questions, les réponses rapides rapportent plus. <b style="color:var(--fg)">Combat</b> : chacun choisit 3 cartes, la n°1 affronte la n°1 de l'adversaire, etc. (ATK contre DEF). Victoire : +50 pièces.</p></div>
      <div class="list">${users.map(u => `<div class="item ${u.me ? 'me' : ''}">${avatar(u.name, online.has(u.id))}
        <div class="grow"><div class="nm">${esc(u.name)}${u.me ? ' (toi)' : ''}</div><div class="sub">${online.has(u.id) ? 'En ligne' : 'Hors ligne'}</div></div>
        ${u.me ? '' : `<div class="acts">${['quiz', 'battle'].map(m => `<button data-id="${u.id}" data-mode="${m}" ${online.has(u.id) ? '' : 'disabled'} class="${m === 'quiz' ? 'plain' : ''}">${m === 'quiz' ? 'Quiz' : 'Combat'}</button>`).join('')}</div>`}</div>`).join('')}</div>`;
    bindSeg(v);
    v.querySelectorAll('[data-id]').forEach(b => b.onclick = () => send({ t: 'challenge', to: +b.dataset.id, mode: b.dataset.mode }));
  },

  async market(v) {
    const { auctions } = await api('/auctions');
    v.innerHTML = `${pageHead('Marché', 'Enchères entre joueurs')}${seg(MARKET_SEG, 'market')}` + (auctions.length
      ? `<div class="list">${auctions.map(a => `<div class="item lot" style="--c:var(--${a.rarity})">
          <div class="thumb ${a.image ? '' : 'noimg'}" ${a.image ? `style="background-image:url('${esc(a.image)}')"` : ''}>${a.image ? '' : noimg(a)}<span class="chip" style="--c:var(--${a.rarity})">${ABBR[a.rarity]}</span></div>
          <div class="info"><div class="nm">${esc(a.title)}</div>
            <div class="sub"><span class="rar ${a.rarity}">${RAR[a.rarity]}</span><span>par ${esc(a.seller)}</span><span>prix moyen ${a.avg_price ?? '—'}</span><span>${a.bids || 0} offre${a.bids > 1 ? 's' : ''}</span></div>
            <div class="price">${ico('coin')}${a.bid || a.start_price}<span class="mut" style="font-size:12px;font-weight:400;font-family:var(--f-body)">${a.bid ? `${esc(a.bidder)}${a.leading ? ' (toi)' : ''}` : 'mise de départ'}</span></div>
            <div class="time" data-end="${a.ends_at}">${ico('clock')}<span></span></div></div>
          <div class="acts" style="align-self:center">${a.mine ? '<span class="mut">Ta vente</span>' : ''}<button class="${a.mine ? 'plain' : ''}" data-lot="${a.id}">${a.mine ? 'Voir' : 'Enchérir'}</button></div></div>`).join('')}</div>`
      : '<div class="empty">Aucune enchère en cours.<br>Mets une carte en vente depuis ta collection.</div>');
    bindSeg(v);
    v.querySelectorAll('[data-lot]').forEach(b => b.onclick = safe(() => lotSheet(b.dataset.lot)));
    const upd = () => v.querySelectorAll('[data-end]').forEach(s => { const ms = s.dataset.end - Date.now(); s.querySelector('span').textContent = timeLeft(ms); s.classList.toggle('hot', ms < 60000); });
    upd(); tick = setInterval(upd, 1000);
  },

  async trades(v) {
    const [{ trades }, { users }, { cards }] = await Promise.all([api('/trades'), api('/users'), api('/album')]);
    v.innerHTML = `${pageHead('Marché', 'Échange des cartes avec un joueur')}${seg(MARKET_SEG, 'trades')}
      <div class="panel"><h3>Proposer un échange</h3><div class="fr-add" style="flex-direction:column">
        <select id="t-to">${users.filter(u => !u.me).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
        <select id="t-off">${cards.map(c => `<option value="${c.id}">Je donne : ${esc(c.title)}</option>`).join('')}</select>
        <input id="t-q" placeholder="Carte voulue (tape son nom)" list="t-list" autocomplete="off"><datalist id="t-list"></datalist><button id="t-go">Proposer l'échange</button></div></div>
      <h3 class="sec">En attente</h3>` + (trades.length ? `<div class="list">${trades.map(t => {
        const mine = t.from_id === me.id;
        return `<div class="item">${avatar(mine ? t.to_name : t.from_name)}<div class="grow"><div class="nm">${mine ? 'Toi' : esc(t.from_name)} → ${mine ? esc(t.to_name) : 'toi'}</div>
          <div class="sub"><span><b style="color:var(--fg)">${esc(t.offer_title)}</b> contre <b style="color:var(--fg)">${esc(t.want_title)}</b></span></div></div>
          <div class="acts">${mine ? `<button class="plain" data-a="cancel" data-id="${t.id}">Annuler</button>` : `<button data-a="accept" data-id="${t.id}">Accepter</button><button class="plain" data-a="decline" data-id="${t.id}">Refuser</button>`}</div></div>`;
      }).join('')}</div>` : '<div class="empty">Aucun échange en attente.</div>');
    bindSeg(v);
    let found = [];
    $('#t-q').oninput = safe(async e => { found = (await api('/cards/search?q=' + encodeURIComponent(e.target.value))).cards; $('#t-list').innerHTML = found.map(c => `<option value="${esc(c.title)}">`).join(''); });
    $('#t-go').onclick = safe(async () => {
      const want = found.find(c => c.title === $('#t-q').value); if (!want) throw new Error('Choisis une carte dans la liste');
      await api('/trades', { to: $('#t-to').value, offer_card: $('#t-off').value, want_card: want.id }); toast('Proposition envoyée'); render();
    });
    v.querySelectorAll('[data-a]').forEach(b => b.onclick = safe(async () => { await api(`/trades/${b.dataset.id}/${b.dataset.a}`, {}); await refreshMe(); render(); }));
  },

  async friends(v) {
    const f = await api('/friends');
    const link = `${location.origin}/?friend=${f.code}`;
    v.innerHTML = `${pageHead('Amis', `${f.friends.length} ami${f.friends.length > 1 ? 's' : ''}`)}
      ${f.incoming.length ? `<div class="panel"><h3>Demandes reçues</h3><div class="list">${f.incoming.map(r => `<div class="item">${avatar(r.name)}<div class="grow"><div class="nm">${esc(r.name)}</div><div class="sub">veut devenir ton ami</div></div>
        <div class="acts"><button data-resp="${r.id}" data-ok="1">Accepter</button><button class="plain" data-resp="${r.id}">Refuser</button></div></div>`).join('')}</div></div>` : ''}
      <div class="panel"><h3>Ajouter par pseudo</h3>
        <div class="fr-add"><input id="fr-name" placeholder="Pseudo du joueur" autocapitalize="off" autocomplete="off"><button id="fr-send">Envoyer la demande</button></div>
        <p class="mut" style="margin:10px 0 0;font-size:13px">L'autre joueur doit accepter ta demande.</p>
        ${f.outgoing.length ? `<p class="mut" style="margin:6px 0 0;font-size:13px">En attente : ${f.outgoing.map(r => esc(r.name)).join(', ')}</p>` : ''}</div>
      <div class="panel"><h3>Mon QR code</h3>
        <div class="qrwrap" id="qr"></div>
        <p class="mut" style="margin:0 0 12px;font-size:13px">Un ami qui scanne ce code devient ton ami tout de suite, sans validation.</p>
        <div class="row"><button id="fr-scan">${ico('qr')} Scanner un QR code</button><button class="plain" id="fr-copy">Copier mon lien</button></div></div>
      <h3 class="sec">Mes amis</h3>
      ${f.friends.length ? `<div class="list">${f.friends.map(a => `<div class="item">${avatar(a.name, a.online)}<div class="grow"><div class="nm">${esc(a.name)}${a.isNew ? '<span class="newtag">Nouveau</span>' : ''}</div><div class="sub">${a.online ? 'En ligne' : 'Hors ligne'}</div></div>
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

  async rank(v) {
    const { players } = await api('/leaderboard');
    v.innerHTML = `${pageHead('Classement', 'Score = valeur des cartes uniques (selon la rareté) + 10 par victoire')}${seg(COMBAT_SEG, 'rank')}
      <div class="list">${players.map((p, i) => `<div class="item r${i + 1} ${p.id === me.id ? 'me' : ''}"><span class="rank-n">${i + 1}</span>${avatar(p.name, online.has(p.id))}
        <div class="grow"><div class="nm">${esc(p.name)}</div><div class="sub"><span>${p.uniques} cartes</span><span>${p.wins} V / ${p.losses} D</span><span>${fmt(p.coins)} pièces</span></div></div>
        <div class="score">${fmt(p.score)}<small>points</small></div></div>`).join('')}</div>`;
    bindSeg(v);
  },
};

// ---------- quiz & combat en cours ----------
function gameEvent(m) {
  tab = 'duel'; markTab();
  if (m.t === 'duel_start') game = { kind: 'quiz', id: m.id, names: m.names, score: {}, view: 'wait' };
  else if (m.t === 'question') game = { ...game, view: 'q', q: m, picked: null, reveal: null, end: Date.now() + m.time };
  else if (m.t === 'reveal') { game.reveal = m; game.score = m.score; }
  else if (m.t === 'duel_end') { game = { ...game, view: 'end', result: m }; refreshMe(); }
  else if (m.t === 'battle_start') game = { kind: 'battle', id: m.id, names: m.names, rounds: m.rounds, view: 'pick', sel: [] };
  else if (m.t === 'battle_cancel') game = null;
  else if (m.t === 'battle_end') { game = { ...game, kind: 'battle', view: 'end', result: m }; refreshMe(); }
  renderGame();
}
async function renderGame() {
  const v = $('#view'); clearInterval(tick);
  if (!game) return render();
  const names = o => Object.entries(game.names).map(([id, n]) => `${esc(n)} : <b>${o?.[id] ?? 0}</b>`).join(' · ');
  if (game.view === 'wait') return v.innerHTML = pageHead('Duel de quiz', 'Début dans un instant…');
  if (game.kind === 'quiz' && game.view === 'q') {
    const q = game.q, rv = game.reveal;
    v.innerHTML = `${pageHead(`Question ${q.n} / ${q.total}`)}<p class="mut">${names(game.score)}</p><div class="qbar"><i id="tb" style="width:100%"></i></div>
      <p style="white-space:pre-wrap">${esc(q.text)}</p>` + q.options.map((o, i) =>
        `<button class="opt ${rv ? (i === rv.answer ? 'ok' : (rv.picks[me.id] === i ? 'ko' : '')) : (game.picked === i ? 'sel' : '')}" data-i="${i}" ${rv || game.picked !== null ? 'disabled' : ''}>${esc(o)}</button>`).join('');
    v.querySelectorAll('.opt').forEach(b => b.onclick = () => { game.picked = +b.dataset.i; send({ t: 'answer', id: game.id, choice: game.picked }); renderGame(); });
    if (!rv) tick = setInterval(() => { const t = $('#tb'); if (t) t.style.width = Math.max(0, (game.end - Date.now()) / q.time * 100) + '%'; }, 100);
  } else if (game.kind === 'battle' && game.view === 'pick') {
    const { cards } = await api('/album');
    const draw = () => {
      v.innerHTML = `${pageHead(`Combat — choisis ${game.rounds} cartes`)}
        <p class="mut">L'ordre compte : la 1re carte affronte la 1re de l'adversaire. Sélection : ${game.sel.map(id => esc(cards.find(c => c.id === id).title)).join(' → ') || 'aucune'}</p>
        <div class="sticky-bar"><button id="go" ${game.sel.length === game.rounds ? '' : 'disabled'}>Valider l'équipe (${game.sel.length}/${game.rounds})</button></div>
        <div class="grid">${cards.map(c => cardHtml(c, { cls: 'pick ' + (game.sel.includes(c.id) ? 'sel' : ''), tag: game.sel.includes(c.id) ? `<span class="tag">n°${game.sel.indexOf(c.id) + 1}</span>` : '' })).join('')}</div>`;
      v.querySelectorAll('.card').forEach(el => el.onclick = () => {
        const id = +el.dataset.id, i = game.sel.indexOf(id);
        if (i >= 0) game.sel.splice(i, 1); else if (game.sel.length < game.rounds) game.sel.push(id);
        draw();
      });
      $('#go').onclick = () => { send({ t: 'pick', id: game.id, cards: game.sel }); v.innerHTML = pageHead('Combat', 'Équipe validée, en attente de l’adversaire…'); };
    };
    draw();
  } else if (game.view === 'end') {
    const r = game.result;
    if (game.kind === 'quiz') {
      v.innerHTML = `${pageHead(r.winner === null ? 'Égalité' : r.winner === me.id ? 'Victoire' : 'Défaite')}<div class="panel">${names(r.score)}</div><button id="back">Retour</button>`;
    } else {
      const iA = r.a === me.id, mine = x => (iA ? x : null);
      v.innerHTML = `${pageHead(r.winner === null ? 'Égalité' : r.winner === me.id ? 'Victoire' : 'Défaite')}
        <table><tr><th>Manche</th><th>${esc(r.names[r.a])}</th><th></th><th>${esc(r.names[r.b])}</th></tr>
        ${r.rounds.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.a.title)} <span class="mut">(${x.da} dégâts)</span></td>
          <td>${x.winner === r.a ? '◀' : x.winner === r.b ? '▶' : '='}</td><td>${esc(x.b.title)} <span class="mut">(${x.db} dégâts)</span></td></tr>`).join('')}</table>
        <p><button id="back" style="margin-top:12px">Retour</button></p>`;
    }
    $('#back').onclick = () => { game = null; render(); };
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
function markTab() { document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === GROUP[tab])); }
/** Copie l'en-tête de chaque colonne dans les cellules (data-label) : le CSS mobile affiche les lignes comme des fiches. */
function labelTables(root) {
  root.querySelectorAll('table').forEach(t => {
    const heads = [...t.querySelectorAll('tr:first-child th')].map(h => h.textContent.trim());
    if (!heads.length) return;
    t.querySelectorAll('tr').forEach(tr => [...tr.children].forEach((td, i) => { if (td.tagName === 'TD' && heads[i]) td.dataset.label = heads[i]; }));
  });
}
const render = safe(async () => {
  clearInterval(tick); markTab();
  if (tab === 'duel' && game) return renderGame();
  await views[tab]($('#view'));
  labelTables($('#view'));
  window.scrollTo(0, 0);
});
async function refreshMe() {
  me = await api('/me');
  document.querySelector('nav [data-tab=friends]')?.classList.toggle('has-badge', me.badge > 0);
  $('#me').innerHTML = `<span class="pill">${ico('packs')}${me.test ? '∞' : me.packs}</span><span class="pill gold">${ico('coin')}${fmt(me.coins)}</span><button class="avatar" id="profile" aria-label="Profil">${esc(me.name[0]?.toUpperCase() || '?')}</button>`;
  $('#profile').onclick = profileSheet;
}
function profileSheet() {
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div><div class="profile">${avatar(me.name)}<div><b>${esc(me.name)}</b><div class="mut">${me.wins} victoire${me.wins > 1 ? 's' : ''} · ${me.losses} défaite${me.losses > 1 ? 's' : ''}</div></div></div>
    <div class="row"><span class="pill gold">${ico('coin')}${fmt(me.coins)} pièces</span><span class="pill">${ico('packs')}${me.packs} paquets</span></div>
    <label class="switch"><span>Mode test<small>Ouvrir des paquets à l'infini</small></span><input type="checkbox" id="pf-test" ${me.test ? 'checked' : ''}></label>
    <label class="switch"><span>Sons<small>Déchirure et ouverture des paquets</small></span><input type="checkbox" id="pf-snd" ${localStorage.getItem('wm_sound') === '0' ? '' : 'checked'}></label>
    <div class="row" style="margin-top:18px"><button class="plain" id="pf-close" style="flex:1">Fermer</button><button class="plain" id="pf-out" style="flex:1;color:#ff8a80">Se déconnecter</button></div></div>`;
  $('#pf-close').onclick = () => { m.hidden = true; m.innerHTML = ''; };
  $('#pf-out').onclick = logout;
  $('#pf-snd').onchange = e => { try { localStorage.setItem('wm_sound', e.target.checked ? '1' : '0'); } catch { /* stockage indisponible */ } };
  $('#pf-test').onchange = safe(async e => { await api('/me/test-mode', { on: e.target.checked }); await refreshMe(); toast(e.target.checked ? 'Mode test activé' : 'Mode test désactivé'); if (tab === 'packs') render(); });
  m.onclick = e => { if (e.target === m) { m.hidden = true; m.innerHTML = ''; } };
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { if (tab !== b.dataset.tab) lastPack = null; tab = b.dataset.tab; if (game?.view === 'end') game = null; render(); });
async function start() {
  $('#auth').hidden = true;                       // pas de formulaire de connexion qui clignote quand on est déjà connecté
  $('#boot').hidden = false;
  let ok = false;
  for (let essai = 0; essai < 8 && !ok; essai++) {  // réseau absent ou serveur qui démarre : on réessaie sans déconnecter
    try {
      cfg = await api('/config');
      RAR = cfg.labels; RANK = Object.fromEntries(cfg.rarities.map((r, i) => [r, i]));
      await refreshMe();
      showHits((await api('/hits')).hits);
      ok = true;
    } catch (e) {
      if (e.status === 401) return;               // jeton refusé : logout() a déjà ramené à la connexion
      $('#boot').textContent = 'Connexion au serveur…';
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  $('#boot').hidden = true;
  if (!ok) { $('#auth').hidden = false; $('#a-err').textContent = 'Serveur injoignable. Réessaie dans un instant (tu restes connecté).'; return; } $('#app').hidden = false; connect(); render();
  let pending = null; try { pending = localStorage.getItem('wm_friend_code'); localStorage.removeItem('wm_friend_code'); } catch { /* stockage indisponible */ }
  if (pending) addByCode(pending);
}
const urlCode = new URLSearchParams(location.search).get('friend');
if (urlCode) { try { localStorage.setItem('wm_friend_code', urlCode); } catch { /* stockage indisponible */ } history.replaceState(null, '', location.pathname); }
if (!token && urlCode) $('#a-friend').hidden = false;
if (token) start();
