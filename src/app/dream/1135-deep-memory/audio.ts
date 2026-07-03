// audio.ts — warm ambient Web Audio for the SlowMachine.
//
// Signal path per note event:
//   • lush sine/triangle PAD bed (register -> pitch, tension -> lowpass)
//   • soft 2-op FM bell per note
//   • a short feedback DelayNode for a gentle "reverb-ish" tail (no IR)
//   • everything through a DynamicsCompressor limiter
//
// 25 ms look-ahead scheduler firing ~120 ms ahead (Chris Wilson pattern).
// Gesture-gated: nothing until start(). Full dispose() teardown.

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export interface AudioParams {
  tension: number; // 0..1 -> lowpass brightness
  density: number; // 0..1 -> event rate
}

export type NoteRequest = () => { midi: number; consonance: number } | null;

export class MemoryAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private padA: OscillatorNode;
  private padB: OscillatorNode;
  private padSub: OscillatorNode;
  private delay: DelayNode;
  private delayFb: GainNode;
  private delayWet: GainNode;

  private lookahead = 25; // ms timer interval
  private scheduleAhead = 0.12; // seconds to schedule in advance
  private nextNoteTime = 0;
  private timer: number | null = null;

  private tension = 0.4;
  private density = 0.5;
  private register = 0.45;

  private pull: NoteRequest;

  constructor(pull: NoteRequest) {
    this.pull = pull;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const now = this.ctx.currentTime;

    // Master + limiter
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-8, now);
    this.limiter.knee.setValueAtTime(24, now);
    this.limiter.ratio.setValueAtTime(12, now);
    this.limiter.attack.setValueAtTime(0.004, now);
    this.limiter.release.setValueAtTime(0.25, now);

    this.master = this.ctx.createGain();
    this.master.gain.setValueAtTime(0.0, now);
    this.master.gain.linearRampToValueAtTime(0.85, now + 2.5); // slow fade-in

    // Gentle feedback delay (reverb-ish, no IR).
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.setValueAtTime(0.28, now);
    this.delayFb = this.ctx.createGain();
    this.delayFb.gain.setValueAtTime(0.42, now);
    this.delayWet = this.ctx.createGain();
    this.delayWet.gain.setValueAtTime(0.32, now);
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.limiter);

    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Pad bed
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.setValueAtTime(700, now);
    this.padFilter.Q.setValueAtTime(0.7, now);
    this.padGain = this.ctx.createGain();
    this.padGain.gain.setValueAtTime(0.14, now);

    this.padA = this.ctx.createOscillator();
    this.padA.type = "sine";
    this.padB = this.ctx.createOscillator();
    this.padB.type = "triangle";
    this.padSub = this.ctx.createOscillator();
    this.padSub.type = "sine";
    this.setPadPitch(now, 48);
    this.padA.connect(this.padFilter);
    this.padB.connect(this.padFilter);
    this.padSub.connect(this.padFilter);
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.master);
    this.padGain.connect(this.delay);
    this.padA.start(now);
    this.padB.start(now);
    this.padSub.start(now);
  }

  private setPadPitch(t: number, rootMidi: number) {
    const f = midiToFreq(rootMidi);
    this.padA.frequency.setValueAtTime(f, t);
    this.padB.frequency.setValueAtTime(f * 1.5, t); // a fifth above
    this.padSub.frequency.setValueAtTime(f / 2, t); // sub octave
  }

  setParams(p: AudioParams & { register?: number }) {
    this.tension = p.tension;
    this.density = p.density;
    if (typeof p.register === "number") this.register = p.register;
    const now = this.ctx.currentTime;
    // Tension -> brighter pad, register -> pad root.
    const cutoff = 400 + this.tension * 2600;
    this.padFilter.frequency.linearRampToValueAtTime(cutoff, now + 0.4);
    const root = 40 + Math.round(this.register * 14);
    this.setPadPitch(now + 0.1, root);
  }

  async start() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.nextNoteTime = this.ctx.currentTime + 0.15;
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.scheduler(), this.lookahead);
    }
  }

  private intervalSeconds(): number {
    // density 0..1 -> 1.9s .. 0.28s between events, with slow swing.
    const base = 1.9 - this.density * 1.62;
    return Math.max(0.2, base);
  }

  private scheduler() {
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
      const req = this.pull();
      if (req) this.playBell(this.nextNoteTime, req.midi, req.consonance);
      this.nextNoteTime += this.intervalSeconds();
    }
  }

  /** Soft 2-op FM bell. */
  private playBell(time: number, midi: number, consonance: number) {
    const carrierFreq = midiToFreq(midi);
    // More consonant -> gentler, more integer-like ratio.
    const ratio = 1 + (1 - consonance) * 1.4; // 1.0 .. 2.4
    const modFreq = carrierFreq * ratio;

    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.setValueAtTime(carrierFreq, time);

    const mod = this.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.setValueAtTime(modFreq, time);

    const modGain = this.ctx.createGain();
    const modIndex = carrierFreq * (0.5 + (1 - consonance) * 2.5);
    modGain.gain.setValueAtTime(modIndex, time);
    modGain.gain.exponentialRampToValueAtTime(
      Math.max(1, modIndex * 0.08),
      time + 0.9,
    );
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const amp = this.ctx.createGain();
    const peak = 0.16 + consonance * 0.06;
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(peak, time + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 2.2);

    const tone = this.ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(1200 + this.tension * 4000, time);

    carrier.connect(tone);
    tone.connect(amp);
    amp.connect(this.master);
    amp.connect(this.delay);

    carrier.start(time);
    mod.start(time);
    carrier.stop(time + 2.4);
    mod.stop(time + 2.4);
  }

  dispose() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.2);
    } catch {
      // ignore
    }
    const stopSafe = (o: OscillatorNode) => {
      try {
        o.stop(now + 0.25);
      } catch {
        // already stopped
      }
    };
    stopSafe(this.padA);
    stopSafe(this.padB);
    stopSafe(this.padSub);
    window.setTimeout(() => {
      if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    }, 350);
  }
}
