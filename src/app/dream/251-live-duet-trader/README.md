# 251 · Live Duet Trader

**The one question:** What if Resonance *traded fours* with you — the instant you pause it
darts in with a melodic answer in your key, and the instant you play again it ducks out of the
way? True interleaved improvisation, not turn-based "wait two seconds."

You play any pitched instrument (piano, voice, guitar) into the mic. After ~3 notes the partner
starts learning your intervals. Whenever a short silence opens it answers a phrase in your
inferred key; the moment you re-enter it gets out of your way. A glowing split piano-roll shows
**YOU** (amber, top) and the **PARTNER** (teal, bottom) weaving around each other.

## How it differs from `225-aria-companion`

`225-aria-companion` is **turn-based**: you play ≥8 notes, you stop, you wait a fixed **2 seconds**,
then Aria plays a full response, *then* it starts listening again. It is a polite call-and-response
with a hard handoff.

This prototype is **continuous interleaved trading**:

- The trigger is a **~320 ms gap**, not a 2-second turn boundary — the partner darts in fast.
- The partner has **no exclusive turn**. The instant a new onset from you is detected, its master
  gain ramps to zero in ~50 ms and its scheduled phrase is **cancelled** — you always have right of
  way. That duck-on-re-entry is the whole point: it feels conversational, like trading fours, not
  like taking turns.
- It only needs **3 notes** of history (vs 8) and re-trains the Markov table continuously across
  the whole session.

## Pipeline

```
mic → AnalyserNode (fftSize 2048)
    → detectPitch()  NSDF / McLeod autocorrelation, RMS-gated   (~16 ms hop)
    → onset tracking (debounced; new stable pitch = new note)
    → gap timer (ms since last onset)
        ├─ gap > 320 ms & ≥3 notes & listening → launchFill()
        │     buildTable() 1st-order Markov over your snapped notes
        │     inferKey()   best major fit over pitch-class histogram
        │     generateFill() walk the table, fallback = key-constrained step
        │     makeRhythm()  lively 8th/16th-ish durations
        │     → partnerTone() warm triangle + inharmonic partials + delay shimmer
        └─ new onset while ANSWERING → duckPartner() (50 ms fade + cancel phrase)
```

- **Pitch detection:** normalized square-difference autocorrelation (McLeod Pitch Method variant)
  on the time-domain buffer, gated by RMS so room noise / silence is rejected. Peak NSDF must
  exceed 0.55 to count as voiced.
- **Onset / gap detection:** a pitch must hold ~70 ms (debounce) before it registers as a note,
  which kills octave-flicker double-fires. `lastOnsetMs` drives the gap timer shown filling toward
  the trade threshold in the UI.
- **Key inference:** a 12-bin pitch-class histogram is matched against all 12 major scales
  (tonic + dominant weighted); the winning root defines a major-pentatonic the generator snaps to,
  so answers always sound consonant even when the Markov table is sparse.
- **Markov fill:** 1st-order interval/pitch transition table trained live on *your* snapped notes;
  generation walks it, falling back to a key-constrained random step when a state is unseen.
- **Voices:** the partner is a warm additive tone (triangle fundamental + slightly inharmonic sine
  partials, soft envelope) through a feedback delay for jazz-club air, plus a very low sine pad so
  the room is never fully silent. Your own detected notes get a faint sine echo as confirmation.

## Visualization

Canvas 2D only (no WebGL / three.js). A split scrolling piano-roll over the last ~7 s: amber notes
on top for you, teal below for the partner, with glow trails. A large state badge reads
**LISTENING** / **ANSWERING**, the inferred key is shown (e.g. "C pentatonic"), a gap-timer bar
fills toward the trade threshold, and a live amber dot tracks your current pitch at the right edge.

## Degradation

- Mic denied / unavailable → readable `text-rose-300` message **and** the demo auto-runs: a
  synthesized C-pentatonic motif plays, pauses (gap opens), the partner trades back, and it loops.
- The **Play demo** button gives the same mic-free experience on purpose.
- Pure Web Audio + Canvas 2D, zero new dependencies, client-only (no API route). Loads instantly.

## Named references

- **arXiv 2604.07612** — *"Towards Real-Time Human–AI Musical Co-Performance: Accompaniment
  Generation with Latent Diffusion Models and MAX/MSP"* (Apr 2026). We borrow the **interaction
  shape**: a low-latency co-performer that acts on *partial* context, with latency as the defining
  constraint. We implement that shape with a lightweight live-trained Markov generator instead of a
  latent-diffusion model — orders of magnitude cheaper, fully client-side.
- **François Pachet — "The Continuator"**: real-time stylistic continuation that trades phrases
  with a player by learning a Markov model of their playing. This is its spiritual ancestor.
- **"Trading fours"** — the jazz practice of swapping four-bar phrases. The duck-on-re-entry
  behaviour is an attempt at that conversational feel rather than rigid turn-taking.

## Honest limitations

- **Monophonic only.** Autocorrelation tracks one pitch; chords / polyphony confuse it.
- Pitch detection runs on a `setInterval` (~16 ms), not an AudioWorklet, so under heavy load the
  hop can jitter and a fast trill may register as one note.
- 1st-order Markov is shallow — answers can feel meanderingly random until you've fed it a clear
  motif; key-snapping hides most of the wrongness but not the lack of long-range structure.
- Gap threshold (320 ms) is fixed; very legato or very staccato players may find it eager or shy.
- The demo "player" is a fixed motif, so its trades are representative but not as varied as live
  input.

## Next-cycle ideas

- 2nd-order (or variable-order / VLMM) Markov, à la the Continuator, for stronger phrase structure.
- Move pitch detection into an **AudioWorklet** for rock-steady low-latency onsets.
- Tempo/beat tracking so the partner's rhythm locks to your groove instead of a random palette.
- Adaptive gap threshold inferred from your average inter-onset interval.
- Polyphonic front-end (e.g. a lightweight CREPE-style detector) for chordal trading.
- Let the partner *overlap* harmonically under sustained notes (a true accompanist mode) in
  addition to gap-trading.
