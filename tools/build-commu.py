#!/usr/bin/env python3
"""Construit cloudflare/public/catalog/commu.json : le réservoir de cartes de l'événement communiste.
Chaque titre de tools/commu-titles.json est vérifié sur fr.wikipedia.org (existence, extrait, vignette) ; les doublons et les pages absentes sont écartés.
Usage : python3 tools/build-commu.py"""
import json, subprocess, sys, time, urllib.parse, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TITLES = json.load(open(os.path.join(ROOT, 'tools/commu-titles.json')))
ORDER = ['legendary', 'ultra', 'super', 'rare', 'uncommon', 'common']   # un article présent dans plusieurs listes garde la plus haute rareté

def api(titles):
    q = {'action': 'query', 'format': 'json', 'formatversion': '2', 'redirects': '1', 'titles': '|'.join(titles), 'prop': 'extracts|pageimages|pageprops',
         'exintro': '1', 'explaintext': '1', 'exsentences': '3', 'piprop': 'thumbnail', 'pithumbsize': '400', 'ppprop': 'disambiguation', 'exlimit': 'max'}
    url = 'https://fr.wikipedia.org/w/api.php?' + urllib.parse.urlencode(q)
    for essai in range(8):
        r = subprocess.run(['curl', '-sS', '-m', '40', '-A', 'ClodoWiki-private-game/1.0 (card catalog build)', url], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.startswith('{'):
            return json.loads(r.stdout)
        time.sleep(45 if 'too many' in (r.stdout + r.stderr).lower() else 3 * (essai + 1))
    raise SystemExit('API injoignable : ' + (r.stderr or r.stdout)[:200])

seen, cards, missing = {}, [], []
for rarity in ORDER:
    wanted = [t for t in dict.fromkeys(TITLES[rarity])]
    for i in range(0, len(wanted), 40):
        chunk = wanted[i:i + 40]; d = api(chunk)
        q = d.get('query', {}); redir = {r['from']: r['to'] for r in q.get('redirects', [])}; norm = {n['from']: n['to'] for n in q.get('normalized', [])}
        by = {p['title']: p for p in q.get('pages', [])}
        for t in chunk:
            tt = redir.get(norm.get(t, t), norm.get(t, t)); p = by.get(tt)
            if not p or p.get('missing') or 'disambiguation' in (p.get('pageprops') or {}):
                missing.append(t); continue
            pid = p['pageid']
            if pid in seen: continue
            ext = (p.get('extract') or '').strip().replace('\n', ' ')
            if len(ext) < 40: missing.append(t + ' (extrait trop court)'); continue
            seen[pid] = 1
            cards.append({'id': pid, 't': p['title'], 'r': rarity, 'x': ext[:330], 'i': (p.get('thumbnail') or {}).get('source')})
        time.sleep(6)
out = os.path.join(ROOT, 'cloudflare/public/catalog/commu.json')
json.dump({'cards': cards}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
by_r = {r: sum(1 for c in cards if c['r'] == r) for r in ORDER}
print('cartes :', len(cards), by_r, '· sans image :', sum(1 for c in cards if not c['i']))
print('écartées :', len(missing)); print(' ; '.join(missing[:60]))
