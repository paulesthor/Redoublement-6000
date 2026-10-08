'use strict';
// Nouveautés affichées au joueur à l'ouverture du jeu après une mise à jour.
// RÈGLE : à chaque nouvelle version poussée (BUILD dans app.js), ajouter une entrée EN TÊTE de cette liste avec le même numéro de version.
// v : numéro (comme BUILD) · icon : emoji · title : titre court · items : [{ t: titre, d: description, go?: onglet à ouvrir }]
window.CHANGELOG = [
  { v: '6.8', icon: '🔞', title: 'Nouvel album : Stars du X', items: [
    { t: 'Album « Stars du X »', d: 'Une nouvelle catégorie de cartes légendaires (6 cartes) avec sa récompense, et des paquets thématiques possibles. Réservé aux adultes.', go: 'album' } ] },
  { v: '6.7', icon: '🧠', title: 'Questions de combat corrigées', items: [
    { t: 'Retour des questions sur l\'article', d: 'Depuis la migration, le modèle d\'IA n\'était plus appelé et les combats retombaient sur les questions génériques (« à propos de… », « quel article est le plus consulté »). C\'est corrigé.' } ] },
  { v: '6.6', icon: '🧠', title: 'Questions de combat : diagnostic', items: [
    { t: 'Suivi des questions IA', d: 'Si le modèle ne produit pas de questions, la raison est maintenant enregistrée et visible côté administration (Aperçu).' } ] },
  { v: '6.5', icon: '🔎', title: 'Recherche de carte & classement', items: [
    { t: 'Retrouve une carte précise', d: 'Dans Recherche, chaque carte indique si tu la possèdes ou si tu l\'as déjà eue un jour (avec la date de première obtention), même vendue ou échangée depuis.', go: 'search' },
    { t: 'Classement plus discret', d: 'Les pièces des autres joueurs ne sont plus affichées.', go: 'rank' } ] },
  { v: '6.4', icon: '🧭', title: 'Expéditions plus simples', items: [
    { t: 'Sélection en un geste', d: 'Touche une carte pour l\'envoyer en expédition (plus de défilement sur le côté), « Remplir automatiquement » choisit les doublons les moins rares, et le bouton Envoyer reste toujours visible.', go: 'expeditions' },
    { t: 'Plus ou moins : 2 parties par jour', d: 'La limite quotidienne passe de 6 à 2 parties.', go: 'hilo' } ] },
  { v: '6.3', icon: '🎲', title: 'Parie sur les combats', items: [
    { t: 'Combats en direct', d: 'Dans l\'onglet Combats, « En direct » liste les combats en cours entre joueurs, avec la cagnotte et les cotes.', go: 'duel' },
    { t: 'Miser sur ton favori', d: 'Choisis le joueur et ta mise (10 à 500 pièces) jusqu\'au 2ᵉ tour. Ton joueur gagne : tu reprends ta mise + 75 % de la cagnotte des perdants.' },
    { t: 'Le vainqueur est récompensé', d: 'Le combattant qui gagne empoche aussi 25 % de la cagnotte perdante : une raison de plus de gagner !' } ] },
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
