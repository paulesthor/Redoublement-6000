import sys
import os
import asyncio

path = '/home/filipe86/mysite'
if path not in sys.path:
    sys.path.append(path)
os.chdir(path)
    
from main import app

# --- ADAPTATEUR MAISON (Pour remplacer a2wsgi qui plante) ---
# On fait tourner FastAPI de force dans le processus WSGI
# C'est un peu "hacky" mais ça marche souvent quand a2wsgi échoue

def application(environ, start_response):
    # On crée une event loop pour cette requête
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Traitement des Headers : Conversion WSGI -> ASGI
    # WSGI: HTTP_USER_AGENT -> ASGI: user-agent
    # WSGI: CONTENT_TYPE -> ASGI: content-type
    headers = []
    for k, v in environ.items():
        if k.startswith('HTTP_'):
            # On enlève HTTP_ et on remplace _ par -
            key = k[5:].lower().replace('_', '-')
            headers.append((key.encode('latin1'), v.encode('latin1')))
        elif k in ('CONTENT_TYPE', 'CONTENT_LENGTH'):
            # Ceux-là n'ont pas de préfixe HTTP_
            key = k.lower().replace('_', '-')
            headers.append((key.encode('latin1'), v.encode('latin1')))
            
    # On prepare les messages pour ASGI
    scope = {
        'type': 'http',
        'http_version': '1.1',
        'method': environ['REQUEST_METHOD'],
        'path': environ.get('PATH_INFO', ''),
        'root_path': environ.get('SCRIPT_NAME', ''),
        'scheme': environ.get('wsgi.url_scheme', 'http'),
        'query_string': environ.get('QUERY_STRING', '').encode('ascii'),
        'headers': headers,
        'client': None,
        'server': None,
    }
    
    # On capte la réponse
    response = {'status': 200, 'headers': [], 'body': b''}
    
    
    # Lecture du corps de la requête (Body)
    try:
        content_length = int(environ.get('CONTENT_LENGTH', 0))
    except (ValueError, TypeError):
        content_length = 0
        
    body = environ['wsgi.input'].read(content_length) if content_length > 0 else b''

    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}
        
    async def send(message):
        if message['type'] == 'http.response.start':
            response['status'] = message['status']
            response['headers'] = message['headers']
        elif message['type'] == 'http.response.body':
            response['body'] += message.get('body', b'')

    # On lance l'application
    try:
        loop.run_until_complete(app(scope, receive, send))
    finally:
        loop.close()
        
    # On envoie la réponse WSGI
    status_text = f"{response['status']} OK"
    
    # DEBUG HEADERS
    response['headers'].append((b'X-Debug-Content-Length', str(content_length).encode('ascii')))
    response['headers'].append((b'X-Debug-Body-Size', str(len(body)).encode('ascii')))
    
    start_response(status_text, [
        (k.decode('latin1'), v.decode('latin1')) for k, v in response['headers']
    ])
    return [response['body']]
