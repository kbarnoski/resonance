// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — Web Audio voice engine for 1910-ten-fingers.
//
// Total silence until a finger touches the glass: nothing is scheduled, no
// oscillator drones. Each pressed cell spawns a 4-voice chord group whose
// oscillators START at the previous voicing's frequencies and GLIDE
// (setTargetAtTime) to the new voicing — that portamento is the "bite" and the
// audible face of the voice-leading. Timbre is a warm-but-clean triangle+sine
// mix through a gentle lowpass, with a small stereo-ish delay for air.
// ─────────────────────────────────────────────────────────────────────────────

import { midiToHz } from "./harmony";

export interface ChordGroup {
  release(): void;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private input: GainNode | null = null;

  /** Build (once) and resume the AudioContext — must run inside a gesture. */
  async resume(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();

      const master = ctx.createGain();
      master.gain.value = 0.85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      lp.Q.value = 0.6;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 90;

      const input = ctx.createGain();
      input.gain.value = 1;

      // dry path
      input.connect(hp);
      hp.connect(lp);
      lp.connect(master);
      master.connect(comp);
      comp.connect(ctx.destination);

      // air: a soft feedback delay
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.23;
      const fb = ctx.createGain();
      fb.gain.value = 0.28;
      const wet = ctx.createGain();
      wet.gain.value = 0.16;
      input.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(lp);

      this.ctx = ctx;
      this.input = input;
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /**
   * Voice a chord. `from` = the previous voicing (voices glide from here);
   * `to` = the target voicing computed by voiceLead.
   */
  press(from: number[], to: number[]): ChordGroup {
    const ctx = this.ctx;
    const input = this.input;
    if (!ctx || !input) return { release: () => {} };

    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(input);

    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < to.length; i++) {
      const vg = ctx.createGain();
      vg.gain.value = i === 0 ? 1 : 0.8; // slight bass emphasis
      vg.connect(g);

      const tri = ctx.createOscillator();
      tri.type = "triangle";
      const triG = ctx.createGain();
      triG.gain.value = 0.55;
      tri.connect(triG);
      triG.connect(vg);

      const sin = ctx.createOscillator();
      sin.type = "sine";
      const sinG = ctx.createGain();
      sinG.gain.value = 0.5;
      sin.connect(sinG);
      sinG.connect(vg);

      const f0 = midiToHz(from[i] ?? to[i]);
      const f1 = midiToHz(to[i]);
      tri.frequency.setValueAtTime(f0, t);
      tri.frequency.setTargetAtTime(f1, t, 0.05);
      sin.frequency.setValueAtTime(f0, t);
      sin.frequency.setTargetAtTime(f1, t, 0.05);

      tri.start(t);
      sin.start(t);
      oscs.push(tri, sin);
    }

    // ADSR: soft attack, gentle decay to a sustain level.
    const peak = 0.13;
    const sustain = 0.095;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.03);
    g.gain.setTargetAtTime(sustain, t + 0.03, 0.35);

    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const rt = ctx.currentTime;
        g.gain.cancelScheduledValues(rt);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), rt);
        g.gain.setTargetAtTime(0, rt, 0.28);
        const stopAt = rt + 1.6;
        oscs.forEach((o) => {
          try {
            o.stop(stopAt);
          } catch {
            /* already stopped */
          }
        });
        setTimeout(() => {
          try {
            g.disconnect();
          } catch {
            /* noop */
          }
        }, 1800);
      },
    };
  }

  stop(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.input = null;
    }
  }
}
