# Noël : cartes, album, cadeau du 25, hotte (réservé à l'administrateur tant que l'événement n'est pas lancé pour tous)

Tout dépend de l'ouverture de l'événement pour le joueur (`Administration → Noël → Ouvrir pour moi seul`). Tant que c'est « moi seul », aucun joueur ne voit ni l'album, ni la hotte, ni l'envoi de photo.

## Calendrier
Les 24 cadeaux sont les mêmes, mais leur jour est mélangé (graine fixe, donc identique pour tous). Les textes restent liés au jour (la « grande porte » est toujours la 24). Le gros lot (150 pièces et 5 paquets) tombe toujours entre le 18 et le 24.

## Album de Noël
Cinq cartes légendaires : renne, sapin, Jésus, Marie, Noah. Récompense : 5 000 pièces. Les identifiants (90 000 001 et suivants) sont hors de la plage des vrais articles (le plus grand est 17 639 866) et sous le décalage des cartes shiny (100 000 000). Elles ne sortent jamais d'un paquet : on les obtient à la hotte.

Dessins : `Administration → Noël → Album de Noël`, un JPEG par carte. Sans dessin, la carte affiche ses deux premières lettres.

## Cadeau du 25 décembre
À partir du 25 décembre (heure de Paris), à la première ouverture de l'appli : animation « Il descend du ciel », puis chaque joueur reçoit la carte légendaire « Le Petit Jésus de l'entreprise » (une seule fois). L'administrateur peut revoir l'animation, recevoir la carte (jour simulé) et la reprendre à zéro, depuis le même écran. Mettre ta tête sur la carte : envoyer le dessin avec « Dessins des cartes ».

## Cartes des joueurs
Chaque joueur peut envoyer une photo (case de consentement obligatoire) depuis le calendrier. La photo n'est vue que par l'administrateur (jamais dans un fichier public) et peut être retirée par le joueur. Tu la confies à l'IA, puis dans `Administration → Noël → Photos des joueurs` tu colles l'article complet (style Wikipédia), le titre et le dessin final : la carte est créée (rareté ultra, non unique, échangeable). Elle entre alors dans la hotte pour tout le monde. Supprimer la carte la retire des collections.

## Hotte
Les flocons gagnés aux jeux se dépensent à la hotte : 60 flocons pour une carte au hasard parmi l'album et les cartes de joueurs, ou cinq tirages d'un coup. Les cartes sont non uniques et échangeables.

## Tests
`tests/noel-cards.mjs` (serveur) et `tests/noel-cards-ui.mjs` (interface, captures `nc-*.png`).
