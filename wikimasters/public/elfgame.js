// L'Atelier des lutins (Noël) : chaîne de montage en action, dessinée au vecteur.
// Les règles viennent d'elfsim.js, le même fichier que sur le serveur : le téléphone joue en direct et envoie seulement la liste de ses gestes ;
// le serveur rejoue la partie et calcule le score. L'écran de jeu est en paysage : en portrait il pivote tout seul.
(function () {
  'use strict';
  const E = window.ElfSim, TAU = Math.PI * 2, W = 160, H = 90, OUT = '#1a0e08';
  const ELF_X = [42, 118], BELT_Y = 34, PART_X0 = 14, PART_X1 = 140, COUNT_IN = 3;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = (a, b) => a + Math.random() * (b - a), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
  if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
  const COL = { jouet: '#f08a2c', boite: '#3fa7d6', ruban: '#d6479c' };
  const NAME = { jouet: 'Jouet', boite: 'Boîte', ruban: 'Ruban' };
  const SAY = {
    gift: ['Cadeau emballé. Le patron en a déjà revendu douze.', 'Un de plus. La prime, elle, reste à l\'étude.', 'Livré dans les temps. Sans remerciement, comme prévu.', 'Produit conforme. Le lutin, beaucoup moins.', 'Le cadeau est parti. La reconnaissance, elle, est en rupture de stock.'],
    whistle: ['Le sifflet est une marque de reconnaissance.', 'Cadence relevée. Le moral, non.', 'Un coup de sifflet : c\'est comme un compliment, en plus bref.'],
    strike: ['Grève immédiate. Le Père Noël parle d\'« une pause prolongée non autorisée ».', 'Le lutin a lu son contrat. Il y a trouvé des pages.', 'Le syndicat a répondu présent. Il a dit : « pas aujourd\'hui ».'],
    lost: ['Pièce perdue. Elle sera déduite de la reconnaissance du lutin.', 'Une pièce de moins. L\'inventaire se plaindra à votre place.'],
    warn: ['Le lutin approche de la rupture, comme tout le reste de l\'entreprise.'],
  };
  const pickOf = (a, i) => a[(i | 0) % a.length];
  const stars = s => s >= 3600 ? 3 : s >= 2600 ? 2 : s >= 1500 ? 1 : 0;
  const verdict = (sc, st) => st >= 3 ? 'Cadence exemplaire. Les lutins ne vous parlent plus, mais ils produisent.' : st === 2 ? 'Bon rendement. Le Père Noël l\'a noté, dans la colonne « à presser davantage ».' : st === 1 ? 'Rendement correct. Le syndicat estime qu\'on peut encore faire moins.' : 'Production insuffisante. Les lutins se sont reposés : c\'est un exploit de management.';

  // ───────────── sons synthétisés ─────────────
  let AC = null;
  const sndOn = () => { try { return localStorage.getItem('wm_sound') !== '0'; } catch { return true; } };
  const ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* pas de son */ } } if (AC && AC.state === 'suspended') AC.resume().catch(() => {}); return AC; };
  const tone = (f0, f1, dur, type, vol, delay = 0) => { if (!sndOn()) return; const a = ac(); if (!a) return; const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03); };
  const SFX = {
    take: () => tone(520, 780, 0.07, 'triangle', 0.12), step: () => tone(300, 360, 0.05, 'square', 0.04),
    whistle: () => { tone(1900, 2400, 0.09, 'sine', 0.13); tone(2400, 1700, 0.14, 'sine', 0.12, 0.09); },
    gift: () => { tone(660, 660, 0.12, 'triangle', 0.14); tone(990, 990, 0.2, 'triangle', 0.12, 0.09); },
    strike: () => { tone(160, 70, 0.4, 'sawtooth', 0.12); }, lost: () => tone(200, 80, 0.15, 'sine', 0.16), no: () => tone(220, 180, 0.08, 'square', 0.05),
    tick: () => tone(880, 880, 0.06, 'square', 0.06), go: () => tone(1320, 1320, 0.2, 'triangle', 0.14),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.17, i * 0.1)),
  };
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* sans importance */ } };

  // ───────────── dessins ─────────────
  const rr = (c, x, y, w, h, r, fill, stroke) => { c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) c.stroke(); };
  const lin = (c, y0, y1, a, b) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  /** Icône d'une pièce, centrée en (x, y), rayon r (pixels). */
  function icon(c, type, x, y, r, o = {}) {
    const im = art(type); if (im) { c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot); c.globalAlpha = o.alpha ?? 1; const k = r * 2.2 / Math.max(im.width, im.height); c.drawImage(im, -im.width * k / 2, -im.height * k / 2, im.width * k, im.height * k); c.restore(); return; }
    c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot); c.globalAlpha = o.alpha ?? 1; c.lineWidth = Math.max(1, r * 0.13); c.strokeStyle = OUT; c.lineJoin = 'round';
    if (type === 'jouet') { c.fillStyle = '#b8743a'; c.beginPath(); c.arc(-r * 0.62, -r * 0.62, r * 0.32, 0, TAU); c.arc(r * 0.62, -r * 0.62, r * 0.32, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#d8934f'; c.beginPath(); c.arc(0, 0, r * 0.85, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#f2d2a6'; c.beginPath(); c.ellipse(0, r * 0.22, r * 0.38, r * 0.3, 0, 0, TAU); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(-r * 0.3, -r * 0.14, r * 0.1, 0, TAU); c.arc(r * 0.3, -r * 0.14, r * 0.1, 0, TAU); c.arc(0, r * 0.12, r * 0.1, 0, TAU); c.fill(); }
    else if (type === 'boite') { rr(c, -r * 0.8, -r * 0.7, r * 1.6, r * 1.5, r * 0.12, '#3fa7d6', true); c.fillStyle = '#ffffff55'; c.fillRect(-r * 0.8, -r * 0.7, r * 1.6, r * 0.4); c.fillStyle = '#f4f2ea'; c.fillRect(-r * 0.14, -r * 0.7, r * 0.28, r * 1.5); c.strokeRect(-r * 0.14, -r * 0.7, r * 0.28, r * 1.5); }
    else { c.fillStyle = '#d6479c'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(s * r * 1.1, -r * 1.0, s * r * 0.95, r * 0.15); c.quadraticCurveTo(s * r * 0.7, r * 0.7, 0, 0); c.fill(); c.stroke(); } c.beginPath(); c.arc(0, 0, r * 0.26, 0, TAU); c.fillStyle = '#f2a1cf'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(-r * 0.2, r * 0.2); c.lineTo(-r * 0.5, r * 0.95); c.moveTo(r * 0.2, r * 0.2); c.lineTo(r * 0.5, r * 0.95); c.stroke(); }
    c.restore();
  }
  const GIFT = { '#d8343c': 'gift-1', '#3fa7d6': 'gift-2', '#2f9a58': 'gift-3', '#e8c35a': 'gift-4' };
  const giftBox = (c, x, y, r, col) => { const im = art(GIFT[col] || (col === '#3fa7d6' ? 'boite' : '')); if (im) { const k = r * 2.3 / Math.max(im.width, im.height); c.drawImage(im, x - im.width * k / 2, y - im.height * k / 2, im.width * k, im.height * k); return; } rr(c, x - r, y - r, r * 2, r * 2, r * 0.14, col, true); c.fillStyle = '#f4f2ea'; c.fillRect(x - r * 0.15, y - r, r * 0.3, r * 2); c.fillRect(x - r, y - r * 0.15, r * 2, r * 0.3); c.beginPath(); c.arc(x - r * 0.28, y - r - r * 0.18, r * 0.3, 0, TAU); c.arc(x + r * 0.28, y - r - r * 0.18, r * 0.3, 0, TAU); c.stroke(); };

  let cur = null;
  const ART = {};
  const loadArt = names => Promise.all(names.map(n => new Promise(res => { if (ART[n] !== undefined) return res(); const im = new Image(); im.onload = () => { ART[n] = im; res(); }; im.onerror = () => { ART[n] = null; res(); }; im.src = '/art/' + n + '.png'; })));
  const ART_NAMES = ['elf-body-1', 'elf-body-2', 'jouet', 'boite', 'ruban', 'gift-1', 'gift-2', 'gift-3', 'gift-4'].concat([1, 2].flatMap(i => ['neutral', 'stressed', 'strike'].map(m => 'elf' + i + '-head-' + m)));
  const art = n => ART[n] || null;
  const loadHead = h => new Promise(res => { if (!h) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = '/api/noel/atel/head/' + h.slot + '?v=' + h.v; });
  /** Visage de lutin : photo d'un joueur volontaire si elle existe, sinon visage dessiné. */
  function faceDraw(c, img, x, y, r, stress, t) {
    c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
    if (img) { const s = Math.min(img.width, img.height); c.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x - r, y - r, r * 2, r * 2); }
    else { c.fillStyle = lin(c, y - r, y + r, '#f6d7b2', '#dfb58a'); c.fillRect(x - r, y - r, r * 2, r * 2); c.fillStyle = '#12181c'; c.beginPath(); c.ellipse(x - r * 0.35, y - r * 0.1, r * 0.1, r * 0.14, 0, 0, TAU); c.ellipse(x + r * 0.35, y - r * 0.1, r * 0.1, r * 0.14, 0, 0, TAU); c.fill(); c.lineWidth = r * 0.09; c.strokeStyle = '#12181c'; c.beginPath(); if (stress > 650) { c.moveTo(x - r * 0.3, y + r * 0.5); c.quadraticCurveTo(x, y + r * 0.3, x + r * 0.3, y + r * 0.5); } else { c.arc(x, y + r * 0.2, r * 0.38, 0.2, Math.PI - 0.2); } c.stroke(); }
    if (stress > 0) { c.fillStyle = 'rgba(220,40,40,' + clamp(stress / 1000 * 0.45, 0, 0.45) + ')'; c.fillRect(x - r, y - r, r * 2, r * 2); }
    c.restore(); c.lineWidth = r * 0.14; c.strokeStyle = '#e8c35a'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.strokeStyle = OUT; c.lineWidth = r * 0.05; c.beginPath(); c.arc(x, y, r + r * 0.07, 0, TAU); c.stroke(); void t;
  }

  async function open(opts) {
    const { n, day, api } = opts, q = '?n=' + n + (day !== undefined && day !== null && day !== '' ? '&day=' + day : '');
    const info = await api('/noel/atel' + q); await loadArt(ART_NAMES); const imgs = [null, null];
    const ov = el('div', 'sg-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Atelier des lutins, niveau ' + n);
    document.body.append(ov); document.body.classList.add('sg-lock');
    let raf = 0, cleanup = () => {};
    const close = () => { cancelAnimationFrame(raf); cleanup(); ov.remove(); document.body.classList.remove('sg-lock'); cur = null; opts.onClose && opts.onClose(); };
    const portraitNow = () => window.innerHeight > window.innerWidth;
    const starSvg = (on, size) => `<svg viewBox="-12 -12 24 24" width="${size}" height="${size}"><polygon points="${[...Array(10)].map((_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5.2 : 11; return (Math.cos(a) * r).toFixed(2) + ',' + (Math.sin(a) * r).toFixed(2); }).join(' ')}" fill="${on ? '#e8c35a' : '#ffffff14'}" stroke="${on ? '#fff1c7' : '#ffffff33'}" stroke-width="1" stroke-linejoin="round"/></svg>`;

    function intro(inf) {
      cancelAnimationFrame(raf); cleanup(); cleanup = () => {}; const left = inf.tries - inf.used;
      ov.className = 'sg-ov'; ov.style.cssText = ''; ov.innerHTML = `<div class="sg-card"><div class="sg-kick">PÔLE NORD S.A. · ATELIER DES LUTINS</div>
        <div class="sg-lvl">Poste <b>${n}</b></div>
        <p class="sg-brief">Deux lutins, un tapis roulant, quatre-vingt-dix secondes. La direction a décidé que le bonheur se mesurait en cadeaux par minute.</p>
        <div class="sg-roster el-duo"><div><canvas width="120" height="120" data-i="0"></canvas><b>Lutin n°1</b><span>Poste de gauche</span></div><div><canvas width="120" height="120" data-i="1"></canvas><b>Lutin n°2</b><span>Poste de droite</span></div></div>
        <ul class="sg-how"><li>Un cadeau = <b>un jouet, puis une boîte, puis un ruban</b>, dans cet ordre.</li><li><b>Touche une pièce</b> du tapis : elle part chez le lutin qui l'attend. Une pièce non prise tombe au rebut.</li><li><b>Touche un lutin</b> pour donner un coup de sifflet : il travaille plus vite quelques secondes, mais il s'épuise. Trop de sifflets, c'est la grève.</li></ul>
        ${portraitNow() ? '<p class="sg-orient"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M20.5 9.5a8.5 8.5 0 0 1 0 5M22 12l-1.5 2.5L18.5 13"/></svg>Le jeu se joue en paysage : l\'écran pivote tout seul.</p>' : ''}
        <div class="sg-stats"><span><b>${left}</b> essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}</span><span>Meilleur <b>${inf.best}</b></span><span><b>${inf.flocons}</b> flocons</span></div>
        <p class="sg-note">Seule ta meilleure partie du jour compte : le Père Noël ne paie que les progrès (jusqu'à ${inf.max} flocons).</p>
        <button class="sg-btn" id="sg-go" ${left > 0 ? '' : 'disabled'}>${left > 0 ? 'Prendre le poste' : 'Plus d\'essai aujourd\'hui'}</button><button class="sg-btn ghost" id="sg-quit">Retour au calendrier</button></div>`;
      ov.querySelectorAll('canvas[data-i]').forEach(cv => { const c = cv.getContext('2d'), i = +cv.dataset.i; c.lineJoin = 'round'; c.fillStyle = '#2f7d4a'; c.beginPath(); c.moveTo(22, 120); c.lineTo(30, 86); c.quadraticCurveTo(60, 76, 90, 86); c.lineTo(98, 120); c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke(); faceDraw(c, imgs[i], 60, 56, 30, 0, 0); c.fillStyle = '#d8343c'; c.beginPath(); c.moveTo(30, 40); c.quadraticCurveTo(52, 6, 86, 20); c.quadraticCurveTo(80, 36, 90, 44); c.quadraticCurveTo(60, 30, 30, 40); c.fill(); c.stroke(); c.fillStyle = '#fbfbf6'; c.beginPath(); c.arc(88, 20, 7, 0, TAU); c.fill(); c.stroke(); });
      ov.querySelector('#sg-quit').onclick = close;
      const go = ov.querySelector('#sg-go'); go.onclick = async () => { go.disabled = true; try { ac(); const r = await api('/noel/atel/start', { n, ...(day ? { day } : {}) }); play(r.attempt); } catch (e) { opts.toast && opts.toast(e.message); go.disabled = false; } };
    }

    function play(attempt) {
      const lv = E.level(n); ov.innerHTML = ''; ov.className = 'sg-ov playing';
      const pl = el('div', 'sg-play'), cv = el('canvas'), quit = el('button', 'sg-x', 'Quitter'); pl.append(cv, quit); ov.append(pl);
      const ctx = cv.getContext('2d'); let lw = 0, lh = 0, dpr = 1, S = 1, ox = 0, oy = 0, rotated = false, bg = null;
      const X = x => ox + x * S, Y = y => oy + y * S;
      function layout() {
        rotated = portraitNow(); const iw = window.innerWidth, ih = window.innerHeight;
        pl.style.cssText = rotated ? `width:${ih}px;height:${iw}px;left:${iw}px;top:0;transform:rotate(90deg)` : `width:${iw}px;height:${ih}px;left:0;top:0;transform:none`;
        lw = rotated ? ih : iw; lh = rotated ? iw : ih; dpr = Math.min(2, window.devicePixelRatio || 1); if (lw * lh * dpr * dpr > 3.4e6) dpr = Math.sqrt(3.4e6 / (lw * lh));
        cv.style.width = lw + 'px'; cv.style.height = lh + 'px'; cv.width = Math.round(lw * dpr); cv.height = Math.round(lh * dpr);
        S = Math.min(cv.width / W, cv.height / H); ox = (cv.width - W * S) / 2; oy = (cv.height - H * S) / 2; bg = null;
      }
      layout(); const onRes = () => layout(); window.addEventListener('resize', onRes); window.addEventListener('orientationchange', onRes);
      cleanup = () => { window.removeEventListener('resize', onRes); window.removeEventListener('orientationchange', onRes); };
      try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch { /* verrouillage indisponible */ }

      const st = E.create(), inputs = [], pending = [], fx = [], pops = [], flying = [], bins = [], elfFx = [0, 1].map(() => ({ shake: 0, whistle: 0, puff: 0, gifts: [] }));
      let clock = 0, startAt = performance.now() + COUNT_IN * 1000, acc = 0, last = performance.now(), ended = false, cap = null, warned = false, sayN = 0, lastCount = 4, helpT = 8;
      const say = (k, force) => { if (!force && cap && cap.t < 1.2) return; cap = { text: pickOf(SAY[k], sayN++), t: 0, max: 3.4 }; };
      const partPos = (p, frac) => { const f = clamp((st.tick + frac - p.t) / p.life, 0, 1); return [PART_X0 + f * (PART_X1 - PART_X0), BELT_Y - 4.2]; };
      const burst = (x, y, col, k) => { for (let i = 0; i < k; i++) { const a = rnd(0, TAU), sp = rnd(10, 30); fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 8, life: rnd(0.4, 0.9), max: 0.9, col, s: rnd(0.5, 1) }); } };
      const pop = (x, y, text, col) => pops.push({ x, y, text, col, t: 0 });

      // — gestes du joueur —
      const loc = e => { const b = pl.getBoundingClientRect(); return rotated ? [e.clientY - b.top, b.right - e.clientX] : [e.clientX - b.left, e.clientY - b.top]; };
      const toWorld = e => { const [lx, ly] = loc(e); return [(lx * dpr - ox) / S, (ly * dpr - oy) / S]; };
      cv.addEventListener('pointerdown', e => {
        ac(); if (ended || performance.now() < startAt) return; const [wx, wy] = toWorld(e), T = st.tick;
        let best = null, bd = 9 * 9; for (const p of lv.parts) { if (!E.alive(p, T) || st.taken[p.id]) continue; const [px, py] = partPos(p, acc); const d = (px - wx) ** 2 + (py - wy) ** 2; if (d < bd) { bd = d; best = p; } }
        if (best) { if (E.route(st, best) >= 0) { pending.push([T, 0, best.id]); inputs.push([T, 0, best.id]); } else { SFX.no(); const [px, py] = partPos(best, acc); pop(px, py - 3, 'Personne n\'en veut', '#ffd6d6'); } return; }
        for (let i = 0; i < 2; i++) if (((wx - ELF_X[i]) ** 2 + (wy - 64) ** 2 < 19 * 19 || (Math.abs(wx - ELF_X[i]) < 22 && wy > 74))) { if (st.elves[i].cool === 0 && st.elves[i].strike === 0) { pending.push([T, 1, i]); inputs.push([T, 1, i]); } return; }
      });
      quit.onclick = () => { if (ended || confirm('Quitter ? Cet essai est déjà décompté : le Père Noël ne rembourse pas.')) close(); };

      function handle(ev) {
        for (const o of ev) {
          if (o.k === 'take') { const p = lv.parts[o.id], [px, py] = partPos(p, 0); flying.push({ type: p.type, x: px, y: py, tx: ELF_X[o.elf], ty: 60, t: 0 }); SFX.take(); buzz(5); }
          else if (o.k === 'whistle') { elfFx[o.elf].whistle = 0.5; SFX.whistle(); buzz(12); say('whistle'); }
          else if (o.k === 'strike') { elfFx[o.elf].shake = 1; SFX.strike(); buzz(70); say('strike', true); burst(ELF_X[o.elf], 56, '#ffffff', 14); }
          else if (o.k === 'step') { SFX.step(); }
          else if (o.k === 'gift') { SFX.gift(); elfFx[o.elf].gifts.push({ t: 0, col: ['#d8343c', '#3fa7d6', '#2f9a58', '#e8c35a'][st.elves[o.elf].gifts % 4] }); pop(ELF_X[o.elf], 50, '+' + E.GIFT_PTS, '#ffd34d'); burst(ELF_X[o.elf], 74, '#ffd34d', 10); if (st.gifts % 4 === 0) say('gift'); }
          else if (o.k === 'lost') { const p = lv.parts[o.id]; bins.push({ type: p.type, t: 0 }); SFX.lost(); pop(PART_X1 + 8, BELT_Y - 2, '−' + E.LOST_PTS, '#ff9a9a'); say('lost'); }
        }
      }

      const STATION = ['#5ad0ff', '#ffb14a'], PLAQ = ['N°1', 'N°2'];
      function buildBg() {
        bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height; const c = bg.getContext('2d');
        let g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, '#54301d'); g.addColorStop(0.7, '#35190f'); g.addColorStop(1, '#22100a'); c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
        c.fillStyle = 'rgba(0,0,0,.15)'; for (let x = ox % (S * 6); x < cv.width; x += S * 6) c.fillRect(x, 0, Math.max(1, S * 0.18), cv.height);
        c.fillStyle = 'rgba(255,220,160,.06)'; for (let r = 0; r < 12; r++) for (let k = 0; k < 30; k++) { c.beginPath(); c.arc(ox + S * (1.5 + k * 6 + (r % 2) * 3), Y(3 + r * 5), S * 0.32, 0, TAU); c.fill(); }
        // fenêtre (le verre est dessiné à chaque image, derrière ce décor : on perce donc un trou)
        const wx0 = X(64), wy0 = Y(8), ww = 32 * S, wh = 19 * S; rr(c, wx0 - S * 1.2, wy0 - S * 1.2, ww + S * 2.4, wh + S * 2.4, S, lin(c, wy0, wy0 + wh, '#7a4d2c', '#5a3820'), false); c.clearRect(wx0, wy0, ww, wh);
        c.strokeStyle = '#5a3820'; c.lineWidth = S * 0.9; c.beginPath(); c.moveTo(wx0 + ww / 2, wy0); c.lineTo(wx0 + ww / 2, wy0 + wh); c.moveTo(wx0, wy0 + wh / 2); c.lineTo(wx0 + ww, wy0 + wh / 2); c.stroke(); c.fillStyle = '#7a4d2c'; c.fillRect(wx0 - S * 2, wy0 + wh + S * 1.1, ww + S * 4, S * 1.2);
        // étagères et jouets
        for (const sx of [6, 130]) { c.fillStyle = '#6b4328'; c.fillRect(X(sx), Y(21.4), 26 * S, S * 1.3); c.fillStyle = '#00000044'; c.fillRect(X(sx), Y(22.7), 26 * S, S * 0.5); [['jouet', 4], ['boite', 10], ['ruban', 16], ['jouet', 22]].forEach(([t, dx], k) => { c.save(); c.shadowColor = '#0006'; c.shadowBlur = S; icon(c, t, X(sx + dx), Y(18.4), S * (k % 2 ? 2.6 : 2.2), { alpha: 0.85 }); c.restore(); }); }
        // affiches d'entreprise
        const poster = (x, y, w, h, lines, rot) => { c.save(); c.translate(X(x + w / 2), Y(y)); c.rotate(rot); c.fillStyle = '#00000055'; c.fillRect(-w / 2 * S + S * 0.5, S * 0.5, w * S, h * S); c.fillStyle = '#efe3c2'; c.fillRect(-w / 2 * S, 0, w * S, h * S); c.strokeStyle = '#b3202a'; c.lineWidth = S * 0.4; c.strokeRect(-w / 2 * S + S, S, (w - 2) * S, (h - 2) * S); c.fillStyle = '#b3202a'; c.beginPath(); c.arc(0, S * 0.6, S * 0.7, 0, TAU); c.fill(); c.textAlign = 'center'; lines.forEach((l, i) => { c.fillStyle = i ? '#4a3a22' : '#1a1204'; c.font = (i ? '600 ' : '800 ') + Math.round(S * (i ? 1.5 : 2.1)) + 'px Georgia, serif'; c.fillText(l, 0, S * (4.8 + i * 3.1)); }); c.restore(); };
        poster(33, 7.5, 24, 14.5, ['PAUSE', 'quatre secondes', '(victoire syndicale)'], -0.03); poster(104, 7.5, 24, 14.5, ['LE BONHEUR', 'est facultatif.', 'La cadence, non.'], 0.025);
        // plancher
        c.fillStyle = lin(c, Y(83), cv.height, '#4a2c18', '#1e0f08'); c.fillRect(0, Y(83), cv.width, cv.height - Y(83)); c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = Math.max(1, S * 0.15); for (let x = ox % (S * 14); x < cv.width; x += S * 14) { c.beginPath(); c.moveTo(x, Y(83)); c.lineTo(x - S * 4, cv.height); c.stroke(); }
        // supports du tapis
        c.fillStyle = '#17171b'; for (const x of [24, 80, 136]) c.fillRect(X(x), Y(BELT_Y + 4.4), S * 1.4, S * 5);
        // guirlande
        c.strokeStyle = '#1d3d25'; c.lineWidth = S * 0.55; c.beginPath(); for (let x = 0; x <= W; x += 2) { const y = 4.5 + Math.sin(x / 160 * Math.PI * 6) * 1.5; c[x ? 'lineTo' : 'moveTo'](X(x), Y(y)); } c.stroke();
        // vignette
        const vg = c.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.45, cv.width / 2, cv.height / 2, cv.height * 1.1); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)'); bg.vig = vg;
      }
      function drawScene() {
        const wx0 = X(64), wy0 = Y(8), ww = 32 * S, wh = 19 * S;
        ctx.fillStyle = lin(ctx, wy0, wy0 + wh, '#07162a', '#1f4560'); ctx.fillRect(wx0, wy0, ww, wh);
        ctx.fillStyle = '#ffffffcc'; for (let i = 0; i < 34; i++) { const sx = wx0 + (((i * 53 + clock * 9 * (0.4 + (i % 3) * 0.3)) % 100) / 100) * ww, sy = wy0 + (((i * 31 + clock * 22 * (0.5 + (i % 4) * 0.25)) % 100) / 100) * wh; ctx.fillRect(sx, sy, S * 0.4, S * 0.4); }
        ctx.fillStyle = '#e9f4f8'; ctx.beginPath(); ctx.moveTo(wx0, wy0 + wh); ctx.quadraticCurveTo(wx0 + ww * 0.3, wy0 + wh * 0.7, wx0 + ww * 0.6, wy0 + wh * 0.84); ctx.quadraticCurveTo(wx0 + ww * 0.8, wy0 + wh * 0.78, wx0 + ww, wy0 + wh * 0.8); ctx.lineTo(wx0 + ww, wy0 + wh); ctx.fill();
        ctx.drawImage(bg, 0, 0);
        for (let i = 0; i < 22; i++) { const x = i * 7.6 + 2, y = 4.5 + Math.sin(x / 160 * Math.PI * 6) * 1.5, on = (Math.floor(clock * 2) + i) % 3 === 0; ctx.fillStyle = ['#ff5a5a', '#ffd34d', '#5ad0ff', '#7dff9a'][i % 4]; ctx.globalAlpha = on ? 1 : 0.45; ctx.beginPath(); ctx.arc(X(x), Y(y + 1.3), S * 0.8, 0, TAU); ctx.fill(); if (on) { ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(X(x), Y(y + 1.3), S * 2.2, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
        ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 2; i++) { const g = ctx.createRadialGradient(X(ELF_X[i]), Y(56), S * 4, X(ELF_X[i]), Y(56), S * 34); g.addColorStop(0, i ? 'rgba(255,170,80,.20)' : 'rgba(90,200,255,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(X(ELF_X[i] - 36), Y(30), S * 72, S * 60); } ctx.globalCompositeOperation = 'source-over';
      }
      function drawBelt(T) {
        const y = BELT_Y; rr(ctx, X(6), Y(y - 1.8), 148 * S, 6.4 * S, S * 1.4, lin(ctx, Y(y - 1.8), Y(y + 4.6), '#4d4f5c', '#26272e'), true); ctx.strokeStyle = OUT; ctx.lineWidth = S * 0.15; ctx.stroke();
        ctx.fillStyle = '#868a9a'; ctx.fillRect(X(7.5), Y(y - 1.6), 145 * S, S * 0.45);
        ctx.strokeStyle = '#5d6070'; ctx.lineWidth = S * 0.4; const off = ((T + acc) * 1.2) % 4; for (let x = 8 + off; x < 152; x += 4) { ctx.beginPath(); ctx.moveTo(X(x), Y(y - 1.1)); ctx.lineTo(X(x + 1.4), Y(y + 3.6)); ctx.stroke(); }
        for (const x of [8, 152]) { ctx.fillStyle = lin(ctx, Y(y), Y(y + 6), '#7c8090', '#3a3b44'); ctx.beginPath(); ctx.arc(X(x), Y(y + 1.5), S * 2.7, 0, TAU); ctx.fill(); ctx.stroke(); ctx.save(); ctx.translate(X(x), Y(y + 1.5)); ctx.rotate((T + acc) * 0.35); ctx.fillStyle = '#25262d'; for (let k = 0; k < 3; k++) { ctx.rotate(TAU / 3); ctx.fillRect(-S * 0.3, 0, S * 0.6, S * 2); } ctx.restore(); }
        // trappe d'arrivage et rebut
        rr(ctx, X(-1), Y(y - 8), 12 * S, 12 * S, S * 0.8, '#2b2b32', true); ctx.fillStyle = '#ffd34d'; for (let k = 0; k < 4; k++) ctx.fillRect(X(-1) + k * S * 3, Y(y + 2.2), S * 1.5, S * 1.2); ctx.fillStyle = '#f4ead0'; ctx.font = '700 ' + Math.round(S * 1.45) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ARRIVAGE', X(5), Y(y - 4.2));
        rr(ctx, X(146), Y(y + 6), 14 * S, 10 * S, S * 0.7, lin(ctx, Y(y + 6), Y(y + 16), '#5a3a1e', '#3a220f'), true); ctx.fillStyle = '#150b06'; ctx.fillRect(X(147.5), Y(y + 6.6), 11 * S, S * 1.2); ctx.fillStyle = '#f4ead0'; ctx.fillText('REBUT', X(153), Y(y + 13));
        for (const p of lv.parts) {
          if (!E.alive(p, T) || st.taken[p.id]) continue; const [px, py] = partPos(p, acc), f = (T + acc - p.t) / p.life, rt = E.route(st, p), sc = Math.min(1, 0.55 + f * 14), r = S * 3.5 * sc, wob = f > 0.8 ? Math.sin(clock * 30) * 0.35 : 0;
          ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(X(px + wob), Y(BELT_Y - 0.6), r * 0.95, r * 0.28, 0, 0, TAU); ctx.fill();
          if (rt >= 0) { const pu = 0.65 + 0.35 * Math.sin(clock * 7 + p.id); ctx.save(); ctx.shadowColor = STATION[rt]; ctx.shadowBlur = S * 2.4; ctx.strokeStyle = STATION[rt]; ctx.globalAlpha = pu; ctx.lineWidth = S * 0.6; ctx.beginPath(); ctx.arc(X(px + wob), Y(py), r * 1.38, 0, TAU); ctx.stroke(); ctx.restore(); }
          ctx.globalAlpha = rt >= 0 ? (f > 0.8 ? 0.7 + 0.3 * Math.sin(clock * 22) : 1) : 0.5; icon(ctx, p.type, X(px + wob), Y(py), r); ctx.globalAlpha = 1;
          if (f > 0.8) { ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = S * 0.35; ctx.beginPath(); ctx.arc(X(px + wob), Y(py), r * 1.7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - (f - 0.8) * 5)); ctx.stroke(); }
        }
      }
      function drawElf(i, T) {
        const e = st.elves[i], f = elfFx[i], x = ELF_X[i], t = clock, strike = e.strike > 0, working = !strike && e.buf.includes(E.SLOTS[e.need]), boosted = e.boost > 0, st01 = e.stress / E.ST_MAX;
        const sh = f.shake > 0 ? Math.sin(t * 50) * 0.5 * f.shake : 0, cx = X(x + sh), col = STATION[i], speed = boosted ? 22 : 11;
        const dy = strike ? 3.2 : working ? Math.sin(t * speed * 0.5 + i) * 0.45 : Math.sin(t * 2 + i) * 0.25;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = S * 0.22;
        // corps : tunique, col blanc, boutons
        const hdName = 'elf' + (i + 1) + '-head-' + (strike ? 'strike' : e.stress > 650 ? 'stressed' : 'neutral'), bodyIm = art('elf-body-' + (i + 1)), headIm = art(hdName), skin = ['#a9744a', '#c48d5c'][i];
        if (bodyIm) { const bw = 27 * S, bh = bw * bodyIm.height / bodyIm.width; ctx.drawImage(bodyIm, cx - bw / 2, Y(62.4 + dy * 0.5), bw, bh); } else {
        ctx.beginPath(); ctx.moveTo(cx - 9.5 * S, Y(84)); ctx.lineTo(cx - 9 * S, Y(68 + dy * 0.5)); ctx.quadraticCurveTo(cx, Y(64.5 + dy * 0.5), cx + 9 * S, Y(68 + dy * 0.5)); ctx.lineTo(cx + 9.5 * S, Y(84)); ctx.closePath(); ctx.fillStyle = lin(ctx, Y(65), Y(84), '#3fb06a', '#1d6339'); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff22'; ctx.fillRect(cx - 8 * S, Y(68.5), 3 * S, 12 * S);
        ctx.fillStyle = '#e8c35a'; for (const yy of [70.5, 73.5]) { ctx.beginPath(); ctx.arc(cx, Y(yy + dy * 0.5), S * 0.65, 0, TAU); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = '#fbfbf6'; ctx.beginPath(); ctx.moveTo(cx - 5.5 * S, Y(65.4 + dy * 0.5)); for (let k = 0; k <= 6; k++) ctx.lineTo(cx - 5.5 * S + k * 11 / 6 * S, Y(65.4 + dy * 0.5 + (k % 2 ? 2 : 0.6))); ctx.lineTo(cx + 5.5 * S, Y(65.4 + dy * 0.5)); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // oreilles et tête
        if (!headIm) {
        ctx.fillStyle = '#f1c9a0'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 7 * S, Y(57 + dy)); ctx.lineTo(cx + s * 14 * S, Y(51 + dy)); ctx.lineTo(cx + s * 7.6 * S, Y(61.5 + dy)); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        }
        if (headIm) { const hh = 27 * S, hw = hh * headIm.width / headIm.height; ctx.drawImage(headIm, cx - hw / 2, Y(64.4 + dy) - hh, hw, hh); } else faceDraw(ctx, imgs[i], cx, Y(57 + dy), 8 * S, e.stress, t);
        if (boosted && !strike) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = S * 0.5; for (let k = 0; k < 3; k++) { ctx.globalAlpha = 0.9 - k * 0.25; ctx.beginPath(); ctx.arc(cx + 5 * S, Y(61 + dy), S * (3 + k * 2.2), -0.9, 0.9); ctx.stroke(); } ctx.globalAlpha = 1; ctx.strokeStyle = OUT; }
        // bonnet : bande blanche, pompon aux couleurs du poste
        if (!headIm) {
        ctx.beginPath(); ctx.moveTo(cx - 8.8 * S, Y(53 + dy)); ctx.quadraticCurveTo(cx - 4 * S, Y(37 + dy), cx + 11 * S, Y(42 + dy + Math.sin(t * 3 + i) * 0.5)); ctx.quadraticCurveTo(cx + 7 * S, Y(49 + dy), cx + 8.8 * S, Y(53 + dy)); ctx.quadraticCurveTo(cx, Y(49.5 + dy), cx - 8.8 * S, Y(53 + dy)); ctx.fillStyle = lin(ctx, Y(38), Y(53), '#e8444e', '#a01d26'); ctx.fill(); ctx.stroke();
        rr(ctx, cx - 9.4 * S, Y(51.6 + dy), 18.8 * S, 2.6 * S, S * 1.2, '#fbfbf6', true); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + 11.4 * S, Y(42 + dy), S * 1.9, 0, TAU); ctx.fill(); ctx.stroke();
        }
        // bras et marteau
        ctx.strokeStyle = '#1d6339'; ctx.lineWidth = S * 2.3; const bob = working ? Math.sin(t * speed + i) : 0;
        if (strike) { if (!bodyIm) { ctx.beginPath(); ctx.moveTo(cx - 8.5 * S, Y(69 + dy)); ctx.lineTo(cx + 3 * S, Y(75 + dy)); ctx.moveTo(cx + 8.5 * S, Y(69 + dy)); ctx.lineTo(cx - 3 * S, Y(75 + dy)); ctx.stroke(); } }
        else { const lh = 74.2 - bob * 1.2, rh = 74.2 + bob * 1.2; if (!bodyIm) { ctx.beginPath(); ctx.moveTo(cx - 8.5 * S, Y(69 + dy)); ctx.lineTo(cx - 4.2 * S, Y(lh)); ctx.moveTo(cx + 8.5 * S, Y(69 + dy)); ctx.lineTo(cx + 4.8 * S, Y(rh)); ctx.stroke(); } ctx.fillStyle = bodyIm ? skin : '#f1c9a0'; ctx.strokeStyle = OUT; ctx.lineWidth = S * 0.18; for (const [hx, hy] of [[-4.2, lh], [4.8, rh]]) { ctx.beginPath(); ctx.arc(cx + hx * S, Y(hy), S * 1.4, 0, TAU); ctx.fill(); ctx.stroke(); }
          if (working) { ctx.save(); ctx.translate(cx + 4.8 * S, Y(rh)); ctx.rotate(-0.6 + bob * 0.7); ctx.fillStyle = '#7a5230'; ctx.fillRect(-S * 0.4, -S * 5, S * 0.8, S * 5); ctx.fillStyle = '#8a8d9a'; ctx.fillRect(-S * 1.7, -S * 6.2, S * 3.4, S * 1.8); ctx.strokeRect(-S * 1.7, -S * 6.2, S * 3.4, S * 1.8); ctx.restore(); } }
        ctx.strokeStyle = OUT; ctx.lineWidth = S * 0.2;
        // pancarte de grève
        if (strike) { ctx.strokeStyle = '#6b4328'; ctx.lineWidth = S * 0.8; ctx.beginPath(); ctx.moveTo(cx + 11 * S, Y(80)); ctx.lineTo(cx + 11 * S, Y(60)); ctx.stroke(); rr(ctx, cx + 2.5 * S, Y(52), 17 * S, 9.5 * S, S * 0.7, '#f4ead0', false); ctx.strokeStyle = OUT; ctx.lineWidth = S * 0.2; ctx.stroke(); ctx.fillStyle = '#b3202a'; ctx.font = '800 ' + Math.round(S * 3.4) + 'px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('GRÈVE', cx + 11 * S, Y(58.4)); ctx.fillStyle = '#4a3a22'; ctx.font = '600 ' + Math.round(S * 1.5) + 'px Georgia, serif'; ctx.fillText('jusqu\'à nouvel ordre', cx + 11 * S, Y(60.9)); }
        // table : plateau, atelier en cours, pièces en attente, cadeaux finis
        rr(ctx, cx - 22 * S, Y(75), 44 * S, 16 * S, S * 1.1, lin(ctx, Y(75), Y(91), '#94603a', '#5a3a1e'), true); ctx.fillStyle = '#d19a62'; ctx.fillRect(cx - 21 * S, Y(75.4), 42 * S, S * 0.9); ctx.fillStyle = 'rgba(0,0,0,.18)'; for (const k of [-9, 0, 9]) ctx.fillRect(cx + k * S, Y(76.5), S * 0.18, 14 * S);
        rr(ctx, cx - 7 * S, Y(73.4), 14 * S, 1.6 * S, S * 0.5, '#3a220f', false);
        const stage = Math.min(e.need, 2), wob = working ? Math.sin(t * speed) * 0.25 : 0; if (stage >= 1) icon(ctx, 'jouet', cx, Y(69.4 + wob), S * (stage >= 2 ? 1.8 : 3.2), { alpha: strike ? 0.5 : 1 }); if (stage >= 2) giftBox(ctx, cx, Y(70.6 + wob), S * 3.6, '#3fa7d6');
        e.buf.forEach((p, k) => { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = S * 1.2; icon(ctx, p, cx - (12 + k * 5.4) * S, Y(71.6), S * 2.5); ctx.restore(); });
        const done = Math.min(e.gifts, 6); for (let k = 0; k < done; k++) giftBox(ctx, cx + (13 + (k % 3) * 3.9) * S, Y(72.8 - Math.floor(k / 3) * 3.6), S * 1.7, ['#d8343c', '#3fa7d6', '#2f9a58', '#e8c35a', '#a64fd6', '#ff8a3c'][k % 6]);
        // face de table : commande, compteur, bouton de sifflet
        rr(ctx, cx - 20 * S, Y(78.2), 17 * S, 10 * S, S * 0.5, '#f4ead0', true); ctx.fillStyle = '#b3202a'; ctx.font = '800 ' + Math.round(S * 1.5) + 'px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('COMMANDE ' + PLAQ[i], cx - 19 * S, Y(80.1));
        for (let k = 0; k < 3; k++) { const px = cx - (16.2 - k * 5.4) * S, py = Y(83.7), dn = k < e.need, nw = k === e.need; if (nw) { ctx.fillStyle = '#ffd34d55'; ctx.beginPath(); ctx.arc(px, py, S * 2.9, 0, TAU); ctx.fill(); } icon(ctx, E.SLOTS[k], px, py, S * 2.1, { alpha: dn ? 0.35 : 1 }); if (dn) { ctx.strokeStyle = '#1f8a4a'; ctx.lineWidth = S * 0.6; ctx.beginPath(); ctx.moveTo(px - S * 1.4, py); ctx.lineTo(px - S * 0.3, py + S * 1.2); ctx.lineTo(px + S * 1.7, py - S * 1.3); ctx.stroke(); } }
        if (working) { rr(ctx, cx - 19 * S, Y(86.8), 15 * S, 1.3 * S, S * 0.4, '#bba97f', false); rr(ctx, cx - 19 * S, Y(86.8), 15 * S * (e.prog / 2200), 1.3 * S, S * 0.4, boosted ? '#ff9a3a' : '#2f9a58', false); }
        giftBox(ctx, cx + 1.2 * S, Y(83.4), S * 2.1, '#d8343c'); ctx.fillStyle = '#f4ead0'; ctx.font = '800 ' + Math.round(S * 3.1) + 'px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillText('' + e.gifts, cx + 4.2 * S, Y(84.7));
        const bx = cx + 14.5 * S, by = Y(83.4), ready = e.cool === 0 && !strike; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = S * 0.3; ctx.beginPath(); ctx.arc(bx, by, S * 4.4, 0, TAU); ctx.fillStyle = ready ? lin(ctx, Y(79), Y(88), '#ffe38a', '#d8a22a') : '#5a4a30'; ctx.fill(); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = S * 0.5; ctx.beginPath(); ctx.arc(bx, by, S * 3.8, 0, TAU); ctx.stroke();
        ctx.fillStyle = ready ? '#3a2606' : '#241a0c'; ctx.beginPath(); ctx.arc(bx - S * 0.5, by + S * 0.3, S * 1.4, 0, TAU); ctx.fill(); ctx.fillRect(bx - S * 0.2, by - S * 1.9, S * 2.4, S * 1.1); ctx.fillStyle = '#ffffffaa'; ctx.beginPath(); ctx.arc(bx + S * 0.1, by + S * 0.3, S * 0.4, 0, TAU); ctx.fill();
        if (strike) { ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(S * 2.3) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(Math.ceil(e.strike / E.TPS) + ' s', bx, by + S * 0.8); }
        // thermomètre de stress
        const tx = cx + (i ? 28 : -28) * S, ty0 = Y(52), th = 24 * S; rr(ctx, tx - 2 * S, ty0, 4 * S, th, S * 2, '#150b06', true); const fh = Math.max(S * 2.4, th * st01), gr = ctx.createLinearGradient(0, ty0 + th, 0, ty0); gr.addColorStop(0, '#5fd38d'); gr.addColorStop(0.6, '#ffd34d'); gr.addColorStop(1, '#ff4a3a'); ctx.fillStyle = gr; rr(ctx, tx - 1.3 * S, ty0 + th - fh, 2.6 * S, fh, S * 1.3, gr, false); ctx.fillStyle = st01 > 0.7 ? '#ff4a3a' : '#5fd38d'; ctx.beginPath(); ctx.arc(tx, ty0 + th + S * 1.4, S * 2.6, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f4ead0'; ctx.font = '700 ' + Math.round(S * 1.6) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('STRESS', tx, ty0 - S * 1);
        if (st01 > 0.72 && !strike) { ctx.strokeStyle = 'rgba(255,74,58,' + (0.5 + 0.5 * Math.sin(t * 14)) + ')'; ctx.lineWidth = S * 0.5; rr(ctx, tx - 3.4 * S, ty0 - 2.5 * S, 6.8 * S, th + 7 * S, S * 2, false, true); }
        // sifflet : onde de choc, sueur, vapeur
        if (f.whistle > 0) { ctx.strokeStyle = 'rgba(255,241,199,' + f.whistle * 1.7 + ')'; ctx.lineWidth = S * 0.55; ctx.beginPath(); ctx.arc(cx, Y(57), S * (9 + (0.5 - f.whistle) * 26), 0, TAU); ctx.stroke(); }
        if (e.stress > 500 && !strike) for (let k = 0; k < 2; k++) { const ph = (t * 1.6 + k * 0.5 + i) % 1; ctx.fillStyle = 'rgba(140,210,255,' + (1 - ph) + ')'; ctx.beginPath(); ctx.ellipse(cx + (k ? 9.4 : -9.4) * S, Y(52 + ph * 10), S * 0.75, S * 1.2, 0, 0, TAU); ctx.fill(); }
        if (e.stress > 800 && !strike) for (let k = 0; k < 3; k++) { const ph = (t * 1.2 + k * 0.33) % 1; ctx.fillStyle = 'rgba(235,235,235,' + 0.55 * (1 - ph) + ')'; ctx.beginPath(); ctx.arc(cx + (k - 1) * 4.2 * S, Y(43 - ph * 9), S * (1.2 + ph * 1.2), 0, TAU); ctx.fill(); }
        f.shake = Math.max(0, f.shake - 0.02); f.whistle = Math.max(0, f.whistle - 0.016);
      }
      const hud = (T) => {
        const U = dpr, g = ctx.createLinearGradient(0, 0, 0, 52 * U); g.addColorStop(0, 'rgba(3,10,8,.8)'); g.addColorStop(1, 'rgba(3,10,8,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, 52 * U);
        ctx.textAlign = 'center'; ctx.fillStyle = '#e8c35a'; ctx.font = '700 ' + 11 * U + 'px Georgia, serif'; ctx.fillText('POSTE ' + n, cv.width / 2, 17 * U);
        const bw = Math.min(cv.width * 0.34, 300 * U), bx = cv.width / 2 - bw / 2, rem = Math.max(0, E.DUR - T); rr(ctx, bx, 26 * U, bw, 8 * U, 4 * U, '#ffffff22', false); rr(ctx, bx, 26 * U, bw * rem / E.DUR, 8 * U, 4 * U, rem < 150 ? '#ff6a5a' : '#e8c35a', false);
        ctx.fillStyle = '#fff1c7'; ctx.font = '700 ' + 11 * U + 'px system-ui, sans-serif'; ctx.fillText(Math.ceil(rem / E.TPS) + ' s', cv.width / 2, 47 * U);
        ctx.textAlign = 'right'; ctx.fillStyle = '#e8c35a'; ctx.font = '700 ' + 9.5 * U + 'px system-ui, sans-serif'; ctx.fillText('POINTS', cv.width - 16 * U, 12 * U); ctx.fillStyle = '#fff1c7'; ctx.shadowColor = '#e8c35a88'; ctx.shadowBlur = 10 * U; ctx.font = '800 ' + 25 * U + 'px Georgia, serif'; ctx.fillText(String(E.score(st)), cv.width - 16 * U, 40 * U); ctx.shadowBlur = 0;
      };

      function frame(now) {
        raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
        // compte à rebours puis cadence fixe de 10 ticks par seconde
        const left = startAt - now; if (left > 0) { const c = Math.ceil(left / 1000); if (c !== lastCount) { lastCount = c; SFX.tick(); } } else if (!ended) {
          if (lastCount !== 0) { lastCount = 0; SFX.go(); }
          acc += dt * E.TPS; while (acc >= 1 && !ended) { acc -= 1; const T = st.tick, acts = []; for (let k = pending.length - 1; k >= 0; k--) if (pending[k][0] <= T) { acts.unshift([pending[k][1], pending[k][2]]); pending.splice(k, 1); } handle(E.step(st, lv, acts)); if (!warned && st.elves.some(e => e.stress > 800)) { warned = true; say('warn', true); } if (st.tick >= E.DUR) { ended = true; setTimeout(submit, 900); } }
        }
        if (helpT > 0 && left <= 0) helpT -= dt;
        // dessin
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); if (!bg) buildBg(); drawScene(); drawBelt(st.tick);
        for (const b of bins) { b.t += dt; const bx = X(PART_X1 + 6), by = Y(BELT_Y + 2 + b.t * 30 * (b.t * 0.7)); ctx.globalAlpha = clamp(1 - b.t * 1.4, 0, 1); icon(ctx, b.type, bx, by, S * 3.2, { rot: b.t * 5 }); ctx.globalAlpha = 1; } for (let i = bins.length - 1; i >= 0; i--) if (bins[i].t > 0.8) bins.splice(i, 1);
        drawElf(0, st.tick); drawElf(1, st.tick);
        for (const f of flying) { f.t += dt * 4.5; const u = clamp(f.t, 0, 1), px = f.x + (f.tx - f.x) * u, py = f.y + (f.ty - f.y) * u - Math.sin(u * Math.PI) * 8; ctx.globalAlpha = 1 - u * 0.4; icon(ctx, f.type, X(px), Y(py), S * 3.4 * (1 - u * 0.5), { rot: u * 6 }); ctx.globalAlpha = 1; } for (let i = flying.length - 1; i >= 0; i--) if (flying[i].t >= 1) flying.splice(i, 1);
        for (const p of fx) { p.life -= dt; p.vy += 40 * dt; p.x += p.vx * dt; p.y += p.vy * dt; ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col; ctx.fillRect(X(p.x), Y(p.y), S * 0.6 * p.s, S * 0.6 * p.s); ctx.globalAlpha = 1; } for (let i = fx.length - 1; i >= 0; i--) if (fx[i].life <= 0) fx.splice(i, 1);
        for (const p of pops) { p.t += dt; const a = clamp(1.3 - p.t, 0, 1), fs = Math.round(S * 3.4); ctx.globalAlpha = a; ctx.font = '800 ' + fs + 'px Georgia, serif'; ctx.textAlign = 'center'; ctx.lineWidth = fs * 0.2; ctx.strokeStyle = '#1a0e08'; ctx.strokeText(p.text, X(p.x), Y(p.y - p.t * 7)); ctx.fillStyle = p.col; ctx.fillText(p.text, X(p.x), Y(p.y - p.t * 7)); ctx.globalAlpha = 1; } for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 1.3) pops.splice(i, 1);
        if (bg && bg.vig) { ctx.fillStyle = bg.vig; ctx.fillRect(0, 0, cv.width, cv.height); }
        hud(st.tick);
        if (cap) { cap.t += dt; if (cap.t > cap.max) cap = null; else { const fs = Math.max(12, Math.round(dpr * 13)), a = clamp(cap.t * 6, 0, 1) * clamp((cap.max - cap.t) * 3, 0, 1); ctx.font = '600 ' + fs + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; const tw = Math.min(ctx.measureText(cap.text).width + fs * 2, cv.width - 20 * dpr); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(8,20,14,.85)'; ctx.strokeStyle = '#e8c35a55'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.roundRect(cv.width / 2 - tw / 2, 58 * dpr, tw, fs * 2, fs); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f4ead0'; ctx.fillText(cap.text, cv.width / 2, 58 * dpr + fs * 1.35); ctx.globalAlpha = 1; } }
        if (left > 0) { const c = Math.ceil(left / 1000), fr = (left % 1000) / 1000, fs = Math.round(S * 16 * (0.8 + fr * 0.3)); ctx.globalAlpha = 0.4 + fr * 0.6; ctx.font = '800 ' + fs + 'px Georgia, serif'; ctx.textAlign = 'center'; ctx.lineWidth = fs * 0.08; ctx.strokeStyle = '#1a0e08'; ctx.strokeText(String(c), cv.width / 2, cv.height * 0.58); ctx.fillStyle = '#ffd34d'; ctx.fillText(String(c), cv.width / 2, cv.height * 0.58); ctx.globalAlpha = 1; ctx.font = '700 ' + Math.round(S * 3) + 'px system-ui, sans-serif'; ctx.fillStyle = '#fff1c7'; ctx.fillText('Touche les pièces du tapis. Touche un lutin pour siffler.', cv.width / 2, cv.height * 0.72); }
        else if (helpT > 0 && st.tick < 90) { ctx.globalAlpha = clamp(helpT, 0, 1) * 0.9; ctx.font = '700 ' + Math.round(S * 2.6) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff1c7'; ctx.fillText('Pièce attendue : touche-la. Lutin : touche-le pour siffler.', cv.width / 2, Y(BELT_Y + 20)); ctx.globalAlpha = 1; }
        if (ended) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.font = '800 ' + Math.round(S * 8) + 'px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd34d'; ctx.fillText('FIN DU POSTE', cv.width / 2, cv.height * 0.52); }
      }
      cur = { st, lv, inputs, rotated: () => rotated, partScreen: id => { const p = lv.parts[id], [px, py] = partPos(p, acc), b = pl.getBoundingClientRect(), lx = (X(px)) / dpr, ly = (Y(py)) / dpr; return rotated ? [b.right - ly, b.top + lx] : [b.left + lx, b.top + ly]; }, elfScreen: i => { const b = pl.getBoundingClientRect(), lx = X(ELF_X[i]) / dpr, ly = Y(60) / dpr; return rotated ? [b.right - ly, b.top + lx] : [b.left + lx, b.top + ly]; } };

      async function submit() {
        cancelAnimationFrame(raf); cleanup(); cleanup = () => {};
        const render = (r, err) => {
          ov.className = 'sg-ov'; ov.style.cssText = '';
          if (err) { ov.innerHTML = `<div class="sg-card"><div class="sg-kick">PÔLE NORD S.A.</div><p class="sg-brief">Le serveur n'a pas reçu ton rapport : ${esc(err)}</p><button class="sg-btn" id="sg-retry">Réessayer l'envoi</button></div>`; ov.querySelector('#sg-retry').onclick = send; return; }
          const stN = stars(r.score), left = r.tries - r.used; SFX.win();
          ov.innerHTML = `<div class="sg-card"><div class="sg-kick">PÔLE NORD S.A. · BILAN DE PRODUCTION</div>
            <div class="sg-stars">${[0, 1, 2].map(i => `<span style="--d:${0.25 + i * 0.25}s">${starSvg(i < stN, 44)}</span>`).join('')}</div>
            <div class="sg-score" id="sg-sc">0</div><p class="sg-brief">${esc(verdict(r.score, stN))}</p>
            <div class="sg-stats"><span><b>${r.gifts}</b> cadeaux</span><span><b>${r.lost}</b> pièce${r.lost > 1 ? 's' : ''} perdue${r.lost > 1 ? 's' : ''}</span><span><b>+${Math.max(0, r.gained)}</b> flocons</span><span>Meilleur <b>${r.best}</b></span></div>
            <p class="sg-note">${r.gained > 0 ? 'Le Père Noël paie la différence avec ta meilleure partie, pas plus.' : 'Pas de progrès, pas de prime. Le Père Noël n\'est pas une œuvre de charité.'} Total : ${r.flocons} flocons.</p>
            ${left > 0 ? `<button class="sg-btn" id="sg-again">Rejouer (${left} essai${left > 1 ? 's' : ''})</button>` : ''}<button class="sg-btn ghost" id="sg-quit">Retour au calendrier</button></div>`;
          const num = ov.querySelector('#sg-sc'), t0 = performance.now(); const up = now => { const k = clamp((now - t0) / 1100, 0, 1); num.textContent = Math.round(r.score * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(up); }; raf = requestAnimationFrame(up);
          ov.querySelector('#sg-quit').onclick = close; const again = ov.querySelector('#sg-again'); if (again) again.onclick = () => intro(r);
        };
        const send = async () => { try { render(await api('/noel/atel/submit', { n, a: attempt, inputs, ...(day ? { day } : {}) })); } catch (e) { render(null, e.message); } };
        await send();
      }
      raf = requestAnimationFrame(frame);
    }
    intro(info); return { close };
  }
  window.ElfGame = { open, get cur() { return cur; } };
})();
