// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — the Web Audio voice bank for DROPFORGE. Everything is synthesized
// (no samples). Voices route into the ear-safety master bus.
//
//   kick / snare / riser  → master.input          (never ducked)
//   bass / sub / lead      → duckBus → master.input (sidechain "pump")
//   pad                    → master.input + reverb  (break suspension)
//
// The classic EDM pump is `duck(t)`: on every kick we slam the duckBus gain
// down and ramp it back, so the bass + lead breathe under the kick.
// ─────────────────────────────────────────────────────────────────────────────

import type { SafeMaster } from "../_shared/visionary/safeMaster";

export interface DropForgeAudio {
  /** Four-on-the-floor kick. Direct to master; also drives the sidechain. */
  scheduleKick(time: number, gain: number): void;
  /** Noise clap / snare — used for backbeat and the accelerating build roll. */
  scheduleSnare(time: number, gain: number, bright: number): void;
  /** Off-beat plucked bass through a lowpass whose cutoff rises with tension. */
  scheduleBass(time: number, freq: number, dur: number, gain: number, cutoff: number): void;
  /** Detuned supersaw lead through a rising lowpass. */
  scheduleLead(time: number, freq: number, dur: number, gain: number, cutoff: number): void;
  /** Sub-bass sine — only arrives AT the drop. */
  scheduleSub(time: number, freq: number, dur: number, gain: number): void;
  /** A single big impact/crash for the drop downbeat. */
  scheduleImpact(time: number, gain: number): void;
  /** Sidechain duck on the kick. */
  duck(time: number, amount: number, release: number): void;
  /** Ramp the riser (filtered noise + pitch glide) toward a tension target. */
  setRiser(time: number, tension: number, active: boolean): void;
  /** Ramp the break pad in/out and retune it. */
  setPad(time: number, freq: number, level: number): void;
  /** Stop + disconnect every persistent node. */
  dispose(): void;
}

const CENTS = [-16, -8, 0, 8, 16]; // supersaw detune spread
const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function makeDropForgeAudio(ctx: AudioContext, master: SafeMaster): DropForgeAudio {
  const noise = makeNoiseBuffer(ctx, 2);

  // Persistent nodes we must dispose of later.
  const persistent: { stop: () => void }[] = [];

  // ── sidechain bus ─────────────────────────────────────────────────────────
  const duckBus = ctx.createGain();
  duckBus.gain.value = 1;
  duckBus.connect(master.input);

  // ── reverb send (for the break suspension) ─────────────────────────────────
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 2.4, 3.2);
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.9;
  reverbSend.connect(reverb);
  reverb.connect(master.input);

  // ── riser: looping noise → bandpass, plus a saw pitch-glide ─────────────────
  const riserGain = ctx.createGain();
  riserGain.gain.value = 0;
  riserGain.connect(master.input);

  const riserNoise = ctx.createBufferSource();
  riserNoise.buffer = noise;
  riserNoise.loop = true;
  const riserBP = ctx.createBiquadFilter();
  riserBP.type = "bandpass";
  riserBP.frequency.value = 500;
  riserBP.Q.value = 2.5;
  const riserNoiseGain = ctx.createGain();
  riserNoiseGain.gain.value = 0.7;
  riserNoise.connect(riserBP).connect(riserNoiseGain).connect(riserGain);
  riserNoise.start();
  persistent.push({ stop: () => { try { riserNoise.stop(); } catch { /* closing */ } } });

  const riserSaw = ctx.createOscillator();
  riserSaw.type = "sawtooth";
  riserSaw.frequency.value = 220;
  const riserSawGain = ctx.createGain();
  riserSawGain.gain.value = 0.14;
  const riserSawLP = ctx.createBiquadFilter();
  riserSawLP.type = "lowpass";
  riserSawLP.frequency.value = 1200;
  riserSaw.connect(riserSawLP).connect(riserSawGain).connect(riserGain);
  riserSaw.start();
  persistent.push({ stop: () => { try { riserSaw.stop(); } catch { /* closing */ } } });

  // ── break pad: two detuned saws → lowpass → gain (dry + reverb) ─────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  const padLP = ctx.createBiquadFilter();
  padLP.type = "lowpass";
  padLP.frequency.value = 900;
  padLP.Q.value = 0.6;
  padGain.connect(master.input);
  padGain.connect(reverbSend);
  padLP.connect(padGain);
  const padOscs: OscillatorNode[] = [];
  [-6, 6].forEach((det) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.detune.value = det;
    o.frequency.value = 220;
    o.connect(padLP);
    o.start();
    padOscs.push(o);
    persistent.push({ stop: () => { try { o.stop(); } catch { /* closing */ } } });
  });

  return {
    scheduleKick(time, gain) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(48, time + 0.09);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, time + 0.34);
      osc.connect(g).connect(master.input);
      osc.start(time);
      osc.stop(time + 0.36);

      // click transient for snap
      const cs = ctx.createBufferSource();
      cs.buffer = noise;
      const cg = ctx.createGain();
      const cf = ctx.createBiquadFilter();
      cf.type = "highpass";
      cf.frequency.value = 3200;
      cg.gain.setValueAtTime(gain * 0.5, time);
      cg.gain.exponentialRampToValueAtTime(0.0008, time + 0.02);
      cs.connect(cf).connect(cg).connect(master.input);
      cs.start(time);
      cs.stop(time + 0.03);
    },

    scheduleSnare(time, gain, bright) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1400 + bright * 2600;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0008, time + 0.12);
      src.connect(bp).connect(g);
      g.connect(master.input);
      g.connect(reverbSend);
      src.start(time);
      src.stop(time + 0.14);
    },

    scheduleBass(time, freq, dur, gain, cutoff) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = cutoff;
      lp.Q.value = 6;
      const g = ctx.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
      osc.connect(lp).connect(g).connect(duckBus);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    },

    scheduleLead(time, freq, dur, gain, cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = cutoff;
      lp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
      lp.connect(g).connect(duckBus);
      const oscs: OscillatorNode[] = [];
      for (const c of CENTS) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = c;
        o.connect(lp);
        o.start(time);
        o.stop(time + dur + 0.03);
        oscs.push(o);
      }
    },

    scheduleSub(time, freq, dur, gain) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const g = ctx.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
      osc.connect(g).connect(duckBus);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    },

    scheduleImpact(time, gain) {
      // white-noise swell + low boom for the drop downbeat
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(6000, time);
      lp.frequency.exponentialRampToValueAtTime(400, time + 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0008, time + 0.9);
      src.connect(lp).connect(g);
      g.connect(master.input);
      g.connect(reverbSend);
      src.start(time);
      src.stop(time + 0.95);

      const boom = ctx.createOscillator();
      boom.type = "sine";
      const bg = ctx.createGain();
      boom.frequency.setValueAtTime(90, time);
      boom.frequency.exponentialRampToValueAtTime(38, time + 0.5);
      bg.gain.setValueAtTime(gain, time);
      bg.gain.exponentialRampToValueAtTime(0.0008, time + 0.6);
      boom.connect(bg).connect(master.input);
      boom.start(time);
      boom.stop(time + 0.62);
    },

    duck(time, amount, release) {
      const p = duckBus.gain;
      p.cancelScheduledValues(time);
      p.setValueAtTime(amount, time);
      p.linearRampToValueAtTime(1, time + release);
    },

    setRiser(time, tension, active) {
      const t = Math.max(0, Math.min(1, tension));
      const level = active ? 0.06 + t * 0.5 : 0;
      riserGain.gain.setTargetAtTime(level, time, 0.05);
      // noise band + saw pitch climb across the build
      riserBP.frequency.setTargetAtTime(400 + t * 5200, time, 0.08);
      riserSaw.frequency.setTargetAtTime(180 * Math.pow(2, t * 2.2), time, 0.08);
      riserSawLP.frequency.setTargetAtTime(800 + t * 4000, time, 0.08);
    },

    setPad(time, freq, level) {
      padGain.gain.setTargetAtTime(level, time, 0.12);
      for (const o of padOscs) o.frequency.setTargetAtTime(freq, time, 0.1);
      padLP.frequency.setTargetAtTime(700 + level * 1600, time, 0.15);
    },

    dispose() {
      for (const n of persistent) n.stop();
      try {
        duckBus.disconnect();
        riserGain.disconnect();
        padGain.disconnect();
        reverbSend.disconnect();
        reverb.disconnect();
      } catch {
        /* ctx closing */
      }
    },
  };
}

export { midiToHz };
