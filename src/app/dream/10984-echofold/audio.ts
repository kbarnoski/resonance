// ─────────────────────────────────────────────────────────────────────────────
// Web Audio engine for Echofold.
//
//   Two distinct voices so "you" and "its memory of you" are audibly separate:
//     · INPUT voice  — clean glassy sine + a soft octave partial, whole-tone
//                      scale, in the upper register. This is your phrase.
//     · ECHO voice   — a detuned triangle/FM-ish bell an octave lower with a
//                      long release, so the reservoir's dream smears and hangs.
//   A slow two-note pad drones underneath. Everything runs through a limiter
//   (DynamicsCompressor). Silent until a user gesture unlocks the context.
//
//   The scale is deliberately WHOLE-TONE (no leading tone, no tonic pull) —
//   boundless and slightly uncanny, never a default pentatonic.
// ─────────────────────────────────────────────────────────────────────────────

// Whole-tone degrees over ~2 octaves, as semitone offsets from the root.
export const SCALE_STEPS: number[] = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
export const DEGREES = SCALE_STEPS.length;

const INPUT_ROOT = 293.66; // D4 — glassy upper register for your phrase
const ECHO_ROOT = 146.83; // D3 — the memory answers an octave below

export function degreeToInputFreq(deg: number): number {
  const d = Math.max(0, Math.min(DEGREES - 1, deg));
  return INPUT_ROOT * Math.pow(2, SCALE_STEPS[d] / 12);
}

export function degreeToEchoFreq(deg: number): number {
  const d = Math.max(0, Math.min(DEGREES - 1, deg));
  return ECHO_ROOT * Math.pow(2, SCALE_STEPS[d] / 12);
}

// Map a reservoir pitch readout (~[-1,1]) to a scale degree.
export function pitchToDegree(v: number): number {
  const t = (Math.max(-1, Math.min(1, v)) + 1) / 2;
  return Math.round(t * (DEGREES - 1));
}

const MAX_VOICES = 14;

export class EchofoldAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private padOscs: OscillatorNode[] = [];
  private padLfo: OscillatorNode | null = null;
  private active = 0;
  private muted = true;
  failed = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  // Must be called from a user gesture (iOS). Safe to call more than once.
  async unlock(): Promise<void> {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.build();
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
    } catch {
      this.failed = true;
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    master.connect(comp);
    this.master = master;

    // Slow evolving pad: root + fifth, lowpass with a gentle LFO.
    const pad = ctx.createGain();
    pad.gain.value = 0.0;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 620;
    filt.Q.value = 0.7;
    pad.connect(filt);
    filt.connect(master);
    this.padGain = pad;

    const padFreqs = [INPUT_ROOT / 2, (INPUT_ROOT / 2) * Math.pow(2, 7 / 12)];
    for (let i = 0; i < padFreqs.length; i++) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = padFreqs[i];
      o.detune.value = i === 0 ? -5 : 6;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(pad);
      o.start();
      this.padOscs.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    lfo.start();
    this.padLfo = lfo;

    // ease the pad in
    pad.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 4);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.9, t + 0.4);
    }
  }

  private voice(
    freq: number,
    vel: number,
    opts: { type: OscillatorType; detune: number; attack: number; release: number; gain: number; partial: boolean }
  ): void {
    if (!this.ctx || !this.master || this.active >= MAX_VOICES) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    const peak = opts.gain * (0.4 + 0.6 * vel);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + opts.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.release);
    g.connect(this.master);

    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.value = freq;
    osc.detune.value = opts.detune;
    osc.connect(g);
    osc.start(t);
    osc.stop(t + opts.attack + opts.release + 0.05);

    let osc2: OscillatorNode | null = null;
    if (opts.partial) {
      osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = freq * 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.3), t + opts.attack);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.release * 0.7);
      osc2.connect(g2);
      g2.connect(this.master);
      osc2.start(t);
      osc2.stop(t + opts.attack + opts.release + 0.05);
    }

    this.active++;
    const done = () => {
      this.active = Math.max(0, this.active - 1);
      g.disconnect();
    };
    osc.onended = done;
  }

  playInput(freq: number, vel: number): void {
    this.voice(freq, vel, {
      type: "sine",
      detune: 0,
      attack: 0.012,
      release: 0.5,
      gain: 0.5,
      partial: true,
    });
  }

  playEcho(freq: number, vel: number, channel: number): void {
    this.voice(freq, vel, {
      type: channel === 0 ? "triangle" : "sine",
      detune: channel === 0 ? -9 : 11,
      attack: 0.03,
      release: 1.5,
      gain: 0.32,
      partial: false,
    });
  }

  dispose(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    try {
      for (const o of this.padOscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
        o.disconnect();
      }
      if (this.padLfo) {
        try {
          this.padLfo.stop();
        } catch {
          /* already stopped */
        }
        this.padLfo.disconnect();
      }
      this.padGain?.disconnect();
      this.master?.disconnect();
      void ctx.close();
    } catch {
      /* best-effort teardown */
    }
    this.ctx = null;
    this.master = null;
    this.padGain = null;
    this.padOscs = [];
    this.padLfo = null;
    this.active = 0;
  }
}
