# 773 · Parade Caller

## The ONE question
**What if a 4-year-old's spoken words became a marching parade of percussion — where each word's *syllable rhythm* (not its pitch) becomes a drum/clap pattern, and words accrete into a looping parade band you build by talking?**

A child says a word out loud ("elephant", "cat", "butterfly", "banana"). The browser
speech recognizer hears it, and the word's **syllable count + stress** is turned into a
1-bar percussion loop on a 16-step grid. Each new word marches in from the side as a
bright cartoon character/instrument and joins the groove. This is **rhythm and parade
energy**, not melody — the soul is the BEAT.

## How to use
1. Tap the big **🎤 Tap & talk** button (the gesture creates/resumes the AudioContext —
   required by iOS Safari).
2. Say single words: "cat", "elephant", "banana", "butterfly", "dog", "dinosaur",
   "rainbow", "frog"… each one marches in and starts looping in time.
3. Up to 5 word-loops play together at 112 BPM; the oldest drops when a 6th arrives.
4. No mic / unsupported browser / mic denied? Tap the **picture-word menu** to add any
   word's parade loop — fully playable with zero microphone.

## Syllable → rhythm mapping
- **Syllable count** is estimated from spelling: count vowel-groups (`/[aeiouy]+/`),
  drop a silent trailing `e`, add a beat back for `-le` endings, clamp to 1–6.
  ("el-e-phant" = 3, "cat" = 1, "but-ter-fly" = 3, "ba-na-na" = 3.)
- Each syllable is placed **evenly across the 16-step bar** → a 1-syllable word is one
  big downbeat BOOM, a 3-syllable word is a galloping 3-hit pattern, etc.
- The **downbeat is accented** (loud) and the **stressed syllable** is emphasized
  (1–3 sylls stress the first; 4+ stress the second) so the groove feels intentional.
- A steady **marching hi-hat** fills the off-beats under every loop for parade drive.
- **Voice + color by syllable count:** 1=red kick BOOM, 2=amber snare/clap, 3=green tom
  gallop, 4=blue cowbell, 5=purple woodblock, 6=pink shaker. Pitch is *secondary* — a
  warm C2 bass-marimba root plays on the downbeat only, for body.
- All percussion is **synthesized live** with Web Audio oscillators + filtered noise
  bursts + envelopes (kick = pitch-swept sine, snare = bandpass noise + tone, hat =
  highpass noise, cowbell = detuned squares, woodblock = short square click). No audio
  files, no npm deps.

## Named reference — Konnakol (and Steve Reich)
**Konnakol** is South Indian Carnatic **vocal percussion**: spoken syllables
(*ta, ka, di, mi, tom…*) literally *are* the rhythm. It's taught to children as young as
~3 (e.g. the SaPa academy's "Indian beatboxing" for kids). This piece makes that idea
playable by a toddler: instead of learning konnakol syllables, the child's *own everyday
words* supply the rhythm — the syllables of "elephant" become the pattern, exactly as a
konnakol phrase would. Secondarily it echoes **Steve Reich's speech-melody works**
(*Different Trains*, *It's Gonna Rain*), where the rhythm of recorded speech drives the
music — here the speech rhythm drives a looping percussion sequencer instead.

## Fallback behavior
- **Auto-demo:** if no speech arrives within ~3s of starting (or ASR is unavailable),
  built-in words cycle through the *same* pipeline every ~2.5s, so a silent glance always
  shows and HEARS the parade. Real speech cancels the demo; ~5s of silence restarts it.
- **Graceful fallback:** if `SpeechRecognition` / `webkitSpeechRecognition` is missing or
  the mic is denied, a friendly **picture-word menu** (8 big tap buttons) drives the same
  loop pipeline — never a dead end. The notice is shown in `text-rose-300` (visible).

## Ambition-floor criteria hit
- **#2 — ≥3 subsystems:** (1) browser ASR (Web Speech API, continuous + interim),
  (2) syllable-rhythm analysis (`syllables.ts`: count + stress + step placement),
  (3) a looping percussion **step sequencer** on a shared Web Audio clock that accretes
  word-loops, and (4) a **Canvas2D** parade render (sky, marching lane, bouncing
  characters, sweeping playhead). Four real subsystems.
- **#3 — named reference:** Konnakol (South Indian vocal percussion, taught to young
  children) — and Steve Reich speech-melody as a secondary cite — explained above and
  load-bearing to the concept.

## Tags
- INPUT: speech / browser ASR (`webkitSpeechRecognition` / `SpeechRecognition`)
- OUTPUT: **Canvas2D** (no WebGL/WebGPU/three.js)
- TECHNIQUE: syllable-rhythm extraction → looping/accreting step-sequencer percussion
- VIBE: bright daytime parade — bold primaries, sunny, exuberant, joyful, active
