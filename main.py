import sqlite3
from fastapi import FastAPI, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from scraper import MoodleScraper
from config import SEMESTER_CONFIG, ORDERED_UES

app = FastAPI()
templates = Jinja2Templates(directory="templates")

DB_FILE = "notes.db"
active_scrapers = {} 

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # --- LE NETTOYAGE (Important pour corriger l'erreur 500) ---
    # On supprime les vieilles tables pour éviter les conflits de colonnes
    # (On ne le fera qu'une fois, après tu pourras enlever ces lignes si tu veux)
    c.execute("DROP TABLE IF EXISTS courses")
    c.execute("DROP TABLE IF EXISTS grades")
    # On garde la table 'settings' si elle existe pour ne pas perdre tes réglages
    
    # --- LA CRÉATION (Nouvelle structure propre) ---
    c.execute('''CREATE TABLE IF NOT EXISTS courses 
                 (id TEXT PRIMARY KEY, moodle_name TEXT, display_name TEXT, ue TEXT, coef REAL, average REAL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS grades 
                 (id INTEGER PRIMARY KEY, course_id TEXT, name TEXT, grade REAL, max_grade REAL, is_total BOOLEAN)''')
    c.execute('''CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)''')
    
    conn.commit()
    conn.close()

# --- FONCTIONS UTILITAIRES ---

def get_user_settings():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    # Valeurs par défaut : VCOD et FI (Initial)
    track = c.execute("SELECT value FROM settings WHERE key='track'").fetchone()
    mode = c.execute("SELECT value FROM settings WHERE key='mode'").fetchone()
    conn.close()
    return {
        "track": track[0] if track else "VCOD",
        "mode": mode[0] if mode else "FI"
    }

def get_mapping(moodle_name, track, mode):
    """Trouve le coef selon le profil étudiant"""
    profile_key = f"{track}_{mode}" # Ex: VCOD_FI
    
    # 1. Recherche exacte
    for key, info in SEMESTER_CONFIG.items():
        if key.lower() in moodle_name.lower():
            coef = info["coefs"].get(profile_key, 0)
            return {"ue": info["ue"], "coef": coef, "name": info["name"]}
            
    return {"ue": "Hors Maquette", "coef": 0, "name": moodle_name}

def calculate_averages(track, mode):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    courses = c.execute("SELECT * FROM courses").fetchall()
    
    ue_data = {}
    
    for course in courses:
        # On recalcule le coef à la volée au cas où le réglage change
        mapping = get_mapping(course['moodle_name'], track, mode)
        ue = mapping['ue']
        coef = mapping['coef']
        
        # Si coef est 0, on ignore la matière pour ce profil
        if coef == 0: continue
            
        if ue not in ue_data: ue_data[ue] = {"points": 0, "coefs": 0, "courses": []}
        
        avg = course['average']
        if avg is not None:
            ue_data[ue]["points"] += avg * coef
            ue_data[ue]["coefs"] += coef
            
        ue_data[ue]["courses"].append({
            **dict(course),
            "display_name": mapping['name'],
            "coef": coef
        })

    # Tri et Moyennes
    final_ues = []
    sorted_keys = sorted(ue_data.keys(), key=lambda x: ORDERED_UES.index(x) if x in ORDERED_UES else 999)
    
    total_pts = 0
    total_coefs = 0
    
    for ue_name in sorted_keys:
        d = ue_data[ue_name]
        ue_avg = (d["points"] / d["coefs"]) if d["coefs"] > 0 else None
        
        if ue_avg:
            total_pts += d["points"] # Déjà pondéré
            total_coefs += d["coefs"]
            
        final_ues.append({
            "name": ue_name,
            "average": ue_avg,
            "courses": d["courses"]
        })
        
    general_avg = (total_pts / total_coefs) if total_coefs > 0 else None
    conn.close()
    return final_ues, general_avg

# --- ROUTES ---

@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/login")
def login_action(username: str = Form(...), password: str = Form(...)):
    scraper = MoodleScraper(username, password)
    if scraper.login():
        active_scrapers[username] = scraper
        response = RedirectResponse(url="/", status_code=303)
        response.set_cookie(key="session_user", value=username, httponly=True)
        return response
    return RedirectResponse(url="/login?error=1", status_code=303)

@app.get("/set-profile")
def set_profile(track: str, mode: str):
    """Enregistre les préférences (VCOD/EMS, FI/FA)"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('track', ?)", (track,))
    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('mode', ?)", (mode,))
    conn.commit()
    conn.close()
    return RedirectResponse(url="/", status_code=303)

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    username = request.cookies.get("session_user")
    if not username: return RedirectResponse(url="/login")

    settings = get_user_settings()
    ues, general_avg = calculate_averages(settings['track'], settings['mode'])

    return templates.TemplateResponse("index.html", {
        "request": request,
        "ues": ues,
        "user": username,
        "track": settings['track'],
        "mode": settings['mode'],
        "general_avg": general_avg
    })

@app.get("/refresh-ui")
def refresh_ui(request: Request):
    username = request.cookies.get("session_user")
    if not username or username not in active_scrapers: return RedirectResponse(url="/login")
    
    scraper = active_scrapers[username]
    raw_courses = scraper.get_all_courses()
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM grades")
    c.execute("DELETE FROM courses")
    
    for course in raw_courses:
        grades = scraper.get_grades_for_course(course['id'])
        notes_valides = [g['grade'] for g in grades if g['max_grade'] == 20 and not g['is_total']]
        avg = sum(notes_valides) / len(notes_valides) if notes_valides else None
        
        c.execute("INSERT INTO courses (id, moodle_name, average) VALUES (?, ?, ?)", 
                  (course['id'], course['name'], avg))
        
        for g in grades:
            c.execute("INSERT INTO grades (course_id, name, grade, max_grade, is_total) VALUES (?, ?, ?, ?, ?)", 
                      (course['id'], g['name'], g['grade'], g['max_grade'], g['is_total']))
    
    conn.commit()
    conn.close()
    return RedirectResponse(url="/", status_code=303)

