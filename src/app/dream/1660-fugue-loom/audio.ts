// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — output-only Web Audio player for the fugue.
//
// Three independent voices with warm plucked/organ timbres (two detuned
// oscillators + a gentle lowpass + per-note ADSR). Look-ahead scheduling against
// audioContext.currentTime. Master: sum → gain ≤ 0.14 → DynamicsCompressor →
// destination, with a subtle delay ambience. No microphone, no input.
// ─────────────────────────────────────────────────────────────────────────────
import type { Fugue, FugueNote } from "./fugue";

interface VoiceTimbre {
  oscA: OscillatorType;
  oscB: OscillatorType;
  detune: number; // cents
  cutoff: number; // Hz
  gain: number;
}

const TIMBRES: VoiceTimbre[] = [
  { oscA: "triangle", oscB: "sine", detune: 6, cutoff: 2300, gain: 0.85 }, // top
  { oscA: "triangle", oscB: "triangle", detune: 8, cutoff: 1650, gain: 0.95 }, // middle
  { oscA: "sine", oscB: "triangle", detune: 5, cutoff: 1050, gain: 1.05 }, // bass
];

const LOOKAHEAD = 0.15; // schedule this far ahead (s)
const TICK_MS = 25;

export class FuguePlayer {
  ctx: AudioContext;
  private master: GainNode;
  private voiceGains: GainNode[];
  private delayGain: GainNode;

  private fugue: Fugue | null = null;
  private startTime = 0;
  private secPerBeat = 0.65;
  private nextIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  playing = false;
  done = false;
  onDone: (() => void) | null = null;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    // master: sum → gain (≤0.14) → compressor → destination
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.13;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // subtle delay ambience off the master sum
    const delay = this.ctx.createDelay(0.5);
    delay.delayTime.value = 0.19;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.26;
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.value = 0.11;
    this.master.connect(this.delayGain);
    this.delayGain.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(comp);

    this.voiceGains = TIMBRES.map((tb) => {
      const g = this.ctx.createGain();
      g.gain.value = tb.gain;
      g.connect(this.master);
      return g;
    });
  }

  async resume() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* browser may defer until a gesture */
      }
    }
  }

  setFugue(f: Fugue) {
    this.fugue = f;
    this.secPerBeat = 60 / f.bpm;
  }

  /** (Re)start playback from the top. */
  play() {
    if (!this.fugue) return;
    void this.resume();
    this.stopScheduler();
    this.nextIndex = 0;
    this.done = false;
    this.playing = true;
    this.startTime = this.ctx.currentTime + 0.18;
    this.timer = setInterval(() => this.scheduler(), TICK_MS);
    this.scheduler();
  }

  private scheduler() {
    if (!this.fugue || !this.playing) return;
    const evs = this.fugue.events;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.nextIndex < evs.length) {
      const ev = evs[this.nextIndex];
      const when = this.startTime + ev.startBeat * this.secPerBeat;
      if (when > horizon) break;
      this.scheduleNote(ev, Math.max(when, this.ctx.currentTime));
      this.nextIndex++;
    }
    if (
      this.nextIndex >= evs.length &&
      this.currentBeat() > this.fugue.totalBeats + 0.5
    ) {
      this.playing = false;
      this.done = true;
      this.stopScheduler();
      this.onDone?.();
    }
  }

  private scheduleNote(ev: FugueNote, when: number) {
    const tb = TIMBRES[ev.voice];
    const freq = 440 * Math.pow(2, (ev.midi - 69) / 12);
    const dur = ev.durBeats * this.secPerBeat;
    const ctx = this.ctx;

    const oscA = ctx.createOscillator();
    oscA.type = tb.oscA;
    oscA.frequency.value = freq;
    const oscB = ctx.createOscillator();
    oscB.type = tb.oscB;
    oscB.frequency.value = freq;
    oscB.detune.value = tb.detune;

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = tb.cutoff;
    filt.Q.value = 0.7;

    const amp = ctx.createGain();
    // warm plucked/organ ADSR: soft attack, gentle decay to a held sustain,
    // then a rounded release. Peak scaled per note so the sum never clips.
    const peak = ev.isSubject ? 0.26 : 0.2;
    const atk = 0.014;
    const dec = 0.12;
    const sus = peak * 0.62;
    const rel = Math.min(0.28, dur * 0.6 + 0.06);
    const g = amp.gain;
    g.setValueAtTime(0.0001, when);
    g.linearRampToValueAtTime(peak, when + atk);
    g.linearRampToValueAtTime(sus, when + atk + dec);
    const relStart = when + Math.max(atk + dec, dur);
    g.setValueAtTime(sus, relStart);
    g.exponentialRampToValueAtTime(0.0001, relStart + rel);

    oscA.connect(filt);
    oscB.connect(filt);
    filt.connect(amp);
    amp.connect(this.voiceGains[ev.voice]);

    oscA.start(when);
    oscB.start(when);
    const stopAt = relStart + rel + 0.02;
    oscA.stop(stopAt);
    oscB.stop(stopAt);
  }

  private stopScheduler() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Beats elapsed since playback started (0 while suspended/idle). */
  currentBeat(): number {
    if (!this.playing && !this.done) return 0;
    const t = this.ctx.currentTime - this.startTime;
    return t <= 0 ? 0 : t / this.secPerBeat;
  }

  stop() {
    this.playing = false;
    this.stopScheduler();
  }

  dispose() {
    this.stop();
    try {
      void this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
