# 1314 · Motif Weave

## The one question

**What if the journey REMEMBERED you MUSICALLY — what if every melodic phrase
you played was recorded into a growing library and woven back in later,
transformed, so at minute 6 you literally hear irreversible echoes of the phrase
you played at minute 1?**

A long-form (~6 minute) hypnagogic dream whose defining memory is *musical*. You
perform phrases with a drag; the piece keeps every one forever (within a run)
and re-weaves them into its own evolving score, changed. Each remembered motif is
also a persistent luminous **thread** in a woven light-field — the visual is the
record.

## Living reference

teamLab, **_The World of Irreversible Change_ / _Everything Exists in Infinite
Continuity_ (2026)** — the artwork changes irreversibly with the viewer's
presence; the viewer becomes part of the work's structure. Motif Weave is a
single-performer, musical translation of that idea: your phrases don't trigger a
canned response, they are permanently absorbed into the material the piece is
made of, and the weave you leave behind is different from the one you entered.

## How the MUSICAL irreversible memory works

- **Capture.** A drag is recorded as a **motif** — a sequence of `{pitch index,
  onset in beats, duration, velocity}`. On release, if it has ≥2 notes it is
  pushed into a library that is **never cleared** during a run.
- **Recall.** A rAF-driven beat clock walks the score. On each beat the engine
  may recall an earlier motif and schedule it back into the texture, **transformed**:
  - `gentle` — diatonic transposition (pentatonic index shift, always consonant)
  - `harmonize` — a parallel pentatonic "third" voice above
  - `canon` — a staggered, transposed answer one beat later
  - `reverse` — the contour played backwards
  - `stretch` — time-stretched long (used as the dream dissolves)
- **The min-1 → min-6 promise.** Recall selection is weighted to favour
  rarely-recalled motifs (so the whole library keeps circulating), and in the
  *deepens* / *lucid bloom* phases it sometimes **forces the OLDEST phrase you
  played** to return. The library cap (72) is designed to **never drop your first
  performance** — it sheds old auto-seeds first. So the phrase from minute one
  audibly comes back, changed, minutes later.
- **Irreversible growth.** In lucid bloom a transformed recall can crystallise as
  a new faint "echo" thread — the memory mutates and the weave keeps growing.
  Nothing is undone within a run. (A **Begin again** button starts a clean run.)

## The long-form arc (phases)

| elapsed | phase | tempo | character |
|---|---|---|---|
| 0:00–1:15 | **drifting off** | 52 bpm | sparse; sows idle seed phrases |
| 1:15–2:50 | **the dream deepens** | 63 bpm | recall rises; harmonies appear |
| 2:50–4:45 | **lucid bloom** | 82 bpm | dense canon/reverse/harmony, brightest (the intense pole) |
| 4:45–5:45 | **dissolution** | 57 bpm | time-stretched, thinning |
| 5:45+ | **waking** | 50 bpm | settles; the grown weave persists |

Because the library has grown and the transforms intensify, minute 5 is
genuinely different from minute 1 — it is not a loop.

## Audio design (there is TIME)

- Generative synth, fully client-side, no network. Each note is a triangle +
  detuned sine through a per-note lowpass whose cutoff opens with the phase
  brightness.
- **Audible pulse:** a soft sub root on alternate beats plus off-beat pulses in
  busier phases — the score always has tempo and rhythmic movement, and it
  changes across the arc.
- **Echo:** a feedback delay carries the tails of recalls and canons — memory
  literally echoing.
- **Undertow:** a faint shared Shepard–Risset glissando (`_shared/psych/shepard`)
  under everything, its drive rising with brightness and breath.
- Master ≤ 0.28 with a ~1.2 s fade-in, through a `DynamicsCompressor` limiter,
  and hard voice-count-limited (16) so overlapping recall never clips or runs
  away.

## Self-evidences on a glance

Before you touch anything, the loom already drifts and three idle seed threads
shimmer (silent, because browsers block autoplay). One tap on **Begin** gives it
sound and the seeds start playing and recalling within a couple of seconds — so a
reviewer opening it on a phone immediately gets a living dream, and recall is
demonstrable fast even before playing a note.

## How to play it

1. **Begin · enter the weave** — unlocks audio.
2. **Drag** anywhere: vertical position = pitch. You hear each note instantly.
   Release to commit the phrase to memory; it becomes a bright thread and will
   return, transformed, later.
3. **Add breath (mic)** — optional. Exhale/hum to brighten the dream, lift the
   undertow and summon more remembered threads.
4. Let go entirely and idle seed phrases keep the piece alive.
5. **Begin again** clears the memory for a fresh run.

## Degradation & safety notes

- **No mic → pointer-only.** Denial/absence is caught; breath stays 0 and
  everything else works. Message shown in `text-rose-300`.
- **No pointer needed** to be alive — idle seeds + recall self-drive the piece.
- **Photosensitive-safe:** Canvas2D with smooth continuous luminance drift only,
  no white blowout, no strobe. The optional flicker routes through
  `createSafeFlicker` (≤3 Hz, opt-in, instant kill) and `prefersReducedMotion()`
  is honoured.
- **Full teardown** on unmount: rAF cancelled, Shepard stopped, mic tracks
  stopped, nodes disconnected, `AudioContext.close()`.
- **Bounded:** library capped at 72 motifs, voices capped at 16 — no leak, no
  runaway.

## Files

- `page.tsx` — SSR-safe client shell: canvas, Begin gate, pointer performance,
  mic, HUD, lifecycle.
- `engine.ts` — the musical irreversible-memory engine (library, beat clock,
  arc, transforms, synthesis).
- `weave.ts` — the woven light-field (Canvas2D): one persistent thread per motif.
- `README.md` — this file.
