// Jeu 3D « Quart de travail : éplucher les patates du kolkhoze ».
// Une scène three.js : un étal de rue soviétique, une file de gens affamés au fond, une patate à éplucher du doigt.
import * as THREE from './vendor/three.module.min.js';

const DURATION = 90;                       // secondes d'un quart de travail
const TARGET = 0.95;                       // part de la peau à enlever pour que la patate compte
const TEX_W = 1024, TEX_H = 512;           // peau de la patate (texture peinte au doigt)
const GRID_W = 128, GRID_H = 64;           // grille de suivi de ce qui est épluché
const BRUSH = 30;                          // rayon de l'éplucheur (pixels de la texture) : large, pour éplucher sans s'y reprendre dix fois
const GOAL = 200;                          // le « plan » : points à atteindre pour le quota du quart de travail

const PH_CALM = ['Du pain, camarade !', 'Mes enfants ont faim…', 'Une patate, juste une !', 'Il fait −24 °C ici, camarade…', 'Pitié pour la babouchka !', 'J\'ai ma carte de rationnement !', 'On n\'a rien mangé depuis hier…', 'Le Parti avait promis des patates…', 'Camarade, un petit effort pour le peuple !'];
const PH_MID = ['Plus vite, camarade !', 'Trois heures qu\'on attend !', 'Mon voisin en a eu deux !', 'C\'est une patate, pas un tableau !', 'Même ma babouchka épluche plus vite !', 'Tu comptes finir avant le prochain plan quinquennal ?', 'Un peu de nerf, camarade !', 'La queue ne recule pas toute seule !', 'Camarade, on a faim, pas le temps de rêver !'];
const PH_HOT = ['Plus vite, feignasse !', 'Dépêche-toi, fainéant !', 'T\'as pas fini de traîner, camarade mollasson ?', 'Même le chien épluche plus vite !', 'Je le dirai au Politburo !', 'À ce rythme on mange en 1991 !', 'Tire-toi les doigts, feignasse !', 'Y\'a pas de pause dans le plan !', 'Camarade, tu bosses ou tu rêves ?', 'On va te muter en Sibérie !', 'Mollasson de camarade, on gèle !'];
const KID = ['J\'ai faim, maman…', 'Une patate, s\'il vous plaît !'], KID_HOT = ['Même moi j\'épluche plus vite !', 'Dépêche, camarade lent !'];
const THANKS = ['Merci, camarade !', 'Enfin, feignasse !', 'Gloire au travail !', 'Le Parti te remercie !', 'Pas trop tôt, camarade !', 'Dieu vous le rende…'];
const pick = a => a[(Math.random() * a.length) | 0];
const phraseFor = (kid, mood) => kid ? pick(mood > 0.6 ? KID_HOT : KID) : pick(mood > 0.7 ? PH_HOT : mood > 0.35 ? PH_MID : PH_CALM);

// ---------- petits outils ----------
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const smooth = t => t * t * (3 - 2 * t);
function noise3(x, y, z) {                                   // bruit de valeur lissé, suffisant pour des bosses de patate
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi), l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), xf), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), xf), yf), l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), xf), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), xf), yf), zf);
}
const canvasOf = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h); return c; };
const texOf = (w, h, draw, repeat) => { const t = new THREE.CanvasTexture(canvasOf(w, h, draw)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); } return t; };
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export function startPotato(host, opts = {}) {
  const R = rng(20261107);
  let W = host.clientWidth || 360, H = host.clientHeight || 560;
  // ---------- rendu ----------
  const canvas = document.createElement('canvas'); canvas.className = 'pt-canvas'; host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const FOG = 0x4b5563;
  scene.fog = new THREE.Fog(FOG, 11, 44);
  scene.background = new THREE.CanvasTexture(canvasOf(8, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1b2233'); g.addColorStop(0.55, '#3d475a'); g.addColorStop(0.85, '#6b6f7a'); g.addColorStop(1, '#8a7f7a'); x.fillStyle = g; x.fillRect(0, 0, w, h); }));
  scene.background.colorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
  const frame = () => { const portrait = W / H < 1.3; camera.fov = portrait ? 66 : 50; camera.aspect = W / H; camera.position.set(0, portrait ? 3.7 : 3.3, portrait ? 6.6 : 6.4); camera.userData.ly = portrait ? 2.55 : 2.35; camera.lookAt(0, camera.userData.ly, -2.2); camera.updateProjectionMatrix(); };
  frame();

  // ---------- lumières ----------
  scene.add(new THREE.HemisphereLight(0xb7c4dc, 0x5a4d40, 1.15));
  const sun = new THREE.DirectionalLight(0xffe9cc, 1.3); sun.position.set(-3, 9, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 22 }); scene.add(sun);
  const lampLight = new THREE.PointLight(0xffa24d, 28, 16, 1.6); lampLight.position.set(-5.2, 5.2, -2.4); scene.add(lampLight);
  const stallLight = new THREE.PointLight(0xffd9a0, 14, 9, 1.6); stallLight.position.set(0, 4.6, 2.6); scene.add(stallLight);

  // ---------- matériaux & textures ----------
  const woodTex = texOf(256, 256, (x, w, h) => { x.fillStyle = '#8a5f3a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#7d5434' : '#946840'; x.fillRect(0, i * 32, w, 31); } for (let i = 0; i < 420; i++) { x.fillStyle = `rgba(60,35,18,${0.08 + R() * 0.16})`; x.fillRect(R() * w, R() * h, 20 + R() * 60, 1); } for (let i = 0; i < 8; i++) { x.fillStyle = '#4a2c16'; x.fillRect(0, i * 32, w, 2); } }, [3, 1]);
  const woodMat = lam(0xffffff, { map: woodTex });
  const darkWood = lam(0x4b3322);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.45 });
  const snowTex = texOf(512, 512, (x, w, h) => { x.fillStyle = '#d3d9e2'; x.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(${150 + R() * 40},${158 + R() * 40},${172 + R() * 40},${0.12 + R() * 0.2})`; x.beginPath(); x.arc(R() * w, R() * h, 2 + R() * 10, 0, 7); x.fill(); } for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(70,64,60,0.18)'; x.beginPath(); x.ellipse(R() * w, R() * h, 8 + R() * 26, 4 + R() * 10, R() * 3, 0, 7); x.fill(); } }, [8, 8]);

  const add = (m, x, y, z, parent = scene) => { m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = m.receiveShadow = true; return add(m, x, y, z, parent); };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 14, parent) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.castShadow = true; return add(m, x, y, z, parent); };
  const ball = (r, mat, x, y, z, parent, seg = 14) => add(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg - 2), mat), x, y, z, parent);

  // ---------- sol, immeubles, étoile, cheminée ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ map: snowTex })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const winTex = (seed) => { const r = rng(seed); return texOf(256, 512, (x, w, h) => { x.fillStyle = '#7b7f87'; x.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.07})`; x.fillRect(r() * w, r() * h, 30, 2); } for (let row = 0; row < 12; row++) for (let col = 0; col < 5; col++) { x.fillStyle = '#272c38'; x.fillRect(14 + col * 48, 14 + row * 41, 30, 28); } x.fillStyle = '#5d6168'; for (let col = 0; col < 5; col++) x.fillRect(12 + col * 48, 0, 2, h); }, [2, 1]); };
  const litTex = (seed) => { const r = rng(seed); return texOf(256, 512, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); for (let row = 0; row < 12; row++) for (let col = 0; col < 5; col++) if (r() < 0.32) { x.fillStyle = r() < 0.75 ? '#ffc766' : '#ffe9b0'; x.fillRect(14 + col * 48, 14 + row * 41, 30, 28); } }, [2, 1]); };
  const blocks = [[-24, -28, 8, 14], [-14, -26, 9, 11], [-3, -30, 10, 16], [8, -27, 9, 12], [19, -29, 9, 15], [30, -26, 8, 11], [-34, -27, 8, 12]];
  blocks.forEach(([x, z, w, h], i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 7), new THREE.MeshLambertMaterial({ map: winTex(11 + i), emissive: 0xffffff, emissiveMap: litTex(40 + i), emissiveIntensity: 0.95 })); add(m, x, h / 2, z); });
  // grande étoile rouge lumineuse sur l'immeuble central
  const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.8 : 2; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); } starShape.closePath();
  const bigStar = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.5, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: 0xe3262d, fog: false })); add(bigStar, -3, 18.6, -26.2);
  const starGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvasOf(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(255,70,60,0.8)'); g.addColorStop(1, 'rgba(255,70,60,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); })), transparent: true, fog: false, depthWrite: false })); starGlow.scale.set(11, 11, 1); add(starGlow, -3, 18.6, -25.5);
  // cheminée d'usine + fumée
  const chim = cyl(0.8, 1.1, 20, lam(0xb9b2a8), 17, 10, -36, 16); for (let i = 0; i < 4; i++) cyl(0.84, 1.14, 1.2, lam(i % 2 ? 0xd9d2c8 : 0xb03a34), 17, 19 - i * 3.2, -36, 16);
  const smokeTex = new THREE.CanvasTexture(canvasOf(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(210,214,222,0.55)'); g.addColorStop(1, 'rgba(210,214,222,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }));
  const smoke = Array.from({ length: 9 }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); s.userData.t = i / 9; scene.add(s); return s; });
  // congères
  for (let i = 0; i < 14; i++) { const m = ball(1 + R() * 1.6, lam(0xe4e9f0), (R() - 0.5) * 50, 0.1, -9 - R() * 13, scene, 10); m.scale.set(1.6, 0.34, 1); }

  // ---------- étal : comptoir, auvent, bannière, accessoires ----------
  const stall = new THREE.Group(); scene.add(stall);
  box(11.4, 0.2, 6.6, woodMat, 0, 1.22, 2.6, stall);
  const cloth = texOf(512, 128, (x, w, h) => { x.fillStyle = '#b3262d'; x.fillRect(0, 0, w, h); for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(i * 17, 0, 3, h); } x.fillStyle = '#f1e7c9'; x.font = 'bold 64px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ОВОЩИ', w / 2, h / 2 + 4); const star = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); }; star(56, 64, 28); star(w - 56, 64, 28); });
  box(11.4, 1.2, 0.12, lam(0xffffff, { map: cloth }), 0, 0.62, -0.42, stall);
  for (const sx of [-5.5, 5.5]) { cyl(0.1, 0.12, 6.2, darkWood, sx, 3.1, -0.35, 10, stall); }
  box(11.6, 0.18, 0.22, darkWood, 0, 6.15, -0.35, stall);
  for (let i = 0; i < 24; i++) { const m = box(0.48, 0.55, 0.05, lam(i % 2 ? 0xf0e6cf : 0xb3262d), -5.5 + i * 0.4783 + 0.24, 5.8, -0.34, stall); m.castShadow = false; const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12, 1, false, 0, Math.PI), lam(i % 2 ? 0xf0e6cf : 0xb3262d)); tip.rotation.set(Math.PI / 2, 0, Math.PI); add(tip, m.position.x, 5.52, -0.34, stall); }
  // bannière
  const bannerTex = texOf(1024, 160, (x, w, h) => { x.fillStyle = '#c0161d'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 40; i++) x.fillRect(i * 26, 0, 6, h); x.strokeStyle = '#e8c35a'; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20); x.fillStyle = '#f4d56b'; x.font = 'bold 92px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('СЛАВА ТРУДУ!', w / 2, h / 2 + 6); const star = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); }; star(96, 80, 46); star(w - 96, 80, 46); });
  const bannerGeo = new THREE.PlaneGeometry(7.2, 1.12, 36, 4), banner = new THREE.Mesh(bannerGeo, new THREE.MeshLambertMaterial({ map: bannerTex, side: THREE.DoubleSide })); add(banner, 0, 4.85, -0.3, stall);
  // pancarte des prix + thermomètre + horloge
  const sign = texOf(512, 256, (x, w, h) => { x.fillStyle = '#d9cba3'; x.fillRect(0, 0, w, h); x.strokeStyle = '#5b4630'; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = '#2b2118'; x.textAlign = 'center'; x.font = 'bold 70px Arial, sans-serif'; x.fillText('КАРТОФЕЛЬ', w / 2, 88); x.font = 'bold 54px Arial, sans-serif'; x.fillText('3 коп. / кг', w / 2, 158); x.font = '28px Arial, sans-serif'; x.fillText('1 kg par famille — pas de crédit', w / 2, 220); });
  const signM = box(1.9, 0.95, 0.06, lam(0xffffff, { map: sign }), -3.4, 3.35, -0.28, stall); signM.rotation.z = 0.05; for (const dx of [-0.8, 0.8]) cyl(0.012, 0.012, 0.9, darkWood, -3.4 + dx, 4.25, -0.28, 4, stall);
  const thermo = texOf(128, 320, (x, w, h) => { x.fillStyle = '#e9e2cd'; x.fillRect(0, 0, w, h); x.fillStyle = '#222'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.fillText('−24°', w / 2, 296); x.fillStyle = '#ddd'; x.fillRect(54, 20, 20, 220); x.fillStyle = '#c0161d'; x.fillRect(58, 190, 12, 50); x.beginPath(); x.arc(64, 248, 15, 0, 7); x.fill(); x.strokeStyle = '#555'; for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(80, 30 + i * 20); x.lineTo(92, 30 + i * 20); x.stroke(); } });
  box(0.5, 1.25, 0.05, lam(0xffffff, { map: thermo }), 5.5, 3.0, -0.2, stall);
  // comptoir : planche, seau, balance, samovar, radio, cartes, sac, caisses, casserole
  box(3.0, 0.08, 2.0, darkWood, 0, 1.36, 3.0, stall);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x8e979f, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide })); add(bucket, 3.9, 1.62, 3.0, stall); cyl(0.4, 0.3, 0.02, lam(0x1c1c1c), 3.9, 1.34, 3.0, 16, stall);
  for (let i = 0; i < 6; i++) { const s = box(0.3, 0.012, 0.05, lam(0x7a5636), 3.9 + (R() - 0.5) * 0.4, 1.36 + i * 0.03, 3.0 + (R() - 0.5) * 0.4, stall); s.rotation.y = R() * 3; }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.55, 22, 1, true), new THREE.MeshStandardMaterial({ color: 0x555d66, metalness: 0.65, roughness: 0.4, side: THREE.DoubleSide })); add(pot, 1.95, 1.58, 2.1, stall); cyl(0.46, 0.46, 0.02, lam(0x1c2b34), 1.95, 1.7, 2.1, 20, stall);
  
  // balance
  const scaleG = new THREE.Group(); add(scaleG, -3.9, 1.32, 1.3, stall); cyl(0.25, 0.3, 0.1, metal, 0, 0.05, 0, 16, scaleG); cyl(0.03, 0.03, 1.3, metal, 0, 0.7, 0, 8, scaleG);
  const beam = new THREE.Group(); add(beam, 0, 1.32, 0, scaleG); box(1.5, 0.05, 0.06, metal, 0, 0, 0, beam); const pans = [-0.7, 0.7].map(dx => { const p = new THREE.Group(); add(p, dx, -0.45, 0, beam); cyl(0.3, 0.2, 0.05, metal, 0, -0.1, 0, 16, p); for (const a of [-0.2, 0.2]) cyl(0.006, 0.006, 0.45, metal, a, 0.14, 0, 4, p); return p; });
  for (let i = 0; i < 3; i++) ball(0.17, lam(0xb99863), -0.7 + (i - 1) * 0.14, -0.28, (i - 1) * 0.1, beam, 8);
  // samovar
  const sam = new THREE.Group(); add(sam, -4.7, 1.32, 2.6, stall); const gold = new THREE.MeshStandardMaterial({ color: 0xc99a3b, metalness: 0.85, roughness: 0.3 });
  cyl(0.38, 0.3, 0.9, gold, 0, 0.6, 0, 20, sam); cyl(0.3, 0.38, 0.12, gold, 0, 0.1, 0, 20, sam); cyl(0.3, 0.34, 0.1, gold, 0, 1.1, 0, 20, sam); ball(0.18, gold, 0, 1.22, 0, sam, 14); cyl(0.04, 0.04, 0.3, gold, 0.45, 0.5, 0, 8, sam).rotation.z = Math.PI / 2; cyl(0.05, 0.05, 0.2, darkWood, 0, 1.42, 0, 8, sam);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.24, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide })); add(glass, -4.0, 1.5, 3.3, stall);
  // radio
  const radio = new THREE.Group(); add(radio, 4.6, 1.5, 1.0, stall); box(0.9, 0.5, 0.35, lam(0x6f4a2e), 0, 0.25, 0, radio);
  const grill = texOf(128, 128, (x, w, h) => { x.fillStyle = '#2a1d12'; x.fillRect(0, 0, w, h); x.fillStyle = '#c9a66b'; for (let i = 0; i < 10; i++) x.fillRect(8, 10 + i * 11, w - 16, 5); }); const gm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), lam(0xffffff, { map: grill })); add(gm, -0.15, 0.25, 0.18, radio);
  const knob1 = cyl(0.05, 0.05, 0.05, lam(0xe0d6ba), 0.25, 0.32, 0.18, 10, radio); knob1.rotation.x = Math.PI / 2; const knob2 = cyl(0.05, 0.05, 0.05, lam(0xe0d6ba), 0.25, 0.16, 0.18, 10, radio); knob2.rotation.x = Math.PI / 2;
  const led = ball(0.025, new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 0.34, 0.43, 0.18, radio, 8); const ant = cyl(0.008, 0.008, 0.9, metal, 0.3, 0.9, -0.08, 4, radio); ant.rotation.z = -0.35;
  // cartes de rationnement
  for (let i = 0; i < 3; i++) { const t = texOf(128, 192, (x, w, h) => { x.fillStyle = '#e7dcb8'; x.fillRect(0, 0, w, h); x.strokeStyle = '#9a2a2a'; x.lineWidth = 4; x.strokeRect(5, 5, w - 10, h - 10); x.fillStyle = '#9a2a2a'; x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.fillText('КАРТОЧКА', w / 2, 34); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) x.strokeRect(14 + c * 26, 54 + r * 30, 22, 24); }); const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5), lam(0xffffff, { map: t, side: THREE.DoubleSide })); m.rotation.set(-Math.PI / 2, 0, 0.3 + i * 0.4); add(m, 1.6 + i * 0.28, 1.35 + i * 0.003, 3.2 + i * 0.05, stall); }
  // sac de patates + patates en vrac
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), lam(0xb59a6b, { map: texOf(128, 128, (x, w, h) => { x.fillStyle = '#b59a6b'; x.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(80,60,30,${R() * 0.25})`; x.fillRect(R() * w, R() * h, 8, 1); x.fillRect(R() * w, R() * h, 1, 8); } }) })); sack.scale.set(1, 1.25, 0.9); add(sack, -2.7, 1.82, 2.6, stall); sack.castShadow = true; cyl(0.28, 0.4, 0.2, lam(0xa88c5e), -2.7, 2.42, 2.6, 12, stall);
  for (let i = 0; i < 5; i++) { const p = ball(0.15 + R() * 0.04, lam(0x9b7a4c), -1.9 + R() * 0.8, 1.5, 3.3 + R() * 0.45, stall, 10); p.scale.set(1.3, 0.85, 1); p.rotation.y = R() * 3; }
  // caisses
  const crateTex = texOf(256, 256, (x, w, h) => { x.fillStyle = '#9a7248'; x.fillRect(0, 0, w, h); for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#8a6540' : '#a37a4e'; x.fillRect(0, i * 51, w, 49); } x.strokeStyle = '#4a2e18'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6); x.fillStyle = '#2a2a2a'; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.fillText('КАРТОФЕЛЬ', w / 2, 140); x.font = '20px Arial'; x.fillText('№ 7 — СОВХОЗ', w / 2, 178); });
  [[-5.0, 0.4, 0.4], [-4.9, 1.1, 0.3], [-4.2, 0.4, 0.55]].forEach(([x, y, z], i) => { const c = box(0.8, 0.7, 0.8, lam(0xffffff, { map: crateTex }), x, y, z + 0.9, stall); c.rotation.y = 0.2 * (i - 1); });
  // vestes accrochées : chapka du vendeur sur le poteau gauche
  const hook = new THREE.Group(); add(hook, -5.38, 3.4, 0.1, stall); const hat = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x5a4636)); add(hat, 0, 0, 0, hook); cyl(0.26, 0.26, 0.09, lam(0x6b5545), 0, -0.04, 0, 14, hook);

  // ---------- réverbère + corbeau, fils, arbres ----------
  const lamp = new THREE.Group(); add(lamp, -5.2, 0, -2.4); cyl(0.07, 0.1, 5.2, lam(0x2b2f36), 0, 2.6, 0, 8, lamp); const arm = box(1.0, 0.08, 0.08, lam(0x2b2f36), 0.5, 5.1, 0, lamp); const lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 14, 1, true), lam(0x3a3f47, { side: THREE.DoubleSide })); add(lampHead, 1.0, 5.2, 0, lamp); const bulb = ball(0.12, new THREE.MeshBasicMaterial({ color: 0xffd28a }), 1.0, 5.0, 0, lamp, 10);
  lampLight.position.set(-4.2, 5.0, -2.4);
  const crow = new THREE.Group(); add(crow, 0.2, 5.3, 0, lamp); ball(0.18, lam(0x111114), 0, 0.12, 0, crow, 10).scale.set(1, 0.9, 1.4); const crowHead = new THREE.Group(); add(crowHead, 0, 0.3, 0.2, crow); ball(0.1, lam(0x111114), 0, 0, 0, crowHead, 8); const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 6), lam(0x333)); beak.rotation.x = Math.PI / 2; add(beak, 0, -0.01, 0.13, crowHead); const tail = box(0.1, 0.03, 0.3, lam(0x111114), 0, 0.08, -0.3, crow); tail.rotation.x = 0.3;
  const lamp2 = new THREE.Group(); add(lamp2, 8, 0, -8.5); cyl(0.07, 0.1, 5.2, lam(0x2b2f36), 0, 2.6, 0, 8, lamp2); ball(0.15, new THREE.MeshBasicMaterial({ color: 0xffd28a }), 0, 5.3, 0, lamp2, 10);
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 21 }, (_, i) => { const t = i / 20; return new THREE.Vector3(-4.2 + t * 12.2, 5.15 - Math.sin(t * Math.PI) * -0.0 - Math.sin(t * Math.PI) * 0.7, -2.4 - t * 6.1); })), new THREE.LineBasicMaterial({ color: 0x1a1c20 })); scene.add(wire);
  const tree = (x, z, s) => { const g = new THREE.Group(); add(g, x, 0, z); cyl(0.12 * s, 0.2 * s, 3 * s, lam(0x2d2620), 0, 1.5 * s, 0, 6, g); for (let i = 0; i < 7; i++) { const b = cyl(0.03 * s, 0.07 * s, 1.5 * s, lam(0x2d2620), 0, 2.4 * s, 0, 5, g); b.rotation.set((R() - 0.5) * 1.2, R() * 6, 0.6 + R() * 0.5); b.position.y = (2 + R() * 1.2) * s; b.translateY(0.7 * s); } };
  tree(-9.5, -7, 1.2); tree(12, -12, 1.5); tree(-15, -15, 1.4);

  // ---------- neige ----------
  const SN = 520, snowPos = new Float32Array(SN * 3), snowV = new Float32Array(SN * 2);
  for (let i = 0; i < SN; i++) { snowPos[i * 3] = (R() - 0.5) * 30; snowPos[i * 3 + 1] = R() * 12; snowPos[i * 3 + 2] = -14 + R() * 24; snowV[i * 2] = 0.7 + R() * 1.1; snowV[i * 2 + 1] = R() * 6; }
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  scene.add(new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false })));

  // ---------- bulles de dialogue ----------
  const bubbleCache = new Map();
  const wrapText = (x, text, max) => { const words = text.split(' '), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; } lines.push(cur); return lines.slice(0, 3); };
  const bubbleTex = text => { if (bubbleCache.has(text)) return bubbleCache.get(text); const t = new THREE.CanvasTexture(canvasOf(512, 192, (x, w, h) => { x.font = 'bold 31px Arial, sans-serif'; const lines = wrapText(x, text, 400), tw = Math.min(w - 20, Math.max(...lines.map(l => x.measureText(l).width)) + 44), bh = 26 + lines.length * 38, bottom = 156, top = bottom - bh, L = (w - tw) / 2; x.fillStyle = 'rgba(247,242,228,0.97)'; x.strokeStyle = '#3a2f26'; x.lineWidth = 4; x.beginPath(); x.roundRect(L, top, tw, bh, 18); x.fill(); x.stroke(); x.beginPath(); x.moveTo(w / 2 - 14, bottom - 1); x.lineTo(w / 2, 188); x.lineTo(w / 2 + 14, bottom - 1); x.closePath(); x.fill(); x.stroke(); x.fillStyle = '#2a2018'; x.textAlign = 'center'; x.textBaseline = 'middle'; lines.forEach((l, i) => x.fillText(l, w / 2, top + 13 + 19 + i * 38)); })); t.colorSpace = THREE.SRGBColorSpace; bubbleCache.set(text, t); return t; };
  const makeBubble = () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0, fog: false })); s.scale.set(2.6, 0.975, 1); s.renderOrder = 5; return s; };

  // ---------- les gens ----------
  const COATS = [0x4d4a45, 0x3e4a3b, 0x5b4636, 0x3a3f4f, 0x6a5a48, 0x2f3a3e, 0x55432f, 0x4a4040];
  const SKINS = [0xdcb596, 0xd3a888, 0xe2c2a4, 0xc79a7b];
  function person(spec) {
    const g = new THREE.Group(), S = spec.scale || 1, coat = lam(spec.coat), skin = lam(spec.skin);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.0, 10), coat); body.position.y = 0.98; body.castShadow = true; g.add(body);
    for (const sx of [-0.1, 0.1]) cyl(0.085, 0.085, 0.55, lam(0x26262b), sx, 0.27, 0, 8, g);
    for (const sx of [-0.1, 0.1]) { const f = box(0.13, 0.07, 0.24, lam(0x1b1b1d), sx, 0.035, 0.05, g); f.castShadow = false; }
    ball(0.17, skin, 0, 1.68, 0, g, 12); const eyeM = new THREE.MeshBasicMaterial({ color: 0x15110e });
    for (const sx of [-0.065, 0.065]) { ball(0.02, eyeM, sx, 1.7, 0.155, g, 6); const br = box(0.07, 0.014, 0.01, eyeM, sx, 1.75, 0.16, g); br.rotation.z = sx > 0 ? 0.4 : -0.4; }
    ball(0.025, skin, 0, 1.65, 0.17, g, 6);
    const mouth = box(0.07, 0.012, 0.01, eyeM, 0, 1.6, 0.16, g); mouth.rotation.z = 0.0;
    const headG = new THREE.Group(); g.add(headG);
    if (spec.hat === 'ushanka') { const fur = lam(0x5b4b3a); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), fur); cap.position.y = 1.72; headG.add(cap); cyl(0.205, 0.205, 0.07, fur, 0, 1.7, 0, 12, headG); for (const sx of [-0.19, 0.19]) { const fl = box(0.07, 0.18, 0.12, fur, sx, 1.6, 0.0, headG); fl.castShadow = false; } }
    else if (spec.hat === 'scarf') { const sc = lam(spec.scarf || 0x9a3d3d); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), sc); cap.position.set(0, 1.71, -0.045); cap.rotation.x = -0.12; headG.add(cap); const knot = ball(0.07, sc, 0, 1.56, 0.14, headG, 6); knot.scale.set(1.4, 0.8, 0.8); }
    else if (spec.hat === 'cap') { const c = lam(0x3a3a3f); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.09, 14), c); cap.position.y = 1.8; headG.add(cap); const vis = box(0.2, 0.02, 0.14, c, 0, 1.77, 0.2, headG); vis.rotation.x = 0.2; }
    else if (spec.hat === 'bare') { const h = lam(spec.hair || 0x2e2822); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), h); cap.position.set(0, 1.7, -0.02); headG.add(cap); }
    const mkArm = sx => { const a = new THREE.Group(); a.position.set(sx * 0.31, 1.4, 0); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.55, 8), coat); m.position.y = -0.27; a.add(m); ball(0.06, skin, 0, -0.56, 0, a, 8); g.add(a); return a; };
    const armL = mkArm(-1), armR = mkArm(1);
    if (spec.bag) { const b = box(0.28, 0.32, 0.1, lam(0x9a8a62), 0.05, -0.62, 0.05, armR); b.castShadow = false; }
    if (spec.bowl) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), metal); b.position.set(0, -0.58, 0.07); armL.add(b); }
    if (spec.cane) { const c = cyl(0.015, 0.015, 1.0, darkWood, 0.42, 0.5, 0.15, 5, g); c.rotation.z = -0.08; }
    g.scale.setScalar(S);
    const bubble = makeBubble(); bubble.position.set(0, 2.62, 0); g.add(bubble);
    g.userData = { armL, armR, headG, bubble, bubbleT: 0, nextTalk: 1 + R() * 6, phase: R() * 6.28, home: new THREE.Vector3(), kid: S < 0.8, speed: 0.8 + R() * 0.6, state: 'wait', leaveT: 0 };
    return g;
  }
  const crowd = [];
  const specs = [
    { hat: 'scarf', scarf: 0x8c3b3b, bag: true }, { hat: 'ushanka' }, { hat: 'cap', cane: true }, { hat: 'scarf', scarf: 0x4d6a7a, bag: true }, { hat: 'ushanka', bowl: true }, { hat: 'bare', hair: 0x5a4a3a },
    { hat: 'scarf', scarf: 0x6b7a4b }, { hat: 'ushanka' }, { hat: 'cap', bowl: true }, { hat: 'scarf', scarf: 0x9a7a3b, bag: true }, { hat: 'ushanka', cane: true }, { hat: 'bare', hair: 0x1f1a16 },
    { hat: 'scarf', scarf: 0x7a4a6a }, { hat: 'ushanka', bowl: true }, { hat: 'cap' }, { hat: 'scarf', scarf: 0x8c3b3b, bowl: true }, { hat: 'ushanka' }, { hat: 'bare', hair: 0x3a2e22, kid: true },
  ];
  specs.forEach((sp, i) => {
    const row = i % 2, col = Math.floor(i / 2), n = 9;
    const kid = i === 5 || i === 11 || i === 17;
    const p = person({ ...sp, coat: COATS[(i * 3) % COATS.length], skin: SKINS[i % SKINS.length], scale: kid ? 0.7 : 1.08 + (i % 4) * 0.05 });
    const x = (col - (n - 1) / 2) * 1.35 + (row ? 0.68 : 0) + (R() - 0.5) * 0.35, z = row ? -4.6 : -2.5 - R() * 0.3;
    p.position.set(x, 0, z); p.rotation.y = (R() - 0.5) * 0.35; p.userData.home.set(x, 0, z); scene.add(p); crowd.push(p);
  });
  // un chien maigre
  const dog = new THREE.Group(); add(dog, 6.3, 0, -2.2); const dogM = lam(0x8a6a4a); box(0.7, 0.3, 0.28, dogM, 0, 0.5, 0, dog); const dogHead = new THREE.Group(); add(dogHead, 0.42, 0.62, 0, dog); box(0.26, 0.2, 0.2, dogM, 0, 0, 0, dogHead); box(0.14, 0.1, 0.12, lam(0x5a4228), 0.17, -0.04, 0, dogHead); for (const [dx, dz] of [[-0.25, -0.1], [-0.25, 0.1], [0.25, -0.1], [0.25, 0.1]]) box(0.06, 0.4, 0.06, dogM, dx, 0.2, dz, dog); const dogTail = box(0.4, 0.05, 0.05, dogM, -0.5, 0.62, 0, dog); dog.rotation.y = -0.7;
  // un enfant avec une écuelle devant le comptoir côté gauche
  const beggar = person({ hat: 'ushanka', bowl: true, coat: 0x4a3f36, skin: SKINS[1], scale: 0.7 }); beggar.position.set(-3.6, 0, -0.9); beggar.rotation.y = 0.3; beggar.userData.home.copy(beggar.position); scene.add(beggar); crowd.push(beggar);

  // souffle de froid
  const breathTex = new THREE.CanvasTexture(canvasOf(32, 32, (x, w, h) => { const g = x.createRadialGradient(16, 16, 1, 16, 16, 16); g.addColorStop(0, 'rgba(235,240,248,0.5)'); g.addColorStop(1, 'rgba(235,240,248,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }));
  const puffs = Array.from({ length: 14 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: breathTex, transparent: true, depthWrite: false, opacity: 0 })); s.userData.life = 0; scene.add(s); return s; });
  let puffI = 0;
  const puff = (x, y, z) => { const s = puffs[puffI++ % puffs.length]; s.position.set(x, y, z); s.userData.life = 1; s.scale.setScalar(0.15); };

  // ---------- la patate ----------
  const potatoG = new THREE.Group(); potatoG.position.set(0, 2.25, 3.0); scene.add(potatoG);
  const spinG = new THREE.Group(); potatoG.add(spinG);
  const skinCanvas = document.createElement('canvas'); skinCanvas.width = TEX_W; skinCanvas.height = TEX_H; const sctx = skinCanvas.getContext('2d');
  const skinTex = new THREE.CanvasTexture(skinCanvas); skinTex.colorSpace = THREE.SRGBColorSpace; skinTex.anisotropy = 4;
  const skinMat = new THREE.MeshStandardMaterial({ map: skinTex, transparent: true, alphaTest: 0.5, roughness: 0.92, metalness: 0 });
  const fleshMat = new THREE.MeshStandardMaterial({ color: 0xeedd9b, roughness: 0.75 });
  let skinMesh = null, fleshMesh = null;
  const peeled = new Uint8Array(GRID_W * GRID_H), weight = new Float32Array(GRID_H); let weightSum = 0;
  for (let j = 0; j < GRID_H; j++) { weight[j] = Math.sin(Math.PI * (j + 0.5) / GRID_H); weightSum += weight[j] * GRID_W; }
  let coverage = 0, peeledWeight = 0, waste = 0, potatoSeed = 1;
  function paintSkin(seed) {
    const r = rng(seed * 977 + 13), tone = 0.9 + r() * 0.2;
    sctx.globalCompositeOperation = 'source-over'; sctx.clearRect(0, 0, TEX_W, TEX_H);
    const g = sctx.createLinearGradient(0, 0, 0, TEX_H); g.addColorStop(0, `rgb(${Math.round(150 * tone)},${Math.round(116 * tone)},${Math.round(78 * tone)})`); g.addColorStop(0.5, `rgb(${Math.round(170 * tone)},${Math.round(134 * tone)},${Math.round(92 * tone)})`); g.addColorStop(1, `rgb(${Math.round(142 * tone)},${Math.round(108 * tone)},${Math.round(72 * tone)})`); sctx.fillStyle = g; sctx.fillRect(0, 0, TEX_W, TEX_H);
    for (let i = 0; i < 5200; i++) { const dark = r() < 0.5; sctx.fillStyle = dark ? `rgba(80,56,30,${0.05 + r() * 0.14})` : `rgba(214,184,138,${0.05 + r() * 0.14})`; sctx.beginPath(); sctx.ellipse(r() * TEX_W, r() * TEX_H, 1 + r() * 6, 1 + r() * 4, r() * 3, 0, 7); sctx.fill(); }
    for (let i = 0; i < 26; i++) { const x = r() * TEX_W, y = 60 + r() * (TEX_H - 120); sctx.fillStyle = 'rgba(70,48,26,0.85)'; sctx.beginPath(); sctx.ellipse(x, y, 5 + r() * 4, 3 + r() * 2, r() * 3, 0, 7); sctx.fill(); sctx.strokeStyle = 'rgba(95,70,40,0.5)'; sctx.lineWidth = 2; sctx.beginPath(); sctx.ellipse(x, y, 11 + r() * 4, 8, r() * 3, 0, 7); sctx.stroke(); }
    skinTex.needsUpdate = true;
  }
  function buildPotato(seed) {
    for (const m of [skinMesh, fleshMesh]) if (m) { spinG.remove(m); m.geometry.dispose(); }
    const geo = new THREE.SphereGeometry(1, 96, 64), pos = geo.attributes.position, r = rng(seed * 31 + 7), ox = r() * 10, oy = r() * 10, oz = r() * 10, sx = 1.18 + r() * 0.22, sy = 0.82 + r() * 0.12, sz = 0.88 + r() * 0.12;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const n = noise3(v.x * 1.6 + ox, v.y * 1.6 + oy, v.z * 1.6 + oz) * 0.34 + noise3(v.x * 4 + oy, v.y * 4 + oz, v.z * 4 + ox) * 0.08 - 0.2; pos.setXYZ(i, v.x * sx * (1 + n), v.y * sy * (1 + n), v.z * sz * (1 + n)); }
    geo.computeVertexNormals();
    skinMesh = new THREE.Mesh(geo, skinMat); skinMesh.castShadow = true; fleshMesh = new THREE.Mesh(geo.clone(), fleshMat); fleshMesh.scale.setScalar(0.965); fleshMesh.castShadow = true;
    spinG.add(fleshMesh); spinG.add(skinMesh); skinMesh.renderOrder = 2;
    paintSkin(seed); peeled.fill(0); peeledWeight = 0; coverage = 0; waste = 0;
    potatoG.scale.setScalar(0.68); spinG.rotation.set(0.25, 0.4 + r() * 2, 0);
  }
  const RADIUS = 1;

  // ---------- éplucheur et lamelles ----------
  const peeler = new THREE.Group(); const blade = box(0.34, 0.025, 0.1, metal, 0, 0, 0, peeler); box(0.06, 0.05, 0.4, lam(0xb3262d), 0, 0.03, -0.3, peeler); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), metal); ring.position.set(0, 0.03, 0.04); ring.rotation.x = Math.PI / 2; peeler.add(ring); peeler.visible = false; peeler.scale.setScalar(1.7); scene.add(peeler);
  const strips = Array.from({ length: 48 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.055), new THREE.MeshLambertMaterial({ color: 0x8f6a40 })); m.visible = false; m.userData = { v: new THREE.Vector3(), life: 0, spin: new THREE.Vector3() }; scene.add(m); return m; });
  let stripI = 0;
  const spawnStrip = p => { const s = strips[stripI++ % strips.length]; s.position.copy(p); s.visible = true; s.scale.setScalar(1); s.userData.life = 1.4; s.userData.v.set((R() - 0.5) * 1.2, 1.2 + R() * 1.2, 0.4 + R() * 1.2); s.userData.spin.set(R() * 8, R() * 8, R() * 8); };

  // ---------- état de jeu et interface ----------
  const ui = document.createElement('div'); ui.className = 'pt-ui';
  ui.innerHTML = `<div class="pt-top"><div><small>Quart de travail</small><b id="pt-time">${DURATION}</b></div><div><small>Plan</small><b><span id="pt-score">0</span><em>/${GOAL}</em></b></div><div><small>Patates</small><b id="pt-count">0</b></div></div>
    <div class="pt-mood"><i id="pt-mood"></i><span>Patience de la file</span></div><div class="pt-toast" id="pt-toast"></div><div class="pt-prog"><i id="pt-prog"></i></div>
    <div class="pt-hint" id="pt-hint">1 doigt : éplucher — 2 doigts : tourner la patate</div><button class="pt-exit" id="pt-exit" aria-label="Quitter">Quitter</button>
    <div class="pt-over" id="pt-over"></div>`;
  host.appendChild(ui);
  ui.querySelector('#pt-exit').onclick = () => opts.onExit?.();
  const $ = id => ui.querySelector('#' + id);
  const state = { running: false, over: true, t: DURATION, score: 0, count: 0, mood: 0.1, qualitySum: 0 };
  let toastTimer = 0;
  const toast = (msg, kind = '') => { const el = $('pt-toast'); el.textContent = msg; el.className = 'pt-toast show ' + kind; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'pt-toast'; }, 1800); };
  const rank = s => s >= GOAL * 1.55 ? ['Héros du Travail Socialiste', 'Médaille de Stakhanov, camarade ! Le Politburo vous cite en exemple.'] : s >= GOAL ? ['Camarade éplucheur modèle', 'Plan accompli ! Le Parti est fier de votre rendement.'] : s >= GOAL * 0.45 ? ['Ouvrier honorable', 'Le plan n\'est pas atteint, mais le Parti ferme les yeux pour cette fois.'] : ['Rapport au Comité', 'Quota très loin du compte. La file murmure… et vous allez devoir vous expliquer, feignasse.'];
  function showStart() {
    $('pt-over').innerHTML = `<div class="pt-card"><div class="pt-star"></div><h2>Section pommes de terre n° 7</h2><p>La file attend depuis l'aube. Épluchez le plus de patates possible en <b>${DURATION} secondes</b>.</p>
      <ul><li><b>Objectif : ${GOAL} points du plan</b> (le quota). Chaque patate rapporte jusqu'à 100 points selon la peau enlevée.</li><li><b>1 doigt</b> pour éplucher, <b>2 doigts</b> pour tourner la patate.</li><li>Enlève toute la peau sans t'acharner au même endroit : <b>trop de coups, c'est du gaspillage</b>.</li><li>Une patate est terminée quand ${Math.round(TARGET * 100)} % de la peau est partie.</li><li>Plus la file s'impatiente, plus elle se rapproche…</li></ul><button id="pt-go">Commencer le quart</button></div>`;
    $('pt-over').classList.add('show'); $('pt-go').onclick = start;
  }
  function start() {
    state.running = true; state.over = false; state.t = DURATION; state.score = 0; state.count = 0; state.mood = 0.1; state.qualitySum = 0;
    $('pt-over').classList.remove('show'); buildPotato(++potatoSeed); upd();
  }
  function end() {
    state.running = false; state.over = true; dragMode = null; peeler.visible = false;
    const [title, text] = rank(state.score);
    $('pt-over').innerHTML = `<div class="pt-card"><div class="pt-star"></div><h2>Fin du quart</h2><p class="pt-big">${state.score} <small>points du plan</small></p><p>${state.count} patate${state.count > 1 ? 's' : ''} épluchée${state.count > 1 ? 's' : ''}.</p><h3>${title}</h3><p>${text}</p><button id="pt-go">Un autre quart</button></div>`;
    $('pt-over').classList.add('show'); $('pt-go').onclick = start; opts.onEnd?.({ score: state.score, count: state.count });
  }
  function upd() { $('pt-time').textContent = Math.max(0, Math.ceil(state.t)); $('pt-score').textContent = state.score; $('pt-score').parentElement.classList.toggle('done', state.score >= GOAL); $('pt-count').textContent = state.count; $('pt-mood').style.width = Math.round(state.mood * 100) + '%'; $('pt-prog').style.width = Math.round(Math.min(1, coverage / TARGET) * 100) + '%'; ui.classList.toggle('pt-late', state.mood > 0.7); }

  // ---------- interactions ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let dragMode = null, last = null, lastT = 0, repaint = false;
  const setPtr = e => { const r = canvas.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const hitSkin = e => { setPtr(e); ray.setFromCamera(ptr, camera); return ray.intersectObject(skinMesh, false)[0] || ray.intersectObject(fleshMesh, false)[0] || null; };
  function brushAt(uv, dt) {
    const ux = uv.x * TEX_W, uy = (1 - uv.y) * TEX_H, sinT = Math.max(0.3, Math.sin(Math.PI * uv.y)), rx = BRUSH / sinT, ry = BRUSH;
    sctx.globalCompositeOperation = 'destination-out'; sctx.fillStyle = '#000';
    for (const off of [0, -TEX_W, TEX_W]) { if (ux + off + rx < 0 || ux + off - rx > TEX_W) continue; sctx.beginPath(); sctx.ellipse(ux + off, uy, rx, ry, 0, 0, Math.PI * 2); sctx.fill(); }
    repaint = true;
    // suivi : cases touchées, dont celles déjà épluchées (gaspillage)
    const gx = uv.x * GRID_W, gy = (1 - uv.y) * GRID_H, cr = Math.max(1.5, BRUSH / TEX_H * GRID_H * 1.1), crx = cr / sinT; let touched = 0, already = 0;
    for (let j = Math.max(0, Math.floor(gy - cr)); j <= Math.min(GRID_H - 1, Math.ceil(gy + cr)); j++) for (let i = Math.floor(gx - crx); i <= Math.ceil(gx + crx); i++) {
      const ii = (i + GRID_W) % GRID_W; if (((i + 0.5 - gx) / crx) ** 2 + ((j + 0.5 - gy) / cr) ** 2 > 1) continue; touched++; const k = j * GRID_W + ii;
      if (peeled[k]) already++; else { peeled[k] = 1; peeledWeight += weight[j]; }
    }
    coverage = peeledWeight / weightSum;
    if (touched && already / touched > 0.92) { waste += dt; const s = Math.max(0.9, 0.965 - waste * 0.01); fleshMesh.scale.setScalar(s); }
  }
  function strokeBetween(a, b, dt) {
    if (!a || Math.abs(a.x - b.x) > 0.4) { brushAt(b, dt); return; }
    const d = Math.hypot((a.x - b.x) * TEX_W, (a.y - b.y) * TEX_H), n = Math.max(1, Math.ceil(d / (BRUSH * 0.7)));
    for (let i = 1; i <= n; i++) brushAt({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }, dt / n);
  }
  canvas.style.touchAction = 'none'; canvas.addEventListener('contextmenu', e => e.preventDefault());
  const pointers = new Map(); let lastCenter = null;
  const center = () => { let x = 0, y = 0; pointers.forEach(p => { x += p.x; y += p.y; }); return { x: x / pointers.size, y: y / pointers.size }; };
  const spinBy = (dx, dy) => { spinG.rotation.y += dx * 0.012; spinG.rotation.x = Math.max(-1.4, Math.min(1.4, spinG.rotation.x + dy * 0.012)); };
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture?.(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastT = performance.now();
    if (!state.running) return;
    if (pointers.size >= 2 || (e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey))) { dragMode = 'spin'; last = null; peeler.visible = false; lastCenter = center(); $('pt-hint').classList.add('off'); return; }
    const hit = hitSkin(e); if (hit && hit.uv) { dragMode = 'peel'; last = null; $('pt-hint').classList.add('off'); } else dragMode = null;   // un seul doigt à côté de la patate : rien ne se passe
  });
  canvas.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!dragMode || !state.running) return;
    const now = performance.now(), dt = Math.min(0.06, (now - lastT) / 1000); lastT = now;
    if (dragMode === 'spin') { const c = center(); if (lastCenter) spinBy(c.x - lastCenter.x, c.y - lastCenter.y); lastCenter = c; return; }
    if (dragMode === 'peel') {
      const hit = hitSkin(e);
      if (hit && hit.uv) {
        const p = { x: hit.uv.x, y: hit.uv.y }, before = coverage; strokeBetween(last, p, dt); last = p;
        const gained = coverage - before; if (gained > 0 && R() < Math.min(1, gained * 60)) spawnStrip(hit.point);
        peeler.visible = true; peeler.position.copy(hit.point).addScaledVector(hit.face.normal.clone().transformDirection(skinMesh.matrixWorld), 0.3); peeler.lookAt(camera.position); peeler.rotateX(0.5); peeler.rotateZ(-0.3);
      } else { last = null; peeler.visible = false; }
    }
  });
  const release = e => { pointers.delete(e.pointerId); if (pointers.size === 0) { dragMode = null; last = null; lastCenter = null; peeler.visible = false; } else if (pointers.size === 1 && dragMode === 'spin') { lastCenter = center(); } };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; release(e); });

  // ---------- fin d'une patate ----------
  let flight = null;
  function finishPotato() {
    const quality = Math.max(10, Math.round(coverage * 100 - Math.min(45, waste * 10))), pts = Math.round(quality * 0.8 + Math.max(0, 10 - waste * 2));
    state.score += pts; state.count++; state.qualitySum += quality; state.mood = Math.max(0, state.mood - 0.28);
    toast(waste > 2.5 ? `+${pts} — trop de chair perdue, gaspilleur !` : quality >= 92 ? `+${pts} — travail de maître, camarade !` : `+${pts} — pas mal, pour un feignant !`, waste > 2.5 ? 'bad' : 'good');
    dragMode = null; peeler.visible = false; flight = { t: 0, from: potatoG.position.clone() };
    // quelqu'un reçoit sa patate
    const who = crowd.filter(c => c.userData.state === 'wait').sort((a, b) => a.position.z - b.position.z)[0]; if (who) { who.userData.state = 'served'; who.userData.leaveT = 0; who.userData.bubbleT = 2.2; who.userData.bubble.material.map = bubbleTex(pick(THANKS)); who.userData.bubble.material.needsUpdate = true; }
    // le pot reçoit de la vapeur
    for (let i = 0; i < 3; i++) setTimeout(() => puff(1.95 + (R() - 0.5) * 0.3, 1.9, 2.1), i * 120);
    upd();
  }

  // ---------- boucle ----------
  const clock = new THREE.Clock(); let raf = 0, stopped = false, camAmp = 0.9;
  const tmp = new THREE.Vector3();
  function tick() {
    if (stopped) return; raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    if (state.running) {
      state.t -= dt; state.mood = Math.min(1, state.mood + dt * 0.011); if (state.t <= 0) { state.t = 0; upd(); end(); }
      if (!flight && coverage >= TARGET) finishPotato();
      if ((t * 10 | 0) % 3 === 0) upd();
    }
    // patate : inertie, envol vers la casserole puis nouvelle patate
    if (flight) {
      flight.t += dt / 0.7; const k = Math.min(1, flight.t), e = k * k * (3 - 2 * k);
      potatoG.position.set(flight.from.x + (1.95 - flight.from.x) * e, flight.from.y + (2.1 - flight.from.y) * e + Math.sin(k * Math.PI) * 1.2, flight.from.z + (2.1 - flight.from.z) * e); potatoG.scale.setScalar(0.68 * (1 - e * 0.7)); fleshMat.color.setHex(0xeedd9b);
      if (k >= 1) { flight = null; potatoG.position.set(0, 2.25, 3.0); if (state.running) buildPotato(++potatoSeed); }
    }
    if (repaint) { skinTex.needsUpdate = true; repaint = false; if (state.running) $('pt-prog').style.width = Math.round(Math.min(1, coverage / TARGET) * 100) + '%'; }
    // lampadaire qui grésille, étal chaleureux
    const fl = 0.85 + Math.sin(t * 23) * 0.06 + (Math.sin(t * 3.1) > 0.97 ? -0.5 : 0) + Math.sin(t * 7.3) * 0.05; lampLight.intensity = 28 * Math.max(0.3, fl); bulb.material.color.setHex(fl < 0.6 ? 0x8a6a3a : 0xffd28a);
    stallLight.intensity = 14 + Math.sin(t * 1.7) * 0.6;
    // bannière qui ondule, balance qui oscille, radio, corbeau
    const bp = bannerGeo.attributes.position; for (let i = 0; i < bp.count; i++) bp.setZ(i, Math.sin(bp.getX(i) * 1.6 + t * 2.2) * 0.06 + Math.sin(bp.getX(i) * 0.7 + t) * 0.03); bp.needsUpdate = true; bannerGeo.computeVertexNormals();
    beam.rotation.z = Math.sin(t * 0.9) * 0.05; pans.forEach((p, i) => { p.rotation.z = -beam.rotation.z; });
    led.material.color.setHex(Math.sin(t * 6) > 0 ? 0xff3b30 : 0x4a1210); ant.rotation.z = -0.35 + Math.sin(t * 1.5) * 0.02;
    crowHead.rotation.y = Math.sin(t * 0.8) * 0.8 + Math.sin(t * 2.3) * 0.2; crowHead.rotation.x = Math.sin(t * 4) * 0.05 * (Math.sin(t * 0.5) > 0.6 ? 1 : 0); crow.position.y = 5.3 + (Math.sin(t * 0.37) > 0.995 ? 0.1 : 0);
    dogHead.rotation.z = -0.35 + Math.sin(t * 2.4) * 0.3; dogTail.rotation.z = Math.sin(t * 9) * 0.5; dogTail.position.y = 0.62; dog.position.x = 6.3 + Math.sin(t * 0.2) * 0.4;
    // fumée de la cheminée
    smoke.forEach(s => { s.userData.t = (s.userData.t + dt * 0.05) % 1; const k = s.userData.t; s.position.set(17 + k * 5 + Math.sin(k * 9) * 0.6, 20.4 + k * 9, -36); s.scale.setScalar(2.5 + k * 7); s.material.opacity = Math.sin(k * Math.PI) * 0.6; });
    // neige
    const sp = snowGeo.attributes.position; for (let i = 0; i < SN; i++) { let y = sp.getY(i) - snowV[i * 2] * dt * 1.3; sp.setX(i, sp.getX(i) + Math.sin(t * 0.7 + snowV[i * 2 + 1]) * dt * 0.3 + dt * 0.35); if (y < 0) { y = 12; sp.setX(i, (R() - 0.5) * 30); } sp.setY(i, y); } sp.needsUpdate = true;
    // lamelles
    for (const s of strips) if (s.visible) { const u = s.userData; u.life -= dt; if (u.life <= 0) { s.visible = false; continue; } u.v.y -= 9 * dt; s.position.addScaledVector(u.v, dt); if (s.position.y < 1.4 && Math.abs(s.position.x) < 1.6) { s.position.y = 1.4; u.v.set(0, 0, 0); u.spin.multiplyScalar(0); s.scale.setScalar(Math.max(0, u.life / 1.4)); } else s.rotation.set(s.rotation.x + u.spin.x * dt, s.rotation.y + u.spin.y * dt, s.rotation.z + u.spin.z * dt); }
    // souffles
    for (const s of puffs) if (s.userData.life > 0) { s.userData.life -= dt * 0.7; s.position.y += dt * 0.35; s.position.x += dt * 0.12; s.scale.setScalar(0.15 + (1 - s.userData.life) * 0.8); s.material.opacity = Math.max(0, s.userData.life) * 0.7; } else s.material.opacity = 0;
    if ((t * 1.1 | 0) !== ((t - dt) * 1.1 | 0)) puff(-4.7 + (R() - 0.5) * 0.1, 3.0, 2.6);                // le samovar fume
    // la foule : grelotte, tend les mains, parle, s'approche quand elle s'impatiente
    const mood = state.running ? state.mood : 0.25;
    for (const c of crowd) {
      const u = c.userData, ph = u.phase;
      if (u.state === 'served') { u.leaveT += dt; c.rotation.y = Math.PI; c.position.x += dt * (c.position.x < 0 ? -1 : 1) * 1.4; c.position.y = Math.abs(Math.sin(t * 8 + ph)) * 0.03; u.armR.rotation.x = -0.4; u.armL.rotation.x = -0.4; if (u.leaveT > 3) { u.state = 'wait'; c.rotation.y = (R() - 0.5) * 0.35; c.position.x = (R() < 0.5 ? -1 : 1) * 8; u.home.x = (R() - 0.5) * 11; } continue; }
      c.position.x += (u.home.x - c.position.x) * Math.min(1, dt * 1.2);
      c.position.z += (u.home.z + mood * 1.6 * (u.home.z < -3.5 ? 0.6 : 1) - c.position.z) * Math.min(1, dt * 0.8);
      c.position.y = Math.max(0, Math.sin(t * 11 + ph)) * 0.012 * (1 + mood);                       // frissons de froid
      const lift = -1.65 - mood * 0.5 + Math.sin(t * (2 + u.speed) + ph) * (0.18 + mood * 0.12);
      u.armL.rotation.x = lift; u.armR.rotation.x = lift + Math.sin(t * 2.3 + ph) * 0.15; u.armL.rotation.z = 0.12; u.armR.rotation.z = -0.12;
      u.headG.rotation.y = Math.sin(t * 0.7 + ph) * 0.25; u.headG.rotation.x = Math.sin(t * 1.1 + ph) * 0.05 - mood * 0.08;
      u.nextTalk -= dt * (0.6 + mood * 1.8);
      if (u.bubbleT > 0) { u.bubbleT -= dt; u.bubble.material.opacity = Math.min(1, u.bubbleT * 2.5, (u.bubbleT > 0.3 ? 1 : u.bubbleT / 0.3)); u.bubble.position.y = 2.62 + Math.sin(t * 2 + ph) * 0.03; if (u.bubbleT <= 0) u.bubble.material.opacity = 0; }
      else if (u.nextTalk <= 0) { u.nextTalk = 5 + R() * 7; u.bubbleT = 3.0; u.bubble.material.map = bubbleTex(phraseFor(u.kid, mood)); u.bubble.material.needsUpdate = true; }
      if (((t * 0.5 + ph) % 3) < dt * 0.5 + 0.0001) { tmp.set(c.position.x, 1.6 * (u.kid ? 0.62 : 0.95), c.position.z + 0.3); puff(tmp.x, tmp.y, tmp.z); }
    }
    // la caméra dérive doucement de gauche à droite : on découvre peu à peu l'étal et la rue
    camAmp += ((state.running ? 0.2 : 0.9) - camAmp) * Math.min(1, dt * 1.5);                         // presque immobile pendant le jeu, pour viser sans que la patate bouge
    camera.position.x = Math.sin(t * 0.22) * camAmp; camera.lookAt(Math.sin(t * 0.22) * camAmp * 0.55, camera.userData.ly, -2.2);
    renderer.render(scene, camera);
  }

  // ---------- redimensionnement, nettoyage ----------
  const ro = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h || (w === W && h === H)) return; W = w; H = h; renderer.setSize(W, H, false); frame(); });
  ro.observe(host);
  buildPotato(potatoSeed); showStart(); upd(); tick();
  return {
    stop() { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose?.(); x.dispose?.(); }); }); canvas.remove(); ui.remove(); },
    state, forceCover(v) { coverage = v; }, rot() { return [spinG.rotation.x, spinG.rotation.y]; },
    screenPos() { const v = potatoG.position.clone().project(camera), r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
  };
}
