import requests
from bs4 import BeautifulSoup
import re

class MoodleScraper:
    def __init__(self, username, password):
        self.username = username
        self.password = password
        # Ton ID étudiant fixe
        self.user_id = "23479" 
        
        # Session pour garder les cookies
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        self.is_connected = False

    def login(self):
        """Gère la connexion CAS"""
        print(f"🔌 Tentative de connexion pour {self.username}...")
        cas_url = "https://auth.univ-poitiers.fr/cas/login?service=https%3A%2F%2Fupdago.univ-poitiers.fr%2Flogin%2Findex.php%3FauthCAS%3DCAS"
        
        try:
            r_get = self.session.get(cas_url)
            soup = BeautifulSoup(r_get.text, 'html.parser')
            
            token_input = soup.find('input', {'name': 'execution'})
            if not token_input:
                return False
            
            token = token_input['value']
            
            payload = {
                'username': self.username,
                'password': self.password,
                'execution': token,
                '_eventId': 'submit',
                'geolocation': '',
                'deviceFingerprint': ''
            }
            
            r_post = self.session.post(cas_url, data=payload, allow_redirects=True)
            
            if "updago.univ-poitiers.fr" in r_post.url:
                self.is_connected = True
                return True
            return False
                
        except Exception as e:
            print(f"❌ Erreur réseau : {e}")
            return False

    def get_all_courses(self):
        """Récupère la liste des matières"""
        if not self.is_connected:
            if not self.login():
                return []

        url_overview = "https://updago.univ-poitiers.fr/grade/report/overview/index.php"
        try:
            r = self.session.get(url_overview)
            soup = BeautifulSoup(r.text, 'html.parser')
            courses = []
            seen_ids = set()

            for link in soup.find_all('a', href=True):
                match = re.search(r'id=(\d+)', link['href'])
                if match and link.text.strip():
                    c_id = match.group(1)
                    if int(c_id) > 100 and c_id != self.user_id and c_id not in seen_ids:
                        courses.append({"id": c_id, "name": link.text.strip()})
                        seen_ids.add(c_id)
            return courses
        except Exception:
            return []

    def get_grades_for_course(self, course_id):
        """Récupère les notes d'une matière"""
        if not self.is_connected:
            self.login()

        url = f"https://updago.univ-poitiers.fr/course/user.php?mode=grade&id={course_id}&user={self.user_id}"
        try:
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            grades = []
            
            table = soup.find('table', class_='user-grade') or soup.find('table', class_='generaltable')
            if not table: return []

            for row in table.find_all('tr'):
                if not row.find('td'): continue
                
                name_cell = row.find(class_='column-itemname')
                grade_cell = row.find(class_='column-grade')
                range_cell = row.find(class_='column-range')
                
                if name_cell and grade_cell:
                    raw_grade = grade_cell.text.strip()
                    if raw_grade in ["-", "", "Empty"]: continue

                    try:
                        clean_grade = float(raw_grade.replace(',', '.').split()[0])
                    except ValueError: continue 

                    max_grade = 20.0
                    if range_cell:
                        try:
                            parts = range_cell.text.replace("–", "-").split("-")
                            if len(parts) >= 2: max_grade = float(parts[-1].strip())
                        except: pass
                    
                    is_total = "Total" in name_cell.text or "Moyenne" in name_cell.text
                    grades.append({
                        "name": name_cell.text.replace("Élément manuel", "").strip(),
                        "grade": clean_grade,
                        "max_grade": max_grade,
                        "is_total": is_total
                    })
            return grades
        except Exception:
            return []