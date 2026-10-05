'use strict';
// Ouverture de booster : les cartes apparaissent une par une, de la moins rare à la plus rare. On fait glisser la carte vers la
// gauche (ou bouton « Encore N cartes », flèches, clavier). Les légendaires ont une mise en scène façon « walkout » de FUT.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      if (reduce) { cards = await dataP; }
      else cards = await window.packStage(root, { dataP, rank: o.rank, buzz, preload });
    } catch (e) {                                                    // erreur serveur : on referme proprement
      root.remove(); document.body.classList.remove('noscroll');
      throw e;
    }
    const seq = [...cards].sort((a, b) => o.rank[a.rarity] - o.rank[b.rarity] || (a.shiny | 0) - (b.shiny | 0)); // moins rare d'abord
    const N = seq.length;
    buzz(30);

    let i = -1, locked = true, drag = null, dx = 0, finished;
    const done = new Promise(r => { finished = r; });
    const wrapEl = () => root.querySelector('.wrap');
    const setDx = (px) => { const w = wrapEl(); if (!w) return; w.style.setProperty('--dx', px + 'px'); w.style.setProperty('--ry', (px * -.06) + 'deg'); w.style.setProperty('--rot', (px * .02) + 'deg'); };
    const close = () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release);
      root.remove(); document.body.classList.remove('noscroll'); finished();
    };

    // 2) une carte à la fois
    async function show(n) {
      i = n; locked = true; dx = 0;
      const c = seq[n], legend = c.rarity === 'legendary', ultra = c.rarity === 'ultra', last = n === N - 1;
      root.className = `r-${c.rarity} ${c.shiny ? 'shiny' : ''}`;
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
      if (legend && !reduce) await walkout(c);
      wrap.style.visibility = '';
      wrap.classList.add(legend || n === 0 ? 'pop' : 'slide');
      if (ultra || legend) { const ring = document.createElement('div'); ring.className = 'ring'; root.append(ring); setTimeout(() => ring.remove(), 1200); }
      if (legend) sparks(34, true);
      buzz(legend ? [60, 40, 140] : ultra ? [40, 30, 60] : 12);
      await sleep(reduce ? 0 : legend ? 520 : 360);
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
      await sleep(reduce ? 0 : 260);
      await show(i + 1);
    }
    async function prev() {
      if (locked || i <= 0) return;
      locked = true;
      const w = wrapEl();
      w.classList.remove('pop', 'slide'); w.classList.add('out');
      setDx(Math.round(innerWidth * 1.2));
      await sleep(reduce ? 0 : 260);
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
      root.innerHTML = `<div class="bg"></div><div class="sum"><h2>Ton tirage</h2>
        <div class="grid">${[...seq].reverse().map(c => o.cardHtml(c)).join('')}</div>
        <div class="sticky-bar"><button class="finish">Continuer</button></div></div>`;
      root.querySelector('.finish').onclick = close;
    }

    await show(0);
    return done;
  };
})();
