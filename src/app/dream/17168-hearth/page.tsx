"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17168-hearth — a listening room that REMEMBERS everyone who ever listened in it.
//
//   ONE QUESTION
//   What if a listening room remembered everyone who ever listened in it — so the
//   room itself grows warmer, session after session, from the attention held
//   inside it?
//
//   Two people (or two browser tabs) join ONE synchronized session and listen to
//   Karel's real piano take together. Each is a soft presence in a shared warm
//   field. When two presences hold NEAR each other AND move gently, their co-present
//   attention rises — and that shared attention DEPOSITS warmth into the field at
//   the locus between them. The warmth is REMEMBERED per-room (in IndexedDB) as a
//   compact set of warm deposits, so the room a visitor enters already carries the
//   warmth of everyone who listened before. Collective listening as accreted
//   material, not a stream.
//
//   RENDERER  Raw WebGPU. A compute shader steps a warm scalar FIELD each frame
//   (diffuse + settle + remembered-warmth sources + the live attention deposit);
//   a render pass tone-maps it into ember / honey / amber-through-violet glow.
//   No Canvas2D fallback — if WebGPU is unavailable the room shows an on-brand
//   notice and a static warm still.
//
//   AUDIO  Karel's real catalog only (Welcome Home + Snowflake), routed through
//   the ear-safe master bus. The take is anchored to a shared instant so it starts
//   sample-close on both peers. No synth, ever.
//
//   REFS  Devon Turnbull, "HiFi Pursuit Listening Room Dream No. 3" (Cooper Hewitt,
//   Dec 2025–Jul 2026); UCL Bartlett "Urban Listening Room" (2026) — both frame
//   listening as a collective, inhabited ROOM. Pauline Oliveros — Deep Listening
//   (listening together as a discipline). See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createPeerSync,
  type PeerSync,
  type PeerClockInfo,
} from "../_shared/peerSync";

// ── constants ────────────────────────────────────────────────────────────────

const ROOM = "hearth";
const GRID = 160; // field resolution (GRID×GRID scalar warmth cells)
const MAX_DEPOSITS = 96; // remembered warm loci cap (compact per-room memory)
const POS_SEND_MS = 55; // ~18 Hz presence broadcast
const PROX_THRESHOLD = 0.42; // uv distance at which nearness fades to zero
const SPEED_LO = 0.04; // uv/sec: below this, motion reads as "gentle"
const SPEED_HI = 0.5; // uv/sec: above this, motion reads as "frantic"
const RECORD_MS = 3500; // how often held attention accretes a remembered deposit
const CHECKPOINT_MS = 8000; // how often the remembered field is persisted
const SYNTH_PRIOR = 12; // synthetic "prior held sessions" seeded on a cold room

interface Vec2 {
  x: number;
  y: number;
}
interface Deposit {
  x: number; // 0..1 (presence space, y-down)
  y: number;
  w: number; // accreted warmth
}
interface AnchorInfo {
  S: number;
  O: number;
  trackId: string;
}

// ── small helpers (never prefixed `use`) ─────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// ── remembered warmth store (IndexedDB, compact deposit list per room+track) ──
// Inlined (the brief allows only page.tsx + README.md in this folder). All access
// is wrapped so a private window / blocked storage degrades to in-memory only.

const DB_NAME = "resonance-hearth";
const STORE = "rooms";

function hasIDB(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}
function roomKey(track: string): string {
  return `${ROOM}:${track}`;
}
function openHearthDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
}
async function loadDeposits(track: string): Promise<Deposit[] | null> {
  if (!hasIDB()) return null;
  try {
    const db = await openHearthDb();
    const doc = await new Promise<{ deposits?: Deposit[] } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const rq = tx.objectStore(STORE).get(roomKey(track));
        rq.onsuccess = () =>
          resolve(rq.result as { deposits?: Deposit[] } | undefined);
        rq.onerror = () => reject(rq.error);
      },
    );
    db.close();
    const arr = doc?.deposits;
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}
async function saveDeposits(track: string, deposits: Deposit[]): Promise<void> {
  if (!hasIDB()) return;
  try {
    // Round to keep the record tiny.
    const compact = deposits.map((d) => ({
      x: Math.round(d.x * 1000) / 1000,
      y: Math.round(d.y * 1000) / 1000,
      w: Math.round(d.w * 1000) / 1000,
    }));
    const db = await openHearthDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key: roomKey(track), deposits: compact });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* private mode / quota — stay in-memory this session */
  }
}

// Deterministic warm loci for a COLD room, so the "this room remembers being
// listened in" payoff reads on the first muted frame, before any peer joins.
function makeSyntheticPriors(): Deposit[] {
  const out: Deposit[] = [];
  const golden = 2.399963; // golden angle (rad)
  for (let i = 0; i < SYNTH_PRIOR; i++) {
    const a = i * golden;
    const r = 0.12 + 0.32 * Math.sqrt((i + 0.5) / SYNTH_PRIOR);
    const x = clamp01(0.5 + Math.cos(a) * r * 1.05);
    const y = clamp01(0.5 + Math.sin(a) * r);
    const w = 0.42 + 0.55 * ((Math.sin(i * 12.9898) * 43758.5453) % 1);
    out.push({ x, y, w: 0.42 + Math.abs(w) * 0.6 });
  }
  return out;
}

// Accrete held attention into the remembered deposit list: repeated listening in
// a similar locus deepens an existing deposit (grows warmer); a new locus adds a
// deposit until the cap, then reinforces the nearest remembered one.
function accreteDeposit(
  list: Deposit[],
  x: number,
  y: number,
  w: number,
): void {
  let bestI = -1;
  let bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = Math.hypot(list[i].x - x, list[i].y - y);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  if (bestI >= 0 && bestD < 0.07) {
    const d = list[bestI];
    d.w = Math.min(d.w + w, 2.6);
    d.x = lerp(d.x, x, 0.15);
    d.y = lerp(d.y, y, 0.15);
  } else if (list.length < MAX_DEPOSITS) {
    list.push({ x, y, w });
  } else if (bestI >= 0) {
    list[bestI].w = Math.min(list[bestI].w + w * 0.5, 2.6);
  }
}

// Seed a CPU-side field from the remembered deposits so the FIRST rendered frame
// already carries prior warmth (before the compute step has run at all).
function seedField(deposits: Deposit[]): Float32Array {
  const f = new Float32Array(GRID * GRID);
  const rad = 0.14;
  const inv = 1 / (rad * rad);
  for (const d of deposits) {
    const cx = d.x * GRID;
    const cy = d.y * GRID;
    const span = Math.ceil(rad * GRID * 2.5);
    const x0 = Math.max(0, Math.floor(cx - span));
    const x1 = Math.min(GRID - 1, Math.ceil(cx + span));
    const y0 = Math.max(0, Math.floor(cy - span));
    const y1 = Math.min(GRID - 1, Math.ceil(cy + span));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ux = (x + 0.5) / GRID - d.x;
        const uy = (y + 0.5) / GRID - d.y;
        const g = Math.exp(-(ux * ux + uy * uy) * inv);
        f[y * GRID + x] += d.w * g * 1.6;
      }
    }
  }
  for (let i = 0; i < f.length; i++) if (f[i] > 4) f[i] = 4;
  return f;
}

// ── WGSL ─────────────────────────────────────────────────────────────────────

const COMPUTE_WGSL = /* wgsl */ `
struct Params {
  grid: u32,
  nDep: u32,
  decay: f32,
  diffuse: f32,
  liveX: f32,
  liveY: f32,
  liveStr: f32,
  liveRad: f32,
  memGain: f32,
  memRad: f32,
  audio: f32,
  time: f32,
}
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<uniform> P: Params;
@group(0) @binding(3) var<storage, read> deps: array<vec4f>;

fn at(x: i32, y: i32, g: i32) -> f32 {
  let cx = clamp(x, 0, g - 1);
  let cy = clamp(y, 0, g - 1);
  return src[cy * g + cx];
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let g = i32(P.grid);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= g || y >= g) { return; }

  let c = at(x, y, g);
  let lap = (at(x, y - 1, g) + at(x, y + 1, g) + at(x - 1, y, g) + at(x + 1, y, g)) * 0.25 - c;
  var v = c + P.diffuse * lap;   // diffuse — warmth settles outward
  v = v * P.decay;               // gentle decay — the field relaxes over time

  let uv = vec2f((f32(x) + 0.5) / f32(g), (f32(y) + 0.5) / f32(g));

  // Remembered warmth: a persistent low source from every stored deposit, so the
  // field keeps the warmth of everyone who listened before, even with no one here.
  var mem = 0.0;
  let nd = i32(P.nDep);
  for (var i = 0; i < nd; i = i + 1) {
    let d = deps[i];
    let dd = distance(uv, vec2f(d.x, d.y));
    mem = mem + d.z * exp(-(dd * dd) / (P.memRad * P.memRad));
  }
  v = v + mem * P.memGain;

  // Live co-present attention deposit at the shared locus (bright, music-lit).
  if (P.liveStr > 0.0001) {
    let dl = distance(uv, vec2f(P.liveX, P.liveY));
    v = v + P.liveStr * (0.55 + 0.55 * P.audio) * exp(-(dl * dl) / (P.liveRad * P.liveRad));
  }

  dst[y * g + x] = clamp(v, 0.0, 4.0);
}
`;

const RENDER_WGSL = /* wgsl */ `
struct RP { grid: u32, time: f32, glow: f32, att: f32 }
@group(0) @binding(0) var<storage, read> field: array<f32>;
@group(0) @binding(1) var<uniform> R: RP;

struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }

@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let xy = pos[i];
  return V(vec4f(xy, 0.0, 1.0), xy * 0.5 + 0.5);
}

fn fieldAt(uv: vec2f) -> f32 {
  let gi = i32(R.grid);
  let g = f32(R.grid);
  let fx = clamp(uv.x, 0.0, 0.99999) * g - 0.5;
  let fy = clamp(uv.y, 0.0, 0.99999) * g - 0.5;
  let x0 = i32(floor(fx));
  let y0 = i32(floor(fy));
  let tx = fx - floor(fx);
  let ty = fy - floor(fy);
  let cx0 = clamp(x0, 0, gi - 1);
  let cy0 = clamp(y0, 0, gi - 1);
  let cx1 = clamp(x0 + 1, 0, gi - 1);
  let cy1 = clamp(y0 + 1, 0, gi - 1);
  let a = field[cy0 * gi + cx0];
  let b = field[cy0 * gi + cx1];
  let c = field[cy1 * gi + cx0];
  let d = field[cy1 * gi + cx1];
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

@fragment fn fs(v: V) -> @location(0) vec4f {
  let uv = v.uv;
  // sample in y-down field space (presence + compute share y-down)
  let w = fieldAt(vec2f(uv.x, 1.0 - uv.y));

  let ground = vec3f(0.035, 0.022, 0.028);
  let ember  = vec3f(0.44, 0.11, 0.05);
  let amber  = vec3f(0.95, 0.42, 0.13);
  let honey  = vec3f(1.00, 0.74, 0.36);
  let rose   = vec3f(1.00, 0.58, 0.44);
  let violet = vec3f(0.86, 0.60, 0.82);

  var col = ground;
  col = mix(col, ember,  smoothstep(0.02, 0.35, w));
  col = mix(col, amber,  smoothstep(0.30, 0.72, w));
  col = mix(col, honey,  smoothstep(0.66, 1.15, w));
  col = mix(col, rose,   smoothstep(1.10, 1.75, w));
  col = mix(col, violet, smoothstep(1.75, 2.7, w) * 0.6);

  // Warm bloom on the hottest cores, lifted gently by the music.
  col = col + honey * smoothstep(0.9, 2.4, w) * (0.10 + 0.14 * R.glow);

  // Slow luminance drift only — no strobe, no grain.
  let drift = 0.92 + 0.08 * sin(R.time * 0.10 + uv.x * 1.3 + uv.y * 0.7);
  col = col * drift;

  // Intimate vignette.
  let vd = distance(uv, vec2f(0.5, 0.5));
  col = col * (smoothstep(0.98, 0.22, vd) * 0.38 + 0.62);

  // Soft warm tone map.
  col = col / (col + vec3f(0.55));
  col = pow(max(col, vec3f(0.0)), vec3f(0.85));
  return vec4f(col, 1.0);
}
`;

// ── GPU state ────────────────────────────────────────────────────────────────

interface GpuState {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  fieldBuf: [GPUBuffer, GPUBuffer];
  cur: 0 | 1;
  depsBuf: GPUBuffer;
  paramsBuf: GPUBuffer;
  rparamsBuf: GPUBuffer;
  computePl: GPUComputePipeline;
  renderPl: GPURenderPipeline;
}

async function buildGpu(
  canvas: HTMLCanvasElement,
  seed: Float32Array,
): Promise<GpuState> {
  const gpu = navigator.gpu;
  if (!gpu) throw new Error("no-webgpu");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("no-adapter");
  const device = await adapter.requestDevice();

  const fmt = gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-context");
  ctx.configure({ device, format: fmt, alphaMode: "premultiplied" });

  const bytes = GRID * GRID * 4;
  const mkField = (): GPUBuffer =>
    device.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  const fieldBuf: [GPUBuffer, GPUBuffer] = [mkField(), mkField()];
  // Seed BOTH buffers so the very first frame already carries remembered warmth.
  device.queue.writeBuffer(fieldBuf[0], 0, seed.buffer as ArrayBuffer, 0, bytes);
  device.queue.writeBuffer(fieldBuf[1], 0, seed.buffer as ArrayBuffer, 0, bytes);

  const depsBuf = device.createBuffer({
    size: MAX_DEPOSITS * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const paramsBuf = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const rparamsBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: COMPUTE_WGSL }),
      entryPoint: "main",
    },
  });
  const rmod = device.createShaderModule({ code: RENDER_WGSL });
  const renderPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: rmod, entryPoint: "vs" },
    fragment: { module: rmod, entryPoint: "fs", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });

  return {
    device,
    ctx,
    fieldBuf,
    cur: 0,
    depsBuf,
    paramsBuf,
    rparamsBuf,
    computePl,
    renderPl,
  };
}

function destroyGpu(g: GpuState): void {
  try {
    g.fieldBuf[0].destroy();
    g.fieldBuf[1].destroy();
    g.depsBuf.destroy();
    g.paramsBuf.destroy();
    g.rparamsBuf.destroy();
    g.device.destroy?.();
  } catch {
    /* already torn down */
  }
}

// ── component ────────────────────────────────────────────────────────────────

export default function HearthPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI state (display only — the engine lives in refs to avoid render churn)
  const [entered, setEntered] = useState(false);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("idle");
  const [backend, setBackend] = useState("solo");
  const [peerCount, setPeerCount] = useState(0);
  const [clock, setClock] = useState<PeerClockInfo>({ offsetMs: 0, rttMs: 0 });
  const [gpuBad, setGpuBad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [trackId, setTrackId] = useState(COLLECTIONS[0].tracks[0].id);
  const [trackTitle, setTrackTitle] = useState(COLLECTIONS[0].tracks[0].title);
  const [attView, setAttView] = useState(0);
  const [depCount, setDepCount] = useState(0);
  const [seededPrior, setSeededPrior] = useState(false);
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [hostPaste, setHostPaste] = useState("");
  const [guestPaste, setGuestPaste] = useState("");

  // Engine refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const roomFilterRef = useRef<BiquadFilterNode | null>(null);
  const syncRef = useRef<PeerSync | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startInfoRef = useRef<AnchorInfo | null>(null);
  const bufDurRef = useRef(0);
  const enteredRef = useRef(false);
  const startedRef = useRef(false);
  const startingRef = useRef(false);
  const currentTrackRef = useRef(trackId);

  // Presence + attention (screen-normalized, y DOWN)
  const selfTargetRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const selfSmoothRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const selfPrevRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const otherTargetRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const otherSmoothRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const otherPrevRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const selfSpeedRef = useRef(0);
  const otherSpeedRef = useRef(0);
  const attRef = useRef(0);
  const lastSendRef = useRef(0);

  // Remembered warmth (compact deposit list) + dirty flag for GPU upload.
  const depositsRef = useRef<Deposit[]>([]);
  const depsDirtyRef = useRef(true);
  const pendingSeedRef = useRef<Float32Array | null>(null);
  const lastRecordRef = useRef(0);
  const lastSaveRef = useRef(0);

  const actionsRef = useRef<{
    enter: () => void;
    reanchor: () => void;
    createOffer: () => void;
    acceptAnswer: (code: string) => void;
    acceptOffer: (code: string) => void;
  } | null>(null);

  useEffect(() => {
    currentTrackRef.current = trackId;
  }, [trackId]);

  // ── the one big engine effect: memory, transport, audio, WebGPU render ──────
  useEffect(() => {
    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas: HTMLCanvasElement = canvasMaybe;

    let cancelled = false;
    let raf = 0;
    let gpu: GpuState | null = null;

    // ---- peerSync wiring --------------------------------------------------
    const refresh = () => {
      const s = syncRef.current;
      if (!s) return;
      setBackend(s.getBackend());
      setPeerCount(s.peers().length);
    };

    const sync = createPeerSync({
      room: ROOM,
      onStatus: (st) => {
        setStatus(st);
        refresh();
      },
      onPeers: () => refresh(),
      onClock: (info) => setClock(info),
      onMessage: (payload) => onPeerMessage(payload),
    });
    syncRef.current = sync;
    sync.startLocal(); // zero-click two-tab review path
    refresh();

    function onPeerMessage(payload: unknown): void {
      if (!isRecord(payload)) return;
      const t = payload.t;
      if (t === "pos") {
        const { x, y } = payload;
        if (typeof x === "number" && typeof y === "number") {
          otherTargetRef.current = { x: clamp01(x), y: clamp01(y) };
        }
      } else if (t === "play" || t === "anchor") {
        const { S, O, trackId: tid } = payload;
        if (typeof S === "number" && typeof O === "number") {
          const id = typeof tid === "string" ? tid : currentTrackRef.current;
          void handleAnchor(S, O, id, t === "play");
        }
      }
    }

    // ---- audio graph ------------------------------------------------------
    async function ensureTrack(
      ctx: AudioContext,
      id: string,
    ): Promise<AudioBuffer | null> {
      const cached = buffersRef.current.get(id);
      if (cached) {
        bufDurRef.current = cached.duration;
        return cached;
      }
      try {
        const { buffer, title } = await loadRealTrackBuffer(ctx, id);
        buffersRef.current.set(id, buffer);
        bufDurRef.current = buffer.duration;
        if (id === currentTrackRef.current) setTrackTitle(title);
        return buffer;
      } catch {
        setError(
          "Could not load Karel's recording. Check the connection and re-enter.",
        );
        return null;
      }
    }

    function stopSource(): void {
      const node = srcRef.current;
      if (node) {
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
        try {
          node.disconnect();
        } catch {
          /* detached */
        }
        srcRef.current = null;
      }
    }

    // The ONE audible path: source → warm room lowpass → safe master.
    async function startPlayback(S: number, O: number, id: string): Promise<void> {
      const ctx = ctxRef.current;
      const filter = roomFilterRef.current;
      const s = syncRef.current;
      if (!ctx || !filter || !s || startingRef.current) return;
      startingRef.current = true;
      try {
        const buf = await ensureTrack(ctx, id);
        if (!buf) return;
        currentTrackRef.current = id;
        stopSource();

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(filter);

        const delay = (S - s.now()) / 1000;
        let offset = O;
        let startAt = ctx.currentTime;
        if (delay > 0) startAt = ctx.currentTime + delay;
        else offset = O - delay; // late join → jump into the take
        offset = ((offset % buf.duration) + buf.duration) % buf.duration;

        src.start(startAt, offset);
        srcRef.current = src;
        startInfoRef.current = { S, O, trackId: id };
        startedRef.current = true;
        setStarted(true);
      } finally {
        startingRef.current = false;
      }
    }

    async function handleAnchor(
      S: number,
      O: number,
      id: string,
      force: boolean,
    ): Promise<void> {
      if (!enteredRef.current || !ctxRef.current) return;
      if (startedRef.current && !force) return;
      await startPlayback(S, O, id);
    }

    function startTransport(): void {
      const s = syncRef.current;
      if (!s) return;
      const id = currentTrackRef.current;
      const S = s.now() + 700;
      s.send({ t: "play", S, O: 0, trackId: id });
      void startPlayback(S, 0, id);
    }

    function sendAnchor(): void {
      const s = syncRef.current;
      const info = startInfoRef.current;
      if (!s || !info) return;
      const elapsed = (s.now() - info.S) / 1000;
      const S2 = s.now() + 500;
      const O2 = info.O + elapsed + 0.5;
      s.send({ t: "anchor", S: S2, O: O2, trackId: info.trackId });
    }

    // Host auto-starts; then re-anchors periodically so a late joiner catches up.
    const keeper = setInterval(() => {
      const s = syncRef.current;
      if (!s || !enteredRef.current) return;
      if (s.isHost()) {
        if (!startedRef.current) startTransport();
        else sendAnchor();
      }
    }, 2000);

    // ---- memory: load remembered warmth (or seed a cold room) -------------
    void (async () => {
      const loaded = await loadDeposits(currentTrackRef.current);
      if (cancelled) return;
      if (loaded && loaded.length > 0) {
        depositsRef.current = loaded;
        setSeededPrior(false);
      } else {
        depositsRef.current = makeSyntheticPriors();
        setSeededPrior(true);
      }
      depsDirtyRef.current = true;
      // Re-seed the live field from the resolved memory (the GPU may already be
      // running from the provisional synthetic seed).
      pendingSeedRef.current = seedField(depositsRef.current);
      setDepCount(depositsRef.current.length);
    })();

    // ---- actions exposed to the UI ----------------------------------------
    actionsRef.current = {
      enter: () => {
        if (enteredRef.current) return;
        void (async () => {
          const AC =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (!AC) {
            setError("Web Audio is unavailable in this browser.");
            return;
          }
          const ctx = new AC();
          await ctx.resume();
          const master = createSafeMaster(ctx);
          // A single warm "room" lowpass, opening as the room's attention rises.
          const filter = ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 2600;
          filter.Q.value = 0.7071;
          filter.connect(master.input);

          ctxRef.current = ctx;
          masterRef.current = master;
          roomFilterRef.current = filter;

          const buf = await ensureTrack(ctx, currentTrackRef.current);
          if (!buf) return;
          enteredRef.current = true;
          setEntered(true);
          if (syncRef.current?.isHost()) startTransport();
        })();
      },
      reanchor: () => {
        const s = syncRef.current;
        if (!s || !s.isHost()) return;
        startedRef.current = false;
        setStarted(false);
        startTransport();
      },
      createOffer: () => {
        void (async () => {
          const s = syncRef.current;
          if (!s) return;
          try {
            const code = await s.createOffer();
            setOfferCode(code);
            refresh();
          } catch {
            setError("Could not create an invite (WebRTC unavailable?).");
          }
        })();
      },
      acceptAnswer: (code) => {
        void (async () => {
          const s = syncRef.current;
          if (!s || !code.trim()) return;
          try {
            await s.acceptAnswer(code.trim());
            refresh();
          } catch {
            setError("That reply code could not be read.");
          }
        })();
      },
      acceptOffer: (code) => {
        void (async () => {
          const s = syncRef.current;
          if (!s || !code.trim()) return;
          try {
            const ans = await s.acceptOffer(code.trim());
            setAnswerCode(ans);
            refresh();
          } catch {
            setError("That invite code could not be read.");
          }
        })();
      },
    };

    // ---- WebGPU renderer (required; on-brand notice on failure) -----------
    const gpuApi = navigator.gpu;
    if (!gpuApi) {
      setGpuBad(true);
      return () => {
        clearInterval(keeper);
        try {
          sync.destroy();
        } catch {
          /* gone */
        }
        syncRef.current = null;
      };
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sizeCanvas = (): void => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    sizeCanvas();

    const params = new ArrayBuffer(48);
    const pf = new Float32Array(params);
    const pu = new Uint32Array(params);
    const rparams = new ArrayBuffer(16);
    const rf = new Float32Array(rparams);
    const ru = new Uint32Array(rparams);
    const depsArr = new Float32Array(MAX_DEPOSITS * 4);
    const freq = new Uint8Array(512);

    // Advance presence + shared attention for one frame (mirrors the attune idea).
    function stepAttention(dt: number, tSec: number): {
      locus: Vec2;
      att: number;
      audio: number;
    } {
      const s = syncRef.current;
      const connected = !!s && s.connected();

      if (connected) {
        otherSmoothRef.current = {
          x: lerp(otherSmoothRef.current.x, otherTargetRef.current.x, 0.12),
          y: lerp(otherSmoothRef.current.y, otherTargetRef.current.y, 0.12),
        };
      } else {
        // Solo: a slow breathing ambient presence to attune to.
        otherSmoothRef.current = {
          x: 0.5 + 0.17 * Math.sin(tSec * 0.11),
          y: 0.5 + 0.13 * Math.sin(tSec * 0.09 + 1.0),
        };
      }
      selfSmoothRef.current = {
        x: lerp(selfSmoothRef.current.x, selfTargetRef.current.x, 0.18),
        y: lerp(selfSmoothRef.current.y, selfTargetRef.current.y, 0.18),
      };

      const safeDt = Math.max(dt, 1e-3);
      const selfV =
        Math.hypot(
          selfSmoothRef.current.x - selfPrevRef.current.x,
          selfSmoothRef.current.y - selfPrevRef.current.y,
        ) / safeDt;
      const otherV =
        Math.hypot(
          otherSmoothRef.current.x - otherPrevRef.current.x,
          otherSmoothRef.current.y - otherPrevRef.current.y,
        ) / safeDt;
      selfSpeedRef.current = lerp(selfSpeedRef.current, selfV, 0.2);
      otherSpeedRef.current = lerp(otherSpeedRef.current, otherV, 0.2);
      selfPrevRef.current = { ...selfSmoothRef.current };
      otherPrevRef.current = { ...otherSmoothRef.current };

      const d = Math.hypot(
        selfSmoothRef.current.x - otherSmoothRef.current.x,
        selfSmoothRef.current.y - otherSmoothRef.current.y,
      );
      const nearness = 1 - smoothstep(0, PROX_THRESHOLD, d);
      const gentleSelf = 1 - smoothstep(SPEED_LO, SPEED_HI, selfSpeedRef.current);
      const gentleOther = 1 - smoothstep(SPEED_LO, SPEED_HI, otherSpeedRef.current);
      const target = nearness * gentleSelf * gentleOther;
      const rising = target > attRef.current;
      attRef.current = lerp(attRef.current, target, clamp01((rising ? 0.7 : 2.2) * safeDt));

      let audio = 0;
      const analyser = masterRef.current?.analyser;
      if (analyser) {
        const n = Math.min(analyser.frequencyBinCount, freq.length);
        analyser.getByteFrequencyData(freq);
        let sum = 0;
        for (let i = 0; i < n; i++) sum += freq[i];
        audio = sum / (n * 255);
      }

      // Warm room lowpass opens with the room's attention.
      const ctx = ctxRef.current;
      const filter = roomFilterRef.current;
      if (ctx && filter) {
        filter.frequency.setTargetAtTime(2600 + attRef.current * 9000, ctx.currentTime, 0.25);
      }

      return {
        locus: {
          x: (selfSmoothRef.current.x + otherSmoothRef.current.x) * 0.5,
          y: (selfSmoothRef.current.y + otherSmoothRef.current.y) * 0.5,
        },
        att: attRef.current,
        audio,
      };
    }

    // Accrete held attention into the remembered field, and persist periodically.
    function maybeRemember(nowMs: number, locus: Vec2, att: number): void {
      if (att > 0.34 && nowMs - lastRecordRef.current > RECORD_MS) {
        lastRecordRef.current = nowMs;
        accreteDeposit(depositsRef.current, locus.x, locus.y, 0.16 + att * 0.4);
        depsDirtyRef.current = true;
        setDepCount(depositsRef.current.length);
        setSeededPrior(false); // real listening now lives in the field
      }
      if (nowMs - lastSaveRef.current > CHECKPOINT_MS && depositsRef.current.length) {
        lastSaveRef.current = nowMs;
        void saveDeposits(currentTrackRef.current, depositsRef.current);
      }
    }

    let prevT = performance.now();
    let uiAccum = 0;

    const frame = () => {
      if (cancelled || !gpu) return;
      const g = gpu;
      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - prevT) / 1000);
      prevT = nowMs;
      const tSec = nowMs / 1000;
      sizeCanvas();

      // Apply a pending re-seed (memory resolved after the GPU started).
      const pending = pendingSeedRef.current;
      if (pending) {
        pendingSeedRef.current = null;
        const nbytes = GRID * GRID * 4;
        g.device.queue.writeBuffer(g.fieldBuf[0], 0, pending.buffer as ArrayBuffer, 0, nbytes);
        g.device.queue.writeBuffer(g.fieldBuf[1], 0, pending.buffer as ArrayBuffer, 0, nbytes);
      }

      const st = stepAttention(dt, tSec);
      maybeRemember(nowMs, st.locus, st.att);

      // Upload remembered deposits when they change.
      if (depsDirtyRef.current) {
        depsDirtyRef.current = false;
        const list = depositsRef.current;
        depsArr.fill(0);
        const n = Math.min(list.length, MAX_DEPOSITS);
        for (let i = 0; i < n; i++) {
          depsArr[i * 4 + 0] = list[i].x;
          depsArr[i * 4 + 1] = list[i].y;
          depsArr[i * 4 + 2] = list[i].w;
        }
        g.device.queue.writeBuffer(g.depsBuf, 0, depsArr.buffer as ArrayBuffer);
        pu[1] = n; // nDep
      }

      // Compute params.
      pu[0] = GRID;
      // pu[1] (nDep) set above / persists
      pf[2] = 0.992; // decay — the field settles slowly
      pf[3] = 0.16; // diffuse
      pf[4] = st.locus.x;
      pf[5] = st.locus.y;
      pf[6] = st.att * 0.16; // live deposit strength (per step)
      pf[7] = 0.13; // live radius
      pf[8] = 0.02; // memGain — remembered warmth floor
      pf[9] = 0.16; // mem radius
      pf[10] = st.audio;
      pf[11] = tSec;
      g.device.queue.writeBuffer(g.paramsBuf, 0, params);

      ru[0] = GRID;
      rf[1] = tSec;
      rf[2] = st.audio;
      rf[3] = st.att;
      g.device.queue.writeBuffer(g.rparamsBuf, 0, rparams);

      const src = g.cur;
      const dst = (1 - g.cur) as 0 | 1;
      const enc = g.device.createCommandEncoder();

      // 1. compute — step the warm field
      {
        const bg = g.device.createBindGroup({
          layout: g.computePl.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: g.fieldBuf[src] } },
            { binding: 1, resource: { buffer: g.fieldBuf[dst] } },
            { binding: 2, resource: { buffer: g.paramsBuf } },
            { binding: 3, resource: { buffer: g.depsBuf } },
          ],
        });
        const pass = enc.beginComputePass();
        pass.setPipeline(g.computePl);
        pass.setBindGroup(0, bg);
        const wg = Math.ceil(GRID / 8);
        pass.dispatchWorkgroups(wg, wg);
        pass.end();
      }

      // 2. render — tone-map the field to the swapchain
      {
        const bg = g.device.createBindGroup({
          layout: g.renderPl.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: g.fieldBuf[dst] } },
            { binding: 1, resource: { buffer: g.rparamsBuf } },
          ],
        });
        const pass = enc.beginRenderPass({
          colorAttachments: [
            {
              view: g.ctx.getCurrentTexture().createView(),
              loadOp: "clear",
              storeOp: "store",
              clearValue: { r: 0.02, g: 0.014, b: 0.018, a: 1 },
            },
          ],
        });
        pass.setPipeline(g.renderPl);
        pass.setBindGroup(0, bg);
        pass.draw(3);
        pass.end();
      }

      g.device.queue.submit([enc.finish()]);
      g.cur = dst;

      uiAccum += dt;
      if (uiAccum > 0.15) {
        uiAccum = 0;
        setAttView(st.att);
      }
      raf = requestAnimationFrame(frame);
    };

    // Build the GPU field from whatever memory has loaded (or synthetic priors).
    // The seed is regenerated once memory resolves, but we build immediately with
    // the current best guess so the room is never blank.
    const initialSeed = seedField(
      depositsRef.current.length ? depositsRef.current : makeSyntheticPriors(),
    );
    buildGpu(canvas, initialSeed)
      .then((g) => {
        if (cancelled) {
          destroyGpu(g);
          return;
        }
        gpu = g;
        g.device.lost.then((info) => {
          if (!cancelled && info.reason !== "destroyed") setGpuBad(true);
        });
        raf = requestAnimationFrame(frame);
      })
      .catch(() => {
        if (!cancelled) setGpuBad(true);
      });

    // ---- pointer capture ---------------------------------------------------
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = clamp01((e.clientX - rect.left) / rect.width);
      const y = clamp01((e.clientY - rect.top) / rect.height);
      selfTargetRef.current = { x, y };
      const s = syncRef.current;
      const t = performance.now();
      if (s && t - lastSendRef.current > POS_SEND_MS) {
        lastSendRef.current = t;
        s.send({ t: "pos", x, y });
      }
    };
    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerdown", onPointer);

    // ---- cleanup -----------------------------------------------------------
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearInterval(keeper);
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerdown", onPointer);
      // Final persist of the remembered warmth.
      if (depositsRef.current.length) {
        void saveDeposits(currentTrackRef.current, depositsRef.current);
      }
      stopSource();
      try {
        sync.destroy();
      } catch {
        /* gone */
      }
      if (gpu) {
        destroyGpu(gpu);
        gpu = null;
      }
      const ctx = ctxRef.current;
      if (ctx) {
        try {
          roomFilterRef.current?.disconnect();
        } catch {
          /* closing */
        }
        masterRef.current?.disconnect();
        if (ctx.state !== "closed") void ctx.close().catch(() => {});
      }
      ctxRef.current = null;
      masterRef.current = null;
      roomFilterRef.current = null;
      syncRef.current = null;
    };
    // Mount-once engine; UI reads/writes go through refs and state setters.
  }, []);

  const connected = peerCount > 0;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: "#0a0507" }}
        aria-hidden
      />

      {/* WebGPU-unavailable: on-brand notice over a static warm still */}
      {gpuBad && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-6 text-center"
          style={{
            background:
              "radial-gradient(60% 55% at 50% 45%, rgba(255,150,70,0.28), rgba(120,40,30,0.16) 45%, #0a0507 78%)",
          }}
        >
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            The hearth
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            This room needs WebGPU to hold its warmth — try a recent Chrome,
            Edge, or Safari. The glow you can see is the room at rest.
          </p>
          <Link
            href="/dream"
            className="mt-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← back to the dream lab
          </Link>
        </div>
      )}

      {/* top-left: title + presence + memory status */}
      {!gpuBad && (
        <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-6">
          <div className="pointer-events-auto max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream 17168 · hearth
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              A room that remembers being listened in
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              One of Karel&apos;s real piano takes, played together. Hold near
              each other and move slowly — your shared attention deposits warmth
              the room keeps, session after session.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
                {trackTitle}
              </span>
              <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-muted-foreground">
                {depCount} warm {depCount === 1 ? "trace" : "traces"}
                {seededPrior ? " (remembered)" : ""}
              </span>
            </div>

            <p className="mt-3 text-sm text-foreground">
              {connected
                ? "Someone is here with you — the room warms where you meet."
                : "You're alone for now — open a second tab or invite someone. An ambient presence breathes with you until then."}
            </p>

            <div className="mt-2 max-w-xs">
              <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                <span>shared attention</span>
                <span>{Math.round(attView * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${Math.round(attView * 100)}%` }}
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <span>transport: {backend}</span>
              <span>·</span>
              <span>{status}</span>
              <span>·</span>
              <span>
                {connected
                  ? `${peerCount} peer${peerCount > 1 ? "s" : ""}`
                  : "solo (ambient presence)"}
              </span>
              {connected && backend !== "local" && (
                <>
                  <span>·</span>
                  <span>
                    offset {Math.round(clock.offsetMs)}ms / rtt{" "}
                    {Number.isFinite(clock.rttMs) ? Math.round(clock.rttMs) : "–"}
                    ms
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* top-right: notes link */}
      {!gpuBad && (
        <div className="pointer-events-none absolute right-0 top-0 p-5 sm:p-6">
          <button
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* error banner */}
      {error && !gpuBad && (
        <div className="pointer-events-none absolute inset-x-0 top-28 flex flex-col items-center gap-2 px-4">
          <p className="pointer-events-auto rounded-md border border-destructive/40 bg-background/80 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        </div>
      )}

      {/* bottom controls */}
      {!gpuBad && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-3">
              {!entered ? (
                <button
                  onClick={() => actionsRef.current?.enter()}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Enter the room
                </button>
              ) : (
                <span className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
                  {started
                    ? "Listening together — hold near, move slowly"
                    : "Warming the room…"}
                </span>
              )}

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs uppercase tracking-[0.18em]">
                  take
                </span>
                <select
                  value={trackId}
                  disabled={entered}
                  onChange={(e) => {
                    setTrackId(e.target.value);
                    currentTrackRef.current = e.target.value;
                  }}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
                >
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {entered && (
                <button
                  onClick={() => actionsRef.current?.reanchor()}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Re-anchor
                </button>
              )}

              <button
                onClick={() => setShowRemote((v) => !v)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Connect a remote listener
              </button>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Fastest demo: open this page in{" "}
              <span className="text-foreground">two browser tabs</span> — they
              sync instantly, and each tab is a presence. Bring the two glows
              close and move slowly to feel the field warm and remember.
            </p>

            {showRemote && (
              <div className="grid gap-4 rounded-md border border-border bg-muted/40 p-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Host — invite a remote listener
                  </p>
                  <button
                    onClick={() => actionsRef.current?.createOffer()}
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    1. Create invite code
                  </button>
                  <textarea
                    readOnly
                    value={offerCode}
                    placeholder="invite code appears here — send it to your listener"
                    className="h-20 resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground"
                  />
                  <input
                    value={hostPaste}
                    onChange={(e) => setHostPaste(e.target.value)}
                    placeholder="2. paste their reply code"
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                  />
                  <button
                    onClick={() => actionsRef.current?.acceptAnswer(hostPaste)}
                    className="min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    3. Connect
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Guest — join with a code
                  </p>
                  <input
                    value={guestPaste}
                    onChange={(e) => setGuestPaste(e.target.value)}
                    placeholder="1. paste the host's invite code"
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                  />
                  <button
                    onClick={() => actionsRef.current?.acceptOffer(guestPaste)}
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    2. Generate reply code
                  </button>
                  <textarea
                    readOnly
                    value={answerCode}
                    placeholder="reply code appears here — send it back to the host"
                    className="h-20 resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes — the hearth
            </h2>
            <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question:</span> what
                if a listening room remembered everyone who ever listened in it,
                so the room itself grows warmer, session after session, from the
                attention held inside it?
              </p>
              <p>
                <span className="text-foreground">Collective, not a stream.</span>{" "}
                Two people join one synchronized session and listen to the same
                take. Each is a soft presence in a shared warm field. When two
                presences hold near each other AND move gently, their shared
                attention rises — and that attention deposits warmth into the
                field at the locus between them.
              </p>
              <p>
                <span className="text-foreground">Memory.</span> The warmth is
                remembered per room, in IndexedDB, as a compact set of warm
                deposits — repeated listening in a similar place deepens an
                existing deposit rather than adding a new one, so the room
                accretes. The room you enter is seeded from all of that before
                the first frame; a brand-new room is pre-seeded with a dozen
                synthetic prior sessions so the memory reads immediately. If
                storage is blocked, the room simply lives for one session.
              </p>
              <p>
                <span className="text-foreground">WebGPU field.</span> A compute
                shader steps a warm scalar field every frame — it diffuses and
                settles, keeps a low remembered-warmth floor from every stored
                deposit, and takes the bright live deposit from the two
                listeners&apos; shared attention. A render pass tone-maps the
                field through ember, amber, honey, rose, and a violet touch at
                the hottest cores. Slow luminance drift only — no strobe, no
                grain.
              </p>
              <p>
                <span className="text-foreground">Sync + sound.</span> peerSync
                runs an NTP-style shared clock; the host anchors Karel&apos;s take
                to an instant so it starts sample-close on both peers and
                re-anchors for late joiners. Two tabs sync instantly over
                BroadcastChannel; two machines use a copy-paste WebRTC data
                channel. Audio is Karel&apos;s real catalog only, through the
                ear-safe master bus — never a synth.
              </p>
              <p>
                <span className="text-foreground">References.</span> Devon
                Turnbull, <em>HiFi Pursuit Listening Room Dream No. 3</em> (Cooper
                Hewitt, Dec 2025–Jul 2026); UCL Bartlett{" "}
                <em>Urban Listening Room</em> (2026) — both frame listening as a
                collective, inhabited room. Pauline Oliveros — <em>Deep
                Listening</em>, listening together as a discipline.
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                input: shared catalog playback + co-present pointer attention ·
                output: WebGPU compute warmth field · memory: per-room deposits
                in IndexedDB · palette: hearth / ember / honey / amber-through-
                violet
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
