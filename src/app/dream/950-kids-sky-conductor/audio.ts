// audio.ts — Web Audio engine for "Sky Conductor".
//
// Two voices, mirroring the two roles:
//   • a warm always-on CHORD BED (pad) that re-voices whenever the conductor's
//     chord changes — this is the harmonic CONTEXT both children hear.
//   • bright BELL/triangle MELODY notes for each player tap, already voiced into
//     a chord tone by harmony.voiceTap() so they always fit.
//
// Master chain (HARD constraint): gain(<=0.26) -> lowpass(~6.5kHz)
//   -> DynamicsCompressor(-10/20:1) -> destination.
// All sounds are soft (>=20ms attack), warm, safe for a 4-year-old on an iPad.

import { type Chord, midiToFreq } from './harmony'

export type AudioEngine = {
  ctx: AudioContext
  // Re-voice the warm chord bed to a new chord (gentle crossfade).
  setChord: (chord: Chord) => void
  // Chime a single melody note (already a chord tone). self=true → brighter.
  playNote: (midi: number, self: boolean) => void
  dispose: () => void
}

type PadVoice = {
  osc: OscillatorNode
  sub: OscillatorNode // a soft sub-octave for warmth
  gain: GainNode
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

  // ── master chain ────────────────────────────────────────────────────────────
  const master = ctx.createGain()
  master.gain.value = 0.24 // <= 0.26

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 6500 // ~6.5kHz, no harsh highs
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

  // ── warm chord bed ──────────────────────────────────────────────────────────
  // Three pad voices (a triad) + a soft sub. We keep voices allocated and just
  // glide their pitch + re-balance on a chord change, so it never restarts.
  const padBus = ctx.createGain()
  padBus.gain.value = 0.0
  padBus.connect(master)
  // gentle fade-in so Start is never a hard transient
  padBus.gain.setValueAtTime(0.0, ctx.currentTime)
  padBus.gain.linearRampToValueAtTime(0.62, ctx.currentTime + 1.2)

  // a breathing LFO shared across the pad for life
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.06
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.03
  lfo.connect(lfoGain)
  lfo.start()

  const PAD_VOICES = 3
  const padVoices: PadVoice[] = []
  for (let i = 0; i < PAD_VOICES; i++) {
    const osc = ctx.createOscillator()
    osc.type = i === 0 ? 'sine' : 'triangle'
    osc.frequency.value = 220
    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = 110
    const g = ctx.createGain()
    g.gain.value = 0.0
    lfoGain.connect(g.gain) // breathe
    osc.connect(g)
    const subG = ctx.createGain()
    subG.gain.value = 0.35
    sub.connect(subG)
    subG.connect(g)
    g.connect(padBus)
    osc.start()
    sub.start()
    padVoices.push({ osc, sub, gain: g })
  }

  let currentChord: Chord | null = null

  function setChord(chord: Chord) {
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    currentChord = chord
    // Voice the pad as a low triad: root, third, fifth from the chord's tones.
    // We pick three spread tones near the chord root for a warm bed.
    const bedMidi = pickBedTriad(chord)
    for (let i = 0; i < PAD_VOICES; i++) {
      const v = padVoices[i]
      const f = midiToFreq(bedMidi[i])
      // glide pitch so chord changes feel like a soft swell, not a jump
      v.osc.frequency.cancelScheduledValues(t)
      v.osc.frequency.setValueAtTime(v.osc.frequency.value, t)
      v.osc.frequency.linearRampToValueAtTime(f, t + 0.5)
      v.sub.frequency.cancelScheduledValues(t)
      v.sub.frequency.setValueAtTime(v.sub.frequency.value, t)
      v.sub.frequency.linearRampToValueAtTime(f / 2, t + 0.5)
      // soft re-attack of each voice level (>=20ms)
      const level = i === 0 ? 0.1 : 0.07
      v.gain.gain.cancelScheduledValues(t)
      v.gain.gain.setValueAtTime(v.gain.gain.value, t)
      v.gain.gain.linearRampToValueAtTime(level, t + 0.4)
    }
  }

  // ── melody bell (player tap) ────────────────────────────────────────────────
  function playNote(midi: number, self: boolean) {
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    const f = midiToFreq(midi)

    const env = ctx.createGain()
    const peak = self ? 0.2 : 0.14 // friend's notes a touch softer
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.025) // >=20ms soft attack
    env.gain.exponentialRampToValueAtTime(0.0001, t + (self ? 2.0 : 2.4))
    env.connect(master)

    // bell-ish: sine carrier + soft triangle an octave + a fifth up
    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    o1.frequency.value = f
    const o2 = ctx.createOscillator()
    o2.type = 'triangle'
    o2.frequency.value = f * 2 // shimmer octave
    const g2 = ctx.createGain()
    g2.gain.value = 0.14
    o2.connect(g2)
    g2.connect(env)
    o1.connect(env)

    o1.start(t)
    o2.start(t)
    o1.stop(t + 2.6)
    o2.stop(t + 2.6)
    o1.onended = () => {
      o1.disconnect()
      o2.disconnect()
      g2.disconnect()
      env.disconnect()
    }
  }

  function dispose() {
    const stopAll = (n: OscillatorNode) => {
      try {
        n.stop()
      } catch {
        /* already stopped */
      }
    }
    padVoices.forEach((v) => {
      stopAll(v.osc)
      stopAll(v.sub)
      try {
        v.gain.disconnect()
      } catch {
        /* noop */
      }
    })
    stopAll(lfo)
    try {
      lfoGain.disconnect()
      padBus.disconnect()
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

  void currentChord // referenced to keep state intent clear

  return { ctx, setChord, playNote, dispose }
}

// Choose a warm low triad (root / third / fifth) for the pad bed from a chord.
// We build it from the chord root so the bass clearly states the harmony.
function pickBedTriad(chord: Chord): [number, number, number] {
  const root = chord.root + 12 // up an octave from the sub-bass root for body
  // major vs minor third by chord name; fifth is always perfect for these.
  const minor = chord.name.endsWith('m')
  const third = root + (minor ? 3 : 4)
  const fifth = root + 7
  return [root, third, fifth]
}
