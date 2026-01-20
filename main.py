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
        return self.cursor.execute(query, params)

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

app = FastAPI(title="Redoublement 8000", lifespan=lifespan)

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
    
    c.execute(f'''CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, name TEXT, average REAL)''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS grades (id {pk_type}, course_id TEXT, name TEXT, grade REAL, max_grade REAL, is_total BOOLEAN)''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS user_settings (username TEXT PRIMARY KEY, semester TEXT, option TEXT, status TEXT, last_updated TEXT)''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS manual_grades (id {pk_type}, username TEXT, course_canonical_name TEXT, name TEXT, grade REAL, max_grade REAL, coef REAL)''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS course_overrides (username TEXT, course_canonical_name TEXT, target_competence TEXT, custom_coef REAL, PRIMARY KEY(username, course_canonical_name))''')
    c.execute(f'''CREATE TABLE IF NOT EXISTS grade_exclusions (id {pk_type}, username TEXT, course_canonical_name TEXT, grade_name TEXT, grade_value REAL)''')
    
    # Migration pour ajouter la colonne last_updated si elle n'existe pas
    try:
        c.execute("ALTER TABLE user_settings ADD COLUMN last_updated TEXT")
    except sqlite3.OperationalError:
        pass # La colonne existe déjà
        
    conn.commit()
    conn.close()

# --- ROUTES ---

@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/login")
def login_action(username: str = Form(...), password: str = Form(...)):
    # On teste la connexion à l'ENT
    scraper = MoodleScraper(username, password)
    if scraper.login():
        print(f"✅ Connexion réussie pour {username}")
        # On garde le scraper actif en mémoire
        active_scrapers[username] = scraper
        
        # On crée le cookie de session
        response = RedirectResponse(url="/", status_code=303)
        response.set_cookie(key="session_user", value=username, httponly=True)
        return response
    else:
        return RedirectResponse(url="/login?error=1", status_code=303)

@app.get("/logout")
def logout():
    response = RedirectResponse(url="/login")
    response.delete_cookie("session_user")
    return response

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    username = request.cookies.get("session_user")
    if not username:
        return RedirectResponse(url="/login")

    conn = get_db_connection()
    c = conn.cursor()
    
    # 1. Récupérer config utilisateur
    settings = c.execute("SELECT * FROM user_settings WHERE username = ?", (username,)).fetchone()
    
    courses_list = []
    # Récupération des données locales
    rows = c.execute("SELECT * FROM courses").fetchall()
    for row in rows:
        course = dict(row)
        grades = c.execute("SELECT * FROM grades WHERE course_id = ?", (course['id'],)).fetchall()
        course['grades'] = [dict(g) for g in grades]
        courses_list.append(course)

    # 1b. Fetch User Overrides & Manual Grades
    manual_grades_rows = c.execute("SELECT * FROM manual_grades WHERE username = ?", (username,)).fetchall()
    overrides_rows = c.execute("SELECT * FROM course_overrides WHERE username = ?", (username,)).fetchall()
    
    manual_grades = [dict(r) for r in manual_grades_rows]
    overrides_map = {r['course_canonical_name']: dict(r) for r in overrides_rows}
    
    # 1c. Fetch Grade Exclusions
    exclusions_rows = c.execute("SELECT * FROM grade_exclusions WHERE username = ?", (username,)).fetchall()
    
    # Helper pour vérifier si une note est exclue
    def is_excluded(course_name, g_name, g_val):
        for ex in exclusions_rows:
            if ex['course_canonical_name'] == course_name and ex['grade_name'] == g_name and abs(ex['grade_value'] - g_val) < 0.01:
                return True
        return False
    
    conn.close()

    # 2. Logique Maquette / Coefficients
    competences_data = {} # { "Compétence 1": { "courses": [], "total_grade*coef": 0, "total_coef": 0 } }
    global_average = None
    
    if settings:
        maquette = maquette_service.load_maquette(settings['semester'], settings['option'], settings['status'])
        
        if maquette:
            # Init competences
            for comp in maquette['competences']:
                competences_data[comp] = {"courses": [], "weighted_sum": 0, "coef_sum": 0}
            
            # Mapping et calculs
            canonical_names = list(maquette['courses'].keys())
            teacher_map = maquette.get('teachers', {})
            
            # --- PHASE 1: AGGREGATION ---
            # On regroupe tout par "Nom Canonique" (Nom officiel)
            canonical_registry = {} 
            # Structure: 
            # { "Nom Canonique": { "grades": [], "matches": ["Nom Scrapé 1", "Nom Scrapé 2"] } }
            
            unmatched_items = []

            for course in courses_list:
                # Gestion des "Meta-Courses" (Espace Promo, Département SD...)
                is_meta_course = "département sd" in course['name'].lower() or "espace promo" in course['name'].lower()
                
                items_to_process = []
                if is_meta_course:
                    print(f"📦 Unpacking Meta-Course: {course['name']}")
                    for g in course['grades']:
                        if "tendance" in g['name'].lower(): continue
                        items_to_process.append({
                            "name": g['name'],
                            "grades": [g], 
                            "is_virtual": True
                        })
                else:
                    items_to_process.append(course)
                
                for item in items_to_process:
                    # Filtre de sécurité anti-tendance centrale (si scraper l'a raté)
                    item_name_lower = item.get('name', '').lower()
                    if "tendance" in item_name_lower:
                        continue
                     
                    # --- MANUAL MAPPING OVERRIDES ---
                    forced_canonical = None
                    if "economie" in item_name_lower or "économie" in item_name_lower:
                         for c in canonical_names:
                             if "environnement" in c.lower() and "économique" in c.lower():
                                 forced_canonical = c
                                 break
                    elif "tableau software" in item_name_lower:
                        for c in canonical_names:
                            if "utilisation avancée" in c.lower():
                                forced_canonical = c
                                break
                                
                    if forced_canonical:
                        best_match = forced_canonical
                        print(f"🔧 OVERRIDE: '{item['name']}' -> '{best_match}'")
                    else:   
                        best_match = find_best_match(item['name'], canonical_names, teacher_map)
                        print(f"🧩 MATCH: '{item['name']}' -> '{best_match}'")
                    
                    if best_match:
                        if best_match not in canonical_registry:
                            canonical_registry[best_match] = {"grades": [], "matches": []}
                        
                        # On ajoute les notes scrapées
                        for g in item.get('grades', []):
                            g_name_lower = g['name'].lower()
                            if "tendance" in g_name_lower: continue
                            
                            # FIX: Tableau Software
                            if "tableau software" in best_match.lower() or "utilisation avancée" in best_match.lower():
                                if "devoir note" in g_name_lower:
                                    continue
                                    
                            # FIX: Anglais - Deduplication
                            if "anglais" in best_match.lower():
                                is_duplicate = False
                                for existing_g in canonical_registry[best_match]["grades"]:
                                    if "oral" in g_name_lower and "oral" in existing_g['name'].lower() and existing_g['grade'] == g['grade']:
                                         is_duplicate = True; break
                                    if existing_g['name'] == g['name'] and existing_g['grade'] == g['grade']:
                                        is_duplicate = True; break
                                if is_duplicate: continue

                            canonical_registry[best_match]["grades"].append(g)
                            
                        canonical_registry[best_match]["matches"].append(item['name'])
                    else:
                        unmatched_items.append(item)
            
            # --- PHASE 1.5: INJECT MANUAL GRADES & FILTER EXCLUSIONS ---
            for c_name in canonical_names:
                # 1. Inject Manuals
                my_manuals = [mg for mg in manual_grades if mg['course_canonical_name'] == c_name]
                if my_manuals:
                    if c_name not in canonical_registry:
                         canonical_registry[c_name] = {"grades": [], "matches": ["[MANUAL ONLY]"]}
                    
                    for mg in my_manuals:
                         canonical_registry[c_name]["grades"].append({
                            "name": "📝 " + mg['name'], 
                            "grade": mg['grade'],
                            "max_grade": mg['max_grade'],
                            "is_total": False,
                            "is_manual": True,
                            "id": mg['id'] 
                        })
                
                # 2. MARK EXCLUDED
                if c_name in canonical_registry:
                    for g in canonical_registry[c_name]["grades"]:
                        # Vérif exclusion
                        # Note: pour les manuelles, on a un ID, mais pour les scrapées on utilise (Name + Value)
                        g_clean_name = g['name'].replace("📝 ", "") 
                        if is_excluded(c_name, g_clean_name, g['grade']):
                            g['is_excluded'] = True

            # --- PHASE 2: DISTRIBUTION ---
            # A. Traitement des matières RECONNUES (Aggregées)
            for c_name, data in canonical_registry.items():
                # Default coefs from maquette
                base_coefs = maquette.get('courses', {}).get(c_name, {})
                
                # Check Overrides
                override_data = overrides_map.get(c_name)
                
                target_destinations = {} # { "Nom Competence": coef }
                
                if override_data and override_data.get('target_competence'):
                    # User MOVED the course to a specific block
                    target_comp = override_data['target_competence']
                    custom_coef = override_data.get('custom_coef')
                    
                    # If custom_coef is not set, what to use? Default 1.0 implies generic weight.
                    final_coef = custom_coef if custom_coef is not None else 1.0
                    target_destinations[target_comp] = final_coef
                else:
                    # Use standard Maquette logic
                    target_destinations = base_coefs.copy()
                    # Apply custom coef override if present (but not moved)
                    if override_data and override_data.get('custom_coef') is not None:
                         for cmp in target_destinations:
                             target_destinations[cmp] = override_data['custom_coef']

                if not target_destinations and c_name in maquette['courses']:
                     # Should not happen if logic above matches, but fallback
                     target_destinations = maquette['courses'][c_name]

                # Recalcul de la moyenne unique pour cette matière canonique
                all_grades_vals = []
                for g in data['grades']:
                    if g.get('grade') is not None and not g.get('is_total') and not g.get('is_excluded'):
                        # Normalisation /20
                        # Normalisation /20
                        local_max = g.get('max_grade', 20)
                        local_grade = g['grade']
                        
                        if local_max == 100 and local_grade <= 20: local_max = 20.0
                        
                        if local_max > 0:
                            normalized = (local_grade / local_max) * 20
                            all_grades_vals.append(normalized)
                        else:
                            all_grades_vals.append(local_grade)
                        
                if all_grades_vals:
                    final_avg = sum(all_grades_vals) / len(all_grades_vals)
                else:
                    final_avg = None
                
                # Ajout aux compétences cibles
                for comp, coef in target_destinations.items():
                    if comp in competences_data:
                        competences_data[comp]["courses"].append({
                            "name": c_name, # On affiche le NOM OFFICIEL propre
                            "average": final_avg,
                            "coef": coef,
                            "grades": data['grades'],
                            "is_custom": bool(override_data) # Tag for UI
                        })
                        
                        if final_avg is not None:
                            competences_data[comp]["weighted_sum"] += final_avg * coef
                            competences_data[comp]["coef_sum"] += coef

            # B. Traitement des matières NON RECONNUES
            for item in unmatched_items:
                 if "Matières non classées" not in competences_data:
                     competences_data["Matières non classées"] = {"courses": [], "weighted_sum": 0, "coef_sum": 0}
                 competences_data["Matières non classées"]["courses"].append(item)
            
            # Calcul moyennes par compétence

            # Calcul moyennes par compétence
            final_weighted_sum = 0
            final_coef_sum = 0
            
            for comp, data in competences_data.items():
                if data["coef_sum"] > 0:
                   data["average"] = data["weighted_sum"] / data["coef_sum"]
                   # Pour la moyenne générale (toutes compétences égales ? Ou ECTS ?)
                   # Supposons moyenne des moyennes de compétences pour l'instant ou somme ECTS
                   # Le fichier CSV donne des ECTS par compétence (Ligne 8: 8ECTS, 8ECTS...)
                   # Simplification: Moyenne arithmétique des compétences si pas d'info
                   final_weighted_sum += data["average"]
                   final_coef_sum += 1 

            if final_coef_sum > 0:
                global_average = final_weighted_sum / final_coef_sum
        else:
             # Fallback si pas de maquette chargée
             competences_data["Toutes les matières"] = {"courses": courses_list, "average": None}
    else:
        # Pas de settings
        competences_data["Toutes les matières"] = {"courses": courses_list, "average": None}


    return templates.TemplateResponse("index.html", {
        "request": request,
        "competences": competences_data,
        "user": username,
        "global_average": global_average,
        "settings": settings
    })

@app.get("/refresh-ui")
def refresh_ui(request: Request):
    username = request.cookies.get("session_user")
    
    # Si le scraper n'est plus en mémoire (après redémarrage serveur), on force la reconnexion
    if not username or username not in active_scrapers:
        return RedirectResponse(url="/login")
    
    scraper = active_scrapers[username]
    
    # 1. Scraping (Longue opération réseau) - On le fait HORS de la connexion DB
    print("🔄 Début du scraping...")
    raw_courses = scraper.get_all_courses()
    print(f"📚 {len(raw_courses)} matières trouvées via scraping.")
    
    courses_data = [] # Liste pour stocker (course_info, grades_list)
    
    for course in raw_courses:
        grades = scraper.get_grades_for_course(course['id'])
        # Calcul de la moyenne locale
        notes_valides = [g['grade'] for g in grades if g['max_grade'] == 20 and not g['is_total']]
        avg = sum(notes_valides) / len(notes_valides) if notes_valides else None
        
        courses_data.append({
            "course": course,
            "grades": grades,
            "average": avg
        })
        
    print("✅ Scraping terminé. Mise à jour de la BDD...")

    # 2. Mise à jour Base de données (Opération rapide)
    try:
        conn = get_db_connection()
        c = conn.cursor()
        
        # On vide tout
        c.execute("DELETE FROM grades")
        c.execute("DELETE FROM courses")
        
        for item in courses_data:
            c_info = item['course']
            c.execute("INSERT INTO courses (id, name, average) VALUES (?, ?, ?)", 
                      (c_info['id'], c_info['name'], item['average']))
            
            for g in item['grades']:
                c.execute("INSERT INTO grades (course_id, name, grade, max_grade, is_total) VALUES (?, ?, ?, ?, ?)", 
                          (c_info['id'], g['name'], g['grade'], g['max_grade'], g['is_total']))
        
        # Mise à jour date
        from datetime import datetime
        now = datetime.now().strftime("%d/%m/%Y à %H:%M")
        c.execute("UPDATE user_settings SET last_updated = ? WHERE username = ?", (now, username))

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

class DeleteGradeRequest(BaseModel):
    grade_id: int

class ExcludeGradeRequest(BaseModel):
    course_name: str
    grade_name: str
    grade_value: float

# --- API ROUTES ---

@app.post("/api/manual-grade/add")
async def add_manual_grade(request: Request, data: ManualGradeRequest):
    username = request.cookies.get("session_user")
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
    username = request.cookies.get("session_user")
    if not username: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM manual_grades WHERE id = ? AND username = ?", (data.grade_id, username))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/grade/exclude")
async def exclude_grade(request: Request, data: ExcludeGradeRequest):
    username = request.cookies.get("session_user")
    if not username: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    conn = get_db_connection()
    c = conn.cursor()
    # On ajoute à la liste des exclusions
    # On nettoie le nom (enlève l'icone si présent par erreur, même si le front l'envoie propre normalement)
    clean_name = data.grade_name.replace("📝 ", "")
    
    c.execute("INSERT INTO grade_exclusions (username, course_canonical_name, grade_name, grade_value) VALUES (?, ?, ?, ?)",
              (username, data.course_name, clean_name, data.grade_value))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/course/customize")
async def customize_course(request: Request, data: CustomCourseRequest):
    username = request.cookies.get("session_user")
    if not username: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
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

@app.post("/save-config")
def save_config(request: Request, semester: str = Form(...), option: str = Form(...), status: str = Form(...)):
    username = request.cookies.get("session_user")
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
    
    # 1. Overrides Manuels (Basés sur les logs)
    manual_map = {
        "tableau software": "Utilisation avancée d'outils de reporting",
        "power bi": "Utilisation avancée d'outils de reporting",
        "sas": "Programmation statistique automatisée",
        "alimentation": "SAÉ - Intégration de données dans un Datawarehouse - Talend", 
        "droit": "SAÉ - EMS - Conformité réglementaire pour analyser des données",
        "architecture": "Systèmes d'information décisionnels",
        "modélisation sid": "Systèmes d'information décisionnels",
        "rappels sql": "Systèmes d'information décisionnels",
        "rls": "AL - Régression linéaire simple",
        "sig": "AL - Système d'information géographique",
        "anglais": "Anglais professionnel",
        "communication": "Communication organisationnelle et professionnelle",
        "sondage": "EMS - Techniques de sondage et méthologie de l'enquête",
        "enquêtes": "EMS - Techniques de sondage et méthologie de l'enquête",
        "algèbre": "Algèbre linéaire",
        "web": "Technologies web",
        "poo": "EMS - AL -  Programmation objet",
        "programmation objet": "EMS - AL -  Programmation objet",
        "économie": "Les données de l’environnement entrepreneurial et économique pour l’aide à la décision",
        "entrepreneuriat": "Les données de l’environnement entrepreneurial et économique pour l’aide à la décision",
        "prou": "EMS - Techniques de sondage et méthologie de l'enquête" # Force match for Mr Prou
    }
    
    for key, target in manual_map.items():
        if key in clean_scraped:
            if "prou" in clean_scraped:
                print(f"🐛 DEBUG PROU: Found key '{key}' in '{clean_scraped}' -> Returning '{target}'")
            return target
            
    if "prou" in clean_scraped:
        print(f"🐛 DEBUG PROU: 'prou' in name but NO manual match found! Keys checked: {list(manual_map.keys())}")

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
