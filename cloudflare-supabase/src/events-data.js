// Données des événements surprise : albums éphémères et défis de la semaine. Le calendrier, lui, est tiré au sort par events.js à partir d'un secret gardé en base.

/** Albums éphémères : 8 cartes chacun (les 8 premiers titres trouvés dans le catalogue, voir tools/build-event-albums.mjs). Disponibles 7 jours, récompense et titre exclusifs. */
export const EVENT_ALBUMS = [
  { id: 'halloween', months: [10, 11], name: 'Nuit d\'Halloween', emoji: '🎃', blurb: 'Monstres, légendes et frissons.',
    titles: ['Dracula', 'Frankenstein', 'Stephen King', 'Zombie', 'Vampire', 'Sorcière', 'Fantôme', 'Loup-garou', 'Halloween', 'Freddy Krueger', 'Michael Myers', 'Jason Voorhees', 'Squelette', 'Citrouille', 'Momie'] },
  { id: 'noel', months: [12, 1], name: 'Magie de Noël', emoji: '🎄', blurb: 'Traditions et douceurs de fin d\'année.',
    titles: ['Noël', 'Père Noël', 'Sapin de Noël', 'Bûche de Noël', 'Dinde', 'Saint-Nicolas', 'Cadeau', 'Neige', 'Hiver', 'Réveillon', 'Calendrier de l\'Avent', 'Rudolph', 'Épiphanie', 'Foie gras', 'Marché de Noël'] },
  { id: 'monde', months: [6, 7, 11, 12], name: 'Coupe du monde', emoji: '🏆', blurb: 'Les légendes du plus grand tournoi de football.',
    titles: ['Coupe du monde de football', 'Pelé', 'Diego Maradona', 'Zinédine Zidane', 'Kylian Mbappé', 'Lionel Messi', 'Cristiano Ronaldo', 'Équipe de France de football', 'Brésil', 'Argentine', 'Allemagne', 'Ronaldo', 'Michel Platini', 'Franz Beckenbauer', 'Johan Cruyff'] },
  { id: 'ete', months: [6, 7, 8], name: 'Plein été', emoji: '🏖️', blurb: 'Soleil, plage et vacances.',
    titles: ['Plage', 'Soleil', 'Vacances', 'Surf', 'Mer Méditerranée', 'Tour de France', 'Camping', 'Glace (dessert)', 'Crème glacée', 'Bikini', 'Piscine', 'Volley-ball de plage', 'Festival', 'Bronzage', 'Coup de soleil'] },
  { id: 'fantasy', name: 'Royaumes imaginaires', emoji: '🐉', blurb: 'Dragons, sorciers et épopées.',
    titles: ['Le Seigneur des anneaux', 'Harry Potter', 'Game of Thrones', 'Dragon', 'Elfe', 'Nain', 'Merlin', 'Excalibur', 'Gandalf', 'Dungeons & Dragons', 'Licorne', 'Sorcier', 'Troll', 'Hobbit', 'Le Trône de fer'] },
  { id: 'espace', name: 'Conquête spatiale', emoji: '🚀', blurb: 'Étoiles, fusées et pionniers du cosmos.',
    titles: ['Lune', 'Mars (planète)', 'Apollo 11', 'Neil Armstrong', 'Station spatiale internationale', 'Galaxie', 'Trou noir', 'SpaceX', 'Elon Musk', 'Youri Gagarine', 'NASA', 'Soleil', 'Voie lactée', 'Jupiter (planète)', 'Thomas Pesquet'] },
  { id: 'prehistoire', name: 'Âge des géants', emoji: '🦖', blurb: 'Dinosaures et premiers hommes.',
    titles: ['Tyrannosaurus', 'Vélociraptor', 'Mammouth', 'Diplodocus', 'Homo sapiens', 'Préhistoire', 'Jurassic Park', 'Dinosaure', 'Néandertal', 'Smilodon', 'Mésozoïque', 'Fossile', 'Lascaux', 'Australopithèque', 'Tricératops'] },
  { id: 'gourmand', name: 'Festin du monde', emoji: '🍕', blurb: 'Les saveurs qui font voyager.',
    titles: ['Pizza', 'Croissant', 'Baguette', 'Fromage', 'Chocolat', 'Sushi', 'Hamburger', 'Crêpe', 'Macaron', 'Pâtes alimentaires', 'Café', 'Vin', 'Raclette', 'Pain', 'Gastronomie française'] },
];
/** Albums de saison (months) : trois fois plus de chances de sortir pendant leurs mois ; les autres albums sortent toute l'année. */
export const EVENT_ALBUM = Object.fromEntries(EVENT_ALBUMS.map(a => [a.id, a]));

/** Défis de la semaine : l'événement (event) est compté par bumpQuests comme pour les quêtes du jour. Un défi est tiré au sort chaque lundi. */
export const WEEKLY = [
  { id: 'w_packs', text: 'Ouvre 40 paquets', event: 'open_pack', goal: 40 },
  { id: 'w_fights', text: 'Remporte 5 combats de cartes', event: 'battle_win', goal: 5 },
  { id: 'w_legend', text: 'Obtiens 2 cartes légendaires', event: 'legendary', goal: 2 },
  { id: 'w_new', text: 'Découvre 80 nouvelles cartes', event: 'new_cards', goal: 80 },
  { id: 'w_fuse', text: 'Fusionne 4 fois', event: 'fuse', goal: 4 },
  { id: 'w_duel', text: 'Gagne 5 duels de quiz', event: 'duel_win', goal: 5 },
  { id: 'w_quiz', text: 'Réponds juste à 15 questions du quiz du jour', event: 'quiz_correct', goal: 15 },
  { id: 'w_trade', text: 'Termine 2 échanges', event: 'trade_done', goal: 2 },
  { id: 'w_sale', text: 'Vends 3 cartes aux enchères', event: 'sale_done', goal: 3 },
  { id: 'w_exp', text: 'Lance 4 expéditions', event: 'expedition', goal: 4 },
  { id: 'w_rare', text: 'Obtiens 40 cartes rares ou mieux', event: 'rare_plus', goal: 40 },
  { id: 'w_spend', text: 'Dépense 1 500 pièces', event: 'spend', goal: 1500 },
  { id: 'w_auction', text: 'Remporte 3 enchères', event: 'win_auction', goal: 3 },
  { id: 'w_correct', text: 'Réponds juste à 40 questions de combat', event: 'battle_correct', goal: 40 },
  { id: 'w_bourse', text: 'Place 5 paris à la Bourse', event: 'bourse_bet', goal: 5 },
];
export const WEEKLY_BY = Object.fromEntries(WEEKLY.map(w => [w.id, w]));
