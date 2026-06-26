// Web Audio harmony engine — real Riemann functional harmony in F major.
// I (tonic), IV (subdominant), V7 (dominant seventh, with leading tone E and
// chordal 7th B-flat). On V7 -> I we voice-lead: leading tone up a semitone,
// chordal 7th down. Soft sine/triangle pads, gentle env, always-on tonic drone.
// No audio files, no npm deps. Kids-safe: no harsh transients, no loud spikes.

import type { WellId } from "./physics";

// F major. Frequencies in Hz.
const F2 = 87.31;
const Bb2 = 116.54;
const C3 = 130.81;
const F3 = 174.61;
const G3 = 196.0;
const A3 = 220.0;
const Bb3 = 233.08; // chordal 7th of C7 (Bb -> A)
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63; // leading tone of F major (E -> F)
const F4 = 349.23;
const C5 = 523.25;

// Chord voicings (mid register, soft). Each is a set of frequencies.
//   I  = F major  (F A C)        — tonic "home"
//   IV = B-flat major (Bb D F)   — subdominant "away"
//   V7 = C dominant 7th (C E G Bb), E = leading tone, Bb = chordal 7th
const CHORDS: Record<WellId, number[]> = {
  tonic: [F3, A3, C4, F4],
  subdominant: [Bb2, F3, D4, F4],
  dominant: [C3, G3, E4, Bb3],
};

const MASTER_GAIN = 0.5;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export class HarmonyEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private droneVoices: Voice[] = [];
  private chordVoices: Voice[] = [];
  private current: WellId | null = null;
  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    // gentle low-pass so nothing is ever harsh / ringing
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    this.master.connect(lp).connect(this.ctx.destination);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (!this.started) {
      this.startDrone();
      this.started = true;
    }
  }

  get audioContext(): AudioContext {
    return this.ctx;
  }

  // Always-on quiet tonic drone (F + C) so it never feels broken.
  private startDrone(): void {
    const now = this.ctx.currentTime;
    // Always-on tonic drone: F2 + C3 (root + fifth of F major).
    const freqs = [F2, C3];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 1.2);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      this.droneVoices.push({ osc, gain });
    }
  }

  private makeChord(freqs: number[], peak: number): Voice[] {
    const now = this.ctx.currentTime;
    const voices: Voice[] = [];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.12); // gentle attack
      osc.connect(gain).connect(this.master);
      osc.start(now);
      voices.push({ osc, gain });
    });
    return voices;
  }

  private releaseChord(voices: Voice[], when: number, tail = 0.4): void {
    for (const v of voices) {
      v.gain.gain.cancelScheduledValues(when);
      v.gain.gain.setValueAtTime(v.gain.gain.value, when);
      v.gain.gain.exponentialRampToValueAtTime(0.0008, when + tail);
      v.osc.stop(when + tail + 0.1);
    }
  }

  // Enter a well -> hold that chord (soft pad). Returns true if it changed.
  enterWell(id: WellId): boolean {
    if (this.current === id) return false;
    const prev = this.current;
    this.current = id;

    // THE MAGIC MOMENT: V7 (dominant) -> I (tonic) authentic cadence.
    if (prev === "dominant" && id === "tonic") {
      this.runCadence();
      return true;
    }

    const now = this.ctx.currentTime;
    this.releaseChord(this.chordVoices, now, 0.5);
    this.chordVoices = this.makeChord(CHORDS[id], 0.16);
    return true;
  }

  // Leaving every well (rolling over open meadow): fade the held chord down a
  // touch but keep the drone. We keep current so re-entry is detected.
  setTension(t: number): void {
    // t in 0..1 — gentle brightness of held chord while rolling toward V7
    const now = this.ctx.currentTime;
    for (const v of this.chordVoices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0.12 + 0.06 * t, now, 0.2);
    }
  }

  // Real authentic cadence with voice-leading: hold the V7, then resolve.
  private runCadence(): void {
    const now = this.ctx.currentTime;
    // 1) make sure the V7 is sounding (snappy re-assert), then resolve it.
    this.releaseChord(this.chordVoices, now, 0.18);

    // Build a V7 set whose voices we glide into the tonic with real
    // voice-leading: leading tone E4 -> F4 (up a semitone); chordal 7th
    // Bb3 -> A3 (down a semitone); root C -> F; fifth G -> A.
    const cadenceNotes: Array<{ from: number; to: number; type: OscillatorType }> = [
      { from: C3, to: F3, type: "sine" }, // root C -> F (root motion)
      { from: G3, to: A3, type: "triangle" }, // 5th G -> A (to the 3rd)
      { from: E4, to: F4, type: "triangle" }, // leading tone E -> F (up a semitone)
      { from: Bb3, to: A3, type: "triangle" }, // chordal 7th Bb -> A (down a semitone)
    ];

    const tHold = 0.16; // brief V7 tension
    const tGlide = 0.5; // resolution glide
    const voices: Voice[] = [];
    for (const n of cadenceNotes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.from, now);
      // hold the tension note, then glide to its resolution.
      osc.frequency.setValueAtTime(n.from, now + tHold);
      osc.frequency.linearRampToValueAtTime(n.to, now + tHold + tGlide);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.05);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      voices.push({ osc, gain });
    }
    this.chordVoices = voices;

    // Add a soft "arrival" shimmer on the tonic when resolved.
    const arrival = now + tHold + tGlide;
    for (const f of [F4, C5]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, arrival);
      gain.gain.linearRampToValueAtTime(0.08, arrival + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0008, arrival + 1.6);
      osc.connect(gain).connect(this.master);
      osc.start(arrival);
      osc.stop(arrival + 1.8);
    }
  }

  dispose(): void {
    const now = this.ctx.currentTime;
    this.releaseChord(this.chordVoices, now, 0.1);
    this.releaseChord(this.droneVoices, now, 0.1);
    setTimeout(() => {
      this.ctx.close().catch(() => {});
    }, 300);
  }
}
