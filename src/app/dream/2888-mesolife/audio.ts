// Web Audio engine for the living nematic.
//
// The field's global scalars drive a continuous inharmonic drone:
//   • mean flow speed  → master brightness + lowpass cutoff (overall drive)
//   • turbulence       → detune beating + a filtered-noise "roughness" bed
//   • defect birth/death → soft inharmonic bell pings, pitch a CONTINUOUS
//                          consequence of the event's location (never snapped
//                          to any musical scale)
//
// Master gain ≤ 0.15 through a compressor. Audio only starts after a user
// gesture (resume() from the Start button). Deterministic: the noise bed is
// filled from mulberry32(0x2888); no Math.random / Date.now anywhere.

import { mulberry32, SEED, type FieldScalars, type DefectEvent } from "./sim";

// Five to eight inharmonic partials (stretched, non-integer ratios).
const PARTIALS = [1.0, 2.13, 3.41, 4.09, 5.63, 6.87, 8.21];
const BASE_HZ = 68;

export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private lowpass: BiquadFilterNode;
  private droneGain: GainNode;
  private oscs: OscillatorNode[] = [];
  private oscGains: GainNode[] = [];
  private noiseSrc: AudioBufferSourceNode;
  private noiseBand: BiquadFilterNode;
  private noiseGain: GainNode;
  private started = false;

  constructor() {
    type Ctor = typeof AudioContext;
    const w = window as unknown as { webkitAudioContext?: Ctor };
    const Ctx: Ctor = window.AudioContext ?? (w.webkitAudioContext as Ctor);
    this.ctx = new Ctx();
    const ctx = this.ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0; // faded up on start; hard cap 0.15
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 500;
    this.lowpass.Q.value = 0.7;
    this.lowpass.connect(this.master);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.6;
    this.droneGain.connect(this.lowpass);

    for (let i = 0; i < PARTIALS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : i % 2 === 0 ? "triangle" : "sine";
      osc.frequency.value = BASE_HZ * PARTIALS[i];
      const g = ctx.createGain();
      g.gain.value = 0.5 / (i + 1);
      osc.connect(g);
      g.connect(this.droneGain);
      this.oscs.push(osc);
      this.oscGains.push(g);
    }

    // Deterministic filtered-noise roughness bed.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    const rng = mulberry32(SEED ^ 0x9e37);
    for (let i = 0; i < len; i++) ch[i] = rng() * 2 - 1;
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = buf;
    this.noiseSrc.loop = true;
    this.noiseBand = ctx.createBiquadFilter();
    this.noiseBand.type = "bandpass";
    this.noiseBand.frequency.value = 320;
    this.noiseBand.Q.value = 0.8;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.0;
    this.noiseSrc.connect(this.noiseBand);
    this.noiseBand.connect(this.noiseGain);
    this.noiseGain.connect(this.master);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    for (const o of this.oscs) o.start();
    this.noiseSrc.start();
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0, now);
    this.master.gain.linearRampToValueAtTime(0.12, now + 2.0);
  }

  // Called each animation frame with the latest field scalars.
  update(s: FieldScalars): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;

    // Normalize the raw scalars into musical ranges.
    const drive = clamp(s.speed * 26, 0, 1);
    const rough = clamp(s.turbulence * 60, 0, 1);

    // Brightness: lowpass opens with flow speed.
    const cutoff = 320 + drive * 3200 + rough * 900;
    this.lowpass.frequency.setTargetAtTime(cutoff, now, 0.15);

    // Master swells slightly with drive but stays under the 0.15 cap.
    const target = Math.min(0.15, 0.07 + drive * 0.07);
    this.master.gain.setTargetAtTime(target, now, 0.3);

    // Roughness: partial detune beating + noise bed level.
    for (let i = 0; i < this.oscs.length; i++) {
      const detune = rough * (8 + i * 6) * (i % 2 === 0 ? 1 : -1);
      this.oscs[i].detune.setTargetAtTime(detune, now, 0.2);
    }
    this.noiseGain.gain.setTargetAtTime(rough * 0.05, now, 0.25);
    this.noiseBand.frequency.setTargetAtTime(240 + drive * 1400, now, 0.25);

    // Defect events → bell pings (cap per frame to avoid clatter).
    let pinged = 0;
    for (const ev of s.events) {
      if (pinged >= 3) break;
      this.ping(ev);
      pinged++;
    }
  }

  // A short inharmonic bell whose pitch is a continuous function of location.
  private ping(ev: DefectEvent): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Continuous mapping: vertical position → log-frequency glide across ~2.5
    // octaves; horizontal → a small inharmonic partner. NOT quantized.
    const f0 = 180 * Math.pow(2, (1 - ev.y) * 2.5 + ev.x * 0.4);
    const ratios = ev.birth ? [1.0, 2.76, 5.4] : [1.0, 1.98, 3.34];
    const bellGain = ctx.createGain();
    const amp = ev.birth ? 0.05 : 0.035;
    bellGain.gain.setValueAtTime(0.0001, now);
    bellGain.gain.exponentialRampToValueAtTime(amp, now + 0.008);
    bellGain.gain.exponentialRampToValueAtTime(0.0004, now + 1.1);
    bellGain.connect(this.master);
    for (let i = 0; i < ratios.length; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f0 * ratios[i];
      const g = ctx.createGain();
      g.gain.value = 0.6 / (i + 1);
      o.connect(g);
      g.connect(bellGain);
      o.start(now);
      o.stop(now + 1.2);
    }
    window.setTimeout(() => bellGain.disconnect(), 1400);
  }

  async close(): Promise<void> {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.1);
      for (const o of this.oscs) {
        try {
          o.stop(now + 0.3);
        } catch {
          /* already stopped */
        }
      }
      try {
        this.noiseSrc.stop(now + 0.3);
      } catch {
        /* already stopped */
      }
      await this.ctx.close();
    } catch {
      /* context already closed */
    }
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
