# Morning digest — last updated 2026-05-26 UTC (Cycle 200)

## New since yesterday

- **[/dream/171-kids-snow-globe](https://getresonance.vercel.app/dream/171-kids-snow-globe)** — Snow Globe (kids) `demoable`
  Tap anywhere on the dark night sky — 5–8 glowing snowflakes scatter from your touch and
  drift down with gentle sinusoidal wobble. **The note plays when the flake lands**, not on tap:
  a triangle-wave bell chime rings on touchdown, colored sparkles burst at ground level.
  Tap high → high note (rose/C4). Tap low → low note (violet/C3). Hold for blizzard mode.
  Demo auto-rains from center for 3.5 s — you can just watch on first open.
  **Why open this**: it's the first kids prototype where the musical cause-effect loop has a
  gravity-delay built in (~0.5–1.4 s per flake). The child taps, watches, then hears. After one
  tap near the top and one near the bottom, they have the pitch mapping without any explanation.

- **[/dream/170-spectral-morph](https://getresonance.vercel.app/dream/170-spectral-morph)** — Spectral Morph `demoable` (Cycle 199)
  40-partial harmonic blend: drag the morph slider to mix any two waveforms spectrally.
  First prototype to synthesize from spectral manipulation rather than just visualize it.

- **[/dream/169-kids-marble-run](https://getresonance.vercel.app/dream/169-kids-marble-run)** — Marble Music (kids) `demoable` (Cycle 198)
  Draw ramps → drop marbles → KS pluck notes on each bounce.
  First kids prototype where you build the machine before the music plays.

## In progress / partial

- Nothing in-progress. Cycle 200 (kids) shipped cleanly.

## Kids queue (cycle 202)

- `kids-garden-bloom` — hold finger on soil → stem grows upward, petals unfold one by one
  (each petal = one note, triangle wave, pitch rising per petal). Hold 4s = 5-petal chord.
  Release mid-growth = flower loops its chord softly. Up to 6 flowers coexist.
  Sustained-hold = growth is a new interaction paradigm for the kids zone.
- `kids-raindrop-rhythm` — tap any of 3 colored clouds → burst of raindrops fall → play note
  on landing. Auto-rain keeps canvas alive. Three clouds = three-voice pentatonic polyphony.

## Adult queue (cycle 201)

- `loop-station` — 4-slot live looper. BPM-synced lengths (1/2/4 bars). Tap REC → loop
  immediately. All active slots phase-locked. Overdub. Waveform mini-strip per slot.
  Highest live-performance value idea in the queue. Zero deps, pure Web Audio.
- Research sweep is also overdue (22 adult cycles since Cycle 177). Consider dedicating
  Cycle 201 to a fresh pass: WebGPU audio compute, new fal.ai AV models, RAVE/BRAVE browser
  ports, Refik Anadol's DATALAND: Rainforest (opened June 20 — any new technique releases?).

## Love-signal context

19 prototypes loved (unchanged since Cycle 197). Snow Globe drawn directly from
`133-kids-ripple-pond` ❤️ (physics delay = note), `100-kids-paint-song` ❤️ (tap = music),
`152-kids-star-paint` ❤️ (dark sky + sparkle language).

## Open questions for Karel

- **Snow Globe bell pitch**: currently C4/A3/G3/E3/C3 mapped to 5 equal canvas strips.
  Worth narrowing to 3 pitches (simpler for very young kids) or keeping 5?
- **Spectral Morph pitch slider**: source is locked to C3. Add C2–C5 slider? ~10 lines.
- **Loop station**: ready to build Cycle 201 unless you'd prefer a research sweep first.
  Which is more useful right now — new builds or fresh research?
- **Marble run restitution**: 0.68 (32% energy lost per bounce). Feel right?
