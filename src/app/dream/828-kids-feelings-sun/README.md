# Feelings Sun 🌞

**Route:** `/dream/828-kids-feelings-sun`

## The one question

**What if a 4-year-old could SHAPE the FEELING of a chord — drag one friendly
sun across a feelings-sky and the harmony morphs happy ↔ cozy ↔ floaty ↔ dreamy
— instead of tapping a pre-approved pentatonic scale?**

This is a direct answer to the jury directive that banned the kids lab's
"pentatonic-never-wrong" crutch. Here harmony is *shaped continuously*: the child
controls the emotional quality of a single chord, not which pre-vetted note
fires. Every position is consonant, but the child genuinely steers
bright-vs-dark, open-vs-rich, plain-vs-dreamy.

## How it works

### 2-D affect-field → bilinear chord-quality morph engine (`harmony.ts`)

The sun's normalized position `(fx, fy)` bilinearly blends FOUR chord feelings at
the corners of a Russell-circumplex feelings-sky:

| Corner       | Feeling | Chord quality        |
| ------------ | ------- | -------------------- |
| up-left      | happy   | bright **major** (maj3) |
| down-left    | cozy    | **minor** (min3)     |
| down-right   | floaty  | **sus** (P4)         |
| up-right     | dreamy  | **add9 / maj7** shimmer |

`computeFeeling()` returns the bilinearly-interpolated **third** interval, the
**high added-tone** interval, the added voice's **level**, and the four corner
weights (used to blend sky/glow/face colors too).

### Click-free audio (`audio.ts`)

Kids-safe chain: `master gain ≈0.28 → lowpass ≈7000 → DynamicsCompressor →
destination`, soft ~0.6 s master attack.

- A **root drone** (C3 sine) and a steady **perfect fifth** are ALWAYS present,
  so the pad is always in tune and never silent.
- Two **color voices** glide continuously: the harmonic **third** morphs between
  maj3 / min3 / P4(sus), and a high **added-tone** voice fades in toward the
  dreamy/floaty corners.
- All morphs use `setTargetAtTime` (frequency + gain) — voices are **never
  retriggered**, so the harmony shifts with no clicks or zipper noise.
- A soft, low-gain **bell sparkle** trails the sun as it moves (never piercing).

### Visuals (animated SVG + DOM — no Canvas/WebGL)

- CSS-animated sky gradient (`linear-gradient`) whose top/bottom colors are the
  blended feeling palette; floating **motes** (`<span>` + CSS keyframes).
- The sun is an `<svg>` with `feGaussianBlur` **glow filters**, a radial-gradient
  body, an expressive face (smile + eye-openness morph with feeling), and a
  dreamy shimmer ring whose opacity tracks the added-voice level.
- 60 fps motion is driven by writing CSS custom properties via refs in `rAF`;
  React state updates only ~6 fps for the face/badge.

### Always alive

If untouched for ~1.5 s the sun gently auto-drifts on a slow Lissajous path, so
an unattended phone shows a living, singing screen on load.

## Named references

- **Russell's circumplex model of affect** — valence × arousal as a 2-D feelings
  field (the sky's two axes).
- **Hevner's affective tone/mode associations** — major≈happy, minor≈cozy/sad,
  suspended≈floating, add9/maj7≈dreamy (the four corners).
- Current-register touchstones (light mention): the **Synesthesia "Color to
  Sound" app 2026 AURA mode** (color/scene → multi-voice chord) and the **Sound
  Color Project** (Plutchik emotion-wheel → color → harmony).

## Audio-safety notes

- Master gain ≈0.28, lowpass at 7 kHz, DynamicsCompressor — no piercing highs,
  no sudden loud transients.
- Soft ~50 ms+ attacks; sparkles are quiet sines that ramp in and decay out.
- Always-on ambient pad → never silent. No fail states / nothing is "wrong".
- AudioContext is created/resumed inside the first tap (iOS unlock overlay).
- If Web Audio is unavailable, a friendly `text-rose-300` notice shows and the
  visuals keep running (no throw).

## Known limits

- The morph is a *single tonal center* (C). There is no key change — by design,
  so it is always in tune for an unsupervised toddler.
- Sky-color blending is approximate (linear RGB), so very fast drags can show a
  brief slight desaturation between distant corners.
- The added-tone voice intentionally stays subtle to avoid clutter; on tiny
  phone speakers the dreamy shimmer is felt more than heard.

## Files

- `page.tsx` — client component, route page, interaction + rAF visual loop
- `harmony.ts` — bilinear chord-quality morph engine + color palette
- `audio.ts` — kids-safe Web Audio pad with click-free continuous morph
- `README.md` — this file
