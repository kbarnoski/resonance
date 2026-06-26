# 969 · Kids Hum Choir

**What if a 4-year-old hummed ONE note and a choir of friendly creatures
instantly joined them in REAL harmony — singing the chord that fits, and
leaning into tension then resolving home when the child hums the note that
pulls?**

A kids audio-visual toy where the child's *voice* is the instrument. They hum;
the toy detects their pitch locally, snaps it to a C-major scale degree, builds
the real diatonic triad on it, and a choir of soft glowing creatures sings the
companion voices underneath — with real **tension and resolution** the child
can feel and cause.

Route: `/dream/969-kids-hum-choir`

---

## How to play

1. Tap **Start the choir** (this single tap unlocks the mic *and* the audio —
   nothing makes sound or asks for the mic before it).
2. **Hum a note.** The creatures join you, singing the chord that fits your
   pitch. Slide your hum up and down and they glide with you.
3. **Lean into tension:** hum higher toward **B** (the leading tone) or **G**
   (the dominant). The creatures lean, tighten, and the tension meter fills.
4. **Come home:** drift back down to **C**, **E**, or **G** and the choir
   blooms and resolves warmly — a real V→I you caused with your voice.
5. **No mic?** (mic denied, or on a desktop without one) a row of big friendly
   note buttons **C D E F G A B** appears — tap any note and the choir sings
   that chord. The toy fully works with no microphone.

When you go quiet, the choir keeps breathing on a soft held tonic chord and a
gentle "hum to me…" hint pulses, so it's never dead silent.

---

## Design notes

### Why real functional harmony + voice-leading, not pentatonic

The easy way to make a kids music toy is a **pentatonic** scale: every note
sounds fine against every other, so the child "can't be wrong." But that also
means there is no *pull* — no tension, no resolution, no story. This piece
takes the opposite bet: it uses the full **C-major diatonic** set and real
**functional harmony** so the child can cause genuine tension (lean on the
dominant or leading tone) and genuine release (land home on the tonic). That
felt arc — *away from home, then home* — is the oldest and most satisfying
gesture in tonal music, and a 4-year-old can feel it in their body even without
words for it.

- `harmony.ts` maps the snapped pitch to a scale **degree** (0–6 → C D E F G A
  B) and builds the diatonic triad on it: **I**=C E G, **ii**=D F A, **iii**=E
  G B, **IV**=F A C, **V**=G B D, **vi**=A C E, **vii°**=B D F (stacked thirds
  within the scale).
- The child's own (snapped) note stays the **lead/melody**; three companion
  creature voices are assigned to the *other* triad tones by **voice-leading**
  (`voiceLead`): a greedy minimal-motion mapping that moves each companion to
  the nearest chord tone in its register. That's why the choir *glides* between
  chords as the child slides their hum, instead of jumping — the hallmark of
  good four-part writing.

### How the pitch detection works (and its limits with kid voices)

`pitch.ts` implements the **Normalized Square Difference Function (NSDF)**, the
core of the **McLeod Pitch Method**. NSDF is a normalized autocorrelation: for
each lag it correlates the time-domain mic buffer with a delayed copy of
itself, normalized by the signal energy in the overlap. This gives both a
period estimate *and* a **clarity** score in [0,1]. We:

- gate on **clarity ≥ 0.9** and an RMS loudness floor, so breath, consonants,
  and room noise don't trigger a note;
- restrict to **80–800 Hz** (kid voices skew high) and use McLeod's "earliest
  strong peak" rule + parabolic interpolation to defeat octave errors and get
  sub-sample accuracy;
- **EMA-smooth** the frequency and apply **octave-snap + hysteresis** so a
  wobbly 4-year-old hum reads as a single stable note instead of flickering
  between two scale degrees.

**Limits:** autocorrelation pitch detection is monophonic and assumes a fairly
periodic, tonal signal. A breathy hum, a very noisy room, two kids humming at
once, or a hum that slides constantly will all degrade detection — the toy may
hold the last note or briefly read nothing (it eases to the idle chord). The
tap-a-note row is the always-reliable path.

### How tension and resolution are dramatized

Each degree carries a `tension` scalar (`tensionForDegree`): ~0 on the tonic
(**I**), rising through pre-dominants, **0.85** on the **dominant (V)**, and
**1.0** on the **leading-tone triad (vii°)**. That single scalar drives three
things at once:

- **Sound** (`audio.ts`): tension brightens the upper formant filter and nudges
  level; resolution mellows it. Re-voicing uses **portamento** so voices glide.
- **Visuals**: the creatures **lean** to one side and **sway faster/tighter**
  under tension, and **bloom** (grow, soften) on resolution.
- **HUD**: a "home ←→ tension" meter fills, and the current chord (e.g. `G V`)
  is shown so a grown-up can see the harmony the child is making.

### Audio engineering

Pure Web Audio. Each creature voice is a simple **source-filter "ahh" voice**:
two slightly detuned sawtooth oscillators through two parallel **bandpass
"formant"** filters, with a slow attack, a light **shared vibrato** LFO, and
**portamento** on re-voicing. A synthesized exponential-decay impulse gives a
soft hall **reverb**. Master chain: per-voice gain → master gain (≤ 0.24,
normalized ~1/√voices) → **lowpass ~7 kHz** → **DynamicsCompressor** →
destination. No harsh transients or highs (kid-safe).

The microphone is connected **only** to an `AnalyserNode` for pitch detection —
**never** to the speakers, so there is no feedback howl. Audio is processed
locally and nothing is uploaded.

### Teardown

On Stop / unmount: mic tracks stopped, rAF cancelled, listeners removed, voice
gains faded, oscillators stopped, and the `AudioContext` closed (the dream
zone's shared cleanup also closes any stragglers on navigation).

---

## References

- **Google "Blob Opera"** by **David Li** (with Google Arts & Culture) — the
  friendly singing-blob lineage whose cozy, mouth-opening creatures this piece
  is an homage to.
- **P. McLeod & G. Wyvill, "A Smarter Way to Find Pitch"** (ICMC 2005) — the
  **McLeod Pitch Method** / NSDF that `pitch.ts` implements; and the broader
  tradition of **autocorrelation-based pitch detection**.
- **Aldwell & Schachter, _Harmony and Voice Leading_** — the functional-harmony
  and voice-leading theory behind the diatonic triads and minimal-motion voice
  assignment in `harmony.ts`.

---

## Warts / honest notes

- **Pitch robustness in a noisy room.** The clarity gate is tuned to favor
  *missing* notes over *false* ones, so in a loud room (TV, other voices, fans)
  the choir may under-trigger and sit on the idle chord. The tap row is the
  reliable fallback.
- **Mono only.** Two kids humming at once confuses autocorrelation; it tracks
  one fundamental at a time.
- **Octave wobble.** Very breathy or sliding hums can still occasionally jump an
  octave before the smoother catches it.
- **Voice-leading is greedy, not a full part-writing engine.** It avoids leaps
  and obvious crossings but doesn't enforce every classical rule (no doubled
  leading tones, etc.) — it's tuned for *smooth motion a child can hear*, not
  for a counterpoint exam.
- The lead "melody" note is doubled into the choir body for fullness, so the
  child's exact note is reinforced rather than left thin — a deliberate warmth
  choice over strict three-voice independence.

## Files

- `page.tsx` — the `"use client"` prototype: Start gate, mic pitch loop,
  tap-a-note fallback, Canvas2D choir-creature rendering, HUD, design notes.
- `pitch.ts` — NSDF (McLeod) pitch detection + EMA/octave smoother.
- `harmony.ts` — C-major scale-degree snapping, diatonic triads, voice-leading,
  tension scalar.
- `audio.ts` — the warm Web Audio choir synth.
- `README.md` — this file.
