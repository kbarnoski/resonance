// ── 7960 · Origami — Web Audio engine ─────────────────────────────────────────
//
// Each interior vertex of the crease pattern is a VOICE. A vertex that is
// flat-foldable (Kawasaki-satisfied, Maekawa ±2) rings a clean just-tuned
// partial — CONSONANT. A vertex that cannot flatten detunes and beats — a
// CLASH. So editing creases is heard: you discover flat-foldable configurations
// by ear. As the sheet folds (the global fold parameter sweeps 0→1), voices are
// lit in sequence, so a fold plays as a phrase.
//
// Safety: created only inside a user gesture; every voice sums through a shared
// low-pass into a DynamicsCompressor limiter with a hard ceiling; master fades.

export interface VoiceState {
  id: string; // stable per vertex, e.g. "3,4"
  nx: number; // 0..1 horizontal — pan + pitch order
  ny: number; // 0..1 vertical — octave register
  consonance: number; // 0..1 (1 = flat-foldable, pure)
  kawasakiError: number; // 0..1 (drives detune / buzz)
  maekawaOk: boolean; // clean MV parity → brighter
}

// A just-intonation scale over one octave — consonant vertices land on these
// pure ratios; dissonance is added by DETUNE, not by leaving the scale.
const JUST = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const ROOT_HZ = 146.83; // D3

const MASTER_TARGET = 0.5;
const MAX_VOICES = 12;

interface Voice {
  osc: OscillatorNode; // primary partial
  beat: OscillatorNode; // detuned twin (beats when dissonant)
  lp: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  baseHz: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export class OrigamiAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private voices = new Map<string, Voice>();
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;

    const master = ctx.createGain();
    master.gain.value = 0;
    // Hard safety ceiling.
    const ceiling = ctx.createGain();
    ceiling.gain.value = 0.14;

    comp.connect(master);
    master.connect(ceiling);
    ceiling.connect(ctx.destination);

    this.ctx = ctx;
    this.comp = comp;
    this.master = master;
    this.started = true;

    master.gain.linearRampToValueAtTime(MASTER_TARGET, ctx.currentTime + 0.8);
  }

  get isStarted(): boolean {
    return this.started;
  }

  private makeVoice(v: VoiceState): Voice {
    const ctx = this.ctx!;
    const comp = this.comp!;
    const degree = JUST[Math.round(v.nx * (JUST.length - 1))];
    const octave = v.ny > 0.6 ? 2 : v.ny < 0.33 ? 0.5 : 1;
    const baseHz = ROOT_HZ * degree * octave;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = baseHz;

    const beat = ctx.createOscillator();
    beat.type = "sine";
    beat.frequency.value = baseHz;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(v.nx * 2 - 1, -1, 1);

    osc.connect(lp);
    beat.connect(lp);
    lp.connect(gain);
    gain.connect(pan);
    pan.connect(comp);
    osc.start();
    beat.start();

    return { osc, beat, lp, gain, pan, baseHz };
  }

  /** Reconcile the live voice set with the current crease pattern. Called on
   *  every edit; smoothly ramps timbre so nothing clicks. */
  setVoices(states: VoiceState[]): void {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const active = states.slice(0, MAX_VOICES);
    const seen = new Set<string>();

    for (const v of active) {
      seen.add(v.id);
      let voice = this.voices.get(v.id);
      if (!voice) {
        voice = this.makeVoice(v);
        this.voices.set(v.id, voice);
      }
      // Consonant → quiet clean tone; dissonant → louder, buzzier beating.
      const detuneCents = v.kawasakiError * 42; // up to a rough semitone of beat
      const bright = 700 + v.consonance * 2600 + (v.maekawaOk ? 500 : 0);
      const level = (0.16 + v.kawasakiError * 0.12) / Math.sqrt(active.length);
      voice.osc.frequency.setTargetAtTime(voice.baseHz, now, 0.05);
      voice.beat.frequency.setTargetAtTime(
        voice.baseHz * Math.pow(2, detuneCents / 1200),
        now,
        0.05,
      );
      voice.lp.frequency.setTargetAtTime(bright, now, 0.08);
      voice.gain.gain.setTargetAtTime(level, now, 0.1);
    }

    // Retire voices whose vertex lost its creases.
    for (const [id, voice] of this.voices) {
      if (seen.has(id)) continue;
      voice.gain.gain.setTargetAtTime(0, now, 0.12);
      const osc = voice.osc;
      const beat = voice.beat;
      window.setTimeout(() => {
        try {
          osc.stop();
          beat.stop();
          osc.disconnect();
          beat.disconnect();
          voice.lp.disconnect();
          voice.gain.disconnect();
          voice.pan.disconnect();
        } catch {
          /* already gone */
        }
      }, 400);
      this.voices.delete(id);
    }
  }

  /** As the fold sweeps, light voices in sequence — a fold becomes a phrase.
   *  `param` 0..1 is the global fold; each voice pulses as the fold passes it. */
  setFold(param: number): void {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;
    const ids = [...this.voices.keys()];
    ids.forEach((id, k) => {
      const voice = this.voices.get(id);
      if (!voice) return;
      const phase = ids.length > 1 ? k / (ids.length - 1) : 0.5;
      const pulse = 0.6 + 0.4 * Math.cos((param - phase) * Math.PI * 2);
      voice.pan.pan.setTargetAtTime(
        clamp((k / Math.max(1, ids.length - 1)) * 2 - 1, -1, 1),
        now,
        0.2,
      );
      // Gentle tremolo keyed to the fold sweep — motion you can hear.
      voice.lp.Q.setTargetAtTime(1 + pulse * 3, now, 0.15);
    });
  }

  stop(): void {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    for (const voice of this.voices.values()) {
      try {
        voice.osc.stop();
        voice.beat.stop();
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear();
    const ctx = this.ctx;
    if (ctx) {
      window.setTimeout(() => {
        ctx.close().catch(() => {});
      }, 250);
    }
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.started = false;
  }
}
