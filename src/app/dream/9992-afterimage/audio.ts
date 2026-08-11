// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the binaural "color drone" that primes and releases alongside the
// screen. The audio is a second adaptation channel: during ADAPT it holds a low
// binaural pitch mapped to the field's hue; on BLINK it slides to the
// COMPLEMENTARY interval (a tritone away — the sonic opponent of that hue) and
// thins, mirroring the retinal negative that blooms when the colour is gone.
//
//   Signal (all low-register so the binaural beat is perceptible):
//     • Left osc  @ f            ┐ hard-panned pair → the binaural beat sits in
//     • Right osc @ f + beatHz   ┘ the head, not the speakers.
//     • Centre sub @ f · 0.5     — warmth / body.
//   A gentle lowpass gives each hue its own "brightness"; the whole mix runs
//   through the shared safe-master limiter so it can never get harsh or loud.
//
//   Nothing is created until start() runs inside a user gesture; dispose() stops
//   every oscillator and closes the context. No Math.random / Date.now anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

export type Phase = "adapt" | "blink";

// Twelve equal-tempered steps from a low warm root. Hue → step = round(h/30).
// The complement (h + 180°) lands 6 steps up: a tritone, the audible opponent.
const ROOT_HZ = 118;
function pitchForHue(hue: number): number {
  const step = Math.round(((hue % 360) + 360) % 360 / 30) % 12;
  return ROOT_HZ * Math.pow(2, step / 12);
}

// Warmer hues (reds/oranges) read darker; cool hues (cyan/blue) read brighter.
function cutoffForHue(hue: number): number {
  const h = ((hue % 360) + 360) % 360;
  const brightness = 0.5 - 0.5 * Math.cos((h / 180) * Math.PI); // 0 at red, 1 at cyan
  return 520 + brightness * 900; // 520–1420 Hz
}

export class AfterimageDrone {
  private ctx: AudioContext | null = null;
  private master: SafeMaster | null = null;
  private left: OscillatorNode | null = null;
  private right: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private busGain: GainNode | null = null;
  running = false;

  /** Must be called from within a user gesture. */
  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.running = true;
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio unavailable");

    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const master = createSafeMaster(ctx, { gain: 0.8 });
    this.master = master;

    // Shared voice bus → hue-coloured lowpass → safe master.
    const bus = ctx.createGain();
    bus.gain.value = 0.0001; // fade in
    this.busGain = bus;

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 900;
    tone.Q.value = 0.5;
    this.tone = tone;

    bus.connect(tone);
    tone.connect(master.input);

    const makePan = (p: number): AudioNode => {
      if (typeof ctx.createStereoPanner === "function") {
        const node = ctx.createStereoPanner();
        node.pan.value = p;
        node.connect(bus);
        return node;
      }
      // Fallback for engines without StereoPanner: just go straight to bus.
      const g = ctx.createGain();
      g.connect(bus);
      return g;
    };

    const f0 = pitchForHue(0);

    const left = ctx.createOscillator();
    left.type = "sine";
    left.frequency.value = f0;
    const lGain = ctx.createGain();
    lGain.gain.value = 0.5;
    left.connect(lGain);
    lGain.connect(makePan(-1));

    const right = ctx.createOscillator();
    right.type = "sine";
    right.frequency.value = f0 + 6; // binaural beat ≈ 6 Hz (alpha-ish)
    const rGain = ctx.createGain();
    rGain.gain.value = 0.5;
    right.connect(rGain);
    rGain.connect(makePan(1));

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = f0 * 0.5;
    const sGain = ctx.createGain();
    sGain.gain.value = 0.32;
    sub.connect(sGain);
    sGain.connect(bus);

    left.start();
    right.start();
    sub.start();
    this.left = left;
    this.right = right;
    this.sub = sub;

    bus.gain.setTargetAtTime(0.14, ctx.currentTime, 1.4);
    this.running = true;
  }

  /** Steer the drone to the current beat. `ramp` seconds smooths every change. */
  setBeat(hue: number, phase: Phase, ramp: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.left || !this.right || !this.sub || !this.tone || !this.busGain)
      return;
    const now = ctx.currentTime;
    const t = Math.max(0.2, ramp);

    // On BLINK the pitch flips to the complementary hue (tritone) and thins.
    const soundingHue = phase === "blink" ? hue + 180 : hue;
    const f = pitchForHue(soundingHue);
    const beatHz = phase === "blink" ? 3.2 : 6.0; // slower, calmer on release

    this.left.frequency.setTargetAtTime(f, now, t);
    this.right.frequency.setTargetAtTime(f + beatHz, now, t);
    this.sub.frequency.setTargetAtTime(f * 0.5, now, t);
    this.tone.frequency.setTargetAtTime(cutoffForHue(soundingHue), now, t);
    this.busGain.gain.setTargetAtTime(phase === "blink" ? 0.075 : 0.15, now, t);
  }

  dispose(): void {
    this.running = false;
    const stop = (o: OscillatorNode | null) => {
      if (!o) return;
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* already stopped */
      }
    };
    stop(this.left);
    stop(this.right);
    stop(this.sub);
    this.left = this.right = this.sub = null;
    try {
      this.master?.disconnect();
    } catch {
      /* closing */
    }
    this.master = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      ctx.close().catch(() => {
        /* already closed */
      });
    }
  }
}
