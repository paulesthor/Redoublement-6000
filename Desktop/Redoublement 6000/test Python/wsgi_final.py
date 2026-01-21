import sys
import os
import traceback

# 1. Configurer le chemin
path = '/home/filipe86/mysite'
if path not in sys.path:
    sys.path.append(path)

# 2. Se placer dans le dossier pour que 'notes.db' et 'templates' soient trouvés
try:
    os.chdir(path)
except Exception:
    pass

# 3. Tentative de chargement du site
try:
    from main import app
    from a2wsgi import ASGIMiddleware
    application = ASGIMiddleware(app)
    
except Exception:
    # SI CA PLANTE : On affiche l'erreur directement sur le site web
    # Comme ça on n'a plus besoin de chercher dans les logs !
    def application(environ, start_response):
        status = '500 Internal Server Error'
        error_msg = f"❌ ERREUR AU DEMARRAGE :\n\n{traceback.format_exc()}"
        output = error_msg.encode('utf-8')
        
        response_headers = [('Content-type', 'text/plain; charset=utf-8'),
                            ('Content-Length', str(len(output)))]
        start_response(status, response_headers)
        return [output]
