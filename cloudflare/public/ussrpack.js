/* Ouverture de paquet « ambiance URSS » (aperçu réservé à l'administrateur) : colis du Parti → dossier secret → matriochka.
 * Le paquet commence toujours en colis ficelé. Selon la meilleure carte tirée, il cache un dossier (ultra rare) puis une matriochka (légendaire).
 * Tout est dessiné en SVG/CSS/canvas. Même contrat que window.packStage : renvoie les cartes une fois la mise en scène terminée. */
(() => {
  'use strict';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const GRADES = { common: 'Soldat', uncommon: 'Caporal', rare: 'Sergent', super: 'Capitaine', ultra: 'Général', legendary: 'Maréchal' };
  window.USSR_GRADES = GRADES;

  // ---------- particules : neige et confettis rouges / dorés ----------
  function makeParticles(canvas) {
    const g = canvas.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), P = []; let W = 0, H = 0, raf = 0, last = performance.now(), snow = true;
    const fit = () => { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }; fit(); window.addEventListener('resize', fit);
    const emit = (x, y, n, colors, o = {}) => { for (let i = 0; i < n; i++) { const a = (o.angle ?? -Math.PI / 2) + (Math.random() - .5) * (o.spread ?? Math.PI * 2), s = (o.speed ?? 8) * (.4 + Math.random() * .9); P.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: (o.life ?? 1600) * (.6 + Math.random() * .6), w: rand(4, 9), h: rand(6, 13), r: Math.random() * 6, vr: rand(-.3, .3), c: colors[(Math.random() * colors.length) | 0], g: o.gravity ?? .22, conf: true }); } };
    function frame(now) {
      const dt = Math.min(48, now - last) / 16.67; last = now; g.clearRect(0, 0, W, H);
      if (snow && Math.random() < .55 * dt) P.push({ x: Math.random() * W, y: -6, vx: rand(-.3, .5), vy: rand(.6, 1.6), life: 0, max: 9000, w: rand(1.2, 3.2), c: '#ffffff', g: 0, snow: true });
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]; p.life += dt * 16.67; if (p.life >= p.max || p.y > H + 30) { P.splice(i, 1); continue; }
        p.vy += p.g * dt; if (p.conf) { p.vx *= Math.pow(.985, dt); p.vy *= Math.pow(.985, dt); p.r += p.vr * dt; } p.x += p.vx * dt; p.y += p.vy * dt; if (p.snow) p.x += Math.sin(p.life / 600 + p.w) * .3;
        const k = 1 - p.life / p.max; g.globalAlpha = p.snow ? .85 : Math.min(1, k * 2.2); g.fillStyle = p.c;
        if (p.conf) { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r))); g.restore(); } else { g.beginPath(); g.arc(p.x, p.y, p.w, 0, 6.283); g.fill(); }
      }
      g.globalAlpha = 1; raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return { emit, stop() { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); }, snow(v) { snow = v; }, size: () => [W, H] };
  }

  // ---------- dessins ----------
  const star = (cx, cy, r, fill) => `<path d="${Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .42 : r; return (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); }).join('')}Z" fill="${fill}"/>`;
  const num = () => String(Math.floor(rand(100000, 999999)));
  function parcelSvg() {
    const n = num();
    return `<svg class="us-svg" viewBox="0 0 240 220" aria-hidden="true"><defs>
      <linearGradient id="kraft" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9a173"/><stop offset=".55" stop-color="#b08457"/><stop offset="1" stop-color="#8d6640"/></linearGradient>
      <linearGradient id="lidg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6b080"/><stop offset="1" stop-color="#a97c4e"/></linearGradient></defs>
      <ellipse cx="120" cy="206" rx="104" ry="10" fill="#000" opacity=".35"/>
      <g class="us-box"><rect x="22" y="70" width="196" height="130" rx="4" fill="url(#kraft)"/><rect x="22" y="70" width="196" height="130" rx="4" fill="none" stroke="#6a4a2c" stroke-width="2"/>
        <rect x="108" y="70" width="24" height="130" fill="#d9bf8e" opacity=".6"/><rect x="22" y="178" width="196" height="6" fill="#000" opacity=".1"/>
        <g class="us-label"><rect x="34" y="116" width="82" height="52" fill="#efe6cc" stroke="#6a4a2c"/><text x="40" y="130" font-size="9" font-weight="700" fill="#7d1118" font-family="Arial,sans-serif">ПОСЫЛКА № ${n}</text>
          <text x="40" y="142" font-size="7.5" fill="#2a1d12" font-family="Arial,sans-serif">Colis du Parti — urgent</text><text x="40" y="153" font-size="7" fill="#2a1d12" font-family="Arial,sans-serif">Contenu : 10 camarades</text><text x="40" y="163" font-size="6" fill="#6a4a2c" font-family="Arial,sans-serif">Ne pas ouvrir sans autorisation</text></g>
        <g transform="rotate(-12 178 150)"><circle cx="178" cy="150" r="22" fill="none" stroke="#b3262d" stroke-width="3"/>${star(178, 150, 10, '#b3262d')}<text x="178" y="174" text-anchor="middle" font-size="9" font-weight="900" fill="#b3262d" font-family="Arial,sans-serif">ЦК</text></g>
        <g transform="rotate(6 70 92)"><rect x="40" y="82" width="62" height="18" fill="none" stroke="#b3262d" stroke-width="2.4"/><text x="71" y="95.5" text-anchor="middle" font-size="11" font-weight="900" fill="#b3262d" font-family="Arial,sans-serif">ВАЖНО</text></g></g>
      <g class="us-lid"><polygon points="22,70 218,70 206,42 34,42" fill="url(#lidg)" stroke="#6a4a2c" stroke-width="2"/><rect x="108" y="42" width="24" height="28" fill="#d9bf8e" opacity=".6"/></g>
      <g class="us-string"><path class="s1" d="M70 42 L70 200" stroke="#efe3c2" stroke-width="3.2" stroke-linecap="round"/><path class="s2" d="M170 42 L170 200" stroke="#efe3c2" stroke-width="3.2" stroke-linecap="round"/><path class="s3" d="M22 120 L218 120" stroke="#efe3c2" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M120 44 C100 22 86 36 120 46 C154 36 140 22 120 44Z" fill="#efe3c2" stroke="#b9a678" stroke-width="1"/></g></svg>`;
  }
  function folderSvg() {
    return `<svg class="us-svg" viewBox="0 0 240 220" aria-hidden="true"><defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f969e"/><stop offset="1" stop-color="#5c636b"/></linearGradient></defs>
      <ellipse cx="120" cy="206" rx="96" ry="9" fill="#000" opacity=".35"/>
      <g class="us-contents"><rect x="30" y="52" width="180" height="146" fill="#efe6cc"/><rect x="40" y="62" width="160" height="10" fill="#b3262d" opacity=".8"/><rect x="40" y="80" width="130" height="4" fill="#2a1d12" opacity=".5"/><rect x="40" y="90" width="150" height="4" fill="#2a1d12" opacity=".4"/></g>
      <g class="us-cover"><path d="M30 60 h62 l14 -14 h104 v152 h-180z" fill="url(#fg)" stroke="#3c4249" stroke-width="2.4"/>
        <g transform="rotate(-8 120 120)"><rect x="52" y="98" width="136" height="40" fill="none" stroke="#b3262d" stroke-width="3.5"/><text x="120" y="126" text-anchor="middle" font-size="25" font-weight="900" fill="#b3262d" font-family="Arial,sans-serif" letter-spacing="2">СЕКРЕТНО</text></g>
        <text x="46" y="182" font-size="9" fill="#e6e9ec" font-family="Arial,sans-serif">Дело № ${num()} — Archives du camp</text>
        <g class="us-strap"><rect x="40" y="150" width="160" height="12" fill="#2f3338"/><rect x="108" y="146" width="26" height="20" rx="3" fill="#c9a43a" stroke="#6a5214"/></g>${star(210, 62, 7, '#b3262d')}</g></svg>`;
  }
  const doll = (k, hue) => `<svg class="us-doll" data-k="${k}" viewBox="0 0 100 150" aria-hidden="true">
    <g class="d-bot"><path d="M14 78 C8 120 20 146 50 146 C80 146 92 120 86 78 Z" fill="${hue[0]}" stroke="#4a0b10" stroke-width="2"/><ellipse cx="50" cy="112" rx="22" ry="20" fill="#f4d56b" opacity=".9"/><circle cx="50" cy="110" r="5" fill="#b3262d"/><circle cx="40" cy="116" r="3" fill="#2f7a2a"/><circle cx="60" cy="116" r="3" fill="#2f7a2a"/><circle cx="50" cy="120" r="3" fill="#2f7a2a"/></g>
    <g class="d-top"><path d="M14 78 C10 36 28 10 50 10 C72 10 90 36 86 78 Z" fill="${hue[1]}" stroke="#4a0b10" stroke-width="2"/><circle cx="50" cy="50" r="19" fill="#f3d2b0" stroke="#4a0b10" stroke-width="1.5"/><path d="M28 50 C28 20 72 20 72 50 C66 34 34 34 28 50Z" fill="${hue[1]}"/><circle cx="43" cy="52" r="2.2" fill="#2a1d12"/><circle cx="57" cy="52" r="2.2" fill="#2a1d12"/><circle cx="37" cy="60" r="4" fill="#e58a8a" opacity=".7"/><circle cx="63" cy="60" r="4" fill="#e58a8a" opacity=".7"/><path d="M45 62 Q50 66 55 62" fill="none" stroke="#7d1118" stroke-width="1.6"/><path d="M20 78 C30 70 70 70 80 78" fill="none" stroke="#f4d56b" stroke-width="3"/></g></svg>`;

  /** Mise en scène. shape : 'auto' | 'colis' | 'dossier' | 'matriochka' (forcer une forme pour tester). */
  async function ussrPackStage(root, { dataP, rank, buzz, preload, shape = 'auto' }) {
    root.classList.add('ussr');
    root.innerHTML = `<div class="us-bg"></div><div class="us-bands"></div><canvas class="us-fx"></canvas>
      <div class="us-stage"><div class="us-obj"></div></div>
      <div class="us-banner"><b>ДИСТРИБУЦИЯ</b><span>Distribution du Parti</span></div>
      <p class="us-hint">Coupe la ficelle : glisse le doigt en travers du colis</p><div class="us-flash"></div><div class="us-stamp"></div>`;
    root.style.touchAction = 'none';
    const $ = s => root.querySelector(s), obj = $('.us-obj'), hint = $('.us-hint'), stage = $('.us-stage'), stampEl = $('.us-stamp');
    const fx = makeParticles($('.us-fx'));
    const snd = window.wmSound || { unlock() {}, rip() {}, boom() {}, shimmer() {} };
    let err = null; dataP.catch(e => { err = e; });
    const cleanup = () => { fx.stop(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };
    const center = () => { const r = obj.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * .45]; };
    const slam = async (text, kind = '') => { stampEl.textContent = text; stampEl.className = 'us-stamp ' + kind; void stampEl.offsetWidth; stampEl.classList.add('go'); snd.boom(.5); buzz?.([20, 30, 50]); await sleep(520); };
    const COLORS = ['#c0161d', '#e8c35a', '#f6efd8', '#b3262d'];

    // ----- 1) le colis : on coupe la ficelle -----
    obj.innerHTML = parcelSvg();
    let dragging = false, trail = [], cut = false, resolveCut; const cutP = new Promise(r => { resolveCut = r; });
    const localX = e => { const r = obj.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
    function doCut() { if (cut) return; cut = true; root.style.touchAction = ''; resolveCut(); }
    function onMove(e) { if (!dragging || cut) return; trail.push(localX(e)); const span = Math.max(...trail) - Math.min(...trail); if (span > .62) doCut(); }
    function onUp() { if (!dragging) return; dragging = false; if (!cut && performance.now() - down < 260 && trail.length < 4) doCut(); else if (!cut) trail = []; }
    let down = 0;
    root.addEventListener('pointerdown', e => { if (cut || e.target.closest('button')) return; snd.unlock(); dragging = true; trail = [localX(e)]; down = performance.now(); hint.style.opacity = 0; });
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    const auto = setTimeout(() => { if (!cut && !dragging) doCut(); }, 7500);
    requestAnimationFrame(() => obj.classList.add('in'));
    const abort = new Promise((_, rej) => dataP.then(() => {}, rej));
    try { await Promise.race([cutP, abort]); } catch (e) { clearTimeout(auto); cleanup(); throw e; }
    clearTimeout(auto);
    // la ficelle claque, le couvercle se rabat
    obj.classList.add('snap'); snd.rip(1.4); buzz?.([12, 20, 30]); const [bx, by] = center(); fx.emit(bx, by - 40, 18, ['#efe3c2', '#ffffff'], { speed: 6, spread: Math.PI * 1.3, life: 900 });
    await sleep(380); obj.classList.add('open'); await slam('ОТКРЫТО', 'open'); snd.boom(.8);
    fx.emit(bx, by - 50, 40, COLORS, { speed: 9, spread: Math.PI * 1.2, life: 1500 });
    const waiting = setTimeout(() => { hint.textContent = 'Chargement des cartes…'; hint.style.opacity = ''; }, 500);
    const cards = await dataP.catch(e => { clearTimeout(waiting); cleanup(); throw e; });
    clearTimeout(waiting); hint.style.opacity = 0; await preload(cards.map(c => c.image));
    const best = cards.reduce((a, b) => ((rank[b.rarity] ?? 0) - (rank[a.rarity] ?? 0) || (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0)) > 0 ? b : a), lvl = rank[best.rarity] ?? 0;
    const mode = shape === 'colis' ? 0 : shape === 'dossier' ? 1 : shape === 'matriochka' ? 2 : lvl >= 5 ? 2 : lvl >= 4 ? 1 : 0;
    const tap = (label) => new Promise(res => { hint.textContent = label; hint.style.opacity = ''; const h = () => { root.removeEventListener('pointerup', h); hint.style.opacity = 0; res(); }; setTimeout(() => root.addEventListener('pointerup', h), 150); setTimeout(() => { root.removeEventListener('pointerup', h); res(); }, 9000); });

    // ----- 2) le dossier secret (ultra rare) -----
    if (mode >= 1) {
      obj.classList.add('leave'); await sleep(420); obj.className = 'us-obj folder'; obj.innerHTML = folderSvg(); requestAnimationFrame(() => obj.classList.add('in')); await sleep(520);
      await slam('СЕКРЕТНО', 'secret'); fx.emit(...center(), 22, ['#b3262d', '#f6efd8'], { speed: 6, life: 900 });
      await tap('Touche le dossier pour défaire la sangle');
      obj.classList.add('snap'); snd.rip(1.1); buzz?.([20, 30, 40]); await sleep(420); obj.classList.add('open'); await slam('ОДОБРЕНО', 'ok'); snd.shimmer(lvl);
    }
    // ----- 3) la matriochka (légendaire) -----
    if (mode >= 2) {
      obj.classList.add('leave'); await sleep(380); obj.className = 'us-obj dolls'; const HUES = [['#b3262d', '#b3262d'], ['#2f66c9', '#2f66c9'], ['#2f7a2a', '#2f7a2a'], ['#c9a43a', '#c9a43a']];
      obj.innerHTML = HUES.map((h, k) => doll(k, h)).join(''); requestAnimationFrame(() => obj.classList.add('in')); await sleep(480);
      const dolls = [...obj.querySelectorAll('.us-doll')];
      for (let k = 0; k < dolls.length - 1; k++) {
        await tap(k === 0 ? 'Touche la matriochka pour l\'ouvrir' : 'Encore une…');
        const d = dolls[k]; d.classList.add('split'); snd.rip(.9); buzz?.([14, 24, 36]); const [x, y] = center(); fx.emit(x, y - 30, 14, COLORS, { speed: 6, life: 900 }); await sleep(520); d.classList.add('gone');
      }
      await tap('La dernière…'); dolls.at(-1).classList.add('split'); snd.shimmer(5); await sleep(420);
    }
    // ----- 4) feu d'artifice rouge et or, puis les cartes -----
    const [cx, cy] = center(); $('.us-flash').classList.add('go');
    fx.emit(cx, cy, 80 + lvl * 25, COLORS, { speed: 12, spread: Math.PI * 2, life: 2200, gravity: .18 }); snd.boom(1); buzz?.(lvl >= 4 ? [30, 40, 60, 40, 90] : 25); snd.shimmer(lvl);
    await sleep(lvl >= 4 ? 900 : 650); stage.classList.add('fly'); await sleep(420);
    cleanup(); return cards;
  }

  // ---------- ouverture de 10 colis : camion du Parti, colis lancés un à un, tampon sur chaque colis ----------
  const truckSvg = () => `<svg class="us-truck" viewBox="0 0 330 150" aria-hidden="true">
    <g class="tk-body"><rect x="6" y="38" width="196" height="72" rx="4" fill="#6a4a2c" stroke="#2c1a0c" stroke-width="3"/>${Array.from({ length: 7 }, (_, i) => `<path d="M${22 + i * 27} 40v68" stroke="#2c1a0c" stroke-width="2.5" opacity=".7"/>`).join('')}
      <rect x="6" y="100" width="196" height="12" fill="#3b2a18"/>
      <path d="M206 54h58l32 30v28h-90z" fill="#b3262d" stroke="#4a0b10" stroke-width="3"/><path d="M236 62h26l20 22h-46z" fill="#cfe3ee" stroke="#4a0b10" stroke-width="2.4"/>
      <rect x="296" y="96" width="26" height="14" rx="3" fill="#3b3b3b"/>${star(236, 98, 11, '#f4d56b')}</g>
    <g class="tk-wheel" style="transform-origin:62px 122px"><circle cx="62" cy="122" r="20" fill="#16161a" stroke="#555" stroke-width="3"/><circle cx="62" cy="122" r="7" fill="#999"/><path d="M62 104v36M44 122h36" stroke="#444" stroke-width="3"/></g>
    <g class="tk-wheel" style="transform-origin:150px 122px"><circle cx="150" cy="122" r="20" fill="#16161a" stroke="#555" stroke-width="3"/><circle cx="150" cy="122" r="7" fill="#999"/><path d="M150 104v36M132 122h36" stroke="#444" stroke-width="3"/></g>
    <g class="tk-wheel" style="transform-origin:262px 122px"><circle cx="262" cy="122" r="20" fill="#16161a" stroke="#555" stroke-width="3"/><circle cx="262" cy="122" r="7" fill="#999"/><path d="M262 104v36M244 122h36" stroke="#444" stroke-width="3"/></g></svg>`;
  const miniParcel = () => `<svg viewBox="0 0 120 100" aria-hidden="true"><rect x="10" y="30" width="100" height="62" rx="3" fill="#b08457" stroke="#6a4a2c" stroke-width="2"/><polygon points="10,30 110,30 104,16 16,16" fill="#d0a876" stroke="#6a4a2c" stroke-width="2"/><rect x="54" y="16" width="12" height="76" fill="#efe3c2" opacity=".8"/><circle cx="84" cy="62" r="11" fill="none" stroke="#b3262d" stroke-width="2.4"/>${star(84, 62, 6, '#b3262d')}</svg>`;
  const miniFolder = () => `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M10 28h34l8-9h58v73H10z" fill="#7d858d" stroke="#3c4249" stroke-width="2.4"/><rect x="22" y="48" width="76" height="22" fill="none" stroke="#b3262d" stroke-width="2.6" transform="rotate(-6 60 59)"/><rect x="20" y="76" width="80" height="7" fill="#2f3338"/><rect x="54" y="73" width="14" height="13" rx="2" fill="#c9a43a"/></svg>`;
  const miniDoll = () => `<svg viewBox="0 0 100 130" aria-hidden="true"><path d="M16 66C10 104 22 126 50 126S90 104 84 66Z" fill="#b3262d" stroke="#4a0b10" stroke-width="2"/><path d="M16 66C12 30 28 8 50 8S88 30 84 66Z" fill="#c0161d" stroke="#4a0b10" stroke-width="2"/><circle cx="50" cy="44" r="17" fill="#f3d2b0" stroke="#4a0b10" stroke-width="1.5"/><path d="M33 40q17-18 34 0v-6q-17-16-34 0z" fill="#f4d56b"/>${star(50, 96, 11, '#f4d56b')}</svg>`;
  window.ussrTenKit = {
    truck: truckSvg, parcel: parcelSvg,
    shapeOf: key => key === 'ultra' ? 'dossier' : ['legendary', 'shiny', 'god'].includes(key) ? 'matriochka' : 'colis',   // même logique que l'ouverture d'un seul colis
    mini: shape => shape === 'dossier' ? miniFolder() : shape === 'matriochka' ? miniDoll() : miniParcel(),
  };
  window.ussrPackStage = ussrPackStage; window.ussrParcelSvg = parcelSvg;
})();
