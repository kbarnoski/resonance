// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — Deep Tremor's instrument. Each earthquake becomes ONE struck tone,
// HRTF-spatialised to its true compass bearing around the listener, decaying
// into a long shared reverb void over a very low just-intonation drone.
//
//   We compose the lab's shared psychedelic engines (we do NOT reimplement the
//   drone or the reverb):
//     · createVoidReverb  — the cavernous noise-decay tail every strike rings into
//     · startDroneBank    — a dark, low just-intonation bed under everything
//
//   Per-quake synthesis (written here):
//     · pitch maps INVERSELY to magnitude — a big quake is a low, massive boom;
//       a tiny one is a high tap.
//     · DEPTH maps to timbre — shallow = brighter (higher partials, sharper
//       noise click, higher lowpass); deep = darker/longer/more sub.
//     · magnitude also maps to loudness + decay length.
//     · the strike routes through a PannerNode (panningModel = "HRTF"): we put
//       it on a unit sphere from (lon,lat) so it rings from that direction, and
//       push it further out (quieter) the deeper the quake is. Panner → reverb.
//
//   A simple time-spaced queue (~120 ms apart) caps simultaneous strikes so a
//   burst never clips into noise. Nodes self-clean on `ended`.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import type { Quake } from "./data";

export interface TremorAudio {
  /** Strike one quake now (subject to the spacing queue). */
  strike(q: Quake): void;
  /** 0..1 — how "busy" the planet feels; swells the drone slightly. */
  setActivity(a: number): void;
  stop(): void;
}

/** Convert geographic (lon,lat) degrees to a unit vector on a sphere, in the
 *  same Y-up convention the three.js globe uses, so audio bearing matches the
 *  on-screen quake location. Listener sits at the origin facing -Z. */
function geoToUnit(lonDeg: number, latDeg: number): [number, number, number] {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const x = Math.cos(lat) * Math.sin(lon);
  const y = Math.sin(lat);
  const z = Math.cos(lat) * Math.cos(lon);
  return [x, y, z];
}

export function startAudio(ctx: AudioContext): TremorAudio {
  // ── Master chain: everything → master gain → compressor → destination ──────
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.28;

  master.connect(comp);
  comp.connect(ctx.destination);

  // ── The cavernous void every strike (and the drone) rings into ─────────────
  const verb: VoidReverb = createVoidReverb(ctx, {
    seconds: 8,
    decay: 2.2,
    wet: 0.55,
  });
  verb.output.connect(master);

  // ── The dark low just-intonation bed, routed INTO the void ─────────────────
  const drone: DroneBank = startDroneBank(ctx, verb.input, {
    root: 41, // ~E1 — very low and dark
    ratios: [1, 3 / 2, 2, 9 / 4],
    cutoffLow: 140,
    cutoffHigh: 900,
    peakGain: 0.22,
  });
  drone.setDrive(0.12);

  // Place the listener at the origin facing -Z so geoToUnit bearings line up.
  const L = ctx.listener;
  if (L.positionX) {
    L.positionX.value = 0;
    L.positionY.value = 0;
    L.positionZ.value = 0;
    L.forwardX.value = 0;
    L.forwardY.value = 0;
    L.forwardZ.value = -1;
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  } else {
    // Older Safari fallback.
    L.setPosition(0, 0, 0);
    L.setOrientation(0, 0, -1, 0, 1, 0);
  }

  // ── Strike spacing queue: never fire two strikes inside ~120 ms ────────────
  const queue: Quake[] = [];
  let nextSlot = 0;
  const SPACING = 0.12;
  let timer: number | null = null;

  // ── Drone activity swell ───────────────────────────────────────────────────
  let activity = 0;
  function applyDrive() {
    drone.setDrive(0.12 + 0.16 * Math.min(1, Math.max(0, activity)));
  }

  let stopped = false;

  function synthOne(q: Quake): void {
    const now = ctx.currentTime;

    // Magnitude → pitch (INVERSE), loudness, decay length.
    const mag = Math.min(8, Math.max(1, q.mag));
    // mag 1 → ~330 Hz tap; mag 7 → ~46 Hz boom.
    const baseFreq = 46 * Math.pow(2, (7 - mag) * 0.62);
    const loud = 0.06 + 0.42 * Math.min(1, (mag - 1) / 5.5);
    const decay = 1.1 + Math.min(1, (mag - 1) / 6) * 5.5; // 1.1..6.6 s

    // Depth → timbre. Shallow = bright/sharp; deep = dark/sub/long.
    const depthN = Math.min(1, q.depthKm / 600); // 0 shallow .. 1 deep
    const lp = 5200 * Math.pow(0.16, depthN); // ~5200 → ~830 Hz
    const tailMul = 1 + depthN * 0.9; // deep quakes ring longer
    const clickAmt = (1 - depthN) * 0.9; // shallow quakes get a sharp onset

    // ── Spatialisation: HRTF panner at the quake's true bearing ──────────────
    const [ux, uy, uz] = geoToUnit(q.lon, q.lat);
    const radius = 1.4 + depthN * 4.5; // deeper = further away = quieter
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 50;
    panner.rolloffFactor = 0.9;
    if (panner.positionX) {
      panner.positionX.value = ux * radius;
      panner.positionY.value = uy * radius;
      panner.positionZ.value = uz * radius;
    } else {
      panner.setPosition(ux * radius, uy * radius, uz * radius);
    }

    // Per-strike timbre lowpass.
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = lp;
    filt.Q.value = 0.9;

    // Amplitude envelope: near-instant attack, exponential ring-out.
    const env = ctx.createGain();
    env.gain.value = 0.0001;
    const total = decay * tailMul;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(loud, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, now + total);

    filt.connect(env);
    env.connect(panner);
    panner.connect(verb.input);

    // 2–3 inharmonic partials → a struck gong/bell, not a pure sine.
    const partials = depthN > 0.55 ? [1, 2.0] : [1, 2.04, 3.01];
    const oscs: OscillatorNode[] = [];
    partials.forEach((mult, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 && depthN > 0.4 ? "sine" : "triangle";
      osc.frequency.value = baseFreq * mult;
      const pg = ctx.createGain();
      pg.gain.value = (i === 0 ? 1 : 0.4 / i) * 0.9;
      osc.connect(pg);
      pg.connect(filt);
      osc.start(now);
      osc.stop(now + total + 0.1);
      oscs.push(osc);
    });

    // Onset transient: a short filtered noise click (sharper when shallow).
    if (clickAmt > 0.02) {
      const dur = 0.05;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 1400 + 2600 * (1 - depthN);
      nf.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.value = clickAmt * loud * 0.8;
      noise.connect(nf);
      nf.connect(ng);
      ng.connect(panner);
      noise.start(now);
      noise.stop(now + dur);
      noise.onended = () => {
        try {
          noise.disconnect();
          nf.disconnect();
          ng.disconnect();
        } catch {
          /* already gone */
        }
      };
    }

    // Clean up the tonal chain when the last oscillator ends.
    let ended = 0;
    const cleanup = () => {
      ended++;
      if (ended < oscs.length) return;
      try {
        oscs.forEach((o) => o.disconnect());
        filt.disconnect();
        env.disconnect();
        panner.disconnect();
      } catch {
        /* already gone */
      }
    };
    oscs.forEach((o) => (o.onended = cleanup));
  }

  function pump(): void {
    if (stopped) return;
    const now = ctx.currentTime;
    while (queue.length && nextSlot <= now + 0.001) {
      const q = queue.shift();
      if (q) synthOne(q);
      nextSlot = Math.max(now, nextSlot) + SPACING;
    }
    if (queue.length) {
      const waitMs = Math.max(10, (nextSlot - now) * 1000);
      timer = window.setTimeout(pump, waitMs);
    } else {
      timer = null;
    }
  }

  return {
    strike(q: Quake) {
      if (stopped) return;
      // Cap the backlog so a huge burst can't run for minutes.
      if (queue.length > 48) queue.shift();
      queue.push(q);
      if (timer === null) {
        nextSlot = Math.max(nextSlot, ctx.currentTime);
        pump();
      }
    },
    setActivity(a: number) {
      activity = a;
      applyDrive();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      queue.length = 0;
      drone.stop();
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } catch {
        /* ctx closing */
      }
    },
  };
}
