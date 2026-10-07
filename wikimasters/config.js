'use strict';
// Réglages du jeu : tout ce qui touche à l'équilibrage est ici.
const RARITIES = ['common', 'uncommon', 'rare', 'super', 'ultra', 'legendary'];
module.exports = {
  RARITIES,
  LABELS: { common: 'Commune', uncommon: 'Peu commune', rare: 'Rare', super: 'Super rare', ultra: 'Ultra rare', legendary: 'Légendaire' },

  START_COINS: 200,
  START_PACKS: 10,

  PACK_SIZE: 10,               // cartes par booster
  PACK_EVERY: 10 * 60 * 1000,  // un booster gratuit toutes les 10 min
  VERSION: '3.1',              // numéro de build affiché dans le profil (à incrémenter à chaque mise à jour)
  PACK_MAX: 1e9,               // pas de plafond : les boosters gratuits s'accumulent (1 toutes les 10 min) même si on ne se connecte pas
  PACK_PRICE: 60,              // prix d'un booster acheté (ouvert immédiatement)

  // Part de chaque rareté dans le catalogue (%), appliquée au classement par popularité lors du `seed`.
  CATALOG_SHARE: { common: 50.25, uncommon: 20, rare: 20, super: 7, ultra: 2.5, legendary: 0.25 },
  // Poids de tirage. Par défaut = parts du catalogue, donc tirage uniforme sur tous les articles.
  GODPACK_CHANCE: 0.001,       // chance qu'un paquet soit un GODPACK (10 cartes ultra rares ou légendaires) : 1 sur 1 000
  GODPACK_LEGEND: 0.2,         // dans un godpack, part des cartes légendaires (au moins une est garantie)
  DROP: { common: 50.25, uncommon: 20, rare: 20, super: 7, ultra: 2.5, legendary: 0.25 },

  // Plage de la meilleure statistique (ATK ou DEF) ; l'autre vaut au moins 50 % de la première.
  STAT_RANGE: { common: [0, 2000], uncommon: [1500, 3500], rare: [3000, 5500], super: [5000, 7500], ultra: [7000, 9000], legendary: [8500, 10000] },
  SHINY_CHANCE: 0.01,          // chance qu'une légendaire tirée soit shiny
  SHINY_RANGE: [10001, 15000],

  // Gain quand on défausse une carte
  SELL: { common: 1, uncommon: 2, rare: 5, super: 15, ultra: 50, legendary: 200 },
  // Valeur pour le classement
  POINTS: { common: 1, uncommon: 2, rare: 5, super: 10, ultra: 25, legendary: 100 },

  // Réserve d'articles déjà enrichis (description + image) tenue prête en mémoire, par rareté
  RESERVE: { common: 50, uncommon: 25, rare: 25, super: 12, ultra: 6, legendary: 3 },

  // Combat : équipe de 3 cartes, une manche par carte
  BATTLE_ROUNDS: 3,
  BATTLE_WIN: 50, BATTLE_LOSE: 10, BATTLE_DRAW: 25,
  QUIZ_WIN: 50, QUIZ_LOSE: 10, QUIZ_DRAW: 25,
};
