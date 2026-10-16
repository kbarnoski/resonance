"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 21280-mosaicfield — Mosaic Field
//
// ONE question: what if you could fly through a 3-D constellation of your own
// piano recording's notes and RE-SEQUENCE the performance in space — the order
// your motion sweeps the cells, not the original timeline, becomes the music?
//
// This is spatial concatenative re-sequencing / audio musaicing. Karel's take
// is shattered into a volumetric cloud of its OWN note-events: every note is a
// CELL floating by pitch (vertical), time (depth) and pitch-class (a circle-of-
// fifths rosette fanning it laterally). You fly a sphere-gate through the cloud
// under the pointer (X → lateral arm, Y → depth into time). Every cell that
// falls inside the gate ellipsoid RE-TRIGGERS its own slice of his decoded audio
// — his real pitch, at playbackRate 1 — so the piece you hear is re-sequenced by
// where you move, not by his original ordering. EVERY sound is a slice of his
// take; nothing is synthesized.
//
// Pointer-first: the pointer/drag drives the whole piece with NO camera. A one-
// hand MediaPipe camera is a LABELLED secondary enhancement that only overrides
// the SAME cursor the pointer writes (index center → cursor, openness → gate
// width). Idle (no pointer, no hand) lets the gate sweep itself on a slow
// Lissajous so the field is never silent or blank — and it is LABELLED idle.
//
// LOOK: genuinely volumetric, NOT a glow-on-black sketch. Crisp disc cells with
// NormalBlending (no additive bloom), real depth occlusion (depthWrite), a cool
// slate-indigo fog that dissolves distance, size-attenuation and a parallax
// camera sway. The read is a dimensional volume you move through, not a 2-D glow.
//
// Reference (honest): corpus-based concatenative synthesis — Diemo Schwarz's
// CataRT and the AudioGuide musaicing lineage; "The Concatenator" (Tralie &
// Cantil, ISMIR 2024) real-time Bayesian musaicing; and the gesture-traversed
// corpus-browsing idea of DAFx26 (Abate & Hansen). This implements a simple
// proximity-gate unit selection inspired by them — not a reimplementation.
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

// ── spatial / field constants ────────────────────────────────────────────────
const DEPTH = 260; // how far the time-axis extrudes into Z
const X_RANGE = 30; // how far the gate swings laterally
const CAM_BACK = 72; // camera sits this far in front of the gate
const MAX_CELLS = 2600; // perf cap on the point cloud
const GRID_SLICES = 72; // fallback window count when analysis is thin
const COOLDOWN = 0.32; // seconds a cell must rest before it can re-trigger
const MAX_VOICES = 12; // simultaneous slice voices, oldest-first stealing
const MAX_TRIGS_PER_FRAME = 5; // phrase instead of machine-gun
const FOG_DENSITY = 0.0058;
const BG = new THREE.Color(0x0c0f1a); // cool slate-indigo — atmosphere, not black

const DESCRIPTION =
  "Your piano recording shattered into a volumetric cloud of its own notes — fly a sphere-gate through it and every cell you sweep re-plays its own slice, so the order of your motion becomes the music.";
const HOW_TO = [
  "Press Play to shatter your recording into a 3-D field of its own notes",
  "Move your cursor to fly the gate through the cloud — X sweeps across, Y flies into time",
  "Each note you sweep re-plays its OWN slice — the order is yours, not the original timeline",
  "Drag (or open your hand) to widen the gate and catch more cells at once",
  "Optional: enable the camera and your index fingertip flies the same gate",
];

// ── small helpers (NOT hooks) ─────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// HSL → RGB, 0..1. A restrained COOL violet/indigo ramp (never neon).
function coolColor(midi: number): [number, number, number] {
  const t = clamp01((midi - 24) / (100 - 24));
  const h = (248 - t * 20) / 360; // 248°(indigo) → 228° — stays cool
  const s = 0.42 + t * 0.12;
  const l = 0.4 + t * 0.26;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2 = (tc: number): number => {
    let x = tc;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue2(h + 1 / 3), hue2(h), hue2(h - 1 / 3)];
}

// a cell = one window of HIS buffer, placed in the volume
interface Cell {
  time: number; // offset into buffer (s)
  dur: number; // slice length (s)
  vel: number; // 0..1 (drives peak gain + lateral radius)
  x: number;
  y: number;
  z: number;
}

interface Voice {
  src: AudioBufferSourceNode;
  g: GainNode;
  started: number;
}

interface Engine {
  actx: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  cells: Cell[];
  mode: "note-cells" | "grid-slices";
  flash: Float32Array; // per-cell trigger flash, decays each frame
  lastTrig: Float64Array; // per-cell last-trigger time (s)
  voices: Voice[];
  freq: Uint8Array<ArrayBuffer>;
  points: THREE.Points;
  geom: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
}

// map a (pitch, time, velocity) to a point in the volumetric field.
function layout(
  midi: number,
  timeNorm: number,
  vel: number,
): { x: number; y: number; z: number } {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const fifth = (pc * 7) % 12; // circle-of-fifths index
  const theta = (fifth / 12) * Math.PI * 2;
  const R = 15 + vel * 16; // louder notes fan wider — a rosette
  const x = Math.cos(theta) * R;
  const y = (midi - 64) * 0.95 + Math.sin(theta) * R * 0.3; // pitch + helix lift
  const z = -timeNorm * DEPTH; // time → depth
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
    // size attenuation — nearer cells read larger (depth cue, not glow)
    gl_PointSize = aSize * uSizeScale * uPixelRatio * (320.0 / dist);
    gl_PointSize *= (1.0 + aFlash * 1.7);
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
    // CRISP disc with a hair of edge-softening — deliberately not a soft blob
    float alpha = smoothstep(0.5, 0.42, d);
    // a faint interior facet for a dimensional read (a lit cell, not bloom)
    float facet = 0.82 + 0.18 * (1.0 - d * 2.0);
    vec3 col = vColor * facet + vFlash * vec3(0.55, 0.5, 0.62);
    col = mix(col, uFogColor, vFog); // dissolve into the haze with distance
    gl_FragColor = vec4(col, alpha * (1.0 - vFog * 0.82));
  }
`;

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // three.js refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const starsRef = useRef<THREE.Points | null>(null);
  const ringRef = useRef<THREE.Mesh | null>(null);
  const rafRef = useRef<number>(0);

  // audio engine
  const engineRef = useRef<Engine | null>(null);

  // control inputs (refs so the loop never restarts)
  const pxRef = useRef(0.5);
  const pyRef = useRef(0.45);
  const pointerActiveRef = useRef(false);
  const pointerDownRef = useRef(false);
  const camWantRef = useRef(false);
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // smoothed state carried across frames
  const stateRef = useRef({ gx: 0, gz: -0.45 * DEPTH, open: 0.25, breath: 0, last: 0 });
  const camStateRef = useRef<"off" | "requesting" | "live" | "denied" | "failed">("off");
  const handSeenRef = useRef(false);
  const phaseRef = useRef<"idle" | "loading" | "running" | "error">("idle");

  // react UI state
  const [webglOk, setWebglOk] = useState(true);
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [camState, setCamState] =
    useState<"off" | "requesting" | "live" | "denied" | "failed">("off");
  const [handSeen, setHandSeen] = useState(false);
  const [readout, setReadout] = useState({
    mode: "note-cells" as "note-cells" | "grid-slices",
    cells: 0,
    voices: 0,
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

  // ── the render loop — runs from mount (starfield/idle) through running ──────
  const loop = useCallback((nowMs: number) => {
    rafRef.current = requestAnimationFrame(loop);
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const ring = ringRef.current;
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
        // hand center → the SAME cursor the pointer writes
        pxRef.current = clamp01((f.cx / 1.2 + 1) / 2);
        pyRef.current = clamp01(1 - (f.cy / 1.2 + 1) / 2);
        openTarget = 0.2 + f.open * 1.0; // openness widens the gate
      }
    }
    if (!handThisFrame) {
      if (camStateRef.current === "live") {
        driver = "tracking"; // on but hand lost — hold last cursor
      } else if (pointerActiveRef.current) {
        driver = "pointer";
        openTarget = pointerDownRef.current ? 1.1 : 0.28;
      } else {
        driver = "idle";
        // the field sweeps ITSELF on a slow Lissajous — labelled idle
        pxRef.current = 0.5 + 0.4 * Math.sin(st.breath * 0.37);
        pyRef.current = 0.5 + 0.34 * Math.sin(st.breath * 0.23 + 1.1);
        openTarget = 0.45 + 0.25 * Math.sin(st.breath * 0.5);
      }
    }
    if (handThisFrame !== handSeenRef.current) {
      handSeenRef.current = handThisFrame;
      setHandSeen(handThisFrame);
    }

    // ── gate target from the cursor (X → lateral, Y → depth) ──
    const gxT = (pxRef.current - 0.5) * 2 * X_RANGE;
    const gzT = -pyRef.current * DEPTH;
    st.gx += (gxT - st.gx) * 0.1;
    st.gz += (gzT - st.gz) * 0.08;
    st.open += (openTarget - st.open) * 0.12;
    const gy = Math.sin(st.breath * 0.6) * 5; // gentle vertical bob, centered

    // ellipsoid radii (drag / openness widen the lateral + depth span)
    const rx = 12 * (1 + st.open * 1.4);
    const ry = 30;
    const rz = 17 * (1 + st.open * 1.4);

    // ── camera: fly THROUGH the field, with a parallax sway ──
    camera.position.set(
      st.gx * 0.25 + Math.sin(t * 0.31) * 3.5,
      7 + Math.cos(t * 0.24) * 3,
      st.gz + CAM_BACK,
    );
    camera.lookAt(st.gx * 0.15, 0, st.gz - 60);

    // ── gate ring — billboarded translucent cursor ──
    if (ring) {
      ring.position.set(st.gx, gy, st.gz);
      ring.scale.setScalar(rx);
      ring.lookAt(camera.position);
      const m = ring.material as THREE.MeshBasicMaterial;
      m.opacity = 0.22 + st.open * 0.18;
    }

    // ── audio-reactive shimmer + the concatenative triggering ──
    const eng = engineRef.current;
    if (eng) {
      eng.master.analyser.getByteFrequencyData(eng.freq);
      let sum = 0;
      for (let i = 0; i < eng.freq.length; i++) sum += eng.freq[i];
      const energy = clamp01(sum / eng.freq.length / 255);
      eng.mat.uniforms.uSizeScale.value = 1 + energy * 0.5;

      const now = eng.actx.currentTime;
      let fired = 0;
      const irx = 1 / rx,
        iry = 1 / ry,
        irz = 1 / rz;
      for (let i = 0; i < eng.cells.length; i++) {
        const c = eng.cells[i];
        const dx = (c.x - st.gx) * irx;
        const dy = (c.y - gy) * iry;
        const dz = (c.z - st.gz) * irz;
        if (dx * dx + dy * dy + dz * dz <= 1) {
          if (
            fired < MAX_TRIGS_PER_FRAME &&
            now - eng.lastTrig[i] > COOLDOWN
          ) {
            triggerCell(eng, i, now);
            fired++;
          }
        }
      }

      // decay the per-cell flash and push to the GPU
      const fl = eng.flash;
      for (let i = 0; i < fl.length; i++) fl[i] *= 0.9;
      const attr = eng.geom.getAttribute("aFlash") as THREE.BufferAttribute;
      attr.needsUpdate = true;

      // readout (on change only)
      const prev = readoutRef.current;
      if (prev.voices !== eng.voices.length || prev.driver !== driver) {
        const next = { ...prev, voices: eng.voices.length, driver };
        readoutRef.current = next;
        setReadout(next);
      }
    } else {
      // no engine yet: still report driver so idle/pointer label is honest
      const prev = readoutRef.current;
      if (prev.driver !== driver) {
        const next = { ...prev, driver };
        readoutRef.current = next;
        setReadout(next);
      }
    }

    // idle breathing on the starfield so it is never dead-still
    const stars = starsRef.current;
    if (stars) stars.rotation.y = st.breath * 0.006;

    renderer.render(scene, camera);
  }, []);

  // ── one concatenative slice of HIS buffer, re-triggered by proximity ────────
  function triggerCell(eng: Engine, i: number, now: number) {
    // oldest-first voice stealing
    if (eng.voices.length >= MAX_VOICES) {
      const old = eng.voices.shift();
      if (old) {
        try {
          old.g.gain.cancelScheduledValues(now);
          old.g.gain.setTargetAtTime(0.0001, now, 0.03);
          old.src.stop(now + 0.1);
        } catch {
          /* already ended */
        }
      }
    }
    const c = eng.cells[i];
    const src = eng.actx.createBufferSource();
    src.buffer = eng.buffer;
    src.playbackRate.value = 1; // HIS real pitch — nothing transposed
    const g = eng.actx.createGain();
    const atk = 0.012;
    const rel = 0.14;
    const body = Math.max(atk, c.dur);
    const peak = 0.22 + c.vel * 0.42;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + atk);
    g.gain.setValueAtTime(peak, now + body);
    g.gain.linearRampToValueAtTime(0.0001, now + body + rel);
    src.connect(g);
    g.connect(eng.master.input);
    try {
      src.start(now, c.time, c.dur + rel);
      src.stop(now + body + rel + 0.04);
    } catch {
      /* offset past buffer — skip */
      return;
    }
    const v: Voice = { src, g, started: now };
    src.onended = () => {
      try {
        g.disconnect();
      } catch {
        /* noop */
      }
      const k = eng.voices.indexOf(v);
      if (k >= 0) eng.voices.splice(k, 1);
    };
    eng.voices.push(v);
    eng.flash[i] = 1;
    eng.lastTrig[i] = now;
  }

  // ── init three.js on mount: starfield + gate are alive before audio ─────────
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

    const camera = new THREE.PerspectiveCamera(60, w / h, 1, DEPTH + 280);
    camera.position.set(0, 7, CAM_BACK);
    cameraRef.current = camera;

    // faint persistent starfield — a deep parallax backdrop (cool, dim)
    const starN = 900;
    const sPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      sPos[i * 3] = (Math.random() - 0.5) * 320;
      sPos[i * 3 + 1] = (Math.random() - 0.5) * 220;
      sPos[i * 3 + 2] = -Math.random() * (DEPTH + 120);
    }
    const sGeom = new THREE.BufferGeometry();
    sGeom.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    const sMat = new THREE.PointsMaterial({
      color: 0x3a4063,
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      fog: true,
    });
    const stars = new THREE.Points(sGeom, sMat);
    starsRef.current = stars;
    scene.add(stars);

    // billboarded gate ring (crisp, translucent — the sphere-gate cursor)
    const ringGeom = new THREE.RingGeometry(0.86, 1, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x8b7be8,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.set(0, 0, -0.45 * DEPTH);
    ring.scale.setScalar(12);
    ringRef.current = ring;
    scene.add(ring);

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
      sGeom.dispose();
      sMat.dispose();
      ringGeom.dispose();
      ringMat.dispose();
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

  // ── build the cell cloud from HIS notes (or grid-slices fallback) ───────────
  const buildCells = useCallback(
    (buffer: AudioBuffer, notes: { midi: number; time: number; duration: number; velocity: number }[]): {
      cells: Cell[];
      mode: "note-cells" | "grid-slices";
    } => {
      const dur = Math.max(0.1, buffer.duration);
      const usable = notes.filter((n) => n.time < dur - 0.02);
      if (usable.length >= 20) {
        const stride = Math.max(1, Math.ceil(usable.length / MAX_CELLS));
        const cells: Cell[] = [];
        for (let i = 0; i < usable.length; i += stride) {
          const n = usable[i];
          const vel = clamp01((n.velocity || 70) / 127);
          const slice = clamp(n.duration || 0.25, 0.08, 1.2);
          const p = layout(n.midi, clamp01(n.time / dur), vel);
          cells.push({ time: n.time, dur: slice, vel, x: p.x, y: p.y, z: p.z });
        }
        return { cells, mode: "note-cells" };
      }
      // fallback: chop HIS buffer into equal windows — still his audio
      const win = dur / GRID_SLICES;
      const cells: Cell[] = [];
      for (let i = 0; i < GRID_SLICES; i++) {
        const midi = 40 + ((i * 5) % 48); // spread vertically + across fifths
        const p = layout(midi, i / GRID_SLICES, 0.6);
        cells.push({
          time: i * win,
          dur: clamp(win, 0.08, 1.2),
          vel: 0.6,
          x: p.x,
          y: p.y,
          z: p.z,
        });
      }
      return { cells, mode: "grid-slices" };
    },
    [],
  );

  // ── Play: audio first (must always work), then wire the cloud ───────────────
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
      setErrMsg("Web Audio is unavailable in this browser — the piece cannot sound here.");
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

    const { cells, mode } = buildCells(loaded.buffer, notes);
    const master = createSafeMaster(actx);

    // GPU point cloud of the cells
    const n = cells.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const flash = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      pos[i * 3] = c.x;
      pos[i * 3 + 1] = c.y;
      pos[i * 3 + 2] = c.z;
      // recover an approximate midi from the vertical for the color ramp
      const approxMidi = clamp(c.y / 0.95 + 64, 24, 100);
      const [r, g, b] = coolColor(approxMidi);
      col[i * 3] = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;
      size[i] = 7 + c.vel * 9;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geom.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geom.setAttribute("aFlash", new THREE.BufferAttribute(flash, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NormalBlending, // NOT additive — no glow, real occlusion
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
      cells,
      mode,
      flash,
      lastTrig: new Float64Array(n).fill(-999),
      voices: [],
      freq: new Uint8Array(master.analyser.frequencyBinCount),
      points,
      geom,
      mat,
    };
    engineRef.current = eng;
    const next = { mode, cells: n, voices: 0, driver: readoutRef.current.driver };
    readoutRef.current = next;
    setReadout(next);
    setPhase("running");
  }, [trackId, webglOk, buildCells]);

  // ── camera opt-in (secondary enhancement) ──────────────────────────────────
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

  // ── pointer control (the real, primary path — identical cursor as camera) ───
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
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA"))
        return;
      let handled = false;
      if (e.key === "ArrowLeft") {
        pxRef.current = clamp01(pxRef.current - 0.03);
        handled = true;
      } else if (e.key === "ArrowRight") {
        pxRef.current = clamp01(pxRef.current + 0.03);
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

  // ── audio / camera teardown ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng) {
        for (const v of eng.voices) {
          try {
            v.src.stop();
          } catch {
            /* noop */
          }
          try {
            v.g.disconnect();
          } catch {
            /* noop */
          }
        }
        eng.voices = [];
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
          ? "idle · the field is sweeping itself"
          : "pointer · ready";

  const labelCls = "font-mono text-xs uppercase tracking-[0.18em]";
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {/* the volumetric field IS the page */}
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
            WebGL is unavailable on this device, so the 3-D note field cannot
            render. Nothing was started.
          </p>
        </div>
      )}

      {/* live readout — the re-sequencing made legible */}
      {running && webglOk && (
        <div className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} text-primary`}>
          {readout.mode} · {readout.cells} cells · {readout.voices}/{MAX_VOICES} voices
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
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} — fly the
          gate with the pointer (drag to widen) or arrow keys instead.
        </div>
      )}

      {/* full write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="max-w-xl">
            <p className={`${labelCls} text-muted-foreground`}>
              Spatial concatenative re-sequencing · volumetric
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Mosaic Field
            </h1>
            <p className="mt-1 text-base leading-relaxed text-muted-foreground">
              Your recording, shattered into a 3-D cloud of its own notes. Fly the
              sphere-gate through it and every cell you sweep re-plays its own
              slice — the order of your motion becomes the music.
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
              title="Mosaic Field"
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
          title="Mosaic Field"
          description={DESCRIPTION}
          howTo={HOW_TO}
        />
      )}
    </main>
  );
}
