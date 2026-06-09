**For**: kids (4+)

Hold up your phone and sweep it through a 3-D night sky to scoop up drifting glowing motes into a growing personal constellation — each mote you gather adds a new voice to a slowly evolving generative lullaby.

## What it does

A deep indigo night-sky rendered with **three.js** surrounds you in every direction. ~30 soft glowing motes in vivid colours drift slowly around the sphere. On phone: tilt and sweep the device using the **gyroscope (deviceorientation)** to look around — a soft purple aura reticle sits at screen centre; hold it over a drifting mote for a moment and it is scooped up with a bell chime, flies to join your **constellation** cluster, and begins singing a sustained pentatonic tone. On desktop: drag to look around. A **hands-free auto-demo** starts immediately on load — the camera sweeps the sky on its own and gathers the first few motes so the lullaby starts building itself before any interaction.

## Design

Every gathered mote becomes a permanent voice in a **long-form generative lullaby** built from the D-major pentatonic scale (D E F# A B across two octaves) — any combination is consonant, so there are no wrong notes. The piece is perceptibly different at minute 3 than at minute 0:

- **Root drift**: the ambient pad's root and fifth frequency ramp through a short cycle of pentatonic-friendly centres (D2 → E2 → A2 → D2) on an ~8-minute period, so the harmonic "gravity" of the piece slowly migrates.
- **Slow filter LFO**: a lowpass filter on the ambient pad modulates its cutoff on a ~4-minute cycle, giving the texture a long breathing quality.
- **Arpeggio rate evolution**: each gathered voice's pulsing arpeggio rate starts slow (0.25 pulses/sec) and very gradually increases with both its own age and the global elapsed time — after ~5 minutes voices sound busier and more interwoven.
- **Goodnight fade**: at ~12 minutes all voices and the pad gently fade over 2 minutes, settling into silence for bedtime.

All audio routes through a **DynamicsCompressor** brick-wall limiter before the destination — safe for small ears at any volume. Spatial panning uses **StereoPannerNode** (works on phone speakers; not HRTF) to spread gathered voices left/right across the constellation.

## References

- **"Magic window" gyro-stargazer interaction** — the 3-DoF camera controlled by device orientation without a headset, pioneered by Google Cardboard-era WebVR demos.
- **Brian Eno / generative-music lineage** — long-form, slowly evolving pieces where the same system sounds different at minute 1, 5, and 12 (cf. *Discreet Music*, *Music for Airports*).
- **3-DoF spatial audio via StereoPanner** — chosen over HRTF because it works reliably on mono/stereo phone speakers without the binaural-headphone dependency.

## What's unverified

- True iOS DeviceOrientation permission flow tested in Safari on-device only at build time; the emulator cannot fire real gyro events.
- The ~8-min root-drift cycle and ~12-min goodnight fade are untested at full length (only the scheduling math is verified).
- Three.js `AdditiveBlending` bloom appearance varies across mobile GPUs — may look punchier or flatter depending on the device.
- Auto-demo auto-gather relies on proximity sorting in screen-space; on very small viewports the first few motes may take a few seconds longer to appear "in view" before the auto-grab triggers.
