# Nouvelle interface (aperçu réservé à l'administrateur)

## Activer
Réglages → **Interface (aperçu administrateur)** → **Nouvelle interface**. Le réglage n'existe que pour le compte administrateur et n'a aucun effet sur les autres joueurs (la fonction `nuiOn()` exige `me.admin`). On peut le couper à tout moment : l'ancienne barre revient aussitôt.

Tout ce qui est décrit ici n'existe que dans cet aperçu : les CSS sont sous `body.nui`, les textes des thèmes d'événement ne s'appliquent que si `body` porte la classe `nui`, et les changements de comportement (barre d'événements, Réglages, Personnaliser) sont conditionnés par `nuiOn()`. Une seule correction de mise en forme est commune à tous : les rangées de boutons de la page Réglages passent à la ligne au lieu de déborder à 320 px.

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

## Événements en cours
Les événements ordinaires (heure dorée, week-end shiny, album éphémère « Coupe du monde »…) ne sont plus une barre de pastilles collée au bord de l'écran : ils sont listés, sans émoji, dans la section « En ce moment » de l'accueil (une ligne chacun : nom, courte description, durée restante). Seuls les avis système (sanction, remise à zéro, fin de saison, maintenance) restent en haut, alignés sur la marge de la page.

## Personnaliser (un seul onglet)
Menu → Personnaliser (l'ancien écran « Mon profil / titres » y renvoie) :
- **Profil** : photo, titre équipé, cadre de la photo ;
- **Titres** : rangés par thème ou événement (modes de jeu, exploits et collection, albums éphémères, défis et objectifs, saisons, Plan quinquennal, Camp du Goulag, Noël), repliés sauf le groupe du titre équipé, avec compteur par groupe ;
- **Badges** (succès) : rangés par famille (paquets, collection, raretés, combats, marché, social, économie) ;
- **Apparence** : thèmes classiques puis thèmes d'événement (verrouillés tant qu'ils ne sont pas gagnés), taille du texte.
Dans cet aperçu, Réglages ne contient plus l'apparence (un renvoi vers Personnaliser la remplace).

## Thèmes
Les couleurs et arrondis de la nouvelle interface viennent de variables définies par thème (`--nu-acc`, `--nu-acc-rgb`, `--nu-r`, `--nu-rs`, `--nu-pill`, section 1 du CSS) ; aucune couleur n'est écrite en dur dans les composants. Thèmes pris en charge : Sombre, Minuit, Océan, Forêt, Violet, Clair et Beige (page inversée par filtre : la couleur d'accent est donnée avant inversion), Automatique, et les trois thèmes d'événement Camarade, Sibérie et Or impérial (menus, titres et libellés renommés par `ussr-skin.js`, dictionnaires `NUI`, appliqués seulement dans la nouvelle interface ; arrondis et typographie du thème repris).

## Règles de mise en forme (vérifiées automatiquement)
- `tests/nui-ui.mjs` : 8 écrans, les 4 onglets de Personnaliser et le menu, à 320, 360, 390, 430, 768 et 1100 px ;
- `tests/nui-themes.mjs` : les 12 variantes de thème (dont Automatique clair et sombre), mise en forme à 390 et 320 px, **contraste mesuré sur les pixels affichés** (≥ 4), thème réellement appliqué, textes des thèmes d'événement ;
- `tests/nui-perso.mjs` : titres groupés et équipables, badges groupés, thème et taille du texte appliqués, cadre, Réglages ancien et nouveau, avis système alignés ;
- `tests/nui-audit.mjs` : les fonctions d'audit partagées (débordements, textes coupés, recouvrements, hauteurs inégales, zones tactiles ≥ 44 px, texte ≥ 10,5 px, dernier bloc jamais sous la barre du bas).

## Mettre en service pour tous
Remplacer `nuiOn()` par un test sans condition d'administrateur (par exemple un réglage serveur), retirer les anciennes entrées (`moreSheet`, tables `GROUP`/`EXTRA`, `views.customize`) et retirer la condition `body.nui` des textes de thèmes d'événement une fois la nouvelle interface validée.
