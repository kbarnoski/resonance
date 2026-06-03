// band.ts — the four "sky-friends" generative ensemble (Web Audio API).
// All synthesized, no audio files. C major pentatonic (no wrong notes ever).
// Everything passes through a master DynamicsCompressor limiter so the sounds
// stay safe: no sudden loud transients, no harsh highs. The loop is scheduled
// with audioCtx.currentTime look-ahead and is NEVER silent once started.

import type { Weather } from "./weather";

// C major pentatonic (C D E G A) across several octaves, in Hz.
const PENTA = [
  130.81, 146.83, 164.81, 196.0, 220.0, // C3 D3 E3 G3 A3
  261.63, 293.66, 329.63, 392.0, 440.0, // C4 D4 E4 G4 A4
  523.25, 587.33, 659.25, 783.99, 880.0, // C5 D5 E5 G5 A5
];

export type FriendId = "sun" | "cloud" | "wind" | "rain";

// Smoothed control values the scheduler reads each tick.
interface Controls {
  warmth: number; // 0..1 from temperature
  isDay: number; // 0..1
  cloud: number; // 0..1
  wind: number; // 0..1
  rain: number; // 0..1
  tempo: number; // seconds per pulse (lower = faster)
}

function controlsFrom(w: Weather): Controls {
  const warmth = clamp((w.temperature + 20) / 65, 0, 1);
  const cloud = clamp(w.cloudCover / 100, 0, 1);
  const wind = clamp(w.windSpeed / 60, 0, 1);
  const rain = clamp(w.precipitation / 5, 0, 1);
  // Warmer days breathe a little faster; everything stays lullaby-slow.
  const tempo = lerp(1.9, 1.05, warmth);
  return { warmth, isDay: w.isDay ? 1 : 0, cloud, wind, rain, tempo };
}

export interface BandHandle {
  /** Push a new weather snapshot; controls glide toward it. */
  setWeather: (w: Weather) => void;
  /** Bonus: briefly solo/boost a sky-friend (e.g. on tap). */
  poke: (id: FriendId) => void;
  /** Begin the ~12-minute gentle lullaby fade-out. */
  fadeOut: () => void;
  /** Stop everything and release nodes. */
  dispose: () => void;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function pick<T>(arr: T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length];
}

// Shared noise buffer for wind + rain texture.
function makeNoise(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function startBand(ctx: AudioContext, initial: Weather): BandHandle {
  // ── master chain: bus → gentle lowpass → limiter → out ──────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const softTop = ctx.createBiquadFilter();
  softTop.type = "lowpass";
  softTop.frequency.value = 9000; // tame any harsh highs
  softTop.Q.value = 0.4;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;

  master.connect(softTop);
  softTop.connect(limiter);
  limiter.connect(ctx.destination);

  // Per-friend gain buses (for poke solos).
  const bus: Record<FriendId, GainNode> = {
    sun: ctx.createGain(),
    cloud: ctx.createGain(),
    wind: ctx.createGain(),
    rain: ctx.createGain(),
  };
  (Object.keys(bus) as FriendId[]).forEach((k) => {
    bus[k].gain.value = 1;
    bus[k].connect(master);
  });

  let controls = controlsFrom(initial);
  const smoothed: Controls = { ...controls };

  // Gentle fade in.
  const now = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.9, now + 4);

  // ── Cloud: a soft sine pad, level + lowpass from cloud_cover ─────────────
  const padOscA = ctx.createOscillator();
  const padOscB = ctx.createOscillator();
  padOscA.type = "sine";
  padOscB.type = "sine";
  padOscA.frequency.value = PENTA[0]; // C3
  padOscB.frequency.value = PENTA[3]; // G3 → open fifth
  padOscB.detune.value = 4;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 600;
  padFilter.Q.value = 0.6;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0001;
  padOscA.connect(padFilter);
  padOscB.connect(padFilter);
  padFilter.connect(padGain);
  padGain.connect(bus.cloud);
  padOscA.start();
  padOscB.start();

  // ── Wind: filtered noise whoosh on a slow LFO ────────────────────────────
  const noiseBuf = makeNoise(ctx);
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = noiseBuf;
  windSrc.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = "bandpass";
  windFilter.frequency.value = 520;
  windFilter.Q.value = 0.8;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.0001;
  // Slow LFO modulating wind amplitude for a breathing whoosh.
  const windLfo = ctx.createOscillator();
  windLfo.type = "sine";
  windLfo.frequency.value = 0.12;
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.value = 0.05;
  windLfo.connect(windLfoGain);
  windLfoGain.connect(windGain.gain);
  windSrc.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(bus.wind);
  windSrc.start();
  windLfo.start();

  // ── Sun: warm bell (triangle + soft 2nd partial) one-shot ────────────────
  const playBell = (freq: number, when: number, vel: number) => {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "triangle";
    o2.type = "sine";
    o1.frequency.value = freq;
    o2.frequency.value = freq * 2; // soft 2nd partial
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.28;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = lerp(1400, 3600, smoothed.warmth * smoothed.isDay);
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(tone);
    tone.connect(bus.sun);
    const peak = clamp(vel, 0.02, 0.5);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.6);
    o1.start(when);
    o2.start(when);
    o1.stop(when + 2.8);
    o2.stop(when + 2.8);
  };

  // ── Rain: gentle pentatonic droplet plink one-shot ───────────────────────
  const playDrop = (freq: number, when: number, vel: number) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 1.5, when);
    o.frequency.exponentialRampToValueAtTime(freq, when + 0.04);
    const g = ctx.createGain();
    const peak = clamp(vel, 0.02, 0.22);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    o.connect(g);
    g.connect(bus.rain);
    o.start(when);
    o.stop(when + 0.55);
  };

  // ── look-ahead scheduler ─────────────────────────────────────────────────
  let step = 0;
  let nextBell = ctx.currentTime + 0.4;
  let nextDrop = ctx.currentTime + 0.8;
  const LOOKAHEAD = 0.2; // schedule this far ahead each tick

  const smoothControls = () => {
    const k = 0.08;
    smoothed.warmth += (controls.warmth - smoothed.warmth) * k;
    smoothed.isDay += (controls.isDay - smoothed.isDay) * k;
    smoothed.cloud += (controls.cloud - smoothed.cloud) * k;
    smoothed.wind += (controls.wind - smoothed.wind) * k;
    smoothed.rain += (controls.rain - smoothed.rain) * k;
    smoothed.tempo += (controls.tempo - smoothed.tempo) * k;
  };

  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    smoothControls();
    const t = ctx.currentTime;
    const horizon = t + LOOKAHEAD;

    // Cloud pad: thicker + darker with more cloud cover.
    const padLevel = lerp(0.04, 0.5, smoothed.cloud);
    const padCut = lerp(1100, 360, smoothed.cloud); // more cloud = darker
    padGain.gain.setTargetAtTime(padLevel, t, 0.5);
    padFilter.frequency.setTargetAtTime(padCut, t, 0.5);

    // Wind whoosh amplitude + brightness from wind speed.
    const windLevel = lerp(0.015, 0.34, smoothed.wind);
    windGain.gain.setTargetAtTime(windLevel, t, 0.5);
    windFilter.frequency.setTargetAtTime(lerp(380, 1400, smoothed.wind), t, 0.5);
    windLfo.frequency.setTargetAtTime(lerp(0.08, 0.5, smoothed.wind), t, 1.0);

    // Sun bell: register & brightness from temperature + is_day.
    while (nextBell < horizon) {
      // higher octave by day/warmth; lower & softer at night.
      const base = Math.round(lerp(0, 5, smoothed.warmth));
      const octave = smoothed.isDay > 0.5 ? base + 5 : base;
      const idx = octave + pick([0, 2, 4, 3, 0, 4], step);
      const vel = lerp(0.06, 0.34, smoothed.warmth) * (0.5 + 0.5 * smoothed.isDay);
      playBell(pick(PENTA, idx), nextBell, vel);
      // tempo nudged by temperature; sun rings on a relaxed pulse.
      nextBell += smoothed.tempo * (1 + (step % 3 === 0 ? 0.5 : 0));
      step++;
    }

    // Rain drops: density from precipitation, but never fully dead.
    while (nextDrop < horizon) {
      const dropVel = lerp(0.05, 0.2, smoothed.rain);
      const idx = 5 + Math.floor(Math.random() * 8);
      playDrop(pick(PENTA, idx), nextDrop, dropVel);
      // 0 rain → sparse occasional plinks (~ every 3.5s); heavy rain → fast.
      const gap = lerp(3.5, 0.16, smoothed.rain);
      nextDrop += gap * (0.7 + Math.random() * 0.6);
    }
  };

  timer = setInterval(tick, 50);
  tick();

  // ── poke (bonus solo/boost) ──────────────────────────────────────────────
  const poke = (id: FriendId) => {
    const g = bus[id].gain;
    const tt = ctx.currentTime;
    g.cancelScheduledValues(tt);
    g.setValueAtTime(g.value, tt);
    g.linearRampToValueAtTime(2.2, tt + 0.08);
    g.linearRampToValueAtTime(1.0, tt + 1.6);
    if (id === "sun") playBell(pick(PENTA, 10), tt + 0.02, 0.34);
    if (id === "rain") playDrop(pick(PENTA, 12), tt + 0.02, 0.2);
  };

  // ── 12-minute gentle lullaby fade ────────────────────────────────────────
  const fadeOut = () => {
    const tt = ctx.currentTime;
    master.gain.cancelScheduledValues(tt);
    master.gain.setValueAtTime(master.gain.value, tt);
    master.gain.exponentialRampToValueAtTime(0.0001, tt + 12 * 60);
  };

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer) clearInterval(timer);
    const tt = ctx.currentTime;
    master.gain.cancelScheduledValues(tt);
    master.gain.setValueAtTime(master.gain.value, tt);
    master.gain.exponentialRampToValueAtTime(0.0001, tt + 0.6);
    setTimeout(() => {
      try {
        padOscA.stop();
        padOscB.stop();
        windSrc.stop();
        windLfo.stop();
      } catch {
        /* already stopped */
      }
    }, 800);
  };

  return {
    setWeather: (w: Weather) => {
      controls = controlsFrom(w);
    },
    poke,
    fadeOut,
    dispose,
  };
}
