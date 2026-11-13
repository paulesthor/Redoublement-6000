// Tir au patron : le jeu de boules de neige de Noël (canvas). La physique vient de snowphys.js, la même que sur le serveur :
// le téléphone anime et envoie seulement les vecteurs de tir ; le score officiel est celui que le serveur rejoue.
(function () {
  'use strict';
  const P = window.SnowPhys, COL = { sky1: '#07160f', sky2: '#14392a', snow: '#eef3ee', ice: '#9fd0e0', gold: '#e8c35a', red: '#b3202a', txt: '#f4ead0' };
  const HIT = {
    inspecteur: ['Rapport de harcèlement déposé. Contre la boule de neige.', 'L\'inspecteur du travail vacille et note votre matricule.'],
    delegue: ['« Je vais en parler au syndicat. » Le syndicat est en pause.', 'Le délégué proteste. Personne ne l\'écoute, comme d\'habitude.'],
    renne: ['« Je suis en burn-out ET touché. »', 'Le renne soupire. C\'est son quatrième arrêt maladie de la semaine.'],
    comptable: ['« Ce n\'est pas dans le budget. » Il est à terre, le budget aussi.', 'Le comptable recompte ses dents.'],
    pere: ['Ho ho ho... Il note votre nom dans la colonne du bas.', 'Le Père Noël encaisse. La barbe amortit.', '« Ho ho ho... Vous êtes viré. » Il n\'a pas bien compris le principe.'],
  };
  const MISS = { ground: 'Dans la neige. Le patron vous voit gaspiller le stock.', wall: 'Le mur du comité d\'entreprise a tenu bon. C\'est son seul exploit.', out: 'Parti vers l\'Alaska. Le matériel ne sera pas remboursé.', time: 'La boule s\'est perdue. Comme votre carrière.' };
  const pick = (a, i) => a[i % a.length];
  const verdict = (score, all) => all ? 'Tableau nettoyé. Les ressources humaines préparent déjà un entretien avec vous.' : score <= 0 ? 'Aucune cible. Le Père Noël vous garde, pour l\'instant.' : score < 200 ? 'Performance insuffisante. L\'évaluation annuelle sera conviviale.' : score < 500 ? 'Acceptable. C\'est la pire note que le patron ose écrire.' : 'Excellent. La direction a décidé de vous surveiller de plus près.';
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Ouvre le jeu. opts = { n, day, api(path, body), toast(msg), onClose() } */
  async function open(opts) {
    const { n, day, api } = opts, q = '?n=' + n + (day !== undefined && day !== null && day !== '' ? '&day=' + day : '');
    const info = await api('/noel/snow' + q);
    const ov = el('div', 'sg-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Tir au patron, niveau ' + n);
    document.body.append(ov); document.body.classList.add('sg-lock');
    const close = () => { cancelAnimationFrame(raf); ov.remove(); document.body.classList.remove('sg-lock'); opts.onClose && opts.onClose(); };
    let raf = 0;

    const intro = (inf) => {
      const left = inf.tries - inf.used;
      ov.innerHTML = `<div class="sg-panel"><small class="nl-kick">PÔLE NORD S.A. · TIR AU PATRON</small><div class="nl-bignum">${inf.n}</div>
        <p class="nl-text">Cinq boules, ${inf.level.targets.length} cibles, un vent que le service météo refuse de commenter. Tirez en arrière puis relâchez : plus vous reculez, plus la boule part fort.</p>
        <div class="nl-chips"><span><b>${left}</b> essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}</span><span>Meilleur : <b>${inf.best}</b></span><span><b>${inf.flocons}</b> flocons</span></div>
        <p class="mut" style="font-size:12px;margin:0 0 14px">Seule ta meilleure partie du jour compte : le Père Noël ne paie que les progrès (jusqu'à ${inf.max} flocons).</p>
        <button class="ic-go" id="sg-go" style="width:100%" ${left > 0 ? '' : 'disabled'}>${left > 0 ? 'Prendre le poste' : 'Plus d\'essai aujourd\'hui'}</button>
        <button class="ic-go sg-ghost" id="sg-quit" style="width:100%;margin-top:8px">Retour au calendrier</button></div>`;
      ov.querySelector('#sg-quit').onclick = close;
      const go = ov.querySelector('#sg-go'); go.onclick = async () => { go.disabled = true; try { const r = await api('/noel/snow/start', { n, ...(day ? { day } : {}) }); play(r.attempt, r); } catch (e) { opts.toast && opts.toast(e.message); go.disabled = false; } };
    };

    function play(attempt, inf) {
      const lv = P.level(n);
      ov.innerHTML = `<div class="sg-top"><button class="sg-x" id="sg-x" aria-label="Quitter">Quitter</button><div class="sg-hud"><span id="sg-balls"></span><span id="sg-wind"></span><span id="sg-score">0</span></div></div>
        <div class="sg-wrap"><canvas id="sg-c"></canvas></div><p class="sg-msg" id="sg-msg">Tire en arrière, puis relâche.</p><p class="sg-tip">Astuce : en paysage, le terrain est plus grand. Les cibles, elles, ne grandissent pas.</p>`;
      const cv = ov.querySelector('#sg-c'), ctx = cv.getContext('2d'), msg = ov.querySelector('#sg-msg');
      const state = { hp: lv.targets.map(t => t.hp) }, vis = { hp: lv.targets.slice().map(t => t.hp), shake: lv.targets.map(() => 0) };
      const throws = []; let aim = null, fly = null, flash = [], score = 0, streak = 0, ended = false, S = 1, ox = 0, oy = 0;
      const GROUND = 6;      // bande de neige sous le sol (unités du monde)
      const fit = () => { const w = Math.min(ov.clientWidth, 720, Math.max(240, (window.innerHeight - 150) * P.W / (P.H + GROUND))), dpr = Math.min(2, window.devicePixelRatio || 1), h = w * (P.H + GROUND) / P.W; cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); S = cv.width / P.W; oy = cv.height - GROUND * S; };
      fit(); const onRes = () => fit(); window.addEventListener('resize', onRes);
      const X = x => x * S, Y = y => oy - y * S;
      const ballsLeft = () => lv.balls - throws.length;
      const hud = () => { ov.querySelector('#sg-balls').textContent = 'Boules : ' + ballsLeft(); const wv = lv.wind[Math.min(throws.length, lv.balls - 1)]; ov.querySelector('#sg-wind').textContent = 'Vent ' + (wv === 0 ? 'nul' : (wv > 0 ? '→ ' : '← ') + Math.abs(wv).toFixed(1)); ov.querySelector('#sg-score').textContent = score + ' pts'; };

      const person = (t, i) => {   // personnages dessinés au vecteur, un accessoire par métier
        const hp = vis.hp[i], x = X(t.x) + (vis.shake[i] > 0 ? Math.sin(vis.shake[i] * 2) * 3 : 0), y = Y(t.y), r = t.r * S;
        if (t.plat) { ctx.fillStyle = COL.ice; ctx.fillRect(X(t.x - t.r - 2), Y(t.plat), (t.r + 2) * 2 * S, t.plat * S); ctx.fillStyle = '#ffffff55'; ctx.fillRect(X(t.x - t.r - 2), Y(t.plat), (t.r + 2) * 2 * S, 2 * S); }
        if (hp <= 0) { ctx.fillStyle = '#ffffffaa'; ctx.beginPath(); ctx.ellipse(x, Y(0 + t.plat) - 1, r * 1.1, r * 0.25, 0, 0, 7); ctx.fill(); return; }
        const body = { inspecteur: '#3b4a5c', delegue: '#a02c34', renne: '#7a5230', comptable: '#58603a', pere: '#c42a33' }[t.type];
        ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.fillStyle = '#f1d3b4'; ctx.beginPath(); ctx.arc(x, y - r * 0.25, r * 0.55, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.3, r * 0.07, 0, 7); ctx.arc(x + r * 0.2, y - r * 0.3, r * 0.07, 0, 7); ctx.fill();
        ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, r * 0.06); ctx.beginPath();
        if (t.type === 'inspecteur') { ctx.fillStyle = '#1a2230'; ctx.fillRect(x - r * 0.7, y - r * 0.95, r * 1.4, r * 0.3); ctx.fillRect(x - r * 0.45, y - r * 1.35, r * 0.9, r * 0.45); ctx.fillStyle = '#fff'; ctx.fillRect(x + r * 0.35, y, r * 0.55, r * 0.7); }
        if (t.type === 'delegue') { ctx.fillStyle = '#ffd34d'; ctx.fillRect(x - r * 0.6, y + r * 0.05, r * 1.2, r * 0.22); ctx.beginPath(); ctx.moveTo(x - r * 0.4, y - r * 0.7); ctx.lineTo(x, y - r * 1.3); ctx.lineTo(x + r * 0.4, y - r * 0.7); ctx.fillStyle = '#ffd34d'; ctx.fill(); }
        if (t.type === 'renne') { ctx.strokeStyle = '#4a3320'; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.beginPath(); ctx.moveTo(x - r * 0.35, y - r * 0.7); ctx.lineTo(x - r * 0.7, y - r * 1.4); ctx.moveTo(x - r * 0.55, y - r * 1.05); ctx.lineTo(x - r * 0.95, y - r * 1.1); ctx.moveTo(x + r * 0.35, y - r * 0.7); ctx.lineTo(x + r * 0.7, y - r * 1.4); ctx.moveTo(x + r * 0.55, y - r * 1.05); ctx.lineTo(x + r * 0.95, y - r * 1.1); ctx.stroke(); ctx.fillStyle = '#c42a33'; ctx.beginPath(); ctx.arc(x, y - r * 0.05, r * 0.14, 0, 7); ctx.fill(); ctx.fillStyle = '#00000044'; ctx.fillRect(x - r * 0.35, y - r * 0.42, r * 0.28, r * 0.07); ctx.fillRect(x + r * 0.07, y - r * 0.42, r * 0.28, r * 0.07); }
        if (t.type === 'comptable') { ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, r * 0.07); ctx.strokeRect(x - r * 0.38, y - r * 0.42, r * 0.3, r * 0.22); ctx.strokeRect(x + r * 0.08, y - r * 0.42, r * 0.3, r * 0.22); ctx.fillStyle = '#e8e8d0'; ctx.fillRect(x - r * 0.5, y + r * 0.1, r * 1.0, r * 0.6); }
        if (t.type === 'pere') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 0.55, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#c42a33'; ctx.beginPath(); ctx.moveTo(x - r * 0.6, y - r * 0.55); ctx.lineTo(x, y - r * 1.5); ctx.lineTo(x + r * 0.6, y - r * 0.55); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x - r * 0.68, y - r * 0.62, r * 1.36, r * 0.18); ctx.fillStyle = '#e8c35a'; ctx.fillRect(x - r * 0.5, y + r * 0.55, r * 1.0, r * 0.14);
          for (let k = 0; k < t.hp; k++) { ctx.fillStyle = k < hp ? '#ffd34d' : '#ffffff33'; ctx.fillRect(x - r + k * (r * 0.7), y - r * 1.8, r * 0.6, r * 0.18); } }
        ctx.stroke();
      };

      const draw = () => {
        const g = ctx.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, COL.sky1); g.addColorStop(1, COL.sky2); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#ffffff22'; for (let i = 0; i < 40; i++) { const sx = (i * 97 % 160) * S, sy = (i * 53 % 90) * S * 0.9; ctx.fillRect(sx, sy, S * 0.4, S * 0.4); }
        ctx.fillStyle = COL.snow; ctx.fillRect(0, oy, cv.width, cv.height - oy);
        lv.walls.forEach(w => { ctx.fillStyle = COL.ice; ctx.fillRect(X(w.x), Y(w.y + w.h), w.w * S, w.h * S); ctx.fillStyle = '#ffffff66'; ctx.fillRect(X(w.x), Y(w.y + w.h), w.w * S, 1.5 * S); });
        lv.targets.forEach((t, i) => { person(t, i); if (vis.shake[i] > 0) vis.shake[i] -= 1; });
        // lanceur (élastique et boule à venir)
        const lx = X(P.LAUNCH.x), ly = Y(P.LAUNCH.y);
        ctx.fillStyle = '#5a3a22'; ctx.fillRect(lx - S * 0.8, ly, S * 1.6, oy - ly); ctx.fillRect(lx - S * 2.8, ly - S * 1.5, S * 1.2, S * 3.2); ctx.fillRect(lx + S * 1.6, ly - S * 1.5, S * 1.2, S * 3.2);
        if (aim) {   // élastique et trajectoire du tout début (le reste, il faut le deviner)
          ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = S * 0.5; ctx.beginPath(); ctx.moveTo(lx - S * 2.2, ly - S); ctx.lineTo(X(aim.bx), Y(aim.by)); ctx.lineTo(lx + S * 2.2, ly - S); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(aim.bx), Y(aim.by), P.BALL * S, 0, 7); ctx.fill();
          const pv = P.throwBall(lv, { hp: vis.hp.slice() }, throws.length, aim.px, aim.py).path.slice(0, 13);
          pv.forEach((p, i) => { ctx.fillStyle = 'rgba(244,234,208,' + (0.9 - i * 0.065) + ')'; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), S * 0.45, 0, 7); ctx.fill(); });
        } else if (!fly && !ended) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx, ly - S, P.BALL * S, 0, 7); ctx.fill(); }
        if (fly) { const f = Math.min(fly.i | 0, fly.path.length - 1), p = fly.path[f]; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#9fd0e0'; ctx.lineWidth = S * 0.2; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), P.BALL * S * 1.15, 0, 7); ctx.fill(); ctx.stroke(); }
        flash = flash.filter(fl => fl.t > 0); flash.forEach(fl => { ctx.fillStyle = 'rgba(255,255,255,' + fl.t / 14 + ')'; for (let k = 0; k < 8; k++) { const a = k * 0.785 + fl.t * 0.1, d = (14 - fl.t) * S * 0.45; ctx.beginPath(); ctx.arc(X(fl.x) + Math.cos(a) * d, Y(fl.y) + Math.sin(a) * d, S * 0.55, 0, 7); ctx.fill(); } fl.t -= 1; });
      };

      const finishBall = () => {
        const f = fly; fly = null; const r = f.r;
        if (r.hit !== null) { const t = lv.targets[r.hit]; vis.hp[r.hit] -= 1; vis.shake[r.hit] = 14; streak++; const pts = r.down ? Math.round(t.pts * (1 + 0.2 * (streak - 1))) : 0; score += pts; flash.push({ x: t.x, y: t.y, t: 14 });
          msg.textContent = (r.down ? pick(HIT[t.type], t.type === 'pere' ? 2 : f.k) : pick(HIT[t.type], 1)) + (pts ? '  +' + pts : ''); msg.className = 'sg-msg good'; }
        else { streak = 0; msg.textContent = MISS[r.end] || MISS.time; msg.className = 'sg-msg'; }
        hud();
        if (!ballsLeft() || vis.hp.every(h => h <= 0)) { ended = true; setTimeout(submit, 700); }
      };
      const tick = () => { raf = requestAnimationFrame(tick); if (fly) { fly.i += 1.5; if (fly.i >= fly.path.length - 1) finishBall(); } draw(); };

      const wpos = e => { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * P.W, y: (b.bottom - e.clientY) / b.height * (P.H + GROUND) - GROUND }; };
      const vec = w => { const dx = P.LAUNCH.x - w.x, dy = P.LAUNCH.y - w.y; let px = Math.round(dx * 1.6), py = Math.round(dy * 1.6); const len = Math.sqrt(px * px + py * py); if (len > P.PMAX) { px = Math.round(px * P.PMAX / len); py = Math.round(py * P.PMAX / len); } return { px, py, bx: P.LAUNCH.x - px / 1.6 * Math.min(1, 1), by: P.LAUNCH.y - py / 1.6 }; };
      cv.addEventListener('pointerdown', e => { if (fly || ended) return; cv.setPointerCapture(e.pointerId); aim = vec(wpos(e)); });
      cv.addEventListener('pointermove', e => { if (aim) aim = vec(wpos(e)); });
      const release = () => { if (!aim) return; const a = aim; aim = null; if (Math.hypot(a.px, a.py) < 12 || fly || ended) { msg.textContent = 'Trop mou. Le Père Noël a vu mieux, chez les lutins.'; return; }
        const k = throws.length, r = P.throwBall(lv, state, k, a.px, a.py); throws.push([a.px, a.py]); fly = { path: r.path, r, i: 0, k }; hud(); };
      cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', () => { aim = null; });
      ov.querySelector('#sg-x').onclick = () => { if (ended || confirm('Quitter ? Cet essai est déjà décompté : le Père Noël ne rembourse pas.')) { window.removeEventListener('resize', onRes); close(); } };

      async function submit() {
        const render = (r, err) => {
          window.removeEventListener('resize', onRes); cancelAnimationFrame(raf);
          if (err) { ov.innerHTML = `<div class="sg-panel"><small class="nl-kick">PÔLE NORD S.A.</small><p class="nl-text">Le serveur n'a pas reçu ton rapport : ${esc(err)}</p><button class="ic-go" id="sg-retry" style="width:100%">Réessayer l'envoi</button></div>`; ov.querySelector('#sg-retry').onclick = send; return; }
          ov.innerHTML = `<div class="sg-panel"><small class="nl-kick">PÔLE NORD S.A. · BILAN DE PERFORMANCE</small><div class="nl-bignum">${r.score}</div>
            <p class="nl-text">${esc(verdict(r.score, r.all))}</p>
            <div class="nl-chips"><span><b>+${Math.max(0, r.gained)}</b> flocons</span><span>Meilleur : <b>${r.best}</b></span>${r.bonus ? `<span>Boules économisées : <b>+${r.bonus}</b></span>` : ''}</div>
            <p class="mut" style="font-size:12px;margin:0 0 14px">${r.gained > 0 ? 'Le Père Noël paie la différence avec ta meilleure partie, pas plus.' : 'Pas de progrès, pas de prime. Le Père Noël n\'est pas une œuvre de charité.'} Total : ${r.flocons} flocons.</p>
            ${r.tries - r.used > 0 ? `<button class="ic-go" id="sg-again" style="width:100%">Rejouer (${r.tries - r.used} essai${r.tries - r.used > 1 ? 's' : ''})</button>` : ''}
            <button class="ic-go sg-ghost" id="sg-quit" style="width:100%;margin-top:8px">Retour au calendrier</button></div>`;
          ov.querySelector('#sg-quit').onclick = close; const again = ov.querySelector('#sg-again'); if (again) again.onclick = () => intro(r);
        };
        const send = async () => { try { render(await api('/noel/snow/submit', { n, a: attempt, throws, ...(day ? { day } : {}) })); } catch (e) { render(null, e.message); } };
        await send();
      }
      hud(); tick();
    }
    intro(info);
    return { close };
  }
  window.SnowGame = { open };
})();
