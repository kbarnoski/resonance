// audio.ts — a small AudioContext-owning class for the Huygens piece.
//
// A just-intonation drone bed (root + fifth + octave, lowpassed, with a slow
// LFO swell) underpins a single "virtual source" tone that is placed by
// geometry: an approximate binaural pan built from a per-ear ITD (DelayNode
// difference) and ILD (GainNode difference), merged to stereo. Each wavefront
// launched from the array rings the source softly; when the source focuses
// onto the listener the tone swells louder and more present.

type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

export type AudioGeom = {
  azimuth: number; // -1 left .. +1 right
  present: number; // 0..1 closeness
  focus: number; // 0..1
  launched: boolean;
};

export class HuygensAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private droneGain: GainNode;
  private droneFilter: BiquadFilterNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private oscs: OscillatorNode[] = [];

  private srcOsc: OscillatorNode;
  private ringGain: GainNode; // pulsed per wavefront
  private srcGain: GainNode; // presence
  private delayL: DelayNode;
  private delayR: DelayNode;
  private gainL: GainNode;
  private gainR: GainNode;
  private merger: ChannelMergerNode;

  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio API unavailable");
    this.ctx = new Ctor();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(ctx.destination);

    // ── Drone bed (just intonation: 55, 82.5, 110 Hz) ──
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 420;
    this.droneFilter.Q.value = 0.5;
    this.droneFilter.connect(this.master);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.16;
    this.droneGain.connect(this.droneFilter);

    const partials: [number, OscillatorType, number][] = [
      [55, "sine", 1],
      [82.5, "sine", 0.6],
      [110, "triangle", 0.4],
    ];
    for (const [f, type, g] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og);
      og.connect(this.droneGain);
      o.start(now);
      this.oscs.push(o);
    }

    // Slow swell LFO (~0.06 Hz) on the drone level.
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.06;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.06;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.droneGain.gain);
    this.lfo.start(now);

    // ── Virtual source tone (165 Hz = root * 3), binaural placement ──
    this.srcOsc = ctx.createOscillator();
    this.srcOsc.type = "sine";
    this.srcOsc.frequency.value = 165;

    this.ringGain = ctx.createGain();
    this.ringGain.gain.value = 0.5;
    this.srcGain = ctx.createGain();
    this.srcGain.gain.value = 0.0001;

    this.srcOsc.connect(this.ringGain);
    this.ringGain.connect(this.srcGain);

    this.delayL = ctx.createDelay(0.02);
    this.delayR = ctx.createDelay(0.02);
    this.gainL = ctx.createGain();
    this.gainR = ctx.createGain();
    this.merger = ctx.createChannelMerger(2);

    this.srcGain.connect(this.delayL);
    this.srcGain.connect(this.delayR);
    this.delayL.connect(this.gainL);
    this.delayR.connect(this.gainR);
    this.gainL.connect(this.merger, 0, 0);
    this.gainR.connect(this.merger, 0, 1);
    this.merger.connect(this.master);

    this.srcOsc.start(now);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.9, now + 2.5);
  }

  update(g: AudioGeom) {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const tc = 0.08;

    // ITD: near ear earlier (less delay), far ear delayed up to ~0.6 ms.
    const itd = 0.0006;
    const dl = g.azimuth > 0 ? g.azimuth * itd : 0;
    const dr = g.azimuth < 0 ? -g.azimuth * itd : 0;
    this.delayL.delayTime.setTargetAtTime(dl, now, tc);
    this.delayR.delayTime.setTargetAtTime(dr, now, tc);

    // ILD: near ear louder.
    const gl = 1 - Math.max(0, g.azimuth) * 0.4;
    const gr = 1 - Math.max(0, -g.azimuth) * 0.4;
    this.gainL.gain.setTargetAtTime(gl, now, tc);
    this.gainR.gain.setTargetAtTime(gr, now, tc);

    // Presence: closer + focused source is louder and more present.
    const level = 0.04 + g.present * 0.14 + g.focus * 0.22;
    this.srcGain.gain.setTargetAtTime(level, now, 0.12);

    // Focus opens the drone filter a touch (more shimmer at the pop).
    this.droneFilter.frequency.setTargetAtTime(420 + g.focus * 700, now, 0.2);

    // Wavefront launch: ring the source.
    if (g.launched) {
      this.ringGain.gain.cancelScheduledValues(now);
      this.ringGain.gain.setValueAtTime(1.0, now);
      this.ringGain.gain.setTargetAtTime(0.5, now + 0.01, 0.45);
    }
  }

  stop() {
    if (!this.ctx || this.ctx.state === "closed") return;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.3);
    } catch {
      /* ignore */
    }
  }

  close() {
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {
        /* already closed */
      });
    }
  }
}
