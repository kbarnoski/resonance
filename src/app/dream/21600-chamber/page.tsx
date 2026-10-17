"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 21600-chamber — Chamber
//
// ONE question: what if you could play Karel's piano through the resonant ghost
// of one of its OWN moments — fly through a 3-D resonance chamber whose walls are
// built from his recording, and wherever you move RE-SELECTS which instant of the
// take becomes the body the sound rings inside?
//
// This is auto-convolution cross-synthesis. The DRY signal is one real recording
// playing continuously (a BufferSourceNode looping the decoded AudioBuffer). The
// WET signal is that same dry signal pushed through a ConvolverNode whose impulse
// response is a SHORT, Hann-windowed, normalized slice (~0.2–1.2 s) cut from the
// SAME recording at a position the cursor chooses. Flying the focus down the
// chamber re-selects which moment of his take becomes the resonant IR → the piece
// rings with the signature of that instant. The cursor also sets wet/dry mix and
// pre-delay; drag (or an open hand) widens the resonant window. Two convolvers
// crossfade on every IR swap so the chamber re-tunes without a click, and the IR
// is rebuilt on a throttle (buffer assignment is expensive), never per frame.
//
// LOOK: a genuinely volumetric resonance chamber you fly THROUGH — a helical
// tunnel of his own notes forming the walls, translucent resonance shells you
// pass between (real occlusion), a slate vapor haze, and a bone focus-plane
// marking the instant currently ringing. Cool steel/bone/slate on a LIFTED (non-
// black) ground, NormalBlending + depthWrite, FogExp2, size-attenuation. No
// additive bloom, no glow.
//
// References (honest): the auto-convolution / short-slice-as-IR cross-synthesis
// technique (using a signal's own windowed fragment as the reverb impulse so the
// source rings with its own spectral signature); and "Accelerated Interactive
// Auralization of Highly Reverberant Spaces using Graphics Hardware"
// (arXiv:2509.04390, 2026) as the GPU-convolution-reverb research anchor for
// real-time, movement-driven re-auralization. This is a single genuine
// convolution block — not a filterbank, not granular, not a phase vocoder.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  REAL_TRACKS,
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── spatial / chamber constants ──────────────────────────────────────────────
const DEPTH = 320; // how far the recording's timeline extrudes into Z
const CHAMBER_R = 46; // radius of the resonant tunnel wall
const CAM_BACK = 72; // camera sits this far behind the focus plane
const MAX_POINTS = 2600; // perf cap on the note cloud
const GRID_SLICES = 96; // fallback wall-point count when analysis is thin
const SHELL_COUNT = 11; // translucent resonance shells along the tunnel
const MOTE_COUNT = 1300; // slate vapor fill for parallax depth
const FOG_DENSITY = 0.0042;
const BG = new THREE.Color(0x171c25); // lifted cool slate — atmosphere, not black

// ── audio constants ───────────────────────────────────────────────────────────
const IR_MIN = 0.2; // shortest resonant window (s)
const IR_MAX = 1.2; // longest resonant window (s)
const IR_THROTTLE = 0.2; // seconds between IR rebuilds (buffer assign is costly)
const IR_U_EPS = 0.0045; // min timeline move before a rebuild is worth it
const IR_W_EPS = 0.012; // min window change before a rebuild is worth it
const XFADE_TC = 0.05; // convolver crossfade time-constant (~0.2 s settle)
const DRY_LEVEL = 0.82; // continuous recording always audible under the wet

const DESCRIPTION =
  "Karel's recording plays continuously while the same signal is pushed through a convolution reverb whose impulse response is a short slice of the take itself. Fly the focus through a 3-D chamber built from his own notes — wherever you are re-selects which instant becomes the resonant body the piano rings inside.";
const HOW_TO = [
  "Press Play to let one of Karel's recordings fill the chamber",
  "Move the mouse left and right to fly through the recording's timeline — wherever you are becomes the resonant body the sound rings inside",
  "Move up and down to open the chamber: deeper means more of the wet, convolved signal and a longer pre-delay",
  "Drag to widen the resonant window so a longer slice of that instant rings back",
  "Optional: enable the camera and your open hand flies the same focus through the chamber",
];

// ── small helpers (NOT hooks) ─────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// cool steel/bone/slate ramp by register, 0..1 → low saturation vapor (no neon).
function chamberColor(t: number): [number, number, number] {
  const u = clamp01(t);
  // slate → steel → bone, a restrained cool ramp
  const slate: [number, number, number] = [0.4, 0.46, 0.56];
  const steel: [number, number, number] = [0.6, 0.66, 0.72];
  const bone: [number, number, number] = [0.85, 0.83, 0.77];
  if (u < 0.5) {
    const k = u / 0.5;
    return [
      slate[0] + (steel[0] - slate[0]) * k,
      slate[1] + (steel[1] - slate[1]) * k,
      slate[2] + (steel[2] - slate[2]) * k,
    ];
  }
  const k = (u - 0.5) / 0.5;
  return [
    steel[0] + (bone[0] - steel[0]) * k,
    steel[1] + (bone[1] - steel[1]) * k,
    steel[2] + (bone[2] - steel[2]) * k,
  ];
}

// place a note on the chamber wall: pitch-class → angle, register → lift + radius.
function wallPlace(
  midi: number,
  timeNorm: number,
  vel: number,
): { x: number; y: number; z: number } {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const fifth = (pc * 7) % 12; // circle-of-fifths index
  const theta = (fifth / 12) * Math.PI * 2 + (midi % 3) * 0.12;
  const r = CHAMBER_R * (0.78 + vel * 0.22);
  const x = Math.cos(theta) * r;
  const y = Math.sin(theta) * r + (midi - 60) * 0.5; // wall wrap + pitch lift
  const z = -timeNorm * DEPTH;
  return { x, y, z };
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aFlash;
  uniform float uPixelRatio;
  uniform float uSizeScale;
  uniform float uFogDensity;
  varying vec3 vColor;
  varying float vFog;
  varying float vFlash;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(1.0, -mv.z);
    // size attenuation — nearer wall points read larger (depth cue, not glow)
    gl_PointSize = aSize * uSizeScale * uPixelRatio * (340.0 / dist);
    gl_PointSize *= (1.0 + aFlash * 1.3);
    float fd = uFogDensity * dist;
    vFog = clamp(1.0 - exp(-fd * fd), 0.0, 1.0);
    vColor = aColor;
    vFlash = aFlash;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uFogColor;
  varying vec3 vColor;
  varying float vFog;
  varying float vFlash;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // crisp disc with a hair of edge-softening — a lit facet, not a soft blob
    float alpha = smoothstep(0.5, 0.42, d);
    float facet = 0.82 + 0.18 * (1.0 - d * 2.0);
    // flash lifts toward bone when a point is inside the resonant window
    vec3 col = mix(vColor * facet, vec3(0.9, 0.88, 0.82), vFlash * 0.6);
    col = mix(col, uFogColor, vFog); // dissolve into the haze with distance
    gl_FragColor = vec4(col, alpha * (1.0 - vFog * 0.82));
  }
`;

interface Engine {
  actx: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  src: AudioBufferSourceNode;
  dryGain: GainNode;
  preDelay: DelayNode;
  convA: ConvolverNode;
  convB: ConvolverNode;
  wetA: GainNode;
  wetB: GainNode;
  wetMix: GainNode;
  activeIsA: boolean;
  lastBuild: number;
  lastU: number;
  lastWin: number;
  times: Float32Array; // per-point note onset (s) — drives the window highlight
  flash: Float32Array;
  count: number;
  mode: "wall-notes" | "grid-slices";
  freq: Uint8Array<ArrayBuffer>;
  points: THREE.Points;
  geom: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
}

// build one short, Hann-windowed, peak-normalized slice of HIS buffer as an IR.
function makeImpulse(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  centerSec: number,
  winSec: number,
): AudioBuffer {
  const rate = buffer.sampleRate;
  const winLen = Math.max(64, Math.floor(winSec * rate));
  let start = Math.floor((centerSec - winSec / 2) * rate);
  const maxStart = Math.max(0, buffer.length - winLen);
  if (start < 0) start = 0;
  if (start > maxStart) start = maxStart;
  const ch = buffer.numberOfChannels;
  const ir = ctx.createBuffer(ch, winLen, rate);
  const denom = Math.max(1, winLen - 1);
  for (let c = 0; c < ch; c++) {
    const srcData = buffer.getChannelData(c);
    const dst = ir.getChannelData(c);
    let peak = 1e-5;
    for (let i = 0; i < winLen; i++) {
      // Hann window — fades the slice in and out so the IR has no edge click
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom);
      const s = srcData[start + i] * w;
      dst[i] = s;
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
    }
    // peak-normalize this slice so a loud instant cannot blow up the wet level
    const norm = 0.7 / peak;
    for (let i = 0; i < winLen; i++) dst[i] *= norm;
  }
  return ir;
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // three.js refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const motesRef = useRef<THREE.Points | null>(null);
  const focusRingRef = useRef<THREE.Mesh | null>(null);
  const focusCoreRef = useRef<THREE.Mesh | null>(null);
  const rafRef = useRef<number>(0);

  // audio engine
  const engineRef = useRef<Engine | null>(null);

  // control inputs (refs so the loop never restarts)
  const pxRef = useRef(0.18);
  const pyRef = useRef(0.5);
  const pointerActiveRef = useRef(false);
  const pointerDownRef = useRef(false);
  const camWantRef = useRef(false);
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // smoothed state carried across frames
  const stateRef = useRef({
    fz: 0,
    open: 0.25,
    winSec: 0.4,
    wet: 0.5,
    breath: 0,
    last: 0,
  });
  const camStateRef = useRef<
    "off" | "requesting" | "live" | "denied" | "failed"
  >("off");
  const handSeenRef = useRef(false);
  const phaseRef = useRef<"idle" | "loading" | "running" | "error">("idle");

  // react UI state
  const [webglOk, setWebglOk] = useState(true);
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "error">(
    "idle",
  );
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [camState, setCamState] = useState<
    "off" | "requesting" | "live" | "denied" | "failed"
  >("off");
  const [handSeen, setHandSeen] = useState(false);
  const [readout, setReadout] = useState({
    mode: "wall-notes" as "wall-notes" | "grid-slices",
    moment: 0,
    window: 0.4,
    wet: 0.5,
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

  // ── the render loop — runs from mount (empty chamber) through running ────────
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
    let openTarget = 0.25;
    let handThisFrame = false;

    const video = videoRef.current;
    if (
      camWantRef.current &&
      trackerRef.current &&
      video &&
      video.readyState >= 2
    ) {
      let res: { landmarks: { x: number; y: number; z: number }[][] } | null =
        null;
      try {
        res = trackerRef.current.detectForVideo(video, nowMs);
      } catch {
        res = null;
      }
      if (res && res.landmarks && res.landmarks[0]) {
        const f = computeHandFeatures(res.landmarks[0]);
        handThisFrame = true;
        driver = "tracking";
        // hand center → the SAME cursor the pointer writes
        pxRef.current = clamp01((f.cx / 1.2 + 1) / 2);
        pyRef.current = clamp01(1 - (f.cy / 1.2 + 1) / 2);
        openTarget = 0.1 + f.open * 1.0; // openness widens the resonant window
      }
    }
    if (!handThisFrame) {
      if (camStateRef.current === "live") {
        driver = "tracking"; // on but hand lost — hold last cursor
      } else if (pointerActiveRef.current) {
        driver = "pointer";
        openTarget = pointerDownRef.current ? 1.0 : 0.3;
      } else {
        driver = "idle";
        // the focus drifts slowly through the chamber — labelled idle
        pxRef.current = 0.5 + 0.42 * Math.sin(st.breath * 0.11);
        pyRef.current = 0.5 + 0.3 * Math.sin(st.breath * 0.17 + 0.9);
        openTarget = 0.4 + 0.3 * Math.sin(st.breath * 0.23);
      }
    }
    if (handThisFrame !== handSeenRef.current) {
      handSeenRef.current = handThisFrame;
      setHandSeen(handThisFrame);
    }

    // ── resolve cursor → chamber state ──
    const u = clamp01(pxRef.current); // timeline position (which instant)
    const py = clamp01(pyRef.current);
    st.open += (openTarget - st.open) * 0.1;
    st.winSec = IR_MIN + st.open * (IR_MAX - IR_MIN);
    const wetTarget = 0.2 + (1 - py) * 0.9; // higher on screen (py small) = drier
    st.wet += (wetTarget - st.wet) * 0.08;
    const focusZ = -u * DEPTH;
    st.fz += (focusZ - st.fz) * 0.08;
    const tiltY = (py - 0.5) * 26;

    // ── camera: fly THROUGH the chamber along the timeline, parallax sway ──
    camera.position.set(
      Math.sin(t * 0.21) * 5,
      4 + Math.cos(t * 0.17) * 3 - tiltY * 0.12,
      st.fz + CAM_BACK,
    );
    camera.lookAt(Math.sin(t * 0.13) * 3, -tiltY * 0.25, st.fz - 90);

    // ── focus marker — the resonant body at the current instant ──
    const ring = focusRingRef.current;
    const core = focusCoreRef.current;
    const coreR = 8 + st.open * 20;
    if (ring) {
      ring.position.set(0, 0, st.fz);
      ring.scale.setScalar(CHAMBER_R * (0.9 + st.open * 0.12));
      const m = ring.material as THREE.MeshBasicMaterial;
      m.opacity = 0.14 + st.wet * 0.14;
    }
    if (core) {
      core.position.set(0, 0, st.fz);
      core.scale.setScalar(coreR);
      const m = core.material as THREE.MeshBasicMaterial;
      m.opacity = 0.05 + st.wet * 0.1;
    }

    // ── audio: rebuild the IR (throttled + crossfaded), set mix + highlight ──
    const eng = engineRef.current;
    if (eng) {
      eng.master.analyser.getByteFrequencyData(eng.freq);
      let sum = 0;
      for (let i = 0; i < eng.freq.length; i++) sum += eng.freq[i];
      const energy = clamp01(sum / eng.freq.length / 255);
      eng.mat.uniforms.uSizeScale.value = 1 + energy * 0.35;

      const nowCtx = eng.actx.currentTime;

      // continuous wet/dry mix + pre-delay from the cursor
      eng.wetMix.gain.setTargetAtTime(st.wet, nowCtx, 0.08);
      eng.preDelay.delayTime.setTargetAtTime(0.004 + py * 0.1, nowCtx, 0.08);

      // throttled IR rebuild with an A/B convolver crossfade (no clicks)
      if (
        nowCtx - eng.lastBuild >= IR_THROTTLE &&
        (Math.abs(u - eng.lastU) > IR_U_EPS ||
          Math.abs(st.winSec - eng.lastWin) > IR_W_EPS)
      ) {
        eng.lastBuild = nowCtx;
        eng.lastU = u;
        eng.lastWin = st.winSec;
        const center = u * eng.buffer.duration;
        const ir = makeImpulse(eng.actx, eng.buffer, center, st.winSec);
        const target = eng.activeIsA ? eng.convB : eng.convA;
        target.buffer = ir;
        const rising = eng.activeIsA ? eng.wetB : eng.wetA;
        const falling = eng.activeIsA ? eng.wetA : eng.wetB;
        rising.gain.setTargetAtTime(1, nowCtx, XFADE_TC);
        falling.gain.setTargetAtTime(0.0001, nowCtx, XFADE_TC);
        eng.activeIsA = !eng.activeIsA;
      }

      // light the wall points that fall inside the resonant window
      const center = u * eng.buffer.duration;
      const half = st.winSec / 2;
      const fl = eng.flash;
      const tm = eng.times;
      for (let i = 0; i < eng.count; i++) {
        const d = Math.abs(tm[i] - center);
        if (d < half) fl[i] = 1;
        else fl[i] *= 0.9;
      }
      (eng.geom.getAttribute("aFlash") as THREE.BufferAttribute).needsUpdate =
        true;
    }

    // readout (on change only — keep React quiet)
    const prev = readoutRef.current;
    const momentPct = Math.round(u * 100);
    const winMs = Math.round(st.winSec * 1000);
    const wetPct = Math.round(st.wet * 100);
    if (
      prev.moment !== momentPct ||
      prev.window !== winMs ||
      prev.wet !== wetPct ||
      prev.driver !== driver ||
      (eng && prev.mode !== eng.mode)
    ) {
      const next = {
        mode: eng ? eng.mode : prev.mode,
        moment: momentPct,
        window: winMs,
        wet: wetPct,
        driver,
      };
      readoutRef.current = next;
      setReadout(next);
    }

    // vapor drifts slowly so the chamber is never dead-still
    const motes = motesRef.current;
    if (motes) motes.rotation.z = st.breath * 0.01;

    renderer.render(scene, camera);
  }, []);

  // ── init three.js on mount: the empty chamber is alive before audio ──────────
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

    const camera = new THREE.PerspectiveCamera(62, w / h, 1, DEPTH + 320);
    camera.position.set(0, 4, CAM_BACK);
    cameraRef.current = camera;

    // ── slate vapor fill — dust motes through the whole volume (parallax) ──
    const mPos = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < MOTE_COUNT; i++) {
      const r = Math.sqrt(Math.random()) * CHAMBER_R * 0.92;
      const a = Math.random() * Math.PI * 2;
      mPos[i * 3] = Math.cos(a) * r;
      mPos[i * 3 + 1] = Math.sin(a) * r + (Math.random() - 0.5) * 20;
      mPos[i * 3 + 2] = -Math.random() * (DEPTH + 80) + 40;
    }
    const mGeom = new THREE.BufferGeometry();
    mGeom.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
    const mMat = new THREE.PointsMaterial({
      color: 0x47526a,
      size: 0.85,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: true,
    });
    const motes = new THREE.Points(mGeom, mMat);
    motesRef.current = motes;
    scene.add(motes);

    // ── translucent resonance shells — architecture you fly between ──
    const shellGeoms: THREE.BufferGeometry[] = [];
    const shellMats: THREE.Material[] = [];
    const shellGeom = new THREE.TorusGeometry(CHAMBER_R, 0.45, 8, 96);
    for (let i = 0; i < SHELL_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x7d879a,
        transparent: true,
        opacity: 0.12,
        depthWrite: true, // real occlusion as you pass through them
        fog: true,
      });
      const torus = new THREE.Mesh(shellGeom, mat);
      torus.position.z = -(i / (SHELL_COUNT - 1)) * DEPTH;
      scene.add(torus);
      shellMats.push(mat);
    }
    shellGeoms.push(shellGeom);

    // ── focus marker: a bone plane-ring + a faint core at the ringing instant ──
    const ringGeom = new THREE.RingGeometry(0.93, 1, 72);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xcdd2cc,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true,
    });
    const focusRing = new THREE.Mesh(ringGeom, ringMat);
    focusRing.position.set(0, 0, 0);
    focusRing.scale.setScalar(CHAMBER_R);
    focusRingRef.current = focusRing;
    scene.add(focusRing);

    const coreGeom = new THREE.IcosahedronGeometry(1, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xb9c0c6,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      wireframe: true,
      fog: true,
    });
    const focusCore = new THREE.Mesh(coreGeom, coreMat);
    focusCore.scale.setScalar(10);
    focusCoreRef.current = focusCore;
    scene.add(focusCore);

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
      mGeom.dispose();
      mMat.dispose();
      for (const g of shellGeoms) g.dispose();
      for (const m of shellMats) m.dispose();
      ringGeom.dispose();
      ringMat.dispose();
      coreGeom.dispose();
      coreMat.dispose();
      const eng = engineRef.current;
      if (eng) {
        eng.geom.dispose();
        eng.mat.dispose();
      }
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

  // ── build the wall point cloud from HIS notes (or grid-slices fallback) ──────
  const buildWall = useCallback(
    (
      buffer: AudioBuffer,
      notes: {
        midi: number;
        time: number;
        duration: number;
        velocity: number;
      }[],
    ): {
      pos: Float32Array;
      col: Float32Array;
      size: Float32Array;
      times: Float32Array;
      count: number;
      mode: "wall-notes" | "grid-slices";
    } => {
      const dur = Math.max(0.1, buffer.duration);
      const usable = notes.filter((n) => n.time < dur - 0.02);
      const src: { midi: number; time: number; vel: number }[] = [];
      let mode: "wall-notes" | "grid-slices";
      if (usable.length >= 20) {
        const stride = Math.max(1, Math.ceil(usable.length / MAX_POINTS));
        for (let i = 0; i < usable.length; i += stride) {
          const n = usable[i];
          src.push({
            midi: n.midi,
            time: n.time,
            vel: clamp01((n.velocity || 70) / 127),
          });
        }
        mode = "wall-notes";
      } else {
        // fallback: a helical time-grid along his buffer — still maps his timeline
        for (let i = 0; i < GRID_SLICES; i++) {
          const f = i / GRID_SLICES;
          src.push({ midi: 40 + ((i * 5) % 48), time: f * dur, vel: 0.6 });
        }
        mode = "grid-slices";
      }
      const count = src.length;
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const size = new Float32Array(count);
      const times = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const s = src[i];
        const p = wallPlace(s.midi, clamp01(s.time / dur), s.vel);
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        const [r, g, b] = chamberColor((s.midi - 36) / 52);
        col[i * 3] = r;
        col[i * 3 + 1] = g;
        col[i * 3 + 2] = b;
        size[i] = 6 + s.vel * 8;
        times[i] = s.time;
      }
      return { pos, col, size, times, count, mode };
    },
    [],
  );

  // ── Play: audio first (must always work), then wire the wall ─────────────────
  const start = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "running") return;
    if (!webglOk) return;
    setErrMsg("");
    setPhase("loading");

    let actx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      actx = new AC();
      await actx.resume();
    } catch {
      setErrMsg(
        "Web Audio is unavailable in this browser — the chamber cannot sound here.",
      );
      setPhase("error");
      return;
    }

    let loaded;
    try {
      loaded = await loadRealTrackBuffer(actx, trackId);
    } catch {
      setErrMsg(
        "Karel's recording could not load — check the connection and press Play again.",
      );
      void actx.close();
      setPhase("error");
      return;
    }
    setTrackTitle(loaded.title);

    let notes: {
      midi: number;
      time: number;
      duration: number;
      velocity: number;
    }[] = [];
    try {
      const analysis = await loadTrackAnalysis(trackId);
      if (analysis && analysis.notes) notes = analysis.notes;
    } catch {
      notes = [];
    }

    const wall = buildWall(loaded.buffer, notes);
    const master = createSafeMaster(actx);

    // ── audio graph — a genuine convolution block diagram ──
    //   src(loop) ─┬─ dryGain ───────────────────────────────> master.input
    //              └─ preDelay ─┬─ convA ─ wetA ─┐
    //                           └─ convB ─ wetB ─┴─ wetMix ──> master.input
    const src = actx.createBufferSource();
    src.buffer = loaded.buffer;
    src.loop = true;
    src.playbackRate.value = 1; // HIS real pitch, untransposed

    const dryGain = actx.createGain();
    dryGain.gain.value = DRY_LEVEL;

    const preDelay = actx.createDelay(0.5);
    preDelay.delayTime.value = 0.02;

    const convA = actx.createConvolver();
    const convB = actx.createConvolver();
    convA.normalize = true;
    convB.normalize = true;

    const wetA = actx.createGain();
    const wetB = actx.createGain();
    wetA.gain.value = 1;
    wetB.gain.value = 0.0001;

    const wetMix = actx.createGain();
    wetMix.gain.value = 0.5;

    src.connect(dryGain);
    dryGain.connect(master.input);

    src.connect(preDelay);
    preDelay.connect(convA);
    preDelay.connect(convB);
    convA.connect(wetA);
    convB.connect(wetB);
    wetA.connect(wetMix);
    wetB.connect(wetMix);
    wetMix.connect(master.input);

    // seed the first IR into convA (the active one) before the loop takes over
    const u0 = clamp01(pxRef.current);
    const win0 = stateRef.current.winSec;
    convA.buffer = makeImpulse(
      actx,
      loaded.buffer,
      u0 * loaded.buffer.duration,
      win0,
    );

    try {
      src.start();
    } catch {
      setErrMsg("The recording could not start playing.");
      master.disconnect();
      void actx.close();
      setPhase("error");
      return;
    }

    // ── GPU wall of his notes ──
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(wall.pos, 3));
    geom.setAttribute("aColor", new THREE.BufferAttribute(wall.col, 3));
    geom.setAttribute("aSize", new THREE.BufferAttribute(wall.size, 1));
    geom.setAttribute(
      "aFlash",
      new THREE.BufferAttribute(new Float32Array(wall.count), 1),
    );
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NormalBlending, // NOT additive — real occlusion, no glow
      uniforms: {
        uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
        uSizeScale: { value: 1 },
        uFogDensity: { value: FOG_DENSITY },
        uFogColor: { value: new THREE.Vector3(BG.r, BG.g, BG.b) },
      },
    });
    const points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    sceneRef.current?.add(points);

    const eng: Engine = {
      actx,
      master,
      buffer: loaded.buffer,
      src,
      dryGain,
      preDelay,
      convA,
      convB,
      wetA,
      wetB,
      wetMix,
      activeIsA: true,
      lastBuild: actx.currentTime,
      lastU: u0,
      lastWin: win0,
      times: wall.times,
      flash: (geom.getAttribute("aFlash") as THREE.BufferAttribute)
        .array as Float32Array,
      count: wall.count,
      mode: wall.mode,
      freq: new Uint8Array(master.analyser.frequencyBinCount),
      points,
      geom,
      mat,
    };
    engineRef.current = eng;
    setPhase("running");
  }, [trackId, webglOk, buildWall]);

  // ── camera opt-in (secondary enhancement) ───────────────────────────────────
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
      setCamState(
        /denied|Permission|NotAllowed/i.test(msg) ? "denied" : "failed",
      );
    }
  }, []);

  // ── pointer control (the real, primary path — identical cursor as camera) ────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pxRef.current = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    pyRef.current = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    pointerActiveRef.current = true;
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (camStateRef.current === "live") return;
      pointerDownRef.current = true;
      onPointerMove(e);
    },
    [onPointerMove],
  );
  const onPointerUp = useCallback(() => {
    pointerDownRef.current = false;
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerDownRef.current = false;
    pointerActiveRef.current = false;
  }, []);

  // keyboard conducting (a11y) — same cursor as the pointer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "SELECT" ||
          t.tagName === "TEXTAREA")
      )
        return;
      let handled = false;
      if (e.key === "ArrowLeft") {
        pxRef.current = clamp01(pxRef.current - 0.025);
        handled = true;
      } else if (e.key === "ArrowRight") {
        pxRef.current = clamp01(pxRef.current + 0.025);
        handled = true;
      } else if (e.key === "ArrowUp") {
        pyRef.current = clamp01(pyRef.current - 0.03);
        handled = true;
      } else if (e.key === "ArrowDown") {
        pyRef.current = clamp01(pyRef.current + 0.03);
        handled = true;
      } else if (e.key === " " || e.key === "Spacebar") {
        pointerDownRef.current = !pointerDownRef.current;
        handled = true;
      }
      if (handled && camStateRef.current !== "live") {
        pointerActiveRef.current = true;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── audio / camera teardown ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.src.stop();
        } catch {
          /* already stopped */
        }
        try {
          eng.src.disconnect();
          eng.dryGain.disconnect();
          eng.preDelay.disconnect();
          eng.convA.disconnect();
          eng.convB.disconnect();
          eng.wetA.disconnect();
          eng.wetB.disconnect();
          eng.wetMix.disconnect();
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

  // ── derived UI ────────────────────────────────────────────────────────────────
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
          ? "idle · the focus is drifting itself"
          : "pointer · ready";

  const labelCls = "font-mono text-xs uppercase tracking-[0.18em]";
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {/* the volumetric chamber IS the page */}
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: camState === "live" ? "default" : "crosshair" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
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
            WebGL is unavailable on this device, so the 3-D resonance chamber
            cannot render. Nothing was started.
          </p>
        </div>
      )}

      {/* live readout — the convolution made legible */}
      {running && webglOk && (
        <div
          className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} text-primary`}
        >
          {readout.mode} · instant {readout.moment}% · IR {readout.window}ms ·
          wet {readout.wet}%
        </div>
      )}

      {/* tracking / fallback status — stays visible in immersive too */}
      {webglOk && (
        <div
          className={`pointer-events-none absolute left-4 top-10 z-30 ${labelCls} ${
            camLost
              ? "text-destructive"
              : camLive
                ? "text-primary"
                : "text-muted-foreground"
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
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} — fly
          the focus with the pointer (drag to widen the window) or arrow keys
          instead.
        </div>
      )}

      {/* full write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="max-w-xl">
            <p className={`${labelCls} text-muted-foreground`}>
              Auto-convolution cross-synthesis · volumetric
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Chamber
            </h1>
            <p className="mt-1 text-base leading-relaxed text-muted-foreground">
              His recording plays on, while the same signal rings through a
              convolution reverb whose impulse response is a short slice of the
              take itself. Fly the focus through the chamber — wherever you are
              re-selects which instant becomes the resonant body.
              {running && trackTitle && (
                <span className="text-muted-foreground/70">
                  {" "}
                  Now playing: {trackTitle}.
                </span>
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
              <span className={`${labelCls} text-primary`}>
                live · {trackTitle}
              </span>
            )}

            {camState !== "live" ? (
              <button
                type="button"
                onClick={enableCamera}
                className={btnGhost}
                disabled={camState === "requesting" || !webglOk}
              >
                {camState === "requesting"
                  ? "Starting camera…"
                  : "Use camera (one hand)"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>camera · live</span>
            )}

            <label
              className={`${labelCls} flex items-center gap-2 text-muted-foreground`}
            >
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
              title="Chamber"
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
          title="Chamber"
          description={DESCRIPTION}
          howTo={HOW_TO}
        />
      )}
    </main>
  );
}
