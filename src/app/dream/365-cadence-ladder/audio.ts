// audio.ts — 365-cadence-ladder
//
// Synthesises a known harmonic progression through a warm triangle-wave pad voice
// and a DynamicsCompressor brick-wall limiter. Every chord sends note-on events
// into the pipeline via the onNoteEvent callback so the same audio analysis path
// used by Web MIDI is exercised by the internal demo.
//
// Progression authorship (so the correct answers are KNOWN ground-truth):
//
//  Section A — C major
//    C  E  G       → I   (Tonic)
//    F  A  C       → IV  (Subdominant)   departure
//    G  B  D       → V   (Dominant)      tension
//    C  E  G       → I   (Tonic)         ← authentic cadence V→I
//    G  B  D  F    → V7  (Dominant)      build again
//    A  C  E       → vi  (Tonic, deceptive) ← deceptive V→vi
//    F  A  C       → IV  (Subdominant)
//    C  E  G       → I   (Tonic)         ← plagal cadence IV→I
//
//  Section B — G major (modulation to the dominant)
//    G  B  D       → I   (Tonic)         ← new key ripple
//    C  E  G       → IV  (Subdominant)
//    D  F# A       → V   (Dominant)
//    G  B  D       → I   (Tonic)         ← authentic cadence
//    then loops back to Section A
//
// MIDI numbers used (middle octave):
//   C4=60 D4=62 E4=64 F4=65 G4=67 A4=69 B4=71
//   F#4=66 (in G section)

export type NoteEventCb = (pitchClass: number, velocity: number, on: boolean) => void

// pitch classes
const C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, B = 11

type Chord = number[]
type Step = { chord: Chord; dur: number; label: string }

// dur = number of quarter notes
const SECTION_A: Step[] = [
  { chord: [C, E, G],       dur: 4, label: "C  I" },
  { chord: [F, A, C],       dur: 4, label: "F  IV" },
  { chord: [G, B, D],       dur: 4, label: "G  V" },
  { chord: [C, E, G],       dur: 4, label: "C  I  ← authentic cadence" },
  { chord: [G, B, D, F],    dur: 4, label: "G7  V7" },
  { chord: [A, C, E],       dur: 4, label: "Am vi  ← deceptive" },
  { chord: [F, A, C],       dur: 4, label: "F  IV" },
  { chord: [C, E, G],       dur: 4, label: "C  I  ← plagal cadence" },
]

const Fs = 6  // F#
const SECTION_B: Step[] = [
  { chord: [G, B, D],       dur: 4, label: "G  I  ← modulation to G major" },
  { chord: [C, E, G],       dur: 4, label: "C  IV" },
  { chord: [D, Fs, A],      dur: 4, label: "D  V" },
  { chord: [G, B, D],       dur: 4, label: "G  I  ← authentic cadence" },
]

const PROGRESSION: Step[] = [...SECTION_A, ...SECTION_B]
const BPM = 72
const SEC_PER_BEAT = 60 / BPM

export class LadderAudio {
  context: AudioContext | null = null

  private master: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private schedulerId: ReturnType<typeof setTimeout> | null = null
  private nextNoteTime = 0
  private stepIndex = 0
  private beatInStep = 0
  private activeNotes: Set<number> = new Set()

  // Will be called by the page for pipeline ingestion
  onNoteEvent: NoteEventCb | null = null

  async start(): Promise<AudioContext> {
    if (this.context) {
      await this.context.resume()
      return this.context
    }
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext
    const ctx = new Ctx()
    this.context = ctx

    // Brick-wall limiter — can NEVER blast
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -3
    comp.knee.value = 1
    comp.ratio.value = 20
    comp.attack.value = 0.001
    comp.release.value = 0.15
    comp.connect(ctx.destination)
    this.compressor = comp

    const master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(comp)
    this.master = master

    await ctx.resume()
    this.nextNoteTime = ctx.currentTime + 0.08
    this.runScheduler()
    return ctx
  }

  private runScheduler() {
    const lookahead = 0.025
    const scheduleAhead = 0.15

    const tick = () => {
      const ctx = this.context
      if (!ctx) return
      while (this.nextNoteTime < ctx.currentTime + scheduleAhead) {
        const step = PROGRESSION[this.stepIndex]
        // On beat 0 of each chord step: play the chord
        if (this.beatInStep === 0) {
          this.scheduleChordOn(ctx, step.chord, this.nextNoteTime)
          // Schedule note-off just before next chord
          const offTime = this.nextNoteTime + step.dur * SEC_PER_BEAT * 0.88
          this.scheduleChordOff(ctx, step.chord, offTime)
        }
        this.beatInStep++
        if (this.beatInStep >= step.dur) {
          this.beatInStep = 0
          this.stepIndex = (this.stepIndex + 1) % PROGRESSION.length
        }
        this.nextNoteTime += SEC_PER_BEAT
      }
      this.schedulerId = setTimeout(tick, lookahead * 1000)
    }
    tick()
  }

  private scheduleChordOn(ctx: AudioContext, pcs: number[], t: number) {
    for (const pc of pcs) {
      // Map pitch class to a nice mid-register MIDI note (octave 4-5)
      const midi = 60 + pc  // C4 = 60
      this.schedulePadNote(ctx, midi, t)
      // Immediately fire the callback for the pipeline (slight schedule offset)
      const delay = Math.max(0, t - ctx.currentTime) * 1000
      setTimeout(() => {
        if (this.activeNotes.has(pc)) return  // already sounding
        this.activeNotes.add(pc)
        this.onNoteEvent?.(pc, 90, true)
      }, delay)
    }
  }

  private scheduleChordOff(ctx: AudioContext, pcs: number[], t: number) {
    for (const pc of pcs) {
      const delay = Math.max(0, t - ctx.currentTime) * 1000
      setTimeout(() => {
        this.activeNotes.delete(pc)
        this.onNoteEvent?.(pc, 0, false)
      }, delay)
    }
  }

  // Warm FM-flavoured triangle pad with slow attack and release
  private schedulePadNote(ctx: AudioContext, midi: number, t: number) {
    const out = this.master
    if (!out) return

    const freq = 440 * Math.pow(2, (midi - 69) / 12)
    const attack = 0.04
    const decay = 0.1
    const sustain = 0.65
    const release = 0.35
    const dur = SEC_PER_BEAT * PROGRESSION[this.stepIndex].dur

    // Carrier
    const osc = ctx.createOscillator()
    osc.type = "triangle"
    osc.frequency.value = freq

    // Modulator for subtle warmth
    const mod = ctx.createOscillator()
    const modGain = ctx.createGain()
    mod.frequency.value = freq * 2.001  // slight detune
    modGain.gain.value = freq * 0.08

    // Envelope
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(sustain, t + attack)
    env.gain.linearRampToValueAtTime(sustain * 0.85, t + attack + decay)
    env.gain.setValueAtTime(sustain * 0.85, t + dur * 0.85)
    env.gain.linearRampToValueAtTime(0.0001, t + dur * 0.85 + release)

    // Per-voice gain (quieter to leave headroom for 4 simultaneous notes)
    const vg = ctx.createGain()
    vg.gain.value = 0.22

    mod.connect(modGain)
    modGain.connect(osc.frequency)
    osc.connect(env)
    env.connect(vg)
    vg.connect(out)

    mod.start(t)
    osc.start(t)
    const stop = t + dur * 0.85 + release + 0.05
    mod.stop(stop)
    osc.stop(stop)
  }

  dispose() {
    if (this.schedulerId != null) {
      clearTimeout(this.schedulerId)
      this.schedulerId = null
    }
    this.master?.disconnect()
    this.compressor?.disconnect()
    void this.context?.close()
    this.context = null
  }
}
