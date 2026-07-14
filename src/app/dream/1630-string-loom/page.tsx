"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";

// ════════════════════════════════════════════════════════════════════════════
// String Loom (1630)
//
// What if your whole body were the bridge of a giant string instrument? A
// vertical field of tuned strings hangs in 3D space. Wherever a tracked body
// joint (wrists, elbows, knees, ankles, nose) sweeps across a string, it plucks
// it: the string visibly shivers along a decaying standing wave AND rings via
// Karplus-Strong physical modelling. The string you WATCH wobble is exactly the
// pitch you HEAR decay — a tight see = hear weld, because both are driven off the
// same string index and its one fixed frequency.
//
// Input: MediaPipe PoseLandmarker (full body, 33 landmarks) via CDN dynamic
// import — no npm dependency. Graceful degradation: if there is no camera, the
// permission is denied, or MediaPipe fails to load, a deterministic seeded
// "ghost body" skeleton sweeps the field and plays the loom by itself, so this
// is never blank and never silent even on a headless 06:30 deploy.
//
// Output: three.js / WebGL — strings are 3D lines whose vertices displace along
// a standing-wave envelope. Warm loom palette: bronze / brass / amber / bone on
// a near-black warm charcoal ground.
//
// Audio: Karplus-Strong plucked-string synthesis. Each string owns a delay line
// of length sampleRate/frequency with a lowpass averaging feedback filter; the
// pluck is a seeded noise burst. Pitch is SPATIAL (which column = which note),
// not a centroid → pitch reflex. Velocity / joint / height modulate pluck
// strength and brightness only.
// ════════════════════════════════════════════════════════════════════════════

// ── Seeded PRNG (mulberry32) — determinism, no Math.random anywhere ─────────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The scale: just-intonation pentatonic major, spread over three octaves ──────
// Fixed pitch per string; the spatial column decides the note. C3 root.
const JI_PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const BASE_HZ = 130.81; // C3
const NUM_STRINGS = 15; // 3 octaves × 5 steps

function stringFreq(i: number): number {
  const octave = Math.floor(i / JI_PENTATONIC.length);
  const step = i % JI_PENTATONIC.length;
  return BASE_HZ * Math.pow(2, octave) * JI_PENTATONIC[step];
}

// Column x (normalized 0..1) for string i, with a little margin on each side.
function stringColumn(i: number): number {
  const t = i / (NUM_STRINGS - 1);
  return 0.07 + t * 0.86;
}

// ── Field geometry (normalized <-> three.js world) ──────────────────────────────
const FIELD_W = 6.4;
const FIELD_H = 4.1;
const STRING_TOP = 0.09; // normalized y where strings begin
const STRING_BOT = 0.95;
const SEG = 30; // vertical segments per string line

function worldX(nx: number): number {
  return (nx - 0.5) * FIELD_W;
}
function worldY(ny: number): number {
  return (0.5 - ny) * FIELD_H;
}

// ── Warm palette: bronze (low) → amber → pale bone (high) ────────────────────────
function stringColor(i: number): THREE.Color {
  const t = i / (NUM_STRINGS - 1);
  const hue = 0.085 + 0.035 * t; // orange-bronze → gold
  const sat = 0.72 - 0.42 * t; // saturated bronze → soft bone
  const light = 0.4 + 0.32 * t; // dark bronze → pale bone
  return new THREE.Color().setHSL(hue, sat, light);
}

// ════════════════════════════════════════════════════════════════════════════
// KARPLUS-STRONG physical-modelled string.
//
// A pluck excites a delay line (length = sampleRate / frequency) with a burst of
// seeded noise. Each step reads the line, feeds back a two-tap averaging lowpass
// (0.5·(cur + next)) scaled by a damping factor rho, and writes it back. The
// averaging filter is what makes a struck string decay high-partials-first into
// a warm fundamental — authentic KS. We pre-render one buffer per string once
// (deterministic, seeded) and re-trigger a BufferSource per pluck.
// ════════════════════════════════════════════════════════════════════════════
function renderKarplus(
  sampleRate: number,
  freq: number,
  seconds: number,
  rho: number,
  rng: () => number
): Float32Array {
  const total = Math.max(1, Math.floor(sampleRate * seconds));
  const n = Math.max(2, Math.round(sampleRate / freq));
  const line = new Float32Array(n);
  // Excite with a short seeded noise burst, gently shaped so the attack isn't
  // a raw click — a light one-pole smoothing of the noise.
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const white = rng() * 2 - 1;
    prev = 0.6 * white + 0.4 * prev;
    line[i] = prev;
  }
  const out = new Float32Array(total);
  let idx = 0;
  for (let i = 0; i < total; i++) {
    const cur = line[idx];
    const next = line[(idx + 1) % n];
    out[i] = cur;
    line[idx] = rho * 0.5 * (cur + next);
    idx = (idx + 1) % n;
  }
  // Normalize to a comfortable peak.
  let peak = 1e-6;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = 0.92 / peak;
  for (let i = 0; i < total; i++) out[i] *= g;
  return out;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

class LoomAudio {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  delay: DelayNode;
  fb: GainNode;
  wet: GainNode;
  buffers: AudioBuffer[] = [];
  live: Set<Voice> = new Set();

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();
    const sr = this.ctx.sampleRate;

    // Pre-render one Karplus-Strong buffer per string (seeded, deterministic).
    const rng = makeRng(0x105ec0de);
    for (let i = 0; i < NUM_STRINGS; i++) {
      const freq = stringFreq(i);
      // Higher strings decay a touch faster so the top doesn't get harsh.
      const rho = 0.9965 - (i / NUM_STRINGS) * 0.006;
      const seconds = 2.8 - (i / NUM_STRINGS) * 1.1;
      const data = renderKarplus(sr, freq, seconds, rho, rng);
      const buf = this.ctx.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      this.buffers.push(buf);
    }

    // Master chain: voices → compressor → master gain (≤ 0.14) → destination,
    // with a modest feedback-delay send for a warm loom-room ring.
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.28;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.13; // ≤ 0.14, no clipping

    this.delay = this.ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.17;
    this.fb = this.ctx.createGain();
    this.fb.gain.value = 0.3;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.12;

    this.comp.connect(this.master);
    // send a copy of the dry sum into the delay line
    this.comp.connect(this.delay);
    this.delay.connect(this.fb);
    this.fb.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  async resume() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  // Pluck string `i` with a given strength (0..1) and brightness (0..1).
  pluck(i: number, strength: number, brightness: number) {
    if (i < 0 || i >= this.buffers.length) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[i];
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value =
      600 + brightness * 3400 + (i / NUM_STRINGS) * 1600;
    filter.Q.value = 0.5;
    const gain = this.ctx.createGain();
    const amp = 0.16 + strength * 0.5;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(amp, t + 0.004);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.comp);
    const voice: Voice = { src, gain, filter };
    this.live.add(voice);
    src.onended = () => {
      try {
        gain.disconnect();
        filter.disconnect();
        src.disconnect();
      } catch {
        /* already gone */
      }
      this.live.delete(voice);
    };
    src.start(t);
  }

  close() {
    for (const v of this.live) {
      try {
        v.src.stop();
        v.src.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.live.clear();
    try {
      this.comp.disconnect();
      this.delay.disconnect();
      this.fb.disconnect();
      this.wet.disconnect();
      this.master.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

// ── Per-string visual state (drives the standing-wave wobble) ────────────────────
interface StringViz {
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
  base: THREE.Color;
  xBase: number; // world x of the column
  ys: number[]; // world y per vertex (constant)
  pluckAt: number; // performance.now() ms of last pluck (0 = never)
  amp: number; // pluck amplitude 0..1
  fvis: number; // visual wobble frequency (Hz)
  lastAudioAt: number; // debounce
}

// ── Tracked joints. For the camera these are real PoseLandmarker indices; for the
// ghost demo only the primary five are animated. weight → pluck strength; bright →
// timbre brightness (nose is light + bright, ankles are heavy + dark). ───────────
interface JointMeta {
  name: string;
  idx: number; // PoseLandmarker landmark index
  weight: number;
  bright: number;
  ghost: boolean; // animated by the ghost demo?
}
const JOINTS: JointMeta[] = [
  { name: "nose", idx: 0, weight: 0.55, bright: 1.0, ghost: true },
  { name: "L wrist", idx: 15, weight: 1.0, bright: 0.72, ghost: true },
  { name: "R wrist", idx: 16, weight: 1.0, bright: 0.72, ghost: true },
  { name: "L ankle", idx: 27, weight: 0.9, bright: 0.35, ghost: true },
  { name: "R ankle", idx: 28, weight: 0.9, bright: 0.35, ghost: true },
  { name: "L elbow", idx: 13, weight: 0.8, bright: 0.6, ghost: false },
  { name: "R elbow", idx: 14, weight: 0.8, bright: 0.6, ghost: false },
  { name: "L knee", idx: 25, weight: 0.85, bright: 0.48, ghost: false },
  { name: "R knee", idx: 26, weight: 0.85, bright: 0.48, ghost: false },
];

interface JointState {
  x: number;
  y: number;
  px: number;
  py: number;
  visible: boolean;
  mesh: THREE.Mesh;
}

type Mode = "ghost" | "camera";

export default function StringLoom() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("ghost");
  const [cameraState, setCameraState] =
    useState<"off" | "loading" | "on" | "error">("off");
  const [notice, setNotice] = useState<string>("");
  const [errorNote, setErrorNote] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  const [pluckCount, setPluckCount] = useState(0);
  const [lastNote, setLastNote] = useState<string>("—");

  const audioRef = useRef<LoomAudio | null>(null);
  const modeRef = useRef<Mode>("ghost");
  const rafRef = useRef(0);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const stringsRef = useRef<StringViz[]>([]);
  const jointsRef = useRef<JointState[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<{ close?: () => void } | null>(null);
  const reducedRef = useRef(false);
  const ghostRngRef = useRef<{ ph: number[] }>({ ph: [] });
  const pluckTallyRef = useRef(0);
  const lastNoteRef = useRef("—");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const NOTE_NAMES = ["C", "D", "E", "G", "A"]; // pentatonic degrees

  const noteLabel = useCallback((i: number) => {
    const octave = 3 + Math.floor(i / JI_PENTATONIC.length);
    const step = i % JI_PENTATONIC.length;
    return `${NOTE_NAMES[step]}${octave}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actually pluck: audio ring + visual shiver, same string index (the weld) ──
  const pluckString = useCallback(
    (i: number, strength: number, bright: number, now: number) => {
      const s = stringsRef.current[i];
      if (!s) return;
      const minGap = reducedRef.current ? 120 : 55;
      if (now - s.lastAudioAt < minGap) return;
      s.lastAudioAt = now;
      s.pluckAt = now;
      s.amp = Math.min(1, 0.35 + strength * 0.75);
      const eng = audioRef.current;
      if (eng) eng.pluck(i, strength, bright);
      pluckTallyRef.current += 1;
      lastNoteRef.current = noteLabel(i);
    },
    [noteLabel]
  );

  // ── Build the three.js scene (strings + joint markers) ──
  const buildScene = useCallback(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = mount.clientWidth || 800;
    const h = mount.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.setClearColor(0x0d0b08, 1); // warm near-black charcoal
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0d0b08, 0.05);

    const camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100);
    camera.position.set(0.7, 0.35, 8.4);
    camera.lookAt(0, 0, 0);

    // A soft warm backboard (the loom's soundboard) far behind the strings.
    const boardGeo = new THREE.PlaneGeometry(FIELD_W * 2.2, FIELD_H * 2.0);
    const boardMat = new THREE.MeshBasicMaterial({ color: 0x1a130c });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 0, -1.6);
    scene.add(board);

    // Strings.
    const strings: StringViz[] = [];
    for (let i = 0; i < NUM_STRINGS; i++) {
      const nx = stringColumn(i);
      const xb = worldX(nx);
      const positions = new Float32Array((SEG + 1) * 3);
      const ys: number[] = [];
      for (let j = 0; j <= SEG; j++) {
        const u = j / SEG;
        const ny = STRING_TOP + u * (STRING_BOT - STRING_TOP);
        const y = worldY(ny);
        ys.push(y);
        positions[j * 3] = xb;
        positions[j * 3 + 1] = y;
        positions[j * 3 + 2] = 0;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const base = stringColor(i);
      const material = new THREE.LineBasicMaterial({
        color: base.clone(),
        transparent: true,
        opacity: 0.5,
      });
      const line = new THREE.Line(geo, material);
      scene.add(line);
      // Higher strings shimmer visibly faster — reinforces see = hear.
      const fvis = Math.min(15, Math.max(4, stringFreq(i) / 42));
      strings.push({
        line,
        material,
        base,
        xBase: xb,
        ys,
        pluckAt: 0,
        amp: 0,
        fvis,
        lastAudioAt: 0,
      });
    }

    // Joint markers (glowing warm dots).
    const joints: JointState[] = [];
    for (let k = 0; k < JOINTS.length; k++) {
      const geo = new THREE.SphereGeometry(0.09, 12, 12);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe6b0,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      joints.push({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, visible: false, mesh });
    }

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    stringsRef.current = strings;
    jointsRef.current = joints;
  }, []);

  // ── Deterministic ghost body: five joints on Lissajous sweeps ──
  const stepGhost = useCallback((tSec: number) => {
    const ph = ghostRngRef.current.ph;
    const joints = jointsRef.current;
    const slow = reducedRef.current ? 0.45 : 1;
    let gi = 0;
    for (let k = 0; k < JOINTS.length; k++) {
      const meta = JOINTS[k];
      const j = joints[k];
      if (!meta.ghost) {
        j.visible = false;
        continue;
      }
      const p = ph[gi] ?? 0;
      const p2 = ph[gi + 5] ?? 0;
      let nx = 0.5;
      let ny = 0.5;
      if (meta.name === "nose") {
        nx = 0.5 + 0.16 * Math.sin(tSec * 0.5 * slow + p);
        ny = 0.22 + 0.05 * Math.sin(tSec * 0.9 * slow + p2);
      } else if (meta.name.endsWith("wrist")) {
        const dir = meta.name.startsWith("L") ? -1 : 1;
        nx = 0.5 + dir * 0.4 * Math.sin(tSec * (0.95 + gi * 0.08) * slow + p);
        ny = 0.44 + 0.12 * Math.sin(tSec * 1.4 * slow + p2);
      } else {
        // ankles
        const dir = meta.name.startsWith("L") ? -1 : 1;
        nx = 0.5 + dir * 0.34 * Math.sin(tSec * 0.62 * slow + p);
        ny = 0.78 + 0.06 * Math.sin(tSec * 0.8 * slow + p2);
      }
      j.px = j.x;
      j.py = j.y;
      j.x = Math.min(1, Math.max(0, nx));
      j.y = Math.min(1, Math.max(0, ny));
      j.visible = true;
      gi++;
    }
  }, []);

  // ── Read the current pose frame into joints (camera mode) ──
  const readPoseFrame = useCallback((pts: { x: number; y: number }[]) => {
    const joints = jointsRef.current;
    for (let k = 0; k < JOINTS.length; k++) {
      const meta = JOINTS[k];
      const j = joints[k];
      const lm = pts[meta.idx];
      if (!lm) {
        j.visible = false;
        continue;
      }
      j.px = j.x;
      j.py = j.y;
      // Mirror x so it feels like a mirror.
      j.x = Math.min(1, Math.max(0, 1 - lm.x));
      j.y = Math.min(1, Math.max(0, lm.y));
      j.visible = true;
    }
  }, []);

  // ── Detect string crossings for every visible joint and pluck ──
  const runCrossings = useCallback(
    (now: number) => {
      const joints = jointsRef.current;
      const strings = stringsRef.current;
      for (let k = 0; k < JOINTS.length; k++) {
        const meta = JOINTS[k];
        const j = joints[k];
        if (!j.visible) continue;
        const dx = j.x - j.px;
        const dy = j.y - j.py;
        const speed = Math.hypot(dx, dy);
        if (speed < 0.0025) continue; // must actually be moving
        // vertical position must fall within the strings' span
        if (j.y < STRING_TOP - 0.03 || j.y > STRING_BOT + 0.03) continue;
        for (let i = 0; i < strings.length; i++) {
          const col = stringColumn(i);
          // crossed the column line between last frame and this one?
          if ((j.px - col) * (j.x - col) <= 0 && j.px !== j.x) {
            const strength = Math.min(
              1,
              (speed / 0.05) * meta.weight
            );
            if (strength < 0.12) continue;
            const bright = Math.min(1, meta.bright * (0.6 + speed * 6));
            pluckString(i, strength, bright, now);
          }
        }
      }
    },
    [pluckString]
  );

  // ── Per-frame: update string vertices along the standing-wave envelope ──
  const drawStrings = useCallback((now: number) => {
    const strings = stringsRef.current;
    const decay = reducedRef.current ? 2.4 : 1.5; // seconds
    for (let i = 0; i < strings.length; i++) {
      const s = strings[i];
      const geo = s.line.geometry as THREE.BufferGeometry;
      const arr = (geo.attributes.position as THREE.BufferAttribute)
        .array as Float32Array;
      let env = 0;
      if (s.pluckAt > 0) {
        const dt = (now - s.pluckAt) / 1000;
        env = s.amp * Math.exp(-dt / decay);
        if (env < 0.002) {
          s.pluckAt = 0;
          s.amp = 0;
          env = 0;
        }
      }
      const dtSec = s.pluckAt > 0 ? (now - s.pluckAt) / 1000 : 0;
      const maxDisp = 0.34;
      const wob = env * maxDisp;
      const twoPiF = 2 * Math.PI * s.fvis;
      for (let jv = 0; jv <= SEG; jv++) {
        const u = jv / SEG;
        // fundamental standing wave + a soft second partial
        const shape =
          Math.sin(Math.PI * u) +
          0.3 * Math.sin(2 * Math.PI * u) * Math.sin(twoPiF * 0.5 * dtSec);
        const osc = Math.sin(twoPiF * dtSec);
        const d = wob * shape * osc;
        arr[jv * 3] = s.xBase + d; // horizontal wobble
        arr[jv * 3 + 1] = s.ys[jv];
        arr[jv * 3 + 2] = d * 0.45; // a little depth so the shiver reads in 3D
      }
      (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

      // Brighten the string briefly on pluck (smooth decay — no strobe).
      const flash = env;
      const c = s.material.color;
      c.copy(s.base);
      c.lerp(new THREE.Color(0xfff2d6), Math.min(0.85, flash * 1.6));
      s.material.opacity = 0.42 + Math.min(0.55, flash * 1.4);
    }
  }, []);

  // ── Main animation loop ──
  const runLoop = useCallback(() => {
    const tick = () => {
      const now = performance.now();
      const tSec = now / 1000;

      if (modeRef.current === "ghost") {
        stepGhost(tSec);
      }
      runCrossings(now);

      // Update joint marker meshes.
      const joints = jointsRef.current;
      for (const j of joints) {
        j.mesh.visible = j.visible;
        if (j.visible) {
          j.mesh.position.set(worldX(j.x), worldY(j.y), 0.15);
        }
      }

      drawStrings(now);

      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (renderer && scene && camera) renderer.render(scene, camera);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [drawStrings, runCrossings, stepGhost]);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new LoomAudio();
    audioRef.current.resume();
    return audioRef.current;
  }, []);

  const onStart = useCallback(() => {
    ensureAudio();
    setStarted(true);
    setMode("ghost");
    modeRef.current = "ghost";
    setNotice(
      "Ghost body demo playing — a seeded skeleton sweeps the loom on its own. Try the camera to become the bridge yourself."
    );
  }, [ensureAudio]);

  const startCamera = useCallback(async () => {
    ensureAudio();
    setStarted(true);
    setCameraState("loading");
    setErrorNote("");
    setNotice("Requesting camera + loading MediaPipe PoseLandmarker…");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
    } catch {
      setCameraState("error");
      setErrorNote(
        "Camera unavailable or permission denied — falling back to the ghost body demo, which plays the loom on its own."
      );
      setMode("ghost");
      modeRef.current = "ghost";
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play().catch(() => {});
    try {
      const cdnBase =
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
      const visionUrl = `${cdnBase}/vision_bundle.mjs`;
      const vision = await import(/* webpackIgnore: true */ visionUrl);
      const { FilesetResolver, PoseLandmarker } = vision as unknown as {
        FilesetResolver: { forVisionTasks: (p: string) => Promise<unknown> };
        PoseLandmarker: {
          createFromOptions: (f: unknown, o: unknown) => Promise<unknown>;
        };
      };
      const fileset = await FilesetResolver.forVisionTasks(`${cdnBase}/wasm`);
      const landmarker = (await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      })) as {
        detectForVideo: (
          v: HTMLVideoElement,
          t: number
        ) => { landmarks?: { x: number; y: number }[][] };
        close: () => void;
      };
      poseRef.current = { close: () => landmarker.close() };
      setMode("camera");
      modeRef.current = "camera";
      setCameraState("on");
      setErrorNote("");
      setNotice(
        "Camera live — your wrists, elbows, knees, ankles and nose are the bridge. Sweep a limb across a string to pluck it."
      );
      const detectLoop = () => {
        if (modeRef.current !== "camera" || !videoRef.current) return;
        const v = videoRef.current;
        if (v.readyState >= 2) {
          try {
            const res = landmarker.detectForVideo(v, performance.now());
            const lms = res.landmarks && res.landmarks[0];
            if (lms && lms.length >= 29) readPoseFrame(lms);
          } catch {
            /* skip frame */
          }
        }
        requestAnimationFrame(detectLoop);
      };
      requestAnimationFrame(detectLoop);
    } catch {
      setCameraState("error");
      setErrorNote(
        "MediaPipe could not load (offline?) — falling back to the ghost body demo, which plays the loom on its own."
      );
      setMode("ghost");
      modeRef.current = "ghost";
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [ensureAudio, readPoseFrame]);

  // ── HUD tally polling (avoid setState in the RAF loop) ──
  useEffect(() => {
    const iv = setInterval(() => {
      setPluckCount(pluckTallyRef.current);
      setLastNote(lastNoteRef.current);
    }, 180);
    return () => clearInterval(iv);
  }, []);

  // ── Boot: build scene, seed ghost, start loop ──
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // Seed deterministic ghost phase offsets.
    const rng = makeRng(0x57717616);
    ghostRngRef.current.ph = [];
    for (let i = 0; i < 12; i++)
      ghostRngRef.current.ph.push(rng() * Math.PI * 2);

    buildScene();

    const onResize = () => {
      const mount = mountRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (!mount || !renderer || !camera) return;
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 600;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    runLoop();

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
      try {
        poseRef.current?.close?.();
      } catch {
        /* ignore */
      }
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
      audioRef.current?.close();
      // three.js teardown
      for (const s of stringsRef.current) {
        s.line.geometry.dispose();
        s.material.dispose();
      }
      for (const j of jointsRef.current) {
        j.mesh.geometry.dispose();
        (j.mesh.material as THREE.Material).dispose();
      }
      const scene = sceneRef.current;
      if (scene) {
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const m = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else if (m) m.dispose();
        });
      }
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0d0b08] text-white">
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* 3D loom */}
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <div className="pointer-events-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            String Loom
          </h1>
          <p className="mt-2 text-base text-white/80">
            Your whole body is the bridge of a giant string instrument: every
            limb that sweeps across a hanging string plucks a real Karplus-Strong
            string you both watch shiver and hear ring.
          </p>
        </div>
      </div>

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onStart}
            className={`min-h-[44px] rounded-lg px-4 py-2.5 text-base font-medium transition ${
              started && mode === "ghost"
                ? "bg-amber-300 text-[#1a130c] shadow-lg shadow-amber-500/20"
                : "bg-amber-200/90 text-[#1a130c] hover:bg-amber-100"
            }`}
          >
            {started ? "Ghost demo playing" : "Start"}
          </button>

          <button
            onClick={startCamera}
            disabled={cameraState === "loading" || cameraState === "on"}
            className="min-h-[44px] rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-base font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-50"
          >
            {cameraState === "on"
              ? "Camera live"
              : cameraState === "loading"
              ? "Loading…"
              : "Use camera (full body)"}
          </button>

          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-lg border border-white/15 bg-transparent px-4 py-2.5 text-base text-white/75 transition hover:bg-white/10"
          >
            Read the design notes
          </button>

          <div className="ml-auto flex items-center gap-4 font-mono text-base text-white/70">
            <span>
              mode <span className="text-amber-200">{mode}</span>
            </span>
            <span>
              plucks <span className="text-amber-200">{pluckCount}</span>
            </span>
            <span>
              last <span className="text-amber-200">{lastNote}</span>
            </span>
          </div>
        </div>

        {errorNote && (
          <p className="mt-3 text-base text-rose-300">{errorNote}</p>
        )}
        {!errorNote && notice && (
          <p className="mt-3 text-base text-white/75">{notice}</p>
        )}
        {!started && (
          <p className="mt-3 text-base text-white/75">
            Press Start — the ghost body plays the loom instantly, no camera
            needed. Or use the camera to become the bridge yourself.
          </p>
        )}
      </div>

      {/* design notes */}
      {showNotes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-[85vh] max-w-lg overflow-auto rounded-xl border border-white/15 bg-[#15100a] p-6 text-base text-white/85 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <span className="text-white">The weld:</span> the string you
                watch wobble is exactly the pitch you hear. A crossing of string{" "}
                <span className="font-mono">i</span> drives both the visual
                standing-wave shiver of line <span className="font-mono">i</span>{" "}
                and a Karplus-Strong pluck of the same fixed frequency.
              </li>
              <li>
                <span className="text-white">Karplus-Strong:</span> each string
                is a delay line of length{" "}
                <span className="font-mono">sampleRate / freq</span>, excited by
                a seeded noise burst and fed back through a two-tap averaging
                lowpass — high partials decay first into a warm fundamental.
              </li>
              <li>
                <span className="text-white">Spatial tuning:</span> pitch is
                which column you cross, not a centroid → pitch reflex. Fifteen
                strings span three octaves of a just-intonation pentatonic.
                Velocity, joint and height only shape strength and brightness.
              </li>
              <li>
                <span className="text-white">Never blank, never silent:</span> a
                deterministic seeded ghost skeleton (mulberry32) sweeps five
                joints across the field and plays the loom with no camera or
                permissions — reproducible on a headless deploy.
              </li>
              <li>
                <span className="text-white">Lineage:</span> Karplus &amp; Strong
                1983 (the plucked-string algorithm); Michel Waisvisz,{" "}
                <em>The Hands</em> (1984), the body as instrument; and 2026
                &ldquo;Fluid Body&rdquo; embodied-sonification research on whole-
                body gestural control.
              </li>
            </ul>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-lg bg-amber-200 px-4 py-2.5 text-base font-medium text-[#1a130c] hover:bg-amber-100"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1630-string-loom"]} />
    </main>
  );
}
