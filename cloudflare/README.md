# WikiMasters sur Cloudflare (gratuit, toujours en ligne)

Même jeu que `../wikimasters`, mais sans serveur à garder allumé :

| Rôle | Service Cloudflare |
|---|---|
| Interface + catalogue des 2,7 M d'articles (fichiers statiques) | Workers Assets |
| API du jeu (`/api/*`) | Worker (`src/index.js`) |
| Comptes, collections, enchères, échanges, prix moyens | D1 (SQLite hébergé) |
| Temps réel : présence, défis, quiz, combats, notifications | Durable Object `Lobby` (`src/lobby.js`) |

Le catalogue n'est pas dans D1 (limite gratuite d'écritures) : `scripts/build-catalog.mjs` le découpe en fichiers de 10 000 pages classées par popularité. Une carte n'est écrite dans D1 que quand elle est tirée ; sa description et son image sont récupérées via l'API MediaWiki puis conservées.

## Déployer (une fois)
```bash
cd cloudflare
npm install
npx wrangler login                 # ouvre le navigateur, compte Cloudflare gratuit
npm run db:remote                  # crée les tables (déjà fait si la base "wikimasters" existe et contient les tables)
npm run deploy                     # => https://wikimasters.<ton-sous-domaine>.workers.dev
```
`wrangler.jsonc` pointe déjà sur la base D1 `wikimasters` (id `6ac810b7-…`). Si tu utilises un autre compte, crée la base (`npx wrangler d1 create wikimasters`) et remplace `database_id`.
Code d'invitation à l'inscription : ajoute `"vars": { "INVITE_CODE": "ton-code" }` dans `wrangler.jsonc`.

## Remplacer le catalogue de démonstration (40 cartes) par le vrai
```bash
cd ../wikimasters && npm install && npm run seed        # catalogue complet (voir son README), ou: npm run seed -- --keep=300000
cd ../cloudflare && npm run catalog                     # écrit public/catalog/*.json
npm run deploy
```
Compte ~280 fichiers pour 2,7 M de pages (limite gratuite : 20 000 fichiers).

## Tester en local
```bash
npm run db:local && npm run dev       # http://127.0.0.1:8787
```

## Limites du plan gratuit (à vérifier sur la doc Cloudflare)
Workers 100 000 requêtes/jour ; D1 5 Go, 100 000 écritures/jour, 5 M lectures/jour, 50 requêtes SQL par appel de Worker ; Durable Objects ~3 M requêtes/mois. Un booster ≈ 25 écritures : plusieurs milliers de boosters par jour restent possibles.
Les enchères terminées sont réglées à la consultation de la liste (pas de minuteur côté Workers).
