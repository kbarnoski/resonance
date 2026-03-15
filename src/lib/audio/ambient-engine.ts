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
 * Zero cost, zero latency, fully procedural.
 */

import type { AmbientLayers } from "@/lib/journeys/types";

interface AmbientLayer {
  setIntensity(value: number): void;
  start(): void;
  stop(): void;
}

// --- Wind Layer: filtered white noise ---
function createWindLayer(ctx: AudioContext, dest: AudioNode): AmbientLayer {
  let running = false;
  let source: AudioBufferSourceNode | null = null;
  const gain = ctx.createGain();
  gain.gain.value = 0;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 400;
  lowpass.Q.value = 1.0;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 80;

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
      gain.gain.setTargetAtTime(value * 0.12, ctx.currentTime, 2.0);
      lowpass.frequency.setTargetAtTime(200 + value * 600, ctx.currentTime, 1.5);
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

// --- Rain Layer: granular noise bursts ---
function createRainLayer(ctx: AudioContext, dest: AudioNode): AmbientLayer {
  let running = false;
  let intensity = 0;
  let intervalId: ReturnType<typeof setTimeout> | null = null;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(dest);

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 6000;
  bandpass.Q.value = 0.5;
  bandpass.connect(gain);

  function droplet() {
    if (!running || intensity <= 0) return;
    const dur = 0.01 + Math.random() * 0.03;
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
      gain.gain.setTargetAtTime(value * 0.15, ctx.currentTime, 2.0);
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

// --- Drone Layer: low oscillators with slow LFO ---
function createDroneLayer(ctx: AudioContext, dest: AudioNode): AmbientLayer {
  let running = false;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(dest);

  let osc1: OscillatorNode | null = null;
  let osc2: OscillatorNode | null = null;
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;

  return {
    setIntensity(value: number) {
      gain.gain.setTargetAtTime(value * 0.08, ctx.currentTime, 2.5);
      if (lfoGain) {
        lfoGain.gain.setTargetAtTime(value * 3, ctx.currentTime, 2.0);
      }
    },
    start() {
      if (running) return;
      running = true;

      osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 55; // A1

      osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = 82.41; // E2

      lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.1; // Very slow modulation

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

// --- Chime Layer: high-frequency sine pings ---
function createChimeLayer(ctx: AudioContext, dest: AudioNode): AmbientLayer {
  let running = false;
  let intensity = 0;
  let intervalId: ReturnType<typeof setTimeout> | null = null;
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

  const NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]; // C5-G6

  function chime() {
    if (!running || intensity <= 0) return;
    const freq = NOTES[Math.floor(Math.random() * NOTES.length)];
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setTargetAtTime(0.06 * intensity, ctx.currentTime, 0.01);
    env.gain.setTargetAtTime(0, ctx.currentTime + 0.1, 0.8);

    osc.connect(env);
    env.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 3);
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
      gain.gain.setTargetAtTime(Math.min(value, 1), ctx.currentTime, 1.0);
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

// --- Fire Layer: crackle noise with bandpass ---
function createFireLayer(ctx: AudioContext, dest: AudioNode): AmbientLayer {
  let running = false;
  let intensity = 0;
  let intervalId: ReturnType<typeof setTimeout> | null = null;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(dest);

  function crackle() {
    if (!running || intensity <= 0) return;
    const dur = 0.005 + Math.random() * 0.02;
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
    bp.frequency.value = 1000 + Math.random() * 3000;
    bp.Q.value = 2;

    const crackGain = ctx.createGain();
    crackGain.gain.value = 0.08 * intensity;

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

// --- Ambient Engine ---
class AmbientEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private layers: { wind: AmbientLayer; rain: AmbientLayer; drone: AmbientLayer; chime: AmbientLayer; fire: AmbientLayer } | null = null;
  private running = false;

  /** Initialize and start the ambient engine. Must be called after user gesture. */
  start(audioContext?: AudioContext): void {
    if (this.running) return;

    this.ctx = audioContext ?? new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;
    this.masterGain.connect(this.ctx.destination);
    this.running = true;

    // Stagger layer creation to avoid blocking the main thread
    const ctx = this.ctx;
    const dest = this.masterGain;

    // Start lightweight layers immediately
    const drone = createDroneLayer(ctx, dest);
    drone.start();

    const wind = createWindLayer(ctx, dest);
    wind.start();

    this.layers = { wind, rain: wind, drone, chime: drone, fire: wind }; // temp placeholders

    // Defer heavier layers (rain, chime, fire create buffers per event)
    setTimeout(() => {
      if (!this.running) return;
      const rain = createRainLayer(ctx, dest);
      rain.start();
      if (this.layers) this.layers.rain = rain;
    }, 200);

    setTimeout(() => {
      if (!this.running) return;
      const chime = createChimeLayer(ctx, dest);
      chime.start();
      if (this.layers) this.layers.chime = chime;
    }, 400);

    setTimeout(() => {
      if (!this.running) return;
      const fire = createFireLayer(ctx, dest);
      fire.start();
      if (this.layers) this.layers.fire = fire;
    }, 600);
  }

  /** Stop all ambient layers */
  stop(): void {
    if (!this.running || !this.layers) return;

    for (const layer of Object.values(this.layers)) {
      layer.stop();
    }

    this.layers = null;
    this.running = false;
    // Don't close AudioContext — it may be shared
  }

  /** Update layer intensities (smooth crossfade handled internally) */
  setLayers(config: AmbientLayers): void {
    if (!this.layers) return;
    this.layers.wind.setIntensity(config.wind);
    this.layers.rain.setIntensity(config.rain);
    this.layers.drone.setIntensity(config.drone);
    this.layers.chime.setIntensity(config.chime);
    this.layers.fire.setIntensity(config.fire);
  }

  /** Set master volume (0-1) */
  setVolume(value: number): void {
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(value * 0.6, this.ctx.currentTime, 0.5);
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
