# Wave Organ

**For**: kids (3+)  
**Built**: Cycle 222 (2026-05-28)  
**Status**: demoable  
**Permissions**: none · API: none · deps: none · 2.56 kB

---

## What it is

A dark ocean at night. Seven glowing organ pipes rise from the sea floor, from tallest on the left (C3, violet) to shortest on the right (G4, rose). An autonomous wave rolls across the water surface — when the water rises over a pipe's mouth, the pipe sings; when the water falls away, it fades to silence. Tap anywhere to send a wave surge splashing over the pipes and hear deep tones join the high ones.

## Interaction

- **Before first tap**: the wave is already moving and the three shortest pipes (C4, E4, G4) are already playing a quiet major chord. The prototype is alive on load.
- **Tap anywhere**: sends a Gaussian surge toward the tap point. The water wells up, temporarily submerging the taller pipes (lower notes: A3, G3, E3, and at strong taps, C3). As the surge passes, the deep notes fade back into silence.
- **Multiple taps**: overlapping impulses stack, creating dramatic swells where all 7 pipes play simultaneously.

## Sound design

- Triangle oscillators (warm, organ-like tone with odd harmonics)
- Smooth 140ms attack / 220ms release using `setTargetAtTime` — no clicks, gentle breathing
- Short plate reverb (1.8 s impulse response, 22% wet) for spatial warmth
- Pentatonic: C3–E3–G3–A3–C4–E4–G4. No wrong combinations.
- Master gain 0.65 prevents clipping even with all 7 pipes playing

## What's new

**Wave submersion as the musical trigger.** All prior wave-related kids prototypes use waves as decoration or as sources of individual note events (ripple-pond: collision trigger; rain-drum: falling drops; gravity-harp: balls traversing strings). This is the first where the *height* of a continuous wave surface governs which notes are currently active. The wave IS the score — not a trigger.

**Rest-state harmony.** The undulating wave keeps 2–3 short pipes perpetually submerged at rest. The prototype is not silent until a tap; it already has a harmonic environment before first touch. The first tap deepens that harmony by waking the lower pipes.

**Physical narrative.** The BANDIMAL rule (taller = lower) maps directly to the wave's behavior: small crests only wet the short pipes (high notes), big surges reach the tall pipes (deep notes). A child who watches the wave notices this without explanation. Tapping near the tall C3 pipe to "wake" it is a self-discoverable reward.

## Design lineage

- `133-kids-ripple-pond` ❤️ — wave motion as the core aesthetic; overlapping circular wave geometry
- `184-kids-gravity-harp` ❤️ — physics triggers on pentatonic KS strings; gravitational descent
- `166-kids-lantern` ❤️ — dark canvas, glowing objects alive before first touch
- `160-kids-paint-loop` ❤️ — layered, contemplative, always-in-motion

## Polish ideas (future cycles)

- **Amplitude slider** (outside play area, parent-accessible): control the natural wave height. Low = gentle C4/E4/G4 drone; high = all pipes constantly active.
- **Underwater glow**: when a pipe is submerged, draw a diffuse radial glow on the water surface above it (additive blend), so the water literally glows above the sounding pipes.
- **Second harmonic overtone**: add a second OscillatorNode at `freq * 2` with gain 0.08 per pipe, giving more organ-like richness.
- **Coastal soundscape**: very quiet ambient noise (white noise through a 300 Hz lowpass) as a "shore wash" background — barely audible, but eliminates the "empty" feeling between wave crests.
