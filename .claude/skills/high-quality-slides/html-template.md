# HTML Deck Template

Loaded in Phase 5. Single self-contained HTML file. No build step, no npm, no external CSS files. CSS lives in `<style>`, JS in `<script>`. Only allowlisted CDN imports: Chart.js, Lucide, Reveal.js (optional). All images either user-provided, base64-inlined, or hot-linked from a license-known source.

---

## Scaffold

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>[Deck Title]</title>
<meta name="viewport" content="width=1920">
<style>
/* Paste design-tokens.css contents here */
:root { /* tokens */ }

/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--fg); font-family: var(--font-text); }

/* Slide canvas — viewport-locked */
.deck { width: 100vw; height: 100vh; overflow: hidden; }
.slide {
  width: var(--slide-w);
  height: var(--slide-h);
  padding: var(--safe-pad);
  display: none;                  /* one slide visible at a time */
  position: relative;
  transform-origin: top left;
  background: var(--bg);
}
.slide.active { display: grid; }

/* Fit-to-window: scale 1920×1080 down to user viewport */
@media (max-width: 1920px) {
  .deck { display: flex; align-items: center; justify-content: center; }
  .slide.active { transform: scale(calc(100vw / 1920)); }
}

/* Typography */
h1, h2, .hero { font-family: var(--font-display); line-height: var(--lh-tight); }
.hero { font-size: var(--fs-hero); font-weight: 800; letter-spacing: -0.03em; }
h1    { font-size: var(--fs-h1); font-weight: 700; letter-spacing: -0.02em; }
h2    { font-size: var(--fs-h2); font-weight: 600; }
p     { font-size: var(--fs-body); line-height: var(--lh-body); max-width: 28ch; }
.caption { font-size: var(--fs-caption); color: var(--muted); }

/* Slide number + nav (subtle) */
.page-num { position: absolute; bottom: 32px; right: 48px; font-size: 16px; color: var(--muted); }

/* --- Layout patterns (excerpt — add per slide as needed) --- */
.layout-cover         { grid-template-rows: 1fr auto auto; align-content: end; gap: 24px; }
.layout-headline-only { place-content: center; text-align: left; }
.layout-three-stat    { grid-template-columns: repeat(3, 1fr); align-content: center; gap: 96px; }
.layout-two-column    { grid-template-columns: 1fr 1px 1fr; gap: 64px; align-content: center; }
.layout-two-column > .divider { background: var(--line); }
.layout-chart-focus   { grid-template-rows: auto 1fr; gap: 32px; }
.layout-image-caption { grid-template-columns: 1.2fr 1fr; gap: 64px; align-items: center; }
.layout-image-caption img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.1); }

/* Stat tile */
.stat .num { font-size: var(--fs-hero); color: var(--accent); font-weight: 800; line-height: 1; }
.stat .label { color: var(--muted); margin-top: 16px; }
</style>
</head>
<body>
<div class="deck">

  <!-- Slide 1: cover -->
  <section class="slide layout-cover active">
    <div></div>
    <h1 class="hero">[Headline assertion]</h1>
    <div>
      <p>[One-line elaboration]</p>
      <p class="caption">[Author · Date]</p>
    </div>
    <span class="page-num">01</span>
  </section>

  <!-- Slide 2: three-stat-strip example -->
  <section class="slide layout-three-stat">
    <div class="stat"><div class="num">72%</div><div class="label">retention</div></div>
    <div class="stat"><div class="num">$4.1M</div><div class="label">ARR run-rate</div></div>
    <div class="stat"><div class="num">2.3×</div><div class="label">growth YoY</div></div>
    <span class="page-num">02</span>
  </section>

  <!-- ...more slides... -->

</div>

<script>
/* Keyboard navigation: ←/→/Space */
const slides = document.querySelectorAll('.slide');
let i = 0;
function go(n) {
  slides[i].classList.remove('active');
  i = Math.max(0, Math.min(slides.length - 1, n));
  slides[i].classList.add('active');
  history.replaceState(null, '', '#' + (i + 1));
}
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === ' ') go(i + 1);
  if (e.key === 'ArrowLeft') go(i - 1);
  if (e.key === 'Home') go(0);
  if (e.key === 'End') go(slides.length - 1);
});
/* Deep-link to #n */
const start = parseInt(location.hash.slice(1), 10);
if (!isNaN(start)) go(start - 1);
</script>
</body>
</html>
```

---

## Rendering charts (inline SVG preferred)

For a single-metric line chart, hand-rolled SVG beats Chart.js:

```html
<svg viewBox="0 0 800 300" width="100%">
  <polyline points="0,260 100,210 200,180 300,140 400,110 500,80 600,40 700,20"
            fill="none" stroke="var(--accent)" stroke-width="4" />
  <!-- end-of-line label -->
  <circle cx="700" cy="20" r="8" fill="var(--accent)" />
  <text x="710" y="24" font-size="20" fill="var(--fg)">$4.1M</text>
</svg>
```

For multi-series charts, use Chart.js but override the defaults:

```js
new Chart(ctx, {
  type: 'bar',
  data: { /* ... */ },
  options: {
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#8C8A85' } },
      y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#8C8A85' } }
    },
    backgroundColor: '#FF5A1F'
  }
});
```

---

## Export

- **PDF** — Chrome → Print → "Save as PDF" → custom paper size 1920×1080px, no margins, background graphics on. Or use Playwright headless.
- **PNG per slide** — Playwright loop with `page.goto('#N')` + `page.screenshot()`.
- **pptx** — re-render via the `pptx` skill using outline + tokens as the spec; rasterize complex SVG to PNG for slide insertion.

---

## What NOT to do

- Don't load Tailwind or any utility CSS framework. Hand-write the rules.
- Don't `position: absolute` everything. Use grid + flex; positioning is for decorative overlays only.
- Don't use `vw`/`vh` units for slide-internal sizing — slides are a fixed 1920×1080 canvas that scales as a whole. Internal sizing is `px` or `rem`.
- Don't ship without keyboard nav and a visible page number — these are table stakes for "looks like a real deck".
