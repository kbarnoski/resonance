// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — additive JUST-INTONATION drone. Stillness is the reward.
//
//   A sustained drone bed: fundamental ~58 Hz + JI partials
//   [1, 9/8, 5/4, 3/2, 5/3, 15/8, 2]. Additive oscillator bank → per-voice
//   gain → detune → filter → stereo pan → master gain.
//
//   THESIS MAPPINGS (stillness rewarded, agitation punished):
//     smoothness HIGH → partials lock to PURE JI ratios: warm, consonant,
//                        sustained chord. Almost no beating.
//     smoothness LOW  → partials DETUNE (roughness / beating) and a noisy edge
//                        fades in → the drone gets "anxious".
//     energy          → density / brightness: more upper voices when moving,
//                        but they only sound GOOD when smooth.
//     centroidY       → register: spectral tilt via a low-pass cutoff.
//     centroidX       → stereo pan.
//     reward bloom    → when energy drops low and STAYS low, a brief consonant
//                        swell blooms — the sound "resolves".
//
//   Gesture-gated: the AudioContext is created/resumed only on Start. Master
//   gain ramps to a safe cap (<= 0.18). Never autoplays before a gesture.
// ─────────────────────────────────────────────────────────────────────────────

const FUNDAMENTAL = 58; // Hz
const JI: readonly number[] = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 15 / 8, 2];
const MASTER_CAP = 0.18;

export interface AudioTelemetry {
  smoothness: number;
  energy: number;
  centroidX: number;
  centroidY: number;
  reward: number; // 0..1, current reward-bloom amount
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
  // a fixed, deterministic detune "personality" so beating is musical
  detuneBias: number;
}

export class SomaticAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private panner: StereoPannerNode | null = null;
  private voices: Voice[] = [];
  // noise "anxiety" edge
  private noise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private lowEnergyTime = 0;
  private reward = 0;
  private muted = false;

  get running(): boolean {
    return this.ctx !== null;
  }

  /** Create + resume on a user gesture. Ramps master to the safe cap. */
  async start(): Promise<void> {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio unavailable");
    const ctx = new Ctor();
    await ctx.resume();

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.Q.setValueAtTime(0.7, ctx.currentTime);

    const panner = ctx.createStereoPanner();

    filter.connect(panner);
    panner.connect(master);
    master.connect(ctx.destination);

    // additive JI voice bank ------------------------------------------------
    const voices: Voice[] = [];
    for (let i = 0; i < JI.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      const ratio = JI[i];
      osc.frequency.setValueAtTime(FUNDAMENTAL * ratio, ctx.currentTime);
      const gain = ctx.createGain();
      // upper partials start quieter; energy fades them in
      gain.gain.setValueAtTime(i === 0 ? 0.9 : 0.0, ctx.currentTime);
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      // deterministic detune personality: alternating sign, growing spread
      const detuneBias = (i % 2 === 0 ? 1 : -1) * (4 + i * 3);
      voices.push({ osc, gain, ratio, detuneBias });
    }

    // anxiety noise edge -----------------------------------------------------
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    // deterministic pseudo-noise (no Math.random): a hashy LCG
    let s = 0x9e3779b9;
    for (let i = 0; i < nd.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      nd[i] = (s / 4294967296) * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(1800, ctx.currentTime);
    noiseFilter.Q.setValueAtTime(0.8, ctx.currentTime);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0, ctx.currentTime);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(filter);
    noise.start();

    // ramp master up to the safe cap
    master.gain.linearRampToValueAtTime(
      this.muted ? 0.0001 : MASTER_CAP * 0.6,
      ctx.currentTime + 2.5,
    );

    this.ctx = ctx;
    this.master = master;
    this.filter = filter;
    this.panner = panner;
    this.voices = voices;
    this.noise = noise;
    this.noiseGain = noiseGain;
    this.noiseFilter = noiseFilter;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0.0001 : MASTER_CAP * 0.6, t, 0.15);
    }
  }

  /** Drive the whole instrument from a motion frame. dt in seconds. */
  update(t: AudioTelemetry, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.filter || !this.panner) return;
    const now = ctx.currentTime;
    const smooth = clamp01(t.smoothness);
    const energy = clamp01(t.energy);

    // ── reward accumulation: low energy sustained → bloom ──────────────────
    if (energy < 0.14) {
      this.lowEnergyTime += dt;
    } else {
      this.lowEnergyTime = Math.max(0, this.lowEnergyTime - dt * 2);
    }
    // reward ramps in after ~1.6s of calm, and requires smoothness too
    const wantReward =
      this.lowEnergyTime > 1.6 ? clamp01((this.lowEnergyTime - 1.6) / 3) * smooth : 0;
    this.reward += (wantReward - this.reward) * Math.min(1, dt * 1.5);

    // ── per-voice: JI purity vs detune, and energy-gated presence ──────────
    const detuneAmt = (1 - smooth) * (1 - smooth); // agitation → beating
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      // pure JI when smooth; drift off-ratio when agitated
      const cents = v.detuneBias * detuneAmt * 3.2;
      v.osc.detune.setTargetAtTime(cents, now, 0.08);

      // voice presence: fundamental + low partials always on; upper partials
      // fade in with energy but are boosted by the reward bloom.
      const tier = i / (this.voices.length - 1); // 0..1 up the spectrum
      let target: number;
      if (i === 0) {
        target = 0.85;
      } else {
        const energyGate = clamp01((energy - tier * 0.28) * 1.8);
        const base = (0.55 - tier * 0.32) * (0.35 + 0.65 * energyGate);
        // the reward bloom lifts the pure consonant partials
        const bloomLift = this.reward * (0.4 - tier * 0.18);
        // agitation robs the upper voices of their sweetness
        target = clamp01((base + bloomLift) * (0.5 + 0.5 * smooth));
      }
      v.gain.gain.setTargetAtTime(target * 0.5, now, 0.12);
    }

    // ── anxiety noise: pure when smooth, grows with jerk × energy ──────────
    if (this.noiseGain && this.noiseFilter) {
      const anxiety = (1 - smooth) * (0.4 + 0.6 * energy);
      this.noiseGain.gain.setTargetAtTime(anxiety * 0.06, now, 0.1);
      this.noiseFilter.frequency.setTargetAtTime(
        1200 + anxiety * 2600,
        now,
        0.1,
      );
    }

    // ── register / spectral tilt from centroidY (top = brighter) ───────────
    const tilt = 1 - clamp01(t.centroidY); // high hands → open the filter
    const cutoff =
      520 +
      tilt * 2200 * (0.4 + 0.6 * energy) +
      this.reward * 900 +
      smooth * 400;
    this.filter.frequency.setTargetAtTime(clamp(cutoff, 320, 5200), now, 0.12);

    // ── stereo pan from centroidX ──────────────────────────────────────────
    this.panner.pan.setTargetAtTime(clamp(t.centroidX * 2 - 1, -1, 1), now, 0.15);

    // ── master: reward blooms a gentle swell above the resting level ───────
    const rest = MASTER_CAP * 0.6;
    const level = this.muted
      ? 0.0001
      : clamp(rest + this.reward * (MASTER_CAP - rest), 0.0001, MASTER_CAP);
    this.master.gain.setTargetAtTime(level, now, 0.2);
  }

  get rewardLevel(): number {
    return this.reward;
  }

  async close(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.master?.gain.cancelScheduledValues(ctx.currentTime);
      this.master?.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
      this.voices.forEach((v) => {
        try {
          v.osc.stop();
        } catch {
          /* ignore */
        }
      });
      try {
        this.noise?.stop();
      } catch {
        /* ignore */
      }
      await ctx.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.panner = null;
    this.voices = [];
    this.noise = null;
    this.noiseGain = null;
    this.noiseFilter = null;
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
