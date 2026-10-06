"use client";

/* ── 19360 · Vicinity ─────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if several of Karel's recordings lived at different places
 *  in a room, and I moved through them with my body — leaning and approaching to
 *  bring each one forward in true 3D spatial sound?
 *
 *  INPUT  : MediaPipe PoseLandmarker (full body, from the shared loader). We read
 *           ONLY what a seated desk webcam actually sees — the two shoulders and
 *           the nose. Two body signals steer YOU, the listener:
 *             · lateral  = mirrored shoulder/nose centre x   → listener X
 *             · approach = shoulder WIDTH (a depth proxy)     → listener Z
 *               (lean toward the camera, your shoulders grow, you move deeper in)
 *             · a shallow torso-height term → listener Y
 *  TECHNIQUE: a multi-source HRTF spatial ensemble. Each take is an
 *           AudioBufferSourceNode(loop) → GainNode → PannerNode
 *           (panningModel "HRTF", distanceModel "inverse") pinned at a distinct
 *           point in a virtual room, with its own AnalyserNode tap, all feeding
 *           the shared safeMaster bus. The AudioContext LISTENER is your body:
 *           moving the listener toward an orb makes that recording swell and
 *           localise to its direction while the far ones recede — 6DoF-style
 *           navigation of real sound. Listener params are eased with
 *           setTargetAtTime(…, 0.12) so motion reads without jitter.
 *  OUTPUT : a three.js cosmic room (deep indigo → rose) with one glowing orb per
 *           take at its panner position, dust and strands for depth, and a soft
 *           listener aura the camera follows — so the room parallaxes as you move.
 *           Each orb breathes with its take's live energy and its nearness to you.
 *
 *  Research anchor: recent 6DoF spatial-audio object manipulation (AudioMiXR,
 *  arXiv:2502.02929) and spatial-audio journeys through reconstructed space
 *  ("Passing", arXiv:2609.27489) both place or generate *new* sound in space.
 *  Vicinity inverts that: the spatial field is made of Karel's REAL recordings,
 *  navigated by the body. Every source is one of his takes — never a synth.
 *
 *  Alive on load via an autonomous demo walk (a slow figure-8 through the room)
 *  that drives the IDENTICAL body → listener → HRTF chain, so it breathes with no
 *  camera. See README.md.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { loadRealTrackBuffer } from "../_shared/welcomeHome";
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

// ── the ensemble: four of Karel's real takes, each pinned in the room ──────────
interface TakeSpec {
  id: string;
  title: string;
  pos: [number, number, number];
  hue: number; // deep indigo → rose
  gain: number;
}

const TAKES: readonly TakeSpec[] = [
  {
    id: "d57cfae6-f234-4d24-85fe-72a8ad93a44a",
    title: "Interplay",
    pos: [-3.3, 0.2, -3.4],
    hue: 0.69, // indigo
    gain: 0.72,
  },
  {
    id: "eba95845-cdbf-41d8-9c5d-8679686811ad",
    title: "Bath",
    pos: [3.1, -0.3, -4.6],
    hue: 0.79, // violet-indigo
    gain: 0.72,
  },
  {
    id: "7816dc66-794b-4fb1-8796-c2ef00c3f943",
    title: "Playa",
    pos: [-2.1, 0.85, -7.7],
    hue: 0.9, // magenta
    gain: 0.74,
  },
  {
    id: "d2eeee58-832b-4872-a4be-8fbf030b981d",
    title: "Rolling",
    pos: [2.7, 0.1, -8.6],
    hue: 0.97, // rose
    gain: 0.74,
  },
] as const;

const FIELD = 0x07050f; // deep indigo-black room

// listener travel envelope (world units)
const LX_SPAN = 3.7; // lateral reach left↔right
const LZ_NEAR = 1.6; // z when you sit back (shoulders small)
const LZ_DEEP = -5.6; // z when you lean in (shoulders wide) — among the orbs
const LY_SPAN = 0.5; // shallow vertical

type Driver = "demo" | "live";

interface Engine {
  startAudio: () => void;
  stopAudio: () => void;
  startCam: () => Promise<void>;
}

interface Readout {
  driver: Driver;
  lost: boolean;
  nearTitle: string;
  loaded: number;
}

// ── body → two normalized signals (lateral, depth). Gate on shoulders only. ───
function readWalk(lm: Array<{ x: number; y: number; visibility?: number }>): {
  lateral: number;
  depth: number;
  vert: number;
  present: boolean;
} {
  const ls = lm[POSE_LM.leftShoulder];
  const rs = lm[POSE_LM.rightShoulder];
  const nose = lm[POSE_LM.nose];
  if (!ls || !rs) return { lateral: 0, depth: 0.5, vert: 0.5, present: false };
  const vis = ((ls.visibility ?? 1) + (rs.visibility ?? 1)) / 2;
  if (vis < 0.4) return { lateral: 0, depth: 0.5, vert: 0.5, present: false };

  // centre x from shoulders + nose (when seen); mirror so moving left reads left
  let cx = (ls.x + rs.x) / 2;
  if (nose && (nose.visibility ?? 1) > 0.4) cx = (cx * 2 + nose.x) / 3;
  const lateral = clamp((0.5 - cx) * 2 * 1.3, -1, 1);

  // depth proxy: normalized shoulder width (~0.16 far … ~0.42 near)
  const shoulderW = Math.abs(ls.x - rs.x);
  const depth = clamp01((shoulderW - 0.16) / (0.42 - 0.16));

  // torso height → shallow vertical (higher in frame = lower y = look up a touch)
  const cy = (ls.y + rs.y) / 2;
  const vert = clamp01(1 - (cy - 0.25) / 0.5);

  return { lateral, depth, vert, present: true };
}

// autonomous demo: a slow figure-8 drift through the room (no hardware)
function runDemoWalk(tSec: number): {
  lateral: number;
  depth: number;
  vert: number;
  present: boolean;
} {
  const lateral = Math.sin(tSec * 0.26) * 0.9;
  const depth = 0.5 + Math.sin(tSec * 0.4 + Math.PI * 0.5) * 0.42;
  const vert = 0.5 + Math.sin(tSec * 0.19) * 0.22;
  return { lateral: clamp(lateral, -1, 1), depth: clamp01(depth), vert, present: true };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export default function VicinityPage() {
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
  const [usingPointer, setUsingPointer] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    driver: "demo",
    lost: false,
    nearTitle: TAKES[0].title,
    loaded: 0,
  });

  // ── one engine, built once; React buttons reach it through engineRef ─────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── three.js cosmic room (WebGL optional) ──────────────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    const disposables: Array<{ dispose: () => void }> = [];

    interface OrbVis {
      core: THREE.Mesh;
      halo: THREE.Mesh;
      baseHue: number;
      coreMat: THREE.MeshBasicMaterial;
      haloMat: THREE.MeshBasicMaterial;
      pos: THREE.Vector3;
    }
    const orbVis: OrbVis[] = [];
    let aura: THREE.Mesh | null = null;
    let auraMat: THREE.MeshBasicMaterial | null = null;
    let dust: THREE.Points | null = null;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      if (!renderer.getContext()) throw new Error("no webgl");
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setClearColor(FIELD, 1);
      mount.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(FIELD, 0.052);
      camera = new THREE.PerspectiveCamera(
        56,
        mount.clientWidth / Math.max(1, mount.clientHeight),
        0.1,
        120,
      );
      camera.position.set(0, 1.7, 5);
      camera.lookAt(0, 0, -4);

      // orbs — one per take, at its panner position
      const coreGeo = new THREE.SphereGeometry(0.42, 32, 24);
      const haloGeo = new THREE.SphereGeometry(1.15, 24, 18);
      disposables.push(coreGeo, haloGeo);
      for (const t of TAKES) {
        const col = new THREE.Color().setHSL(t.hue, 0.85, 0.6);
        const coreMat = new THREE.MeshBasicMaterial({
          color: col.clone(),
          transparent: true,
          opacity: 0.95,
        });
        const haloMat = new THREE.MeshBasicMaterial({
          color: col.clone(),
          transparent: true,
          opacity: 0.12,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        disposables.push(coreMat, haloMat);
        const core = new THREE.Mesh(coreGeo, coreMat);
        const halo = new THREE.Mesh(haloGeo, haloMat);
        const p = new THREE.Vector3(t.pos[0], t.pos[1], t.pos[2]);
        core.position.copy(p);
        halo.position.copy(p);
        scene.add(core);
        scene.add(halo);
        orbVis.push({ core, halo, baseHue: t.hue, coreMat, haloMat, pos: p });
      }

      // strands between every pair of orbs — faint depth cue
      const strandPts: number[] = [];
      for (let i = 0; i < orbVis.length; i++) {
        for (let j = i + 1; j < orbVis.length; j++) {
          strandPts.push(
            orbVis[i].pos.x,
            orbVis[i].pos.y,
            orbVis[i].pos.z,
            orbVis[j].pos.x,
            orbVis[j].pos.y,
            orbVis[j].pos.z,
          );
        }
      }
      const strandGeo = new THREE.BufferGeometry();
      strandGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(strandPts, 3),
      );
      const strandMat = new THREE.LineBasicMaterial({
        color: new THREE.Color().setHSL(0.82, 0.6, 0.5),
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(strandGeo, strandMat);
      scene.add(new THREE.LineSegments(strandGeo, strandMat));

      // dust motes across the room volume
      const DUST = reduce ? 260 : 520;
      const dpos = new Float32Array(DUST * 3);
      const dcol = new Float32Array(DUST * 3);
      const dc = new THREE.Color();
      for (let i = 0; i < DUST; i++) {
        dpos[i * 3] = (Math.random() - 0.5) * 16;
        dpos[i * 3 + 1] = (Math.random() - 0.5) * 7;
        dpos[i * 3 + 2] = -Math.random() * 14 + 2;
        dc.setHSL(0.69 + Math.random() * 0.28, 0.6, 0.55);
        dcol[i * 3] = dc.r;
        dcol[i * 3 + 1] = dc.g;
        dcol[i * 3 + 2] = dc.b;
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dpos, 3));
      dustGeo.setAttribute("color", new THREE.Float32BufferAttribute(dcol, 3));
      const dustMat = new THREE.PointsMaterial({
        size: 0.055,
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(dustGeo, dustMat);
      dust = new THREE.Points(dustGeo, dustMat);
      scene.add(dust);

      // listener aura — the camera follows it, so you see yourself move
      const auraGeo = new THREE.SphereGeometry(0.5, 20, 16);
      disposables.push(auraGeo);
      auraMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.95, 0.5, 0.85),
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(auraMat);
      aura = new THREE.Mesh(auraGeo, auraMat);
      scene.add(aura);
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
    }

    // ── audio state ────────────────────────────────────────────────────────────
    let ctx: AudioContext | null = null;
    let master: SafeMaster | null = null;
    let listenerHasAP = false;

    interface Voice {
      spec: TakeSpec;
      gain: GainNode;
      panner: PannerNode;
      analyser: AnalyserNode;
      specBuf: Uint8Array<ArrayBuffer>;
      source: AudioBufferSourceNode | null;
      energy: number; // smoothed RMS 0..1
    }
    const voices: Voice[] = [];
    let loadedCount = 0;

    function setListenerPose(lst: AudioListener) {
      // face -z, up +y; only the position travels with the body
      if (lst.positionX) {
        listenerHasAP = true;
        lst.forwardX.value = 0;
        lst.forwardY.value = 0;
        lst.forwardZ.value = -1;
        lst.upX.value = 0;
        lst.upY.value = 1;
        lst.upZ.value = 0;
        lst.positionX.value = 0;
        lst.positionY.value = 0;
        lst.positionZ.value = 0;
      } else {
        listenerHasAP = false;
        lst.setOrientation?.(0, 0, -1, 0, 1, 0);
        lst.setPosition?.(0, 0, 0);
      }
    }

    function buildVoice(spec: TakeSpec): Voice {
      const c = ctx!;
      const gain = c.createGain();
      gain.gain.value = 0; // fade in on load

      const panner = c.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1.6;
      panner.maxDistance = 28;
      panner.rolloffFactor = 1.0;
      if (panner.positionX) {
        panner.positionX.value = spec.pos[0];
        panner.positionY.value = spec.pos[1];
        panner.positionZ.value = spec.pos[2];
      } else {
        panner.setPosition?.(spec.pos[0], spec.pos[1], spec.pos[2]);
      }

      const analyser = c.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;

      // source → gain → panner → analyser(tap) → safeMaster.input
      gain.connect(panner);
      panner.connect(analyser);
      analyser.connect(master!.input);

      return {
        spec,
        gain,
        panner,
        analyser,
        specBuf: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
        source: null,
        energy: 0,
      };
    }

    async function loadVoiceBuffer(v: Voice) {
      const c = ctx;
      if (!c) return;
      try {
        const { buffer } = await loadRealTrackBuffer(c, v.spec.id);
        if (!ctx || ctx !== c) return; // audio stopped mid-load
        const src = c.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(v.gain);
        // stagger starts a little so the takes don't phase-lock
        src.start(c.currentTime + Math.random() * 0.3);
        v.source = src;
        v.gain.gain.setTargetAtTime(v.spec.gain, c.currentTime, 1.4);
        loadedCount++;
        setReadout((r) => ({ ...r, loaded: loadedCount }));
      } catch {
        setNotice(
          "One of the recordings could not be loaded — the others still fill the room.",
        );
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
          (
            window as unknown as {
              webkitAudioContext: typeof AudioContext;
            }
          ).webkitAudioContext;
        ctx = new AC();
        void ctx.resume();
        master = createSafeMaster(ctx);
        setListenerPose(ctx.listener);
        loadedCount = 0;
        setReadout((r) => ({ ...r, loaded: 0 }));
        voices.length = 0;
        for (const spec of TAKES) {
          const v = buildVoice(spec);
          voices.push(v);
          void loadVoiceBuffer(v);
        }
      } catch {
        ctx = null;
        master = null;
        setNotice(
          "Web Audio is unavailable here — the room still drifts, silently.",
        );
      }
    }

    function stopAudio() {
      const deadCtx = ctx;
      ctx = null;
      for (const v of voices) {
        try {
          v.source?.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.gain.disconnect();
          v.panner.disconnect();
          v.analyser.disconnect();
        } catch {
          /* ignore */
        }
      }
      voices.length = 0;
      if (master) {
        master.disconnect();
        master = null;
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
        setUsingPointer(true);
        setNotice(
          "No camera here — move the pointer instead (left/right pans, up/down moves you deeper).",
        );
        return;
      }
      try {
        stream = await startCamera(video);
      } catch {
        setCamState("failed");
        setUsingPointer(true);
        setNotice(
          "Camera blocked — move the pointer instead (left/right pans, up/down moves you deeper).",
        );
        return;
      }
      try {
        landmarker = await createPoseTracker(1);
        setCamState("on");
        setUsingPointer(false);
        setNotice(null);
      } catch {
        setCamState("failed");
        setUsingPointer(true);
        setNotice(
          "Body-tracking model couldn't load (offline?) — move the pointer instead.",
        );
      }
    }

    engineRef.current = { startAudio, stopAudio, startCam };

    // pointer fallback: mouse x = lateral, mouse y = approach
    let ptrLateral = 0;
    let ptrDepth = 0.5;
    let ptrActive = false;
    function onPointer(e: PointerEvent) {
      ptrActive = true;
      ptrLateral = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
      ptrDepth = clamp01(1 - e.clientY / window.innerHeight);
    }
    window.addEventListener("pointermove", onPointer);

    function readLive(nowMs: number): {
      lateral: number;
      depth: number;
      vert: number;
      present: boolean;
    } | null {
      const video = videoRef.current;
      if (!landmarker || !stream || !video || video.readyState < 2) return null;
      let res;
      try {
        res = landmarker.detectForVideo(video, nowMs);
      } catch {
        return null;
      }
      const lm = res?.landmarks?.[0];
      if (!lm) return { lateral: 0, depth: 0.5, vert: 0.5, present: false };
      return readWalk(lm);
    }

    // ── smoothed listener / camera state (JS-side, for visuals + Safari path) ────
    let lx = 0;
    let ly = 0;
    let lz = 0;
    let sawReal = false;
    let nearIdx = 0;

    const camPos = new THREE.Vector3(0, 1.7, 5);
    const camLook = new THREE.Vector3(0, 0, -4);

    function applyListener(x: number, y: number, z: number) {
      if (!ctx) return;
      const lst = ctx.listener;
      const t = ctx.currentTime;
      if (listenerHasAP) {
        lst.positionX.setTargetAtTime(x, t, 0.12);
        lst.positionY.setTargetAtTime(y, t, 0.12);
        lst.positionZ.setTargetAtTime(z, t, 0.12);
      } else {
        lst.setPosition?.(x, y, z);
      }
    }

    // ── render ──────────────────────────────────────────────────────────────────
    const tmpColor = new THREE.Color();

    function renderRoom(dt: number, masterRms: number) {
      if (!renderer || !scene || !camera) return;

      if (dust) dust.rotation.y += dt * 0.012;

      // aura sits at the listener; camera follows from behind + above
      if (aura) {
        aura.position.set(lx, ly + 0.1, lz);
        const s = 0.9 + masterRms * 1.4;
        aura.scale.setScalar(s);
        if (auraMat) auraMat.opacity = 0.22 + masterRms * 0.3;
      }
      camPos.set(lx * 0.75, ly + 1.8, lz + 5.0);
      camLook.set(lx * 0.5, ly * 0.4, lz - 3.4);
      camera.position.lerp(camPos, Math.min(1, dt * 3));
      camera.lookAt(camLook);

      // orbs breathe with their take's energy + nearness to the listener
      for (let i = 0; i < orbVis.length; i++) {
        const ov = orbVis[i];
        const v = voices[i];
        const energy = v ? v.energy : 0.15 + 0.1 * Math.sin(performance.now() * 0.001 + i);
        const dxl = ov.pos.x - lx;
        const dyl = ov.pos.y - ly;
        const dzl = ov.pos.z - lz;
        const dist = Math.sqrt(dxl * dxl + dyl * dyl + dzl * dzl);
        const near = clamp01(1 - (dist - 1.2) / 7); // 1 close … 0 far
        const pulse = 0.7 + energy * 1.3 + near * 0.6;
        ov.core.scale.setScalar(pulse);
        ov.halo.scale.setScalar(0.8 + energy * 1.1 + near * 1.4);
        const light = 0.42 + energy * 0.35 + near * 0.2;
        tmpColor.setHSL(ov.baseHue, 0.85, Math.min(0.92, light));
        ov.coreMat.color.copy(tmpColor);
        ov.coreMat.opacity = 0.78 + near * 0.2;
        ov.haloMat.opacity = 0.08 + energy * 0.22 + near * 0.16;
      }

      renderer.render(scene, camera);
    }

    // ── the one loop ─────────────────────────────────────────────────────────────
    let raf = 0;
    let lastMs = performance.now();
    let roAccum = 0;
    let driver: Driver = "demo";
    let lost = false;

    function loop(nowMs: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.06, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const nowS = nowMs / 1000;

      // 1) choose the body signal: live camera → pointer → autonomous demo
      let walk: { lateral: number; depth: number; vert: number; present: boolean };
      let usedLive = false;
      let liveLost = false;
      const live = readLive(nowMs);
      if (live) {
        usedLive = true;
        if (live.present) {
          walk = live;
          if (!sawReal) sawReal = true;
        } else {
          liveLost = true;
          walk = { lateral: 0, depth: 0.5, vert: 0.5, present: false };
        }
      } else if (ptrActive) {
        walk = { lateral: ptrLateral, depth: ptrDepth, vert: 0.5, present: true };
      } else {
        walk = runDemoWalk(nowS);
      }
      driver = usedLive && sawReal ? "live" : "demo";
      lost = liveLost;

      // 2) target listener position from the body, eased in JS for the visuals
      const tx = walk.lateral * LX_SPAN;
      const tz = LZ_NEAR + (LZ_DEEP - LZ_NEAR) * walk.depth;
      const ty = (walk.vert - 0.5) * 2 * LY_SPAN;
      const k = Math.min(1, dt / 0.12);
      lx += (tx - lx) * k;
      ly += (ty - ly) * k;
      lz += (tz - lz) * k;

      // 3) drive the AudioContext listener (its AudioParams smooth further)
      applyListener(tx, ty, tz);

      // 4) per-take energy from each analyser tap, overall from master
      let masterRms = 0;
      let bestNear = -1;
      let bestIdx = 0;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        v.analyser.getByteTimeDomainData(v.specBuf);
        let acc = 0;
        for (let n = 0; n < v.specBuf.length; n++) {
          const s = (v.specBuf[n] - 128) / 128;
          acc += s * s;
        }
        const rms = Math.sqrt(acc / v.specBuf.length);
        v.energy += (rms - v.energy) * Math.min(1, dt * 6);
        masterRms += v.energy;
        // nearest orb (for the readout)
        const dxl = v.spec.pos[0] - lx;
        const dzl = v.spec.pos[2] - lz;
        const near = -(dxl * dxl + dzl * dzl);
        if (near > bestNear) {
          bestNear = near;
          bestIdx = i;
        }
      }
      masterRms = Math.min(1, masterRms * 0.8);
      if (voices.length === 0) {
        // audio off — pick nearest orb geometrically so the readout still reads
        let bn = -1;
        for (let i = 0; i < TAKES.length; i++) {
          const dxl = TAKES[i].pos[0] - lx;
          const dzl = TAKES[i].pos[2] - lz;
          const near = -(dxl * dxl + dzl * dzl);
          if (near > bn) {
            bn = near;
            bestIdx = i;
          }
        }
      }
      nearIdx = bestIdx;

      renderRoom(dt, masterRms);

      // 5) throttled React readout
      roAccum += dt;
      if (roAccum > 0.2) {
        roAccum = 0;
        const nearTitle = TAKES[nearIdx].title;
        setReadout((r) => {
          if (r.driver === driver && r.lost === lost && r.nearTitle === nearTitle) {
            return r;
          }
          return { ...r, driver, lost, nearTitle };
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
      window.removeEventListener("pointermove", onPointer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (landmarker) {
        try {
          landmarker.close();
        } catch {
          /* ignore */
        }
      }
      stopAudio();
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          /* ignore */
        }
      }
      if (renderer) {
        renderer.dispose();
        try {
          renderer.forceContextLoss();
        } catch {
          /* ignore */
        }
        if (mount.contains(renderer.domElement))
          mount.removeChild(renderer.domElement);
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

  // ── tracking status line ───────────────────────────────────────────────────────
  const statusEl =
    readout.driver === "live" ? (
      readout.lost ? (
        <span className="text-destructive">
          tracking · lost — sit back so both shoulders are in frame
        </span>
      ) : (
        <span className="text-foreground">
          tracking · live — nearest: {readout.nearTitle}
        </span>
      )
    ) : usingPointer ? (
      <span className="text-muted-foreground/70">
        pointer · fallback — nearest: {readout.nearTitle}
      </span>
    ) : (
      <span className="text-muted-foreground/70">
        demo · autonomous — nearest: {readout.nearTitle}
      </span>
    );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* hidden feed for MediaPipe only */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* full-bleed room */}
      <div ref={mountRef} className="absolute inset-0" />

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Vicinity"
        description="Four of Karel's piano recordings live at different places in one room, each pinned in true 3D with HRTF spatial audio. Your body is the listener: move side to side to pass between them, and lean toward the camera to move deeper into the one in front of you — it swells and localises while the far ones recede. Best on headphones."
        howTo={[
          "Put on headphones and allow the camera.",
          "Move side to side to pass between the recordings.",
          "Lean toward the camera to move deeper into the one in front of you.",
          "No camera? Move the pointer — left/right pans, up/down moves you deeper.",
          "Press f for fullscreen, i for info.",
        ]}
      />

      {/* tracking status + headphones hint — always visible while active */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.18em]">
        {statusEl}
        <span className="text-muted-foreground/60">headphones · best for 3D</span>
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

          {/* title + controls — bottom-anchored light overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-5 sm:p-7">
            <div className="max-w-xl">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Vicinity
              </h1>
              <p className="mt-1.5 max-w-lg text-base leading-relaxed text-muted-foreground">
                Several of Karel&apos;s recordings, placed around a dark room in
                true 3D. Move through them with your body — lean and approach to
                bring each one forward.
              </p>
            </div>

            {notice && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-destructive">
                {notice}
              </p>
            )}
            {!webglOk && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-destructive">
                WebGL isn&apos;t available here, so the room can&apos;t render —
                the spatial audio still plays once started.
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
                {soundOn
                  ? "Stop sound"
                  : "Start sound — enter the room"}
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
                      : "Enable camera — move with your body"}
                </button>
              )}
              {soundOn && readout.loaded < TAKES.length && (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  loading {readout.loaded}/{TAKES.length} takes…
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
