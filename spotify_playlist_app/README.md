# Playlist Vibes

PWA installable sur téléphone qui génère des playlists Spotify en te basant sur tes titres
likés + une envie décrite en langage naturel ("soirée énergique", "focus sans paroles"...).

Architecture : un backend FastAPI (déployé sur Render) qui parle directement à l'API Spotify
(OAuth) et à l'API Gemini. Pas de dépendance à Claude/MCP au runtime — l'app est autonome une
fois déployée.

## Ce qu'il faut savoir avant de déployer

- **Analyse "sonore" limitée** : Spotify a fermé l'accès aux endpoints `audio-features` /
  `audio-analysis` / `recommendations` pour les nouvelles apps (depuis nov. 2024). L'app se base
  donc sur les métadonnées disponibles (titres likés, artistes les plus écoutés, genres des
  artistes) plutôt que sur une analyse du signal audio.
- **Mode développement Spotify** : par défaut ton app Spotify n'autorise que 25 comptes
  utilisateurs (largement suffisant pour un usage perso). Ton propre compte doit être ajouté
  manuellement dans le dashboard (voir étape 1).
- **Coût Gemini** : chaque génération de playlist déclenche un appel à l'API Gemini, facturé
  au-delà du free tier de Google AI Studio.

## 1. Créer l'app Spotify

1. Va sur https://developer.spotify.com/dashboard et connecte-toi.
2. "Create app" → donne un nom, une description.
3. Redirect URI : ajoute exactement l'URL de callback de ton déploiement, par ex.
   `https://ton-app.onrender.com/callback` (et `http://127.0.0.1:8000/callback` pour tester en
   local).
4. Dans "Settings" → note le **Client ID** et le **Client Secret**.
5. Dans "User Management", ajoute ton propre compte Spotify (email associé) pour pouvoir te
   connecter tant que l'app est en mode développement.

## 2. Créer la clé Gemini

1. Va sur https://aistudio.google.com/apikey.
2. "Create API key", copie la clé.

## 3. Configuration locale

```bash
cd spotify_playlist_app
cp .env.example .env
# remplis SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, GEMINI_API_KEY
pip install -r requirements.txt
export $(grep -v '^#' .env | xargs)  # charge les variables d'env (ou utilise python-dotenv)
uvicorn main:app --reload
```

Ouvre http://127.0.0.1:8000

## 4. Déploiement sur Render

1. Push ce dossier sur GitHub (déjà fait si tu es sur ce repo).
2. Sur https://dashboard.render.com → "New +" → "Blueprint" → sélectionne ce repo. Render lira
   `spotify_playlist_app/render.yaml` automatiquement (indique bien le dossier `spotify_playlist_app`
   comme "Root Directory" si Render te le demande).
3. Renseigne les variables d'environnement marquées `sync: false` dans le dashboard Render :
   `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` (l'URL Render + `/callback`),
   `GEMINI_API_KEY`, `APP_BASE_URL` (l'URL Render).
4. Une fois déployé, retourne sur le Spotify Dashboard et ajoute l'URL Render + `/callback` comme
   Redirect URI valide (étape 1.3).

## 5. Installer la PWA sur ton téléphone

1. Ouvre l'URL Render dans le navigateur de ton téléphone.
2. Connecte-toi avec Spotify.
3. Menu du navigateur → "Ajouter à l'écran d'accueil" (Android/Chrome) ou "Sur l'écran d'accueil"
   (iOS/Safari, via le bouton Partager).
4. L'app s'ouvre ensuite comme une app native, sans barre d'adresse.

## Utilisation

1. Choisis un preset (Soirée, Chill, Focus...), décris librement l'ambiance voulue, ou dicte-la
   au micro (voir ci-dessous).
2. "Générer la playlist" : le serveur récupère un échantillon de tes titres likés + artistes
   suivis, demande à Gemini une sélection cohérente, puis résout chaque titre sur Spotify.
3. Vérifie la liste, puis "Créer sur Spotify" : la playlist est créée (privée) directement sur
   ton compte, avec un lien pour l'ouvrir dans l'app Spotify — elle apparaît telle quelle dans ta
   Bibliothèque Spotify habituelle.

## Commande vocale

Le bouton 🎤 à côté du champ de texte dicte ta demande au lieu de la taper :

- Sur Chrome Android (et la plupart des navigateurs Chromium), la reconnaissance vocale se fait
  directement dans le navigateur, en local, sans coût.
- Si le navigateur ne supporte pas cette API (notamment Safari/iOS), l'app enregistre l'audio et
  l'envoie à Gemini pour transcription (`/api/transcribe`) — ça fonctionne partout mais consomme
  un appel API Gemini par dictée.

Dans les deux cas le texte transcrit remplit simplement le champ ; tu peux le corriger avant de
lancer la génération.

## Limites connues

- Pas d'analyse du son réel des morceaux (contrainte Spotify, voir plus haut) : les
  recommandations reposent sur les métadonnées et le raisonnement de Gemini.
- Application personnelle (mode développement Spotify) : pour la partager à plus de 25 personnes,
  il faudrait demander le mode "Extended Quota" à Spotify.
- Une seule session à la fois par navigateur (cookie de session signé, pas de gestion
  multi-comptes).
- La reconnaissance vocale native nécessite HTTPS (fonctionne en local sur `127.0.0.1`, et sur
  Render qui sert en HTTPS par défaut).
