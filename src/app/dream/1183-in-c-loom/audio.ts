// 1183 · In C Loom — Web Audio engine.
//
// A lookahead scheduler (the "A Tale of Two Clocks" pattern) reads onsets from
// an InCEnsemble one eighth-note pulse at a time and schedules them onto
// ctx.currentTime. Cell notes are a warm marimba/plucked voice; a soft high-C
// pulse click keeps the ensemble loosely in time; a low sustained drone pad
// sits underneath. Everything routes through a limiter into a quiet master.

import { InCEnsemble, type Spread, type Player } from "./ensemble";

const C4 = 261.6255653; // reference pitch: degree 0 == C4

/** MIDI-ish semitone offset from C4 → frequency in Hz. */
function degreeToFreq(degree: number): number {
  return C4 * Math.pow(2, degree / 12);
}

interface Voice {
  oscs: OscillatorNode[];
  amp: GainNode;
  filter: BiquadFilterNode;
  endTime: number;
}

const MAX_VOICES = 22;

export interface InCAudioOptions {
  seed?: number;
  numPlayers?: number;
  /** quarter-note BPM; an eighth lasts 30 / bpm seconds */
  tempo?: number;
  /** number of active players */
  density?: number;
}

export class InCAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private voiceBus: GainNode;
  private droneGain: GainNode;
  private droneNodes: OscillatorNode[] = [];
  private droneLfo: OscillatorNode | null = null;
  private pulseGain: GainNode;

  private ensemble: InCEnsemble;
  private voices: Voice[] = [];

  private timer: number | null = null;
  private eighthDur: number; // seconds per eighth
  private nextNoteTime = 0;
  private eighthCount = 0;
  private disposed = false;

  private readonly lookaheadMs = 25;
  private readonly scheduleAhead = 0.12; // seconds

  constructor(opts: InCAudioOptions = {}) {
    const AudioCtor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AudioCtor();

    const tempo = opts.tempo ?? 140;
    this.eighthDur = 30 / tempo;

    this.ensemble = new InCEnsemble(opts.seed ?? 1183, opts.numPlayers ?? 12);
    if (opts.density) this.ensemble.setActiveCount(opts.density);

    // Master chain: limiter → master gain → destination.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 18;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    this.limiter.connect(this.master);
    this.master.connect(this.ctx.destination);

    // Sub-buses so we can balance marimba / pulse / drone independently.
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.value = 1.0;
    this.voiceBus.connect(this.limiter);

    this.pulseGain = this.ctx.createGain();
    this.pulseGain.gain.value = 0.16;
    this.pulseGain.connect(this.limiter);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0001;
    this.droneGain.connect(this.limiter);

    this.buildDrone();
  }

  // — warm sustained drone pad (low C with a fifth), slow filter breathing —
  private buildDrone(): void {
    const now = this.ctx.currentTime;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.6;
    filter.connect(this.droneGain);

    // Slow (≤1 Hz) luminance-style movement on the filter — no flicker.
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.06;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(now);
    this.droneLfo = lfo;

    // C2, C3, G3 — a warm open drone under the C-major loom.
    const droneFreqs = [degreeToFreq(-24), degreeToFreq(-12), degreeToFreq(-5)];
    const droneLevels = [0.5, 0.34, 0.24];
    droneFreqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = f;
      osc.detune.value = (i - 1) * 4;
      const g = this.ctx.createGain();
      g.gain.value = droneLevels[i];
      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      this.droneNodes.push(osc);
    });
  }

  /** Gesture-gated start. */
  async start(): Promise<void> {
    if (this.disposed) return;
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    // Slow fade-in (no clicks, no sudden brightness).
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.2, now, 0.6);
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setTargetAtTime(0.14, now, 1.2);

    this.nextNoteTime = now + 0.08;
    this.eighthCount = 0;
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.scheduler(), this.lookaheadMs);
    }
  }

  // — the lookahead scheduler —
  private scheduler(): void {
    if (this.disposed) return;
    const horizon = this.ctx.currentTime + this.scheduleAhead;
    while (this.nextNoteTime < horizon) {
      this.scheduleEighth(this.nextNoteTime, this.eighthCount);
      this.nextNoteTime += this.eighthDur;
      this.eighthCount++;
    }
  }

  private scheduleEighth(time: number, eighth: number): void {
    // Steady high-C pulse on every eighth.
    this.schedulePulse(time);

    // Advance the ensemble one pulse and voice whatever onsets it produced.
    const onsets = this.ensemble.tick();
    for (const o of onsets) {
      this.scheduleNote(time, o.degree, o.durEighths, o.gain);
    }
    void eighth;
  }

  // — soft high-C pulse click —
  private schedulePulse(time: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = degreeToFreq(24); // C6, quiet and bell-like
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.9, time + 0.004);
    g.gain.setTargetAtTime(0.0001, time + 0.006, 0.03);
    osc.connect(g);
    g.connect(this.pulseGain);
    osc.start(time);
    osc.stop(time + 0.14);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  // — warm marimba / plucked cell voice with voice-stealing —
  private scheduleNote(
    time: number,
    degree: number,
    durEighths: number,
    playerGain: number,
  ): void {
    this.reclaimVoices(time);
    if (this.voices.length >= MAX_VOICES) {
      // Steal the oldest sounding voice.
      const victim = this.voices.shift();
      if (victim) this.killVoice(victim, time);
    }

    const freq = degreeToFreq(degree);
    const durSec = Math.min(durEighths * this.eighthDur, 1.1);
    const release = 0.28 + durSec * 0.5;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(freq * 6 + 900, 6500), time);
    filter.frequency.setTargetAtTime(Math.min(freq * 3 + 400, 3200), time, 0.12);
    filter.Q.value = 0.7;

    const amp = this.ctx.createGain();
    const peak = 0.28 * playerGain;
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(peak, time + 0.006);
    amp.gain.setTargetAtTime(0.0001, time + 0.02, release * 0.4);

    filter.connect(amp);
    amp.connect(this.voiceBus);

    const oscs: OscillatorNode[] = [];
    // Two detuned bodies + a faint high partial for the marimba "bar" tone.
    const partials: Array<{ ratio: number; type: OscillatorType; det: number; lvl: number }> = [
      { ratio: 1, type: "triangle", det: -5, lvl: 1.0 },
      { ratio: 1, type: "sine", det: 6, lvl: 0.7 },
      { ratio: 3.99, type: "sine", det: 0, lvl: 0.12 },
    ];
    for (const p of partials) {
      const osc = this.ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = freq * p.ratio;
      osc.detune.value = p.det;
      const pg = this.ctx.createGain();
      pg.gain.value = p.lvl;
      osc.connect(pg);
      pg.connect(filter);
      osc.start(time);
      const stopAt = time + 0.02 + release + 0.3;
      osc.stop(stopAt);
      oscs.push(osc);
    }

    const voice: Voice = {
      oscs,
      amp,
      filter,
      endTime: time + 0.02 + release + 0.3,
    };
    const last = oscs[oscs.length - 1];
    last.onended = () => this.disconnectVoice(voice);
    this.voices.push(voice);
  }

  private reclaimVoices(now: number): void {
    this.voices = this.voices.filter((v) => v.endTime > now);
  }

  private killVoice(v: Voice, time: number): void {
    try {
      v.amp.gain.cancelScheduledValues(time);
      v.amp.gain.setTargetAtTime(0.0001, time, 0.02);
      for (const o of v.oscs) o.stop(time + 0.08);
    } catch {
      // already stopped
    }
  }

  private disconnectVoice(v: Voice): void {
    try {
      for (const o of v.oscs) o.disconnect();
      v.filter.disconnect();
      v.amp.disconnect();
    } catch {
      // already gone
    }
  }

  // — runtime controls —
  setTempo(quarterBpm: number): void {
    const bpm = Math.max(60, Math.min(240, quarterBpm));
    this.eighthDur = 30 / bpm;
  }

  setDensity(count: number): void {
    this.ensemble.setActiveCount(count);
  }

  reseed(seed: number): void {
    this.ensemble.reseed(seed);
  }

  // — readouts for the visualisation —
  getSpread(): Spread {
    return this.ensemble.spread();
  }

  getPlayers(): ReadonlyArray<Player> {
    return this.ensemble.players;
  }

  /** Full teardown: cancel scheduler, stop + disconnect every node, close ctx. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.15);
    } catch {
      // ignore
    }

    const stopAt = now + 0.3;
    for (const v of this.voices) {
      try {
        for (const o of v.oscs) o.stop(stopAt);
      } catch {
        // ignore
      }
    }
    for (const o of this.droneNodes) {
      try {
        o.stop(stopAt);
      } catch {
        // ignore
      }
    }
    try {
      this.droneLfo?.stop(stopAt);
    } catch {
      // ignore
    }

    // Give the fade-out a beat, then hard-disconnect and close.
    window.setTimeout(() => {
      for (const v of this.voices) this.disconnectVoice(v);
      this.voices = [];
      try {
        for (const o of this.droneNodes) o.disconnect();
        this.droneLfo?.disconnect();
        this.droneGain.disconnect();
        this.pulseGain.disconnect();
        this.voiceBus.disconnect();
        this.limiter.disconnect();
        this.master.disconnect();
      } catch {
        // ignore
      }
      this.ctx.close().catch(() => {});
    }, 350);
  }
}
