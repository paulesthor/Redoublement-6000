# 🐳 Guide : Déploiement "Toujours Actif" sur Hugging Face (Gratuit)

Voici la méthode ultime. C'est gratuit, ça ne bloque pas l'université, et ça reste allumé 48h (et on va tricher pour que ça reste infini).

## Étape 1 : Créer un "Space"
1.  Crée un compte sur [huggingface.co](https://huggingface.co/join) (si tu n'en as pas).
2.  Clique sur ton profil > **New Space**.
3.  **Space name** : `redoublement-8000` (ou ce que tu veux).
4.  **License** : `MIT` (ou laisser vide).
5.  **SDK** : Choisis **Docker** (c'est le secret !).
6.  **Space Hardware** : Choisis **Free** (2 vCPU, 16GB RAM, c'est généreux !).
7.  **Privacy** : Mets en **Private** si tu veux garder tes notes secrètes, ou **Public**.
8.  Clique sur **Create Space**.

## Étape 2 : Envoyer les fichiers
Tu as deux options, la plus simple est d'utiliser l'interface web :

1.  Dans ton nouveau Space, va dans l'onglet **Files** > **Add file** > **Upload files**.
2.  Sélectionne **TOUS** les fichiers de ton dossier `Redoublement 6000` (sauf le dossier `test Python` et les `.git` si tu en as).
    *   **IMPORTANT** : Il faut bien le fichier `Dockerfile` qu'on vient de créer.
    *   N'oublie pas le dossier `templates`, `maquettes`, `icone`, etc.
3.  Clique sur **Commit changes to main**.

🔥 **Le site va se construire (Building...)**. Ça prend 2-3 minutes la première fois.
Une fois que c'est marqué **Running**, clique sur le bouton **App** pour voir ton site !

## Étape 3 : Empêcher le site de dormir (Le "Ping" infini)
Hugging Face met le site en pause après 48h sans visite.
Pour contrer ça, on va utiliser un service gratuit qui va "tocquer à la porte" toutes les heures.

1.  Va sur [cron-job.org](https://cron-job.org/en/) (C'est gratuit).
2.  Crée un compte.
3.  Clique sur **Create cronjob**.
4.  **Title** : `Ping Redoublement`.
5.  **URL** : L'adresse de ton site Hugging Face (ex: `https://tonpseudo-redoublement-8000.hf.space`).
6.  **Execution schedule** : Choisis **"Every 60 minutes"**.
7.  Clique sur **Create**.

Et voilà ! Ce robot va visiter ton site toutes les heures, donc Hugging Face croira qu'il est toujours utilisé et ne l'éteindra jamais. 🤖
