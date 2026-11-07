// Simulation de l'événement communiste : en combien de jours les joueurs atteignent-ils chaque palier ?
// Chaque jeu : gain moyen par action, minutes par action, plafond de gain par jour (₽), variabilité.
const SCALE = +(process.env.SCALE || 1);
const PALIERS = [120, 400, 720, 1100, 1600, 2100, 2550, 3050, 3500, 3900, 4300, 4800];
const rnd = (a, b) => a + Math.random() * (b - a);
// gain = [min, max] par action ; mins = durée d'une action ; cap = plafond ₽/jour ; max = nombre max d'actions/jour
const GAMES = {
  lecon:      { gain: [100, 150], mins: 3,   cap: 150, max: 1 },
  pravda:     { gain: [60, 100],  mins: 2,   cap: 100, max: 1 },
  brigade:    { gain: [150, 250], mins: 1.5, cap: 400, max: 2 },
  camp:       { gain: [70, 100],  mins: 4,   cap: 250, max: 2 },     // un « plan accompli » : quelques passages de 4 min dans la journée
  patates:    { gain: [60, 90],   mins: 5,   cap: 150, max: 2 },
  stakhanov:  { gain: [30, 80],   mins: 0.7, cap: 200, max: 4 },
  plusmoins:  { gain: [15, 40],   mins: 0.6, cap: 200, max: 8 },
  duels:      { gain: [30, 60],   mins: 5,   cap: 150, max: 3 },      // gain par victoire, ~50 % de victoires → 5 min par action utile
  marche:     { gain: [40, 110],  mins: 3,   cap: 150, max: 2 },
};
// profils : minutes par jour (moyenne), probabilité de manquer un jour
const PROFILS = {
  'Occasionnel (10 min/j, saute 1 jour sur 4)': { mins: 10, skip: 0.25 },
  'Léger (15 min/j)':                           { mins: 15, skip: 0.1 },
  'Régulier (30 min/j)':                        { mins: 30, skip: 0.05 },
  'Assidu (60 min/j)':                          { mins: 60, skip: 0 },
  'Acharné (120 min/j)':                        { mins: 120, skip: 0 },
};
const DAYS = +(process.env.DAYS || 5);
function simPlayer(p) {
  let earned = 0; const reached = Array(PALIERS.length).fill(null);
  for (let d = 1; d <= DAYS; d++) {
    if (Math.random() < p.skip) continue;
    let budget = p.mins * rnd(0.7, 1.3);
    const todays = Object.fromEntries(Object.keys(GAMES).map(k => [k, { n: 0, got: 0 }]));
    // le joueur choisit d'abord les jeux les plus rentables par minute
    const order = Object.keys(GAMES).sort((a, b) => avg(GAMES[b]) / GAMES[b].mins - avg(GAMES[a]) / GAMES[a].mins);
    for (const k of order) {
      const g = GAMES[k];
      while (budget >= g.mins && todays[k].n < g.max && todays[k].got < g.cap) {
        const gain = Math.min(rnd(g.gain[0], g.gain[1]), g.cap - todays[k].got);
        todays[k].n++; todays[k].got += gain; earned += gain; budget -= g.mins;
        for (let i = 0; i < PALIERS.length; i++) if (reached[i] == null && earned >= PALIERS[i]) reached[i] = d - 1 + 1 - budget / (p.mins * 1.0 + 1e-9) * 0; // jour entier d
      }
    }
  }
  return { earned, reached };
}
const avg = g => (g.gain[0] + g.gain[1]) / 2;
const N = 3000, pct = (a, q) => a.sort((x, y) => x - y)[Math.floor(q * (a.length - 1))];
const maxDay = Object.values(GAMES).reduce((t, g) => t + Math.min(g.cap, g.max * g.gain[1]), 0);
console.log(`Jours simulés : ${DAYS} · gain maximal théorique par jour (tout plafonné) : ${Math.round(maxDay)} ₽\n`);
for (const [name, p] of Object.entries(PROFILS)) {
  const res = Array.from({ length: N }, () => simPlayer(p));
  const tot = res.map(r => r.earned);
  const fin = i => res.filter(r => r.reached[i] != null).length / N;
  const med = i => { const v = res.map(r => r.reached[i]).filter(x => x != null); return v.length ? `jour ${pct(v, 0.5)}` : '—'; };
  console.log(`${name}\n  total médian ${Math.round(pct(tot, 0.5))} ₽ (10 % : ${Math.round(pct(tot, 0.1))} · 90 % : ${Math.round(pct(tot, 0.9))})`);
  console.log(`  palier 2 (souvenir 1) : ${Math.round(fin(1) * 100)} % · médiane ${med(1)}   |  palier 6 (thème rouge) : ${Math.round(fin(5) * 100)} % · ${med(5)}`);
  console.log(`  palier 11 (souvenir 2) : ${Math.round(fin(10) * 100)} % · ${med(10)}   |  palier 12 (fin) : ${Math.round(fin(11) * 100)} % · ${med(11)}\n`);
}
