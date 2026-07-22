// ─────────────────────────────────────────────────────────────────────────────
// 2196 · cortex-weave — audio.ts
//
//   A small MODAL / banded-waveguide voice bank (NOT pentatonic, NOT just-
//   intonation, NOT Bohlen–Pierce). Each played key strikes a voice: a bank of
//   high-Q bandpass resonators excited by shared looping noise, tuned to an
//   inharmonic-but-non-JI modal set (struck-bar / bell-plate modes, ratios like
//   1, 2.76, 5.40, 8.93). The played form parameter F shifts the modal ratios
//   and brightness so each region of the form-constant sweep has its own timbre;
//   the played growth G opens a gentle shimmer (a second, higher inharmonic
//   layer) on a shared bus.
//
//   Safety chain:  voices → master(≤0.16) → lowpass → DynamicsCompressor → out.
//   Silent until first note; short fade-in on init.
// ─────────────────────────────────────────────────────────────────────────────

interface Voice {
  gain: GainNode;
  shimmer: GainNode;
  filters: BiquadFilterNode[];
  startedAt: number;
  releasing: boolean;
}

// Two modal (inharmonic, non-JI) ratio sets; F morphs between them so timbre
// tracks the form sweep. Struck-bar-ish → brighter bell-plate-ish.
const MODES_DARK = [1, 2.76, 5.4, 8.93];
const MODES_BRIGHT = [1, 3.01, 5.83, 9.72];
// Shimmer partials sit above the fundamental at further inharmonic ratios.
const SHIMMER_RATIOS = [12.6, 16.9];

export class CortexWeaveAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private shimmerBus: GainNode;
  private voices: Voice[] = [];
  private nextId = 1;
  private idMap = new Map<number, Voice>();
  private noise: AudioBufferSourceNode | null = null;
  private disposed = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: "interactive" });

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6500;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 14;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    this.master.connect(lp).connect(comp).connect(this.ctx.destination);

    this.shimmerBus = this.ctx.createGain();
    this.shimmerBus.gain.value = 0;
    this.shimmerBus.connect(this.master);
  }

  async init(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    // Shared looping noise buffer excites every resonator. Filled from a
    // deterministic PRNG (never Math.random — forbidden in this environment).
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 0x2196 >>> 0;
    for (let i = 0; i < len; i++) {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      data[i] = ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    this.noise = src;
    // Fade the master in gently.
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(0.16, now + 0.8);
  }

  /** Growth G∈[0,1] opens the shimmer bus. */
  setGrowth(g: number): void {
    if (this.disposed || !this.noise) return;
    const now = this.ctx.currentTime;
    const target = 0.5 * Math.max(0, Math.min(1, g));
    this.shimmerBus.gain.setTargetAtTime(target, now, 0.12);
  }

  /**
   * Strike a modal voice. Returns a voice id (for noteOff). If `sustain` is
   * false the voice self-decays (used by the autopilot); if true it rings until
   * noteOff (used by held keys).
   */
  strike(
    baseFreq: number,
    F: number,
    velocity: number,
    sustain: boolean,
  ): number {
    if (this.disposed || !this.noise) return -1;
    // Voice cap — cull the oldest.
    if (this.voices.length >= 8) {
      const oldest = this.voices.shift();
      if (oldest) this.teardownVoice(oldest, 0.08);
    }

    const now = this.ctx.currentTime;
    const t = Math.max(0, Math.min(1, F));
    const vel = Math.max(0.05, Math.min(1, velocity));

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.value = 0;
    voiceGain.connect(this.master);

    const shimmerGain = this.ctx.createGain();
    shimmerGain.gain.value = 0;
    shimmerGain.connect(this.shimmerBus);

    const filters: BiquadFilterNode[] = [];
    // Core modal partials.
    for (let i = 0; i < MODES_DARK.length; i++) {
      const ratio = MODES_DARK[i] + (MODES_BRIGHT[i] - MODES_DARK[i]) * t;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(baseFreq * ratio, 16000);
      bp.Q.value = 14 + i * 6;
      const pg = this.ctx.createGain();
      pg.gain.value = 1 / (1 + i * 1.5);
      this.noise!.connect(bp).connect(pg).connect(voiceGain);
      filters.push(bp);
    }
    // Shimmer partials (higher, gated by the shared shimmer bus + G).
    for (const ratio of SHIMMER_RATIOS) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(baseFreq * ratio, 16000);
      bp.Q.value = 30;
      const pg = this.ctx.createGain();
      pg.gain.value = 0.4;
      this.noise!.connect(bp).connect(pg).connect(shimmerGain);
      filters.push(bp);
    }

    // Envelope: quick strike attack, then either sustain or a modal decay.
    const peak = 0.18 + 0.5 * vel + 0.15 * t;
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(peak, now + 0.014);
    shimmerGain.gain.setValueAtTime(0, now);
    shimmerGain.gain.linearRampToValueAtTime(peak * 0.6, now + 0.02);

    if (!sustain) {
      voiceGain.gain.setTargetAtTime(0.0001, now + 0.02, 0.5);
      shimmerGain.gain.setTargetAtTime(0.0001, now + 0.02, 0.4);
    } else {
      voiceGain.gain.setTargetAtTime(peak * 0.7, now + 0.02, 0.4);
      shimmerGain.gain.setTargetAtTime(peak * 0.45, now + 0.02, 0.4);
    }

    const voice: Voice = {
      gain: voiceGain,
      shimmer: shimmerGain,
      filters,
      startedAt: now,
      releasing: false,
    };
    this.voices.push(voice);

    if (!sustain) {
      // Auto-teardown after the decay tail.
      window.setTimeout(() => this.teardownVoice(voice, 0), 1900);
      return -1;
    }

    const id = this.nextId++;
    this.idMap.set(id, voice);
    return id;
  }

  /** Release a sustained voice. */
  noteOff(id: number): void {
    const voice = this.idMap.get(id);
    if (!voice || voice.releasing) return;
    voice.releasing = true;
    this.idMap.delete(id);
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.35);
    voice.shimmer.gain.cancelScheduledValues(now);
    voice.shimmer.gain.setValueAtTime(voice.shimmer.gain.value, now);
    voice.shimmer.gain.setTargetAtTime(0.0001, now, 0.3);
    window.setTimeout(() => this.teardownVoice(voice, 0), 1400);
  }

  private teardownVoice(voice: Voice, fade: number): void {
    const now = this.ctx.currentTime;
    if (fade > 0) {
      voice.gain.gain.setTargetAtTime(0.0001, now, fade);
      voice.shimmer.gain.setTargetAtTime(0.0001, now, fade);
    }
    window.setTimeout(
      () => {
        try {
          voice.filters.forEach((f) => f.disconnect());
          voice.gain.disconnect();
          voice.shimmer.disconnect();
        } catch {
          /* ignore */
        }
        this.voices = this.voices.filter((v) => v !== voice);
      },
      Math.max(20, fade * 1000 + 40),
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.noise?.stop();
    } catch {
      /* ignore */
    }
    try {
      this.master.disconnect();
      this.shimmerBus.disconnect();
    } catch {
      /* ignore */
    }
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
