// audio.ts — 3008 · Daylight
//
// The INVERSE colour-organ: light drives sound. A small additive oscillator
// bank forms ONE slow, living, continuous-pitch chord. Nothing snaps to a
// scale — the base frequency and the partial ratios glide freely, so warmth
// bends the chord's colour without ever stepping.
//
//   L (luminance) → overall gain + how many upper partials are audible +
//                    spectral brightness (a master lowpass). Dark = hushed
//                    and low; bright = fuller and brighter.
//   H (warmth)    → base frequency, a touch of detune, and the interval
//                    colour (partial ratios morph warm↔cool, continuously).
//   M (motion)    → tremolo/shimmer depth; motion spikes fire a soft accent.
//
// Signal path (all synthesised, no samples):
//   osc[i] → partialGain[i] ┐
//                            ├→ toneLP → master(≤0.24) → limiter → destination
//   tremLFO → tremDepth → master.gain (additive shimmer)
//
// Every parameter change glides via setTargetAtTime — ambient, never clicky.

// Warm chord leans on octaves + a low fifth; cool chord opens out with a
// ninth and brighter upper partials. We lerp between them by "cool" = 1 − H,
// so the interval colour slides continuously with the light.
const WARM_RATIOS = [1, 2, 3, 4, 5, 6, 8];
const COOL_RATIOS = [1, 2.005, 3.01, 4.5, 6.02, 8.03, 9.01];
// Per-partial base amplitude — a soft 1/n roll-off so the chord stays smooth.
const PARTIAL_AMP = [0.5, 0.32, 0.2, 0.14, 0.1, 0.075, 0.055];
// Brightness gate: the L above which each partial begins to be heard. Low
// partials are always present; upper ones fade in as the room brightens.
const PARTIAL_GATE = [0, 0, 0.12, 0.28, 0.44, 0.6, 0.74];

const WARM_BASE = 110; // warm light → low, chesty root (A2)
const COOL_BASE = 156; // cool light → higher, airier root
const N = WARM_RATIOS.length;

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
}

export class LightAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private toneLP: BiquadFilterNode;
  private partials: Partial[] = [];
  private tremLFO: OscillatorNode;
  private tremDepth: GainNode;
  private driftLFO: OscillatorNode;
  private driftDepth: GainNode;
  private running = false;
  private lastAccent = 0;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.005;
    this.limiter.release.value = 0.3;
    this.limiter.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.limiter);

    this.toneLP = this.ctx.createBiquadFilter();
    this.toneLP.type = "lowpass";
    this.toneLP.frequency.value = 500;
    this.toneLP.Q.value = 0.4;
    this.toneLP.connect(this.master);

    // Additive bank.
    for (let i = 0; i < N; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = WARM_BASE * WARM_RATIOS[i];
      osc.detune.value = (i - N / 2) * 1.5; // gentle static spread
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.toneLP);
      osc.start();
      this.partials.push({ osc, gain });
    }

    // Tremolo/shimmer: an LFO adding a little movement onto master gain.
    this.tremLFO = this.ctx.createOscillator();
    this.tremLFO.type = "sine";
    this.tremLFO.frequency.value = 5.5;
    this.tremDepth = this.ctx.createGain();
    this.tremDepth.gain.value = 0;
    this.tremLFO.connect(this.tremDepth);
    this.tremDepth.connect(this.master.gain);
    this.tremLFO.start();

    // A very slow LFO nudging detune so the chord is never static ("living").
    this.driftLFO = this.ctx.createOscillator();
    this.driftLFO.type = "sine";
    this.driftLFO.frequency.value = 0.07;
    this.driftDepth = this.ctx.createGain();
    this.driftDepth.gain.value = 4;
    this.driftLFO.connect(this.driftDepth);
    for (const p of this.partials) this.driftDepth.connect(p.osc.detune);
    this.driftLFO.start();
  }

  get contextState(): AudioContextState {
    return this.ctx.state;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.running = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(0.2, t + 2.0);
  }

  /** Push the current light into the chord. Called every animation frame;
   *  all changes glide, so ~60 Hz updates stay perfectly smooth. */
  setLight(L: number, H: number, M: number): void {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const cool = 1 - H;

    // L → overall level. L^1.4 makes a cupped lens fall to near-silence.
    const level = Math.pow(clamp01(L), 1.4) * 0.2;
    this.master.gain.setTargetAtTime(level, t, 0.5);

    // L → spectral brightness.
    const cutoff = 350 + clamp01(L) * 6200;
    this.toneLP.frequency.setTargetAtTime(cutoff, t, 0.4);

    // H → base frequency (continuous glide, no steps).
    const base = WARM_BASE + (COOL_BASE - WARM_BASE) * cool;

    for (let i = 0; i < N; i++) {
      // Interval colour morphs continuously between the warm and cool chords.
      const ratio = WARM_RATIOS[i] + (COOL_RATIOS[i] - WARM_RATIOS[i]) * cool;
      this.partials[i].osc.frequency.setTargetAtTime(base * ratio, t, 0.25);

      // Upper partials fade in only as the room brightens.
      const gate = PARTIAL_GATE[i];
      const audible = gate <= 0 ? 1 : clamp01((clamp01(L) - gate) / (1 - gate));
      const g = PARTIAL_AMP[i] * audible;
      this.partials[i].gain.gain.setTargetAtTime(g, t, 0.3);
    }

    // M → shimmer depth (kept modest so it never fights the drone).
    this.tremDepth.gain.setTargetAtTime(clamp01(M) * 0.06, t, 0.15);
  }

  /** A gentle brightening accent when motion spikes — light catching a wave. */
  accent(strength: number): void {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    if (now - this.lastAccent < 0.5) return; // don't machine-gun
    this.lastAccent = now;
    const s = clamp01(strength);
    // Briefly open the lowpass upward, then let it glide back to where
    // setLight is holding it — a soft shimmer of extra brightness.
    const base = this.toneLP.frequency.value;
    this.toneLP.frequency.cancelScheduledValues(now);
    this.toneLP.frequency.setValueAtTime(base, now);
    this.toneLP.frequency.linearRampToValueAtTime(
      base + 2500 * s,
      now + 0.12,
    );
    this.toneLP.frequency.setTargetAtTime(base, now + 0.12, 0.6);
  }

  stop(): void {
    if (!this.running) {
      void this.ctx.close();
      return;
    }
    this.running = false;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.6);
    window.setTimeout(() => {
      const kill = (o: OscillatorNode) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      };
      for (const p of this.partials) kill(p.osc);
      kill(this.tremLFO);
      kill(this.driftLFO);
      void this.ctx.close();
    }, 700);
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
