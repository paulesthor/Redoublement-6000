# Feuille de route : créer un événement (modèle : « mode communiste », build 10.38)

**Principe : on garde la structure, on change l'habillage.**
Pour un nouvel événement, tu m'envoies seulement **4 choses** (le brief). Je m'occupe de tout le reste : cartes, économie, paliers, jeux, pages, textes, couleurs, tests, mise en ligne.

---------------------------------------------------------------------

## PARTIE 1 : CE QUE TU M'ENVOIES (le brief)

Copie ce modèle, remplis-le, envoie-le moi. Quelques lignes par point suffisent.

```
1. THÈME GLOBAL
   - Nom de l'événement :
   - Univers (une phrase) : ex. « Égypte antique », « Halloween », « Far West »
   - Durée voulue (jours) et période :
   - Nom de la monnaie d'événement : (ex. « wikiroubles » ₽, « deniers », « bonbons »)
   - Nom du gagnant (l'équivalent de « Staline ») :

2. TON DES TEXTES
   - Registre : humour noir / absurde / épique / mignon / vulgaire…
   - Personnage qui parle (le « camarade », le « pharaon », le « sorcier »…) :
   - Ce qui est interdit (ex. pas d'emoticônes) :
   - 3 phrases d'exemple dans le ton voulu :

3. COULEURS ET AMBIANCE
   - 2 à 3 couleurs principales (codes ou noms) + une couleur d'accent :
   - Style des cartes / du fond (ex. papier vieilli, néon, parchemin) :
   - Musique d'ambiance (fichier mp3) ou « aucune » :
   - Icône de l'appli pendant l'événement (image) ou « aucune » :

4. IDÉES DE JEUX
   - Jeux de l'événement (ex. 3 à 5) : une phrase par jeu, avec ce qui rapporte des points
   - Jeux existants à réutiliser en les rhabillant : Camp (idle), Patates (clicker),
     quiz du jour, Marché noir (bourse), scénario à choix (type Reigns)
   - Un jeu « signature » nouveau (facultatif) :
```

Tu peux aussi me dire : la taxe d'entrée, la difficulté (casual / régulier / hardcore), ce que les joueurs gardent à la fin.
**Si une case est vide, je choisis une valeur par défaut raisonnable et je te la montre avant de la figer.**

---------------------------------------------------------------------

## PARTIE 2 : CE QUE JE FAIS (le pipeline)

| # | Étape | Ce que je produis | Ce que tu valides |
|---|---|---|---|
| 1 | Cadrage | Fiche récapitulative : monnaie, taxe, plafonds par jeu, 12 paliers, durée | Les chiffres |
| 2 | Cartes | ≈1 200 articles du thème, 6 raretés (légendaire ≈12 %), vérifiés et sans intrus | Un échantillon de titres |
| 3 | Économie | Paliers, récompenses (colis, monnaie, titres, cadres, thèmes, souvenirs, wikibidou du mode classique), points de collection | Le tableau des paliers |
| 4 | Habillage | Thème CSS, textes réécrits dans ton ton, bandeau d'actualités (≈100 lignes), icône, musique | Une capture de chaque écran |
| 5 | Jeux | Les jeux demandés, rhabillés ou créés, avec plafonds et récompenses côté serveur | Une partie test |
| 6 | Pages | Annonce de début, route des paliers, podium, classement, règlement, fin, tambour de fin | Les captures |
| 7 | Tests | Suite serveur + suite iPhone (390×844) + simulation de plusieurs joueurs et plusieurs jours | Le rapport |
| 8 | Test réel | Événement ouvert **pour toi seul** | Ton essai sur iPhone |
| 9 | Lancement | Bouton « Lancer pour TOUS » (Administration → Événement) | La date |
| 10 | Fin | Gagnant, cagnotte, souvenirs, retour au thème normal | — |

Livrable à chaque étape : un build poussé, un message de ce qui change, ce qu'il reste.

---------------------------------------------------------------------

## PARTIE 3 : LA STRUCTURE QUI NE CHANGE PAS

Ces briques sont déjà là et servent à tous les événements :

- **Monnaie d'événement** gagnée en jouant, dépensée en colis, avec plafond par jour et par jeu (anti-triche : tout gain est calculé côté serveur).
- **Taxe d'entrée** versée à une **cagnotte** ; le premier du classement la remporte.
- **12 paliers** (colis, monnaie, titres, cadres, thèmes, 2 souvenirs, wikibidou du mode classique).
- **Collection** : réservoir thématique, colis de 10 fiches, points de palier pour chaque nouvelle fiche (+ prime par 50 fiches différentes).
- **Départ** : 500 unités de monnaie + 10 colis.
- **Pages** : annonce, route des paliers, podium + classement général, règlement, fin et choix des souvenirs.
- **Pilotage admin** (Administration → Événement) : ouvrir pour moi seul, lancer pour tous, fermer, clore + gagnant, clore les souvenirs, repartir de zéro.
- **Fin** : souvenirs qui entrent dans la collection normale avec un tampon, thèmes et titres gardés.

---------------------------------------------------------------------

## PARTIE 4 : OÙ SE TROUVE QUOI (pour mon usage)

### Serveur (`cloudflare-supabase/src/`)
`plan.js` (`COMMU`, `PLAN_MILESTONES`, routes `/api/commu/*` et `/api/plan/*`, `credit()`), `commu-cards.js` (réservoir, tirage, `NEW_POINTS`, `COLLECTION_BONUS`), `commu-bourse.js` (Marché noir), `game.js` (titres), `index.js` (branchement, quiz), `schema.pg.sql`, `config.js` (VERSION).

### Client (`wikimasters/public/`, copie dans `cloudflare/public/`)
`app.js` (état `commu`, vues `eventPacks`, `eventAlbum`, `plan`, `commutop`, `commurules`, `commustart`, `commuend`, `rank`, onglet admin), `ussr-skin.js` (textes, actualités, icône, hymne), `ussrpack.js` / `reveal.js` (ouvertures), `reigns.js` (jeu à scénarios), `style.css`, `install.html`, `catalog/commu.json`.

### Outils
`tools/commu-titles.json`, `tools/commu-extra.txt`, `tools/build-commu.py` (fabrique les cartes sans réseau).

### Tests
Serveur : `plan`, `plan-multi`, `commu`, `commu-scope`, `commu-games`. Interface : `commu-ui`, `commu-ui2`, `commu-end`, `start`, `podium`, `avatar`, `tsar-*`, `hymn-ui`, `icon-ui`, `ten-ui`, audits. Les `.mjs` d'interface s'assemblent : `cat tests/jeux-head.part tests/<nom>-body.part > tests/<nom>.mjs` (modifier le `.part`).

---------------------------------------------------------------------

## PARTIE 5 : LE CHANTIER À FAIRE UNE FOIS POUR QUE TOUT SOIT PILOTÉ PAR LE BRIEF

Aujourd'hui, le thème communiste est encore écrit « en dur » à plusieurs endroits (noms `commu`, `ussr`, textes dans `app.js`, table de remplacement dans `ussr-skin.js`). Pour que le brief suffise sans que je touche à la structure, je propose de faire **avant le prochain événement** :

1. **Fichier de thème unique** (`events/<nom>/theme.json`) : nom, monnaie, gagnant, couleurs, ton, textes de chaque page, liste de titres de paliers, actualités, libellés des raretés (grades). L'appli lit ce fichier au lieu de textes en dur.
2. **Renommer** `commu`/`ussr` en `event` (code générique) et garder « communiste » comme premier thème.
3. **Habillage CSS par variables** : toutes les couleurs passent par des variables définies par le fichier de thème.
4. **Fabrique de cartes générique** : `tools/build-event.py <nom>` à partir de `events/<nom>/titles.txt`.
5. **Jeux paramétrables** : plafonds, gains et textes lus dans le thème ; le scénario à choix reçoit son contenu depuis un fichier.
6. **Tests génériques** : les tests lisent le thème au lieu de textes en dur.

Ensuite, un nouvel événement = un dossier `events/<nom>/` rempli à partir de ton brief, plus du code de jeu si tu demandes un jeu nouveau.
Estimation : un chantier d'une session pour le refactor, puis un événement thématique prend le temps de produire les cartes, les textes et les tests.

---------------------------------------------------------------------

## PARTIE 6 : MISE EN LIGNE ET PIÈGES

**Lancement** : incrémenter la version (4 fichiers), copier les fichiers dans `cloudflare/public/`, pousser `claude/wikimasters-clone`, synchroniser `test/equilibrage`. Test réel : Administration → Événement → « Ouvrir pour moi seul ». Lancement : « Lancer l'événement pour TOUS ». Retour arrière : « Fermer » (les données restent).

**Pièges déjà rencontrés** : choisir le design avant que l'état de l'événement soit chargé (toujours `await loadCommu()`), gains simultanés (boucles de comparaison et échange), limite de 60 aller-retours base, survol collé sur iPhone, audio à débloquer par un geste, icône figée à l'installation (écran « réinstaller »), conflits de classes CSS (préfixer), pas d'emoticônes, une seule suite Playwright à la fois (port 8767), photo de profil ovale à cause de la hauteur minimale des boutons.

**À valider sur iPhone réel** : hymne, icône, paquets, tambour de fin, podium, tampon des souvenirs.

---------------------------------------------------------------------

## PARTIE 7 : MODE COMMUNISTE : CE QUI RESTE AVANT LE LANCEMENT

- Date de début et de fin.
- Relecture des 1 214 titres.
- Passe complète des tests et audit visuel sur la dernière version.
- Équilibrage du Tsar et simulation multi-jours avec les points de cartes.
- Essai iPhone réel, test de charge, plan de coupure.
