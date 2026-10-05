# WikiMasters privé

Clone léger du jeu WikiMasters pour un petit groupe d'amis : boosters, album, duels de quiz, enchères, échanges, classement.

## Lancer
```bash
npm install
npm run seed          # télécharge ~2000 articles populaires de fr.wikipedia (une seule fois)
# ou: npm run seed:sample   (40 cartes hors-ligne pour tester)
npm start             # http://localhost:3000
```
Variables : `PORT`, `DB_PATH`, `INVITE_CODE` (si défini, requis pour créer un compte). Node ≥ 22.5.

## Pourquoi ça ne lagge pas
- Aucune requête vers Wikipédia pendant le jeu : cartes, extraits et stats sont pré-chargés en SQLite.
- Un seul processus, SQLite en mode WAL, transactions courtes → largement suffisant pour quelques dizaines de joueurs.
- Temps réel par WebSocket (duels, enchères, notifications), pas de polling.
- Les images sont les miniatures du CDN Wikimedia, chargées par le navigateur.

## Règles
- 1 booster / 10 min (stock max 10), 5 cartes par booster. Rareté selon la popularité de l'article.
- Doublons vendables (commune 5, rare 20, épique 80, légendaire 300 🪙). Départ : 200 🪙.
- Duel : 5 questions, bonus de rapidité ; vainqueur +50 🪙, perdant +10.
- Enchères : surenchère minimale +1, prolongation de 30 s si offre dans les 30 dernières secondes.

Contenu des cartes : Wikipédia, licence CC BY-SA.
