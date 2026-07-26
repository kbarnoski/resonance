// audio.ts — self-contained Web Audio engine (no dependencies).
//
// Master chain:  bus → gentle lowpass → tanh soft-limiter → master gain (≤0.15)
//                → destination.
//
// Two voice families share the bus:
//   • the HAND voice — one sustained, expressive continuous-pitch tone
//     (triangle + slow lowpass + slow env); pitch glides, never snaps.
//   • AGENT grains — short plucked continuous-pitch blips with fast decay,
//     scheduled from a lightweight pool with bounded polyphony.

function tanhCurve(n: number) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 2.2);
  }
  return c;
}

export class SwarmAudio {
  private ctx: AudioContext;
  private bus: GainNode;
  private master: GainNode;

  // Hand voice (sustained).
  private handOsc: OscillatorNode;
  private handSub: OscillatorNode;
  private handFilter: BiquadFilterNode;
  private handGain: GainNode;
  private handPan: StereoPannerNode;
  private handActive = false;

  // Grain polyphony budget per animation frame batch.
  private grainBudget = 0;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.14; // ≤ 0.15 headroom

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = tanhCurve(1024);
    shaper.oversample = "2x";

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    lp.Q.value = 0.4;

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;

    this.bus.connect(lp);
    lp.connect(shaper);
    shaper.connect(this.master);
    this.master.connect(this.ctx.destination);

    // --- Build the persistent hand voice --------------------------------
    this.handPan = this.ctx.createStereoPanner();
    this.handGain = this.ctx.createGain();
    this.handGain.gain.value = 0;
    this.handFilter = this.ctx.createBiquadFilter();
    this.handFilter.type = "lowpass";
    this.handFilter.frequency.value = 1400;
    this.handFilter.Q.value = 0.8;

    this.handOsc = this.ctx.createOscillator();
    this.handOsc.type = "triangle";
    this.handOsc.frequency.value = 220;
    this.handSub = this.ctx.createOscillator();
    this.handSub.type = "sine";
    this.handSub.frequency.value = 110;

    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.5;
    this.handOsc.connect(this.handFilter);
    this.handSub.connect(subGain);
    subGain.connect(this.handFilter);
    this.handFilter.connect(this.handGain);
    this.handGain.connect(this.handPan);
    this.handPan.connect(this.bus);
    this.handOsc.start();
    this.handSub.start();
  }

  suspended(): boolean {
    return this.ctx.state === "suspended";
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore — gated behind a user gesture elsewhere */
      }
    }
  }

  /** Reset the per-frame grain budget (call once per animation frame). */
  beginFrame(maxGrains: number): void {
    this.grainBudget = maxGrains;
  }

  /**
   * Drive the sustained hand voice. `on` gates it; freq is continuous;
   * pan in [-1,1]; bright in [0,1] opens the timbre filter.
   */
  setHand(on: boolean, freq: number, pan: number, bright: number): void {
    const t = this.ctx.currentTime;
    if (on && !this.handActive) {
      this.handGain.gain.cancelScheduledValues(t);
      this.handGain.gain.setTargetAtTime(0.5, t, 0.08);
      this.handActive = true;
    } else if (!on && this.handActive) {
      this.handGain.gain.cancelScheduledValues(t);
      this.handGain.gain.setTargetAtTime(0, t, 0.25);
      this.handActive = false;
    }
    if (on) {
      // Glide pitch smoothly — continuous, never quantised.
      this.handOsc.frequency.setTargetAtTime(freq, t, 0.05);
      this.handSub.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
      this.handFilter.frequency.setTargetAtTime(
        900 + bright * 3200,
        t,
        0.1,
      );
      this.handPan.pan.setTargetAtTime(pan, t, 0.1);
    }
  }

  /** Fire one short plucked grain, if the frame budget allows. */
  grain(freq: number, pan: number, gain: number): void {
    if (this.grainBudget <= 0) return;
    this.grainBudget--;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = Math.min(6000, freq * 5 + 800);
    f.Q.value = 1.2;

    const g = this.ctx.createGain();
    const peak = 0.11 * gain;
    const dur = 0.42;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak + 0.0001, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);

    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;

    osc.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    osc.onended = () => {
      osc.disconnect();
      f.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }

  dispose(): void {
    try {
      this.handOsc.stop();
      this.handSub.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.handOsc.disconnect();
      this.handSub.disconnect();
      this.bus.disconnect();
      this.master.disconnect();
    } catch {
      /* ignore */
    }
    void this.ctx.close().catch(() => {});
  }
}
