// audio.ts — Web Audio pad synth, root drone, demo progression, and Web MIDI hookup
// for 370-tonal-map. Self-contained; no cross-prototype imports.
//
// Architecture:
//   OscillatorNode (sawtooth) × voices → BiquadFilterNode (lowpass pad tone)
//   → GainNode (ADSR envelope) → GainNode (master)
//   → DynamicsCompressorNode (brick-wall limiter) → destination
//
// The internal demo plays a modulating chord progression (C maj → G maj → E min → C maj)
// looping at ~80 bpm so the comet clearly crosses key territories.
// Web MIDI is optionally hooked up; each note-on/off updates the activePCs map.

export interface NoteEvent {
  pc: number
  velocity: number
  on: boolean
}

export type NoteListener = (ev: NoteEvent) => void

// ─── Chord data for the internal demo ─────────────────────────────────────────

// Chord definition: [rootMidi, ...chord tone semitone offsets from root]
// All chords voiced as warm 3-note or 4-note pads in octave 3–4 range.
interface ChordDef {
  label: string
  midis: number[]   // absolute MIDI note numbers
  holdMs: number
}

// 80 bpm → quarter note ≈ 750ms; we do 2-bar holds for clear map motion.
// Progression: C→G→D→A (bright ascending modulation) then back via Em→Am→C.
// This gives a dramatic comet journey across the circle-of-fifths map.
const DEMO_PROGRESSION: ChordDef[] = [
  // ── C major ──
  { label: "C",  midis: [48, 52, 55, 60],  holdMs: 2000 },  // C3 E3 G3 C4  (I)
  { label: "F",  midis: [53, 57, 60, 65],  holdMs: 1500 },  // F3 A3 C4 F4  (IV)
  { label: "G",  midis: [55, 59, 62, 67],  holdMs: 1500 },  // G3 B3 D4 G4  (V)
  { label: "C",  midis: [48, 52, 55, 60],  holdMs: 1000 },  // back to I
  // ── Pivot → G major ──
  { label: "G",  midis: [43, 47, 50, 55],  holdMs: 2000 },  // G2 B2 D3 G3  (I of G)
  { label: "C",  midis: [48, 52, 55, 60],  holdMs: 1500 },  // C3 E3 G3 C4  (IV of G)
  { label: "D",  midis: [50, 54, 57, 62],  holdMs: 1500 },  // D3 F#3 A3 D4 (V of G)
  { label: "G",  midis: [43, 47, 50, 55],  holdMs: 1500 },  // G2 B2 D3 G3  (I of G)
  // ── Drift → D major ──
  { label: "D",  midis: [50, 54, 57, 62],  holdMs: 2000 },  // D3 F#3 A3 D4 (I of D)
  { label: "A",  midis: [57, 61, 64, 69],  holdMs: 1500 },  // A3 C#4 E4 A4 (V of D)
  { label: "D",  midis: [50, 54, 57, 62],  holdMs: 1500 },  // D3 F#3 A3 D4
  // ── E minor (relative of G) ──
  { label: "Em", midis: [52, 55, 59, 64],  holdMs: 2000 },  // E3 G3 B3 E4  (vi of G)
  { label: "Am", midis: [57, 60, 64, 69],  holdMs: 1500 },  // A3 C4 E4 A4  (ii of G)
  { label: "B",  midis: [47, 51, 54, 59],  holdMs: 1500 },  // B2 D#3 F#3 B3 (V of Em)
  { label: "Em", midis: [52, 55, 59, 64],  holdMs: 1500 },  // Em resolution
  // ── Return to C major ──
  { label: "Am", midis: [45, 48, 52, 57],  holdMs: 1500 },  // A2 C3 E3 A3  (vi of C)
  { label: "F",  midis: [53, 57, 60, 65],  holdMs: 1500 },  // F3 A3 C4 F4  (IV of C)
  { label: "G",  midis: [55, 59, 62, 67],  holdMs: 1500 },  // G3 B3 D4 G4  (V of C)
  { label: "C",  midis: [48, 52, 55, 60],  holdMs: 2500 },  // C3 E3 G3 C4  (I — home)
]

// MIDI note → pitch class
function midiToPC(midi: number): number { return midi % 12 }

// ─── Voice ────────────────────────────────────────────────────────────────────

interface PadVoice {
  osc: OscillatorNode
  osc2: OscillatorNode  // detuned partial for warmth
  gain: GainNode
  filter: BiquadFilterNode
  midi: number
}

// ─── TonalAudio ───────────────────────────────────────────────────────────────

export class TonalAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private droneOsc: OscillatorNode | null = null
  private droneGain: GainNode | null = null

  private voices: Map<number, PadVoice> = new Map()   // midi → voice

  // Demo sequencer state
  private demoTimer: ReturnType<typeof setTimeout> | null = null
  private demoIdx = 0
  private demoRunning = false

  // Active pitch-class map (pc → velocity weight) — read by the rAF loop
  readonly activePCs: Map<number, number> = new Map()

  // Listener list for note events (used by KeyFinder feed)
  private listeners: NoteListener[] = []

  // Web MIDI
  private midiAccess: MIDIAccess | null = null
  private midiCleanups: (() => void)[] = []

  /** Call inside a user gesture (iOS-safe AudioContext creation). */
  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume()
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = (window.AudioContext ?? (window as any).webkitAudioContext) as typeof AudioContext
    this.ctx = new Ctx()

    // Master → compressor → destination
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.55

    this.compressor = this.ctx.createDynamicsCompressor()
    this.compressor.threshold.value = -12
    this.compressor.knee.value = 3
    this.compressor.ratio.value = 20
    this.compressor.attack.value = 0.003
    this.compressor.release.value = 0.25

    this.master.connect(this.compressor)
    this.compressor.connect(this.ctx.destination)

    // Always-on root drone: C2, sine, very soft
    this.droneGain = this.ctx.createGain()
    this.droneGain.gain.value = 0.04
    this.droneOsc = this.ctx.createOscillator()
    this.droneOsc.type = "sine"
    this.droneOsc.frequency.value = 65.41  // C2
    this.droneOsc.connect(this.droneGain)
    this.droneGain.connect(this.master)
    this.droneOsc.start()

    // Start demo progression
    this.demoRunning = true
    this.demoIdx = 0
    this.scheduleNextChord()

    // Try Web MIDI
    await this.initMIDI()
  }

  private scheduleNextChord(): void {
    if (!this.demoRunning) return
    const chord = DEMO_PROGRESSION[this.demoIdx]
    this.playChord(chord.midis)
    this.demoTimer = setTimeout(() => {
      this.releaseAllVoices()
      this.demoIdx = (this.demoIdx + 1) % DEMO_PROGRESSION.length
      this.scheduleNextChord()
    }, chord.holdMs)
  }

  private playChord(midis: number[]): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const now = ctx.currentTime

    midis.forEach(midi => {
      if (this.voices.has(midi)) return  // already sounding
      const freq = 440 * Math.pow(2, (midi - 69) / 12)
      const pc = midiToPC(midi)

      // Lowpass filter for pad warmth
      const filter = ctx.createBiquadFilter()
      filter.type = "lowpass"
      filter.frequency.value = 1200
      filter.Q.value = 0.8

      // Gain (ADSR envelope via setTargetAtTime)
      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.gain.setTargetAtTime(0.18, now, 0.12)  // ~400ms attack

      // Primary oscillator: sawtooth
      const osc = ctx.createOscillator()
      osc.type = "sawtooth"
      osc.frequency.value = freq

      // Detuned second partial for chorus warmth
      const osc2 = ctx.createOscillator()
      osc2.type = "triangle"
      osc2.frequency.value = freq * 1.005   // 8 cents detune
      osc2.connect(filter)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(this.master!)

      osc.start()
      osc2.start()

      this.voices.set(midi, { osc, osc2, gain, filter, midi })

      // Update activePCs
      this.activePCs.set(pc, (this.activePCs.get(pc) ?? 0) + 80)
      this.emit({ pc, velocity: 80, on: true })
    })
  }

  private releaseAllVoices(): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    this.voices.forEach(v => {
      v.gain.gain.setTargetAtTime(0, now, 0.25)  // ~750ms release
      const midi = v.midi
      const pc = midiToPC(midi)
      setTimeout(() => {
        try { v.osc.stop(); v.osc2.stop() } catch { /* already stopped */ }
        this.voices.delete(midi)
      }, 1500)
      this.emit({ pc, velocity: 0, on: false })
    })
    this.activePCs.clear()
  }

  private emit(ev: NoteEvent): void {
    this.listeners.forEach(fn => fn(ev))
  }

  addListener(fn: NoteListener): void { this.listeners.push(fn) }
  removeListener(fn: NoteListener): void {
    this.listeners = this.listeners.filter(f => f !== fn)
  }

  // ─── Web MIDI ───────────────────────────────────────────────────────────────

  private async initMIDI(): Promise<void> {
    if (!navigator.requestMIDIAccess) return
    try {
      this.midiAccess = await navigator.requestMIDIAccess()
      this.hookMIDIPorts()
      const onStateChange = () => this.hookMIDIPorts()
      this.midiAccess.addEventListener("statechange", onStateChange)
      this.midiCleanups.push(() => {
        this.midiAccess?.removeEventListener("statechange", onStateChange)
      })
    } catch {
      // MIDI unavailable — demo continues
    }
  }

  private hookMIDIPorts(): void {
    if (!this.midiAccess) return
    this.midiAccess.inputs.forEach(port => {
      // Avoid double-hooking by checking onmidimessage
      if (port.onmidimessage) return
      const handler = (e: MIDIMessageEvent) => this.onMIDIMessage(e)
      port.onmidimessage = handler
    })
  }

  private onMIDIMessage(e: MIDIMessageEvent): void {
    const data = e.data
    if (!data || data.length < 2) return
    const status = data[0] & 0xf0
    const note = data[1]
    const velocity = data.length > 2 ? data[2] : 0
    const pc = midiToPC(note)

    if (status === 0x90 && velocity > 0) {
      // Note on — trigger voice
      if (this.ctx && this.master) {
        this.playChord([note])
      }
      this.activePCs.set(pc, velocity)
      this.emit({ pc, velocity, on: true })
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      // Note off
      const v = this.voices.get(note)
      if (v && this.ctx) {
        const now = this.ctx.currentTime
        v.gain.gain.setTargetAtTime(0, now, 0.2)
        const midi = v.midi
        setTimeout(() => {
          try { v.osc.stop(); v.osc2.stop() } catch { /* */ }
          this.voices.delete(midi)
        }, 1200)
      }
      // Only clear pc if no other voice has it
      let otherHasPC = false
      this.voices.forEach((voice, m) => {
        if (m !== note && midiToPC(m) === pc) otherHasPC = true
      })
      if (!otherHasPC) this.activePCs.delete(pc)
      this.emit({ pc, velocity: 0, on: false })
    }
  }

  /** Current chord label for HUD display. */
  currentChordLabel(): string {
    if (!this.demoRunning) return ""
    return DEMO_PROGRESSION[this.demoIdx]?.label ?? ""
  }

  dispose(): void {
    this.demoRunning = false
    if (this.demoTimer != null) clearTimeout(this.demoTimer)

    this.midiCleanups.forEach(fn => fn())
    if (this.midiAccess) {
      this.midiAccess.inputs.forEach(port => { port.onmidimessage = null })
    }

    const now = this.ctx?.currentTime ?? 0
    this.voices.forEach(v => {
      try {
        v.gain.gain.setTargetAtTime(0, now, 0.1)
        setTimeout(() => { try { v.osc.stop(); v.osc2.stop() } catch { /* */ } }, 500)
      } catch { /* */ }
    })
    this.voices.clear()

    try { this.droneOsc?.stop() } catch { /* */ }
    try { this.ctx?.close() } catch { /* */ }
  }
}
