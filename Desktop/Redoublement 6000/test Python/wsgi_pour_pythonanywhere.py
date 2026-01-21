import sys
import os

# 1. On inclut le dossier "mysite"
path_mysite = '/home/filipe86/mysite'
if path_mysite not in sys.path:
    sys.path.append(path_mysite)

# 2. On inclut AUSSI le sous-dossier "test Python" où se trouve main.py
path_test = '/home/filipe86/mysite/test Python'
if path_test not in sys.path:
    sys.path.append(path_test)

from main import app
from a2wsgi import ASGIMiddleware

application = ASGIMiddleware(app)
