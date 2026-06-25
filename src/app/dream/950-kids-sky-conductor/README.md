# Sky Conductor (`/dream/950-kids-sky-conductor`)

**One-line pitch:** Two 4-year-olds, each on an iPad, become a tiny orchestra — one CONDUCTS the warm chord the sky is on, the other PLAYS notes that automatically fit that chord — so they make real harmony together and nobody can play a wrong note.

## The two roles (where the harmony actually comes from)

- **CONDUCTOR** (Player A): tilts / sweeps the device left–right (gamma) — or drags across the screen when tilt is unavailable — to (a) set a gentle, kid-safe tempo (60–108 bpm) and (b) walk a warm **I–IV–V–vi** progression (**C → F → G → Am**). The current chord **colors the whole sky** and is broadcast to the partner as `{role:'conductor', chord, bpm}`.
- **PLAYER** (Player B): taps anywhere to drop bright note-blooms. Each tap's pitch is **snapped to a chord tone of the conductor's CURRENT chord** (`voiceTap()`), with higher taps = higher chord tones. So every single tap harmonizes — there is no wrong note. Sent as `{role:'player', note}`.

Both children HEAR the full result locally: a warm always-on **chord bed** (the harmonic context, driven by the conductor) + a **bell melody** voiced into it (the player). A big **swap** button trades roles.

## Why this is real harmony — and why it's *social/structural*, not a voice-leading engine

The music is genuine chord-over-melody: a moving chord progression with a melody locked to whatever chord is currently sounding. But the structure is produced by the **role split**, not by an algorithm reasoning about voice leading. The conductor supplies the *context* (which triad we're in); the player *fills* it (any chord tone). Two complementary parts interlock — that is the whole idea, and it keeps the experience fresh and legible to a 4-year-old. Pitch/harmony is the point: real chord changes you can see (the sky's color) and hear, plus a melody that can't clash. Deliberately **not** "pitch held dumb / drone + texture."

This deepens the shipped `918-kids-starlight-friend` (two kids, identical roleless shooting stars) by adding **asymmetric roles** and **real harmonic context**.

## References

- **The Hub / The League of Automatic Music Composers** — networked-ensemble music where tiny messages travel between nodes and each node sounds locally. Our WebRTC role events (`chord/bpm`, `note`) are exactly this: a few bytes cross the wire; both peers synthesize independently.
- **Orff Schulwerk** — children's-ensemble pedagogy built on simple, complementary parts (a drone/bordun + a pentatonic-safe melody) so kids make music together *before* they can play "wrong." The conductor/player split is an Orff-style ensemble: one holds the harmonic ground, the other improvises safely on top.
- **Frontiers in Psychology (2026) group-music-game study with 5–6-year-olds**, where the **instrumental-ensemble phase itself** (not just the surrounding game) drove cooperative behaviour — evidence that *making an ensemble sound together* is the active ingredient, which is precisely what the two roles here force.

## Renderer

- **Primary: raw WebGPU (WGSL)** — `gpu.ts`. A single full-screen fragment shader paints the warm sky whose gradient *is* the current chord color, a conductor-driven shimmer band that pulses with the beat/tempo, twinkle dust, and expanding note-blooms where the player tapped. We declare just-enough local WebGPU interfaces (no `@webgpu/types` dependency, no bare `any`), matching the lab's other WebGPU prototypes.
- **Fallback: hand-written raw WebGL2** — `glfallback.ts`. The same scene via an equivalent GLSL ES 3.00 fragment shader on a full-screen quad. Both renderers consume the identical `SkyState` (`scene-types.ts`), so the experience is the same whichever path runs.
- **Neither available:** a clearly-visible `text-rose-300` notice; audio + minimal DOM stay alive (never a dead end).

## How it degrades

- **No friend connected →** a **ghost friend** plays the OTHER role within ~1s. If you're the PLAYER, the ghost gently conducts the progression; if you're the CONDUCTOR, the ghost taps a soft melody into your current chord. So a hands-free 6:30am glance sees the sky changing color and hears evolving chord-over-melody immediately. The ghost bows out the instant a real data channel opens (and re-points to the new opposite role when you tap **swap**).
- **No WebRTC / CompressionStream →** invite UI is hidden; runs fully solo with the ghost (the full experience).
- **No WebGPU →** raw WebGL2. **No WebGL2 →** rose notice, audio continues.
- **No tilt permission (or non-iOS without sensors) →** on-screen drag conducts; the experience is unchanged.

## Networking (serverless WebRTC, reimplemented from 918 — not imported)

Host `createOffer()` → wait ICE → gzip the SDP via `CompressionStream('gzip')` → base64url into a `#join=` link. Guest opens the link, auto-answers, shows a gzipped answer code; host pastes it back. Data channel is `ordered:false, maxRetransmits:0`. Messages are tiny role events; both peers render + synth locally.

## Audio (Web Audio, synthesized live)

Master chain: `gain 0.24 → lowpass ~6.5kHz → DynamicsCompressor(-10/20:1) → destination`. An always-on warm pad **chord bed** (triad + soft sub-octave, breathing LFO) that glides to each new chord, plus bell/triangle melody notes with ≥20ms soft attacks. No audio files, no npm deps.

## Honest "not yet verified" note

- **No real two-device connection has been tested** — the WebRTC handshake mirrors the working 918 pattern but a genuine host↔guest connect across two devices was not exercised in this container.
- **No GPU was available in the build container**, so neither the WebGPU nor the WebGL2 path has been visually run here. They typecheck and follow a known-good WebGPU prototype's structure; the WGSL/GLSL shaders have not been executed.
- Tilt conducting (`deviceorientation`) is unverified on a real iPad (no device); the drag fallback is the tested-by-construction path.
- `next build` / a real browser pass is left to the orchestrator.
