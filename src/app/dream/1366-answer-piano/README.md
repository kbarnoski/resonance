# Answer Piano (1366)

**What if Resonance could ANSWER you?** You play a short phrase — sing or play
into the mic, or tap the on-screen keys — and a patient partner listens, waits
for you to finish, then replies with a complementary phrase in the same key.
Not a recording you sculpt: a conversation. Turn-taking, like two musicians
trading fours.

## How to play

1. Press **Begin**. Audio is gesture-gated; the master bus fades in gently under
   a quiet drone bed. If you allow the mic, it's used for *analysis only* —
   nothing is recorded or sent anywhere.
2. Play a **short phrase**, then pause:
   - **Mic path** — sing or play a few notes. The system detects your pitches in
     real time and re-synthesizes them as a soft amber voice.
   - **Keyboard path** (always works, phone-friendly) — tap the keys or press the
     `A S D F G H J K L ;` row. Each key is a note of D-major pentatonic.
3. Stop for a breath (~0.9 s). The system segments your phrase and the **partner**
   answers in a cool violet voice.
4. Watch the two **voice ribbons** braid in the SVG — your line in amber, the
   answer in violet, woven along the faint conversation thread.

If you do nothing for ~4 seconds, the instrument plays a **seed phrase to itself
and answers it**, so a cold visitor immediately sees and hears the duet. It keeps
gently talking to itself until you take a turn.

## The four subsystems

1. **Real-time pitch + onset detection** — autocorrelation over the mic's
   time-domain buffer (`getFloatTimeDomainData`), with an RMS silence gate and a
   clarity threshold, snapped to the nearest pentatonic note. A note is
   registered on a pitch change (debounced), a sustained note keeps the phrase
   alive.
2. **Phrase segmentation + short-term memory** — captured notes accumulate; a
   silence timer (reset on every note / voiced frame) fires when you stop,
   finalizing the phrase.
3. **A generative in-key responder** — transforms the remembered phrase:
   - a rising *question* → a falling, **inverted** line that **resolves to the
     tonic**;
   - a falling line → an **ascending sequence up a fifth**, left open on the
     dominant (A);
   - a flat phrase → a **gentle echo lifted a third**, resolving home;
   - a single note → rise a fifth, step down, resolve.
   Because everything is expressed as pentatonic scale-indices, every transform
   lands in key — an answer can never sound wrong. It's scheduled as a second,
   distinct synth voice.
4. **Dual-voice SVG braid** — deterministic `<svg>` (no Canvas/WebGL). Each note
   is a node placed by pitch (y) over conversation-time (x); two smooth ribbons
   (amber = you, violet = partner) braid along a faint thread as turns alternate.

## Sound

- **You** — a soft triangle with a gentle attack.
- **Partner** — a warmer FM pad (sine carrier + fifth modulator, low-passed).
- **Bed** — a quiet just-intonation drone in D (shared `psych/droneBank`) through
  a code-generated convolution reverb (shared `psych/convolutionVoid`).
- Master gain ≤ 0.2 with an exponential fade-in and a `DynamicsCompressor`
  limiter on the bus. Full teardown on unmount (rAF, timers, listeners, mic
  tracks, `AudioContext.close()`).

Key: **D major pentatonic** (D E F♯ A B), warm and always consonant.

## Reference

Borrows the *responsive-partner* framing from **Dan Tepfer's _Natural
Machines_** — a living jazz pianist whose Yamaha Disklavier improvises *with* him
from algorithmic rules keyed to what he plays — and the **score-following /
Music-Information-Retrieval lineage (Roger Dannenberg)**, where a machine tracks
a human performance in real time and responds. We borrow the idea, not any code.

## Honest limitations

- Monophonic pitch detection only — it hears one note at a time; chords/harmony
  aren't tracked, and a noisy room or very low/breathy singing can miss.
- The mic can pick up the instrument's own speaker output; while the partner is
  answering we deliberately ignore the mic (turn-taking), but a loud speaker +
  reverb tail can occasionally trigger a phantom note. **Headphones recommended.**
- Rhythm capture is coarse — the answer uses a gentle fixed cadence rather than
  a precise transcription of your timing.
- The responder is rule-based (four contour transforms), not learned — it's a
  consistent, musical partner, not an unpredictable one.
- Safety: no strobe; the only luminance motion is a ≤ ~0.4 Hz node halo, disabled
  under `prefers-reduced-motion`.
