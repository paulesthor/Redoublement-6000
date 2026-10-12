# Remise à zéro de la saison 0 — mode d'emploi (mercredi 14 octobre 2026)

## Ce que fait l'opération
Un seul appel d'administration (`POST /api/admin/reset-run`, bouton **Outils → Remise à zéro** dans l'appli), exécuté **une seule fois**, dans **une seule transaction** (tout ou rien) :

1. **Sauvegarde** de chaque table concernée dans des tables `bk_s0_<table>` (copie intégrale, RLS activé : jamais lisibles par l'API publique).
2. **Cartes fondateur** : ordre des joueurs tiré au sort ; chacun reçoit une de ses (jusqu'à 3) cartes proposées, tirée au sort ; sinon une autre de ses légendaires ; sinon une légendaire au hasard. Aucune carte en double. Jamais de shiny. La carte est marquée `beta = 1` (halo « BÊTA » à vie) et reste utilisable.
3. **Remise à zéro** des tables : inventaire, favoris, enchères, offres, ventes, échanges, expéditions, épargne, quêtes, quiz, événements, succès, titres, albums, bourse, paris, Plus ou moins, exploits, paquets préparés, tournois, combats, légendaires existantes… Les opérations uniques déjà faites (`exped-*`, `sanction-*`, `fakegod:*`, `mkt:*`) sont conservées pour ne pas se rejouer.
4. **Joueurs** : 500 pièces, 10 paquets, statistiques à zéro, titre « 🏅 Pionnier · Saison 0 ». Conservés : compte, pseudo, amis, avatar, messages, connexions.
5. **Active** les légendaires uniques (`settings.unique_on = 1`) et note la date (`settings.reset_done`).
6. **Bilan** de la saison 0 de chaque joueur (chiffres d'avant l'effacement) + carte fondateur : affichés une fois à la prochaine ouverture de l'appli (Pack Fondateur, puis bilan).

## Déroulé conseillé
**Mardi**
- Midi : rappel aux joueurs (Outils → Annonce) : « Choisis tes 3 légendaires avant minuit ».
- Soir : plus aucun changement de code. Vérifier que tout le monde a choisi (les joueurs sans choix recevront une carte au hasard).

**Mercredi, juste après minuit (heure de Paris)** — les choix sont verrouillés à 00 h 00.
1. Mettre en ligne l'état de la branche de test : sur la branche de production, `git checkout test/equilibrage -- .` puis un commit et un push (aucun conflit : vérifié, 24 fichiers). Le déploiement prend environ une minute.
2. Ouvrir l'appli → Administration → Outils → **Prévisualiser** : vérifier la liste (joueur → carte, source, nombre de pièces/cartes avant). Rien n'est modifié.
3. **Lancer**, taper exactement `REMETTRE A ZERO`.
4. Vérifier : chaque joueur n'a plus que sa carte fondateur ; `GET /api/admin/logs` sans erreur ; ouvrir un paquet avec un compte de test.
5. Annoncer (Outils → Annonce) : « La saison 1 commence ! Ouvre l'appli pour découvrir ton Pack Fondateur. »

## Si quelque chose tourne mal
- **L'opération échoue** : la transaction est annulée, rien n'a changé ; relire le message, corriger, relancer.
- **Retour arrière complet** (après coup) : les copies `bk_s0_*` contiennent tout. Dans l'éditeur SQL de Supabase, par table, par exemple :
  ```sql
  delete from inventory; insert into inventory select * from bk_s0_inventory;
  update users u set coins = b.coins, pack_stock = b.pack_stock, packs_opened = b.packs_opened,
    duel_wins = b.duel_wins, duel_losses = b.duel_losses, title = b.title, showcase = b.showcase,
    daily_day = b.daily_day, daily_streak = b.daily_streak, div_day = b.div_day, drop_w = b.drop_w
  from bk_s0_users b where b.id = u.id;
  delete from legend_taken; insert into legend_taken select * from bk_s0_legend_taken;
  update settings set value = '0' where key = 'unique_on'; delete from settings where key = 'reset_done';
  ```
  (idem pour les autres tables listées dans `WIPE` de `src/seasonzero.js`).
- **Reporter la date** : changer `RESET_AT` dans `src/reset.js` et le texte « mercredi 14 octobre » de l'écran (`resetScreen` dans `app.js`).

## Réglages (tout est en configuration)
- Départ : `START` dans `src/seasonzero.js` (500 pièces, 10 paquets).
- Expéditions : `EXPED` (plafonds 30/80/150), dividendes : `DIV.cap` (100/jour) dans `src/economy.js`.
- Plus ou moins : `HILO.maxStake` (50). Paquets du jour : `THEME_PACK_DAILY` (10) dans `src/config.js`.
- Marché : `MARKET` dans `src/market.js` (2 lots/jour à 9 h et 21 h, 12 h, départ 300).
- Saisons : `SEASON_ANCHOR`, `SEASON_THEMES`, `EV.season` dans `src/events.js`.
