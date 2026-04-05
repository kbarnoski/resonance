/**
 * Procedural Ambient Sound Engine
 *
 * Module-level singleton (same pattern as audio-engine.ts).
 * Creates layered ambient soundscapes using Web Audio API:
 *   - Wind: filtered white noise
 *   - Rain: granular synthesis (short noise bursts, random timing)
 *   - Drone: low oscillators with slow LFO modulation
 *   - Chime: high-frequency sine pings with reverb
 *   - Fire: crackle noise with bandpass filter
 *
 * Themes modify each layer's sonic character per-realm:
 *   - Underwater: deep rumble, bubble bursts, whale tones
 *   - Forest: leaf rustle, rain drops, bird-like chimes
 *   - Sacred: cathedral air, organ drone, deep bells
 *   - Machine: ventilation noise, electrical hum, digital blips
 *
 * Zero cost, zero latency, fully procedural.
 */

import type { AmbientLayers } from "@/lib/journeys/types";

// ─── Theme Configuration ───

interface WindTheme {
  lowpassBase: number;    // Base cutoff when intensity=0
  lowpassRange: number;   // Added to base at intensity=1
  highpassFreq: number;   // High-pass filter cutoff
  gainMult: number;       // Volume multiplier
}

interface RainTheme {
  bandpassFreq: number;   // Center frequency for drops
  bandpassQ: number;      // Resonance
  dropDurMin: number;     // Min drop duration (seconds)
  dropDurRange: number;   // Random range added to min
  gainMult: number;
}

interface DroneTheme {
  freq1: number;          // First oscillator frequency
  freq2: number;          // Second oscillator frequency
  lfoRate: number;        // LFO speed (Hz)
  gainMult: number;
}

interface ChimeTheme {
  notes: number[];        // Available note frequencies
  attackTime: number;     // Envelope attack time constant
  decayTime: number;      // Envelope decay time constant
  ringDuration: number;   // How long before stop (seconds)
  gainMult: number;
}

interface FireTheme {
  bpFreqBase: number;     // Bandpass center base
  bpFreqRange: number;    // Random range added
  bpQ: number;            // Resonance
  crackleDurMin: number;  // Min crackle duration
  crackleDurRange: number;
  gainMult: number;
}

interface AmbientTheme {
  wind: WindTheme;
  rain: RainTheme;
  drone: DroneTheme;
  chime: ChimeTheme;
  fire: FireTheme;
}

const DEFAULT_THEME: AmbientTheme = {
  wind: { lowpassBase: 200, lowpassRange: 600, highpassFreq: 80, gainMult: 0.35 },
  rain: { bandpassFreq: 6000, bandpassQ: 0.5, dropDurMin: 0.01, dropDurRange: 0.03, gainMult: 0.4 },
  drone: { freq1: 55, freq2: 82.41, lfoRate: 0.1, gainMult: 0.25 },
  chime: { notes: [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], attackTime: 0.01, decayTime: 0.8, ringDuration: 3, gainMult: 1.0 },
  fire: { bpFreqBase: 1000, bpFreqRange: 3000, bpQ: 2, crackleDurMin: 0.005, crackleDurRange: 0.02, gainMult: 0.2 },
};

/** Realm-specific ambient themes */
const AMBIENT_THEMES: Record<string, AmbientTheme> = {
  // Deep ocean / abyss — underwater sounds
  abyss: {
    wind: { lowpassBase: 120, lowpassRange: 250, highpassFreq: 30, gainMult: 0.4 },
    rain: { bandpassFreq: 8000, bandpassQ: 1.5, dropDurMin: 0.005, dropDurRange: 0.015, gainMult: 0.3 }, // bubbles
    drone: { freq1: 35, freq2: 52, lfoRate: 0.05, gainMult: 0.35 }, // deep submarine rumble
    chime: { notes: [196, 261.63, 329.63, 392, 440], attackTime: 0.05, decayTime: 2.0, ringDuration: 6, gainMult: 0.7 }, // whale-like
    fire: { bpFreqBase: 400, bpFreqRange: 800, bpQ: 3, crackleDurMin: 0.01, crackleDurRange: 0.04, gainMult: 0.1 }, // distant rumble
  },

  // Underwater temple
  ocean: {
    wind: { lowpassBase: 150, lowpassRange: 300, highpassFreq: 40, gainMult: 0.35 },
    rain: { bandpassFreq: 7000, bandpassQ: 1.2, dropDurMin: 0.008, dropDurRange: 0.02, gainMult: 0.35 },
    drone: { freq1: 41.2, freq2: 61.74, lfoRate: 0.06, gainMult: 0.3 },
    chime: { notes: [220, 293.66, 369.99, 440, 554.37], attackTime: 0.04, decayTime: 1.8, ringDuration: 5, gainMult: 0.8 },
    fire: { bpFreqBase: 500, bpFreqRange: 1000, bpQ: 2.5, crackleDurMin: 0.008, crackleDurRange: 0.03, gainMult: 0.12 },
  },

  // Forest / garden — organic, rustling
  forest: {
    wind: { lowpassBase: 400, lowpassRange: 800, highpassFreq: 120, gainMult: 0.3 }, // leaf rustle
    rain: { bandpassFreq: 4000, bandpassQ: 0.4, dropDurMin: 0.015, dropDurRange: 0.04, gainMult: 0.45 }, // natural rain
    drone: { freq1: 110, freq2: 146.83, lfoRate: 0.08, gainMult: 0.15 }, // warm hum
    chime: { notes: [1046.5, 1174.66, 1318.5, 1567.98, 2093], attackTime: 0.005, decayTime: 0.5, ringDuration: 2, gainMult: 0.6 }, // bird-like
    fire: { bpFreqBase: 200, bpFreqRange: 600, bpQ: 1.5, crackleDurMin: 0.01, crackleDurRange: 0.05, gainMult: 0.15 }, // crickets
  },

  // Sacred / cathedral — reverberant, majestic
  sacred: {
    wind: { lowpassBase: 250, lowpassRange: 400, highpassFreq: 60, gainMult: 0.25 }, // cathedral air
    rain: { bandpassFreq: 3000, bandpassQ: 0.3, dropDurMin: 0.02, dropDurRange: 0.05, gainMult: 0.2 }, // gentle drips
    drone: { freq1: 55, freq2: 82.41, lfoRate: 0.04, gainMult: 0.3 }, // organ-like
    chime: { notes: [261.63, 329.63, 392, 523.25, 659.25], attackTime: 0.02, decayTime: 1.5, ringDuration: 5, gainMult: 1.2 }, // deep bells
    fire: { bpFreqBase: 800, bpFreqRange: 1500, bpQ: 1, crackleDurMin: 0.008, crackleDurRange: 0.025, gainMult: 0.08 },
  },

  // Machine / circuit — industrial, digital
  machine: {
    wind: { lowpassBase: 600, lowpassRange: 1200, highpassFreq: 200, gainMult: 0.25 }, // ventilation
    rain: { bandpassFreq: 9000, bandpassQ: 2.0, dropDurMin: 0.003, dropDurRange: 0.008, gainMult: 0.25 }, // digital static
    drone: { freq1: 60, freq2: 120, lfoRate: 0.15, gainMult: 0.2 }, // electrical hum
    chime: { notes: [2093, 2637, 3135.96, 3951.07, 4186.01], attackTime: 0.003, decayTime: 0.3, ringDuration: 1.5, gainMult: 0.5 }, // digital blips
    fire: { bpFreqBase: 2000, bpFreqRange: 5000, bpQ: 3, crackleDurMin: 0.002, crackleDurRange: 0.01, gainMult: 0.15 }, // sparks
  },


  // Pain / melancholy — dark, heavy
  pain: {
    wind: { lowpassBase: 180, lowpassRange: 400, highpassFreq: 50, gainMult: 0.4 },
    rain: { bandpassFreq: 5000, bandpassQ: 0.6, dropDurMin: 0.012, dropDurRange: 0.035, gainMult: 0.5 }, // heavy rain
    drone: { freq1: 46.25, freq2: 69.3, lfoRate: 0.07, gainMult: 0.3 }, // mournful
    chime: { notes: [311.13, 415.3, 466.16, 622.25, 739.99], attackTime: 0.03, decayTime: 1.2, ringDuration: 4, gainMult: 0.5 }, // minor-key bells
    fire: { bpFreqBase: 800, bpFreqRange: 2000, bpQ: 1.8, crackleDurMin: 0.006, crackleDurRange: 0.02, gainMult: 0.18 },
  },

  // Heaven / celestial — bright, warm
  heaven: {
    wind: { lowpassBase: 300, lowpassRange: 700, highpassFreq: 100, gainMult: 0.3 },
    rain: { bandpassFreq: 7000, bandpassQ: 0.4, dropDurMin: 0.015, dropDurRange: 0.04, gainMult: 0.2 }, // gentle shimmer
    drone: { freq1: 65.41, freq2: 98, lfoRate: 0.06, gainMult: 0.2 },
    chime: { notes: [784, 987.77, 1174.66, 1567.98, 1975.53], attackTime: 0.01, decayTime: 1.0, ringDuration: 4, gainMult: 1.0 }, // celestial bells
    fire: { bpFreqBase: 1200, bpFreqRange: 2000, bpQ: 1, crackleDurMin: 0.005, crackleDurRange: 0.015, gainMult: 0.1 },
  },

  // Desert / ancient — dry, sparse
  desert: {
    wind: { lowpassBase: 500, lowpassRange: 1000, highpassFreq: 150, gainMult: 0.35 }, // sand wind
    rain: { bandpassFreq: 3500, bandpassQ: 1.0, dropDurMin: 0.008, dropDurRange: 0.02, gainMult: 0.15 }, // sand grains
    drone: { freq1: 73.42, freq2: 110, lfoRate: 0.04, gainMult: 0.2 },
    chime: { notes: [440, 554.37, 659.25, 880, 1108.73], attackTime: 0.02, decayTime: 0.6, ringDuration: 2.5, gainMult: 0.7 },
    fire: { bpFreqBase: 1500, bpFreqRange: 3000, bpQ: 2, crackleDurMin: 0.004, crackleDurRange: 0.012, gainMult: 0.2 }, // crackling heat
  },

  // Storm / electric — chaotic, powerful
  storm: {
    wind: { lowpassBase: 300, lowpassRange: 900, highpassFreq: 60, gainMult: 0.45 }, // howling
    rain: { bandpassFreq: 5500, bandpassQ: 0.4, dropDurMin: 0.01, dropDurRange: 0.03, gainMult: 0.55 }, // heavy rain
    drone: { freq1: 41.2, freq2: 55, lfoRate: 0.12, gainMult: 0.35 }, // thunder rumble
    chime: { notes: [659.25, 783.99, 987.77, 1318.5, 1567.98], attackTime: 0.005, decayTime: 0.4, ringDuration: 2, gainMult: 0.4 },
    fire: { bpFreqBase: 800, bpFreqRange: 4000, bpQ: 1.5, crackleDurMin: 0.003, crackleDurRange: 0.015, gainMult: 0.25 }, // lightning crackle
  },
};

/** Map realm IDs to theme keys */
const REALM_THEME_MAP: Record<string, string> = {
  // Underwater realms
  abyss: "abyss",
  ocean: "ocean",
  coral: "ocean",
  deep: "abyss",
  // Nature realms
  garden: "forest",
  forest: "forest",
  moss: "forest",
  mycelium: "forest",
  // Sacred realms
  cathedral: "sacred",
  temple: "sacred",
  monastery: "sacred",
  // Digital/industrial realms
  machine: "machine",
  circuit: "machine",
  neon: "machine",
  // Vast realms
  cosmos: "abyss",
  nebula: "abyss",
  stardust: "abyss",
  // Emotional realms
  pain: "pain",
  grief: "pain",
  sorrow: "pain",
  // Celestial realms
  heaven: "heaven",
  aurora: "heaven",
  dawn: "heaven",
  light: "heaven",
  // Dry/ancient realms
  desert: "desert",
  ruins: "desert",
  dust: "desert",
  bone: "desert",
  // Atmospheric realms
  storm: "storm",
  lightning: "storm",
  thunder: "storm",
};

function getThemeForRealm(realmId: string): AmbientTheme {
  const themeKey = REALM_THEME_MAP[realmId];
  if (themeKey && AMBIENT_THEMES[themeKey]) return AMBIENT_THEMES[themeKey];
  return DEFAULT_THEME;
}

// ─── Layer Interfaces ───

interface AmbientLayer {
  setIntensity(value: number): void;
  start(): void;
  stop(): void;
}

interface ThemedWindLayer extends AmbientLayer {
  applyTheme(theme: WindTheme): void;
}
interface ThemedRainLayer extends AmbientLayer {
  applyTheme(theme: RainTheme): void;
}
interface ThemedDroneLayer extends AmbientLayer {
  applyTheme(theme: DroneTheme): void;
}
interface ThemedChimeLayer extends AmbientLayer {
  applyTheme(theme: ChimeTheme): void;
}
interface ThemedFireLayer extends AmbientLayer {
  applyTheme(theme: FireTheme): void;
}

// ─── Wind Layer: filtered white noise ───

function createWindLayer(ctx: AudioContext, dest: AudioNode, theme: WindTheme): ThemedWindLayer {
  let running = false;
  let source: AudioBufferSourceNode | null = null;
  let currentTheme = { ...theme };

  const gain = ctx.createGain();
  gain.gain.value = 0;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = currentTheme.lowpassBase;
  lowpass.Q.value = 1.0;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = currentTheme.highpassFreq;

  lowpass.connect(highpass);
  highpass.connect(gain);
  gain.connect(dest);

  // Create noise buffer
  const bufferSize = ctx.sampleRate * 4;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  return {
    setIntensity(value: number) {
      gain.gain.setTargetAtTime(value * currentTheme.gainMult, ctx.currentTime, 2.0);
      lowpass.frequency.setTargetAtTime(
        currentTheme.lowpassBase + value * currentTheme.lowpassRange,
        ctx.currentTime, 1.5
      );
    },
    applyTheme(t: WindTheme) {
      currentTheme = { ...t };
      highpass.frequency.setTargetAtTime(t.highpassFreq, ctx.currentTime, 3.0);
    },
    start() {
      if (running) return;
      running = true;
      source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      source.connect(lowpass);
      source.start();
    },
    stop() {
      running = false;
      if (source) {
        try { source.stop(); } catch {}
        source = null;
      }
    },
  };
}

// ─── Rain Layer: granular noise bursts ───

function createRainLayer(ctx: AudioContext, dest: AudioNode, theme: RainTheme): ThemedRainLayer {
  let running = false;
  let intensity = 0;
  let intervalId: ReturnType<typeof setTimeout> | null = null;
  let currentTheme = { ...theme };

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(dest);

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = currentTheme.bandpassFreq;
  bandpass.Q.value = currentTheme.bandpassQ;
  bandpass.connect(gain);

  function droplet() {
    if (!running || intensity <= 0) return;
    const dur = currentTheme.dropDurMin + Math.random() * currentTheme.dropDurRange;
    const bufSize = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const dropGain = ctx.createGain();
    dropGain.gain.value = 0.03 + Math.random() * 0.04;
    src.connect(dropGain);
    dropGain.connect(bandpass);
    src.start();
  }

  function scheduleDrops() {
    if (!running) return;
    const count = Math.floor(intensity * 8) + 1;
    for (let i = 0; i < count; i++) {
      setTimeout(droplet, Math.random() * 200);
    }
    const nextDelay = 50 + (1 - intensity) * 200;
    intervalId = setTimeout(scheduleDrops, nextDelay);
  }

  return {
    setIntensity(value: number) {
      intensity = value;
      gain.gain.setTargetAtTime(value * currentTheme.gainMult, ctx.currentTime, 2.0);
    },
    applyTheme(t: RainTheme) {
      currentTheme = { ...t };
      bandpass.frequency.setTargetAtTime(t.bandpassFreq, ctx.currentTime, 3.0);
      bandpass.Q.setTargetAtTime(t.bandpassQ, ctx.currentTime, 3.0);
    },
    start() {
      if (running) return;
      running = true;
      scheduleDrops();
    },
    stop() {
      running = false;
      if (intervalId) {
        clearTimeout(intervalId);
        intervalId = null;
      }
    },
  };
}

// ─── Drone Layer: low oscillators with slow LFO ───

function createDroneLayer(ctx: AudioContext, dest: AudioNode, theme: DroneTheme): ThemedDroneLayer {
  let running = false;
  let currentTheme = { ...theme };

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(dest);

  let osc1: OscillatorNode | null = null;
  let osc2: OscillatorNode | null = null;
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;

  return {
    setIntensity(value: number) {
      gain.gain.setTargetAtTime(value * currentTheme.gainMult, ctx.currentTime, 2.5);
      if (lfoGain) {
        lfoGain.gain.setTargetAtTime(value * 3, ctx.currentTime, 2.0);
      }
    },
    applyTheme(t: DroneTheme) {
      currentTheme = { ...t };
      if (osc1) osc1.frequency.setTargetAtTime(t.freq1, ctx.currentTime, 4.0);
      if (osc2) osc2.frequency.setTargetAtTime(t.freq2, ctx.currentTime, 4.0);
      if (lfo) lfo.frequency.setTargetAtTime(t.lfoRate, ctx.currentTime, 3.0);
    },
    start() {
      if (running) return;
      running = true;

      osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = currentTheme.freq1;

      osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = currentTheme.freq2;

      lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = currentTheme.lfoRate;

      lfoGain = ctx.createGain();
      lfoGain.gain.value = 2;

      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      osc1.connect(gain);
      osc2.connect(gain);

      osc1.start();
      osc2.start();
      lfo.start();
    },
    stop() {
      running = false;
      [osc1, osc2, lfo].forEach((o) => {
        if (o) try { o.stop(); } catch {}
      });
      osc1 = osc2 = lfo = null;
      lfoGain = null;
    },
  };
}

// ─── Chime Layer: sine pings with reverb ───

function createChimeLayer(ctx: AudioContext, dest: AudioNode, theme: ChimeTheme): ThemedChimeLayer {
  let running = false;
  let intensity = 0;
  let intervalId: ReturnType<typeof setTimeout> | null = null;
  let currentTheme = { ...theme };

  const gain = ctx.createGain();
  gain.gain.value = 0;

  // Simple reverb via convolver
  const convolver = ctx.createConvolver();
  const reverbLen = ctx.sampleRate * 3;
  const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = reverbBuf.getChannelData(ch);
    for (let i = 0; i < reverbLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, 2.5) * 0.5;
    }
  }
  convolver.buffer = reverbBuf;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.3;
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.7;

  gain.connect(dryGain);
  gain.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(dest);
  wetGain.connect(dest);

  function chime() {
    if (!running || intensity <= 0) return;
    const notes = currentTheme.notes;
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setTargetAtTime(0.15 * intensity, ctx.currentTime, currentTheme.attackTime);
    env.gain.setTargetAtTime(0, ctx.currentTime + 0.1, currentTheme.decayTime);

    osc.connect(env);
    env.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + currentTheme.ringDuration);
  }

  function scheduleChimes() {
    if (!running) return;
    if (intensity > 0.05) chime();
    const nextDelay = 2000 + (1 - intensity) * 6000 + Math.random() * 3000;
    intervalId = setTimeout(scheduleChimes, nextDelay);
  }

  return {
    setIntensity(value: number) {
      intensity = value;
      gain.gain.setTargetAtTime(Math.min(value * currentTheme.gainMult, 1), ctx.currentTime, 1.0);
    },
    applyTheme(t: ChimeTheme) {
      currentTheme = { ...t };
    },
    start() {
      if (running) return;
      running = true;
      scheduleChimes();
    },
    stop() {
      running = false;
      if (intervalId) {
        clearTimeout(intervalId);
        intervalId = null;
      }
    },
  };
}

// ─── Fire Layer: crackle noise with bandpass ───

function createFireLayer(ctx: AudioContext, dest: AudioNode, theme: FireTheme): ThemedFireLayer {
  let running = false;
  let intensity = 0;
  let intervalId: ReturnType<typeof setTimeout> | null = null;
  let currentTheme = { ...theme };

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(dest);

  function crackle() {
    if (!running || intensity <= 0) return;
    const dur = currentTheme.crackleDurMin + Math.random() * currentTheme.crackleDurRange;
    const bufSize = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 0.5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = currentTheme.bpFreqBase + Math.random() * currentTheme.bpFreqRange;
    bp.Q.value = currentTheme.bpQ;

    const crackGain = ctx.createGain();
    crackGain.gain.value = currentTheme.gainMult * intensity;

    src.connect(bp);
    bp.connect(crackGain);
    crackGain.connect(gain);
    src.start();
  }

  function scheduleCrackles() {
    if (!running) return;
    const count = Math.floor(intensity * 5) + 1;
    for (let i = 0; i < count; i++) {
      setTimeout(crackle, Math.random() * 150);
    }
    const nextDelay = 30 + (1 - intensity) * 150;
    intervalId = setTimeout(scheduleCrackles, nextDelay);
  }

  return {
    setIntensity(value: number) {
      intensity = value;
      gain.gain.setTargetAtTime(Math.min(value, 1), ctx.currentTime, 1.5);
    },
    applyTheme(t: FireTheme) {
      currentTheme = { ...t };
    },
    start() {
      if (running) return;
      running = true;
      scheduleCrackles();
    },
    stop() {
      running = false;
      if (intervalId) {
        clearTimeout(intervalId);
        intervalId = null;
      }
    },
  };
}

// ─── Ambient Engine ───

interface ThemedLayers {
  wind: ThemedWindLayer;
  rain: ThemedRainLayer;
  drone: ThemedDroneLayer;
  chime: ThemedChimeLayer;
  fire: ThemedFireLayer;
}

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private layers: ThemedLayers | null = null;
  private running = false;
  private baseIntensities: AmbientLayers = { wind: 0, rain: 0, drone: 0, chime: 0, fire: 0 };
  private breathingTimer: ReturnType<typeof setInterval> | null = null;
  private currentTheme: AmbientTheme = DEFAULT_THEME;

  /** Initialize and start the ambient engine. Must be called after user gesture. */
  start(audioContext?: AudioContext): void {
    if (this.running) return;

    this.ctx = audioContext ?? new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.7;
    this.masterGain.connect(this.ctx.destination);
    this.running = true;

    const ctx = this.ctx;
    const dest = this.masterGain;
    const theme = this.currentTheme;

    // Start lightweight layers immediately
    const drone = createDroneLayer(ctx, dest, theme.drone);
    drone.start();

    const wind = createWindLayer(ctx, dest, theme.wind);
    wind.start();

    // Use temporary placeholders until deferred layers are ready
    const tempRain = { setIntensity() {}, start() {}, stop() {}, applyTheme() {} } as ThemedRainLayer;
    const tempChime = { setIntensity() {}, start() {}, stop() {}, applyTheme() {} } as ThemedChimeLayer;
    const tempFire = { setIntensity() {}, start() {}, stop() {}, applyTheme() {} } as ThemedFireLayer;

    this.layers = { wind, rain: tempRain, drone, chime: tempChime, fire: tempFire };

    // Defer heavier layers
    setTimeout(() => {
      if (!this.running) return;
      const rain = createRainLayer(ctx, dest, theme.rain);
      rain.start();
      if (this.layers) this.layers.rain = rain;
    }, 200);

    setTimeout(() => {
      if (!this.running) return;
      const chime = createChimeLayer(ctx, dest, theme.chime);
      chime.start();
      if (this.layers) this.layers.chime = chime;
    }, 400);

    setTimeout(() => {
      if (!this.running) return;
      const fire = createFireLayer(ctx, dest, theme.fire);
      fire.start();
      if (this.layers) this.layers.fire = fire;
    }, 600);

    this.startBreathing();
  }

  /** Stop all ambient layers */
  stop(): void {
    this.stopBreathing();
    if (!this.running || !this.layers) return;

    for (const layer of Object.values(this.layers)) {
      layer.stop();
    }

    this.layers = null;
    this.running = false;
  }

  /** Set the ambient theme based on realm ID or theme key. Smoothly transitions layer parameters. */
  setTheme(themeKey: string): void {
    // Accept both realm IDs (mapped via REALM_THEME_MAP) and direct theme keys (from JourneyTheme.ambientTheme)
    const directTheme = AMBIENT_THEMES[themeKey];
    this.currentTheme = directTheme ?? getThemeForRealm(themeKey);
    if (!this.layers) return;

    this.layers.wind.applyTheme(this.currentTheme.wind);
    this.layers.rain.applyTheme(this.currentTheme.rain);
    this.layers.drone.applyTheme(this.currentTheme.drone);
    this.layers.chime.applyTheme(this.currentTheme.chime);
    this.layers.fire.applyTheme(this.currentTheme.fire);
  }

  /** Update base layer intensities (breathing modulation applied on top) */
  setLayers(config: AmbientLayers): void {
    this.baseIntensities = { ...config };
    this.applyBreathing();
  }

  /** Apply breathing modulation — each layer undulates at its own slow rate */
  private applyBreathing(): void {
    if (!this.layers) return;
    const t = this.ctx ? this.ctx.currentTime : 0;

    // Each layer breathes at a different rate (seconds per cycle)
    // Multiplier swings between 0.7 and 1.3 — gentle undulation
    const breathe = (base: number, rate: number, offset: number): number => {
      if (base <= 0) return 0;
      const wave = Math.sin(t * (2 * Math.PI / rate) + offset);
      const mod = 0.7 + (wave + 1) * 0.3; // 0.7 to 1.3
      return Math.min(base * mod, 1);
    };

    this.layers.wind.setIntensity(breathe(this.baseIntensities.wind, 18, 0));
    this.layers.rain.setIntensity(breathe(this.baseIntensities.rain, 25, 1.2));
    this.layers.drone.setIntensity(breathe(this.baseIntensities.drone, 30, 2.5));
    this.layers.chime.setIntensity(breathe(this.baseIntensities.chime, 22, 3.8));
    this.layers.fire.setIntensity(breathe(this.baseIntensities.fire, 20, 5.1));
  }

  /** Start the breathing modulation loop */
  private startBreathing(): void {
    if (this.breathingTimer) return;
    this.breathingTimer = setInterval(() => this.applyBreathing(), 3000);
  }

  /** Stop the breathing modulation loop */
  private stopBreathing(): void {
    if (this.breathingTimer) {
      clearInterval(this.breathingTimer);
      this.breathingTimer = null;
    }
  }

  /** Set master volume (0-1) */
  setVolume(value: number): void {
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(value * 0.8, this.ctx.currentTime, 0.5);
  }

  /** Is the engine running? */
  isRunning(): boolean {
    return this.running;
  }
}

// Singleton
let instance: AmbientEngine | null = null;

export function getAmbientEngine(): AmbientEngine {
  if (!instance) {
    instance = new AmbientEngine();
  }
  return instance;
}
