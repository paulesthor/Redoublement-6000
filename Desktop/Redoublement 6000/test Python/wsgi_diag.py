import sys
import os
import traceback

path = '/home/filipe86/mysite'
if path not in sys.path:
    sys.path.append(path)
os.chdir(path)

# Test étape par étape
def application(environ, start_response):
    try:
        # Etape 1 : Import simple
        # Si ça plante ici, c'est main.py le coupable
        import main
        
        # Etape 2 : Vérification de app
        if not hasattr(main, 'app'):
             raise Exception("Pas d'objet 'app' dans main.py !")
             
        # Etape 3 : Si on arrive là, c'est que l'import marche !
        # On n'utilise PAS encore a2wsgi pour voir si c'est lui le problème.
        
        status = '200 OK'
        output = b'SUCCES : Main importe correctement ! Le probleme est a2wsgi.'
        
        response_headers = [('Content-type', 'text/plain'),
                            ('Content-Length', str(len(output)))]
        start_response(status, response_headers)
        return [output]
        
    except Exception:
        status = '500 Internal Server Error'
        error_msg = f"❌ ECHEC IMPORT :\n\n{traceback.format_exc()}"
        output = error_msg.encode('utf-8')
        start_response(status, [('Content-type', 'text/plain; charset=utf-8')])
        return [output]
