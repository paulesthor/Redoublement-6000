'use strict';
// Nouveautés affichées au joueur à l'ouverture du jeu après une mise à jour.
// RÈGLE : à chaque nouvelle version poussée (BUILD dans app.js), ajouter une entrée EN TÊTE de cette liste avec le même numéro de version.
// v : numéro (comme BUILD) · icon : emoji · title : titre court · items : [{ t: titre, d: description, go?: onglet à ouvrir }]
window.CHANGELOG = [
  { v: '6.2', icon: '✨', title: 'La page des nouveautés', items: [
    { t: 'Les nouveautés à chaque mise à jour', d: 'À l\'ouverture du jeu après une mise à jour, cette page te présente ce qui change, avec un bouton « Voir » pour y aller.' },
    { t: 'Revoir l\'historique', d: 'Dans Réglages, « Voir les nouveautés » rouvre toutes les mises à jour.', go: 'settings' } ] },
  { v: '6.1', icon: '💰', title: 'Gagne des pièces autrement', items: [
    { t: 'Bourse', d: 'Parie chaque jour sur la hausse ou la baisse des vues Wikipédia de 12 articles. Bon pari : ×1,8.', go: 'bourse' },
    { t: 'Plus ou moins', d: 'Devine quel article a le plus de vues. Chaque bonne réponse multiplie ta mise, encaisse quand tu veux.', go: 'hilo' },
    { t: 'Tendances et alertes', d: 'Les cartes qui montent et qui baissent aux enchères, et des alertes de prix.', go: 'trends' },
    { t: 'Banque', d: 'Épargne à 0,6 % par jour et dividendes quotidiens selon ta collection.', go: 'bank' },
    { t: 'Expéditions', d: 'Envoie tes doublons explorer le monde : ils reviennent avec des pièces, parfois un paquet.', go: 'expeditions' } ] },
  { v: '6.0', icon: '📦', title: 'Enchaîne les paquets', items: [
    { t: 'Ouvrir un autre paquet', d: 'Dans le résumé d\'un tirage, un bouton à droite relance directement un paquet, sans repasser par l\'accueil.' } ] },
  { v: '5.9', icon: '📚', title: 'Albums et paquets du jour', items: [
    { t: '41 albums thématiques', d: 'Dictateurs, footballeurs, philosophes, séries… Réunis toutes les cartes d\'un thème pour une récompense.', go: 'albums' },
    { t: 'Paquets du jour', d: 'Deux catégories tirées au sort chaque jour : les légendaires de ces paquets viennent toutes du thème.', go: 'themepacks' } ] },
  { v: '5.6', icon: '🏷️', title: 'Vendre plus vite', items: [
    { t: 'Mise en vente multiple', d: 'Dans la Collection, touche « Sélectionner », coche tes cartes puis « Vendre » : un prix par carte, une seule validation.', go: 'album' },
    { t: 'Total de tes ventes', d: 'Dans Marché, « Mes ventes » affiche les pièces que tu vas récupérer en ce moment.', go: 'market' } ] },
  { v: '5.3', icon: '🏆', title: 'Tournois', items: [
    { t: 'Tournois à 4 ou 8 joueurs', d: 'Misez des pièces et affrontez-vous en combats de cartes : la moitié haute gagne, la moitié basse perd sa mise.', go: 'tournaments' } ] },
  { v: '5.1', icon: '🪪', title: 'Ton profil, à ton image', items: [
    { t: 'Photo et titres', d: 'Ajoute une photo de profil et équipe un titre débloqué en jouant (23 titres).', go: 'customize' },
    { t: 'Réglages', d: 'Thèmes (sombre, clair, beige…), taille du texte, animations et vibrations.', go: 'settings' } ] },
  { v: '4.9', icon: '⚔️', title: 'Nouveaux combats', items: [
    { t: 'Duel à la mise', d: 'Chacun mise une carte, 6 questions par carte : le vainqueur garde les deux.', go: 'duel' },
    { t: 'Fusion de cartes', d: 'Fusionne tes doublons pour renforcer une carte (contour bronze, argent ou or).', go: 'album' } ] },
  { v: '4.4', icon: '🎁', title: 'Chaque jour, du nouveau', items: [
    { t: 'Récompense quotidienne', d: 'Une récompense à la première connexion du jour, avec une série de 7 jours.' },
    { t: 'Quêtes', d: 'Trois défis par jour et un bonus.', go: 'quests' },
    { t: 'Quiz du jour', d: 'Le même quiz pour tous : un paquet par bonne réponse, et le meilleur du classement gagne un paquet bonus.', go: 'dquiz' } ] },
];
