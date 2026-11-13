// Tir au patron : le jeu de boules de neige de Noël (canvas, tout est dessiné par le code).
// La physique vient de snowphys.js, la même que sur le serveur : le téléphone anime et envoie seulement les vecteurs de tir ;
// le score officiel est celui que le serveur rejoue. L'écran de jeu est en paysage : en portrait il pivote tout seul.
(function () {
  'use strict';
  const P = window.SnowPhys, TAU = Math.PI * 2;
  const GROUND_F = 0.86, VIS = 64, PULL = 0.2, SPEED = 1.25, SAMPLE_HZ = 30;   // sol à 86 % de la hauteur, 64 unités visibles au-dessus, recul visuel, vitesse de lecture
  const OUT = '#0e1519';
  if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = (a, b) => a + Math.random() * (b - a), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };

  // ───────────── textes (humour noir d'entreprise) ─────────────
  const HIT = {
    inspecteur: ['Rapport de harcèlement déposé. Contre la boule de neige.', 'L\'inspecteur du travail vacille et note votre matricule.'],
    delegue: ['« Je vais en parler au syndicat. » Le syndicat est en pause.', 'Le délégué proteste. Personne n\'écoute, comme d\'habitude.'],
    renne: ['« Je suis en burn-out ET touché. »', 'Le renne soupire : son quatrième arrêt maladie de la semaine.'],
    comptable: ['« Ce n\'est pas dans le budget. » Il est à terre, le budget aussi.', 'Le comptable recompte ses dents.'],
    pere: ['Ho ho ho... Il note votre nom dans la colonne du bas.', 'Le Père Noël encaisse. La barbe amortit.', '« Ho ho ho... Vous êtes viré. » Il n\'a pas bien compris le principe.'],
  };
  const MISS = { ground: 'Dans la neige. Le patron vous voit gaspiller le stock.', wall: 'Le mur du comité d\'entreprise a tenu bon. C\'est son seul exploit.', out: 'Parti vers l\'Alaska. Le matériel ne sera pas remboursé.', time: 'La boule s\'est perdue. Comme votre carrière.' };
  const BRIEF = [
    'Mission : réduire les effectifs. À la boule de neige, par souci d\'économies.', 'Le service des ressources humaines a besoin d\'un volontaire. Il a désigné vos bras.', 'Cible du jour : ceux qui disent « c\'est pas mon rôle ». Tirez sans état d\'âme.',
    'L\'inspection du travail est dans les locaux. Elle n\'en ressortira pas indemne. Ni vous.', 'Aujourd\'hui, la direction offre le matériel : de la neige. Elle ne le rembourse pas non plus.', 'Le comité d\'entreprise a posé un mur. Contournez-le, comme tout le reste.',
    'Objectif : vingt pour cent de productivité en plus. Pour la neige, on repassera.', 'Le vent souffle depuis la direction. Il est de mauvaise foi, comme elle.', 'Séance de team building : une boule, un collègue. Pas de blessure déclarée.',
    'Les rennes sont en arrêt maladie. Les cibles sont donc tout ce qui reste.', 'Rappel : tout tir manqué sera déduit de votre prime. Il n\'y a pas de prime.', 'Le Père Noël a une réunion. Il vous demande de ne pas l\'interrompre. À la boule de neige.',
  ];
  const BOSS_BRIEF = 'Le Père Noël a fermé l\'atelier « pour raisons stratégiques ». Il est temps de lui rendre la politesse.';
  const NAMES = { inspecteur: 'Inspecteur du travail', delegue: 'Délégué syndical', renne: 'Renne en burn-out', comptable: 'Comptable', pere: 'Le Père Noël' };
  const verdict = (score, all, max) => all ? 'Tableau nettoyé. Les ressources humaines préparent déjà un entretien avec vous.' : score <= 0 ? 'Aucune cible. Le Père Noël vous garde, pour l\'instant.' : score < max * 0.35 ? 'Performance insuffisante. L\'évaluation annuelle sera conviviale.' : score < max * 0.7 ? 'Acceptable. C\'est la pire note que le patron ose écrire.' : 'Excellent. La direction a décidé de vous surveiller de plus près.';
  const stars = (score, all, max) => all ? 3 : score >= max * 0.6 ? 2 : score >= max * 0.25 ? 1 : 0;
  const maxOf = lv => lv.targets.reduce((a, t) => a + t.pts, 0);

  // ───────────── sons (synthétisés, aucun fichier) ─────────────
  let AC = null;
  const sndOn = () => { try { return localStorage.getItem('wm_sound') !== '0'; } catch { return true; } };
  const ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* pas de son */ } } if (AC && AC.state === 'suspended') AC.resume().catch(() => {}); return AC; };
  const tone = (f0, f1, dur, type, vol, delay = 0) => { if (!sndOn()) return; const a = ac(); if (!a) return; const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03); };
  const noise = (dur, f0, f1, vol, delay = 0) => { if (!sndOn()) return; const a = ac(); if (!a) return; const t = a.currentTime + delay, n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = a.createBufferSource(); s.buffer = b; const fl = a.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); const g = a.createGain(); g.gain.value = vol; s.connect(fl); fl.connect(g); g.connect(a.destination); s.start(t); };
  const SFX = {
    stretch: () => tone(180, 260, 0.08, 'triangle', 0.05),
    throw: () => { noise(0.28, 500, 2400, 0.22); tone(320, 110, 0.14, 'triangle', 0.1); },
    hit: () => { tone(190, 55, 0.2, 'sine', 0.4); noise(0.09, 1800, 800, 0.22); },
    down: () => { tone(660, 990, 0.12, 'triangle', 0.15, 0.04); tone(990, 1320, 0.16, 'triangle', 0.12, 0.12); },
    ice: () => { noise(0.18, 4200, 1400, 0.3); tone(900, 300, 0.1, 'square', 0.05); },
    miss: () => noise(0.2, 900, 280, 0.12),
    pouf: () => { noise(0.16, 700, 200, 0.18); tone(110, 60, 0.12, 'sine', 0.2); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.17, i * 0.1)),
  };
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* sans importance */ } };

  // ───────────── personnages (dessinés au vecteur, rayon = 1) ─────────────
  const G = (c, y0, y1, a, b) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  const E = (c, x, y, rx, ry, fill, st = true, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (st) c.stroke(); };
  const R = (c, x, y, w, h, r, fill, st = true) => { c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) { c.fillStyle = fill; c.fill(); } if (st) c.stroke(); };
  const star5 = (c, x, y, r, fill) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fillStyle = fill; c.fill(); };
  const poly = (c, pts, fill, st = true) => { c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (st) c.stroke(); };
  const eyes = (c, f, x1, x2, y, r) => {
    for (const x of [x1, x2]) {
      if (f.mood === 'hurt') { c.lineWidth = 0.08; c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke(); c.lineWidth = 0.06; }
      else if (f.blink) { c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.stroke(); }
      else { E(c, x, y, r, r * 1.2, '#fff'); E(c, x + 0.015, y + 0.03, r * 0.5, r * 0.62, '#12181c', false); }
    }
  };
  const mouthOpen = (c, x, y, w, h) => { E(c, x, y, w, h, '#4a1018'); E(c, x, y + h * 0.45, w * 0.6, h * 0.45, '#c8505a', false); };
  const CH = {
    inspecteur(c, f) {
      poly(c, [[-0.86, 1], [-0.8, 0.38], [-0.4, 0.1], [0.4, 0.1], [0.8, 0.38], [0.86, 1]], G(c, 0.1, 1, '#53657f', '#2a3548'));
      poly(c, [[-0.24, 0.1], [0, 0.52], [0.24, 0.1]], '#f4f2ea'); poly(c, [[-0.08, 0.22], [0.08, 0.22], [0.11, 0.82], [0, 0.92], [-0.11, 0.82]], '#a3202b', false);
      star5(c, -0.5, 0.5, 0.15, '#e8c35a');
      R(c, 0.55, 0.28, 0.5, 0.7, 0.05, '#7b5a34'); R(c, 0.6, 0.36, 0.4, 0.58, 0.03, '#f4f2ea', false); c.beginPath(); for (const yy of [0.5, 0.64, 0.78]) { c.moveTo(0.66, yy); c.lineTo(0.92, yy); } c.lineWidth = 0.035; c.stroke(); c.lineWidth = 0.06;
      E(c, -0.55, -0.26, 0.08, 0.13, '#eab98e'); E(c, 0.55, -0.26, 0.08, 0.13, '#eab98e');
      E(c, 0, -0.28, 0.55, 0.54, G(c, -0.8, 0.3, '#f7d9b4', '#e0b488'));
      poly(c, [[-0.62, -0.5], [-0.5, -0.86], [0.5, -0.86], [0.62, -0.5], [0.3, -0.58], [-0.3, -0.58]], '#1c2538'); R(c, -0.38, -0.62, 0.76, 0.12, 0.05, '#0f1522', false); star5(c, 0, -0.74, 0.1, '#e8c35a');
      c.lineWidth = 0.05; for (const x of [-0.22, 0.22]) { c.beginPath(); c.arc(x, -0.26, 0.17, 0, TAU); c.stroke(); } c.beginPath(); c.moveTo(-0.05, -0.26); c.lineTo(0.05, -0.26); c.stroke(); c.lineWidth = 0.06;
      eyes(c, f, -0.22, 0.22, -0.26, 0.08);
      c.beginPath(); c.moveTo(-0.34, -0.42); c.lineTo(-0.1, -0.37); c.moveTo(0.34, -0.42); c.lineTo(0.1, -0.37); c.lineWidth = 0.07; c.stroke(); c.lineWidth = 0.06;
      E(c, 0, -0.04, 0.2, 0.06, '#3b2a22', false);
      if (f.mood === 'hurt') mouthOpen(c, 0, 0.1, 0.11, 0.1); else { c.beginPath(); c.moveTo(-0.12, 0.1); c.lineTo(0.12, 0.1); c.stroke(); }
    },
    delegue(c, f) {
      poly(c, [[-0.84, 1], [-0.78, 0.38], [-0.4, 0.1], [0.4, 0.1], [0.78, 0.38], [0.84, 1]], G(c, 0.1, 1, '#d2404a', '#7d1a22'));
      c.beginPath(); c.moveTo(0, 0.14); c.lineTo(0, 1); c.stroke();
      R(c, -0.84, 0.44, 0.3, 0.16, 0.04, '#f4f2ea', false);
      E(c, 0, -0.28, 0.54, 0.52, G(c, -0.8, 0.3, '#f2cba4', '#d9a87c'));
      c.beginPath(); c.arc(0, -0.5, 0.62, Math.PI, TAU); c.closePath(); c.fillStyle = G(c, -1.1, -0.5, '#ffe07a', '#e8b724'); c.fill(); c.stroke(); R(c, -0.74, -0.52, 1.48, 0.12, 0.05, '#c99a14'); R(c, -0.1, -1.1, 0.2, 0.55, 0.05, '#c99a14', false);
      E(c, 0, -0.78, 0.15, 0.1, '#c8202a', false);
      poly(c, [[0.62, 0.28], [1.3, -0.05], [1.3, 0.6]], '#d9dde0'); R(c, 0.5, 0.32, 0.2, 0.22, 0.04, '#44505a');
      c.beginPath(); c.moveTo(-0.34, -0.44); c.lineTo(-0.08, -0.34); c.moveTo(0.34, -0.44); c.lineTo(0.08, -0.34); c.lineWidth = 0.09; c.stroke(); c.lineWidth = 0.06;
      eyes(c, f, -0.2, 0.2, -0.26, 0.075);
      c.fillStyle = '#6b4a3a55'; c.beginPath(); c.ellipse(0, -0.02, 0.32, 0.18, 0, 0, Math.PI); c.fill();
      mouthOpen(c, 0, 0, f.mood === 'hurt' ? 0.12 : 0.16, 0.14);
    },
    renne(c, f) {
      c.strokeStyle = '#3d2814'; c.lineWidth = 0.1; c.beginPath(); c.moveTo(-0.38, -0.7); c.lineTo(-0.72, -1.25); c.moveTo(-0.55, -1.0); c.lineTo(-0.95, -1.05); c.moveTo(-0.62, -1.12); c.lineTo(-0.7, -1.42); c.moveTo(0.38, -0.7); c.lineTo(0.72, -1.25); c.moveTo(0.55, -1.0); c.lineTo(0.95, -1.05); c.moveTo(0.62, -1.12); c.lineTo(0.7, -1.42); c.stroke(); c.strokeStyle = OUT; c.lineWidth = 0.06;
      poly(c, [[-0.8, 1], [-0.72, 0.4], [-0.4, 0.15], [0.4, 0.15], [0.72, 0.4], [0.8, 1]], G(c, 0.15, 1, '#97663c', '#5e3b1e'));
      E(c, -0.62, -0.5, 0.2, 0.12, '#97663c', true, -0.5); E(c, 0.62, -0.5, 0.2, 0.12, '#97663c', true, 0.5);
      E(c, 0, -0.18, 0.55, 0.66, G(c, -0.85, 0.5, '#b98457', '#946236'));
      E(c, 0, 0.12, 0.34, 0.26, '#e6c9a0'); E(c, 0, 0.0, 0.15, 0.12, '#d9262e'); E(c, -0.03, -0.04, 0.04, 0.03, '#ff9b9b', false);
      const tired = f.mood !== 'hurt';
      if (tired && !f.blink) { for (const x of [-0.22, 0.22]) { E(c, x, -0.3, 0.12, 0.13, '#fff'); E(c, x, -0.26, 0.06, 0.07, '#12181c', false); c.fillStyle = '#946236'; c.beginPath(); c.rect(x - 0.14, -0.45, 0.28, 0.14); c.fill(); c.beginPath(); c.moveTo(x - 0.14, -0.31); c.lineTo(x + 0.14, -0.31); c.stroke(); E(c, x, -0.1, 0.11, 0.05, '#6a4a6a', false); } } else eyes(c, f, -0.22, 0.22, -0.28, 0.08);
      R(c, 0.62, 0.45, 0.34, 0.4, 0.06, '#f4f2ea'); c.beginPath(); c.arc(0.98, 0.65, 0.12, -1.5, 1.5); c.stroke();
      c.lineWidth = 0.05; c.strokeStyle = '#ffffffaa'; const t = f.t || 0; for (let k = 0; k < 2; k++) { c.beginPath(); c.moveTo(0.7 + k * 0.14, 0.4); c.quadraticCurveTo(0.62 + k * 0.14 + Math.sin(t * 3 + k) * 0.07, 0.2, 0.72 + k * 0.14, 0.02); c.stroke(); } c.strokeStyle = OUT; c.lineWidth = 0.06;
      if (f.mood === 'hurt') mouthOpen(c, 0, 0.25, 0.08, 0.08); else { c.beginPath(); c.moveTo(-0.08, 0.28); c.quadraticCurveTo(0, 0.2, 0.08, 0.28); c.stroke(); }
    },
    comptable(c, f) {
      poly(c, [[-0.86, 1], [-0.76, 0.4], [-0.38, 0.12], [0.38, 0.12], [0.76, 0.4], [0.86, 1]], G(c, 0.12, 1, '#6d7a58', '#434c36'));
      poly(c, [[-0.26, 0.12], [0, 0.5], [0.26, 0.12]], '#f4f2ea'); poly(c, [[-0.06, 0.24], [0.06, 0.24], [0.1, 0.8], [0, 0.9], [-0.1, 0.8]], '#2a3f66', false);
      R(c, -1.15, 0.35, 0.5, 0.62, 0.05, '#cfd2d4'); c.fillStyle = '#44505a'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c.fillRect(-1.08 + i * 0.14, 0.58 + j * 0.12, 0.09, 0.07); c.fillStyle = '#9fe6b2'; c.fillRect(-1.08, 0.4, 0.36, 0.12);
      E(c, 0, -0.26, 0.56, 0.56, G(c, -0.8, 0.3, '#f4d3ae', '#dbb185'));
      poly(c, [[-0.62, -0.5], [0.62, -0.5], [0.62, -0.38], [-0.62, -0.38]], '#2f9a58aa'); poly(c, [[-0.62, -0.5], [-0.5, -0.66], [0.5, -0.66], [0.62, -0.5]], '#2f9a58', true);
      c.lineWidth = 0.05; for (const x of [-0.22, 0.22]) { c.beginPath(); c.arc(x, -0.2, 0.17, 0, TAU); c.stroke(); } c.lineWidth = 0.06;
      eyes(c, f, -0.22, 0.22, -0.2, 0.08);
      E(c, 0.55, -0.35, 0.05, 0.09, '#8fd3ff', true, 0.3);
      if (f.mood === 'hurt') mouthOpen(c, 0, 0.1, 0.1, 0.09); else { c.beginPath(); c.moveTo(-0.16, 0.12); c.lineTo(-0.08, 0.06); c.lineTo(0, 0.12); c.lineTo(0.08, 0.06); c.lineTo(0.16, 0.12); c.stroke(); }
    },
    pere(c, f) {
      poly(c, [[-1.0, 1], [-0.95, 0.35], [-0.5, 0.05], [0.5, 0.05], [0.95, 0.35], [1.0, 1]], G(c, 0.05, 1, '#d8343c', '#8d1a22'));
      R(c, -1.0, 0.82, 2.0, 0.18, 0.08, '#fbfbf6'); R(c, -0.14, 0.1, 0.28, 0.75, 0.05, '#fbfbf6', false);
      R(c, -1.0, 0.5, 2.0, 0.16, 0.03, '#161a1e'); R(c, -0.17, 0.46, 0.34, 0.24, 0.04, '#e8c35a');
      R(c, 0.42, 0.14, 0.45, 0.2, 0.03, '#f4f2ea'); c.fillStyle = '#111'; c.fillRect(0.46, 0.2, 0.28, 0.025); c.fillRect(0.46, 0.26, 0.2, 0.025);
      E(c, 0, -0.3, 0.6, 0.55, G(c, -0.85, 0.3, '#f8d3ae', '#e2a981'));
      E(c, -0.36, -0.08, 0.13, 0.08, '#e87878aa', false); E(c, 0.36, -0.08, 0.13, 0.08, '#e87878aa', false);
      c.beginPath(); c.moveTo(-0.66, -0.2); c.quadraticCurveTo(-0.7, 0.5, 0, 0.62); c.quadraticCurveTo(0.7, 0.5, 0.66, -0.2); c.quadraticCurveTo(0.5, 0.05, 0.3, 0.0); c.quadraticCurveTo(0, 0.1, -0.3, 0.0); c.quadraticCurveTo(-0.5, 0.05, -0.66, -0.2); c.fillStyle = G(c, -0.2, 0.62, '#ffffff', '#dfe7ec'); c.fill(); c.stroke();
      E(c, -0.2, -0.06, 0.2, 0.09, '#fff', true, 0.15); E(c, 0.2, -0.06, 0.2, 0.09, '#fff', true, -0.15);
      E(c, 0, -0.18, 0.09, 0.07, '#e9a07c', false);
      poly(c, [[-0.7, -0.5], [-0.3, -1.25], [0.55, -1.0], [0.7, -0.5]], G(c, -1.3, -0.5, '#e0404a', '#a01d26')); R(c, -0.76, -0.62, 1.52, 0.2, 0.09, '#fbfbf6'); E(c, 0.55, -1.0, 0.16, 0.16, '#fbfbf6');
      c.lineWidth = 0.09; c.beginPath(); c.moveTo(-0.4, -0.5); c.lineTo(-0.1, -0.4); c.moveTo(0.4, -0.5); c.lineTo(0.1, -0.4); c.stroke(); c.lineWidth = 0.06;
      eyes(c, f, -0.24, 0.24, -0.33, 0.075);
      if (f.mood === 'hurt') mouthOpen(c, 0, 0.18, 0.13, 0.11);
    },
  };
  function drawChar(c, type, x, y, u, f) { c.save(); c.translate(x, y); c.scale(u, u); c.lineWidth = 0.06; c.strokeStyle = OUT; c.lineJoin = 'round'; c.lineCap = 'round'; CH[type](c, f || { mood: 'idle', t: 0 }); c.restore(); }

  // ───────────── illustrations (facultatives : si un fichier manque, le dessin du code prend le relais) ─────────────
  const ART = {};
  const loadArt = names => Promise.all(names.map(n => ART[n] !== undefined ? ART[n] : (ART[n] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = '/art/' + n + '.png'; }).then(im => (ART[n] = im))))).then(() => ART);
  const ART_NAMES = ['inspecteur', 'delegue', 'renne', 'comptable', 'pere'].flatMap(k => ['idle', 'hurt', 'down'].map(p => k + '-' + p));
  const sprite = (c, im, cx, bottom, h) => { const w = h * im.width / im.height; c.drawImage(im, cx - w / 2, bottom - h, w, h); };

  // ───────────── le jeu ─────────────
  let cur = null;   // partie en cours (pour les tests : conversion vecteur → déplacement du doigt)

  async function open(opts) {
    const { n, day, api } = opts, q = '?n=' + n + (day !== undefined && day !== null && day !== '' ? '&day=' + day : '');
    const info = await api('/noel/snow' + q); await loadArt(ART_NAMES);
    const ov = el('div', 'sg-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Tir au patron, niveau ' + n);
    document.body.append(ov); document.body.classList.add('sg-lock');
    let raf = 0, cleanup = () => {};
    const close = () => { cancelAnimationFrame(raf); cleanup(); ov.remove(); document.body.classList.remove('sg-lock'); cur = null; opts.onClose && opts.onClose(); };
    const portraitNow = () => window.innerHeight > window.innerWidth;
    const starSvg = (on, size = 34) => `<svg viewBox="-12 -12 24 24" width="${size}" height="${size}"><polygon points="${[...Array(10)].map((_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5.2 : 11; return (Math.cos(a) * r).toFixed(2) + ',' + (Math.sin(a) * r).toFixed(2); }).join(' ')}" fill="${on ? '#e8c35a' : '#ffffff14'}" stroke="${on ? '#fff1c7' : '#ffffff33'}" stroke-width="1" stroke-linejoin="round"/></svg>`;

    function intro(inf) {
      cancelAnimationFrame(raf); cleanup(); cleanup = () => {};
      const lv = P.level(n), left = inf.tries - inf.used, kinds = [...new Set(lv.targets.map(t => t.type))];
      ov.className = 'sg-ov'; ov.style.cssText = ''; ov.innerHTML = `<div class="sg-card"><div class="sg-kick">PÔLE NORD S.A. · TIR AU PATRON</div>
        <div class="sg-lvl">Niveau <b>${n}</b>${lv.boss ? '<i>Boss</i>' : ''}</div>
        <p class="sg-brief">${esc(lv.boss ? BOSS_BRIEF : BRIEF[(n - 1) % BRIEF.length])}</p>
        <div class="sg-roster">${kinds.map(k => `<div><canvas width="120" height="120" data-k="${k}"></canvas><b>${esc(NAMES[k])}</b><span>${P.TYPES[k].pts} pts${P.TYPES[k].hp > 1 ? ' · ' + P.TYPES[k].hp + ' coups' : ''}</span></div>`).join('')}</div>
        <ul class="sg-how"><li>Pose le doigt <b>n'importe où</b> et tire <b>à l'opposé</b> de la direction voulue : plus tu tires, plus la boule part fort.</li><li>Les pointillés montrent le début du trajet. Le vent, lui, ne prévient pas.</li><li>Enchaîne les touches : chaque cible abattue d'affilée rapporte 20 % de plus.</li></ul>
        ${portraitNow() ? '<p class="sg-orient"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M20.5 9.5a8.5 8.5 0 0 1 0 5M22 12l-1.5 2.5L18.5 13"/></svg>Le jeu se joue en paysage : l\'écran pivote tout seul. Tu peux aussi tourner ton téléphone.</p>' : ''}
        <div class="sg-stats"><span><b>${left}</b> essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}</span><span>Meilleur <b>${inf.best}</b></span><span><b>${inf.flocons}</b> flocons</span></div>
        <p class="sg-note">Seule ta meilleure partie du jour compte : le Père Noël ne paie que les progrès (jusqu'à ${inf.max} flocons).</p>
        <button class="sg-btn" id="sg-go" ${left > 0 ? '' : 'disabled'}>${left > 0 ? 'Prendre le poste' : 'Plus d\'essai aujourd\'hui'}</button><button class="sg-btn ghost" id="sg-quit">Retour au calendrier</button></div>`;
      ov.querySelectorAll('canvas[data-k]').forEach(cv => { const c = cv.getContext('2d'), k = cv.dataset.k, r = P.TYPES[k].r; const u = k === 'pere' ? 44 : 50, im = ART[k + '-idle']; if (im) sprite(c, im, 60, 116, 108); else drawChar(c, k, 60, 62 + (k === 'pere' ? 4 : 0), u, { mood: 'idle', t: 0 }); void r; });
      ov.querySelector('#sg-quit').onclick = close;
      const go = ov.querySelector('#sg-go'); go.onclick = async () => { go.disabled = true; try { ac(); const r = await api('/noel/snow/start', { n, ...(day ? { day } : {}) }); play(r.attempt); } catch (e) { opts.toast && opts.toast(e.message); go.disabled = false; } };
    }

    function play(attempt) {
      const lv = P.level(n), W = P.W, BALL = P.BALL, LAUNCH = P.LAUNCH;
      ov.innerHTML = ''; ov.className = 'sg-ov playing';
      const pl = el('div', 'sg-play'), cv = el('canvas'), quit = el('button', 'sg-x', 'Quitter'); pl.append(cv, quit); ov.append(pl);
      const ctx = cv.getContext('2d'), bg = document.createElement('canvas'), bgc = bg.getContext('2d');
      let lw = 0, lh = 0, dpr = 1, S = 1, ox = 0, gy = 0, rotated = false, Sc = 1;
      const wx = x => ox + x * S, wy = y => gy - y * S;   // monde → pixels du canvas
      const bgRand = P.rng(n * 7919 + 17);

      // — scène : tout ce qui ne bouge pas est dessiné une fois pour toutes —
      const pine = (c, x, base, h, col, snow) => { const w = h * 0.42; for (let i = 0; i < 3; i++) { const y0 = base - h * (0.18 + i * 0.27), y1 = base - h * (0.5 + i * 0.27), ww = w * (1 - i * 0.26); c.beginPath(); c.moveTo(x - ww, y0); c.lineTo(x, y1); c.lineTo(x + ww, y0); c.closePath(); c.fillStyle = col; c.fill(); if (snow) { c.beginPath(); c.moveTo(x - ww * 0.55, y0 - (y0 - y1) * 0.45); c.lineTo(x, y1); c.lineTo(x + ww * 0.55, y0 - (y0 - y1) * 0.45); c.quadraticCurveTo(x, y1 + (y0 - y1) * 0.22, x - ww * 0.55, y0 - (y0 - y1) * 0.45); c.fillStyle = snow; c.fill(); } } c.fillStyle = '#2a1a10'; c.fillRect(x - w * 0.07, base - h * 0.18, w * 0.14, h * 0.18); };
      function buildBg() {
        bg.width = cv.width; bg.height = cv.height; const c = bgc, cw = bg.width, ch = bg.height; c.clearRect(0, 0, cw, ch);
        const sky = c.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, '#040b17'); sky.addColorStop(0.55, '#0c2a3b'); sky.addColorStop(1, '#2d5a62'); c.fillStyle = sky; c.fillRect(0, 0, cw, ch);
        const R2 = P.rng(n * 31 + 5); for (let i = 0; i < 110; i++) { const x = R2() * cw, y = R2() * gy * 0.75, s = R2(); c.fillStyle = 'rgba(255,255,255,' + (0.25 + s * 0.6) + ')'; c.beginPath(); c.arc(x, y, (0.4 + s * 1.1) * dpr, 0, TAU); c.fill(); }
        const mx = cw * (0.2 + bgRand() * 0.15), my = gy * 0.22, mr = S * 4.4; const mg = c.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4.5); mg.addColorStop(0, 'rgba(210,235,255,.38)'); mg.addColorStop(1, 'rgba(210,235,255,0)'); c.fillStyle = mg; c.beginPath(); c.arc(mx, my, mr * 4.5, 0, TAU); c.fill();
        c.fillStyle = '#eef6ff'; c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill(); c.fillStyle = '#c9dcee'; for (const [dx, dy, r] of [[-0.3, -0.2, 0.28], [0.35, 0.15, 0.2], [-0.05, 0.4, 0.16]]) { c.beginPath(); c.arc(mx + dx * mr, my + dy * mr, r * mr, 0, TAU); c.fill(); }
        // montagnes lointaines
        const mtn = (amp, base, col, cap, seed) => { const R3 = P.rng(seed), pts = []; for (let x = -S * 6; x <= cw + S * 6; x += S * 7) pts.push([x, base - amp * (0.35 + R3() * 0.65)]); c.beginPath(); c.moveTo(-S * 6, gy); pts.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(cw + S * 6, gy); c.closePath(); c.fillStyle = col; c.fill(); if (cap) { c.fillStyle = cap; pts.forEach(p => { if (gy - p[1] > amp * 0.7) { c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] - S * 2.2, p[1] + S * 3); c.lineTo(p[0] - S * 0.6, p[1] + S * 2.2); c.lineTo(p[0] + S * 0.4, p[1] + S * 3.1); c.lineTo(p[0] + S * 2.4, p[1] + S * 2.6); c.closePath(); c.fill(); } }); } };
        mtn(S * 22, gy, '#1b3a48', '#9fc0d055', n * 3 + 1); mtn(S * 15, gy, '#16313a', null, n * 3 + 2);
        // le siège : usine du Père Noël, au fond
        { const bx = wx(70), bw = S * 90, bh = S * 14, by = gy - bh; c.fillStyle = '#0d1a28'; c.fillRect(bx, by, bw, bh); c.fillStyle = '#f2f6f9'; c.fillRect(bx - S, by - S * 0.9, bw + S * 2, S * 1.2);
          R(c, wx(104), gy - S * 24, S * 22, S * 24, 0, '#101f2e', false); c.fillStyle = '#f2f6f9'; c.fillRect(wx(103), gy - S * 24.9, S * 24, S * 1.2);
          for (const cx of [wx(80), wx(144)]) { c.fillStyle = '#18222c'; c.fillRect(cx, gy - S * 22, S * 3.4, S * 8.5); c.fillStyle = '#f2f6f9'; c.fillRect(cx - S * 0.3, gy - S * 22.6, S * 4, S * 0.9); }
          const R4 = P.rng(n * 13 + 3); for (let r = 0; r < 3; r++) for (let k = 0; k < 18; k++) { const x = bx + S * (2 + k * 4.9), y = by + S * (2 + r * 3.6); c.fillStyle = R4() > 0.22 ? 'rgba(255,205,110,' + (0.45 + R4() * 0.3) + ')' : 'rgba(255,205,110,.08)'; c.fillRect(x, y, S * 2.2, S * 1.9); }
          for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { c.fillStyle = R4() > 0.3 ? 'rgba(255,205,110,.5)' : 'rgba(255,205,110,.1)'; c.fillRect(wx(106.4) + k * S * 6.6, gy - S * 21.8 + r * S * 4.7, S * 3.6, S * 2.8); }
          c.font = '800 ' + Math.round(S * 2.5) + 'px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#ff4d5a'; c.shadowColor = '#ff4d5a'; c.shadowBlur = S * 2; c.fillText('PÔLE NORD S.A.', wx(115), gy - S * 26.4); c.shadowBlur = 0;
          const hz = c.createLinearGradient(0, gy - S * 26, 0, gy); hz.addColorStop(0, 'rgba(30,70,85,0)'); hz.addColorStop(1, 'rgba(45,90,98,.55)'); c.fillStyle = hz; c.fillRect(wx(60), gy - S * 26, S * 100, S * 26); }
        // sapins : deux rangées, plus denses sur les bords
        for (let i = 0; i < 34; i++) { const x = bgRand() * 160, edge = x < 34 || x > 150; if (!edge && bgRand() > 0.35) continue; if (x > 62 && x < 148 && bgRand() > 0.2) continue; pine(c, wx(x), gy, S * (7 + bgRand() * 7), '#0f2b25', null); }
        for (let i = 0; i < 12; i++) { const x = bgRand() * 160; if (x > 40 && x < 152) continue; pine(c, wx(x), gy + S * 0.4, S * (10 + bgRand() * 6), '#143f33', '#e3f0f3'); }
        // sol enneigé
        const gr = c.createLinearGradient(0, gy, 0, ch); gr.addColorStop(0, '#f6fbfb'); gr.addColorStop(0.35, '#dce9ef'); gr.addColorStop(1, '#a9c3d3'); c.fillStyle = gr; c.fillRect(0, gy, cw, ch - gy);
        c.fillStyle = '#ffffff'; c.fillRect(0, gy - 1, cw, Math.max(2, S * 0.35));
        c.strokeStyle = '#b4cddb'; c.lineWidth = Math.max(1, S * 0.18); for (let i = 0; i < 9; i++) { const y = gy + (ch - gy) * (0.18 + i * 0.09), x = bgRand() * cw; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + S * 6, y - S * 0.6, x + S * 13, y); c.stroke(); }
        const R5 = P.rng(n * 17 + 9); for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(R5() * cw, gy + R5() * (ch - gy), S * 0.25, S * 0.25); }
        c.textAlign = 'start';
      }
      function layout() {
        rotated = portraitNow(); const iw = window.innerWidth, ih = window.innerHeight;
        pl.style.cssText = rotated ? `width:${ih}px;height:${iw}px;left:${iw}px;top:0;transform:rotate(90deg)` : `width:${iw}px;height:${ih}px;left:0;top:0;transform:none`;
        lw = rotated ? ih : iw; lh = rotated ? iw : ih; dpr = Math.min(2, window.devicePixelRatio || 1); if (lw * lh * dpr * dpr > 3.4e6) dpr = Math.sqrt(3.4e6 / (lw * lh));
        cv.style.width = lw + 'px'; cv.style.height = lh + 'px'; cv.width = Math.round(lw * dpr); cv.height = Math.round(lh * dpr);
        S = Math.min(cv.width / W, cv.height * GROUND_F / VIS); ox = (cv.width - W * S) / 2; gy = cv.height * GROUND_F; Sc = S / dpr;
        buildBg(); cur = { Sc, rotated, gain: Sc * 0.5, delta: v => { const dx = -v[0] * Sc * 0.5, dy = v[1] * Sc * 0.5; return rotated ? [-dy, dx] : [dx, dy]; }, anchor: () => { const b = pl.getBoundingClientRect(); return rotated ? [b.right - lh * 0.45, b.top + lw * 0.6] : [b.left + lw * 0.6, b.top + lh * 0.45]; } };
      }
      layout(); const onRes = () => layout(); window.addEventListener('resize', onRes); window.addEventListener('orientationchange', onRes);
      cleanup = () => { window.removeEventListener('resize', onRes); window.removeEventListener('orientationchange', onRes); };
      try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch { /* verrouillage indisponible */ }

      // — état de la partie —
      const state = { hp: lv.targets.map(t => t.hp) }, throws = [];
      const tv = lv.targets.map((t, i) => ({ i, hp: t.hp, mood: 'idle', hurtT: 0, down: false, x: t.x, y: t.y, vx: 0, vy: 0, rot: 0, vr: 0, alpha: 1, blinkAt: 1 + Math.random() * 3, blink: 0, scaleHit: 0 }));
      const parts = [], pops = [], flakes = [], craters = [], smoke = [], trail = [], cracks = lv.walls.map(() => 0);
      let aim = null, fly = null, nextReady = 0, score = 0, shown = 0, streak = 0, ended = false, shake = 0, bubble = null, caption = null, banner = null, winT = 0, clock = 0, hint = 0, reloadT = 0, last = performance.now();
      try { hint = localStorage.getItem('wm_snow_hint') === '1' ? 0 : 1; } catch { hint = 1; }
      for (let i = 0; i < 90; i++) flakes.push({ x: Math.random() * W, y: Math.random() * VIS * 1.1, s: rnd(0.12, 0.34), v: rnd(3, 8), ph: Math.random() * 7 });
      const ballsLeft = () => lv.balls - throws.length, windNow = () => lv.wind[Math.min(throws.length, lv.balls - 1)];
      const spawn = (x, y, k, o = {}) => parts.push({ x, y, kind: k, vx: 0, vy: 0, g: 40, life: 1, max: 1, size: 0.4, col: '#fff', rot: 0, vr: 0, drag: 0, ...o, max: o.life || 1 });
      const burst = (x, y, kind, count, o) => { for (let i = 0; i < count; i++) { const a = rnd(0, TAU), sp = rnd(o.sp[0], o.sp[1]); spawn(x, y, kind, { vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0), life: rnd(o.life[0], o.life[1]), size: rnd(o.size[0], o.size[1]), col: Array.isArray(o.col) ? o.col[i % o.col.length] : o.col, g: o.g ?? 40, rot: rnd(0, TAU), vr: rnd(-8, 8), drag: o.drag ?? 0.6 }); } };
      const pop = (x, y, text, col, size = 1) => pops.push({ x, y, text, col, size, t: 0 });
      const say = (i, text) => { bubble = { i, text, t: 0, max: 3 }; };
      const cap = text => { caption = { text, t: 0, max: 2.6 }; };

      // — pointeur : on pose le doigt n'importe où et on tire à l'opposé —
      const loc = e => { const b = pl.getBoundingClientRect(); return rotated ? [e.clientY - b.top, b.right - e.clientX] : [e.clientX - b.left, e.clientY - b.top]; };
      let pid = null, anchor = null, lastPow = 0;
      const vecFrom = p => { const g = Sc * 0.5; let px = Math.round((anchor[0] - p[0]) / g), py = Math.round((p[1] - anchor[1]) / g); const len = Math.hypot(px, py); if (len > P.PMAX) { px = Math.round(px * P.PMAX / len); py = Math.round(py * P.PMAX / len); } return { px, py, pow: Math.min(1, len / P.PMAX) }; };
      cv.addEventListener('pointerdown', e => { ac(); if (fly || ended || pid !== null || nextReady > 0) return; pid = e.pointerId; try { cv.setPointerCapture(pid); } catch { /* ignoré */ } anchor = loc(e); aim = { px: 0, py: 0, pow: 0 }; if (hint) { hint = 0; try { localStorage.setItem('wm_snow_hint', '1'); } catch { /* ignoré */ } } });
      cv.addEventListener('pointermove', e => { if (e.pointerId !== pid || !aim) return; aim = vecFrom(loc(e)); if (Math.abs(aim.pow - lastPow) > 0.1) { lastPow = aim.pow; SFX.stretch(); } });
      const release = e => { if (e.pointerId !== pid) return; pid = null; const a = aim; aim = null; lastPow = 0; if (!a || fly || ended) return; if (Math.hypot(a.px, a.py) < 14) { cap('Trop mou. Le Père Noël a vu mieux, chez les lutins.'); return; } fire(a); };
      cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', () => { pid = null; aim = null; });
      quit.onclick = () => { if (ended || confirm('Quitter ? Cet essai est déjà décompté : le Père Noël ne rembourse pas.')) close(); };

      function fire(a) {
        const k = throws.length, r = P.throwBall(lv, state, k, a.px, a.py); throws.push([a.px, a.py]); trail.length = 0;
        fly = { path: r.path, r, t: 0, k }; SFX.throw(); buzz(8); shake = Math.max(shake, 0.15);
        spawn(LAUNCH.x, LAUNCH.y, 'dot', { vx: 0, vy: 0, life: 0.1, size: 0 });
      }
      function bpos() { const f = fly, idx = Math.min(f.t * SAMPLE_HZ * SPEED, f.path.length - 1), i0 = Math.floor(idx), i1 = Math.min(i0 + 1, f.path.length - 1), u = idx - i0; return [f.path[i0][0] + (f.path[i1][0] - f.path[i0][0]) * u, f.path[i0][1] + (f.path[i1][1] - f.path[i0][1]) * u, idx >= f.path.length - 1]; }
      function impact() {
        const f = fly, r = f.r, last = f.path[f.path.length - 1], px = last[0], py = last[1]; fly = null; trail.length = 0;
        if (r.hit !== null) {
          const t = lv.targets[r.hit], v = tv[r.hit], pv = f.path[Math.max(0, f.path.length - 3)], dirx = Math.sign(px - pv[0]) || 1; v.hp -= 1; streak++;
          burst(px, py, 'snow', 14, { sp: [6, 22], life: [0.35, 0.8], size: [0.3, 0.8], col: '#ffffff', g: 25 }); SFX.hit(); buzz(r.down ? 30 : 15); shake = Math.max(shake, t.type === 'pere' ? 0.7 : 0.35);
          if (r.down) {
            const pts = Math.round(t.pts * (1 + 0.2 * (streak - 1))); score += pts; v.down = true; v.vx = dirx * rnd(16, 26); v.vy = rnd(26, 38); v.vr = dirx * rnd(5, 9); v.alpha = 1; v.mood = 'hurt';
            burst(t.x, t.y, 'spark', 16, { sp: [8, 30], life: [0.5, 1], size: [0.25, 0.6], col: ['#ffd34d', '#fff1c7', '#ff7a45'], g: 30 }); SFX.down();
            pop(t.x, t.y + t.r + 3, '+' + pts, '#ffd34d', 1.15); if (streak > 1) pop(t.x, t.y + t.r + 8.5, 'SÉRIE ×' + (1 + 0.2 * (streak - 1)).toFixed(1).replace('.', ','), '#fff1c7', 0.8);
            say(r.hit, HIT[t.type][t.type === 'pere' ? 2 : (t.id + n) % 2]);
          } else { v.mood = 'hurt'; v.hurtT = 0.7; say(r.hit, HIT[t.type][t.type === 'pere' ? Math.min(1, 3 - v.hp - 1) : 1]); pop(t.x, t.y + t.r + 3, 'Touché', '#fff1c7', 0.85); }
        } else {
          streak = 0;
          if (r.end === 'ground') { craters.push({ x: px }); burst(px, 0.4, 'snow', 12, { sp: [4, 16], life: [0.3, 0.7], size: [0.3, 0.7], col: '#ffffff', g: 30, vy: 6 }); SFX.pouf(); }
          else if (r.end === 'wall') { const wi = lv.walls.findIndex(w => px + BALL > w.x - 1 && px - BALL < w.x + w.w + 1); if (wi >= 0) cracks[wi] += 1; burst(px, py, 'shard', 14, { sp: [8, 26], life: [0.4, 0.9], size: [0.4, 1], col: ['#cdeffa', '#9fd0e0', '#ffffff'], g: 45 }); SFX.ice(); shake = Math.max(shake, 0.3); buzz(12); }
          else SFX.miss();
          cap(MISS[r.end] || MISS.time);
        }
        if (!ballsLeft() || state.hp.every(h => h <= 0)) finishGame(); else nextReady = 0.55;
      }
      function finishGame() {
        ended = true; const all = state.hp.every(h => h <= 0), left = ballsLeft();
        if (all) { const bonus = left * 30; if (bonus) { score += bonus; pop(W / 2, 30, 'Boules économisées +' + bonus, '#fff1c7', 1); } banner = { title: 'TABLEAU NETTOYÉ', sub: 'Les ressources humaines préparent un entretien.', t: 0 }; SFX.win(); buzz(60);
          for (let i = 0; i < 90; i++) spawn(rnd(10, 150), rnd(60, 74), 'conf', { vx: rnd(-8, 8), vy: rnd(-4, 6), g: 14, life: rnd(2, 3.4), size: rnd(0.5, 0.9), col: ['#e8c35a', '#d8343c', '#ffffff', '#2f9a58'][i % 4], rot: rnd(0, TAU), vr: rnd(-8, 8), drag: 0.5 }); winT = 2.7; }
        else winT = 1.3;
      }

      // — dessin —
      const drawPillar = (x0, w, h, damage) => { const X0 = wx(x0), Y0 = wy(h), WW = w * S, HH = h * S; const g = ctx.createLinearGradient(X0, 0, X0 + WW, 0); g.addColorStop(0, '#d9f3fb'); g.addColorStop(0.5, '#a6d4e4'); g.addColorStop(1, '#6fa6bf'); ctx.fillStyle = g; ctx.fillRect(X0, Y0, WW, HH); ctx.fillStyle = '#ffffff99'; ctx.fillRect(X0, Y0, WW, Math.max(2, S * 0.5)); ctx.fillStyle = '#ffffff44'; ctx.fillRect(X0 + WW * 0.15, Y0 + S, WW * 0.12, HH - S); ctx.strokeStyle = '#4c7f98'; ctx.lineWidth = Math.max(1, S * 0.15); ctx.strokeRect(X0, Y0, WW, HH); ctx.beginPath(); for (let y = 0; y < h; y += 5) { ctx.moveTo(X0, wy(y)); ctx.lineTo(X0 + WW, wy(y)); } ctx.stroke();
        if (damage) { ctx.strokeStyle = '#2f5a70'; ctx.lineWidth = Math.max(1, S * 0.2); ctx.beginPath(); for (let i = 0; i < Math.min(3, damage); i++) { const yy = Y0 + HH * (0.2 + i * 0.28); ctx.moveTo(X0, yy); ctx.lineTo(X0 + WW * 0.5, yy + S * 1.6); ctx.lineTo(X0 + WW * 0.3, yy + S * 3.2); ctx.lineTo(X0 + WW, yy + S * 2.4); } ctx.stroke(); } };
      const drawElf = (pouch) => {
        const ex = 7, base = wy(0), u = S; ctx.save(); ctx.translate(wx(ex), base); ctx.scale(u, u); ctx.lineWidth = 0.18; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        E(ctx, -0.8, -0.5, 1.3, 0.5, '#6b2a2f', true, 0); E(ctx, 0.8, -0.5, 1.3, 0.5, '#6b2a2f', true, 0);               // bottes
        poly(ctx, [[-1.5, -1.6], [-1.9, -5.6], [0, -6.1], [1.9, -5.6], [1.5, -1.6]], G(ctx, -6, -1.5, '#3aa660', '#1f6a3c'));   // tunique
        R(ctx, -1.7, -3.6, 3.4, 0.55, 0.15, '#2a1a10'); R(ctx, -0.35, -3.7, 0.7, 0.75, 0.12, '#e8c35a');
        E(ctx, 0, -7.3, 1.35, 1.3, G(ctx, -8.6, -6, '#f6d7b2', '#dfb58a')); E(ctx, -1.5, -7.4, 0.35, 0.7, '#f1c9a0', true, 0.5); E(ctx, 1.5, -7.4, 0.35, 0.7, '#f1c9a0', true, -0.5);
        ctx.fillStyle = '#12181c'; ctx.beginPath(); ctx.arc(-0.45, -7.3, 0.16, 0, TAU); ctx.arc(0.5, -7.3, 0.16, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, -6.7, 0.35, 0.1, Math.PI - 0.1); ctx.lineWidth = 0.12; ctx.stroke(); ctx.lineWidth = 0.18;
        poly(ctx, [[-1.5, -8.0], [0.3, -10.8], [1.5, -8.0]], G(ctx, -11, -8, '#e0404a', '#a01d26')); R(ctx, -1.65, -8.3, 3.3, 0.6, 0.25, '#fbfbf6'); E(ctx, 0.5, -10.9, 0.38, 0.38, '#e8c35a');
        ctx.restore();
        // bras tendu vers la poche
        const sx = wx(ex + 1.4), sy = wy(4.4), px = wx(pouch[0]), py = wy(pouch[1]); ctx.strokeStyle = '#1f6a3c'; ctx.lineWidth = S * 1.0; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(px - S * 0.3, py + S * 0.3); ctx.stroke(); ctx.fillStyle = '#f1c9a0'; ctx.strokeStyle = OUT; ctx.lineWidth = S * 0.12; ctx.beginPath(); ctx.arc(px - S * 0.3, py + S * 0.3, S * 0.6, 0, TAU); ctx.fill(); ctx.stroke();
      };
      const drawSling = (pouch, pull) => {
        const bx = wx(LAUNCH.x), by = wy(0), tl = [wx(LAUNCH.x - 2.4), wy(LAUNCH.y + 2.2)], tr = [wx(LAUNCH.x + 2.4), wy(LAUNCH.y + 2.2)], px = wx(pouch[0]), py = wy(pouch[1]);
        const band = (t, back) => { ctx.strokeStyle = back ? '#5a1c22' : '#b3202a'; ctx.lineWidth = S * (back ? 0.75 : 0.62); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.quadraticCurveTo((t[0] + px) / 2, (t[1] + py) / 2 + S * (pull ? 0 : 0.8), px, py); ctx.stroke(); if (!back) { ctx.strokeStyle = '#ff7a80'; ctx.lineWidth = S * 0.16; ctx.stroke(); } };
        band(tl, true);
        ctx.lineCap = 'round'; ctx.strokeStyle = '#3d2412'; ctx.lineWidth = S * 1.6; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, wy(5.5)); ctx.lineTo(tl[0], tl[1]); ctx.moveTo(bx, wy(5.5)); ctx.lineTo(tr[0], tr[1]); ctx.stroke();
        ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = S * 1.0; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, wy(5.5)); ctx.lineTo(tl[0], tl[1]); ctx.moveTo(bx, wy(5.5)); ctx.lineTo(tr[0], tr[1]); ctx.stroke();
        ctx.strokeStyle = '#c28a52'; ctx.lineWidth = S * 0.25; ctx.beginPath(); ctx.moveTo(bx - S * 0.25, by - S); ctx.lineTo(bx - S * 0.25, wy(5.3)); ctx.stroke();
        band(tr, false);
        ctx.fillStyle = '#5b3a1e'; ctx.strokeStyle = OUT; ctx.lineWidth = S * 0.12; ctx.beginPath(); ctx.ellipse(px, py, S * 1.5, S * 1.0, 0, 0, TAU); ctx.fill(); ctx.stroke();
      };
      const ball = (x, y, r, rot) => { const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#e6f1f8'); g.addColorStop(1, '#a9c7da'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#6f95ab'; ctx.lineWidth = Math.max(1, r * 0.12); ctx.stroke(); ctx.strokeStyle = '#c4dbe8'; ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.arc(x, y, r * 0.55, rot, rot + 1.6); ctx.stroke(); };
      const bubbleDraw = (b) => {
        const v = tv[b.i], t = lv.targets[b.i], fs = Math.max(11, Math.round(S * 2.3)), pad = fs * 0.7, maxW = Math.min(S * 46, cv.width * 0.46); ctx.font = '600 ' + fs + 'px system-ui, -apple-system, Segoe UI, sans-serif';
        const words = b.text.split(' '), lines = []; let ln = ''; for (const w of words) { const test = ln ? ln + ' ' + w : w; if (ctx.measureText(test).width > maxW - pad * 2 && ln) { lines.push(ln); ln = w; } else ln = test; } lines.push(ln);
        const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2, bh = lines.length * fs * 1.25 + pad * 1.4, tx = wx(t.x), ty = wy(Math.max(t.y, 0) + t.r) - S * 2.2;
        let x = clamp(tx - bw / 2, 8 * dpr, cv.width - bw - 8 * dpr), y = Math.max(44 * dpr, ty - bh - S * 1.6); const a = clamp(b.t * 8, 0, 1) * clamp((b.max - b.t) * 3, 0, 1), s = 0.85 + 0.15 * clamp(b.t * 8, 0, 1);
        ctx.save(); ctx.globalAlpha = a; ctx.translate(tx, ty); ctx.scale(s, s); ctx.translate(-tx, -ty);
        ctx.fillStyle = '#fffdf3'; ctx.strokeStyle = '#0e1519'; ctx.lineWidth = Math.max(1.5, S * 0.22); ctx.beginPath(); ctx.roundRect(x, y, bw, bh, fs * 0.7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(clamp(tx - fs * 0.6, x + fs, x + bw - fs * 2), y + bh - 1); ctx.lineTo(tx, ty + S * 0.2); ctx.lineTo(clamp(tx + fs * 0.6, x + fs * 2, x + bw - fs), y + bh - 1); ctx.fillStyle = '#fffdf3'; ctx.fill(); ctx.stroke(); ctx.fillRect(clamp(tx - fs * 0.6, x + fs, x + bw - fs * 2) + 1, y + bh - 3, fs * 1.2, 4);
        ctx.fillStyle = '#16231b'; ctx.textAlign = 'left'; lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad * 0.9 + fs * (0.95 + i * 1.25))); ctx.restore(); void v;
      };
      const hudText = (txt, x, y, font, col, align = 'left', glow) => { ctx.font = font; ctx.textAlign = align; if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10 * dpr; } ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.shadowBlur = 0; };
      const drawHud = () => {
        const g = ctx.createLinearGradient(0, 0, 0, 52 * dpr); g.addColorStop(0, 'rgba(3,10,8,.78)'); g.addColorStop(1, 'rgba(3,10,8,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, 52 * dpr);
        const U = dpr, midx = cv.width / 2;
        hudText('NIVEAU ' + n + (lv.boss ? ' · BOSS' : ''), midx, 17 * U, '700 ' + 11 * U + 'px Georgia, serif', '#e8c35a', 'center');
        for (let i = 0; i < lv.balls; i++) { const bx = midx + (i - (lv.balls - 1) / 2) * 20 * U, by = 34 * U, on = i >= throws.length; ctx.globalAlpha = on ? 1 : 0.22; ball(bx, by, 6.5 * U, 0); ctx.globalAlpha = 1; }
        shown += (score - shown) * Math.min(1, 0.18 + 0.0); if (Math.abs(score - shown) < 1) shown = score;
        hudText(String(Math.round(shown)), cv.width - 16 * U, 40 * U, '800 ' + 25 * U + 'px Georgia, serif', '#fff1c7', 'right', '#e8c35a88'); hudText('POINTS', cv.width - 16 * U, 12 * U, '700 ' + 9.5 * U + 'px system-ui, sans-serif', '#e8c35a', 'right');
        if (streak > 1 && !ended) hudText('SÉRIE ×' + (1 + 0.2 * (streak - 1)).toFixed(1).replace('.', ','), cv.width - 110 * U, 38 * U, '700 ' + 11 * U + 'px system-ui, sans-serif', '#ffd34d', 'right');
        // vent : girouette et flèche
        const w = windNow(), vx0 = midx - 150 * U - (cv.width < 700 ? -60 * U : 0), arrowX = Math.max(96 * U, midx - 150 * U), cy = 26 * U;
        hudText('VENT', arrowX, 13 * U, '700 ' + 9.5 * U + 'px system-ui, sans-serif', '#e8c35a', 'center'); void vx0;
        if (!ended && throws.length < lv.balls) { const len = (10 + Math.abs(w) * 3.2) * U, dir = w >= 0 ? 1 : -1, ph = (clock * 40 * U) % (14 * U); ctx.strokeStyle = '#bfe9ff'; ctx.fillStyle = '#bfe9ff'; ctx.lineWidth = 2.4 * U; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(arrowX - dir * len / 2, cy); ctx.lineTo(arrowX + dir * len / 2, cy); ctx.stroke(); ctx.beginPath(); ctx.moveTo(arrowX + dir * (len / 2 + 6 * U), cy); ctx.lineTo(arrowX + dir * (len / 2 - 2 * U), cy - 5 * U); ctx.lineTo(arrowX + dir * (len / 2 - 2 * U), cy + 5 * U); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.5; for (let k = 0; k < 3; k++) { const px = arrowX + dir * (((ph + k * 14 * U) % (len + 14 * U)) - len / 2); ctx.fillRect(px, cy + 7 * U, 3 * U, 1.6 * U); } ctx.globalAlpha = 1; hudText(w === 0 ? 'nul' : Math.abs(w).toFixed(1).replace('.', ','), arrowX, 44 * U, '700 ' + 11 * U + 'px system-ui, sans-serif', '#fff1c7', 'center'); }
      };

      function frame(now) {
        raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
        // — mise à jour —
        if (fly) { fly.t += dt; const [bx, by, done] = bpos(); trail.push([bx, by]); if (trail.length > 16) trail.shift(); if (done) impact(); }
        if (nextReady > 0) nextReady -= dt;
        if (ended && winT > 0) { winT -= dt; if (winT <= 0) submit(); }
        shake = Math.max(0, shake - dt * 1.6);
        for (const v of tv) { v.blinkAt -= dt; if (v.blinkAt <= 0) { v.blink = 0.12; v.blinkAt = rnd(2, 5); } if (v.blink > 0) v.blink -= dt; if (v.hurtT > 0) { v.hurtT -= dt; if (v.hurtT <= 0 && !v.down) v.mood = 'idle'; } if (v.down) { v.vy -= 70 * dt; v.x += v.vx * dt; v.y += v.vy * dt; v.rot += v.vr * dt; if (v.y < 0) { v.y = 0; v.vy = -v.vy * 0.35; v.vx *= 0.6; } v.alpha -= dt * 0.75; } if (v.scaleHit > 0) v.scaleHit -= dt; }
        for (const p of parts) { p.life -= dt; p.vy -= p.g * dt; const dm = Math.max(0, 1 - p.drag * dt); p.vx *= dm; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.kind === 'snow' && p.y < 0) { p.y = 0; p.vy = 0; } }
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
        for (const p of pops) { p.t += dt; } for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 1.5) pops.splice(i, 1);
        if (bubble) { bubble.t += dt; if (bubble.t > bubble.max) bubble = null; } if (caption) { caption.t += dt; if (caption.t > caption.max) caption = null; } if (banner) banner.t += dt;
        const w = windNow(); for (const f of flakes) { f.y -= f.v * dt; f.x += (w * 1.3 + Math.sin(clock * 1.3 + f.ph) * 2.2) * dt; if (f.y < -1) { f.y = VIS * 1.1; f.x = Math.random() * W; } if (f.x > W + 2) f.x = -2; if (f.x < -2) f.x = W + 2; }
        if (Math.random() < dt * 3) smoke.push({ x: Math.random() < 0.5 ? 81.7 : 145.7, y: 22.8, a: 0.5, r: 0.9 }); for (const s of smoke) { s.y += 3.6 * dt; s.x += (w * 0.4 + 1.2) * dt; s.r += 0.8 * dt; s.a -= 0.16 * dt; } for (let i = smoke.length - 1; i >= 0; i--) if (smoke[i].a <= 0) smoke.splice(i, 1);

        // — dessin —
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
        const sh = shake > 0 ? shake * 6 * dpr : 0; ctx.save(); if (sh) ctx.translate(rnd(-sh, sh), rnd(-sh, sh));
        ctx.drawImage(bg, 0, 0);
        for (let b = 0; b < 3; b++) { const y0 = cv.height * (0.08 + b * 0.07); ctx.globalAlpha = 0.07; const ag = ctx.createLinearGradient(0, y0 - S * 6, 0, y0 + S * 8); ag.addColorStop(0, 'rgba(80,255,170,0)'); ag.addColorStop(0.5, b % 2 ? 'rgba(90,200,255,1)' : 'rgba(80,255,170,1)'); ag.addColorStop(1, 'rgba(80,255,170,0)'); ctx.fillStyle = ag; ctx.beginPath(); ctx.moveTo(0, y0 - S * 6); for (let x = 0; x <= cv.width; x += cv.width / 24) ctx.lineTo(x, y0 + Math.sin(clock * 0.4 + x * 0.004 + b * 2) * S * 3 - S * 2); ctx.lineTo(cv.width, y0 + S * 10); ctx.lineTo(0, y0 + S * 10); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
        for (const s of smoke) { ctx.fillStyle = 'rgba(200,215,225,' + Math.max(0, s.a * 0.45) + ')'; ctx.beginPath(); ctx.arc(wx(s.x), wy(s.y), s.r * S, 0, TAU); ctx.fill(); }
        ctx.fillStyle = 'rgba(0,0,0,.14)'; for (const c of craters) { ctx.beginPath(); ctx.ellipse(wx(c.x), wy(0) + S * 0.5, S * 1.9, S * 0.5, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = S * 0.2; ctx.stroke(); }
        lv.walls.forEach((w2, i) => drawPillar(w2.x, w2.w, w2.h, cracks[i]));
        lv.targets.forEach((t, i) => {
          const v = tv[i];
          if (t.plat) { const x0 = t.x - t.r - 1.8, ww = (t.r + 1.8) * 2; ctx.save(); const X0 = wx(x0), Y0 = wy(t.plat), WW = ww * S, HH = t.plat * S; const g = ctx.createLinearGradient(X0, 0, X0 + WW, 0); g.addColorStop(0, '#d9f3fb'); g.addColorStop(0.55, '#a6d4e4'); g.addColorStop(1, '#6fa6bf'); ctx.fillStyle = g; ctx.fillRect(X0, Y0, WW, HH); ctx.fillStyle = '#ffffffaa'; ctx.fillRect(X0 - S * 0.3, Y0 - S * 0.2, WW + S * 0.6, Math.max(2, S * 0.7)); ctx.strokeStyle = '#4c7f98'; ctx.lineWidth = Math.max(1, S * 0.15); ctx.strokeRect(X0, Y0, WW, HH); for (let k = 0; k < 4; k++) { const ix = X0 + WW * (0.15 + k * 0.22); ctx.fillStyle = '#e8f8ff'; ctx.beginPath(); ctx.moveTo(ix, Y0 + HH); ctx.lineTo(ix + S * 0.5, Y0 + HH); ctx.lineTo(ix + S * 0.25, Y0 + HH + S * (0.8 + (k % 2))); ctx.closePath(); ctx.fill(); } ctx.restore(); }
          if (v.alpha <= 0) return;
          const bob = v.down ? 0 : Math.sin(clock * 2.2 + i * 1.7) * 0.12, shk = v.hurtT > 0 ? Math.sin(clock * 60) * 0.28 : 0;
          ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, v.alpha)); const cx = wx(v.x + shk), cy = wy(v.y + bob);
          if (v.down) { ctx.translate(cx, cy); ctx.rotate(-v.rot); ctx.translate(-cx, -cy); }
          { const landed = v.down && v.y <= 0.6, im = ART[t.type + '-' + (landed ? 'down' : v.mood === 'hurt' || v.down ? 'hurt' : 'idle')];
            if (im) { const hh = (landed ? 1.55 : 2.2) * t.r * S; sprite(ctx, im, cx, cy + t.r * S * (landed ? 1.0 : 1.05), hh); } else drawChar(ctx, t.type, cx, cy, t.r * S, { mood: v.mood, blink: v.blink > 0, t: clock }); }
          if (!v.down && t.hp > 1) { for (let k = 0; k < t.hp; k++) { const px = cx + (k - (t.hp - 1) / 2) * S * 2.6, py = wy(v.y + t.r) - S * 2.6; ctx.fillStyle = k < v.hp ? '#e8c35a' : '#ffffff22'; ctx.strokeStyle = '#0e1519'; ctx.lineWidth = Math.max(1, S * 0.16); ctx.beginPath(); ctx.roundRect(px - S * 1.0, py - S * 0.5, S * 2.0, S * 1.0, S * 0.35); ctx.fill(); ctx.stroke(); } }
          if (v.mood === 'hurt' && !v.down) { for (let k = 0; k < 3; k++) { const a = clock * 6 + k * 2.1; star5(ctx, cx + Math.cos(a) * S * t.r * 0.9, wy(v.y + t.r * 1.05) + Math.sin(a) * S * 0.7, S * 0.6, '#ffd34d'); } }
          ctx.restore();
        });
        ctx.fillStyle = '#f6fbfb'; for (let i = 0; i < 26; i++) { const x = ((i * 53.7) % 164) - 2; ctx.beginPath(); ctx.ellipse(wx(x), wy(0) + S * 0.1, S * (1.3 + (i % 3) * 0.6), S * (0.55 + (i % 2) * 0.25), 0, Math.PI, TAU); ctx.fill(); }
        // lanceur et lutin
        const pouchW = aim ? [LAUNCH.x - aim.px * PULL, LAUNCH.y - aim.py * PULL] : [LAUNCH.x, LAUNCH.y];
        drawElf(pouchW); drawSling(pouchW, !!aim);
        if (!fly && !ended && nextReady <= 0 && !(throws.length >= lv.balls)) ball(wx(pouchW[0]), wy(pouchW[1]) - S * 0.2, BALL * S, aim ? clock * 3 : 0);
        if (aim && aim.pow > 0) {
          const pv = P.throwBall(lv, { hp: state.hp.slice() }, throws.length, aim.px, aim.py).path.slice(0, 15);
          pv.forEach((p, i) => { ctx.fillStyle = 'rgba(255,246,214,' + (0.95 - i * 0.06) + ')'; ctx.beginPath(); ctx.arc(wx(p[0]), wy(p[1]), S * (0.55 - i * 0.02), 0, TAU); ctx.fill(); });
          const px = wx(LAUNCH.x), py = wy(LAUNCH.y); ctx.lineWidth = S * 0.9; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(px, py, S * 5.6, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke(); const pg = ctx.createLinearGradient(px - S * 5, 0, px + S * 5, 0); pg.addColorStop(0, '#5fd38d'); pg.addColorStop(0.6, '#ffd34d'); pg.addColorStop(1, '#ff6a5a'); ctx.strokeStyle = pg; ctx.beginPath(); ctx.arc(px, py, S * 5.6, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * aim.pow); ctx.stroke();
          hudText(Math.round(aim.pow * 100) + ' %', px, py + S * 8.6, '800 ' + Math.round(S * 2.4) + 'px system-ui, sans-serif', '#fff1c7', 'center');
        }
        if (fly) { trail.forEach((p, i) => { ctx.fillStyle = 'rgba(235,245,255,' + (i / trail.length * 0.55) + ')'; ctx.beginPath(); ctx.arc(wx(p[0]), wy(p[1]), BALL * S * (0.3 + i / trail.length * 0.6), 0, TAU); ctx.fill(); }); const [bx, by] = bpos(); ball(wx(bx), wy(by), BALL * S * 1.15, clock * 14); }
        for (const p of parts) { const a = clamp(p.life / p.max, 0, 1), x = wx(p.x), y = wy(p.y); if (p.kind === 'conf') { ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = p.col; ctx.fillRect(-p.size * S * 0.5, -p.size * S * 0.25, p.size * S, p.size * S * 0.5); ctx.restore(); ctx.globalAlpha = 1; } else if (p.kind === 'shard') { ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(0, -p.size * S); ctx.lineTo(p.size * S * 0.6, p.size * S * 0.7); ctx.lineTo(-p.size * S * 0.6, p.size * S * 0.5); ctx.closePath(); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1; } else if (p.kind === 'spark') { ctx.globalAlpha = a; star5(ctx, x, y, p.size * S, p.col); ctx.globalAlpha = 1; } else if (p.size > 0) { ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(x, y, p.size * S * (p.kind === 'snow' ? 1.2 - a * 0.4 : 1), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; } }
        ctx.fillStyle = 'rgba(255,255,255,.75)'; for (const f of flakes) { ctx.beginPath(); ctx.arc(wx(f.x), wy(f.y), f.s * S, 0, TAU); ctx.fill(); }
        for (const p of pops) { const a = clamp(1.5 - p.t, 0, 1), y = wy(p.y + p.t * 5), fs = Math.round(S * 3.2 * p.size); ctx.globalAlpha = a; ctx.font = '800 ' + fs + 'px Georgia, serif'; ctx.textAlign = 'center'; ctx.lineWidth = fs * 0.2; ctx.strokeStyle = '#0e1519'; ctx.strokeText(p.text, wx(p.x), y); ctx.fillStyle = p.col; ctx.fillText(p.text, wx(p.x), y); ctx.globalAlpha = 1; }
        ctx.restore();
        drawHud();
        if (bubble) bubbleDraw(bubble);
        if (caption && !bubble) { const fs = Math.max(12, Math.round(dpr * 13)), a = clamp(caption.t * 6, 0, 1) * clamp((caption.max - caption.t) * 3, 0, 1); ctx.font = '600 ' + fs + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; const tw = Math.min(ctx.measureText(caption.text).width + fs * 2, cv.width - 20 * dpr); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(8,20,14,.82)'; ctx.strokeStyle = '#e8c35a55'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.roundRect(cv.width / 2 - tw / 2, cv.height - 44 * dpr, tw, fs * 2, fs); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f4ead0'; ctx.fillText(caption.text, cv.width / 2, cv.height - 44 * dpr + fs * 1.35); ctx.globalAlpha = 1; }
        if (banner) { const a = clamp(banner.t * 4, 0, 1) * clamp((winT + 0.3) * 2, 0, 1), fs = Math.round(S * 6.5); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = '800 ' + fs + 'px Georgia, serif'; ctx.lineWidth = fs * 0.12; ctx.strokeStyle = '#0e1519'; ctx.strokeText(banner.title, cv.width / 2, cv.height * 0.3); ctx.fillStyle = '#ffd34d'; ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 20 * dpr; ctx.fillText(banner.title, cv.width / 2, cv.height * 0.3); ctx.shadowBlur = 0; ctx.font = '600 ' + Math.round(S * 2.4) + 'px system-ui, sans-serif'; ctx.fillStyle = '#fff1c7'; ctx.fillText(banner.sub, cv.width / 2, cv.height * 0.3 + fs * 0.8); ctx.globalAlpha = 1; }
        if (hint && !aim && !fly && throws.length === 0) { const ph = (clock % 2.4) / 2.4, e = ph < 0.2 ? ph / 0.2 : ph < 0.75 ? 1 : 1 - (ph - 0.75) / 0.25, k = clamp((ph - 0.2) / 0.55, 0, 1), x0 = cv.width * 0.62, y0 = cv.height * 0.3, x1 = x0 - S * 13, y1 = y0 + S * 9, hx = x0 + (x1 - x0) * k, hy = y0 + (y1 - y0) * k; ctx.globalAlpha = clamp(e, 0, 1) * 0.9; ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = S * 0.5; ctx.setLineDash([S, S]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#ffffff55'; ctx.strokeStyle = '#fff'; ctx.lineWidth = S * 0.3; ctx.beginPath(); ctx.arc(hx, hy, S * 2.4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.font = '700 ' + Math.round(S * 2.3) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff1c7'; ctx.fillText('Glisse vers le bas-gauche, puis relâche', cv.width * 0.5, cv.height * 0.18); ctx.globalAlpha = 1; }
      }

      // — fin de partie : envoi au serveur, puis bilan —
      async function submit() {
        cancelAnimationFrame(raf); cleanup(); cleanup = () => {};
        const finish = () => { ov.className = 'sg-ov'; ov.style.cssText = ''; };
        const render = (r, err) => {
          finish();
          if (err) { ov.innerHTML = `<div class="sg-card"><div class="sg-kick">PÔLE NORD S.A.</div><p class="sg-brief">Le serveur n'a pas reçu ton rapport : ${esc(err)}</p><button class="sg-btn" id="sg-retry">Réessayer l'envoi</button></div>`; ov.querySelector('#sg-retry').onclick = send; return; }
          const max = maxOf(lv), st = stars(r.score, r.all, max), left = r.tries - r.used;
          ov.innerHTML = `<div class="sg-card"><div class="sg-kick">PÔLE NORD S.A. · BILAN DE PERFORMANCE</div>
            <div class="sg-stars">${[0, 1, 2].map(i => `<span style="--d:${0.25 + i * 0.25}s" class="${i < st ? 'on' : ''}">${starSvg(i < st, 44)}</span>`).join('')}</div>
            <div class="sg-score" id="sg-sc">0</div>
            <p class="sg-brief">${esc(verdict(r.score, r.all, max))}</p>
            <div class="sg-stats"><span><b>+${Math.max(0, r.gained)}</b> flocons</span><span>Meilleur <b>${r.best}</b></span>${r.bonus ? `<span>Boules économisées <b>+${r.bonus}</b></span>` : ''}</div>
            <p class="sg-note">${r.gained > 0 ? 'Le Père Noël paie la différence avec ta meilleure partie, pas plus.' : 'Pas de progrès, pas de prime. Le Père Noël n\'est pas une œuvre de charité.'} Total : ${r.flocons} flocons.</p>
            ${left > 0 ? `<button class="sg-btn" id="sg-again">Rejouer (${left} essai${left > 1 ? 's' : ''})</button>` : ''}<button class="sg-btn ghost" id="sg-quit">Retour au calendrier</button></div>`;
          const num = ov.querySelector('#sg-sc'), t0 = performance.now(); const up = now => { const k = clamp((now - t0) / 1100, 0, 1); num.textContent = Math.round(r.score * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(up); }; raf = requestAnimationFrame(up);
          ov.querySelector('#sg-quit').onclick = close; const again = ov.querySelector('#sg-again'); if (again) again.onclick = () => intro(r);
        };
        const send = async () => { try { render(await api('/noel/snow/submit', { n, a: attempt, throws, ...(day ? { day } : {}) })); } catch (e) { render(null, e.message); } };
        await send();
      }
      raf = requestAnimationFrame(frame);
    }
    intro(info);
    return { close };
  }
  window.SnowGame = { open, get cur() { return cur; } };
})();
