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

## Étape 2 : Déployer sur Render (Gratuit)

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

---

## ⚡ Alternatives pour le "Toujours Actif" (Sans attente)

La version gratuite de Render "dort" après 15 minutes d'inactivité, ce qui cause un délai de 30s au réveil. Voici comment éviter ça :

### 1. Render "Starter" (La solution facile - Payant)
*   **Prix** : 7$ / mois (environ 6,50€).
*   **Avantage** : Tu ne changes rien. Tu vas juste dans ton Dashboard Render > Settings > Upgrade to Starter.
*   **Résultat** : Ton site ne dort jamais et répond instantanément.

### 2. PythonAnywhere (Gratuit & Performant)
*   **Prix** : Gratuit (ou 5$/mois pour plus de puissance).
*   **Fonctionnement** : Très populaire pour Python. La version gratuite ne "dort" pas de la même façon que Render, elle est plus réactive.
*   **Contrainte** : Il faut se connecter sur leur site une fois tous les 3 mois pour cliquer sur un bouton "Extend" (sinon ils coupent).
*   **Déploiement** : Un peu plus manuel (upload de fichiers ou git pull en ligne de commande).

### 3. Fly.io (Gratuit sous condition)
*   **Prix** : Gratuit jusqu'à un certain seuil.
*   **Avantage** : Très rapide.
*   **Contrainte** : Demande d'installer une ligne de commande (`flyctl`) sur ton PC. Un peu plus technique (« geek ») que Render.

### 4. Auto-Hébergement (Gratuit - "Le Geek")
*   Si tu as un **Raspberry Pi** ou un vieux PC qui traîne chez toi.
*   Tu lances le site dessus 24/7.
*   Tu utilises **Cloudflare Tunnel** (gratuit) pour le rendre accessible depuis le web sans ouvrir tes ports de box internet.
*   **Avantage** : 100% Gratuit, contrôle total.
