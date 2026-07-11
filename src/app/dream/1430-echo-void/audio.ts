// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — EchoAudio: active-echolocation sound engine.
//
//   On each PING, for every surface within range we schedule a RETURN at
//   t0 + 2·dist/SPEED — so near walls answer first and the far apse arrives last;
//   TIME emerges from the geometry, not a scheduler. Each return is a struck
//   RESONATOR: the surface's inharmonic base frequency plus 2–3 stretched partials
//   (bell/plate ratios like ×2.76, ×5.40, ×8.93) with fast exponential decay. It is
//   panned to the surface's true 3D bearing (relative to the current heading)
//   through an HRTF PannerNode, its level ∝ 1/dist, and fed into a cavernous void
//   reverb. Under it all sits a low drone bed. Everything sums through a limiter
//   into a master gain that ramps up from silence over ~2s (never a full-volume
//   cold start).
//
//   The pitch set is deliberately INHARMONIC — the field can sound eerie and
//   unresolved, not sweetly consonant.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import {
  createVoidReverb,
  type VoidReverb,
} from "../_shared/psych/convolutionVoid";
import { MATERIALS, type Cathedral, type Surface } from "./geometry";

const MASTER_TARGET = 0.72; // post-limiter master gain the ramp climbs to
const MASTER_RAMP = 2.0; // seconds, silence → MASTER_TARGET
const VOICE_CAP = 14; // max returns scheduled per ping
const MIN_SPACING = 0.09; // s, minimum gap between two returns
const MAX_RANGE = 70; // world units — surfaces beyond this stay silent

export class EchoAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private reverb: VoidReverb;
  private drone: DroneBank;
  private live = new Set<OscillatorNode>();
  private closed = false;
  private cath: Cathedral;

  constructor(cath: Cathedral) {
    this.cath = cath;
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    // master ← limiter ← everything
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(
      MASTER_TARGET,
      ctx.currentTime + MASTER_RAMP,
    );

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;

    this.master.connect(limiter);
    limiter.connect(ctx.destination);

    // cavernous void tail — every echo returns through it
    this.reverb = createVoidReverb(ctx, { seconds: 5.5, decay: 2.4, wet: 0.7 });
    this.reverb.output.connect(this.master);

    // low always-on drone bed (its own internal ramp)
    this.drone = startDroneBank(ctx, this.master, {
      root: 41.2, // ~E1
      ratios: [1, 1.5, 2, 3.02],
      cutoffLow: 140,
      cutoffHigh: 900,
      peakGain: 0.08,
    });
    this.drone.setDrive(0.18);
  }

  /** Resume the context (must be called from a user gesture). */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  /** Emit a ping: schedule all in-range surface returns for the given heading. */
  ping(headingYaw: number, speed: number): void {
    if (this.closed) return;
    const t0 = this.ctx.currentTime;
    this.emitClick(t0);

    const inRange = this.cath.surfaces
      .filter((s) => s.dist <= MAX_RANGE)
      .map((s) => ({ s, at: t0 + (2 * s.dist) / speed }))
      .sort((a, b) => a.at - b.at);

    let kept = 0;
    let lastAt = -Infinity;
    for (const { s, at } of inRange) {
      if (kept >= VOICE_CAP) break;
      if (at - lastAt < MIN_SPACING) continue; // thin dense clusters
      lastAt = at;
      kept++;
      this.scheduleReturn(s, at, headingYaw);
    }
  }

  private scheduleReturn(surface: Surface, at: number, yaw: number): void {
    const ctx = this.ctx;
    const mat = MATERIALS[surface.material];
    const [cx, cy, cz] = surface.centroid;

    // rotate the world centroid into listener space (listener faces -z at yaw 0)
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    let px = cx * c + cz * s;
    let py = cy;
    let pz = -cx * s + cz * c;
    const plen = Math.hypot(px, py, pz) || 1;
    const R = 1.6; // direction only — distance is handled by gain below
    px = (px / plen) * R;
    py = (py / plen) * R;
    pz = (pz / plen) * R;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "linear";
    panner.rolloffFactor = 0; // no double distance-attenuation
    this.setPannerPos(panner, px, py, pz, at);

    // distance → level (near loud, far faint) and → brightness (near bright)
    const d = surface.dist;
    const level = Math.min(0.85, Math.max(0.05, 0.9 / (1 + d * 0.09))) * 0.55;
    const cutoff = 380 + 7200 / (1 + d * 0.16);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    lp.Q.value = 0.5;
    lp.connect(panner);
    panner.connect(this.reverb.input);

    const ratios = mat.ratios;
    let longest = at;
    let longestOsc: OscillatorNode | null = null;
    for (let p = 0; p < ratios.length; p++) {
      const freq = surface.baseFreq * ratios[p] * (1 + (p === 0 ? 0 : 0.004));
      const decay = mat.decay / (1 + p * 0.85);
      const amp = level * (1 / (1 + p * 1.4));
      const endT = at + decay + 0.08;

      const osc = ctx.createOscillator();
      osc.type = surface.material === 2 && p > 0 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, at);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(amp, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay);

      osc.connect(g);
      g.connect(lp);
      osc.start(at);
      osc.stop(endT);
      this.live.add(osc);
      osc.onended = () => {
        this.live.delete(osc);
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* already gone */
        }
      };
      if (endT >= longest) {
        longest = endT;
        longestOsc = osc;
      }
    }

    // tear down the shared per-voice nodes once the last partial has rung out
    if (longestOsc) {
      const prev = longestOsc.onended;
      longestOsc.onended = (ev) => {
        if (prev) (prev as (e: Event) => void).call(longestOsc, ev);
        try {
          lp.disconnect();
          panner.disconnect();
        } catch {
          /* already gone */
        }
      };
    }
  }

  /** The listener's own emitted ping — a short centred down-chirp. */
  private emitClick(t0: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(280, t0);
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.11);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 220;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.12, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.connect(bp);
    bp.connect(g);
    g.connect(this.reverb.input);
    osc.start(t0);
    osc.stop(t0 + 0.2);
    this.live.add(osc);
    osc.onended = () => {
      this.live.delete(osc);
      try {
        osc.disconnect();
        bp.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  private setPannerPos(
    panner: PannerNode,
    x: number,
    y: number,
    z: number,
    at: number,
  ): void {
    if (panner.positionX) {
      panner.positionX.setValueAtTime(x, at);
      panner.positionY.setValueAtTime(y, at);
      panner.positionZ.setValueAtTime(z, at);
    } else {
      // very old Safari
      (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(
        x,
        y,
        z,
      );
    }
  }

  /** Full teardown: stop every voice, disconnect, close the context. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(
        Math.max(0.0001, this.master.gain.value),
        now,
      );
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    } catch {
      /* ctx closing */
    }
    for (const osc of this.live) {
      try {
        osc.stop(now);
      } catch {
        /* already stopped */
      }
    }
    this.live.clear();
    try {
      this.drone.stop();
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      if (this.ctx.state !== "closed") {
        this.ctx.close().catch(() => {
          /* ignore */
        });
      }
    }, 400);
  }
}
