// 902-harmonic-mirror — audio.ts
// Web Audio engine. Two voice families:
//   "played"  — warm detuned-saw voices at the EQUAL-TEMPERED pitch you actually
//                pressed (the keyboard you played).
//   "mirror"  — softer, halo'd completion voices tuned in JUST INTONATION relative
//                to the inferred root. When the root shifts, mirror voices
//                glide-RETUNE to the new ratio (a smooth frequency ramp).
//
// Each family is a small pool of monophonic-per-pitch oscillator voices keyed by an
// id (MIDI note for played; interval for mirror) so re-triggering the same pitch
// re-uses its envelope rather than stacking.

export interface Voice {
  oscA: OscillatorNode;
  oscB: OscillatorNode; // detune partner (played voices) or harmonic (mirror)
  gain: GainNode;
  filter: BiquadFilterNode;
  targetFreq: number;
  level: number; // current envelope level (for the viz, 0..1)
  kind: "played" | "mirror";
  startedAt: number;
}

export class HarmonicMirrorAudio {
  ctx: AudioContext;
  master: GainNode;
  playedBus: GainNode;
  mirrorBus: GainNode;
  reverb: ConvolverNode | null = null;
  // Active voices keyed by string id.
  played = new Map<string, Voice>();
  mirror = new Map<string, Voice>();
  ok = true;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);
    // fade master in
    this.master.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(
      0.85,
      this.ctx.currentTime + 0.4
    );

    this.playedBus = this.ctx.createGain();
    this.playedBus.gain.value = 0.9;
    this.mirrorBus = this.ctx.createGain();
    this.mirrorBus.gain.value = 0.55; // mirror sits softer under the played notes

    this.playedBus.connect(this.master);
    this.mirrorBus.connect(this.master);

    // Light algorithmic reverb so the JI lock blooms.
    try {
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.makeImpulse(1.8, 2.4);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.28;
      this.reverb.connect(wet);
      wet.connect(this.master);
      // both buses also feed the reverb send
      this.playedBus.connect(this.reverb);
      this.mirrorBus.connect(this.reverb);
    } catch {
      this.reverb = null;
    }
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i += 1) {
        data[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  resume(): Promise<void> {
    if (this.ctx.state === "suspended") return this.ctx.resume();
    return Promise.resolve();
  }

  private buildVoice(
    freq: number,
    kind: "played" | "mirror"
  ): Voice {
    const now = this.ctx.currentTime;
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";

    if (kind === "played") {
      oscA.type = "sawtooth";
      oscB.type = "sawtooth";
      oscA.frequency.setValueAtTime(freq, now);
      oscB.frequency.setValueAtTime(freq, now);
      oscB.detune.setValueAtTime(7, now); // warm detune
      oscA.detune.setValueAtTime(-7, now);
      filter.frequency.setValueAtTime(Math.min(freq * 6 + 800, 7000), now);
      filter.Q.value = 0.7;
    } else {
      // Mirror: softer, more sinusoidal (triangle + faint saw harmonic), halo'd.
      oscA.type = "triangle";
      oscB.type = "sine";
      oscA.frequency.setValueAtTime(freq, now);
      oscB.frequency.setValueAtTime(freq * 2, now); // octave shimmer
      filter.frequency.setValueAtTime(Math.min(freq * 4 + 400, 4500), now);
      filter.Q.value = 0.4;
    }

    gain.gain.setValueAtTime(0.0001, now);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(kind === "played" ? this.playedBus : this.mirrorBus);

    oscA.start(now);
    oscB.start(now);

    return {
      oscA,
      oscB,
      gain,
      filter,
      targetFreq: freq,
      level: 0,
      kind,
      startedAt: now,
    };
  }

  // Trigger / sustain a PLAYED (equal-tempered) voice.
  playNoteOn(id: string, freq: number, velocity = 0.8): void {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    let v = this.played.get(id);
    if (!v) {
      v = this.buildVoice(freq, "played");
      this.played.set(id, v);
    } else {
      v.oscA.frequency.setTargetAtTime(freq, now, 0.01);
      v.oscB.frequency.setTargetAtTime(freq, now, 0.01);
      v.targetFreq = freq;
    }
    const peak = 0.16 + velocity * 0.12;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
    v.gain.gain.linearRampToValueAtTime(peak, now + 0.02);
    v.gain.gain.linearRampToValueAtTime(peak * 0.8, now + 0.25);
    v.level = peak;
  }

  playNoteOff(id: string): void {
    const v = this.played.get(id);
    if (!v) return;
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    const stopAt = now + 0.4;
    try {
      v.oscA.stop(stopAt);
      v.oscB.stop(stopAt);
    } catch {
      /* already stopped */
    }
    this.played.delete(id);
  }

  // Set the FULL set of mirror (JI completion) voices. Voices not in the new set
  // are released; voices already sounding GLIDE-RETUNE to the new frequency.
  setMirror(targets: { id: string; freq: number }[]): void {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    const wanted = new Set(targets.map((t) => t.id));

    // Release stale mirror voices.
    for (const [id, v] of this.mirror) {
      if (!wanted.has(id)) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
        v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        try {
          v.oscA.stop(now + 0.5);
          v.oscB.stop(now + 0.5);
        } catch {
          /* noop */
        }
        this.mirror.delete(id);
      }
    }

    // Add or glide-retune wanted voices.
    for (const t of targets) {
      let v = this.mirror.get(t.id);
      if (!v) {
        v = this.buildVoice(t.freq, "mirror");
        this.mirror.set(t.id, v);
        const peak = 0.11;
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(0.0001, now);
        v.gain.gain.exponentialRampToValueAtTime(peak, now + 0.35);
        v.level = peak;
      } else if (Math.abs(v.targetFreq - t.freq) > 0.01) {
        // GLIDE-RETUNE: smooth ramp to the new JI frequency.
        v.oscA.frequency.cancelScheduledValues(now);
        v.oscB.frequency.cancelScheduledValues(now);
        v.oscA.frequency.setValueAtTime(v.oscA.frequency.value, now);
        v.oscB.frequency.setValueAtTime(v.oscB.frequency.value, now);
        v.oscA.frequency.linearRampToValueAtTime(t.freq, now + 0.18);
        v.oscB.frequency.linearRampToValueAtTime(t.freq * 2, now + 0.18);
        v.targetFreq = t.freq;
      }
    }
  }

  clearMirror(): void {
    this.setMirror([]);
  }

  // Snapshot current levels for the viz (decay the stored level each frame).
  sampleLevels(): { played: Map<string, number>; mirror: Map<string, number> } {
    const decay = (m: Map<string, Voice>) => {
      const out = new Map<string, number>();
      for (const [id, v] of m) {
        v.level *= 0.94;
        out.set(id, v.level);
      }
      return out;
    };
    return { played: decay(this.played), mirror: decay(this.mirror) };
  }

  close(): void {
    try {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    } catch {
      /* noop */
    }
    for (const v of this.played.values()) {
      try {
        v.oscA.stop();
        v.oscB.stop();
      } catch {
        /* noop */
      }
    }
    for (const v of this.mirror.values()) {
      try {
        v.oscA.stop();
        v.oscB.stop();
      } catch {
        /* noop */
      }
    }
    this.played.clear();
    this.mirror.clear();
    if (this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
  }
}
