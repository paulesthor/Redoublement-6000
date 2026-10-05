'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RAR = { common: 'Commune', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire' };
let token = localStorage.getItem('wm_token'), me = null, tab = 'packs', ws = null, online = new Set(), duel = null;

async function api(path, body) {
  const r = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { logout(); }
  if (!r.ok) throw new Error(j.error || 'Erreur');
  return j;
}
function toast(msg) { const d = document.createElement('div'); d.textContent = msg; $('#toast').append(d); setTimeout(() => d.remove(), 4000); }
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { toast('⚠️ ' + e.message); } };

// ---------- auth ----------
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
const send = o => ws?.readyState === 1 && ws.send(JSON.stringify(o));
function onWs(m) {
  if (m.t === 'online') { online = new Set(m.ids); if (tab === 'duel' && !duel) render(); }
  else if (m.t === 'notify' || m.t === 'info') { toast(m.msg); refreshMe(); }
  else if (m.t === 'error') toast('⚠️ ' + m.msg);
  else if (m.t === 'refresh') { if (tab === m.what) render(); refreshMe(); }
  else if (m.t === 'challenge') {
    $('#modal').hidden = false;
    $('#modal').innerHTML = `<div class="panel center" style="margin:0"><h2>⚔️ Défi !</h2><p>${esc(m.name)} te défie en duel de quiz.</p>
      <div class="row"><button id="ok">Accepter</button><button id="no" class="alt">Refuser</button></div></div>`;
    $('#ok').onclick = () => { send({ t: 'accept', from: m.from }); $('#modal').hidden = true; };
    $('#no').onclick = () => { send({ t: 'decline', from: m.from }); $('#modal').hidden = true; };
  }
  else if (m.t.startsWith('duel') || m.t === 'question' || m.t === 'reveal') duelEvent(m);
}

// ---------- duel ----------
function duelEvent(m) {
  tab = 'duel'; markTab();
  if (m.t === 'duel_start') { duel = { id: m.id, names: m.names, score: {}, view: 'start' }; }
  else if (m.t === 'question') { duel = { ...duel, view: 'q', q: m, picked: null, reveal: null, end: Date.now() + m.time }; }
  else if (m.t === 'reveal') { duel.view = 'q'; duel.reveal = m; duel.score = m.score; }
  else if (m.t === 'duel_end') { duel = { ...duel, view: 'end', result: m }; refreshMe(); }
  renderDuel();
}
let tick;
function renderDuel() {
  const v = $('#view'); clearInterval(tick);
  if (!duel) return render();
  const names = Object.entries(duel.names).map(([id, n]) => `${esc(n)}: <b>${duel.score?.[id] ?? 0}</b>`).join(' · ');
  if (duel.view === 'start') v.innerHTML = '<h2>⚔️ Duel</h2><p>Préparez-vous…</p>';
  else if (duel.view === 'end') {
    const r = duel.result, w = r.winner;
    v.innerHTML = `<h2>${w === null ? 'Égalité !' : (w === me.id ? '🏆 Victoire !' : 'Défaite…')}</h2><p>${Object.entries(r.names).map(([id, n]) => `${esc(n)} : <b>${r.score[id]}</b>`).join(' — ')}</p><button id="back">Retour</button>`;
    $('#back').onclick = () => { duel = null; render(); };
  } else {
    const q = duel.q, rv = duel.reveal;
    v.innerHTML = `<h2>Question ${q.n}/${q.total}</h2><p class="mut">${names}</p><div class="bar"><i id="tb" style="width:100%"></i></div>
      <p style="white-space:pre-wrap">${esc(q.text)}</p>` +
      q.options.map((o, i) => `<button class="opt ${rv ? (i === rv.answer ? 'ok' : (rv.picks[me.id] === i ? 'ko' : '')) : (duel.picked === i ? 'sel' : '')}" data-i="${i}" ${rv || duel.picked !== null ? 'disabled' : ''}>${esc(o)}</button>`).join('');
    v.querySelectorAll('.opt').forEach(b => b.onclick = () => { duel.picked = +b.dataset.i; send({ t: 'answer', id: duel.id, choice: duel.picked }); renderDuel(); });
    if (!rv) tick = setInterval(() => { const t = $('#tb'); if (t) t.style.width = Math.max(0, (duel.end - Date.now()) / q.time * 100) + '%'; }, 100);
  }
}

// ---------- vues ----------
const cardHtml = (c, extra = '') => `<div class="card ${c.rarity}" title="${esc(c.extract || '')}">
  ${c.isNew ? '<span class="new">NOUVEAU</span>' : ''}${c.qty > 1 ? `<span class="qty">×${c.qty}</span>` : ''}
  <div class="img" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}>${c.image ? '' : '📄'}</div>
  <div class="t">${esc(c.title)}</div><div class="s"><span>${RAR[c.rarity]}</span><span>⚔${c.atk} 🛡${c.def}</span></div>${extra}</div>`;

const views = {
  async packs(v) {
    v.innerHTML = `<h2>Boosters</h2><p>Tu as <b>${me.packs}</b> booster(s). Un nouveau toutes les 10 min (max 10).
      ${me.packs < 10 ? `<span class="mut">Prochain dans <span id="cd"></span></span>` : ''}</p>
      <button id="open" ${me.packs ? '' : 'disabled'}>Ouvrir un booster</button><div id="out" class="grid reveal" style="margin-top:16px"></div>`;
    $('#open').onclick = safe(async () => {
      const r = await api('/packs/open', {});
      $('#out').innerHTML = r.cards.map(c => cardHtml(c)).join('');
      $('#out').querySelectorAll('.card').forEach((c, i) => c.style.animationDelay = i * 0.15 + 's');
      await refreshMe(); $('#open').disabled = !me.packs;
    });
    const t0 = Date.now(), next = me.nextPackIn;
    tick = setInterval(() => { const cd = $('#cd'); if (!cd) return; const s = Math.max(0, Math.round((next - (Date.now() - t0)) / 1000)); cd.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s === 0) { clearInterval(tick); refreshMe().then(render); } }, 500);
  },
  async album(v) {
    const { cards, total } = await api('/album');
    const have = {}; cards.forEach(c => have[c.rarity] = (have[c.rarity] || 0) + 1);
    v.innerHTML = `<h2>Album (${cards.length} cartes)</h2><div class="row">${Object.keys(RAR).map(r => `<div style="min-width:130px"><small class="mut">${RAR[r]} ${have[r] || 0}/${total[r] || 0}</small><div class="bar"><i style="width:${(have[r] || 0) / (total[r] || 1) * 100}%;background:var(--${r})"></i></div></div>`).join('')}</div>
      <input id="flt" placeholder="Filtrer…" style="margin:12px 0"><div class="grid" id="g"></div>`;
    const draw = () => {
      const f = $('#flt').value.toLowerCase();
      $('#g').innerHTML = cards.filter(c => c.title.toLowerCase().includes(f)).map(c => cardHtml(c, `<div class="acts">
        <button class="alt" data-auc="${c.id}">Enchère</button>${c.qty > 1 ? `<button class="alt" data-sell="${c.id}">Vendre doublon</button>` : ''}</div>`)).join('');
      $('#g').querySelectorAll('[data-sell]').forEach(b => b.onclick = safe(async () => { const r = await api(`/cards/${b.dataset.sell}/sell`, {}); toast(`+${r.price} 🪙`); await refreshMe(); render(); }));
      $('#g').querySelectorAll('[data-auc]').forEach(b => b.onclick = () => {
        const price = prompt('Prix de départ (🪙) ?', '50'); if (!price) return;
        const min = prompt('Durée en minutes ?', '10'); if (!min) return;
        safe(async () => { await api('/auctions', { card_id: +b.dataset.auc, price, minutes: min }); toast('Mise aux enchères !'); render(); })();
      });
    };
    $('#flt').oninput = draw; draw();
  },
  async duel(v) {
    const { users } = await api('/users');
    v.innerHTML = `<h2>Duels de quiz</h2><p class="mut">5 questions, plus tu réponds vite plus tu gagnes de points. Vainqueur : +50 🪙.</p><table>` +
      users.map(u => `<tr><td><span class="dot ${online.has(u.id) ? 'on' : ''}"></span>${esc(u.name)}${u.me ? ' (toi)' : ''}</td><td>${u.me ? '' : `<button data-id="${u.id}" ${online.has(u.id) ? '' : 'disabled'}>Défier</button>`}</td></tr>`).join('') + '</table>';
    v.querySelectorAll('[data-id]').forEach(b => b.onclick = () => send({ t: 'challenge', to: +b.dataset.id }));
  },
  async market(v) {
    const { auctions } = await api('/auctions');
    v.innerHTML = `<h2>Enchères</h2>` + (auctions.length ? `<div class="grid">${auctions.map(a => cardHtml(a, `<div style="padding:0 8px 6px;font-size:12px">
      <div>${a.bid ? `<b>${a.bid} 🪙</b> par ${esc(a.bidder)}${a.leading ? ' (toi)' : ''}` : `Départ : ${a.start_price} 🪙`}</div>
      <div class="mut">par ${esc(a.seller)} · <span data-end="${a.ends_at}"></span></div></div>
      <div class="acts">${a.mine ? '<span class="mut" style="padding:4px">Ta vente</span>' : `<button data-bid="${a.id}" data-min="${Math.max(a.start_price, a.bid + 1)}">Enchérir</button>`}</div>`)).join('')}</div>` : '<p class="mut">Aucune enchère en cours. Mets une carte en vente depuis ton album !</p>');
    v.querySelectorAll('[data-bid]').forEach(b => b.onclick = () => {
      const amt = prompt(`Ton offre (min ${b.dataset.min} 🪙) ?`, b.dataset.min); if (!amt) return;
      safe(async () => { await api(`/auctions/${b.dataset.bid}/bid`, { amount: amt }); await refreshMe(); render(); })();
    });
    const upd = () => v.querySelectorAll('[data-end]').forEach(s => { const r = Math.max(0, Math.round((s.dataset.end - Date.now()) / 1000)); s.textContent = r >= 60 ? `${Math.floor(r / 60)} min ${r % 60}s` : `${r}s`; });
    upd(); tick = setInterval(upd, 1000);
  },
  async trades(v) {
    const [{ trades }, { users }, { cards }] = await Promise.all([api('/trades'), api('/users'), api('/album')]);
    v.innerHTML = `<h2>Échanges</h2><div class="panel"><h3 style="margin-top:0">Proposer un échange</h3><div class="row">
      <select id="t-to">${users.filter(u => !u.me).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
      <select id="t-off">${cards.map(c => `<option value="${c.id}">Je donne : ${esc(c.title)}</option>`).join('')}</select>
      <input id="t-q" placeholder="Carte voulue (recherche)" list="t-list"><datalist id="t-list"></datalist><button id="t-go">Proposer</button></div></div>
      <h3>En attente</h3>` + (trades.length ? `<table>${trades.map(t => {
        const mine = t.from_id === me.id;
        return `<tr><td>${mine ? 'Toi' : esc(t.from_name)} donne <b>${esc(t.offer_title)}</b> contre <b>${esc(t.want_title)}</b> de ${mine ? esc(t.to_name) : 'toi'}</td>
        <td>${mine ? `<button class="alt" data-a="cancel" data-id="${t.id}">Annuler</button>` : `<button data-a="accept" data-id="${t.id}">Accepter</button> <button class="alt" data-a="decline" data-id="${t.id}">Refuser</button>`}</td></tr>`;
      }).join('')}</table>` : '<p class="mut">Rien en attente.</p>');
    let found = [];
    $('#t-q').oninput = safe(async e => { const r = await api('/cards/search?q=' + encodeURIComponent(e.target.value)); found = r.cards; $('#t-list').innerHTML = found.map(c => `<option value="${esc(c.title)}">`).join(''); });
    $('#t-go').onclick = safe(async () => {
      const want = found.find(c => c.title === $('#t-q').value); if (!want) throw new Error('Choisis une carte dans la liste');
      await api('/trades', { to: $('#t-to').value, offer_card: $('#t-off').value, want_card: want.id }); toast('Proposition envoyée'); render();
    });
    v.querySelectorAll('[data-a]').forEach(b => b.onclick = safe(async () => { await api(`/trades/${b.dataset.id}/${b.dataset.a}`, {}); await refreshMe(); render(); }));
  },
  async rank(v) {
    const { players } = await api('/leaderboard');
    v.innerHTML = `<h2>Classement</h2><p class="mut">Score = valeur des cartes uniques (commune 1, rare 5, épique 20, légendaire 50) + 10 par victoire en duel.</p>
      <table><tr><th>#</th><th>Joueur</th><th>Score</th><th>Cartes</th><th>Duels V/D</th><th>🪙</th></tr>${players.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td><b>${p.score}</b></td><td>${p.uniques}</td><td>${p.wins}/${p.losses}</td><td>${p.coins}</td></tr>`).join('')}</table>`;
  },
};

function markTab() { document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); }
const render = safe(async () => {
  clearInterval(tick); markTab();
  if (tab === 'duel' && duel) return renderDuel();
  await views[tab]($('#view'));
});
async function refreshMe() {
  me = await api('/me');
  $('#me').innerHTML = `${esc(me.name)} · 🪙 ${me.coins} · 📦 ${me.packs} <button class="alt" id="lo" style="padding:2px 8px">Quitter</button>`;
  $('#lo').onclick = logout;
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; if (tab !== 'duel') duel = duel?.view === 'end' ? null : duel; render(); });

async function start() {
  try { await refreshMe(); } catch { return; }
  $('#auth').hidden = true; $('#app').hidden = false; connect(); render();
}
if (token) start();
