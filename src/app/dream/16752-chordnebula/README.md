# 16752-chordnebula — Inside the recording

**Status:** Demoable. three.js volumetric raymarched nebula driven by Karel's real catalogue (live FFT + analysed chords). Compiles clean under `tsc --noEmit`. Degrades gracefully when WebGL, audio, or analysis is missing.

## The "what if"

What if you could step _inside_ one of Karel's recordings and drift through it as a place? This is the cosmic-ambient pole: a full-screen three.js fragment shader raymarches a cloudy 3D density field (FBM noise) lit from within, and you slowly float forward through it. His track plays, and the nebula **breathes** with the music — the live FFT swells its density and glow. But the heart of it is harmony as light: the **chord actually sounding in the recording** sets the nebula's hue and structure. Each sounding pitch-class blooms a coloured light-core inside the cloud; consonant chords carve open, calm luminous caverns; dense or altered chords thicken and darken the medium. Meditative, boundless, slow — a place to be inside, not an assault.

## How it works

- **Rendering** — one `three.js` `ShaderMaterial` on a full-screen quad (`OrthographicCamera` + `PlaneGeometry(2,2)`), the standard three.js fullscreen-raymarch pattern. The fragment shader marches ~56 steps through a 5-octave value-noise FBM field, integrating emission/absorption front-to-back with Beer–Lambert transmittance (a genuine volumetric field — no surface, no normals). The field flows toward the camera in +z so you drift forward without the camera translating. Downscaled to a ~760px long side and DPR-capped for 60fps on integrated GPUs; a per-pixel dithered ray start hides banding.
- **Breath (FFT)** — `master.analyser.getByteFrequencyData` (fftSize 1024) is split into bass / mid / treble / overall bands. Bass swells the whole medium, treble adds fine FBM detail, overall energy lifts the glow and a gentle (sub-strobe) luminance breath.
- **Chord → colour + structure** — the current chord (from `loadTrackAnalysis().chords`, matched against playback time) is parsed in `chordField.ts` into its sounding pitch-classes plus a consonance and a density scalar. Twelve light-cores (one per pitch-class) sit on a slowly rotating helix drifting through the tunnel; a core's brightness is its pitch-class's activation, its colour a point on a restricted violet→magenta→warm ramp offset by the chord root's hue. Consonance raises the cloud's carving threshold (open caverns); chord density lowers it (thick medium); minor/diminished quality cools and dims the cores. Cross-fades are slow, so chord changes bloom rather than flicker.
- **Input** — catalogue playback is primary (track picker + play/pause over the 13 Welcome Home tracks); pointer move and device tilt gently steer the look direction (secondary).

## Hard-constraint compliance

- **Audio is Karel's real verified catalogue only** — `WELCOME_HOME_TRACKS` + `loadRealTrackBuffer`, routed through `createSafeMaster` (every node into `master.input`, never `ctx.destination`), FFT read from `master.analyser`. No oscillators, no synthesised or generated audio anywhere.
- **Graceful degradation** — no WebGL → on-brand notice, no crash; audio load failure → `text-destructive` message, nebula keeps drifting; no analysis → neutral violet hue drift (`hasChord = 0`).
- **Full teardown** on unmount — stops + disconnects the source, `master.disconnect()`, `ctx.close()`, `cancelAnimationFrame`, `renderer.dispose()` + `forceContextLoss()`, geometry/material disposed. Handles resize.
- **House style** — dark minimal chrome, semantic tokens, `text-base` body / `text-xl`+ semibold headings, no `font-serif`, brand button classes, notes modal. Raw colour lives only inside the shader art. No film-grain/noise composite pass; motion is a slow drift with no strobe (>~3Hz avoided; luminance change is slow and eased).

## Named references (cited honestly)

- **Íñigo Quílez — volumetric raymarching / "Raymarching clouds."** The core technique: marching an FBM density field and integrating emission/absorption along the ray. This piece uses that structure directly (value-noise FBM, front-to-back transmittance); the cloud lighting here is by in-scattering from the chord cores rather than IQ's sun-toward density taps.
- **Refik Anadol — _latent_ nebula aesthetics.** Aspirational reference for the boundless, luminous, drifting "data-nebula" mood and the violet-forward-blooming-to-warm palette. No model, dataset, or code of Anadol's is used — purely a look-and-feel touchstone.
- **"Chord Colourizer," arXiv 2510.10173 (chord → colour).** Inspiration for mapping harmony to colour. This prototype implements its own lightweight chord→colour scheme (root hue anchor + per-pitch-class cores + consonance/density scalars), not the paper's method; cited as the conceptual lineage, not a reimplementation.

## Files

- `page.tsx` — client component: three.js mount + render loop, catalogue playback, FFT band reading, chord tracking, pointer/tilt look, teardown, chrome.
- `scene.ts` — `NebulaScene` (three.js renderer + fullscreen ShaderMaterial) and the raymarch shader; `hasWebGL` probe.
- `chordField.ts` — parse a chord symbol into pitch-class activations + consonance + density + quality.
