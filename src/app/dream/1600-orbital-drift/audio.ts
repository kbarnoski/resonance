// audio.ts — the just-intonation orbital drone.
//
// The sub-satellite point plays an instrument. A serene, slowly-evolving pad is
// built from a small stack of JUST-INTONATION partials (pure integer ratios, so
// it never beats harshly). Three things about the ISS steer its timbre:
//   • LATITUDE band  → a lowpass cutoff (equator = open/bright, poles = veiled)
//     and which JI degree the "melody" partial leans toward.
//   • OCEAN vs LAND  → crossfades a soft sawtooth grain in over land (more
//     harmonics — "texture" of continents) and back to pure sines over ocean.
//   • ORBITAL PHASE  → drives a slow Shepard-style amplitude window across 3
//     octaves, an endless, barely-perceptible glide that mirrors the orbit.
//
// Ground stations tapped onto the map add short FM bell CHIMES when the ISS
// flies near — a just-tuned degree chosen by the station's latitude.
//
// Safety: master ≤ 0.16 → DynamicsCompressor → destination; simultaneous voices
// capped (3 pad + 3 Shepard + 1 land grain + ≤4 chimes ≤ 11 < 12). Full
// teardown on stop(). No wall-clock; timing via ctx.currentTime only.

/** Just-intonation ratios over the drone root (a 7-limit-ish scale). */
const JI = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
const ROOT = 110; // A2 — deep, calm

const MASTER_MAX = 0.16;
const SHEPARD_OCTAVES = 3;
const MAX_CHIMES = 4;

export interface DroneState {
  lat: number; // −90..90
  onLand: boolean;
  phaseU: number; // orbital argument of latitude, radians
  velocityKmh: number;
}

interface Chime {
  carrier: OscillatorNode;
  mod: OscillatorNode;
  gain: GainNode;
  endsAt: number;
}

export class OrbitalDrone {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;

  private pad: { osc: OscillatorNode; gain: GainNode }[] = [];
  private padFilter: BiquadFilterNode;

  private shepard: { osc: OscillatorNode; gain: GainNode; ratio: number }[] = [];

  private land: { osc: OscillatorNode; gain: GainNode };

  private chimes: Chime[] = [];
  private running = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.28;
    this.comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.comp);

    // Pad: root, fifth, octave — pure sines through a shared lowpass.
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.6;
    this.padFilter.connect(this.master);

    for (const ratio of [1, 3 / 2, 2]) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = ROOT * ratio;
      const gain = this.ctx.createGain();
      gain.gain.value = ratio === 1 ? 0.5 : 0.28;
      osc.connect(gain).connect(this.padFilter);
      this.pad.push({ osc, gain });
    }

    // Shepard stack: same pitch class across octaves, windowed amplitude.
    for (let o = 0; o < SHEPARD_OCTAVES; o++) {
      const ratio = Math.pow(2, o) * (3 / 2); // fifth, stacked by octaves
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = ROOT * ratio;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      this.shepard.push({ osc, gain, ratio });
    }

    // Land grain: a quiet sawtooth that fades in over continents.
    {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = ROOT * 2;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.padFilter);
      this.land = { osc, gain };
    }
  }

  /** Resume + fade the master in. Web Audio needs the user gesture upstream. */
  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    for (const p of this.pad) p.osc.start();
    for (const s of this.shepard) s.osc.start();
    this.land.osc.start();
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(MASTER_MAX, now + 3);
    this.running = true;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Steer the timbre from the current sub-satellite state. Call ~every frame. */
  update(s: DroneState): void {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    const glide = 0.25;

    // Latitude → cutoff (equator open, poles veiled).
    const openness = 1 - Math.min(1, Math.abs(s.lat) / 90);
    const cutoff = 380 + openness * 1700;
    this.padFilter.frequency.setTargetAtTime(cutoff, now, glide);

    // Orbital phase → Shepard window (endless glide across octaves).
    const phase = ((s.phaseU / (Math.PI * 2)) % 1 + 1) % 1;
    for (let o = 0; o < this.shepard.length; o++) {
      const center = (phase + o / this.shepard.length) % 1;
      // Triangular window peaking mid-band → smooth cross-octave fade.
      const w = 1 - Math.abs(center - 0.5) * 2;
      this.shepard[o].gain.gain.setTargetAtTime(0.14 * w * w, now, glide);
    }

    // Land vs ocean → sawtooth grain crossfade.
    this.land.gain.gain.setTargetAtTime(s.onLand ? 0.06 : 0.0, now, 0.6);
  }

  /** Fire a short JI bell for a ground-station flyby. Voice-capped. */
  chime(stationLat: number): void {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    // Reap finished chimes.
    this.chimes = this.chimes.filter((c) => {
      if (c.endsAt <= now) {
        try {
          c.carrier.stop();
          c.mod.stop();
        } catch {
          // already stopped
        }
        return false;
      }
      return true;
    });
    if (this.chimes.length >= MAX_CHIMES) return;

    // Degree chosen by station latitude band (higher lat → higher degree).
    const idx = Math.min(
      JI.length - 1,
      Math.floor((Math.abs(stationLat) / 90) * JI.length),
    );
    const freq = ROOT * 2 * JI[idx];

    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;
    const mod = this.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.01; // inharmonic → bell
    const modGain = this.ctx.createGain();
    modGain.gain.value = freq * 1.4;
    mod.connect(modGain).connect(carrier.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
    carrier.connect(gain).connect(this.master);

    carrier.start(now);
    mod.start(now);
    carrier.stop(now + 2.8);
    mod.stop(now + 2.8);
    this.chimes.push({ carrier, mod, gain, endsAt: now + 2.9 });
  }

  /** Full teardown: fade, stop every node, close the context. */
  async stop(): Promise<void> {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    } catch {
      // ignore
    }
    const stopAll = () => {
      for (const p of this.pad) safeStop(p.osc);
      for (const s of this.shepard) safeStop(s.osc);
      safeStop(this.land.osc);
      for (const c of this.chimes) {
        safeStop(c.carrier);
        safeStop(c.mod);
      }
    };
    stopAll();
    this.running = false;
    try {
      await this.ctx.close();
    } catch {
      // already closed
    }
  }
}

function safeStop(osc: OscillatorNode): void {
  try {
    osc.stop();
  } catch {
    // not started or already stopped
  }
}
