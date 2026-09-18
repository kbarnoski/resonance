"use client";

// ── BODYCAST ──────────────────────────────────────────────────────────────────
// "What if your whole body became the spatial mixing stage for one of Karel's
//  solo piano takes — where each register (bass / low-mid / high-mid / treble)
//  casts a visible BEAM OF LIGHT from a part of your body out into the room, and
//  you physically sculpt WHERE his music comes from by reaching, spreading and
//  lifting?"
//
// INPUT  : webcam full-body pose (MediaPipe Pose, loaded from CDN at runtime).
// OUTPUT : three.js — a luminous line-figure that casts four volumetric,
//          additively-blended stage-light beams (one per register).
// CORE   : ONE looping AudioBufferSource of Karel's real take is split into four
//          register voices; each voice gets its own HRTF PannerNode positioned in
//          3D by a body region. The body IS the spatial mixing console.
// VIBE   : warm, architectural, calm — theatrical stage lighting made of sound.

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";
import { loadRealTrackBuffer, REAL_TRACKS } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ── Register voices ───────────────────────────────────────────────────────────
// Four parallel bands off the single source. `lat` is the signed lateral factor
// (magnitude rises with frequency so treble fans farthest out, bass hugs centre).
// `side` chooses which wrist lifts/swells it. `anchor` is the body joint the beam
// is cast FROM. `displayScale` compensates the quieter high bands for the visual
// level read only (it never touches the audio gain).
type Anchor = "hipMid" | "lwrist" | "rwrist" | "nose";
interface VoiceDef {
  key: string;
  label: string;
  filter: "lowpass" | "bandpass" | "highpass";
  freq: number;
  q: number;
  lat: number;
  side: "left" | "right";
  anchor: Anchor;
  baseGain: number;
  displayScale: number;
  color: number;
}

const VOICES: readonly VoiceDef[] = [
  {
    key: "low",
    label: "bass",
    filter: "lowpass",
    freq: 180,
    q: 0.7,
    lat: -0.32,
    side: "left",
    anchor: "hipMid",
    baseGain: 0.85,
    displayScale: 1.6,
    color: 0xff9a3c,
  },
  {
    key: "lowmid",
    label: "low-mid",
    filter: "bandpass",
    freq: 380,
    q: 1,
    lat: -0.9,
    side: "left",
    anchor: "lwrist",
    baseGain: 1.0,
    displayScale: 2.3,
    color: 0xffb85a,
  },
  {
    key: "highmid",
    label: "high-mid",
    filter: "bandpass",
    freq: 1100,
    q: 1,
    lat: 0.9,
    side: "right",
    anchor: "rwrist",
    baseGain: 1.25,
    displayScale: 3.2,
    color: 0xffcf7a,
  },
  {
    key: "high",
    label: "treble",
    filter: "highpass",
    freq: 2200,
    q: 0.7,
    lat: 1.5,
    side: "right",
    anchor: "nose",
    baseGain: 1.6,
    displayScale: 4.6,
    color: 0xffe9b8,
  },
] as const;

const DEFAULT_TRACK_ID = "eba95845-cdbf-41d8-9c5d-8679686811ad"; // Welcome Home — "Bath"

// ── Pose model ────────────────────────────────────────────────────────────────
// The 9 landmarks we read, already mirrored (mx = 1 - x) so it reads like a
// mirror. y stays 0 (top) … 1 (bottom); z is MediaPipe depth.
type Pt = { x: number; y: number; z: number; v: number };
interface PoseData {
  pts: Record<number, Pt>;
  feat: {
    armSpan: number; // 0 (arms in) … 1 (wide)
    leftH: number; // left wrist height 0 (down) … 1 (up)
    rightH: number; // right wrist height 0 … 1
    lean: number; // torso lean, -1 … 1
    presence: number; // body size / nearness 0 … 1
  };
}

const USED_LM = [
  POSE_LM.nose,
  POSE_LM.leftShoulder,
  POSE_LM.rightShoulder,
  POSE_LM.leftElbow,
  POSE_LM.rightElbow,
  POSE_LM.leftWrist,
  POSE_LM.rightWrist,
  POSE_LM.leftHip,
  POSE_LM.rightHip,
] as const;

// Bones drawn as the luminous line-figure (index pairs into `pts`).
const BONES: ReadonlyArray<readonly [number, number]> = [
  [POSE_LM.leftShoulder, POSE_LM.rightShoulder],
  [POSE_LM.leftShoulder, POSE_LM.leftElbow],
  [POSE_LM.leftElbow, POSE_LM.leftWrist],
  [POSE_LM.rightShoulder, POSE_LM.rightElbow],
  [POSE_LM.rightElbow, POSE_LM.rightWrist],
  [POSE_LM.leftShoulder, POSE_LM.leftHip],
  [POSE_LM.rightShoulder, POSE_LM.rightHip],
  [POSE_LM.leftHip, POSE_LM.rightHip],
  [POSE_LM.nose, POSE_LM.leftShoulder],
  [POSE_LM.nose, POSE_LM.rightShoulder],
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampS(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

function computeFeat(pts: Record<number, Pt>): PoseData["feat"] {
  const lw = pts[POSE_LM.leftWrist];
  const rw = pts[POSE_LM.rightWrist];
  const ls = pts[POSE_LM.leftShoulder];
  const rs = pts[POSE_LM.rightShoulder];
  const lh = pts[POSE_LM.leftHip];
  const rh = pts[POSE_LM.rightHip];
  const armSpan = clamp01(Math.hypot(lw.x - rw.x, lw.y - rw.y) / 0.72);
  const leftH = clamp01((0.85 - lw.y) / 0.7);
  const rightH = clamp01((0.85 - rw.y) / 0.7);
  const shoulderMidX = (ls.x + rs.x) / 2;
  const hipMidX = (lh.x + rh.x) / 2;
  const lean = clampS((shoulderMidX - hipMidX) * 3.2);
  const sw = Math.abs(ls.x - rs.x);
  const presence = clamp01((sw - 0.12) / 0.26);
  return { armSpan, leftH, rightH, lean, presence };
}

// Live landmarks → mirrored PoseData, or null when the core body isn't visible.
function readPose(lms: Landmark[]): PoseData | null {
  if (!lms || lms.length <= POSE_LM.rightHip) return null;
  const core = [
    POSE_LM.leftShoulder,
    POSE_LM.rightShoulder,
    POSE_LM.leftHip,
    POSE_LM.rightHip,
  ];
  for (const i of core) {
    if ((lms[i]?.visibility ?? 0) < 0.3) return null;
  }
  const pts: Record<number, Pt> = {};
  for (const i of USED_LM) {
    const l = lms[i];
    pts[i] = {
      x: 1 - l.x,
      y: l.y,
      z: l.z ?? 0,
      v: l.visibility ?? 1,
    };
  }
  return { pts, feat: computeFeat(pts) };
}

// Autonomous "ghost body" — a slow procedural sway so the piece looks alive on a
// muted phone glance. Returns the same mirrored PoseData shape.
function makeDemoPose(t: number): PoseData {
  const lean = Math.sin(t * 0.17) * 0.05;
  const breathe = Math.sin(t * 0.8) * 0.008;
  const spread = 0.16 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.31));
  const liftL = 0.5 + 0.42 * Math.sin(t * 0.23);
  const liftR = 0.5 + 0.42 * Math.sin(t * 0.23 + 2.1);
  const cx = 0.5 + lean;
  const shY = 0.4 + breathe;
  const hipY = 0.68;
  const mk = (x: number, y: number, z = 0): Pt => ({ x, y, z, v: 1 });
  const lwX = cx - 0.14 - spread;
  const rwX = cx + 0.14 + spread;
  const pts: Record<number, Pt> = {
    [POSE_LM.nose]: mk(cx, shY - 0.14),
    [POSE_LM.leftShoulder]: mk(cx - 0.11, shY),
    [POSE_LM.rightShoulder]: mk(cx + 0.11, shY),
    [POSE_LM.leftElbow]: mk((cx - 0.11 + lwX) / 2 - 0.02, shY + 0.12),
    [POSE_LM.rightElbow]: mk((cx + 0.11 + rwX) / 2 + 0.02, shY + 0.12),
    [POSE_LM.leftWrist]: mk(lwX, shY + 0.24 - liftL * 0.34),
    [POSE_LM.rightWrist]: mk(rwX, shY + 0.24 - liftR * 0.34),
    [POSE_LM.leftHip]: mk(cx - 0.08 - lean * 0.5, hipY),
    [POSE_LM.rightHip]: mk(cx + 0.08 - lean * 0.5, hipY),
  };
  return { pts, feat: computeFeat(pts) };
}

// ── Spatial targets ───────────────────────────────────────────────────────────
// Pose features → each voice's target 3D position + audio gain. This is the
// instrument: arm-span sets width, wrist height lifts+swells a side, torso lean
// rotates the whole azimuth.
interface VoiceTarget {
  x: number;
  y: number;
  z: number;
  gain: number;
}
function computeTargets(feat: PoseData["feat"]): VoiceTarget[] {
  const width = feat.armSpan;
  const azBias = feat.lean * 1.1;
  return VOICES.map((v) => {
    const sideH = v.side === "left" ? feat.leftH : feat.rightH;
    const x = v.lat * (0.35 + width * 1.9) + azBias;
    const y = (sideH - 0.35) * 2.2;
    const z = -(1.25 + (1 - width) * 0.55);
    const gain = v.baseGain * (0.5 + sideH * 0.95);
    return { x, y, z, gain };
  });
}

// ── Audio engine ──────────────────────────────────────────────────────────────
interface VoiceNodes {
  gain: GainNode;
  panner: PannerNode;
  analyser: AnalyserNode;
  level: number;
}

function setPannerPos(p: PannerNode, x: number, y: number, z: number, now: number) {
  const tau = 0.12;
  if (p.positionX) {
    p.positionX.setTargetAtTime(x, now, tau);
    p.positionY.setTargetAtTime(y, now, tau);
    p.positionZ.setTargetAtTime(z, now, tau);
  } else {
    p.setPosition(x, y, z);
  }
}

class BodycastEngine {
  readonly ctx: AudioContext;
  private master: SafeMaster;
  private source: AudioBufferSourceNode;
  private voices: VoiceNodes[] = [];

  constructor(ctx: AudioContext, buffer: AudioBuffer) {
    this.ctx = ctx;
    this.master = createSafeMaster(ctx);

    const listener = ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = 0;
      listener.positionY.value = 0;
      listener.positionZ.value = 0;
    } else {
      listener.setPosition(0, 0, 0);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    this.source = source;

    for (const def of VOICES) {
      const filter = ctx.createBiquadFilter();
      filter.type = def.filter;
      filter.frequency.value = def.freq;
      filter.Q.value = def.q;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.maxDistance = 20;
      panner.rolloffFactor = 0.6;
      panner.setPosition(def.lat, 0, -1.4);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      gain.connect(analyser); // passive tap for the live level
      panner.connect(this.master.input);

      this.voices.push({ gain, panner, analyser, level: 0 });
    }

    source.start();
  }

  update(targets: VoiceTarget[], masterGain: number) {
    const now = this.ctx.currentTime;
    this.voices.forEach((vn, i) => {
      const t = targets[i];
      vn.gain.gain.setTargetAtTime(t.gain, now, 0.12);
      setPannerPos(vn.panner, t.x, t.y, t.z, now);
    });
    this.master.setGain(Math.min(1, masterGain));
  }

  // Per-voice live level (RMS off the tap), display-scaled + smoothed.
  readLevels(): number[] {
    return this.voices.map((vn, i) => {
      const data = new Uint8Array(vn.analyser.fftSize);
      vn.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let k = 0; k < data.length; k++) {
        const d = (data[k] - 128) / 128;
        sum += d * d;
      }
      const rms = Math.sqrt(sum / data.length);
      const scaled = clamp01(rms * VOICES[i].displayScale);
      vn.level = vn.level * 0.8 + scaled * 0.2;
      return vn.level;
    });
  }

  stop() {
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.master.disconnect();
    } catch {
      /* closing */
    }
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

// ── three.js scene ────────────────────────────────────────────────────────────
interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  jointGeo: THREE.SphereGeometry;
  jointMat: THREE.MeshBasicMaterial;
  joints: Map<number, THREE.Mesh>;
  bones: THREE.LineSegments;
  bonePos: Float32Array;
  beams: THREE.Mesh[];
  orbs: THREE.Mesh[];
}

const UP = new THREE.Vector3(0, 1, 0);

function toWorld(p: Pt): THREE.Vector3 {
  return new THREE.Vector3(
    (p.x - 0.5) * 4.4,
    (0.5 - p.y) * 3.3 + 0.35,
    -(p.z || 0) * 2.2,
  );
}

// Voice spatial target → a point out in the room (beam endpoint / orb).
function targetToRoom(t: VoiceTarget): THREE.Vector3 {
  return new THREE.Vector3(t.x * 1.55, t.y * 1.4 + 0.4, -3.0 + t.z * 0.8);
}

function anchorWorld(pose: PoseData, anchor: Anchor): THREE.Vector3 {
  if (anchor === "hipMid") {
    const a = pose.pts[POSE_LM.leftHip];
    const b = pose.pts[POSE_LM.rightHip];
    return toWorld({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, v: 1 });
  }
  if (anchor === "lwrist") return toWorld(pose.pts[POSE_LM.leftWrist]);
  if (anchor === "rwrist") return toWorld(pose.pts[POSE_LM.rightWrist]);
  return toWorld(pose.pts[POSE_LM.nose]);
}

type Phase = "idle" | "loading" | "running";

export default function BodycastPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK_ID);
  const [trackTitle, setTrackTitle] = useState<string>("");
  const [cameraOn, setCameraOn] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [glError, setGlError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const sceneRef = useRef<SceneRefs | null>(null);
  const engineRef = useRef<BodycastEngine | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const startedAtRef = useRef<number>(0);
  const lastPoseAtRef = useRef<number>(0);
  const smoothPoseRef = useRef<PoseData | null>(null);
  const cameraOnRef = useRef(false);

  // ── build the stage ──
  const buildScene = useCallback((): boolean => {
    const mount = mountRef.current;
    if (!mount || sceneRef.current) return true;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setGlError(true);
      return false;
    }
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x0b0a09, 1); // charcoal stage
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0a09, 0.05);

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    camera.position.set(0, 0.4, 7);
    camera.lookAt(0, 0.2, -1.5);

    const group = new THREE.Group();
    scene.add(group);

    // Faint stage floor.
    const grid = new THREE.GridHelper(26, 26, 0x3a2c18, 0x1a140c);
    grid.position.y = -2.9;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.3;
    scene.add(grid);

    // Luminous joints.
    const jointGeo = new THREE.SphereGeometry(0.07, 12, 12);
    const jointMat = new THREE.MeshBasicMaterial({
      color: 0xffc478,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const joints = new Map<number, THREE.Mesh>();
    for (const idx of USED_LM) {
      const m = new THREE.Mesh(jointGeo, jointMat);
      group.add(m);
      joints.set(idx, m);
    }

    // Line-figure bones.
    const bonePos = new Float32Array(BONES.length * 2 * 3);
    const boneGeo = new THREE.BufferGeometry();
    boneGeo.setAttribute("position", new THREE.BufferAttribute(bonePos, 3));
    const boneMat = new THREE.LineBasicMaterial({
      color: 0xffb56a,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
    });
    const bones = new THREE.LineSegments(boneGeo, boneMat);
    group.add(bones);

    // Beams (tapered cylinders, wide at the room end) + far-end orbs.
    const beams: THREE.Mesh[] = [];
    const orbs: THREE.Mesh[] = [];
    for (const def of VOICES) {
      const geo = new THREE.CylinderGeometry(0.18, 0.03, 1, 16, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(geo, mat);
      scene.add(beam);
      beams.push(beam);

      const orbGeo = new THREE.SphereGeometry(0.16, 16, 16);
      const orbMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      scene.add(orb);
      orbs.push(orb);
    }

    sceneRef.current = {
      renderer,
      scene,
      camera,
      group,
      jointGeo,
      jointMat,
      joints,
      bones,
      bonePos,
      beams,
      orbs,
    };
    return true;
  }, []);

  // ── draw one frame from a pose + per-voice levels ──
  const drawScene = useCallback((pose: PoseData, levels: number[]) => {
    const s = sceneRef.current;
    if (!s) return;

    // Smooth the pose for liquid motion.
    const prev = smoothPoseRef.current;
    let cur = pose;
    if (prev) {
      const a = 0.35;
      const merged: Record<number, Pt> = {};
      for (const idx of USED_LM) {
        const np = pose.pts[idx];
        const pp = prev.pts[idx] ?? np;
        merged[idx] = {
          x: pp.x + (np.x - pp.x) * a,
          y: pp.y + (np.y - pp.y) * a,
          z: pp.z + (np.z - pp.z) * a,
          v: np.v,
        };
      }
      cur = { pts: merged, feat: computeFeat(merged) };
    }
    smoothPoseRef.current = cur;

    // Joints.
    for (const [idx, mesh] of s.joints) {
      const p = cur.pts[idx];
      mesh.position.copy(toWorld(p));
      mesh.scale.setScalar(0.8 + cur.feat.presence * 0.6);
    }

    // Bones.
    let oi = 0;
    for (const [ai, bi] of BONES) {
      const wa = toWorld(cur.pts[ai]);
      const wb = toWorld(cur.pts[bi]);
      s.bonePos[oi++] = wa.x;
      s.bonePos[oi++] = wa.y;
      s.bonePos[oi++] = wa.z;
      s.bonePos[oi++] = wb.x;
      s.bonePos[oi++] = wb.y;
      s.bonePos[oi++] = wb.z;
    }
    s.bones.geometry.attributes.position.needsUpdate = true;

    // Beams + orbs from the spatial targets.
    const targets = computeTargets(cur.feat);
    VOICES.forEach((def, i) => {
      const t = targets[i];
      const level = levels[i] ?? 0;
      const start = anchorWorld(cur, def.anchor);
      const room = targetToRoom(t);

      // Beam length grows with the live level of that register.
      const end = start.clone().lerp(room, 0.22 + level * 0.85);
      const dir = end.clone().sub(start);
      const len = Math.max(0.05, dir.length());
      dir.normalize();

      const beam = s.beams[i];
      beam.position.copy(start).add(end).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(UP, dir);
      beam.scale.set(0.5 + level * 0.9, len, 0.5 + level * 0.9);
      const bmat = beam.material as THREE.MeshBasicMaterial;
      bmat.color.copy(new THREE.Color(def.color)).lerp(
        new THREE.Color(0xfff4dd),
        Math.min(1, level * 1.3),
      );
      bmat.opacity = 0.18 + level * 0.72;

      const orb = s.orbs[i];
      orb.position.copy(end);
      orb.scale.setScalar(0.6 + level * 1.1);
      (orb.material as THREE.MeshBasicMaterial).opacity = 0.25 + level * 0.6;
    });

    // Gentle architectural drift.
    s.group.rotation.y = Math.sin(performance.now() * 0.00006) * 0.12;
    s.renderer.render(s.scene, s.camera);
  }, []);

  // ── main loop ──
  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const now = performance.now();
    let pose: PoseData | null = null;

    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (cameraOnRef.current && lm && video && video.readyState >= 2) {
      try {
        const res = lm.detectForVideo(video, now);
        const first = res.landmarks?.[0];
        if (first) {
          pose = readPose(first);
          if (pose) {
            lastPoseAtRef.current = now;
            if (demoMode) setDemoMode(false);
          }
        }
      } catch {
        /* detection hiccup — fall through to demo */
      }
    }

    // No live pose for ~2s (or no camera) → autonomous ghost body.
    if (!pose) {
      const idle = now - lastPoseAtRef.current > 2000 || lastPoseAtRef.current === 0;
      if (idle) {
        if (!demoMode) setDemoMode(true);
        pose = makeDemoPose((now - startedAtRef.current) / 1000);
      } else {
        pose = smoothPoseRef.current;
      }
    }
    if (!pose) return;

    const engine = engineRef.current;
    let levels: number[];
    if (engine) {
      engine.update(computeTargets(pose.feat), 0.55 + pose.feat.presence * 0.5);
      levels = engine.readLevels();
    } else {
      // Preview before audio unlocks: synthesise gentle beam levels.
      const t = (now - startedAtRef.current) / 1000;
      levels = VOICES.map((_, i) => 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.6 + i * 1.4)));
    }
    drawScene(pose, levels);
  }, [demoMode, drawScene]);

  // ── primary action: Play (AudioContext created inside the gesture for iOS) ──
  const play = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");
    setNotice(null);

    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtor();
    try {
      await ctx.resume();
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);
      engineRef.current = new BodycastEngine(ctx, buffer);
      setPhase("running");
    } catch {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
      setNotice("Karel's take could not be loaded in this browser — please try again.");
      setPhase("idle");
    }
  }, [phase, trackId]);

  // ── secondary layer: enable body tracking ──
  const enableCamera = useCallback(async () => {
    if (cameraOnRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    try {
      const stream = await startCamera(video);
      streamRef.current = stream;
    } catch {
      setNotice("No camera available — the ghost body keeps sculpting the mix for you.");
      return;
    }
    try {
      landmarkerRef.current = await createPoseTracker(1);
      cameraOnRef.current = true;
      setCameraOn(true);
      setNotice(null);
    } catch {
      setNotice(
        "Body tracking couldn't load — the ghost body keeps sculpting the mix for you.",
      );
    }
  }, []);

  // ── build scene on mount + run preview so it's alive before Play ──
  useEffect(() => {
    if (!buildScene()) return;
    startedAtRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => {
      const s = sceneRef.current;
      const mount = mountRef.current;
      if (!s || !mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
      s.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the loop's closure fresh (it depends on demoMode).
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [loop]);

  // ── full teardown on unmount ──
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      const lm = landmarkerRef.current;
      if (lm) {
        try {
          lm.close();
        } catch {
          /* ignore */
        }
        landmarkerRef.current = null;
      }
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
      }
      const engine = engineRef.current;
      if (engine) {
        engine.stop();
        engineRef.current = null;
      }
      const s = sceneRef.current;
      if (s) {
        s.jointGeo.dispose();
        s.jointMat.dispose();
        (s.bones.geometry as THREE.BufferGeometry).dispose();
        (s.bones.material as THREE.Material).dispose();
        for (const b of s.beams) {
          b.geometry.dispose();
          (b.material as THREE.Material).dispose();
        }
        for (const o of s.orbs) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
        s.renderer.dispose();
        if (s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
        sceneRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0" />
      <video ref={videoRef} className="hidden" playsInline muted />

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-muted-foreground">
            WebGL is unavailable here, so the stage can&apos;t render — but the
            spatial mix of Karel&apos;s take still plays when you press Play.
          </p>
        </div>
      )}

      {/* header */}
      <div className="pointer-events-none absolute left-0 top-0 max-w-md p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance dream lab
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Bodycast
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Your body becomes the mixing stage for Karel&apos;s piano. Each register
          casts a beam of light you sculpt by reaching, spreading and lifting.
        </p>
        {phase === "running" && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {trackTitle ? `now casting — ${trackTitle}` : "now casting"}
            {demoMode ? " · ghost body" : cameraOn ? " · your body" : ""}
          </p>
        )}
      </div>

      {/* legend of the four registers */}
      {phase === "running" && (
        <div className="pointer-events-none absolute right-4 top-4 flex flex-col gap-1.5 rounded-md border border-border bg-background/60 p-3 backdrop-blur-sm">
          {VOICES.map((v) => (
            <div key={v.key} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: `#${v.color.toString(16).padStart(6, "0")}` }}
              />
              <span className="text-sm text-muted-foreground">{v.label}</span>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 w-[min(90vw,40rem)] -translate-x-1/2 p-4 text-center">
          <p className="text-base text-destructive">{notice}</p>
        </div>
      )}

      {/* idle: track picker + Play */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex flex-col items-center justify-end gap-4 pb-16 sm:justify-center sm:pb-0">
          <label className="pointer-events-auto flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs uppercase tracking-[0.18em]">take</span>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground backdrop-blur-sm"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={play}
            disabled={phase === "loading"}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {phase === "loading" ? "Loading the take…" : "Play"}
          </button>
        </div>
      )}

      {/* running: offer the camera as a secondary layer */}
      {phase === "running" && !cameraOn && (
        <div className="absolute inset-x-0 bottom-16 flex justify-center sm:bottom-8">
          <button
            onClick={enableCamera}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Step onto the stage — enable body tracking
          </button>
        </div>
      )}

      {cameraOn && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          camera stays on-device · nothing stored or sent
        </p>
      )}

      {/* design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute bottom-4 right-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Bodycast — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One looping source of Karel&apos;s real take is split into four
                register voices — bass, low-mid, high-mid and treble — each with
                its own HRTF-spatialized PannerNode. Your body is the mixing
                console.
              </p>
              <p>
                Spread your arms and the four voices fan out across the room
                (treble farthest, bass nearest centre); draw them in and the mix
                collapses to an intimate near-mono in front of you. Lift the left
                wrist to swell and raise the low voices; lift the right to raise
                the highs. Lean to rotate the whole field. Each beam&apos;s length
                and brightness is that register&apos;s live level — the sound made
                visible in space.
              </p>
              <p>
                It inverts &quot;Sounding Bodies: Modeling 3D Spatial Sound of
                Humans Using Body Pose and Audio&quot; (arXiv:2311.06285): there,
                pose predicts the sound a body radiates; here, your pose decides
                where each voice of the take radiates from. It nods to Myron
                Krueger&apos;s <em>Videoplace</em> (1974) and to stage-lighting
                design.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
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
