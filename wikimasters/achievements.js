// Succès : définition commune (la version Node est générée par scripts/sync-achievements.sh à partir de ce fichier).
// k = clé, t = titre, d = description, s = statistique suivie, n = seuil, r = récompense en pièces
const ACH = [
  { k: 'pack1', t: 'Premier paquet', d: 'Ouvre un paquet', s: 'packs', n: 1, r: 20 },
  { k: 'pack10', t: 'Habitué', d: 'Ouvre 10 paquets', s: 'packs', n: 10, r: 50 },
  { k: 'pack50', t: 'Collectionneur compulsif', d: 'Ouvre 50 paquets', s: 'packs', n: 50, r: 150 },
  { k: 'pack200', t: 'Machine à paquets', d: 'Ouvre 200 paquets', s: 'packs', n: 200, r: 500 },
  { k: 'uni10', t: 'Début de collection', d: 'Possède 10 cartes différentes', s: 'uniques', n: 10, r: 30 },
  { k: 'uni50', t: 'Album bien rempli', d: 'Possède 50 cartes différentes', s: 'uniques', n: 50, r: 100 },
  { k: 'uni150', t: 'Encyclopédiste', d: 'Possède 150 cartes différentes', s: 'uniques', n: 150, r: 300 },
  { k: 'uni500', t: 'Bibliothèque vivante', d: 'Possède 500 cartes différentes', s: 'uniques', n: 500, r: 1000 },
  { k: 'rare1', t: 'Belle prise', d: 'Obtiens une carte rare ou mieux', s: 'rare', n: 1, r: 30 },
  { k: 'super1', t: 'Éclat rose', d: 'Obtiens une super rare ou mieux', s: 'super', n: 1, r: 60 },
  { k: 'ultra1', t: 'Pépite', d: 'Obtiens une ultra rare ou mieux', s: 'ultra', n: 1, r: 150 },
  { k: 'legend1', t: 'Légende vivante', d: 'Obtiens une carte légendaire', s: 'legendary', n: 1, r: 400 },
  { k: 'shiny1', t: 'Chasseur de shiny', d: 'Obtiens une carte shiny', s: 'shiny', n: 1, r: 500 },
  { k: 'win1', t: 'Première victoire', d: 'Gagne un combat ou un quiz', s: 'wins', n: 1, r: 30 },
  { k: 'win10', t: 'Duelliste', d: 'Gagne 10 combats', s: 'wins', n: 10, r: 100 },
  { k: 'win50', t: 'Champion', d: 'Gagne 50 combats', s: 'wins', n: 50, r: 400 },
  { k: 'sold1', t: 'Premier marché', d: 'Vends une carte aux enchères', s: 'sold', n: 1, r: 30 },
  { k: 'sold10', t: 'Commerçant', d: 'Vends 10 cartes aux enchères', s: 'sold', n: 10, r: 150 },
  { k: 'won1', t: 'Bonne affaire', d: 'Remporte une enchère', s: 'won', n: 1, r: 30 },
  { k: 'fr1', t: 'Pas seul', d: 'Ajoute un ami', s: 'friends', n: 1, r: 30 },
  { k: 'fr5', t: 'Bande de potes', d: 'Aie 5 amis', s: 'friends', n: 5, r: 100 },
  { k: 'coin1000', t: 'Épargnant', d: 'Possède 1 000 pièces', s: 'coins', n: 1000, r: 100 },
];
const achievements = stats => ACH.map(a => ({ ...a, value: Math.min(stats[a.s] || 0, a.n), done: (stats[a.s] || 0) >= a.n }));
/** Statistiques à partir des lignes { rarity, shiny, n } de l'inventaire. */
function statsFromInventory(rows, order) {
  const out = { uniques: 0, rare: 0, super: 0, ultra: 0, legendary: 0, shiny: 0 };
  for (const r of rows) {
    out.uniques += r.n; if (r.shiny) out.shiny += r.n;
    const k = order.indexOf(r.rarity);
    for (const name of ['rare', 'super', 'ultra', 'legendary']) if (k >= order.indexOf(name)) out[name] += r.n;
  }
  return out;
}
module.exports = { ACH, achievements, statsFromInventory };
