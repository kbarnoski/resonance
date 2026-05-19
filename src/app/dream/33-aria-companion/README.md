# Aria Companion — design notes

**Route**: `/dream/33-aria-companion`  
**Cycle**: 36  
**Status**: demoable

---

## What it does

The first *dialogue* prototype in the sandbox. All 32 previous prototypes are *reactive* —
they respond to audio on every frame. Aria is *compositional* — it listens, stops, and then
generates a response.

**The loop**:
1. You play a melody (piano, hum, sing). Each note is detected via autocorrelation pitch detection
   and logged as an event (MIDI note, start time, end time).
2. After 2 seconds of silence AND at least 8 notes, Aria responds.
3. Aria builds a **1st-order Markov chain** from your notes: given the last note you played, what
   did you most often play next? The longer you play, the more Aria has learned.
4. Aria generates a response phrase (8–16 notes) by sampling the Markov chain (75% weight) with
   a pentatonic fallback (25% weight — prevents atonal chaos if data is thin).
5. Aria plays its phrase as triangle-wave oscillators through a procedural room impulse response.
6. The system returns to listening mode.
7. **Repeat** — each exchange accumulates in the Markov table. After 3–4 exchanges, Aria has
   learned your interval tendencies and starts to feel like it's "in your style."

---

## Visual

Split dual piano roll. Top half = YOU (warm orange bars, hue encodes pitch like `13-piano-canvas`
and `24-piano-roll`). Bottom half = ARIA (cool blue bars). Both share the same pitch axis
(C2 bottom → C7 top). Time flows left-to-right, 9-second window. The "now" cursor is the right
edge; notes scroll leftward as time passes.

Aria's notes glow brighter while playing (shadowBlur 18) and dim after (shadowBlur 7). The visual
record of the whole session accumulates — after 5–6 exchanges you can see the conversation.

---

## Algorithm detail

**Pitch detection**: same autocorrelation algorithm as `13-piano-canvas` and `24-piano-roll`.
fftSize=4096 time-domain buffer → normalized self-difference → first trough → first peak above
0.82 confidence → parabolic interpolation. Works reliably for single-pitch sources (piano,
voice, whistle). Degrades gracefully for chords (picks dominant partial, usually the root).

**Markov transition table**: `Map<fromMidi, Map<toMidi, count>>`. Grows across the entire
session — each exchange adds to it. After 1 exchange (say, 10 notes), you have ~9 bigrams. After
5 exchanges, ~45–50 bigrams. The table learns your characteristic intervals: if you often play
ascending fifths, Aria will too.

**Pentatonic fallback**: when Aria chooses a random step, it draws from `[-7, -5, -3, 2, 3, 5, 7]`
semitones — these are all intervals found in every pentatonic scale. Even untrained Aria sounds
modal, not atonal.

**Response length**: `max(8, min(16, userPhraseLength))`. Mirrors the length of your phrase.

---

## Sound design

Triangle wave → fast ADSR (8ms attack, 90ms decay to 30% sustain, 280ms release tail).
Two output paths:
- **Dry** (32% gain): direct to destination
- **Wet** (20% gain): through a procedural room convolver (1.5s exponential decay white noise
  impulse — the same technique as `29-scene-spatial`)

Result: a "muted piano" quality — clearly pitched, with short sustain and a warm room tail.
Not trying to sound like a Steinway; trying to sound like "an instrument you recognize as a piano."

---

## Polish ideas (future cycles)

- **Melodic rhythm**: Aria currently uses uniform note duration (0.4s). Teaching it to mirror your
  rhythm (via inter-onset intervals) would make responses feel more musically responsive.
- **Higher-order Markov**: bigram → trigram would give longer melodic "phrases" rather than
  note-to-note jumps. Needs more data (~30+ notes).
- **Visual phrase markers**: draw a subtle vertical line on both panels to show where each
  exchange boundary is. Makes the conversation structure clearer.
- **Aria "personality" slider**: 0 = pure pentatonic, 1 = pure learned Markov. Lets the user
  bias how strongly Aria mirrors them vs. surprises.
- **Session save**: export the full conversation (all exchanges) as a MIDI file or as a `22-code-score`
  DSL string. "Your improvisation, and Aria's response — saved."
- **Multi-phrase Aria**: after 5+ exchanges, Aria builds longer multi-phrase responses that
  reference earlier phrases (via the full session Markov table). Approaching call-and-response
  as actual composition.

---

## Research basis

Inspired by **Aria-Duet** (NeurIPS 2025, arxiv 2511.01663): AI turn-taking piano duet on
a Disklavier. The AI uses a 40GB autoregressive transformer. This prototype achieves the same
interaction pattern with ~20 lines of Markov JS and zero inference latency. The point isn't
matching Aria-Duet's musical quality — it's proving the interaction paradigm is possible at
zero cost in the browser.

The **Design Space for Live Music Agents** taxonomy (arxiv 2602.05064, Feb 2026) explicitly
identifies dialogue agents as the least-explored category among 184 surveyed systems. All 32
prior dream sandbox prototypes are reactive. This is the first in the sandbox that composes
rather than responds.
