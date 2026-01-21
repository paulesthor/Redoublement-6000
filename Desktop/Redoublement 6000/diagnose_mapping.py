import sqlite3
import re
from maquette_service import MaquetteService
from difflib import get_close_matches

# Import logic from main.py (duplicated for standalone run or we could import if structured better)
# To avoid import errors with running app, I will copy the find_best_match logic here or import it if safe.
# Let's redefine it here to be sure we are testing the exact logic we want to improve.

def find_best_match(scraped_name, canonical_names, teacher_map=None):
    """Trouve le nom canonique le plus proche avec heuristiques intelligentes"""
    clean_scraped = scraped_name.lower().strip()
    
    # 1. Overrides Manuels (Basés sur les logs)
    manual_map = {
        "tableau software": "Utilisation avancée d'outils de reporting",
        "sas": "Programmation statistique automatisée",
        "alimentation": "Intégration de données dans un Datawarehouse", # Guess
        "droit": "SAÉ - VCOD/EMS - Conformité réglementaire pour traiter/analyser des données",
        "architecture": "Systèmes d'information décisionnels",
        "rls": "AL - Régression linéaire simple",
        "sig": "AL - Système d'information géographique",
        "anglais": "Anglais professionnel",
        "communication": "Communication organisationnelle et professionnelle",
        "sondage": "EMS - Techniques de sondage et méthodologie de l'enquête",
        "algèbre": "Algèbre linéaire",
        "web": "Technologies web",
        "enquêtes": "EMS - Techniques de sondage et méthodologie de l'enquête", # Added guess
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

    # 3. Correspondance par Mots-clés
    clean_scraped = re.sub(r'\[.*?\]', '', clean_scraped) 
    clean_scraped = re.sub(r'- grp \w+', '', clean_scraped)
    clean_scraped = re.sub(r's[34]\s*-', '', clean_scraped)
    
    best_score = 0
    best_candidate = None
    stopwords = ["de", "des", "le", "la", "les", "un", "une", "et", "à", "pour", "en", "d'", "l'", "s3", "s4", "but", "but2", "cours", "td", "tp"]
    
    # Boost semester ?
    semester_boost = False
    # (Simplified for diagnostic)

    for canonical in canonical_names:
        score = 0
        clean_canonical = canonical.lower()
        keywords = [w for w in re.split(r'\W+', clean_canonical) if len(w) > 2 and w not in stopwords]
        scraped_words = [w for w in re.split(r'\W+', clean_scraped) if len(w) > 2 and w not in stopwords]
        
        for k in keywords:
            if k in clean_scraped: score += 2
            if k in scraped_words: score += 1
        
        if clean_scraped.startswith(clean_canonical[:10]): score += 3
            
        if score > best_score:
            best_score = score
            best_candidate = canonical
            
    if best_score >= 2: return best_candidate

    # 4. Fallback
    matches = get_close_matches(clean_scraped, [n.lower() for n in canonical_names], n=1, cutoff=0.4)
    if matches:
        for name in canonical_names:
            if name.lower() == matches[0]: return name
                
    return None

def run_diagnosis():
    # Write to file directly to avoid console encoding issues
    with open("mapping_report.md", "w", encoding="utf-8") as f:
        f.write("# 🚀 DIAGNOSTIC DE CORRESPONDANCE\n\n")
        
        # 1. Load DB Data
        conn = sqlite3.connect("notes.db")
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        courses = c.execute("SELECT * FROM courses").fetchall()
        
        # Load settings
        settings = c.execute("SELECT * FROM user_settings LIMIT 1").fetchone()
        
        if not settings:
            f.write("❌ Pas de configuration trouvée dans user_settings.\n")
            return

        f.write(f"**Config**: Semestre=`{settings['semester']}`, Option=`{settings['option']}`, Status=`{settings['status']}`\n\n")
        
        # 2. Load Maquette
        svc = MaquetteService()
        maquette = svc.load_maquette(settings['semester'], settings['option'], settings['status'])
        canonical_names = list(maquette['courses'].keys())
        teacher_map = maquette.get('teachers', {})
        
        f.write(f"📚 **{len(canonical_names)} matières officielles** dans la maquette.\n\n")
        
        # 3. Process Items
        scraped_items = []
        
        for row in courses:
            course = dict(row)
            grades = c.execute("SELECT * FROM grades WHERE course_id = ?", (course['id'],)).fetchall()
            course['grades'] = [dict(g) for g in grades]
            
            is_meta = "département sd" in course['name'].lower() or "espace promo" in course['name'].lower()
            
            if is_meta:
                 for g in course['grades']:
                     if g['grade'] is not None: # Only meaningful grades
                        scraped_items.append({"name": g['name'], "origin": f"Meta: {course['name']}"})
            else:
                 scraped_items.append({"name": course['name'], "origin": "Direct"})
                 
        # 4. Check Matches
        f.write("## RÉSULTATS\n")
        f.write("| NOM SCRAPÉ | ORIGINE | CORRESPONDANCE TROUVÉE |\n")
        f.write("|---|---|---|\n")
        
        for item in scraped_items:
            match = find_best_match(item['name'], canonical_names, teacher_map)
            status = f"✅ {match}" if match else "❌ **NON RECONNU**"
            f.write(f"| {item['name']} | {item['origin']} | {status} |\n")

        conn.close()

if __name__ == "__main__":
    run_diagnosis()
