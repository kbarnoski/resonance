**For**: kids (4+)

# A Day on the Wind (640-kids-day-wind)

A cycle-2 deepening of `624-kids-day-meadow` ("A Whole Day"). Route: `/dream/640-kids-day-wind`.

## The one question
What if a 4-year-old TENDS a self-evolving day-meadow by TILTING the iPad — steering a glowing wind that PLANTS living things where it lingers AND PLAYS the garden like a wind-harp where it sweeps — with no touching at all?

## The engine (a compact reimplementation of 624, self-contained in `page.tsx`)
- **Diurnal phase state machine (the spine).** A full day is `DAY_SECONDS = 540` (~9 min). A continuous `phase ∈ [0,1)` is sampled every frame and cross-faded through five regions (dawn, morning, midday, dusk, night) using soft circular smoothstep bump weights — no hard cuts. At any instant the scale, root, ostinato tempo, brightness, 3-stop sky gradient, cloud tint, sun/moon arc height, and star opacity are all BLENDED values. Each region has its own character: dawn = major-pentatonic/Lydian shimmer (indigo→rose, slow); morning = bright major (clear blue); midday = fullest playful major (brightest, sun at apex); dusk = warm Mixolydian/suspended (amber→violet, slowing); night = low glassy lullaby pentatonic + drone (near-black, stars + moon).
- **Motif-memory bank (the anchor).** Every planted thing stores a tiny **motif** = abstract scale-degrees + a rhythm. `voiceDegree(day, degree, octave)` RE-VOICES each stored motif into whatever scale the day is in *right now*, so everything stays harmonically valid as the day evolves. `mutatedDegrees(motif, age)` slowly mutates motifs with age (transpose / ornament / thin) so material coheres and evolves rather than loops — this is why minute 8 ≠ minute 1.
- **Chris-Wilson look-ahead scheduler.** A `setInterval(~25ms)` pump schedules notes ~120ms ahead via `osc.start(when)` against `audioCtx.currentTime`. It drives an always-on ambient bed (drone whose root + filter shift with phase, never silent), an evolving ostinato bed-line, every planted voice, AND the traveling-motif replay. Notes are never scheduled from rAF.
- **Persistent living things.** Low region → a flower (blooms by day, closes/sleeps at night, sings morning→dusk); mid → a bird (sings & glides morning/midday, roosts at night); sky → a star (visible & singing only at night). Color = pitch register. Capped at 24, oldest recycled.

## The NEW cycle-2 layer (the contribution)
- **Tilt steers a glowing wind spirit.** `DeviceOrientation` `gamma` (left-right) and `beta` (front-back) become a breeze vector; the first reading is captured as the neutral zero (calibration). The vector is clamped to ±1 and the wind's velocity/position is eased toward it (and bounces softly off the meadow edges), so it is gentle, not jittery. A luminous comet-sprite with a halo, orbiting sparkles, and a dwell-ring renders it.
- **Dwell-to-plant.** When the wind lingers at low speed (>0.18 normalized) over empty ground for ~0.75s, a living thing grows there — no tap. A filling ring previews the bloom; the plant confirms instantly with a re-voiced first-note chime (<50ms).
- **Sweep-to-play (the wind-harp — the heart).** Every frame, any planted thing within ~46px of the wind is "brushed": it immediately rings its motif's NEXT note (rate-limited per thing at 120ms). Steering across several things in a row plays them in PASSING ORDER = a glissando/arpeggio the child draws by leaning. The child plays their own garden.
- **Traveling motif memory (procedural MMR).** Each brush is captured (its abstract degree + octave + the inter-brush timing) into a rolling buffer of the last 8 sweeps. The scheduler periodically REPLAYS that captured sequence, quietly, re-voiced into the CURRENT phase's scale and transposed by a step (gentle mutation) — so a gesture the child swept at morning returns, transformed, at dusk, drifting under the live garden like a breeze carrying a remembered tune. It rests between passes.
- Everything is scale-snapped and re-voiced, so there is no "wrong", no fail, no score, no reading.

## How it deepens 624
624 was touch-to-plant on a self-playing day. 640 keeps that diurnal engine and motif bank but (1) replaces touch with **embodied tilt** — the whole iPad becomes the instrument — and (2) makes the wind a second authorial channel: it not only plants but **plays** the garden, and **remembers and re-voices the playing** as a traveling motif. The result is a longer-arc instrument where a morning gesture can echo back at dusk.

## Named references (cited)
- **MusicWeaver, *Motif Memory Retrieval*** — arXiv **2509.21714** (2026): stores realized motifs and retrieves + re-voices them with controllable variation, rather than looping or drifting. The traveling-motif replay is a procedural take on this.
- **Toshio Iwai, *Electroplankton*** (2005): playful, creature-as-instrument interaction.
- **Brian Eno, *Bloom***: generative, self-evolving, calm long-form.

## Kid-safe audio chain (required)
All audio routes through `masterGain (≤0.55, fades in over 2.5s) → lowpass (≤7000 Hz) → DynamicsCompressor (threshold −18, knee 6, ratio 12, fast attack/release) → destination`. Per-voice gains are capped, the master fades in so nothing thumps, there are no high-pitched rings or scary transients, and the `AudioContext` is created INSIDE the "Begin the day ☀" gesture for iOS unlock.

## Fallbacks + auto-demo
- **No DeviceOrientation / desktop:** Arrow keys (Up/Down/Left/Right) steer the wind. A hint shows which input is live.
- **iOS permission:** `DeviceOrientationEvent.requestPermission()` is called inside the start gesture; if denied or thrown, a large "Tap to allow tilt" button offers a retry while keys work meanwhile.
- **No audio:** if the AudioContext fails, visuals still animate (the scheduler becomes a no-op).
- **Idle auto-demo:** if untouched ~2.5s, the wind drifts on its own along a Lissajous path, planting (at its low-speed turning points) and brushing autonomously, and the day runs at an accelerated preview rate (~13×) so a silent glance still SEES the sun travel, sky shift, creatures wake/sleep, and the wind sweep the garden. On the first real tilt/key input the rate eases down to the full ~9-min day.

## Cleanup
On unmount: rAF cancelled, scheduler interval cleared, AudioContext closed, and orientation/keyboard/resize listeners removed.

## Next-cycle deepening
A natural cycle-3 step: let the wind's *shape* of motion (a fast figure-eight vs. a slow drift) modulate how the traveling motif is re-voiced — tempo, register, density — so the gesture's character, not just its pitch order, is remembered. Pair it with a gentle two-child mode where two winds (two devices) weave one shared meadow.
