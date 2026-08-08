// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the room's impulse response, made audible.
//
// Each cast note fires HRTF-spatialized taps: the DIRECT arrival at the listener
// (you, at the LEFT stall) plus first-order wall reflections computed by the
// image-source method — the same geometry the shader draws. Every tap is
// positioned with a Web Audio PannerNode (panningModel = "HRTF") and DELAYED
// through a DelayNode by its travel time (distance ÷ speed), so you SEE the
// wavefront reach a wall and HEAR the arrival from that direction at that
// instant. A bounded (<1.0) feedback delay gives the hall its tail.
// ─────────────────────────────────────────────────────────────────────────────

import { WALL, STALL_L } from "./gl";

const AUDIO_SCALE = 3.2; // world units → metres-ish for HRTF spatialization

export interface TapOpts {
  x: number; // world source position
  y: number;
  freq: number;
  side: 0 | 1; // 0 = you (warm timbre), 1 = partner (contrasting timbre)
  speed: number; // world units / sec (matches the visual front)
}

export interface AudioEngine {
  unlock: () => void;
  ready: () => boolean;
  tap: (o: TapOpts) => void;
  close: () => void;
}

interface Live {
  ctx: AudioContext;
  master: GainNode;
  fbInput: GainNode; // feedback-delay send (the room tail)
}

export function createAudioEngine(): AudioEngine {
  let live: Live | null = null;

  function build(): Live | null {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.5);

    // bounded feedback delay network → the hall's decaying tail
    const fbInput = ctx.createGain();
    fbInput.gain.value = 0.5;
    const d1 = ctx.createDelay(1.5);
    d1.delayTime.value = 0.23;
    const d2 = ctx.createDelay(1.5);
    d2.delayTime.value = 0.37;
    const fb = ctx.createGain();
    fb.gain.value = 0.42; // < 1.0 — decays, never runs away
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    fbInput.connect(d1);
    d1.connect(d2);
    d2.connect(damp);
    damp.connect(fb);
    fb.connect(d1); // loop
    damp.connect(master);

    // listener sits at the LEFT stall, facing into the hall (+x)
    const L = ctx.listener;
    const lx = STALL_L.x * AUDIO_SCALE;
    if (L.positionX) {
      L.positionX.value = lx;
      L.positionY.value = 0;
      L.positionZ.value = 0;
      L.forwardX.value = 1;
      L.forwardY.value = 0;
      L.forwardZ.value = 0;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      // Safari legacy signature
      const legacy = L as unknown as {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (
          fx: number, fy: number, fz: number,
          ux: number, uy: number, uz: number,
        ) => void;
      };
      legacy.setPosition?.(lx, 0, 0);
      legacy.setOrientation?.(1, 0, 0, 0, 1, 0);
    }

    return { ctx, master, fbInput };
  }

  function setPanner(p: PannerNode, x: number, y: number) {
    // world (x = long axis, y = depth) → audio (X = x, Z = -y)
    const X = x * AUDIO_SCALE;
    const Z = -y * AUDIO_SCALE;
    if (p.positionX) {
      p.positionX.value = X;
      p.positionY.value = 0;
      p.positionZ.value = Z;
    } else {
      (p as unknown as { setPosition?: (a: number, b: number, c: number) => void })
        .setPosition?.(X, 0, Z);
    }
  }

  function voice(l: Live, freq: number, side: 0 | 1, delay: number, gain: number, x: number, y: number) {
    const { ctx } = l;
    const now = ctx.currentTime;

    const dly = ctx.createDelay(6);
    dly.delayTime.value = Math.min(delay, 5.9);

    const pan = ctx.createPanner();
    pan.panningModel = "HRTF";
    pan.distanceModel = "inverse";
    pan.refDistance = 1.4;
    pan.maxDistance = 24;
    pan.rolloffFactor = 0.9;
    setPanner(pan, x, y);

    const g = ctx.createGain();
    const dur = side === 0 ? 1.1 : 0.9;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0004, now + dur);

    // bell-ish partials; contrasting timbre per side
    const partials = side === 0 ? [1, 2.01, 3.0] : [1, 2.76, 5.4];
    const types: OscillatorType[] = side === 0 ? ["sine", "sine", "triangle"] : ["triangle", "sine", "sine"];
    const levels = side === 0 ? [1, 0.32, 0.14] : [0.8, 0.4, 0.16];
    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < partials.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = types[i];
      osc.frequency.value = freq * partials[i];
      const pg = ctx.createGain();
      pg.gain.value = levels[i];
      osc.connect(pg);
      pg.connect(g);
      osc.start(now);
      osc.stop(now + dur + 0.05);
      oscs.push(osc);
    }

    g.connect(dly);
    dly.connect(pan);
    pan.connect(l.master);
    pan.connect(l.fbInput);

    const last = oscs[oscs.length - 1];
    last.onended = () => {
      try {
        g.disconnect();
        dly.disconnect();
        pan.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  function tap(o: TapOpts) {
    const l = live;
    if (!l) return;
    if (l.ctx.state === "suspended") void l.ctx.resume();
    const lx = STALL_L.x;
    const ly = STALL_L.y;
    const dist = (ax: number, ay: number) => Math.hypot(ax - lx, ay - ly) / o.speed;

    // direct arrival — sound comes FROM the source direction
    voice(l, o.freq, o.side, dist(o.x, o.y), 0.9, o.x, o.y);

    // first-order image sources (wall reflections) — arrive later, quieter,
    // from the direction of the mirrored source
    const images: Array<[number, number]> = [
      [-2 * WALL.x - o.x, o.y],
      [2 * WALL.x - o.x, o.y],
      [o.x, -2 * WALL.y - o.y],
      [o.x, 2 * WALL.y - o.y],
    ];
    for (const [ix, iy] of images) {
      voice(l, o.freq, o.side, dist(ix, iy), 0.34, ix, iy);
    }
  }

  return {
    unlock() {
      if (!live) live = build();
      else if (live.ctx.state === "suspended") void live.ctx.resume();
    },
    ready() {
      return !!live && live.ctx.state === "running";
    },
    tap,
    close() {
      const l = live;
      live = null;
      if (!l) return;
      try {
        l.master.disconnect();
      } catch {
        /* noop */
      }
      void l.ctx.close();
    },
  };
}
