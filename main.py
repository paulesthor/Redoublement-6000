import os
from fastapi import FastAPI, Request, Form, Response
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from scraper import MoodleScraper
from config import SEMESTER_CONFIG, ORDERED_UES
from sqlalchemy import create_engine, Column, String, Float, Boolean, Integer
from sqlalchemy.orm import sessionmaker, declarative_base

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# --- CONNEXION SUPABASE (PostgreSQL) ---
DATABASE_URL = os.getenv("DATABASE_URL")

# Fallback pour tester en local sur ton PC sans Supabase
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./notes.db"

# Correction pour SQLAlchemy (Render/Supabase donnent parfois "postgres://" au lieu de "postgresql://")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- TABLES BDD ---
class Setting(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(String)

class Course(Base):
    __tablename__ = "courses"
    id = Column(String, primary_key=True)
    moodle_name = Column(String)
    average = Column(Float, nullable=True)

class Grade(Base):
    __tablename__ = "grades"
    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(String)
    name = Column(String)
    grade = Column(Float)
    max_grade = Column(Float)
    is_total = Column(Boolean)

# Création des tables si elles n'existent pas
Base.metadata.create_all(bind=engine)

active_scrapers = {}

# --- FONCTIONS UTILES ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_mapping(moodle_name, track, mode):
    profile_key = f"{track}_{mode}"
    for key, info in SEMESTER_CONFIG.items():
        if key.lower() in moodle_name.lower():
            coef = info["coefs"].get(profile_key, 0)
            return {"ue": info["ue"], "coef": coef, "name": info["name"]}
    return {"ue": "Hors Maquette", "coef": 0, "name": moodle_name}

def calculate_averages(db, track, mode):
    courses = db.query(Course).all()
    ue_data = {}
    
    for course in courses:
        mapping = get_mapping(course.moodle_name, track, mode)
        ue = mapping['ue']
        coef = mapping['coef']
        
        if coef == 0: continue
            
        if ue not in ue_data: ue_data[ue] = {"points": 0, "coefs": 0, "courses": []}
        
        if course.average is not None:
            ue_data[ue]["points"] += course.average * coef
            ue_data[ue]["coefs"] += coef
            
        # On récupère les notes associées
        grades = db.query(Grade).filter(Grade.course_id == course.id).all()
        grades_list = [{"name": g.name, "grade": g.grade, "max_grade": g.max_grade, "is_total": g.is_total} for g in grades]
        
        ue_data[ue]["courses"].append({
            "id": course.id,
            "display_name": mapping['name'],
            "average": course.average,
            "grades": grades_list,
            "coef": coef
        })

    # Tri et calculs finaux
    final_ues = []
    sorted_keys = sorted(ue_data.keys(), key=lambda x: ORDERED_UES.index(x) if x in ORDERED_UES else 999)
    
    total_pts = 0
    total_coefs = 0
    
    for ue_name in sorted_keys:
        d = ue_data[ue_name]
        ue_avg = (d["points"] / d["coefs"]) if d["coefs"] > 0 else None
        
        if ue_avg:
            total_pts += d["points"]
            total_coefs += d["coefs"]
            
        final_ues.append({
            "name": ue_name,
            "average": ue_avg,
            "courses": d["courses"]
        })
        
    general_avg = (total_pts / total_coefs) if total_coefs > 0 else None
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
        # Cookie sécurisé valide 30 jours
        response.set_cookie(key="session_user", value=username, httponly=True, max_age=2592000)
        return response
    return RedirectResponse(url="/login?error=1", status_code=303)

@app.get("/logout")
def logout():
    response = RedirectResponse(url="/login")
    response.delete_cookie("session_user")
    return response

@app.get("/set-profile")
def set_profile(track: str, mode: str):
    db = SessionLocal()
    
    # Mise à jour TRACK
    s_track = db.query(Setting).filter(Setting.key == 'track').first()
    if not s_track:
        db.add(Setting(key='track', value=track))
    else:
        s_track.value = track
        
    # Mise à jour MODE
    s_mode = db.query(Setting).filter(Setting.key == 'mode').first()
    if not s_mode:
        db.add(Setting(key='mode', value=mode))
    else:
        s_mode.value = mode
        
    db.commit()
    db.close()
    return RedirectResponse(url="/", status_code=303)

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    username = request.cookies.get("session_user")
    if not username: return RedirectResponse(url="/login")

    db = SessionLocal()
    
    # Récupérer les préférences (ou valeurs par défaut)
    row_track = db.query(Setting).filter(Setting.key == 'track').first()
    track = row_track.value if row_track else "VCOD"
    
    row_mode = db.query(Setting).filter(Setting.key == 'mode').first()
    mode = row_mode.value if row_mode else "FI"
    
    ues, general_avg = calculate_averages(db, track, mode)
    db.close()

    return templates.TemplateResponse("index.html", {
        "request": request,
        "ues": ues,
        "user": username,
        "track": track,
        "mode": mode,
        "general_avg": general_avg
    })

@app.get("/refresh-ui")
def refresh_ui(request: Request):
    username = request.cookies.get("session_user")
    if not username or username not in active_scrapers: return RedirectResponse(url="/login")
    
    scraper = active_scrapers[username]
    raw_courses = scraper.get_all_courses()
    
    db = SessionLocal()
    # On vide tout pour remettre à propre
    db.query(Grade).delete()
    db.query(Course).delete()
    
    for c_data in raw_courses:
        grades = scraper.get_grades_for_course(c_data['id'])
        
        # Moyenne brute (pour info)
        notes_valides = [g['grade'] for g in grades if g['max_grade'] == 20 and not g['is_total']]
        avg = sum(notes_valides) / len(notes_valides) if notes_valides else None
        
        # Sauvegarde Cours
        db.add(Course(id=c_data['id'], moodle_name=c_data['name'], average=avg))
        
        # Sauvegarde Notes
        for g in grades:
            db.add(Grade(course_id=c_data['id'], name=g['name'], grade=g['grade'], max_grade=g['max_grade'], is_total=g['is_total']))
            
    db.commit()
    db.close()
    return RedirectResponse(url="/", status_code=303)
