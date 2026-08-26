# Resonance — Design System (engineering spec)

The implementation companion to [`brand/brand-system.md`](./brand/brand-system.md).
That file is the *brand* source of truth (logo, voice, deck values). **This**
file is the *runtime* source of truth: the exact tokens, Tailwind classes, and
component recipes that every in-app surface — including the **dream agent**
(`/dream` and its prototype routes) — must use so the two products read as one.

> **Prime directive.** A visitor moving between the Resonance app and the dream
> agent must not notice a single seam. Same tokens, same type, same radii, same
> motion, same accent. When in doubt, use a semantic token — never a raw value.

All tokens live in `src/app/globals.css`; shared components in
`src/components/ui/`.

---

## 0. Canonical source of truth

| Layer | Where | Form | Status |
|-------|-------|------|--------|
| **Runtime tokens** | `src/app/globals.css` | OKLCH shadcn tokens + motion/ink/void tokens | **CANONICAL for anything rendered in-app** |
| Brand hex | `docs/brand/brand-system.md` | hex / rgba | Deck-only approximation |

---

## 1. Color

Dark-first. Accent hue is **270 (violet)** — the single brand accent.

### The two blacks

| Token | Class | Value | Rule |
|-------|-------|-------|------|
| `--void` | `bg-void` (inline: `var(--void)`) | `#000000` | **Shader/projection/art surfaces**: The Room, journey playback, path pages, installation/kiosk, dream protos — anything a projector shows or a shader draws on. |
| `--background` | `bg-background` | `oklch(0.07 0.005 270)` violet-black | **Chrome**: studio, auth, operator surfaces (root chooser, /remote, /installation/status, 4-operator panels). |

Never hard-code `#000` or `bg-black` — pick the correct token.

### Surfaces (chrome)

| Semantic token | Class | OKLCH (`.dark`) | Use |
|----------------|-------|-----------------|-----|
| `card` | `bg-card` | `oklch(0.10 0.008 270)` | Cards, panels, raised surfaces |
| `popover` | `bg-popover` | `oklch(0.12 0.008 270)` | Popovers, floating menus |
| `secondary` / `muted` | `bg-secondary` `bg-muted` | `oklch(0.14 0.008 270)` | Inset chips, quiet fills |
| `border` | `border-border` | `oklch(1 0 0 / 7%)` | Hairlines, dividers |

### Ink ladder (text on dark/void surfaces)

| Token | Class | Value | Use |
|-------|-------|-------|-----|
| `--color-ink` | `text-ink` | white 85% | Primary readable text |
| `--color-ink-mute` | `text-ink-mute` | white 60% | Secondary text, labels |
| `--color-ink-faint` | `text-ink-faint` | white 45% | **The readable-text floor** |

- **No readable text below 45% alpha.** `/20–/35` white alphas are reserved
  for borders, hairlines, rules, decorative dots/marks, and disabled-state
  text.
- **Type-size floor: 11px / 0.68rem** for anything meant to be read. Below
  that only for purely decorative marks (e.g. the dim build-identity footer).
- On token-based chrome (studio), `text-foreground` / `text-muted-foreground`
  remain correct; the ink ladder is the equivalent scale for glass/void
  surfaces.

### Accent — violet (the only accent)

`primary` = `oklch(0.65 0.25 270)` (`bg-primary`, `text-primary`,
`ring-ring`). Never introduce a second accent hue. Operator surfaces
differentiate via a **single-hue violet ladder** (violet-200…500 / primary
alphas) + white-alpha steps — no rainbows.

### Status colors (operator surfaces, dots, badges)

| Meaning | Recipe |
|---------|--------|
| Healthy / online | `bg-emerald-500` |
| Warning | `bg-amber-500` |
| Error / offline | `bg-destructive` / `text-destructive` |

Always with `transition-colors duration-fast` — status flips never snap.
For dream-lab chrome chips, prefer the accent-opacity ramp
(`bg-primary/10..20 text-primary` steps) over new hues.

---

## 2. Motion tokens

| Token | Value | Utility | Use for |
|---|---|---|---|
| `--duration-instant` | 150ms | `duration-instant` | Hover/focus color + opacity feedback. The interaction floor. |
| `--duration-fast` | 250ms | `duration-fast` | Small reveals, toggles, chips, chevron rotations, status-dot flips. |
| `--duration-surface` | 400ms | `duration-surface` | Panels, overlays, scrims, drawers, dialogs. |
| `--duration-scene` | 2500ms | `duration-scene` | Scene-level art crossfades (matches the shader clock). |

| Easing | Value | Utility |
|---|---|---|
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | `ease-enter` — decelerating entrance (the app's proven curve) |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` | `ease-exit` — accelerating exit |

Notes:
- Tailwind v4 has no `--duration-*` theme namespace; the duration utilities
  are `@utility` definitions in globals.css over `:root` vars. In inline
  styles use `var(--duration-instant)` etc. — never raw millisecond literals.
- `duration-75` / `duration-100` are **retired**. Do not reintroduce them.
- 500ms+ raw values are allowed only for intentional surface-level fades
  (e.g. the Room control bar's visibility fade).

### "Never abrupt" — enforcement rules

1. Every visible state change animates: color, opacity, background, border,
   status dots — minimum `transition-colors duration-instant`. Never
   `transition-all` on interactive elements; target the animating properties.
2. Panels/overlays enter on `duration-surface` `ease-enter`, exit with
   `ease-exit`. No modal may pop with zero transition.
3. Scene/art transitions run at `duration-scene` or on their own approved
   choreography clocks (below). Interface motion never competes with art
   motion.
4. **Choreographed art timings are law — never re-tokenize or change them**:
   the 2.5s shader crossfades, 3s journey intro/outro fades, the installation
   1200–3800ms fade ladder, the 320ms journey-selector fade, the Ghost flash
   timings. They live in JS (rAF/timeouts) or bespoke CSS and are the art
   layer, not the interface layer.
5. `prefers-reduced-motion: reduce` collapses the token ladder and makes CSS
   keyframe choreography effectively instant (handled globally in
   globals.css). JS/rAF shader crossfades are deliberately not gated — they
   are the artwork itself.

---

## 3. Glass dialect (the canonical look)

White-alpha on black is the product's signature look and is **owned by the
shared primitives** — not hand-rolled per surface:

- `<Button variant="glass">` — `rounded-lg`, `border-white/[0.08]`,
  `bg-white/[0.04]`, hover `bg-white/[0.08]`, `text-ink-mute` → hover
  `text-ink`, violet focus-visible ring, motion tokens baked in.
- `<Button variant="glassIcon">` — same dialect, guaranteed **min 44px**
  touch target for icon-only buttons.
- `<Input variant="glass">` — same border/fill, `placeholder:text-ink-faint`.
- Selected/open state convention: `border-transparent bg-white/15 text-white`.
- Bar-height pills override sizing with
  `h-auto gap-1.5 px-3 py-2 font-mono text-[0.72rem] font-normal`
  (see `GLASS_PILL` in `visualizer.tsx`).
- Icons inside `<Button>` must use `size-N` classes (the base auto-sizes
  unsized svgs to `size-4`).

Legacy `border: 1px solid rgba(255,255,255,0.1)` buttons should migrate to
the variants whenever a surface is touched. On studio chrome, the standard
shadcn variants (`default`, `outline`, `ghost`, …) remain correct.

---

## 4. Typography

| Family | Variable | Role |
|--------|----------|------|
| **Geist Sans** | `--font-geist-sans` / `font-sans` | UI body, nav, buttons, running text |
| **Geist Mono** | `--font-geist-mono` / `font-mono` | Labels (uppercase), data, timestamps, bylines |
| **Cormorant Garamond** | self-hosted `@font-face` in globals.css (offline-safe for the kiosk) | Display voice — journey/path/installation heroes |

### Voice components (`src/components/ui/typography.tsx`)

| Component | Voice | Defaults |
|---|---|---|
| `<Eyebrow>` | mono uppercase kicker | 0.68rem, `tracking-[0.18em]`, `text-ink-mute` |
| `<DisplayTitle>` | Cormorant Garamond italic 300 display | `clamp(2.4rem,7vw,4rem)`, `leading-[1.05]`, `tracking-[0.02em]`, `text-ink` |
| `<MonoLabel>` | small mono label/metadata | 0.72rem, `tracking-[0.05em]`, `text-ink-mute` |

All three accept `as`, `className`, `style`; overrides merge via
tailwind-merge. Migrations are **extractions, not redesigns** — call sites
override tracking/size/weight/color to keep rendered output identical (e.g.
`not-italic` heroes, `tracking-[0.22em]` eyebrows, gradient-filled titles via
`style`). Do not hand-roll inline Cormorant/mono voice styles in new work.

---

## 5. Radius, focus, selection, scrollbars, touch

**Radius** (from `--radius: 0.625rem`):
- Cards / panels: `rounded-xl`
- Glass controls (buttons, inputs, pills-with-text on void surfaces): `rounded-lg`
- Studio/form controls via shadcn primitives: `rounded-md` (their default)
- Pills / dots / badges / avatars: `rounded-full`
- Segmented controls: radius on the **wrapper** (`rounded-lg overflow-hidden`),
  `rounded-none` inner segments — never hand-tuned inner radii like
  `rounded-[7px]`.

**Focus**: shared Button/Input carry
`focus-visible:ring-[3px] focus-visible:ring-ring/50` (violet). Raw elements
inherit a violet outline from the global `outline-ring/50`; never add
`outline-none` without providing a focus-visible ring.

**Selection**: global `::selection` is brand violet at ~28% alpha with
near-white text (globals.css).

**Scrollbars**: `scrollbar-thin` is a real utility — thin, white/15 thumb
(white/25 hover), transparent track. Use on any scrolling glass panel.

**Touch**: 44px minimum effective target on touch surfaces
(`min-h-11 min-w-11` or padding); `env(safe-area-inset-*)` padding on
edge-to-edge mobile surfaces (/remote, the Room mobile bar).

**Skeletons**: one language — quiet static blocks (`bg-white/[0.04]`,
`rounded-xl`), no shimmer/pulse.

---

## 6. Dream Lab consistency rules (the normalization contract)

Every `/dream` surface — layout, `_shared/*`, dashboard, new prototypes —
must obey:

**Chrome:**
1. Root wrapper: `bg-background text-foreground font-sans` for dashboard
   chrome; `bg-void` only for full-bleed art canvases.
2. Borders: `border-border` on chrome; `border-white/[0.08]` inside the glass
   dialect on void surfaces.
3. Header eyebrow: `<Eyebrow>`; labels: `<MonoLabel>`; heroes:
   `<DisplayTitle>`.
4. Status/category/vote chips: accent-opacity ramp — no amber/emerald/rose
   decoration (emerald/amber/destructive are reserved for genuine
   health/warning/error semantics).
5. Controls: `<Button>` variants (`glass`/`glassIcon` on art surfaces),
   never bespoke one-off button styles per proto.

**Generative art** (each piece keeps its unique form, shared palette):
1. The art canvas MAY use pure black — that's what `bg-void` is for.
2. Color language binds to the brand: violet/OKLCH family and analogous
   neighbors (indigo→magenta arc around hue 270) + neutral luminance. No
   off-brand accents; no full-spectrum rainbow; red only for genuine error.
3. Prefer luminance and motion for variety over hue-jumping.
4. Loading/empty/error states use the chrome tokens.

### For the dream agent (quick contract)

1. **Use the tokens**: `duration-instant/fast/surface/scene`,
   `ease-enter/ease-exit`, `text-ink/-mute/-faint`, `bg-void`. Never
   `duration-75`, never raw `#000` classnames, never readable text below
   white/45 or 11px.
2. **Never abrupt** (§2 rules): every visible state change transitions;
   entrances decelerate, exits accelerate; overlays on `duration-surface`.
3. **Glass is the language**: `<Button variant="glass" | "glassIcon">`,
   `<Input variant="glass">` on black.
4. **Three type voices**: `<Eyebrow>` / `<DisplayTitle>` / `<MonoLabel>`
   from `@/components/ui/typography`.
5. **Radius**: cards `xl`, glass controls `lg`, pills `full`.
6. **Respect reduced motion** for interface chrome; the shader/canvas art
   layer is exempt.
7. Existing numbered protos are immutable — these rules apply to new cycles
   and `/dream` chrome only.

---

## 7. Cohesion checklist (run when touching any surface)

- [ ] Blacks are tokens: `bg-void` for art/projection, `bg-background` for chrome — never `bg-black`/raw `#000`
- [ ] Durations are tokens (`duration-instant/fast/surface/scene`); no `duration-75/100`, no raw ms in inline styles
- [ ] No `transition-all` on interactive elements — targeted properties only
- [ ] Readable text ≥ white/45 (`text-ink-faint` floor) and ≥ 11px/0.68rem
- [ ] Accent is the `primary` token (hue 270); operator differentiation via the violet ladder, no rainbows
- [ ] Status dots emerald/amber/destructive with `transition-colors duration-fast`
- [ ] Glass surfaces use `Button glass/glassIcon` + `Input glass`, selected state `bg-white/15`
- [ ] Display/eyebrow/label text uses the typography components, not inline Cormorant/mono styles
- [ ] Radius: cards `xl`, glass controls `lg`, pills `full`; segmented = wrapper radius + `overflow-hidden`
- [ ] Focus-visible ring (violet) present on every interactive element; no bare `outline-none`
- [ ] 44px touch targets; safe-area insets on edge-to-edge mobile surfaces
- [ ] Choreographed art timings (2.5s/3s/320ms/fade ladder/Ghost) untouched
- [ ] `prefers-reduced-motion` respected for chrome (global handling in globals.css)

When values change in `globals.css`, update this file.
