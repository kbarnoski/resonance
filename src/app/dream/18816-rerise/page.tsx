"use client";

/* ── 18816 · Rerise ──────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if memory were BIDIRECTIONAL — instead of only depositing
 *  new states as you conduct, you could SETTLE and DESCEND back down through
 *  everything you've already laid down, and the very act of RE-AUDITIONING a
 *  past moment RECONSOLIDATES it (strengthens + subtly drifts it toward now),
 *  while moments you never return to slowly FADE?
 *
 *  This is cycle-2 of the lab's MEMORY lane. Cycle-1 (sediment) was write-only
 *  accretion. Here RETRIEVAL is an active force that mutates what is remembered.
 *
 *  INPUT  : MediaPipe PoseLandmarker (full body). We read ONLY the upper-body
 *           landmarks a seated desk webcam actually sees — shoulders + nose,
 *           plus wrists when visible — and fold them into one continuous
 *           PRESENT↔PAST axis: reaching up / opening the body = PRESENT (1),
 *           settling / lowering / closing = PAST (0). A virtual floor (the
 *           frame's lower edge) stands in for the unseen lower body.
 *  PRESENT: while the body is raised, Karel's REAL recording plays live and its
 *           live playhead is DEPOSITED as a new stratum at the TOP of a growing
 *           vertical column — every 3.5 s and on each upward gesture peak.
 *  PAST   : lowering the body travels the CAMERA back DOWN through the accreted
 *           strata. At the depth you reach, a lookahead grain scheduler
 *           RE-AUDITIONS that stratum — granular grains from the ORIGINAL
 *           recording buffer, at the time-offset remembered in the stratum —
 *           crossfaded under/over the live playhead by how deep you are.
 *  DEEPEN : DWELLING on a stratum strengthens it and drifts its remembered
 *           offset toward the present (a memory recalled comes back changed).
 *           Strata never revisited slowly decay. Strength → warmth (verdigris →
 *           bronze → gold); decay → cool slate/ash. By minute 5 the column is a
 *           biased memoir: warm and dense where you kept returning, faint where
 *           you never looked back.
 *
 *  References — "Retrieval-Driven Memory Reconsolidation for Long-Term LLM
 *  Agents" (arXiv:2609.16053, 2026-09-13): memory should evolve on RETRIEVAL,
 *  not only on new input. And the neuroscience of memory reconsolidation:
 *  recalling a memory destabilises it, so it must be re-stored — and returns
 *  changed. This makes both literal.
 *
 *  Alive on load via an autonomous demo conductor that breathes up to deposit
 *  and periodically descends to re-audition + reconsolidate, feeding the
 *  IDENTICAL deposit→reconsolidate→audio chain. No camera needed. See README.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── palette (patina: verdigris → bronze → gold, decaying to slate/ash) ────────
const FIELD = 0x05070a; // near-black cool field
const DEFAULT_TRACK = REAL_TRACKS[0].id;

// ── column + memory constants ─────────────────────────────────────────────────
const MAX_STRATA = 160; // instanced capacity; weakest pruned beyond this
const STRATUM_GAP = 0.52; // world units between deposited strata
const DEPOSIT_INTERVAL = 3.5; // s — a stratum laid down at least this often (present)
const FALLBACK_DUR = 180; // s — synthetic present clock before audio starts
const DECAY = 0.015; // strength lost per second for strata not being re-heard
const RECONSOLIDATE = 0.24; // strength gained per second while dwelling
const PRESENT_LO = 0.72; // axis below which the live take begins to recede
const PRESENT_HI = 0.95; // axis at/above which only the live take is heard
// grain scheduler (re-audition)
const LOOKAHEAD = 0.12;
const GRAIN_WIN = 0.19;
const GRAIN_INT = 0.14;

type Driver = "live" | "pointer" | "demo";

interface Stratum {
  offset: number; // remembered time-offset into the recording (s)
  strength: number; // 0.04 (ash) … 1.3 (gold) — reconsolidation/decay state
  born: number; // perf seconds
  lastAudit: number; // perf seconds of last re-audition
  radius: number; // deposit openness → slab radius
  seed: number;
}

interface Engine {
  startAudio: () => void;
  stopAudio: () => void;
  startCam: () => Promise<void>;
  setTrack: (id: string) => void;
}

interface Readout {
  driver: Driver;
  lost: boolean;
  depth: number; // 0 past … 1 present
  count: number;
  focusStrength: number;
  title: string;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function smooth01(x: number): number {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
}

export default function RerisePage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const { immersive, toggle } = useImmersive();

  const [soundOn, setSoundOn] = useState(false);
  const [camState, setCamState] = useState<
    "idle" | "starting" | "on" | "failed"
  >("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [readout, setReadout] = useState<Readout>({
    driver: "demo",
    lost: false,
    depth: 1,
    count: 0,
    focusStrength: 0,
    title: REAL_TRACKS[0].title,
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── three.js column (WebGL optional; 2D fallback below) ──────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let slabs: THREE.InstancedMesh | null = null;
    let slabGeo: THREE.CylinderGeometry | null = null;
    let slabMat: THREE.MeshBasicMaterial | null = null;
    let core: THREE.Mesh | null = null;
    let coreGeo: THREE.CylinderGeometry | null = null;
    let coreMat: THREE.MeshBasicMaterial | null = null;
    let fallback2d: CanvasRenderingContext2D | null = null;
    let canvas2d: HTMLCanvasElement | null = null;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      if (!renderer.getContext()) throw new Error("no webgl");
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setClearColor(FIELD, 1);
      mount.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(FIELD, 0.05);
      camera = new THREE.PerspectiveCamera(
        52,
        mount.clientWidth / Math.max(1, mount.clientHeight),
        0.1,
        400,
      );
      camera.position.set(0, 0, 7);
      camera.lookAt(0, 0, 0);

      // a thin disc per stratum (cylinder axis = Y → flat faces up)
      slabGeo = new THREE.CylinderGeometry(1, 1, 0.14, 40);
      slabMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
      });
      slabs = new THREE.InstancedMesh(slabGeo, slabMat, MAX_STRATA);
      slabs.frustumCulled = false; // the column is tall; never cull as we travel
      slabs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const c0 = new THREE.Color(0x101418);
      for (let i = 0; i < MAX_STRATA; i++) slabs.setColorAt(i, c0);
      if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
      scene.add(slabs);

      // a faint vertical core threading the column together
      coreGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true);
      coreMat = new THREE.MeshBasicMaterial({
        color: 0x2a3640,
        transparent: true,
        opacity: 0.4,
      });
      core = new THREE.Mesh(coreGeo, coreMat);
      scene.add(core);
    } catch {
      setWebglOk(false);
      if (renderer) {
        try {
          renderer.dispose();
        } catch {
          /* ignore */
        }
      }
      renderer = null;
      slabs = null;
      // 2D fallback canvas — the memory column still draws, audio still plays
      try {
        canvas2d = document.createElement("canvas");
        canvas2d.className = "absolute inset-0 h-full w-full";
        mount.appendChild(canvas2d);
        fallback2d = canvas2d.getContext("2d");
      } catch {
        fallback2d = null;
      }
    }

    // ── audio state ──────────────────────────────────────────────────────────
    let ctx: AudioContext | null = null;
    let master: SafeMaster | null = null;
    let liveGain: GainNode | null = null;
    let grainBus: GainNode | null = null;
    let liveSrc: AudioBufferSourceNode | null = null;
    let buffer: AudioBuffer | null = null;
    let wantTrack = DEFAULT_TRACK;
    let loadingTrack = false;
    let specBuf: Uint8Array<ArrayBuffer> | null = null;
    let liveGrains = 0;
    let liveStartCtx = 0;
    let liveStartOff = 0;

    // Hann window
    const HANN_N = 256;
    const hann = new Float32Array(HANN_N);
    for (let n = 0; n < HANN_N; n++) {
      hann[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (HANN_N - 1)));
    }
    const hannScratch = new Float32Array(HANN_N);

    // ── the memory column ──────────────────────────────────────────────────────
    const strata: Stratum[] = [];
    let presentOffset = 0; // the "now" offset into the recording (live playhead)
    let reauditionPos = 0; // advancing read head while dwelling on a stratum
    let focusIdx = 0; // stratum nearest the camera's current depth
    let lastDepositT = -10;
    let nextGrainT = 0;

    // ── the single present↔past axis (shared by live / pointer / demo) ─────────
    let axisTarget = 0.85; // raw target from whatever drive is active
    let axisS = 0.85; // smoothed axis (lerp ~0.12) → depth + crossfade
    let openTarget = 0.4;
    let openS = 0.4;
    let axisPrev = 0.85;
    let slopePrev = 0;

    let driver: Driver = "demo";
    let lost = false;
    let sawReal = false;
    let pointerUntil = -1; // perf seconds the pointer override lasts to

    // ── deposit: lay down the live state as a new stratum at the top ───────────
    function deposit(nowS: number) {
      strata.push({
        offset: presentOffset,
        strength: 0.55 + openS * 0.28,
        born: nowS,
        lastAudit: nowS,
        radius: 0.85 + openS * 0.7,
        seed: Math.random(),
      });
      if (strata.length > MAX_STRATA) {
        // prune the weakest (most faded) — the moments never returned to
        let wi = 0;
        let wv = Infinity;
        const lim = strata.length - 3; // never prune the freshest few
        for (let i = 0; i < lim; i++) {
          if (strata[i].strength < wv) {
            wv = strata[i].strength;
            wi = i;
          }
        }
        strata.splice(wi, 1);
      }
      lastDepositT = nowS;
    }

    // ── the single axis entry point — every drive calls this ───────────────────
    function ingestAxis(axis: number, open: number, dt: number, nowS: number) {
      axisTarget = clamp01(axis);
      openTarget = clamp01(open);
      const k = Math.min(1, dt / 0.12);
      axisS += (axisTarget - axisS) * k;
      openS += (openTarget - openS) * k;

      // deposit on an upward gesture PEAK while present
      const slope = axisS - axisPrev;
      axisPrev = axisS;
      const isPeak = slopePrev > 0 && slope <= 0;
      slopePrev = slope;
      if (isPeak && axisS > 0.6 && nowS - lastDepositT > 1.1) {
        deposit(nowS);
      } else if (axisS > 0.45 && nowS - lastDepositT > DEPOSIT_INTERVAL) {
        // and at least every DEPOSIT_INTERVAL while the body stays raised
        deposit(nowS);
      }
    }

    // ── demo conductor: breathe up to deposit, descend to re-audition ──────────
    // a small state machine so the autonomous drive exercises BOTH halves.
    let demoState: "present" | "descend" | "dwell" = "present";
    let demoStateUntil = 0;
    let demoTargetDepth = 0.85;
    function demoAxis(nowS: number): { axis: number; open: number } {
      if (nowS > demoStateUntil) {
        if (demoState === "present") {
          demoState = "descend";
          demoTargetDepth = 0.08 + Math.random() * 0.4; // pick a memory depth
          demoStateUntil = nowS + 3 + Math.random() * 2;
        } else if (demoState === "descend") {
          demoState = "dwell";
          demoStateUntil = nowS + 4 + Math.random() * 3; // dwell = reconsolidate
        } else {
          demoState = "present";
          demoTargetDepth = 0.82;
          demoStateUntil = nowS + 9 + Math.random() * 5; // deposit a while
        }
      }
      const breath = 0.03 * Math.sin(nowS * 0.9);
      let base: number;
      if (demoState === "present") {
        base = 0.84 + 0.1 * Math.max(0, Math.sin(nowS * 0.55)); // gentle peaks
      } else {
        base = demoTargetDepth;
      }
      const open =
        demoState === "present"
          ? 0.55 + 0.35 * Math.max(0, Math.sin(nowS * 0.55))
          : 0.2;
      return { axis: clamp01(base + breath), open };
    }

    // ── audio lifecycle ─────────────────────────────────────────────────────────
    function startLive() {
      if (!ctx || !buffer || !liveGain) return;
      try {
        if (liveSrc) {
          try {
            liveSrc.stop();
          } catch {
            /* ignore */
          }
        }
        liveSrc = ctx.createBufferSource();
        liveSrc.buffer = buffer;
        liveSrc.loop = true;
        liveSrc.connect(liveGain);
        liveStartCtx = ctx.currentTime;
        liveStartOff = presentOffset % buffer.duration;
        liveSrc.start(0, liveStartOff);
      } catch {
        liveSrc = null;
      }
    }

    function livePlayhead(): number {
      if (!ctx || !buffer || !liveSrc) return presentOffset;
      return (liveStartOff + (ctx.currentTime - liveStartCtx)) % buffer.duration;
    }

    async function loadInto(ctxx: AudioContext, id: string) {
      loadingTrack = true;
      try {
        const loaded = await loadRealTrackBuffer(ctxx, id);
        buffer = loaded.buffer;
        presentOffset = 0;
        startLive();
        setReadout((r) => ({ ...r, title: loaded.title }));
        setNotice(null);
      } catch {
        buffer = null;
        setNotice(
          "That recording could not be loaded — the column keeps accreting; sound returns on the next track.",
        );
      } finally {
        loadingTrack = false;
      }
    }

    function startAudio() {
      if (ctx) {
        void ctx.resume();
        return;
      }
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AC();
        void ctx.resume();
        master = createSafeMaster(ctx);
        liveGain = ctx.createGain();
        liveGain.gain.value = 0.0;
        liveGain.connect(master.input); // live take → safe bus
        grainBus = ctx.createGain();
        grainBus.gain.value = 0.0;
        grainBus.connect(master.input); // re-audition grains → safe bus
        specBuf = new Uint8Array(
          new ArrayBuffer(master.analyser.frequencyBinCount),
        );
        nextGrainT = ctx.currentTime + 0.1;
        void loadInto(ctx, wantTrack);
      } catch {
        ctx = null;
        master = null;
        liveGain = null;
        grainBus = null;
        setNotice(
          "Web Audio is unavailable here — the memory column still accretes silently.",
        );
      }
    }

    function stopAudio() {
      const deadCtx = ctx;
      const ls = liveSrc;
      liveSrc = null;
      liveGain = null;
      grainBus = null;
      buffer = null;
      master = null;
      ctx = null;
      if (ls) {
        try {
          ls.stop();
        } catch {
          /* ignore */
        }
      }
      if (deadCtx && deadCtx.state !== "closed") {
        window.setTimeout(() => {
          if (deadCtx.state !== "closed") void deadCtx.close();
        }, 300);
      }
    }

    function setTrack(id: string) {
      wantTrack = id;
      if (ctx && !loadingTrack) void loadInto(ctx, id);
    }

    // ── re-audition grain scheduler — grains from the REMEMBERED offset ────────
    function scheduleReaudition(reLevel: number) {
      if (!ctx || !grainBus || !buffer || strata.length === 0) return;
      if (reLevel < 0.05) {
        nextGrainT = ctx.currentTime + 0.05;
        return;
      }
      const now = ctx.currentTime;
      if (nextGrainT < now) nextGrainT = now + 0.02;
      let safety = 0;
      while (nextGrainT < now + LOOKAHEAD && safety < 12) {
        safety++;
        fireGrain(nextGrainT, reauditionPos);
        // the remembered moment plays FORWARD as you dwell on it
        reauditionPos += GRAIN_INT;
        if (reauditionPos > buffer.duration - GRAIN_WIN - 0.05) {
          const f = strata[focusIdx];
          reauditionPos = f ? f.offset : 0;
        }
        nextGrainT += GRAIN_INT;
      }
    }

    function fireGrain(startT: number, pos: number) {
      if (!ctx || !grainBus || !buffer) return;
      if (liveGrains > 24) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 1.0; // re-heard, never transposed
      const g = ctx.createGain();
      g.gain.value = 0;
      for (let n = 0; n < HANN_N; n++) hannScratch[n] = hann[n] * 0.85;
      try {
        g.gain.setValueCurveAtTime(hannScratch, startT, GRAIN_WIN);
      } catch {
        g.gain.setValueAtTime(0, startT);
        g.gain.linearRampToValueAtTime(0.85, startT + GRAIN_WIN * 0.5);
        g.gain.linearRampToValueAtTime(0, startT + GRAIN_WIN);
      }
      src.connect(g);
      g.connect(grainBus);
      liveGrains++;
      src.onended = () => {
        liveGrains--;
        try {
          g.disconnect();
          src.disconnect();
        } catch {
          /* ignore */
        }
      };
      const off = Math.max(
        0,
        Math.min(buffer.duration - GRAIN_WIN - 0.02, pos),
      );
      try {
        src.start(startT, off, GRAIN_WIN + 0.03);
        src.stop(startT + GRAIN_WIN + 0.03);
      } catch {
        liveGrains--;
      }
    }

    engineRef.current = { startAudio, stopAudio, startCam, setTrack };

    // ── pose / camera ──────────────────────────────────────────────────────────
    let landmarker: PoseLandmarkerInst | null = null;
    let stream: MediaStream | null = null;

    async function startCam() {
      setCamState("starting");
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setCamState("failed");
        setNotice(
          "No camera here — move the mouse to conduct, or let the autonomous demo run.",
        );
        return;
      }
      try {
        stream = await startCamera(video);
      } catch {
        setCamState("failed");
        setNotice(
          "Camera blocked — move the mouse to conduct, or let the autonomous demo run.",
        );
        return;
      }
      try {
        landmarker = await createPoseTracker(1);
        setCamState("on");
        setNotice(null);
      } catch {
        setCamState("failed");
        setNotice(
          "Body-tracking model couldn't load (offline?) — mouse/demo keep conducting.",
        );
      }
    }

    // read the live body → one present↔past axis. Gate ONLY on shoulders+nose;
    // NEVER on hips/legs (a seated webcam can't see them). The frame's lower
    // edge is the synthetic floor the body's height is measured against.
    function readLive(
      nowMs: number,
    ): { axis: number; open: number; present: boolean } | null {
      const video = videoRef.current;
      if (!landmarker || !stream || !video || video.readyState < 2) return null;
      let res;
      try {
        res = landmarker.detectForVideo(video, nowMs);
      } catch {
        return null;
      }
      const lm = res?.landmarks?.[0];
      if (!lm) return { axis: 0, open: 0, present: false };
      const ls = lm[POSE_LM.leftShoulder];
      const rs = lm[POSE_LM.rightShoulder];
      const nose = lm[POSE_LM.nose];
      const lw = lm[POSE_LM.leftWrist];
      const rw = lm[POSE_LM.rightWrist];
      const vis = (p?: { visibility?: number }) => (p?.visibility ?? 0) > 0.5;
      if (!(vis(ls) && vis(rs) && vis(nose))) {
        return { axis: 0, open: 0, present: false };
      }
      // vertical: raising the upper body lifts shoulders/head → smaller y.
      const cyN = (ls.y + rs.y + nose.y) / 3;
      const vv = clamp01((0.58 - cyN) / 0.3);
      const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y) + 1e-4;
      // openness from wrists when visible: raised + spread arms = open body.
      let openness = vv;
      if (vis(lw) || vis(rw)) {
        const shoulderY = (ls.y + rs.y) / 2;
        let raise = 0;
        let n = 0;
        if (vis(lw)) {
          raise += clamp01((shoulderY - lw.y) / 0.32);
          n++;
        }
        if (vis(rw)) {
          raise += clamp01((shoulderY - rw.y) / 0.32);
          n++;
        }
        raise = n ? raise / n : 0;
        let spread = 0;
        if (vis(lw) && vis(rw)) {
          spread = clamp01((Math.abs(lw.x - rw.x) / shoulderW - 1.0) / 1.3);
        }
        openness = clamp01(Math.max(raise, 0.6 * spread, 0.4 * vv));
      }
      const axis = clamp01(0.55 * vv + 0.45 * openness);
      return { axis, open: openness, present: true };
    }

    // ── color: patina — verdigris → bronze → gold, decaying to slate/ash ───────
    const ASH = new THREE.Color(0x323c48); // cool slate/ash (faded)
    const VERDIGRIS = new THREE.Color(0x2fae8e); // fresh patina
    const BRONZE = new THREE.Color(0xb3762f);
    const GOLD = new THREE.Color(0xf6cf7a);
    const WHITE = new THREE.Color(0xffffff);
    function patina(out: THREE.Color, s: number): THREE.Color {
      if (s < 0.35) out.copy(ASH).lerp(VERDIGRIS, clamp01(s / 0.35));
      else if (s < 0.85)
        out.copy(VERDIGRIS).lerp(BRONZE, clamp01((s - 0.35) / 0.5));
      else out.copy(BRONZE).lerp(GOLD, clamp01((s - 0.85) / 0.45));
      // extra fade-to-dark for low strength so decayed strata recede
      const dim = 0.32 + 0.68 * clamp01(s);
      out.multiplyScalar(dim);
      return out;
    }

    // ── render ─────────────────────────────────────────────────────────────────
    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    let camAngle = 0;
    let camY = 0;

    function depthToFocusFloat(): number {
      // axis 1 = present = top (newest); axis 0 = past = bottom (oldest)
      const n = strata.length;
      if (n === 0) return 0;
      return axisS * (n - 1);
    }

    function render3d(nowS: number, dt: number, rms: number) {
      if (!renderer || !scene || !camera || !slabs) return;
      const n = strata.length;
      const topY = (n - 1) * STRATUM_GAP;

      // camera follows depth down/up the column; gentle auto-orbit keeps it alive
      camAngle += dt * (reduce ? 0.04 : 0.14 + openS * 0.05);
      const focusF = depthToFocusFloat();
      const targetCamY = focusF * STRATUM_GAP;
      camY += (targetCamY - camY) * Math.min(1, dt * 2.4);
      const R = 6.4;
      camera.position.set(
        Math.sin(camAngle) * R,
        camY + 1.1,
        Math.cos(camAngle) * R,
      );
      camera.lookAt(0, camY, 0);

      if (core && coreGeo) {
        core.scale.set(1, Math.max(0.1, topY + 1.5), 1);
        core.position.set(0, topY / 2, 0);
      }

      const liveIdx = n - 1;
      for (let i = 0; i < MAX_STRATA; i++) {
        if (i >= n) {
          dummy.scale.setScalar(0);
          dummy.position.set(0, -9999, 0);
          dummy.updateMatrix();
          slabs.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const s = strata[i];
        const y = i * STRATUM_GAP;
        const str = clamp01(s.strength);
        const rad = s.radius * (0.7 + 0.5 * str);
        const h = 0.6 + str * 1.2;
        // a subtle breathing wobble keyed to the stratum seed
        const wob = reduce ? 1 : 1 + 0.04 * Math.sin(nowS * 0.8 + s.seed * 6.28);
        dummy.position.set(0, y, 0);
        dummy.rotation.set(0, s.seed * 6.28, 0);
        dummy.scale.set(rad * wob, h, rad * wob);
        dummy.updateMatrix();
        slabs.setMatrixAt(i, dummy.matrix);

        patina(tmpColor, s.strength);
        if (i === liveIdx) {
          // top live band glows from the master RMS
          tmpColor.lerp(WHITE, Math.min(0.75, rms * 1.4));
        } else if (i === focusIdx && axisS < PRESENT_LO) {
          // the stratum being re-auditioned gets a faint highlight
          tmpColor.lerp(WHITE, 0.14);
        }
        slabs.setColorAt(i, tmpColor);
      }
      slabs.instanceMatrix.needsUpdate = true;
      if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
      renderer.render(scene, camera);
    }

    function render2d(rms: number) {
      if (!fallback2d || !canvas2d || !mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas2d.width !== w * dpr || canvas2d.height !== h * dpr) {
        canvas2d.width = w * dpr;
        canvas2d.height = h * dpr;
      }
      const g = fallback2d;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#05070a";
      g.fillRect(0, 0, w, h);
      const n = strata.length;
      if (n === 0) return;
      const focusF = depthToFocusFloat();
      const rowH = 14;
      const cx = w / 2;
      for (let i = 0; i < n; i++) {
        const s = strata[i];
        const dy = (focusF - i) * rowH; // focus centred
        const y = h / 2 + dy;
        if (y < -20 || y > h + 20) continue;
        patina(tmpColor, s.strength);
        let r = tmpColor.r;
        let gg = tmpColor.g;
        let b = tmpColor.b;
        if (i === n - 1) {
          const m = Math.min(0.75, rms * 1.4);
          r += (1 - r) * m;
          gg += (1 - gg) * m;
          b += (1 - b) * m;
        }
        const bw = 40 + clamp01(s.strength) * 220 * s.radius;
        g.fillStyle = `rgb(${(r * 255) | 0},${(gg * 255) | 0},${(b * 255) | 0})`;
        g.fillRect(cx - bw / 2, y - 3, bw, 6);
      }
    }

    // ── the one loop ─────────────────────────────────────────────────────────────
    let raf = 0;
    let lastMs = performance.now();
    let roAccum = 0;

    function loop(nowMs: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.06, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const nowS = nowMs / 1000;

      // 1) pick a drive. Live camera when it has seen a body; else pointer if the
      //    viewer is actively moving the mouse; else the autonomous demo.
      let usedLive = false;
      let liveLost = false;
      const live = readLive(nowMs);
      if (live) {
        if (live.present) {
          ingestAxis(live.axis, live.open, dt, nowS);
          usedLive = true;
          if (!sawReal) sawReal = true;
        } else {
          // tracking on, body not framed → relax toward present, lost state
          ingestAxis(axisS * 0.96 + 0.04 * 0.85, openS * 0.9, dt, nowS);
          usedLive = true;
          liveLost = true;
        }
      }
      if (!usedLive) {
        if (nowS < pointerUntil) {
          // pointer override already wrote axisTarget/openTarget via handler
          ingestAxis(axisTarget, openTarget, dt, nowS);
          driver = "pointer";
        } else {
          const d = demoAxis(nowS);
          ingestAxis(d.axis, d.open, dt, nowS);
          driver = "demo";
        }
      } else {
        driver = sawReal ? "live" : "demo";
      }
      lost = liveLost;

      // 2) advance the present clock (synthetic until audio is live)
      if (ctx && buffer && liveSrc) presentOffset = livePlayhead();
      else {
        presentOffset += dt;
        if (presentOffset > FALLBACK_DUR) presentOffset -= FALLBACK_DUR;
      }

      // 3) depth → focused stratum + crossfade level
      const n = strata.length;
      const focusF = n > 0 ? axisS * (n - 1) : 0;
      const newFocus = Math.round(focusF);
      if (newFocus !== focusIdx) {
        focusIdx = Math.max(0, Math.min(n - 1, newFocus));
        const f = strata[focusIdx];
        if (f) reauditionPos = f.offset; // re-start the remembered moment
      }
      focusIdx = Math.max(0, Math.min(Math.max(0, n - 1), focusIdx));

      const presentLevel = smooth01(
        (axisS - PRESENT_LO) / (PRESENT_HI - PRESENT_LO),
      );
      const reLevel = n > 0 ? 1 - presentLevel : 0;

      // 4) RECONSOLIDATION + DECAY (the deepening)
      if (n > 0) {
        for (let i = 0; i < n; i++) {
          if (i === focusIdx && reLevel > 0.25) {
            // dwelling re-hears it → strengthen, and drift offset toward present
            const f = strata[i];
            f.strength = Math.min(1.3, f.strength + dt * RECONSOLIDATE * reLevel);
            f.lastAudit = nowS;
            if (buffer) {
              const D = buffer.duration;
              let diff = presentOffset - f.offset;
              if (diff > D / 2) diff -= D;
              else if (diff < -D / 2) diff += D;
              const step =
                Math.max(-0.4, Math.min(0.4, diff)) * dt * 0.08 * reLevel;
              f.offset = (f.offset + step + D) % D;
            }
          } else if (i !== n - 1) {
            // everything else (except the ever-fresh live top) slowly fades
            strata[i].strength = Math.max(0.04, strata[i].strength - dt * DECAY);
          }
        }
      }

      // 5) audio: crossfade live take vs re-audition grains by depth
      if (ctx && liveGain && grainBus) {
        const liveLvl = buffer ? 0.12 + 0.85 * presentLevel : 0;
        liveGain.gain.setTargetAtTime(liveLvl, ctx.currentTime, 0.14);
        grainBus.gain.setTargetAtTime(reLevel * 0.9, ctx.currentTime, 0.14);
        scheduleReaudition(reLevel);
      }

      // 6) master RMS → live-band glow
      let rms = 0;
      if (master && specBuf) {
        master.analyser.getByteTimeDomainData(specBuf);
        let acc = 0;
        for (let i = 0; i < specBuf.length; i++) {
          const v = (specBuf[i] - 128) / 128;
          acc += v * v;
        }
        rms = Math.sqrt(acc / specBuf.length);
      }

      if (renderer) render3d(nowS, dt, rms);
      else render2d(rms);

      // 7) throttled React readout
      roAccum += dt;
      if (roAccum > 0.2) {
        roAccum = 0;
        const fs = strata[focusIdx]?.strength ?? 0;
        setReadout((r) => {
          const depth = Math.round(axisS * 100) / 100;
          if (
            r.driver === driver &&
            r.lost === lost &&
            r.count === n &&
            Math.abs(r.depth - depth) < 0.02 &&
            Math.abs(r.focusStrength - fs) < 0.04
          ) {
            return r;
          }
          return { ...r, driver, lost, depth, count: n, focusStrength: fs };
        });
      }
    }
    raf = requestAnimationFrame(loop);

    // ── pointer fallback: mouse Y = axis (top=present), drag = openness ────────
    function onPointerMove(e: PointerEvent) {
      if (!mount || camState === "on") return; // live tracking owns the axis
      const rect = mount.getBoundingClientRect();
      const ny = clamp01((e.clientY - rect.top) / Math.max(1, rect.height));
      axisTarget = 1 - ny; // top of screen = present/raised
      if (e.buttons > 0 || e.pressure > 0) {
        openTarget = 0.85;
      } else {
        openTarget = 0.35 + (1 - ny) * 0.3;
      }
      pointerUntil = performance.now() / 1000 + 2.5;
    }
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerdown", onPointerMove);

    // ── resize ─────────────────────────────────────────────────────────────────
    function onResize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (renderer && camera) {
        renderer.setSize(w, h);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      }
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ── teardown ─────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerdown", onPointerMove);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (landmarker) {
        try {
          landmarker.close();
        } catch {
          /* ignore */
        }
      }
      stopAudio();
      if (slabs) slabs.dispose();
      if (slabGeo) slabGeo.dispose();
      if (slabMat) slabMat.dispose();
      if (coreGeo) coreGeo.dispose();
      if (coreMat) coreMat.dispose();
      if (renderer) {
        renderer.dispose();
        try {
          renderer.forceContextLoss();
        } catch {
          /* ignore */
        }
        if (mount && mount.contains(renderer.domElement))
          mount.removeChild(renderer.domElement);
      }
      if (mount && canvas2d && mount.contains(canvas2d))
        mount.removeChild(canvas2d);
      engineRef.current = null;
    };
  }, []); // built once; buttons drive it through engineRef

  // ── button handlers ──────────────────────────────────────────────────────────
  const handleSound = useCallback(() => {
    if (soundOn) {
      engineRef.current?.stopAudio();
      setSoundOn(false);
    } else {
      engineRef.current?.startAudio();
      setSoundOn(true);
    }
  }, [soundOn]);

  const handleCam = useCallback(() => {
    void engineRef.current?.startCam();
  }, []);

  const handleTrack = useCallback((id: string) => {
    setTrackId(id);
    engineRef.current?.setTrack(id);
  }, []);

  // ── status line ──────────────────────────────────────────────────────────────
  const depthPct = Math.round(readout.depth * 100);
  const mode = readout.depth > 0.72 ? "present · depositing" : "past · re-auditioning";
  const statusEl =
    readout.driver === "live" ? (
      readout.lost ? (
        <span className="text-destructive">
          tracking · lost — face the camera, shoulders in frame
        </span>
      ) : (
        <span className="text-foreground">
          tracking · live — {mode} · depth {depthPct}% · {readout.count} strata
        </span>
      )
    ) : readout.driver === "pointer" ? (
      <span className="text-muted-foreground/80">
        pointer · mouse — {mode} · depth {depthPct}% · {readout.count} strata
      </span>
    ) : (
      <span className="text-muted-foreground/70">
        demo · autonomous — {mode} · depth {depthPct}% · {readout.count} strata
      </span>
    );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* hidden feed for MediaPipe only */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* full-bleed column */}
      <div ref={mountRef} className="absolute inset-0" />

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Rerise"
        description="A bidirectional memory column. Reaching up and opening your body plays Karel's recording live and deposits each live moment as a new stratum at the top. Settling and lowering travels the camera back down through everything you've laid down, re-auditioning the moment remembered at that depth. Dwelling on a memory strengthens it and drifts it toward the present; moments you never return to slowly fade."
        howTo={[
          "Allow the camera and sit so your shoulders and head fill the frame.",
          "Reach up and open your arms to stay in the present — the recording plays and lays down new strata.",
          "Settle and lower your body to descend; the column travels down and re-plays the moment at that depth.",
          "Linger on a memory to deepen it (it warms toward gold); ignore one and it fades to slate.",
          "No camera? Move the mouse (up = present, down = past; drag = open), or just watch the autonomous demo.",
          "Press f for fullscreen, i for info.",
        ]}
      />

      {/* tracking status — always visible while active */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
        {statusEl}
      </div>

      {/* functional error notices — kept visible even in immersive mode */}
      {(notice || !webglOk) && (
        <div className="pointer-events-none absolute left-4 top-12 z-30 max-w-md space-y-1">
          {notice && (
            <p className="text-base leading-relaxed text-destructive">{notice}</p>
          )}
          {!webglOk && (
            <p className="text-base leading-relaxed text-destructive">
              WebGL isn&apos;t available here, so the column renders in a simple 2D
              fallback — the memory mechanism and (once started) the audio still run.
            </p>
          )}
        </div>
      )}

      {!immersive && (
        <>
          {/* back link */}
          <div className="pointer-events-none absolute right-4 top-4 z-30">
            <Link
              href="/dream"
              className="pointer-events-auto text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              ← dream lab
            </Link>
          </div>

          {/* title + controls strip, bottom-anchored light overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-5 sm:p-7">
            <div className="max-w-xl">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Rerise
              </h1>
              <p className="mt-1.5 max-w-lg text-base leading-relaxed text-muted-foreground">
                Memory made bidirectional: reach up to deposit the present as a
                new stratum, settle to descend and re-audition the past. Re-hearing
                a moment reconsolidates it — it warms and drifts toward now — while
                moments you never return to fade to slate.
              </p>
            </div>

            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSound}
                className={
                  soundOn
                    ? "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    : "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                }
              >
                {soundOn ? "Stop sound" : "Start sound"}
              </button>
              {camState !== "on" && (
                <button
                  type="button"
                  onClick={handleCam}
                  disabled={camState === "starting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  {camState === "starting"
                    ? "Enabling camera…"
                    : camState === "failed"
                      ? "Retry camera"
                      : "Enable camera — conduct with your body"}
                </button>
              )}

              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                track
                <select
                  value={trackId}
                  onChange={(e) => handleTrack(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                >
                  {COLLECTIONS.map((c) => (
                    <optgroup key={c.name} label={c.name}>
                      {c.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <Link
                href="/dream/18816-rerise/README.md"
                className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                read the design notes
              </Link>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
