// audio.ts — Web Audio synthesis for the Expressive Accompanist.
//
// Two roles:
//   • melodyEcho()  — a soft echo of the note the player just played.
//   • accompany()   — the STAR: bass + chord triads whose:
//       (a) loudness   scales with the soloist's smoothed velocity (dynamics coupling)
//       (b) decay/gap  scales with the soloist's articulation ratio (articulation coupling)
//       (c) placement  is driven by the DTW-derived tempo (tempo coupling)
//
// All three dimensions of expression are coupled in real time, matching the
// central claim of The ACCompanion (Cancino-Chacón/Peter/Widmer, IJCAI 2023).
//
// Voices: detuned oscillators (sawtooth bass, triangle chord) through a fast-attack
// exponential-decay envelope. Sum bus through a DynamicsCompressor as brick-wall
// limiter so loud dynamics can never blast. No samples, no external deps.

import { midiToFreq } from "./score"
import type { Harmony } from "./score"

export class ExpressiveAudio {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private accompGain: GainNode | null = null
  private echoGain: GainNode | null = null

  async resume(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()

      // Limiter (DynamicsCompressor as brick-wall) prevents clipping on loud dynamics.
      this.limiter = this.ctx.createDynamicsCompressor()
      this.limiter.threshold.value = -6
      this.limiter.knee.value = 3
      this.limiter.ratio.value = 20
      this.limiter.attack.value = 0.001
      this.limiter.release.value = 0.08
      this.limiter.connect(this.ctx.destination)

      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = 0.85
      this.masterGain.connect(this.limiter)

      this.accompGain = this.ctx.createGain()
      this.accompGain.gain.value = 0.9
      this.accompGain.connect(this.masterGain)

      this.echoGain = this.ctx.createGain()
      this.echoGain.gain.value = 0.22
      this.echoGain.connect(this.masterGain)
    }
    if (this.ctx.state === "suspended") await this.ctx.resume()
  }

  get currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  // ── Private: one piano-ish voice ─────────────────────────────────────────────
  // freq    — fundamental frequency
  // out     — destination gain node
  // when    — AudioContext time to start
  // dur     — envelope sustain + decay total time
  // peak    — envelope peak amplitude (0..1)
  // type    — oscillator waveform
  private spawnVoice(
    freq: number,
    out: GainNode,
    when: number,
    dur: number,
    peak: number,
    type: OscillatorType = "triangle",
  ): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const g = ctx.createGain()
    g.connect(out)
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(peak, when + 0.010)
    // Decay to silence over dur.
    g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.05, dur))

    // Two detuned oscillators for warmth.
    for (const det of [-5, 5]) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      o.detune.value = det
      o.connect(g)
      o.start(when)
      o.stop(when + Math.max(0.06, dur) + 0.04)
    }
  }

  // ── Soft melody echo ─────────────────────────────────────────────────────────
  melodyEcho(midi: number, velocity: number): void {
    if (!this.ctx || !this.echoGain) return
    const t = this.ctx.currentTime
    const velNorm = velocity / 127
    this.spawnVoice(midiToFreq(midi), this.echoGain, t, 0.40, 0.3 * velNorm + 0.1, "triangle")
  }

  // ── The star: expressive accompaniment ───────────────────────────────────────
  // Parameters all come from the follower's real-time coupling:
  //   smoothedVelocity    — drives accompaniment loudness (0–127)
  //   smoothedArticulation — drives decay / detachment (0=staccato, 1=legato)
  //   durScale            — tempo proxy: scales nominal chord duration
  accompany(
    h: Harmony,
    smoothedVelocity: number,
    smoothedArticulation: number,
    durScale: number,
  ): void {
    if (!this.ctx || !this.accompGain) return
    const t = this.ctx.currentTime
    const out = this.accompGain

    // ── Dynamics coupling ─────────────────────────────────────────────────────
    // Map soloist velocity → accompaniment peak amplitude. Keep accompaniment
    // slightly softer than the melody so the soloist leads.
    const velNorm = Math.max(0.05, Math.min(1.0, smoothedVelocity / 127))
    const bassPeak = 0.15 + 0.45 * velNorm   // 0.15..0.60
    const chordPeak = 0.08 + 0.28 * velNorm  // 0.08..0.36

    // ── Articulation coupling ─────────────────────────────────────────────────
    // High ratio (legato) → longer sustain. Low ratio (staccato) → short decay.
    // Clamp so we always make an audible sound.
    const nomDur = Math.max(0.30, Math.min(1.80, 0.90 * durScale))
    const articulatedDur = nomDur * (0.25 + 0.75 * smoothedArticulation)
    const articDur = Math.max(0.10, articulatedDur)

    // ── Bass voice ─────────────────────────────────────────────────────────────
    this.spawnVoice(midiToFreq(h.bass), out, t, articDur * 1.15, bassPeak, "sawtooth")

    // ── Chord voices (staggered roll for a human touch) ───────────────────────
    h.chord.forEach((m, i) => {
      this.spawnVoice(midiToFreq(m), out, t + i * 0.014, articDur, chordPeak, "triangle")
    })
  }

  async dispose(): Promise<void> {
    try {
      this.accompGain?.disconnect()
      this.echoGain?.disconnect()
      this.masterGain?.disconnect()
      this.limiter?.disconnect()
      if (this.ctx && this.ctx.state !== "closed") await this.ctx.close()
    } catch {
      // ignore teardown races
    } finally {
      this.ctx = null
      this.masterGain = null
      this.limiter = null
      this.accompGain = null
      this.echoGain = null
    }
  }
}
