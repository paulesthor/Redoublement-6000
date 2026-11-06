// Scène 3D du camp, vue de dessus : le camp s'agrandit avec la progression (8 étapes) et change de région à chaque plan quinquennal.
// Personnages clichés (politicien au costard déchiré, ouvriers en veste matelassée, babouchka, garde moustachu…), aucune violence montrée.
import * as THREE from './vendor/three.module.min.js';

export const REGIONS = [
  { name: 'Camp n° 7 — la taïga', sky: 0x86a0bd, fog: 0xb4c2d3, ground: 0xe9eef3, deco: 'pines', tint: 0xffffff },
  { name: 'Kolyma — les mines d\'or', sky: 0x7384a0, fog: 0xa3b0c3, ground: 0xdfe6ee, deco: 'mountains', tint: 0xffe9b0 },
  { name: 'Norilsk — nickel et fumées', sky: 0x9a947f, fog: 0xc0b697, ground: 0xdad7cf, deco: 'smoke', tint: 0xd8cfae },
  { name: 'Vorkouta — charbon polaire', sky: 0x233256, fog: 0x4a5c88, ground: 0xcfd9ec, deco: 'aurora', tint: 0xcfe0ff },
  { name: 'Grand Nord — complexe industriel', sky: 0x5c6878, fog: 0x8f9aa9, ground: 0xe3e7ec, deco: 'industry', tint: 0xe8edf5 },
  { name: 'Cité modèle du socialisme', sky: 0xc25a52, fog: 0xe0b3a4, ground: 0xf3eee6, deco: 'model', tint: 0xffe4d6 },
];
export const STAGES = ['Quelques tentes', 'Le premier baraquement', 'La tour de guet', 'La cantine', 'La scierie', 'Le chemin de fer', 'L\'administration', 'Le camp modèle'];
const STAGE_AT = [0, 3, 8, 16, 28, 45, 70, 100];                      // « score du camp » minimal de chaque étape
export const stageOf = score => { let s = 0; STAGE_AT.forEach((t, i) => { if (score >= t) s = i; }); return s; };

const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const canvasOf = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
const texOf = (w, h, draw) => { const t = new THREE.CanvasTexture(canvasOf(w, h, draw)); t.colorSpace = THREE.SRGBColorSpace; return t; };

export function createCamp(host) {
  const R = rng(777);
  let W = host.clientWidth || 360, H = host.clientHeight || 300;
  const canvas = document.createElement('canvas'); canvas.className = 'gl-canvas'; host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(REGIONS[0].sky); scene.fog = new THREE.Fog(REGIONS[0].fog, 34, 80);
  const camera = new THREE.PerspectiveCamera(32, W / H, 0.5, 200);
  const camTarget = new THREE.Vector3(0, 0.5, 0);
  let camAngle = 0.62, camDist = 40;
  const placeCam = () => { camera.position.set(Math.sin(camAngle) * camDist, camDist * 0.62, Math.cos(camAngle) * camDist); camera.lookAt(camTarget); };
  const fit = () => { camera.aspect = W / H; camDist = W / H < 1 ? 41 : 36; camera.updateProjectionMatrix(); placeCam(); };
  fit();

  scene.add(new THREE.HemisphereLight(0xdbe6f5, 0x6a5a4c, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.5); sun.position.set(-14, 26, 12); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 5, far: 70 }); scene.add(sun);
  const fireLight = new THREE.PointLight(0xff8a3a, 30, 14, 1.6); fireLight.position.set(1, 1.6, 2); scene.add(fireLight);

  // ---------- sol et région ----------
  const groundMat = new THREE.MeshLambertMaterial({ color: REGIONS[0].ground });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(15.5, 40), lam(0xb9b4ad)); dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.02; dirt.receiveShadow = true; scene.add(dirt);   // terre battue du camp
  for (let i = 0; i < 30; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.8 + R() * 1.6, 8), lam(0xd7d2c9)); p.rotation.x = -Math.PI / 2; p.position.set((R() - 0.5) * 26, 0.03, (R() - 0.5) * 26); scene.add(p); }
  const decoG = new THREE.Group(); scene.add(decoG);
  const pine = (x, z, s) => { const g = new THREE.Group(); const m = lam(0x2f4a3a), sn = lam(0xf2f5f8); for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.3 - i * 0.26, 1.5, 8), m); c.position.y = 1.5 + i * 0.95; c.castShadow = true; g.add(c); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.8 - i * 0.16, 0.5, 8), sn); cap.position.y = 1.95 + i * 0.95; g.add(cap); } const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1, 6), lam(0x4a3426)); t.position.y = 0.5; g.add(t); g.position.set(x, 0, z); g.scale.setScalar(s); return g; };
  const ring = (n, r0, r1, f) => { for (let i = 0; i < n; i++) { const a = R() * 6.283, r = r0 + R() * (r1 - r0); const o = f(Math.cos(a) * r, Math.sin(a) * r, i); if (o) decoG.add(o); } };
  const smokeTex = new THREE.CanvasTexture(canvasOf(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(235,238,244,0.7)'); g.addColorStop(1, 'rgba(235,238,244,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }));
  let aurora = null;
  const regionDeco = idx => {
    while (decoG.children.length) decoG.remove(decoG.children[0]);
    const d = REGIONS[idx % REGIONS.length].deco, r = rng(100 + idx);
    if (d === 'pines' || d === 'model') ring(d === 'pines' ? 46 : 18, 19, 40, (x, z) => pine(x, z, 0.8 + r() * 0.7));
    if (d === 'mountains') ring(14, 30, 48, (x, z) => { const m = new THREE.Mesh(new THREE.ConeGeometry(5 + r() * 6, 9 + r() * 9, 5), lam(0x8a93a3)); m.position.set(x, 4, z); const sn = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.6, 5), lam(0xf6f8fb)); sn.position.y = 3.6 + 1.4; m.add(sn); return m; }), ring(14, 19, 30, (x, z) => pine(x, z, 0.7 + r() * 0.4));
    if (d === 'smoke' || d === 'industry') ring(d === 'smoke' ? 9 : 14, 22, 40, (x, z) => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 9 + r() * 6, 12), lam(d === 'smoke' ? 0x8c8576 : 0x9aa0a8)); c.position.y = 5; g.add(c); const b = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 4), lam(0x7e7a70)); b.position.set(2, 1.3, 1); g.add(b); g.position.set(x, 0, z); g.userData.smoke = true; return g; });
    if (d === 'aurora') { ring(30, 19, 42, (x, z) => pine(x, z, 0.7 + r() * 0.8)); aurora = new THREE.Mesh(new THREE.PlaneGeometry(90, 22, 40, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvasOf(256, 64, (x, w, h) => { const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(120,255,190,0)'); g.addColorStop(0.5, 'rgba(120,255,190,0.5)'); g.addColorStop(1, 'rgba(160,120,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); })), transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide })); aurora.position.set(-10, 24, -44); aurora.rotation.y = 0.35; decoG.add(aurora); } else aurora = null;
    if (d === 'model') { for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), lam(0x777)); f.position.set(-14 + i * 7, 3.5, -17); decoG.add(f); const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshLambertMaterial({ color: 0xc0161d, side: THREE.DoubleSide })); fl.position.set(-14 + i * 7 + 1.3, 6.1, -17); decoG.add(fl); } }
  };
  let region = -1;
  const target = { sky: new THREE.Color(), fog: new THREE.Color(), ground: new THREE.Color() };

  // ---------- fabrique de personnages ----------
  const SKINS = [0xe0b99a, 0xd3a888, 0xc79a7b, 0xe8c9ae], COATS = [0x4a4a46, 0x3e4a3b, 0x5b4636, 0x3a3f4f, 0x6a5a48, 0x2f3a3e];
  const people = [];                                                    // tous les personnages animés
  function person(o) {
    const g = new THREE.Group(), body = lam(o.coat || COATS[(R() * COATS.length) | 0]), skin = lam(o.skin || SKINS[(R() * SKINS.length) | 0]), dark = lam(0x26262b);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 1.0, 10), body); torso.position.y = 1.05; torso.castShadow = true; g.add(torso);
    const legs = [-0.12, 0.12].map(x => { const l = new THREE.Group(); l.position.set(x, 0.6, 0); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.6, 7), o.pants ? lam(o.pants) : dark); m.position.y = -0.3; m.castShadow = true; l.add(m); const f = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.26), lam(0x1b1b1d)); f.position.set(0, -0.6, 0.05); l.add(f); g.add(l); return l; });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin); head.position.y = 1.78; head.castShadow = true; g.add(head);
    const eye = new THREE.MeshBasicMaterial({ color: 0x15110e }); for (const sx of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), eye); e.position.set(sx, 1.8, 0.17); g.add(e); }
    if (o.mustache) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), lam(0x2a1d14)); m.position.set(0, 1.72, 0.19); g.add(m); for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.04), lam(0x2a1d14)); t.position.set(sx * 0.13, 1.7, 0.18); t.rotation.z = sx * 0.5; g.add(t); } }
    if (o.glasses) { for (const sx of [-0.07, 0.07]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 5, 10), lam(0x111)); r.position.set(sx, 1.8, 0.185); g.add(r); } const br = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), lam(0x111)); br.position.set(0, 1.8, 0.19); g.add(br); }
    const hat = { ushanka() { const f = lam(0x5b4b3a), c = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, 6.283, 0, 1.57), f); c.position.y = 1.82; g.add(c); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.08, 10), f); r.position.y = 1.8; g.add(r); for (const sx of [-0.21, 0.21]) { const fl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.13), f); fl.position.set(sx, 1.68, 0); g.add(fl); } },
      scarf() { const c = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8, 0, 6.283, 0, 1.4), lam(o.scarf || 0x9a3d3d)); c.position.set(0, 1.8, -0.04); g.add(c); }, cap() { const m = lam(0x2f3b48), c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 12), m); c.position.y = 1.93; g.add(c); const v = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.15), m); v.position.set(0, 1.88, 0.2); g.add(v); const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), lam(0xc0161d)); st.position.set(0, 1.94, 0.22); g.add(st); },
      bowler() { const m = lam(0x1d1d22), c = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, 6.283, 0, 1.57), m); c.position.y = 1.9; g.add(c); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12), m); r.position.y = 1.9; g.add(r); } }[o.hat]; hat?.();
    const mkArm = sx => { const a = new THREE.Group(); a.position.set(sx * 0.36, 1.45, 0); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.058, o.shortSleeve && sx > 0 ? 0.32 : 0.55, 8), o.shortSleeve && sx > 0 ? lam(0xdad5c6) : body); m.position.y = -0.27; m.castShadow = true; a.add(m); const h = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), skin); h.position.y = -0.56; a.add(h); g.add(a); return a; };
    const armL = mkArm(-1), armR = mkArm(1);
    if (o.tie) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.02), lam(0xa01c22)); t.position.set(0.1, 1.2, 0.34); t.rotation.z = 0.5; g.add(t); const sh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.02), lam(0xe5e0d0)); sh.position.set(0, 1.35, 0.33); g.add(sh); }
    if (o.patches) for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.02), lam(0x777b82)); p.position.set(-0.12 + i * 0.12, 0.9 + (i % 2) * 0.25, 0.36); p.rotation.z = i; g.add(p); }
    if (o.apron) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.02), lam(0xe9e4d4)); a.position.set(0, 0.85, 0.36); g.add(a); }
    const prop = { pick() { const p = new THREE.Group(), h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5), lam(0x6b4a2c)); h.position.y = -0.3; p.add(h); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.06), lam(0x70757d)); hd.position.y = 0.16; p.add(hd); p.position.set(0, -0.55, 0.02); p.rotation.x = Math.PI / 2; armR.add(p); },
      briefcase() { const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.1), lam(0x4a3220)); b.position.set(0, -0.78, 0.04); armL.add(b); }, ladle() { const p = new THREE.Group(), h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), lam(0x777)); h.position.y = -0.2; p.add(h); const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, 6.283, 0, 1.57), lam(0x888)); b.position.y = -0.52; p.add(b); armR.add(p); },
      bowl() { const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6, 0, 6.283, 1.57, 1.57), lam(0x8e949b)); b.position.set(0, -0.6, 0.06); armL.add(b); }, binoculars() { const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.1), lam(0x222)); b.position.set(0, -0.6, 0.04); armR.add(b); },
      notebook() { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.03), lam(0x8d2d2d)); b.position.set(0, -0.58, 0.05); armL.add(b); }, thermos() { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 8), lam(0x3c6e91)); b.position.set(0, -0.6, 0.05); armL.add(b); },
      abacus() { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.04), lam(0x8a5f3a)); b.position.set(0, -0.58, 0.07); armL.add(b); for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.01, 0.01), lam(0x222)); l.position.set(0, -0.58 + (i - 1) * 0.05, 0.1); armL.add(l); } }, scroll() { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), lam(0xf0e6c8)); b.position.set(0, -0.58, 0.05); b.rotation.z = Math.PI / 2; armL.add(b); } }[o.prop]; prop?.();
    g.scale.setScalar(o.scale || 1.25);
    const p = { g, armL, armR, legs, head, o, ph: R() * 6.28, state: o.state || 'idle', quip: o.quip };
    g.userData.person = p; people.push(p); return p;
  }

  // ---------- éléments récurrents ----------
  const pool = [];                                                       // éclats de pierre
  const chipMat = lam(0x7b8089);
  for (let i = 0; i < 90; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), chipMat); c.visible = false; c.userData = { v: new THREE.Vector3(), life: 0 }; scene.add(c); pool.push(c); }
  let chipI = 0; const burst = (p, n = 5) => { for (let i = 0; i < n; i++) { const c = pool[chipI++ % pool.length]; c.position.copy(p); c.visible = true; c.userData.life = 0.9; c.userData.v.set((R() - 0.5) * 4, 2.5 + R() * 2.5, (R() - 0.5) * 4); c.scale.setScalar(0.6 + R() * 0.9); } };
  const sprites = [];                                                    // fumée et vapeur
  const emitter = (pos, color = 0xdfe3ea, rate = 0.5, scale = 1) => ({ pos, color, rate, scale, t: R() });
  const emitters = [];
  const puffPool = Array.from({ length: 80 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); s.userData = { life: 0 }; scene.add(s); return s; });
  let puffI = 0; const puff = (e) => { const s = puffPool[puffI++ % puffPool.length]; s.position.copy(e.pos); s.position.x += (R() - 0.5) * 0.2; s.userData = { life: 1, sc: e.scale }; s.material.color.setHex(e.color); s.scale.setScalar(0.6 * e.scale); };
  const stageObjs = Array.from({ length: 8 }, () => []);               // ce qui apparaît à chaque étape
  const grow = [];                                                       // animations d'apparition en cours
  const mkGroup = (stage, x, z, rot = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; g.visible = false; scene.add(g); stageObjs[stage].push(g); return g; };
  const bx = (g, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const wood = lam(0x8a5f3a), woodDark = lam(0x5e4028), snowM = lam(0xf5f8fb), redM = lam(0xb3262d), brick = lam(0x9a5b46), plaster = lam(0xd9cfb8);
  const winTex = texOf(64, 64, (x, w, h) => { x.fillStyle = '#ffd88a'; x.fillRect(0, 0, w, h); x.fillStyle = '#6b4a2a'; x.fillRect(30, 0, 4, h); x.fillRect(0, 30, w, 4); });
  const windows = (g, w, y, z, n) => { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: winTex })); m.position.set(-w / 2 + (i + 0.5) * (w / n), y, z); g.add(m); } };
  const gabled = (g, w, h, d, mat, roofMat, y) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2 - 0.15, 0); sh.lineTo(0, h); sh.lineTo(w / 2 + 0.15, 0); sh.closePath(); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d + 0.3, bevelEnabled: false }), roofMat); m.position.set(0, y, -(d + 0.3) / 2); m.castShadow = true; g.add(m); const sn = new THREE.Mesh(new THREE.ExtrudeGeometry((() => { const s2 = new THREE.Shape(); s2.moveTo(-w / 2 - 0.1, 0.03); s2.lineTo(0, h + 0.1); s2.lineTo(w / 2 + 0.1, 0.03); s2.lineTo(w / 2 - 0.1, 0); s2.lineTo(0, h - 0.12); s2.lineTo(-w / 2 + 0.1, 0); s2.closePath(); return s2; })(), { depth: d + 0.34, bevelEnabled: false }), snowM); sn.position.set(0, y + 0.08, -(d + 0.34) / 2); g.add(sn); };
  const barrack = (stage, x, z, rot) => { const g = mkGroup(stage, x, z, rot); bx(g, 4.2, 1.7, 2.2, wood, 0, 0.85, 0); gabled(g, 4.2, 1.2, 2.2, wood, lam(0x4a4f57), 1.7); windows(g, 3.4, 1.0, 1.11, 4); bx(g, 0.5, 0.9, 0.05, woodDark, 1.6, 0.45, 1.12); const ch = bx(g, 0.35, 0.9, 0.35, brick, -1.2, 2.2, 0); emitters.push(emitter(new THREE.Vector3(x - 1.2 * Math.cos(rot), 2.9, z + 1.2 * Math.sin(rot)), 0xe8ebf0, 0.7, 0.9)); return g; };
  const bonfire = new THREE.Group(); bonfire.position.set(0, 0, 2); scene.add(bonfire); stageObjs[0].push(bonfire); bonfire.visible = false;
  const flames = [0xff6a1a, 0xffa02e, 0xffd34d].map((c, i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.45 - i * 0.12, 1.2 - i * 0.25, 7), new THREE.MeshBasicMaterial({ color: c })); f.position.y = 0.6 + i * 0.1; bonfire.add(f); return f; });
  for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 5), woodDark); l.position.set(Math.cos(i) * 0.4, 0.15, Math.sin(i) * 0.4); l.rotation.set(Math.PI / 2, 0, i); bonfire.add(l); }
  emitters.push(emitter(new THREE.Vector3(0, 1.8, 2), 0xa9a9a9, 0.9, 0.9));

  // ---------- étape 0 : tentes, feu, carrière, premiers ouvriers ----------
  const tent = (x, z, rot, c) => { const g = mkGroup(0, x, z, rot); const sh = new THREE.Shape(); sh.moveTo(-1.2, 0); sh.lineTo(0, 1.7); sh.lineTo(1.2, 0); sh.closePath(); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: false }), lam(c)); m.position.z = -1.1; m.castShadow = true; g.add(m); const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 2.2), snowM); cap.position.set(0, 1.62, 0); g.add(cap); bx(g, 0.5, 0.9, 0.05, lam(0x2d2a26), 0, 0.45, 1.1); return g; };
  tent(-3, -2, 0.3, 0x5f6b4f); tent(-0.5, -4, -0.2, 0x6b5a45); tent(-5.5, -4.2, 0.1, 0x55606b);
  const signG = mkGroup(0, 3, 4.5, -0.4); bx(signG, 0.12, 1.6, 0.12, woodDark, -0.9, 0.8, 0); bx(signG, 0.12, 1.6, 0.12, woodDark, 0.9, 0.8, 0); const signTex = texOf(256, 96, (x, w, h) => { x.fillStyle = '#d9cba3'; x.fillRect(0, 0, w, h); x.strokeStyle = '#5b4630'; x.lineWidth = 6; x.strokeRect(4, 4, w - 8, h - 8); x.fillStyle = '#2b2118'; x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.fillText('ЛАГЕРЬ № 7', w / 2, 60); }); const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.82), new THREE.MeshLambertMaterial({ map: signTex, side: THREE.DoubleSide })); sg.position.set(0, 1.35, 0.07); signG.add(sg);
  const logs = mkGroup(0, 3.5, 0.5); for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2, 8), woodDark); l.rotation.z = Math.PI / 2; l.position.set(0, 0.2 + (i > 2 ? 0.35 : 0), (i % 3 - 1) * 0.42); l.castShadow = true; logs.add(l); }
  // carrière : rochers à casser
  const rocks = [];
  const quarry = [[-7.5, 4.5, 0.6], [-5.2, 6.2, -0.4], [-8.6, 7.4, 0.9], [-4.4, 3.4, -0.8], [-9.5, 5.2, 0.2]];
  quarry.forEach(([x, z, a], i) => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), lam(0x6f747c)); m.position.set(x, 0.55, z); m.castShadow = true; m.scale.set(1.2, 0.85, 1); m.visible = false; scene.add(m); rocks.push({ m, hits: 0, x, z, a }); stageObjs[i < 3 ? 0 : i < 4 ? 2 : 5].push(m); });
  for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + R() * 0.3, 0), lam(0x838891)); m.position.set(-9 + R() * 6, 0.25, 8 + R() * 2); m.castShadow = true; m.scale.y = 0.7; m.visible = false; scene.add(m); stageObjs[0].push(m); }
  const breaker = (stage, i, quip) => { const r = rocks[i], p = person({ hat: R() < 0.5 ? 'ushanka' : 'cap', prop: 'pick', patches: true, quip, state: 'break' }); p.rock = r; p.g.position.set(r.x + 1.1, 0, r.z + 0.7); p.g.rotation.y = -2.2; p.g.visible = false; scene.add(p.g); stageObjs[stage].push(p.g); p.cycle = R() * 2; return p; };
  breaker(0, 0, 'Ça casse, camarade, ça casse. Surtout le moral.'); breaker(0, 1, 'Un rocher par jour, c\'est la norme. On est à 40 %.'); breaker(0, 2, 'Le Parti a dit : « casse-toi » mais je crois qu\'il parlait du rocher.');
  breaker(2, 3, 'Au moins ici la salle de sport est gratuite.'); breaker(5, 4, 'Mon cousin travaille dans un bureau. Il envie notre air pur.');
  // ---------- étape 1 : clôture, portail, premier baraquement ----------
  const fence = mkGroup(1, 0, 0); const postM = woodDark;
  const side = (x0, z0, x1, z1, gap) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.1); for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (gap && Math.abs(x - gap) < 1.7 && z0 === z1) continue; bx(fence, 0.16, 1.7, 0.16, postM, x, 0.85, z); } const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0); for (const y of [0.7, 1.3]) { const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.06), woodDark); r.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); r.rotation.y = -ang; fence.add(r); } };
  side(-10, -10, 10, -10); side(10, -10, 10, 10); side(10, 10, -10, 10, 0); side(-10, 10, -10, -10);
  const gate = mkGroup(1, 0, 10); bx(gate, 0.3, 3.2, 0.3, woodDark, -1.7, 1.6, 0); bx(gate, 0.3, 3.2, 0.3, woodDark, 1.7, 1.6, 0); bx(gate, 3.7, 0.3, 0.3, woodDark, 0, 3.2, 0);
  const gateTex = texOf(512, 96, (x, w, h) => { x.fillStyle = '#b3262d'; x.fillRect(0, 0, w, h); x.fillStyle = '#f4d56b'; x.font = 'bold 60px Arial'; x.textAlign = 'center'; x.fillText('СЛАВА ТРУДУ!', w / 2, 68); }); const gb = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), new THREE.MeshLambertMaterial({ map: gateTex, side: THREE.DoubleSide })); gb.position.set(0, 2.7, 0.01); gate.add(gb);
  barrack(1, 6.5, -5, 0);
  // ---------- étape 2 : tour de guet, 2ᵉ baraquement, brouettes ----------
  const tower = mkGroup(2, 8.6, 8.4, -0.7); for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) bx(tower, 0.14, 5, 0.14, woodDark, x, 2.5, z); bx(tower, 1.9, 0.14, 1.9, wood, 0, 4.6, 0); bx(tower, 1.9, 0.7, 1.9, lam(0x7a5636), 0, 5.0, 0); const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 4), lam(0x9a2f2f)); roof.position.y = 5.8; roof.rotation.y = 0.78; roof.castShadow = true; tower.add(roof); const rs = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.4, 4), snowM); rs.position.y = 6.1; rs.rotation.y = 0.78; tower.add(rs);
  const spot = new THREE.SpotLight(0xffe9b0, 40, 18, 0.5, 0.6, 1); spot.position.set(8.2, 5.0, 8.0); spot.target.position.set(2, 0, 3); scene.add(spot, spot.target); spot.visible = false; stageObjs[2].push(spot);
  const guardT = person({ hat: 'ushanka', mustache: true, prop: 'binoculars', quip: 'Je surveille la neige. Elle est très suspecte.', state: 'look', scale: 1.2 }); guardT.g.position.set(8.6, 4.75, 8.4); guardT.g.rotation.y = -2.4; guardT.g.visible = false; scene.add(guardT.g); stageObjs[2].push(guardT.g);
  barrack(2, 6.5, -8.4, 0);
  const walker = (stage, o, path, speed, carry) => { const p = person({ ...o, state: 'walk' }); p.path = path.map(a => new THREE.Vector3(a[0], 0, a[1])); p.pi = 0; p.speed = speed; p.g.position.copy(p.path[0]); p.g.visible = false; scene.add(p.g); stageObjs[stage].push(p.g); if (carry === 'barrow') { const b = new THREE.Group(); const t = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.9), lam(0x70757d)); t.position.set(0, 0.55, 1.0); b.add(t); const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10), lam(0x222)); wh.rotation.z = Math.PI / 2; wh.position.set(0, 0.25, 1.4); b.add(wh); for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), lam(0x6f747c)); r.position.set((i - 1) * 0.2, 0.8, 1.0); b.add(r); } p.g.add(b); p.armL.rotation.x = p.armR.rotation.x = -1.0; p.hold = true; } p.carry = carry; return p; };
  walker(2, { hat: 'ushanka', patches: true, quip: 'Je transporte des cailloux. Ils sont de plus en plus lourds quand on y pense.' }, [[-5.5, 5], [2, 5.8], [-5.5, 5]], 1.2, 'barrow'); walker(2, { hat: 'scarf', patches: true, scarf: 0x7a4a6a, quip: 'Le chariot est mieux traité que moi. Il a un manuel d\'entretien.' }, [[-6.5, 3.8], [3, 3.2], [-6.5, 3.8]], 1.0, 'barrow');
  // ---------- étape 3 : cantine ----------
  const canteen = mkGroup(3, -7.5, -6.5, 0.2); bx(canteen, 4.4, 1.9, 2.6, lam(0xc9b89a), 0, 0.95, 0); gabled(canteen, 4.4, 1.3, 2.6, lam(0xc9b89a), lam(0x8c4a3a), 1.9); windows(canteen, 3.4, 1.1, 1.31, 3); bx(canteen, 0.4, 1.4, 0.4, brick, 1.5, 2.6, 0); emitters.push(emitter(new THREE.Vector3(-7.5 + 1.5, 3.4, -6.5), 0xeceff4, 1.1, 1.1));
  const cook = person({ hat: 'scarf', scarf: 0xe9e4d4, apron: true, prop: 'ladle', skin: 0xdcb596, quip: 'Soupe du jour : soupe d\'hier, mais avec plus de caractère.', state: 'stir', scale: 1.3 }); cook.g.position.set(-7.0, 0, -4.8); cook.g.rotation.y = 0.2; cook.g.visible = false; scene.add(cook.g); stageObjs[3].push(cook.g);
  for (let i = 0; i < 4; i++) { const q = person({ hat: i % 2 ? 'ushanka' : 'scarf', scarf: 0x6b7a4b, prop: 'bowl', patches: true, quip: ['Trois heures qu\'on attend la soupe. On a commencé à lui trouver du charme.', 'La cuillère est attachée. Au cas où elle s\'évaderait.', 'Je suis dans la queue pour la queue.', 'Aujourd\'hui c\'est une soupe aux patates. Hier c\'était pareil. Demain aussi. La constance, camarade.'][i], state: 'queue' }); q.g.position.set(-4.5 + i * -0.1 - i * 0.0, 0, -3.3 + i * 0.95); q.g.rotation.y = -2.6; q.g.visible = false; scene.add(q.g); stageObjs[3].push(q.g); q.base = q.g.position.clone(); }
  // ---------- étape 4 : scierie ----------
  const saw = mkGroup(4, 8.5, 3.2, -0.5); bx(saw, 3.6, 0.2, 2.4, lam(0x6b4a2c), 0, 1.0, 0); for (const [x, z] of [[-1.7, -1.1], [1.7, -1.1], [-1.7, 1.1], [1.7, 1.1]]) bx(saw, 0.14, 2.6, 0.14, woodDark, x, 1.3, z); const sroof = bx(saw, 4, 0.14, 2.8, lam(0x4a4f57), 0, 2.7, 0); sroof.rotation.z = 0.08; bx(saw, 4, 0.1, 2.8, snowM, 0, 2.82, 0).rotation.z = 0.08;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0xb7bec7, metalness: 0.8, roughness: 0.3 })); blade.rotation.x = Math.PI / 2; blade.position.set(0, 1.5, 0); saw.add(blade); stageObjs[4].blade = blade;
  for (let i = 0; i < 8; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 8), wood); l.rotation.z = Math.PI / 2; l.position.set(6.5 + (i % 3) * 0.0, 0.25 + Math.floor(i / 3) * 0.45, 6.6 + (i % 3) * 0.5); l.castShadow = true; l.visible = false; scene.add(l); stageObjs[4].push(l); }
  emitters.push(emitter(new THREE.Vector3(8.5, 3.0, 3.2), 0xf0f2f5, 0.8, 0.8));
  walker(4, { hat: 'cap', patches: true, prop: 'thermos', quip: 'Je suis chargé de la sciure. Elle me le rend bien : dans les poumons.' }, [[6.6, 5.4], [8.5, 4.2], [6.6, 5.4]], 0.9);
  // ---------- étape 5 : voie ferrée, wagon, locomotive, camion ----------
  const rail = mkGroup(5, 12.6, 0); for (const x of [-0.5, 0.5]) bx(rail, 0.12, 0.1, 22, lam(0x555a62), x, 0.12, 0); for (let i = 0; i < 40; i++) bx(rail, 1.7, 0.08, 0.2, woodDark, 0, 0.05, -10.5 + i * 0.55);
  const train = new THREE.Group(); train.visible = false; scene.add(train); stageObjs[5].push(train); train.position.set(12.6, 0, -8);
  const loco = bx(train, 1.7, 1.5, 2.8, lam(0x2f3338), 0, 1.0, 0); bx(train, 1.2, 1.0, 1.0, lam(0xb3262d), 0, 2.2, -0.9); const lstack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.0, 10), lam(0x1d1f23)); lstack.position.set(0, 2.3, 0.9); train.add(lstack); const wagon = bx(train, 1.7, 1.2, 3, lam(0x7a4a2e), 0, 0.9, 3.6); for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), lam(0x24262a)); c.position.set((i % 2 - 0.5) * 0.6, 1.6, 2.7 + Math.floor(i / 2) * 0.9); train.add(c); } for (const z of [-0.8, 0.8, 3, 4.2]) for (const x of [-0.85, 0.85]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), lam(0x111)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, z); train.add(w); }
  emitters.push(emitter(train.position.clone().setY(3.3), 0x6b6b6b, 1.6, 1.3)); const trainEm = emitters[emitters.length - 1];
  const truck = new THREE.Group(); truck.visible = false; scene.add(truck); stageObjs[5].push(truck); bx(truck, 1.5, 1.1, 1.4, lam(0x3f5a2f), 0, 0.9, 1.4); bx(truck, 1.6, 0.9, 2.4, lam(0x6a5a3c), 0, 0.95, -0.6); for (const z of [1.5, -1.0]) for (const x of [-0.8, 0.8]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 12), lam(0x111)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); truck.add(w); } truck.position.set(-6, 0, 12.2);
  const poet = person({ hat: 'bare', skin: 0xe0b99a, quip: 'J\'écris un poème sur la neige. Pour changer, il rime.', state: 'write', scale: 1.15, coat: 0x55432f }); poet.g.position.set(-11.4, 0, 3.2); poet.g.rotation.y = 1.3; poet.g.visible = false; scene.add(poet.g); stageObjs[5].push(poet.g);
  // ---------- étape 6 : administration, drapeau, haut-parleur, politicien et commissaire ----------
  const admin = mkGroup(6, 0.5, -8.6); bx(admin, 6.2, 3.6, 3, lam(0xcdbfa0), 0, 1.8, 0); bx(admin, 6.6, 0.3, 3.4, lam(0x6a2a2a), 0, 3.75, 0); bx(admin, 6.2, 0.1, 3.0, snowM, 0, 3.95, 0); windows(admin, 5.2, 2.3, 1.51, 5); windows(admin, 5.2, 0.9, 1.51, 5); bx(admin, 0.9, 1.6, 0.05, woodDark, 0, 0.8, 1.52); for (const x of [-1.2, 1.2]) bx(admin, 0.3, 3.4, 0.3, lam(0xf1ead6), x, 1.7, 1.7);
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.33 : 0.8; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } s.closePath(); return s; })(), { depth: 0.2, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: 0xe3262d })); star.position.set(0, 4.7, 0); admin.add(star);
  const flagpole = mkGroup(6, 4.6, -5.2); bx(flagpole, 0.1, 6, 0.1, lam(0xaaa), 0, 3, 0); const flagGeo = new THREE.PlaneGeometry(2.2, 1.3, 14, 4), flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: 0xc0161d, side: THREE.DoubleSide })); flag.position.set(1.15, 5.2, 0); flagpole.add(flag); stageObjs[6].flag = flag;
  const speaker = mkGroup(6, -2.5, -0.8); bx(speaker, 0.1, 3.4, 0.1, woodDark, 0, 1.7, 0); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 10, 1, true), lam(0x555a62, { side: THREE.DoubleSide })); sp.rotation.z = -Math.PI / 2; sp.position.set(0.3, 3.3, 0); speaker.add(sp);
  const board = mkGroup(6, -3.5, -9.2, 0.1); bx(board, 0.1, 2, 0.1, woodDark, -1, 1, 0); bx(board, 0.1, 2, 0.1, woodDark, 1, 1, 0); const posterTex = texOf(256, 160, (x, w, h) => { x.fillStyle = '#e6d9b2'; x.fillRect(0, 0, w, h); x.fillStyle = '#b3262d'; x.fillRect(0, 0, w, 40); x.fillStyle = '#f4d56b'; x.font = 'bold 28px Arial'; x.textAlign = 'center'; x.fillText('ПЛАН — ЗАКОН', w / 2, 30); x.fillStyle = '#222'; for (let i = 0; i < 5; i++) x.fillRect(24, 60 + i * 18, 150 + (i % 2) * 50, 6); x.fillStyle = '#b3262d'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 26; x.lineTo(210 + Math.cos(a) * r, 100 + Math.sin(a) * r); } x.closePath(); x.fill(); }); const pst = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshLambertMaterial({ map: posterTex, side: THREE.DoubleSide })); pst.position.set(0, 1.5, 0.07); board.add(pst);
  const pol = walker(6, { hat: 'bowler', coat: 0x4a4e57, pants: 0x3c4048, tie: true, glasses: true, shortSleeve: true, patches: true, prop: 'briefcase', skin: 0xe8c9ae, quip: 'Je suis ici par erreur administrative. Elle dure depuis onze ans.', scale: 1.3 }, [[-1.5, -5.6], [3, -6.2], [-1.5, -5.6]], 0.6);
  walker(6, { hat: 'cap', coat: 0x2f3b48, mustache: true, prop: 'notebook', skin: 0xdcb596, quip: 'Je note tout. Surtout ce qui n\'existe pas.', scale: 1.3 }, [[-4, -2], [-4, 3], [-4, -2]], 0.7);
  const spy = person({ hat: 'bowler', coat: 0x6b5a3a, mustache: true, glasses: true, quip: 'Je ne suis pas un espion. Je suis juste très curieux, de façon très professionnelle.', state: 'lurk', scale: 1.2 }); spy.g.position.set(4.4, 0, 0.8); spy.g.rotation.y = 2.3; spy.g.visible = false; scene.add(spy.g); stageObjs[6].push(spy.g);
  const barrel = mkGroup(6, 4.8, 1.4); const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), lam(0x5a4a3a)); bm.position.y = 0.55; bm.castShadow = true; barrel.add(bm);
  // ---------- étape 7 : camp complet ----------
  barrack(7, 6.5, -2, 0); barrack(7, -5.0, -9.2, 0); barrack(7, -9, -0.6, Math.PI / 2);
  const banya = mkGroup(7, -8.6, 2.8, 1.3); bx(banya, 2.6, 1.5, 2.2, lam(0x946c47), 0, 0.75, 0); gabled(banya, 2.6, 0.9, 2.2, lam(0x946c47), lam(0x6a3f2b), 1.5); emitters.push(emitter(new THREE.Vector3(-8.6, 2.6, 2.8), 0xffffff, 2.2, 1.4));
  const infirm = mkGroup(7, -9.2, -4.5, Math.PI / 2); bx(infirm, 3.4, 1.7, 2.2, lam(0xe9e4d4), 0, 0.85, 0); gabled(infirm, 3.4, 1.0, 2.2, lam(0xe9e4d4), lam(0x9aa0a8), 1.7); const cross = bx(infirm, 0.2, 0.7, 0.04, lam(0xc0161d), 0, 1.0, 1.12); bx(infirm, 0.7, 0.2, 0.04, lam(0xc0161d), 0, 1.0, 1.12); cross.position.z = 1.12;
  const theatre = mkGroup(7, -2.5, 7.4, 0.15); bx(theatre, 4.2, 2.4, 2.6, lam(0xd8c6a0), 0, 1.2, 0); bx(theatre, 4.6, 0.3, 3, lam(0x7d1118), 0, 2.55, 0); const thTex = texOf(256, 64, (x, w, h) => { x.fillStyle = '#7d1118'; x.fillRect(0, 0, w, h); x.fillStyle = '#f4d56b'; x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.fillText('КУЛЬТУРА', w / 2, 46); }); const th = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshLambertMaterial({ map: thTex })); th.position.set(0, 2.0, 1.31); theatre.add(th);
  const clock = mkGroup(7, 3, 7.6); bx(clock, 1.1, 4.2, 1.1, lam(0xcdbfa0), 0, 2.1, 0); bx(clock, 1.5, 0.3, 1.5, lam(0x6a2a2a), 0, 4.35, 0); const cf = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0xf6f0dc })); cf.position.set(0, 3.5, 0.56); clock.add(cf); const hand = bx(clock, 0.05, 0.32, 0.02, lam(0x111), 0, 3.55, 0.58); stageObjs[7].hand = hand;
  for (const x of [-12.5, 12.4]) { const c = mkGroup(7, x, 7); const cy = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 9, 12), lam(0x8a8e96)); cy.position.y = 4.5; cy.castShadow = true; c.add(cy); emitters.push(emitter(new THREE.Vector3(x, 9.4, 7), 0x9a9a9a, 1.8, 2)); }
  for (let i = 0; i < 5; i++) { const w = walker(7, { hat: i % 2 ? 'ushanka' : 'cap', patches: true, quip: ['Le camp est magnifique. J\'en parle au passé, il y a un inspecteur derrière moi.', 'Depuis la rénovation, on a un sapin de Noël. En mars.', 'On a même le chauffage, mais seulement dans les rapports.', 'Ici tout est modèle. Moi aussi, c\'est ce qu\'on me dit.', 'Je suis promu : désormais je porte deux pelles au lieu d\'une.'][i] }, [[-6 + i * 3, -1 + (i % 2) * 6], [-3 + i * 3, 5 - (i % 2) * 5], [-6 + i * 3, -1 + (i % 2) * 6]], 0.7 + i * 0.05); }
  const comptable = person({ hat: 'scarf', scarf: 0x4d6a7a, prop: 'abacus', glasses: true, quip: 'Je compte tout, sauf ce qui compte.', state: 'count', scale: 1.2, coat: 0x4a4040 }); comptable.g.position.set(-1.8, 0, -5.8); comptable.g.rotation.y = 0.2; comptable.g.visible = false; scene.add(comptable.g); stageObjs[7].push(comptable.g);
  const doctor = person({ hat: 'cap', coat: 0xe9e4d4, glasses: true, prop: 'scroll', quip: 'Docteur, mais sans médicaments. Je soigne par la pensée positive.', state: 'idle', scale: 1.25 }); doctor.g.position.set(-7.6, 0, -4.5); doctor.g.rotation.y = 1.2; doctor.g.visible = false; scene.add(doctor.g); stageObjs[7].push(doctor.g);

  // ---------- neige et feux d'artifice ----------
  const SN = 400, snowPos = new Float32Array(SN * 3); for (let i = 0; i < SN; i++) { snowPos[i * 3] = (R() - 0.5) * 50; snowPos[i * 3 + 1] = R() * 22; snowPos[i * 3 + 2] = (R() - 0.5) * 50; }
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3)); const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, opacity: 0.85, depthWrite: false })); scene.add(snowPts);
  const FW = 120, fwPos = new Float32Array(FW * 3), fwVel = new Float32Array(FW * 3), fwGeo = new THREE.BufferGeometry(); fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPos, 3)); const fwMat = new THREE.PointsMaterial({ color: 0xffd34d, size: 0.5, transparent: true, opacity: 0, depthWrite: false }); const fw = new THREE.Points(fwGeo, fwMat); fw.frustumCulled = false; scene.add(fw); let fwT = 0;
  const celebrate = () => { fwT = 3; for (let i = 0; i < FW; i++) { const a = R() * 6.283, b = R() * 3.14, s = 3 + R() * 5, cx = (i % 3 - 1) * 6; fwPos[i * 3] = cx; fwPos[i * 3 + 1] = 14; fwPos[i * 3 + 2] = -2; fwVel[i * 3] = Math.cos(a) * Math.sin(b) * s; fwVel[i * 3 + 1] = Math.cos(b) * s; fwVel[i * 3 + 2] = Math.sin(a) * Math.sin(b) * s; } };

  // ---------- état et boucle ----------
  const state = { stage: -1, plan: 0, shown: new Set() };
  const show = (stageIdx, animate) => { for (const o of stageObjs[stageIdx]) { if (o.visible === undefined || state.shown.has(o)) continue; state.shown.add(o); o.visible = true; if (animate && o.scale) { o.userData.growT = 0; grow.push(o); o.scale.setScalar(0.01); } } };
  const sync = ({ stage = 0, plan = 0 } = {}) => {
    const animate = state.stage >= 0;
    if (plan !== state.plan || region < 0) { state.plan = plan; region = plan % REGIONS.length; regionDeco(region); const r = REGIONS[region]; target.sky.setHex(r.sky); target.fog.setHex(r.fog); target.ground.setHex(r.ground); }
    for (let s = 0; s <= stage; s++) show(s, animate && s > state.stage);
    state.stage = Math.max(state.stage, stage);
  };
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let bubbleSprite = null, bubbleT = 0, quipHandler = null;
  const bubbleOf = text => { const t = new THREE.CanvasTexture(canvasOf(512, 192, (x, w, h) => { x.font = 'bold 30px Arial, sans-serif'; const words = text.split(' '), lines = []; let cur = ''; for (const wd of words) { const tt = cur ? cur + ' ' + wd : wd; if (x.measureText(tt).width > 420 && cur) { lines.push(cur); cur = wd; } else cur = tt; } lines.push(cur); const tw = Math.min(w - 12, Math.max(...lines.map(l => x.measureText(l).width)) + 40), bh = 24 + lines.length * 36, bottom = 160, top = bottom - bh; x.fillStyle = 'rgba(247,242,228,0.98)'; x.strokeStyle = '#3a2f26'; x.lineWidth = 4; x.beginPath(); x.roundRect((w - tw) / 2, top, tw, bh, 16); x.fill(); x.stroke(); x.beginPath(); x.moveTo(w / 2 - 12, bottom - 1); x.lineTo(w / 2, 188); x.lineTo(w / 2 + 12, bottom - 1); x.closePath(); x.fill(); x.stroke(); x.fillStyle = '#2a2018'; x.textAlign = 'center'; x.textBaseline = 'middle'; lines.forEach((l, i) => x.fillText(l, w / 2, top + 12 + 18 + i * 36)); })); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); s.scale.set(9, 3.4, 1); s.renderOrder = 10; return s; };
  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(people.filter(p => p.g.visible).map(p => p.g), true); let best = null;
    if (hits.length) { let o = hits[0].object; while (o && !o.userData.person) o = o.parent; best = o?.userData.person; }
    if (best?.quip) { if (bubbleSprite) scene.remove(bubbleSprite); bubbleSprite = bubbleOf(best.quip); bubbleSprite.position.copy(best.g.position).add(new THREE.Vector3(0, 4.2, 0)); scene.add(bubbleSprite); bubbleT = 4; quipHandler?.(best); }
  });
  const clock3 = new THREE.Clock(); let raf = 0, stopped = false;
  const faceTo = (g, dx, dz) => { g.rotation.y = Math.atan2(dx, dz); };
  function tick() {
    if (stopped) return; raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, clock3.getDelta()), t = clock3.elapsedTime;
    scene.background.lerp(target.sky, Math.min(1, dt * 1.2)); scene.fog.color.lerp(target.fog, Math.min(1, dt * 1.2)); groundMat.color.lerp(target.ground, Math.min(1, dt * 1.2));
    camAngle = 0.62 + Math.sin(t * 0.12) * 0.06; placeCam();
    // apparitions
    for (let i = grow.length - 1; i >= 0; i--) { const o = grow[i]; o.userData.growT += dt / 0.8; const k = Math.min(1, o.userData.growT), e = 1 + 0.25 * Math.sin(k * Math.PI) * (1 - k); o.scale.setScalar(Math.max(0.01, k * e)); if (k >= 1) { o.scale.setScalar(1); grow.splice(i, 1); } }
    // feu, lumières
    const fl = 0.8 + Math.sin(t * 17) * 0.12 + Math.sin(t * 5.3) * 0.08; fireLight.intensity = 30 * fl; flames.forEach((f, i) => { f.scale.set(1, 0.8 + Math.sin(t * 9 + i) * 0.2, 1); f.rotation.y = t * 2 + i; });
    if (aurora) { const p = aurora.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.15 + t * 0.7) * 3); p.needsUpdate = true; aurora.material.opacity = 0.7 + Math.sin(t * 0.5) * 0.2; }
    // pièces mobiles
    if (stageObjs[4].blade && stageObjs[4].blade.parent.visible) stageObjs[4].blade.rotation.y += dt * 14;
    if (stageObjs[6].flag) { const p = stageObjs[6].flag.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2.4 - t * 4) * 0.15 * (p.getX(i) + 1.1)); p.needsUpdate = true; }
    if (stageObjs[7].hand) stageObjs[7].hand.rotation.z = -t * 0.4;
    if (train.visible) { train.position.z += (Math.sin(t * 0.12) > 0 ? 1 : -1) * dt * 1.6; train.position.z = Math.max(-9, Math.min(7, train.position.z)); trainEm.pos.set(12.6, 3.3, train.position.z + 0.9); }
    if (truck.visible) { truck.position.x += dt * 2.2 * (Math.sin(t * 0.25) > 0 ? 1 : -1); truck.position.x = Math.max(-8, Math.min(8, truck.position.x)); truck.rotation.y = Math.sin(t * 0.25) > 0 ? Math.PI / 2 : -Math.PI / 2; }
    // fumée
    for (const e of emitters) { e.t -= dt; if (e.t <= 0) { e.t = 1 / e.rate * (0.6 + R() * 0.8); puff(e); } }
    for (const s of puffPool) if (s.userData.life > 0) { s.userData.life -= dt * 0.35; s.position.y += dt * 1.1; s.position.x += dt * 0.35; s.scale.setScalar((0.6 + (1 - s.userData.life) * 2.2) * s.userData.sc); s.material.opacity = Math.max(0, s.userData.life) * 0.6; } else s.material.opacity = 0;
    // éclats
    for (const c of pool) if (c.visible) { c.userData.life -= dt; if (c.userData.life <= 0) { c.visible = false; continue; } c.userData.v.y -= 11 * dt; c.position.addScaledVector(c.userData.v, dt); if (c.position.y < 0.08) { c.position.y = 0.08; c.userData.v.multiplyScalar(0); } c.rotation.x += dt * 6; c.rotation.z += dt * 4; }
    // personnages
    for (const p of people) {
      if (!p.g.visible) continue; p.ph += dt;
      if (p.state === 'break') {
        p.cycle += dt / 1.5; const k = p.cycle % 1, up = k < 0.55 ? Math.sin(k / 0.55 * 1.57) : 1 - (k - 0.55) / 0.45 * 0.0;
        const raise = k < 0.6 ? -0.4 - 2.0 * Math.sin(k / 0.6 * 1.57) : -2.4 + 2.2 * ((k - 0.6) / 0.4) ** 2; p.armR.rotation.x = raise; p.armL.rotation.x = raise * 0.9; p.g.position.y = Math.max(0, Math.sin(Math.min(1, k) * 3.14) * 0.03);
        if (p.hitDone !== Math.floor(p.cycle) && k > 0.95 - 0.0) { p.hitDone = Math.floor(p.cycle); const r = p.rock; r.hits++; r.m.scale.multiplyScalar(0.93); burst(r.m.position.clone().setY(0.7), 4); if (r.hits >= 7) { r.hits = 0; r.m.scale.set(0.2, 0.2, 0.2); r.pop = 0; } }
        const r = p.rock; if (r.pop !== undefined && r.pop < 1) { r.pop += dt * 1.3; const k2 = Math.min(1, r.pop); r.m.scale.set(1.2 * k2, 0.85 * k2, k2); if (k2 >= 1) r.pop = undefined; }
        faceTo(p.g, r.x - p.g.position.x, r.z - p.g.position.z);
      } else if (p.state === 'walk') {
        const tgt = p.path[(p.pi + 1) % p.path.length], dx = tgt.x - p.g.position.x, dz = tgt.z - p.g.position.z, d = Math.hypot(dx, dz);
        if (d < 0.15) { p.pi = (p.pi + 1) % p.path.length; p.wait = 0.8; } else if (!(p.wait > 0)) { p.g.position.x += dx / d * p.speed * dt * 1.4; p.g.position.z += dz / d * p.speed * dt * 1.4; faceTo(p.g, dx, dz); p.legs[0].rotation.x = Math.sin(p.ph * 8 * p.speed) * 0.7; p.legs[1].rotation.x = -p.legs[0].rotation.x; p.g.position.y = Math.abs(Math.sin(p.ph * 8 * p.speed)) * 0.04; if (!p.hold) { p.armL.rotation.x = -p.legs[0].rotation.x * 0.8; p.armR.rotation.x = p.legs[0].rotation.x * 0.8; } } else { p.wait -= dt; p.legs[0].rotation.x = p.legs[1].rotation.x = 0; }
      } else if (p.state === 'queue') { const sh = Math.sin(p.ph * 0.6 + p.base.z) * 0.12; p.g.position.z = p.base.z + sh; p.legs[0].rotation.x = Math.sin(p.ph * 1.2) * 0.1; p.armL.rotation.x = -1.2 + Math.sin(p.ph * 2) * 0.1; p.g.position.y = Math.max(0, Math.sin(p.ph * 12)) * 0.01; }
      else if (p.state === 'stir') { p.armR.rotation.x = -1.2; p.armR.rotation.z = Math.sin(p.ph * 4) * 0.4; }
      else if (p.state === 'look') { p.g.rotation.y = -2.4 + Math.sin(p.ph * 0.5) * 0.9; p.armR.rotation.x = -1.4; }
      else if (p.state === 'write') { p.armL.rotation.x = -0.9; p.armR.rotation.x = -1.1 + Math.sin(p.ph * 9) * 0.15; p.head.rotation.x = 0.2; }
      else if (p.state === 'lurk') { p.g.rotation.y = 2.3 + Math.sin(p.ph * 0.9) * 0.7; p.armR.rotation.x = Math.sin(p.ph * 1.3) > 0.7 ? -1.6 : -0.2; }
      else if (p.state === 'count') { p.armL.rotation.x = -1.1; p.armR.rotation.x = -1.0 + Math.sin(p.ph * 6) * 0.25; }
      else { p.g.position.y = Math.max(0, Math.sin(p.ph * 2)) * 0.01; }
      if (p.head) p.head.rotation.y = Math.sin(p.ph * 0.7) * 0.3;
    }
    // neige
    const sp = snowGeo.attributes.position; for (let i = 0; i < SN; i++) { let y = sp.getY(i) - dt * (1.6 + (i % 5) * 0.2); if (y < 0) y = 22; sp.setY(i, y); sp.setX(i, sp.getX(i) + Math.sin(t * 0.6 + i) * dt * 0.4); } sp.needsUpdate = true;
    // feux d'artifice
    if (fwT > 0) { fwT -= dt; fwMat.opacity = Math.min(1, fwT); for (let i = 0; i < FW; i++) { fwVel[i * 3 + 1] -= 4 * dt; fwPos[i * 3] += fwVel[i * 3] * dt; fwPos[i * 3 + 1] += fwVel[i * 3 + 1] * dt; fwPos[i * 3 + 2] += fwVel[i * 3 + 2] * dt; } fwGeo.attributes.position.needsUpdate = true; fwMat.color.setHex([0xffd34d, 0xff4d3d, 0xffffff][Math.floor(t * 3) % 3]); } else fwMat.opacity = 0;
    if (bubbleSprite) { bubbleT -= dt; if (bubbleT <= 0) { scene.remove(bubbleSprite); bubbleSprite = null; } }
    renderer.render(scene, camera);
  }
  const ro = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h || (w === W && h === H)) return; W = w; H = h; renderer.setSize(W, H, false); fit(); });
  ro.observe(host); sync({ stage: 0, plan: 0 }); tick();
  return {
    sync, celebrate, onQuip: f => { quipHandler = f; },
    stop() { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); canvas.remove(); },
    _debug: { scene, camera, stageObjs, people },
  };
}
