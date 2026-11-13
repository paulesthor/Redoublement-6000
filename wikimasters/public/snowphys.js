// Boules de neige de Noël : niveaux et physique, PARTAGÉS entre le serveur et le téléphone (le même fichier est servi à l'appli).
// Le serveur rejoue chaque lancer pour calculer le score : le téléphone n'envoie que le vecteur de tir (deux entiers par boule).
// La simulation n'utilise que + − × ÷ et sqrt (arithmétique IEEE exacte) : aucun sin/cos, donc le même résultat sur tous les moteurs JavaScript.
(function (root) {
  'use strict';
  const W = 160, H = 100;                  // monde : 160 de large, 100 de haut (le sol est à y = 0, l'axe y monte)
  const G = 55, K = 1.15, DT = 1 / 120, MAXSTEPS = 840, BALL = 1.3, PMAX = 100, BALLS = 5;
  const LAUNCH = { x: 14, y: 9 };
  const TYPES = {                          // cibles : rayon, points, résistance, nom
    inspecteur: { r: 5, pts: 100, hp: 1, name: 'L\'inspecteur du travail' },
    delegue: { r: 4.5, pts: 130, hp: 1, name: 'Le délégué syndical' },
    renne: { r: 6, pts: 90, hp: 1, name: 'Le renne en burn-out' },
    comptable: { r: 3.6, pts: 170, hp: 1, name: 'Le comptable des cadeaux' },
    pere: { r: 8.5, pts: 450, hp: 3, name: 'Le Père Noël' },
  };
  const COMMON = ['inspecteur', 'delegue', 'renne', 'comptable'];

  function rng(seed) {                     // mulberry32 : entiers 32 bits, diviseur exact
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** Niveau n (1 à 24) : toujours le même pour un numéro donné. */
  function level(n) {
    n = Math.max(1, Math.min(24, Math.floor(n)));
    const R = rng(n * 2654435761 + 12345), boss = n % 6 === 0;
    const count = Math.min(5, 2 + Math.floor((n - 1) / 6) + (n > 3 && n % 2 === 1 ? 1 : 0));
    const targets = [];
    for (let i = 0; i < count; i++) {
      const type = boss && i === count - 1 ? 'pere' : COMMON[Math.floor(R() * COMMON.length)];
      const span = (150 - 76) / count;
      let x = 76 + span * i + span * (0.15 + R() * 0.55);
      if (i > 0) x = Math.max(x, targets[i - 1].x + 13);       // jamais une cible collée derrière une autre : toutes restent atteignables
      const plat = n < 3 ? 0 : [0, 0, 10, 20][Math.floor(R() * 4)];   // plateforme de glace sous la cible
      targets.push({ id: i, type, x: Math.round(x * 10) / 10, y: plat + TYPES[type].r, plat, r: TYPES[type].r, pts: TYPES[type].pts, hp: TYPES[type].hp });
    }
    const walls = [];
    const nw = n < 4 ? 0 : (n < 12 ? 1 : 2);
    for (let i = 0; i < nw; i++) walls.push({ x: Math.round((46 + i * 22 + R() * 12) * 10) / 10, y: 0, w: 4, h: Math.round((14 + R() * 9) * 10) / 10 });
    const wmax = 2 + n * 0.5, wind = [];
    for (let i = 0; i < BALLS; i++) wind.push(Math.round((R() * 2 - 1) * wmax * 10) / 10);
    return { n, boss, targets, walls, wind, balls: BALLS };
  }

  /** Une boule : (px, py) = vecteur de tir en entiers (la longueur est ramenée à PMAX au plus). Modifie l'état des cibles (hp). */
  function throwBall(lv, state, i, px, py) {
    px = Math.round(+px) || 0; py = Math.round(+py) || 0;
    const len = Math.sqrt(px * px + py * py);
    if (len > PMAX) { px = px * (PMAX / len); py = py * (PMAX / len); }
    let x = LAUNCH.x, y = LAUNCH.y, vx = px * K, vy = py * K;
    const ax = lv.wind[i] || 0, path = [[x, y]], hitR = BALL;
    let end = 'time', hit = null, down = false;
    for (let s = 1; s <= MAXSTEPS; s++) {
      vx += ax * DT; vy -= G * DT; x += vx * DT; y += vy * DT;
      if (s % 4 === 0) path.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
      if (y <= 0) { end = 'ground'; break; }
      if (x < -6 || x > W + 6 || y > H * 3) { end = 'out'; break; }
      let stop = false;
      for (const w of lv.walls) if (x + hitR > w.x && x - hitR < w.x + w.w && y - hitR < w.y + w.h) { end = 'wall'; stop = true; break; }
      if (stop) break;
      for (const t of lv.targets) {
        if (state.hp[t.id] <= 0) continue;
        const dx = x - t.x, dy = y - t.y, rr = t.r + hitR;
        if (dx * dx + dy * dy <= rr * rr) { state.hp[t.id] -= 1; hit = t.id; down = state.hp[t.id] <= 0; end = 'hit'; stop = true; break; }
      }
      if (stop) break;
    }
    path.push([Math.round(x * 100) / 100, Math.max(0, Math.round(y * 100) / 100)]);
    return { path, end, hit, down };
  }

  /** Partie complète : throws = [[px, py], ...] (au plus 5). Renvoie le score et le détail de chaque boule. */
  function play(lv, throws) {
    const state = { hp: lv.targets.map(t => t.hp) }, results = [];
    let score = 0, streak = 0;
    for (let i = 0; i < Math.min(lv.balls, throws.length); i++) {
      const r = throwBall(lv, state, i, throws[i][0], throws[i][1]);
      let pts = 0;
      if (r.hit !== null) { streak++; if (r.down) pts = Math.round(lv.targets[r.hit].pts * (1 + 0.2 * (streak - 1))); } else streak = 0;   // série : +20 % par touche consécutive
      score += pts; results.push({ ...r, pts, streak });
    }
    const all = state.hp.every(h => h <= 0), left = lv.balls - Math.min(lv.balls, throws.length);
    const bonus = all ? left * 30 : 0;
    return { score: score + bonus, bonus, all, results, hp: state.hp };
  }
  const flocons = score => Math.min(120, Math.floor(score / 6));   // 120 flocons au plus par jour pour ce jeu

  root.SnowPhys = { W, H, G, K, DT, BALL, PMAX, BALLS, LAUNCH, TYPES, rng, level, throwBall, play, flocons };
})(typeof globalThis !== 'undefined' ? globalThis : window);
