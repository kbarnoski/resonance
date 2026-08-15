# 13536 · conductorwell

**"What if Karel could CONDUCT his own recording with a real conductor's BEAT — circling the baton to set tempo — so his piano rushes and holds to the shape of his hand, pitch unchanged?"**

The recording is his orchestra. Your circling gesture is the beat. A performance instrument you *play*, not a diagram you watch.

---

## The interaction — beating time

Press anywhere in the well and **CIRCLE the pointer** (mouse or touch) like a conductor tracing a beat pattern:

- **Angular velocity of the orbit → conducted tempo.** Circle faster and his piano rushes forward; slow the orbit and it broadens.
- **Stop, baton held → freeze.** The read-head re-triggers the same slice forever — a frozen, shimmering sustain, a chord held to eternity, pitch intact (a few ms of read jitter keeps it shimmering rather than buzzing).
- **Reverse the circle → reverse playback.** The sign of the orbit sets the sign of time.
- **Orbit radius → dynamics.** Wide from the well's center is *forte*; tight is *piano*. Radius also opens/closes the brightness.

This is deliberately **not** a linear scrub of a progress bar — it is a genuine beat-conducting model, so it should *feel* like beating time. When you let go, the well holds your last breath for a moment, then a gentle **auto-beat** takes over so it is never silent.

## The engine — pitch-preserving granular / overlap-add time-stretch

Web Audio makes this clean: reading a slice of an `AudioBuffer` at `playbackRate = 1` preserves pitch exactly. A single read-head walks his recording; every constant `GRAIN_HOP` (~45 ms) of **output** we emit one short grain — a ~110 ms slice through its own raised-cosine (Hann) gain envelope, peak ≈ dynamics — and the overlapping grains overlap-add back into continuous sound.

The time-stretch is one line of intent: the read-head advances at the **conducted** rate (`readPos += conductRate * GRAIN_HOP`) while the grain-emission rate stays constant. Decoupling read-head speed from emission rate stretches time while pitch stays nailed to the hand:

- `conductRate = 1` → tracks his recording at original tempo.
- `conductRate → 0` → re-triggers the same `readPos` → frozen sustain (+ ±5 ms jitter).
- `conductRate < 0` → the read-head walks backward → reverse, pitch intact.

`conductRate` is derived from the smoothed angular velocity of the orbit (Δangle around the well center per frame, sign from circling direction), clamped to −2.5…+2.5. Dynamics and brightness come from orbit radius. Everything lerps toward its target so the instrument glides. All grains route through a per-instrument lowpass into `createSafeMaster` — never to `ctx.destination`.

## The output — a three.js well

A perspective camera looks into a receding well. His real **note-roll** (from the published analysis — MIDI pitch → lateral/vertical position, velocity → mote size/brightness) streams as motes pouring through the glowing **baton ring** at the mouth of the well **into depth**. The flow speed into the dark *is* the conducted tempo, so the whole field rushes, stalls, and reverses with your orbit. The baton ring spins to your beat and widens with your dynamics; a bright marker on it makes the rotation legible. Cool concert-hall-at-night palette: near-black under a violet ramp, additive motes, no warm hues.

If a track has no published note-roll, the motes take pitch/brightness from the live spectrum (`safe.analyser`). Before audio starts, the motes drift on a gentle default so the well is alive from the first frame.

## Audio source

Karel's **real catalog only** — `REAL_TRACKS` via `loadRealTrackBuffer`, analysis via `loadTrackAnalysis`, master via `createSafeMaster`. No synth, no oscillators; the only thing you hear is grains of his own piano.

## Graceful degradation

- **No WebGL** → notice shown, the 3D well is skipped, you can still Play and conduct by ear.
- **Analysis null** → motes follow the analyser spectrum instead of the note-roll.
- **Audio fails to load** → `text-destructive` message; the silent demo keeps conducting.
- **Reduced motion** → fewer motes, no shimmer, a slower auto-beat.

Full teardown on unmount: scheduler stopped, grains disconnected, three.js geometries/materials/renderer disposed and the canvas removed, `safe.disconnect()`, `ctx.close()`, rAF cancelled.

## Named reference

- **"Real-Time Control of a Virtual Orchestra by Recognition of Conducting Gestures"** (arXiv:2604.27957, April 2026) — a 180° dome installation where visitors conduct pre-recorded orchestra audio by tempo/dynamics gestures. This piece **ports that beat-conducting idea onto Karel's own recording**: his piano is the orchestra, his circling hand is the baton.
- **Granular / overlap-add time-stretch lineage** — PhaVoRIT; Karrer, Lee & Borchers, *"PhaVoRIT: A Phase Vocoder for Real-Time Interactive Time-Stretching"* (2006), which framed real-time time-stretching for exactly this "conduct a recording" problem.

First conductor / time-stretch instrument in this lab.

## Next-cycle deepening

- **True beat-pattern recognition** — detect the 4/4 conductor's figure-of-eight (down-out-in-up) and snap `readPos` to detected downbeats against his metrical grid, instead of raw angular velocity, so the beat lands *on* his beat.
- **Phase-vocoder engine option** — offer a phase-locked STFT time-stretch alongside the granular OLA for cleaner sustained tone at extreme stretch, with an A/B toggle.
- **Two-hand dynamics** — a second pointer (left hand) shaping a dynamics envelope independent of orbit radius, as a real conductor's off-hand does.
- **Cue points from the analysis events** — light the baton ring when the read-head crosses a published "idea" boundary, so conducting reveals his form.
- **Grain-scatter as expression** — map orbit *jitter/looseness* to grain-position spread, so a loose beat smears into a cloud and a precise beat tightens to a clean line.
- **Record the performance** — capture the conductRate/dynamics automation so a conducted take can be replayed or shared.

## DEEP §1144 — folded from the two runners-up (multi-cycle commitment)

This piece won a 3-way DEEP race of "conduct your own recording" interaction models. It is marked a **multi-cycle commitment** — the two banked runners-up are its next cycles:

- **Cycle 2 — a "line view" toggle (from `13520-conductorline`).** Add a second render/interaction: a horizontal WebGL2 note-river placed each frame from a single `uReadPos` uniform (flows AND reverses on the GPU for free) with a pointer-velocity SCRUB baton. It's the most robust/intuitive member of the family; offering it as a toggle gives a GPU-light path and a second, more legible gesture beside the beat-circle.
- **Cycle 3 — "spacing is tempo" (from `13552-conductorbreath`).** Tie the mote/note spacing to the conducted rate so the field visibly SPREADS when rushing and BUNCHES when holding — the rubato becomes readable in the geometry, not just the flow speed. Plus its one-breath vertical axis as an accessible single-gesture mode.
- Plus this piece's own hooks above: true 4/4 beat-pattern recognition (snap to his downbeats), a phase-vocoder engine option for cleaner extreme stretch, two-hand dynamics, and recordable conducted takes.
