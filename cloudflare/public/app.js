'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let RAR = {}, RANK = {}; // remplis depuis /api/config (raretés, libellés)
let token = localStorage.getItem('wm_token'), me = null, cfg = null, tab = 'packs', ws = null, online = new Set();
let game = null; // duel de quiz ou combat en cours
let tick, lastPack = null;

async function api(path, body) {
  const r = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) logout();
  if (!r.ok) throw new Error(j.error || 'Erreur');
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
    token = j.token; localStorage.setItem('wm_token', token); start();
  } catch (e) { $('#a-err').textContent = e.message; }
}
$('#a-login').onclick = () => auth('login'); $('#a-register').onclick = () => auth('register');
function logout() { localStorage.removeItem('wm_token'); location.reload(); }

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
  else if (m.t === 'refresh') { if (tab === m.what) render(); refreshMe(); }
  else if (m.t === 'challenge') {
    $('#modal').hidden = false;
    $('#modal').innerHTML = `<div><h2>Défi</h2><p>${esc(m.name)} te propose un ${m.mode === 'battle' ? 'combat de cartes' : 'duel de quiz'}.</p>
      <div class="row"><button id="ok">Accepter</button><button id="no" class="plain">Refuser</button></div></div>`;
    $('#ok').onclick = () => { send({ t: 'accept', from: m.from, mode: m.mode }); $('#modal').hidden = true; };
    $('#no').onclick = () => { send({ t: 'decline', from: m.from }); $('#modal').hidden = true; };
  }
  else if (/^(duel|battle)|^(question|reveal)$/.test(m.t)) gameEvent(m);
}

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
const cardIndex = new Map(); // cartes affichées, pour la fiche détaillée au toucher
const cardHtml = (c, { acts = '', tag = '', cls = '', extra = '' } = {}) => (cardIndex.set(c.id, c), `<div class="card ${c.rarity} ${c.shiny ? 'shiny' : ''} ${cls}" data-id="${c.id}">
  ${c.isNew ? '<span class="tag new">Nouveau</span>' : ''}${c.qty > 1 ? `<span class="tag">×${c.qty}</span>` : tag}${c.shiny ? '<span class="tag shiny">Shiny</span>' : ''}
  <div class="img" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}></div>
  <div class="body"><div class="t">${esc(c.title)}</div>
    <div class="meta"><span class="rar ${c.rarity}">${RAR[c.rarity]}</span><br>ATK ${fmt(c.atk)} · DEF ${fmt(c.def)}</div>${extra}</div>
  ${acts ? `<div class="acts">${acts}</div>` : ''}</div>`);

/** Fiche détaillée d'une carte (toucher une carte). */
function showCard(id) {
  const c = cardIndex.get(+id); if (!c) return;
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="detail"><div class="card ${c.rarity} ${c.shiny ? 'shiny' : ''}" style="margin-bottom:12px">
      <div class="img big" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}></div>
      <div class="body"><div class="t">${esc(c.title)}</div>
        <div class="meta"><span class="rar ${c.rarity}">${RAR[c.rarity]}${c.shiny ? ' · Shiny' : ''}</span> · ATK ${fmt(c.atk)} · DEF ${fmt(c.def)}</div></div></div>
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
  const ids = r.cards.filter(c => !c.extract).map(c => c.id);
  if (!ids.length) return;
  try {
    const { cards } = await Promise.race([api('/cards/enrich', { ids }), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 3000))]);
    const by = new Map(cards.map(x => [x.id, x]));
    r.cards.forEach(c => { const x = by.get(c.id); if (x) Object.assign(c, { extract: x.extract, image: x.image }); });
  } catch { /* on affiche sans : la carte se complétera plus tard */ }
}

// ---------- vues ----------
const views = {
  async packs(v) {
    const d = cfg.drop, tot = Object.values(d).reduce((a, b) => a + b, 0), pct = x => +(x / tot * 100).toFixed(2);
    v.innerHTML = `<div class="packpage"><h2>Ouvrir un paquet</h2>
      <p class="mut" style="margin:0">Découvrez ${cfg.packSize} nouvelles cartes Wikipédia</p>
      <div class="packart" id="packart"><b>W</b></div>
      <button id="open" ${me.packs ? '' : 'disabled'}>Ouvrir</button>
      <div class="counter"><b>${me.packs}</b> / ${cfg.packMax}<small>paquets disponibles</small>${me.packs < cfg.packMax ? '<small>Prochain dans <span id="cd"></span></small>' : ''}</div>
      <button id="buy" class="plain" ${me.coins >= cfg.packPrice ? '' : 'disabled'}>Acheter et ouvrir — ${cfg.packPrice} pièces</button>
      <details class="panel" style="width:100%;margin-top:14px;text-align:left"><summary>Taux de drop</summary><p class="mut" style="margin:8px 0 0">
        ${cfg.rarities.map(r => `<span class="rar ${r}">${RAR[r]}</span> ${pct(d[r])} %`).join(' · ')}.
        Une légendaire a ${+(cfg.shinyChance * 100).toFixed(2)} % de chance d'être shiny. Catalogue : ${fmt(cfg.catalog)} pages. Aucune garantie : tout dépend de la chance.</p></details>
      <div class="lastpack" id="lastpack" hidden><h3>Dernier tirage</h3><div id="out" class="grid"></div></div></div>`;
    const show = r => {
      lastPack = r; $('#lastpack').hidden = false; $('#out').innerHTML = [...r.cards].sort((a, b) => RANK[b.rarity] - RANK[a.rarity]).map(c => cardHtml(c)).join('');
    };
    if (lastPack) show(lastPack);
    // ouverture animée : les cartes arrivent une par une, de la moins rare à la plus rare
    const openAnimated = path => safe(async () => {
      $('#open').disabled = $('#buy').disabled = true; $('#open').textContent = 'Ouverture…'; $('#packart').classList.add('opening');
      let r;
      try { r = await api(path, {}); } catch (e) { $('#packart').classList.remove('opening'); $('#open').textContent = 'Ouvrir'; $('#open').disabled = !me.packs; $('#buy').disabled = false; throw e; }
      await fillMissing(r);                       // description + image prêtes avant d'afficher la carte
      lastPack = r;
      await refreshMe();
      await playReveal(r.cards, { labels: RAR, rank: RANK, fmt, cardHtml });
      render();
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
    const have = {}, copies = {}; cards.forEach(c => { if (!c.shiny) have[c.rarity] = (have[c.rarity] || 0) + 1; copies[c.rarity] = (copies[c.rarity] || 0) + c.qty; });
    const worth = cards.reduce((s, c) => s + value(c) * c.qty, 0);
    const dupes = cards.reduce((s, c) => s + c.qty - 1, 0);
    v.innerHTML = `<h2>Collection</h2>
      <div class="panel stats">
        <div><b>${cards.length}</b>cartes uniques</div><div><b>${cards.reduce((s, c) => s + c.qty, 0)}</b>exemplaires</div>
        <div><b>${dupes}</b>doublons</div><div><b>${fmt(worth)}</b>valeur estimée (pièces)</div>
        ${cfg.rarities.map(r => `<div style="min-width:110px"><span class="rar ${r}">${RAR[r]}</span> ${have[r] || 0}/${total[r] ?? 0}
          <div class="bar"><i style="width:${(have[r] || 0) / (total[r] || 1) * 100}%;background:var(--${r})"></i></div>
          <span class="mut">vente moy. ${rarityAvg[r] ? fmt(rarityAvg[r].avg) : '—'}</span></div>`).join('')}
      </div>
      <div class="row" style="margin-bottom:10px">
        <input id="flt" placeholder="Rechercher"><select id="rar"><option value="">Toutes raretés</option>${cfg.rarities.map(r => `<option value="${r}">${RAR[r]}</option>`).join('')}</select>
        <select id="srt"><option value="rar">Tri : rareté</option><option value="name">Tri : nom</option><option value="qty">Tri : quantité</option><option value="val">Tri : valeur</option></select>
        <label><input type="checkbox" id="dup"> doublons seulement</label>
        <span class="right row">
          <button class="plain" data-bulk="common" ${dupes ? '' : 'disabled'}>Vendre les doublons communs</button>
          <button class="plain" data-bulk="uncommon" ${dupes ? '' : 'disabled'}>… jusqu'aux peu communes</button></span></div>
      <div class="grid" id="g"></div>`;
    const draw = () => {
      const f = $('#flt').value.toLowerCase(), r = $('#rar').value, s = $('#srt').value, d = $('#dup').checked;
      const list = cards.filter(c => c.title.toLowerCase().includes(f) && (!r || c.rarity === r) && (!d || c.qty > 1));
      list.sort({ rar: (a, b) => RANK[b.rarity] - RANK[a.rarity] || b.views - a.views, name: (a, b) => a.title.localeCompare(b.title, 'fr'),
        qty: (a, b) => b.qty - a.qty, val: (a, b) => value(b) - value(a) }[s]);
      $('#g').innerHTML = list.map(c => cardHtml(c, {
        extra: `<div class="meta">Défausse ${sellValue(c)} · Marché ${c.avg_price ?? '—'}</div>`,
        acts: `<button class="plain" data-d="${c.id}">Défausser</button><button class="plain" data-a="${c.id}">Vendre</button>`,
      })).join('') || '<p class="mut">Aucune carte.</p>';
      $('#g').querySelectorAll('[data-d]').forEach(b => b.onclick = safe(async () => {
        const c = cards.find(x => x.id == b.dataset.d);
        if (c.qty === 1 && !(await ask('Défausser ?', [], { text: `Ta dernière « ${c.title} » pour ${sellValue(c)} pièces.`, ok: 'Défausser' }))) return;
        const r = await api('/discard', { card_id: c.id, qty: 1 }); toast(`+${r.price} pièces`); await refreshMe(); render();
      }));
      $('#g').querySelectorAll('[data-a]').forEach(b => b.onclick = safe(async () => {
        const c = cards.find(x => x.id == b.dataset.a);
        const r = await ask('Mettre en vente', [
          { label: `Prix de départ (pièces) — moyenne du marché : ${c.avg_price ?? 'aucune vente'}`, type: 'number', value: c.avg_price ?? sellValue(c) * 3 },
          { label: 'Durée', value: 10, options: [[10, '10 min'], [30, '30 min'], [60, '1 h'], [180, '3 h'], [360, '6 h'], [720, '12 h'], [1440, '24 h']] },
        ], { text: c.title, ok: 'Mettre en vente' });
        if (!r) return;
        await api('/auctions', { card_id: c.id, price: r[0], minutes: r[1] }); toast('Mise en vente'); render();
      }));
    };
    ['flt', 'rar', 'srt', 'dup'].forEach(id => $('#' + id).oninput = draw);
    v.querySelectorAll('[data-bulk]').forEach(b => b.onclick = safe(async () => {
      if (!(await ask('Vendre les doublons ?', [], { text: 'Un exemplaire de chaque carte est conservé.', ok: 'Vendre' }))) return;
      const r = await api('/discard-dupes', { max_rarity: b.dataset.bulk }); toast(`${r.count} cartes vendues, +${r.price} pièces`); await refreshMe(); render();
    }));
    draw();
  },

  async duel(v) {
    const { users } = await api('/users');
    v.innerHTML = `<h2>Combats</h2>
      <p class="mut">Quiz : 5 questions, les réponses rapides rapportent plus (victoire +50 pièces). Combat : chacun choisit 3 cartes, la carte n°1 affronte la n°1 de l'adversaire, etc. Les dégâts dépendent de l'ATK contre la DEF (victoire +50 pièces).</p>
      <table><tr><th>Joueur</th><th></th></tr>${users.map(u => `<tr><td><span class="dot ${online.has(u.id) ? 'on' : ''}"></span>${esc(u.name)}${u.me ? ' (toi)' : ''}</td>
        <td class="num">${u.me ? '' : ['quiz', 'battle'].map(m => `<button data-id="${u.id}" data-mode="${m}" ${online.has(u.id) ? '' : 'disabled'} class="${m === 'quiz' ? 'plain' : ''}">${m === 'quiz' ? 'Quiz' : 'Combat'}</button>`).join(' ')}</td></tr>`).join('')}</table>`;
    v.querySelectorAll('[data-id]').forEach(b => b.onclick = () => send({ t: 'challenge', to: +b.dataset.id, mode: b.dataset.mode }));
  },

  async market(v) {
    const { auctions } = await api('/auctions');
    v.innerHTML = `<h2>Enchères</h2>` + (auctions.length ? `<table><tr><th>Carte</th><th>Rareté</th><th>Vendeur</th><th class="num">Offre actuelle</th><th class="num">Prix moyen</th><th class="num">Fin</th><th></th></tr>
      ${auctions.map(a => `<tr><td>${esc(a.title)}</td><td><span class="rar ${a.rarity}">${RAR[a.rarity]}</span></td><td>${esc(a.seller)}</td>
        <td class="num">${a.bid ? `${a.bid} (${esc(a.bidder)}${a.leading ? ', toi' : ''})` : `départ ${a.start_price}`}</td>
        <td class="num">${a.avg_price ?? '—'}</td><td class="num" data-end="${a.ends_at}"></td>
        <td class="num">${a.mine ? '<span class="mut">ta vente</span>' : `<button data-bid="${a.id}" data-min="${Math.max(a.start_price, a.bid + 1)}">Enchérir</button>`}</td></tr>`).join('')}</table>`
      : '<p class="mut">Aucune enchère en cours. Mets une carte en vente depuis ta collection.</p>');
    v.querySelectorAll('[data-bid]').forEach(b => b.onclick = safe(async () => {
      const r = await ask('Enchérir', [{ label: `Ton offre en pièces (minimum ${b.dataset.min})`, type: 'number', value: b.dataset.min }], { ok: 'Enchérir' });
      if (!r) return;
      await api(`/auctions/${b.dataset.bid}/bid`, { amount: r[0] }); await refreshMe(); render();
    }));
    const upd = () => v.querySelectorAll('[data-end]').forEach(s => { const r = Math.max(0, Math.round((s.dataset.end - Date.now()) / 1000)); s.textContent = r >= 60 ? `${Math.floor(r / 60)} min ${r % 60} s` : `${r} s`; });
    upd(); tick = setInterval(upd, 1000);
  },

  async trades(v) {
    const [{ trades }, { users }, { cards }] = await Promise.all([api('/trades'), api('/users'), api('/album')]);
    v.innerHTML = `<h2>Échanges</h2><div class="panel row">
      <select id="t-to">${users.filter(u => !u.me).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
      <select id="t-off">${cards.map(c => `<option value="${c.id}">Je donne : ${esc(c.title)}</option>`).join('')}</select>
      <input id="t-q" placeholder="Carte voulue" list="t-list" size="26"><datalist id="t-list"></datalist><button id="t-go">Proposer</button></div>
      <h3>En attente</h3>` + (trades.length ? `<table>${trades.map(t => {
        const mine = t.from_id === me.id;
        return `<tr><td>${mine ? 'Toi' : esc(t.from_name)} : <b>${esc(t.offer_title)}</b> contre <b>${esc(t.want_title)}</b> (${mine ? esc(t.to_name) : 'toi'})</td>
          <td class="num">${mine ? `<button class="plain" data-a="cancel" data-id="${t.id}">Annuler</button>` : `<button data-a="accept" data-id="${t.id}">Accepter</button> <button class="plain" data-a="decline" data-id="${t.id}">Refuser</button>`}</td></tr>`;
      }).join('')}</table>` : '<p class="mut">Rien en attente.</p>');
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
    v.innerHTML = `<h2>Amis</h2>
      ${f.incoming.length ? `<div class="panel"><h3 style="margin-top:0">Demandes reçues</h3>${f.incoming.map(r => `<div class="frow"><span class="nm"><b>${esc(r.name)}</b> veut devenir ton ami</span>
        <button data-resp="${r.id}" data-ok="1">Accepter</button><button class="plain" data-resp="${r.id}">Refuser</button></div>`).join('')}</div>` : ''}
      <div class="panel"><h3 style="margin-top:0">Ajouter par pseudo</h3>
        <div class="row"><input id="fr-name" placeholder="Pseudo du joueur" autocapitalize="off" style="flex:1 1 180px"><button id="fr-send">Envoyer la demande</button></div>
        <p class="mut" style="margin:8px 0 0">L'autre joueur doit accepter ta demande.</p>
        ${f.outgoing.length ? `<p class="mut" style="margin:8px 0 0">En attente : ${f.outgoing.map(r => esc(r.name)).join(', ')}</p>` : ''}</div>
      <div class="panel"><h3 style="margin-top:0">Mon QR code</h3>
        <div class="qrwrap" id="qr"></div>
        <p class="mut" style="margin:0 0 10px">Un ami qui scanne ce code devient ton ami tout de suite, sans validation.</p>
        <div class="row"><button class="plain" id="fr-scan">Scanner un QR code</button><button class="plain" id="fr-copy">Copier mon lien</button></div></div>
      <h3>Mes amis (${f.friends.length})</h3>
      <div class="panel">${f.friends.length ? f.friends.map(a => `<div class="frow"><span class="dot ${a.online ? 'on' : ''}" style="margin:0"></span><span class="nm">${esc(a.name)}${a.isNew ? '<span class="newtag">Nouveau</span>' : ''}</span>
        <button class="plain" data-rm="${a.id}">Retirer</button></div>`).join('') : '<p class="mut" style="margin:0">Aucun ami pour l\'instant.</p>'}</div>`;
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
    v.innerHTML = `<h2>Classement</h2><p class="mut">Score = valeur des cartes uniques (selon la rareté) + 10 par victoire.</p>
      <table><tr><th>#</th><th>Joueur</th><th class="num">Score</th><th class="num">Cartes</th><th class="num">V / D</th><th class="num">Pièces</th></tr>
      ${players.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td class="num"><b>${p.score}</b></td><td class="num">${p.uniques}</td><td class="num">${p.wins} / ${p.losses}</td><td class="num">${fmt(p.coins)}</td></tr>`).join('')}</table>`;
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
  if (game.view === 'wait') return v.innerHTML = '<h2>Duel de quiz</h2><p class="mut">Début dans un instant…</p>';
  if (game.kind === 'quiz' && game.view === 'q') {
    const q = game.q, rv = game.reveal;
    v.innerHTML = `<h2>Question ${q.n} / ${q.total}</h2><p class="mut">${names(game.score)}</p><div class="bar"><i id="tb" style="width:100%;background:var(--fg)"></i></div>
      <p style="white-space:pre-wrap">${esc(q.text)}</p>` + q.options.map((o, i) =>
        `<button class="opt ${rv ? (i === rv.answer ? 'ok' : (rv.picks[me.id] === i ? 'ko' : '')) : (game.picked === i ? 'sel' : '')}" data-i="${i}" ${rv || game.picked !== null ? 'disabled' : ''}>${esc(o)}</button>`).join('');
    v.querySelectorAll('.opt').forEach(b => b.onclick = () => { game.picked = +b.dataset.i; send({ t: 'answer', id: game.id, choice: game.picked }); renderGame(); });
    if (!rv) tick = setInterval(() => { const t = $('#tb'); if (t) t.style.width = Math.max(0, (game.end - Date.now()) / q.time * 100) + '%'; }, 100);
  } else if (game.kind === 'battle' && game.view === 'pick') {
    const { cards } = await api('/album');
    const draw = () => {
      v.innerHTML = `<h2>Combat — choisis ${game.rounds} cartes</h2>
        <p class="mut">L'ordre compte : la 1re carte affronte la 1re de l'adversaire. Sélection : ${game.sel.map(id => esc(cards.find(c => c.id === id).title)).join(' → ') || 'aucune'}</p>
        <div class="sticky-bar"><button id="go" ${game.sel.length === game.rounds ? '' : 'disabled'}>Valider l'équipe (${game.sel.length}/${game.rounds})</button></div>
        <div class="grid">${cards.map(c => cardHtml(c, { cls: 'pick ' + (game.sel.includes(c.id) ? 'sel' : ''), tag: game.sel.includes(c.id) ? `<span class="tag">n°${game.sel.indexOf(c.id) + 1}</span>` : '' })).join('')}</div>`;
      v.querySelectorAll('.card').forEach(el => el.onclick = () => {
        const id = +el.dataset.id, i = game.sel.indexOf(id);
        if (i >= 0) game.sel.splice(i, 1); else if (game.sel.length < game.rounds) game.sel.push(id);
        draw();
      });
      $('#go').onclick = () => { send({ t: 'pick', id: game.id, cards: game.sel }); v.innerHTML = '<h2>Combat</h2><p class="mut">Équipe validée, en attente de l’adversaire…</p>'; };
    };
    draw();
  } else if (game.view === 'end') {
    const r = game.result;
    if (game.kind === 'quiz') {
      v.innerHTML = `<h2>${r.winner === null ? 'Égalité' : r.winner === me.id ? 'Victoire' : 'Défaite'}</h2><p>${names(r.score)}</p><button id="back">Retour</button>`;
    } else {
      const iA = r.a === me.id, mine = x => (iA ? x : null);
      v.innerHTML = `<h2>${r.winner === null ? 'Égalité' : r.winner === me.id ? 'Victoire' : 'Défaite'}</h2>
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
async function scanQr() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    return toast('Scanner indisponible sur ce navigateur : utilise l’appareil photo de ton téléphone sur le QR code de ton ami.');
  }
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = '<div id="scanner"><h2>Scanner un QR code</h2><video playsinline muted></video><p class="mut">Place le QR code de ton ami dans le cadre.</p><button class="plain" id="scan-close">Annuler</button></div>';
  let stream, stopped = false;
  const stop = () => { stopped = true; stream?.getTracks().forEach(t => t.stop()); m.hidden = true; m.innerHTML = ''; };
  $('#scan-close').onclick = stop;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = m.querySelector('video');
    video.srcObject = stream; await video.play();
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const loop = async () => {
      if (stopped) return;
      try {
        for (const c of await detector.detect(video)) {
          const code = (() => { try { return new URL(c.rawValue).searchParams.get('friend'); } catch { return null; } })();
          if (code) { stop(); return addByCode(code); }
        }
      } catch { /* image pas prête */ }
      setTimeout(loop, 250);
    };
    loop();
  } catch { stop(); toast('Impossible d’accéder à la caméra.'); }
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
function markTab() { document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); }
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
  $('#me').innerHTML = `<span>${esc(me.name)}</span><span><b>${fmt(me.coins)}</b> pièces</span><span class="mut">${me.packs} booster${me.packs > 1 ? 's' : ''}</span><button class="plain" id="lo">Quitter</button>`;
  $('#lo').onclick = logout;
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { if (tab !== b.dataset.tab) lastPack = null; tab = b.dataset.tab; if (game?.view === 'end') game = null; render(); });
async function start() {
  try {
    cfg = await api('/config');
    RAR = cfg.labels; RANK = Object.fromEntries(cfg.rarities.map((r, i) => [r, i]));
    await refreshMe();
    showHits((await api('/hits')).hits);
  } catch { return; }
  $('#auth').hidden = true; $('#app').hidden = false; connect(); render();
  let pending = null; try { pending = localStorage.getItem('wm_friend_code'); localStorage.removeItem('wm_friend_code'); } catch { /* stockage indisponible */ }
  if (pending) addByCode(pending);
}
const urlCode = new URLSearchParams(location.search).get('friend');
if (urlCode) { try { localStorage.setItem('wm_friend_code', urlCode); } catch { /* stockage indisponible */ } history.replaceState(null, '', location.pathname); }
if (!token && urlCode) $('#a-friend').hidden = false;
if (token) start();
