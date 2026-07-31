// 4296 · BREATH — audio.ts
//
// The two voices, kept timbrally DISTINCT so it is always obvious who is
// speaking:  YOU = a bright, plucked, thin attack (saw+triangle through a fast
// closing filter).  THE COMPANION = a soft breathy pad (detuned sines + a
// whisper of filtered noise, slow attack, long tail, gentle vibrato) floated on
// a small feedback-delay air.  Pure Web Audio — no samples, no FFT of any input.
// The AudioContext is only ever created inside a user gesture (see page.tsx).

import { CompanionNote, makeMulberry32, midiToFreq } from "./music";

interface Voice {
  stop(when: number): void;
}

export interface AudioEngine {
  ensureRunning(): Promise<boolean>; // returns true if audio is actually running
  playPluck(midi: number, velocity: number): void;
  scheduleAnswer(notes: CompanionNote[]): number; // returns total duration (sec)
  getPadLevel(): number; // 0..1 smoothed companion loudness (for the visuals)
  isBlocked(): boolean;
  dispose(): void;
}

export function createAudioEngine(seed: number): AudioEngine {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  const rand = makeMulberry32(seed);

  // ── Master chain: buses → compressor → destination ────────────────────────
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.006;
  comp.release.value = 0.22;
  comp.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);

  const playerBus = ctx.createGain();
  playerBus.gain.value = 0.9;
  playerBus.connect(master);

  const companionBus = ctx.createGain();
  companionBus.gain.value = 0.85;
  companionBus.connect(master);

  // Companion "air": a tiny feedback-delay reverb only the pad passes through,
  // so the soft voice reads as further off and breathier than the dry pluck.
  const reverbIn = ctx.createGain();
  reverbIn.gain.value = 1;
  companionBus.connect(reverbIn);
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  wet.connect(master);
  const delayTimes = [0.037, 0.053, 0.071];
  const revNodes: (DelayNode | BiquadFilterNode | GainNode)[] = [];
  for (const dt of delayTimes) {
    const dl = ctx.createDelay(0.5);
    dl.delayTime.value = dt;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    const fb = ctx.createGain();
    fb.gain.value = 0.55;
    reverbIn.connect(dl);
    dl.connect(damp);
    damp.connect(fb);
    fb.connect(dl); // recirculate
    damp.connect(wet);
    revNodes.push(dl, damp, fb);
  }

  // Analyser taps the companion bus so the presence glows with its own voice.
  const padAnalyser = ctx.createAnalyser();
  padAnalyser.fftSize = 256;
  padAnalyser.smoothingTimeConstant = 0.7;
  companionBus.connect(padAnalyser);
  const padTd = new Float32Array(padAnalyser.fftSize);
  let padLevel = 0;

  // Shared noise buffer (deterministic — seeded, no Math.random) for the breath.
  const noiseLen = Math.floor(ctx.sampleRate * 1.5);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = rand() * 2 - 1;

  const live = new Set<Voice>();

  let blocked = false;

  async function ensureRunning(): Promise<boolean> {
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        blocked = true;
        return false;
      }
    }
    blocked = ctx.state !== "running";
    return !blocked;
  }

  // ── YOU: a bright plucked note ────────────────────────────────────────────
  function playPluck(midi: number, velocity: number) {
    if (ctx.state !== "running") return;
    const t = ctx.currentTime;
    const f = midiToFreq(midi);
    const amp = 0.24 * Math.max(0.05, velocity);

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 3;
    filt.frequency.setValueAtTime(6500, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(600, f * 2), t + 0.22);

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 180; // keep it thin / bright, out of the pad's warmth

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

    const oscA = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.value = f;
    const oscB = ctx.createOscillator();
    oscB.type = "triangle";
    oscB.frequency.value = f * 2;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.4;

    oscA.connect(filt);
    oscB.connect(bGain);
    bGain.connect(filt);
    filt.connect(hp);
    hp.connect(g);
    g.connect(playerBus);

    oscA.start(t);
    oscB.start(t);
    oscA.stop(t + 0.7);
    oscB.stop(t + 0.7);

    const voice: Voice = {
      stop(when) {
        try {
          oscA.stop(when);
          oscB.stop(when);
        } catch {
          /* already stopped */
        }
      },
    };
    live.add(voice);
    oscB.onended = () => live.delete(voice);
  }

  // ── THE COMPANION: one soft breathy pad note ──────────────────────────────
  function playPad(midi: number, startTime: number, dur: number, velocity: number) {
    const f = midiToFreq(midi);
    const amp = 0.17 * Math.max(0.05, velocity);
    const t = startTime;

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1500;
    filt.Q.value = 0.4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.22); // slow bloom, not a click
    g.gain.setValueAtTime(amp, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2); // long breathy tail

    filt.connect(g);
    g.connect(companionBus);

    // Gentle vibrato shared by the detuned partials.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 4.4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 4; // cents
    lfo.connect(lfoGain);

    const oscs: OscillatorNode[] = [];
    const detunes = [-6, 7];
    for (const dtune of detunes) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = dtune;
      lfoGain.connect(o.detune);
      o.connect(filt);
      oscs.push(o);
    }
    // A soft upper partial for a little breath-colour.
    const oHi = ctx.createOscillator();
    oHi.type = "triangle";
    oHi.frequency.value = f * 2;
    const hiGain = ctx.createGain();
    hiGain.gain.value = 0.12;
    oHi.connect(hiGain);
    hiGain.connect(filt);
    oscs.push(oHi);

    // A whisper of filtered noise = the "breath" behind the tone.
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const nbp = ctx.createBiquadFilter();
    nbp.type = "bandpass";
    nbp.frequency.value = f * 2;
    nbp.Q.value = 1.2;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, t);
    nGain.gain.linearRampToValueAtTime(0.03 * velocity, t + 0.25);
    nGain.gain.setValueAtTime(0.03 * velocity, t + dur);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
    noise.connect(nbp);
    nbp.connect(nGain);
    nGain.connect(companionBus);

    const stopAt = t + dur + 1.4;
    lfo.start(t);
    noise.start(t);
    for (const o of oscs) o.start(t);
    lfo.stop(stopAt);
    noise.stop(stopAt);
    for (const o of oscs) o.stop(stopAt);

    const voice: Voice = {
      stop(when) {
        try {
          lfo.stop(when);
          noise.stop(when);
          for (const o of oscs) o.stop(when);
        } catch {
          /* already stopped */
        }
      },
    };
    live.add(voice);
    oscs[0].onended = () => live.delete(voice);
  }

  function scheduleAnswer(notes: CompanionNote[]): number {
    if (ctx.state !== "running") return 0;
    const base = ctx.currentTime;
    let total = 0;
    for (const n of notes) {
      playPad(n.midi, base + n.whenSec, n.durSec, n.velocity);
      total = Math.max(total, n.whenSec + n.durSec + 1.4);
    }
    return total;
  }

  function getPadLevel(): number {
    padAnalyser.getFloatTimeDomainData(padTd);
    let sum = 0;
    for (let i = 0; i < padTd.length; i++) sum += padTd[i] * padTd[i];
    const rms = Math.sqrt(sum / padTd.length);
    const target = Math.min(1, rms * 9);
    padLevel += (target - padLevel) * 0.25;
    return padLevel;
  }

  function isBlocked(): boolean {
    return blocked;
  }

  function dispose() {
    const now = ctx.currentTime;
    for (const v of live) v.stop(now);
    live.clear();
    void ctx.close();
  }

  return { ensureRunning, playPluck, scheduleAnswer, getPadLevel, isBlocked, dispose };
}
