// Atelier des lutins : simulation PARTAGÉE entre le serveur et le téléphone (le même fichier est servi à l'appli).
// Le jeu avance par « ticks » entiers (10 par seconde, 900 ticks = un poste de 90 secondes) : aucune virgule flottante dans les règles,
// donc le même résultat partout. Le téléphone envoie seulement la liste de ses actions (tick, type, argument) ; le serveur rejoue tout.
(function (root) {
  'use strict';
  const TPS = 10, DUR = 900, LIFE = 42;                       // durée d'un poste ; temps qu'une pièce reste sur le tapis
  const WORK = 2200, BOOST = 170, W_T = 32, W_COOL = 6;        // travail par étape (en %), vitesse sous sifflet (%), durée du sifflet, délai entre deux sifflets
  const ST_ADD = 240, ST_DEC = 5, ST_MAX = 1000, STRIKE_T = 60, ST_AFTER = 450;   // stress : ajout par sifflet, baisse par tick, seuil de grève, durée de grève, stress après grève
  const GIFT_PTS = 100, LOST_PTS = 5, MAX_INPUTS = 600;
  const SLOTS = ['jouet', 'boite', 'ruban'];                  // ordre d'assemblage d'un cadeau

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /** Niveau n (1 à 24) : la liste des pièces qui arrivent sur le tapis, toujours la même pour un numéro donné. */
  function level(n) {
    n = Math.max(1, Math.min(24, Math.floor(n)));
    const R = rng(n * 40503 + 9), gap = Math.max(2, 3 - Math.floor((n - 1) / 12)), life = LIFE - 2 * Math.floor((n - 1) / 4), parts = [];
    for (let t = 3, id = 0; t < DUR - 6; t += gap + Math.floor(R() * 3), id++) parts.push({ id, t, type: SLOTS[Math.floor(R() * 3)], life });
    return { n, parts };
  }

  const create = () => ({ tick: 0, taken: {}, lost: 0, gifts: 0, elves: [0, 1].map(() => ({ need: 0, buf: [], prog: 0, stress: 0, boost: 0, cool: 0, strike: 0, gifts: 0 })) });
  const alive = (p, T) => !!p && T >= p.t && T < p.t + p.life;
  const accepts = (e, type) => e.strike === 0 && !e.buf.includes(type) && (type === SLOTS[e.need] || (SLOTS.indexOf(type) > e.need && e.buf.length < 1));   // la pièce attendue passe toujours ; on peut garder une seule pièce d'avance

  /** Une pièce touchée part chez le lutin qui la réclame (celui qui a le moins de pièces en main, puis le premier). Renvoie le lutin, ou -1. */
  function route(st, p) {
    let best = -1;
    for (let i = 0; i < st.elves.length; i++) { const e = st.elves[i]; if (!accepts(e, p.type)) continue; if (best < 0 || e.buf.length < st.elves[best].buf.length) best = i; }
    return best;
  }

  /** Un tick. acts = actions de ce tick : [kind, arg] avec kind 0 = toucher une pièce (arg = numéro), kind 1 = coup de sifflet sur un lutin (arg = 0 ou 1). */
  function step(st, lv, acts) {
    const T = st.tick, out = [];
    for (const a of acts || []) {
      if (a[0] === 0) {
        const p = lv.parts[a[1] | 0]; if (!alive(p, T) || st.taken[p.id]) continue;
        const e = route(st, p); if (e < 0) continue;
        st.taken[p.id] = 1; st.elves[e].buf.push(p.type); out.push({ k: 'take', id: p.id, elf: e });
      } else if (a[0] === 1) {
        const e = st.elves[a[1] | 0]; if (!e || e.cool > 0 || e.strike > 0) continue;
        e.boost = W_T; e.cool = W_COOL; e.stress += ST_ADD; out.push({ k: 'whistle', elf: a[1] | 0 });
        if (e.stress >= ST_MAX) { e.strike = STRIKE_T; e.stress = ST_AFTER; e.boost = 0; out.push({ k: 'strike', elf: a[1] | 0 }); }
      }
    }
    st.elves.forEach((e, i) => {
      if (e.strike > 0) { e.strike--; return; }
      e.stress = Math.max(0, e.stress - ST_DEC); if (e.cool > 0) e.cool--;
      const speed = e.boost > 0 ? BOOST : 100; if (e.boost > 0) e.boost--;
      const want = SLOTS[e.need], has = e.buf.indexOf(want);
      if (has >= 0) { e.prog += speed; if (e.prog >= WORK) { e.prog = 0; e.buf.splice(has, 1); e.need++; out.push({ k: 'step', elf: i, need: e.need }); if (e.need >= SLOTS.length) { e.need = 0; e.gifts++; st.gifts++; out.push({ k: 'gift', elf: i }); } } }
    });
    for (const p of lv.parts) if (p.t + p.life === T + 1 && !st.taken[p.id]) { if (st.elves.some(e => accepts(e, p.type))) { st.lost++; out.push({ k: 'lost', id: p.id }); } else out.push({ k: 'gone', id: p.id }); }
    st.tick++; return out;
  }

  const score = st => Math.max(0, st.gifts * GIFT_PTS - st.lost * LOST_PTS);
  const flocons = s => Math.min(120, Math.floor(s / 40));

  /** Partie complète : inputs = [[tick, kind, arg], ...]. Les actions invalides sont ignorées (comme sur le téléphone). */
  function play(lv, inputs) {
    const list = (Array.isArray(inputs) ? inputs : []).slice(0, MAX_INPUTS).map(a => [Math.floor(+a[0]), Math.floor(+a[1]), Math.floor(+a[2])]).filter(a => a[0] >= 0 && a[0] < DUR && (a[1] === 0 || a[1] === 1));
    list.sort((x, y) => x[0] - y[0]);
    const st = create(); let k = 0;
    for (let T = 0; T < DUR; T++) { const acts = []; while (k < list.length && list[k][0] === T) { acts.push([list[k][1], list[k][2]]); k++; } step(st, lv, acts); }
    return { score: score(st), gifts: st.gifts, lost: st.lost, elves: st.elves.map(e => e.gifts) };
  }

  root.ElfSim = { TPS, DUR, LIFE, WORK, BOOST, W_T, ST_MAX, STRIKE_T, SLOTS, GIFT_PTS, LOST_PTS, MAX_INPUTS, rng, level, create, step, alive, accepts, route, score, flocons, play };
})(typeof globalThis !== 'undefined' ? globalThis : window);
