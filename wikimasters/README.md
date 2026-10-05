# WikiMasters privé

Clone léger du jeu WikiMasters pour un petit groupe d'amis : boosters, album, duels de quiz, enchères, échanges, classement.

## Lancer
```bash
npm install
npm run seed          # télécharge ~2000 articles populaires de fr.wikipedia (une seule fois)
# ou: npm run seed:sample   (40 cartes hors-ligne pour tester)
npm start             # http://localhost:3000
```
### Toutes les pages de Wikipédia
`node seed.js --all` parcourt `fr.wikipedia.org` page par page (≈ 20 pages/requête, 5 req/s par défaut, reprise automatique si tu l'interromps avec Ctrl+C).
Wikipédia FR compte ~2,7 M d'articles : le crawl complet prend plusieurs heures et pèse plusieurs Go. Utilise `--limit=200000` pour t'arrêter plus tôt.
Ajoute `--days=30` pour que les articles les plus vus soient rangés en premier (raretés calculées sur les vues, sinon sur la taille de l'article).

Variables : `PORT`, `DB_PATH`, `INVITE_CODE` (si défini, requis pour créer un compte). Node ≥ 22.5.

## Pourquoi ça ne lagge pas
- Aucune requête vers Wikipédia pendant le jeu : cartes, extraits et stats sont pré-chargés en SQLite.
- Un seul processus, SQLite en mode WAL, transactions courtes → largement suffisant pour quelques dizaines de joueurs.
- Temps réel par WebSocket (duels, enchères, notifications), pas de polling.
- Les images sont les miniatures du CDN Wikimedia, chargées par le navigateur.

## Articles « frais » (tirés à la volée)
Un worker d'arrière-plan (`live.js`) garde une réserve d'une soixantaine d'articles aléatoires de fr.wikipedia (résumé, photo, vues du mois), enregistrés en base au fur et à mesure.
Ouvrir un booster ne fait aucun appel réseau : ~50 % des cartes viennent de cette réserve, le reste du stock déjà en base. Si Wikipédia est injoignable, le jeu continue avec le stock local et réessaie chaque minute.
Variables : `LIVE_FETCH=0` (désactive), `FRESH_RATIO=0.5`, `FRESH_TARGET=60`. Le jeu peut démarrer avec une base vide (sans `npm run seed`).
Rareté d'un article frais : vues mensuelles ≥ 150 000 légendaire, ≥ 20 000 épique, ≥ 3 000 rare, sinon commune.

## Réglages
Tout l'équilibrage est dans `config.js` : taux de drop (`DROP`), cartes par booster (10), prix d'un booster acheté, gain à la défausse par rareté (`SELL`), points du classement, récompenses de combat et de quiz.

## Fonctions
- **Boosters** : 10 cartes, un gratuit toutes les 10 min (10 max en stock), ou achat direct pour 60 pièces. Au moins une carte rare ou mieux par booster.
- **Collection** : filtre, tri (rareté, nom, quantité, valeur), valeur estimée, progression par rareté, prix moyen de vente de chaque carte.
- **Défausse** : une carte à la fois ou « vendre tous les doublons » (jusqu'à une rareté donnée) contre des pièces selon la rareté.
- **Enchères** : prix moyen affiché (10 dernières ventes de la carte), anti-snipe de 30 s.
- **Combats** : quiz (5 questions) ou combat de cartes (équipe de 3, ATK contre DEF).
- **Échanges** et **classement**.

Contenu des cartes : Wikipédia, licence CC BY-SA.
