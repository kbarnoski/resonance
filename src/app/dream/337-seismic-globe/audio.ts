// Spatial audio engine for 337-seismic-globe.
// Each sounding quake owns ONE sustained voice through its own HRTF PannerNode:
//   azimuth   <- longitude
//   elevation <- latitude
//   distance  <- magnitude (bigger = closer/louder)
//   pitch     <- just-intonation degree over a low root, magnitude sets register
//   timbre    <- depth controls a lowpass cutoff (deeper = darker)
// Slow attack / slow release make the chord evolve as Earth's seismic state shifts.
// A quiet root drone is always on so the piece is never silent. The master path
// runs into a procedural convolver reverb and a brick-wall compressor so a dense
// seismic moment never clips. A StereoPanner fallback covers browsers without HRTF.

import type { Quake } from "./quakes"

const ROOT = 65.41 // C2
// Just-intonation ratios spanning an octave.
const JI = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2]

interface Voice {
  osc: OscillatorNode
  detune: OscillatorNode // a second, slightly detuned partial for chorus warmth
  detuneGain: GainNode
  gain: GainNode
  lp: BiquadFilterNode
  panner: PannerNode | null
  stereo: StereoPannerNode | null
  target: number // target loudness
}

export interface VoiceLevel {
  id: string
  place: string
  mag: number
  level: number
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

// Snap a magnitude to a just-intonation pitch. Bigger quakes sit lower (more
// gravity), smaller ones ring higher. Returns frequency in Hz.
function quakeFreq(mag: number): number {
  const degree = Math.abs(Math.round(mag * 1.7)) % JI.length
  const ratio = JI[degree]
  // Register: M<3 up an octave, M>=6 down an octave.
  let octave = 0
  if (mag >= 6) octave = -1
  else if (mag < 3) octave = 1
  return ROOT * ratio * Math.pow(2, octave)
}

// Place a quake on the unit listener sphere from lon/lat. Web Audio uses a
// right-handed coord system: +x right, +y up, -z forward.
function spatialPosition(lon: number, lat: number): [number, number, number] {
  const az = (lon * Math.PI) / 180
  const el = (lat * Math.PI) / 180
  const r = 3
  const x = r * Math.cos(el) * Math.sin(az)
  const y = r * Math.sin(el)
  const z = -r * Math.cos(el) * Math.cos(az)
  return [x, y, z]
}

export class SeismicAudio {
  private ctx: AudioContext
  private master: GainNode
  private comp: DynamicsCompressorNode
  private drone: OscillatorNode | null = null
  private droneGain: GainNode | null = null
  private voices = new Map<string, Voice>()
  readonly hrtf: boolean

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctor()

    this.master = this.ctx.createGain()
    this.master.gain.value = 0.42 // <= 0.45

    // Procedural convolver reverb.
    const conv = this.ctx.createConvolver()
    conv.buffer = this.makeImpulse(3.2, 2.4)
    const wet = this.ctx.createGain()
    wet.gain.value = 0.5
    const dry = this.ctx.createGain()
    dry.gain.value = 0.8

    // Brick-wall compressor as the final safety stage.
    this.comp = this.ctx.createDynamicsCompressor()
    this.comp.threshold.value = -10
    this.comp.knee.value = 6
    this.comp.ratio.value = 16
    this.comp.attack.value = 0.004
    this.comp.release.value = 0.25

    this.master.connect(dry).connect(this.comp)
    this.master.connect(conv).connect(wet).connect(this.comp)
    this.comp.connect(this.ctx.destination)

    // HRTF capability probe.
    let hrtf = false
    try {
      const p = this.ctx.createPanner()
      p.panningModel = "HRTF"
      hrtf = p.panningModel === "HRTF"
      p.disconnect()
    } catch {
      hrtf = false
    }
    this.hrtf = hrtf

    if (this.hrtf) {
      const l = this.ctx.listener
      // Listener at origin looking down -z, up +y.
      if (l.forwardX) {
        l.forwardX.value = 0
        l.forwardY.value = 0
        l.forwardZ.value = -1
        l.upX.value = 0
        l.upY.value = 1
        l.upZ.value = 0
      }
    }

    this.startDrone()
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate
    const len = Math.floor(rate * seconds)
    const buf = this.ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
      }
    }
    return buf
  }

  private startDrone() {
    const osc = this.ctx.createOscillator()
    osc.type = "sine"
    osc.frequency.value = ROOT / 2 // C1, a felt foundation
    const sub = this.ctx.createOscillator()
    sub.type = "triangle"
    sub.frequency.value = ROOT
    const g = this.ctx.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(0.07, this.ctx.currentTime, 2)
    osc.connect(g)
    sub.connect(g)
    g.connect(this.master)
    osc.start()
    sub.start()
    this.drone = osc
    this.droneGain = g
  }

  resume(): Promise<void> {
    if (this.ctx.state === "suspended") return this.ctx.resume()
    return Promise.resolve()
  }

  get state(): AudioContextState {
    return this.ctx.state
  }

  private makeVoice(q: Quake): Voice {
    const freq = quakeFreq(q.mag)
    const osc = this.ctx.createOscillator()
    osc.type = "sawtooth"
    osc.frequency.value = freq

    const detune = this.ctx.createOscillator()
    detune.type = "sine"
    detune.frequency.value = freq * 1.005
    const detuneGain = this.ctx.createGain()
    detuneGain.gain.value = 0.4

    const lp = this.ctx.createBiquadFilter()
    lp.type = "lowpass"
    lp.Q.value = 0.7
    // Deeper quakes are darker: 700 Hz floor, ~3.5 kHz for surface quakes.
    const cutoff = clamp(3500 - q.depthKm * 7, 600, 3600)
    lp.frequency.value = cutoff

    const gain = this.ctx.createGain()
    gain.gain.value = 0

    osc.connect(lp)
    detune.connect(detuneGain).connect(lp)
    lp.connect(gain)

    let panner: PannerNode | null = null
    let stereo: StereoPannerNode | null = null
    const [x, y, z] = spatialPosition(q.lon, q.lat)
    if (this.hrtf) {
      panner = this.ctx.createPanner()
      panner.panningModel = "HRTF"
      panner.distanceModel = "inverse"
      panner.refDistance = 1
      panner.maxDistance = 12
      panner.rolloffFactor = 1
      if (panner.positionX) {
        panner.positionX.value = x
        panner.positionY.value = y
        panner.positionZ.value = z
      } else {
        // Deprecated signature fallback.
        panner.setPosition(x, y, z)
      }
      gain.connect(panner).connect(this.master)
    } else {
      stereo = this.ctx.createStereoPanner()
      stereo.pan.value = clamp(Math.sin((q.lon * Math.PI) / 180), -1, 1)
      gain.connect(stereo).connect(this.master)
    }

    osc.start()
    detune.start()

    // Target loudness from magnitude (bigger = louder/closer). HRTF distance
    // also handles loudness, so keep gains modest.
    const target = clamp(0.04 + (q.mag - 2) * 0.03, 0.03, 0.22)
    // Slow attack.
    gain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.6)

    return { osc, detune, detuneGain, gain, lp, panner, stereo, target }
  }

  // Reconcile the set of sounding voices with the desired quake set.
  update(quakes: Quake[]) {
    const wanted = new Set(quakes.map((q) => q.id))

    // Release voices no longer wanted (slow release, then stop).
    for (const [id, v] of this.voices) {
      if (!wanted.has(id)) {
        v.gain.gain.cancelScheduledValues(this.ctx.currentTime)
        v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 1.2)
        const stopAt = this.ctx.currentTime + 5
        v.osc.stop(stopAt)
        v.detune.stop(stopAt)
        this.voices.delete(id)
      }
    }

    // Add voices for new quakes.
    for (const q of quakes) {
      if (!this.voices.has(q.id)) {
        this.voices.set(q.id, this.makeVoice(q))
      }
    }
  }

  // Read current per-voice loudness for the visual "loudest voices" list.
  levels(quakes: Quake[]): VoiceLevel[] {
    return quakes
      .map((q) => {
        const v = this.voices.get(q.id)
        return {
          id: q.id,
          place: q.place,
          mag: q.mag,
          level: v ? v.gain.gain.value / Math.max(v.target, 0.001) : 0,
        }
      })
      .sort((a, b) => b.mag - a.mag)
  }

  setMaster(v: number) {
    this.master.gain.setTargetAtTime(clamp(v, 0, 0.45), this.ctx.currentTime, 0.1)
  }

  dispose() {
    const now = this.ctx.currentTime
    for (const [, v] of this.voices) {
      try {
        v.osc.stop(now)
        v.detune.stop(now)
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear()
    try {
      this.drone?.stop(now)
    } catch {
      /* noop */
    }
    if (this.droneGain) this.droneGain.disconnect()
    void this.ctx.close()
  }
}
