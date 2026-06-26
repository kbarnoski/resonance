# 952 — Maqam Calligraphy

**Route:** `/dream/952-maqam-calligraphy`

## The one question

> What if Resonance could improvise a living **Arabic maqam taqsim** — a free-meter solo
> that wanders and modulates between maqamat in EXACT microtonal cents (not Western
> 12-TET) over 5+ minutes — and the melody drew itself as a luminous **calligraphic
> line** across a cents-aware field, so you can SEE the quarter-tones sit between the
> piano's cracks?

A taqsim is a single ornamented melodic line over a sustained drone. Pitch is the whole
point: this is deliberately **not** a chord / voice-leading / harmony engine and **not** a
drone-with-texture piece. It is real microtonal melody following its customary path of
development — the **sayr**.

## What this prototype is

- **Adult, contemplative.** Warm ink-and-gold against deep ink-blue; an
  illuminated-manuscript frame. Not cosmic-nebula, not a clinical grid, not kids.
- **Autonomous.** Press *Begin taqsim* and it plays a full, self-developing ~5.5-minute
  solo hands-free. The piece at minute 5 is genuinely different from minute 1 — different
  jins, different register, returning home — because it carries state, it is not a loop.
- **Lightly steerable.** Choose a starting maqam; during play, nudge the next modulation
  toward a chosen maqam or press *rest — head home* to begin the descent early.
- **Always alive.** With no gesture / no audio device it still renders the calligraphic
  field and runs a silent visual demo, with a rose-colored notice.

## Maqam theory implemented (`maqam.ts`)

### Pitch in exact cents

`freq = tonicHz * 2^(cents/1200)`. Tonic is **D ≈ 293.66 Hz**. Every degree is a cents
offset from the tonic; quarter-tones (≈150, ≈350 cents) are first-class and are never
rounded to the 12-TET grid. The visual draws a faint dashed 12-TET ghost grid so you can
see the half-flats fall *between* the semitone lines.

### Ajnas (tetrachords / trichords) — the building blocks

Each jins is a root (cents from tonic) plus an ascending interval set (cents within the
jins). Implemented:

| Jins | Degrees (cents) | Color |
|---|---|---|
| Rast | 0, 200, **350**, 500 | neutral 3rd (half-flat) |
| Bayati | 0, **150**, 300, 500 | neutral 2nd |
| Hijaz | 0, 100, 400, 500 | the augmented-2nd gap 100→400 |
| Nahawand | 0, 200, 300, 500 | minor-ish |
| Kurd | 0, 100, 300, 500 | phrygian-ish |
| Saba | 0, **150**, 300, 400 | lowered/diminished 4th — its uneasy color |
| Ajam | 0, 200, 400, 500 | major tetrachord |
| Sikah (trichord) | 0, **150**, **350** | rooted on the neutral 3rd |

### Maqamat = lower jins on the tonic + upper jins on the ghammaz

The **ghammaz** is the pivot — the 4th (500c) or 5th (700c) — where the upper jins is
rooted. Implemented:

- **Rast**: lower Rast@0 + upper Rast@700 → 0, 200, 350, 500, 700, 900, 1050, 1200
- **Bayati**: lower Bayati@0 + upper Nahawand@500
- **Hijaz**: lower Hijaz@0 + upper Rast@500
- **Saba**: lower Saba@0 + upper Hijaz@300
- **Nahawand**: lower Nahawand@0 + upper Hijaz@700

A small **adjacency map** governs customary modulation:
`Bayati ↔ Rast ↔ Saba ↔ Nahawand ↔ Hijaz`.

### The sayr — the long-form journey (`sayr.ts`)

The heart of the piece is a state machine over a *journey position* `0→1` across ~5.5
minutes, with memory. Stages:

1. **qarar-low** — resting low near the tonic, short phrases in the lower jins
2. **ascent** — climbing, reaching for the ghammaz
3. **ghammaz** — the pivot established, upper jins active
4. **modulation** — a related maqam (from the adjacency map) washes in
5. **peak** — the highest register, maximum tension
6. **descent** — coming home through the modulations
7. **qarar-home** — a long final rest on the tonic

Each stage constrains a **register window** so the line genuinely climbs and returns.
Modulations swap the active maqam (and thus the exact-cents scale), tinting the field. A
visitor nudge biases the next modulation; *rest* collapses the journey toward the descent.

### Taqsim phrase generator (free meter — no click)

Phrases of 3–9 notes pick a target weighted toward characteristic/rest tones, the
neutral half-flats, and the ghammaz; approach it stepwise through the jins' exact-cents
degrees; insert **breaths** (300–1200 ms rests) between phrases on rest tones; use free,
uneven durations (~120–700 ms) with occasional long held "leaning" tones on neutral
degrees.

### Ornaments

- **Portamento / slide** through the microtonal space (oscillator frequency via
  `setTargetAtTime`), especially on neutral tones — rendered visually as a curved sweep.
- **Grace notes** (a quick neighbour before the target) — a small luminous loop.
- **Trill / vibrato** on held tones (~4.5–6 Hz pitch oscillation).
- **Leaning** (slight over/undershoot then settle) on the half-flat degrees — the brush
  hovers and trembles.

## Synthesis approach (`audio.ts`)

No granular synthesis (banned). The melody is a **plucked/struck oud-or-qanun-like tone**:
triangle + saw oscillators through a fast-decaying lowpass envelope (the pluck), plus a
detuned sympathetic partial. Underneath sits a sustained **tanbura drone** — tonic, fifth
(700c), and low octave as slowly-beating detuned sawtooth pairs. Master chain:
`masterGain (≤0.26) → lowpass (~7 kHz) → DynamicsCompressor → destination`. Gentle
fade-ins avoid clicks; nothing is allowed to get harsh.

## The visual (Canvas2D)

A luminous calligraphic line written right-to-left across a cents-aware field:

- deep ink-blue ground with gold margin illumination and an illuminated-manuscript frame;
- a vertical pitch axis in **exact cents** — gold guide-lines at the active jins' exact
  degrees (half-flats glow), with a dim dashed 12-TET ghost grid for contrast;
- the melody as a continuous ink-and-gold brushstroke: vertical position = pitch in cents,
  stroke weight swells with emphasis/duration, the recent past scrolls and fades;
- portamento renders as a smooth arc (never a stair-step); grace/trill become small
  flourishes; the wet "brush tip" glows at the writing edge;
- the active jins tints the stroke and guide-lines; modulations wash a new tint across
  the field; the tanbura drone is a steady gold baseline glow at the tonic and fifth.

Renderer is **Canvas2D only** (no WebGL/three.js). All animation via `requestAnimationFrame`.

## References

- The **Arab maqam** melodic modal tradition (ajnas, maqamat, ghammaz, qarar).
- The **sayr** — the customary path of melodic development and modulation within a maqam.
- **AMICOR — Arab Music Improvisation Corpus**, *Research, Language Resources and
  Evaluation*, 2026.
- The **1932 Cairo Congress of Arab Music**, the landmark gathering that documented and
  debated the tuning, modes, and instruments of Arab music.

## What's unverified (honest note)

This prototype was **built in a container with no audio device — it has not been heard.**
The pitch math, ajnas/maqamat tables, sayr state machine, and ornament scheduling are
implemented as specified and the pure-TypeScript engine modules typecheck cleanly under
`strict`, but:

- the *sound* of the oud/qanun pluck, the tanbura drone balance, and the portamento/trill
  ornaments have not been audited by ear;
- the musical *plausibility* of the generated phrasing and modulations is a best-effort
  model of taqsim practice, not validated against a performer or the AMICOR corpus;
- the exact cents values follow the common pedagogical convention (half-flats at ~150/350)
  rather than any single regional tuning; real practice varies and is often performer- and
  region-dependent.

## Files

- `page.tsx` — the React client component: Canvas2D renderer, UI, autonomous note clock.
- `maqam.ts` — ajnas, maqamat, exact-cents scale construction, adjacency map.
- `sayr.ts` — the long-form journey state machine + free-meter phrase generator.
- `audio.ts` — Web Audio synthesis: pluck voice, tanbura drone, ornaments, master chain.

> Design notes affordance: top-right corner of the page (collapsible) points here.
