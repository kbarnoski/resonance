"use client";

// ── Sediment ─────────────────────────────────────────────────────────────────
// "What if your body's phrasing left PERMANENT STRATA — so by minute 5 the piece
//  is a geological record of everything you did, not just what you're doing now?"
//
// INPUT  : full-body POSE (MediaPipe Pose, CDN at runtime) — torso OPENNESS +
//          arm REACH read from shoulders, wrists, nose only (laptop-webcam safe).
// OUTPUT : three.js — a growing vertical core of stacked strata bands. Each band
//          is a permanent deposit of the sonic+gestural state at its moment.
// CORE   : an ACCRETIVE, stateful ring of captured states drives BOTH a growing
//          geometry AND a granular "memory-wash" bus whose grains are sampled
//          from the ORIGINAL recording at offsets remembered at past deposits.
//          Bare at second 1; a sedimented palimpsest by minute 5.
// REF    : inverts LETHE (arXiv:2609.04289) — memory as transformation; here the
//          archive is literal, each stratum an archived state the present layers
//          over. Also Refik Anadol's data-memory / geological-strata framing.
// PALETTE: "patina" — verdigris → bronze → cool slate on a near-black field.

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Link from "next/link";
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
  type Landmark,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── Tunables ─────────────────────────────────────────────────────────────────
const STRATA_CAP = 320; // merge the two oldest beyond this (never forget shape)
const DEPOSIT_INTERVAL = 3.6; // seconds between cadence deposits
const PEAK_COOLDOWN = 1.4; // min seconds between gesture-peak deposits
const PEAK_RISE = 0.2; // openness jump above slow baseline that counts as a peak
const GRAIN_INTERVAL = 0.11; // seconds between memory-wash grain cycles
const AGE_SPAN = 72; // strata this far below the top are fully oxidized to slate

// Patina palette (lives inside the art only).
const C_VERDIGRIS = new THREE.Color(0x3f9e82);
const C_BRONZE = new THREE.Color(0xb27a3a);
const C_SLATE = new THREE.Color(0x3a4452);
const C_BG = new THREE.Color(0x070809);

type Mode = "idle" | "live" | "demo";
type Track = (typeof REAL_TRACKS)[number];

interface Stratum {
  openness: number; // 0..1 torso openness + arm reach at deposit
  reach: number; // 0..1 arm reach at deposit
  rise: number; // 0..1 torso lift at deposit
  level: number; // 0..1 audio RMS at deposit
  bright: number; // 0..1 spectral brightness at deposit
  thickness: number; // band height in world units
  radius: number; // band radius in world units
  seed: number; // deterministic edge jitter
  peak: boolean; // deposited on a gesture peak (thicker / brighter)
  srcOffset: number; // playback offset into the ORIGINAL buffer (−1 = pre-audio)
  base: THREE.Color; // fresh color before oxidation
}

interface Feature {
  openness: number;
  reach: number;
  rise: number;
}

// Mutable per-mount engine (kept off React state to avoid re-renders).
interface Engine {
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  topLight: THREE.PointLight;
  strata: Stratum[];
  bands: THREE.Mesh[];
  topY: number;
  camY: number;
  orbit: number;
  // audio
  ctx: AudioContext | null;
  master: SafeMaster | null;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  liveGain: GainNode | null;
  liveFilter: BiquadFilterNode | null;
  washGain: GainNode | null;
  playStart: number; // ctx time the live source began
  timeBuf: Uint8Array<ArrayBuffer>;
  freqBuf: Uint8Array<ArrayBuffer>;
  // features / timing
  feat: Feature;
  baselineSlow: number; // slow EMA of openness (peak reference)
  clock: number; // performance.now()/1000 at last frame
  lastDeposit: number;
  lastPeak: number;
  grainAccum: number;
  // camera tracking
  video: HTMLVideoElement | null;
  stream: MediaStream | null;
  pose: PoseLandmarkerInst | null;
  lastPose: number; // clock of last good pose
  lastLm: Landmark[] | null;
  // pointer conducting (demo bonus)
  pointer: { x: number; y: number; at: number } | null;
  raf: number;
}

// ── helpers (never named use*) ─────────────────────────────────────────────────
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Fresh patina color for a deposit: calm → verdigris, expansive → warm bronze,
// with brightness lifting the value a touch.
function freshColor(openness: number, bright: number): THREE.Color {
  const c = C_VERDIGRIS.clone().lerp(C_BRONZE, clamp01(openness));
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, clamp01(hsl.l + bright * 0.12));
  return c;
}

// Pose landmarks → torso openness + arm reach + lift. Gated ONLY on shoulders +
// nose; missing wrists are synthesized from the last reading so a dropped frame
// never rejects the whole pose. Returns null only when the upper body is gone.
function poseFeatures(
  lm: Landmark[],
  prev: Landmark[] | null,
): { feat: Feature; lm: Landmark[] } | null {
  const vis = (i: number) => lm[i] && (lm[i].visibility ?? 1) > 0.5;
  const Ls = lm[POSE_LM.leftShoulder];
  const Rs = lm[POSE_LM.rightShoulder];
  const N = lm[POSE_LM.nose];
  if (!vis(POSE_LM.leftShoulder) || !vis(POSE_LM.rightShoulder) || !vis(POSE_LM.nose))
    return null;

  const sw = Math.max(0.06, Math.hypot(Ls.x - Rs.x, Ls.y - Rs.y));
  const cx = (Ls.x + Rs.x) / 2;
  const sy = (Ls.y + Rs.y) / 2;

  // Synthesize a dropped wrist from the previous frame (upper-body only).
  const wrist = (idx: number): Landmark => {
    if (vis(idx)) return lm[idx];
    if (prev && prev[idx]) return prev[idx];
    return lm[idx === POSE_LM.leftWrist ? POSE_LM.leftElbow : POSE_LM.rightElbow] ?? Ls;
  };
  const Lw = wrist(POSE_LM.leftWrist);
  const Rw = wrist(POSE_LM.rightWrist);

  // Horizontal wrist span, shoulder-normalized (expansiveness).
  const span = Math.abs(Lw.x - Rw.x) / sw;
  // Arm elevation: how far above the shoulder line the wrists reach.
  const elevL = (sy - Lw.y) / sw;
  const elevR = (sy - Rw.y) / sw;
  const elev = (elevL + elevR) / 2;
  // Reach: radial distance of each wrist from torso center.
  const reachL = Math.hypot((Lw.x - cx) / sw, (sy - Lw.y) / sw);
  const reachR = Math.hypot((Rw.x - cx) / sw, (sy - Rw.y) / sw);
  const reach = clamp01(((reachL + reachR) / 2 - 1.1) / (3.2 - 1.1));

  const openness = clamp01(
    0.55 * clamp01((span - 1.1) / (3.3 - 1.1)) +
      0.45 * clamp01((elev + 0.4) / 1.8),
  );
  // Torso lift: nose height above the shoulder line.
  const rise = clamp01(((sy - N.y) / sw - 0.4) / 1.2);

  return { feat: { openness, reach, rise }, lm };
}

// Autonomous demo features — a slow breathing expansion with periodic swells,
// optionally conducted by the pointer. Deliberately rhythmic so it never reads
// as a live person; the camera also orbits in demo (see loop).
function demoFeatures(t: number, pointer: Engine["pointer"]): Feature {
  let openness = 0.46 + 0.3 * Math.sin(t * 0.17) + 0.14 * Math.sin(t * 0.63 + 1.1);
  // Occasional deliberate swell (gesture peak) every ~11s.
  const swell = Math.max(0, Math.sin(t * 0.57)) ** 8;
  openness += swell * 0.42;
  let reach = 0.4 + 0.33 * Math.abs(Math.sin(t * 0.12 + 0.6));
  let rise = 0.45 + 0.25 * Math.sin(t * 0.09 + 2.0);

  // Pointer nudge: moving the mouse over the stage conducts the demo.
  if (pointer && t - pointer.at < 1.5) {
    openness = openness * 0.3 + clamp01(1 - pointer.y) * 0.7;
    reach = reach * 0.3 + clamp01(Math.abs(pointer.x - 0.5) * 2) * 0.7;
    rise = rise * 0.4 + clamp01(1 - pointer.y) * 0.6;
  }
  return { openness: clamp01(openness), reach: clamp01(reach), rise: clamp01(rise) };
}

// Build one strata band mesh — a low-poly core slice with a rough mineral edge.
function makeBand(s: Stratum): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(s.radius, s.radius, s.thickness, 26, 1);
  const rnd = mulberry32(Math.floor(s.seed * 1e6) + 7);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 1e-3) {
      // Push the rim in/out — rougher when the body was more open.
      const j = 1 + (rnd() - 0.5) * (0.12 + s.openness * 0.22);
      pos.setX(i, (x / r) * r * j);
      pos.setZ(i, (z / r) * r * j);
    }
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: s.base.clone(),
    roughness: 0.82,
    metalness: 0.28,
    flatShading: true,
    emissive: s.base.clone(),
    emissiveIntensity: 0.05,
  });
  return new THREE.Mesh(geo, mat);
}

export default function SedimentPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const { immersive, toggle } = useImmersive();

  const [mode, setMode] = useState<Mode>("idle");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [tracking, setTracking] = useState(false); // live pose currently resolved
  const [readout, setReadout] = useState({ elapsed: 0, count: 0, open: 0 });
  const startWallRef = useRef(0);

  // ── Deposit: capture the CURRENT state as a permanent stratum ───────────────
  const deposit = useCallback((peak: boolean) => {
    const e = engineRef.current;
    if (!e) return;
    const f = e.feat;

    let level = 0;
    let bright = 0;
    if (e.master) {
      const a = e.master.analyser;
      a.getByteTimeDomainData(e.timeBuf);
      let sum = 0;
      for (let i = 0; i < e.timeBuf.length; i++) {
        const v = (e.timeBuf[i] - 128) / 128;
        sum += v * v;
      }
      level = clamp01(Math.sqrt(sum / e.timeBuf.length) * 3.2);
      a.getByteFrequencyData(e.freqBuf);
      let num = 0;
      let den = 0;
      for (let i = 0; i < e.freqBuf.length; i++) {
        num += i * e.freqBuf[i];
        den += e.freqBuf[i];
      }
      bright = den > 0 ? clamp01(num / den / (e.freqBuf.length * 0.45)) : 0;
    } else {
      // Pre-audio demo: synthesize plausible energy from the gesture itself.
      level = 0.25 + f.openness * 0.4;
      bright = 0.2 + f.reach * 0.5;
    }

    const srcOffset =
      e.ctx && e.buffer
        ? ((e.ctx.currentTime - e.playStart) % e.buffer.duration + e.buffer.duration) %
          e.buffer.duration
        : -1;

    const thickness =
      (peak ? 1.5 : 0.6) + f.openness * (peak ? 1.6 : 1.0) + level * 0.5;
    const radius = 4.4 + f.reach * 2.6 + (peak ? 0.6 : 0);

    const s: Stratum = {
      openness: f.openness,
      reach: f.reach,
      rise: f.rise,
      level,
      bright,
      thickness,
      radius,
      seed: Math.random(),
      peak,
      srcOffset,
      base: freshColor(f.openness, bright),
    };

    e.strata.push(s);
    if (e.renderer) {
      const mesh = makeBand(s);
      e.group.add(mesh);
      e.bands.push(mesh);
    } else {
      e.bands.push(null as unknown as THREE.Mesh); // keep arrays aligned in 2D mode
    }

    // Compaction: merge the two OLDEST into one (preserve total height = shape).
    if (e.strata.length > STRATA_CAP) {
      const a0 = e.strata[0];
      const a1 = e.strata[1];
      const merged: Stratum = {
        openness: (a0.openness + a1.openness) / 2,
        reach: (a0.reach + a1.reach) / 2,
        rise: (a0.rise + a1.rise) / 2,
        level: (a0.level + a1.level) / 2,
        bright: (a0.bright + a1.bright) / 2,
        thickness: a0.thickness + a1.thickness, // never forget the shape
        radius: (a0.radius + a1.radius) / 2,
        seed: a0.seed,
        peak: a0.peak || a1.peak,
        srcOffset: a0.srcOffset >= 0 ? a0.srcOffset : a1.srcOffset,
        base: a0.base.clone().lerp(a1.base, 0.5),
      };
      e.strata.splice(0, 2, merged);
      if (e.renderer) {
        for (const m of [e.bands[0], e.bands[1]]) {
          if (m) {
            e.group.remove(m);
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        }
        const mm = makeBand(merged);
        e.group.add(mm);
        e.bands.splice(0, 2, mm);
      } else {
        e.bands.splice(0, 2, null as unknown as THREE.Mesh);
      }
    }

    layoutColumn(e);
  }, []);

  // ── Layout: restack bottom-up, recolor by age (deep strata oxidize to slate) ─
  function layoutColumn(e: Engine) {
    let cum = 0;
    const n = e.strata.length;
    for (let i = 0; i < n; i++) {
      const s = e.strata[i];
      const y = cum + s.thickness / 2;
      cum += s.thickness;
      const age = (n - 1 - i) / AGE_SPAN;
      const col = s.base.clone().lerp(C_SLATE, clamp01(age) * 0.86);
      const m = e.bands[i];
      if (m) {
        m.position.y = y;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.color.copy(col);
        mat.emissive.copy(col);
        mat.emissiveIntensity = i >= n - 1 ? 0.3 : 0.04;
      }
    }
    e.topY = cum;
  }

  // ── Mount: build the scene (or 2D fallback) and run the loop + demo deposits ─
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const scene = new THREE.Scene();
    scene.background = C_BG;
    scene.fog = new THREE.FogExp2(C_BG.getHex(), 0.012);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
    camera.position.set(0, 6, 30);

    const group = new THREE.Group();
    scene.add(group);

    scene.add(new THREE.AmbientLight(0x30363c, 1.1));
    const key = new THREE.DirectionalLight(0xcfd6dc, 0.9);
    key.position.set(8, 20, 14);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x24506b, 0.5);
    rim.position.set(-12, 4, -10);
    scene.add(rim);
    const topLight = new THREE.PointLight(0xffb867, 1.4, 60, 2);
    topLight.position.set(0, 6, 6);
    scene.add(topLight);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(stage.clientWidth, stage.clientHeight);
      stage.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
    } catch {
      renderer = null;
      setWebgl(false);
    }

    const e: Engine = {
      renderer,
      scene,
      camera,
      group,
      topLight,
      strata: [],
      bands: [],
      topY: 0,
      camY: 6,
      orbit: 0,
      ctx: null,
      master: null,
      buffer: null,
      source: null,
      liveGain: null,
      liveFilter: null,
      washGain: null,
      playStart: 0,
      timeBuf: new Uint8Array(new ArrayBuffer(1024)),
      freqBuf: new Uint8Array(new ArrayBuffer(512)),
      feat: { openness: 0.3, reach: 0.3, rise: 0.4 },
      baselineSlow: 0.3,
      clock: performance.now() / 1000,
      lastDeposit: performance.now() / 1000,
      lastPeak: 0,
      grainAccum: 0,
      video: null,
      stream: null,
      pose: null,
      lastPose: -10,
      lastLm: null,
      pointer: null,
      raf: 0,
    };
    engineRef.current = e;

    const resize = () => {
      if (!stageRef.current) return;
      const w = stageRef.current.clientWidth;
      const h = stageRef.current.clientHeight;
      e.camera.aspect = w / Math.max(1, h);
      e.camera.updateProjectionMatrix();
      if (e.renderer) e.renderer.setSize(w, h);
      const c2 = canvas2dRef.current;
      if (c2) {
        c2.width = w;
        c2.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // 2D fallback painter (no WebGL): stacked bands, top = freshest.
    const draw2d = () => {
      const c2 = canvas2dRef.current;
      if (!c2) return;
      const g = c2.getContext("2d");
      if (!g) return;
      const w = c2.width;
      const h = c2.height;
      g.fillStyle = "#070809";
      g.fillRect(0, 0, w, h);
      const n = e.strata.length;
      const total = Math.max(1, e.topY);
      const vis = Math.min(total, 90); // show the top ~90 units
      const px = h / vis;
      let yTop = h;
      let cum = 0;
      for (let i = n - 1; i >= 0; i--) {
        const s = e.strata[i];
        const bh = s.thickness * px;
        const age = (n - 1 - i) / AGE_SPAN;
        const col = s.base.clone().lerp(C_SLATE, clamp01(age) * 0.86);
        g.fillStyle = `#${col.getHexString()}`;
        const bw = (s.radius / 7.6) * w * 0.9;
        g.fillRect((w - bw) / 2, yTop - bh, bw, Math.max(1, bh - 1));
        yTop -= bh;
        cum += s.thickness;
        if (cum > vis) break;
      }
    };

    const frame = () => {
      e.raf = requestAnimationFrame(frame);
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - e.clock);
      e.clock = now;

      // ── feature source: live pose > demo (pointer-conducted) ──────────────
      let gotLive = false;
      if (e.pose && e.video && e.video.readyState >= 2) {
        try {
          const res = e.pose.detectForVideo(e.video, now * 1000);
          const lms = res.landmarks && res.landmarks[0];
          if (lms) {
            const pf = poseFeatures(lms, e.lastLm);
            if (pf) {
              e.lastLm = pf.lm;
              e.lastPose = now;
              // smooth toward the live reading
              e.feat.openness += (pf.feat.openness - e.feat.openness) * 0.2;
              e.feat.reach += (pf.feat.reach - e.feat.reach) * 0.2;
              e.feat.rise += (pf.feat.rise - e.feat.rise) * 0.2;
              gotLive = true;
            }
          }
        } catch {
          /* detection hiccup — keep last features */
        }
        if (!gotLive && now - e.lastPose > 0.6) {
          // Lost: ease toward a calm neutral so the piece stays alive.
          e.feat.openness += (0.28 - e.feat.openness) * 0.03;
          e.feat.reach += (0.28 - e.feat.reach) * 0.03;
        }
        setTrackingThrottled(gotLive);
      } else {
        // demo / pre-audio: autonomous driver
        const df = demoFeatures(now, e.pointer);
        e.feat.openness += (df.openness - e.feat.openness) * 0.08;
        e.feat.reach += (df.reach - e.feat.reach) * 0.08;
        e.feat.rise += (df.rise - e.feat.rise) * 0.08;
      }

      // slow baseline for peak detection
      e.baselineSlow += (e.feat.openness - e.baselineSlow) * 0.01;

      // ── audio control path (setTargetAtTime, 0.1–0.15) ────────────────────
      if (e.ctx && e.liveFilter && e.liveGain && e.washGain) {
        const t = e.ctx.currentTime;
        const cut = 650 + e.feat.openness * 6600;
        e.liveFilter.frequency.setTargetAtTime(cut, t, 0.12);
        e.liveGain.gain.setTargetAtTime(0.6 + e.feat.openness * 0.28, t, 0.12);
        // Memory-wash thickens with the strata count; always under the take.
        const density = clamp01(e.strata.length / 90);
        const wash = density * (0.09 + e.feat.reach * 0.12);
        e.washGain.gain.setTargetAtTime(wash, t, 0.15);
      }

      // ── deposition: cadence + gesture peak ────────────────────────────────
      if (now - e.lastDeposit > DEPOSIT_INTERVAL) {
        e.lastDeposit = now;
        deposit(false);
      }
      if (
        e.feat.openness - e.baselineSlow > PEAK_RISE &&
        e.feat.openness > 0.55 &&
        now - e.lastPeak > PEAK_COOLDOWN
      ) {
        e.lastPeak = now;
        e.lastDeposit = now; // a peak resets the cadence clock
        deposit(true);
      }

      // ── granular memory-wash grains from remembered offsets ───────────────
      if (e.ctx && e.buffer && e.master && e.washGain) {
        e.grainAccum += dt;
        while (e.grainAccum > GRAIN_INTERVAL) {
          e.grainAccum -= GRAIN_INTERVAL;
          scheduleGrain(e);
        }
      }

      // ── camera: rise through the column (always frame the growing top) ────
      const targetY = Math.max(e.topY * 0.5, e.topY - 7);
      e.camY += (targetY - e.camY) * 0.03;
      const demoMode = !gotLive && !e.pose; // autonomous = gentle orbit
      e.orbit += dt * (demoMode ? 0.12 : 0.03);
      const dist = 30 + e.feat.reach * 6;
      e.camera.position.set(
        Math.sin(e.orbit) * dist,
        e.camY + 4,
        Math.cos(e.orbit) * dist,
      );
      e.camera.lookAt(0, e.camY, 0);
      e.group.rotation.y += dt * 0.04;
      e.topLight.position.set(0, e.topY - 1, 6);
      e.topLight.intensity = 1.0 + e.feat.openness * 1.6;

      // top-band live glow from the analyser
      if (e.bands.length && e.master) {
        e.master.analyser.getByteTimeDomainData(e.timeBuf);
        let sum = 0;
        for (let i = 0; i < e.timeBuf.length; i++) {
          const v = (e.timeBuf[i] - 128) / 128;
          sum += v * v;
        }
        const lvl = clamp01(Math.sqrt(sum / e.timeBuf.length) * 3.2);
        const top = e.bands[e.bands.length - 1];
        if (top) {
          (top.material as THREE.MeshStandardMaterial).emissiveIntensity =
            0.2 + lvl * 0.9;
        }
      }

      if (e.renderer) e.renderer.render(e.scene, e.camera);
      else draw2d();
    };
    e.raf = requestAnimationFrame(frame);

    // Seed a couple of bands immediately so load state already reads as "alive".
    deposit(false);
    deposit(false);

    const readoutTimer = window.setInterval(() => {
      const en = engineRef.current;
      if (!en) return;
      const elapsed = startWallRef.current
        ? performance.now() / 1000 - startWallRef.current
        : 0;
      setReadout({ elapsed, count: en.strata.length, open: en.feat.openness });
    }, 400);

    return () => {
      window.removeEventListener("resize", resize);
      window.clearInterval(readoutTimer);
      const en = engineRef.current;
      if (en) {
        cancelAnimationFrame(en.raf);
        try {
          en.source?.stop();
        } catch {
          /* already stopped */
        }
        en.stream?.getTracks().forEach((t) => t.stop());
        try {
          en.pose?.close();
        } catch {
          /* ignore */
        }
        en.master?.disconnect();
        en.ctx?.close().catch(() => {});
        for (const m of en.bands) {
          if (m) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        }
        if (en.renderer) {
          en.renderer.dispose();
          en.renderer.domElement.remove();
        }
      }
      engineRef.current = null;
    };
    // deposit/layoutColumn are stable (useCallback / module-ish); run once on mount.
  }, [deposit]);

  // Throttle tracking-state writes so we don't thrash React each frame.
  const trackingRef = useRef(false);
  function setTrackingThrottled(v: boolean) {
    if (trackingRef.current !== v) {
      trackingRef.current = v;
      setTracking(v);
    }
  }

  // ── one memory-wash grain: a Hann-windowed slice of the ORIGINAL buffer at a
  //    remembered deposit offset, panned, summed under the live take ───────────
  function scheduleGrain(e: Engine) {
    if (!e.ctx || !e.buffer || !e.washGain) return;
    const withOffset = e.strata.filter((s) => s.srcOffset >= 0);
    if (withOffset.length === 0) return;
    // Weight toward OLDER memories so the bed reads as a palimpsest.
    const r = Math.random();
    const idx = Math.floor(r * r * withOffset.length);
    const s = withOffset[Math.min(withOffset.length - 1, idx)];

    const dur = 0.28 + Math.random() * 0.34;
    const src = e.ctx.createBufferSource();
    src.buffer = e.buffer;
    src.playbackRate.value = 0.985 + Math.random() * 0.03;

    const g = e.ctx.createGain();
    const now = e.ctx.currentTime;
    const peak = 0.5 + s.level * 0.5;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + dur / 2); // Hann-ish triangle
    g.gain.linearRampToValueAtTime(0.0001, now + dur);

    const pan = e.ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.4;

    src.connect(g);
    g.connect(pan);
    pan.connect(e.washGain);

    const off = Math.min(e.buffer.duration - dur - 0.01, Math.max(0, s.srcOffset));
    try {
      src.start(now, off, dur);
    } catch {
      /* out-of-range offset — skip this grain */
    }
    src.stop(now + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      pan.disconnect();
    };
  }

  // ── begin: start audio (required gesture), optionally request the camera ─────
  const begin = useCallback(
    async (wantCamera: boolean) => {
      const e = engineRef.current;
      if (!e || loading) return;
      setError(null);
      setNotice(null);
      setLoading(true);
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctor();
        await ctx.resume();
        const master = createSafeMaster(ctx);

        const { buffer } = await loadRealTrackBuffer(ctx, trackId);

        // live take: source → openness-driven lowpass → gain → master
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const liveFilter = ctx.createBiquadFilter();
        liveFilter.type = "lowpass";
        liveFilter.frequency.value = 900;
        liveFilter.Q.value = 0.6;
        const liveGain = ctx.createGain();
        liveGain.gain.value = 0.6;
        // memory-wash bus: grains → wash gain → master
        const washGain = ctx.createGain();
        washGain.gain.value = 0;

        source.connect(liveFilter);
        liveFilter.connect(liveGain);
        liveGain.connect(master.input);
        washGain.connect(master.input);

        source.start();
        e.ctx = ctx;
        e.master = master;
        e.buffer = buffer;
        e.source = source;
        e.liveFilter = liveFilter;
        e.liveGain = liveGain;
        e.washGain = washGain;
        e.playStart = ctx.currentTime;

        startWallRef.current = performance.now() / 1000;

        if (wantCamera) {
          try {
            const video = document.createElement("video");
            video.muted = true;
            video.playsInline = true;
            const stream = await startCamera(video);
            const pose = await createPoseTracker(1);
            e.video = video;
            e.stream = stream;
            e.pose = pose;
            setMode("live");
          } catch {
            setNotice(
              "Camera or pose model unavailable — running the autonomous demo drive.",
            );
            setMode("demo");
          }
        } else {
          setMode("demo");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not start audio: ${err.message}`
            : "Could not start audio.",
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, trackId],
  );

  // pointer conducting over the stage (demo bonus)
  const onPointer = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    const e = engineRef.current;
    if (!e) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    e.pointer = {
      x: (ev.clientX - rect.left) / rect.width,
      y: (ev.clientY - rect.top) / rect.height,
      at: performance.now() / 1000,
    };
  }, []);

  const running = mode !== "idle";
  const showChrome = !immersive;

  return (
    <div
      ref={containerRef}
      className="relative h-dvh w-full overflow-hidden bg-background text-foreground"
    >
      {/* ── viewport-filling stage ── */}
      <div
        ref={stageRef}
        onPointerMove={onPointer}
        className="absolute inset-0"
        aria-hidden
      >
        {!webgl && (
          <canvas ref={canvas2dRef} className="absolute inset-0 h-full w-full" />
        )}
      </div>

      {/* ── status line (always relevant once running) ── */}
      {running && (
        <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs">
          {mode === "live" ? (
            tracking ? (
              <span className="text-muted-foreground">tracking · live</span>
            ) : (
              <span className="text-destructive">
                lost · open up — shoulders &amp; hands in frame
              </span>
            )
          ) : (
            <span className="text-muted-foreground">demo · autonomous</span>
          )}
          <span className="ml-3 text-muted-foreground/70">
            {fmtTime(readout.elapsed)} · {readout.count} strata
          </span>
        </div>
      )}

      {/* ── functional notices (kept even in immersive) ── */}
      {notice && running && (
        <div className="pointer-events-none absolute right-4 top-4 z-30 max-w-xs rounded-md border border-border bg-background/70 px-3 py-2 font-mono text-xs text-muted-foreground backdrop-blur-sm">
          {notice}
        </div>
      )}
      {!webgl && (
        <div className="pointer-events-none absolute bottom-20 left-4 z-30 max-w-sm rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground backdrop-blur-sm">
          WebGL is unavailable here — showing a flat 2D core of the same
          accreting strata. Audio still plays.
        </div>
      )}

      {/* ── idle overlay: title, description, track selector, begin ── */}
      {showChrome && !running && (
        <div className="absolute inset-0 z-20 flex items-end sm:items-center">
          <div className="w-full max-w-xl p-6 sm:p-10">
            <div className="rounded-xl border border-border bg-background/70 p-6 backdrop-blur-md">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
                dream lab · memory piece
              </p>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                Sediment
              </h1>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Your body conducts one of Karel&apos;s piano recordings — and
                every few seconds the current sonic and gestural state is
                deposited as a permanent horizontal stratum. The strata never
                dissolve; they stack into a growing core you rise through. By
                minute five the piece is a geological record of everything you
                did, not just what you&apos;re doing now.
              </p>

              {error && (
                <p className="mt-4 text-sm text-destructive">{error}</p>
              )}

              <label className="mt-5 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
                recording
              </label>
              <select
                value={trackId}
                onChange={(ev) => setTrackId(ev.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
              >
                {COLLECTIONS.map((c) => (
                  <optgroup key={c.name} label={c.name}>
                    {c.tracks.map((t: Track) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => begin(true)}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? "Starting…" : "Begin with camera"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => begin(false)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  Watch the demo
                </button>
              </div>

              <p className="mt-4 font-mono text-xs leading-relaxed text-muted-foreground/70">
                Open your torso and reach wide to deposit thicker, brighter
                bands. No webcam needed — the demo conducts itself, and the
                column is already accreting behind this panel.
              </p>

              <div className="mt-5 flex items-center gap-4">
                <Link
                  href="/dream"
                  className="font-mono text-xs text-muted-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
                >
                  ← dream lab
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── fullscreen toggle + info overlay (non-immersive button positioned here) ── */}
      <div className="absolute bottom-4 right-4 z-40">
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Sediment"
          description="A memory piece. Your body's openness and reach conduct one of Karel's piano recordings, and every few seconds the current state is deposited as a permanent stratum in a growing core you rise through. A granular memory-wash bus replays grains from the recording sampled at past deposits, so the ambient bed thickens into a palimpsest of your earlier gestures."
          howTo={[
            "Allow the camera, or watch the autonomous demo.",
            "Open your torso and spread your arms to deposit thicker, brighter bands.",
            "Big opening gestures punch in an extra peak stratum.",
            "Stay with it — the core, and its memory-wash, keep growing past minute five.",
          ]}
        />
      </div>
    </div>
  );
}
