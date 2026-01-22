import sqlite3
import re
print("🚀 DEBUG: Imports starting...")
from fastapi import FastAPI, Request, Form, Response, Body
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse, JSONResponse
from scraper import MoodleScraper
from maquette_service import MaquetteService
from difflib import get_close_matches
from pydantic import BaseModel
from typing import Optional

from contextlib import asynccontextmanager
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import time
import random

# Configuration DB
DATABASE_URL = os.getenv("DATABASE_URL")
DB_FILE = "notes.db"

# --- DB ABSTRACTION LAYER ---
class DBCursor:
    def __init__(self, cursor, is_postgres=False):
        self.cursor = cursor
        self.is_postgres = is_postgres

    def execute(self, query, params=()):
        if self.is_postgres:
            # Conversion de la syntaxe SQLite (?) vers Postgres (%s)
            query = query.replace("?", "%s")
        self.cursor.execute(query, params)
        return self

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def __getattr__(self, name):
        return getattr(self.cursor, name)

class DBConnection:
    def __init__(self, connection, is_postgres=False):
        self.connection = connection
        self.is_postgres = is_postgres

    def cursor(self):
        return DBCursor(self.connection.cursor(), self.is_postgres)

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()
    
    @property
    def row_factory(self):
        return self.connection.row_factory
        
    @row_factory.setter
    def row_factory(self, value):
        self.connection.row_factory = value

def get_db_connection():
    if DATABASE_URL:
        # Postgres Mode
        try:
            conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
            return DBConnection(conn, is_postgres=True)
        except Exception as e:
            print(f"❌ Erreur connexion Postgres: {e}")
            # Fallback to sqlite if needed, but better to fail explicitly
            raise e
    else:
        # SQLite Mode
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        return DBConnection(conn, is_postgres=False)

active_scrapers = {} 
maquette_service = None # Sera initialisé au démarrage

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    print("🚀 DEBUG: Starting up... Initializing services.")
    
    # 1. Init DB
    print("🚀 DEBUG: initializing DB...")
    init_db()
    
    # 2. Init Maquette Service (Lazy Load)
    global maquette_service
    print("🚀 DEBUG: Loading MaquetteService...")
    maquette_service = MaquetteService()
    print("🚀 DEBUG: Startup complete! Server is ready.")
    
    yield
    # --- SHUTDOWN ---
    print("🚀 DEBUG: Shutting down.")

from starlette.middleware.sessions import SessionMiddleware
import os

app = FastAPI(title="Redoublement 8000", lifespan=lifespan)

# SECURITY: Secret Key for signing sessions (Prevent tampering)
# In production, use a strong env variable. Fallback for dev.
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-changer-me-svp")

app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, https_only=False) # https_only=True in prod ideally

# Serveur d'icône (User provided JPG)
@app.get("/icon.png")
async def get_icon():
    # Use relative path for deployment compatibility
    icon_path = "icone/IMG_20210714_141401_515.jpg"
    return FileResponse(icon_path)

templates = Jinja2Templates(directory="templates")

# On s'assure que le dossier static existe pour éviter le crash au démarrage
import os
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health")
async def health_check():
    """Endpoint léger pour le robot de ping (économise les ressources)"""
    return {"status": "alive"}

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    
    # Types adaptés
    pk_type = "SERIAL PRIMARY KEY" if conn.is_postgres else "INTEGER PRIMARY KEY"
    
    # Postgres ne supporte pas "CREATE TABLE IF NOT EXISTS" pour les types... mais pour les tables oui.
    # On reste simple.
    
    c.execute(f'''CREATE TABLE IF NOT EXISTS courses (id TEXT, username TEXT, name TEXT, average REAL, PRIMARY KEY (id, username))''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS grades (id {pk_type}, course_id TEXT, username TEXT, name TEXT, grade REAL, max_grade REAL, is_total BOOLEAN)''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS user_settings (username TEXT PRIMARY KEY, semester TEXT, option TEXT, status TEXT, last_updated TEXT)''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS manual_grades (id {pk_type}, username TEXT, course_canonical_name TEXT, name TEXT, grade REAL, max_grade REAL, coef REAL)''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS course_overrides (username TEXT, course_canonical_name TEXT, target_competence TEXT, custom_coef REAL, custom_name TEXT, PRIMARY KEY(username, course_canonical_name))''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS grade_exclusions (id {pk_type}, username TEXT, course_canonical_name TEXT, grade_name TEXT, grade_value REAL)''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS grade_overrides (username TEXT, course_canonical_name TEXT, grade_name TEXT, new_name TEXT, target_course_id TEXT, PRIMARY KEY(username, course_canonical_name, grade_name))''')
    
    # On valide d'abord la création des tables pour éviter qu'un fail dans la migration annule tout
    conn.commit()
    
    # Migrations
    migrations = [
        "ALTER TABLE user_settings ADD COLUMN last_updated TEXT",
        "ALTER TABLE courses ADD COLUMN username TEXT",
        "ALTER TABLE grades ADD COLUMN username TEXT",
        # Orphan Cleanup: Remove data from the 'ghost' era (NULL username) to clean DB
        "DELETE FROM courses WHERE username IS NULL",
        "DELETE FROM grades WHERE username IS NULL"
    ]
    
    for mig in migrations:
        try:
            c.execute(mig)
            conn.commit()
        except (sqlite3.OperationalError, psycopg2.errors.DuplicateColumn):
            if conn.is_postgres: conn.rollback()
        except Exception as e:
            # print(f"⚠️ Migration warning: {e}")
            if conn.is_postgres: conn.rollback()
        
    # [CRITICAL FIX] Drop Constraint on courses_pkey if it is just (id)
    # Postgres specific fix for the error: Key (id)=(...) already exists.
    if conn.is_postgres:
        try:
            # On essaie de dropper la vieille contrainte PK qui bloque les doublons d'ID entre users
            c.execute("ALTER TABLE courses DROP CONSTRAINT courses_pkey")
            c.execute("ALTER TABLE courses ADD PRIMARY KEY (id, username)")
            conn.commit()
            print("✅ MIGRATION: Courses PK updated to (id, username)")
        except Exception as e:
            # print(f"⚠️ MIGRATION PK SKIPPED (probablement déjà fait): {e}")
            conn.rollback()
            
    conn.commit()
    conn.close()

# --- ROUTES ---

@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/login")
def login_action(request: Request, username: str = Form(...), password: str = Form(...)): # Included Request
    # On teste la connexion à l'ENT
    scraper = MoodleScraper(username, password)
    if scraper.login():
        print(f"✅ Connexion réussie pour {username}")
        # On garde le scraper actif en mémoire
        active_scrapers[username] = scraper
        
        # Security: Use Signed Session instead of raw cookie
        request.session['user'] = username
        
        response = RedirectResponse(url="/", status_code=303)
        return response
    else:
        return RedirectResponse(url="/login?error=1", status_code=303)

@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    response = RedirectResponse(url="/login")
    return response

# --- HELPER FUNCTIONS ---

def is_excluded(course_canonical_name, grade_name, grade_value, exclusions_rows):
    for ex in exclusions_rows:
        if ex['course_canonical_name'] == course_canonical_name and ex['grade_name'] == grade_name and abs(ex['grade_value'] - grade_value) < 0.01:
            return True
    return False

def calculate_semester_stats(courses_list, manual_grades, overrides_map, grade_overrides_map, exclusions_rows, target_semester, target_option, target_status):
    maquette = maquette_service.load_maquette(target_semester, target_option, target_status)
    if not maquette: return None

    competences_data = {}
    for comp in maquette['competences']:
        competences_data[comp] = {"courses": [], "weighted_sum": 0, "coef_sum": 0, "average": None}
    
    canonical_names = list(maquette['courses'].keys())
    teacher_map = maquette.get('teachers', {})
    canonical_registry = {} 
    unmatched_items = []

    # Process Courses
    for course in courses_list:
        # --- FILTERING BY SEMESTER in Name ---
        c_name_lower = course['name'].lower()
        
        if target_semester.lower() == "s3" and "s4" in c_name_lower: continue
        
        if target_semester.lower() == "s4":
            if "s3" in c_name_lower: continue
            if "s4" not in c_name_lower and "semestre 4" not in c_name_lower:
                continue
        
        # [LOGIC COPIED & ADAPTED FOR SCOPE]
        is_meta_course = "département sd" in c_name_lower or "espace promo" in c_name_lower
        items_to_process = []
        if is_meta_course:
                for g in course['grades']:
                    if "tendance" in g['name'].lower(): continue
                    items_to_process.append({"name": g['name'], "grades": [g], "is_virtual": True})
        else:
            items_to_process.append(course)
        
        for item in items_to_process:
            if "tendance" in item.get('name', '').lower(): continue
            
            # Re-using the same global find_best_match function
            best_match = find_best_match(item['name'], canonical_names, teacher_map)
            
            if best_match:
                if best_match not in canonical_registry: canonical_registry[best_match] = {"grades": [], "matches": []}
                
                for g in item.get('grades', []):
                    g_name_lower = g['name'].lower()
                    if "tendance" in g_name_lower: continue

                    # [FEATURE] Apply Grade Renaming / Moving
                    override = grade_overrides_map.get((best_match, g['name']))
                    
                    target_structure = canonical_registry[best_match]
                    final_grade = g.copy() # Avoid mutating original reference
                    
                    if override:
                        if override.get('new_name'):
                            final_grade['name'] = override['new_name']
                        
                        # Move to another course?
                        if override.get('target_course_id'):
                            target_c_name = override['target_course_id']
                            if target_c_name not in canonical_registry:
                                canonical_registry[target_c_name] = {"grades": [], "matches": ["[MOVED_TARGET]"]}
                            target_structure = canonical_registry[target_c_name]
                    
                    target_structure["grades"].append(final_grade)

                canonical_registry[best_match]["matches"].append(item['name'])
            else:
                if target_semester.lower() in item['name'].lower(): # Only keep unmatched if they belong to this semester
                        unmatched_items.append(item)

    # Inject Manuals (Filtered by Maquette existence)
    for c_name in canonical_names:
        my_manuals = [mg for mg in manual_grades if mg['course_canonical_name'] == c_name]
        if my_manuals:
            if c_name not in canonical_registry: canonical_registry[c_name] = {"grades": [], "matches": ["[MANUAL]"]}
            for mg in my_manuals:
                canonical_registry[c_name]["grades"].append({
                    "name": "📝 " + mg['name'], "grade": mg['grade'], "max_grade": mg['max_grade'], "is_total": False, "is_manual": True, "id": mg['id'] 
                })
             # Exclusions
        if c_name in canonical_registry:
            for g in canonical_registry[c_name]["grades"]:
                g_clean_name = g['name'].replace("📝 ", "") 
                if is_excluded(c_name, g_clean_name, g['grade'], exclusions_rows): g['is_excluded'] = True

    # Distribution
    for c_name, data in canonical_registry.items():
        base_coefs = maquette.get('courses', {}).get(c_name, {})
        override_data = overrides_map.get(c_name)
        target_destinations = {}
        
        # [FEATURE] Apply Custom Name for Display
        display_name = c_name
        if override_data and override_data.get('custom_name'):
            display_name = override_data['custom_name']
        
        if override_data and override_data.get('target_competence'):
                target_comp = override_data['target_competence']
                custom_coef = override_data.get('custom_coef')
                final_coef = custom_coef if custom_coef is not None else 1.0
                target_destinations[target_comp] = final_coef
        else:
            target_destinations = base_coefs.copy()
            if override_data and override_data.get('custom_coef') is not None:
                    for cmp in target_destinations: target_destinations[cmp] = override_data['custom_coef']
        
        if not target_destinations and c_name in maquette['courses']: target_destinations = maquette['courses'][c_name]

        all_grades_vals = []
        for g in data['grades']:
            if g.get('grade') is not None and not g.get('is_total') and not g.get('is_excluded'):
                local_max = g.get('max_grade', 20)
                local_grade = g['grade']
                if local_max == 100 and local_grade <= 20: local_max = 20.0
                normalized = (local_grade / local_max) * 20 if local_max > 0 else local_grade
                all_grades_vals.append(normalized)
        
        final_avg = sum(all_grades_vals) / len(all_grades_vals) if all_grades_vals else None
        
        for comp, coef in target_destinations.items():
            if comp in competences_data:
                competences_data[comp]["courses"].append({
                    "name": display_name, "original_name": c_name, "average": final_avg, "coef": coef, "grades": data['grades'], "is_custom": bool(override_data)
                })
                if final_avg is not None:
                    competences_data[comp]["weighted_sum"] += final_avg * coef
                    competences_data[comp]["coef_sum"] += coef

    # Results
    result_avgs = {}
    total_weighted = 0
    total_coefs = 0
    
    for comp, data in competences_data.items():
        if data["coef_sum"] > 0:
            data["average"] = data["weighted_sum"] / data["coef_sum"]
            result_avgs[comp] = data["average"]
            total_weighted += data["average"]
            total_coefs += 1
    
    sem_avg = total_weighted / total_coefs if total_coefs > 0 else None
    
    return {
        "competences": competences_data,
        "unmatched": unmatched_items,
        "average": sem_avg,
        "comp_averages": result_avgs
    }

@app.get("/", response_class=HTMLResponse)
def home(request: Request, view: str = "dashboard"): # Default view
    username = request.session.get("user")
    if not username:
        return RedirectResponse(url="/login")

    conn = get_db_connection()
    c = conn.cursor()
    
    # 1. Récupérer config utilisateur
    settings = c.execute("SELECT * FROM user_settings WHERE username = ?", (username,)).fetchone()
    
    # REPAIR: Correction immédiate si réglages par défaut invalides ou inexistants
    if not settings or settings['status'] == 'Initial':
        print(f"🔧 REPAIR: Initializing or Updating settings for {username} to S3/EMS/FI")
        from datetime import datetime
        now = datetime.now().strftime("%d/%m/%Y à %H:%M")
        
        c.execute("""
            INSERT INTO user_settings (username, semester, option, status, last_updated)
            VALUES (?, 'S3', 'EMS', 'FI', ?)
            ON CONFLICT(username) DO UPDATE SET semester='S3', option='EMS', status='FI'
        """, (username, now))
        conn.commit()
        settings = c.execute("SELECT * FROM user_settings WHERE username = ?", (username,)).fetchone()

    # Determine Active Context based on View
    # view can be: 's3', 's4', 'year', 'settings', 'dashboard' (auto)
    
    # Auto-detect dashboard view if not specified
    if view == "dashboard":
        # Default to current semester from settings
        view = settings['semester'].lower() if settings else 's3'
    
    context_semester = view.upper() # S3 or S4
    
    courses_list = []
    # Fetch ALL courses for the user (we filter later based on view)
    rows = c.execute("SELECT * FROM courses WHERE username = ?", (username,)).fetchall()
    
    # [FIX] Si aucune donnée en base (nouvel utilisateur ou jamais scrapé),
    # on renvoie direct une structure vide pour déclencher le "Empty State" du template.
    if not rows:
        conn.close()
        return templates.TemplateResponse("index.html", {
            "request": request,
            "competences": {}, # Force empty to trigger Welcome Screen
            "user": username,
            "is_admin": (username == "pesthor"),
            "global_average": None,
            "settings": settings,
            "view": view
        })

    for row in rows:
        course = dict(row)

        grades = c.execute("SELECT * FROM grades WHERE course_id = ? AND username = ?", (course['id'], username)).fetchall()
        course['grades'] = [dict(g) for g in grades]
        courses_list.append(course)

    # 1b. Fetch User Overrides & Manual Grades
    manual_grades_rows = c.execute("SELECT * FROM manual_grades WHERE username = ?", (username,)).fetchall()
    overrides_rows = c.execute("SELECT * FROM course_overrides WHERE username = ?", (username,)).fetchall()
    
    # [NEW] Fetch Grade Overrides
    grade_overrides_rows = c.execute("SELECT * FROM grade_overrides WHERE username = ?", (username,)).fetchall()
    grade_overrides_map = {(r['course_canonical_name'], r['grade_name']): dict(r) for r in grade_overrides_rows}
    
    manual_grades = [dict(r) for r in manual_grades_rows]
    overrides_map = {r['course_canonical_name']: dict(r) for r in overrides_rows}
    
    # 1c. Fetch Grade Exclusions
    exclusions_rows = c.execute("SELECT * FROM grade_exclusions WHERE username = ?", (username,)).fetchall()
    

    
    conn.close()

    if view == "settings":
         return templates.TemplateResponse("settings.html", {
            "request": request,
            "user": username,
            "settings": settings,
            "view": "settings"
        })

    # --- CALCULATION LOGIC ---


    # --- RENDER LOGIC ---
    
    if view == "year":
        # Aggregate S3 + S4
        s3_stats = calculate_semester_stats(courses_list, manual_grades, overrides_map, grade_overrides_map, exclusions_rows, "S3", settings['option'], settings['status'])
        s4_stats = calculate_semester_stats(courses_list, manual_grades, overrides_map, grade_overrides_map, exclusions_rows, "S4", settings['option'], settings['status'])
        
        year_data = {"S3": s3_stats, "S4": s4_stats}
        
        # Calculate Année Average: Moyenne des 4 UE (Aggrégées)
        # On suppose UE1 Année = (UE1 S3 + UE1 S4) / 2
        # Si une UE manque dans un semestre, on prend celle qui existe.
        
        annual_competences = {} # "UE 1": 12.5
        all_ue_keys = set()
        if s3_stats: all_ue_keys.update(s3_stats['comp_averages'].keys())
        if s4_stats: all_ue_keys.update(s4_stats['comp_averages'].keys())
        
        # Mapping simple (UE 1 ... -> UE 1)
        # Attention: dans le CSV S3 c'est "Compétence 1...", S4 aussi. Les clés doivent matcher.
        
        final_sum = 0
        final_count = 0
        
        for ue_key in sorted(all_ue_keys):
            # Clean key name helper if needed
            val_s3 = s3_stats['comp_averages'].get(ue_key) if s3_stats else None
            val_s4 = s4_stats['comp_averages'].get(ue_key) if s4_stats else None
            
            values = [v for v in [val_s3, val_s4] if v is not None]
            if values:
                avg_ue = sum(values) / len(values)
                annual_competences[ue_key] = avg_ue
                final_sum += avg_ue
                final_count += 1
                
        global_year_average = final_sum / final_count if final_count > 0 else None
        
        return templates.TemplateResponse("dashboard_year.html", {
            "request": request,
            "user": username,
            "stats": year_data,
            "annual_competences": annual_competences,
            "global_average": global_year_average,
            "view": "year"
        })

    else:
        # Standard Semester View (S3 or S4)
        stats = calculate_semester_stats(courses_list, manual_grades, overrides_map, grade_overrides_map, exclusions_rows, context_semester, settings['option'], settings['status'])
        
        # Fallback empty structure if calc fails (e.g. no maquette)
        if not stats: 
            competences_data = {"Erreur": {"courses": [], "average": None}}
            global_average = None
        else:
            competences_data = stats['competences']
            # Add Unmatched
            if stats['unmatched']:
                competences_data["Matières non classées"] = {"courses": stats['unmatched'], "average": None}
            global_average = stats['average']

        return templates.TemplateResponse("index.html", {
        "request": request,
        "competences": stats['competences'],
        "unmatched": stats['unmatched'],
        "user": username,
        "is_admin": (username == "pesthor"),
        "global_average": stats['average'],
        "comp_averages": stats['comp_averages'],
        "settings": settings,
        "view": view
    })

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/refresh-ui")
def refresh_ui(request: Request):
    username = request.session.get("user")
    
    # DEBUG LOGS
    print(f"🔄 REFRESH REQUEST for user: {username}")
    
    # Si le scraper n'est plus en mémoire (après redémarrage serveur), on force la reconnexion
    if not username or username not in active_scrapers:
        print("❌ Scraper not found or user not logged in. Redirecting to login.")
        return RedirectResponse(url="/login")
    
    scraper = active_scrapers[username]
    
    # 1. Scraping (SÉQUENTIEL POUR STABILITÉ)
    print("🔄 Début du scraping...")
    try:
        if not scraper.is_connected:
            scraper.login()
            
        raw_courses = scraper.get_all_courses()
    except Exception as e:
        print(f"❌ Erreur SCRAPING exception: {e}")
        raw_courses = []

    print(f"📚 {len(raw_courses)} matières trouvées. Lancement SÉQUENTIEL...")
    
    courses_data = [] # Liste pour stocker (course_info, grades_list)

    # --- CORRECTION CRITIQUE : RETOUR AU SÉQUENTIEL ---
    # La version multithread cassait la session CAS/Moodle.
    # On itère simplement avec une petite pause pour être "poli" avec le serveur.
    
    for course in raw_courses:
        time.sleep(random.uniform(0.1, 0.3)) 
        try:
            print(f"   📥 Scraping: {course['name']}...")
            grades = scraper.get_grades_for_course(course['id'])
            
            # Calcul de la moyenne locale
            # Filter validated notes
            notes_valides = [g['grade'] for g in grades if g['max_grade'] == 20 and not g['is_total']]
            avg = sum(notes_valides) / len(notes_valides) if notes_valides else None
            
            courses_data.append({
                "course": course,
                "grades": grades,
                "average": avg
            })
        except Exception as e:
            print(f"⚠️ Erreur scraping grades pour {course.get('name')}: {e}")

    print("✅ Scraping terminé. Mise à jour de la BDD...")

    # 2. Mise à jour Base de données (Opération rapide)
    try:
        conn = get_db_connection()
        c = conn.cursor()
        
        # On ne vide que les données de CET utilisateur
        c.execute("DELETE FROM grades WHERE username = ?", (username,))
        c.execute("DELETE FROM courses WHERE username = ?", (username,))
        
        count_courses = 0
        for item in courses_data:
            c_info = item['course']
            c.execute("INSERT INTO courses (id, username, name, average) VALUES (?, ?, ?, ?)", 
                      (c_info['id'], username, c_info['name'], item['average']))
            count_courses += 1
            
            for g in item['grades']:
                c.execute("INSERT INTO grades (course_id, username, name, grade, max_grade, is_total) VALUES (?, ?, ?, ?, ?, ?)", 
                          (c_info['id'], username, g['name'], g['grade'], g['max_grade'], g['is_total']))
        
        print(f"💾 BDD UPDATE: Inserted {count_courses} courses for {username}")

        # Mise à jour date et Defaults si vide
        from datetime import datetime
        now = datetime.now().strftime("%d/%m/%Y à %H:%M")
        
        
        # On s'assure qu'une ligne existe pour l'utilisateur
        # REPAIR: Si l'utilisateur a les mauvais defaults du dernier patch ('Initial'), on corrige
        c.execute("UPDATE user_settings SET semester='S3', option='EMS', status='FI' WHERE username = ? AND status = 'Initial'", (username,))
        
        # Si c'est la première fois, on met des valeurs par défaut VALIDES (S3 - BUT2 - EMS - FI)
        c.execute("""
            INSERT INTO user_settings (username, semester, option, status, last_updated)
            VALUES (?, 'S3', 'EMS', 'FI', ?)
            ON CONFLICT(username) DO UPDATE SET last_updated = excluded.last_updated
        """, (username, now))

        conn.commit()
    except Exception as e:
        print(f"❌ Erreur BDD: {e}")
    finally:
        conn.close()
    
    return RedirectResponse(url="/", status_code=303)

# --- API MODELS ---
class ManualGradeRequest(BaseModel):
    course_name: str
    grade_name: str
    grade_value: float
    max_value: float = 20.0
    coef: float = 1.0

class CustomCourseRequest(BaseModel):
    course_name: str
    target_competence: Optional[str] = None
    custom_coef: Optional[float] = None
    # [FEATURE] Added custom_name
    custom_name: Optional[str] = None

class DeleteGradeRequest(BaseModel):
    grade_id: int

class ExcludeGradeRequest(BaseModel):
    course_name: str
    grade_name: str
    grade_value: float

# [FEATURE] New Model for Grade Editing
class EditGradeRequest(BaseModel):
    course_name: str # Canonical Course Name (Context)
    grade_name: str # Current Grade Name (ID)
    new_name: Optional[str] = None
    target_course_name: Optional[str] = None # Where to move it

# --- API ROUTES ---

@app.post("/api/manual-grade/add")
async def add_manual_grade(request: Request, data: ManualGradeRequest):
    username = request.session.get("user")
    if not username: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO manual_grades (username, course_canonical_name, name, grade, max_grade, coef) VALUES (?, ?, ?, ?, ?, ?)",
              (username, data.course_name, data.grade_name, data.grade_value, data.max_value, data.coef))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/manual-grade/delete")
async def delete_manual_grade(request: Request, data: DeleteGradeRequest):
    username = request.session.get("user")
    if not username: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM manual_grades WHERE id = ? AND username = ?", (data.grade_id, username))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/grade/exclude")
async def exclude_grade(request: Request, data: ExcludeGradeRequest):
    username = request.session.get("user")
    if not username: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    conn = get_db_connection()
    c = conn.cursor()
    # On ajoute à la liste des exclusions
    # On nettoie le nom (enlève l'icone si présent par erreur, même si le front l'envoie propre normalement)
    clean_name = data.grade_name.replace("📝 ", "")
    
    # [MAPPING_HELPER] Log pour récupérer les règles plus tard
    print(f"[MAPPING_HELPER] EXCLUDE | Course: '{data.course_name}' | Grade: '{clean_name}' | Value: {data.grade_value}")
    
    c.execute("INSERT INTO grade_exclusions (username, course_canonical_name, grade_name, grade_value) VALUES (?, ?, ?, ?)",
              (username, data.course_name, clean_name, data.grade_value))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/course/customize")
async def customize_course(request: Request, data: CustomCourseRequest):
    username = request.session.get("user")
    if not username: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    # [MAPPING_HELPER] Log pour récupérer les règles plus tard
    print(f"[MAPPING_HELPER] MOVE/CUSTOMIZE | Course: '{data.course_name}' | Target UE: '{data.target_competence}' | Coef: {data.custom_coef}")
    
    conn = get_db_connection()
    c = conn.cursor()
    # Upsert logic
    c.execute("""
        INSERT INTO course_overrides (username, course_canonical_name, target_competence, custom_coef) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username, course_canonical_name) 
        DO UPDATE SET target_competence=excluded.target_competence, custom_coef=excluded.custom_coef
    """, (username, data.course_name, data.target_competence, data.custom_coef))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# [FEATURE] Endpoint for Grade Editing (Rename/Move)
@app.post("/api/grade/edit")
async def edit_grade(request: Request, data: EditGradeRequest):
    username = request.session.get("user")
    if not username: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    # [MAPPING_HELPER]
    print(f"[MAPPING_HELPER] EDIT_GRADE | Course: '{data.course_name}' | Grade: '{data.grade_name}' | NewName: '{data.new_name}' | Target: '{data.target_course_name}'")

    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute("""
        INSERT INTO grade_overrides (username, course_canonical_name, grade_name, new_name, target_course_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(username, course_canonical_name, grade_name)
        DO UPDATE SET new_name=excluded.new_name, target_course_id=excluded.target_course_id
    """, (username, data.course_name, data.grade_name, data.new_name, data.target_course_name))
    
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/admin/export-maquette")
async def export_maquette(request: Request):
    username = request.session.get("user")
    if not username: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    conn = get_db_connection()
    c = conn.cursor()
    
    # Fetch User Settings for Context
    settings = c.execute("SELECT * FROM user_settings WHERE username = ?", (username,)).fetchone()
    semester = settings['semester'] if settings else 'S3' # Default to S3 if not set
    option = settings['option'] if settings else 'INFO'
    status = settings['status'] if settings else 'Etudiant'
    
    # Fetch Data for Calculation
    courses_rows = c.execute("SELECT * FROM courses WHERE username = ?", (username,)).fetchall()
    grades_rows = c.execute("SELECT * FROM grades WHERE username = ?", (username,)).fetchall()
    manual_grades_rows = c.execute("SELECT * FROM manual_grades WHERE username = ?", (username,)).fetchall()
    
    overrides_rows = c.execute("SELECT * FROM course_overrides WHERE username = ?", (username,)).fetchall()
    grade_overrides_rows = c.execute("SELECT * FROM grade_overrides WHERE username = ?", (username,)).fetchall()
    exclusions_rows = c.execute("SELECT * FROM grade_exclusions WHERE username = ?", (username,)).fetchall()

    conn.close()

    # Convert to Dicts/Lists
    # We need to nest grades into courses to match calculate_semester_stats signature
    manual_grades = [dict(r) for r in manual_grades_rows]
    overrides_map = {r['course_canonical_name']: dict(r) for r in overrides_rows}
    grade_overrides_map = {(r['course_canonical_name'], r['grade_name']): dict(r) for r in grade_overrides_rows}
    # exclusions_rows is passed directly
    
    # helper for nesting
    grades_by_course = {}
    for g in grades_rows:
        g_dict = dict(g)
        cid = g_dict['course_id']
        if cid not in grades_by_course: grades_by_course[cid] = []
        grades_by_course[cid].append(g_dict)
        
    courses_list = []
    for r in courses_rows:
        c_dict = dict(r)
        c_dict['grades'] = grades_by_course.get(c_dict['id'], [])
        courses_list.append(c_dict)

    # Calculate Stats (Gives us the final structure)
    stats = calculate_semester_stats(
        courses_list, manual_grades, overrides_map, grade_overrides_map, exclusions_rows,
        semester, option, status
    )
    
    # Log to Console
    print(f"\n{'='*20} START MAQUETTE EXPORT ({semester}) {'='*20}")
    
    if stats and 'competences' in stats:
        for ue_name, ue_data in stats['competences'].items():
            print(f"[MAQUETTE_EXPORT] UE: {ue_name}")
            for course in ue_data['courses']:
                c_name = course['name']
                c_orig = course.get('original_name', 'N/A')
                print(f"[MAQUETTE_EXPORT]   Course: {c_name} (Original: {c_orig})")
                for grade in course['grades']:
                    g_name = grade['name']
                    g_val = grade['grade']
                    g_max = grade['max_grade']
                    print(f"[MAQUETTE_EXPORT]     - Grade: {g_name} : {g_val}/{g_max}")
    else:
        print("[MAQUETTE_EXPORT] No data found or calculation error.")
        
    print(f"{'='*20} END MAQUETTE EXPORT {'='*20}\n")
    
    return {"status": "ok", "message": "Maquette exported to server logs"}

@app.post("/save-config")
def save_config(request: Request, semester: str = Form(...), option: str = Form(...), status: str = Form(...)):
    username = request.session.get("user")
    if not username:
        return RedirectResponse(url="/login", status_code=303)
        
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO user_settings (username, semester, option, status) VALUES (?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET semester=excluded.semester, option=excluded.option, status=excluded.status
    """, (username, semester, option, status))
    conn.commit()
    conn.close()
    
    return RedirectResponse(url="/", status_code=303)

def find_best_match(scraped_name, canonical_names, teacher_map=None):
    """Trouve le nom canonique le plus proche avec heuristiques intelligentes"""
    clean_scraped = scraped_name.lower().strip()
    
    # 1. Overrides Manuels (Basés sur les logs & FIX pour 'ibazizou', 'alie', etc.)
    manual_map = {
        # --- Compétence 4 & Stats ---
        "ibazizou": "SAÉ - Description et prévision de données temporelles",
        "alie": "SAÉ - Description et prévision de données temporelles",
        "temporelles": "SAÉ - Description et prévision de données temporelles",
        "cookie": "SAÉ - EMS - Recueil et analyse de données par échantillonnage ou plan d'expérience",
        "recueil": "SAÉ - EMS - Recueil et analyse de données par échantillonnage ou plan d'expérience",
        "devoirdépôt": "EMS - Techniques de sondage et méthologie de l'enquête",
        "mise en place d'une enquête": "EMS - Techniques de sondage et méthologie de l'enquête",
        "prou": "EMS - Techniques de sondage et méthologie de l'enquête",
        "canari": "AL - Régression linéaire simple",

        # --- Eco / Gestion ---
        "gestion": "Les données de l’environnement entrepreneurial et économique pour l’aide à la décision",
        "economie": "Les données de l’environnement entrepreneurial et économique pour l’aide à la décision",
        "entrepreneuriat": "Les données de l’environnement entrepreneurial et économique pour l’aide à la décision",

        # --- Anglais & Com ---
        "writing": "Anglais professionnel",
        "anglais": "Anglais professionnel",
        "expression orale": "Anglais professionnel",
        "bieber": "Communication organisationnelle et professionnelle",
        "scénario": "Communication organisationnelle et professionnelle",
        "communication": "Communication organisationnelle et professionnelle",

        # --- Informatique / SID ---
        "architecture sid": "Systèmes d'information décisionnels",
        "testqcm": "Systèmes d'information décisionnels",
        "sid": "Systèmes d'information décisionnels",
        "sas": "Programmation statistique automatisée",
        "poo": "EMS - AL -  Programmation objet",
        "web": "Technologies web",
        
        # --- Conformité ---
        "conformité": "SAÉ - EMS - Conformité réglementaire pour analyser des données",
        "règlementaire": "SAÉ - EMS - Conformité réglementaire pour analyser des données"
    }
    
    for key, target in manual_map.items():
        if key in clean_scraped:
            return target

    # 2. Correspondance par Enseignant (TRÈS FIABLE)
    if teacher_map:
        for c_name, teacher in teacher_map.items():
            if not teacher or len(teacher) < 3: continue
            
            # On cherche si le nom du prof (ex: "Goumeziane") est dans le nom scrapé
            # On découpe "M. Gouméziane" -> "Gouméziane"
            parts = teacher.replace("M.", "").replace("Mme", "").split()
            for part in parts:
                if len(part) > 3 and part.lower() in clean_scraped:
                    # BINGO
                    return c_name

    # 3. Correspondance par Mots-clés Canoniqes (Dictionnaire Inversé)
    # On éclate chaque nom canonique en mots-clés significatifs
    # Ex: "Systèmes d'information décisionnels" -> ["systèmes", "information", "décisionnels", "architecture"]
    
    best_score = 0
    best_candidate = None
    
    # Mots vides à ignorer
    stopwords = ["de", "des", "le", "la", "les", "un", "une", "et", "à", "pour", "en", "d'", "l'", "s3", "s4", "but", "but2", "cours", "td", "tp"]
    
    # On regarde si le semestre est dans le nom (Ex: "S3 - ...")
    # Si oui, on booste le score
    semester_boost = False
    if "s3" in clean_scraped or "s4" in clean_scraped:
         semester_boost = True

    for canonical in canonical_names:
        score = 0
        clean_canonical = canonical.lower()
        
        # Mots clés du canonique
        keywords = [w for w in re.split(r'\W+', clean_canonical) if len(w) > 2 and w not in stopwords]
        
        # Mots clés du scrapé
        scraped_words = [w for w in re.split(r'\W+', clean_scraped) if len(w) > 2 and w not in stopwords]
        
        for k in keywords:
            # Si le mot clé est dans le nom scrapé (même partiel)
            if k in clean_scraped:
                 score += 2
                 
            # Correspondance exacte mot à mot
            if k in scraped_words:
                score += 1
        
        # Bonus si startswith
        if clean_scraped.startswith(clean_canonical[:10]):
            score += 3
            
        if score > best_score:
            best_score = score
            best_candidate = canonical
            
    if best_score >= 2: # Seuil minimum de pertinence
        return best_candidate

    # 4. Fallback Fuzzy Match (Dernier recours)
    matches = get_close_matches(clean_scraped, [n.lower() for n in canonical_names], n=1, cutoff=0.4)
    if matches:
        for name in canonical_names:
            if name.lower() == matches[0]:
                return name
                
    return None

if __name__ == "__main__":
    import uvicorn
    # Ecoute sur 0.0.0.0 pour être accessible depuis le réseau local
    uvicorn.run(app, host="0.0.0.0", port=8000)
