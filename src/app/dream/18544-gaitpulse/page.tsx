"use client";

/* ── 18544 · GaitPulse ───────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if your whole body's SWAY became the PULSE of one of
 *  Karel's recordings — conduct the rhythm with your body, not your hands?
 *
 *  INPUT  : MediaPipe PoseLandmarker (full-body). We read ONLY the upper-body
 *           landmarks a desk webcam actually sees — shoulders + nose (+ wrists
 *           as a presence check) — and fold them into one torso-cadence signal:
 *           the deviation of the torso centroid from its slow centre, which
 *           peaks at every extreme of a sway (left/right or up/down).
 *  TECHNIQUE: running autocorrelation over that cadence signal estimates a body
 *           TEMPO; local extrema phase-LOCK the grid (each extreme = a downbeat).
 *           A lookahead grain scheduler then re-articulates Karel's REAL piano
 *           recording onto that pulse: short Hann-windowed windows (~140–260 ms)
 *           re-triggered on the beat-grid at playbackRate 1.0 — the piece is
 *           re-TIMED onto your body, never pitched.
 *  OUTPUT : a three.js instanced kinetic lattice of light ("voltaic jade" —
 *           bioluminescent emerald cores bleeding to near-white on a near-black
 *           field) whose cells pulse as shells expanding on the beat-grid.
 *
 *  Inspired by inversion of *Encypher* (arXiv:2609.18062) — there collective
 *  body movement conditions GENERATED music; here one body's cadence instead
 *  re-articulates an EXISTING recording. Tempo-from-motion follows the classic
 *  autocorrelation beat-tracker lineage (OBTAIN, arXiv:1704.02216).
 *
 *  Alive on load via an autonomous demo drive (a Lissajous swaying torso) that
 *  feeds the IDENTICAL cadence → tempo → scheduler → visuals chain, so the
 *  piece breathes with no camera. See README.md.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── palette (voltaic jade) ───────────────────────────────────────────────────
const FIELD = 0x050a07; // deep jade-black field
const JADE_H = 0.432; // ~155° hue
const DEFAULT_TRACK = REAL_TRACKS[0].id;

// ── cadence / tempo constants ────────────────────────────────────────────────
const FS = 30; // cadence resample rate (Hz)
const CAD_LEN = 160; // ~5.3 s ring buffer
const LAG_MIN = Math.round(FS * 0.3); // fastest beat period 0.30 s
const LAG_MAX = Math.round(FS * 1.4); // slowest beat period 1.40 s
const DEFAULT_PERIOD = 0.9; // s, used when cadence is too weak to read
const LOOKAHEAD = 0.12; // grain scheduler lookahead (s)

type Driver = "demo" | "live";
type Lost = boolean;

interface Engine {
  startAudio: () => void;
  stopAudio: () => void;
  startCam: () => Promise<void>;
  setTrack: (id: string) => void;
}

interface Readout {
  driver: Driver;
  lost: Lost;
  bpm: number;
  conf: number;
  subdiv: number;
  title: string;
}

export default function GaitPulsePage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const { immersive, toggle } = useImmersive();

  const [soundOn, setSoundOn] = useState(false);
  const [camState, setCamState] = useState<"idle" | "starting" | "on" | "failed">("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [readout, setReadout] = useState<Readout>({
    driver: "demo",
    lost: false,
    bpm: 0,
    conf: 0,
    subdiv: 1,
    title: REAL_TRACKS[0].title,
  });

  // ── one engine, built once; React buttons reach it via engineRef ────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── three.js lattice (WebGL optional) ─────────────────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let lattice: THREE.InstancedMesh | null = null;
    let geo: THREE.BufferGeometry | null = null;
    let mat: THREE.MeshBasicMaterial | null = null;
    let group: THREE.Group | null = null;

    const GX = reduce ? 12 : 16;
    const GY = reduce ? 7 : 9;
    const GZ = reduce ? 3 : 4;
    const COUNT = GX * GY * GZ;
    const SPACING = 0.42;
    // per-instance lattice radius from centre (for expanding beat shells)
    const radii = new Float32Array(COUNT);
    const basePos: THREE.Vector3[] = [];
    let maxRadius = 1;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      if (!renderer.getContext()) throw new Error("no webgl");
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setClearColor(FIELD, 1);
      mount.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(FIELD, 0.085);
      camera = new THREE.PerspectiveCamera(
        50,
        mount.clientWidth / Math.max(1, mount.clientHeight),
        0.1,
        100,
      );
      camera.position.set(0, 0.3, 9.2);
      camera.lookAt(0, 0, 0);

      group = new THREE.Group();
      scene.add(group);

      geo = new THREE.OctahedronGeometry(0.12, 0);
      mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 1,
      });
      lattice = new THREE.InstancedMesh(geo, mat, COUNT);
      lattice.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      let i = 0;
      const cx = (GX - 1) / 2;
      const cy = (GY - 1) / 2;
      const cz = (GZ - 1) / 2;
      const color = new THREE.Color();
      color.setHSL(JADE_H, 0.85, 0.12);
      for (let x = 0; x < GX; x++) {
        for (let y = 0; y < GY; y++) {
          for (let z = 0; z < GZ; z++) {
            const px = (x - cx) * SPACING;
            const py = (y - cy) * SPACING;
            const pz = (z - cz) * SPACING;
            basePos.push(new THREE.Vector3(px, py, pz));
            const r = Math.hypot(px, py, pz);
            radii[i] = r;
            if (r > maxRadius) maxRadius = r;
            lattice.setColorAt(i, color);
            i++;
          }
        }
      }
      if (lattice.instanceColor) lattice.instanceColor.needsUpdate = true;
      group.add(lattice);
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
      lattice = null;
    }

    // ── audio state ────────────────────────────────────────────────────────────
    let ctx: AudioContext | null = null;
    let master: SafeMaster | null = null;
    let grainBus: GainNode | null = null;
    let buffer: AudioBuffer | null = null;
    let wantTrack = DEFAULT_TRACK;
    let loadingTrack = false;
    let readPos = 0; // read head into the recording (s)
    let liveGrains = 0; // concurrent grain voices (runaway guard)
    let specBuf: Uint8Array<ArrayBuffer> | null = null;

    // precomputed Hann window curve (scaled per grain)
    const HANN_N = 256;
    const hann = new Float32Array(HANN_N);
    for (let n = 0; n < HANN_N; n++) {
      hann[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (HANN_N - 1)));
    }
    const hannScratch = new Float32Array(HANN_N);

    // ── cadence / tempo state (shared by live + demo — the IDENTICAL chain) ─────
    const cad = new Float32Array(CAD_LEN); // ring buffer of deviation magnitude
    let cadHead = 0;
    let cadFilled = 0;
    let fsAccum = 0; // resample accumulator
    let centerX = 0.5;
    let centerY = 0.5; // slow EMA of torso centroid → the "centre" of the sway
    let centerInit = false;
    let devSmooth = 0; // smoothed deviation magnitude (the cadence signal)
    let devPrev = 0;
    let devSlopePrev = 0;
    let recentMaxDev = 0.02; // adaptive extreme threshold
    let swayX = 0; // signed horizontal deviation (for the lattice tilt)
    let swayY = 0;

    let beatPeriod = DEFAULT_PERIOD;
    let tempoConf = 0;
    let acAccum = 0; // run autocorrelation ~10 Hz, not every frame
    let lastExtremeT = -1; // perf.now seconds of last accepted extreme

    // beat-grid scheduler state
    let nextGrainT = 0; // ctx time of next grain (audio) — valid once ctx exists
    let grainCounter = 0; // index within the current beat (0 == downbeat)
    let visPhase = 0; // visual-only beat phase [0,1) when audio is off
    let visSub = 0; // visual-only subdivision counter

    // active + pending light pulses
    interface Pulse {
      born: number;
      strength: number;
      down: boolean;
    }
    const active: Pulse[] = [];
    const pending: { fireCtx: number; strength: number; down: boolean }[] = [];

    let driver: Driver = "demo";
    let lost = false;
    let sawReal = false;

    // ── the SINGLE cadence entry point — live AND demo both call this ───────────
    function ingestTorso(cxN: number, cyN: number, present: boolean, dt: number) {
      if (!present) {
        // let the cadence relax toward zero so the pulse goes sparse/broad
        devSmooth += (0 - devSmooth) * Math.min(1, dt * 4);
        swayX += (0 - swayX) * Math.min(1, dt * 4);
        swayY += (0 - swayY) * Math.min(1, dt * 4);
        pushCadence(dt, 0);
        return;
      }
      if (!centerInit) {
        centerX = cxN;
        centerY = cyN;
        centerInit = true;
      }
      // slow EMA centre (the still point the body sways around)
      const kc = Math.min(1, dt / 1.6);
      centerX += (cxN - centerX) * kc;
      centerY += (cyN - centerY) * kc;
      const dx = cxN - centerX;
      const dy = cyN - centerY;
      // signed deviations for the lattice tilt (smoothed ~0.12 s)
      const ks = Math.min(1, dt / 0.12);
      swayX += (dx - swayX) * ks;
      swayY += (dy - swayY) * ks;
      const dev = Math.hypot(dx, dy);
      // deviation magnitude → smoothed cadence signal (peaks at every extreme)
      devSmooth += (dev - devSmooth) * Math.min(1, dt / 0.09);
      pushCadence(dt, devSmooth);
      detectExtreme();
    }

    function pushCadence(dt: number, value: number) {
      fsAccum += dt;
      const step = 1 / FS;
      // guard against huge dt (tab backgrounded) — cap resample iterations
      let guard = 0;
      while (fsAccum >= step && guard < 8) {
        fsAccum -= step;
        guard++;
        cad[cadHead] = value;
        cadHead = (cadHead + 1) % CAD_LEN;
        if (cadFilled < CAD_LEN) cadFilled++;
      }
    }

    // local-maximum (sway extreme) detection with magnitude + refractory gating
    function detectExtreme() {
      recentMaxDev += (devSmooth - recentMaxDev) * 0.02;
      if (recentMaxDev > 0 && devSmooth < recentMaxDev * 0.4) {
        // crude decay of the adaptive ceiling when motion drops
        recentMaxDev *= 0.995;
      }
      const slope = devSmooth - devPrev;
      devPrev = devSmooth;
      const nowS = performance.now() / 1000;
      // extreme = slope flips +→− (a local max) while the signal is near its ceiling
      const isPeak = devSlopePrev > 0 && slope <= 0;
      devSlopePrev = slope;
      if (!isPeak) return;
      const strongEnough = devSmooth > Math.max(0.012, recentMaxDev * 0.55);
      const refractory = beatPeriod * 0.55;
      if (strongEnough && nowS - lastExtremeT > refractory) {
        lastExtremeT = nowS;
        onExtreme();
      }
    }

    // a confirmed sway extreme → phase-lock the downbeat here
    function onExtreme() {
      if (ctx && grainBus && buffer) {
        // realign the grid so the imminent grain is a downbeat
        grainCounter = 0;
        nextGrainT = ctx.currentTime + 0.055;
      } else {
        // audio off → fire the visual downbeat now, reset the visual grid
        visPhase = 0;
        visSub = 0;
        emitPulse(1, true);
      }
    }

    function runTempoEstimate() {
      if (cadFilled < LAG_MAX + 8) {
        tempoConf = 0;
        return;
      }
      const N = cadFilled;
      // linearise the ring into oldest→newest order
      const x = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        x[k] = cad[(cadHead - N + k + CAD_LEN * 2) % CAD_LEN];
      }
      let mean = 0;
      for (let k = 0; k < N; k++) mean += x[k];
      mean /= N;
      let energy = 0;
      for (let k = 0; k < N; k++) {
        x[k] -= mean;
        energy += x[k] * x[k];
      }
      if (energy < 1e-5) {
        tempoConf = 0;
        return;
      }
      let bestLag = -1;
      let bestR = 0;
      for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) {
        let acc = 0;
        const m = N - lag;
        for (let k = 0; k < m; k++) acc += x[k] * x[k + lag];
        const r = acc / energy; // biased normalisation (favours shorter lags gently)
        if (r > bestR) {
          bestR = r;
          bestLag = lag;
        }
      }
      if (bestLag > 0 && bestR > 0.22) {
        const p = bestLag / FS;
        beatPeriod += (p - beatPeriod) * 0.25; // smooth the tempo
        tempoConf = Math.min(1, bestR);
      } else {
        tempoConf *= 0.9;
        beatPeriod += (DEFAULT_PERIOD - beatPeriod) * 0.02;
      }
    }

    // subdivisions + window length follow the detected cadence
    function currentSubdiv(): number {
      if (tempoConf < 0.28) return 1; // weak cadence → sparse, broad
      if (beatPeriod > 0.72) return 1;
      if (beatPeriod > 0.46) return 2;
      return 4;
    }

    function grainWindow(interval: number): number {
      // broad (0.26 s) when sparse, tight (0.14 s) when dense
      const t = Math.max(0, Math.min(1, (interval - 0.18) / (0.6 - 0.18)));
      return 0.14 + t * (0.26 - 0.14);
    }

    // ── the lookahead grain scheduler — re-articulation of Karel's recording ────
    function scheduleGrains() {
      if (!ctx || !grainBus || !buffer) return;
      const subdiv = currentSubdiv();
      const interval = beatPeriod / subdiv;
      const now = ctx.currentTime;
      if (nextGrainT < now) nextGrainT = now + 0.02;
      let safety = 0;
      while (nextGrainT < now + LOOKAHEAD && safety < 16) {
        safety++;
        const down = grainCounter % subdiv === 0;
        const win = grainWindow(interval);
        fireGrain(nextGrainT, win, down);
        // visual pulse coincident with the audible grain
        pending.push({ fireCtx: nextGrainT, strength: down ? 1 : 0.5, down });
        // advance the read head by the musical gap → the piece keeps progressing
        // at ~natural pace while being re-windowed onto the body pulse
        readPos += interval;
        if (readPos > buffer.duration - 0.35) readPos = 0.0;
        nextGrainT += interval;
        grainCounter = (grainCounter + 1) % 1024;
      }
    }

    function fireGrain(startT: number, win: number, down: boolean) {
      if (!ctx || !grainBus || !buffer) return;
      if (liveGrains > 28) return; // runaway guard
      const amp = down ? 0.95 : 0.52;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 1.0; // pitch preserved — we re-TIME, never transpose
      const g = ctx.createGain();
      g.gain.value = 0;
      for (let n = 0; n < HANN_N; n++) hannScratch[n] = hann[n] * amp;
      try {
        g.gain.setValueCurveAtTime(hannScratch, startT, win);
      } catch {
        // curve scheduling can throw if startT already passed — approximate
        g.gain.setValueAtTime(0, startT);
        g.gain.linearRampToValueAtTime(amp, startT + win * 0.5);
        g.gain.linearRampToValueAtTime(0, startT + win);
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
      const off = Math.max(0, Math.min(buffer.duration - win - 0.02, readPos));
      try {
        src.start(startT, off, win + 0.03);
        src.stop(startT + win + 0.03);
      } catch {
        liveGrains--;
      }
    }

    function emitPulse(strength: number, down: boolean) {
      active.push({ born: performance.now() / 1000, strength, down });
      if (active.length > 48) active.splice(0, active.length - 48);
    }

    // ── visual-only beat clock (runs when audio is off, keeps the lattice alive) ─
    function advanceVisualClock(dt: number) {
      if (ctx && buffer) return; // audio path drives the pulses instead
      const subdiv = currentSubdiv();
      visPhase += dt / Math.max(0.12, beatPeriod);
      while (visPhase >= 1) {
        visPhase -= 1;
        visSub = (visSub + 1) % subdiv;
        emitPulse(visSub === 0 ? 1 : 0.5, visSub === 0);
      }
    }

    // ── demo drive: a Lissajous swaying torso feeding the SAME chain ───────────
    function demoTorso(nowS: number): { x: number; y: number } {
      // a slow lateral sway (~0.5 Hz) with a shallow vertical bob at 2× —
      // plus a very slow tempo drift so the estimator visibly re-locks
      const drift = 0.5 + 0.12 * Math.sin(nowS * 0.05);
      const x = 0.5 + 0.11 * Math.sin(2 * Math.PI * drift * nowS);
      const y = 0.46 + 0.045 * Math.sin(2 * Math.PI * drift * 2 * nowS + 0.6);
      return { x, y };
    }

    // ── audio lifecycle ─────────────────────────────────────────────────────────
    async function loadInto(ctxx: AudioContext, id: string) {
      loadingTrack = true;
      try {
        const loaded = await loadRealTrackBuffer(ctxx, id);
        buffer = loaded.buffer;
        readPos = 0;
        setReadout((r) => ({ ...r, title: loaded.title }));
        setNotice(null);
      } catch {
        buffer = null;
        setNotice(
          "That recording could not be loaded — the lattice keeps pulsing on your cadence, silently.",
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
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        void ctx.resume();
        master = createSafeMaster(ctx);
        grainBus = ctx.createGain();
        grainBus.gain.value = 0.0;
        grainBus.connect(master.input); // EVERYTHING terminates at the safe bus
        specBuf = new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount));
        nextGrainT = ctx.currentTime + 0.1;
        grainCounter = 0;
        void loadInto(ctx, wantTrack);
      } catch {
        ctx = null;
        master = null;
        grainBus = null;
        setNotice("Web Audio is unavailable here — the lattice still pulses on your cadence.");
      }
    }

    function stopAudio() {
      const deadCtx = ctx;
      const g = grainBus;
      grainBus = null;
      buffer = null;
      ctx = null;
      master = null;
      if (g) {
        try {
          g.disconnect();
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

    // ── pose / camera ────────────────────────────────────────────────────────────
    let landmarker: PoseLandmarkerInst | null = null;
    let stream: MediaStream | null = null;

    async function startCam() {
      setCamState("starting");
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setCamState("failed");
        setNotice("No camera available — the autonomous demo keeps conducting the piece.");
        return;
      }
      try {
        stream = await startCamera(video);
      } catch {
        setCamState("failed");
        setNotice("Camera blocked or off — the autonomous demo keeps conducting the piece.");
        return;
      }
      try {
        landmarker = await createPoseTracker(1);
        setCamState("on");
        setNotice(null);
      } catch {
        setCamState("failed");
        setNotice("Body-tracking model couldn't load (offline?) — the demo keeps conducting.");
      }
    }

    function setTrack(id: string) {
      wantTrack = id;
      if (ctx && !loadingTrack) void loadInto(ctx, id);
    }

    engineRef.current = { startAudio, stopAudio, startCam, setTrack };

    // ── read the live body → torso centroid + presence gate ───────────────────
    // Gate ONLY on shoulders + nose (+ wrists as presence); NEVER on hips/legs.
    function readLive(nowMs: number): { x: number; y: number; present: boolean } | null {
      const video = videoRef.current;
      if (!landmarker || !stream || !video || video.readyState < 2) return null;
      let res;
      try {
        res = landmarker.detectForVideo(video, nowMs);
      } catch {
        return null;
      }
      const lm = res?.landmarks?.[0];
      if (!lm) return { x: 0, y: 0, present: false };
      const ls = lm[POSE_LM.leftShoulder];
      const rs = lm[POSE_LM.rightShoulder];
      const nose = lm[POSE_LM.nose];
      const lw = lm[POSE_LM.leftWrist];
      const rw = lm[POSE_LM.rightWrist];
      const vis = (p?: { visibility?: number }) => (p?.visibility ?? 0) > 0.5;
      const haveTorso = vis(ls) && vis(rs) && vis(nose);
      const haveWrist = vis(lw) || vis(rw); // one wrist is enough for presence
      if (!haveTorso || !haveWrist) return { x: 0, y: 0, present: false };
      // mirror x to read like a mirror; centroid = shoulders + nose (upper body)
      const cxN = 1 - (ls.x + rs.x + nose.x) / 3;
      const cyN = (ls.y + rs.y + nose.y) / 3;
      return { x: cxN, y: cyN, present: true };
    }

    // ── render the lattice ─────────────────────────────────────────────────────
    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    const PULSE_LIFE = 1.0;
    const pulseSpeed = (maxRadius / PULSE_LIFE) * 1.08;

    function renderLattice(nowS: number, dt: number, rms: number) {
      if (!renderer || !scene || !camera || !lattice || !group) return;
      // drop expired pulses
      for (let i = active.length - 1; i >= 0; i--) {
        if (nowS - active[i].born > PULSE_LIFE) active.splice(i, 1);
      }
      // slow drift + sway tilt so body motion reads before the audio even starts
      group.rotation.y += dt * 0.12;
      group.rotation.x += (swayY * 2.2 - group.rotation.x) * Math.min(1, dt * 3);
      group.rotation.z += (-swayX * 1.8 - group.rotation.z) * Math.min(1, dt * 3);

      const base = 0.1 + rms * 0.5;
      for (let i = 0; i < COUNT; i++) {
        const r = radii[i];
        let a = base;
        for (let p = 0; p < active.length; p++) {
          const pl = active[p];
          const age = nowS - pl.born;
          const shell = age * pulseSpeed;
          const band = pl.down ? 0.5 : 0.38;
          const d = (r - shell) / band;
          const env = Math.exp(-d * d);
          const fade = 1 - age / PULSE_LIFE;
          a += pl.strength * env * fade * (pl.down ? 1.15 : 0.8);
        }
        a = a > 1.4 ? 1.4 : a;
        const bp = basePos[i];
        const s = 0.55 + a * 1.25;
        dummy.position.set(bp.x, bp.y, bp.z);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        lattice.setMatrixAt(i, dummy.matrix);
        // voltaic jade: dim emerald core → near-white highlight as it lights up
        const al = Math.min(1, a);
        tmpColor.setHSL(JADE_H + al * 0.01, 0.88 - al * 0.52, 0.1 + al * 0.8);
        lattice.setColorAt(i, tmpColor);
      }
      lattice.instanceMatrix.needsUpdate = true;
      if (lattice.instanceColor) lattice.instanceColor.needsUpdate = true;
      renderer.render(scene, camera);
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

      // 1) feed the cadence chain — live camera if it has seen a body, else demo.
      // readLive returns null until the landmarker + stream closures are ready,
      // so we never depend on the (mount-time-stale) camState here.
      let usedLive = false;
      let liveLost = false;
      const live = readLive(nowMs);
      if (live) {
        if (live.present) {
          ingestTorso(live.x, live.y, true, dt);
          usedLive = true;
          if (!sawReal) sawReal = true;
        } else {
          // tracking on but body not framed → lost state, relax cadence
          ingestTorso(0, 0, false, dt);
          usedLive = true;
          liveLost = true;
        }
      }
      if (!usedLive) {
        const t = demoTorso(nowS);
        ingestTorso(t.x, t.y, true, dt);
      }
      driver = usedLive && sawReal ? "live" : "demo";
      lost = liveLost;

      // 2) estimate body tempo (~10 Hz) + run the schedulers
      acAccum += dt;
      if (acAccum > 0.1) {
        acAccum = 0;
        runTempoEstimate();
      }
      advanceVisualClock(dt);
      scheduleGrains();

      // 3) move pending (audio-timed) pulses into the active light set
      if (ctx) {
        const cnow = ctx.currentTime;
        for (let i = pending.length - 1; i >= 0; i--) {
          if (pending[i].fireCtx <= cnow) {
            emitPulse(pending[i].strength, pending[i].down);
            pending.splice(i, 1);
          }
        }
        // presence/confidence → smoothed grain-bus level (setTargetAtTime)
        if (grainBus) {
          const level = lost ? 0.0 : 0.85;
          grainBus.gain.setTargetAtTime(level, ctx.currentTime, 0.12);
        }
      }

      // 4) audio RMS for the lattice base glow
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

      renderLattice(nowS, dt, rms);

      // 5) throttled React readout
      roAccum += dt;
      if (roAccum > 0.2) {
        roAccum = 0;
        setReadout((r) => {
          const bpm = Math.round(60 / Math.max(0.12, beatPeriod));
          const subdiv = currentSubdiv();
          if (
            r.driver === driver &&
            r.lost === lost &&
            r.bpm === bpm &&
            r.subdiv === subdiv &&
            Math.abs(r.conf - tempoConf) < 0.04
          ) {
            return r;
          }
          return { ...r, driver, lost, bpm, conf: tempoConf, subdiv };
        });
      }
    }
    raf = requestAnimationFrame(loop);

    // ── resize ─────────────────────────────────────────────────────────────────
    function onResize() {
      if (!mount || !renderer || !camera) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ── teardown ─────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (landmarker) {
        try {
          landmarker.close();
        } catch {
          /* ignore */
        }
      }
      stopAudio();
      if (lattice) lattice.dispose();
      if (geo) geo.dispose();
      if (mat) mat.dispose();
      if (renderer) {
        renderer.dispose();
        try {
          renderer.forceContextLoss();
        } catch {
          /* ignore */
        }
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      }
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
  const statusEl =
    readout.driver === "live" ? (
      readout.lost ? (
        <span className="text-destructive">
          tracking · lost — face the camera, shoulders in frame
        </span>
      ) : (
        <span className="text-foreground">
          tracking · live — {readout.bpm} bpm · conf {(readout.conf * 100).toFixed(0)}% · {readout.subdiv}×
        </span>
      )
    ) : (
      <span className="text-muted-foreground/70">
        demo · autonomous — {readout.bpm} bpm · {readout.subdiv}×
      </span>
    );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* hidden feed for MediaPipe only */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* full-bleed lattice */}
      <div ref={mountRef} className="absolute inset-0" />

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="GaitPulse"
        description="Your whole-body sway becomes the pulse of one of Karel's piano recordings. The camera reads your torso cadence, autocorrelation estimates a body tempo, and a lookahead grain scheduler re-articulates the real recording onto your beat — re-timed, never pitched."
        howTo={[
          "Allow the camera and sit so your shoulders and head fill the frame.",
          "Sway side to side, or bob gently — slow and wide, or quick and tight.",
          "Each furthest point of your sway lands a downbeat; faster sway packs the grains denser.",
          "No camera? The autonomous demo keeps conducting the piece on its own.",
          "Press f for fullscreen, i for info.",
        ]}
      />

      {/* tracking status — always visible while active */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
        {statusEl}
      </div>

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
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">GaitPulse</h1>
              <p className="mt-1.5 max-w-lg text-base leading-relaxed text-muted-foreground">
                Conduct the rhythm with your whole body, not your hands. Your sway
                becomes the pulse that re-articulates Karel&apos;s recording onto a
                lattice of voltaic-jade light.
              </p>
            </div>

            {notice && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-destructive">
                {notice}
              </p>
            )}
            {!webglOk && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-destructive">
                WebGL isn&apos;t available here, so the lattice can&apos;t render — the cadence engine
                and (once started) the audio re-articulation still run.
              </p>
            )}

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
            </div>
          </div>
        </>
      )}
    </main>
  );
}
