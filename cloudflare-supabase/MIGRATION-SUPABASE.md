# Passer Clodo Wiki sur Supabase — mode d'emploi

Objectif : garder le jeu tel quel, mais remplacer la base **Cloudflare D1** (plafonnée à 100 000 écritures et 5 millions de lectures par jour) par **Supabase** (PostgreSQL, sans quota de lignes).
Le jeu actuel (`cloudflare/`) n'est **pas touché** : cette version vit dans `cloudflare-supabase/`, se teste à côté, et on bascule seulement quand tout est vérifié.

> **Ne colle jamais une clé dans le chat.** Les clés se rangent dans le tableau de bord Cloudflare (Variables and Secrets).

## Ce qui a été vérifié (sur un vrai PostgreSQL local, `npm test`)
- Toutes les routes de l'API (inscription, paquets, collection, enchères, échanges, amis, messagerie, profils, classement, admin, notifications…).
- Un combat de cartes complet (6 tours, 18 questions) et un duel de quiz, avec récompenses.
- La migration des données (guillemets, accents, `$1`, lignes orphelines, compteurs d'identifiants).
- Le transport HTTPS vers Supabase (clés, reprise des lectures après une panne, jamais de rejeu d'une écriture).

## Ce qui n'a PAS pu être vérifié ici
- Le vrai Supabase et le vrai Cloudflare (pas d'accès depuis cet environnement) : d'où l'étape « déployer à côté et tester » ci-dessous.
- La **vitesse** réelle : chaque requête SQL est maintenant un appel HTTPS (≈ 20 à 60 ms) au lieu d'un accès D1 quasi instantané. Les chemins chauds ont été regroupés (ouvrir un paquet ≈ 4 à 5 allers-retours, `/me` ≈ 3). À juger à l'usage sur l'adresse de test.

## Étapes

### 1. Créer le projet Supabase (une fois)
1. supabase.com → New project. Région : **Europe (Paris ou Frankfurt)**. Plan **Free**. Note le mot de passe de la base.
2. Menu **SQL Editor** → New query → colle **tout** le fichier `supabase-setup.sql` → **Run**. (Il crée les tables, verrouille leur accès public, et crée la fonction `q()`.)
3. Menu **Project Settings → API** : note l'**URL du projet** (`https://xxxx.supabase.co`) et la clé **`service_role`** (secrète).

### 2. Déployer la version Supabase À CÔTÉ (sans toucher au jeu actuel)
1. Cloudflare → Workers & Pages → Create → **Import a repository** → ce dépôt, branche `claude/wikimasters-clone`, **Root directory : `cloudflare-supabase`**. Nom : `wikimasters-supabase`.
2. Dans `cloudflare-supabase/wrangler.jsonc`, remplace `SUPABASE_URL` par l'URL du projet (je peux le faire pour toi).
3. Dans le Worker → **Settings → Variables and Secrets** → ajoute en **secret** : `SUPABASE_KEY` = la clé `service_role`.
4. Pour recopier les données : ajoute aussi le secret `MIGRATE_KEY` (invente une longue phrase) et demande-moi de décommenter la ligne `d1_databases` (`OLD_DB`) dans `wrangler.jsonc`.

### 3. Recopier les données
1. Ouvre `https://wikimasters-supabase.<ton-sous-domaine>.workers.dev/migrate`.
2. Saisis la clé `MIGRATE_KEY` → **Tout recopier**. Quelques secondes à une minute.
3. La page compare ensuite les nombres de lignes : tout doit être **OK** (une ou deux lignes orphelines ignorées sont normales et signalées).
4. L'opération peut être rejouée : elle vide Supabase puis recopie tout.

### 4. Tester
Ouvre l'adresse `wikimasters-supabase…` : connecte-toi avec ton compte habituel (les comptes, sessions, cartes, enchères, messages sont copiés), ouvre un paquet, fais une enchère, un combat avec un ami. Les amis peuvent jouer ici aussi, mais **ce qui se passe sur cette adresse ne sera pas conservé au basculement** (on recopie une dernière fois depuis l'ancienne base).

### 5. Basculer (quand tout va bien)
1. Prévenir les amis : « on ne joue plus pendant 10 minutes ».
2. Sur le Worker **principal** `wikimasters` : ajouter les secrets `SUPABASE_KEY` (et garder le Worker de test pour la dernière recopie).
3. Rejouer **Tout recopier** sur l'adresse de test (dernière photo de l'ancienne base).
4. Me dire « bascule » : je modifie `wrangler.jsonc` à la racine du dépôt (`main` → `cloudflare-supabase/src/index.js`, `SUPABASE_URL`, retrait de la base D1, assets inchangés). Le déploiement automatique existant fait le reste. Les joueurs restent connectés (sessions copiées).
5. Retirer ensuite `MIGRATE_KEY` (la migration se désactive toute seule) et supprimer le Worker de test.

### Retour en arrière
Remettre l'ancien `wrangler.jsonc` (un `git revert` du commit de bascule). L'ancienne base D1 n'est jamais modifiée par Supabase ; en revanche ce qui s'est passé sur Supabase après la bascule ne revient pas dans D1.

## À savoir
- **Pause du plan gratuit** : Supabase met un projet gratuit en pause après environ 7 jours sans activité. Le jeu appelle la base toutes les 15 minutes (tâche planifiée), donc il ne devrait pas s'endormir tant que le Worker tourne. Si une pause arrive, il suffit de « Restore » dans le tableau de bord.
- **Transfert sortant** : le plan gratuit annonce 5 Go de transfert par mois (hors cache). L'estimation faite sur les réponses du jeu donne 0,3 à 1 Go par mois.
- **Compteur de lectures de l'admin** : il ne sait plus compter les lignes lues (Supabase ne les renvoie pas) ; il montre toujours le nombre de requêtes par type.
- **Quota dépassé** : si Supabase restreint le projet (erreur 402), le jeu affiche la bannière « limite atteinte » au lieu de planter.
- **Sécurité** : toutes les tables ont le verrou RLS actif sans règle (clés publiques sans accès) ; seule la clé `service_role`, rangée en secret dans le Worker, peut lire/écrire. La fonction `q()` n'est exécutable que par cette clé.
