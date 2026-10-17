"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 21920-pitchlattice — Pitch / Time Lattice
//
// ONE question: what if you could transpose Karel's piano's PITCH independently
// of its TIME — slow his recording to a glacial drone without dropping the
// register, or stretch it without any chipmunk effect — and fly through a stark
// 3-D datamatics lattice that lets you SEE the two axes come apart?
//
// THE ENGINE (time-domain overlap-add delay-line pitch shifter). One real
// recording loops in a BufferSourceNode. Two axes are decoupled:
//   · TIME   — source.playbackRate = timeFactor ∈ [0.25, 2.0] (cursor Y). This
//              is varispeed: 0.25× is 4× slower, 2× is twice as fast. Varispeed
//              drags pitch up/down with it as an unwanted side effect.
//   · PITCH  — a two-tap overlapping delay line then applies a compensating
//              ratio ρ = desiredPitchRatio / timeFactor. Varispeed multiplies
//              pitch by timeFactor; the shifter multiplies it by ρ; the product
//              is desiredPitchRatio (cursor X, ±12 semitones) regardless of the
//              time axis. ρ ≈ 1 means the shifter is transparent and pitch is
//              simply coupled to the varispeed.
//
// The shifter is the classic time-domain pitch shifter: two DelayNodes whose
// delayTime is swept with a linear SAWTOOTH (a ramping delay reads the buffer
// at a shifted rate → a pitch change), each gated by a raised-cosine (Hann)
// crossfade envelope. The two taps are offset by half a period so one tap is at
// full while the other wraps its sawtooth — the Hann pair sums to constant
// amplitude, so there is no click at the sawtooth discontinuity. Everything is
// SCHEDULED automation (setValueAtTime + linearRampToValueAtTime for the delay
// sawtooth, setValueCurveAtTime for the Hann envelopes), topped up on a small
// lookahead scheduler. There is no synth node and no LFO node of any kind —
// every modulation is scheduled parameter automation.
//
// THE VISUAL (datamatics, volumetric). A THREE.InstancedMesh lattice you fly
// THROUGH: X = pitch (semitone columns −12…+12), Z = time/depth (the scroll),
// Y = register/amplitude seeded from his note roll. The lattice slides along X
// as you transpose and scrolls along Z at the time rate — slow when timeFactor
// is low, fast when high — so pitch and time literally move on different axes.
// Black ground, white cells, red for the active pitch column and ringing cells,
// hard quantized brightness, NormalBlending, depthWrite (real occlusion),
// FogExp2 haze, size-attenuating perspective. No bloom, no glow, no overlay.
//
// References (honest): the time-domain overlap-add delay-line pitch shifter —
// two cross-faded, sawtooth-swept delay taps — as described in Zölzer (ed.),
// "DAFX: Digital Audio Effects," and Dodge & Jerse, "Computer Music"; and the
// Ikeda "datamatics" data-raster aesthetic as the 3-D visual register. The
// pitch/time decoupling is the same principle a phase vocoder reaches by other
// means; here it is done entirely in the time domain with Web Audio nodes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { REAL_TRACKS, WELCOME_HOME_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── lattice dimensions ───────────────────────────────────────────────────────
const NX = 25; // pitch columns, semitone offsets −12 … +12
const NZ = 56; // time rows (depth)
const COL_SP = 2.3; // X spacing between pitch columns
const Z_SP = 8.0; // Z spacing between time rows
const DEPTH = NZ * Z_SP; // full scroll period
const CELL = 0.9; // cube edge
const LIFT = 7.5; // max Y lift from seeded intensity
const CAM_Z = 26; // camera sits here, looking down −Z
const FOG_DENSITY = 0.0052;
const BG = new THREE.Color(0x08090c); // lifted near-black (atmosphere, not glow)
const SCROLL = 34; // Z units/sec at timeFactor = 1

// ── audio constants ────────────────────────────────────────────────────────────
const WINDOW_SEC = 0.07; // one sawtooth period of each delay tap (overlap window)
const BASE_DELAY = 0.03; // delay offset so the swept delayTime never goes negative
const MAX_DELAY = 1.0; // DelayNode ceiling (span stays well under this)
const LOOKAHEAD = 0.4; // schedule delay/envelope automation this far ahead (s)
const TICK_MS = 28; // scheduler cadence
const RATIO_SMOOTH = 0.26; // per-tick smoothing of the shifter ratio (glissando)
const TIME_MIN = 0.25; // slowest varispeed (4× slower)
const TIME_MAX = 2.0; // fastest varispeed
const SEMI_RANGE = 12; // ± semitones across cursor X

// Raised-cosine (Hann) crossfade curve: 0 at the sawtooth wrap, 1 at window
// center. Two taps offset by half a window sum to constant amplitude → no click.
const HANN_N = 128;
const HANN = new Float32Array(HANN_N);
for (let i = 0; i < HANN_N; i++) {
  HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (HANN_N - 1));
}

const DESCRIPTION =
  "Karel's recording loops while its pitch and its time are pulled onto two separate axes: varispeed sets the time rate, and a time-domain overlap-add delay-line pitch shifter cancels the varispeed's pitch change and imposes a pitch of its own. Fly through a 3-D datamatics lattice where the pitch axis slides sideways as you transpose and the time axis scrolls at the playback rate — so you can see the two come apart.";
const HOW_TO = [
  "Press Play to loop one of Karel's piano takes",
  "Move the mouse left and right to transpose the PITCH up or down ±12 semitones — the lattice slides sideways and the red column tracks your pitch",
  "Move up and down to set the TIME rate — top is twice as fast, bottom is four times slower — and the lattice scrolls at that speed while the pitch stays put",
  "The proof: slide left/right with no up/down change and the register moves but the tempo does not; slide up/down alone and the tempo moves but the register does not",
  "Arrow keys nudge both axes; space toggles play. Optional: enable the camera and one hand drives the same cursor, an open hand widens the active pitch band",
];

// ── small helpers (not hooks) ──────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface Engine {
  actx: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  src: AudioBufferSourceNode;
  delayA: DelayNode;
  delayB: DelayNode;
  gainA: GainNode;
  gainB: GainNode;
  shiftSum: GainNode;
  outGain: GainNode;
  aNext: number; // ctx time of the next sawtooth period to schedule for tap A
  bNext: number; // …tap B (held half a window behind A)
  curRatio: number; // smoothed shifter ratio actually written to the delays
  schedId: number; // setInterval handle for the lookahead scheduler
  freq: Uint8Array<ArrayBuffer>;
  mesh: THREE.InstancedMesh;
  geom: THREE.BoxGeometry;
  mat: THREE.MeshBasicMaterial;
  base: Float32Array; // seeded per-cell intensity (NX*NZ), 0..1
  mode: "notes" | "grid";
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // three.js refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);
  const rafRef = useRef<number>(0);

  // audio engine
  const engineRef = useRef<Engine | null>(null);

  // control inputs (refs so the render loop never restarts)
  const pxRef = useRef(0.5); // cursor X → pitch
  const pyRef = useRef(0.35); // cursor Y → time rate
  const pointerActiveRef = useRef(false);
  const camWantRef = useRef(false);
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // smoothed per-frame state
  const stateRef = useRef({
    pitchSemi: 0,
    timeFactor: 1,
    desiredRatio: 1, // 2^(pitchSemi/12)
    band: 0.6, // active-column half-width (openness widens it)
    travel: 0, // accumulated Z scroll
    colEnergy: new Float32Array(NX),
    last: 0,
    breath: 0,
  });

  const camStateRef = useRef<"off" | "requesting" | "live" | "denied" | "failed">("off");
  const handSeenRef = useRef(false);
  const phaseRef = useRef<"idle" | "loading" | "running" | "error">("idle");

  // react UI state
  const [webglOk, setWebglOk] = useState(true);
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [camState, setCamState] = useState<"off" | "requesting" | "live" | "denied" | "failed">(
    "off",
  );
  const [handSeen, setHandSeen] = useState(false);
  const [readout, setReadout] = useState({
    mode: "grid" as "notes" | "grid",
    semi: 0,
    time: 1,
    coupled: true,
    driver: "idle" as "pointer" | "tracking" | "idle",
  });
  const readoutRef = useRef(readout);

  const { immersive, toggle } = useImmersive();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    camStateRef.current = camState;
  }, [camState]);

  // ── the render loop — alive from mount (empty lattice) through running ────────
  const loop = useCallback((nowMs: number) => {
    rafRef.current = requestAnimationFrame(loop);
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    const st = stateRef.current;
    const dt = st.last ? Math.min(0.05, (nowMs - st.last) / 1000) : 1 / 60;
    st.last = nowMs;
    st.breath += dt;
    const t = nowMs / 1000;

    // ── resolve the ONE cursor from camera → pointer → idle ──
    let driver: "pointer" | "tracking" | "idle" = "idle";
    let bandTarget = 0.6;
    let handThisFrame = false;

    const video = videoRef.current;
    if (camWantRef.current && trackerRef.current && video && video.readyState >= 2) {
      let res: { landmarks: { x: number; y: number; z: number }[][] } | null = null;
      try {
        res = trackerRef.current.detectForVideo(video, nowMs);
      } catch {
        res = null;
      }
      if (res && res.landmarks && res.landmarks[0]) {
        const f = computeHandFeatures(res.landmarks[0]);
        handThisFrame = true;
        driver = "tracking";
        // hand center → the SAME cursor the pointer writes (x already mirrored)
        pxRef.current = clamp01((f.cx / 1.2 + 1) / 2);
        pyRef.current = clamp01(1 - (f.cy / 1.2 + 1) / 2);
        bandTarget = 0.4 + f.open * 3.0; // openness widens the active pitch band
      }
    }
    if (!handThisFrame) {
      if (camStateRef.current === "live") {
        driver = "tracking"; // camera on, hand lost — hold the last cursor
      } else if (pointerActiveRef.current) {
        driver = "pointer";
      } else {
        driver = "idle";
        // idle drift so the lattice is never dead-still before anyone touches it
        pxRef.current = 0.5 + 0.4 * Math.sin(st.breath * 0.13);
        pyRef.current = 0.45 + 0.28 * Math.sin(st.breath * 0.19 + 0.7);
      }
    }
    if (handThisFrame !== handSeenRef.current) {
      handSeenRef.current = handThisFrame;
      setHandSeen(handThisFrame);
    }

    // ── cursor → the two decoupled axes ──
    const px = clamp01(pxRef.current);
    const py = clamp01(pyRef.current);
    const pitchTarget = (px * 2 - 1) * SEMI_RANGE; // −12 … +12 semitones (PITCH)
    // time rate is logarithmic between 0.25× and 2× — top of screen is fast
    const timeTarget = TIME_MIN * Math.pow(TIME_MAX / TIME_MIN, 1 - py);
    st.pitchSemi += (pitchTarget - st.pitchSemi) * 0.12;
    st.timeFactor += (timeTarget - st.timeFactor) * 0.12;
    st.band += (bandTarget - st.band) * 0.1;
    st.desiredRatio = Math.pow(2, st.pitchSemi / 12);

    // ── the time axis scrolls the lattice; pitch axis slides it sideways ──
    st.travel += st.timeFactor * SCROLL * dt;
    if (st.travel > 1e7) st.travel -= 1e7; // keep the accumulator bounded

    const eng = engineRef.current;
    const mesh =
      eng?.mesh ??
      ((scene.userData as { lattice?: THREE.InstancedMesh }).lattice ?? null);
    if (mesh) {
      mesh.position.x = -st.pitchSemi * COL_SP; // slide so the active column centers
    }

    // ── audio: varispeed sets TIME; the delay-line shifter will decouple PITCH ──
    if (eng) {
      const nowCtx = eng.actx.currentTime;
      eng.src.playbackRate.setTargetAtTime(st.timeFactor, nowCtx, 0.1);

      // per-column audio energy (datamatics cells ring with the mix)
      eng.master.analyser.getByteFrequencyData(eng.freq);
      const ce = st.colEnergy;
      let total = 0;
      for (let c = 0; c < NX; c++) {
        const bin = Math.floor(2 + Math.pow(c / (NX - 1), 1.6) * 118);
        const v = eng.freq[bin] / 255;
        ce[c] += (v - ce[c]) * 0.25;
        total += v;
      }
      const energy = clamp01(total / NX);

      // ── repaint the datamatics cells: white raster, red active-pitch band ──
      const activeCol = clamp(Math.round(st.pitchSemi) + 12, 0, NX - 1);
      const halfBand = st.band;
      const col = new THREE.Color();
      const base = eng.base;
      for (let ix = 0; ix < NX; ix++) {
        const isActive = Math.abs(ix - activeCol) <= halfBand;
        const e = 0.3 + 0.7 * ce[ix];
        for (let iz = 0; iz < NZ; iz++) {
          const bi = ix * NZ + iz;
          const b = base[bi];
          // quantized brightness steps — hard datamatics levels, not a smooth ramp
          let lum = clamp01((0.12 + b * 0.88) * e);
          lum = Math.round(lum * 4) / 4;
          if (isActive) {
            // red for the active pitch column / the cells currently ringing
            const r = clamp01(0.4 + lum * 0.85);
            col.setRGB(r, lum * 0.1, lum * 0.12);
          } else {
            col.setRGB(lum, lum, lum);
          }
          eng.mesh.setColorAt(bi, col);
        }
      }
      if (eng.mesh.instanceColor) eng.mesh.instanceColor.needsUpdate = true;

      // readout (on change only — keep React quiet)
      const prev = readoutRef.current;
      const semiR = Math.round(st.pitchSemi * 10) / 10;
      const timeR = Math.round(st.timeFactor * 100) / 100;
      // ρ ≈ 1 ⇒ shifter is transparent ⇒ pitch is coupled to the varispeed
      const ratio = st.desiredRatio / st.timeFactor;
      const coupled = Math.abs(Math.log2(ratio)) < 0.03;
      if (
        prev.semi !== semiR ||
        prev.time !== timeR ||
        prev.coupled !== coupled ||
        prev.driver !== driver ||
        prev.mode !== eng.mode
      ) {
        const next = { mode: eng.mode, semi: semiR, time: timeR, coupled, driver };
        readoutRef.current = next;
        setReadout(next);
      }

      // energy gives the marker plane a faint ring without any bloom
      const marker = markerRef.current;
      if (marker) {
        const m = marker.material as THREE.MeshBasicMaterial;
        m.opacity = 0.18 + energy * 0.22;
      }
    }

    // ── fly THROUGH: recycle each row's Z so it wraps out of sight past camera ──
    if (mesh) {
      const dummy = new THREE.Object3D();
      for (let ix = 0; ix < NX; ix++) {
        const lx = (ix - 12) * COL_SP;
        for (let iz = 0; iz < NZ; iz++) {
          const bi = ix * NZ + iz;
          let z = -iz * Z_SP + st.travel;
          // keep every cell in [CAM_Z − DEPTH, CAM_Z): the wrap happens just
          // behind the camera where it cannot be seen (seamless fly-through)
          z = (((z - CAM_Z) % DEPTH) + DEPTH) % DEPTH;
          z = z + CAM_Z - DEPTH;
          const h = eng ? eng.base[bi] * LIFT : 0.4 * LIFT * (((ix * 7 + iz * 3) % 5) / 5);
          dummy.position.set(lx, h - LIFT * 0.4, z);
          const s = CELL * (eng ? 0.5 + eng.base[bi] * 0.9 : 0.8);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          mesh.setMatrixAt(bi, dummy.matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // ── camera: gentle parallax with the pitch cursor, looking down the Z axis ──
    camera.position.set(
      st.pitchSemi * 0.25 + Math.sin(t * 0.17) * 1.5,
      3.5 + Math.cos(t * 0.13) * 1.2,
      CAM_Z,
    );
    camera.lookAt(st.pitchSemi * 0.12, -2, -DEPTH * 0.45);

    renderer.render(scene, camera);
  }, []);

  // ── init three.js on mount: the empty lattice renders before any audio ───────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      if (!renderer.getContext()) throw new Error("no gl");
    } catch {
      setWebglOk(false);
      return;
    }
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    renderer.setClearColor(BG, 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG.getHex(), FOG_DENSITY);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(62, w / h, 0.5, DEPTH + 220);
    camera.position.set(0, 3.5, CAM_Z);
    cameraRef.current = camera;

    // the lattice: one hard cube per (pitch, time) cell — a flat datamatics grid
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.96,
      depthWrite: true, // real occlusion as you fly through the lattice
      depthTest: true,
      blending: THREE.NormalBlending, // NOT additive — no glow
      fog: true,
    });
    const mesh = new THREE.InstancedMesh(geom, mat, NX * NZ);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    // seed matrices + a neutral color so the empty lattice is already visible
    const dummy = new THREE.Object3D();
    const c0 = new THREE.Color(0.25, 0.25, 0.25);
    for (let ix = 0; ix < NX; ix++) {
      for (let iz = 0; iz < NZ; iz++) {
        const bi = ix * NZ + iz;
        dummy.position.set((ix - 12) * COL_SP, -LIFT * 0.4, -iz * Z_SP);
        dummy.scale.setScalar(CELL * 0.6);
        dummy.updateMatrix();
        mesh.setMatrixAt(bi, dummy.matrix);
        mesh.setColorAt(bi, c0);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    // stash on refs via a transient engine-less holder: keep in scene, grab later
    (scene.userData as { lattice?: THREE.InstancedMesh }).lattice = mesh;

    // bone-white marker plane at screen center marks the active pitch column
    const markerGeom = new THREE.RingGeometry(COL_SP * 0.6, COL_SP * 0.72, 4);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xd12b2b,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true,
    });
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.position.set(0, -LIFT * 0.4 + 3, CAM_Z - 34);
    marker.rotation.z = Math.PI / 4;
    markerRef.current = marker;
    scene.add(marker);

    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => {
      const r = rendererRef.current;
      const cam = cameraRef.current;
      if (!r || !cam) return;
      const ww = mount.clientWidth || window.innerWidth;
      const hh = mount.clientHeight || window.innerHeight;
      r.setSize(ww, hh, false);
      cam.aspect = ww / hh;
      cam.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
      geom.dispose();
      mat.dispose();
      markerGeom.dispose();
      markerMat.dispose();
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* noop */
      }
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [loop]);

  // ── seed per-cell intensities from HIS note roll (or an even grid fallback) ──
  const buildLattice = useCallback(
    (
      buffer: AudioBuffer,
      notes: { midi: number; time: number; duration: number; velocity: number }[],
    ): { base: Float32Array; mode: "notes" | "grid" } => {
      const base = new Float32Array(NX * NZ);
      const dur = Math.max(0.1, buffer.duration);
      const usable = notes.filter((n) => n.time < dur - 0.02 && n.midi > 0);
      if (usable.length >= 20) {
        let peak = 1e-4;
        for (const n of usable) {
          // midi → X bin: fold the note into ±12 semitones around middle C
          let semi = Math.round(n.midi) - 60;
          while (semi > 12) semi -= 12;
          while (semi < -12) semi += 12;
          const ix = clamp(semi + 12, 0, NX - 1);
          // time → Z row
          const iz = clamp(Math.floor((n.time / dur) * NZ), 0, NZ - 1);
          const bi = ix * NZ + iz;
          base[bi] += (n.velocity || 70) / 127;
          if (base[bi] > peak) peak = base[bi];
        }
        for (let i = 0; i < base.length; i++) base[i] = clamp01(base[i] / peak);
        return { base, mode: "notes" };
      }
      // fallback: an even, legible raster still keyed to his buffer length
      for (let ix = 0; ix < NX; ix++) {
        for (let iz = 0; iz < NZ; iz++) {
          const bi = ix * NZ + iz;
          const wave = 0.5 + 0.5 * Math.sin(ix * 0.6 + iz * 0.5);
          base[bi] = 0.25 + 0.55 * wave * (((ix + iz) % 3 === 0) ? 1 : 0.5);
        }
      }
      return { base, mode: "grid" };
    },
    [],
  );

  // ── the lookahead scheduler: keep the sawtooth + crossfade automation topped up
  const scheduleShifter = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const st = stateRef.current;
    const now = eng.actx.currentTime;

    // smooth the shifter ratio: ρ = desiredPitchRatio / timeFactor. Varispeed
    // already multiplied pitch by timeFactor, so dividing it back out leaves the
    // output pitch at desiredPitchRatio, independent of the time axis.
    const target = clamp(st.desiredRatio / st.timeFactor, 0.25, 8);
    eng.curRatio += (target - eng.curRatio) * RATIO_SMOOTH;

    // if we have fallen behind (tab was backgrounded), resync both taps together
    if (eng.aNext < now + 0.01) {
      eng.aNext = now + 0.03;
      eng.bNext = eng.aNext + WINDOW_SEC / 2;
    }

    const upto = now + LOOKAHEAD;
    const writeTap = (isA: boolean) => {
      const delay = isA ? eng.delayA : eng.delayB;
      const gain = isA ? eng.gainA : eng.gainB;
      let next = isA ? eng.aNext : eng.bNext;
      while (next < upto) {
        const ratio = eng.curRatio;
        const span = Math.abs(1 - ratio) * WINDOW_SEC;
        // a linearly ramping delay reads the buffer at a shifted rate:
        //   ρ > 1 → delay must shrink (read faster → pitch up)
        //   ρ < 1 → delay must grow  (read slower → pitch down)
        let sd: number;
        let ed: number;
        if (ratio >= 1) {
          sd = BASE_DELAY + span;
          ed = BASE_DELAY;
        } else {
          sd = BASE_DELAY;
          ed = BASE_DELAY + span;
        }
        delay.delayTime.setValueAtTime(sd, next);
        delay.delayTime.linearRampToValueAtTime(ed, next + WINDOW_SEC);
        // raised-cosine crossfade: 0 at the sawtooth wrap → no click
        gain.gain.setValueCurveAtTime(HANN, next, WINDOW_SEC);
        next += WINDOW_SEC;
      }
      if (isA) eng.aNext = next;
      else eng.bNext = next;
    };
    writeTap(true);
    writeTap(false);
  }, []);

  // ── Play: audio first (must always work), then wire the lattice ──────────────
  const start = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "running") return;
    if (!webglOk) return;
    setErrMsg("");
    setPhase("loading");

    let actx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      actx = new AC();
      await actx.resume();
    } catch {
      setErrMsg("Web Audio is unavailable in this browser — the lattice cannot sound here.");
      setPhase("error");
      return;
    }

    let loaded;
    try {
      loaded = await loadRealTrackBuffer(actx, trackId);
    } catch {
      setErrMsg("Karel's recording could not load — check the connection and press Play again.");
      void actx.close();
      setPhase("error");
      return;
    }
    setTrackTitle(loaded.title);

    let notes: { midi: number; time: number; duration: number; velocity: number }[] = [];
    try {
      const analysis = await loadTrackAnalysis(trackId);
      if (analysis && analysis.notes) notes = analysis.notes;
    } catch {
      notes = [];
    }

    const seeded = buildLattice(loaded.buffer, notes);
    const master = createSafeMaster(actx);

    // ── audio graph (no synth node, no LFO node — scheduled automation only) ──
    //   src(loop, varispeed) ─┬─ delayA ─ gainA ─┐
    //                         └─ delayB ─ gainB ─┴─ shiftSum ─ outGain ─ master.input
    const src = actx.createBufferSource();
    src.buffer = loaded.buffer;
    src.loop = true;
    src.playbackRate.value = clamp(stateRef.current.timeFactor, TIME_MIN, TIME_MAX);

    const delayA = actx.createDelay(MAX_DELAY);
    const delayB = actx.createDelay(MAX_DELAY);
    delayA.delayTime.value = BASE_DELAY;
    delayB.delayTime.value = BASE_DELAY;

    const gainA = actx.createGain();
    const gainB = actx.createGain();
    gainA.gain.value = 0;
    gainB.gain.value = 0;

    const shiftSum = actx.createGain();
    shiftSum.gain.value = 1;

    const outGain = actx.createGain();
    outGain.gain.value = 0.92;

    src.connect(delayA);
    src.connect(delayB);
    delayA.connect(gainA);
    delayB.connect(gainB);
    gainA.connect(shiftSum);
    gainB.connect(shiftSum);
    shiftSum.connect(outGain);
    outGain.connect(master.input);

    try {
      src.start();
    } catch {
      setErrMsg("The recording could not start playing.");
      master.disconnect();
      void actx.close();
      setPhase("error");
      return;
    }

    // ── wire the seeded intensities into the live lattice mesh ──
    const scene = sceneRef.current;
    const mesh = scene
      ? (scene.userData as { lattice?: THREE.InstancedMesh }).lattice ?? null
      : null;

    const now = actx.currentTime;
    const eng: Engine = {
      actx,
      master,
      buffer: loaded.buffer,
      src,
      delayA,
      delayB,
      gainA,
      gainB,
      shiftSum,
      outGain,
      aNext: now + 0.05,
      bNext: now + 0.05 + WINDOW_SEC / 2,
      curRatio: clamp(stateRef.current.desiredRatio / stateRef.current.timeFactor, 0.25, 8),
      schedId: 0,
      freq: new Uint8Array(master.analyser.frequencyBinCount),
      mesh: mesh as THREE.InstancedMesh,
      geom: (mesh ? mesh.geometry : new THREE.BoxGeometry(1, 1, 1)) as THREE.BoxGeometry,
      mat: (mesh ? mesh.material : new THREE.MeshBasicMaterial()) as THREE.MeshBasicMaterial,
      base: seeded.base,
      mode: seeded.mode,
    };
    engineRef.current = eng;

    // start the lookahead scheduler for the sawtooth + crossfade automation
    scheduleShifter(); // prime immediately so sound begins without a gap
    eng.schedId = window.setInterval(scheduleShifter, TICK_MS);

    setPhase("running");
  }, [trackId, webglOk, buildLattice, scheduleShifter]);

  // ── camera opt-in (secondary override) ───────────────────────────────────────
  const enableCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("failed");
      return;
    }
    setCamState("requesting");
    setErrMsg("");
    try {
      const tracker = await createHandTracker(1);
      trackerRef.current = tracker;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      const stream = await startCamera(video);
      streamRef.current = stream;
      camWantRef.current = true;
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      const msg = e instanceof Error ? e.message : "";
      setCamState(/denied|Permission|NotAllowed/i.test(msg) ? "denied" : "failed");
    }
  }, []);

  // ── pointer control (primary path — identical cursor as the camera) ──────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pxRef.current = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    pyRef.current = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    pointerActiveRef.current = true;
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerActiveRef.current = false;
  }, []);

  // keyboard conducting (a11y) — same cursor as the pointer; space = play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA"))
        return;
      let handled = false;
      if (e.key === "ArrowLeft") {
        pxRef.current = clamp01(pxRef.current - 0.02);
        handled = true;
      } else if (e.key === "ArrowRight") {
        pxRef.current = clamp01(pxRef.current + 0.02);
        handled = true;
      } else if (e.key === "ArrowUp") {
        pyRef.current = clamp01(pyRef.current - 0.025);
        handled = true;
      } else if (e.key === "ArrowDown") {
        pyRef.current = clamp01(pyRef.current + 0.025);
        handled = true;
      } else if (e.key === " " || e.key === "Spacebar") {
        const eng = engineRef.current;
        if (eng) {
          if (eng.actx.state === "running") void eng.actx.suspend();
          else void eng.actx.resume();
        } else if (phaseRef.current === "idle" || phaseRef.current === "error") {
          void start();
        }
        handled = true;
      }
      if (handled) {
        if (camStateRef.current !== "live") pointerActiveRef.current = true;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start]);

  // ── audio / camera teardown ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng) {
        if (eng.schedId) window.clearInterval(eng.schedId);
        try {
          eng.src.stop();
        } catch {
          /* already stopped */
        }
        try {
          eng.src.disconnect();
          eng.delayA.disconnect();
          eng.delayB.disconnect();
          eng.gainA.disconnect();
          eng.gainB.disconnect();
          eng.shiftSum.disconnect();
          eng.outGain.disconnect();
        } catch {
          /* noop */
        }
        eng.master.disconnect();
        if (eng.actx.state !== "closed") void eng.actx.close();
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  // ── derived UI ──────────────────────────────────────────────────────────────
  const running = phase === "running";
  const camLive = camState === "live" && handSeen;
  const camLost = camState === "live" && !handSeen;
  const camBad = camState === "denied" || camState === "failed";

  const statusText = camLive
    ? "tracking · live"
    : camLost
      ? "hand lost — pointer still works"
      : running && readout.driver === "pointer"
        ? "pointer · live"
        : running
          ? "idle · the lattice is drifting itself"
          : "pointer · ready";

  const labelCls = "font-mono text-xs uppercase tracking-[0.18em]";
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  const semiLabel = `${readout.semi > 0 ? "+" : ""}${readout.semi.toFixed(1)} st`;

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {/* the volumetric lattice IS the page */}
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: camState === "live" ? "default" : "crosshair" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={onPointerLeave}
      />

      {/* mirrored camera preview — small corner, only when live */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute right-3 top-3 z-20 h-24 w-32 scale-x-[-1] rounded-md border border-border/40 object-cover opacity-70"
        style={{ display: camState === "live" ? "block" : "none" }}
        playsInline
        muted
      />

      {!webglOk && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL is unavailable on this device, so the 3-D pitch/time lattice cannot render.
            Nothing was started.
          </p>
        </div>
      )}

      {/* live readout — the decoupling made legible (the see==hear proof) */}
      {running && webglOk && (
        <div
          className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} text-primary`}
        >
          {readout.mode === "notes" ? "notes" : "grid"} · pitch {semiLabel} · time{" "}
          {readout.time.toFixed(2)}× ·{" "}
          {readout.coupled ? "coupled (varispeed)" : "decoupled"}
        </div>
      )}

      {/* tracking / fallback status — stays visible in immersive too */}
      {webglOk && (
        <div
          className={`pointer-events-none absolute left-4 top-10 z-30 ${labelCls} ${
            camLost ? "text-destructive" : camLive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {statusText}
        </div>
      )}

      {phase === "error" && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-destructive">
          {errMsg || "Could not start audio."} Press Play to retry.
        </div>
      )}
      {camBad && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-muted-foreground">
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} — transpose with the
          pointer (left/right = pitch, up/down = time) or arrow keys instead.
        </div>
      )}

      {/* full write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="max-w-xl">
            <p className={`${labelCls} text-muted-foreground`}>
              Delay-line pitch shifter · datamatics · volumetric
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Pitch / Time Lattice
            </h1>
            <p className="mt-1 text-base leading-relaxed text-muted-foreground">
              Transpose his piano&apos;s pitch independently of its time. Left/right sets the
              register; up/down sets the tempo — four times slower to twice as fast — with no
              chipmunk effect, because a time-domain delay-line shifter cancels the varispeed.
              Watch the two axes come apart in the lattice.
              {running && trackTitle && (
                <span className="text-muted-foreground/70"> Now playing: {trackTitle}.</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <button
                type="button"
                onClick={start}
                className={btnPrimary}
                disabled={phase === "loading" || !webglOk}
              >
                {phase === "loading" ? "Loading…" : "Play"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>live · {trackTitle}</span>
            )}

            {camState !== "live" ? (
              <button
                type="button"
                onClick={enableCamera}
                className={btnGhost}
                disabled={camState === "requesting" || !webglOk}
              >
                {camState === "requesting" ? "Starting camera…" : "Use camera (one hand)"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>camera · live</span>
            )}

            <label className={`${labelCls} flex items-center gap-2 text-muted-foreground`}>
              <span className="sr-only">Track</span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={running || phase === "loading"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {REAL_TRACKS.map((tk) => (
                  <option key={tk.id} value={tk.id}>
                    {tk.title}
                  </option>
                ))}
              </select>
            </label>

            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Pitch / Time Lattice"
              description={DESCRIPTION}
              howTo={HOW_TO}
            />
          </div>
        </div>
      )}

      {/* while immersive: only art + status + HUD, plus a minimal Play */}
      {immersive && !running && phase !== "loading" && webglOk && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button type="button" onClick={start} className={btnPrimary}>
            Play
          </button>
        </div>
      )}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Pitch / Time Lattice"
          description={DESCRIPTION}
          howTo={HOW_TO}
        />
      )}
    </main>
  );
}
