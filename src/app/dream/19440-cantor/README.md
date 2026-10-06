# Cantor — sing with his piano

**Status**: wip — core audio path (voice-pitch → resonator retuning) verified headless; the live mic + camera capture path needs Karel's ~30-second check.

## The one question

What if you could sing *with* one of Karel's recordings — not over it, but
*into* it — so that your sung note made **his piano** resonate at that pitch?

Cantor keeps one of Karel's real takes as the always-audible carrier and uses
your voice as a tuning fork: a bank of resonant filters sits on the recording
and tracks your sung fundamental, lifting the piano's own harmonic energy near
your note out over the dry take. You don't add a tone — you make his piano ring
at the note you sing.

## How it works

- **Carrier (audible):** one real take (default *Bath*) loops untouched. A tap
  of it feeds three resonant `bandpass` filters tuned to your sung fundamental,
  its octave (×2) and its twelfth (×3). Dry + wet both terminate in the shared
  `createSafeMaster` bus. Zero synth, zero oscillator — rule 10.
- **Voice (control-only):** `getUserMedia({audio})` feeds a **dead-end**
  `AnalyserNode` — it is never connected onward, so there is no feedback path to
  the speakers. A **YIN/CMNDF** pitch detector (`pitch.ts`) reads your sung
  fundamental, clarity and loudness every frame. CMNDF (cumulative mean
  normalized difference) suppresses the octave errors plain autocorrelation
  makes — this is the lab's first voice-autocorrelation-as-control.
- **Face (engage gesture):** `createFaceTracker` reads mouth-opening (inner-lip
  gap 13↔14, normalized by face height 10↔152) as the engage gate — closed, the
  resonance recedes to the dry take; wide, it blooms. Head-tilt (eye line
  33↔263) bends the resonance ±1 semitone.
- **Visual:** a three.js column of 28 resonator rings log-spaced in pitch; the
  carrier's spectrum pours jade light through each rung, a bright marker rides to
  your sung pitch, and a field of motes brightens where the energy is. Jade
  palette, near-black room.
- **Degrades:** no mic → a pointer sings (vertical = pitch, horizontal =
  resonance); no camera → the mouth-gate is held open; neither → an autonomous
  demo wanders the column so the piece is alive on load. Every state is labelled
  on the status strip (`tracking · live` / `pointer · sing` / `demo · autonomous`
  / `tracking · lost`).

## Research anchor

YIN (de Cheveigné & Kawahara, 2002) + the CMNDF refinement for robust
low-latency monophonic pitch tracking — the established foundation for
real-time singing-voice pitch detection, chosen deliberately over plain
autocorrelation to avoid octave errors on a sung voice. Pattern:
mic-as-secondary-over-catalog (2026-08-14 music-priority ruling).

## Verification

- **Verified headless:** `pitch.selftest.ts` feeds eight synthetic voice-like
  tones (G2–A5, with harmonics) plus silence and asserts detection within ±25¢
  with clarity > 0.5 — all pass within ±0¢, silence correctly rejected. Run it
  with `npx tsx src/app/dream/19440-cantor/pitch.selftest.ts`.
- **Needs Karel's check (no mic/camera in the cloud):** whether the live mic
  pitch feels immediate while singing, the mouth-gate thresholds
  (`gap` 0.03→0.14) suit a real face, and the wet/dry balance sits the answer
  nicely over the take on headphones. If the bloom feels too eager or too shy,
  it's a one-number change in the `wet.gain` map.

## Next-cycle deepening

- A second voice: harmonize with yourself by holding the last sung pitch as a
  drone while a new resonator tracks the live note.
- Formant-aware resonance: widen the bandpass to a sung vowel's formant cluster
  so the piano "says" your vowel, not just your pitch.
