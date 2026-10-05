# WikiMasters privé

Jeu de cartes Wikipédia pour un petit groupe d'amis : une carte = un article de Wikipédia FR. Boosters de 10 cartes, collection, défausse, enchères avec prix moyens, échanges, combats (quiz et cartes), classement. Node ≥ 22.5, SQLite, WebSocket.

## Lancer
```bash
npm install
npm run seed:sample   # 40 cartes de test, hors-ligne
# ou le vrai catalogue (voir plus bas) :
npm run seed          # = node seed.js --dump   (long, une seule fois)
npm start             # http://localhost:3000
```
Variables : `PORT`, `DB_PATH`, `INVITE_CODE` (requis à l'inscription si défini), `LIVE_FETCH=0` (désactive la préparation en arrière-plan).
Si tu viens d'une ancienne version : supprime `data/game.db` (le schéma a changé).

## Comment sont gérés les articles
Même principe que WikiMasters (décrit dans sa page « À propos et sources ») :

1. **Catalogue** (`seed.js --dump`, une fois) : la liste des pages vient des exports officiels (`frwiki-latest-page.sql.gz`, ~500 Mo, pages de l'espace principal hors redirections et homonymies, ≈ 2,7 M d'articles). Les consultations du dernier mois complet viennent de `pageviews-AAAAMM-user.bz2` (lu en flux, arrêt dès la fin du bloc `fr.wikipedia`, pas de fichier de 6 Go sur le disque). Les pages sont classées par popularité ; la rareté est fixée par le rang :

   | Rareté | Part du catalogue |
   |---|---|
   | Commune | 50,25 % |
   | Peu commune | 20 % |
   | Rare | 20 % |
   | Super rare | 7 % |
   | Ultra rare | 2,5 % |
   | Légendaire | 0,25 % (+ une variante shiny par légendaire) |

   Compte quelques dizaines de minutes et 0,5 à 1 Go de base. `--keep=300000` ne garde que les 300 000 pages les plus consultées (base plus légère), `--month=2026-09` force le mois.
2. **Tirage** : la rareté est tirée selon `DROP` (config.js, par défaut = parts du catalogue, donc tirage uniforme sur tous les articles), puis une page au hasard dans cette rareté (par rang, sans charger le catalogue en mémoire). Une légendaire a 1 % de chances d'être shiny.
3. **Description et image** : récupérées via l'API MediaWiki *à la demande* (20 pages par requête) puis **conservées en base**. Une réserve en mémoire de cartes déjà enrichies, par rareté, est préparée en arrière-plan : ouvrir un booster ne fait pas d'appel réseau en général (au pire 1,5 s d'attente, puis le client récupère le reste).
4. **Statistiques fixes par page** : la meilleure stat (ATK ou DEF) est dans la plage de la rareté (commune 0–2 000 … légendaire 8 500–10 000, shiny 10 001–15 000), l'autre vaut au moins 50 % de la première.

Hors-ligne ou Wikipédia injoignable : le jeu continue, les cartes s'affichent sans description/image et sont complétées plus tard.

## Réglages
Tout l'équilibrage est dans `config.js` : taux de drop, boosters (10 cartes, gratuit toutes les 10 min, max 10, achat 60 pièces), gains de défausse par rareté, points du classement, récompenses de combat, taille de la réserve.

## Fonctions
- **Boosters** de 10 cartes, taux affichés ; bandeau « Hits légendaires » en direct.
- **Collection** : filtre, tri, valeur estimée, progression par rareté, prix moyen de vente de chaque carte.
- **Défausse** d'une carte ou de tous les doublons (jusqu'à une rareté donnée) contre des pièces.
- **Enchères** (10 dernières ventes → prix moyen, anti-snipe 30 s), **échanges**, **classement**.
- **Combats** : quiz (5 questions) ou combat de cartes (équipe de 3, ATK contre DEF).

Contenu des cartes : Wikipédia (CC BY-SA), images Wikimedia. Projet indépendant de Wikimedia et de WikiMasters.

Polices : Inter et Sora (SIL Open Font License), auto-hébergées dans `public/fonts/`.
