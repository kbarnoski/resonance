# Resonance — Design System (engineering spec)

The implementation companion to [`brand/brand-system.md`](./brand/brand-system.md).
That file is the *brand* source of truth (logo, voice, deck values). **This**
file is the *runtime* source of truth: the exact tokens, Tailwind classes, and
component recipes that every in-app surface — including the **dream agent**
(`/dream` and its ~550 prototype routes) — must use so the two products read as
one.

> **Prime directive.** A visitor moving between the Resonance app and the dream
> agent must not notice a single seam. Same tokens, same type, same radii, same
> motion, same accent. When in doubt, use a semantic token — never a raw color.

---

## 0. Canonical source of truth

There are two historical expressions of the palette and they had drifted:

| Layer | Where | Form | Status |
|-------|-------|------|--------|
| **Runtime tokens** | `src/app/globals.css` | OKLCH shadcn tokens | **CANONICAL for anything rendered in-app** |
| Brand hex | `docs/brand/brand-system.md` | hex / rgba | Deck-only approximation; keep in sync via the table in §1 |

**Rule:** In `.tsx`/app code, always reference the semantic token
(`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`,
`text-primary`, …). Never hardcode `bg-black`, `text-white/60`,
`border-white/10`, or off-palette Tailwind colors (`amber-*`, `emerald-*`,
`rose-*`, `violet-500`). The theme is dark by default
(`next-themes`, `attribute="class"`, `defaultTheme="dark"` in
`components/providers.tsx`), so tokens already resolve to the dark palette
everywhere.

---

## 1. Color

The app is **dark-first**. Values below are the shipped `.dark` tokens from
`globals.css`, with the deck-hex approximation for reference. Accent hue is
**270 (violet)** throughout — the single brand accent.

### Surfaces

| Semantic token | Tailwind class | OKLCH (`.dark`) | ≈ Deck hex | Use |
|----------------|----------------|-----------------|-----------|-----|
| `background` | `bg-background` | `oklch(0.07 0.005 270)` | `#0A0A0A` | App / chrome backdrop (violet-tinted near-black) |
| `card` | `bg-card` | `oklch(0.10 0.008 270)` | `#111113` | Cards, panels, raised surfaces |
| `popover` | `bg-popover` | `oklch(0.12 0.008 270)` | `#141417` | Popovers, floating menus, the nav pill |
| `secondary` / `muted` | `bg-secondary` `bg-muted` | `oklch(0.14 0.008 270)` | `#161619` | Inset chips, quiet fills |
| `border` | `border-border` | `oklch(1 0 0 / 7%)` | `#1E1E22` | Hairlines, dividers, card borders |
| **pure black** | `bg-black` | `#000000` | `#000000` | **ONLY** inside a full-bleed generative/player canvas (the art itself). Never for chrome. |

### Text (foreground scale)

| Semantic token | Tailwind class | OKLCH (`.dark`) | Use |
|----------------|----------------|-----------------|-----|
| `foreground` | `text-foreground` | `oklch(0.985 0 0)` | Primary text, headings |
| `muted-foreground` | `text-muted-foreground` | `oklch(0.55 0 0)` | Body, supporting, captions |
| — subtle | `text-foreground/60` | — | Only where a token doesn't exist; prefer `muted-foreground` |
| — faint | `text-muted-foreground/70` | — | Tiny labels, timestamps |

### Accent — violet (the only accent)

| Semantic token | Tailwind class | OKLCH (`.dark`) | ≈ Deck hex | Use |
|----------------|----------------|-----------------|-----------|-----|
| `primary` | `bg-primary` `text-primary` | `oklch(0.65 0.25 270)` | `#8B5CF6` | Buttons, active state, links, section labels, focus ring |
| `primary` (soft) | `text-primary/80` | — | `#C4B5FD` | Icons, subtle highlights |
| `ring` | `ring-ring` | `oklch(0.65 0.25 270)` | — | Focus outline (`focus-visible:ring-[3px] ring-ring/50`) |

**Never** introduce a second accent hue. Deprecated: `#7C3AED`, `#7c5ae0`,
raw `violet-500/300/200`.

### Status / semantic colors (dream dashboard, toasts, badges)

The old dream dashboard used ad-hoc `amber` / `emerald` / `rose`. Replace with a
**single documented status ramp** built from the accent + `destructive`, so the
lab never introduces a stray hue:

| Meaning | Token recipe |
|---------|--------------|
| Neutral / skeleton | `bg-muted text-muted-foreground` |
| In progress (wip) | `bg-primary/10 text-primary/90 border border-primary/20` |
| Demoable | `bg-primary/15 text-primary` |
| Polished / done | `bg-primary/20 text-primary border border-primary/30` |
| Local-only ✓ | `bg-primary/10 text-primary/90 border border-primary/20` |
| Needs key 🔑 | `bg-muted text-muted-foreground border border-border` |
| Destructive / error | `bg-destructive/15 text-destructive` |
| "Loved" (admin) | `bg-primary/20 text-primary border border-primary/40` (was rose) |

> Status is expressed by **opacity of the accent**, not by new hues. This is the
> single biggest lever for making the lab feel like Resonance.

---

## 2. Typography

Families load in `src/app/layout.tsx` (`next/font/google`).

| Family | Variable | Role |
|--------|----------|------|
| **Geist Sans** | `--font-geist-sans` / `font-sans` | All UI body, nav, buttons, running text |
| **Geist Mono** | `--font-geist-mono` / `font-mono` | Labels (uppercased), data, codes, timestamps, bylines |
| **Cormorant Garamond** | *(display — see note)* | Journey/hero display only. **Gap:** referenced by the brand system but not currently loaded in `layout.tsx`; if a surface needs display type, load it explicitly — do not fake it with Geist at large sizes. |

Scale (app UI; deck scale lives in the brand doc):

| Role | Class | Weight | Color |
|------|-------|--------|-------|
| Page/section heading | `text-lg`–`text-2xl tracking-tight` | 600 | `text-foreground` |
| Body | `text-sm`–`text-base` | 400 | `text-muted-foreground` |
| Caption | `text-xs` | 400 | `text-muted-foreground` |
| **Section label** | `text-[10px] font-mono uppercase tracking-[0.18em]` | 400 | `text-primary` |
| Byline / footer | `text-[10px] font-mono tracking-[0.12em]` | 400 | `text-muted-foreground/70` |

The dream header eyebrow (`RESONANCE / DREAM`) is a **section label** — mono,
uppercase, tracked `0.18em`, `text-muted-foreground` shifting to `text-primary`
on hover (matches app nav labels).

---

## 3. Radius, spacing, elevation

- **Radius scale** (from `--radius: 0.625rem`): `rounded-md` (default control),
  `rounded-lg` (cards/panels), `rounded-xl`+ (large surfaces), `rounded-full`
  (pills, badges, avatar, the nav strip). Match the primitive — buttons are
  `rounded-md`, badges `rounded-full`.
- **Spacing**: 4px base. Chrome padding: header `px-4 py-3`; cards `p-4`–`p-5`;
  pill `px-1.5 py-1`. Keep the existing rhythm.
- **Elevation**: dark UI leans on **border + subtle backdrop-blur**, not heavy
  shadows. Floating chrome = `border border-border bg-popover/85 backdrop-blur-md`
  (+ `shadow-lg` only for the one floating nav strip). No colored shadows.

---

## 4. Motion

Ties to the standing rule *"transitions must never feel abrupt."*

- Interactive states: `transition-colors` / `transition-all` at the default
  ~150ms; never instant color swaps on hover.
- Reuse the named keyframes already in `globals.css` (poetry, section flash,
  journey intro/fade) — do not invent parallel animations.
- Respect device tier (`device-tier.ts`) and `prefers-reduced-motion`.
- Fades over cuts; ease-in-out; no bounce/overshoot in chrome.

---

## 5. Component recipes (reuse the shipped primitives)

Prefer the real components in `src/components/ui/*` over bespoke markup.

- **Button** — `src/components/ui/button.tsx`. Variants: `default` (primary),
  `secondary`, `outline`, `ghost`, `link`, `destructive`. Sizes `xs…lg`, `icon*`.
  `rounded-md text-sm font-medium`, focus ring built in. Don't hand-roll buttons.
- **Badge** — `src/components/ui/badge.tsx`. `rounded-full px-2 py-0.5 text-xs
  font-medium`. Use for status/category chips with the §1 status recipes.
- **Card** — `src/components/ui/card.tsx`. `bg-card text-card-foreground
  rounded-lg border`. Dashboard prototype tiles = Card.
- **Brand mark** — `src/components/branding/resonance-mark.tsx`
  (`<ResonanceMark />`). The only logo. Never a glyph stand-in.
- **Floating pill / panel** — `rounded-full border border-border bg-popover/85
  backdrop-blur-md`; items are `ghost`/`link` buttons.

---

## 6. Dream Lab consistency rules (the normalization contract)

Every `/dream` surface — layout, `_shared/*`, dashboard, and all ~550
`NNN-*/page.tsx` — must obey:

**Chrome (must be pixel-identical to the app):**
1. Root wrapper: `bg-background text-foreground font-sans` (NOT `bg-black
   text-white`). The theme is already dark.
2. Borders: `border-border` (NOT `border-white/10`).
3. Header eyebrow: section-label recipe (§2).
4. Nav pill: `border-border bg-popover/85 backdrop-blur-md`; links are `ghost`
   buttons; text `text-muted-foreground hover:text-foreground`.
5. Status/category/vote chips: §1 status ramp (accent-opacity, no amber/emerald/
   rose).
6. Any text: `text-foreground` / `text-muted-foreground` (NOT `text-white/xx`).
7. Links/inline code in rendered markdown: `text-primary` (NOT `violet-300`).

**Generative art (each piece keeps its unique form, but shares a palette):**
1. The art canvas MAY use pure `#000000` as its base (it's a full-bleed player
   surface, like `/play`) — this is the *only* sanctioned pure black.
2. Color language binds to the brand: **violet/OKLCH family and analogous
   neighbors** (indigo→magenta arc around hue 270), plus neutral
   grayscale/luminance. **No off-brand accents** — no coral, no amber/gold, no
   full-spectrum rainbow, no green/red as decoration (reserve red for genuine
   error only).
3. Prefer luminance and motion for variety over hue-jumping. Two prototypes
   should feel like two movements of one score, not two different apps.
4. Loading / empty / error states use the chrome tokens, never bespoke colors.

**New prototypes** must start from these rules on day one (see the
`_shared` scaffold).

---

## 7. Cohesion checklist (run when touching any in-app or dream surface)

- [ ] No raw `bg-black`/`text-white*`/`border-white/*` in chrome — tokens only
- [ ] Accent is the `primary` token (hue 270) — no `violet-500`, `#7C3AED`, `#7c5ae0`
- [ ] Status colors come from the §1 accent-opacity ramp — no amber/emerald/rose
- [ ] Borders are `border-border`, never white-at-opacity
- [ ] Section labels: Geist Mono, uppercase, tracked `0.18em`, `text-primary`
- [ ] Buttons/badges/cards use the `ui/*` primitives, not hand-rolled markup
- [ ] Logo is `<ResonanceMark />`, never a glyph
- [ ] Generative art stays within the violet/neutral palette (§6)
- [ ] Transitions are eased, never abrupt; reduced-motion respected
- [ ] Pure black appears only inside a full-bleed art/player canvas

When values change in `globals.css`, update this file and re-sync the deck hex
table in §1 within a week.
