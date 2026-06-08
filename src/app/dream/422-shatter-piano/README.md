# 422 · Shatter Piano

**"What if you took a calm, consonant piano phrase and REFUSED to let it resolve — shattering it into a granular, time-frozen cloud that hangs, smears, and reverses instead of cadencing?"**

---

## What It Is

A gentle, ascending/descending piano-ish phrase (C4 → D4 → E4 → G4 → E4 → D4) is synthesised via `OfflineAudioContext` and rendered into an `AudioBuffer`. The phrase is deliberately shaped to *want* to resolve to C4 — it never does.

That buffer is then disassembled by a granular synthesis engine that continuously reads short fragments (grains, 20–160ms), applies Hann windowing, and re-schedules them at random positions, detunes, and with variable probability of reversal. The result is a cloud of frozen, smeared, time-suspended sound that refuses any sense of harmonic closure.

---

## Granular / Freeze Approach

**Grain scheduling:** Every `1000 / densityHz` milliseconds, a new grain is carved from the source buffer. Each grain:
- Reads from `position ± jitter` (scatter around the playback head)
- Gets a Hann (raised-cosine) window applied to avoid clicks
- Receives a random detune in the range `±detuneSpread` cents (via `AudioBufferSourceNode.detune`)
- Has `reverseProb` probability of being played backward
- Lands on a random stereo pan position

**Freeze mode:** When frozen, the grain read-head locks to `freezePos`, which then drifts *very slowly* (controlled by `freezeDrift`) so it never truly sits still — always hanging, never landing.

**The denial:** The phrase never reaches its implied resolution note (C4 at the end). Grains from the D4 moment get scattered, reversed, detuned into adjacent pitch space. The spectral-freeze effect ensures the "almost cadencing" moment stretches indefinitely into a cloud of smeared, unresolved tension.

**Signal chain:** `GrainBus → AnalyserNode → DynamicsCompressor (threshold: −6 dBFS, ratio: 12) → destination`. The compressor acts as a brick-wall limiter preventing clipping at high grain densities.

---

## Source Doors

1. **Default (always works, no network):** `makeSynthPhrase()` uses `OfflineAudioContext` to render a 4.2-second triangle-wave piano phrase with soft attack/decay envelopes. Works with zero network connectivity.

2. **Optional: Recording ID** — paste a recording ID into the text field; on submit the app attempts `fetch('/api/audio/' + encodeURIComponent(id))` → `arrayBuffer()` → `decodeAudioData()`. If anything fails, the synth phrase is silently kept. This hits an *existing* API route — this prototype does not create it.

3. **Optional: File drag-and-drop / file picker** — drag an audio file onto the page, or use the file browser button. The file is decoded via `decodeAudioData()`. If decoding fails, the synth phrase is kept.

All optional doors fail silently with a brief notice; the synthesised phrase is always the fallback.

---

## Why It Refuses to Resolve

The phrase is harmonically structured (C major pentatonic ascending/descending) and voiced to imply a cadence — but the final note (C4 tonic) is never played. The granular engine then:
- **Freezes** the D4 moment (the leading tone relationship to C4), looping it indefinitely
- **Reverses** grains (≈25% by default, rising to 45% in the auto-demo arc), so forward melodic motion becomes backward pull
- **Detunesspread** ±180¢ by default means the D4 grains spread microtonally into no-man's land — neither D4 nor C4, but smeared between
- **Position jitter** means no two consecutive grains read from the same moment, preventing any sense of pulse or meter that would imply resolution

The "Shatter it" auto-demo arc makes this explicit: clean phrase plays at 0s → shatter begins at 2.2s → chaos ramps at 5s → full freeze at 8.2s.

---

## DOM / CSS Visualisation

The spectrum is rendered as a **frequency-bin × time-smear grid** of 512 absolutely-positioned `<div>`s (32 cols × 16 rows), animated each rAF frame:

- **Column = frequency bin** (mapped from `AnalyserNode.getByteFrequencyData()`)
- **Row = time smear** (older rows receive a decay multiplier, simulating spectral history)
- **Opacity/scale** scale with bin amplitude
- **Color** is hue-mapped: blue/violet for low-frequency bins, warmer for high; frozen state shifts everything toward cold violet/indigo
- **CSS transform: translate + scale** glitch randomly during shattering/freeze — cells drift and stretch based on `sin(time + bin) × intensity`
- **CSS filter: blur** applied to high-energy frozen bins for a smear feel
- **Border glow** appears on active (amplitude > 0.55) bins

No canvas, no SVG, no WebGL. DOM nodes are created once and their `.style` properties are mutated per frame. Maximum 512 cells.

---

## Technical References

### Phase vocoder / spectral freeze
- **Flanagan, J.L. & Golden, R.M. (1966).** "Phase vocoder." *Bell System Technical Journal* 45(9), 1493–1509. — foundational phase-domain analysis/resynthesis.
- **Dolson, M. (1986).** "The phase vocoder: A tutorial." *Computer Music Journal* 10(4), 14–27. — accessible treatment of spectral freeze as a degenerate phase-vocoder case.

### Granular synthesis
- **Xenakis, I. (1971).** *Formalized Music.* Bloomington: Indiana University Press. — granular/stochastic composition theory.
- **Roads, C. (2001).** *Microsound.* Cambridge, MA: MIT Press. — comprehensive treatment of granular synthesis, time-stretching, and grain scheduling.

### Contemporary touchstone
- **arXiv:2507.19202** — "Latent Granular Resynthesis using Neural Audio Codecs" (2025). Proposes encoding audio into codec latents then granularly resampling from the latent space, connecting classic granular synthesis to neural audio. This prototype is acoustically adjacent (granular frozen-cloud approach from a synthesised phrase) though does not use neural codecs.

### What is unverified
- The arXiv:2507.19202 paper reference is cited as a contemporary touchstone per the brief. As of the knowledge cutoff it had not been independently reviewed here — treat as an indicative reference, verify via arXiv directly.
- The Flanagan & Golden (1966) and Dolson (1986) dates/titles are widely cited in the computer music literature and are believed correct, but the specific page ranges have not been verified in this session.
- The claim that the phrase "wants to resolve to C4" is a musicological interpretation (V-area harmonic suspension), not a formal proof.

---

*Built for the Resonance dream lab. No new npm dependencies. No network required for default operation.*
