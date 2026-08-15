# 13168 · Prepared Chance

**One question:** What if every note you play were re-tuned and re-placed in time by chance — as if John Cage had prepared your piano and thrown the coins?

A live instrument for a keyboardist. You play notes; each key sounds through a **prepared string** and a gentle **chance oracle** sometimes intervenes on the note — displacing its onset, transposing it within the scale, doubling it, or silencing it. The melody comes back recognisably yours, gently estranged. Playful, avant-garde, intimate — not cosmic.

## How to play

- **Web MIDI (primary):** connect a keyboard; access is requested on your first gesture (`navigator.requestMIDIAccess`). Incoming notes are snapped into the scale.
- **QWERTY fallback (no hardware needed):** white keys `A S D F G H J K` walk the scale; black keys `W E T Y U` fill the whole-step gaps, in a piano-like 2-then-3 shape. The on-screen keys are tappable on touch.
- **Chance amount slider:** dial from *faithful* (the oracle rarely intervenes) toward *estranged*.
- **Seeded muted demo:** on load, a short modal phrase plays **silently** through the chance engine so a glance shows the idea in about a second — strings vibrate, hexagrams toss, notes get re-placed on the time-lane. No audio until you press Start or a key.

## Subsystems (Ambition #2 — four, ≥3 required)

1. **Input** — Web MIDI (`requestMIDIAccess`) with a two-row QWERTY keyboard fallback and tappable on-screen keys.
2. **Karplus-Strong prepared-string synth** (`strings.ts`) — a plucked-waveguide feedback delay line, rendered per pluck and cached, with four preparation presets: `felt` (heavy damping, a muted thud), `bolt` (a rattling nonlinearity — a screw buzzing), `harmonic` (node-excited, long glassy ring), `detune` (two strings a few cents apart, slowly beating). All audio routes through the shared safe master.
3. **Seeded chance / hexagram engine** (`chance.ts`) — a mulberry32 PRNG tosses an I-Ching hexagram by the three-coin method for every note; its moving lines (the changing 6s and 9s) steer which transformation and how far. Fully deterministic.
4. **Canvas2D schematic + time-lane** (`viz.ts`) — the struck string vibrating with its preparation-object glyph, the tossed hexagram rising line-by-line with its verdict, and a scrolling time-lane where each note's written onset arrows to where chance re-placed it.

## Named reference (Ambition #3 — music history only)

**John Cage** — *Sonatas and Interludes* (1946–48): the prepared piano, where bolts, screws, and strips of felt wedged between the strings transform each pitch's timbre. *Music of Changes* (1951): composed by chance operations derived from tossing coins for the I-Ching. This piece borrows both ideas honestly — a prepared-string voice and a seeded coin-toss oracle — and claims no more than that. It does **not** claim to be a first in the lab.

## Determinism & safety

- All motion **and** the chance engine are driven by a `mulberry32` seeded PRNG plus an integer frame counter — no `Math.random`, `Date.now`, `new Date`, or `performance.now()`-as-seed anywhere. The muted demo reproduces byte-for-byte on every load.
- Audio never auto-starts: the `AudioContext` is created only inside a user gesture, and MIDI access is requested from a gesture too.
- Degrades gracefully: no Web MIDI (Firefox/Safari) shows an on-brand notice, the QWERTY fallback works fully, and the seeded demo still runs. Never throws, never blanks. No API route, no network.
- Teardown cancels the animation frame, removes the keydown/keyup listeners, nulls and closes every MIDI input, disconnects the safe master, disposes the synth, and closes the context.

## Palette & vibe

Graphite / paper / ink — warm off-white lines on near-black — with a single restrained violet accent reserved for the moment chance fires. Raw hex lives only in `viz.ts`, the canvas-art layer. Vibe: avant-garde, chance-music, playful.

## Files

- `page.tsx` — orchestration: input, scheduler, RAF loop, teardown, UI chrome.
- `music.ts` — scale, keyboard map, pitch/degree math.
- `chance.ts` — mulberry32 PRNG, hexagram toss, the chance engine.
- `strings.ts` — Karplus-Strong prepared-string synth + voice bank.
- `viz.ts` — Canvas2D schematic + scrolling time-lane (palette lives here).
- `readme-text.ts` — the in-app design-notes text.
