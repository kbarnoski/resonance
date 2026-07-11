// 1470-the-drop — audio.ts
//
// The build-and-drop instrument. The sandpile's tension (how loaded toward
// critical) drives a RISER — a swelling drone + an accelerating pulse + an
// opening filter. Each avalanche's SIZE drives a RELEASE: tiny cascades are
// granular ticks, medium ones a swell, and the rare "big one" a full-spectrum
// DROP (sub-bass thud + an inharmonic chord bloom + a noise sweep). Because
// avalanche sizes are power-law distributed, the rhythm composes itself.
//
// Pitch is CONTINUOUS and INHARMONIC — mapped from the avalanche's spatial
// centroid / extent via setTargetAtTime glides and stretched, drum-membrane-like
// partials. No scale, no 12-TET quantisation.
//
// Master gain ramps from silence to <=0.2 through a DynamicsCompressor limiter.
// Polyphony capped at 14 voices (oldest stolen). Full teardown on stop().

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { mulberry32 } from "./sandpile";

export interface DropEvent {
  size: number;
  cx: number;
  cy: number;
  extent: number;
}

interface Voice {
  end: number;
  stop: () => void;
}

// inharmonic, drum-membrane-like partial ratios (NOT a musical scale)
const PARTIALS = [1, 1.593, 2.135, 2.295, 2.917, 3.5];

export interface DropAudio {
  /** Per-frame: tension in [0,1] drives riser; topples drive the live rumble. */
  updateTension(load: number, topples: number, dt: number): void;
  /** Sonify one settled avalanche; returns a flash magnitude in [0,1]. */
  drop(ev: DropEvent): number;
  stop(): void;
}

export function makeDropAudio(ctx: AudioContext, peak: number): DropAudio {
  const now0 = ctx.currentTime;
  const rng = mulberry32(0x51ce);

  // ── master chain: gain → limiter → destination ──
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now0);
  master.gain.exponentialRampToValueAtTime(Math.min(0.2, peak), now0 + 2.2);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── shared noise buffer (deterministic fill) ──
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1;

  // ── the riser: shared drone bed ──
  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 46,
    ratios: [1, 1.5, 2.02, 2.67, 3.35], // slightly stretched, faintly inharmonic
    cutoffLow: 150,
    cutoffHigh: 2400,
    peakGain: 0.16,
  });

  // ── live rumble bed: rises with the topple rate during a cascade ──
  const rumble = ctx.createGain();
  rumble.gain.value = 0.0001;
  const rumbleLp = ctx.createBiquadFilter();
  rumbleLp.type = "lowpass";
  rumbleLp.frequency.value = 220;
  rumbleLp.Q.value = 0.6;
  const rumbleSrc = ctx.createBufferSource();
  rumbleSrc.buffer = noiseBuf;
  rumbleSrc.loop = true;
  rumbleSrc.connect(rumbleLp);
  rumbleLp.connect(rumble);
  rumble.connect(master);
  rumbleSrc.start();

  // ── voice pool (cap 14, steal oldest) ──
  const voices: Voice[] = [];
  function register(v: Voice): void {
    if (voices.length >= 14) {
      let mi = 0;
      for (let i = 1; i < voices.length; i++) {
        if (voices[i].end < voices[mi].end) mi = i;
      }
      voices[mi].stop();
      voices.splice(mi, 1);
    }
    voices.push(v);
  }
  function retire(v: Voice): void {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
  }

  // pulse (accelerating anticipation)
  let pulsePhase = 0;

  function firePulse(load: number): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    // continuous pitch rising with tension (glide, no scale)
    const f = 120 + load * 340;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.setTargetAtTime(f * 1.5, t, 0.08);
    const g = ctx.createGain();
    const lvl = 0.04 + load * 0.05;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.16);
    const v: Voice = {
      end: t + 0.16,
      stop: () => {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      },
    };
    register(v);
    osc.onended = () => retire(v);
  }

  function tick(pitch01: number, level: number): void {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const off = Math.floor(rng() * (noiseBuf.length - 4096));
    src.loop = false;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500 * Math.pow(7, pitch01); // 500 .. 3500 Hz continuous
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t, off / ctx.sampleRate, 0.06);
    const v: Voice = {
      end: t + 0.07,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      },
    };
    register(v);
    src.onended = () => retire(v);
  }

  function swell(mag: number, baseFreq: number): void {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(baseFreq * 2, t);
    bp.frequency.setTargetAtTime(baseFreq * 0.7, t, 0.3);
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    const dur = 0.4 + mag * 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 + mag * 0.06, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
    const v: Voice = {
      end: t + dur,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      },
    };
    register(v);
    src.onended = () => retire(v);
  }

  function midDrop(mag: number, ev: DropEvent): void {
    // a punchy "tom" hit — short, no sustained sub, so frequent drops stay clean
    const t = ctx.currentTime;
    const base = 96 * Math.pow(2, (ev.cx - 0.5) * 1.4); // ~72 .. 128 Hz, continuous
    for (let k = 0; k < 2; k++) {
      const osc = ctx.createOscillator();
      osc.type = k === 0 ? "triangle" : "sine";
      const f = base * PARTIALS[k];
      osc.frequency.setValueAtTime(f * 1.6, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      const g = ctx.createGain();
      const dur = 0.16 + mag * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((0.12 / (k + 1)) * (0.6 + mag * 0.4), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      const v: Voice = {
        end: t + dur,
        stop: () => {
          try {
            osc.stop();
          } catch {
            /* already stopped */
          }
        },
      };
      register(v);
      osc.onended = () => retire(v);
    }
    // a short filtered noise transient for attack
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = false;
    const off = Math.floor(rng() * (noiseBuf.length - 8192));
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 320 + ev.extent * 600;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07 * (0.5 + mag * 0.5), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t, off / ctx.sampleRate, 0.13);
    const v: Voice = {
      end: t + 0.13,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      },
    };
    register(v);
    src.onended = () => retire(v);
  }

  function bigDrop(mag: number, ev: DropEvent): void {
    const t = ctx.currentTime;

    // sub-bass thud: a sine with a downward pitch envelope
    const subF = 60 - ev.extent * 22; // wider cascade → lower thud (38..60 Hz)
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(subF * 2.2, t);
    sub.frequency.exponentialRampToValueAtTime(subF, t + 0.14);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.0001, t);
    subG.gain.exponentialRampToValueAtTime(0.22 * (0.6 + mag * 0.4), t + 0.012);
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.7 + mag * 0.6);
    sub.connect(subG);
    subG.connect(master);
    sub.start(t);
    sub.stop(t + 1.4 + mag);
    const subV: Voice = {
      end: t + 0.9,
      stop: () => {
        try {
          sub.stop();
        } catch {
          /* already stopped */
        }
      },
    };
    register(subV);
    sub.onended = () => retire(subV);

    // inharmonic chord bloom, base pitch glides from the centroid (continuous)
    const base = 70 * Math.pow(2, (ev.cx - 0.5) * 1.6); // ~46 .. 106 Hz
    const decay = 1.2 + mag * 1.6;
    const nPart = 3 + Math.round(mag * 3);
    for (let k = 0; k < nPart; k++) {
      const osc = ctx.createOscillator();
      osc.type = k === 0 ? "triangle" : "sine";
      const f = base * PARTIALS[k];
      osc.frequency.setValueAtTime(f * 1.02, t);
      osc.frequency.setTargetAtTime(f, t, 0.25); // gentle glide into tune
      osc.detune.value = (rng() - 0.5) * 12;
      const g = ctx.createGain();
      const lvl = (0.12 / (k + 1)) * (0.5 + mag * 0.5);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(lvl, t + 0.02 + k * 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + decay + 0.1);
      const v: Voice = {
        end: t + decay,
        stop: () => {
          try {
            osc.stop();
          } catch {
            /* already stopped */
          }
        },
      };
      register(v);
      osc.onended = () => retire(v);
    }

    // downward noise sweep — the "drop" whoosh
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.5 + mag * 0.4);
    lp.Q.value = 3;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.09 * (0.5 + mag * 0.5), t + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6 + mag * 0.5);
    src.connect(lp);
    lp.connect(sg);
    sg.connect(master);
    src.start(t);
    src.stop(t + 1.3 + mag);
    const sv: Voice = {
      end: t + 0.7,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      },
    };
    register(sv);
    src.onended = () => retire(sv);
  }

  return {
    updateTension(load, topples, dt) {
      const l = Math.min(1, Math.max(0, load));
      drone.setDrive(l);
      // accelerating pulse: 0.5 Hz at rest → ~6 Hz near critical
      const rate = 0.5 + l * l * 5.5;
      pulsePhase += dt * rate;
      if (pulsePhase >= 1) {
        pulsePhase -= 1;
        if (pulsePhase >= 1) pulsePhase = 0; // guard big dt
        firePulse(l);
      }
      // live rumble tracks the topple rate during a cascade
      const target = Math.min(1, topples / 1400) * 0.11;
      rumble.gain.setTargetAtTime(0.0001 + target, ctx.currentTime, 0.05);
      rumbleLp.frequency.setTargetAtTime(200 + target * 1400, ctx.currentTime, 0.1);
    },
    drop(ev) {
      const S = ev.size;
      // magnitude: log-compressed size → [0,1] over the true dynamic range
      const mag = Math.min(1, Math.log(1 + S) / Math.log(15000));
      if (S < 40) {
        // the shimmer — tiny granular ticks
        tick(ev.cx, 0.04 + mag * 0.12);
        return mag * 0.25;
      }
      if (S < 500) {
        // an airy swell
        swell(mag, 240 + ev.cx * 500);
        return 0.18 + mag * 0.2;
      }
      if (S < 2600) {
        // a clean, punchy drop
        midDrop(mag, ev);
        return 0.4 + mag * 0.25;
      }
      // the rare full-spectrum DROP — sub, inharmonic bloom, sweep, terrain flash
      bigDrop(mag, ev);
      return 0.72 + mag * 0.28;
    },
    stop() {
      const t = ctx.currentTime;
      for (const v of voices.splice(0)) v.stop();
      drone.stop();
      try {
        rumble.gain.cancelScheduledValues(t);
        rumble.gain.setValueAtTime(Math.max(0.0001, rumble.gain.value), t);
        rumble.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        rumbleSrc.stop(t + 0.35);
      } catch {
        /* ctx closing */
      }
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      } catch {
        /* ctx closing */
      }
    },
  };
}
