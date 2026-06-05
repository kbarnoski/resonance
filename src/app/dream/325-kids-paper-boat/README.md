**For**: kids (4+)

# 325 · Paper Boat — a long, remembered river voyage

**One-sentence pitch:** A glowing paper boat drifts down a gently scrolling
night river from dusk to dawn while the music slowly evolves through a real
harmonic arc — and at the river's mouth the voyage *sings your path back to you*.

This is the dream lab's first **long-form, stateful, persistent KIDS** piece:
not a short looping toy, but a 6–12 minute *voyage* that remembers where you've
been and resumes when you come back.

---

## How to play (no reading required)

- Tap **▶ Begin the voyage**.
- The river scrolls forward by itself — you're always moving toward dawn.
- **Drag the paper boat** anywhere across the river (left↔right and up↔down).
  The boat is a big, glowing drag handle and follows your finger instantly.
- Steer the boat **into the glowing lily-pads** — each one *sings* a note when
  you glide through it.
- **Up/down** picks which lane you're in: each of the four lanes is a different
  register/timbre (low warm tones near the bottom, bright bell-like tones near
  the top). **Left/right** opens or closes the chord voicing under everything.
- Drift toward a bank and the music **thins out**; stay mid-river and it's
  **full**. There is **no way to crash and nothing is ever "wrong"** — every
  note is quantized to the current musical mode.
- When you reach **dawn / home**, the river slows and the voyage **plays your
  remembered path back** as a soft lullaby. A glowing **☀ Begin a new voyage**
  button lets you set off again.

Affordances are entirely visual (the boat, the glowing pads, the warm dawn
button). All text is labels only — it never gates play.

---

## The harmonic-arc design

The voyage is **not** C-major pentatonic. It's a **D-rooted modal journey**
that moves through four acts as time elapses (see `audio.ts → ACTS`):

| Act | Feel | Root / chord | Mode | Hue |
| --- | --- | --- | --- | --- |
| Departure | *dusk* | Dm7 (D) | D **Dorian** | indigo/violet |
| River | *deep night* | Fmaj7 (F) | F **Lydian** | deep night blue |
| Rapids | *before dawn* | C7 (C) | C **Mixolydian** | pre-dawn magenta |
| Home | *dawn · home* | Dmaj7 (D) | D major (pentatonic-soft) | dawn amber |

Because each act has its own chord, mode, and hue, **minute 6 sounds and looks
genuinely different from minute 1**, and the home chord *resolves* the journey.

- An **evolving chord pad** (a small bank of oscillators) is retuned per act and
  re-voiced continuously by the boat's lateral position (`steer`/`setAct`).
- **Gate chimes** are quantized to the current act's scale, so passing any
  lily-pad always lands in key. The lane chooses the **register + timbre**.
- The sky/water **hue and darkness** are interpolated smoothly across the arc
  (`hueAtProgress`, `darknessAtProgress`): dusk → deepest night near the middle
  → warm dawn at the mouth.

## The memory & persistence design

- Every gate you pass is recorded as a `MemoryNote { t, midi, lane, act }` in the
  voyage's `path` (`voyage.ts`).
- At the river's mouth, **`playReplay()`** sings the last ~24 remembered notes
  back as a gentle melody over the resolving home chord — the voyage literally
  recounts the path *you* steered.
- The whole `VoyageState` (`startedAt`, `elapsedMs`, `path`, `finished`) is
  **persisted to `localStorage`** on a 3-second wall-clock interval and on
  unmount. Reopening offers **↻ Continue your river**, which resumes the elapsed
  position, act, and remembered path. The memory is capped (~400 gates) so
  storage stays tiny.

---

## Renderer & safety

- **Inline SVG with parallax layers** — stars (slowest), far hills (medium),
  near reeds (fastest), plus the water, gates, and boat. A single `rAF` loop
  mutates SVG attributes / one `innerHTML` for the gate layer per frame; the
  React tree is **not** re-rendered each frame. No Canvas2D, no three.js, no
  full-screen WebGL shader.
- **Web Audio** with a kid-safe master chain: master gain `0.5` → brick-wall
  `DynamicsCompressor` limiter → destination. A **synthesized convolver reverb**
  impulse (decaying noise, no audio files). Gentle attacks via
  `setTargetAtTime` / short ramps, so there are no clicks or harsh transients.
- An **always-on filtered-noise water/wind pad** (with a slow LFO) means it
  never feels broken, even before you touch anything.
- **Degrades gracefully:** if `AudioContext` is unavailable the page shows a
  readable `text-rose-300` notice and never blanks or throws. AudioContext is
  created/resumed **inside the Start tap** (iOS autoplay-safe).
- **Full teardown on unmount:** cancels rAF, clears the save + replay timers,
  saves final state, stops/disconnects all audio nodes, and closes the
  AudioContext.

---

## Named references

- **Joseph Campbell's monomyth** — the voyage's three-act shape
  (*departure → initiation → return*) maps onto dusk → deep night → dawn/home,
  with the home chord as the hero's resolved return.
- **Resonance's own multi-phase journey engine**, reimagined for a 4-year-old:
  an evolving, phase-based musical arc steered by a single, forgiving gesture.
- **The 2026 adaptive / generative game-music frontier** — procedural
  soundtracks that evolve across a player's journey and never fully repeat;
  here the harmony advances with elapsed time and the lane voicing + remembered
  path mean two voyages never sound the same.

## Tags

- **INPUT** = touch (drag-to-steer)
- **OUTPUT** = inline SVG with parallax layers (NOT Canvas2D, NOT three.js, NOT a full-screen WebGL fragment shader)
- **TECHNIQUE** = long-form auto-scrolling voyage with a harmonic-arc state machine + lane-voicing + path memory/replay + wall-clock persistence
- **PALETTE** = contemplative dusk → night → dawn river voyage

---

## What's unverified / honest notes

- **Not run in a live browser here.** Logic, types, and the audio graph were
  written and reviewed statically; `node_modules` wasn't installed in the build
  sandbox, so I could not execute `tsc`/`next dev`. The only TS errors seen were
  environmental (missing `react`/JSX libs), not logic errors.
- **Long-form timing is theoretical.** `VOYAGE_MS` is set to 12 minutes; the
  full dusk→dawn pacing, including how "interesting" the middle minutes feel,
  hasn't been play-tested end-to-end. Act boundaries are proportional so a short
  demo still crosses real harmonic territory, but the *felt* long-form arc needs
  real listening.
- **Resume mapping is approximate.** On "Continue your river," world-scroll is
  re-derived from elapsed time (a heuristic), so the exact gate layout differs
  from the original session — the *music/act/memory* resume faithfully, the
  scenery does not reproduce gate-for-gate.
- **Voice/CPU budget unprofiled.** Chimes are short-lived and cleaned up on
  `onended`, but rapid back-and-forth dragging across many gates hasn't been
  profiled on a low-end tablet.
- **Reverb/limiter levels** are conservative but tuned by ear-on-paper, not
  metered; worth a loudness check on real hardware.
