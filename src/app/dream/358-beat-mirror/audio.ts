// audio.ts — 358-beat-mirror
// Subsystem (b): the sound sources.
//   1. An internal Web Audio drum-loop synth (kick / snare / hat) at a KNOWN
//      tempo so the piece autoplays and self-demos with no mic — you know the
//      right answer, which proves the tracking pipeline is correct.
//   2. A live-mic input path (analysis only; never recorded, never uploaded,
//      never connected to destination — no feedback).
//
// Both paths terminate in a single shared AnalyserNode whose time-domain PCM
// the tracker reads each frame. The AudioContext is created lazily INSIDE a
// user gesture (iOS-safe) by the page.

export type Source = "groove" | "mic"

const GROOVE_BPM = 112

// One bar of a 4/4 groove as (beatFraction, voice, gain) hits. beatFraction is
// in units of beats (0..4). A backbeat snare on 2 & 4, four-on-the-floor kick,
// offbeat hats — an unambiguous pulse for the tracker to lock onto.
type Voice = "kick" | "snare" | "hat"
const PATTERN: Array<[number, Voice, number]> = [
  [0.0, "kick", 1.0],
  [0.0, "hat", 0.4],
  [0.5, "hat", 0.3],
  [1.0, "snare", 0.9],
  [1.0, "hat", 0.4],
  [1.5, "hat", 0.3],
  [2.0, "kick", 1.0],
  [2.0, "hat", 0.4],
  [2.5, "kick", 0.6],
  [2.5, "hat", 0.3],
  [3.0, "snare", 0.9],
  [3.0, "hat", 0.4],
  [3.5, "hat", 0.3],
]

export class BeatMirrorAudio {
  context: AudioContext | null = null
  analyser: AnalyserNode | null = null
  source: Source = "groove"
  micError: string | null = null
  micActive = false
  readonly grooveBpm = GROOVE_BPM

  private master: GainNode | null = null
  private grooveGain: GainNode | null = null
  private micGain: GainNode | null = null
  private micStream: MediaStream | null = null
  private micNode: MediaStreamAudioSourceNode | null = null
  private schedulerId: number | null = null
  private nextNoteTime = 0
  private currentBeat = 0 // beats into the loop (wraps at 4)

  // Create the graph inside a user gesture. Returns the live analyser.
  async start(): Promise<AnalyserNode> {
    if (this.context) {
      await this.context.resume()
      return this.analyser as AnalyserNode
    }
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext
    const ctx = new Ctx()
    this.context = ctx

    // Master bus -> destination (audible) and -> analyser (for tracking).
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
    this.master = master

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0
    this.analyser = analyser

    // The groove plays through master (audible) AND is tapped into the
    // analyser. The mic feeds ONLY the analyser (never audible, no feedback).
    const grooveGain = ctx.createGain()
    grooveGain.gain.value = 1
    grooveGain.connect(master)
    grooveGain.connect(analyser)
    this.grooveGain = grooveGain

    const micGain = ctx.createGain()
    micGain.gain.value = 1.6
    micGain.connect(analyser)
    this.micGain = micGain

    await ctx.resume()
    this.startScheduler()
    return analyser
  }

  // ---- internal groove synth -------------------------------------------------

  private startScheduler() {
    if (!this.context) return
    this.nextNoteTime = this.context.currentTime + 0.06
    this.currentBeat = 0
    const lookahead = 0.025 // s
    const scheduleAhead = 0.12 // s
    const secPerBeat = 60 / GROOVE_BPM

    const tick = () => {
      const ctx = this.context
      if (!ctx) return
      while (this.nextNoteTime < ctx.currentTime + scheduleAhead) {
        // Schedule every hit whose beatFraction falls in this beat slot.
        for (const [frac, voice, gain] of PATTERN) {
          if (Math.floor(frac) === this.currentBeat) {
            const t = this.nextNoteTime + (frac - this.currentBeat) * secPerBeat
            this.scheduleHit(t, voice, gain)
          }
        }
        this.nextNoteTime += secPerBeat
        this.currentBeat = (this.currentBeat + 1) % 4
      }
      this.schedulerId = window.setTimeout(tick, lookahead * 1000)
    }
    tick()
  }

  private scheduleHit(time: number, voice: Voice, gain: number) {
    const ctx = this.context
    const out = this.grooveGain
    if (!ctx || !out) return
    if (voice === "kick") this.synthKick(ctx, out, time, gain)
    else if (voice === "snare") this.synthSnare(ctx, out, time, gain)
    else this.synthHat(ctx, out, time, gain)
  }

  private synthKick(ctx: AudioContext, out: AudioNode, t: number, g: number) {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(g, t + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    osc.connect(env)
    env.connect(out)
    osc.start(t)
    osc.stop(t + 0.32)
  }

  private synthSnare(ctx: AudioContext, out: AudioNode, t: number, g: number) {
    // Noise burst + a short tonal body.
    const noise = ctx.createBufferSource()
    noise.buffer = this.noiseBuffer(ctx)
    const hp = ctx.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 1400
    const nEnv = ctx.createGain()
    nEnv.gain.setValueAtTime(0.0001, t)
    nEnv.gain.exponentialRampToValueAtTime(g, t + 0.003)
    nEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    noise.connect(hp)
    hp.connect(nEnv)
    nEnv.connect(out)
    noise.start(t)
    noise.stop(t + 0.2)

    const body = ctx.createOscillator()
    body.type = "triangle"
    body.frequency.value = 185
    const bEnv = ctx.createGain()
    bEnv.gain.setValueAtTime(0.0001, t)
    bEnv.gain.exponentialRampToValueAtTime(g * 0.5, t + 0.003)
    bEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    body.connect(bEnv)
    bEnv.connect(out)
    body.start(t)
    body.stop(t + 0.12)
  }

  private synthHat(ctx: AudioContext, out: AudioNode, t: number, g: number) {
    const noise = ctx.createBufferSource()
    noise.buffer = this.noiseBuffer(ctx)
    const hp = ctx.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 7000
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(g, t + 0.002)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    noise.connect(hp)
    hp.connect(env)
    env.connect(out)
    noise.start(t)
    noise.stop(t + 0.06)
  }

  private cachedNoise: AudioBuffer | null = null
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.cachedNoise) return this.cachedNoise
    const len = Math.floor(ctx.sampleRate * 0.3)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.cachedNoise = buf
    return buf
  }

  // ---- source switching ------------------------------------------------------

  async setSource(src: Source): Promise<void> {
    if (!this.context) return
    if (src === "mic") {
      const ok = await this.enableMic()
      if (!ok) return // stay on groove, micError set
      this.source = "mic"
      // Mute the audible groove while listening to the room, but keep the
      // scheduler running so re-toggling is instant. Groove still feeds the
      // analyser? No — when on mic the analyser should hear the room only.
      if (this.grooveGain) this.grooveGain.gain.value = 0
    } else {
      this.source = "groove"
      if (this.grooveGain) this.grooveGain.gain.value = 1
      this.disableMic()
    }
  }

  private async enableMic(): Promise<boolean> {
    const ctx = this.context
    if (!ctx) return false
    if (this.micActive) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      this.micStream = stream
      this.micNode = ctx.createMediaStreamSource(stream)
      if (this.micGain) this.micNode.connect(this.micGain)
      this.micActive = true
      this.micError = null
      return true
    } catch (e) {
      this.micError =
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone permission denied — the internal groove keeps running. Tap Groove or reload to retry."
          : "Microphone unavailable on this device — the internal groove keeps running."
      this.micActive = false
      return false
    }
  }

  private disableMic() {
    this.micNode?.disconnect()
    this.micNode = null
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    this.micActive = false
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 44100
  }

  get state(): AudioContextState | "closed" {
    return this.context?.state ?? "closed"
  }

  dispose() {
    if (this.schedulerId != null) {
      clearTimeout(this.schedulerId)
      this.schedulerId = null
    }
    this.disableMic()
    this.master?.disconnect()
    this.grooveGain?.disconnect()
    this.micGain?.disconnect()
    void this.context?.close()
    this.context = null
    this.analyser = null
  }
}
