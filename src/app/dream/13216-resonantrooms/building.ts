// ─────────────────────────────────────────────────────────────────────────────
// building.ts — the eight-room floor plan, threshold/doorway math, per-room
// convolution-reverb specs, the equal-power acoustic-bleed crossfade, and the
// per-room source engine (lazy decode, HRTF pan, wet/dry routing).
//
// Eight SONGS as eight ROOMS in one building — every room is named for the one
// piece it plays, drawn only from Karel's two verified albums: five songs from
// Welcome Home and all three from the Snowflake EP. Each room has a different
// convolution tail (a tight bedroom vs a long stone hall), so the building's
// acoustics tell you where you are with your eyes shut. Standing in a doorway
// you hear BOTH adjacent rooms, equal-power-crossfaded by how far across the
// threshold you've stepped.
// ─────────────────────────────────────────────────────────────────────────────

import {
  WELCOME_HOME_TRACKS,
  SNOWFLAKE_TRACKS,
  loadRealTrackBuffer,
  type WelcomeHomeTrack,
} from "../_shared/welcomeHome";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";
import type { SafeMaster } from "../_shared/visionary/safeMaster";

// ── World -------------------------------------------------------------------
export const WORLD = { x0: 40, y0: 40, x1: 960, y1: 480 } as const;

/** Deterministic PRNG (only source of "jitter" anywhere in the piece). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
export const clamp01 = (v: number) => clamp(v, 0, 1);

// ── Room specs --------------------------------------------------------------
export interface RoomSpec {
  index: number;
  name: string;
  /** The real recording(s) this room plays — one song per room, looped. */
  tracks: readonly WelcomeHomeTrack[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Convolution tail length (s) — the room's acoustic size. */
  seconds: number;
  /** Decay steepness (higher = shorter tail). */
  decay: number;
  /** Human label for the acoustic character. */
  character: string;
}

// Rooms tile the region [40..960]x[40..480] exactly (no gaps, no overlap) as a
// 4x2 grid, so a listener is always inside exactly one room. Every room is ONE
// song and wears its title: the top row walks the Welcome Home album's opening
// (Interplay → Bath → Welcome Home) into Isolation; the bottom row holds the
// full Snowflake EP (Ghost, Realized, Snowflake) and closes at All Together.
// Reverb specs are all distinct (1.0s bedroom → 5.2s stone hall) so each room
// is unmistakable, and each acoustic is cast to fit its song.
const WH = WELCOME_HOME_TRACKS;
const SF = SNOWFLAKE_TRACKS;
const ROOM_DEFS = [
  { name: "Interplay", tracks: [WH[0]],
    x0: 40, y0: 40, x1: 270, y1: 240, seconds: 2.6, decay: 3.4, character: "warm living room" },
  { name: "Bath", tracks: [WH[1]],
    x0: 270, y0: 40, x1: 500, y1: 240, seconds: 3.0, decay: 2.6, character: "echoing tiled bath" },
  { name: "Welcome Home", tracks: [WH[2]],
    x0: 500, y0: 40, x1: 730, y1: 240, seconds: 4.0, decay: 2.0, character: "sunlit atrium" },
  { name: "Isolation", tracks: [WH[7]],
    x0: 730, y0: 40, x1: 960, y1: 240, seconds: 1.0, decay: 6.0, character: "close bedroom" },
  { name: "Ghost", tracks: [SF[2]],
    x0: 40, y0: 240, x1: 270, y1: 480, seconds: 2.1, decay: 3.0, character: "shadowed attic" },
  { name: "Realized", tracks: [SF[1]],
    x0: 270, y0: 240, x1: 500, y1: 480, seconds: 1.3, decay: 5.2, character: "tight bright practice room" },
  { name: "Snowflake", tracks: [SF[0]],
    x0: 500, y0: 240, x1: 730, y1: 480, seconds: 4.4, decay: 1.9, character: "glass conservatory" },
  { name: "All Together", tracks: [WH[12]],
    x0: 730, y0: 240, x1: 960, y1: 480, seconds: 5.2, decay: 1.6, character: "long stone hall" },
] as const;

export const ROOMS: RoomSpec[] = ROOM_DEFS.map((d, i) => ({
  index: i,
  ...d,
}));

export const roomCenter = (r: RoomSpec) => ({
  x: (r.x0 + r.x1) / 2,
  y: (r.y0 + r.y1) / 2,
});

// ── Doorways ----------------------------------------------------------------
// A doorway pierces the shared wall between two rooms. `axis:"v"` = a vertical
// wall (rooms side by side, crossing coordinate is x); `axis:"h"` = a horizontal
// wall (rooms stacked, crossing coordinate is y). `at` = the wall coordinate,
// `door` = the center of the opening along the wall, `span` = opening width.
export interface Doorway {
  a: number;
  b: number;
  axis: "v" | "h";
  at: number;
  door: number;
  span: number;
}

export const DOORWAYS: Doorway[] = [
  // top row, left to right (Interplay → Bath → Welcome Home → Isolation)
  { a: 0, b: 1, axis: "v", at: 270, door: 140, span: 74 },
  { a: 1, b: 2, axis: "v", at: 500, door: 140, span: 74 },
  { a: 2, b: 3, axis: "v", at: 730, door: 140, span: 74 },
  // bottom row, left to right (Ghost → Realized → Snowflake → All Together)
  { a: 4, b: 5, axis: "v", at: 270, door: 360, span: 74 },
  { a: 5, b: 6, axis: "v", at: 500, door: 360, span: 74 },
  { a: 6, b: 7, axis: "v", at: 730, door: 360, span: 74 },
  // stairwell doors joining the rows: both ends close the loop, plus one
  // interior shortcut so no room is ever more than three doorways away
  { a: 0, b: 4, axis: "h", at: 240, door: 155, span: 74 },
  { a: 1, b: 5, axis: "h", at: 240, door: 385, span: 74 },
  { a: 3, b: 7, axis: "h", at: 240, door: 845, span: 74 },
];

/** World-space center point of a doorway opening. */
export function doorwayPoint(d: Doorway): { x: number; y: number } {
  return d.axis === "v" ? { x: d.at, y: d.door } : { x: d.door, y: d.at };
}

// Bleed zone geometry (world px).
const BAND = 92; // half-width of the acoustic-bleed band around a wall
const MARGIN = 46; // soft falloff beyond the opening's edge

/** Which room contains (x,y); falls back to the nearest room if just outside. */
export function containingRoom(x: number, y: number): number {
  for (const r of ROOMS) {
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r.index;
  }
  let best = 0;
  let bestD = Infinity;
  for (const r of ROOMS) {
    const cx = clamp(x, r.x0, r.x1);
    const cy = clamp(y, r.y0, r.y1);
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = r.index;
    }
  }
  return best;
}

export interface RoomGains {
  gains: number[]; // length ROOMS.length, 0..1
  base: number;
  neighbor: number | null;
  /** 0..1 how deep into a doorway threshold the listener stands. */
  bleed: number;
}

/**
 * Equal-power acoustic bleed. Inside a room's interior only that room sounds
 * (gain 1). Approaching a doorway, its neighbor fades up on a cos/sin law until,
 * exactly on the threshold, both rooms are equal power (~0.707 each). At most two
 * rooms are ever audible — so no more than ~2 decoded sources are needed.
 */
export function computeRoomGains(x: number, y: number): RoomGains {
  const gains = new Array(ROOMS.length).fill(0) as number[];
  const base = containingRoom(x, y);

  let bestBleed = 0;
  let bestNeighbor: number | null = null;

  for (const d of DOORWAYS) {
    if (d.a !== base && d.b !== base) continue;
    const neighbor = d.a === base ? d.b : d.a;
    const perp = d.axis === "v" ? Math.abs(x - d.at) : Math.abs(y - d.at);
    const along = d.axis === "v" ? y : x;
    const off = Math.abs(along - d.door);
    const aligned = clamp01(1 - (off - d.span / 2) / MARGIN);
    const depth = clamp01(1 - perp / BAND);
    const bleed = aligned * depth;
    if (bleed > bestBleed) {
      bestBleed = bleed;
      bestNeighbor = neighbor;
    }
  }

  const theta = (bestBleed * Math.PI) / 4;
  gains[base] = Math.cos(theta);
  if (bestNeighbor !== null) gains[bestNeighbor] = Math.sin(theta);

  return { gains, base, neighbor: bestNeighbor, bleed: bestBleed };
}

// ── Auto-tour ---------------------------------------------------------------
// A seeded, constant-speed glide that threads room→doorway→room so the plan is
// visibly alive within ~1s with no audio. Waypoints step through doorway centers.
const TOUR: Array<{ x: number; y: number }> = [
  { x: 155, y: 140 }, // Interplay
  { x: 270, y: 140 }, // door 0|1
  { x: 385, y: 140 }, // Bath
  { x: 500, y: 140 }, // door 1|2
  { x: 615, y: 140 }, // Welcome Home
  { x: 730, y: 140 }, // door 2|3
  { x: 845, y: 140 }, // Isolation
  { x: 845, y: 240 }, // door 3|7
  { x: 845, y: 360 }, // All Together (stone hall)
  { x: 730, y: 360 }, // door 6|7
  { x: 615, y: 360 }, // Snowflake
  { x: 500, y: 360 }, // door 5|6
  { x: 385, y: 360 }, // Realized
  { x: 270, y: 360 }, // door 4|5
  { x: 155, y: 360 }, // Ghost
  { x: 155, y: 240 }, // door 0|4
  { x: 155, y: 140 }, // back to Interplay
];

const TOUR_LEN: number[] = (() => {
  const segs: number[] = [];
  for (let i = 0; i < TOUR.length - 1; i++) {
    segs.push(Math.hypot(TOUR[i + 1].x - TOUR[i].x, TOUR[i + 1].y - TOUR[i].y));
  }
  return segs;
})();
const TOUR_TOTAL = TOUR_LEN.reduce((s, v) => s + v, 0);
const jitterRnd = mulberry32(0x13216);
const JITTER_PHASE = jitterRnd() * Math.PI * 2;

/** Position along the tour for elapsed seconds `t` (loops). ~46s per lap. */
export function tourPosition(t: number): { x: number; y: number } {
  const LAP = 46;
  let dist = ((t % LAP) / LAP) * TOUR_TOTAL;
  let i = 0;
  while (i < TOUR_LEN.length && dist > TOUR_LEN[i]) {
    dist -= TOUR_LEN[i];
    i++;
  }
  if (i >= TOUR_LEN.length) i = TOUR_LEN.length - 1;
  const f = TOUR_LEN[i] > 0 ? dist / TOUR_LEN[i] : 0;
  const ef = f * f * (3 - 2 * f); // smoothstep within the segment
  const a = TOUR[i];
  const b = TOUR[i + 1];
  const jit = 5 * Math.sin(t * 0.7 + JITTER_PHASE);
  return {
    x: clamp(a.x + (b.x - a.x) * ef, WORLD.x0 + 8, WORLD.x1 - 8),
    y: clamp(a.y + (b.y - a.y) * ef + jit, WORLD.y0 + 8, WORLD.y1 - 8),
  };
}

// ── Per-room source engine --------------------------------------------------
const WORLD_TO_M = 1 / 120; // world px → meters for the HRTF field
const CAP = 3; // max concurrent decoded rooms

interface RoomVoice {
  reverb: VoidReverb;
  panner: PannerNode;
  roomGain: GainNode;
  dryGain: GainNode;
  source: AudioBufferSourceNode | null;
  trackIdx: number;
  loading: boolean;
  /** ms timestamp of the last failed load — gates retry backoff. */
  failedAt: number;
  title: string;
}

/** Don't re-attempt a failed room load more often than this (ms). */
const RETRY_MS = 5_000;

function setPannerPos(p: PannerNode, x: number, y: number, ctx: AudioContext) {
  // audio field is a top-down plane mapped onto x (L/R) and z (front/back)
  const mx = (x - (WORLD.x0 + WORLD.x1) / 2) * WORLD_TO_M;
  const mz = (y - (WORLD.y0 + WORLD.y1) / 2) * WORLD_TO_M;
  if (p.positionX) {
    const now = ctx.currentTime;
    p.positionX.setTargetAtTime(mx, now, 0.05);
    p.positionY.setTargetAtTime(0, now, 0.05);
    p.positionZ.setTargetAtTime(mz, now, 0.05);
  } else {
    // deprecated fallback
    (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(mx, 0, mz);
  }
}

/**
 * Owns the live audio graph. Only rooms the listener is in / bleeding into hold a
 * decoded, playing source; everything else is torn down to respect the cap.
 */
export class RoomEngine {
  private ctx: AudioContext;
  private master: SafeMaster;
  private voices = new Map<number, RoomVoice>();
  /** Rooms whose real audio failed to load — surfaced as "unreachable". */
  readonly unreachable = new Set<number>();
  private disposed = false;

  constructor(ctx: AudioContext, master: SafeMaster) {
    this.ctx = ctx;
    this.master = master;
  }

  /** Move the AudioListener with the walk. */
  moveListener(x: number, y: number) {
    const l = this.ctx.listener;
    const mx = (x - (WORLD.x0 + WORLD.x1) / 2) * WORLD_TO_M;
    const mz = (y - (WORLD.y0 + WORLD.y1) / 2) * WORLD_TO_M;
    if (l.positionX) {
      const now = this.ctx.currentTime;
      l.positionX.setTargetAtTime(mx, now, 0.05);
      l.positionY.setTargetAtTime(0, now, 0.05);
      l.positionZ.setTargetAtTime(mz, now, 0.05);
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(mx, 0, mz);
    }
  }

  private buildVoice(spec: RoomSpec): RoomVoice {
    const ctx = this.ctx;
    const reverb = createVoidReverb(ctx, { seconds: spec.seconds, decay: spec.decay, wet: 1 });

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "linear";
    panner.rolloffFactor = 0; // we manage level via bleed; keep pure direction
    panner.refDistance = 1;
    const c = roomCenter(spec);
    setPannerPos(panner, c.x, c.y, ctx);

    const roomGain = ctx.createGain();
    roomGain.gain.value = 0;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.3;

    // source -> panner -> roomGain -> { reverb.input (wet) , dryGain (dry) } -> master
    panner.connect(roomGain);
    roomGain.connect(reverb.input);
    reverb.output.connect(this.master.input);
    roomGain.connect(dryGain);
    dryGain.connect(this.master.input);

    return { reverb, panner, roomGain, dryGain, source: null, trackIdx: 0, loading: false, failedAt: 0, title: "" };
  }

  private startSource(v: RoomVoice, buffer: AudioBuffer, roomIndex: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(v.panner);
    const single = ROOMS[roomIndex].tracks.length === 1;
    if (single) {
      // one song per room: loop the decoded buffer forever — no re-fetch, no
      // re-decode, no network dependence once a room has loaded once
      src.loop = true;
    } else {
      src.onended = () => {
        if (this.disposed) return;
        const cur = this.voices.get(roomIndex);
        if (cur !== v || cur.source !== src) return;
        cur.source = null;
        cur.trackIdx = (cur.trackIdx + 1) % Math.max(1, ROOMS[roomIndex].tracks.length);
        if (cur.roomGain.gain.value > 0.001) void this.loadInto(roomIndex);
      };
    }
    v.source = src;
    src.start();
  }

  private async loadInto(roomIndex: number) {
    const v = this.voices.get(roomIndex);
    if (!v || v.loading || v.source || this.disposed) return;
    if (v.failedAt && performance.now() - v.failedAt < RETRY_MS) return;
    const tracks = ROOMS[roomIndex].tracks;
    if (tracks.length === 0) return;
    v.loading = true;
    const track = tracks[v.trackIdx % tracks.length];
    try {
      const { buffer, title } = await loadRealTrackBuffer(this.ctx, track.id);
      if (this.disposed) return;
      const still = this.voices.get(roomIndex);
      if (still !== v) return;
      v.title = title;
      v.failedAt = 0;
      this.unreachable.delete(roomIndex);
      this.startSource(v, buffer, roomIndex);
    } catch {
      v.failedAt = performance.now();
      this.unreachable.add(roomIndex);
    } finally {
      v.loading = false;
    }
  }

  /** Ensure a room is decoded + playing (respecting the concurrency cap). */
  ensure(roomIndex: number) {
    if (this.disposed) return;
    if (this.voices.has(roomIndex)) return;
    if (this.voices.size >= CAP) return;
    this.voices.set(roomIndex, this.buildVoice(ROOMS[roomIndex]));
    void this.loadInto(roomIndex);
  }

  private release(roomIndex: number) {
    const v = this.voices.get(roomIndex);
    if (!v) return;
    this.voices.delete(roomIndex);
    try {
      if (v.source) {
        v.source.onended = null;
        v.source.stop();
        v.source.disconnect();
      }
      v.panner.disconnect();
      v.roomGain.disconnect();
      v.dryGain.disconnect();
      v.reverb.output.disconnect();
      v.reverb.input.disconnect();
    } catch {
      /* closing */
    }
  }

  /** Apply the per-frame gains: spin up audible rooms, tear down silent ones. */
  apply(gains: number[]) {
    if (this.disposed) return;
    for (let i = 0; i < gains.length; i++) {
      const g = gains[i];
      if (g > 0.001) {
        this.ensure(i);
        const v = this.voices.get(i);
        if (v) {
          v.roomGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.08);
          if (!v.source && !v.loading) void this.loadInto(i);
        }
      } else {
        const v = this.voices.get(i);
        if (v) {
          v.roomGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
          this.release(i);
        }
      }
    }
  }

  dispose() {
    this.disposed = true;
    for (const i of Array.from(this.voices.keys())) this.release(i);
  }
}
