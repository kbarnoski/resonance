// audio.ts — Harmonic chord engine driven by mixed-paint color (HSV)
//
// Architecture:
//   oscillators → voiceGain → masterGain → lowpass → compressor → destination
//
// A fixed tonal center (C2+G2+C3 pad) always sounds.
// The mixed-color's HUE continuously shapes the chord quality over that center:
//   warm  0–60°  → major/add9  (C + E + G, optionally D)
//   green 90–180°→ sus/open    (C + F + G, suspended feel)
//   blue  200–290→ minor       (C + Eb + G)
//   magenta/pink → maj7/dreamy (C + E + G + B)
// Saturation → richness (more added voices, higher partial gain)
// Value → brightness (filter freq + oscillator harmonic balance)
// All changes glide smoothly — no clicks, no note-retriggering.

export interface AudioEngine {
  setColor: (h: number, s: number, v: number) => void
  close: () => void
}

// All notes in Hz (C2 = 65.41, tuned to equal temperament)
const C2  = 65.41
const G2  = 98.00
const C3  = 130.81
const D3  = 146.83
const Eb3 = 155.56
const E3  = 164.81
const F3  = 174.61
const G3  = 196.00
const B3  = 246.94

// Semitone intervals for chords above C3
const CHORD_FREQS = {
  root:   C3,
  major3: E3,
  minor3: Eb3,
  fourth: F3,
  fifth:  G3,
  ninth:  D3,
  maj7:   B3,
}

type VoiceName = 'pad1' | 'pad2' | 'pad3' | 'maj3' | 'min3' | 'fourth' | 'ninth' | 'maj7'

interface Voice {
  osc: OscillatorNode
  gain: GainNode
}

function makeVoice(
  ctx: AudioContext,
  freq: number,
  type: OscillatorType,
  dest: AudioNode,
): Voice {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  const gain = ctx.createGain()
  gain.gain.value = 0
  osc.connect(gain)
  gain.connect(dest)
  osc.start()
  return { osc, gain }
}

export function createAudioEngine(ctx: AudioContext): AudioEngine {
  const t = ctx.currentTime

  // ── Master chain ──────────────────────────────────────────────────────────
  const masterGain = ctx.createGain()
  masterGain.gain.value = 0.27

  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 4000
  lowpass.Q.value = 0.5

  const comp = ctx.createDynamicsCompressor()
  comp.threshold.setValueAtTime(-10, t)
  comp.knee.setValueAtTime(6, t)
  comp.ratio.setValueAtTime(20, t)
  comp.attack.setValueAtTime(0.003, t)
  comp.release.setValueAtTime(0.25, t)

  masterGain.connect(lowpass)
  lowpass.connect(comp)
  comp.connect(ctx.destination)

  // ── Voices ────────────────────────────────────────────────────────────────
  const voices: Record<VoiceName, Voice> = {
    // Fixed C+G pad (always on, soft sine)
    pad1: makeVoice(ctx, C2,  'sine',     masterGain),
    pad2: makeVoice(ctx, G2,  'sine',     masterGain),
    pad3: makeVoice(ctx, C3,  'triangle', masterGain),
    // Harmonic overlay voices (shaped by color)
    maj3:   makeVoice(ctx, CHORD_FREQS.major3,  'triangle', masterGain),
    min3:   makeVoice(ctx, CHORD_FREQS.minor3,  'triangle', masterGain),
    fourth: makeVoice(ctx, CHORD_FREQS.fourth,  'triangle', masterGain),
    ninth:  makeVoice(ctx, CHORD_FREQS.ninth,   'sine',     masterGain),
    maj7:   makeVoice(ctx, CHORD_FREQS.maj7,    'sine',     masterGain),
  }

  // Warm up pad (soft attack)
  ;(['pad1','pad2','pad3'] as VoiceName[]).forEach((name, i) => {
    const g = voices[name].gain.gain
    g.setValueAtTime(0, t)
    g.linearRampToValueAtTime(0.08 - i * 0.01, t + 0.8)
  })

  // Filter for color → brightness
  const colorFilter = ctx.createBiquadFilter()
  colorFilter.type = 'lowpass'
  colorFilter.frequency.value = 1800
  colorFilter.Q.value = 0.4
  // Rewire: melody voices go through colorFilter first, then masterGain
  ;(['maj3','min3','fourth','ninth','maj7'] as VoiceName[]).forEach(name => {
    voices[name].gain.disconnect()
    voices[name].gain.connect(colorFilter)
  })
  colorFilter.connect(masterGain)

  // ── Color → chord update ──────────────────────────────────────────────────
  let lastH = -1, lastS = -1, lastV = -1

  function setColor(h: number, s: number, v: number) {
    // Debounce micro-changes to avoid spamming automation
    if (Math.abs(h - lastH) < 1 && Math.abs(s - lastS) < 0.01 && Math.abs(v - lastV) < 0.01) return
    lastH = h; lastS = s; lastV = v

    const now = ctx.currentTime
    const glide = 0.12 // seconds for smooth crossfade

    // ── Brightness / filter from value + saturation ────────────────────────
    const filterHz = 800 + s * 3000 + v * 1500
    colorFilter.frequency.setTargetAtTime(Math.min(filterHz, 7000), now, glide)

    // ── Hue → chord weights ────────────────────────────────────────────────
    // We use smooth overlapping triangles across the hue circle
    function hueMix(center: number, width: number): number {
      // Handles wrap-around
      let d = Math.abs(h - center)
      if (d > 180) d = 360 - d
      return Math.max(0, 1 - d / width)
    }

    const warmMix    = hueMix(30, 80)   // 0–60° orange/red
    const greenMix   = hueMix(135, 70)  // 90–180° green/teal
    const blueMix    = hueMix(245, 80)  // 200–290° blue/violet
    const magentaMix = hueMix(320, 60)  // 280–360/0 magenta/pink

    // Normalise so they sum to 1
    const total = warmMix + greenMix + blueMix + magentaMix + 0.001
    const ww = warmMix / total
    const wg = greenMix / total
    const wb = blueMix / total
    const wm = magentaMix / total

    // Richness from saturation (0=plain dyad, 1=full voicing)
    const rich = Math.pow(s, 0.6)

    // Major 3rd: warm + magenta
    const maj3G = (ww * 0.9 + wm * 0.7) * rich * 0.55
    // Minor 3rd: blue
    const min3G = wb * rich * 0.55
    // Fourth (sus): green
    const fourthG = wg * rich * 0.55
    // Ninth (add9 color): warm + some richness
    const ninthG = ww * Math.pow(rich, 1.5) * 0.35
    // Maj7 (dreamy): magenta
    const maj7G = wm * Math.pow(rich, 1.5) * 0.35

    // Volume of the base pad breathes with value
    const padGain = 0.06 + v * 0.04
    ;(['pad1','pad2','pad3'] as VoiceName[]).forEach(name => {
      voices[name].gain.gain.setTargetAtTime(padGain, now, glide)
    })

    // Apply voice gains
    const setG = (name: VoiceName, gain: number) =>
      voices[name].gain.gain.setTargetAtTime(Math.max(0, gain), now, glide)

    setG('maj3',   maj3G)
    setG('min3',   min3G)
    setG('fourth', fourthG)
    setG('ninth',  ninthG)
    setG('maj7',   maj7G)
  }

  function close() {
    Object.values(voices).forEach(v => {
      try { v.osc.stop() } catch { /* already stopped */ }
      v.osc.disconnect()
      v.gain.disconnect()
    })
    colorFilter.disconnect()
    masterGain.disconnect()
    lowpass.disconnect()
    comp.disconnect()
    ctx.close()
  }

  return { setColor, close }
}
