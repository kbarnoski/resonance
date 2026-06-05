**For**: kids (4+)

# 🌱 Voice Garden

**The one question:** *What if a 4-year-old could GROW a living musical garden with
their VOICE — sing or hum and glowing plants climb toward the sound, blooming
notes — and the garden keeps its real age, so it's taller and a different color
of music every time they come back?*

No reading required. iPad/mobile first. Sing high → light appears high in the
dusk sky → glowing branches race upward and bloom a note. Never silent, never a
fail state, never blasting.

---

## How voice maps to growth

The mic is **analysis-only** (never recorded, stored, played, or sent). Per frame
we read the time-domain signal and extract two numbers (`voice.ts`):

- **Pitch (Hz)** via normalized autocorrelation (octave-jump-tolerant, parabolic
  peak refinement) → maps **WHERE** the light/attractor appears. Higher pitch =
  higher in the sky (log scale, ~110 Hz at the soil to ~700 Hz at the top).
- **RMS loudness** → **how fast** the garden grows and how much light appears
  (more growth budget + brighter attractors).

A held note paints a soft drifting *cloud* of light (gentle x/y jitter), so the
branches fan toward it organically rather than spiking at one dot.

## Space-colonization implementation (the core technique)

`garden.ts` implements the algorithm from **Runions, Lane & Prusinkiewicz (2007),
"Modeling Trees with a Space Colonization Algorithm"** (algorithmicbotany.org) —
the venation/tree-growth method where branch tips grow toward nearby attractor
points and consume them. This is far more alive-looking than a recursive L-system.

Each growth step (`stepPlant`):

1. **Association** — every attractor finds its single closest active node within
   the **influence radius** (`INFLUENCE_R = 230`).
2. **Growth** — each influenced node spawns ONE new node a fixed **step**
   (`STEP = 14`) toward the *averaged, normalized* direction of its attractors.
3. **Consumption** — any attractor within the **kill radius** (`KILL_R = 34`) of a
   tip is removed; that tip **blooms** (and queues a note + flower).
4. Unconsumed attractors slowly decay; growth costs a **budget** accumulated from
   loudness, with hard caps (`MAX_NODES_PER_PLANT`) so it can never explode.

Up to ~9 plants share the bed; a new tap/sung column with no plant nearby sprouts
a fresh seedling.

## Scale & harmonic evolution

- **Scale: D Lydian** (D E F# G# A B C#) over a low D drone — bright, dreamy,
  floating (the raised 4th). Deliberately **NOT** C-major pentatonic (banned this
  cycle). See `audio.ts` (`SCALE_NAME`).
- **Harmonic journey:** a short modal progression *within* D Lydian advances a new
  chord roughly **every 40 s** (I → ii → vi-ish → IV-ish → loop). Each bloom
  plucks a tone of the **current** chord, so blooms heard at minute 5 are in a
  different (related) harmonic color than minute 1. Each chord also carries a
  distinct calm dusk hue (violet/teal/magenta/indigo) that tints new growth and
  flowers.
- **Sound:** an always-on **soft detuned root drone** (with a slow breathing LFO)
  means it's never silent. Each bloom is a **Karplus-Strong** pluck (noise burst
  through a damped feedback delay = a soft string mallet). Higher blooms play
  higher chord tones / up an octave.
- **Safety:** the whole chain is `drone + plucks → generated-impulse Convolver
  reverb (+dry) → master gain ≈0.5 → DynamicsCompressor brick-wall limiter →
  out`. Soft attacks, lowpass damping in the pluck loop (no harsh high ringing),
  no fetched audio files. It can never blast.

## Persistence — real wall-clock age (the ambition centerpiece)

The garden is **genuinely different at minute 5 than at minute 1** (it keeps
growing and the harmony drifts), and it **persists across sessions with real
wall-clock age**:

- Plants are saved to `localStorage` every 5 s and on unmount, with millisecond
  timestamps (`saveGarden`).
- On reopen (`loadGarden` + `runOfflineGrowth`), elapsed real time is converted
  into a *capped* offline growth budget. We seed faint light above the existing
  canopy and run real colonization steps, so **a garden seeded last night is
  fuller this morning** — but capped (`OFFLINE_MAX_BUDGET`, node caps) so it can't
  explode. Offline blooms open silently (no surprise audio on return).
- After ~13 min the session drifts to a soft **lullaby** (master + drone ramp
  down, quieter plucks) — no scolding, just bedtime.

## Graceful degradation (phone-first 06:30 review)

- **Always alive at a glance:** a hands-free **auto-demo** drifts light across the
  sky and grows a plant or two on load, even before any input.
- **Mic denied/unavailable:** a readable `text-rose-300` notice appears AND the
  **touch fallback** stays fully playable — tap the sky (full-screen ≥64px target)
  to plant a small cluster of light. The garden is never blocked.
- **Provenance label:** emerald **"Listening 🎤"** (`text-emerald-300/95`) when the
  mic is live vs amber **"Touch mode ✋"** (`text-amber-300/95`) when not.
- Big Start button (≥200×80) creates/resumes the AudioContext + mic **inside the
  first user gesture** (iOS requirement).

## Rendering & teardown

- **SVG only** (no Canvas2D/WebGL). Dusk gradient sky, moon, deterministic
  starfield, soil. Glowing stems (`<line>`) and blooms (`<circle>`) use
  `feGaussianBlur` + `feMerge` glow filters. The live layers are mutated via a
  single `innerHTML` write per frame through **refs** — the React tree is NOT
  re-rendered each frame.
- **Full teardown on unmount:** cancels `requestAnimationFrame`, clears the save
  interval and label timer, stops all mic tracks, disposes/disconnects audio
  nodes, and closes the AudioContext. No leaks. No API route, fully client-side.

## Files

- `page.tsx` — `"use client"` UI, render loop, voice/touch input, persistence,
  provenance, lullaby.
- `garden.ts` — space-colonization sim + localStorage persistence/offline growth.
- `voice.ts` — analysis-only mic: RMS loudness + autocorrelation pitch.
- `audio.ts` — Web Audio engine: drone, KS plucks, D-Lydian progression, reverb,
  safety limiter.

## Next-cycle deepening (multi-cycle build)

- **Two-voice duet:** harmonize a second child's voice as a counter-plant that
  intertwines; detect intervals and reward thirds/fifths with co-blooms.
- **Seasons & species:** the chord-hue palette and leaf shapes shift with
  multi-day age — a week-old garden grows distinct "species" with fruit that drops
  seeds for new stems.
- **Wind & physics:** gentle attractor wind so the canopy sways with a low-pass of
  the drone; pitch vibrato bends branches.
- **Pollinators:** glowing motes that travel between blooms tracing the melody
  back as a playable phrase.
- **Richer pitch:** swap autocorrelation for an in-code YIN/MPM for steadier
  tracking of soft hums; map timbre (spectral tilt) to flower shape.
