# 🐍 Guide Simplifié : Déploiement PythonAnywhere

J'ai tout préparé dans une archive ZIP pour te faciliter la vie. Suis ces étapes :

## Étape 1 : Créer le compte
1.  Va sur [pythonanywhere.com](https://www.pythonanywhere.com/).
2.  Clique sur **Pricing & Signup** puis **Create a Beginner account** (Gratuit).
3.  Choisis ton nom d'utilisateur (souviens-t-en !).

## Étape 2 : Envoyer le site
1.  Une fois connecté, clique sur l'onglet **Files** (en haut à droite).
2.  Dans la colonne de gauche "Directories", tu es normalement dans `/home/TonPseudo`.
3.  Clique sur le bouton **Upload a file** (à droite).
4.  Choisis le fichier **`site_redoublement.zip`** qui se trouve dans le dossier `test Python` de ton ordinateur.
5.  Une fois uploadé, tu verras `site_redoublement.zip` dans la liste.

## Étape 3 : Installer le site
1.  En haut de la page, clique sur le bouton **Open Bash console here** (ou va dans l'onglet **Consoles** > **Bash**).
2.  Une fenêtre noire (terminal) s'ouvre. Copie-colle cette commande et tape Entrée :
    ```bash
    unzip site_redoublement.zip -d mysite
    ```
    *(Cela va créer un dossier `mysite` et tout mettre dedans)*

3.  Ensuite, installe les bibliothèques avec cette commande :
    ```bash
    pip3.10 install -r mysite/requirements.txt
    ```
    *(Attends que ça finisse, ça prend 1 minute)*

## Étape 4 : Configurer le Web App
1.  Va dans l'onglet **Web**.
2.  Clique sur **Add a new web app**.
3.  Clique **Next** > **Manual Configuration** (⚠️ Attention: choisis bien Manual, pas Flask !).
4.  Choisis **Python 3.10** > **Next**.

## Étape 5 : Lier le code
1.  Dans l'onglet **Web**, descends à la section **Code**.
2.  Clique sur le fichier à côté de **WSGI configuration file**.
3.  ⚠️ **EFFACE TOUT** le contenu de ce fichier (Ctrl+A, Suppr).
4.  Copie-colle le contenu du fichier **`wsgi_pour_pythonanywhere.py`** (qui est dans ton dossier `test Python` sur ton PC).
5.  **TRÈS IMPORTANT** : Dans le code que tu viens de coller, remplace `TonNomdUtilisateur` par ton vrai pseudo PythonAnywhere !
    *   Exemple : `path = '/home/PaulEsthor/mysite'`
6.  Clique sur **Save** (en haut à droite).

## Étape 6 : Lancer !
1.  Retourne dans l'onglet **Web**.
2.  Clique sur le gros bouton vert **Reload ...**.
3.  Clique sur le lien de ton site (en haut). C'est gagné ! 🥂

---
**Rappel** : Dans 3 mois, tu recevras un mail pour cliquer sur "Run until 3 months from today". C'est le seul "prix" à payer.
