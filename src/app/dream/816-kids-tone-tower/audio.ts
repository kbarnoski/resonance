/**
 * 816 · Tone Tower — audio.ts
 *
 * A tiny, kids-safe Web Audio engine. Synthesizes everything at runtime (no
 * files). Master chain: gain(0.28) → lowpass(7000) → DynamicsCompressor → out.
 * A soft ambient pad always hums under the tower so it never feels broken or
 * silent. Notes are warm triangle/sine voices with gentle attack so there are
 * NO sudden loud transients and nothing harsh or high-ringing.
 */

export class ToneTowerAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private padOscs: OscillatorNode[] = [];
  ready = false;
  unavailable = false;

  constructor() {
    if (typeof window === "undefined") return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      this.unavailable = true;
      return;
    }
    try {
      this.ctx = new AC();
    } catch {
      this.unavailable = true;
    }
  }

  /** Must be called inside a user gesture (iOS). Builds the master chain + pad. */
  async resume() {
    if (!this.ctx || this.ready) {
      if (this.ctx && this.ctx.state === "suspended") {
        try {
          await this.ctx.resume();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    try {
      if (this.ctx.state === "suspended") await this.ctx.resume();
    } catch {
      /* ignore */
    }

    const ctx = this.ctx;

    // ── kids-safe master chain ──────────────────────────────────────────────
    const master = ctx.createGain();
    master.gain.value = 0.28;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    lp.Q.value = 0.7;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;

    master.connect(lp);
    lp.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // ── soft ambient pad (two detuned low sines) ─────────────────────────────
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(master);
    this.padGain = padGain;

    const padFreqs = [87.3, 130.8]; // F2 + C3, a hollow open fifth drone
    for (const f of padFreqs) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = 0.5;
      // slow tremolo for life
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.12 + Math.random() * 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.18;
      lfo.connect(lfoGain);
      lfoGain.connect(og.gain);
      o.connect(og);
      og.connect(padGain);
      o.start();
      lfo.start();
      this.padOscs.push(o, lfo);
    }
    // fade pad in gently
    const now = ctx.currentTime;
    padGain.gain.setValueAtTime(0.0, now);
    padGain.gain.linearRampToValueAtTime(0.16, now + 1.5);

    this.ready = true;
  }

  get audible() {
    return this.ready && !!this.ctx && this.ctx.state === "running";
  }

  /** Pluck one warm voice. Soft attack, no harsh transient. */
  note(freq: number, when = 0, opts?: { gain?: number; dur?: number }) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + Math.max(0, when);
    const dur = opts?.dur ?? 1.4;
    const peak = opts?.gain ?? 0.5;

    // body: triangle (warm), with a sine sub for weight
    const tri = ctx.createOscillator();
    tri.type = "triangle";
    tri.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.05); // soft attack ~50ms
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    // a gentle per-voice lowpass keeps timbre round
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(6500, freq * 6 + 600);

    tri.connect(g);
    sub.connect(g);
    g.connect(lp);
    lp.connect(master);

    tri.start(t0);
    sub.start(t0);
    tri.stop(t0 + dur + 0.05);
    sub.stop(t0 + dur + 0.05);
  }

  /** Strum a chord bottom→top as a quick warm arpeggio. */
  strum(freqs: number[], opts?: { step?: number; gain?: number; dur?: number }) {
    const step = opts?.step ?? 0.07;
    const n = freqs.length;
    freqs.forEach((f, i) => {
      this.note(f, i * step, {
        gain: (opts?.gain ?? 0.45) * (1 - i / (n + 3)),
        dur: opts?.dur ?? 1.6,
      });
    });
  }

  /** Topple gliss: a soft downward sparkle when the tower is knocked over. */
  topple(freqs: number[]) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const sorted = [...freqs].sort((a, b) => b - a); // high → low
    sorted.forEach((f, i) => {
      const t0 = ctx.currentTime + i * 0.05;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(60, f * 0.5), t0 + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + 0.65);
    });
    // sparkle: a few soft high blips
    for (let i = 0; i < 5; i++) {
      const t0 = ctx.currentTime + 0.15 + Math.random() * 0.4;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 1400 + Math.random() * 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + 0.3);
    }
  }

  dispose() {
    try {
      this.padOscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* ignore */
        }
        o.disconnect();
      });
      this.padOscs = [];
      this.padGain?.disconnect();
      this.master?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx) {
      try {
        void this.ctx.close();
      } catch {
        /* ignore */
      }
    }
    this.ctx = null;
    this.master = null;
    this.ready = false;
  }
}
