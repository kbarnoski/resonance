**For**: kids (4+)

# 🎤 Mouth Band

## Concept
A 4-year-old makes silly mouth noises — **boom, tss, pop, brrr** — into the mic, and a
big goofy cartoon creature *catches* each sound, fires a punchy drum hit instantly, and
records it into a looping groove at a steady ~100 BPM. A few mouth noises become a
repeating beat the kid can bop to. The creature opens wide, bugs its eyes, squashes and
bounces with every hit, and "lip-syncs" to the loop with exaggerated funny faces. One
big **START** button to begin, one big **CLEAR** button to wipe the loop and start over.
No reading needed to play.

## How the mouth-noise classification works
The mic feeds an `AnalyserNode` (analysis only — never recorded, stored, or sent).

1. **Onset detection (energy gate).** Each animation frame we compute RMS of the time-domain
   signal and keep a short history. An onset fires when the current RMS jumps sharply above the
   recent average (`cur > avg*1.8 + 0.02`), clears a noise floor, and respects a ~110ms
   refractory period so one "boom" is one hit. This is the real-time onset approach used for
   beatbox percussion.
2. **Spectral classification (4 buckets).** On each onset we read the frequency spectrum and
   compute the **spectral centroid** plus **low / mid / high band energy fractions**, then map to
   one of four silly drum voices with a simple, robust heuristic:
   - **lots of low energy + clean** → **KICK / "boom"** (punchy synth kick)
   - **low energy + rough mid harmonics** → **BRRR** (comedic buzzy raspberry: low saw + 22 Hz wobble)
   - **high centroid / strong high band** → **HIHAT / "tss"** (short high-passed noise tick)
   - **mid burst (default)** → **SNARE / "pop"/"ka"** (noise + tone)

   A reliable 3–4-bucket classifier beats a fragile one, so the thresholds are tuned wide and
   the mid-burst SNARE is the safe fallback. Each voice has its own bold primary color.
3. **Looping groove.** Hits are quantized into a 16-step loop and replayed by a Chris-Wilson
   look-ahead scheduler (25ms timer, 100ms audio look-ahead) for tight timing. The bottom step
   strip shows the loop visually (colored dots per voice) with a moving playhead — no text needed.

## Named references
- **Incredibox** — beatbox-as-play; the cultural touchstone for a kids vocal-groove toy.
- **Hazan & Stowell, "Delayed Decision-making in Real-time Beatbox Percussion Classification,"
  *Journal of New Music Research* (2010)** — the real-time kick/snare/hihat onset-classification
  approach this prototype's onset+spectral heuristic is modeled on.
- **Mehrabi et al., "A New Dataset for Amateur Vocal Percussion Analysis," *Audio Mostly* 2019
  (the AVP dataset)** — vocal-percussion → drum-class mapping for non-experts (i.e. kids), which
  motivates a forgiving low/mid/high bucket mapping rather than expert-grade classification.

## Tags
- **INPUT**: microphone (live analysis only — never recorded, stored, or transmitted)
- **OUTPUT**: Canvas2D — a bright goofy cartoon mouth-creature
- **TECHNIQUE**: real-time vocal-percussion onset detection + spectral classification → looping groove
- **PALETTE / VIBE**: silly, comedy, bright primary colors (red/yellow/cyan/purple). Made to make a kid laugh.

## Ambition criteria I believe it hits
- **One clear question, fully answered**: yes — mouth noises become a loopable beat with a goofy creature.
- **Instant feedback loop**: every hit fires its synth sound immediately (sub-35ms target, fired
  on the onset frame) and pops the creature within one frame.
- **No fail states / no reading**: all affordances are visual and color-coded; mid-burst SNARE is
  the catch-all so nothing ever reads as "wrong"; no scary or loud transients.
- **Always alive**: an always-on soft ambient bed plays under everything, and an idle auto-demo
  injects ghost hits after 2.5s of silence so a glance at the page is always sounding.

## Kids-safe audio chain
`voices → masterGain(0.28) → lowpass(7.5kHz) → DynamicsCompressor(threshold -10, ratio 20, fast
attack — brick-wall limiter) → destination`. No sudden loud transients, no high-pitched ringing.

## How it degrades
- **Mic denied / unavailable** → a **ghost** auto-beatboxes a silly groove into the loop on its
  own (still funny and grooving), with a friendly `text-rose-300` notice. CLEAR re-arms it.
- **Mic on but idle** → after ~2.5s of silence the creature teases a short auto-demo lick so the
  page never looks dead.
- **Canvas/context not ready** → the render loop no-ops that frame and retries; the ambient bed
  keeps playing regardless.

## Privacy
The microphone is used for **live analysis only**. Audio is never recorded, buffered to storage,
or sent anywhere. There are no network calls and no API routes. The analyser node is intentionally
*not* connected to the audio output (no echo of the child's voice).
