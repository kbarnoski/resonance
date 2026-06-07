// audio.ts — Web Audio synthesis for Tempo Canon.
//
// Two roles:
//   • melodyEcho()  — a soft, quiet confirmation of the note the player just
//                     played (optional voice, kept in the background).
//   • accompany()   — the STAR: a functional bass note + chord, fired by the
//                     follower at the player's committed score position. Tempo
//                     of the chord's decay tracks the player's slope-derived
//                     tempo so it breathes with their rubato.
//
// A piano-ish voice = a couple of slightly detuned oscillators through a fast
// attack / exponential decay gain envelope. No samples, no libraries.

import { midiToFreq } from "./score"
import type { Harmony } from "./score"

export class TempoAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private accompGain: GainNode | null = null
  private echoGain: GainNode | null = null

  async resume(): Promise<void> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(this.ctx.destination)

      this.accompGain = this.ctx.createGain()
      this.accompGain.gain.value = 0.85
      this.accompGain.connect(this.master)

      this.echoGain = this.ctx.createGain()
      this.echoGain.gain.value = 0.28
      this.echoGain.connect(this.master)
    }
    if (this.ctx.state === "suspended") await this.ctx.resume()
  }

  get currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  // One piano-ish voice: detuned osc pair → gain env → out bus.
  private voice(
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
    g.gain.exponentialRampToValueAtTime(peak, when + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)

    for (const det of [-4, 4]) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      o.detune.value = det
      o.connect(g)
      o.start(when)
      o.stop(when + dur + 0.05)
    }
  }

  // Soft confirmation of the played melody note.
  melodyEcho(midi: number): void {
    if (!this.ctx || !this.echoGain) return
    const t = this.ctx.currentTime
    this.voice(midiToFreq(midi), this.echoGain, t, 0.45, 0.5, "triangle")
  }

  // The accompaniment: bass + chord. durScale comes from the follower's tempo
  // so the chord rings longer when the player drags, shorter when they rush.
  accompany(h: Harmony, durScale: number): void {
    if (!this.ctx || !this.accompGain) return
    const t = this.ctx.currentTime
    const out = this.accompGain
    const dur = Math.max(0.35, Math.min(1.6, 0.9 * durScale))
    // Bass, fuller and a touch louder.
    this.voice(midiToFreq(h.bass), out, t, dur * 1.2, 0.5, "sawtooth")
    // Chord tones, slightly staggered for a human roll.
    h.chord.forEach((m, i) => {
      this.voice(midiToFreq(m), out, t + i * 0.012, dur, 0.3, "triangle")
    })
  }

  setAccompVolume(v: number): void {
    if (this.accompGain) this.accompGain.gain.value = v
  }

  async dispose(): Promise<void> {
    try {
      this.accompGain?.disconnect()
      this.echoGain?.disconnect()
      this.master?.disconnect()
      if (this.ctx && this.ctx.state !== "closed") await this.ctx.close()
    } catch {
      // ignore teardown races
    } finally {
      this.ctx = null
      this.master = null
      this.accompGain = null
      this.echoGain = null
    }
  }
}
