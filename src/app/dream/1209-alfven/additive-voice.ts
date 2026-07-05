// additive-voice.ts — the plasma string's voice.
//
// A plucked field line rings as a SUM of its standing harmonics f_n = n * f1.
// Each partial is its own OscillatorNode with an exponential decay envelope;
// higher partials decay faster (physical). This is genuine additive / spectral
// resynthesis of the string modes — not a choir, drone, pad, granular cloud or
// sampled pluck. The coefficients and decay rates come straight from the same
// MHD modal model that whips the tube, so seeing and hearing agree.

import { NMODES, modeDecay, modeRatio } from "./mhd-core";

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  f1Ref: number; // unscaled fundamental of the source line
  ratio: number; // this partial's f_n / f1
  stopAt: number;
}

const MAX_VOICES = 72; // partial budget across the whole rack

export interface AudioEngine {
  resume: () => Promise<void>;
  pluck: (f1Ref: number, coeffs: number[], gainScale: number, pan: number) => void;
  setFieldScale: (scale: number) => void;
  setMuted: (m: boolean) => void;
  dispose: () => void;
}

export function createAudio(): AudioEngine {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio unavailable");
  const ctx = new Ctx();

  // master chain: compressor (glue + safety) → master gain (ramped from 0)
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 26;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;

  const master = ctx.createGain();
  master.gain.value = 0;
  comp.connect(master);
  master.connect(ctx.destination);

  let bScale = 1;
  let muted = false;
  const voices: Voice[] = [];

  const prune = (now: number) => {
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].stopAt <= now) voices.splice(i, 1);
    }
  };

  const resume = async () => {
    if (ctx.state === "suspended") await ctx.resume();
    // gentle fade-in of the master bus
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : 0.85, now + 1.1);
  };

  const pluck = (f1Ref: number, coeffs: number[], gainScale: number, pan: number) => {
    const now = ctx.currentTime;
    prune(now);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(comp);

    // a faint noise-band transient gives the pluck its "attack" click
    const noiseLen = 0.06;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseLen), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nfilt = ctx.createBiquadFilter();
    nfilt.type = "bandpass";
    nfilt.frequency.value = f1Ref * bScale * 4;
    nfilt.Q.value = 0.8;
    const ngain = ctx.createGain();
    ngain.gain.setValueAtTime(0, now);
    ngain.gain.linearRampToValueAtTime(0.09 * gainScale, now + 0.004);
    ngain.gain.exponentialRampToValueAtTime(0.0005, now + noiseLen);
    noise.connect(nfilt);
    nfilt.connect(ngain);
    ngain.connect(panner);
    noise.start(now);
    noise.stop(now + noiseLen + 0.02);

    for (let n = 1; n <= NMODES; n++) {
      if (voices.length >= MAX_VOICES) break; // budget: drop the top partials
      const amp = Math.abs(coeffs[n - 1]) * gainScale;
      if (amp < 0.0006) continue;
      const ratio = modeRatio(n);
      const freq = f1Ref * bScale * ratio;
      if (freq > 15000) continue;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      const gain = ctx.createGain();
      const decay = modeDecay(n); // identical rate to the visual envelope
      const tail = Math.min(6, 1 / decay + 0.3);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.006);
      gain.gain.setTargetAtTime(0.0001, now + 0.006, 1 / decay);

      osc.connect(gain);
      gain.connect(panner);
      osc.start(now);
      osc.stop(now + tail + 0.15);

      voices.push({ osc, gain, f1Ref, ratio, stopAt: now + tail + 0.2 });
    }

    // let the panner GC after the longest tail
    setTimeout(() => {
      try {
        panner.disconnect();
      } catch {
        // already gone
      }
    }, 7000);
  };

  // turning up the magnetosphere: v_A ∝ B, so every f1 (and live voice) retunes.
  const setFieldScale = (scale: number) => {
    bScale = scale;
    const now = ctx.currentTime;
    prune(now);
    for (const v of voices) {
      const target = v.f1Ref * bScale * v.ratio;
      v.osc.frequency.cancelScheduledValues(now);
      v.osc.frequency.setValueAtTime(v.osc.frequency.value, now);
      v.osc.frequency.linearRampToValueAtTime(target, now + 0.08);
    }
  };

  const setMuted = (m: boolean) => {
    muted = m;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(m ? 0 : 0.85, now + 0.15);
  };

  const dispose = () => {
    const now = ctx.currentTime;
    for (const v of voices) {
      try {
        v.osc.stop(now);
      } catch {
        // may already be stopped
      }
    }
    voices.length = 0;
    ctx.close().catch(() => {});
  };

  return { resume, pluck, setFieldScale, setMuted, dispose };
}
