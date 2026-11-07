#!/usr/bin/env python3
"""Construit cloudflare/public/catalog/commu.json : le réservoir de cartes de l'événement communiste.
Aucun accès réseau : les titres de tools/commu-titles.json sont cherchés dans le catalogue local (cloudflare/public/catalog/*.json, mêmes identifiants de page que le jeu).
Les extraits et les images sont ajoutés à la volée par l'enrichissement habituel du jeu, au premier affichage de chaque carte.
Usage : python3 tools/build-commu.py"""
import glob, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TITLES = json.load(open(os.path.join(ROOT, 'tools/commu-titles.json')))
ORDER = ['legendary', 'ultra', 'super', 'rare', 'uncommon', 'common']
# titres de la liste qui s'écrivent autrement dans le catalogue
ALIAS = {
    'Nicolas II (empereur de Russie)': 'Nicolas II', 'Pierre Ier (empereur de Russie)': 'Pierre Ier le Grand', 'Ivan IV': 'Ivan le Terrible', 'Constantin Tchernenko': 'Konstantin Tchernenko',
    'Iouri Gagarine': 'Youri Gagarine', 'Alexandre Ovechkin': 'Aleksandr Ovetchkine', 'Vladimir Klitschko': 'Wladimir Klitschko', 'Cathédrale Saint-Basile-le-Bienheureux': 'Cathédrale Saint-Basile-le-Bienheureux de Moscou',
    'Révolution russe de 1917': 'Révolution russe', 'Plan quinquennal': 'Plan quinquennal en URSS', 'Soyouz (vaisseau spatial)': 'Soyouz (véhicule spatial)', 'Tentative de putsch de 1991 en Union soviétique': 'Putsch de Moscou',
    'Matriochka': 'Matriochkas', 'Chapka': 'Ouchanka', 'Katioucha (arme)': 'Katioucha', 'Lada (automobile)': 'Lada Niva', 'Nikolaï Gogol': 'Nicolas Gogol', 'Piotr Kropotkine': 'Pierre Kropotkine', 'Isaac Levitan': 'Issaak Levitan',
    'Nikolaï Roerich': 'Nicolas Roerich', 'El Lissitzky': 'Lazar Lissitzky', 'Mikhaïl Fokine': 'Michel Fokine', 'Konstantin Stanislavski': 'Constantin Stanislavski', 'Meyerhold': 'Vsevolod Meyerhold', 'Nikolaï Berdiaev': 'Nicolas Berdiaev',
    'Daniil Harms': 'Daniil Kharms', 'Arcadi Strougatski': 'Arcadi et Boris Strougatski', 'Nevski Prospekt': 'Perspective Nevski', 'Cavalier de bronze': 'Le Cavalier de bronze', 'Tsarskoïe Selo': 'Palais-musée de Tsarskoïe Selo',
    'Kazan (Russie)': 'Kazan', 'Soči': 'Sotchi', 'Fleuve Ienisseï': 'Ienisseï', 'Mont Elbrouz': 'Elbrouz', 'Chemin de fer Baïkal-Amour': 'Magistrale Baïkal-Amour', 'Aral (mer)': 'Mer d\'Aral', 'Politburo': 'Politburo du Parti communiste de l\'Union soviétique',
    'Mutinerie de Kronstadt': 'Révolte de Kronstadt', 'Cuirassé Potemkine': 'Le Cuirassé Potemkine', 'Dynastie des Romanov': 'Maison Romanov', 'Maison de Riourik': 'Riourik', 'Pougatchev': 'Emelian Pougatchev',
    'Expédition de Napoléon en Russie': 'Campagne de Russie', 'Bataille de la Berezina': 'Bataille de la Bérézina', 'Incendie de Moscou de 1812': 'Incendie de Moscou (1812)', 'Radio Free Europe': 'Radio Free Europe/Radio Liberty',
    'Kalinka (chanson)': 'Kalinka', 'Gopak': 'Hopak', 'Bataille du lac Peipous': 'Bataille du lac Peïpous', 'Saint Serge de Radonège': 'Serge de Radonège', 'Vladimir Ier de Kiev': 'Vladimir Ier', 'Gorki Park': 'Parc Gorki',
}
want = {}
for r in ORDER:
    for t in TITLES[r]:
        want.setdefault(ALIAS.get(t, t).lower(), (ALIAS.get(t, t), r))
found = {}
shards = sorted(glob.glob(os.path.join(ROOT, 'cloudflare/public/catalog/[0-9]*.json')), key=lambda p: int(os.path.basename(p).split('.')[0]))
for p in shards:
    for row in json.load(open(p)):
        k = row[1].lower()
        if k in want and want[k][0] not in found: found[want[k][0]] = {'id': row[0], 't': row[1], 'r': want[k][1], 'v': row[2]}
cards = sorted(found.values(), key=lambda c: (ORDER.index(c['r']), -c['v']))
legend = [c for c in cards if c['r'] == 'legendary']
# au-delà de 150 légendaires, les moins populaires redeviennent des « ultra »
for c in legend[150:]: c['r'] = 'ultra'
out = os.path.join(ROOT, 'cloudflare/public/catalog/commu.json')
json.dump({'cards': [{'id': c['id'], 't': c['t'], 'r': c['r'], 'v': c['v']} for c in cards]}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
by = {r: sum(1 for c in cards if c['r'] == r) for r in ORDER}
print('cartes :', len(cards), by)
print('absentes :', [v[0] for v in want.values() if v[0] not in found][:40])
