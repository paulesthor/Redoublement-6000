# Layouts & Style Presets

Loaded in Phase 4–5 of SKILL.md. Two parts: **layout patterns** (per-slide structure) and **style presets** (deck-wide visual system). Mix one preset × N layouts.

---

## Part A — 14 Layout Patterns

Each pattern is a `<section class="slide layout-X">` recipe. Use the design tokens from `design-tokens.css`.

### 1. `cover` — Title slide
Hero headline, optional subtitle, thin meta line (date / author). No more.
```html
<section class="slide cover">
  <div class="cover__hero">[Headline assertion, max 12 words]</div>
  <div class="cover__sub">[One-line elaboration]</div>
  <div class="cover__meta">[Author · Date]</div>
</section>
```
Rules: hero uses `--fs-hero`. Background = `--bg`, single accent stripe or a typographic flourish. No logos other than user's brand.

### 2. `section-divider` — Chapter break
Number + section name. Used to break a long deck into 3–5 acts.
```
[01] ── Why now
```
Rules: oversized number in `--muted`, section name in `--fg`. No body text.

### 3. `headline-only` — Single assertion
Just a sentence. Used for the most important slides. Big type, lots of air.
Rules: `--fs-h1` × 1.5, centered vertically, 50%+ whitespace.

### 4. `three-stat-strip` — KPI row
Three numbers across, label under each, optional delta arrow.
```
  72%        $4.1M       2.3×
  retention  ARR run-rate growth YoY
```
Rules: numbers in `--fs-hero`, labels in `--fs-caption` `--muted`. Equal-width columns.

### 5. `quote-hero` — Pull quote
Oversized punctuation, quote in body type, attribution small. Use for customer voice or expert.

### 6. `two-column-compare` — Before/After or A/B
Left column + right column, divider line, headline above. Used for "old way vs new way".
Rules: matched bullet counts (3 each, never 5 vs 2). Left muted, right accent.

### 7. `timeline` — Sequence over time
Horizontal axis, 3–6 milestones, each with date + label + one-line note.
Rules: equal spacing visually even if dates are unequal (label the gap if it matters).

### 8. `process-flow` — Steps with causality
3–5 boxes connected by arrows. Each box: number + verb-led step name.
Rules: do not use mermaid; build with flexbox + SVG arrows for control.

### 9. `2x2-matrix` — Conceptual quadrants
Two axes labeled, four quadrants, one to two items per quadrant.
Rules: axis labels in `--fs-caption`, quadrant items in `--fs-body`. Highlight one quadrant with `--accent`.

### 10. `chart-focus` — Single chart, no other content
The chart fills 70% of the slide. Headline states the conclusion the chart proves.
Rules: strip chartjunk. Show data labels, hide gridlines unless essential. ≤ 2 colors.

### 11. `image-with-caption` — Hero photo or rendering
Full-bleed image left or right, headline + 1-line caption right or left.
Rules: apply duotone or grayscale-with-accent so the photo conforms to the system.

### 12. `data-table-clean` — Comparison table
4–6 columns max, 4–8 rows max. Zebra striping with `--surface`, no vertical lines, header in `--muted` caps.
Rules: highlight one cell with `--accent` to direct the eye.

### 13. `kpi-grid` — Dashboard
2×3 or 3×3 grid of metric tiles. Each tile: number + label + sparkline or delta.
Rules: consistent tile sizing, one accent metric.

### 14. `closing-cta` — Last slide
Replaces "Thank You". Big headline = the ask. One contact line. Optional QR code.
Example: `"Pilot with us in Q3" — andy@example.com`

---

## Part B — 12 Style Presets

Each preset is a complete set of design tokens + layout flavor. Pick one for the entire deck.

### Dark presets

**1. `bold-signal`** — Confident, high-impact
- `--bg: #0B0B0C; --fg: #F5F4F0; --accent: #FF5A1F;`
- Display: Inter 800. Hero text on dark, single bright accent.
- Vibe: YC pitch, product launch.

**2. `electric-studio`** — Clean, professional
- `--bg: #111418; --fg: #E8EBF0; --accent: #4F8CFF;`
- Split-panel layouts dominate (60/40).
- Vibe: enterprise SaaS, B2B.

**3. `creative-voltage`** — Energetic retro-modern
- `--bg: #0A0E27; --fg: #FFE8D6; --accent: #00F0FF; --accent2: #FF2E63;`
- Slight diagonal lines, neon edge glows.
- Vibe: consumer brand, design agency.

**4. `dark-botanical`** — Elegant, sophisticated
- `--bg: #1A1F1B; --fg: #E8E0D0; --accent: #C8956D;`
- Serif display font (Fraunces, Playfair). Muted earth tones.
- Vibe: luxury, hospitality, editorial.

### Light presets

**5. `notebook-tabs`** — Editorial, organized
- `--bg: #FAF8F3; --fg: #1A1A1A; --accent: #2E5BFF;`
- Section dividers as colored paper tabs.
- Vibe: research report, longform.

**6. `pastel-geometry`** — Friendly, approachable
- `--bg: #FFF8F0; --fg: #2D2A26; --accent: #FFB5A7;`
- Vertical pill shapes, soft corners.
- Vibe: HR, education, wellness.

**7. `split-pastel`** — Playful, modern
- Two-color vertical split per slide (e.g., `#FDE2E4` / `#FAF8F3`), text spans both.
- Vibe: lifestyle brand, podcast.

**8. `vintage-editorial`** — Witty, personality-driven
- `--bg: #F2EBDD; --fg: #1B1B1B; --accent: #C8412C;`
- Geometric shape decorations, mixed type weights.
- Vibe: magazine, opinion piece.

### Specialty presets

**9. `neon-cyber`** — Futuristic
- `--bg: #050510; --fg: #C8FFE5; --accent: #FF00AA;`
- Particle background (subtle), neon glow on accents.
- Vibe: crypto, gaming, sci-fi product.

**10. `terminal-green`** — Developer-focused
- `--bg: #0D1117; --fg: #58FF8C;` monospace.
- Code blocks are the hero element. Cursor blink.
- Vibe: dev tools, infra.

**11. `swiss-modern`** — Minimal Bauhaus
- `--bg: #FFFFFF; --fg: #000000; --accent: #FF0000;`
- Helvetica/Inter, rigid grid, primary colors only.
- Vibe: design-led, architecture, premium.

**12. `paper-and-ink`** — Literary
- `--bg: #F4EFE6; --fg: #1F1A14;` serif throughout.
- Drop caps, pull quotes, light texture.
- Vibe: book launch, academic, museum.

---

## "Show, don't tell" preview generation

When the user can't articulate a preference, generate 3 single-slide previews using the same headline ("Q3 Revenue doubled to $4.1M") with three different presets. Present as side-by-side images or three separate HTML files. Ask: **"Which one feels right?"** — not "what colors do you like?". Users react better to finished pixels than to abstract descriptions.
