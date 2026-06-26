**For**: kids (4+), on an iPad or phone.

## The one question

**What if a child SANG any note and a real harmonic garden grew a chord that genuinely SUPPORTS it — no wrong notes, but REAL functional harmony underneath, not a safe pentatonic?**

The child's voice is always "in tune" (we snap it to a scale), but underneath, a genuine three-voice + bass accompaniment voice-leads to support whatever they sing — including real ii→V→I motion and leading-tone resolution. The harmony BENDS to the child, instead of marking the child wrong.

## How to play

1. Tap the big **Start singing** button (gesture-gates audio + asks for the mic).
2. Within ~1 second, a **hands-free auto-demo** sings a short phrase that ends on a real cadence (`…7 → 1`), so even a glance with zero interaction both *sees* the garden grow and *hears* tension resolve.
3. Then just **sing**. Any vowel. Singing higher grows a tall plant; lower grows a low, spreading one. Each note blooms a flower whose color tells you the chord's function.
4. Sing **5 then 1**, or land on and hold the **leading tone (7)** then drop to **1**, to hear a real **V→I cadence** — the warm gold halo and ripple mean "home."
5. No mic? A `text-rose-300` notice appears and the **seven colored sing-pads** (one per scale degree, color = harmonic function) play through the *identical* accompaniment pipeline when tapped.

The voice is **never recorded, never stored, never transmitted** — pitch is detected from the live analyser buffer in place and thrown away every frame. Fully offline, no API route.

## Tag breakdown

- **input = mic / live voice pitch detection.** `getUserMedia({audio:true})` gated behind the Start tap → `AnalyserNode` time-domain Float32 buffer → YIN-style pitch estimate every frame. Clamped to a child-voice range (~150–700 Hz) with an RMS gate so room noise/silence never triggers a chord.
- **output = Canvas2D watercolor / ink garden.** Deliberately Canvas2D (the jury calls it fresh-again; no WebGPU / three.js). Paper wash, translucent layered petals (wet-on-wet feel), wobbly ink stems, pooled watercolor bases. Louder voice = bolder stroke. The garden accumulates into a calm, building painting.
- **technique = autocorrelation/YIN pitch detection + functional voice-leading accompaniment engine.** Sung Hz → nearest diatonic degree of C major (melody, always in tune). Each degree implies its diatonic triad (1→I, 2→ii, 3→iii, 4→IV, 5→V, 6→vi, 7→vii°); three upper voices + bass voice-lead by greedy nearest-chord-tone assignment (common tones retained, others move the smallest interval). Leading tone borrows a real V; 5→1 and 7→1 are flagged cadences.
- **vibe = ink-and-watercolor garden, NOT cosmic glow.** Cream paper, earthy greens, warm gold tonic — no neon, no starfield.

## Color = harmonic function

- **Tonic** = warm gold (home) · **Dominant** = orange (tension) · **Subdominant** = green · **predominant / minor triads** = cool blue & violet. So the child *sees* the harmony's job before they can name it.

## Named references

- **Aldwell & Schachter, *Harmony and Voice Leading*.** The accompaniment follows its core rules: keep common tones, move each voice by the smallest available interval, resolve the leading tone up to the tonic. That's what makes the chords feel like real harmony rather than parallel block triads.
- **David Li / Google Arts & Culture, *Blob Opera* (2020).** The lineage of child-singable, never-wrong harmony — voices that blend supportively around an untrained singer. This piece extends it from playback toward live functional accompaniment.
- **arXiv:2602.06917, "Automatic Detection and Analysis of Singing Mistakes for Music Pedagogy" (Feb 6 2026).** Cited as the **inversion**: that paper *detects and flags* children's singing mistakes. This piece refuses to. Instead of marking error, the harmony bends to support whatever pitch the child finds — a no-wrong-notes pedagogy where the accompaniment, not the child, does the adjusting.

## Ambition-floor criteria hit

- **No pentatonic-no-wrong-notes harmony (banned):** uses the full diatonic set with real functional motion — ii, V, vii°, leading-tone resolution, cadence emphasis. Wrongness is removed by snapping the *melody* to the scale, not by hiding behind a consonant subset.
- **No pointer-drag as primary input (banned):** primary input is the live microphone (sung pitch). Taps on sing-pads are only the no-mic fallback, not a drag.
- **Kids-safe audio chain:** `masterGain(0.26) → lowpass(6.5kHz) → DynamicsCompressor(-10dB, 20:1) → destination`; soft triangle/sine timbres, ≥30ms-ish ramps, gentle roughly-constant accompaniment so louder singing never gets harsh; always-on soft tonic drone so it's never silent.
- **Degrades gracefully (required):** no/denied mic → rose-300 notice + 64px+ function-colored sing-pads through the identical pipeline + a hands-free auto-demo cadence within ~1s.
- **Typography / kids rules:** dark theme, monospace accents, `text-2xl` title, `text-base` body, no `/30–50` readable text, mic errors in `text-rose-300`, ≥64px tap targets, ≥72px Start, "Read the design notes" affordance.
- **Lifecycle:** full teardown on unmount — cancel rAF, stop oscillators, stop mic tracks, disconnect, close AudioContext.

## Honest unverified note

This sandbox has **no microphone and no audio output**, so the live path could not be exercised end-to-end. Specifically unverified on a real child's voice: (1) **pitch-detection robustness** — the YIN thresholds, RMS gate, and the 90ms "held-degree" debounce are tuned by reason, not measured against a wobbly, breathy 4-year-old in a noisy room; octave errors and over/under-triggering are plausible and would need real tuning. (2) **Harmony balance** — whether the voice-led accompaniment actually *sounds* supportive (vs. muddy or surprising) under fast, sliding melodies, and whether the gentle level genuinely stays unobtrusive, is unconfirmed by ear. The visual/auto-demo/fallback logic is fully wired and type-clean; the standalone `tsc` run reports only environment-level module-resolution errors (`react`/`next/link`/JSX) that appear identically on known-good sibling prototypes and resolve under the real Next.js build.
