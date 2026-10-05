/* Paquet de cartes : dessin SVG + scène d'ouverture.
 * Inspirations : Pokémon TCG Pocket (on déchire le haut du paquet au doigt, la lumière sort de la déchirure),
 * FUT (la lueur prend la couleur de la meilleure carte), cartes holographiques (reflets qui suivent l'inclinaison).
 * Tout est dessiné en SVG/CSS/canvas, sans filtre CSS (ils créent des rectangles parasites sur iOS). */
(() => {
  'use strict';
  const PW = 172, PH = 244, TY = 46;                      // taille du dessin, ligne de déchirure
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const GEMS = ['#a4b5a0', '#79a9d9', '#a78bdc', '#e07fae', '#f08a4b', '#e7bd5e']; // une pierre par rareté

  function tearPts() {                                     // dents de scie, de gauche à droite
    const teeth = 16, pts = [];
    for (let k = 0; k <= teeth; k++) pts.push([+(k * PW / teeth).toFixed(1), +(TY + (k % 2 ? 4 : -4) + (k % 3 ? 0 : 2)).toFixed(1)]);
    return pts;
  }

  /** kind : 'full' | 'top' | 'body'. opts.anim : reflet animé en continu (SMIL). */
  function packSvg(kind, opts = {}) {
    const anim = opts.anim !== false, id = 'pk' + Math.random().toString(36).slice(2, 7);
    const pts = tearPts(), str = p => p.join(',');
    const top = `0,0 ${PW},0 ${[...pts].reverse().map(str).join(' ')}`;
    const body = `${pts.map(str).join(' ')} ${PW},${PH} 0,${PH}`;
    const tear = kind === 'full' ? '' : `<clipPath id="${id}t"><polygon points="${kind === 'top' ? top : body}"/></clipPath>`;
    const holoMove = anim ? `<animateTransform attributeName="gradientTransform" type="translate" from="-190 0" to="190 0" dur="5.5s" repeatCount="indefinite"/>` : '';
    const sheen = anim ? `<rect y="0" x="-90" width="60" height="${PH}" fill="url(#${id}s)" transform="skewX(-16)"><animate attributeName="x" from="-90" to="260" dur="4.6s" repeatCount="indefinite"/></rect>` : '';
    const ticks = Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2, r1 = 41, r2 = i % 2 ? 44 : 46; return `<line x1="${(86 + Math.cos(a) * r1).toFixed(1)}" y1="${(124 + Math.sin(a) * r1).toFixed(1)}" x2="${(86 + Math.cos(a) * r2).toFixed(1)}" y2="${(124 + Math.sin(a) * r2).toFixed(1)}"/>`; }).join('');
    const gems = GEMS.map((c, i) => `<path d="M${54 + i * 13},181 l4,-5 l4,5 l-4,5z" fill="${c}"/>`).join('');
    return `<svg class="pk-svg" viewBox="0 0 ${PW} ${PH}" aria-hidden="true"><defs>
      <linearGradient id="${id}f" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#3a3a46"/><stop offset=".3" stop-color="#1f1f28"/><stop offset=".7" stop-color="#14141b"/><stop offset="1" stop-color="#0c0c11"/></linearGradient>
      <linearGradient id="${id}h" gradientUnits="userSpaceOnUse" x1="-190" y1="30" x2="-20" y2="214" data-holo="1">
        <stop offset="0" stop-color="#7df2ff" stop-opacity="0"/><stop offset=".22" stop-color="#7df2ff" stop-opacity=".5"/><stop offset=".4" stop-color="#c58bff" stop-opacity=".55"/>
        <stop offset=".58" stop-color="#ffd37a" stop-opacity=".5"/><stop offset=".76" stop-color="#7dffb5" stop-opacity=".42"/><stop offset="1" stop-color="#7df2ff" stop-opacity="0"/>${holoMove}</linearGradient>
      <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#a9a9b6"/><stop offset=".6" stop-color="#f4f4f8"/><stop offset="1" stop-color="#8c8c99"/></linearGradient>
      <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}s" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
      <pattern id="${id}b" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><rect width="1" height="5" fill="#fff" fill-opacity=".045"/></pattern>
      <pattern id="${id}k" width="4" height="12" patternUnits="userSpaceOnUse"><rect width="2" height="12" fill="#000" fill-opacity=".38"/><rect x="2" width="1" height="12" fill="#fff" fill-opacity=".16"/></pattern>
      <clipPath id="${id}r"><rect width="${PW}" height="${PH}" rx="15"/></clipPath>${tear}</defs>
      <g ${tear ? `clip-path="url(#${id}t)"` : ''}><g clip-path="url(#${id}r)">
        <rect width="${PW}" height="${PH}" fill="url(#${id}f)"/><rect width="${PW}" height="${PH}" fill="url(#${id}b)"/>
        <rect width="${PW}" height="${PH}" fill="url(#${id}h)"/>
        <rect width="${PW}" height="14" fill="#8a8a96" fill-opacity=".35"/><rect width="${PW}" height="14" fill="url(#${id}k)"/><rect width="${PW}" height="14" fill="url(#${id}c)"/>
        <rect y="${PH - 14}" width="${PW}" height="14" fill="#8a8a96" fill-opacity=".3"/><rect y="${PH - 14}" width="${PW}" height="14" fill="url(#${id}k)"/><rect y="${PH - 14}" width="${PW}" height="14" fill="url(#${id}c)" transform="rotate(180 ${PW / 2} ${PH - 7})"/>
        <text x="${PW / 2}" y="34" text-anchor="middle" font-family="Sora,Inter,sans-serif" font-weight="700" font-size="10.5" letter-spacing="5.5" fill="#f0f0f5" fill-opacity=".92">CLODO WIKI</text>
        <circle cx="86" cy="124" r="37" fill="#000" fill-opacity=".34" stroke="url(#${id}m)" stroke-width="1.6"/>
        <g stroke="#e7e7ee" stroke-opacity=".5" stroke-width=".7">${ticks}</g>
        <text x="86" y="147" text-anchor="middle" font-family="Sora,Inter,sans-serif" font-weight="800" font-size="62" fill="#000" fill-opacity=".5" transform="translate(1.2 1.6)">W</text>
        <text x="86" y="147" text-anchor="middle" font-family="Sora,Inter,sans-serif" font-weight="800" font-size="62" fill="url(#${id}m)">W</text>
        ${gems}
        <text x="${PW / 2}" y="206" text-anchor="middle" font-family="Sora,Inter,sans-serif" font-weight="600" font-size="8" letter-spacing="3" fill="#d6d6de" fill-opacity=".8">BOOSTER · 10 CARTES</text>
        <rect width="${PW}" height="${PH}" fill="url(#${id}g)"/>${sheen}
        <rect x=".6" y=".6" width="${PW - 1.2}" height="${PH - 1.2}" rx="14.5" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.2"/>
        <rect x="2.2" y="2.2" width="${PW - 4.4}" height="${PH - 4.4}" rx="13" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>
      </g></g></svg>`;
  }
  window.packSvg = packSvg;

  // ---------- sons (WebAudio synthétisé : aucun fichier) ----------
  const snd = (() => {
    let ac = null;
    const on = () => { try { return localStorage.getItem('wm_sound') !== '0'; } catch { return true; } };
    const ctx = () => { if (!on()) return null; try { ac ??= new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch { return null; } };
    const noise = (a, dur) => { const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; return s; };
    return {
      unlock: ctx,
      rip(v = 1) { const a = ctx(); if (!a) return; const n = noise(a, .09), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.frequency.value = 2400 + Math.random() * 1600; f.Q.value = .9; g.gain.setValueAtTime(.16 * v, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .09); n.connect(f).connect(g).connect(a.destination); n.start(); },
      boom(power = 1) { const a = ctx(); if (!a) return; const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(120, a.currentTime); o.frequency.exponentialRampToValueAtTime(38, a.currentTime + .55); g.gain.setValueAtTime(.5 * power, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .6); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + .65);
        const n = noise(a, .5), f = a.createBiquadFilter(), g2 = a.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, a.currentTime); f.frequency.exponentialRampToValueAtTime(300, a.currentTime + .5); g2.gain.setValueAtTime(.22 * power, a.currentTime); g2.gain.exponentialRampToValueAtTime(.001, a.currentTime + .5); n.connect(f).connect(g2).connect(a.destination); n.start(); },
      shimmer(level = 0) { const a = ctx(); if (!a) return; const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98].slice(0, 2 + level); notes.forEach((hz, i) => { const t = a.currentTime + i * .075, o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = hz; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.13, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .7); o.connect(g).connect(a.destination); o.start(t); o.stop(t + .75); }); },
    };
  })();
  window.wmSound = snd;

  // ---------- particules (canvas, mode additif) ----------
  function makeFx(canvas) {
    const g = canvas.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), P = [];
    let W = 0, H = 0, raf = 0, last = performance.now();
    const fit = () => { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit(); window.addEventListener('resize', fit);
    const hex = c => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(c.trim()); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255]; };
    function emit(x, y, n, color, { speed = 6, spread = Math.PI * 2, angle = -Math.PI / 2, size = 2, life = 900, gravity = .1, trail = true } = {}) {
      const rgb = hex(color);
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - .5) * spread, s = speed * (.35 + Math.random() * .85);
        P.push({ x, y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: life * (.55 + Math.random() * .6), size: size * (.6 + Math.random() * 1.1), rgb: Math.random() < .3 ? [255, 255, 255] : rgb, gravity, trail });
      }
    }
    let ambient = true;
    function frame(now) {
      const dt = Math.min(48, now - last) / 16.67; last = now;
      g.clearRect(0, 0, W, H);
      if (ambient && Math.random() < .35 * dt) P.push({ x: Math.random() * W, y: H + 6, px: 0, py: 0, vx: (Math.random() - .5) * .25, vy: -(.25 + Math.random() * .5), life: 0, max: 5200 + Math.random() * 3000, size: .7 + Math.random() * 1.5, rgb: [255, 255, 255], gravity: 0, trail: false, dust: true });
      g.globalCompositeOperation = 'lighter';
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life += dt * 16.67; if (p.life >= p.max) { P.splice(i, 1); continue; }
        p.px = p.x; p.py = p.y;
        p.vy += p.gravity * dt; if (!p.dust) { p.vx *= Math.pow(.985, dt); p.vy *= Math.pow(.985, dt); }
        p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.life / p.max, al = p.dust ? Math.min(.35, k * .5, p.life / 600) : k * k;
        g.strokeStyle = g.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${al})`;
        if (p.trail) { g.lineWidth = p.size; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.px - p.vx * 1.4, p.py - p.vy * 1.4); g.lineTo(p.x, p.y); g.stroke(); }
        else { g.beginPath(); g.arc(p.x, p.y, p.size * (p.dust ? 1 : k + .3), 0, 6.283); g.fill(); }
      }
      g.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return { emit, stop() { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); }, ambient(v) { ambient = v; } };
  }

  const cssVar = (n, fb = '#ffffff') => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
  const INTENSITY = { common: .5, uncommon: .62, rare: .78, super: .9, ultra: 1, legendary: 1 };

  /**
   * Scène d'ouverture. Le joueur déchire le haut du paquet en faisant glisser le doigt (ou touche pour déchirer).
   * Pendant ce temps les cartes se chargent. Renvoie les cartes une fois la mise en scène terminée.
   */
  async function packStage(root, { dataP, rank, buzz, preload }) {
    root.innerHTML = `<div class="bg"></div><canvas class="ps-fx"></canvas><div class="ps-spot"></div>
      <div class="ps-scene"><div class="ps-halo"></div><div class="ps-glow"></div>
        <div class="ps-wrap"><div class="ps-tilt">
          <div class="ps-cards">${[0, 1, 2, 3, 4].map(k => `<div class="ps-card" style="--k:${k}"><b>W</b></div>`).join('')}</div>
          <div class="ps-inner"></div>
          <div class="ps-pack"><div class="ps-piece ps-body">${packSvg('body', { anim: false })}</div><div class="ps-piece ps-top">${packSvg('top', { anim: false })}</div></div>
          <svg class="ps-rip" viewBox="0 0 ${PW} ${PH}" aria-hidden="true"><path class="r1" pathLength="1" d="${tearPts().map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')}"/><path class="r2" pathLength="1" d="${tearPts().map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')}"/></svg>
          <div class="ps-guide"><i></i></div>
        </div><div class="ps-shadow"></div></div>
      </div><div class="ps-ring"></div><div class="ps-flash"></div>
      <p class="ps-hint">Fais glisser le doigt pour déchirer</p>`;
    root.style.touchAction = 'none';
    const $ = s => root.querySelector(s);
    const scene = $('.ps-scene'), wrap = $('.ps-wrap'), tiltEl = $('.ps-tilt'), topP = $('.ps-top'), inner = $('.ps-inner'), cardsEl = $('.ps-cards');
    const r1 = $('.r1'), r2 = $('.r2'), hint = $('.ps-hint'), holo = root.querySelectorAll('[data-holo]');
    const fx = makeFx($('.ps-fx'));
    let err = null; dataP.catch(e => { err = e; });

    // état de l'animation
    let p = 0, target = 0, dragging = false, torn = false, sx = 0, t0 = performance.now(), lastTick = 0, lastStep = 0, px = 0, py = 0, tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, down = 0;
    const innerBox = () => { const b = inner.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.width]; };

    const loop = now => {
      const t = (now - t0) / 1000;
      p += (target - p) * (dragging ? .45 : .14); if (Math.abs(target - p) < .001) p = target;
      // inclinaison : suit le doigt, sinon léger balancement
      const idleX = Math.sin(t * .9) * 5, idleY = Math.cos(t * .7) * 3.5;
      cx += ((dragging ? tx : idleX) - cx) * .12; cy += ((dragging ? ty : idleY) - cy) * .12;
      const bob = torn ? 0 : Math.sin(t * 1.6) * 5;
      tiltEl.style.transform = `translateY(${bob}px) rotateX(${(-cy).toFixed(2)}deg) rotateY(${cx.toFixed(2)}deg)`;
      const hx = (cx * 11 + (now / 40 % 380) - 190).toFixed(1);
      holo.forEach(h => h.setAttribute('gradientTransform', `translate(${hx} 0)`));
      // le haut se soulève au fur et à mesure de la déchirure
      topP.style.transform = torn ? '' : `rotate(${(-p * 11).toFixed(2)}deg) translate(${(p * 5).toFixed(1)}px,${(-p * 7).toFixed(1)}px)`;
      r1.style.strokeDashoffset = r2.style.strokeDashoffset = (1 - p).toFixed(3);
      r1.style.opacity = r2.style.opacity = p > .005 ? 1 : 0;
      inner.style.setProperty('--p', p.toFixed(3));
      cardsEl.style.transform = torn ? '' : `translateY(${(-p * 6).toFixed(2)}%)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const stopLoop = () => { cancelAnimationFrame(raf); fx.stop(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };

    let resolveTorn; const tornP = new Promise(r => { resolveTorn = r; });
    const complete = () => {
      if (torn) return; torn = true; dragging = false; target = 1; root.style.touchAction = '';
      scene.classList.add('is-tearing'); hint.style.opacity = 0; snd.rip(1.4); buzz([12, 20, 30]);
      setTimeout(resolveTorn, 340);
    };
    function onMove(e) {
      if (!dragging || torn) return;
      const w = wrap.getBoundingClientRect().width;
      target = clamp((e.clientX - sx) / (w * .8), 0, 1);
      const r = wrap.getBoundingClientRect();
      tx = clamp((e.clientX - (r.left + r.width / 2)) / r.width, -1, 1) * 14; ty = clamp((e.clientY - (r.top + r.height / 2)) / r.height, -1, 1) * 10;
      const now = performance.now();
      if (now - lastTick > 45 && target > p - .001 && target > .02) { snd.rip(.8); lastTick = now; }
      const step = Math.floor(target * 10); if (step !== lastStep) { buzz(6); lastStep = step; }
      if (target >= .97) complete();
    }
    function onUp() {
      if (!dragging) return; dragging = false;
      const quick = performance.now() - down < 280 && Math.abs(target) < .08;
      if (quick || target > .55) complete(); else target = 0;
    }
    root.addEventListener('pointerdown', e => {
      if (torn || e.target.closest('button')) return;
      snd.unlock(); dragging = true; sx = e.clientX; down = performance.now(); scene.classList.add('is-touched'); hint.style.opacity = 0;
      onMove(e);
    });
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    const auto = setTimeout(() => { if (!torn && !dragging) complete(); }, 7000);   // personne ne touche : on déchire pour lui

    // entrée du paquet
    requestAnimationFrame(() => scene.classList.add('is-in'));

    const abort = new Promise((_, rej) => dataP.then(() => {}, rej));
    try { await Promise.race([tornP, abort]); } catch (e) { clearTimeout(auto); stopLoop(); throw e; }
    clearTimeout(auto);

    // --- explosion de lumière ---
    const [bx, by] = innerBox();
    const waitingTimer = setTimeout(() => { hint.textContent = 'Chargement des cartes…'; hint.style.opacity = ''; hint.classList.add('wait'); scene.classList.add('is-wait'); }, 450);
    scene.classList.add('is-open');
    snd.boom(.9); buzz(40);
    fx.emit(bx, by, 46, '#ffffff', { speed: 9, spread: Math.PI * 1.1, angle: -Math.PI / 2, size: 2.2, gravity: .16 });
    $('.ps-flash').classList.add('go'); $('.ps-ring').style.cssText = `left:${bx}px;top:${by}px`; $('.ps-ring').classList.add('go');
    wrap.classList.add('shake');
    await sleep(520);

    const cards = await dataP.catch(e => { clearTimeout(waitingTimer); stopLoop(); throw e; });
    clearTimeout(waitingTimer); scene.classList.remove('is-wait'); hint.classList.remove('wait');
    await preload(cards.map(c => c.image));

    // couleur = meilleure carte du tirage
    const best = cards.reduce((a, b) => ((rank[b.rarity] ?? 0) - (rank[a.rarity] ?? 0) || (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0)) > 0 ? b : a);
    const col = best.shiny ? cssVar('--shiny') : cssVar('--' + best.rarity), lvl = rank[best.rarity] ?? 0;
    scene.style.setProperty('--pc', col); scene.style.setProperty('--pi', INTENSITY[best.rarity] ?? .7);
    scene.classList.add('is-tint');
    hint.textContent = '';
    snd.shimmer(lvl);
    fx.emit(bx, by, 24 + lvl * 22, col, { speed: 7 + lvl, spread: Math.PI * 1.3, angle: -Math.PI / 2, size: 2.4, gravity: .1, life: 1300 });
    buzz(lvl >= 4 ? [30, 40, 60, 40, 90] : 25);
    // les meilleures cartes se font désirer
    if (lvl >= 4) {
      scene.classList.add('is-charge');
      for (let i = 0; i < 6; i++) { fx.emit(bx, by, 14, col, { speed: 10, spread: .9, angle: -Math.PI / 2, size: 2.2, gravity: .07, life: 1100 }); await sleep(170); }
    } else await sleep(900 + lvl * 90);

    // les cartes foncent vers l'écran
    scene.classList.add('is-fly'); buzz(30);
    fx.emit(bx, by - 20, 40, '#ffffff', { speed: 12, spread: Math.PI * 2, size: 1.8, gravity: 0, life: 600 });
    await sleep(520);
    stopLoop();
    return cards;
  }
  window.packStage = packStage;
})();
