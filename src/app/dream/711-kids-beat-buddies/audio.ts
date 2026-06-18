// Shared-clock quantized loop-stacking groove engine for Beat Buddies.
// Pure Web Audio synthesis. No samples. One look-ahead scheduler drives a
// single clock for BOTH players, so every tap snaps into the same groove.

export type SoundId =
  | "boing"
  | "honk"
  | "bwaap"
  | "kick"
  | "pop"
  | "whistle";

// Each pad, when active, fires its sound on a set of 16th-note steps within a
// 16-step bar. This is what makes a tap LOOP and stack Incredibox-style.
const STEP_PATTERNS: Record<SoundId, number[]> = {
  kick: [0, 4, 8, 12], // four-on-the-floor pulse
  pop: [2, 6, 10, 14], // offbeat pops
  boing: [0, 6, 11], // bouncy syncopation
  honk: [4, 12], // honk on the backbeat
  bwaap: [3, 9, 13], // goofy animal stabs
  whistle: [7, 15], // slide-whistle flourishes
};

export const STEPS_PER_BAR = 16;

// A registered looping layer (one per active pad per player).
export interface Layer {
  player: 0 | 1;
  sound: SoundId;
  steps: number[]; // which 16th steps it fires on
}

// Callback fired (in visual time) when a layer's sound actually sounds, so the
// canvas can flash/bop in sync with the audio.
export type HitCallback = (player: 0 | 1, sound: SoundId, when: number) => void;

export class GrooveEngine {
  ctx: AudioContext;
  private master: GainNode;
  private bpm = 104;
  private secondsPerStep: number;
  private nextStepTime = 0;
  private currentStep = 0;
  private timer: number | null = null;
  private layers = new Map<string, Layer>();
  private onHit: HitCallback | null = null;
  // base pulse (soft kick + shaker) so there's always something to lock to
  private baseOn = true;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    // Safe gentle master chain: gain -> lowpass -> compressor -> destination.
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.28;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7500;
    lp.Q.value = 0.3;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    this.master.connect(lp);
    lp.connect(comp);
    comp.connect(this.ctx.destination);

    this.secondsPerStep = 60 / this.bpm / 4; // 16th notes
  }

  setOnHit(cb: HitCallback) {
    this.onHit = cb;
  }

  async start() {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (this.timer !== null) return;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.currentStep = 0;
    this.timer = window.setInterval(() => this.runScheduler(), 25);
  }

  private runScheduler() {
    const lookAhead = 0.12; // schedule a little ahead of the clock
    while (this.nextStepTime < this.ctx.currentTime + lookAhead) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += this.secondsPerStep;
      this.currentStep = (this.currentStep + 1) % STEPS_PER_BAR;
    }
  }

  private scheduleStep(step: number, when: number) {
    // base groove: soft kick on the quarter, shaker on the offbeat 8ths
    if (this.baseOn) {
      if (step % 4 === 0) this.synthKick(when, 0.5);
      if (step % 2 === 1) this.synthShaker(when, 0.18);
    }
    // each active layer
    this.layers.forEach((layer) => {
      if (layer.steps.includes(step)) {
        this.fire(layer.sound, when, 1);
        if (this.onHit) this.onHit(layer.player, layer.sound, when);
      }
    });
  }

  // Quantize a tap: register/toggle the looping layer. Sound first sounds on the
  // next occurrence of one of its steps (handled by the scheduler), so the tap
  // snaps to the grid instead of firing raw.
  toggleLayer(player: 0 | 1, sound: SoundId): boolean {
    const key = `${player}:${sound}`;
    if (this.layers.has(key)) {
      this.layers.delete(key);
      return false;
    }
    this.layers.set(key, { player, sound, steps: STEP_PATTERNS[sound] });
    return true;
  }

  isActive(player: 0 | 1, sound: SoundId): boolean {
    return this.layers.has(`${player}:${sound}`);
  }

  layerCount(): number {
    return this.layers.size;
  }

  activePlayers(): [boolean, boolean] {
    let a = false;
    let b = false;
    this.layers.forEach((l) => {
      if (l.player === 0) a = true;
      else b = true;
    });
    return [a, b];
  }

  // Position within the bar in [0,1) for visual beat sync.
  barPhase(): number {
    if (this.timer === null) return 0;
    const barLen = this.secondsPerStep * STEPS_PER_BAR;
    const elapsed = this.ctx.currentTime - (this.nextStepTime - barLen);
    const wrapped = (((elapsed % barLen) + barLen) % barLen);
    return wrapped / barLen;
  }

  // ---- Synth voices (oscillators + envelopes + filters only) ----

  private fire(sound: SoundId, when: number, vel: number) {
    switch (sound) {
      case "boing":
        this.synthBoing(when, vel);
        break;
      case "honk":
        this.synthHonk(when, vel);
        break;
      case "bwaap":
        this.synthBwaap(when, vel);
        break;
      case "kick":
        this.synthKick(when, vel * 0.9);
        break;
      case "pop":
        this.synthPop(when, vel);
        break;
      case "whistle":
        this.synthWhistle(when, vel);
        break;
    }
  }

  private env(when: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    g.connect(this.master);
    return g;
  }

  private synthKick(when: number, vel: number) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(140, when);
    o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    const g = this.env(when, 0.9 * vel, 0.004, 0.18);
    o.connect(g);
    o.start(when);
    o.stop(when + 0.22);
  }

  private synthShaker(when: number, vel: number) {
    const len = 0.05;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4500;
    const g = this.env(when, 0.5 * vel, 0.002, 0.05);
    src.connect(hp);
    hp.connect(g);
    src.start(when);
    src.stop(when + len);
  }

  private synthBoing(when: number, vel: number) {
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(520, when);
    o.frequency.exponentialRampToValueAtTime(140, when + 0.18);
    // wobble for the cartoon boing
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 16;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 30;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    const g = this.env(when, 0.8 * vel, 0.005, 0.3);
    o.connect(g);
    o.start(when);
    lfo.start(when);
    o.stop(when + 0.36);
    lfo.stop(when + 0.36);
  }

  private synthHonk(when: number, vel: number) {
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(210, when);
    o.frequency.linearRampToValueAtTime(190, when + 0.16);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const g = this.env(when, 0.55 * vel, 0.01, 0.2);
    o.connect(lp);
    lp.connect(g);
    o.start(when);
    o.stop(when + 0.26);
  }

  private synthBwaap(when: number, vel: number) {
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(300, when);
    o.frequency.exponentialRampToValueAtTime(110, when + 0.22);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, when);
    lp.frequency.exponentialRampToValueAtTime(500, when + 0.22);
    const g = this.env(when, 0.5 * vel, 0.008, 0.26);
    o.connect(lp);
    lp.connect(g);
    o.start(when);
    o.stop(when + 0.3);
  }

  private synthPop(when: number, vel: number) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(900, when);
    o.frequency.exponentialRampToValueAtTime(420, when + 0.04);
    const g = this.env(when, 0.55 * vel, 0.002, 0.06);
    o.connect(g);
    o.start(when);
    o.stop(when + 0.09);
  }

  private synthWhistle(when: number, vel: number) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(700, when);
    o.frequency.linearRampToValueAtTime(1500, when + 0.18);
    const g = this.env(when, 0.4 * vel, 0.02, 0.18);
    o.connect(g);
    o.start(when);
    o.stop(when + 0.22);
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  async teardown() {
    this.stop();
    this.layers.clear();
    this.master.disconnect();
    try {
      await this.ctx.close();
    } catch {
      // already closed
    }
  }
}
