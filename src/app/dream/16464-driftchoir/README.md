# 16464-driftchoir

**Status:** demoable

An audio-only / haptic piece. There is deliberately **no primary visual** — the
art is the sound field, and the screen carries only a spare "witness." Put on
headphones, close your eyes, and listen.

## The one question it answers

> What if one of Karel's piano takes grew itself into an endless ghost choir you
> LISTEN to with your eyes closed — no primary visual — where the moments the
> voices drift into phase-alignment are FELT in your hand (haptic) and HEARD as a
> soft swell, not watched on a screen?

## How the incommensurate-loop ensemble works

One of Karel's real recordings (default: a Welcome Home take) is decoded into a
single `AudioBuffer`. A ~7.5-second window of it is copied across up to six
voices. Each voice is an independent looping `AudioBufferSourceNode` playing that
same window, but at a slightly different **incommensurate loop length** — length
ratios ≈ `1.000, 1.037, 1.081, 1.129, 1.181, 1.237`. Because those lengths never
share a common multiple, no two voices ever re-synchronize: they drift through
phase forever and the texture never repeats. This is the tape-loop principle of
**Brian Eno, _Music for Airports_ (1978)** — seven loops of incommensurate
length — and the phasing of **Steve Reich, _Piano Phase_**. The drift is the
composition, not a decoration on top of it.

The choir **self-builds hands-off**: on start there is one voice, and a fresh
voice blooms in automatically every 4–6 seconds until five are singing. His sound
plays with zero interaction.

## The Basinski aging

Each voice ages over minutes like **William Basinski, _The Disintegration Loops_**:
its own lowpass filter slowly closes (≈6.2 kHz → ≈440 Hz over ~4 minutes) and its
gain gently dims. The oldest voices recede into a dark wash while new bright ones
enter, so the choir at minute five is genuinely not the choir at minute one — real
per-voice state and memory, not a static layer.

## The coincidence → haptic + audio-cue mechanism

A **phase-coincidence detector** runs every frame (`engine.ts`,
`detectCoincidences`): for each pair of live voices it computes the wrap-around
distance between their loop phases, and when they pass within a small threshold it
counts an alignment (per-pair and global cooldowns keep it musical). Each strong
coincidence fires **two cues**:

- **Audio cue (works everywhere, including desktop, no phone needed).** The engine
  blooms the gain and re-opens the lowpass of the two coinciding voices for ~1.6s —
  a soft **swell of Karel's own sound**. There is no oscillator, synth, or noise
  anywhere; the swell is pure processing (gain + filter automation) on his
  recording. This is what makes the alignment _read_ without a phone.
- **Haptic cue (mobile).** The UI drains the coincidence events and calls
  `navigator.vibrate(...)` with a short pulse. It is feature-guarded
  (`"vibrate" in navigator`), throttled to at most ~1 pulse/second, and
  **toggleable** via a UI switch (default on). Where vibration is unsupported the
  toggle is hidden and the cue degrades silently.

## The press-to-bloom verb (the load-bearing active input)

The primary on-screen element is a large **press-and-hold** target (also bound to
holding Space / "b"). On **press** it blooms a new voice into the choir; on
**release** it lets the most-aged voice fade out. The player conducts the choir's
density by hand — this is the active human verb, not a passive/self-propelling
knob. (The self-build still fills the choir to five when you do nothing, so the
piece is never silent, but the hand is what shapes it beyond that.)

## The minimal witness (the only screen element)

- title + one-sentence description;
- the large press-and-hold conductor target;
- a spare **instrument strip** — one thin horizontal bar per living voice with a
  dot marking its loop-phase position, dimming as the voice ages, and a small
  ring at the right that pulses when voices align;
- the haptic toggle (hidden where unsupported);
- a voice-count readout;
- a take selector and a "Read the design notes" link.

It is kept dark, calm, and typographic. The strip is a tiny `<canvas>` used as an
instrument readout only — not a generative art field.

## Constraints honored

- Audio source is **only** Karel's real catalog via
  `{ REAL_TRACKS, loadRealTrackBuffer }` from `../_shared/welcomeHome`, defaulting
  to a Welcome Home track. No synthesized audio anywhere — his recording is the
  sole sound source; filters and gain are processing only.
- Every audible node terminates at `safeMaster.input` (`createSafeMaster`); zero
  `ctx.destination` references.
- Graceful degradation: audio-load failure shows a `text-destructive` message;
  the first user gesture starts/resumes the `AudioContext` (autoplay policy);
  missing `vibrate` support hides the haptic toggle. Full teardown on unmount —
  sources stopped, rAF cancelled, `safeMaster.disconnect()`, context closed.
- No film grain / noise overlay. No substance framing. House typography and
  semantic tokens throughout; violet `--primary` is the only accent.

## Honest novelty note

Haptic feedback, audio-only pieces, and incommensurate loops all have priors in
the lab — this piece claims no "first." Its honesty is that it is a disciplined,
≥3-subsystem composition (incommensurate-loop ensemble · Basinski aging ·
phase-coincidence → his-own-sound swell + haptic pulse) built around a single
restraint: no screen to look at. The novelty is the discipline, not a new
primitive.

## References

- Brian Eno — _Music for Airports_ (1978): incommensurate tape loops.
- Steve Reich — _Piano Phase_: gradual phase drift between identical parts.
- William Basinski — _The Disintegration Loops_: loops that decay as they play.
