/**
 * synth.ts — Just-intonation overtone voices for the soundwalk
 *
 * ## Tonal palette — overtones of a low root A1 ≈ 55 Hz
 * Each voice is an exact integer-ratio just-intonation partial of the root, so the
 * whole room rings as one consonant overtone bed (NOT equal temperament, NOT a
 * scale). Ratios from the brief: 1/1, 3/2, 5/4, 2/1, 5/3, 9/4, 3/1. Some are
 * octave-shifted up so the timbre reads clearly when you pass.
 *
 *   1/1 → 55.0 Hz   deep sub sine            (the floor of the room, centre)
 *   3/2 → 82.5 Hz   triangle perfect 5th     (warm)
 *   5/4 → 137.5 Hz  detuned sines, 3rd ×2    (shimmer)
 *   2/1 → 110.0 Hz  triangle + sine octave pad
 *   5/3 → 183.3 Hz  soft FM bell, 6th ×2
 *   9/4 → 247.5 Hz  breathy detuned triangles, 9th ×2
 *   3/1 → 165.0 Hz  reedy bandpass saw, 12th (brightest, easiest to track)
 *
 * Each voice has a slow tremolo and a distinct timbre so it is individually
 * recognisable by ear as you pass it — that recognisability is the whole point of
 * the soundwalk, and what the Sound2Hap haptic mapping mirrors into vibration.
 *
 * ## Per-voice amplitude tap (for Sound2Hap)
 * Each voice carries its OWN AnalyserNode tapping its pre-spatial signal, so the
 * haptics layer can read that voice's live RMS/onset envelope and derive a
 * vibrotactile pulse whose feel matches what that voice sounds like.
 *
 * Each voice's `output` GainNode is the mono source the 6DoF engine spatialises
 * via its own PannerNode (see soundwalk.ts). We do NOT decode here.
 */

export interface VoiceConfig {
  /** Short label */
  name: string
  /** Just-intonation ratio label (e.g. "3/2") */
  ratio: string
  /** Sounding frequency in Hz */
  freq: number
  /** World X position in metres (room is roughly ±4.5 m) */
  wx: number
  /** World Z position in metres (+Z = front of room) */
  wz: number
  /** CSS colour for the map dot + legend */
  color: string
}

const ROOT = 55 // A1

/**
 * Seven voices placed around a small room so the auto-walk path threads between
 * them and you pass close to each in turn.
 */
export const VOICE_CONFIGS: VoiceConfig[] = [
  { name: "1/1", ratio: "1/1", freq: ROOT * 1,            wx:  0.0, wz:  0.0, color: "#c4b5fd" }, // root, centre
  { name: "3/2", ratio: "3/2", freq: ROOT * 1.5,          wx: -3.2, wz:  1.4, color: "#a5b4fc" }, // 5th, front-left
  { name: "5/4", ratio: "5/4", freq: ROOT * 1.25 * 2,     wx:  3.0, wz:  1.8, color: "#93c5fd" }, // 3rd, front-right
  { name: "2/1", ratio: "2/1", freq: ROOT * 2,            wx:  3.4, wz: -2.2, color: "#6ee7b7" }, // octave, back-right
  { name: "5/3", ratio: "5/3", freq: ROOT * (5 / 3) * 2,  wx: -3.0, wz: -2.6, color: "#fcd34d" }, // 6th, back-left
  { name: "9/4", ratio: "9/4", freq: ROOT * 2.25 * 2,     wx:  0.4, wz:  3.6, color: "#f9a8d4" }, // 9th, far front
  { name: "3/1", ratio: "3/1", freq: ROOT * 3,            wx: -0.6, wz: -3.8, color: "#fb923c" }, // 12th, far back
]

/** Per-voice runtime nodes the engine drives and reads. */
export interface Voice {
  cfg: VoiceConfig
  /** mono output the 6DoF engine spatialises */
  output: GainNode
  /** per-voice analyser tapping `output` for Sound2Hap envelope follow */
  analyser: AnalyserNode
  /** scratch buffer for the analyser */
  ampBuf: Float32Array
  oscNodes: OscillatorNode[]
  lfoNodes: OscillatorNode[]
}

export class SynthEngine {
  private ctx: AudioContext
  readonly masterGain: GainNode
  readonly limiter: DynamicsCompressorNode
  readonly voices: Voice[] = []

  constructor(ctx: AudioContext) {
    this.ctx = ctx

    // Master gain → brick-wall limiter → destination. Ears can NEVER be blasted.
    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 0.0001
    this.masterGain.gain.setTargetAtTime(0.78, ctx.currentTime, 1.4) // gentle fade-in

    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -8
    this.limiter.knee.value = 2
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.12

    this.masterGain.connect(this.limiter)
    this.limiter.connect(ctx.destination)
  }

  /** Build all voices. Each voice's `output` is left for the field to spatialise. */
  build(): void {
    for (let i = 0; i < VOICE_CONFIGS.length; i++) {
      this.voices.push(this.buildVoice(i, VOICE_CONFIGS[i]))
    }
  }

  private buildVoice(index: number, cfg: VoiceConfig): Voice {
    const ctx = this.ctx
    const t = ctx.currentTime

    // Amplitude envelope with slow tremolo (overtone bed = calm).
    const ampGain = ctx.createGain()
    ampGain.gain.value = 0
    ampGain.gain.setTargetAtTime(0.62, t, 2.2 + index * 0.35)

    const output = ctx.createGain()
    output.gain.value = 1
    ampGain.connect(output)

    // Per-voice analyser tap (Sound2Hap): listens to this voice only.
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.5
    output.connect(analyser)

    // Slow tremolo LFO — higher voices flutter slightly faster (buzzier feel).
    const lfo = ctx.createOscillator()
    lfo.type = "sine"
    lfo.frequency.value = 0.06 + index * 0.03
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.14 + (index % 3) * 0.05
    lfo.connect(lfoGain)
    lfoGain.connect(ampGain.gain)
    lfo.start(t)

    // Per-voice gentle low-pass so partials stay rounded (not harsh).
    const tone = ctx.createBiquadFilter()
    tone.type = "lowpass"
    tone.frequency.value = cfg.freq * 6
    tone.Q.value = 0.7
    tone.connect(ampGain)

    const oscNodes: OscillatorNode[] = []
    const addOsc = (type: OscillatorType, freq: number, gain: number) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      const g = ctx.createGain()
      g.gain.value = gain
      o.connect(g)
      g.connect(tone)
      o.start(t)
      oscNodes.push(o)
    }

    // Distinct timbre per partial so each is recognisable as you pass.
    switch (index) {
      case 0: // root sub — pure sine
        addOsc("sine", cfg.freq, 0.9)
        break
      case 1: // 5th — triangle, warm
        addOsc("triangle", cfg.freq, 0.8)
        break
      case 2: // 3rd — two detuned sines, shimmer
        addOsc("sine", cfg.freq - 0.6, 0.5)
        addOsc("sine", cfg.freq + 0.6, 0.5)
        break
      case 3: // octave — triangle + sine octave pad
        addOsc("triangle", cfg.freq, 0.6)
        addOsc("sine", cfg.freq * 2, 0.25)
        break
      case 4: { // 6th — soft FM bell
        const carrier = ctx.createOscillator()
        carrier.type = "sine"
        carrier.frequency.value = cfg.freq
        const mod = ctx.createOscillator()
        mod.type = "sine"
        mod.frequency.value = cfg.freq * 1.414
        const modGain = ctx.createGain()
        modGain.gain.value = cfg.freq * 0.7
        mod.connect(modGain)
        modGain.connect(carrier.frequency)
        const cg = ctx.createGain()
        cg.gain.value = 0.7
        carrier.connect(cg)
        cg.connect(tone)
        carrier.start(t)
        mod.start(t)
        oscNodes.push(carrier, mod)
        break
      }
      case 5: // 9th — breathy detuned triangles
        addOsc("triangle", cfg.freq - 1.0, 0.4)
        addOsc("triangle", cfg.freq, 0.4)
        addOsc("triangle", cfg.freq + 1.0, 0.4)
        break
      default: // 12th — reedy bandpass saw (brightest, easiest to track)
        tone.type = "bandpass"
        tone.Q.value = 3.5
        tone.frequency.value = cfg.freq * 1.4
        addOsc("sawtooth", cfg.freq, 0.7)
        break
    }

    return {
      cfg,
      output,
      analyser,
      ampBuf: new Float32Array(analyser.fftSize),
      oscNodes,
      lfoNodes: [lfo],
    }
  }

  dispose() {
    const t = this.ctx.currentTime
    for (const v of this.voices) {
      try { v.output.gain.cancelScheduledValues(t) } catch { /* noop */ }
      for (const osc of v.oscNodes) {
        try { osc.stop(t + 0.9) } catch { /* already stopped */ }
      }
      for (const l of v.lfoNodes) {
        try { l.stop(t + 0.9) } catch { /* already stopped */ }
      }
    }
    this.masterGain.gain.cancelScheduledValues(t)
    this.masterGain.gain.setTargetAtTime(0, t, 0.4)
    this.voices.length = 0
  }
}
