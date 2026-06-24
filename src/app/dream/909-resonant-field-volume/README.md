# 909 · Resonant Field

**What this is.** A GPU spatial-timbre room. The visitor makes any sound into
their mic — sing, hum, speak, play an instrument — and that sound is (a)
re-synthesised back around them as a 3D cloud of HRTF-panned grains and (b)
bloomed on screen as a raymarched volumetric nebula. Both outputs are driven by
**timbre only** (brightness, noisiness, loudness, change). There is **no pitch
detection, no notes, no scales, no chords**. Pitch is held deliberately dumb.

**The exact interaction.** Tap **Start mic** (this creates/resumes the
`AudioContext` inside the gesture and requests the mic). Make a sound. Quiet
sounds scatter a few sparse grains low and near you; loud sounds become a shower;
bright sounds float high and far in front; noisy/breathy sounds spread wide;
tonal sounds pull to centre. The nebula warms and thickens while you sound and
slowly cools in silence. With headphones the grain cloud is fully spatial.

## Design notes

### Timbre → space mapping

| Feature (pitch-free) | Granular placement | Field (shader) |
| --- | --- | --- |
| **RMS** (loudness) | grain density: silence = sparse, loud = a shower | overall density + luminosity |
| **Spectral centroid** (brightness) | elevation (y) + forward distance (-z) | palette hue + glow altitude |
| **Spectral flatness** (noisy↔tonal) | azimuth spread/width of the scatter | domain-warp turbulence / diffusion |
| **Spectral flux** (change/onset) | radial outward kick on transients | injected density bursts / flare |
| **8-band log silhouette** | — | tints different raymarch depths |

Each grain is a Hann-windowed slice (~40–120 ms) read from a rolling ~3.5 s ring
buffer of the visitor's own audio and routed through its **own `PannerNode`
(`panningModel: "HRTF"`)** placed at the timbre-dictated 3D position. Grains
**keep the source's own pitch** — `playbackRate` is always `1`; we never repitch
by any musical rule.

### Why pitch is held dumb

The whole thesis is *music made from **timbre × space**, not pitch theory.* So
the feature extractor computes **no autocorrelation and no frequency-to-note
mapping** — only loudness, brightness, noisiness, change, and a coarse spectral
silhouette. Harmony is pinned flat by **one fixed dumb drone**: a sustained ~55 Hz
root plus a single fixed fifth partial (~82.5 Hz), lowpassed and quiet. It never
changes, never follows a melody. All expressive movement lives in *where* the
texture lands in space and *how* the cloud is shaped — never in *which note*.

### Memory / relaxation (uAge)

The field is a long-form evolving nebula, not a per-frame VU meter. A `uAge`
accumulator rises quickly while sound is present (rate ≈ 0.6) and cools slowly in
silence (rate ≈ 0.06). `uAge` warms the palette, thickens the cloud density,
lifts the base luminosity, and keeps a faint base-wash glow so silence is never
pure black. The Canvas2D fallback mirrors this with a soft frame-fade smear.

### Raymarch approach

A three.js fullscreen `ShaderMaterial` on an orthographic 2-triangle quad. The
fragment shader marches **24 steps** (modest, for mobile headroom; pixel ratio
clamped to 1.75, `powerPreference: "high-performance"`) through a **domain-warped
FBM** density field. Flatness drives warp turbulence, flux injects bursts, RMS
and uAge raise density/luminosity, centroid biases glow altitude and palette hue,
and the 8 bands tint depth layers. A slow camera orbit + drift gives parallax. No
WebGL → a Canvas2D additive-glow fallback runs the *same* feature data.

### Auto-demo (hands-off review safety)

If the mic is denied, or after ~2.5 s of near-silence with a granted mic, a
**synthetic internal source** (looping filtered noise with an LFO-swept bandpass +
a breathy saw partial + amplitude breathing) is fed into the **same analyser and
the same capture ring**. The nebula blooms and grains scatter within ~1 s with
zero input. Real sound dominates the features the moment it returns.

## Research citation (anchor)

- **Delta Sound Labs — *XStream*** (announced at **NAMM, 25 January 2026**): a
  spatial *live* granular synthesiser that captures live audio and places grains
  via **Steam Audio HRTF** spatialisation. This piece is a deliberate
  **inversion** of XStream: grain placement here is **automatic and
  timbre-driven**, not knob-driven — the visitor's *timbre* steers the spatial
  scatter, they never set positions by hand.
- **Curtis Roads, *Microsound* (2001)** — the granular / micro-time-scale
  foundation for windowed-grain re-synthesis.
- **Trevor Wishart, *Audible Design*** — timbral morphology as the compositional
  material (sound shaped by texture, not note grammar).
- **Refik Anadol** — volumetric light fields as data made into inhabitable space
  (the nebula's aesthetic anchor).

## Honest warts / to verify on real device

- HRTF spatialisation is only convincing **on headphones**; on phone speakers the
  3D scatter mostly collapses to L/R. There is a headphones hint, but speaker
  playback is a degraded experience.
- The capture ring is tapped via an `AnalyserNode` time-domain read once per
  animation frame (dependency-free). At 60 fps with `fftSize` 2048 this samples
  the stream but can drop a few samples between frames — fine for grainy texture,
  not sample-accurate. Verify there's no audible aliasing on a real device.
- Per-grain `PannerNode` allocation at high RMS (~60 grains/s) is the main CPU
  risk on low-end phones; grains self-disconnect on `onended`. Watch for GC
  hitches during a sustained loud "shower."
- Once the auto-demo starts after silence, the demo bed continues underneath
  renewed singing (both feed the analyser); real sound dominates the features but
  the demo does not fully stop until you reload. This keeps the field alive but
  means "take over" is additive, not a hard handoff.
- iOS Safari autoplay/HRTF panner behaviour should be confirmed on device; the
  context is created/resumed inside the Start-mic gesture as required.
