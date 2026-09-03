# Morning digest — last updated 2026-09-03T~01:00Z (cycle 1216)

> **I took the biggest swing on the board — and it's now something your phone can actually render.** For months the jury has called the never-built **WebGPU-compute field driven by your harmony** the single biggest available swing. Last night I banked it because "WebGPU is spotty on iPhone." This cycle's research killed that excuse: **WebGPU has shipped enabled-by-default in Safari on iOS 26 for ~a year now.** So I built and shipped it.

## New since yesterday
- **[16768-harmonicswarm](https://getresonance.vercel.app/dream/16768-harmonicswarm)** — *your chord progression IS the rules of attraction for a living swarm.* ~12,000 particles (dialable) simulated **entirely on the GPU** (raw WebGPU compute), split into six species. The 6×6 **attraction matrix** — who pulls toward whom — is **rewritten every time the chord in your recording changes**: consonant/major chords knit the swarm into glowing filaments; minor/tense/altered chords flip the weights negative and it scatters into churn. Pitch-classes tint the species; the bass drives the energy. **Why open this:** it's harmony you can *see the physics of* — not a spectrum bar, but emergent structure that forms and dissolves with the actual chords you played. Open it on your phone, sound up.

## Also built, banked ready-to-ship (2 of 2 explored)
- **16784-tidalchord** — the **flow-field/fluid** sibling: instead of an attraction swarm, up to 120k particles drift along a GPU-computed **curl-noise current** whose vorticity and color your harmony reshapes (major → wide laminar sweeps that carry you; minor → tight vortices). Fully built + clean — I banked it because it's the riskier of the two to render un-tuned on a phone (needs a real-hardware exposure/trail pass). Ships on any non-DOM cycle. (IDEAS §1216)

## How this cycle went
- **DEEP ×2**, orchestrated: two parallel builders, one concept (your harmony drives an emergent GPU-compute field), two genuinely different techniques (N-body attraction swarm vs advective curl-noise current). Both raw WebGPU — off three.js (which is at 3× now), off Canvas2D, off the whole manuscript tag-stack. Shipped the one that's safest to actually render legibly on your phone; banked the other.

## The one thing I still need from you (unchanged)
- **A listen / a look.** The audio-forward manuscript backlog (cadencemap etc.) still needs your ears — no build unblocks that. But like chordnebula yesterday, harmonicswarm is mostly an **eye** call and your phone can render it. Two verifications available in two mornings: yesterday's nebula, today's swarm.

## Open questions for Karel
- Does the swarm read as *filaments-vs-churn tracking the harmony* — can you see the chords in the structure — or is it just pretty particles?
- On your actual iPhone: does it hold a smooth framerate at the default 12k? (Dial to 6k if it stutters; tell me and I'll drop the default.)
