# Événement de Noël : fiche de cadrage (version à valider)

Chaque case ci-dessous a une valeur **par défaut** : rien n'est figé tant qu'elle n'est pas validée.

## 1. Thème global
| | Proposition |
|---|---|
| Nom | **Noël au Pôle Nord (S.A.)** |
| Univers | L'entreprise du Père Noël, vue par ses employés : patron, lutins, syndicat, rennes en burn-out, inspection du travail |
| Dates | du **mardi 1er décembre à minuit** au **vendredi 25 décembre à 18 h** (heure de Paris) |
| Monnaie de l'événement | **les flocons** |
| Gagnant | **le Père Noël** (le plus de flocons gagnés) : cagnotte, titre, cadre doré |
| Fin | clôture automatique (déjà en place), écran de fin avec podium et bilan personnel |

## 2. Ton
Humour noir d'entreprise, comme l'événement communiste : le Père Noël est un patron sympathique et inquiétant. Pas d'emoji. Exemples déjà écrits dans le calendrier : « Le bonheur est facultatif, la productivité non. » ; « Le syndicat obtient une pause. Elle dure quatre secondes. »

## 3. Couleurs et ambiance
- Vert sapin profond (fond), rouge bordeaux, or, blanc neige.
- Décor dessiné à la main par le calcul, comme pour les thèmes : guirlande de sapin, flocons détaillés, ruban, étoile de cimier. Pas d'image de banque.
- Musique : à décider (le mode URSS avait l'hymne ; pour Noël, soit rien, soit une boucle discrète libre de droits).

## 4. Les jeux
1. **Calendrier de l'Avent** (premier jet fait) : 24 portes, une par jour, rattrapage possible jusqu'au 25. Récompenses provisoires (wikibidou et paquets du jeu normal).
2. **Bataille de boules de neige** : on règle l'angle et la force pour lancer des boules sur des cibles (inspecteurs, bonhommes de neige, cheminée du patron), avec du vent. Un niveau par jour, rattaché à la porte du jour. **Anti-triche** : les niveaux (cibles, vent) sont tirés par le serveur ; le téléphone envoie seulement l'angle et la force de chaque lancer ; le serveur rejoue la trajectoire et calcule le score.
3. **L'Atelier des lutins** : les lutins construisent les cadeaux. Option retenue par défaut : **chaîne de montage en action** (pas d'idle) : des pièces arrivent sur des tapis, on les glisse vers la bonne machine avant qu'elles tombent. Postes de 90 secondes. Le **coup de fouet** accélère un poste mais énerve le lutin (grève si trop). Score converti en flocons, plafonné par jour.

Le Père Noël secret, l'enquête sur 25 jours et la livraison en traîneau restent des options pour plus tard.

## 5. Collection
Réservoir d'environ 1 200 articles sur le thème (traditions, hiver, cuisine, jouets, folklore, Pôle Nord), 6 raretés, **150 légendaires**, et la règle **« pas de doublon de légendaire » activée** (déjà codée dans `EVENT_RULES`, à passer à `true`).

## 6. Économie
Reprise de la structure de l'événement communiste : départ avec des flocons et des colis, 12 paliers (colis, titres, cadres, thèmes, wikibidou), taxe d'entrée versée à la cagnotte. Chiffres à équilibrer après les jeux, par simulation.

## 7. Calendrier de travail (objectif : prêt pour le 1er décembre)
| Période | Livrable |
|---|---|
| 13 → 15 nov | Cadrage validé, calendrier de l'Avent (fait en premier jet), thème visuel et décors |
| 16 → 22 nov | Bataille de boules de neige |
| 23 → 29 nov | L'Atelier des lutins |
| 28 nov → 1er déc | Réservoir de cartes, paliers, textes, tests, essai en conditions réelles, lancement |
Si le temps manque, on lance avec le calendrier, un jeu et la collection ; le deuxième jeu arrive en cours d'événement.

## 8. Décisions à valider
1. Nom, monnaie (« flocons »), gagnant (« le Père Noël »), dates.
2. Atelier : **chaîne de montage en action** (proposé) ou jeu de cartes.
3. Boules de neige : solo avec niveaux quotidiens (proposé), ou duel entre joueurs.
4. Musique : aucune, ou une boucle discrète.
