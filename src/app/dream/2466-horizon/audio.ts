// ─────────────────────────────────────────────────────────────────────────────
// 2466 · HORIZON — sound core (Web Audio, just intonation, after Kepler)
//
// One sustained oscillator voice per body → GainNode → StereoPannerNode →
// master lowpass → destination. A calm, warm drone; no percussion.
//
//   Pitch  = f(orbital period). Kepler's Harmonices Mundi (1619) mapped
//            planetary periods to musical intervals. We log-map each body's
//            REAL sidereal period, then SNAP it to a just-intonation grid
//            (ratios 1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8 over a ~55 Hz root,
//            spanning a couple of octaves). Faster body = higher voice.
//            Pitch is period-fixed: it never changes as time scrubs, so the
//            chord stays legible.
//   Loudness = f(altitude). Below the horizon → silent (you can't see it).
//              Smoothstep over −10°→+30°.
//   Pan      = f(azimuth). East → right, West → left, South → centre.
// ─────────────────────────────────────────────────────────────────────────────

import { SIDEREAL_PERIODS } from "./astro";

// Just-intonation ratios within one octave.
const JI_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const ROOT_HZ = 55; // A1
const OCTAVES = 4; // 55 → ~880 Hz

// Build the full sorted JI frequency grid across the octave span.
function buildGrid(): number[] {
  const grid: number[] = [];
  for (let o = 0; o < OCTAVES; o++) {
    for (const r of JI_RATIOS) {
      grid.push(ROOT_HZ * r * Math.pow(2, o));
    }
  }
  return grid.sort((a, b) => a - b);
}

const GRID = buildGrid();

// Map every body's real sidereal period to a fixed JI pitch.
// Faster (smaller period) → higher in the grid.
export function computeVoicePitches(names: string[]): Record<string, number> {
  const periods = names.map((n) => SIDEREAL_PERIODS[n] ?? 365.256);
  const logs = periods.map((p) => Math.log(p));
  const minL = Math.min(...logs);
  const maxL = Math.max(...logs);
  const span = maxL - minL || 1;
  const out: Record<string, number> = {};
  names.forEach((n, i) => {
    const t = (logs[i] - minL) / span; // 0 = fastest, 1 = slowest
    const idx = Math.round((1 - t) * (GRID.length - 1));
    out[n] = GRID[idx];
  });
  return out;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface Voice {
  osc: OscillatorNode;
  osc2: OscillatorNode; // gently detuned partner for warmth
  gain: GainNode;
  panner: StereoPannerNode;
  freq: number;
}

export interface VoiceParam {
  name: string;
  altitude: number;
  azimuth: number;
}

const PER_VOICE_LEVEL = 0.11; // headroom for up to 7 simultaneous voices

export class SkyAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private voices = new Map<string, Voice>();

  constructor(names: string[]) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 1400;
    this.lowpass.Q.value = 0.4;

    this.lowpass.connect(this.master);
    this.master.connect(this.ctx.destination);

    const pitches = computeVoicePitches(names);
    const now = this.ctx.currentTime;
    for (const name of names) {
      const freq = pitches[name];
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const osc2 = this.ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.value = freq;
      osc2.detune.value = 5; // subtle beating

      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      const panner = this.ctx.createStereoPanner();

      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(panner);
      panner.connect(this.lowpass);
      osc.start(now);
      osc2.start(now);

      this.voices.set(name, { osc, osc2, gain, panner, freq });
    }
    // Fade master up gently.
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.9, now + 2.5);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  // Push live altitude/azimuth for each body into gain + pan.
  update(params: VoiceParam[]): void {
    const now = this.ctx.currentTime;
    for (const p of params) {
      const v = this.voices.get(p.name);
      if (!v) continue;
      // Below the horizon → silent; high in the sky → full.
      const vis = smoothstep(-10, 30, p.altitude);
      const target = Math.max(0.0001, vis * PER_VOICE_LEVEL);
      v.gain.gain.setTargetAtTime(target, now, 0.25);
      // East (90°) → +1 right, West (270°) → −1 left, South/North → centre.
      const pan = Math.max(-1, Math.min(1, Math.sin((p.azimuth * Math.PI) / 180)));
      v.panner.pan.setTargetAtTime(pan, now, 0.25);
    }
  }

  dispose(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.3);
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      this.voices.forEach((v) => {
        try {
          v.osc.stop();
          v.osc2.stop();
        } catch {
          // already stopped
        }
      });
      void this.ctx.close();
    }, 600);
  }
}
