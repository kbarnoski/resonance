# Resonant Pair

An asymmetric two-hand camera-conducting instrument where your right hand is the melodic **VOICE** and your left hand is the harmonic **GROUND** over one solo-piano recording — and the two only fuse into a single coherent standing figure when you negotiate them into resonance.

**Status:** Demoable prototype. Raw WebGL2 fragment-shader interference field + granular/resonant Web Audio, driven by MediaPipe two-hand tracking with a pointer + slider fallback. Runs in the browser against Karel's real catalog; degrades gracefully with no camera and no WebGL2.

## How to use it

1. Press **Play & negotiate**. Karel's take (default *Interplay*, selectable) is fetched and decoded once into an `AudioBuffer`; both hands act on that same buffer.
2. Grant the camera for two-hand conducting, or skip it — the pointer conducts the VOICE and on-screen sliders shape the GROUND.
3. **Right hand = the VOICE (figure / melody).** A granular scrubber reading his take:
   - horizontal position → playhead in the buffer
   - height → grain playback rate (0.6×–1.8×, pitch)
   - openness → grain density (~6–50 grains/s)
   - fist → mute (fades)

   Bright, articulated, foreground, panned slightly right. Each grain is a short (30–120 ms) `AudioBufferSourceNode` window with a raised-cosine (Hann) envelope.
4. **Left hand = the GROUND (harmonic bed).** A sustained resonant wash of the *same* take through a `BiquadFilter` (bandpass):
   - horizontal position → filter center (~120 Hz … 3 kHz, log-mapped)
   - height → wash level
   - openness → resonance Q (0.5 … 12)
   - fist → mute

   Dark, sustained, background, panned slightly left.
5. **Negotiate resonance.** Watch the `resolve` meter (top-left). Move the ground's filter center to match the brightness the voice is producing, and balance their levels, and `resolve` climbs toward lock.

## The asymmetric roles + wave-interference design

The two hands hold genuinely **different** powers — this is not a mirror. One paints a foreground melodic figure by scrubbing grains; the other sculpts a background harmonic bed by resonant filtering. Neither alone is the whole; the piece is about the *relationship* between them.

**Negotiation → `resolve ∈ [0,1]`.** Every frame the spectral centroid of the tamed master signal is computed from `master.analyser`. `resolve` rises when the LEFT hand's filter center matches that centroid (primary term, log-frequency closeness within ~1.6 octaves), and when the two hands' levels balance (secondary term). It is smoothed toward its target with a ~0.15 s time constant, so fusion feels negotiated, not switched.

- **High resolve (lock):** the two shader wave systems interfere **constructively** — the summed "beating" field crosses over to a multiplicative **moiré lattice**, a coherent warm standing figure, bright and unified. The stereo split collapses toward center, and a tame, safeMaster-capped **harmonic reinforcement ring** (a parallel peaking resonance of his own signal at the matched frequency) sounds.
- **Low resolve (contention):** the wave systems interfere **destructively** — the field tears into two horizontally-separated bodies (fine voice ripples drift right, broad ground standing waves drift left) and desaturates toward warm-ash (never cool).

**The shader.** A raw WebGL2 full-viewport fragment shader (`webgl2` context, passthrough vertex + full-screen triangle via `gl_VertexID`, guarded compile/link) computes two wave systems: the VOICE as fast, fine, bright ripples whose frequency and phase follow the granular playhead + rate; the GROUND as slow, broad, warm standing waves whose spatial frequency follows the filter center. They are blended from a sum (apart) to a product/lattice (locked) by `resolve`. Warm palette only — ember → amber → gold → near-white at lock — with **no film-grain / noise overlay** (ordered structure by design). Uniforms carry time, RMS + low/mid/high band energies, both hands' features, and `resolve`.

## Degradation notes

- **No camera / permission denied / model load failure:** the pointer drives the VOICE (x = playhead, y = pitch) and on-screen sliders shape the GROUND (filter center, wash level, resonance Q, mute); a visible notice explains. One hand visible drives the VOICE while the sliders hold the GROUND.
- **No WebGL2:** a minimal Canvas2D interference render computes the same two-wave field at low resolution and scales up, with a visible notice.
- **Audio safety:** every node path terminates in the shared `safeMaster` bus (high-shelf cut, lowpass cap, limiter, trim) — never `ctx.destination` directly. Only Karel's real decoded buffer is ever heard (granulated + filtered); there are no oscillators, no synthesis, and no microphone.
- **Latency is the craft:** detection runs on the rAF loop, grains are scheduled with a ~100 ms lookahead, and every parameter is smoothed (~0.12 s) — no `await` in the gesture→sound path.

## References

- **Huì Sù — "Co-constructing a Dual Feedback Apparatus" (arXiv 2604.25207)** — asymmetric two-performer roles negotiating a shared apparatus, the direct lineage for giving each hand a genuinely different power rather than a mirrored one.
- **Musical figure / ground** — the melody-vs-harmonic-bed distinction: the VOICE is the articulated foreground figure, the GROUND the sustained harmonic bed, and the piece stages their fusion.
- **The two-hand conducting lineage** in this lab — `15824-canon` (two hands driving two independent voices of one take) and its `duetlink` / dual-playhead relatives (`17312-timeheads`), extended here from symmetric counterpoint into an asymmetric, negotiated figure/ground pair resolved through wave interference.
