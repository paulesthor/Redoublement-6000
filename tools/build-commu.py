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
# fiches sans rapport avec la Russie ou l'URSS (faux amis du catalogue, ou autres pays) : exclues du réservoir
EXCLUDE = {'Isaac Asimov', 'Le Cinquième Élément', 'Un bonheur', 'Le Jour de la fête', 'Le Maître', 'Poutine (plat)', 'Kharkiv', 'Moonshine', 'Vichy Anand', 'Fabio Capello', 'Vitali Klitchko', 'Nadia Comaneci', 'Julius Fučík', 'Prix Nobel de littérature', 'Prix Nobel de la paix', 'Les Bras croisés', 'Brat', 'Ladoga', 'Pelote basque', 'Deep Blue', 'Emir Kusturica', 'Zviad Gamsakhourdia', 'Trabant', 'Wladimir Klitschko', 'Hopak', 'Halva', 'Hetman'}
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
# titres supplémentaires (tools/commu-extra.txt) : ils élargissent les raretés inférieures ; leur rareté dépend de la popularité
EXTRA = [t.strip() for t in open(os.path.join(ROOT, 'tools/commu-extra.txt')).read().replace('\n', '|').split('|') if t.strip()]
extra_want = {t.lower(): t for t in EXTRA}
extra_found = {}
for p in shards:
    for row in json.load(open(p)):
        k = row[1].lower()
        if k in extra_want and row[1] not in found and row[1] not in extra_found: extra_found[row[1]] = {'id': row[0], 't': row[1], 'r': 'common', 'v': row[2]}
found = {k: v for k, v in found.items() if k not in EXCLUDE}
extra_found = {k: v for k, v in extra_found.items() if k not in EXCLUDE}
others = [c for c in list(found.values()) if c['r'] != 'legendary'] + list(extra_found.values())
others.sort(key=lambda c: -c['v'])
SHARE = [('ultra', .10), ('super', .14), ('rare', .22), ('uncommon', .26), ('common', .28)]
i = 0
for r, sh in SHARE:
    n = round(len(others) * sh) if r != 'common' else len(others) - i
    for c in others[i:i + n]: c['r'] = r
    i += n
found = {**{k: v for k, v in found.items() if v['r'] == 'legendary'}, **{c['t']: c for c in others}}
cards = sorted(found.values(), key=lambda c: (ORDER.index(c['r']), -c['v']))
# le trou laissé chez les légendaires est comblé par la fiche « ultra » la plus populaire
while sum(1 for c in cards if c['r'] == 'legendary') < 150:
    max((c for c in cards if c['r'] == 'ultra'), key=lambda c: c['v'])['r'] = 'legendary'
legend = [c for c in cards if c['r'] == 'legendary']
# au-delà de 150 légendaires, les moins populaires redeviennent des « ultra »
for c in legend[150:]: c['r'] = 'ultra'
out = os.path.join(ROOT, 'cloudflare/public/catalog/commu.json')
json.dump({'cards': [{'id': c['id'], 't': c['t'], 'r': c['r'], 'v': c['v']} for c in cards]}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
by = {r: sum(1 for c in cards if c['r'] == r) for r in ORDER}
print('cartes :', len(cards), by)
print('absentes :', [v[0] for v in want.values() if v[0] not in found][:40])
