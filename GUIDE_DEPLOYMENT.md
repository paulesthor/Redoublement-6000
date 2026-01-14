# 🚀 Guide de Déploiement - Redoublement 8000

Pour que ton application reste active 24/7 sans laisser ton PC allumé, le plus simple est d'utiliser **Render** (une plateforme d'hébergement gratuite et simple).

## Étape 1 : Mettre ton code sur GitHub

1.  Crée un compte sur [GitHub.com](https://github.com/) si tu n'en as pas.
2.  Télécharge et installe [GitHub Desktop](https://desktop.github.com/) (plus simple que la ligne de commande).
3.  Ouvre GitHub Desktop et fais **File > New Repository**.
4.  Nomme-le `redoublement-8000`.
5.  Choisis le dossier `C:\Users\estho\Desktop\Redoublement 6000` comme "Local Path".
    *   *Attention* : Si le dossier existe déjà, GitHub Desktop peut râler. Dans ce cas, choisis "Add Existing Repository" et pointe vers ton dossier sur le bureau.
6.  Clique sur **Publish repository**.
    *   **IMPORTANT** : Coche **"Keep this code private"** si tu ne veux pas que tout le monde voie tes notes.

## Étape 2 : Déployer sur Render

1.  Crée un compte sur [Render.com](https://render.com/).
2.  Clique sur le bouton **New +** et choisis **Web Service**.
3.  Connecte ton compte GitHub et donne l'accès à ton dépôt `redoublement-8000`.
4.  Sélectionne le dépôt dans la liste.
5.  Remplis le formulaire :
    *   **Name** : `redoublement-8000` (ou ce que tu veux).
    *   **Region** : Frankfurt (Allemagne) est le plus proche.
    *   **Branch** : `main` (ou `master`).
    *   **Root Directory** : (Laisser vide).
    *   **Runtime** : `Python 3`.
    *   **Build Command** : `pip install -r requirements.txt`
    *   **Start Command** : `uvicorn main:app --host 0.0.0.0 --port $PORT`
6.  Choisis le plan **Free**.
7.  Clique sur **Create Web Service**.

## C'est fini ! 🥂

Render va construire ton application (ça prend 2-3 minutes).
Une fois terminé, tu auras une URL du type `https://redoublement-8000.onrender.com`.

Toute la promo pourra l'utiliser depuis cette adresse ! 📱

### Notes Importantes
*   **Base de données** : Sur la version gratuite, la base de données (les comptes créés) peut être réinitialisée si l'application redémarre (c'est rare mais possible). C'est parfait pour consulter ses notes, mais il faudra peut-être se reconnecter de temps en temps.
*   **Mise en veille** : La version gratuite "s'endort" après 15 minutes d'inactivité. Le premier chargement prendra environ 30 secondes pour se réveiller. C'est normal.
