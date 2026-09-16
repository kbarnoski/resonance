"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17280-commons — "Commons"
//
// A venue-scale WebGPU compute field where a whole ROOM of present listeners is
// woven into ONE collective figure of light. This is the CYCLE-3 deepen of the
// shipped 17200-hall (a projection wall Karel loved), fused with the co-presence
// pieces (16800-attune, 15920-duetlink): hall was one wall rippled by the room;
// Commons makes every present listener a BODY in the field and weaves the N of
// them together as their attention aligns.
//
// ~9,216 particles live on the GPU, each OWNED by one presence (a synthetic
// pre-seeded listener, the local visitor, or a live remote peer). A WGSL compute
// shader draws each particle toward its owner's on-screen locus; a room COHERENCE
// scalar — high when the presences are few, close and calm — LERPs every target
// toward the shared centroid and spins up a rotational curl-of-position flow, so
// the separate clouds visibly converge and turn as one figure. Drop coherence and
// they relax back to N distinct bodies. Audio (Karel's real take, via the shared
// analyser) drives speed, brightness and the violet peak spark — never hue.
//
// Reads cold & solo: 5 synthetic present listeners drift gently into the field
// before frame 1, so a lone visitor on a muted phone sees a living, many-body
// woven field immediately. Real joining peers augment/replace the synthetic ones.
//
// Transport: _shared/peerSync — BroadcastChannel for two same-browser tabs, a
// real WebRTC data channel for remote peers, an NTP-style shared clock so Karel's
// one take starts sample-close on every peer. Audio always terminates in
// createSafeMaster (never ctx.destination). No WebGPU → a Canvas2D reduced weave
// while the take still plays.
//
// References: "The Third Between Us: Multi-User Co-Presence through Shared
// Auditory-Haptic Vibroscapes" (Augmented Humans Intl Conf 2026, ACM) — one
// participant's action modulates the shared perceptual field, generalized here to
// N. Refik Anadol's data-wall aesthetic. Pauline Oliveros — Deep Listening.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { createPeerSync, type PeerSync, type PeerClockInfo } from "../_shared/peerSync";
import {
  MAX_PRESENCES,
  initCommonsGpu,
  type CommonsGpu,
  type CommonsRenderParams,
} from "./gpu";
import { initCommonsFallback, type CommonsFallback } from "./fallback2d";

// ── constants ────────────────────────────────────────────────────────────────
const ROOM = "commons";
const NUM_PARTICLES = 9216; // 144 workgroups × 64
const POS_SEND_MS = 62; // ~16 Hz presence broadcast
const SPEED_LO = 0.04; // uv/sec: below → "gentle"
const SPEED_HI = 0.5; // uv/sec: above → "frantic"
const TARGET_MIN_PRESENCES = 6;
const MIN_SYNTH = 2;

interface Vec2 {
  x: number;
  y: number;
}
interface AnchorInfo {
  S: number;
  O: number;
  trackId: string;
}
interface PeerPresence {
  target: Vec2; // uv, y-down
  smooth: Vec2;
  gentleness: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Synthetic present listeners: slow Lissajous loci, calm (high gentleness), so
// the ensemble reads as alive & collective the instant the page loads.
interface SynthSeed {
  bx: number;
  by: number;
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  px: number;
  py: number;
}
const SYNTH: SynthSeed[] = [
  { bx: 0.30, by: 0.40, ax: 0.05, ay: 0.045, fx: 0.061, fy: 0.049, px: 0.0, py: 1.3 },
  { bx: 0.70, by: 0.38, ax: 0.045, ay: 0.05, fx: 0.053, fy: 0.067, px: 2.1, py: 0.4 },
  { bx: 0.74, by: 0.66, ax: 0.05, ay: 0.04, fx: 0.047, fy: 0.059, px: 4.0, py: 3.1 },
  { bx: 0.28, by: 0.64, ax: 0.048, ay: 0.052, fx: 0.069, fy: 0.043, px: 1.2, py: 5.0 },
  { bx: 0.50, by: 0.52, ax: 0.06, ay: 0.045, fx: 0.037, fy: 0.071, px: 3.3, py: 2.0 },
];

type RenderKind = "webgpu" | "canvas2d" | "none";

export default function CommonsPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── UI state ──
  const [entered, setEntered] = useState(false);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("idle");
  const [backend, setBackend] = useState("solo");
  const [peerCount, setPeerCount] = useState(0);
  const [clock, setClock] = useState<PeerClockInfo>({ offsetMs: 0, rttMs: 0 });
  const [renderKind, setRenderKind] = useState<RenderKind>("webgpu");
  const [error, setError] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [installMode, setInstallMode] = useState(false);
  const [chromeAwake, setChromeAwake] = useState(true);
  const [trackId, setTrackId] = useState(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState(REAL_TRACKS[0].title);
  const [cohView, setCohView] = useState(0);
  const [presView, setPresView] = useState(TARGET_MIN_PRESENCES);
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [hostPaste, setHostPaste] = useState("");
  const [guestPaste, setGuestPaste] = useState("");

  // ── engine refs ──
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const syncRef = useRef<PeerSync | null>(null);
  const bufferRef = useRef<Map<string, AudioBuffer>>(new Map());
  const bufDurRef = useRef(0);
  const startInfoRef = useRef<AnchorInfo | null>(null);
  const pendingAnchorRef = useRef<AnchorInfo | null>(null);
  const enteredRef = useRef(false);
  const startedRef = useRef(false);
  const startingRef = useRef(false);
  const currentTrackRef = useRef(trackId);
  const motionRef = useRef(1);

  // ── presence engine (uv, y-down; converted to y-up on upload) ──
  const selfTargetRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const selfSmoothRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const selfPrevRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const selfSpeedRef = useRef(0);
  const peersRef = useRef<Map<string, PeerPresence>>(new Map());
  const cohRef = useRef(0);
  const lastSendRef = useRef(0);
  const presArrRef = useRef<Float32Array>(new Float32Array(MAX_PRESENCES * 4));

  const actionsRef = useRef<{
    enter: () => void;
    reanchor: () => void;
    createOffer: () => void;
    acceptAnswer: (code: string) => void;
    acceptOffer: (code: string) => void;
  } | null>(null);

  useEffect(() => {
    currentTrackRef.current = trackId;
    const t = REAL_TRACKS.find((x) => x.id === trackId);
    if (t) setTrackTitle(t.title);
  }, [trackId]);

  // reduced-motion: freeze drift/tremor to a calm still
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      motionRef.current = mq.matches ? 0 : 1;
      setReduced(mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // installation-mode chrome auto-hide
  useEffect(() => {
    if (!installMode) {
      setChromeAwake(true);
      return;
    }
    let t: number;
    const wake = () => {
      setChromeAwake(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setChromeAwake(false), 2600);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInstallMode(false);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", onKey);
    };
  }, [installMode]);

  // ── the one big engine effect ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ---- peerSync wiring ----
    const refresh = () => {
      const s = syncRef.current;
      if (!s) return;
      setBackend(s.getBackend());
      setPeerCount(s.peers().length);
      // prune peer presences that have left
      const live = new Set(s.peers());
      for (const id of peersRef.current.keys()) {
        if (!live.has(id)) peersRef.current.delete(id);
      }
    };

    function onPeerMessage(payload: unknown, from: string): void {
      if (!isRecord(payload)) return;
      const t = payload.t;
      if (t === "pos") {
        const { x, y, g } = payload;
        if (typeof x === "number" && typeof y === "number") {
          let e = peersRef.current.get(from);
          if (!e) {
            e = {
              target: { x: clamp01(x), y: clamp01(y) },
              smooth: { x: clamp01(x), y: clamp01(y) },
              gentleness: typeof g === "number" ? clamp01(g) : 0.7,
            };
            peersRef.current.set(from, e);
          } else {
            e.target = { x: clamp01(x), y: clamp01(y) };
            if (typeof g === "number") e.gentleness = clamp01(g);
          }
        }
      } else if (t === "play" || t === "anchor") {
        const { S, O, trackId: tid } = payload;
        if (typeof S === "number" && typeof O === "number") {
          const id = typeof tid === "string" ? tid : currentTrackRef.current;
          void handleAnchor(S, O, id, t === "play");
        }
      }
    }

    const sync = createPeerSync({
      room: ROOM,
      onStatus: (st) => {
        setStatus(st);
        refresh();
      },
      onPeers: () => refresh(),
      onClock: (info) => setClock(info),
      onMessage: (payload, from) => onPeerMessage(payload, from),
    });
    syncRef.current = sync;
    sync.startLocal(); // zero-click two-tab review path
    refresh();

    // ---- audio ----
    async function ensureTrack(ctx: AudioContext, id: string): Promise<AudioBuffer | null> {
      const cached = bufferRef.current.get(id);
      if (cached) {
        bufDurRef.current = cached.duration;
        return cached;
      }
      try {
        const { buffer, title } = await loadRealTrackBuffer(ctx, id);
        bufferRef.current.set(id, buffer);
        bufDurRef.current = buffer.duration;
        if (id === currentTrackRef.current) setTrackTitle(title);
        return buffer;
      } catch {
        setError("Could not load Karel's take from the catalog. Check the connection and try again.");
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

    // The ONE audible path: bufferSource → gentle lowpass → safe master.
    async function startPlayback(S: number, O: number, id: string): Promise<void> {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      const s = syncRef.current;
      if (!ctx || !master || !s || startingRef.current) return;
      startingRef.current = true;
      try {
        const buf = await ensureTrack(ctx, id);
        if (!buf) return;
        currentTrackRef.current = id;
        stopSource();

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 7600;
        lp.Q.value = 0.6;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(lp);
        lp.connect(master.input); // never ctx.destination

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

    async function handleAnchor(S: number, O: number, id: string, force: boolean): Promise<void> {
      if (!enteredRef.current || !ctxRef.current) {
        pendingAnchorRef.current = { S, O, trackId: id };
        return;
      }
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

    // Host-authoritative keeper: host anchors the take for late joiners.
    const keeper = setInterval(() => {
      const s = syncRef.current;
      if (!s || !enteredRef.current) return;
      if (s.isHost()) {
        if (!startedRef.current) startTransport();
        else sendAnchor();
      }
    }, 2000);

    // ---- actions ----
    actionsRef.current = {
      enter: () => {
        if (enteredRef.current) return;
        void (async () => {
          const AC =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) {
            setError("Web Audio is unavailable in this browser.");
            return;
          }
          const ctx = new AC();
          await ctx.resume();
          const master = createSafeMaster(ctx);
          ctxRef.current = ctx;
          masterRef.current = master;

          const buf = await ensureTrack(ctx, currentTrackRef.current);
          if (!buf) return;
          enteredRef.current = true;
          setEntered(true);

          const s = syncRef.current;
          if (s?.isHost()) startTransport();
          else if (pendingAnchorRef.current) {
            const a = pendingAnchorRef.current;
            void startPlayback(a.S, a.O, a.trackId);
          }
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

    // ---- render engine (WebGPU, else Canvas2D reduced weave) ----
    let gpu: CommonsGpu | null = null;
    let fallback: CommonsFallback | null = null;
    let engineReady = false;

    void (async () => {
      gpu = await initCommonsGpu(canvas, NUM_PARTICLES);
      if (gpu) {
        setRenderKind("webgpu");
        engineReady = true;
        return;
      }
      fallback = initCommonsFallback(canvas);
      if (fallback) {
        setRenderKind("canvas2d");
        engineReady = true;
      } else {
        setRenderKind("none");
      }
    })();

    const freqBins = new Uint8Array(512);

    function readBands(): { bass: number; mid: number; treble: number; energy: number } {
      const an = masterRef.current?.analyser;
      if (!an) return { bass: 0, mid: 0, treble: 0, energy: 0 };
      const n = Math.min(an.frequencyBinCount, freqBins.length);
      an.getByteFrequencyData(freqBins);
      const avg = (a: number, b: number) => {
        let s = 0;
        const lo = Math.min(a, n);
        const hi = Math.min(b, n);
        for (let i = lo; i < hi; i++) s += freqBins[i];
        return hi > lo ? s / ((hi - lo) * 255) : 0;
      };
      return { bass: avg(1, 8), mid: avg(10, 42), treble: avg(60, 160), energy: avg(1, 180) };
    }

    // Assemble the active presence list + coherence for one frame.
    function step(dt: number, tSec: number): CommonsRenderParams {
      const motion = motionRef.current;

      // self presence: smoothed local pointer
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
      selfSpeedRef.current = lerp(selfSpeedRef.current, selfV, 0.2);
      selfPrevRef.current = { ...selfSmoothRef.current };
      const gentleSelf = 1 - smoothstep(SPEED_LO, SPEED_HI, selfSpeedRef.current);

      // peers: smooth toward last streamed target
      const peerEntries = [...peersRef.current.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      for (const [, e] of peerEntries) {
        e.smooth = {
          x: lerp(e.smooth.x, e.target.x, 0.12),
          y: lerp(e.smooth.y, e.target.y, 0.12),
        };
      }
      const peerN = Math.min(peerEntries.length, MAX_PRESENCES - 1 - MIN_SYNTH);

      // synthetic fill so the field always reads collective & alive
      const base = 1 + peerN;
      let synthShown = Math.max(MIN_SYNTH, TARGET_MIN_PRESENCES - base);
      synthShown = Math.min(synthShown, SYNTH.length, MAX_PRESENCES - base);
      const activeCount = base + synthShown;

      // build presence array (uv, y-UP; gentleness; brightness)
      const arr = presArrRef.current;
      arr.fill(0);
      let idx = 0;
      const put = (xd: number, yd: number, gentle: number, bright: number) => {
        arr[idx * 4 + 0] = clamp01(xd);
        arr[idx * 4 + 1] = clamp01(1 - yd); // y-down → y-up
        arr[idx * 4 + 2] = clamp01(gentle);
        arr[idx * 4 + 3] = bright;
        idx++;
      };
      put(selfSmoothRef.current.x, selfSmoothRef.current.y, gentleSelf, 1.0);
      for (let i = 0; i < peerN; i++) {
        const e = peerEntries[i][1];
        put(e.smooth.x, e.smooth.y, e.gentleness, 1.0);
      }
      for (let i = 0; i < synthShown; i++) {
        const sd = SYNTH[i];
        const dt2 = motion > 0.5 ? tSec : 0; // freeze drift under reduced motion
        const lx = sd.bx + sd.ax * Math.sin(dt2 * sd.fx * 6.283 + sd.px);
        const ly = sd.by + sd.ay * Math.sin(dt2 * sd.fy * 6.283 + sd.py);
        put(lx, 1 - ly, 0.85 + 0.1 * Math.sin(tSec * 0.2 + i), 0.78);
      }

      // centroid + spread over active loci (already y-up in arr)
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < activeCount; i++) {
        cx += arr[i * 4 + 0];
        cy += arr[i * 4 + 1];
      }
      cx /= activeCount;
      cy /= activeCount;
      let spread = 0;
      let gentleRoom = 0;
      for (let i = 0; i < activeCount; i++) {
        spread += Math.hypot(arr[i * 4 + 0] - cx, arr[i * 4 + 1] - cy);
        gentleRoom += arr[i * 4 + 2];
      }
      spread /= activeCount;
      gentleRoom /= activeCount;

      // coherence: high when the room is CLOSE, CALM, and FEW.
      const closeness = 1 - smoothstep(0.08, 0.5, spread);
      const fewness = 1 - smoothstep(2, 11, activeCount) * 0.4;
      const target = closeness * gentleRoom * (0.6 + 0.4 * fewness);
      const rising = target > cohRef.current;
      const rate = rising ? 0.6 : 1.9; // per second — attuning takes patience
      cohRef.current = lerp(cohRef.current, target, clamp01(rate * safeDt));

      const bands = readBands();

      return {
        dt,
        time: tSec,
        presences: arr,
        activeCount,
        coherence: cohRef.current,
        centroid: [cx, cy],
        bass: bands.bass,
        mid: bands.mid,
        treble: bands.treble,
        energy: bands.energy,
        motion,
      };
    }

    let raf = 0;
    let prevT = performance.now();
    let uiAccum = 0;

    const frame = () => {
      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - prevT) / 1000);
      prevT = nowMs;
      const tSec = nowMs / 1000;

      const p = step(dt, tSec);
      if (engineReady) {
        if (gpu) {
          gpu.resize();
          gpu.render(p);
        } else if (fallback) {
          fallback.resize();
          fallback.render(p);
        }
      }

      uiAccum += dt;
      if (uiAccum > 0.15) {
        uiAccum = 0;
        setCohView(p.coherence);
        setPresView(p.activeCount);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ---- pointer capture: stream self presence at ~16 Hz ----
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = clamp01((e.clientX - rect.left) / rect.width);
      const y = clamp01((e.clientY - rect.top) / rect.height);
      selfTargetRef.current = { x, y };
      const s = syncRef.current;
      const t = performance.now();
      if (s && t - lastSendRef.current > POS_SEND_MS) {
        lastSendRef.current = t;
        const g = 1 - smoothstep(SPEED_LO, SPEED_HI, selfSpeedRef.current);
        s.send({ t: "pos", x, y, g });
      }
    };
    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerdown", onPointer);

    // ---- cleanup ----
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(keeper);
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerdown", onPointer);
      stopSource();
      try {
        gpu?.dispose();
      } catch {
        /* noop */
      }
      try {
        fallback?.dispose();
      } catch {
        /* noop */
      }
      try {
        sync.destroy();
      } catch {
        /* already gone */
      }
      masterRef.current?.disconnect();
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      masterRef.current = null;
      syncRef.current = null;
    };
  }, []);

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      /* fullscreen denied */
    }
  }

  const connected = peerCount > 0;
  const chromeVisible = !installMode || chromeAwake;
  const cohPct = Math.round(cohView * 100);

  return (
    <div
      ref={containerRef}
      className="relative h-[100dvh] w-full overflow-hidden bg-black text-foreground"
    >
      {/* neutral still backdrop under the field (also the no-WebGPU still) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 54% at 50% 48%, #26282f 0%, #121317 46%, #050506 100%)",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* ── top-left: title + room readout ── */}
      {chromeVisible && (
        <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-6">
          <div className="pointer-events-auto max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream 17280 · commons
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              A room woven into one figure of light
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Every present listener is a body of particles in the field. Karel&apos;s
              real take plays in sync for all of you. When the room holds close and
              calm, the separate clouds converge and turn as one.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
                {trackTitle}
              </span>
              <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
                {presView} present
              </span>
            </div>

            {/* coherence meter (violet = brand accent) */}
            <div className="mt-3 max-w-xs">
              <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                <span>coherence</span>
                <span>{cohPct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${cohPct}%` }}
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <span>transport: {backend}</span>
              <span>·</span>
              <span>{status}</span>
              <span>·</span>
              <span>
                {connected ? `${peerCount} peer${peerCount > 1 ? "s" : ""}` : "solo + synthetic"}
              </span>
              {connected && backend !== "local" && (
                <>
                  <span>·</span>
                  <span>
                    offset {Math.round(clock.offsetMs)}ms / rtt{" "}
                    {Number.isFinite(clock.rttMs) ? Math.round(clock.rttMs) : "–"}ms
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── top-right: notes ── */}
      {chromeVisible && (
        <div className="pointer-events-none absolute right-0 top-0 p-5 sm:p-6">
          <button
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* ── notices ── */}
      {(error || renderKind === "canvas2d" || renderKind === "none" || reduced) && chromeVisible && (
        <div className="pointer-events-none absolute inset-x-0 top-40 z-10 flex flex-col items-center gap-2 px-4 sm:top-44">
          {error && (
            <p className="pointer-events-auto rounded-md border border-destructive/40 bg-background/80 px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {!error && renderKind === "canvas2d" && (
            <p className="pointer-events-auto max-w-md rounded-md border border-border bg-background/80 px-4 py-2 text-center text-sm text-muted-foreground">
              This device can&apos;t run the WebGPU field, so the room is woven in a
              reduced Canvas view. The take still plays.
            </p>
          )}
          {!error && renderKind === "none" && (
            <p className="pointer-events-auto max-w-md rounded-md border border-border bg-background/80 px-4 py-2 text-center text-sm text-muted-foreground">
              Neither WebGPU nor Canvas is available here, so the wall holds a still
              neutral glow. The take still plays.
            </p>
          )}
          {!error && reduced && (
            <p className="pointer-events-auto max-w-md rounded-md border border-border bg-background/80 px-4 py-2 text-center text-sm text-muted-foreground">
              Reduced-motion is on — the drift and tremor are held to a calm still.
            </p>
          )}
        </div>
      )}

      {/* ── bottom operator panel ── */}
      {chromeVisible && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-3">
              {!entered ? (
                <button
                  onClick={() => actionsRef.current?.enter()}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Play the room
                </button>
              ) : (
                <span className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
                  {started ? "Listening together — hold close, move slowly" : "Waiting for the room…"}
                </span>
              )}

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs uppercase tracking-[0.18em]">take</span>
                <select
                  value={trackId}
                  disabled={entered}
                  onChange={(e) => setTrackId(e.target.value)}
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
                onClick={() => setShowInvite((v) => !v)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {connected ? "Room" : "Solo"} · invite
              </button>

              <button
                onClick={() => {
                  setInstallMode(true);
                  setShowInvite(false);
                }}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Installation
              </button>

              <button
                onClick={toggleFullscreen}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Fullscreen
              </button>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Fastest demo: open this page in{" "}
              <span className="text-foreground">two browser tabs</span> — each tab is
              a present listener, and they sync instantly. Bring the bodies close and
              move slowly to feel the ensemble converge. Alone works too: five
              synthetic listeners keep the field woven and alive.
            </p>

            {showInvite && (
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

      {/* ── installation-mode hint ── */}
      {installMode && chromeAwake && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <p className="rounded-md border border-border bg-background/70 px-4 py-2 text-sm text-muted-foreground">
            Installation mode — press Esc to show controls
          </p>
        </div>
      )}

      {/* ── design-notes modal ── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Commons — design notes</h2>
            <div className="mt-4 flex flex-col gap-3 text-base leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question:</span> what if
                listening to Karel&apos;s take together — not two people but a whole
                ROOM of present listeners — visibly wove everyone&apos;s attention
                into one collective figure of light, venue-scale?
              </p>
              <p>
                <span className="text-foreground">N bodies, one figure.</span> ~9,200
                particles run in a WebGPU compute shader. Each is owned by one present
                listener — a synthetic pre-seeded one, you, or a live remote peer — and
                is drawn toward that listener&apos;s locus. A room coherence scalar,
                high when the presences are few, close and calm, LERPs every target
                toward the shared centroid and spins up a rotational curl-of-position
                flow, so the separate clouds converge and TURN as one. Break away and
                they relax back to distinct bodies.
              </p>
              <p>
                <span className="text-foreground">Reads cold.</span> Five synthetic
                listeners drift gently into the field before the first frame, so a lone
                visitor on a muted phone sees a living, many-body woven field at once.
                Real peers augment and replace them as they join.
              </p>
              <p>
                <span className="text-foreground">Neutral palette.</span> Graphite →
                slate → stone → silver → bone, with violet only at the brightest,
                densest peaks. Warmth-of-togetherness is encoded as luminance and
                density, never hue. Audio (bass / mid / treble from the shared
                analyser) drives speed, brightness and the violet spark. Additive
                trails + a Reinhard tonemap only — no film grain.
              </p>
              <p>
                <span className="text-foreground">Sync.</span> peerSync runs an
                NTP-style clock so <code>now()</code> is the same millisecond on every
                peer; the host anchors the take to a synced instant and re-broadcasts
                for late joiners, so Karel&apos;s one take starts sample-close for all.
                Presence streams at ~16 Hz. Two same-browser tabs sync instantly over
                BroadcastChannel; remote peers use a real WebRTC data channel
                (copy-paste code, no server). Every audio path ends in the safe master,
                never the raw output.
              </p>
              <p>
                <span className="text-foreground">Degrades.</span> No WebGPU → a
                Canvas2D reduced weave; no canvas at all → a still neutral glow — the
                take keeps playing either way. Audio load failure → a plain error,
                never a synth. No peers → the synthetic presences keep the field alive.
                Reduced-motion freezes the drift and tremor to a calm still.
              </p>
              <p>
                <span className="text-foreground">References.</span> &ldquo;The Third
                Between Us: Multi-User Co-Presence through Shared Auditory-Haptic
                Vibroscapes&rdquo; (Augmented Humans Intl Conf 2026, ACM) — one
                participant&apos;s action modulates the shared perceptual field,
                generalized here to N. Refik Anadol&apos;s data-wall aesthetic. Pauline
                Oliveros — <em>Deep Listening</em>, listening together as a discipline.
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                input: multi-user co-presence (peerSync) + synthetic presences ·
                output: raw WebGPU compute · technique: N-owner particle weave driven
                by a coherence scalar · palette: neutral graphite→bone, violet peaks
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
