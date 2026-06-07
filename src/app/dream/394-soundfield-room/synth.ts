/**
 * synth.ts — Sustained drone voices in just intonation
 *
 * Tonal palette: A overtone series (A2 = 110 Hz as the fundamental)
 *   Voice 0: A2  = 110 Hz  — deep sub drone, sine
 *   Voice 1: E3  = 165 Hz  — perfect 5th (3/2), filtered saw
 *   Voice 2: A3  = 220 Hz  — octave (2/1), warm pad (triangle + detune)
 *   Voice 3: C#4 ≈ 275 Hz  — major 3rd via 5/4 = 137.5 Hz → ×2 = 275 Hz, sine pad
 *   Voice 4: E4  = 330 Hz  — 5th on octave (3/1 of A2), bell-ish FM
 *   Voice 5: G4  ≈ 385 Hz  — 7th harmonic (7/2 of A2), muted filter saw
 *
 * All values are exact integer-ratio just intonation — no equal temperament.
 *
 * Each voice has:
 *   - A slow amplitude LFO (rate 0.05–0.15 Hz, depth 25–40%)
 *   - A slow filter-cutoff LFO (rate 0.03–0.08 Hz, depth 0.5–1.5 octaves)
 *   - Distinct timbre so you can spatially locate each one by ear
 *
 * NOT D-Dorian. NOT C-pentatonic. Just intonation on A.
 */

export interface VoiceConfig {
  /** Label for the radar */
  name: string
  /** Base frequency Hz */
  freq: number
  /** Azimuth in radians (0 = front, +CW = right) */
  az: number
  /** Elevation in radians (0 = horizon, + = above) */
  el: number
  /** CSS colour for radar dot */
  color: string
}

export const VOICE_CONFIGS: VoiceConfig[] = [
  { name: "A2",  freq: 110.00, az:  0,                 el:  0,             color: "#c4b5fd" }, // front
  { name: "E3",  freq: 165.00, az:  Math.PI * 2 / 3,   el:  0,             color: "#93c5fd" }, // right 120°
  { name: "A3",  freq: 220.00, az:  Math.PI,            el:  0,             color: "#6ee7b7" }, // back
  { name: "C#4", freq: 275.00, az: -Math.PI * 2 / 3,   el:  0,             color: "#fcd34d" }, // left 120°
  { name: "E4",  freq: 330.00, az:  Math.PI / 4,        el:  Math.PI / 4,  color: "#f9a8d4" }, // up-right
  { name: "G4",  freq: 385.00, az: -Math.PI / 4,        el: -Math.PI / 6,  color: "#fb923c" }, // low-left
]

interface VoiceNodes {
  oscNodes: OscillatorNode[]
  filterNode: BiquadFilterNode
  ampGain: GainNode
  ampLfoOsc: OscillatorNode
  ampLfoGain: GainNode
  filterLfoOsc: OscillatorNode
  filterLfoGain: GainNode
  outputGain: GainNode
}

/**
 * SynthEngine: creates and manages the 6 sustained drone voices.
 * Each voice's outputGain should be connected to an AmbisonicField encoder.
 */
export class SynthEngine {
  private ctx: AudioContext
  readonly limiter: DynamicsCompressorNode
  readonly masterGain: GainNode
  private voices: VoiceNodes[] = []

  constructor(ctx: AudioContext) {
    this.ctx = ctx

    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 0.85

    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -6
    this.limiter.knee.value = 3
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.1

    this.masterGain.connect(this.limiter)
    this.limiter.connect(ctx.destination)
  }

  /** Build all voices. Returns their outputGain nodes for external connection. */
  buildVoices(): AudioNode[] {
    const outputs: AudioNode[] = []

    for (let i = 0; i < VOICE_CONFIGS.length; i++) {
      const cfg = VOICE_CONFIGS[i]
      const voice = this.buildVoice(i, cfg)
      this.voices.push(voice)
      outputs.push(voice.outputGain)
    }

    return outputs
  }

  private buildVoice(index: number, cfg: VoiceConfig): VoiceNodes {
    const ctx = this.ctx
    const t = ctx.currentTime

    // ── Filter ────────────────────────────────────────────────────────────────
    const filterNode = ctx.createBiquadFilter()
    filterNode.type = "lowpass"
    filterNode.Q.value = 1.4

    // ── Amplitude envelope (gain → filter) ───────────────────────────────────
    const ampGain = ctx.createGain()
    ampGain.gain.value = 0

    // Slow fade-in
    ampGain.gain.setTargetAtTime(0.72, t, 2.0 + index * 0.4)
    ampGain.connect(filterNode)

    // ── Output gain (filter → output) ────────────────────────────────────────
    const outputGain = ctx.createGain()
    outputGain.gain.value = 1
    filterNode.connect(outputGain)
    // outputGain connects externally to the ambisonic encoder

    // ── Amplitude LFO ────────────────────────────────────────────────────────
    const ampLfoRate = 0.05 + index * 0.017   // 0.05 – 0.15 Hz
    const ampLfoDepth = 0.20 + (index % 3) * 0.07

    const ampLfoOsc = ctx.createOscillator()
    ampLfoOsc.type = "sine"
    ampLfoOsc.frequency.value = ampLfoRate

    const ampLfoGain = ctx.createGain()
    ampLfoGain.gain.value = ampLfoDepth

    ampLfoOsc.connect(ampLfoGain)
    ampLfoGain.connect(ampGain.gain)
    ampLfoOsc.start(t)

    // ── Filter cutoff LFO ────────────────────────────────────────────────────
    const filterBase = cfg.freq * (4 + index)  // gentle harmonic
    filterNode.frequency.value = filterBase

    const filterLfoRate = 0.03 + index * 0.011
    const filterLfoOsc = ctx.createOscillator()
    filterLfoOsc.type = "sine"
    filterLfoOsc.frequency.value = filterLfoRate

    const filterLfoGain = ctx.createGain()
    filterLfoGain.gain.value = filterBase * 0.6

    filterLfoOsc.connect(filterLfoGain)
    filterLfoGain.connect(filterNode.frequency)
    filterLfoOsc.start(t)

    // ── Oscillators (timbre per voice) ────────────────────────────────────────
    const oscNodes: OscillatorNode[] = []

    if (index === 0) {
      // A2: deep sine sub
      const osc = ctx.createOscillator()
      osc.type = "sine"
      osc.frequency.value = cfg.freq
      osc.connect(ampGain)
      osc.start(t)
      oscNodes.push(osc)
    } else if (index === 1) {
      // E3: two slightly detuned sawtooth + LP for warmth
      for (const det of [-0.7, 0.7]) {
        const osc = ctx.createOscillator()
        osc.type = "sawtooth"
        osc.frequency.value = cfg.freq + det
        const detGain = ctx.createGain()
        detGain.gain.value = 0.5
        osc.connect(detGain)
        detGain.connect(ampGain)
        osc.start(t)
        oscNodes.push(osc)
      }
    } else if (index === 2) {
      // A3: triangle + sine mix (warm pad)
      const osc1 = ctx.createOscillator()
      osc1.type = "triangle"
      osc1.frequency.value = cfg.freq
      const osc2 = ctx.createOscillator()
      osc2.type = "sine"
      osc2.frequency.value = cfg.freq * 2
      const g1 = ctx.createGain(); g1.gain.value = 0.7
      const g2 = ctx.createGain(); g2.gain.value = 0.3
      osc1.connect(g1); g1.connect(ampGain)
      osc2.connect(g2); g2.connect(ampGain)
      osc1.start(t); osc2.start(t)
      oscNodes.push(osc1, osc2)
    } else if (index === 3) {
      // C#4: FM bell using carrier + modulator
      const carrier = ctx.createOscillator()
      carrier.type = "sine"
      carrier.frequency.value = cfg.freq

      const modulator = ctx.createOscillator()
      modulator.type = "sine"
      modulator.frequency.value = cfg.freq * 2.001  // near-integer ratio for mild beating

      const modGain = ctx.createGain()
      modGain.gain.value = cfg.freq * 1.1  // FM index

      modulator.connect(modGain)
      modGain.connect(carrier.frequency)
      carrier.connect(ampGain)
      carrier.start(t)
      modulator.start(t)
      oscNodes.push(carrier, modulator)
    } else if (index === 4) {
      // E4: three-osc unison chorus (slightly detuned triangles)
      for (const det of [-1.1, 0, 1.1]) {
        const osc = ctx.createOscillator()
        osc.type = "triangle"
        osc.frequency.value = cfg.freq + det
        const g = ctx.createGain(); g.gain.value = 0.33
        osc.connect(g); g.connect(ampGain)
        osc.start(t)
        oscNodes.push(osc)
      }
    } else {
      // G4 (7th harmonic): sawtooth through tight bandpass — nasal, reedy
      const osc = ctx.createOscillator()
      osc.type = "sawtooth"
      osc.frequency.value = cfg.freq
      osc.connect(ampGain)
      osc.start(t)
      filterNode.type = "bandpass"
      filterNode.Q.value = 4
      filterNode.frequency.value = cfg.freq * 1.5
      oscNodes.push(osc)
    }

    return { oscNodes, filterNode, ampGain, ampLfoOsc, ampLfoGain, filterLfoOsc, filterLfoGain, outputGain }
  }

  dispose() {
    const t = this.ctx.currentTime
    for (const v of this.voices) {
      v.ampGain.gain.setTargetAtTime(0, t, 0.3)
      for (const osc of v.oscNodes) { try { osc.stop(t + 1) } catch { /* already stopped */ } }
      v.ampLfoOsc.stop(t + 1)
      v.filterLfoOsc.stop(t + 1)
    }
    this.masterGain.gain.setTargetAtTime(0, t, 0.5)
    this.voices = []
  }
}
