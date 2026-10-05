'use strict';
// Réglages du jeu : tout ce qui touche à l'équilibrage est ici.
module.exports = {
  START_COINS: 200,
  START_PACKS: 5,

  PACK_SIZE: 10,               // cartes par booster
  PACK_EVERY: 10 * 60 * 1000,  // un booster gratuit toutes les 10 min
  PACK_MAX: 10,                // stock max de boosters gratuits
  PACK_PRICE: 60,              // prix d'un booster acheté (ouvert immédiatement)
  GUARANTEE_RARE: true,        // au moins une carte rare ou mieux par booster

  // Probabilités de drop (poids relatifs, par carte)
  DROP: { common: 70, rare: 22, epic: 6, legendary: 2 },

  // Gain quand on défausse une carte
  SELL: { common: 3, rare: 12, epic: 50, legendary: 200 },

  // Valeur pour le classement
  POINTS: { common: 1, rare: 5, epic: 20, legendary: 50 },

  // Combat : équipe de 3 cartes, une manche par carte
  BATTLE_ROUNDS: 3,
  BATTLE_WIN: 50, BATTLE_LOSE: 10, BATTLE_DRAW: 25,
  QUIZ_WIN: 50, QUIZ_LOSE: 10, QUIZ_DRAW: 25,
};
