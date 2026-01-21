import sys
import os
import traceback
from fastapi import FastAPI
from a2wsgi import ASGIMiddleware

path = '/home/filipe86/mysite'
if path not in sys.path:
    sys.path.append(path)
os.chdir(path)

# 1. On crée une mini-app locale (sans toucher à main.py)
simple_app = FastAPI()

@simple_app.get("/")
def read_root():
    return {"Hello": "World from FastAPI"}

# 2. On essaie de l'adapter
try:
    application = ASGIMiddleware(simple_app)
except Exception:
    # Si la création du Middleware plante
    def application(environ, start_response):
        status = '500 Internal Server Error'
        output = b'ERREUR creation Middleware'
        start_response(status, [('Content-Type', 'text/plain')])
        return [output]
