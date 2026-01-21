# 🚀 Guide de Déploiement - Redoublement 8000 (Version Finale)

On retourne sur **Render**, car c'est le seul qui n'est pas bloqué par l'université.
Pour éviter qu'il s'endorme le jour (et attendre 30s), on va utiliser une astuce de "Ping Intelligent" qui économisera tes heures gratuites la nuit.

## Étape 1 : Mettre son code sur GitHub (Déjà fait ?)
*(Si tu l'as déjà fait, passe à l'étape 2)*.
1.  Ouvre **GitHub Desktop**.
2.  Publie ton dossier `Redoublement 6000`.

## Étape 2 : Créer le service sur Render (Déjà fait ?)
1.  Va sur [Render.com](https://render.com/).
2.  Crée un **Web Service** (Plan Free).
3.  Paramètres :
    *   **Runtime** : `Python 3`
    *   **Build Command** : `pip install -r requirements.txt`
    *   **Start Command** : `uvicorn main:app --host 0.0.0.0 --port $PORT`
    *   **Health Check Path** : `/health` (C'est important pour que Render sache que ça marche !)

## Étape 3 : Le "Ping Intelligent" (Pour que ça soit rapide la journée) ⚡
Render offre **750 heures** gratuites par mois.
*   Un mois complet = 744 heures.
*   Donc tu peux le laisser allumé 24h/24 sans payer !

Mais pour être sûr et "propre", on va le réveiller de **6h du matin à Minuit** (et le laisser dormir la nuit).

1.  Va sur [cron-job.org](https://cron-job.org/en/) (Crée un compte gratuit).
2.  Clique sur **Create cronjob**.
3.  **Title** : `Ping Redoublement`.
4.  **URL** : L'adresse de ton site Render, **ajoutée de `/health`** (ex: `https://redoublement-8000.onrender.com/health`).
    *   *Astuce : Cette page est ultra-légère, ce qui évite de surcharger le serveur inutilement.*
5.  **Execution schedule** : Choisis **"Every 10 minutes"** (15 minutes c'est parfois trop juste et ça laisse le site s'endormir).
6.  ⚠️ **IMPORTANT** : Dans la section "Schedule execution time" (ou "Advanced"), sélectionne les heures où tu veux que ce soit rapide :
    *   Coche toutes les cases de **06** à **23**.
    *   (Comme ça, de 00h à 06h, le robot ne pingue pas, et le site s'endort pour économiser).
    *   *Pour les experts, l'expression cron exacte est :* `*/10 6-23 * * *`
7.  Clique sur **Create**.

## En cas de problème ("Deploying..." infini) 🛑
Si le déploiement reste bloqué sur "Deploying..." ou "Downloading cache..." :
1.  Sur ton Dashboard Render, clique sur **Manual Deploy**.
2.  Choisis l'option **Clear build cache & deploy**.
3.  Cela force Render à tout reprendre à zéro (ça résout 99% des blocages).

**Résultat :**
*   Ton site est super rapide toute la journée (pas d'attente).
*   Il consomme environ 550 heures / mois (largement en dessous de la limite de 750h).
*   L'université ne le bloque pas.

C'est la solution parfaite ! 🏆
