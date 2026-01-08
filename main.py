import sqlite3
from fastapi import FastAPI, Request, Form, Response
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
from scraper import MoodleScraper

app = FastAPI()
templates = Jinja2Templates(directory="templates")

DB_FILE = "notes.db"
# Stockage temporaire des scrapers connectés (en mémoire RAM)
active_scrapers = {} 

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, name TEXT, average REAL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS grades (id INTEGER PRIMARY KEY, course_id TEXT, name TEXT, grade REAL, max_grade REAL, is_total BOOLEAN)''')
    conn.commit()
    conn.close()

init_db()

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

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    courses_list = []
    
    # Récupération des données locales
    rows = c.execute("SELECT * FROM courses").fetchall()
    for row in rows:
        course = dict(row)
        grades = c.execute("SELECT * FROM grades WHERE course_id = ?", (course['id'],)).fetchall()
        course['grades'] = [dict(g) for g in grades]
        courses_list.append(course)
    conn.close()

    return templates.TemplateResponse("index.html", {
        "request": request,
        "courses": courses_list,
        "user": username
    })

@app.get("/refresh-ui")
def refresh_ui(request: Request):
    username = request.cookies.get("session_user")
    
    # Si le scraper n'est plus en mémoire (après redémarrage serveur), on force la reconnexion
    if not username or username not in active_scrapers:
        return RedirectResponse(url="/login")
    
    scraper = active_scrapers[username]
    
    # Scraping
    raw_courses = scraper.get_all_courses()
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM grades")
    c.execute("DELETE FROM courses")
    
    for course in raw_courses:
        grades = scraper.get_grades_for_course(course['id'])
        notes_valides = [g['grade'] for g in grades if g['max_grade'] == 20 and not g['is_total']]
        avg = sum(notes_valides) / len(notes_valides) if notes_valides else None
        
        c.execute("INSERT INTO courses (id, name, average) VALUES (?, ?, ?)", (course['id'], course['name'], avg))
        for g in grades:
            c.execute("INSERT INTO grades (course_id, name, grade, max_grade, is_total) VALUES (?, ?, ?, ?, ?)", 
                      (course['id'], g['name'], g['grade'], g['max_grade'], g['is_total']))
    
    conn.commit()
    conn.close()
    
    return RedirectResponse(url="/", status_code=303)