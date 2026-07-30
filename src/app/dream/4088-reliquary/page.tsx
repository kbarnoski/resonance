"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ────────────────────────────────────────────────────────────────────────────
   4088 · RELIQUARY  (a deep v2 of 3920 · NAVE)
   "What if the hall rang with Karel's REAL piano recording, split across its
   depth — and the room's acoustic (reverb tail) changed as you leaned through it?"

   Keeps nave's head-coupled OFF-AXIS (Kooima generalized perspective / Johnny
   Lee) projection and MediaPipe FaceLandmarker tracking EXACTLY. Adds two new
   subsystems:

     1) REAL RECORDING AS THE SPATIAL SOURCE. One audio source (a rich synthesized
        cathedral-piano bed by default; a real Resonance recording once an ID is
        pasted) is split into 5 frequency bands by cascaded biquad bandpasses.
        Each band routes to its OWN HRTF PannerNode placed at a different DEPTH —
        low bands deep in the apse, high bands near the entrance — so leaning
        through the hall reveals different registers of the SAME piece at
        different distances. Each luminous depth-node pulses with its band's RMS.

     2) POSITION-DEPENDENT (MOVABLE) REVERB. Instead of nave's single static
        ConvolverNode, a small Feedback-Delay-Network reverb (4 delay lines, a
        4×4 orthonormal Hadamard feedback matrix, per-line damping lowpass — all
        Web Audio nodes, no impulse file) whose decay, wet mix and damping are
        coupled to head position: lean into the apse → longer, wetter, darker
        tail; near the entrance → drier and shorter. The room "opens up" as you
        move. (Research anchor: FDN listener-movement-coupled RIR rendering,
        arXiv:2510.00238.)
   ──────────────────────────────────────────────────────────────────────────── */

// Deterministic PRNG — no Math.random / Date.now anywhere in this file.
function makeMulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x4088;

// Violet ramp (raw color allowed only inside the WebGL art).
const VIOLET = [0x8b5cf6, 0xa78bfa, 0xc4b5fd, 0xddd6fe];
const BACKDROP = 0x0b0713;

// Five frequency bands of the SAME source, placed at increasing depth into -Z.
// Low registers live deep in the apse; high registers sit near the entrance.
type BandSpec = {
  lo: number;
  hi: number;
  pos: [number, number, number];
  color: number;
  label: string;
};
const BANDS: BandSpec[] = [
  { lo: 30, hi: 150, pos: [0.1, -0.2, -22.0], color: VIOLET[0], label: "sub" }, // deep apse
  { lo: 150, hi: 400, pos: [-0.85, 0.28, -16.0], color: VIOLET[1], label: "low" },
  { lo: 400, hi: 1100, pos: [0.78, -0.28, -11.0], color: VIOLET[1], label: "mid" },
  { lo: 1100, hi: 3200, pos: [-0.6, 0.32, -6.4], color: VIOLET[2], label: "high" },
  { lo: 3200, hi: 16000, pos: [0.32, 0.02, -3.3], color: VIOLET[3], label: "air" }, // near
];

// Cathedral chord for the default synthesized bed — spans registers so every
// band has real content (low C2 for the apse, bright C5/E5 partials for the air).
const CHORD_HZ = [65.41, 130.81, 196.0, 261.63, 329.63, 392.0, 523.25, 659.25];

type HeadSource = "seed" | "camera" | "pointer";

type BandRuntime = {
  spec: BandSpec;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  bandGain: GainNode;
  panner: PannerNode;
  analyser: AnalyserNode;
  td: Float32Array<ArrayBuffer>;
  energy: number;
  // three.js art handles
  core: THREE.Mesh;
  halo: THREE.Mesh;
  light: THREE.PointLight;
  coreMat: THREE.MeshStandardMaterial;
  haloMat: THREE.MeshBasicMaterial;
};

// 4×4 Hadamard matrix / 2  → orthonormal (energy-preserving) FDN feedback.
const HADAMARD: number[][] = [
  [0.5, 0.5, 0.5, 0.5],
  [0.5, -0.5, 0.5, -0.5],
  [0.5, 0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5, 0.5],
];
// Mutually incommensurate delay times (seconds) — a cathedral-scale hall.
const DELAY_TIMES = [0.0431, 0.0687, 0.0953, 0.1231];

export default function ReliquaryPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [started, setStarted] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [source, setSource] = useState<HeadSource>("seed");
  const [notice, setNotice] = useState<string | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [readout, setReadout] = useState({ x: 0, y: 0, z: 2.4, open: 0 });

  const [recordingId, setRecordingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [srcMode, setSrcMode] = useState<"synth" | "recording">("synth");

  // Mutable engine state shared between the effect and the React handlers.
  const engine = useRef<{
    started: boolean;
    startCameraFn: (() => Promise<void>) | null;
    startAudioFn: (() => void) | null;
    loadRecordingFn: ((id: string) => Promise<string | null>) | null;
  }>({
    started: false,
    startCameraFn: null,
    startAudioFn: null,
    loadRecordingFn: null,
  });

  // ── Three.js scene + off-axis projection + head loop + audio (from mount) ────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglOk(false);
      return;
    }
    const testCtx = renderer.getContext();
    if (!testCtx) {
      setWebglOk(false);
      renderer.dispose();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(BACKDROP, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BACKDROP, 0.052);

    // We drive projectionMatrix by hand each frame — no fov is used.
    const camera = new THREE.PerspectiveCamera();

    // ── Build the nave: a receding colonnade + luminous band nodes ────────────
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(o: T): T => {
      disposables.push(o);
      return o;
    };

    // Floor grid (a long stone-violet aisle running into the dark).
    const grid = new THREE.GridHelper(60, 60, VIOLET[0], 0x241534);
    grid.position.set(0, -1.6, -28);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.28;
    disposables.push(grid.geometry);
    disposables.push(grid.material as THREE.Material);
    scene.add(grid);

    // Colonnade: paired columns + arch lintels marching into depth.
    const colGeo = track(new THREE.BoxGeometry(0.22, 3.4, 0.22));
    const archGeo = track(new THREE.BoxGeometry(2.6, 0.18, 0.18));
    const colMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x1a1030,
        emissive: VIOLET[0],
        emissiveIntensity: 0.06,
        roughness: 0.85,
        metalness: 0.1,
      }),
    );
    const bays = 12;
    for (let i = 0; i < bays; i++) {
      const z = -2 - i * 2.2;
      for (const sx of [-1.35, 1.35]) {
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(sx, -0.1, z);
        scene.add(col);
      }
      const arch = new THREE.Mesh(archGeo, colMat);
      arch.position.set(0, 1.55, z);
      scene.add(arch);
    }

    // Apse glow deep in -Z — brightens as the movable reverb "opens up".
    const apseGeo = track(new THREE.SphereGeometry(3.2, 24, 24));
    const apseMat = track(
      new THREE.MeshBasicMaterial({
        color: VIOLET[0],
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const apse = new THREE.Mesh(apseGeo, apseMat);
    apse.position.set(0, 0, -26);
    scene.add(apse);

    // Star/dust motes so empty depth still has parallax cues.
    const rng = makeMulberry32(SEED);
    const moteCount = 240;
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = (rng() - 0.5) * 6;
      motePos[i * 3 + 1] = (rng() - 0.5) * 4;
      motePos[i * 3 + 2] = -1 - rng() * 30;
    }
    const moteGeo = track(new THREE.BufferGeometry());
    moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
    const moteMat = track(
      new THREE.PointsMaterial({
        color: VIOLET[2],
        size: 0.03,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    scene.add(new THREE.Points(moteGeo, moteMat));

    // Ambient + a faint key light so columns read as solid.
    scene.add(new THREE.AmbientLight(0x2a1c44, 1.1));
    const key = new THREE.DirectionalLight(VIOLET[1], 0.35);
    key.position.set(2, 4, 3);
    scene.add(key);

    // Luminous band nodes (shared geometry, per-band materials/lights).
    const coreGeo = track(new THREE.SphereGeometry(0.16, 24, 24));
    const haloGeo = track(new THREE.SphereGeometry(0.34, 24, 24));

    const bands: BandRuntime[] = BANDS.map((spec) => {
      const coreMat = track(
        new THREE.MeshStandardMaterial({
          color: spec.color,
          emissive: spec.color,
          emissiveIntensity: 0.4,
          roughness: 0.3,
          metalness: 0.0,
        }),
      );
      const haloMat = track(
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.06,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const core = new THREE.Mesh(coreGeo, coreMat);
      const halo = new THREE.Mesh(haloGeo, haloMat);
      core.position.set(...spec.pos);
      halo.position.set(...spec.pos);
      const light = new THREE.PointLight(spec.color, 0.0, 7, 2);
      light.position.set(...spec.pos);
      scene.add(core);
      scene.add(halo);
      scene.add(light);
      return {
        spec,
        core,
        halo,
        light,
        coreMat,
        haloMat,
        energy: 0,
        // audio handles filled in when audio starts:
        hp: null as unknown as BiquadFilterNode,
        lp: null as unknown as BiquadFilterNode,
        bandGain: null as unknown as GainNode,
        panner: null as unknown as PannerNode,
        analyser: null as unknown as AnalyserNode,
        td: new Float32Array(0) as Float32Array<ArrayBuffer>,
      };
    });

    // ── Off-axis (Kooima) generalized perspective projection ──────────────────
    // Screen = the window at z=0 (the monitor). The eye (head) sits at +Z in
    // front of it and looks along -Z into the hall. Screen axes are aligned with
    // world axes, so the view matrix is just a translation to the eye position.
    const NEAR = 0.08;
    const FAR = 70;
    const halfH = 1.0; // world half-height of the screen window
    let halfW = 1.0; // recomputed on resize from aspect

    function applyOffAxis(ex: number, ey: number, ez: number) {
      // Distance eye→screen plane (must stay positive).
      const d = Math.max(ez, 0.25);
      const l = ((-halfW - ex) * NEAR) / d;
      const r = ((halfW - ex) * NEAR) / d;
      const b = ((-halfH - ey) * NEAR) / d;
      const t = ((halfH - ey) * NEAR) / d;
      camera.projectionMatrix.makePerspective(l, r, t, b, NEAR, FAR);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(ex, ey, ez);
      camera.quaternion.identity();
      camera.updateMatrix();
    }

    function resize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      const aspect = w / Math.max(h, 1);
      halfW = halfH * aspect;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── Head-position state ───────────────────────────────────────────────────
    const rawTarget = { x: 0, y: 0, z: 2.4 };
    const head = { x: 0, y: 0, z: 2.4 };
    let lastCameraTs = -1e9;
    let lastPointerTs = -1e9;
    let cameraFailed = false;
    const t0 = performance.now();

    // Seeded synthetic head path (Lissajous orbit) for the headless self-demo.
    const sPhaseX = rng() * Math.PI * 2;
    const sPhaseY = rng() * Math.PI * 2;
    const sPhaseZ = rng() * Math.PI * 2;
    const sFreqX = 0.16 + rng() * 0.05;
    const sFreqY = 0.11 + rng() * 0.05;
    const sFreqZ = 0.07 + rng() * 0.04;

    function computeSyntheticHead(tSec: number) {
      rawTarget.x = 1.15 * Math.sin(tSec * sFreqX * Math.PI * 2 + sPhaseX);
      rawTarget.y = 0.62 * Math.sin(tSec * sFreqY * Math.PI * 2 + sPhaseY);
      rawTarget.z = 2.3 + 0.85 * Math.sin(tSec * sFreqZ * Math.PI * 2 + sPhaseZ);
    }

    // ── Pointer fallback (drives the exact same off-axis + audio path) ────────
    function onPointer(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width; // 0..1
      const ny = (e.clientY - rect.top) / rect.height; // 0..1
      rawTarget.x = (nx - 0.5) * 2.4;
      rawTarget.y = -(ny - 0.5) * 1.4;
      // Vertical drag also leans us in/out so pointer users can open the room.
      rawTarget.z = 1.6 + ny * 1.6;
      lastPointerTs = performance.now();
    }
    renderer.domElement.addEventListener("pointermove", onPointer);

    // ── MediaPipe FaceLandmarker (started on user gesture) ────────────────────
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown; close?: () => void } | null =
      null;
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) throw new Error("no video element");
        video.srcObject = stream;
        await video.play();

        // @ts-expect-error runtime ESM import from a CDN URL, no local types
        const vision: unknown = await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/+esm");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { FilesetResolver, FaceLandmarker } = vision as any;
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm",
        );
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        setNotice(null);
      } catch (err) {
        console.warn("camera/mediapipe unavailable — using pointer + self-demo", err);
        cameraFailed = true;
        landmarker = null;
        if (stream) {
          stream.getTracks().forEach((tr) => tr.stop());
          stream = null;
        }
        setNotice(
          "Camera or head-tracking unavailable — move your pointer to lean through the hall (drag down to lean into the apse), or just watch the self-demo. Full spatial audio still plays.",
        );
      }
    }
    engine.current.startCameraFn = startCamera;

    function readHead(nowMs: number) {
      const video = videoRef.current;
      if (!landmarker || !video || video.readyState < 2) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = landmarker.detectForVideo(video, nowMs);
        const lms = result?.faceLandmarks?.[0];
        if (!lms || !lms.length) return;
        let minX = 1,
          maxX = 0,
          minY = 1,
          maxY = 0;
        for (const p of lms) {
          const mx = 1 - p.x;
          if (mx < minX) minX = mx;
          if (mx > maxX) maxX = mx;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const cx = (minX + maxX) / 2; // 0..1
        const cy = (minY + maxY) / 2; // 0..1
        // Inter-eye pixel distance → depth (bigger = closer). 33/263 outer corners.
        const a = lms[33];
        const b = lms[263];
        const eyeDist = a && b ? Math.hypot((1 - a.x) - (1 - b.x), a.y - b.y) : 0.09;
        const zNorm = Math.max(0, Math.min(1, (eyeDist - 0.06) / (0.14 - 0.06)));
        rawTarget.x = (cx - 0.5) * 2.8;
        rawTarget.y = -(cy - 0.5) * 1.7;
        rawTarget.z = 3.2 - zNorm * 1.8;
        lastCameraTs = nowMs;
      } catch {
        /* transient detect error — ignore this frame */
      }
    }

    // ── Audio graph refs (built on user gesture only) ─────────────────────────
    const audioCtxRef = { current: null as AudioContext | null };
    const sourceOutRef = { current: null as GainNode | null };
    // Movable FDN reverb head-coupled handles:
    const fbGainsRef = { current: [] as GainNode[] };
    const dampsRef = { current: [] as BiquadFilterNode[] };
    const wetRef = { current: null as GainNode | null };
    // Source teardown handles:
    const synthOscsRef = { current: [] as OscillatorNode[] };
    const synthStoppedRef = { current: false };
    const recSourceRef = { current: null as AudioBufferSourceNode | null };

    function stopSynthBed() {
      if (synthStoppedRef.current) return;
      synthStoppedRef.current = true;
      const ctx = audioCtxRef.current;
      const now = ctx ? ctx.currentTime : 0;
      for (const o of synthOscsRef.current) {
        try {
          o.stop(now + 0.05);
        } catch {
          /* already stopped */
        }
      }
    }

    // Build the default synthesized cathedral-piano bed into `sourceOut`.
    function buildSynthBed(ctx: AudioContext, sourceOut: GainNode) {
      const partials = [1, 2, 3, 4.01, 6.0];
      const amps = [1, 0.5, 0.28, 0.12, 0.06];
      const oscs: OscillatorNode[] = [];
      CHORD_HZ.forEach((f0, ni) => {
        const noteGain = ctx.createGain();
        noteGain.gain.value = 0.0;
        // gentle wake-in so entering the hall blooms rather than clicks
        noteGain.gain.setTargetAtTime(0.14 / Math.sqrt(ni + 1), ctx.currentTime, 1.4);
        // slow breathing tremolo per note (seeded phase via note index)
        const trem = ctx.createOscillator();
        trem.type = "sine";
        trem.frequency.value = 0.06 + ni * 0.011;
        const tremGain = ctx.createGain();
        tremGain.gain.value = 0.05;
        trem.connect(tremGain);
        tremGain.connect(noteGain.gain);
        trem.start();
        oscs.push(trem);

        partials.forEach((mult, pi) => {
          const o = ctx.createOscillator();
          o.type = pi === 0 ? "triangle" : "sine";
          o.frequency.value = f0 * mult;
          o.detune.value = pi * 2.5 - ni * 1.5;
          const g = ctx.createGain();
          g.gain.value = amps[pi] * 0.22;
          o.connect(g);
          g.connect(noteGain);
          o.start();
          oscs.push(o);
        });
        noteGain.connect(sourceOut);
      });
      synthOscsRef.current = oscs;
    }

    // Build the movable Feedback-Delay-Network reverb. Returns its input node.
    function buildFDN(ctx: AudioContext): GainNode {
      const input = ctx.createGain();
      input.gain.value = 1.0;
      const wet = ctx.createGain();
      wet.gain.value = 0.14;
      wet.connect(ctx.destination);
      wetRef.current = wet;

      const delays: DelayNode[] = [];
      const damps: BiquadFilterNode[] = [];
      const fbs: GainNode[] = [];
      for (let i = 0; i < 4; i++) {
        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = DELAY_TIMES[i];
        const damp = ctx.createBiquadFilter();
        damp.type = "lowpass";
        damp.frequency.value = 4200;
        damp.Q.value = 0.4;
        const fb = ctx.createGain();
        fb.gain.value = 0.7; // decay — head-coupled at runtime
        // input injection + recirculation both feed the delay line
        input.connect(delay);
        delay.connect(damp);
        damp.connect(fb);
        damp.connect(wet); // wet tap (stereo preserved through the whole net)
        delays.push(delay);
        damps.push(damp);
        fbs.push(fb);
      }
      // Orthonormal Hadamard feedback matrix: fb[i] → matrix → delay[k]
      for (let i = 0; i < 4; i++) {
        for (let k = 0; k < 4; k++) {
          const m = ctx.createGain();
          m.gain.value = HADAMARD[i][k];
          fbs[i].connect(m);
          m.connect(delays[k]);
        }
      }
      dampsRef.current = damps;
      fbGainsRef.current = fbs;
      return input;
    }

    function startAudio() {
      if (audioCtxRef.current) return;
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      audioCtxRef.current = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.0;
      master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.0);
      master.connect(ctx.destination);

      const reverbInput = buildFDN(ctx);

      // The single source hub — synth bed now, real recording later.
      const sourceOut = ctx.createGain();
      sourceOut.gain.value = 1.0;
      sourceOutRef.current = sourceOut;

      // Split the source into bands; each band → its own HRTF panner at depth.
      for (const band of bands) {
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = band.spec.lo;
        hp.Q.value = 0.7;
        const hp2 = ctx.createBiquadFilter();
        hp2.type = "highpass";
        hp2.frequency.value = band.spec.lo;
        hp2.Q.value = 0.7;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = band.spec.hi;
        lp.Q.value = 0.7;
        const lp2 = ctx.createBiquadFilter();
        lp2.type = "lowpass";
        lp2.frequency.value = band.spec.hi;
        lp2.Q.value = 0.7;

        const bandGain = ctx.createGain();
        bandGain.gain.value = 1.0;

        const panner = ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 3;
        panner.rolloffFactor = 0.6;
        panner.maxDistance = 45;
        const [px, py, pz] = band.spec.pos;
        if (panner.positionX) {
          panner.positionX.value = px;
          panner.positionY.value = py;
          panner.positionZ.value = pz;
        } else {
          panner.setPosition(px, py, pz);
        }

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        const td = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;

        // Cascade: source → hp,hp2 → lp,lp2 → bandGain → analyser tap + panner
        sourceOut.connect(hp);
        hp.connect(hp2);
        hp2.connect(lp);
        lp.connect(lp2);
        lp2.connect(bandGain);
        bandGain.connect(analyser);
        bandGain.connect(panner);
        // Dry (spatialized) to master, and the SAME spatialized signal to the
        // movable reverb so the tail carries the band's HRTF placement too.
        panner.connect(master);
        panner.connect(reverbInput);

        band.hp = hp;
        band.lp = lp;
        band.bandGain = bandGain;
        band.panner = panner;
        band.analyser = analyser;
        band.td = td;
      }

      buildSynthBed(ctx, sourceOut);
    }
    engine.current.startAudioFn = startAudio;

    // Fetch + decode a real Resonance recording, swap it in for the synth bed.
    async function loadRecording(id: string): Promise<string | null> {
      const ctx = audioCtxRef.current;
      const sourceOut = sourceOutRef.current;
      if (!ctx || !sourceOut) return "Enter the hall first, then load a recording.";
      try {
        const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { url?: string };
        if (!data.url) throw new Error("no url");
        const buf = await (await fetch(data.url)).arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(buf);

        // Stop any previous real source, then the synth bed.
        if (recSourceRef.current) {
          try {
            recSourceRef.current.stop();
          } catch {
            /* already stopped */
          }
          recSourceRef.current = null;
        }
        stopSynthBed();

        const src = ctx.createBufferSource();
        src.buffer = audioBuf;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0.0;
        g.gain.setTargetAtTime(0.9, ctx.currentTime, 0.4);
        src.connect(g);
        g.connect(sourceOut);
        src.start();
        recSourceRef.current = src;
        return null;
      } catch (err) {
        console.warn("recording load failed", err);
        return "Couldn't load that recording — check the ID. The synth hall keeps playing.";
      }
    }
    engine.current.loadRecordingFn = loadRecording;

    // ── Animation loop ────────────────────────────────────────────────────────
    let raf = 0;
    let lastFrame = performance.now();
    let readoutAccum = 0;

    function chooseSource(nowMs: number): HeadSource {
      if (nowMs - lastCameraTs < 350) return "camera";
      if (cameraFailed && nowMs - lastPointerTs < 2200) return "pointer";
      if (!cameraFailed && nowMs - lastPointerTs < 2200 && nowMs - t0 < 1600) return "pointer";
      return "seed";
    }

    let lastSource: HeadSource = "seed";

    function frame() {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      const tSec = (now - t0) / 1000;

      if (landmarker) readHead(now);

      const src = chooseSource(now);
      if (src === "seed") computeSyntheticHead(tSec);
      if (src !== lastSource) {
        lastSource = src;
        setSource(src);
      }

      // Exponential smoothing (low-latency, ~120ms).
      const k = 1 - Math.exp(-dt / 0.12);
      head.x += (rawTarget.x - head.x) * k;
      head.y += (rawTarget.y - head.y) * k;
      head.z += (rawTarget.z - head.z) * k;

      applyOffAxis(head.x, head.y, head.z);

      const ctx = audioCtxRef.current;
      const audioNow = ctx ? ctx.currentTime : 0;

      // ── Movable reverb: "openness" from head position ───────────────────────
      // Leaning IN (smaller head.z) is the primary opener; sweeping laterally
      // through the hall adds a little. 0 = dry entrance, 1 = wet apse.
      const leanIn = Math.max(0, Math.min(1, (3.1 - head.z) / 1.5));
      const lateral = Math.max(0, Math.min(1, Math.abs(head.x) / 1.15));
      const openness = Math.max(0, Math.min(1, 0.72 * leanIn + 0.28 * lateral));

      if (ctx) {
        // Decay (feedback), wet level and damping all track openness.
        const decay = 0.6 + openness * 0.28; // 0.60 → 0.88 (stable, < 0.9)
        const wetLevel = 0.1 + openness * 0.5; // 0.10 → 0.60
        const dampHz = 6000 - openness * 3600; // 6000 → 2400 (darker when open)
        for (const fb of fbGainsRef.current) fb.gain.setTargetAtTime(decay, audioNow, 0.3);
        for (const d of dampsRef.current) d.frequency.setTargetAtTime(dampHz, audioNow, 0.3);
        if (wetRef.current) wetRef.current.gain.setTargetAtTime(wetLevel, audioNow, 0.3);
      }

      // Apse glow reads the openness so you SEE the room open as you lean in.
      apseMat.opacity = 0.02 + openness * 0.22;
      apse.scale.setScalar(0.85 + openness * 0.5);

      // ── Per-band energy → luminous depth-node pulse ─────────────────────────
      for (const band of bands) {
        let e = band.energy;
        if (band.analyser && ctx) {
          band.analyser.getFloatTimeDomainData(band.td);
          let sum = 0;
          for (let i = 0; i < band.td.length; i++) sum += band.td[i] * band.td[i];
          const rms = Math.sqrt(sum / band.td.length);
          // normalise (bands are quiet post-split) and smooth
          const target = Math.min(1, rms * 7);
          e += (target - e) * (1 - Math.exp(-dt / 0.12));
          band.energy = e;
        }
        const nz = band.spec.pos[2];
        const pulse = 1 + 0.08 * Math.sin(tSec * 2.2 + nz);
        band.coreMat.emissiveIntensity = 0.35 + e * 3.0;
        band.core.scale.setScalar((0.7 + e * 1.1) * pulse);
        band.haloMat.opacity = 0.05 + e * 0.32;
        band.halo.scale.setScalar((0.8 + e * 1.8) * pulse);
        band.light.intensity = e * 2.8;
      }

      // Move the audio listener to the head each frame (mix follows the head).
      if (ctx) {
        const L = ctx.listener;
        if (L.positionX) {
          L.positionX.setTargetAtTime(head.x, audioNow, 0.05);
          L.positionY.setTargetAtTime(head.y, audioNow, 0.05);
          L.positionZ.setTargetAtTime(head.z, audioNow, 0.05);
          L.forwardX.setTargetAtTime(0, audioNow, 0.05);
          L.forwardY.setTargetAtTime(0, audioNow, 0.05);
          L.forwardZ.setTargetAtTime(-1, audioNow, 0.05);
          L.upX.setTargetAtTime(0, audioNow, 0.05);
          L.upY.setTargetAtTime(1, audioNow, 0.05);
          L.upZ.setTargetAtTime(0, audioNow, 0.05);
        } else {
          L.setPosition(head.x, head.y, head.z);
          L.setOrientation(0, 0, -1, 0, 1, 0);
        }
      }

      renderer.render(scene, camera);

      readoutAccum += dt;
      if (readoutAccum > 0.1) {
        readoutAccum = 0;
        setReadout({ x: head.x, y: head.y, z: head.z, open: openness });
      }
    }
    raf = requestAnimationFrame(frame);

    // ── Teardown ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointer);
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      if (landmarker && landmarker.close) {
        try {
          landmarker.close();
        } catch {
          /* ignore */
        }
      }
      const ctx = audioCtxRef.current;
      if (ctx) {
        if (recSourceRef.current) {
          try {
            recSourceRef.current.stop();
          } catch {
            /* ignore */
          }
        }
        for (const o of synthOscsRef.current) {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
        }
        void ctx.close();
      }
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          /* ignore */
        }
      }
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* ignore */
      }
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  const handleStart = useCallback(() => {
    if (engine.current.started) return;
    engine.current.started = true;
    setStarted(true);
    engine.current.startAudioFn?.();
    void engine.current.startCameraFn?.();
  }, []);

  const handleLoad = useCallback(async () => {
    const id = recordingId.trim();
    if (!id) return;
    if (!engine.current.started) handleStart();
    setLoading(true);
    setLoadError(null);
    const err = (await engine.current.loadRecordingFn?.(id)) ?? "Audio engine not ready yet.";
    if (err) {
      setLoadError(err);
    } else {
      setLoadError(null);
      setSrcMode("recording");
    }
    setLoading(false);
  }, [recordingId, handleStart]);

  const sourceLabel =
    source === "camera" ? "head · camera" : source === "pointer" ? "head · pointer" : "head · self-demo";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Hidden video feed for MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* WebGL canvas mount (full-bleed) */}
      <div ref={mountRef} className="absolute inset-0" />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL isn&apos;t available in this browser, so the reliquary can&apos;t be rendered. Try a
            hardware-accelerated desktop browser.
          </p>
        </div>
      )}

      {/* Hero + controls overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        <header className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight">Reliquary</h1>
          <p className="mt-1 text-base text-muted-foreground">
            One piano recording, split across the depth of a hall — low registers deep in the apse, high
            registers at the door. Lean <em>through</em> it and the room&apos;s reverb opens up.
          </p>
        </header>

        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            {notice && <p className="pointer-events-auto max-w-md text-base text-destructive">{notice}</p>}
            {!started ? (
              <button
                type="button"
                onClick={handleStart}
                className="pointer-events-auto min-h-[44px] w-fit rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter the hall
              </button>
            ) : (
              <p className="max-w-md text-base text-muted-foreground">
                Lean toward a distant light to walk into a register; lean <em>in</em> (toward the apse) and the
                tail lengthens and darkens — the room opens up.
              </p>
            )}

            {/* Recording loader — paste a Resonance UUID to spatialize real audio */}
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={recordingId}
                onChange={(e) => setRecordingId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleLoad();
                }}
                placeholder="paste a Resonance recording UUID…"
                className="min-h-[44px] w-64 rounded-md border border-border bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleLoad()}
                disabled={loading || !recordingId.trim()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {loading ? "Loading…" : "Load recording"}
              </button>
            </div>
            {loadError && <p className="max-w-md text-base text-destructive">{loadError}</p>}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>{sourceLabel}</span>
              <span>{srcMode === "recording" ? "src · recording" : "src · synth hall"}</span>
              <span>
                x {readout.x.toFixed(2)} · y {readout.y.toFixed(2)} · z {readout.z.toFixed(2)}
              </span>
              <span>reverb {(readout.open * 100).toFixed(0)}%</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>
      </div>

      {/* Design notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">4088 · reliquary</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The one question:</strong> what if the hall rang with Karel&apos;s
                real piano recording, split across its depth — and the room&apos;s acoustic changed as you leaned
                through it?
              </p>
              <p>
                This is a deep v2 of <em>3920 · nave</em>. It keeps nave&apos;s head-coupled{" "}
                <strong className="text-foreground">off-axis (asymmetric-frustum) projection</strong> (Kooima&apos;s
                generalized perspective; Johnny Lee&apos;s Wii-remote head-coupled technique) and MediaPipe
                FaceLandmarker tracking, so leaning your head turns the flat monitor into a window into a deep nave.
              </p>
              <p>
                <strong className="text-foreground">Depth-band cartography.</strong> One source — a synthesized
                cathedral-piano bed by default, or a real recording once you paste a UUID — is split by cascaded
                biquad bandpasses into five frequency bands. Each band is routed to its own HRTF{" "}
                <strong className="text-foreground">PannerNode</strong> placed at a different depth: sub/low bands
                deep in the apse, air near the entrance. Walking the hall reveals different registers of the{" "}
                <em>same</em> piece at different distances; each luminous node pulses with its band&apos;s RMS.
              </p>
              <p>
                <strong className="text-foreground">Movable reverb.</strong> Nave used one static ConvolverNode. Here
                a small <strong className="text-foreground">Feedback-Delay-Network</strong> (4 delay lines, a 4×4
                orthonormal Hadamard feedback matrix, per-line damping lowpass — all Web Audio nodes, no impulse
                file) is head-coupled: an <em>openness</em> scalar from head position (leaning into the apse, plus
                lateral sweep) raises the feedback decay (0.60 → 0.88), the wet mix (0.10 → 0.60) and lowers the
                damping cutoff (6 kHz → 2.4 kHz). Lean in and the room audibly opens — longer, wetter, darker tail.
              </p>
              <p>
                <strong className="text-foreground">Graceful degrade.</strong> It sounds and animates with zero
                permissions: the synth hall plays immediately on Enter, already split across depth and running
                through the movable reverb. No camera → pointer parallax (drag down to lean into the apse); no input
                at all → a seeded deterministic head-drift through the same path. A failed recording fetch keeps the
                synth bed and shows a notice. All randomness is a seeded mulberry32 (seed <code>0x4088</code>); no
                Math.random / Date.now.
              </p>
              <p>
                <strong className="text-foreground">References:</strong> Robert Kooima, &ldquo;Generalized Perspective
                Projection&rdquo;; Johnny Lee, &ldquo;Head Tracking for Desktop VR Displays using the Wii
                Remote&rdquo; (2007); &ldquo;Real-time listener-movement-coupled room impulse response rendering with
                feedback delay networks,&rdquo; arXiv:2510.00238.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
