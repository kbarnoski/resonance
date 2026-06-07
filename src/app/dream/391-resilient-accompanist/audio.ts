// audio.ts — Web Audio synthesis for the Resilient Accompanist.
//
// Two roles (ported from cycle 2, kept intact):
//   • melodyEcho()  — a soft echo of the note the soloist just played.
//   • accompany()   — bass + chord triad whose:
//       (a) loudness  scales with the soloist's smoothed velocity (dynamics)
//       (b) decay/gap scales with the soloist's articulation ratio (articulation)
//       (c) placement is driven by the TRUSTED follower's committed position
//
// Cycle 3 keeps the dynamics + articulation coupling of cycle 2 and adds nothing
// to the synthesis itself — the new intelligence lives in the supervisor that
// chooses WHICH follower's position to accompany. We expose one extra cue:
//   • fumbleBlip() — a short, soft hint when the supervisor detects trouble, so
//     the recovery is audible as well as visible (very quiet; never masks music).
//
// Voices: detuned oscillators (sawtooth bass, triangle chord) through a fast
// exponential-decay envelope, summed through a DynamicsCompressor brick-wall
// limiter so loud dynamics can never blast. No samples, no external deps.

import { midiToFreq } from "./score"
import type { Harmony } from "./score"

export class ResilientAudio {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private accompGain: GainNode | null = null
  private echoGain: GainNode | null = null
  private blipGain: GainNode | null = null

  async resume(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()

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
      this.echoGain.gain.value = 0.26
      this.echoGain.connect(this.masterGain)

      this.blipGain = this.ctx.createGain()
      this.blipGain.gain.value = 0.16
      this.blipGain.connect(this.masterGain)
    }
    if (this.ctx.state === "suspended") await this.ctx.resume()
  }

  get currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  // ── Private: one piano-ish voice ─────────────────────────────────────────────
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
    g.gain.exponentialRampToValueAtTime(peak, when + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.05, dur))

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

  // ── Soft melody echo (what the soloist actually played) ───────────────────────
  melodyEcho(midi: number, velocity: number): void {
    if (!this.ctx || !this.echoGain) return
    const t = this.ctx.currentTime
    const velNorm = velocity / 127
    this.spawnVoice(midiToFreq(midi), this.echoGain, t, 0.4, 0.3 * velNorm + 0.1, "triangle")
  }

  // ── The accompaniment, coupled to the soloist's expression (cycle 2) ──────────
  //   smoothedVelocity     — drives accompaniment loudness (0–127)
  //   smoothedArticulation — drives decay / detachment (0 staccato, 1 legato)
  //   durScale             — tempo proxy: scales nominal chord duration
  accompany(
    h: Harmony,
    smoothedVelocity: number,
    smoothedArticulation: number,
    durScale: number,
  ): void {
    if (!this.ctx || !this.accompGain) return
    const t = this.ctx.currentTime
    const out = this.accompGain

    const velNorm = Math.max(0.05, Math.min(1.0, smoothedVelocity / 127))
    const bassPeak = 0.15 + 0.45 * velNorm
    const chordPeak = 0.08 + 0.28 * velNorm

    const nomDur = Math.max(0.3, Math.min(1.8, 0.9 * durScale))
    const articulatedDur = nomDur * (0.25 + 0.75 * smoothedArticulation)
    const articDur = Math.max(0.1, articulatedDur)

    this.spawnVoice(midiToFreq(h.bass), out, t, articDur * 1.15, bassPeak, "sawtooth")
    h.chord.forEach((m, i) => {
      this.spawnVoice(midiToFreq(m), out, t + i * 0.014, articDur, chordPeak, "triangle")
    })
  }

  // ── A short, soft cue when the supervisor detects trouble / switches followers.
  // Two flavours: a downward "uh-oh" when DTW loses confidence (handing to HMM),
  // an upward "found-it" when confidence recovers (handing back to DTW).
  fumbleBlip(direction: "lost" | "found"): void {
    if (!this.ctx || !this.blipGain) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const g = ctx.createGain()
    g.connect(this.blipGain)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    const o = ctx.createOscillator()
    o.type = "sine"
    o.connect(g)
    if (direction === "lost") {
      o.frequency.setValueAtTime(660, t)
      o.frequency.exponentialRampToValueAtTime(330, t + 0.2)
    } else {
      o.frequency.setValueAtTime(440, t)
      o.frequency.exponentialRampToValueAtTime(880, t + 0.18)
    }
    o.start(t)
    o.stop(t + 0.26)
  }

  async dispose(): Promise<void> {
    try {
      this.accompGain?.disconnect()
      this.echoGain?.disconnect()
      this.blipGain?.disconnect()
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
      this.blipGain = null
    }
  }
}
