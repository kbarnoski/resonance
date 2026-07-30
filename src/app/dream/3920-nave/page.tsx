"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ────────────────────────────────────────────────────────────────────────────
   3920 · NAVE
   "What if Resonance were a room with real depth — you lean your head and look
   INTO a deep hall of Karel's piano voices, and the sound moves to where your
   head is?"

   Head-tracking motion-parallax room ("fish-tank VR"). The webcam tracks the
   viewer's head; the on-screen 3D nave is rendered with an OFF-AXIS (asymmetric-
   frustum) projection (Kooima's generalized perspective / Johnny Lee 2007), so
   moving your head reveals real parallax — the flat screen becomes a window into
   a deep hall. Spatial audio (Web Audio PannerNode + HRTF) follows the head, so
   leaning toward a distant voice brings it forward.
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

const SEED = 0x3920;

// Violet ramp (raw color allowed only inside the WebGL art).
const VIOLET = [0x8b5cf6, 0xa78bfa, 0xc4b5fd, 0xddd6fe];
const BACKDROP = 0x0b0713;

// The seven voices of the nave, placed at real 3D positions receding into -Z.
// freq: base pitch (a slow, open, cathedral-ish chord that harmonises as it wakes).
type VoiceSpec = { pos: [number, number, number]; freq: number; color: number };
const VOICES: VoiceSpec[] = [
  { pos: [0.0, 0.05, -3.4], freq: 130.81, color: VIOLET[0] }, // C3  — near, central
  { pos: [-0.95, 0.35, -6.2], freq: 196.0, color: VIOLET[1] }, // G3
  { pos: [0.9, -0.2, -8.4], freq: 261.63, color: VIOLET[2] }, // C4
  { pos: [-0.7, -0.35, -11.6], freq: 329.63, color: VIOLET[1] }, // E4
  { pos: [0.75, 0.4, -15.0], freq: 392.0, color: VIOLET[2] }, // G4
  { pos: [-0.55, 0.15, -19.2], freq: 523.25, color: VIOLET[3] }, // C5
  { pos: [0.35, -0.1, -24.5], freq: 659.25, color: VIOLET[3] }, // E5 — deepest
];

type HeadSource = "seed" | "camera" | "pointer";

type VoiceRuntime = {
  spec: VoiceSpec;
  panner: PannerNode;
  voiceGain: GainNode;
  oscs: OscillatorNode[];
  shimmer: OscillatorNode;
  shimmerGain: GainNode;
  lp: BiquadFilterNode;
  wake: number; // 0..1 — how "awake" this voice is (lean-to-wake commitment)
  // three.js art handles
  core: THREE.Mesh;
  halo: THREE.Mesh;
  light: THREE.PointLight;
  coreMat: THREE.MeshStandardMaterial;
  haloMat: THREE.MeshBasicMaterial;
};

export default function NavePage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [started, setStarted] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [source, setSource] = useState<HeadSource>("seed");
  const [notice, setNotice] = useState<string | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [readout, setReadout] = useState({ x: 0, y: 0, z: 2.4, woke: 0 });

  // Mutable engine state shared between the effect and the Start handler.
  const engine = useRef<{
    audioStartRequested: boolean;
    started: boolean;
    startCameraFn: (() => Promise<void>) | null;
    startAudioFn: (() => void) | null;
  }>({
    audioStartRequested: false,
    started: false,
    startCameraFn: null,
    startAudioFn: null,
  });

  // ── Three.js scene + off-axis projection + head loop (runs from mount) ──────
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

    // ── Build the nave: a receding colonnade + luminous voice nodes ───────────
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

    // Luminous voice nodes (shared geometry, per-voice materials/lights).
    const coreGeo = track(new THREE.SphereGeometry(0.16, 24, 24));
    const haloGeo = track(new THREE.SphereGeometry(0.34, 24, 24));

    const voices: VoiceRuntime[] = VOICES.map((spec) => {
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
      const light = new THREE.PointLight(spec.color, 0.0, 6, 2);
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
        wake: 0,
        // audio handles filled in when audio starts:
        panner: null as unknown as PannerNode,
        voiceGain: null as unknown as GainNode,
        oscs: [],
        shimmer: null as unknown as OscillatorNode,
        shimmerGain: null as unknown as GainNode,
        lp: null as unknown as BiquadFilterNode,
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
    // Raw targets from whichever source is active; smoothed into `head`.
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
      rawTarget.z = 2.4;
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
          "Camera or head-tracking unavailable — move your pointer to lean the room, or just watch the self-demo. Full audio still plays.",
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
        // Face center from bounding region (mirror x so leaning left leans the room left).
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
        // Inter-eye pixel distance → depth (bigger = closer). 33/263 are outer eye corners.
        const a = lms[33];
        const b = lms[263];
        const eyeDist = a && b ? Math.hypot((1 - a.x) - (1 - b.x), a.y - b.y) : 0.09;
        // Map: near ~0.14, far ~0.06 → z in [1.4, 3.2].
        const zNorm = Math.max(0, Math.min(1, (eyeDist - 0.06) / (0.14 - 0.06)));
        rawTarget.x = (cx - 0.5) * 2.8;
        rawTarget.y = -(cy - 0.5) * 1.7;
        rawTarget.z = 3.2 - zNorm * 1.8;
        lastCameraTs = nowMs;
      } catch {
        /* transient detect error — ignore this frame */
      }
    }

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

      // ── Lean-to-wake stakes ────────────────────────────────────────────────
      // A voice wakes when you line your head up with it (its lateral offset from
      // your gaze line shrinks) AND you hold there. Looking away lets it fade.
      let awakeCount = 0;
      const audioNow = audioCtxRef.current ? audioCtxRef.current.currentTime : 0;
      for (const v of voices) {
        const [nx, ny, nz] = v.spec.pos;
        // Gaze line = eye going straight along -Z. At the node's depth it sits at
        // (head.x, head.y, nz); lateral distance measures alignment.
        const lateral = Math.hypot(nx - head.x, ny - head.y);
        const depthGap = Math.abs(head.z - 2.3); // leaning in slightly rewards commitment
        const R = 0.9;
        const prox = Math.max(0, Math.min(1, 1 - lateral / R)) * (1 - depthGap * 0.12);
        // Asymmetric integrator: rises while aligned (hold to commit), decays when not.
        const rise = 0.9;
        const fall = 0.55;
        const target = prox;
        const rate = target > v.wake ? rise : fall;
        v.wake += (target - v.wake) * (1 - Math.exp(-dt * rate * 3));
        if (v.wake > 0.55) awakeCount++;

        // Visual response.
        const glow = 0.35 + v.wake * 2.6;
        v.coreMat.emissiveIntensity = glow;
        const pulse = 1 + 0.08 * Math.sin(tSec * 2.2 + nz);
        v.core.scale.setScalar(0.7 + v.wake * 0.9 * pulse);
        v.haloMat.opacity = 0.04 + v.wake * 0.26;
        v.halo.scale.setScalar(0.8 + v.wake * 1.6 * pulse);
        v.light.intensity = v.wake * 2.4;

        // Audio response (only once audio graph exists).
        if (v.voiceGain && audioCtxRef.current) {
          const floor = 0.04; // veiled but never silent
          const g = floor + v.wake * 0.9;
          v.voiceGain.gain.setTargetAtTime(g, audioNow, 0.12);
          // richer/brighter as it wakes
          v.lp.frequency.setTargetAtTime(700 + v.wake * 2600, audioNow, 0.15);
        }
      }

      // Move the audio listener to the head each frame (mix follows the head).
      const ctx = audioCtxRef.current;
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
          // Deprecated fallback for older Web Audio implementations.
          L.setPosition(head.x, head.y, head.z);
          L.setOrientation(0, 0, -1, 0, 1, 0);
        }
      }

      renderer.render(scene, camera);

      readoutAccum += dt;
      if (readoutAccum > 0.1) {
        readoutAccum = 0;
        setReadout({ x: head.x, y: head.y, z: head.z, woke: awakeCount });
      }
    }
    raf = requestAnimationFrame(frame);

    // ── Audio graph (built on user gesture only) ──────────────────────────────
    const audioCtxRef = { current: null as AudioContext | null };
    const masterRef = { current: null as GainNode | null };

    function makeImpulse(ctx: AudioContext, seconds: number, decay: number) {
      const rate = ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const buf = ctx.createBuffer(2, len, rate);
      const irRng = makeMulberry32(SEED ^ 0x51ed);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          data[i] = (irRng() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return buf;
    }

    function startAudio() {
      if (audioCtxRef.current) return;
      const Ctor: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      audioCtxRef.current = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.0;
      master.gain.setTargetAtTime(0.55, ctx.currentTime, 1.2);
      masterRef.current = master;

      // Cathedral tail: parallel convolver reverb send.
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx, 3.4, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.4;
      master.connect(ctx.destination);
      master.connect(convolver);
      convolver.connect(wet);
      wet.connect(ctx.destination);

      for (const v of voices) {
        const panner = ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 3;
        panner.rolloffFactor = 0.6;
        panner.maxDistance = 45;
        const [px, py, pz] = v.spec.pos;
        if (panner.positionX) {
          panner.positionX.value = px;
          panner.positionY.value = py;
          panner.positionZ.value = pz;
        } else {
          panner.setPosition(px, py, pz);
        }

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = 0.04;

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 700;
        lp.Q.value = 0.6;

        // Warm bowed/piano-ish additive tone.
        const partials = [1, 2, 3, 4.01, 5.0];
        const amps = [1, 0.5, 0.28, 0.14, 0.08];
        const oscs: OscillatorNode[] = [];
        partials.forEach((mult, i) => {
          const o = ctx.createOscillator();
          o.type = i === 0 ? "triangle" : "sine";
          o.frequency.value = v.spec.freq * mult;
          o.detune.value = i * 2.5;
          const g = ctx.createGain();
          g.gain.value = amps[i] * 0.16;
          o.connect(g);
          g.connect(lp);
          o.start();
          oscs.push(o);
        });

        // Slow shimmer LFO on the filter for a living, breathing pad.
        const shimmer = ctx.createOscillator();
        shimmer.type = "sine";
        shimmer.frequency.value = 0.12 + (v.spec.freq % 7) * 0.01;
        const shimmerGain = ctx.createGain();
        shimmerGain.gain.value = 180;
        shimmer.connect(shimmerGain);
        shimmerGain.connect(lp.frequency);
        shimmer.start();

        lp.connect(voiceGain);
        voiceGain.connect(panner);
        panner.connect(master);

        v.panner = panner;
        v.voiceGain = voiceGain;
        v.oscs = oscs;
        v.shimmer = shimmer;
        v.shimmerGain = shimmerGain;
        v.lp = lp;
      }
    }
    engine.current.startAudioFn = startAudio;

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
        for (const v of voices) {
          try {
            v.oscs.forEach((o) => o.stop());
            v.shimmer.stop();
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
            WebGL isn&apos;t available in this browser, so the nave can&apos;t be rendered. Try a hardware-accelerated
            desktop browser.
          </p>
        </div>
      )}

      {/* Hero + controls overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        <header className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight">Nave</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Lean your head and look <em>into</em> a deep hall of piano voices — the room opens with real parallax and
            the sound moves to where your head is.
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
                Enter the nave
              </button>
            ) : (
              <p className="max-w-md text-base text-muted-foreground">
                Line your head up with a distant light and <em>hold</em> — the veiled voice wakes and joins the chord.
                Look away and it fades back.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>{sourceLabel}</span>
              <span>
                x {readout.x.toFixed(2)} · y {readout.y.toFixed(2)} · z {readout.z.toFixed(2)}
              </span>
              <span>{readout.woke} awake</span>
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
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">3920 · nave</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The one question:</strong> what if Resonance were a room with real
                depth — you lean your head and look into a deep hall of piano voices, and the sound moves to where your
                head is?
              </p>
              <p>
                The webcam tracks your head&apos;s position (left/right, up/down, and closer/farther from inter-eye
                distance). Instead of orbiting a normal camera, the room is drawn with an{" "}
                <strong className="text-foreground">off-axis, asymmetric-frustum projection</strong> (Kooima&apos;s
                generalized perspective): the monitor becomes a fixed window and the frustum is skewed to your eye, so
                moving your head reveals genuine motion parallax — the flat screen turns into a window into a deep nave.
              </p>
              <p>
                Each luminous node is one voice at a real 3D coordinate, driven by a Web Audio{" "}
                <strong className="text-foreground">PannerNode</strong> (HRTF) at the same position. The audio listener
                is glued to your head every frame, so the mix follows you.
              </p>
              <p>
                <strong className="text-foreground">Stakes:</strong> voices start veiled and dim. When you line your head
                up with a distant light and <em>hold</em>, that voice wakes and joins the chord; look away and it fades.
                You compose the hall by where you lean and dwell — a decision you make with your body, not a fail-buzzer.
              </p>
              <p>
                With no camera or permission, it falls back to pointer-driven parallax; with no input at all it drives a
                seeded synthetic head on a Lissajous orbit through the exact same projection and audio path, so it always
                animates and sounds.
              </p>
              <p>
                <strong className="text-foreground">References:</strong> Johnny Lee, &ldquo;Head Tracking for Desktop VR
                Displays using the Wii Remote&rdquo; (2007); &ldquo;Parallax Engine: Head Controlled Motion Parallax
                Using Notebooks&apos; RGB Camera&rdquo; (SVR 2021); SIGGRAPH 2026 &ldquo;Resonance: Meditative Neural
                Rhythms as Collective Spatial Experience.&rdquo;
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
