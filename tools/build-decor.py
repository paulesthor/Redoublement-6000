"""Ornements des thèmes gagnés (accueil) : SVG fins générés par le calcul, sans dépendance.
Usage : python3 tools/build-decor.py   -> écrit wikimasters/public/decor/*.svg
Chaque ornement est dessiné à la main par des formules (courbes, récursions) : rien n'est tiré d'une banque d'images."""
import math, os, random
OUT = os.path.join(os.path.dirname(__file__), '..', 'wikimasters', 'public', 'decor')
os.makedirs(OUT, exist_ok=True)
GOLD, CREAM, RED = '#f4d56b', '#f6efd8', '#c0161d'
ICE, ICE2 = '#bfe4ff', '#dff2ff'
GOLD2 = '#ffd96a'
def f(x): return f'{x:.1f}'.rstrip('0').rstrip('.')
def write(name, w, h, body, extra=''):
    open(os.path.join(OUT, name), 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"{extra}>{body}</svg>')

# ---------- CAMARADE : couronne d'épis de blé (deux branches, nœud en bas) ----------
def wheat():
    W, H = 400, 520; cx, cy, rx, ry = 200, 258, 150, 214
    g = []
    def pt(a): return cx + rx * math.cos(a), cy + ry * math.sin(a)
    def tang(a): dx, dy = -rx * math.sin(a), ry * math.cos(a); n = math.hypot(dx, dy); return dx / n, dy / n
    def branch(sign):
        a0, a1 = math.radians(98), math.radians(236)       # du bas (98°) jusqu'à 11 h (236°)
        pts = []
        N = 90
        for i in range(N + 1):
            a = a0 + (a1 - a0) * i / N
            x, y = pt(a); pts.append((cx + sign * (x - cx), y))
        g.append('<path fill="none" stroke="%s" stroke-width="1.6" stroke-opacity=".55" d="M%s"/>' % (GOLD, ' L'.join(f'{f(x)} {f(y)}' for x, y in pts)))
        n = 17
        for k in range(n):
            t = (k + 1.2) / (n + 0.6); a = a0 + (a1 - a0) * t
            x, y = pt(a); tx, ty = tang(a)
            if t < .12: continue                            # pas de grain dans le nœud
            L = 17 - 6 * t                                  # grains plus petits vers la pointe
            for s in (-1, 1):
                ang = math.atan2(ty, tx) + s * math.radians(40)
                gx, gy = x + math.cos(ang) * L * .8, y + math.sin(ang) * L * .8
                deg = math.degrees(ang) + 90
                X = cx + sign * (gx - cx); deg_m = deg if sign == 1 else -deg
                g.append(f'<ellipse cx="{f(X)}" cy="{f(gy)}" rx="{f(L*.27)}" ry="{f(L*.58)}" transform="rotate({f(deg_m)} {f(X)} {f(gy)})" fill="{GOLD}" fill-opacity=".5" stroke="{GOLD}" stroke-opacity=".7" stroke-width=".6"/>')
        # grain terminal
        x, y = pt(a1); tx, ty = tang(a1); ang = math.atan2(ty, tx); gx, gy = x + math.cos(ang) * 11, y + math.sin(ang) * 11
        X = cx + sign * (gx - cx); deg = math.degrees(ang) + 90; deg_m = deg if sign == 1 else -deg
        g.append(f'<ellipse cx="{f(X)}" cy="{f(gy)}" rx="4.4" ry="11" transform="rotate({f(deg_m)} {f(X)} {f(gy)})" fill="{GOLD}" fill-opacity=".55" stroke="{GOLD}" stroke-opacity=".8" stroke-width=".6"/>')
    branch(1); branch(-1)
    # ruban en bas : nœud et deux pans
    bx, by = cx, cy + ry + 4
    g.append(f'<path fill="{RED}" fill-opacity=".7" stroke="{GOLD}" stroke-opacity=".7" stroke-width="1" d="M{bx} {by} C{bx-22} {by-16} {bx-46} {by-8} {bx-40} {by+8} C{bx-30} {by+4} {bx-14} {by+2} {bx} {by} Z M{bx} {by} C{bx+22} {by-16} {bx+46} {by-8} {bx+40} {by+8} C{bx+30} {by+4} {bx+14} {by+2} {bx} {by} Z"/>')
    g.append(f'<path fill="{RED}" fill-opacity=".7" stroke="{GOLD}" stroke-opacity=".7" stroke-width="1" d="M{bx-4} {by+2} L{bx-26} {by+36} L{bx-14} {by+32} L{bx-8} {by+42} L{bx+2} {by+4} Z M{bx+4} {by+2} L{bx+26} {by+36} L{bx+14} {by+32} L{bx+8} {by+42} L{bx-2} {by+4} Z"/>')
    g.append(f'<circle cx="{bx}" cy="{by}" r="5" fill="{GOLD}" fill-opacity=".85"/>')
    write('urss-epis.svg', W, H, ''.join(g))
wheat()

def star_path(cx, cy, R, r=None, rot=-90):
    r = r or R * .382; pts = []
    for i in range(10):
        a = math.radians(rot + i * 36); rr = R if i % 2 == 0 else r
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts) + ' Z'

def urss_etoile():   # grande étoile : aplat rouge, filet doré intérieur, cercle de rayons
    body = f'<path d="{star_path(200,208,170)}" fill="{RED}" fill-opacity=".22"/><path d="{star_path(200,208,150)}" fill="none" stroke="{GOLD}" stroke-opacity=".35" stroke-width="1.4"/><path d="{star_path(200,208,128)}" fill="none" stroke="{GOLD}" stroke-opacity=".18" stroke-width="1"/>'
    write('urss-etoile.svg', 400, 400, body)
urss_etoile()

def urss_frise():    # frise d'étoiles sous le bandeau : tuile 44 x 12
    body = f'<path d="M0 6H15M29 6H44" stroke="{GOLD}" stroke-opacity=".5" stroke-width="1"/><path d="{star_path(22,6.4,5.2)}" fill="{GOLD}" fill-opacity=".85"/><circle cx="7" cy="6" r="1" fill="{GOLD}" fill-opacity=".7"/><circle cx="37" cy="6" r="1" fill="{GOLD}" fill-opacity=".7"/>'
    write('urss-frise.svg', 44, 12, body)
urss_frise()

# ---------- SIBÉRIE ----------
def flake(seed, name, size=200):
    rnd = random.Random(seed); c = size / 2; L = size * .46
    g = []
    def arm(angle):
        ca, sa = math.cos(angle), math.sin(angle)
        def P(d, off=0): return c + ca * d - sa * off, c + sa * d + ca * off
        x1, y1 = P(L); g.append(f'M{f(c)} {f(c)}L{f(x1)} {f(y1)}')
        n = rnd.choice([3, 4]); pos = sorted(rnd.uniform(.28, .8) for _ in range(n))
        for p in pos:
            bl = L * rnd.uniform(.16, .3) * (1 - p * .35); d = L * p
            for s in (-1, 1):
                ba = math.radians(60) * s
                x0, y0 = P(d); ex, ey = x0 + math.cos(angle + ba) * bl, y0 + math.sin(angle + ba) * bl
                g.append(f'M{f(x0)} {f(y0)}L{f(ex)} {f(ey)}')
                if bl > L * .15:
                    mx, my = x0 + (ex - x0) * .55, y0 + (ey - y0) * .55; sl = bl * .4
                    for s2 in (-1, 1):
                        a2 = angle + ba + math.radians(55) * s2
                        g.append(f'M{f(mx)} {f(my)}L{f(mx + math.cos(a2) * sl)} {f(my + math.sin(a2) * sl)}')
        # pointe en V
        tx, ty = P(L * .9); 
        for s in (-1, 1):
            a2 = angle + math.radians(35) * s; g.append(f'M{f(x1)} {f(y1)}L{f(x1 - math.cos(a2) * L * .1)} {f(y1 - math.sin(a2) * L * .1)}')
    for i in range(6): arm(math.radians(i * 60 + 90))
    hexa = ' '.join(f'{f(c + L*.16*math.cos(math.radians(i*60+30)))},{f(c + L*.16*math.sin(math.radians(i*60+30)))}' for i in range(6))
    body = f'<g fill="none" stroke="{ICE}" stroke-opacity=".6" stroke-width="1.15" stroke-linecap="round"><path d="{"".join(g)}"/><polygon points="{hexa}" stroke-opacity=".5"/></g>'
    write(name, size, size, body)
flake(7, 'siberie-flocon-a.svg'); flake(21, 'siberie-flocon-b.svg'); flake(48, 'siberie-flocon-c.svg')

def frost(name, flip_x, flip_y, size=240, seed=3):
    rnd = random.Random(seed); g = []
    def tr(x, y): return (size - x if flip_x else x), (size - y if flip_y else y)
    def grow(x, y, a, ln, depth, w):
        ex, ey = x + math.cos(a) * ln, y + math.sin(a) * ln
        x1, y1 = tr(x, y); x2, y2 = tr(ex, ey)
        g.append(f'<path d="M{f(x1)} {f(y1)}L{f(x2)} {f(y2)}" stroke-width="{f(w)}"/>')
        if depth <= 0: return
        for k in (.35, .62, .86):
            sx, sy = x + (ex - x) * k, y + (ey - y) * k
            for s in (-1, 1):
                grow(sx, sy, a + s * math.radians(rnd.uniform(48, 62)), ln * rnd.uniform(.3, .42) * (1.1 - k * .5), depth - 1, max(.35, w * .66))
    for a in (14, 32, 51, 70, 80):
        grow(0, 0, math.radians(a), rnd.uniform(150, 215), 3, 1.3)
    write(name, size, size, f'<g fill="none" stroke="{ICE}" stroke-opacity=".34" stroke-linecap="round">{"".join(g)}</g>')
frost('siberie-givre-hg.svg', False, False); frost('siberie-givre-bd.svg', True, True, seed=9)

def pines():
    rnd = random.Random(11); W, H = 780, 150; g = []
    def tree(x, base, h, fill, op):
        tiers = rnd.choice([4, 5, 5, 6]); w = h * .34; y = base; parts = []
        top = base - h
        pts = [(x, top)]
        left, right = [], []
        for i in range(tiers):
            t0 = i / tiers; t1 = (i + 1) / tiers
            yy = top + h * t1 * .96; ww = w * (.35 + .65 * t1)
            left += [(x - ww * .55, top + h * (t0 + (t1 - t0) * .55)), (x - ww, yy)]
            right += [(x + ww * .55, top + h * (t0 + (t1 - t0) * .55)), (x + ww, yy)]
        poly = [(x, top)] + right[::2][:0]
        ordered = [(x, top)]
        for i in range(tiers):
            ordered.append(right[2 * i]); ordered.append(right[2 * i + 1]); ordered.append((x + w * .12, right[2 * i + 1][1]))
        ordered.append((x + w * .1, base)); ordered.append((x - w * .1, base))
        for i in range(tiers - 1, -1, -1):
            ordered.append((x - w * .12, left[2 * i + 1][1])); ordered.append(left[2 * i + 1]); ordered.append(left[2 * i])
        g.append(f'<polygon points="{" ".join(f"{f(a)},{f(b)}" for a, b in ordered)}" fill="{fill}" fill-opacity="{op}"/>')
    # crête lointaine
    ridge = 'M0 150V96l40-28 34 22 52-44 46 40 38-22 52 34 40-30 58 36 36-26 50 30 44-24 52 32 44-18 70 28V150Z'
    g.append(f'<path d="{ridge}" fill="{ICE}" fill-opacity=".05"/>')
    x = -10
    while x < W + 20:                                       # rangée du fond : petits sapins pâles
        tree(x, 150, rnd.uniform(34, 62), ICE, .07); x += rnd.uniform(14, 26)
    x = 4
    while x < W + 20:                                       # rangée de devant : plus hauts, plus espacés
        tree(x, 152, rnd.uniform(62, 112), ICE, .1); x += rnd.uniform(38, 70)
    g.append(f'<path d="M0 150C120 142 240 148 380 144S660 148 780 143V150Z" fill="{ICE2}" fill-opacity=".12"/>')
    write('siberie-sapins.svg', W, H, ''.join(g))
pines()

def icicles():
    rnd = random.Random(5); W, H = 320, 30; g = []; x = 4
    while x < W - 6:
        w = rnd.uniform(5, 9); ln = rnd.choice([6, 8, 11, 14, 19, 24]) * rnd.uniform(.85, 1.1)
        g.append(f'<path d="M{f(x)} 0L{f(x+w)} 0C{f(x+w*.8)} {f(ln*.5)} {f(x+w*.58)} {f(ln*.85)} {f(x+w/2)} {f(ln)}C{f(x+w*.42)} {f(ln*.85)} {f(x+w*.2)} {f(ln*.5)} {f(x)} 0Z" fill="{ICE2}" fill-opacity=".5"/>')
        g.append(f'<path d="M{f(x+w*.32)} 1C{f(x+w*.36)} {f(ln*.4)} {f(x+w*.45)} {f(ln*.7)} {f(x+w/2)} {f(ln*.9)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".7"/>')
        x += w + rnd.uniform(5, 16)
    write('siberie-glacons.svg', W, H, ''.join(g))
icicles()

# ---------- OR IMPÉRIAL ----------
def guilloche():
    S = 420; c = S / 2; g = []
    def hypo(R, r, d, steps, phase=0, turns=None):
        gg = math.gcd(R, r); T = 2 * math.pi * (r // gg); pts = []
        for i in range(steps + 1):
            t = T * i / steps
            x = (R - r) * math.cos(t) + d * math.cos((R - r) / r * t + phase)
            y = (R - r) * math.sin(t) - d * math.sin((R - r) / r * t + phase)
            pts.append((c + x, c + y))
        return 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts)
    sty = f'fill="none" stroke="{GOLD2}" stroke-linejoin="round"'
    g.append(f'<path d="{hypo(150, 56, 64, 1400)}" {sty} stroke-opacity=".38" stroke-width=".7"/>')
    g.append(f'<path d="{hypo(150, 56, 64, 1400, math.pi/5)}" {sty} stroke-opacity=".3" stroke-width=".7"/>')
    g.append(f'<path d="{hypo(104, 40, 50, 1100)}" {sty} stroke-opacity=".34" stroke-width=".7"/>')
    for rr, op, w in ((204, .45, 1.2), (198, .25, .6), (172, .18, .6)):
        g.append(f'<circle cx="{c}" cy="{c}" r="{rr}" {sty} stroke-opacity="{op}" stroke-width="{w}"/>')
    ticks = ''.join(f'M{f(c + 204 * math.cos(a))} {f(c + 204 * math.sin(a))}L{f(c + 212 * math.cos(a))} {f(c + 212 * math.sin(a))}' for a in (math.radians(i * 3.75) for i in range(96)))
    g.append(f'<path d="{ticks}" {sty} stroke-opacity=".35" stroke-width=".8"/>')
    write('or-guilloche.svg', S, S, ''.join(g))
guilloche()

def deco_corner(name, fx, fy, S=72):
    def T(x, y): return (S - x if fx else x), (S - y if fy else y)
    g = []
    def line(x1, y1, x2, y2, w=.9, op=.6):
        a, b = T(x1, y1); c2, d = T(x2, y2); g.append(f'<path d="M{f(a)} {f(b)}L{f(c2)} {f(d)}" stroke-width="{w}" stroke-opacity="{op}"/>')
    def arc(r, op=.5, w=.9):
        a, b = T(r, 0); c2, d = T(0, r); sweep = 1 if (fx == fy) else 0
        g.append(f'<path d="M{f(a)} {f(b)}A{r} {r} 0 0 {sweep} {f(c2)} {f(d)}" stroke-width="{w}" stroke-opacity="{op}"/>')
    line(0, 1, 62, 1, 1.4, .75); line(1, 0, 1, 62, 1.4, .75)             # équerre
    line(0, 6, 40, 6, .7, .45); line(6, 0, 6, 40, .7, .45)
    for r, op in ((16, .55), (28, .45), (40, .35)): arc(r, op)
    for i in range(1, 8):                                                # éventail de rayons
        a = math.radians(i * 11.25); line(2, 2, 2 + 46 * math.cos(a), 2 + 46 * math.sin(a), .6, .4)
    x, y = T(50, 50); d = 5
    g.append(f'<path d="M{f(x)} {f(y-d)}L{f(x+d)} {f(y)}L{f(x)} {f(y+d)}L{f(x-d)} {f(y)}Z" fill="{GOLD2}" fill-opacity=".7"/>')
    write(name, S, S, f'<g fill="none" stroke="{GOLD2}" stroke-linecap="round">{"".join(g[:-1])}</g>{g[-1]}')
deco_corner('or-coin-hg.svg', 0, 0); deco_corner('or-coin-hd.svg', 1, 0); deco_corner('or-coin-bg.svg', 0, 1); deco_corner('or-coin-bd.svg', 1, 1)

def or_frise():
    W, H = 220, 16; c = W / 2; g = [f'<path d="M0 8H{c-24}M{c+24} 8H{W}" stroke="{GOLD2}" stroke-opacity=".6" stroke-width="1"/>']
    for dx in (-17, 17): g.append(f'<circle cx="{c+dx}" cy="8" r="1.6" fill="{GOLD2}" fill-opacity=".8"/>')
    for dx in (-30, 30): g.append(f'<path d="M{c+dx} 4L{c+dx+3.5} 8L{c+dx} 12L{c+dx-3.5} 8Z" fill="{GOLD2}" fill-opacity=".7"/>')
    g.append(f'<path d="M{c} 1L{c+9} 8L{c} 15L{c-9} 8Z" fill="#110d04" stroke="{GOLD2}" stroke-width="1.2"/><path d="M{c} 5L{c+4} 8L{c} 11L{c-4} 8Z" fill="{GOLD2}"/>')
    write('or-frise.svg', W, H, ''.join(g))
or_frise()
# ---------- CAMARADE : faucille et marteau (contour du caractère U+262D de la police libre DejaVu Sans, licence Bitstream Vera) ----------
HS_VB = '171 -1495 1494 1495'
HS_D = 'M1000 1495Q1237 1495 1446 1306Q1596 1151 1596 936Q1596 735 1471 597L1665 449L1525 318H1522L1337 488Q1172 378 955 378Q785 378 642 466V463L382 0H379Q175 141 171 148Q197 173 542 581Q566 610 573 610Q686 525 844 525Q1035 525 1186 629L969 827L861 712H855Q668 828 659 840L892 1098Q1175 1084 1175 1079L1049 920Q1279 745 1308 731V733Q1374 823 1374 947V983Q1374 1237 1123 1338Q986 1407 867 1407H830Q732 1407 612 1352Q782 1495 1000 1495Z'
write('urss-faucille.svg', 1494, 1495, f'<path fill="{GOLD}" fill-opacity=".9" transform="translate(-171 1495) scale(1 -1)" d="{HS_D}"/>')
print('décors écrits dans', os.path.abspath(OUT)); print(sorted(os.listdir(OUT)))
