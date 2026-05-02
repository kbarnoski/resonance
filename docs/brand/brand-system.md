# Resonance — Brand System

Single source of truth for all decks and outward-facing surfaces.
Sourced from the live app (`src/app/globals.css`, `src/app/layout.tsx`,
shipped components). When the app evolves, update this file and re-align
the decks.

---

## Logo

The mark is a vertical stem with three branching arcs — readable at any
size, mono-line, fills with currentColor.

- **Logo (mark only)**: [`docs/brand/resonance-logo.svg`](./resonance-logo.svg)
- **Wordmark (mark + "Resonance")**: [`docs/brand/resonance-wordmark.svg`](./resonance-wordmark.svg)

Sizing:
- Smallest legible: 16px tall
- Side nav / header: 24px
- Deck slide: 32–48px
- Hero / cover: 80–120px

Stroke weight is fixed at 1.5px in the SVG; scaling preserves it. Don't
fill the mark — it reads as a stroke shape only.

Color:
- Default: white (`#FAFAFA`) on dark backgrounds
- On hover / accent moments: purple (`#8B5CF6`)

The "⌇" Unicode glyph that the YC deck uses on Slide 01 is **not** the
brand mark. Replace with the SVG when you next touch that deck.

---

## Color

### Background scale

| Token        | Hex       | Use                                                                |
|--------------|-----------|--------------------------------------------------------------------|
| `bg-true`    | `#000000` | The player canvas (`/play`). Pure black, no compromise.            |
| `bg`         | `#0A0A0A` | Off-black for the rest of the app and deck pages.                  |
| `card`       | `#111113` | Cards, panels, raised surfaces.                                    |
| `border`     | `#1E1E22` | Hairlines, dividers, card borders.                                 |

### Text (white at opacities)

| Token   | Hex / value           | Use                                       |
|---------|-----------------------|-------------------------------------------|
| `t-100` | `#FAFAFA`             | Primary text, headings, hero copy.        |
| `t-60`  | `rgba(255,255,255,.6)`| Body, supporting text.                    |
| `t-40`  | `rgba(255,255,255,.4)`| Muted, footers, captions.                 |
| `t-25`  | `rgba(255,255,255,.25)`| Tiny labels, dividers.                   |

### Accent — purple

The single canonical accent, used for emphasis, journey color, links,
section labels.

| Token       | Hex       | Use                                                              |
|-------------|-----------|------------------------------------------------------------------|
| `acc`       | `#8B5CF6` | Primary purple (Tailwind violet-500). Buttons, accents, dots.    |
| `acc-light` | `#C4B5FD` | Soft purple (violet-300). Icons, subtle highlights.              |
| `acc-glow`  | `rgba(139,92,246,.12)` | Glow / tint backgrounds for emphasized blocks.        |

**Do not use** `#7C3AED` (the older deeper violet — appears in
`build-deck.py`) or `#7c5ae0` (the older blue-leaning purple — appears
in `yc-plan.html`). Both are deprecated. Migrate them on next touch.

---

## Typography

Three families, used consistently across app + decks.

### Cormorant Garamond — display / journey
- Weights: 300 (Light), 400 (Regular). Italic variants for accents.
- Use for: hero titles, journey names, brief headings, narrative quotes.
- Tracking: `-0.02em` for large sizes; `0` at body sizes.
- Source: Google Fonts.

### Geist (Sans) — UI body
- Weights: 200, 400, 600, 800.
- Use for: paragraphs, navigation, buttons, all running text.
- Tracking: `0` body, `-0.01em` headings.
- Source: Google Fonts (`next/font/google`).
- Deck substitution: **Inter** is the closest Google-loadable equivalent
  if Geist isn't available in Paper. **Calibri** as a final OS fallback
  for PPTX.

### Geist Mono — labels / codes
- Weight 400.
- Use for: section labels (uppercased), data values, codes, timestamps,
  "by Karel Barnoski" credits.
- Tracking: `0.05em` body, `0.18em` for small all-caps labels.
- Deck substitution: **JetBrains Mono** in HTML, **Consolas** in PPTX.

### Type scale (deck slides at 1440×900)

| Role            | Family             | Size  | Weight | Color | Notes                          |
|-----------------|--------------------|-------|--------|-------|--------------------------------|
| Hero title      | Cormorant Garamond | 88pt  | 300    | t-100 | Italic for accent words.       |
| Slide headline  | Cormorant Garamond | 52pt  | 300    | t-100 | Italic for emphasis fragment.  |
| Subhead         | Cormorant Garamond | 28pt  | 300    | t-60  | Italic, often quote-like.      |
| Body            | Geist              | 16pt  | 400    | t-60  | Line-height ~1.65.             |
| Caption         | Geist              | 13pt  | 400    | t-40  | For footnotes, captions.       |
| Section label   | Geist Mono         | 11pt  | 400    | acc   | All caps, tracking `0.18em`.   |
| Footer / byline | Geist Mono         | 9pt   | 400    | t-25  | Tracking `0.12em`.             |

---

## Layout — deck dimensions

- Canvas: **1440 × 900px** (16:9 widescreen, matches PPTX and HTML viewport).
- Margins: **96px left/right**, **72px top/bottom**.
- Content max width: **1248px**.
- Grid: implicit 12-column at 96px gutters; rarely formal — most slides
  are single-column or 2/3-column.
- Slide spacing pattern (top to bottom):
  1. Section label (24px tall, `t.y = 144`)
  2. Hero/headline block
  3. 24px gap
  4. Body block(s)
  5. Optional rule / spacer
  6. Footer block (`t.y = 828`)

---

## Voice

- **Tone**: confident, plain, considered. Never hype. Never "we believe."
- **Sentence length**: short. Two-clause maximum in headlines.
- **Latinate vs Anglo-Saxon**: prefer Anglo-Saxon ("slow time," "the room")
  over Latinate ("temporal experience," "spatial environment").
- **Italic** for emphasis or quote-like fragments — never bold display.
  Bold is for in-body emphasis only.

---

## Cohesion checklist (apply when touching any deck)

- [ ] Logo is the SVG mark, not "⌇" or any glyph stand-in
- [ ] Purple is `#8B5CF6` everywhere — no `#7C3AED`, no `#7c5ae0`
- [ ] Display type is Cormorant Garamond (not Calibri/Inter for headlines)
- [ ] Section labels are Geist Mono in `acc` purple, all caps, tracked 0.18em
- [ ] Background is `#0A0A0A` for non-player surfaces (`#000` only inside `/play`)
- [ ] Card borders are `#1E1E22` — never pure white at opacity
- [ ] Footer byline matches: `INSTALLATION BRIEF · KAREL BARNOSKI · MAY 2026`
      (or the equivalent context)

---

## Decks currently in the repo

| Deck                              | Status     | Owner format     |
|-----------------------------------|------------|------------------|
| `Resonance-Vision-Deck.pptx`      | Live (YC)  | python-pptx      |
| `Resonance-Installation-Deck.pptx`| Live       | python-pptx      |
| Paper canvas — Vision             | (TBD)      | Paper.app native |
| Paper canvas — Installation       | **In progress** | Paper.app native |

Goal: every deck above derives from this brand system. When values change
here, run a sweep across all decks within a week.
