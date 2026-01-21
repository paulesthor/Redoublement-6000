import sys
import os

# 1. Definir le dossier du projet
project_home = '/home/filipe86/mysite'

# 2. Se placer dans ce dossier (important !)
try:
    os.chdir(project_home)
except OSError:
    print(f"❌ IMPOSSIBLE d'aller dans {project_home}", file=sys.stderr)

# 3. Ajouter au chemin Python
if project_home not in sys.path:
    sys.path.append(project_home)

# 4. DEBUG : Afficher les fichiers trouvés dans le log d'erreur
print(f"🔍 DEBUG: Dossier actuel : {os.getcwd()}", file=sys.stderr)
try:
    files = os.listdir(project_home)
    print(f"🔍 DEBUG: Fichiers trouvés : {files}", file=sys.stderr)
    if 'main.py' in files:
        print("✅ DEBUG: main.py est bien là !", file=sys.stderr)
    else:
        print("❌ DEBUG: main.py est ABSENT !", file=sys.stderr)
except Exception as e:
    print(f"❌ DEBUG: Erreur listdir : {e}", file=sys.stderr)

# 5. Import normal
from main import app
from a2wsgi import ASGIMiddleware

application = ASGIMiddleware(app)
