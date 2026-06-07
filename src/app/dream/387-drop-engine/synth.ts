/**
 * synth.ts — Multi-layer drum + synth engine for 387-drop-engine
 *
 * Layers:
 *   - Kick  : pitch-enveloped sine + click transient
 *   - Snare : filtered noise burst
 *   - Hat   : short high-passed noise
 *   - Bass  : detuned sawtooth through tension-driven low-pass
 *   - Lead  : supersaw-style (4 detuned oscillators) pluck motif
 *   - Riser : rising filtered noise/saw during BUILD
 *
 * All routed through a DynamicsCompressor → master gain.
 * BPM 126, D-minor / D-Dorian tonality.
 */

import {
  makeBeatDuration,
  riserCutoff,
  suckoutHP,
  bassCutoff,
  type ArcPhase,
} from "./arc"

// ── D-Dorian MIDI note numbers (D2–D5) ───────────────────────────────────────
const D_DORIAN_SEMIS = [0, 2, 3, 5, 7, 9, 10] // intervals from D
const D2_MIDI = 38

function buildScale(): number[] {
  const notes: number[] = []
  for (let oct = 0; oct < 3; oct++) {
    for (const s of D_DORIAN_SEMIS) {
      notes.push(D2_MIDI + oct * 12 + s)
    }
  }
  return notes
}
const SCALE = buildScale()

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// Bass root notes: D2, A2, F2, G2 (i, v, III, IV in D-minor feeling)
const BASS_ROOTS = [38, 45, 41, 43].map(midiToHz)

// Lead motif: pentatonic-flavored stepwise motion
const MOTIF_STEPS = [0, 2, 4, 2, 5, 4, 2, 0] // scale-degree offsets

// ── SynthEngine ───────────────────────────────────────────────────────────────

export class SynthEngine {
  ctx: AudioContext
  masterGain: GainNode
  compressor: DynamicsCompressorNode

  // Riser nodes (persistent, controlled during BUILD)
  private riserNoise: AudioBufferSourceNode | null = null
  private riserFilter: BiquadFilterNode | null = null
  private riserGain: GainNode | null = null
  private riserSaw: OscillatorNode | null = null
  private riserSawGain: GainNode | null = null
  private suckHP: BiquadFilterNode | null = null

  // Bass (persistent, runs continuously)
  private bassOsc: OscillatorNode | null = null
  private bassOsc2: OscillatorNode | null = null
  private bassFilter: BiquadFilterNode | null = null
  private bassGain: GainNode | null = null

  // State
  private riserActive = false
  private currentBassRoot = BASS_ROOTS[0]
  private bassRootIndex = 0

  constructor() {
    this.ctx = new AudioContext()

    this.compressor = this.ctx.createDynamicsCompressor()
    this.compressor.threshold.value = -6
    this.compressor.knee.value = 3
    this.compressor.ratio.value = 12
    this.compressor.attack.value = 0.001
    this.compressor.release.value = 0.1

    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0.82

    this.compressor.connect(this.masterGain)
    this.masterGain.connect(this.ctx.destination)

    this.initBass()
  }

  get currentTime(): number {
    return this.ctx.currentTime
  }

  // ── Resume (autoplay safety) ───────────────────────────────────────────────
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume()
    }
  }

  // ── Kick ──────────────────────────────────────────────────────────────────
  scheduleKick(t: number, intensity = 1.0): void {
    const ctx = this.ctx
    const dur = 0.45

    // Pitch-enveloped sine
    const osc = ctx.createOscillator()
    osc.type = "sine"
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.06)
    osc.frequency.exponentialRampToValueAtTime(30, t + dur)

    // Click transient: short white noise burst
    const bufLen = Math.ceil(ctx.sampleRate * 0.008)
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1)
    const click = ctx.createBufferSource()
    click.buffer = buf

    const clickGain = ctx.createGain()
    clickGain.gain.setValueAtTime(0.6 * intensity, t)
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.008)

    const oscGain = ctx.createGain()
    oscGain.gain.setValueAtTime(1.0 * intensity, t)
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur)

    click.connect(clickGain)
    clickGain.connect(this.compressor)
    osc.connect(oscGain)
    oscGain.connect(this.compressor)

    click.start(t)
    click.stop(t + 0.01)
    osc.start(t)
    osc.stop(t + dur)
  }

  // ── Snare/Clap ─────────────────────────────────────────────────────────────
  scheduleSnare(t: number, intensity = 1.0, short = false): void {
    const ctx = this.ctx
    const dur = short ? 0.06 : 0.18

    const bufLen = Math.ceil(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1

    const src = ctx.createBufferSource()
    src.buffer = buf

    const bp = ctx.createBiquadFilter()
    bp.type = "bandpass"
    bp.frequency.value = 3200
    bp.Q.value = 0.8

    const hp = ctx.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 1200

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.55 * intensity, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)

    src.connect(bp)
    bp.connect(hp)
    hp.connect(g)
    g.connect(this.compressor)
    src.start(t)
    src.stop(t + dur + 0.01)
  }

  // ── Hi-hat ────────────────────────────────────────────────────────────────
  scheduleHat(t: number, open = false, intensity = 0.4): void {
    const ctx = this.ctx
    const dur = open ? 0.14 : 0.04

    const bufLen = Math.ceil(ctx.sampleRate * 0.06)
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1

    const src = ctx.createBufferSource()
    src.buffer = buf

    const hp = ctx.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 8000

    const g = ctx.createGain()
    g.gain.setValueAtTime(intensity, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)

    src.connect(hp)
    hp.connect(g)
    g.connect(this.compressor)
    src.start(t)
    src.stop(t + dur + 0.01)
  }

  // ── Bass (continuous, pitch-switched) ─────────────────────────────────────
  private initBass(): void {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = "sawtooth"
    osc.frequency.value = this.currentBassRoot

    const osc2 = ctx.createOscillator()
    osc2.type = "square"
    osc2.frequency.value = this.currentBassRoot * 0.5 // sub

    const filt = ctx.createBiquadFilter()
    filt.type = "lowpass"
    filt.frequency.value = 600
    filt.Q.value = 3

    const g = ctx.createGain()
    g.gain.value = 0

    osc.connect(filt)
    osc2.connect(filt)
    filt.connect(g)
    g.connect(this.compressor)

    osc.start()
    osc2.start()

    this.bassOsc = osc
    this.bassOsc2 = osc2
    this.bassFilter = filt
    this.bassGain = g
  }

  scheduleBassNote(t: number, rootIdx: number, phase: ArcPhase, tension: number): void {
    const freq = BASS_ROOTS[rootIdx % BASS_ROOTS.length]
    const cutoff = bassCutoff(tension, phase)
    const vol = phase === "DROP" ? 0.72 : phase === "GROOVE" ? 0.45 : 0.55

    this.bassOsc?.frequency.setValueAtTime(freq, t)
    this.bassOsc2?.frequency.setValueAtTime(freq * 0.5, t)
    this.bassFilter?.frequency.setValueAtTime(cutoff, t)
    if (phase === "BUILD") {
      this.bassFilter?.frequency.linearRampToValueAtTime(bassCutoff(Math.min(tension + 0.1, 1), phase), t + makeBeatDuration())
    }

    this.bassGain?.gain.cancelScheduledValues(t)
    this.bassGain?.gain.setValueAtTime(vol, t)
    // Off-beat: bass hits on beats 2 and 4 (indices 1 and 3), short decay
    this.bassGain?.gain.setValueAtTime(vol, t)
    this.bassGain?.gain.exponentialRampToValueAtTime(0.001, t + makeBeatDuration() * 0.85)
  }

  // ── Supersaw Lead/Pluck ───────────────────────────────────────────────────
  scheduleLead(t: number, midiNote: number, intensity = 0.5): void {
    const ctx = this.ctx
    const baseFreq = midiToHz(midiNote)
    const detunes = [-8, -3, 0, 3, 8] // cents
    const dur = 0.22

    const oscs: OscillatorNode[] = []
    const sum = ctx.createGain()
    sum.gain.value = 1 / detunes.length

    for (const det of detunes) {
      const o = ctx.createOscillator()
      o.type = "sawtooth"
      o.frequency.value = baseFreq * Math.pow(2, det / 1200)
      o.connect(sum)
      oscs.push(o)
    }

    const lp = ctx.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = 3000 + 5000 * intensity
    lp.Q.value = 1.5

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.001, t)
    env.gain.linearRampToValueAtTime(0.45 * intensity, t + 0.005)
    env.gain.exponentialRampToValueAtTime(0.18 * intensity, t + 0.06)
    env.gain.exponentialRampToValueAtTime(0.001, t + dur)

    sum.connect(lp)
    lp.connect(env)
    env.connect(this.compressor)

    for (const o of oscs) {
      o.start(t)
      o.stop(t + dur + 0.01)
    }
  }

  // ── Riser (builds during BUILD phase) ─────────────────────────────────────
  startRiser(tension: number, riserType: number): void {
    this.stopRiser()
    const ctx = this.ctx
    const t = ctx.currentTime

    // Noise riser
    if (riserType === 0 || riserType === 2) {
      const dur = 8 // seconds of buffer
      const bufLen = Math.ceil(ctx.sampleRate * dur)
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1

      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true

      const filt = ctx.createBiquadFilter()
      filt.type = "bandpass"
      filt.frequency.value = riserCutoff(tension)
      filt.Q.value = 4

      // Suck-out HP filter
      const hp = ctx.createBiquadFilter()
      hp.type = "highpass"
      hp.frequency.value = suckoutHP(tension)

      const g = ctx.createGain()
      g.gain.value = 0

      src.connect(filt)
      filt.connect(hp)
      hp.connect(g)
      g.connect(this.compressor)
      src.start(t)

      this.riserNoise = src
      this.riserFilter = filt
      this.suckHP = hp
      this.riserGain = g
    }

    // Saw riser
    if (riserType === 1 || riserType === 2) {
      const saw = ctx.createOscillator()
      saw.type = "sawtooth"
      saw.frequency.value = 80 + tension * 400

      const sawG = ctx.createGain()
      sawG.gain.value = 0

      saw.connect(sawG)
      sawG.connect(this.compressor)
      saw.start(t)

      this.riserSaw = saw
      this.riserSawGain = sawG
    }

    this.riserActive = true
  }

  updateRiser(tension: number): void {
    if (!this.riserActive) return
    const t = this.ctx.currentTime
    const cutoff = riserCutoff(tension)
    const hp = suckoutHP(tension)
    const vol = tension * 0.35

    this.riserFilter?.frequency.setValueAtTime(cutoff, t)
    this.suckHP?.frequency.setValueAtTime(hp, t)
    this.riserGain?.gain.setValueAtTime(vol, t)

    if (this.riserSaw) {
      this.riserSaw.frequency.setValueAtTime(80 + tension * 800, t)
      this.riserSawGain?.gain.setValueAtTime(tension * 0.18, t)
    }
  }

  stopRiser(): void {
    const t = this.ctx.currentTime
    this.riserGain?.gain.setValueAtTime(0, t)
    this.riserSawGain?.gain.setValueAtTime(0, t)
    this.riserNoise?.stop(t + 0.05)
    this.riserSaw?.stop(t + 0.05)
    this.riserNoise = null
    this.riserFilter = null
    this.riserGain = null
    this.riserSaw = null
    this.riserSawGain = null
    this.suckHP = null
    this.riserActive = false
  }

  // ── Impact (drop hit) ─────────────────────────────────────────────────────
  scheduleImpact(t: number, intensity: number): void {
    // Silence just before — ultra-brief gate
    this.bassGain?.gain.setValueAtTime(0, t - 0.02)
    // Then boom
    this.scheduleKick(t, Math.min(1.0, 0.9 + intensity * 0.1))
    this.scheduleSnare(t + 0.001, 0.9 * intensity)

    // Impact boom: pitched sub hit
    const ctx = this.ctx
    const sub = ctx.createOscillator()
    sub.type = "sine"
    sub.frequency.setValueAtTime(60, t)
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.5)

    const subG = ctx.createGain()
    subG.gain.setValueAtTime(0.9 * intensity, t)
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.5)

    sub.connect(subG)
    subG.connect(this.compressor)
    sub.start(t)
    sub.stop(t + 0.55)
  }

  // ── Lead motif scheduler ─────────────────────────────────────────────────
  scheduleMotifNote(t: number, stepIndex: number, transpose: number, intensity: number): void {
    const scaleDeg = MOTIF_STEPS[stepIndex % MOTIF_STEPS.length]
    const noteIdx = Math.max(0, Math.min(SCALE.length - 1, scaleDeg + transpose))
    const midi = SCALE[noteIdx + 7] // upper octave band
    this.scheduleLead(t, midi, intensity)
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  dispose(): void {
    this.stopRiser()
    this.bassOsc?.stop()
    this.bassOsc2?.stop()
    this.ctx.close()
  }
}
