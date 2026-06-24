// audio.ts — Web Audio engine for "Starlight Friend"
// Master chain (HARD constraint): gain(<=0.26) -> lowpass(~6-7kHz)
//   -> DynamicsCompressor(-10/20:1) -> destination
// All sounds are soft (>=40ms attack), warm, safe for a 4-year-old on an iPad.

export type AudioEngine = {
  ctx: AudioContext
  // Play a single star chime. hue 0..1 picks a gentle pentatonic note + timbre.
  // self=true for stars this child made (slightly brighter/closer).
  chime: (hue: number, self: boolean) => void
  // A soft "fling" whoosh layered under a shooting star.
  whoosh: () => void
  dispose: () => void
}

// A warm pentatonic spread (C major pentatonic over ~2 octaves).
// Children's chimes never clash — every note is consonant with the pad.
const PENTA = [
  130.81, // C3
  146.83, // D3
  164.81, // E3
  196.0, //  G3
  220.0, //  A3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.0, //  G4
  440.0, //  A4
  523.25, // C5
]

// Map a hue (0..1) to a pentatonic frequency. Warmer hues -> lower, so the
// gold/rose stars hum and the cyan stars sparkle higher. Purely aesthetic.
export function hueToFreq(hue: number): number {
  const i = Math.min(PENTA.length - 1, Math.max(0, Math.round(hue * (PENTA.length - 1))))
  return PENTA[i]
}

export function makeAudioEngine(): AudioEngine | null {
  let ctx: AudioContext
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  } catch {
    return null
  }

  // ── master chain ──────────────────────────────────────────────────────────
  const master = ctx.createGain()
  master.gain.value = 0.24 // <= 0.26

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 6500 // ~6-7kHz: no harsh highs
  lp.Q.value = 0.5

  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -10
  comp.knee.value = 24
  comp.ratio.value = 20
  comp.attack.value = 0.006
  comp.release.value = 0.28

  master.connect(lp)
  lp.connect(comp)
  comp.connect(ctx.destination)

  // ── always-on ambient pad ──────────────────────────────────────────────────
  // Two soft sine drones (C2 + G2) + a slow shimmer. So it never feels silent.
  const padGain = ctx.createGain()
  padGain.gain.value = 0.0
  padGain.connect(master)
  // gentle fade-in so Start is never a hard transient
  padGain.gain.setValueAtTime(0.0, ctx.currentTime)
  padGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2)

  const padOscs: OscillatorNode[] = []
  const padNodes: AudioNode[] = [padGain]
  ;[65.41, 98.0].forEach((hz, idx) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = hz
    const g = ctx.createGain()
    g.gain.value = idx === 0 ? 0.06 : 0.04
    // slow LFO on amplitude for a breathing pad
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.05 + idx * 0.017
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.02
    lfo.connect(lfoGain)
    lfoGain.connect(g.gain)
    o.connect(g)
    g.connect(padGain)
    o.start()
    lfo.start()
    padOscs.push(o, lfo)
    padNodes.push(g, lfo, lfoGain)
  })

  // A faint high shimmer triad far under the mix for "twinkle" air.
  ;[523.25, 659.25].forEach((hz) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = hz
    const g = ctx.createGain()
    g.gain.value = 0.012
    o.connect(g)
    g.connect(padGain)
    o.start()
    padOscs.push(o)
    padNodes.push(g)
  })

  // ── per-star chime ──────────────────────────────────────────────────────────
  function chime(hue: number, self: boolean) {
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    const f = hueToFreq(hue)

    // Bell-ish FM-lite: a sine carrier + a soft triangle a fifth above.
    const env = ctx.createGain()
    const peak = self ? 0.22 : 0.16 // friend's stars a touch softer/farther
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.05) // >=40ms soft attack
    env.gain.exponentialRampToValueAtTime(0.0001, t + (self ? 2.4 : 2.8))
    env.connect(master)

    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    o1.frequency.value = f
    const o2 = ctx.createOscillator()
    o2.type = 'triangle'
    o2.frequency.value = f * 1.5 // perfect fifth shimmer
    const g2 = ctx.createGain()
    g2.gain.value = 0.18
    o2.connect(g2)
    g2.connect(env)
    o1.connect(env)

    o1.start(t)
    o2.start(t)
    o1.stop(t + 3.0)
    o2.stop(t + 3.0)
    o1.onended = () => {
      o1.disconnect()
      o2.disconnect()
      g2.disconnect()
      env.disconnect()
    }
  }

  // ── fling whoosh (filtered noise burst) ────────────────────────────────────
  function whoosh() {
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    const dur = 0.5
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(900, t)
    bp.frequency.exponentialRampToValueAtTime(2200, t + dur)
    bp.Q.value = 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.05, t + 0.06)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp)
    bp.connect(g)
    g.connect(master)
    src.start(t)
    src.stop(t + dur + 0.05)
    src.onended = () => {
      src.disconnect()
      bp.disconnect()
      g.disconnect()
    }
  }

  function dispose() {
    padOscs.forEach((o) => {
      try {
        o.stop()
      } catch {
        /* already stopped */
      }
    })
    padNodes.forEach((n) => {
      try {
        n.disconnect()
      } catch {
        /* noop */
      }
    })
    try {
      master.disconnect()
      lp.disconnect()
      comp.disconnect()
    } catch {
      /* noop */
    }
    try {
      void ctx.close()
    } catch {
      /* noop */
    }
  }

  return { ctx, chime, whoosh, dispose }
}
