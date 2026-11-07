# Feuille de route d'un événement (modèle : « mode communiste », build 10.35)

Ce document sert à refaire un autre événement (Halloween, Noël, Egypte antique, etc.) sans repartir de zéro.
Chaque section dit **quoi faire**, **dans quel fichier**, et **comment le tester**.

---------------------------------------------------------------------

## 0. Ce qu'est un événement ici

Un événement = un **mode temporaire** qui change l'habillage de l'appli et ajoute une économie parallèle, sans toucher à la collection normale.

| Brique | Rôle dans le mode communiste | À remplacer pour un nouvel événement |
|---|---|---|
| Monnaie d'événement | wikiroubles (₽), gagnés en jouant, dépensés en colis | nom, icône, textes |
| Taxe d'entrée | 300 wikibidou, versés à la cagnotte | valeur dans `COMMU` |
| Plan de paliers | 12 paliers, récompenses (colis, ₽, titres, cadres, thèmes, souvenirs, wikibidou classiques) | `PLAN_MILESTONES` |
| Réservoir de cartes | 1 214 articles thématiques, 6 raretés, 150 légendaires | liste de titres + script de build |
| Jeux | Camp, Patates, Dernier Tsar, quiz du jour, Marché noir | jeux réutilisés ou nouveaux |
| Habillage | thème rouge, bandeau « Pravda », textes réécrits, hymne, icône | skin |
| Classement | podium + classement général, cagnotte au premier | textes |
| Fin | gagnant, souvenirs (cartes qui entrent dans la collection normale), thèmes gardés | textes, récompenses |

---------------------------------------------------------------------

## 1. Cartographie du code

### Serveur (`cloudflare-supabase/src/`)
- `plan.js` : **cœur**. `COMMU` (taxe, ₽ de départ, prix du colis, plafonds par jeu), `PLAN_MILESTONES`, `installPlan(d)` (routes `/api/commu/*`, `/api/plan/*`), `credit()` (gain plafonné par jour), `commuView()`, état global dans la table `settings` (`commu_on`, `commu_scope`, `commu_start`, `commu_pot`, `commu_done`, `commu_winner`, `commu_souv_closed`).
- `commu-cards.js` : réservoir, tirage (`drawPack`, `EVENT_WEIGHTS`), `/api/commu/open`, `/api/commu/cards`, souvenirs, **points de collection** (`NEW_POINTS`, `COLLECTION_BONUS`). Identifiants de cartes d'événement = `EVENT_OFFSET + id Wikipédia`, ce qui les sépare de la collection normale.
- `commu-bourse.js` : Marché noir (créneaux ≥ 100 dans `bourse_market`).
- `game.js` : titres et récompenses (`PLAN_TITLES`, `commu_staline`).
- `index.js` : branchement (`installPlan`), quiz du jour (`qDayOf`, clé `cm:YYYY-MM-DD`), `/api/cosmetics`.
- `schema.pg.sql` + `ensureGameSchema` : tables (`plan_progress`, `event_progress`, …). Règle : **rester sous 60 aller-retours de base** (un test le vérifie).
- `config.js` : `VERSION` à incrémenter à chaque livraison.

### Client (`wikimasters/public/`, à copier ensuite dans `cloudflare/public/`)
- `app.js` : état `commu`, `loadCommu()`, `eventOn()`, `eventAccess()`, `eventUi()`, `ussrUiOn()`, `syncUssrUi()`. Vues : `eventPacks`, `eventAlbum`, `views.plan` (route des paliers), `views.commutop`, `views.commurules`, `views.commustart` (annonce), `views.commuend` (fin), `views.rank` (podium), `jeuxHub`, `syncEventDrum` (tambour de fin), `iconSheet` (nouvelle icône), onglet admin « Événement ».
- `ussr-skin.js` : moteur d'habillage (textes remplacés, bandeau d'actualités, icône, hymne).
- `ussrpack.js`, `reveal.js` : mise en scène des ouvertures (colis, dossier, matriochka, camion ×10).
- `reigns.js` : jeu du Tsar (moteur de scènes, 21 fins, sons).
- `style.css` : habillage, route des paliers `.plr*`, podium `.pd*`, annonce `.cs-*`, tambour `.commu-drum`.
- `install.html`, `manifest-evenement.webmanifest`, `ussr-icon-*.png`, `ussr-hymne.mp3` : installation et icône.
- `catalog/commu.json` : réservoir généré (ne pas éditer à la main).

### Outils (`tools/`)
- `commu-titles.json` : titres par rareté (légendaires choisis à la main).
- `commu-extra.txt` : titres supplémentaires, rareté déduite de la popularité.
- `build-commu.py` : fabrique `commu.json` **sans réseau** à partir des fragments locaux du catalogue. Il liste les titres absents. `EXCLUDE` retire les intrus.

---------------------------------------------------------------------

## 2. Plan de travail pour un nouvel événement

### Étape A : cadrage (½ journée)
1. Thème, ton, durée, public (iPhone uniquement).
2. Chiffrer l'économie : ₽ gagnés par jour et par jeu (plafonds `COMMU.CAPS`), prix du colis, seuils des paliers. Règle retenue : **un joueur régulier doit pouvoir finir les 12 paliers**.
3. Décider ce qui reste en commun avec le mode classique (récompenses en wikibidou, thèmes, titres, cadres).

### Étape B : données
1. Écrire 1 000+ titres d'articles du thème dans `tools/commu-extra.txt` et les légendaires dans `tools/commu-titles.json`.
2. `python3 tools/build-commu.py` : vérifier le nombre de cartes par rareté et la liste « absentes ». Corriger avec la table `ALIAS` ou `EXCLUDE`.
3. Relire les titres (chasser les faux amis, p. ex. « Pelote basque », « Deep Blue » étaient des intrus).
4. Répartition cible : légendaire ≈ 12 %, ultra 9 %, super 12 %, rare 19 %, peu commune 23 %, commune 25 %.

### Étape C : économie et paliers
1. Adapter `COMMU` et `PLAN_MILESTONES` dans `plan.js` (12 paliers : `at`, `coins`, `packs`, `wr`, `title`, `perk`).
2. Points de collection : `NEW_POINTS` (1/2/4/7/12/25) et `COLLECTION_BONUS` (20 par 50 fiches).
3. Mettre à jour les tests qui contiennent des totaux (`plan.mjs`, `commu-end-body.part`).

### Étape D : habillage
1. Thème CSS (`html[data-theme=…]`) et palette dans `index.html` (`THEME_BG`).
2. Table de remplacement des textes dans `ussr-skin.js`, bandeau d'actualités (une centaine de lignes, ton cohérent).
3. Icône (`*-icon-*.png`) et manifeste ; musique de fond (jouée seulement quand le thème est actif, coupée pendant les jeux plein écran).
4. Animations d'ouverture : colis / dossier / grand paquet selon la rareté, version ×10.

### Étape E : jeux
Réutiliser les jeux existants (Camp, Patates, quiz, Marché noir) en leur donnant le thème, ou en créer un (le Tsar sert de modèle : moteur de scènes, fins, plafonds par jour, récompense à la première découverte). Chaque gain passe par `credit()` côté serveur : **jamais de gain calculé côté client**.

### Étape F : pages
Annonce de début (`commustart`), route des paliers (`plan`), podium (`rank`), classement général (`commutop`), règlement (`commurules`), fin (`commuend` + tambour), nouvelle icône (`iconSheet`).

### Étape G : fin d'événement
Gagnant = plus de points de Plan (₽ gagnés + points de cartes) ; égalité : le premier arrivé au total. Il reçoit la cagnotte, le titre et le contour doré. Souvenirs : cartes choisies qui entrent dans la collection normale avec un contour. Thèmes et titres gagnés restent.

---------------------------------------------------------------------

## 3. Tests (à passer avant chaque mise en ligne)

Serveur (base PGlite en mémoire) : `cd cloudflare-supabase && node tests/all.mjs` (long : environ 10 min, ne pas dépasser le délai ; lancer les fichiers séparément si besoin).
Fichiers clés : `plan.mjs`, `plan-multi.mjs`, `commu.mjs`, `commu-scope.mjs`, `commu-games.mjs`.

Interface (Playwright, iPhone 390×844, port 8767, **un fichier à la fois**) : `commu-ui`, `commu-ui2`, `commu-end`, `start` (annonce + admin), `podium`, `plan-ui`, `jeux-ui`, `tsar-ui`, `tsar-sim`, `tsar-audio`, `hymn-ui`, `icon-ui`, `ten-ui`, `communiste-audit`, `layout-audit`.
Les fichiers `*.mjs` d'interface sont assemblés : `cat tests/jeux-head.part tests/<nom>-body.part > tests/<nom>.mjs`. **Modifier le `.part`, pas le `.mjs`.**

À vérifier à la main sur un vrai iPhone (non automatisable) : hymne, icône (réinstallation), contour bleu, design des paquets, tambour de fin, podium.

---------------------------------------------------------------------

## 4. Mise en ligne

1. Version : incrémenter dans `wikimasters/public/app.js` (`BUILD`), `wikimasters/config.js`, `cloudflare/src/config.js`, `cloudflare-supabase/src/config.js`. Copier `app.js`, `style.css`, etc. dans `cloudflare/public/`.
2. Pousser la branche `claude/wikimasters-clone`, puis synchroniser `test/equilibrage`.
3. **Test réel admin** : Administration → Événement → « Ouvrir pour moi seul ». Payer la taxe, jouer, ouvrir des colis, monter des paliers, regarder le classement.
4. **Lancement** : Administration → Événement → « Lancer l'événement pour TOUS » (confirmation). Chaque joueur voit la page d'annonce une fois, puis le bandeau sur l'accueil.
5. **Fin** : « Clore + gagnant », puis (plus tard) « Clore les souvenirs » qui attribue d'office les souvenirs non choisis.
6. **Retour arrière** : « Fermer » coupe l'événement pour tous ; les données des joueurs restent.

---------------------------------------------------------------------

## 5. Pièges rencontrés (à ne pas refaire)

- Choisir le design avant que l'état de l'événement soit chargé : l'accueil classique apparaissait par intermittence. Toujours `await loadCommu()` avant de choisir la vue.
- Un gain réclamé deux fois en parallèle : utiliser les boucles de **comparaison et échange** (CAS) déjà en place (`credit`, réclamation, ouverture).
- Trop d'aller-retours base : un test les compte ; regrouper les `ALTER TABLE`, réutiliser `event_progress`.
- Sur iPhone : le survol reste collé (`@media (hover:none)`), l'audio doit être débloqué par un geste, l'icône de l'écran d'accueil est figée à l'installation (donc écran « réinstaller »).
- Classe CSS `.rd` en conflit : préfixer les classes de chaque événement.
- Blocage réseau Wikimedia (429) : construire le réservoir depuis le catalogue local.
- Pas d'emoticônes dans les jeux dessinés (décors en SVG).
- Ne jamais lancer plusieurs suites Playwright en parallèle (port 8767 partagé).

---------------------------------------------------------------------

## 6. Ce qui reste à décider pour le mode communiste

- Date de début et de fin (le bouton existe, la date non).
- Relecture complète des 1 214 titres.
- Deuxième passe d'équilibrage du jeu du Tsar et simulation de plusieurs jours avec les points de cartes.
- Essai sur iPhone réel, test de charge, plan de coupure d'urgence.
