# Nouvelle interface (aperçu réservé à l'administrateur)

## Activer
Réglages → **Interface (aperçu administrateur)** → **Nouvelle interface**. Le réglage n'existe que pour le compte administrateur et n'a aucun effet sur les autres joueurs (la fonction `nuiOn()` exige `me.admin`). On peut le couper à tout moment : l'ancienne barre revient aussitôt.

## Structure
Barre du bas à **5 entrées** : Accueil · Collection · Jouer · Marché · Menu.

| Entrée | Contenu |
|---|---|
| Accueil | paquet (mêmes boutons et même logique qu'avant), bloc « Aujourd'hui » (Quiz, Quêtes, Banque si des dividendes de collection attendent), « En ce moment » (événements) |
| Collection | recherche, ma collection, albums, échanges, expéditions |
| Jouer | événement du moment, combats, tournois, quiz, quêtes, plus ou moins, événements ; démos en administrateur |
| Marché | marché des joueurs ; banque, bourse, paquets du jour, tendances |
| Menu | liste : récompense du jour (si à récupérer), communauté (fil, messages, amis, classement), mon compte (profil, succès, personnaliser, réglages), administration |

Les anciens écrans sont conservés : seuls le rangement et l'accueil changent. Chaque sous-écran reçoit un bouton « ‹ parent » (table `NPARENT`) et l'entrée de la barre qui le contient s'allume (table `NGROUP`).

## Tuile Banque
Visible seulement s'il y a des **dividendes de collection** à récupérer (jamais pour les intérêts de l'épargne). Un toucher les récupère directement (`/api/bank/dividends/claim`) et la tuile disparaît. La récompense du jour n'est plus sur l'accueil : elle s'affiche d'elle-même à l'arrivée, et reste dans le Menu tant qu'elle n'est pas récupérée.

## Règles de mise en forme (vérifiées par `tests/nui-ui.mjs`, à 320, 360, 390, 430, 768 et 1100 px)
- aucun débordement horizontal de la page ni d'un bloc hors de son conteneur ;
- aucun texte coupé (les textes passent à la ligne) et aucun recouvrement entre blocs voisins ;
- hauteurs égales pour les tuiles d'une même grille ;
- zones tactiles d'au moins 44 px, texte d'au moins 10,5 px ;
- le dernier bloc ne passe jamais sous la barre du bas ;
- espacements en multiples de 4 (8, 12, 20).

## Mettre en service pour tous
Remplacer `nuiOn()` par un test sans condition d'administrateur (par exemple un réglage serveur), puis retirer les anciennes entrées (`moreSheet`, tables `GROUP`/`EXTRA`) une fois la nouvelle interface validée.
