// audio.ts — EDM build-and-drop engine driven by space-weather parameters.
// Solar wind speed → filter brightness; density → pad shimmer; Bz negative →
// harmonic tension; Kp → anticipation build then DROP (sub-bass + kick + resolve).
// Everything routes through compressor → limiter; never silent, never clips.

export class HeliosAudioEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private compressor: DynamicsCompressorNode;
  private limiter: DynamicsCompressorNode;

  // Ambient pad bus
  private padBus: GainNode;
  private padFilter: BiquadFilterNode;
  private padVoices: { osc: OscillatorNode; gain: GainNode }[];

  // Riser / tension
  private riserOsc: OscillatorNode | null = null;
  private riserGain: GainNode;
  private riserFilter: BiquadFilterNode;

  // Sub-bass (drop)
  private subOsc: OscillatorNode | null = null;
  private subGain: GainNode;

  // Kick synth scheduled ahead
  private kickScheduleHandle = 0;
  private kickBpm = 0;
  private kickRunning = false;

  // Hi-hat click bus
  private hhBus: GainNode;

  // Bloom reverb-ish gain
  private bloomGain: GainNode;

  // State mirrors
  private _kp = 0;
  private _bz = 0;
  private _windSpeed = 400;
  private _density = 5;
  private _stormActive = false;

  constructor() {
    type WithWebkit = typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor =
      window.AudioContext || (window as WithWebkit).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    // ── master chain ─────────────────────────────────────────────────────────
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.12;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.28;

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;

    this.master.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // ── ambient pad ──────────────────────────────────────────────────────────
    // Warm detuned sine partials — always on, a gentle cosmic breath
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.master);

    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.22;
    this.padBus.connect(this.padFilter);

    // Root A2 (110 Hz) + partials for a pad chord (maj7 voicing)
    const PAD_FREQS = [
      110, // A2
      138.59, // C#3 (major third)
      164.81, // E3 (fifth)
      220, // A3 octave
      246.94, // B3 major 7th
      277.18, // C#4
    ];
    this.padVoices = PAD_FREQS.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? "sine" : "sine";
      osc.frequency.value = f;
      // slight detuning for warmth
      osc.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.value = 0.7 / PAD_FREQS.length;
      osc.connect(g);
      g.connect(this.padBus);
      osc.start();
      return { osc, gain: g };
    });

    // ── riser / tension ───────────────────────────────────────────────────────
    this.riserFilter = ctx.createBiquadFilter();
    this.riserFilter.type = "bandpass";
    this.riserFilter.frequency.value = 400;
    this.riserFilter.Q.value = 3;
    this.riserFilter.connect(this.master);

    this.riserGain = ctx.createGain();
    this.riserGain.gain.value = 0;
    this.riserGain.connect(this.riserFilter);

    // ── sub-bass (drop) ───────────────────────────────────────────────────────
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.subGain.connect(this.master);

    // ── hi-hat bus ────────────────────────────────────────────────────────────
    this.hhBus = ctx.createGain();
    this.hhBus.gain.value = 0;
    this.hhBus.connect(this.master);

    // ── bloom shimmer ─────────────────────────────────────────────────────────
    this.bloomGain = ctx.createGain();
    this.bloomGain.gain.value = 0;
    this.bloomGain.connect(this.master);

    this.startRiser();
    this.startSub();
  }

  resume() {
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  // ── parameter ingestion ──────────────────────────────────────────────────

  /** Apply all space-weather parameters at once. */
  applyWeather(
    windSpeed: number,
    density: number,
    bz: number,
    kp: number
  ): void {
    this._windSpeed = windSpeed;
    this._density = density;
    this._bz = bz;
    this._kp = kp;

    const now = this.ctx.currentTime;
    const storm = kp >= 5;

    // ── pad filter brightness ← wind speed (300–800 km/s → 300–3200 Hz)
    const filterHz = 300 + ((windSpeed - 300) / 500) * 2900;
    this.padFilter.frequency.setTargetAtTime(
      Math.max(300, Math.min(3200, filterHz)),
      now,
      2.5
    );

    // ── pad volume shimmer ← density
    const padVol = 0.18 + Math.min(1, density / 30) * 0.18;
    this.padBus.gain.setTargetAtTime(padVol, now, 1.5);

    // ── harmonic tension ← Bz (negative = southward = geoeffective)
    // Bz strongly negative → drift pad toward suspended/minor color
    const bzNeg = Math.max(0, -bz); // 0..∞
    const tension = Math.min(1, bzNeg / 20); // 0..1
    this.applyHarmonicTension(tension, kp);

    // ── riser / build ← Kp
    const riserLevel = storm ? 0.18 : Math.max(0, (kp - 1) / 4) * 0.12;
    this.riserGain.gain.setTargetAtTime(riserLevel, now, 0.8);
    // sweep riser freq with Kp
    const riserFreq = 200 + kp * 280;
    this.riserFilter.frequency.setTargetAtTime(riserFreq, now, 0.6);

    // ── hi-hat pulse ← Kp (starts at Kp>2, quickens with storm)
    if (kp > 2 && !this._stormActive) {
      const hhRate = 0.04 + Math.min(1, (kp - 2) / 3) * 0.16;
      this.hhBus.gain.setTargetAtTime(hhRate, now, 0.5);
    } else if (!this._stormActive) {
      this.hhBus.gain.setTargetAtTime(0, now, 1.0);
    }

    // ── storm transition (drop) ───────────────────────────────────────────
    if (storm && !this._stormActive) {
      this._stormActive = true;
      this.triggerDrop();
    } else if (!storm && this._stormActive) {
      this._stormActive = false;
      this.releaseStorm();
    }
  }

  // ── harmonic tension: retune pad partials toward minor/suspended ──────────
  private applyHarmonicTension(tension: number, kp: number): void {
    const now = this.ctx.currentTime;
    // Major chord freqs (A2 root): A2, C#3, E3, A3, B3, C#4
    const MAJOR = [110, 138.59, 164.81, 220, 246.94, 277.18];
    // Minor chord: A2, C3, E3, A3, B3, C4
    const MINOR = [110, 130.81, 164.81, 220, 246.94, 261.63];

    const storm = kp >= 5;
    if (storm) {
      // On drop: snap back to major (the resolution)
      this.padVoices.forEach((v, i) => {
        v.osc.frequency.setTargetAtTime(MAJOR[i], now, 0.3);
      });
    } else {
      // Pre-storm: blend toward minor as tension rises
      this.padVoices.forEach((v, i) => {
        const target = MAJOR[i] + (MINOR[i] - MAJOR[i]) * tension;
        v.osc.frequency.setTargetAtTime(target, now, 2.0);
      });
    }
  }

  // ── riser oscillator ──────────────────────────────────────────────────────
  private startRiser(): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 220;
    osc.connect(this.riserGain);
    osc.start();
    this.riserOsc = osc;
  }

  // ── sub-bass (always on, volume 0 until drop) ─────────────────────────────
  private startSub(): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 55; // A1 sub
    osc.connect(this.subGain);
    osc.start();
    this.subOsc = osc;
  }

  // ── THE DROP ─────────────────────────────────────────────────────────────
  private triggerDrop(): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Sub-bass swell in
    this.subGain.gain.cancelScheduledValues(now);
    this.subGain.gain.setValueAtTime(0.0001, now);
    this.subGain.gain.linearRampToValueAtTime(0.35, now + 0.4);

    // Pad brightness burst (major resolve)
    this.padFilter.frequency.cancelScheduledValues(now);
    this.padFilter.frequency.setValueAtTime(3500, now);
    this.padFilter.frequency.setTargetAtTime(1800, now + 0.5, 2.0);
    this.padBus.gain.cancelScheduledValues(now);
    this.padBus.gain.setValueAtTime(0.42, now);
    this.padBus.gain.setTargetAtTime(0.26, now + 0.4, 1.5);

    // Bloom shimmer
    this.bloomGain.gain.cancelScheduledValues(now);
    this.bloomGain.gain.setValueAtTime(0.15, now);
    this.bloomGain.gain.setTargetAtTime(0, now + 0.1, 1.2);

    // Riser cuts
    this.riserGain.gain.cancelScheduledValues(now);
    this.riserGain.gain.setTargetAtTime(0, now, 0.05);

    // Hi-hat bus down (kick takes over)
    this.hhBus.gain.setTargetAtTime(0.06, now, 0.1);

    // 4-on-the-floor kick at 128 bpm
    this.kickBpm = 128;
    this.kickRunning = true;
    this.scheduleKicks(now);
  }

  private releaseStorm(): void {
    const now = this.ctx.currentTime;

    this.kickRunning = false;
    clearTimeout(this.kickScheduleHandle);

    // Sub fades out
    this.subGain.gain.setTargetAtTime(0, now, 3.0);

    // Hi-hat off
    this.hhBus.gain.setTargetAtTime(0, now, 2.0);

    // Pad settles back to ambient
    this.padBus.gain.setTargetAtTime(0.22, now, 3.0);
  }

  // ── 4-on-the-floor kick synth ─────────────────────────────────────────────
  private scheduleKicks(from: number): void {
    if (!this.kickRunning) return;
    const ctx = this.ctx;
    const beat = 60 / this.kickBpm; // seconds per beat
    const AHEAD = 0.15; // schedule 150 ms ahead
    const now = ctx.currentTime;
    const start = Math.max(from, now);

    // Schedule 8 beats (2 bars) ahead
    for (let i = 0; i < 8; i++) {
      const t = start + i * beat;
      if (t > now + AHEAD * 2 + beat * 8) break;
      this.scheduleKick(t);
    }

    // Re-schedule before next window expires
    const nextWindow = (start + 8 * beat - now) * 1000 - 100;
    const nextFrom = start + 8 * beat;
    this.kickScheduleHandle = window.setTimeout(() => {
      if (this.kickRunning) this.scheduleKicks(nextFrom);
    }, Math.max(50, nextWindow));
  }

  private scheduleKick(t: number): void {
    const ctx = this.ctx;

    // Kick: pitch-swept sine + noise thump
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 160;
    osc.frequency.setTargetAtTime(40, t, 0.04);

    const kickGain = ctx.createGain();
    kickGain.gain.setValueAtTime(0.0001, t);
    kickGain.gain.linearRampToValueAtTime(0.55, t + 0.004);
    kickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    osc.connect(kickGain);
    kickGain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
    osc.onended = () => {
      try {
        kickGain.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  // ── hi-hat noise bursts (scheduled in rAF loop based on hhBus gain) ───────
  scheduleHiHat(): void {
    const ctx = this.ctx;
    if (this.hhBus.gain.value < 0.01) return;
    const now = ctx.currentTime;

    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = 8000;

    const g = ctx.createGain();
    const vol = this.hhBus.gain.value;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

    src.connect(hpf);
    hpf.connect(g);
    g.connect(this.hhBus);
    src.start(now);
    src.stop(now + 0.05);
    src.onended = () => {
      try {
        g.disconnect();
        hpf.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  // ── aurora bloom sound (called when storm drops) ──────────────────────────
  triggerAuroraBloom(): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // A shimmer chord sweep: high harmonics in A major
    const BLOOM_FREQS = [440, 550, 659, 880, 1100];
    for (const f of BLOOM_FREQS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

      osc.connect(g);
      g.connect(this.master);
      osc.start(now);
      osc.stop(now + 2.5);
      osc.onended = () => {
        try {
          g.disconnect();
        } catch {
          /* noop */
        }
      };
    }
  }

  get stormActive(): boolean {
    return this._stormActive;
  }
  get kp(): number {
    return this._kp;
  }
  get bz(): number {
    return this._bz;
  }
  get windSpeed(): number {
    return this._windSpeed;
  }
  get density(): number {
    return this._density;
  }

  dispose(): void {
    try {
      this.kickRunning = false;
      clearTimeout(this.kickScheduleHandle);

      for (const v of this.padVoices) {
        try {
          v.osc.stop();
        } catch {
          /* noop */
        }
        v.osc.disconnect();
        v.gain.disconnect();
      }
      this.riserOsc?.stop();
      this.riserOsc?.disconnect();
      this.subOsc?.stop();
      this.subOsc?.disconnect();

      this.padBus.disconnect();
      this.padFilter.disconnect();
      this.riserGain.disconnect();
      this.riserFilter.disconnect();
      this.subGain.disconnect();
      this.hhBus.disconnect();
      this.bloomGain.disconnect();
      this.master.disconnect();
      this.compressor.disconnect();
      this.limiter.disconnect();
    } catch {
      /* noop */
    }
    void this.ctx.close();
  }
}
