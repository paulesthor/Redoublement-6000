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
