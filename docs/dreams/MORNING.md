# Morning digest — last updated 2026-05-25 UTC (Cycle 168)

## New since yesterday

- **[/dream/142-kids-echo-canon](/dream/142-kids-echo-canon)** — Echo Canon (kids) · *Cycle 168* · `demoable` ⭐
  Tap out a little melody anywhere on the canvas. After 1.5s of silence it echoes back
  as a **three-voice canon**: amber (original), blue (+perfect fifth), violet (+octave).
  Each voice starts 550ms after the previous — a true overlapping canon. Dots rise
  upward for each voice, so pitch rise is visible as well as audible.
  - **Why open this**: first kids prototype where your own phrase comes back as polyphony.
    36 prior kids prototypes are reactive (tap → immediate note). This one listens, then
    harmonizes. Zero permissions, instant demo by tapping anywhere.
  - Algorithm: X column = pitch (C3/E3/G3/A3/C4), canon timing via Web Audio precise
    scheduling (`osc.start(when)`), visual sparks from rAF `actx.currentTime` check.

- **[/dream/141-chord-canvas](/dream/141-chord-canvas)** — Chord Canvas · *Cycle 167* · `demoable`
  Play any chord into the mic: the name appears (C, F♯m, Bdim) plus a scrolling
  color timeline. First prototype to name musical structure. Hit Demo for ii–V–I in C.

## In progress / partial

Nothing in-progress.

## Love signal (unchanged — 13 loved)

`82-kids-color-piano` ❤️ `83-kids-tilt-rain` ❤️ `130-tsl-particle-compute` ❤️
`111-kids-shape-loop` ❤️ `107-ocean-presence` ❤️ `106-beat-cut` ❤️ `105-pluck-field` ❤️
`104-kids-mirror-draw` ❤️ `101-camera-song` ❤️ `100-kids-paint-song` ❤️
`98-kids-drum-circle` ❤️ `86-sound-to-video` ❤️ `84-wave-fluid` ❤️

## Research findings worth a look

Nothing new this cycle (build cycle). Adult research is now **40 adult-equivalent
cycles overdue** (last: Cycle 129). Cycle 169 is a full research sweep — expect 3-5
new prototype seeds from arxiv, fal.ai, HN, and TouchDesigner/Houdini communities.

## Open questions for Karel

1. **Chord Canvas 7th templates** — add 7th chord templates (G7 / Cmaj7 / Dm7)?
   Currently 24 templates (major + minor triads only). G7 usually reads as G.
2. **Echo Canon mic mode** — add a second mode where the child hums a phrase and it
   echoes back transposed? Same prototype, different input. Worth a polish cycle?
3. **Wheel Song note labels** (queued since Cycle 160, now 8 kids cycles) — the small
   note-name flash above the striker when a segment passes. Still not done. Next?
4. **Research cadence** — Cycle 169 will be an adult research sweep. Is the IDEAS queue
   where you want it, or any specific area to dig into (WebGPU compute, spatial audio,
   new fal.ai models, CHI 2026)?
