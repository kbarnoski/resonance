// audio.ts — the rhythmic pulse engine (the voice).
//
// Not a drone, not a choir, not Karplus-Strong, not granular. This is a pulse
// engine driven purely by WAVE TIMING. Each "listening region" watches the
// excitation u at a fixed vertex; when a depolarisation front sweeps past it
// (a rising-edge threshold crossing) it fires a low resonant thud plus a brief
// harmonic shimmer whose pitch tracks the local wave period.
//
// The TEMPO is the primary expressive axis and it transforms across the arc:
//   calm         — one region, slow ~1 Hz heartbeat
//   rotor        — two regions at different local periods -> polyrhythm
//   fibrillation — three regions, fronts arrive fast & irregular -> dense patter
//   dissolution  — crossings thin out, tempo slows back toward the heartbeat
//
// Gains ramp from 0, voices are capped, and a compressor acts as a soft limiter.

const THRESH_HI = 0.55 // rising-edge fires here
const THRESH_LO = 0.25 // must fall below here to re-arm (hysteresis)
const MAX_VOICES = 14

interface Region {
  prevU: number
  armed: boolean
  lastCross: number // ctx time of last crossing
  period: number // smoothed inter-crossing period (s)
  baseHz: number // thud fundamental tuning for this region
}

export class PulseEngine {
  private ctx: AudioContext
  private master: GainNode
  private limiter: DynamicsCompressorNode
  private voices = 0
  private regions: Region[]
  private activeCount = 1
  private startedAt = 0

  constructor(ctx: AudioContext, baseHzs: number[]) {
    this.ctx = ctx
    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -10
    this.limiter.knee.value = 6
    this.limiter.ratio.value = 12
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.12

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(this.limiter)
    this.limiter.connect(ctx.destination)

    this.regions = baseHzs.map((hz) => ({
      prevU: 0,
      armed: true,
      lastCross: 0,
      period: 1.0,
      baseHz: hz,
    }))
  }

  /** Ramp the master gain up from silence. */
  start() {
    const now = this.ctx.currentTime
    this.startedAt = now
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(0.0001, now)
    this.master.gain.exponentialRampToValueAtTime(0.5, now + 2.5)
  }

  setActiveRegions(n: number) {
    this.activeCount = Math.max(1, Math.min(this.regions.length, Math.round(n)))
  }

  /**
   * Feed the current excitation value at each region's vertex. Call every frame.
   * `us[k]` is u at region k's listening vertex. Returns the number of thuds
   * fired this frame (for optional visual feedback).
   */
  update(us: number[]) {
    const now = this.ctx.currentTime
    let fired = 0
    for (let k = 0; k < this.regions.length; k++) {
      const r = this.regions[k]
      const u = us[k] ?? 0
      if (r.armed && r.prevU < THRESH_HI && u >= THRESH_HI) {
        // Rising front detected.
        if (r.lastCross > 0) {
          const dt = now - r.lastCross
          if (dt > 0.05 && dt < 6) r.period = r.period * 0.6 + dt * 0.4
        }
        r.lastCross = now
        r.armed = false
        if (k < this.activeCount) {
          this.fire(r, now)
          fired++
        }
      }
      if (!r.armed && u < THRESH_LO) r.armed = true
      r.prevU = u
    }
    return fired
  }

  private fire(r: Region, when: number) {
    if (this.voices >= MAX_VOICES) return
    const ctx = this.ctx

    // --- Low resonant thud: a pitched body with a fast downward glide. ---
    const thud = ctx.createOscillator()
    thud.type = "sine"
    const f0 = r.baseHz
    thud.frequency.setValueAtTime(f0 * 1.7, when)
    thud.frequency.exponentialRampToValueAtTime(f0, when + 0.11)
    const body = ctx.createGain()
    body.gain.setValueAtTime(0.0001, when)
    body.gain.exponentialRampToValueAtTime(0.9, when + 0.006)
    body.gain.exponentialRampToValueAtTime(0.0008, when + 0.42)
    thud.connect(body).connect(this.master)

    // A quiet octave-up partial for definition.
    const click = ctx.createOscillator()
    click.type = "triangle"
    click.frequency.setValueAtTime(f0 * 2, when)
    const clickG = ctx.createGain()
    clickG.gain.setValueAtTime(0.0001, when)
    clickG.gain.exponentialRampToValueAtTime(0.22, when + 0.004)
    clickG.gain.exponentialRampToValueAtTime(0.0006, when + 0.12)
    click.connect(clickG).connect(this.master)

    // --- Harmonic shimmer: pitch/interval track the local wave period. ---
    // Faster waves (short period) -> higher, brighter shimmer.
    const fast = Math.max(0, Math.min(1, 1 - (r.period - 0.25) / 1.5))
    const shimHz = 220 * Math.pow(2, fast * 1.25)
    const interval = 1 + fast * 0.5 // resting fifth-ish -> tighter as it quickens
    const sh1 = ctx.createOscillator()
    sh1.type = "sine"
    sh1.frequency.setValueAtTime(shimHz, when)
    const sh2 = ctx.createOscillator()
    sh2.type = "sine"
    sh2.frequency.setValueAtTime(shimHz * interval, when)
    const shG = ctx.createGain()
    shG.gain.setValueAtTime(0.0001, when + 0.01)
    shG.gain.exponentialRampToValueAtTime(0.12, when + 0.03)
    shG.gain.exponentialRampToValueAtTime(0.0005, when + 0.22)
    sh1.connect(shG)
    sh2.connect(shG)
    shG.connect(this.master)

    this.voices += 3
    const stop = when + 0.5
    for (const o of [thud, click, sh1, sh2]) {
      o.start(when)
      o.stop(stop)
    }
    let ended = 0
    const onEnd = () => {
      ended++
      if (ended === 4) this.voices = Math.max(0, this.voices - 3)
    }
    thud.onended = onEnd
    click.onended = onEnd
    sh1.onended = onEnd
    sh2.onended = onEnd
  }

  stop() {
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
  }

  dispose() {
    try {
      this.master.disconnect()
      this.limiter.disconnect()
    } catch {
      // already torn down
    }
  }
}
