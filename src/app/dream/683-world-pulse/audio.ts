// World Pulse — sonification engine.
// A slow modal pad bed (D-Dorian / drifting toward Lydian color) that is
// always present, plus bell/chime strikes on large trades. Momentum shifts
// chord color toward consonance (up) or resolving tension (down); volatility
// drives shimmer density and reverb. Master chain is brick-wall limited.

import type { MarketState } from './market'

interface Voice {
  osc: OscillatorNode
  gain: GainNode
  baseFreq: number
}

export class AudioEngine {
  private ac: AudioContext
  private master: GainNode
  private lowpass: BiquadFilterNode
  private limiter: DynamicsCompressorNode
  private reverbWet: GainNode
  private reverb: ConvolverNode
  private padBus: GainNode
  private shimmerBus: GainNode

  private voices: Voice[] = []
  private started = false
  private running = false
  private raf: number | null = null
  private lastChordShift = 0
  private chordIndex = 0

  // D-Dorian centered scale (Hz), low register, drifting.
  // D2 root region. Degrees give a warm modal bed.
  private readonly root = 73.42 // D2

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    this.ac = new AC()

    // --- master safety chain: bus -> lowpass -> limiter -> master -> out
    this.master = this.ac.createGain()
    this.master.gain.value = 0.34

    this.lowpass = this.ac.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.lowpass.frequency.value = 5200
    this.lowpass.Q.value = 0.4

    this.limiter = this.ac.createDynamicsCompressor()
    this.limiter.threshold.value = -8
    this.limiter.knee.value = 6
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.25

    this.lowpass.connect(this.limiter)
    this.limiter.connect(this.master)
    this.master.connect(this.ac.destination)

    // --- reverb (algorithmic impulse) for space
    this.reverb = this.ac.createConvolver()
    this.reverb.buffer = makeImpulse(this.ac, 3.4, 2.6)
    this.reverbWet = this.ac.createGain()
    this.reverbWet.gain.value = 0.3
    this.reverb.connect(this.reverbWet)
    this.reverbWet.connect(this.lowpass)

    // --- buses
    this.padBus = this.ac.createGain()
    this.padBus.gain.value = 0.0
    this.padBus.connect(this.lowpass)
    this.padBus.connect(this.reverb)

    this.shimmerBus = this.ac.createGain()
    this.shimmerBus.gain.value = 0.0
    this.shimmerBus.connect(this.lowpass)
    this.shimmerBus.connect(this.reverb)
  }

  // start audio on user gesture
  async start() {
    if (this.started) return
    this.started = true
    if (this.ac.state === 'suspended') {
      try {
        await this.ac.resume()
      } catch {
        // ignore
      }
    }
    this.buildPad()
    this.running = true
    // fade the bed in gently — no startling transient
    const now = this.ac.currentTime
    this.padBus.gain.cancelScheduledValues(now)
    this.padBus.gain.setValueAtTime(0, now)
    this.padBus.gain.linearRampToValueAtTime(0.5, now + 4)
    this.shimmerBus.gain.setValueAtTime(0, now)
    this.shimmerBus.gain.linearRampToValueAtTime(0.4, now + 6)
  }

  get isStarted() {
    return this.started
  }

  // four drifting pad voices forming a modal chord
  private buildPad() {
    // chord degrees over D-Dorian; ratios relative to root D2.
    // i (D), v (A), III (F), VII (C) — open, warm.
    const ratios = [1, 1.5, 1.2, 1.78]
    for (let i = 0; i < ratios.length; i++) {
      const osc = this.ac.createOscillator()
      osc.type = i === 0 ? 'sine' : 'triangle'
      const f = this.root * ratios[i] * (i > 1 ? 2 : 1)
      osc.frequency.value = f
      // slight detune for a living, beating texture
      osc.detune.value = (Math.random() - 0.5) * 8

      const g = this.ac.createGain()
      g.gain.value = 0.18 / (1 + i * 0.3)

      osc.connect(g)
      g.connect(this.padBus)
      osc.start()
      this.voices.push({ osc, gain: g, baseFreq: f })
    }

    // per-frame modulation loop
    const tick = () => {
      if (!this.running) return
      this.modulate()
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private state: MarketState | null = null
  setState(s: MarketState) {
    this.state = s
  }

  // continuous mapping of market state -> timbre/space
  private modulate() {
    const s = this.state
    if (!s) return
    const now = this.ac.currentTime
    const mom = s.momentum // -1..1
    const vol = s.volatility // 0..1

    // brightness: up-momentum opens the lowpass toward warmth/air,
    // down-momentum closes it for a darker (but not harsh) tension.
    const cutoff = 1400 + (mom * 0.5 + 0.5) * 4200 + vol * 1200
    this.lowpass.frequency.setTargetAtTime(
      Math.max(700, Math.min(7000, cutoff)),
      now,
      0.4,
    )

    // reverb grows with volatility (more space when the world is turbulent)
    this.reverbWet.gain.setTargetAtTime(0.2 + vol * 0.45, now, 0.6)

    // shimmer density follows volatility
    this.shimmerBus.gain.setTargetAtTime(0.25 + vol * 0.55, now, 0.8)

    // chord color: shift voices toward a Lydian #4 brightness on up-momentum,
    // toward a minor/suspended resolve on down-momentum. Slow glide only.
    const lydianLift = mom > 0 ? mom * 0.012 : 0
    const minorPull = mom < 0 ? mom * 0.01 : 0
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i]
      // third voice is the color tone (F natural <-> F# lift)
      let mult = 1
      if (i === 2) mult = 1 + lydianLift * 3
      if (i === 3) mult = 1 + minorPull
      const target = v.baseFreq * mult
      v.osc.frequency.setTargetAtTime(target, now, 1.2)
    }

    // slow harmonic drift: every ~22s nudge the whole bed up/down a step,
    // making the piece different at minute 5 than minute 0.
    if (now - this.lastChordShift > 22) {
      this.lastChordShift = now
      this.chordIndex = (this.chordIndex + 1) % MODAL_STEPS.length
      const step = MODAL_STEPS[this.chordIndex]
      for (const v of this.voices) {
        v.baseFreq = v.baseFreq * step
        v.osc.frequency.setTargetAtTime(v.baseFreq, now, 3)
      }
    }
  }

  // a trade arrived: ring a bell. Bigger trade -> lower + louder.
  // size01 in 0..1, sell tints color.
  strike(size01: number, sell: boolean) {
    if (!this.running) return
    if (size01 < 0.32) return // only meaningful trades chime, keep it sparse
    const now = this.ac.currentTime

    // bigger -> lower pitch. Map to a modal degree near the root octaves.
    const degrees = sell ? SELL_DEGREES : BUY_DEGREES
    const di = Math.floor((1 - size01) * (degrees.length - 1))
    const freq = this.root * 4 * degrees[Math.max(0, Math.min(degrees.length - 1, di))]

    const loud = 0.04 + size01 * 0.14

    // FM-ish bell: carrier + a quick inharmonic partial
    const carrier = this.ac.createOscillator()
    carrier.type = 'sine'
    carrier.frequency.value = freq

    const partial = this.ac.createOscillator()
    partial.type = 'sine'
    partial.frequency.value = freq * 2.76 // inharmonic = bell-like

    const pGain = this.ac.createGain()
    pGain.gain.value = loud * 0.4

    const env = this.ac.createGain()
    env.gain.setValueAtTime(0, now)
    env.gain.linearRampToValueAtTime(loud, now + 0.006)
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.4 + size01 * 2.5)

    carrier.connect(env)
    partial.connect(pGain)
    pGain.connect(env)
    env.connect(this.lowpass)
    env.connect(this.reverb)

    carrier.start(now)
    partial.start(now)
    const stopAt = now + 4.5
    carrier.stop(stopAt)
    partial.stop(stopAt)
  }

  stop() {
    this.running = false
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
    const now = this.ac.currentTime
    try {
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setTargetAtTime(0, now, 0.3)
    } catch {
      // ignore
    }
    for (const v of this.voices) {
      try {
        v.osc.stop(now + 0.6)
      } catch {
        // ignore
      }
    }
    this.voices = []
    setTimeout(() => {
      try {
        this.ac.close()
      } catch {
        // ignore
      }
    }, 800)
  }
}

// gentle modal step multipliers for slow harmonic drift (whole/half steps
// within D-Dorian, returning home over the cycle)
const MODAL_STEPS = [
  1.0,
  9 / 8, // up a whole step
  8 / 9, // back
  1.0,
  6 / 5, // up a minor third (color)
  5 / 6, // back
]

// chime degrees (ratios over a chime octave). Buy = bright/open intervals,
// Sell = closer, more pensive intervals that still want to resolve.
const BUY_DEGREES = [1, 9 / 8, 5 / 4, 3 / 2, 27 / 16, 2]
const SELL_DEGREES = [1, 9 / 8, 6 / 5, 4 / 3, 8 / 5, 9 / 5]

function makeImpulse(ac: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ac.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ac.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const t = i / len
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay)
    }
  }
  return buf
}
