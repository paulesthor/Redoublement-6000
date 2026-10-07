# Clodo Wiki — version Supabase

Même jeu, même interface (le dossier `../cloudflare/public` est réutilisé tel quel), mais la base de données est **Supabase (PostgreSQL)** au lieu de Cloudflare D1.
Le but : supprimer les plafonds quotidiens de D1 (100 000 écritures / 5 millions de lectures par jour). Supabase gratuit n'a pas de quota de lignes lues ou écrites.

| Fichier | Rôle |
|---|---|
| `src/pg.js` | Couche « façon D1 » : le reste du code n'a presque pas changé (`env.DB.prepare().bind().run()`, `batch`…). Envoie les requêtes à Supabase par HTTPS. |
| `supabase-setup.sql` | À coller une fois dans l'éditeur SQL de Supabase : crée les tables et la fonction `q()`. |
| `src/migrate.js` | Page `/migrate` : recopie les données de l'ancienne base D1 vers Supabase (voir `MIGRATION-SUPABASE.md`). |
| `tests/` | `npm test` : le vrai Worker contre un vrai PostgreSQL local (PGlite), y compris un combat complet, la migration et le transport HTTPS. |

**Mode d'emploi complet : `MIGRATION-SUPABASE.md`.**
