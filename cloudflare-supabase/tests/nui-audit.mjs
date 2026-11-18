// Audits de mise en forme de la nouvelle interface, exécutés dans la page (Playwright sérialise ces fonctions).
// AUDIT : débordements, textes coupés, recouvrements, hauteurs inégales, zones tactiles, barre du bas. CONTRAST : contraste mesuré sur les pixels réellement affichés.
export const AUDIT = () => {
  const issues = [], W = innerWidth, de = document.documentElement, root = document.querySelector('.nu-sheet') || document.querySelector('#view');
  if (de.scrollWidth > W + 1) { const cul = [...document.querySelectorAll('body *')].filter(e => e.tagName !== 'SCRIPT' && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > W + 1).slice(0, 3).map(e => `${e.tagName}.${String(e.className?.baseVal ?? e.className).slice(0, 24)}`); issues.push(`débordement horizontal de la page (${de.scrollWidth} > ${W}) : ${cul.join(', ')}`); }
  const q = s => [...root.querySelectorAll(s)].filter(e => e.getBoundingClientRect().width > 0);
  for (const e of q('.nu-hello,.nu-hero,.nu-tile,.nu-row,.nu-feat,.nu-sec,.nu-list,.nu-tiles,.nu-search,.nu-btn,.nu-ghost,.nu-link,.nu-back,.nu-evts,.nu-tx,.nu-ft,.pagehead,.nu-title,.nu-opt,.nu-theme,.nu-badge,.nu-grp,.nu-profile,.nu-summary,.nu-seg,.nu-chip,.nu-meta')) {
    const r = e.getBoundingClientRect(), pr = e.parentElement.getBoundingClientRect();
    if (r.left < -0.5 || r.right > W + 0.5) issues.push(`hors écran : ${e.className}`);
    if (r.left < pr.left - 1 || r.right > pr.right + 1) issues.push(`déborde de son conteneur : ${e.className} ${e.textContent.trim().slice(0, 24)}`);
  }
  for (const e of q('.nu-tile b,.nu-tile small,.nu-tx b,.nu-tx small,.nu-ft b,.nu-ft i,.nu-ft small,.nu-ghost,.nu-btn,.nu-hello h2,.pagehead h1,.nu-sec>h3 span,.nu-badge b,.nu-badge small,.nu-grp>summary b,.nu-chip,.nu-meta'))
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) issues.push(`texte coupé : ${e.className || e.tagName} « ${e.textContent.trim().slice(0, 30)} »`);
  const boxes = c => [...c.children].filter(k => { const r = k.getBoundingClientRect(), cs = getComputedStyle(k); return r.width > 0 && r.height > 0 && cs.position !== 'absolute' && cs.position !== 'fixed'; });
  for (const c of [root, ...q('.nu-tiles,.nu-list,.nu-hero,.nu-evts,.nu-links,.nu-two,.nu-sec,.nu-hello,.nu-badges,.nu-themes,.nu-opts,#pe-body,.nu-badge,.nu-theme,.nu-title,.nu-opt,.nu-profile')]) {
    const k = boxes(c);
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 1 && oy > 1) issues.push(`recouvrement : ${k[i].className || k[i].tagName} / ${k[j].className || k[j].tagName}`); }
  }
  for (const g of q('.nu-tiles,.nu-two,.nu-badges,.nu-themes')) { const hs = [...g.children].map(k => Math.round(k.getBoundingClientRect().height)); if (Math.max(...hs) - Math.min(...hs) > 1) issues.push(`hauteurs inégales dans une rangée : ${hs}`); }
  for (const b of q('.nu-tile,.nu-row,.nu-feat,.nu-search,.nu-btn,.nu-ghost,.nu-link,.nu-back,.nu-title,.nu-opt,.nu-theme,.nu-seg button,.nu-grp>summary')) if (b.getBoundingClientRect().height < 43.5) issues.push(`zone tactile trop petite (${Math.round(b.getBoundingClientRect().height)} px) : ${b.className}`);
  for (const e of q('.nu-tile b,.nu-tile small,.nu-tx b,.nu-tx small,.nu-ft small,.nu-ft i,.nu-link,.nu-sec>h3,.nu-badge small,.nu-chip,.nu-meta')) if (parseFloat(getComputedStyle(e).fontSize) < 10.5) issues.push(`texte trop petit : ${e.className}`);
  if (W <= 820 && !document.querySelector('.nu-sheet')) {   // en bas de page, le dernier bloc ne passe pas sous la barre du bas
    scrollTo(0, 1e6); const nav = document.querySelector('aside nav').getBoundingClientRect(), last = [...document.querySelectorAll('#view > *')].filter(e => e.getBoundingClientRect().height > 0 && !e.hidden).pop();
    if (last && last.getBoundingClientRect().bottom > nav.top + 1) issues.push(`le dernier bloc passe sous la barre du bas (${Math.round(last.getBoundingClientRect().bottom)} > ${Math.round(nav.top)})`); scrollTo(0, 0);
  }
  return issues;
};/** Contraste mesuré sur une capture d'écran (PNG en base64, échelle d'affichage `dpr`) : pour chaque texte, couleur de fond = médiane des pixels de sa boîte, couleur du texte = pixel le plus éloigné du fond. */
export const CONTRAST = async ([b64, dpr, sels]) => {
  const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }, lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const out = [], seen = new Set(), navEl = document.querySelector('aside nav'), nav = innerWidth <= 820 && navEl ? navEl.getBoundingClientRect() : null, modalOpen = !document.querySelector('#modal').hidden;
  for (const e of document.querySelectorAll(sels)) {
    if (e.disabled || e.closest('button:disabled') || !(e.textContent || '').trim()) continue;
    const inNav = !!e.closest('aside nav'); if (modalOpen && !e.closest('.nu-sheet, #modal')) continue;   // fenêtre ouverte : on ne mesure que la fenêtre (le reste est assombri)
    const r = e.getBoundingClientRect(); if (nav && !inNav && r.bottom > nav.top + 1) continue;    // texte en partie caché par la barre du bas : pas mesurable if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.top > innerHeight || r.right > innerWidth + 1) continue;
    const x0 = Math.max(0, Math.round(r.left * dpr)), y0 = Math.max(0, Math.round(r.top * dpr)), w = Math.min(img.width - x0, Math.round(r.width * dpr)), h = Math.min(img.height - y0, Math.round(r.height * dpr)); if (w < 4 || h < 4) continue;
    const d = cx.getImageData(x0, y0, w, h).data, L = [];
    for (let i = 0; i < d.length; i += 4 * 3) L.push(lum(d[i], d[i + 1], d[i + 2]));
    const s = [...L].sort((a, b) => a - b), bg = s[s.length >> 1], dev = L.map(v => Math.abs(v - bg)).sort((a, b) => a - b), top = dev[Math.floor(dev.length * 0.985)];
    const tl = L.reduce((best, v) => Math.abs(Math.abs(v - bg) - top) < Math.abs(Math.abs(best - bg) - top) ? v : best, bg);
    const hi = Math.max(bg, tl), lo = Math.min(bg, tl), ratio = (hi + 0.05) / (lo + 0.05);
    const key = (e.className || e.tagName) + '|' + e.textContent.trim().slice(0, 18); if (seen.has(key)) continue; seen.add(key);
    out.push({ ratio: Math.round(ratio * 100) / 100, label: `${e.className || e.tagName} « ${e.textContent.trim().slice(0, 28)} »`, size: parseFloat(getComputedStyle(e).fontSize) });
  }
  return out;
};
export const CONTRAST_SEL = '.nu-tile b,.nu-tile small,.nu-tx b,.nu-tx small,.nu-ft small,.nu-ft b,.nu-ft i,.nu-hello h2,.nu-hello p,.nu-btn,.nu-ghost,.nu-link,.nu-sec>h3 span,.nu-chip,.nu-meta,.nu-badge b,.nu-badge small,.nu-theme b,.nu-theme small,.nu-seg button,.nu-grp>summary b,aside nav em,.pagehead h1,.pagehead p,.nu-back,.nu-summary,.nu-note,.nu-prog';
