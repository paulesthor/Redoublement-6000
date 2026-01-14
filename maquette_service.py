import csv
import os
import re

MAQUETTE_DIR = "maquettes"

class MaquetteService:
    def __init__(self):
        self.coefficients = {} # { (semester, option, status): { course_name: { comp_name: coef } } }
        self.courses_metadata = {} # { semester: [course_names...] }

    def load_maquette(self, semester, option, status):
        """
        Charge la maquette correspondante et retourne un dictionnaire :
        {
            "competences": ["Compétence 1", "Compétence 2", ...],
            "courses": {
                "Nom Matière": { "Compétence 1": 10, "Compétence 2": 0, ... }
            }
        }
        """
        # Construction du nom de fichier
        # Format: "Maquette - MCCC - 2025-2026 - Version étudiant(Coef - BUT2 - EMS - FI).csv"
        # Semester S3/S4 est implicite dans le BUT2 ? Non, le fichier contient S3 ET S4.
        
        filename_part = f"Coef - BUT2 - {option} - {status}"
        matching_files = [f for f in os.listdir(MAQUETTE_DIR) if filename_part in f]
        
        if not matching_files:
            print(f"❌ Aucune maquette trouvée pour {option} / {status}")
            return None
        
        filepath = os.path.join(MAQUETTE_DIR, matching_files[0])
        
        # 1. Parsing des Coefficients (Fichier EMS/VCOD - FI/FA)
        data = self._parse_coef_csv(filepath, semester)
        
        # 2. Parsing de la Structure (Fichier Cours S3 / S4) pour les enseignants
        # Recheche fichier "Niort - Cours S3/S4"
        struct_file_part = f"Niort - Cours {semester}"
        struct_files = [f for f in os.listdir(MAQUETTE_DIR) if struct_file_part in f]
        
        teacher_map = {} # { "Nom Matière": "M.Prof" }
        if struct_files:
            struct_path = os.path.join(MAQUETTE_DIR, struct_files[0])
            teacher_map = self._parse_structure_csv(struct_path)
            
        # Fusion des infos : on ajoute le teacher dans data['courses'] pour l'utiliser plus tard
        for c_name, c_info in data['courses'].items():
            if c_name in teacher_map:
                # On stocke le teacher dans une clé spéciale (ex: __teacher__) ou on retourne une structure plus riche
                # Pour rester simple, on va modifier la structure de retour de data['courses']
                # data['courses'] = { "Nom": { "coefs": {...}, "teacher": "..." } }
                # Mais ça casse la compatibilité.
                # On va stocker le teacher map séparément dans le retour
                pass

        data['teachers'] = teacher_map
        return data

    def _parse_structure_csv(self, filepath):
        """Lit le fichier de structure pour extraire {Course: Teacher}"""
        mapping = {}
        try:
            with open(filepath, 'r', encoding='utf-8-sig') as f:
                reader = csv.reader(f, delimiter=';')
                rows = list(reader)
                
                # Header row avec "Enseignant" ?
                # Ligne 3 généralement: ...;Enseignant;...
                teacher_idx = -1
                name_idx = 1 # Nom matière
                
                start_row = 0
                for i, row in enumerate(rows):
                    for idx, cell in enumerate(row):
                        if "Enseignant" in cell or "Référent" in cell:
                            teacher_idx = idx
                            start_row = i
                            break
                    if teacher_idx != -1: break
                
                if teacher_idx != -1:
                    for i in range(start_row + 1, len(rows)):
                        row = rows[i]
                        if len(row) > teacher_idx and len(row) > name_idx:
                            c_name = row[name_idx].strip()
                            teacher = row[teacher_idx].strip()
                            if c_name and teacher:
                                mapping[c_name] = teacher
        except Exception as e:
            print(f"⚠️ Erreur parsing structure {filepath}: {e}")
            
        return mapping

    def _parse_coef_csv(self, filepath, target_semester):
        data = {
            "competences": [],
            "courses": {}
        }
        
        with open(filepath, 'r', encoding='utf-8-sig') as f: # utf-8-sig to handle BOM
            reader = csv.reader(f, delimiter=';')
            rows = list(reader)
            
            # Repérage des colonnes de compétences
            # On cherche la ligne qui contient "Compétence 1", "Compétence 2", etc.
            # Dans le fichier EMS-FI:
            # Ligne 4: ;;;Compétence 1...
            # Ligne 5: ... Traiter des données...
            
            # On va scanner les premières lignes pour trouver les index des compétences
            competence_indices = {} # { index: "Compétence 1" }
            
            # On cherche le début du semestre voulu
            start_row_index = 0
            found_semester = False
            
            for i, row in enumerate(rows):
                if not row: continue
                # Detection du semestre
                row_str = ";".join(row).lower()
                if f"semestre {target_semester[1]}" in row_str: # "Semestre 3"
                    start_row_index = i
                    found_semester = True
                    break
            
            if not found_semester:
                print(f"⚠️ Semestre {target_semester} non trouvé dans {filepath}")
                return data
                
            # À partir de start_row_index, on cherche la ligne des headers de compétences
            # On regarde les 10 lignes suivantes
            header_row = None
            for i in range(start_row_index, min(start_row_index + 10, len(rows))):
                row = rows[i]
                for idx, cell in enumerate(row):
                    if "Compétence" in cell:
                        clean_name = cell.strip()
                        # Si le nom est juste "Compétence X", on essaie de lire la ligne suivante pour le titre complet
                        # Dans le CSV, le titre est parfois sur la ligne suivante (index+1)
                        if i + 1 < len(rows):
                            next_val = rows[i+1][idx].strip()
                            if next_val and not "ECTS" in next_val:
                                clean_name = f"{clean_name} - {next_val}"
                                
                        competence_indices[idx] = clean_name
                        if clean_name not in data["competences"]:
                            data["competences"].append(clean_name)
                
                if competence_indices:
                    header_row = i
                    break
            
            # Maintenant on lit les matières jusqu'au prochain Semestre ou fin
            if header_row is None:
                return data

            for i in range(header_row + 1, len(rows)):
                row = rows[i]
                if not row: continue
                
                # Si on tombe sur "Semestre X", on s'arrête
                if any("Semestre" in c for c in row):
                    break
                
                # Le nom de la matière est généralement en colonne 1 (index 1)
                course_name = row[1].strip()
                if not course_name or course_name.lower() in ["ressources", "saé", "total"]:
                    continue
                    
                course_coefs = {}
                has_coef = False
                for col_idx, comp_name in competence_indices.items():
                    try:
                        val = row[col_idx].strip()
                        if val:
                            coef = float(val.replace("ECTS", "")) # Parfois '8ECTS'
                            course_coefs[comp_name] = coef
                            if coef > 0: has_coef = True
                    except:
                        pass
                
                if has_coef:
                    # FIX: Force 'Economie' to be in UE 3 if detected
                    if "economie" in course_name.lower() or "économie" in course_name.lower():
                        # Find the name of the 3rd competence (index 2)
                        if len(data["competences"]) >= 3:
                            ue3_name = data["competences"][2] 
                            # Reset coefs to only have UE3
                            # We assume a default coef (e.g. from the CSV or 1.0 if not found)
                            # But usually we just want to MOVE the existing coef to UE3
                            # Let's take the first non-zero coef found and assign it to UE3
                            existing_coef = max(course_coefs.values()) if course_coefs else 1.0
                            course_coefs = {ue3_name: existing_coef}
                            
                    data["courses"][course_name] = course_coefs
                    
        return data

# Test rapide (Uncomment to test)
# svc = MaquetteService()
# res = svc.load_maquette("S3", "EMS", "FI")
# print(res)
