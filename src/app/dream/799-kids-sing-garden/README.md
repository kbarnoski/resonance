**For**: kids (4+)

## Singing Garden

Sing into the mic and watch a living garden grow in real time — your voice shapes branching trees that glow and sing your melody back when you go quiet.

## How to Play

1. Press **Start Garden** (you may see a mic permission popup — say yes!).
2. **Sing, hum, or make any sound** into your microphone.
3. Watch a plant GROW while you sing — branches reach up with each note.
4. Go **quiet for a moment** — the garden will sing your melody back to you in soft bell tones, and all the plants will glow.
5. Sing again to grow another plant. The garden fills up over time!

## References

- **L-systems (Lindenmayer)**: Prusinkiewicz, P. & Lindenmayer, A. (1990). *The Algorithmic Beauty of Plants*. Springer-Verlag. The branching grammar used here is a simplified stochastic L-system where pitch drives angle and loudness drives branching density.
- **Mort Garson, *Mother Earth's Plantasia* (1976)**: The spiritual ancestor of this piece — synthesizer music composed for and about plants. The ambient pad drones evoke Garson's warm, unhurried synth textures.
- **Chris Wilson autocorrelation pitch detection**: The pitch detection algorithm is a JavaScript port of the normalized autocorrelation (ACF2+) method described by Chris Wilson in his Web Audio pitch-detection demos. It uses parabolic interpolation for sub-sample accuracy.
- **Pauline Oliveros, *Deep Listening***: The call-and-response structure — sing, pause, listen — is an echo of Oliveros's deep listening practice: attending fully to the sounds you make and the sounds that come back to you.

## Tags

- **INPUT** = mic / voice
- **OUTPUT** = three.js (WebGL)
- **TECHNIQUE** = voice → L-system growth + melody-memory call-response
- **VIBE** = calm warm daylight garden

## Known Weaknesses

- Pitch detection (autocorrelation) is unreliable for breathy or noisy environments; adding noise-gating or a median filter over several frames would help.
- The L-system grammar is static per phrase; a true adaptive grammar that evolves across phrases would be richer.
- Three.js cylinders are not tapered — using `TubeGeometry` along a CatmullRom spline would give more organic trunks.
- The ghost-hum fallback uses a fixed pentatonic sequence rather than a Markov chain or ML model.
- Plants accumulate in GPU memory; after ~50 plants, performance may degrade on low-end devices. A geometry-merging pass would fix this.
- The "goodnight" fade at 12 minutes is linear, not the gradual poetic dimming that a real installation would use.
