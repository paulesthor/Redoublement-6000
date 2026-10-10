'use strict';
// Ouverture de booster : les cartes apparaissent une par une, de la moins rare à la plus rare. On fait glisser la carte vers la
// gauche (ou bouton « Encore N cartes », flèches, clavier). Les légendaires ont une mise en scène façon « walkout » de FUT.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceNow = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('wm_fast') === '1'; } catch { return false; } };   // « ouverture rapide » dans les réglages
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const preload = urls => Promise.race([
    Promise.all(urls.filter(Boolean).map(u => new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = u; }))),
    sleep(2500),
  ]);
  const buzz = p => { try { navigator.vibrate?.(p); } catch { /* non supporté */ } };
  const ABBR = { common: 'C', uncommon: 'PC', rare: 'R', super: 'SR', ultra: 'UR', legendary: 'L' };
  const SWORDS = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#c0392b" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>';
  const SHIELD = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2f66c9" stroke-width="2.4" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>';


  /** GODPACK : fissure de lumière, onde de choc, éventail de cartes dorées, titre qui claque lettre par lettre, pluie d'or. Un toucher passe la scène. */
  async function godIntro(root, n) {
    buzz([60, 30, 60, 30, 120, 60, 240]);
    if (reduceNow()) { root.className = 'r-legendary'; root.innerHTML = `<div class="bg"></div><div class="godsplash"><span>Paquet exceptionnel</span><b>GODPACK</b><small>${n} cartes ultra rares et légendaires</small></div>`; await sleep(1500); return; }
    const fan = Array.from({ length: n }, (_, k) => { const t = n === 1 ? .5 : k / (n - 1), a = -70 + t * 140; return `<i style="--a:${a.toFixed(1)}deg;--x:${((t - .5) * 150).toFixed(0)}%;--d:${(1.5 + k * .07).toFixed(2)}s"></i>`; }).join('');
    const rain = Array.from({ length: 46 }, () => `<i style="left:${rand(0, 100).toFixed(1)}%;--s:${rand(3, 8).toFixed(1)}px;--t:${rand(1.6, 3.4).toFixed(2)}s;--dl:${rand(2.2, 4.4).toFixed(2)}s;--dx:${rand(-30, 30).toFixed(0)}px"></i>`).join('');
    const word = [...'GODPACK'].map((ch, k) => `<span style="--k:${k}">${ch}</span>`).join('');
    root.className = 'r-god'; root.innerHTML = `<div class="gp"><div class="gp-bg"></div><div class="gp-rays"></div><div class="gp-seam"></div><div class="gp-rings"><i></i><i></i><i></i></div>
      <div class="gp-fan">${fan}</div><div class="gp-rain">${rain}</div><div class="gp-flash"></div>
      <div class="gp-title"><small>Paquet exceptionnel</small><h1>${word}</h1><p>${n} cartes ultra rares et légendaires</p></div><button class="plain gp-skip">Passer</button></div>`;
    for (const [ms, p] of [[1100, 40], [1500, [120, 40, 200]], [2300, 30], [2700, 30], [3100, 30]]) setTimeout(() => buzz(p), ms);
    await new Promise(res => { const t = setTimeout(res, 5200); root.querySelector('.gp-skip').onclick = () => { clearTimeout(t); res(); }; });
    const gp = root.querySelector('.gp'); gp.classList.add('out'); await sleep(450);
  }

  /** Faux godpack : après la mise en scène, un énorme doigt d'honneur, puis un paquet de communes. Un toucher passe la scène. */
  async function fakeOut(root) {
    buzz([120, 40, 120, 40, 300]);
    const small = reduceNow();
    root.className = 'r-fake';
    root.innerHTML = `<div class="fko"><div class="fko-flash"></div><div class="fko-rain">${small ? '' : Array.from({ length: 22 }, () => `<i style="left:${rand(0, 100).toFixed(1)}%;--t:${rand(1.4, 3).toFixed(2)}s;--dl:${rand(0, 1.6).toFixed(2)}s;--s:${rand(22, 44).toFixed(0)}px">🖕</i>`).join('')}</div>
      <div class="fko-main"><div class="fko-finger">🖕</div><h1>T'AS CRU ?</h1><p>Petit paquet de communes pour te consoler 😂</p></div><button class="plain gp-skip">Continuer</button></div>`;
    await new Promise(res => { const t = setTimeout(res, small ? 2500 : 4200); root.querySelector('.gp-skip').onclick = () => { clearTimeout(t); res(); }; });
    const fk = root.querySelector('.fko'); fk.classList.add('out'); await sleep(350);
  }
  /**
   * Ouverture de 10 paquets d'un coup, façon Pokémon TCG : les dix boosters en ligne, chacun s'allume de la couleur de sa meilleure carte
   * (colonne de lumière plus ou moins haute selon la rareté), puis on les ouvre un par un (toucher) ou tous à la suite. Résumé des 100 cartes à la fin.
   * source : promesse de 10 tirages (tableaux de cartes). o = { labels, rank, fmt, cardHtml, again }. Résout 'again' si le joueur veut en rouvrir 10.
   */
  window.playTen = async function playTen(source, o) {
    let N = 10; const root = document.createElement('div');
    root.id = 'reveal'; root.className = 'r-ten'; document.body.append(root); document.body.classList.add('noscroll');
    const AURA = { common: '#a4b5a0', uncommon: '#86c4f5', rare: '#c09aec', super: '#ee91bc', ultra: '#f2a34f', legendary: '#fff1b8', shiny: '#bff5ff', god: '#ffd37a' };
    const HEIGHT = { common: 16, uncommon: 24, rare: 34, super: 46, ultra: 60, legendary: 78, shiny: 78, god: 82 };   // hauteur de la colonne de lumière (en % de l'écran)
    const FEEL = { common: [20], uncommon: [25], rare: [35], super: [50, 30], ultra: [70, 40, 70], legendary: [110, 40, 110, 40, 160], shiny: [110, 40, 110, 40, 160], god: [150, 40, 150, 40, 300] };
    const kill = () => { root.remove(); document.body.classList.remove('noscroll'); };
    root.innerHTML = `<div class="bg"></div><div class="tn"><div class="tn-head"><b>10 paquets</b><small class="tn-sub">Préparation des paquets…</small></div>
      <div class="tn-stage" aria-live="polite"><div class="tn-stack">${Array.from({ length: N }, (_, i) => `<div class="sl" style="--d:${i}"><div class="sl-body">${window.packSvg('body', { anim: false })}</div><div class="sl-top">${window.packSvg('top', { anim: false })}</div></div>`).join('')}</div></div>
      <div class="tn-row">${Array.from({ length: N }, (_, i) => `<button class="tn-pack" data-i="${i}" style="--i:${i}" disabled aria-label="Paquet ${i + 1}"><i class="tn-beam"></i><i class="tn-halo"></i><span class="tn-art"><span class="tn-back"><b>W</b></span></span><span class="tn-mini"></span></button>`).join('')}</div>
      <div class="tn-actions"><button class="tn-all" disabled>Tout ouvrir</button><button class="plain tn-skip" disabled>Résumé direct</button></div></div>`;
    const sub = root.querySelector('.tn-sub'), stage = root.querySelector('.tn-stage'), stack = root.querySelector('.tn-stack'), rowEl = root.querySelector('.tn-row'), layers = [...root.querySelectorAll('.sl')], packsEl = [...root.querySelectorAll('.tn-pack')], allBtn = root.querySelector('.tn-all'), skipBtn = root.querySelector('.tn-skip');
    for (const el of packsEl) { el.style.setProperty('--a', '#ffffff55'); }
    let packs; const t0 = Date.now();
    try { packs = await source; } catch (e) { kill(); throw e; }
    if (packs.length < N) { N = packs.length; layers.slice(N).forEach(l => l.remove()); layers.length = N; packsEl.splice(N).forEach(el => el.remove()); rowEl.style.gridTemplateColumns = `repeat(${N}, minmax(0, 60px))`; rowEl.style.justifyContent = 'center'; }   // un paquet a échoué en route : on montre ceux qui sont ouverts
    const best = cs => [...cs].sort((a, b) => o.rank[b.rarity] - o.rank[a.rarity] || (b.shiny | 0) - (a.shiny | 0))[0];
    const keyOf = cs => cs.god || cs.fake ? 'god' : cs.some(c => c.shiny) ? 'shiny' : best(cs).rarity;
    const info = packs.map(cs => ({ cs, top: best(cs), key: keyOf(cs), opened: false }));
    info.forEach(p => { if (p.top?.image) { const im = new Image(); im.src = p.top.image; } });
    // 1) la pile de dix boosters est déchirée l'un après l'autre (languette arrachée + éclair de la couleur de la meilleure carte du paquet)
    if (!reduceNow()) {
      await sleep(Math.max(0, 1200 - (Date.now() - t0)));                              // la pile reste un instant, le temps de bien la voir
      sub.textContent = 'Ouverture des paquets…';
      for (let i = 0; i < N && root.isConnected; i++) {
        const p = info[i], col = AURA[p.key], big = p.key === 'legendary' || p.key === 'shiny' || p.key === 'god', mid = p.key === 'ultra' || p.key === 'super';
        layers.forEach((l, k) => l.style.setProperty('--d', Math.max(0, k - i)));
        layers[i].classList.add('tear'); buzz(FEEL[p.key]);
        const b = document.createElement('i'); b.className = 'tn-burst' + (big ? ' big' : mid ? ' mid' : ''); b.style.setProperty('--a', col); stack.append(b); setTimeout(() => b.remove(), 900);
        root.style.setProperty('--flash', col); root.classList.remove('flash'); void root.offsetWidth; root.classList.add('flash');
        await sleep(big ? 460 : mid ? 340 : 240);
        layers[i].classList.add('gone');
      }
      await sleep(300); stack.classList.add('out'); await sleep(350);
    }
    stack.remove(); rowEl.classList.add('show');
    // 2) les dix tas de cartes s'allument l'un après l'autre, chacun de la couleur de sa meilleure carte
    await sleep(reduceNow() ? 0 : 450);
    for (let i = 0; i < N && root.isConnected; i++) {
      const el = packsEl[i], p = info[i];
      el.style.setProperty('--a', AURA[p.key]); el.style.setProperty('--bh', HEIGHT[p.key] + 'vh'); el.classList.add('lit', 'k-' + p.key);
      if (!reduceNow()) await sleep(p.key === 'common' || p.key === 'uncommon' ? 110 : 200);
    }
    if (!root.isConnected) return;
    sub.textContent = 'Touche un paquet, ou ouvre-les tous'; allBtn.disabled = skipBtn.disabled = false; packsEl.forEach(el => { el.disabled = false; });

    let busy = false, finished;
    const done = new Promise(r => { finished = r; });
    const close = res => { kill(); finished(res); };
    async function openOne(i) {
      const p = info[i]; if (p.opened || !root.isConnected) return;
      p.opened = true; const el = packsEl[i], c = p.top, col = AURA[p.key];
      el.classList.add('opening'); buzz(FEEL[p.key]); await sleep(reduceNow() ? 0 : 380);
      if (p.cs.god || p.cs.fake) {                                     // godpack (vrai ou faux) : la mise en scène complète, par-dessus
        const ov = document.createElement('div'); ov.id = 'reveal'; document.body.append(ov);
        try { await godIntro(ov, p.cs.length); if (p.cs.fake) await fakeOut(ov); } finally { ov.remove(); }
      }
      el.classList.remove('opening'); el.classList.add('opened');
      const mini = el.querySelector('.tn-mini'); mini.textContent = (o.labels?.[p.top.rarity] || '').slice(0, 2) || '★'; mini.style.setProperty('--m', AURA[p.top.shiny ? 'shiny' : p.top.rarity]);
      root.style.setProperty('--flash', col); root.classList.remove('flash'); void root.offsetWidth; root.classList.add('flash');
      stage.innerHTML = `<div class="tn-card" style="--a:${col}">${o.cardHtml(c, { star: true })}<small>Paquet ${i + 1} · ${p.cs.length} cartes${p.cs.some(x => x.isNew) ? ` · ${p.cs.filter(x => x.isNew).length} nouvelle${p.cs.filter(x => x.isNew).length > 1 ? 's' : ''}` : ''}</small></div>`;
      sub.textContent = `${info.filter(x => x.opened).length} / ${N} ouverts`;
    }
    const finishIfAll = async () => { if (info.every(p => p.opened)) { await sleep(reduceNow() ? 0 : 900); summary(); } };
    async function openAll() {
      if (busy) return; busy = true; allBtn.disabled = true; packsEl.forEach(el => { el.disabled = true; });
      for (let i = 0; i < N && root.isConnected; i++) if (!info[i].opened) { await openOne(i); await sleep(reduceNow() ? 0 : info[i].key === 'common' || info[i].key === 'uncommon' ? 650 : 1100); }
      busy = false; if (root.isConnected) await finishIfAll();
    }
    packsEl.forEach((el, i) => { el.onclick = async () => { if (busy) return; busy = true; await openOne(i); busy = false; await finishIfAll(); }; });
    allBtn.onclick = openAll;
    skipBtn.onclick = () => { if (busy) return; info.forEach(p => { p.opened = true; }); summary(); };

    // 2) résumé des 100 cartes
    function summary() {
      if (!root.isConnected) return;
      const cards = info.flatMap(p => p.cs).sort((a, b) => o.rank[b.rarity] - o.rank[a.rarity] || (b.shiny | 0) - (a.shiny | 0));
      const count = {}; for (const c of cards) count[c.rarity] = (count[c.rarity] || 0) + 1;
      const again = typeof o.again === 'function' ? o.again() : null;
      root.className = ''; root.removeAttribute('style');
      root.innerHTML = `<div class="bg"></div><div class="sum"><h2>10 paquets ouverts</h2>
        <div class="tn-count">${Object.keys(o.rank).sort((a, b) => o.rank[b] - o.rank[a]).filter(r => count[r]).map(r => `<span class="rar ${r}">${count[r]} ${esc(o.labels?.[r] || r)}</span>`).join('')}${cards.some(c => c.shiny) ? `<span class="rar shiny">${cards.filter(c => c.shiny).length} shiny</span>` : ''}</div>
        <div class="grid">${cards.map(c => o.cardHtml(c, { star: true })).join('')}</div>
        <div class="sticky-bar ${again ? 'split' : ''}"><button class="finish ${again ? 'plain' : ''}">Continuer</button>${again ? `<button class="again" ${again.ok ? '' : 'disabled'}>${esc(again.label)}</button>` : ''}</div></div>`;
      root.querySelector('.finish').onclick = () => close();
      if (again) root.querySelector('.again').onclick = () => close('again');
    }
    return done;
  };
  /** Aperçu du faux godpack (console : previewFake()). */
  window.previewFake = async () => {
    const root = document.createElement('div'); root.id = 'reveal'; root.className = 'r-god'; document.body.append(root); document.body.classList.add('noscroll');
    try { await godIntro(root, 10); await fakeOut(root); } finally { root.remove(); document.body.classList.remove('noscroll'); }
  };

  /** Aperçu de l'animation (page Réglages). */
  window.previewGod = async () => {
    const root = document.createElement('div'); root.id = 'reveal'; root.className = 'r-god'; document.body.append(root); document.body.classList.add('noscroll');
    try { await godIntro(root, 10); } finally { root.remove(); document.body.classList.remove('noscroll'); }
  };

  /**
   * @param source  cartes du tirage, ou promesse de ces cartes (le paquet se déchire pendant le chargement)
   * @param o       { labels, rank, fmt, cardHtml }
   */
  window.playReveal = async function playReveal(source, o) {
    const root = document.createElement('div');
    root.id = 'reveal';
    root.className = 'r-pack';
    document.body.append(root);
    document.body.classList.add('noscroll');

    // 1) le joueur déchire le paquet au doigt pendant que les cartes (et leurs images) se chargent
    const dataP = Promise.resolve(source);
    let cards;
    try {
      if (reduceNow()) { cards = await dataP; }
      else cards = await window.packStage(root, { dataP, rank: o.rank, buzz, preload });
    } catch (e) {                                                    // erreur serveur : on referme proprement
      root.remove(); document.body.classList.remove('noscroll');
      throw e;
    }
    const seq = [...cards].sort((a, b) => o.rank[a.rarity] - o.rank[b.rarity] || (a.shiny | 0) - (b.shiny | 0)); // moins rare d'abord
    const N = seq.length;
    buzz(30);
    if (cards.god || cards.fake) await godIntro(root, cards.length);   // GODPACK : mise en scène complète avant les cartes (le faux godpack joue exactement la même)
    if (cards.fake) await fakeOut(root);                                 // … puis la chute

    let i = -1, locked = true, drag = null, dx = 0, finished;
    const done = new Promise(r => { finished = r; });
    const wrapEl = () => root.querySelector('.wrap');
    const setDx = (px) => { const w = wrapEl(); if (!w) return; w.style.setProperty('--dx', px + 'px'); w.style.setProperty('--ry', (px * -.06) + 'deg'); w.style.setProperty('--rot', (px * .02) + 'deg'); };
    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release);
      root.remove(); document.body.classList.remove('noscroll'); finished(result);
    };

    // 2) une carte à la fois
    async function show(n) {
      i = n; locked = true; dx = 0;
      const c = seq[n], legend = c.rarity === 'legendary', ultra = c.rarity === 'ultra', last = n === N - 1;
      if (c._ready) await Promise.race([c._ready, sleep(1800)]);          // photo de cette carte : on l'attend un instant, sans bloquer
      root.className = `r-${c.rarity} ${c.shiny ? 'shiny' : ''} ${cards.god ? 'god' : ''}`;
      if (c._ready) c._ready.then(() => {                                  // la photo arrive pendant qu'on regarde la carte : on la glisse en place
        if (i !== n) return;
        const ph = root.querySelector('.ph.noimg'), ds = root.querySelector('.ds');
        if (c.image && ph) { ph.classList.remove('noimg'); ph.style.backgroundImage = `url('${c.image}')`; ph.querySelectorAll('svg').forEach(x => x.remove()); }
        if (c.extract && ds && !ds.textContent) ds.textContent = c.extract;
      });
      root.innerHTML = `<div class="bg"></div>${legend ? '<div class="rays"></div>' : ''}
        <div class="top"><span class="count">Carte <b>${n + 1}</b> / ${N}</span><button class="plain skip">Passer</button></div>
        <div class="stage"><div class="wrap"><div class="rc">
          <div class="ph ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}>${c.image ? '' : o.noimg(c)}
            <span class="chip">${ABBR[c.rarity]}</span>${c.shiny ? '<span class="chip sh">Shiny</span>' : ''}${c.isNew ? '<span class="newtag">Nouveau</span>' : ''}</div>
          <div class="in"><div class="nm">${esc(c.title)}</div>
            <div class="rl">${esc(o.labels[c.rarity])}${c.shiny ? ' · Shiny' : ''}</div>
            <p class="ds">${c.extract ? esc(c.extract) : ''}</p></div>
          <div class="sts"><span>${SWORDS} <b>${o.fmt(c.atk)}</b></span><span>${SHIELD} <b>${o.fmt(c.def)}</b></span></div>
        </div></div></div>
        <div class="bottom"><div class="nav"><button class="plain arrow prev" ${n ? '' : 'disabled'} aria-label="Précédente">‹</button>
          <div class="dots">${seq.map((s, k) => `<i class="${k === n ? 'on' : k < n ? 'seen' : ''}" ${k === n ? '' : `style="--dc:var(--${s.rarity})"`}></i>`).join('')}</div>
          <button class="plain arrow nxt" ${last ? 'disabled' : ''} aria-label="Suivante">›</button></div>
          <button class="next">${last ? 'Continuer' : `Encore ${N - 1 - n} carte${N - 1 - n > 1 ? 's' : ''}`}</button></div>`;
      root.querySelector('.skip').onclick = summary;
      root.querySelector('.next').onclick = next;
      root.querySelector('.nxt').onclick = next;
      root.querySelector('.prev').onclick = prev;
      const wrap = wrapEl();
      wrap.style.visibility = 'hidden';
      if (legend && !reduceNow()) await walkout(c);
      wrap.style.visibility = '';
      wrap.classList.add(legend || n === 0 ? 'pop' : 'slide');
      if (ultra || legend) { const ring = document.createElement('div'); ring.className = 'ring'; root.append(ring); setTimeout(() => ring.remove(), 1200); }
      if (legend) sparks(34, true);
      buzz(legend ? [60, 40, 140] : ultra ? [40, 30, 60] : 12);
      await sleep(reduceNow() ? 0 : legend ? 520 : 360);
      locked = false;
    }

    async function walkout(c) {
      const w = document.createElement('div');
      w.className = 'walk';
      w.innerHTML = `<div class="streak"></div><div class="streak s2"></div><div class="wt">${c.shiny ? 'SHINY' : 'LÉGENDAIRE'}</div>
        <div class="wsub">${c.shiny ? 'LÉGENDAIRE' : ''}</div><div class="wflash"></div>`;
      root.append(w);
      buzz([30, 60, 30]);
      await sleep(2300);
      w.remove();
    }
    function sparks(n, burst) {
      const box = document.createElement('div');
      box.className = 'sparks';
      for (let k = 0; k < n; k++) {
        const s = document.createElement('span');
        s.style.cssText = `--x:${rand(-48, 48).toFixed(1)}vw;--y:${rand(-55, 45).toFixed(1)}vh;--d:${rand(0, burst ? .5 : 2).toFixed(2)}s;--s:${rand(3, 9).toFixed(1)}px`;
        box.append(s);
      }
      root.append(box); setTimeout(() => box.remove(), 3200);
    }

    // 3) navigation
    async function next() {
      if (locked) return;
      if (i + 1 >= N) return summary();
      locked = true;
      const w = wrapEl();
      w.classList.remove('pop', 'slide'); w.classList.add('out');
      setDx(-Math.round(innerWidth * 1.2));
      await sleep(reduceNow() ? 0 : 260);
      await show(i + 1);
    }
    async function prev() {
      if (locked || i <= 0) return;
      locked = true;
      const w = wrapEl();
      w.classList.remove('pop', 'slide'); w.classList.add('out');
      setDx(Math.round(innerWidth * 1.2));
      await sleep(reduceNow() ? 0 : 260);
      await show(i - 1);
    }
    function onKey(e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'Escape') summary();
    }
    document.addEventListener('keydown', onKey);

    // glisser : le doigt déplace la carte (inclinaison 3D), un geste vers la gauche passe à la suivante
    root.addEventListener('pointerdown', e => {
      if (locked || !e.target.closest('.stage')) return;
      drag = { x: e.clientX };
      wrapEl()?.classList.add('drag');
    });
    function onMove(e) {
      if (!drag) return;
      dx = e.clientX - drag.x;
      setDx(dx < 0 ? dx : dx * .2);
    }
    function release() {
      if (!drag) return;
      drag = null; wrapEl()?.classList.remove('drag');
      if (dx < -70) next(); else setDx(0);
      dx = 0;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    // 4) résumé du tirage
    function summary() {
      if (!root.isConnected) return;
      locked = true;
      root.className = '';
      const again = typeof o.again === 'function' ? o.again() : null;      // « ouvrir un autre paquet » à côté de « Continuer »
      root.innerHTML = `<div class="bg"></div><div class="sum"><h2>Ton tirage${cards.god ? ' <span class="godtag">GODPACK</span>' : ''}</h2>
        <div class="grid">${[...seq].reverse().map(c => o.cardHtml(c, { star: true })).join('')}</div>
        <div class="sticky-bar ${again ? 'split' : ''}"><button class="finish ${again ? 'plain' : ''}">Continuer</button>${again ? `<button class="again" ${again.ok ? '' : 'disabled'}>${esc(again.label)}</button>` : ''}</div></div>`;
      root.querySelector('.finish').onclick = () => close();
      if (again) root.querySelector('.again').onclick = () => close('again');
    }

    await show(0);
    return done;
  };
})();
