import base64
import json
import os
import re
import secrets
import sqlite3
import time
import urllib.parse
from contextlib import contextmanager
from typing import Optional

import requests
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "sessions.db")

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/callback")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API = "https://api.spotify.com/v1"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)

SCOPES = " ".join(
    [
        "user-read-private",
        "user-read-email",
        "user-library-read",
        "user-top-read",
        "user-read-recently-played",
        "playlist-modify-public",
        "playlist-modify-private",
    ]
)

app = FastAPI(title="Playlist Vibes")
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

SESSION_COOKIE = "pv_session"


# --- storage -----------------------------------------------------------

@contextmanager
def db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                access_token TEXT,
                refresh_token TEXT,
                expires_at REAL,
                spotify_user_id TEXT,
                display_name TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS oauth_states (
                state TEXT PRIMARY KEY,
                created_at REAL
            )
            """
        )


init_db()


def get_session(session_id: str) -> Optional[sqlite3.Row]:
    if not session_id:
        return None
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
    return row


def save_session(session_id, access_token, refresh_token, expires_at, user_id=None, display_name=None):
    with db() as conn:
        conn.execute(
            """
            INSERT INTO sessions (session_id, access_token, refresh_token, expires_at, spotify_user_id, display_name)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                access_token=excluded.access_token,
                refresh_token=COALESCE(excluded.refresh_token, sessions.refresh_token),
                expires_at=excluded.expires_at,
                spotify_user_id=COALESCE(excluded.spotify_user_id, sessions.spotify_user_id),
                display_name=COALESCE(excluded.display_name, sessions.display_name)
            """,
            (session_id, access_token, refresh_token, expires_at, user_id, display_name),
        )


def delete_session(session_id):
    with db() as conn:
        conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))


def current_session_id(request: Request) -> Optional[str]:
    return request.cookies.get(SESSION_COOKIE)


def refresh_access_token(row: sqlite3.Row) -> Optional[str]:
    resp = requests.post(
        SPOTIFY_TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": row["refresh_token"],
            "client_id": SPOTIFY_CLIENT_ID,
            "client_secret": SPOTIFY_CLIENT_SECRET,
        },
        timeout=15,
    )
    if resp.status_code != 200:
        return None
    payload = resp.json()
    access_token = payload["access_token"]
    expires_at = time.time() + payload.get("expires_in", 3600) - 30
    refresh_token = payload.get("refresh_token", row["refresh_token"])
    save_session(row["session_id"], access_token, refresh_token, expires_at)
    return access_token


def get_valid_token(session_id: str) -> Optional[str]:
    row = get_session(session_id)
    if not row:
        return None
    if row["expires_at"] and time.time() < row["expires_at"]:
        return row["access_token"]
    return refresh_access_token(row)


def spotify_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- pages ---------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse(request, "index.html", {})


@app.get("/manifest.json")
def manifest():
    return JSONResponse(
        {
            "name": "Playlist Vibes",
            "short_name": "Vibes",
            "description": "Génère des playlists Spotify sur mesure à partir de tes titres likés",
            "start_url": "/",
            "display": "standalone",
            "background_color": "#121212",
            "theme_color": "#1DB954",
            "icons": [
                {"src": "/static/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
                {"src": "/static/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
            ],
        }
    )


@app.get("/sw.js")
def service_worker():
    path = os.path.join(BASE_DIR, "static", "sw.js")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    return HTMLResponse(content, media_type="application/javascript")


# --- spotify oauth ---------------------------------------------------------

@app.get("/login")
def login():
    state = secrets.token_urlsafe(16)
    with db() as conn:
        conn.execute("INSERT INTO oauth_states (state, created_at) VALUES (?, ?)", (state, time.time()))
    params = {
        "client_id": SPOTIFY_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": SPOTIFY_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
        "show_dialog": "true",
    }
    return RedirectResponse(f"{SPOTIFY_AUTH_URL}?{urllib.parse.urlencode(params)}")


@app.get("/callback")
def callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error or not code:
        return RedirectResponse(f"/?error={urllib.parse.quote(error or 'access_denied')}")

    with db() as conn:
        row = conn.execute("SELECT state FROM oauth_states WHERE state = ?", (state,)).fetchone()
        conn.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
    if not row:
        return RedirectResponse("/?error=invalid_state")

    resp = requests.post(
        SPOTIFY_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": SPOTIFY_REDIRECT_URI,
            "client_id": SPOTIFY_CLIENT_ID,
            "client_secret": SPOTIFY_CLIENT_SECRET,
        },
        timeout=15,
    )
    if resp.status_code != 200:
        return RedirectResponse("/?error=token_exchange_failed")
    payload = resp.json()
    access_token = payload["access_token"]
    refresh_token = payload.get("refresh_token", "")
    expires_at = time.time() + payload.get("expires_in", 3600) - 30

    me = requests.get(f"{SPOTIFY_API}/me", headers=spotify_headers(access_token), timeout=15).json()

    session_id = secrets.token_urlsafe(24)
    save_session(session_id, access_token, refresh_token, expires_at, me.get("id"), me.get("display_name"))

    response = RedirectResponse("/")
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        max_age=60 * 60 * 24 * 30,
    )
    return response


@app.get("/logout")
def logout(request: Request):
    session_id = current_session_id(request)
    if session_id:
        delete_session(session_id)
    response = RedirectResponse("/")
    response.delete_cookie(SESSION_COOKIE)
    return response


@app.get("/api/me")
def api_me(request: Request):
    session_id = current_session_id(request)
    row = get_session(session_id) if session_id else None
    if not row:
        return {"logged_in": False}
    return {"logged_in": True, "display_name": row["display_name"] or row["spotify_user_id"]}


# --- liked tracks / taste profile ------------------------------------------

def _track_lines(items, track_key="track"):
    lines = []
    for item in items:
        track = (item.get(track_key) if track_key else item) or {}
        if not track or not track.get("name"):
            continue
        artists = ", ".join(a["name"] for a in track.get("artists", []))
        lines.append(f"{track['name']} — {artists}")
    return lines


def fetch_liked_tracks(token: str, limit: int = 50) -> list[str]:
    liked = requests.get(
        f"{SPOTIFY_API}/me/tracks",
        headers=spotify_headers(token),
        params={"limit": limit},
        timeout=15,
    ).json()
    return _track_lines(liked.get("items", []))


def fetch_recently_played(token: str, limit: int = 50) -> list[str]:
    recent = requests.get(
        f"{SPOTIFY_API}/me/player/recently-played",
        headers=spotify_headers(token),
        params={"limit": limit},
        timeout=15,
    ).json()
    return _track_lines(recent.get("items", []))


def fetch_user_playlists(token: str) -> list[dict]:
    out = []
    url = f"{SPOTIFY_API}/me/playlists"
    params = {"limit": 50}
    while url:
        resp = requests.get(url, headers=spotify_headers(token), params=params, timeout=15).json()
        for p in resp.get("items", []):
            if not p:
                continue
            image = p["images"][0]["url"] if p.get("images") else None
            out.append(
                {
                    "id": p["id"],
                    "name": p["name"],
                    "image": image,
                    "tracks_total": p.get("tracks", {}).get("total", 0),
                }
            )
        url = resp.get("next")
        params = None
    return out


def fetch_playlist_tracks(token: str, playlist_id: str, limit: int = 80) -> list[str]:
    resp = requests.get(
        f"{SPOTIFY_API}/playlists/{playlist_id}/tracks",
        headers=spotify_headers(token),
        params={"limit": min(limit, 100), "fields": "items(track(name,artists(name)))"},
        timeout=15,
    ).json()
    return _track_lines(resp.get("items", []))


def fetch_top_artists_and_genres(token: str) -> tuple[list[str], list[str]]:
    top_artists = requests.get(
        f"{SPOTIFY_API}/me/top/artists",
        headers=spotify_headers(token),
        params={"limit": 20, "time_range": "medium_term"},
        timeout=15,
    ).json()
    artist_names = [a["name"] for a in top_artists.get("items", [])]
    genres = []
    for a in top_artists.get("items", []):
        genres.extend(a.get("genres", []))
    genres = list(dict.fromkeys(genres))  # dedupe, keep order
    return artist_names, genres[:25]


SOURCE_LABELS = {
    "liked": "les titres likés de l'utilisateur",
    "playlist": "les titres d'une ou plusieurs playlists choisies par l'utilisateur",
    "recent": "les titres écoutés récemment par l'utilisateur",
    "top_artists": "uniquement les artistes/genres préférés de l'utilisateur (pas de titres précis)",
}


def fetch_taste_profile(token: str, source: str = "liked", playlist_ids: Optional[list[str]] = None) -> dict:
    artist_names, genres = fetch_top_artists_and_genres(token)

    seed_tracks: list[str] = []
    if source == "playlist" and playlist_ids:
        for pid in playlist_ids[:5]:
            seed_tracks.extend(fetch_playlist_tracks(token, pid, limit=60 // max(1, len(playlist_ids))))
    elif source == "recent":
        seed_tracks = fetch_recently_played(token, limit=50)
    elif source == "top_artists":
        seed_tracks = []
    else:
        source = "liked"
        seed_tracks = fetch_liked_tracks(token, limit=50)

    return {
        "seed_tracks": seed_tracks[:60],
        "top_artists": artist_names,
        "genres": genres,
        "source_label": SOURCE_LABELS[source],
    }


# --- gemini ------------------------------------------------------------

def ask_gemini_for_playlist(profile: dict, mood: str, track_count: int) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY manquant côté serveur")

    prompt = f"""Tu es un DJ expert qui construit des playlists Spotify sur-mesure.

Voici un aperçu des goûts musicaux de l'utilisateur, basé sur {profile['source_label']} :
Titres de référence : {json.dumps(profile['seed_tracks'], ensure_ascii=False)}
Artistes les plus écoutés : {json.dumps(profile['top_artists'], ensure_ascii=False)}
Genres dominants : {json.dumps(profile['genres'], ensure_ascii=False)}

Demande de l'utilisateur pour la nouvelle playlist : "{mood}"

Construis une playlist de {track_count} morceaux qui correspond à cette demande, en t'appuyant en priorité sur
les "titres de référence" ci-dessus (c'est la base de goûts que l'utilisateur a explicitement choisie pour cette
playlist) tout en proposant quelques découvertes cohérentes avec le style demandé.

Réponds UNIQUEMENT avec un JSON valide, sans texte autour, au format exact :
{{
  "playlist_name": "nom court et accrocheur",
  "description": "une phrase décrivant l'ambiance",
  "tracks": [{{"title": "titre du morceau", "artist": "nom de l'artiste"}}, ...]
}}
Le tableau "tracks" doit contenir exactement {track_count} entrées, sans doublons.
"""

    resp = requests.post(
        f"{GEMINI_URL}?key={GEMINI_API_KEY}",
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.9, "responseMimeType": "application/json"},
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    text = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(text)


def transcribe_audio(audio_bytes: bytes, mime_type: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY manquant côté serveur")

    resp = requests.post(
        f"{GEMINI_URL}?key={GEMINI_API_KEY}",
        json={
            "contents": [
                {
                    "parts": [
                        {
                            "text": (
                                "Transcris cet enregistrement audio en français. "
                                "Réponds uniquement avec le texte transcrit, sans "
                                "commentaire ni guillemets."
                            )
                        },
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": base64.b64encode(audio_bytes).decode("ascii"),
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {"temperature": 0.2},
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return text.strip().strip('"')


def ask_gemini_for_track_candidates(description: str) -> list[dict]:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY manquant côté serveur")

    prompt = f"""Un utilisateur essaie de retrouver un morceau de musique dont il ne connaît pas le
titre exact. Voici sa description (paroles approximatives, ambiance, artiste possible, époque...) :

"{description}"

Propose jusqu'à 5 morceaux réels qui correspondent le mieux à cette description, du plus probable
au moins probable. Réponds UNIQUEMENT avec un JSON valide, sans texte autour, au format exact :
{{
  "candidates": [
    {{"title": "titre du morceau", "artist": "nom de l'artiste", "reason": "courte explication du rapprochement"}}
  ]
}}
"""

    resp = requests.post(
        f"{GEMINI_URL}?key={GEMINI_API_KEY}",
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"},
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    text = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(text).get("candidates", [])


@app.post("/api/transcribe")
async def api_transcribe(request: Request, audio: UploadFile = File(...)):
    session_id = current_session_id(request)
    if not (session_id and get_session(session_id)):
        return JSONResponse({"error": "not_authenticated"}, status_code=401)

    audio_bytes = await audio.read()
    if not audio_bytes:
        return JSONResponse({"error": "empty_audio"}, status_code=400)

    try:
        text = transcribe_audio(audio_bytes, audio.content_type or "audio/webm")
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": str(exc)}, status_code=502)

    return {"text": text}


# --- spotify search / playlist creation -------------------------------

def search_track(token: str, title: str, artist: str) -> Optional[dict]:
    query = f"track:{title} artist:{artist}"
    resp = requests.get(
        f"{SPOTIFY_API}/search",
        headers=spotify_headers(token),
        params={"q": query, "type": "track", "limit": 1},
        timeout=15,
    )
    if resp.status_code != 200:
        return None
    items = resp.json().get("tracks", {}).get("items", [])
    if not items:
        resp = requests.get(
            f"{SPOTIFY_API}/search",
            headers=spotify_headers(token),
            params={"q": f"{title} {artist}", "type": "track", "limit": 1},
            timeout=15,
        )
        items = resp.json().get("tracks", {}).get("items", []) if resp.status_code == 200 else []
    if not items:
        return None
    track = items[0]
    image = track["album"]["images"][-1]["url"] if track["album"].get("images") else None
    return {
        "uri": track["uri"],
        "name": track["name"],
        "artist": ", ".join(a["name"] for a in track["artists"]),
        "image": image,
        "url": track["external_urls"]["spotify"],
    }


@app.get("/api/playlists")
def api_playlists(request: Request):
    session_id = current_session_id(request)
    token = get_valid_token(session_id) if session_id else None
    if not token:
        return JSONResponse({"error": "not_authenticated"}, status_code=401)
    try:
        playlists = fetch_user_playlists(token)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": str(exc)}, status_code=502)
    return {"playlists": playlists}


class GenerateRequest(BaseModel):
    mood: str
    track_count: int = 20
    source: str = "liked"
    playlist_ids: list[str] = []


@app.post("/api/generate")
def api_generate(request: Request, body: GenerateRequest):
    session_id = current_session_id(request)
    token = get_valid_token(session_id) if session_id else None
    if not token:
        return JSONResponse({"error": "not_authenticated"}, status_code=401)

    track_count = max(5, min(body.track_count, 40))
    source = body.source if body.source in SOURCE_LABELS else "liked"

    try:
        profile = fetch_taste_profile(token, source=source, playlist_ids=body.playlist_ids)
        plan = ask_gemini_for_playlist(profile, body.mood, track_count)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": str(exc)}, status_code=502)

    resolved = []
    seen_uris = set()
    for item in plan.get("tracks", []):
        found = search_track(token, item.get("title", ""), item.get("artist", ""))
        if found and found["uri"] not in seen_uris:
            seen_uris.add(found["uri"])
            resolved.append(found)

    return {
        "playlist_name": plan.get("playlist_name", body.mood[:60]),
        "description": plan.get("description", ""),
        "tracks": resolved,
    }


class CreatePlaylistRequest(BaseModel):
    name: str
    description: str = ""
    uris: list[str]


@app.post("/api/create_playlist")
def api_create_playlist(request: Request, body: CreatePlaylistRequest):
    session_id = current_session_id(request)
    row = get_session(session_id) if session_id else None
    token = get_valid_token(session_id) if session_id else None
    if not token or not row:
        return JSONResponse({"error": "not_authenticated"}, status_code=401)

    resp = requests.post(
        f"{SPOTIFY_API}/users/{row['spotify_user_id']}/playlists",
        headers={**spotify_headers(token), "Content-Type": "application/json"},
        json={"name": body.name, "description": body.description, "public": False},
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        return JSONResponse({"error": "playlist_creation_failed", "detail": resp.text}, status_code=502)
    playlist = resp.json()

    for i in range(0, len(body.uris), 100):
        chunk = body.uris[i : i + 100]
        requests.post(
            f"{SPOTIFY_API}/playlists/{playlist['id']}/tracks",
            headers={**spotify_headers(token), "Content-Type": "application/json"},
            json={"uris": chunk},
            timeout=15,
        )

    return {"url": playlist["external_urls"]["spotify"], "name": playlist["name"]}


class FindTrackRequest(BaseModel):
    description: str


@app.post("/api/find_track")
def api_find_track(request: Request, body: FindTrackRequest):
    session_id = current_session_id(request)
    token = get_valid_token(session_id) if session_id else None
    if not token:
        return JSONResponse({"error": "not_authenticated"}, status_code=401)

    if not body.description.strip():
        return JSONResponse({"error": "empty_description"}, status_code=400)

    try:
        candidates = ask_gemini_for_track_candidates(body.description)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": str(exc)}, status_code=502)

    resolved = []
    seen_uris = set()
    for item in candidates:
        found = search_track(token, item.get("title", ""), item.get("artist", ""))
        if found and found["uri"] not in seen_uris:
            seen_uris.add(found["uri"])
            found["reason"] = item.get("reason", "")
            resolved.append(found)

    return {"tracks": resolved}


class AddToPlaylistRequest(BaseModel):
    playlist_id: str
    uri: str


@app.post("/api/add_to_playlist")
def api_add_to_playlist(request: Request, body: AddToPlaylistRequest):
    session_id = current_session_id(request)
    token = get_valid_token(session_id) if session_id else None
    if not token:
        return JSONResponse({"error": "not_authenticated"}, status_code=401)

    resp = requests.post(
        f"{SPOTIFY_API}/playlists/{body.playlist_id}/tracks",
        headers={**spotify_headers(token), "Content-Type": "application/json"},
        json={"uris": [body.uri]},
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        return JSONResponse({"error": "add_failed", "detail": resp.text}, status_code=502)
    return {"ok": True}
