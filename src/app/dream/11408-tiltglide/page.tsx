"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11408-tiltglide — "What if you tilted your phone to fly an endless canyon of
// singing crystal, where your altitude is the melody?"
//
//   SUBSTRATE — a real three.js perspective flight. A boundless chasm you fall
//   down: the camera hangs at the origin looking into the dark while a RING
//   BUFFER of 44 crystalline "gates" scrolls toward it and recycles behind. Each
//   gate is a ring of elongated crystal shards rendered by two THREE.InstancedMesh
//   (a solid core + an additive-blended halo, 44×16 = 704 shards each). Everything
//   sits inside THREE.FogExp2 so gates fade in from the deep — this sells the
//   infinite tunnel. When a gate passes the camera it is re-seeded from a fresh
//   string→int hash + mulberry32 PRNG, so the descent is deterministic yet never
//   repeats.
//
//   PATH — the whole canyon snakes along a sine-sum centreline (three sines of
//   different frequencies on each of X and Y). The camera banks (rolls) into the
//   turns from the centreline's curvature and the player's steering.
//
//   INPUT — device tilt. DeviceOrientationEvent gamma (left/right) steers the
//   heading; beta (forward/back) sets the dive → altitude. iOS gates motion
//   behind DeviceOrientationEvent.requestPermission(), which must run from the
//   Start button's click. A pointer-drag + Arrow-key fallback always works; a
//   caption shows the live input mode (tilt / drag / keys / auto).
//
//   SOUND — camera ALTITUDE is quantised to a minor-pentatonic lead that
//   retriggers on each threshold crossing (tilt up/down = play the scale) over a
//   Shepard–Risset ENDLESS-DESCENT drone bed (dir: -1) so the whole piece feels
//   like perpetual falling. All audio routes through the shared safe-master bus.
//
//   SELF-DEMO — a seeded auto-pilot drifts the tilt values from mount, so a muted
//   phone with no tilt sensor still sees + hears an endless descent within ~1s.
//   The Start button unlocks the AudioContext and requests tilt permission; real
//   input takes over and the auto-pilot resumes after a few idle seconds.
//
//   Refs: R. N. Shepard, "Circularity in Judgments of Relative Pitch," JASA 36
//   (1964); J.-C. Risset's continuous glissando realisation of it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { startShepard, type ShepardEngine } from "../_shared/visionary/shepard";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

// ── deterministic PRNG + string→int hash (no deps, no Math.random/Date.now) ───
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
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── corridor geometry ────────────────────────────────────────────────────────
const NUM_GATES = 44;
const SHARDS_PER_GATE = 16;
const TOTAL = NUM_GATES * SHARDS_PER_GATE; // 704 instances per mesh
const SPACING = 4.4; // z-gap between gates
const FAR = NUM_GATES * SPACING; // depth of the whole ring buffer
const PASS = 7; // recycle once a gate is this far behind the camera
const LOOKAHEAD = 14; // how far ahead the camera aims

// ── flight dynamics ──────────────────────────────────────────────────────────
const BASE_SPEED = 15.5; // units/sec fall rate
const STEER_RANGE = 6.2; // lateral offset the player can steer into
const ALT_RANGE = 5.0; // altitude the player can climb/dive through

// ── the snaking sine-sum centreline (ART layer) ──────────────────────────────
function centreX(s: number): number {
  return (
    Math.sin(s * 0.021) * 7.0 +
    Math.sin(s * 0.0067 + 1.3) * 4.4 +
    Math.sin(s * 0.041 + 0.5) * 2.1
  );
}
function centreY(s: number): number {
  return (
    Math.sin(s * 0.017 + 2.1) * 3.6 +
    Math.sin(s * 0.0091 + 0.7) * 2.7 +
    Math.sin(s * 0.037 + 1.9) * 1.4
  );
}

// ── minor-pentatonic lead (altitude → note) ──────────────────────────────────
const PENTA = [0, 3, 5, 7, 10]; // semitone offsets of the minor pentatonic
const SCALE_STEPS = 15; // quantised altitude bands across ALT_RANGE*2
const NOTE_BASE = 246.94; // B3, cool tonal centre

function noteFreq(step: number): number {
  const oct = Math.floor(step / PENTA.length);
  const deg = ((step % PENTA.length) + PENTA.length) % PENTA.length;
  return NOTE_BASE * Math.pow(2, oct + PENTA[deg] / 12);
}

// one crystalline pluck (two partials + a shimmer), routed to the safe master.
function runPluck(ctx: AudioContext, dest: AudioNode, freq: number, gain: number) {
  const now = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(dest);
  const partials: Array<[number, number, number]> = [
    [1, gain, 0.9], // fundamental
    [2.001, gain * 0.36, 0.55], // octave shimmer
    [3.003, gain * 0.14, 0.32], // airy top
  ];
  for (const [ratio, amp, dur] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ── per-gate re-seedable state ───────────────────────────────────────────────
type Gate = {
  s: number; // absolute path coordinate of the gate
  radius: number;
  spin: number; // rotation of the shard ring
};

type InputMode = "auto" | "tilt" | "drag" | "keys";

export default function TiltglidePage() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<ShepardEngine | null>(null);

  // control state (read/written inside the loop)
  const rafRef = useRef(0);
  const headingCtrlRef = useRef(0); // -1..1 target steer
  const diveCtrlRef = useRef(0); // -1..1 target dive
  const headingRef = useRef(0); // smoothed lateral offset
  const altitudeRef = useRef(0); // smoothed altitude
  const traveledRef = useRef(0); // monotonic path distance
  const noteStepRef = useRef<number | null>(null);
  const modeRef = useRef<InputMode>("auto");

  // input arbitration
  const lastInputRef = useRef(0);
  const lastTiltRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const keyRef = useRef({ up: false, down: false, left: false, right: false });

  // discrete UI state
  const [started, setStarted] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [glError, setGlError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [mode, setMode] = useState<InputMode>("auto");

  // ── audio start (deferred to a user gesture; also asks for tilt on iOS) ──────
  const startAudio = useCallback(async () => {
    if (!ctxRef.current) {
      try {
        const Ctor: typeof AudioContext =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) {
          setAudioError("Web Audio is unavailable — visuals only.");
        } else {
          const ctx = new Ctor();
          if (ctx.state === "suspended") {
            try {
              await ctx.resume();
            } catch {
              /* the gesture should cover this */
            }
          }
          const master = createSafeMaster(ctx);
          const engine = startShepard(ctx, master.input, {
            dir: -1,
            peakGain: 0.4,
            driveRate: 0.14,
          });
          ctxRef.current = ctx;
          masterRef.current = master;
          engineRef.current = engine;
          setAudioOn(true);
        }
      } catch {
        setAudioError("Audio failed to start — visuals continue silently.");
      }
    }

    // iOS 13+ requires a gesture-scoped permission request for motion.
    try {
      const doe = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (doe && typeof doe.requestPermission === "function") {
        const res = await doe.requestPermission();
        if (res !== "granted") {
          setAudioError("Tilt denied — drag or arrow keys still fly.");
        }
      }
    } catch {
      /* non-iOS or already granted */
    }

    setStarted(true);
  }, []);

  const stopAudio = useCallback(() => {
    try {
      engineRef.current?.stop();
    } catch {
      /* closing */
    }
    try {
      masterRef.current?.disconnect();
    } catch {
      /* closing */
    }
    const ctx = ctxRef.current;
    engineRef.current = null;
    masterRef.current = null;
    ctxRef.current = null;
    if (ctx) void ctx.close();
    setAudioOn(false);
  }, []);

  // ── build + run the three.js flight ──────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setGlError(true);
      return;
    }

    const reduced = prefersReducedMotion();
    const speedScale = reduced ? 0.5 : 1;
    const motionDamp = reduced ? 0.55 : 1;

    let w = mount.clientWidth || window.innerWidth;
    let h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    const BG = 0x030710;
    renderer.setClearColor(BG, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG, 0.026);

    const camera = new THREE.PerspectiveCamera(64, w / h, 0.1, 400);
    camera.position.set(0, 0, 0);

    // shard geometry: an elongated octahedron = a crystal splinter
    const shardGeo = new THREE.OctahedronGeometry(1, 0);
    shardGeo.scale(0.16, 0.9, 0.16);

    // aqua / ice palette (ART layer — raw hex allowed here)
    const coreMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      fog: true,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });

    const coreMesh = new THREE.InstancedMesh(shardGeo, coreMat, TOTAL);
    const haloGeo = new THREE.OctahedronGeometry(1, 0);
    haloGeo.scale(0.34, 1.25, 0.34); // halo is a fatter glow around the core
    const haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, TOTAL);
    coreMesh.frustumCulled = false;
    haloMesh.frustumCulled = false;
    scene.add(haloMesh);
    scene.add(coreMesh);

    // per-shard fixed local layout (recomputed on gate recycle)
    const shAngle = new Float32Array(TOTAL);
    const shRadius = new Float32Array(TOTAL);
    const shZoff = new Float32Array(TOTAL);
    const shScale = new Float32Array(TOTAL);
    const shQuat: THREE.Quaternion[] = [];
    for (let i = 0; i < TOTAL; i++) shQuat.push(new THREE.Quaternion());

    const gates: Gate[] = [];
    let recycleCount = 0;

    const coreCol = new THREE.Color();
    const haloCol = new THREE.Color();
    const zAxis = new THREE.Vector3(0, 0, 1);

    // re-seed one gate's shards from a fresh hash → deterministic, non-repeating
    const reseedGate = (gi: number) => {
      const gate = gates[gi];
      const seed = hashStr(`tiltglide|${gi}|${recycleCount++}|${gate.s.toFixed(1)}`);
      const rng = mulberry32(seed);
      gate.radius = 3.4 + rng() * 3.6;
      gate.spin = rng() * Math.PI * 2;
      const hue = 0.5 + rng() * 0.06; // aqua → ice-blue band
      for (let k = 0; k < SHARDS_PER_GATE; k++) {
        const idx = gi * SHARDS_PER_GATE + k;
        const jitter = (rng() - 0.5) * 0.5;
        shAngle[idx] = gate.spin + (k / SHARDS_PER_GATE) * Math.PI * 2 + jitter;
        shRadius[idx] = gate.radius * (0.82 + rng() * 0.4);
        shZoff[idx] = (rng() - 0.5) * 2.6;
        shScale[idx] = 0.7 + rng() * 1.5;
        // orient the shard's long (Y) axis along the radial direction
        shQuat[idx].setFromAxisAngle(zAxis, shAngle[idx] + Math.PI / 2);
        // per-shard colour: cool crystal, occasional brighter ice
        const light = 0.45 + rng() * 0.5;
        coreCol.setHSL(hue, 0.72, 0.32 + light * 0.28);
        haloCol.setHSL(hue + 0.02, 0.85, 0.55 + light * 0.35);
        coreMesh.setColorAt(idx, coreCol);
        haloMesh.setColorAt(idx, haloCol);
      }
    };

    // init gates spread across the buffer, then seed each
    for (let gi = 0; gi < NUM_GATES; gi++) {
      gates.push({ s: (gi + 1) * SPACING, radius: 4, spin: 0 });
      reseedGate(gi);
    }
    if (coreMesh.instanceColor) coreMesh.instanceColor.needsUpdate = true;
    if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;

    // reusable scratch objects (no per-frame allocation)
    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const upVec = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    // seeded auto-pilot: smooth drift of the tilt controls
    const autoRng = mulberry32(hashStr("tiltglide-autopilot"));
    const autoPh = [
      autoRng() * 6.283,
      autoRng() * 6.283,
      autoRng() * 6.283,
      autoRng() * 6.283,
    ];

    let prev = performance.now();
    const startTs = prev;
    // seed lastInput so the auto-pilot drives immediately on mount
    lastInputRef.current = prev - 6000;

    const frame = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0, (ts - prev) / 1000));
      prev = ts;
      const t = (ts - startTs) / 1000;

      // ── choose input source ────────────────────────────────────────────────
      const idle = ts - lastInputRef.current > 4500;
      let nextMode: InputMode;
      if (idle) {
        // seeded auto-pilot — smooth sine drift, never repeats exactly
        headingCtrlRef.current = clamp(
          Math.sin(t * 0.23 + autoPh[0]) * 0.7 +
            Math.sin(t * 0.071 + autoPh[1]) * 0.5,
          -1,
          1,
        );
        diveCtrlRef.current = clamp(
          Math.sin(t * 0.19 + autoPh[2]) * 0.6 +
            Math.sin(t * 0.053 + autoPh[3]) * 0.5,
          -1,
          1,
        );
        nextMode = "auto";
      } else if (ts - lastTiltRef.current < 900) {
        nextMode = "tilt";
      } else if (dragRef.current) {
        nextMode = "drag";
      } else {
        nextMode = "keys";
      }
      if (nextMode !== modeRef.current) {
        modeRef.current = nextMode;
        setMode(nextMode);
      }

      // ── keyboard fallback feeds the control targets ────────────────────────
      if (!idle && nextMode === "keys") {
        const k = keyRef.current;
        headingCtrlRef.current = (k.right ? 1 : 0) - (k.left ? 1 : 0);
        diveCtrlRef.current = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      }

      // ── smooth toward the steered targets ──────────────────────────────────
      const kSmooth = 1 - Math.exp(-dt / 0.5);
      const hTarget = headingCtrlRef.current * STEER_RANGE * motionDamp;
      const aTarget = -diveCtrlRef.current * ALT_RANGE * motionDamp; // dive = descend
      headingRef.current += (hTarget - headingRef.current) * kSmooth;
      altitudeRef.current += (aTarget - altitudeRef.current) * kSmooth;

      // ── advance the fall ────────────────────────────────────────────────────
      const diveMag = Math.abs(diveCtrlRef.current);
      const speed = BASE_SPEED * (1 + diveMag * 0.45) * speedScale;
      traveledRef.current += speed * dt;
      const traveled = traveledRef.current;

      // ── camera world offset (centreline + player steer/altitude) ───────────
      const camX = centreX(traveled) + headingRef.current;
      const camY = centreY(traveled) + altitudeRef.current;

      // ── recycle + place every gate ─────────────────────────────────────────
      for (let gi = 0; gi < NUM_GATES; gi++) {
        const gate = gates[gi];
        let ahead = gate.s - traveled; // >0 in front, <0 behind
        if (ahead < -PASS) {
          gate.s += FAR; // send to the far end
          reseedGate(gi);
          ahead = gate.s - traveled;
        }
        const gx = centreX(gate.s) - camX;
        const gy = centreY(gate.s) - camY;
        const gz = -ahead; // ahead → negative z (into the screen)

        for (let k = 0; k < SHARDS_PER_GATE; k++) {
          const idx = gi * SHARDS_PER_GATE + k;
          const ang = shAngle[idx];
          const r = shRadius[idx];
          pos.set(
            gx + Math.cos(ang) * r,
            gy + Math.sin(ang) * r,
            gz + shZoff[idx],
          );
          const sc = shScale[idx];
          scl.set(sc, sc, sc);
          mat4.compose(pos, shQuat[idx], scl);
          coreMesh.setMatrixAt(idx, mat4);
          haloMesh.setMatrixAt(idx, mat4);
        }
      }
      coreMesh.instanceMatrix.needsUpdate = true;
      haloMesh.instanceMatrix.needsUpdate = true;
      if (coreMesh.instanceColor) coreMesh.instanceColor.needsUpdate = true;
      if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;

      // ── bank the camera into the turn ──────────────────────────────────────
      const curveAhead = centreX(traveled + LOOKAHEAD) - centreX(traveled);
      const roll =
        clamp(-curveAhead * 0.05 - headingRef.current * 0.03, -0.5, 0.5) *
        motionDamp;
      upVec.set(Math.sin(roll), Math.cos(roll), 0);
      camera.up.copy(upVec);
      lookTarget.set(
        centreX(traveled + LOOKAHEAD) - camX,
        centreY(traveled + LOOKAHEAD) - camY,
        -LOOKAHEAD,
      );
      camera.lookAt(lookTarget);

      // ── altitude → pentatonic lead (retrigger on band crossings) ───────────
      const engine = engineRef.current;
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (engine && ctx && master) {
        const altNorm = clamp01((altitudeRef.current + ALT_RANGE) / (ALT_RANGE * 2));
        const step = Math.round(altNorm * (SCALE_STEPS - 1));
        if (noteStepRef.current === null) {
          noteStepRef.current = step;
        } else if (step !== noteStepRef.current) {
          noteStepRef.current = step;
          const g = 0.12 + Math.abs(diveCtrlRef.current) * 0.05;
          runPluck(ctx, master.input, noteFreq(step), g);
        }
        // Shepard descent drive scales with dive energy + fall speed
        engine.setDrive(clamp01(0.18 + diveMag * 0.5 + 0.12));
        engine.step(dt);
      }

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    // ── resize ──────────────────────────────────────────────────────────────
    const onResize = () => {
      w = mount.clientWidth || window.innerWidth;
      h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── device tilt ─────────────────────────────────────────────────────────
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null && e.beta === null) return;
      lastTiltRef.current = performance.now();
      lastInputRef.current = performance.now();
      const gamma = e.gamma ?? 0; // left/right, ~[-90,90]
      const beta = e.beta ?? 0; // front/back, ~[-180,180]
      headingCtrlRef.current = clamp(gamma / 32, -1, 1);
      // hold the phone ~45° forward as neutral; tilt further to dive
      diveCtrlRef.current = clamp((beta - 45) / 32, -1, 1);
    };
    window.addEventListener("deviceorientation", onOrient);

    // ── pointer-drag fallback ────────────────────────────────────────────────
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest("[data-chrome]")) return;
      dragRef.current = { x: e.clientX, y: e.clientY };
      lastInputRef.current = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      lastInputRef.current = performance.now();
      const dx = (e.clientX - d.x) / (window.innerWidth * 0.32);
      const dy = (e.clientY - d.y) / (window.innerHeight * 0.32);
      headingCtrlRef.current = clamp(dx, -1, 1);
      diveCtrlRef.current = clamp(dy, -1, 1);
    };
    const onUp = () => {
      dragRef.current = null;
      headingCtrlRef.current = 0;
      diveCtrlRef.current = 0;
      lastInputRef.current = performance.now();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    // ── arrow-key fallback ───────────────────────────────────────────────────
    const setKey = (key: string, on: boolean): boolean => {
      const k = keyRef.current;
      switch (key) {
        case "ArrowUp":
          k.up = on;
          return true;
        case "ArrowDown":
          k.down = on;
          return true;
        case "ArrowLeft":
          k.left = on;
          return true;
        case "ArrowRight":
          k.right = on;
          return true;
        default:
          return false;
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (setKey(e.key, true)) {
        e.preventDefault();
        lastInputRef.current = performance.now();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (setKey(e.key, false)) {
        e.preventDefault();
        lastInputRef.current = performance.now();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── teardown ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      shardGeo.dispose();
      haloGeo.dispose();
      coreMat.dispose();
      haloMat.dispose();
      coreMesh.dispose();
      haloMesh.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ── full audio teardown on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        engineRef.current?.stop();
      } catch {
        /* closing */
      }
      try {
        masterRef.current?.disconnect();
      } catch {
        /* closing */
      }
      const ctx = ctxRef.current;
      engineRef.current = null;
      masterRef.current = null;
      ctxRef.current = null;
      if (ctx) void ctx.close();
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* three.js flight canvas */}
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none select-none"
        aria-hidden
      />

      {glError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-8">
          <div className="max-w-md space-y-3 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              webgl unavailable
            </p>
            <p className="text-base text-muted-foreground">
              This crystal canyon needs WebGL, which is not available in this
              browser. Everything else on the page still works.
            </p>
          </div>
        </div>
      )}

      {/* chrome — semantic tokens only */}
      <div
        data-chrome
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="pointer-events-auto">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Tiltglide
            </h1>
            <p className="mt-1 max-w-md text-base text-muted-foreground">
              Tilt your phone to fly an endless canyon of singing crystal. Your
              altitude is the melody — climb and dive to play the scale.
            </p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={startAudio}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {started ? "Begin sound" : "Start flight"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopAudio}
                className="min-h-[44px] rounded-md border border-border bg-muted px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Mute
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-[44px] rounded-md border border-border bg-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {showNotes ? "Close" : "Notes"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>input · {mode}</span>
          {mode === "auto" && (
            <span className="text-muted-foreground/80">
              auto-flying — tilt, drag, or arrow keys to steer
            </span>
          )}
          {audioError && <span className="text-destructive">{audioError}</span>}
        </div>
      </div>

      {/* notes panel */}
      {showNotes && (
        <div
          data-chrome
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[62vh] overflow-y-auto border-t border-border bg-popover/92 p-6 backdrop-blur-md sm:p-8"
        >
          <div className="mx-auto max-w-2xl space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              the flight
            </p>
            <p>
              A boundless chasm rendered in three.js: 44 crystalline gates scroll
              out of the fog toward you and recycle behind, each re-seeded from a
              fresh hash so the descent never ends or obviously repeats. The whole
              canyon snakes along a sine-sum centreline and the camera banks into
              the turns.
            </p>
            <p>
              Tilt left/right to steer and forward/back to dive. Your altitude is
              quantised to a minor-pentatonic lead that retriggers as you cross
              each band, sung over a Shepard–Risset endless-descent drone so the
              whole piece feels like perpetual falling. No sensor? A pointer drag
              or the arrow keys fly just as well, and a seeded auto-pilot takes
              over whenever you let go.
            </p>
            <p className="text-muted-foreground/80">
              Refs: R. N. Shepard, &ldquo;Circularity in Judgments of Relative
              Pitch,&rdquo; JASA 36 (1964); J.-C. Risset&rsquo;s continuous
              glissando realisation of the endless-pitch illusion.
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["11408-tiltglide"]} />
    </main>
  );
}
