# Rapport de tests : mode communiste (version 10.16)

Tout a été testé dans Chromium aux tailles d'iPhone (375×667, 390×844, 393×852, 430×932). Rien n'a été vérifié sur un vrai iPhone.

## Résultat global
| Campagne | Résultat |
|---|---|
| Suite serveur complète (25 modules, 878 vérifications) | tout passe |
| Plan quinquennal, 8 joueurs simulés en parallèle (`plan-multi`) | tout passe, après correction d'un défaut |
| Interface (Camp, URSS, habillage, Plan, Jeux, icône, Tsar) : 76 vérifications | tout passe |
| Audit visuel du mode communiste, 21 écrans × 4 tailles | aucun débordement, texte coupé ou chevauchement |
| Audit de mise en page général (tous les onglets, avec et sans habillage) | aucun débordement |
| Simulation du Dernier Tsar : 40 parties, 5 profils | aucune partie bloquée, aucune erreur JavaScript |

## Défaut trouvé et corrigé
Quand un joueur réclamait deux paliers différents en même temps (deux onglets, deux appareils), l'un des deux pouvait être perdu : le serveur comparait la liste complète des paliers déjà pris. Le Plan et le Camp relisent maintenant l'état et réessaient (12 essais). Une récompense n'est toujours versée qu'une seule fois.

## Plan quinquennal : 8 joueurs en parallèle
- Gains de 100 à 6 000 ₽, tous les paliers réclamés deux fois à la fois par chacun.
- Chaque joueur reçoit exactement les paliers atteints, ni plus ni moins (colis, wikiroubles, titres).
- Le thème rouge n'est donné qu'à partir du palier 6.
- Un joueur ordinaire est refusé (403) sur toutes les routes du Plan et du Camp.
- La remise à zéro n'efface que le joueur concerné.
- Rafale : 4 paliers différents réclamés d'un coup par le même joueur : tous versés une fois.
- Camp : le dernier palier est refusé avant les 60 h minimum, pour tous.

## Rythme de l'événement (simulation, seuils 120 à 4 800 ₽)
| Profil | Thème rouge (palier 6) | Fin (palier 12) |
|---|---|---|
| Occasionnel (10 min/j, saute 1 jour sur 4) | 86 % | 0 % |
| Léger (15 min/j) | 99 % | 11 % |
| Régulier (30 min/j) | 100 %, jour 2 | 94 %, jour 4 |
| Assidu (60 min/j) | 100 % | 100 %, jour 4 |
| Acharné (120 min/j) | 100 % | 100 %, jour 4 |

Les gains par jeu sont des hypothèses : aucun jeu ne verse encore de vrais wikiroubles.

## Le Dernier Tsar : 8 parties par profil, dans le vrai jeu
| Profil | Fins obtenues | Durée moyenne |
|---|---|---|
| Au hasard | samovar 2, ours 2, hardbass 1, fast-food 1, câlin 1, trop discret 1 | 7,8 jours |
| Bâtisseur | train 3, samovar 1, ours 1, échec train 2, échec samovar 1 | 5 jours |
| Toujours oui | train 5, échec train 2, échec samovar 1 | 4,1 jours |
| Toujours non | « Trop discret » 8 fois sur 8 | 11 jours |
| Prudent | samovar 3, ours 2, échec ours 2, échec samovar 1 | 6,8 jours |

À équilibrer : refuser tout mène toujours à « Trop discret » ; la fin « Mort naturelle » n'est jamais atteinte ; les « oui partout » finissent presque toujours par le train.

Visuel et parcours vérifiés : briefing, dialogue, 4 lieux (cuisine, gare, ménagerie, salle à manger), objets posés sur la table (fiole, horaire, invitation), allié (garde, ours), 13 fins jouées à l'écran. Aucune émoticône dans le jeu.

## Limites
- Hymne de l'URSS : le lecteur est prêt, mais le fichier `ussr-hymne.mp3` n'est pas dans le dépôt (téléchargement refusé par Wikimedia : trop de requêtes).
- Correctif du contour bleu de l'onglet (survol collé iOS) : non reproductible hors iPhone, à confirmer.
- Symboles ★ ✦ ✕ : déjà présents dans l'appli d'origine (Archives, menus).
- Les récompenses « cadres » et « souvenirs » sont enregistrées mais pas encore visibles dans l'appli.
