# 1242 · stretto

**state:** imitative / canonic · **pole:** contemplative
**route:** `/dream/1242-stretto`

## The one question

> What if Resonance could answer your single melodic line with a real **canon** —
> delayed, transposed, inverted imitative voices that chase your line and
> self-adjust to stay consonant — building into a **stretto**, all crystallizing
> into a scrolling score?

This is a deliberate **deepening of `1218-shadow`**. Shadow did *homophonic*
harmonization: block SATB chords voiced under a melody a beat behind. Stretto does
*imitative **polyphony***: every extra voice is a **time-shifted, interval-transposed
(and optionally inverted / augmented) copy of the SAME line** — a canon / fugal
answer, not a chord. That imitation is the whole point.

## How it works (three subsystems, all client-side)

### 1. `canon.ts` — the canon engine

- **Subject / dux.** You draw a monophonic subject on a pitch-lane grid (or hit
  **Generate a subject**, which makes a short modal motif with a clear arch contour
  cadencing on the tonic). Pitches are stored as **diatonic indices** — integers
  where 0 = tonic, 7 = the octave — so every transformation lands on a scale tone.
- **Comes (1–3 answering voices).** Each answer is the same line with: a **delay**
  in beats, a diatonic **interval of imitation** (unison / 4th / 5th / octave),
  and optionally **inversion** (contour mirrored around the subject's first note)
  or **augmentation** (note values doubled — classic augmentation canon, applied to
  the last entering voice). Stacked voices spread by an octave so they don't
  collide. **Stretto** = a short delay (1 beat) with voices piling up.
- **Consonance self-correction — the real intelligence.** Wherever an answer would
  land on a **strong beat** (an on-the-beat onset) as a **hard dissonance** (interval
  class of a semitone, whole tone, tritone or seventh) against the dux sounding at
  that instant, it is nudged to the nearest consonant scale tone (**±1, then ±2
  diatonic steps**). Because the nudge is tiny and stays in key, the canon stays
  euphonious while its **contour is preserved** — the imitation still reads as
  itself. A runtime check (subject `0,2,4,3,5,4,2,0`, canon at the 5th) goes from
  one strong-beat clash with correction off to **zero** with it on, changing exactly
  **one** note by a single diatonic step. Toggle **Consonance fix** off to hear the
  raw clashes return.

### 2. `synth.ts` — synthesis + transport

Two timbre families keep the imitation legible: the **dux** is a bright
**detuned-saw** pair (two sawtooths a few cents apart), the **comes** a softer
**triangle** that sits under it. Each note has an **ADSR** envelope, a gentle
**vibrato** LFO, a per-voice **low-pass** for warmth, and a send into a shared
**feedback-delay reverb**. The master bus is a single gain (**0.24 ≤ 0.26**) into a
`DynamicsCompressor` **limiter**, ramped up from silence on start. A **look-ahead
scheduler** (Chris Wilson, *A Tale of Two Clocks*) peeks ~200 ms ahead on a ~30 ms
timer and commits note-ons onto `audioCtx.currentTime`, **looping** the canon
seamlessly so the staggered entries are always audibly in time.

### 3. `page.tsx` — the scrolling score

A **riso two-colour duotone** (indigo + terracotta on warm cream — deliberately
**not** neon-on-black). The score is a Canvas2D **scrolling piano-roll that
crystallizes into notation**: each note approaches from the right as a soft moving
ribbon on a ruled diatonic staff, then **snaps into a crisp notehead** (with a stem)
as the playhead passes — coloured by voice (dux = solid indigo, answers = terracotta
/ hollow), so you *see* the imitation shifting through time. A small ring above a
notehead marks where the consonance engine nudged an answer. A live label names the
canon type + interval + delay + voice count. The subject editor is a second grid you
tap to draw (each tap previews the pitch). Everything draws on mount (empty ruled
staff + a static preview of the current canon) before any audio.

## Named reference

The **canon / fugal-imitation tradition** — above all **J.S. Bach's canons**: the
*Musical Offering* (BWV 1079) and the *Goldberg Variations* (BWV 988), whose every
third variation is a canon at a successively wider interval (unison through the
ninth), **including canon by inversion and by augmentation**. Also **Fux**, *Gradus
ad Parnassum*, for the consonant/dissonant interval classification the correction
uses, and **Chris Wilson**, *A Tale of Two Clocks*, for the look-ahead scheduler.

## Input (starved)

Primary: **draw a melodic subject** by tapping the pitch-lane grid. Always a
**Generate a subject** button so it demos instantly. Plus canon-type presets,
interval / mode / inversion / augmentation / consonance toggles, and voices / delay /
tempo sliders. **No microphone. No file upload. No network. No server code.**

## Graceful-fallback contract

- **No Web Audio** → a readable notice ("Web Audio is unavailable … but the score
  still draws"); the visuals keep running.
- Audio is **gesture-gated** (first Play / draw), the master gain **ramps from 0**,
  and a limiter caps the bus.
- The score **draws the empty ruled staff and a static canon preview on mount**, so
  it is never a dead screen and never a static page.
- Full teardown (scheduler stop, synth dispose, context close) on unmount.

## Safety

No strobe. The score scrolls as one smooth continuous drift well under 3 Hz;
noteheads set with soft alpha ramps, not flashes.

## Honest edges

- Imitation is **diatonic** (tonal answer), not a real chromatic answer — a canon at
  the 5th shifts by scale steps, so it always stays in the mode.
- The consonance engine checks each answer against the **dux only** (the subject),
  not against the other answers; stacked comes voices move in parallel by
  construction (their shared interval is itself consonant), which is the canonic
  intent, but dense strettos can still let a passing answer-vs-answer colour through.
- Correction fires only on **strong (on-beat) onsets**; off-beat passing dissonances
  are left as musical tension.
