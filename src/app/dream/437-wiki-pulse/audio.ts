/**
 * audio.ts — Wiki-Pulse sonification engine.
 *
 * Maps Wikimedia recentchange fields to distinct, clinical audio gestures:
 *
 *   bot=false, namespace=0 ("human main article edit")
 *     → warm marimba-style pluck: triangle osc + short tuned tap + up/down glide
 *     → addition (delta>0): brief upward pitch glide (Hatnote bell homage)
 *     → removal (delta<0): downward pitch fall + softer timbre (Hatnote strings homage)
 *
 *   bot=true
 *     → dry click/tick: short filtered noise burst, no tuning, colder
 *     → obviously mechanical — clearly distinguishable from human plucks
 *
 *   type="new" (new page) → accent: a short two-oscillator chord stab
 *   type="log"            → low soft thud (background bureaucracy)
 *   type="categorize"     → very quiet high tick
 *
 * Magnitude of |byteDelta|:
 *   small  (<200 bytes) → high register, quiet
 *   medium (200–2000)   → mid register
 *   large  (>2000)      → low register, louder
 *
 * Voice cap: max MAX_VOICES concurrent. Overflow events are silently dropped.
 *
 * Master chain: voices → DynamicsCompressor (limiter) → MasterGain → destination
 * iOS-safe: AudioContext is created here but must be constructed INSIDE a user gesture.
 */

import type { RecentChangeEvent } from "./stream";

export interface WikiAudioEngine {
  /** Fire a sound for one recentchange event. */
  spawnSound: (evt: RecentChangeEvent) => void;
  /** Release all nodes and close the context. */
  dispose: () => void;
}

// Byte-delta → register parameters
interface RegisterParams {
  freqBase: number;  // Hz — base frequency
  gainMult: number;  // amplitude multiplier [0,1]
  dur: number;       // envelope duration (seconds)
}

function getRegister(absDelta: number): RegisterParams {
  if (absDelta < 200) {
    // Small edit → high+quiet
    return { freqBase: 1400 + Math.random() * 800, gainMult: 0.22, dur: 0.18 };
  } else if (absDelta < 2000) {
    // Medium
    return { freqBase: 600 + Math.random() * 500, gainMult: 0.42, dur: 0.28 };
  } else {
    // Large → low+louder
    const scale = Math.min(1, absDelta / 8000);
    return { freqBase: 120 + Math.random() * 300, gainMult: 0.55 + scale * 0.2, dur: 0.5 };
  }
}

// Equal-temperament pitch quantisation to a pentatonic-ish but deliberately
// "off" set — avoids the warm-drone problem without being fully atonal.
// Intervals chosen to sound like data, not music.
const PLUCK_SEMITONES = [0, 2, 5, 7, 10, 14, 17, 19, 24]; // minor pentatonic + upper octave extensions
const A4 = 440;

function semitoneToHz(semi: number): number {
  return A4 * Math.pow(2, (semi - 9) / 12);
}

function pickPluckFreq(freqBase: number): number {
  // Find nearest semitone in the set (within 2 octaves above 110 Hz)
  const baseNote = 12 * Math.log2(freqBase / A4) + 9; // semitones relative to A4
  const octave = Math.floor(baseNote / 12);
  const degree = PLUCK_SEMITONES[Math.floor(Math.random() * PLUCK_SEMITONES.length)];
  return semitoneToHz(octave * 12 + degree + 9);
}

const MAX_VOICES = 8;

export function buildAudioEngine(): WikiAudioEngine {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  // ── Master chain ────────────────────────────────────────────────────────
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.6;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 4;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;

  masterGain.connect(limiter);
  limiter.connect(ctx.destination);

  // ── Sub-hum: barely audible steady-state presence (not musical) ─────────
  const humOsc = ctx.createOscillator();
  const humGain = ctx.createGain();
  humOsc.type = "sine";
  humOsc.frequency.value = 41.3; // sub-bass, not a note
  humGain.gain.value = 0.012;
  humOsc.connect(humGain);
  humGain.connect(masterGain);
  humOsc.start();

  // ── Voice counter ────────────────────────────────────────────────────────
  let activeVoices = 0;

  function withVoice(fn: () => void) {
    if (activeVoices >= MAX_VOICES) return;
    activeVoices++;
    fn();
  }

  function releaseVoice() {
    activeVoices = Math.max(0, activeVoices - 1);
  }

  // ── White noise buffer for bot clicks ───────────────────────────────────
  const clickBuf = (() => {
    const len = Math.ceil(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
    return buf;
  })();

  // ── Sonify functions ─────────────────────────────────────────────────────

  /** Human main-article edit: warm marimba/pluck with up/down glide */
  function spawnHumanPluck(delta: number, absDelta: number): void {
    withVoice(() => {
      const t = ctx.currentTime;
      const reg = getRegister(absDelta);
      const freq = pickPluckFreq(reg.freqBase);
      const isAddition = delta >= 0;
      const pan = (Math.random() - 0.5) * 0.7;

      // Primary oscillator: triangle (warm)
      const osc1 = ctx.createOscillator();
      osc1.type = "triangle";
      // Glide: up for addition, down for removal (Hatnote homage)
      const glideRatio = isAddition ? 1.18 : 0.74;
      osc1.frequency.setValueAtTime(freq, t);
      osc1.frequency.exponentialRampToValueAtTime(
        Math.max(40, freq * glideRatio),
        t + reg.dur * 0.6
      );

      // Second partial (inharmonic to avoid consonance)
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = freq * 2.756; // Clearly inharmonic (not 2x, 3x, etc.)

      const env = ctx.createGain();
      const peakGain = reg.gainMult * (isAddition ? 0.55 : 0.38);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peakGain, t + 0.007);
      env.gain.exponentialRampToValueAtTime(0.0001, t + reg.dur);

      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      // Low-pass: keeps it warm, removes harsh aliases
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = freq * 4;
      lp.Q.value = 0.8;

      osc1.connect(lp);
      osc2.connect(env);
      lp.connect(env);
      env.connect(panner);
      panner.connect(masterGain);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + reg.dur + 0.05);
      osc2.stop(t + reg.dur + 0.05);

      setTimeout(releaseVoice, (reg.dur + 0.1) * 1000);
    });
  }

  /** Bot edit: dry, cold click — clearly mechanical */
  function spawnBotClick(absDelta: number): void {
    withVoice(() => {
      const t = ctx.currentTime;
      // Louder for bigger bot edits
      const amp = 0.15 + Math.min(0.35, (absDelta / 5000) * 0.35);
      const pan = (Math.random() - 0.5) * 1.0;

      const src = ctx.createBufferSource();
      src.buffer = clickBuf;

      const bpf = ctx.createBiquadFilter();
      bpf.type = "bandpass";
      // High-frequency click = cold / mechanical
      bpf.frequency.value = 3200 + Math.random() * 4000;
      bpf.Q.value = 0.5 + Math.random() * 1.5;

      const env = ctx.createGain();
      env.gain.setValueAtTime(amp, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      src.connect(bpf);
      bpf.connect(env);
      env.connect(panner);
      panner.connect(masterGain);

      src.start(t);
      src.stop(t + 0.06);

      setTimeout(releaseVoice, 80);
    });
  }

  /** New page: accent — a brief two-oscillator chord stab */
  function spawnNewPageAccent(): void {
    withVoice(() => {
      const t = ctx.currentTime;
      const root = 220 + Math.random() * 440;
      const pan = (Math.random() - 0.5) * 0.6;

      const freqs = [root, root * 1.498]; // pure fifth-ish (not perfect) — data aesthetic
      const oscs = freqs.map((f) => {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        return o;
      });

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.22, t + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 400;

      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      oscs.forEach((o) => { o.connect(hp); });
      hp.connect(env);
      env.connect(panner);
      panner.connect(masterGain);
      oscs.forEach((o) => { o.start(t); o.stop(t + 0.25); });

      setTimeout(releaseVoice, 280);
    });
  }

  /** Log event: low soft thud */
  function spawnLogThud(): void {
    withVoice(() => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(68, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.18);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.18, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

      const panner = ctx.createStereoPanner();
      panner.pan.value = (Math.random() - 0.5) * 0.4;

      osc.connect(env);
      env.connect(panner);
      panner.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.25);

      setTimeout(releaseVoice, 280);
    });
  }

  /** Categorize: very quiet high tick */
  function spawnCategorizeTick(): void {
    withVoice(() => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 6400 + Math.random() * 2000;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.08, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

      const panner = ctx.createStereoPanner();
      panner.pan.value = (Math.random() - 0.5) * 0.9;

      osc.connect(env);
      env.connect(panner);
      panner.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.05);

      setTimeout(releaseVoice, 70);
    });
  }

  // ── Main dispatch ────────────────────────────────────────────────────────

  function spawnSound(evt: RecentChangeEvent): void {
    // Resume context if suspended (iOS)
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const delta = evt.length ? evt.length.new - evt.length.old : 0;
    const absDelta = Math.abs(delta);

    if (evt.bot) {
      spawnBotClick(absDelta);
      return;
    }

    switch (evt.type) {
      case "new":
        spawnNewPageAccent();
        break;
      case "log":
        spawnLogThud();
        break;
      case "categorize":
        spawnCategorizeTick();
        break;
      case "edit":
      default:
        // Main article edits get the full pluck; other namespaces get quieter version
        if (evt.namespace === 0) {
          spawnHumanPluck(delta, absDelta);
        } else {
          // Non-main namespace: quieter pluck
          spawnHumanPluck(delta, Math.min(absDelta, 500));
        }
        break;
    }
  }

  function dispose(): void {
    try {
      humOsc.stop();
    } catch {
      // already stopped
    }
    ctx.close().catch(() => {});
  }

  return { spawnSound, dispose };
}
