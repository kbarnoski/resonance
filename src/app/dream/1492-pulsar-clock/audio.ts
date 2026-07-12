// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the polyrhythmic Web-Audio scheduler (subsystem "b").
//
// Every pulsar owns an HRTF PannerNode fixed at its real sky position, so its
// tick arrives from the direction the star hangs. Millisecond pulsars fuse into
// continuous PITCHED oscillators (a slowly-beating chord); second-scale pulsars
// fire discrete spatialised woodblock clicks on their real period; the ≥10 s
// giants toll like cathedral bells. Underneath sits a just-intonation perfect-
// fifth drone bed. As you fly, the listener moves through the sphere and more
// pulsars fall inside earshot — the polyrhythm slowly builds and phases.
//
// SAFETY: ctx resumes only after the Start gesture; master ramps silence→0.22
// over 0.6 s; a DynamicsCompressor limits before destination; concurrent tick
// voices are capped at 6 (4 pitched + 4 drone partials + 6 ticks = 14 max).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { Pulsar } from "./catalog";
import { SKY_RADIUS } from "./catalog";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

const MASTER_LEVEL = 0.22; // hard ceiling per audio-safety rule
const MAX_TICK_VOICES = 6; // pooled cap on concurrent discrete ticks
const EARSHOT = SKY_RADIUS * 1.7; // beyond this a pulsar is silent (gates ticks)
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25; // scheduler wakeup interval

// Just chord above the drone root so clicks and bells harmonise with the bed.
const JI = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8] as const;

interface Voice {
  pulsar: Pulsar;
  panner: PannerNode;
  worldPos: THREE.Vector3;
  tickFreq: number; // for click / bell
  nextTime: number; // audio-clock time of the next scheduled tick
}

export interface PulsarAudio {
  /** Move the HRTF listener to the camera and rebalance the build. */
  update(camera: THREE.Camera): void;
  dispose(): void;
}

function setListener(
  listener: AudioListener,
  pos: THREE.Vector3,
  fwd: THREE.Vector3,
  up: THREE.Vector3,
  now: number,
): void {
  const l = listener as AudioListener & {
    positionX?: AudioParam;
    setPosition?: (x: number, y: number, z: number) => void;
    setOrientation?: (
      fx: number, fy: number, fz: number,
      ux: number, uy: number, uz: number,
    ) => void;
  };
  if (l.positionX) {
    l.positionX.setTargetAtTime(pos.x, now, 0.03);
    l.positionY!.setTargetAtTime(pos.y, now, 0.03);
    l.positionZ!.setTargetAtTime(pos.z, now, 0.03);
    l.forwardX!.setTargetAtTime(fwd.x, now, 0.03);
    l.forwardY!.setTargetAtTime(fwd.y, now, 0.03);
    l.forwardZ!.setTargetAtTime(fwd.z, now, 0.03);
    l.upX!.setTargetAtTime(up.x, now, 0.03);
    l.upY!.setTargetAtTime(up.y, now, 0.03);
    l.upZ!.setTargetAtTime(up.z, now, 0.03);
  } else if (l.setPosition && l.setOrientation) {
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

export async function startPulsarAudio(
  pulsars: readonly Pulsar[],
  reducedMotion: boolean,
): Promise<PulsarAudio> {
  const ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  const t0 = ctx.currentTime;

  // master → limiter → destination
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.linearRampToValueAtTime(
    reducedMotion ? MASTER_LEVEL * 0.75 : MASTER_LEVEL,
    t0 + 0.6,
  );
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // convolution void — a shared wet bus the ticks bloom into
  const reverb: VoidReverb = createVoidReverb(ctx, {
    seconds: 4.5,
    decay: 2.6,
    wet: 1,
  });
  reverb.output.connect(master);
  const wetSend = ctx.createGain();
  wetSend.gain.value = 0.42;
  wetSend.connect(reverb.input);

  // just-intonation perfect-fifth drone bed (4 oscillators)
  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 55,
    ratios: [1, 3 / 2],
    cutoffLow: 160,
    cutoffHigh: 900,
    peakGain: reducedMotion ? 0.08 : 0.11,
  });

  const listener = ctx.listener;
  let activeTicks = 0;

  // Build a voice per pulsar (panner fixed at sky position).
  const voices: Voice[] = pulsars.map((p, i) => {
    const worldPos = new THREE.Vector3(...p.dir).multiplyScalar(SKY_RADIUS);
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = SKY_RADIUS * 0.55;
    panner.maxDistance = EARSHOT * 1.4;
    panner.rolloffFactor = 1.1;
    const pp = panner as PannerNode & {
      positionX?: AudioParam;
      setPosition?: (x: number, y: number, z: number) => void;
    };
    if (pp.positionX) {
      pp.positionX.value = worldPos.x;
      pp.positionY!.value = worldPos.y;
      pp.positionZ!.value = worldPos.z;
    } else if (pp.setPosition) {
      pp.setPosition(worldPos.x, worldPos.y, worldPos.z);
    }
    panner.connect(master); // dry
    panner.connect(wetSend); // to the void

    const ratio = JI[i % JI.length];
    const tickFreq =
      p.kind === "bell" ? 110 * ratio : 220 * ratio * 2; // bells low, clicks bright
    return { pulsar: p, panner, worldPos, tickFreq, nextTime: t0 + 0.4 };
  });

  // Continuous pitched millisecond pulsars — the fused chord.
  const pitchedOscs: OscillatorNode[] = [];
  for (const v of voices) {
    if (v.pulsar.kind !== "pitched") continue;
    const osc = ctx.createOscillator();
    osc.type = v.pulsar.freqHz < 60 ? "triangle" : "sine";
    osc.frequency.value = v.pulsar.freqHz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.06, t0 + 1.4);
    osc.connect(g);
    g.connect(v.panner);
    osc.start(t0);
    pitchedOscs.push(osc);
  }

  function scheduleClick(v: Voice, time: number): void {
    if (activeTicks >= MAX_TICK_VOICES) return;
    activeTicks++;
    const decay = 0.13;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(v.tickFreq, time);
    osc.frequency.exponentialRampToValueAtTime(v.tickFreq * 0.82, time + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.5, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.connect(g);
    g.connect(v.panner);
    osc.onended = () => {
      activeTicks--;
    };
    osc.start(time);
    osc.stop(time + decay + 0.02);
  }

  function scheduleBell(v: Voice, time: number): void {
    if (activeTicks >= MAX_TICK_VOICES) return;
    activeTicks++;
    const decay = v.pulsar.periodSec > 30 ? 4.2 : 2.6; // J0901 = the big toll
    const partials = [1, 2.01, 3.02];
    const gains = [0.5, 0.18, 0.09];
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(v.panner);
    let last: OscillatorNode | null = null;
    partials.forEach((mult, k) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = v.tickFreq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gains[k], time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      osc.connect(g);
      g.connect(bus);
      osc.start(time);
      osc.stop(time + decay + 0.05);
      last = osc;
    });
    if (last) (last as OscillatorNode).onended = () => {
      activeTicks--;
    };
  }

  // Lookahead scheduler — advances each ticking pulsar on its real period.
  const listenerPos = new THREE.Vector3();
  const scheduler = setInterval(() => {
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    for (const v of voices) {
      if (v.pulsar.kind === "pitched") continue;
      const inEarshot = v.worldPos.distanceTo(listenerPos) < EARSHOT;
      while (v.nextTime < horizon) {
        if (inEarshot && v.nextTime >= now) {
          if (v.pulsar.kind === "bell") scheduleBell(v, v.nextTime);
          else scheduleClick(v, v.nextTime);
        }
        v.nextTime += v.pulsar.periodSec;
      }
    }
  }, TICK_MS);

  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3();
  let disposed = false;

  return {
    update(camera: THREE.Camera) {
      if (disposed) return;
      const now = ctx.currentTime;
      listenerPos.copy(camera.position);
      camera.getWorldDirection(fwd);
      up.copy(camera.up).applyQuaternion(camera.quaternion);
      setListener(listener, listenerPos, fwd, up, now);
      // Build: drone drive rises with the number of pulsars in earshot.
      let near = 0;
      for (const v of voices) {
        if (v.worldPos.distanceTo(listenerPos) < EARSHOT) near++;
      }
      drone.setDrive(Math.min(1, near / 9));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(scheduler);
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      } catch {
        /* ctx already closing */
      }
      for (const osc of pitchedOscs) {
        try {
          osc.stop(now + 0.32);
        } catch {
          /* already stopped */
        }
      }
      drone.stop();
      setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 500);
    },
  };
}
