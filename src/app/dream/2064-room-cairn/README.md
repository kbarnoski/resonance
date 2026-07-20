# Room Cairn (`2064-room-cairn`)

**The one question:** *What if the ROOM played the instrument — you build (and
un-build) a phasing cairn of collisions hands-free, just by clapping, snapping
and tapping into the air, then falling silent?*

This is **cycle 2 of [`1990-impact-cairn`](../1990-impact-cairn/)**. Cycle 1 was
an audio-first, near-non-visual **haptic** instrument where music is made of
*collisions* (modal-impact synthesis — no scale, no pitch) with a consequential,
editable-memory **un-build grammar**. Cycle 1 was driven by pointer taps. Cycle 2
keeps the proven engine verbatim (`audio.ts`, `materials.ts`, `rng.ts`) and
**re-inputs it through the room**: ambient-microphone onset detection replaces the
pointer entirely. The visitor performs with their body and the room's acoustics.

---

## The input layer: onset → material → velocity

The mic is captured inside the Begin gesture with
`getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}})`
and fed an `AnalyserNode` (`fftSize` 1024) on the **same `AudioContext`** as the
synth. Each animation frame (`onset.ts`):

1. **Spectral flux** — convert the dB spectrum to linear magnitude and sum the
   *positive* bin-to-bin increases vs. the previous frame. A transient (clap,
   snap, desk-tap, tongue-click, beatbox) is a sharp spike.
2. **Adaptive threshold** — a rolling window (~0.7 s) gives a running mean + std;
   the bar is `mean + margin·std + floor`. A ~100 ms **refractory** period means
   one clap = one strike, not a burst. A live **input meter** and a
   **sensitivity** slider (0.3–2.2, scaling margin + floor) make it work in quiet
   or loud rooms.
3. **Spectral centroid** of the onset frame picks the **material**: bright / sharp
   (> 3400 Hz) → **droplet**; mid (> 2200) → **ceramic**; (> 1200) → **wood**;
   dark thud → **stone**. Peak amplitude → **velocity** (clamped 0.2–1.0).

Every accepted onset is a strike: it sounds a modal impact, drops a pebble, and
fires a velocity/material-scaled `navigator.vibrate` pulse (silent no-op where
unsupported). Mic-permission-denied shows a clear notice on `text-destructive`
and the ghost keeps playing.

## The un-build grammar (unchanged, now hands-free)

The cairn is memory you can un-make. The engine's grammar is intact:

- **Auto-lay** — after a burst of ≥ 2 onsets falls silent for ~1.4 s, the figure
  auto-commits to a looping layer, so you can build a phasing cairn without ever
  touching the screen. An explicit **Lay** button and an **Auto-lay on/off**
  toggle are also on the control surface (buttons are chrome, not the play
  gesture — the ban is specifically on pointer/tap as the *instrument's* input).
- **Phase** — layers loop at slightly independent rates and drift against each
  other (Steve Reich, *Clapping Music*).
- **Knock a stone off** — delete a layer; the loop audibly loses it, with a
  tumble sound.
- **Change a laid stone's material** — transforms on its next pass.
- **Mute / clear** — per-layer mute and global clear.

## The self-demo (headless, build-verifiable)

With zero input, a **deterministic seeded ghost performer** (`mulberry32`, constant
seed, all timing off the `AudioContext` clock via the rAF tick — never
`Math.random` / `Date.now` / `performance.now`) plays a figure, lays it, adds a
phasing layer, knocks a stone off, changes a material, and loops forever. A real
onset takes over instantly; the ghost re-arms after ~15 s of silence. This makes
the piece demoable with no mic and renders headless in the production build.

## Degrades gracefully

- **No mic / permission denied** → the ghost keeps playing + an on-brand
  `text-destructive` notice.
- **Audio blocked** → visuals + ghost timing still run; an on-brand notice shows.
- Full teardown on unmount: mic tracks stopped, `AnalyserNode` disconnected, rAF
  cancelled, timers cleared, `engine.destroy()`.

## Output: minimal, but reactive

A dark field, DOM stones (no strobe, respects `prefers-reduced-motion`). Each
strike drops a pebble; each laid layer is a settled stone that pulses on every hit
it sounds; a knock-off scatters debris. Art colours live only in the DOM stones;
all UI chrome is on semantic tokens.

## References

- **J. P. Bello, L. Daudet, S. Abdallah, C. Duxbury, M. Davies, M. B. Sandler,
  "A Tutorial on Onset Detection in Music Signals," *IEEE Transactions on Speech
  and Audio Processing*, 2005** — spectral-flux onset detection.
- **Steve Reich, *Clapping Music*** — phasing of identical figures at drifting
  rates.
- **Pauline Oliveros, *Deep Listening*** — an eyes-closed, attention-first
  listening practice.
- Cycle 2 of `1990-impact-cairn` (modal-impact synthesis; the un-build grammar).

## What's rough / honest limits

- Onset→material mapping is centroid-thresholded, so the *same* clap can land on
  a neighbouring material as room tone or mic placement shifts the centroid; the
  sensitivity slider trims false-fires but not the centroid boundaries.
- Auto-lay uses a fixed silence gap; very slow, sparse playing can auto-lay a
  figure before you finish it (turn Auto-lay off and use Lay for deliberate
  building).
- The mic path is **not** exercisable headless (no room sound in CI); only the
  ghost + synth + un-build grammar are build-verifiable. Real-room tuning of the
  flux threshold and centroid bands needs a live device.
