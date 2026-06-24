# 902 · Harmonic Mirror

**What if, as you play, your instrument completes the chord you imply — adding the 1–2 notes you DIDN'T play, tuned in pure JUST INTONATION to your root — so the harmony locks beat-lessly under your hands?**

You play the keyboard you actually press, in equal temperament. A *mirror* listens to the pitch classes you're holding, infers the chord you're implying, and quietly adds the missing 1–2 voices — tuned by small-integer ratios to your root, so they sit beat-lessly against it. It is the deterministic, zero-latency cousin of a predictive AI accompanist: it doesn't *guess* what comes next, it *finishes the chord you are already playing*.

---

## How to play

- **MIDI** — connect a piano / controller. Web MIDI is requested on load; any connected input drives the pipeline directly.
- **On-screen piano** — click/tap the white and black keys (one octave from middle C). Works on a phone with no hardware at all.
- **Computer keyboard** — `a w s e d f t g y h u j k` → `C C# D D# E F F# G G# A A# B C`. Same pipeline as MIDI.

All three sources feed the **identical** inference + synthesis path. Idle for ~2s with nothing held and a gentle auto-demo arpeggiates a **I–vi–IV–V** progression so the page is alive at a silent glance; your first real note stops it.

---

## How it works

### 1. Chord-template inference (a small slice of Riemann functional harmony)
The held MIDI notes are reduced to a pitch-class set (mod 12). That set is matched against a small template bank, each tried at every held pitch class as a candidate root:

| Template      | Intervals (semitones over root) | Quality |
| ------------- | ------------------------------- | ------- |
| dominant 7    | 0 4 7 10                        | `7`     |
| major triad   | 0 4 7                           | `maj`   |
| minor triad   | 0 3 7                           | `min`   |
| suspended 4   | 0 5 7                           | `sus4`  |
| bare fifth    | 0 7                             | `5`     |

The best match maximizes covered pitch classes, then minimizes "extra" held notes, then prefers the more specific template and a root in the bass. A single held note implies a major triad on it. Anything that doesn't fit a consonant template falls to a **cluster** heuristic, named after the bass and completed only with a pure fifth (the safe consonance over any bass). The chord's *missing* template intervals (max 2) become the **completion voices**.

### 2. Just-intonation synthesis (Partch / Ben Johnston lineage)
Played notes sound as warm detuned-saw voices at their **equal-tempered** frequency (`440 · 2^((n−69)/12)`) — the keys you pressed. The mirror's completion voices are synthesized in **just intonation** relative to the inferred root's fundamental, using small-integer ratios:

| Interval (semitones) | Ratio | Degree           |
| -------------------- | ----- | ---------------- |
| 0                    | 1/1   | root             |
| 2                    | 9/8   | major second     |
| 3                    | 6/5   | minor third      |
| 4                    | 5/4   | major third      |
| 5                    | 4/3   | perfect fourth   |
| 7                    | 3/2   | perfect fifth    |
| 9                    | 5/3   | major sixth      |
| 10                   | 9/5   | minor seventh    |
| 11                   | 15/8  | major seventh    |

Because each mirror voice is a small-integer multiple of the root, its partials align with the root's partials and the beating cancels — the completion **locks**. (Compare the just `5/4` third, ~386 cents, to the equal-tempered third at 400 cents, ~14 cents sharp and audibly restless.)

### 3. Glide-retune
When your root shifts (e.g. C maj → A min), the mirror voices that persist don't restart — their oscillators **ramp smoothly** to the new JI frequencies over ~180 ms, so the retuning is a glide rather than a re-attack.

### 4. Canvas2D constellation viz
A circle-of-fifths ring places the 12 pitch classes around a circle. Held notes are bright white nodes; mirror notes are soft violet halos joined to the root by luminous **completion lines** carrying small ratio labels (`5/4`, `3/2`, …). The inferred chord name sits at the center. Everything amplitude-pulses at 60fps via `requestAnimationFrame`, reading live envelope levels from the audio engine.

---

## Subsystems

Four distinct subsystems: **(1) MIDI / on-screen / computer-keyboard input → (2) chord-template inference → (3) just-intonation synthesis with glide-retune → (4) Canvas2D circle-of-fifths constellation.**

---

## References

- **Harry Partch** & **Ben Johnston** — just intonation and small-integer ratio tuning; the ratio table above is squarely in their lineage.
- **Hugo Riemann — functional harmony** — the chord-template inference (tonic/subdominant/dominant qualities matched against a held pitch-class set) is a tiny, deterministic slice of Riemannian function theory.
- **RESEARCH anchor (dated finding):** *"Towards Real-Time Human–AI Musical Co-Performance: Accompaniment Generation with Latent Diffusion Models and MAX/MSP,"* **arXiv 2604.07612 (Apr 2026).** That work *predicts* an accompaniment with a latent diffusion model. Harmonic Mirror is the deterministic, zero-latency cousin: it predicts nothing — it **completes the chord you are already implying**, in just intonation, with no model and no latency.

---

## Rough edges (honest notes)

- Dense / extended chords (9ths, 11ths, altered dominants) fall through to the **cluster** heuristic — it names them after the bass and only safely adds a fifth, rather than reasoning about upper structures.
- The **on-screen piano spans one octave**; the computer-keyboard map adds the top C but no wider range. MIDI is the way to play across the keyboard.
- The JI **glide voicing wants a real-ear pass** — completion voices are placed by the root's octave neighborhood, which is usually right but can occasionally voice a completion a touch low/high relative to what a player expects.
- Inference is purely on currently-held notes; there's no temporal/voice-leading memory, so very fast arpeggiation reads as a sequence of momentary chords rather than one sustained harmony.
