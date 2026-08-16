"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  REAL_TRACKS,
  loadRealTrackBuffer,
  type WelcomeHomeTrack,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { README_TEXT } from "./readme-text";

// ─────────────────────────────────────────────────────────────────────────────
// 13840-hallofsongs · "Walk inside your own catalog — where you stand IS the mix."
//
//   A first-person 3D hall. Each of Karel's real piano recordings is a luminous
//   standing monolith placed around a dark violet room. EVERY track plays at
//   once, each spatialized by a Web Audio HRTF PannerNode at its body's position
//   with equal-power inverse-distance attenuation. Walk (WASD + mouse-look on
//   desktop; twin touch joysticks on mobile) and his whole catalog continuously
//   re-mixes in 3D around your head: step toward a pillar and its song blooms
//   loud and clear; leave it behind and it fades to a whisper. Each body's glow
//   pulses to its OWN contribution, and the nearest song floats its title.
// ─────────────────────────────────────────────────────────────────────────────

const TWO_PI = Math.PI * 2;
const N = 8; // curated subset: the first 8 Welcome Home tracks

// audio distance field (meters). Inverse model → dramatic proximity, whisper floor.
const REF_DIST = 3;
const ROLLOFF = 1.25;
const MAX_DIST = 90;

const EYE_Y = 1.7;
const MOVE_SPEED = 6.2; // m/s
const HALL_RADIUS = 26; // clamp the walk inside the room
const RING_RADIUS = 15; // where the monoliths stand

// cool violet → indigo → ice ramp (canvas art only)
const PALETTE = [
  0x8b5cf6, 0x7c3aed, 0x6d28d9, 0x6366f1, 0x4f46e5, 0x4338ca, 0x38bdf8,
  0xa5b4fc,
];

// ── deterministic PRNG (seed once; never Math.random / Date.now) ─────────────
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

// mirror of the panner's inverse distance model — drives the visual brightness
// so the eye reads what the ear hears.
function computeProximity(dist: number): number {
  return REF_DIST / (REF_DIST + ROLLOFF * Math.max(0, dist - REF_DIST));
}

// a soft radial glow sprite texture (seeded gradient; no randomness needed)
function drawGlowTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.14)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ── one track's standing body (created visually at mount; audio attached later)
interface Body {
  track: WelcomeHomeTrack;
  color: THREE.Color;
  pos: THREE.Vector3;
  pillar: THREE.Mesh;
  glow: THREE.Sprite;
  phase: number; // seeded idle-shimmer phase
  // audio (attached on Enter)
  panner: PannerNode | null;
  gain: GainNode | null;
  analyser: AnalyserNode | null;
  data: Uint8Array<ArrayBuffer> | null;
  amp: number; // smoothed own amplitude 0..1
  loaded: boolean;
}

type Phase = "idle" | "loading" | "walking";

export default function HallOfSongsPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hud, setHud] = useState<{ nearest: string; loaded: number }>({
    nearest: "—",
    loaded: 0,
  });

  // three.js
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bodiesRef = useRef<Body[]>([]);
  const glowTexRef = useRef<THREE.CanvasTexture | null>(null);
  const disposablesRef = useRef<
    { dispose: () => void }[]
  >([]);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const enteredRef = useRef(false);

  // input / camera state
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const posRef = useRef(new THREE.Vector3(0, EYE_Y, 6));
  const moveJoyRef = useRef({ x: 0, y: 0 }); // left stick: strafe / forward
  const lookJoyRef = useRef({ x: 0, y: 0 }); // right stick: look rate
  const lockedRef = useRef(false);

  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const hudTickRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      setIsTouch(window.matchMedia("(pointer: coarse)").matches);
    }
  }, []);

  // ── build the hall (runs at mount; alive before any audio) ──────────────────
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
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x05030c, 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05030c);
    scene.fog = new THREE.Fog(0x05030c, 9, 58);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      72,
      mount.clientWidth / mount.clientHeight,
      0.1,
      240,
    );
    camera.rotation.order = "YXZ";
    camera.position.copy(posRef.current);
    cameraRef.current = camera;

    // faint form-giving light; emissive materials carry the glow
    const hemi = new THREE.HemisphereLight(0x4c3a8f, 0x05030c, 0.35);
    scene.add(hemi);

    // floor grid — architectural, cool
    const grid = new THREE.GridHelper(120, 96, 0x3b2f6b, 0x140f2b);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    scene.add(grid);
    disposablesRef.current.push(grid.geometry, grid.material as THREE.Material);

    // floating dust for depth (seeded)
    const dustRng = mulberry32(0x13840);
    const dustCount = 420;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (dustRng() - 0.5) * 90;
      dustPos[i * 3 + 1] = dustRng() * 16;
      dustPos[i * 3 + 2] = (dustRng() - 0.5) * 90;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0x8b7fd6,
      size: 0.09,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);
    disposablesRef.current.push(dustGeo, dustMat);

    const glowTex = drawGlowTexture();
    glowTexRef.current = glowTex;
    disposablesRef.current.push(glowTex);

    // one monolith per curated track, ringed around the center with seeded jitter
    const placeRng = mulberry32(0x5a17c3);
    const tracks = REAL_TRACKS.slice(0, N);
    const bodies: Body[] = [];
    const pillarGeo = new THREE.CylinderGeometry(0.55, 0.7, 6.2, 24);
    disposablesRef.current.push(pillarGeo);

    tracks.forEach((track, i) => {
      const baseAngle = (i / N) * TWO_PI;
      const angle = baseAngle + (placeRng() - 0.5) * 0.35;
      const radius = RING_RADIUS + (placeRng() - 0.5) * 7;
      const color = new THREE.Color(PALETTE[i % PALETTE.length]);
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        3.1,
        Math.sin(angle) * radius,
      );

      const mat = new THREE.MeshStandardMaterial({
        color: 0x0a0713,
        emissive: color.clone(),
        emissiveIntensity: 0.9,
        roughness: 0.85,
        metalness: 0.1,
      });
      const pillar = new THREE.Mesh(pillarGeo, mat);
      pillar.position.copy(pos);
      scene.add(pillar);
      disposablesRef.current.push(mat);

      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: color.clone(),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(9, 11, 1);
      glow.position.copy(pos);
      scene.add(glow);
      disposablesRef.current.push(glowMat);

      bodies.push({
        track,
        color,
        pos,
        pillar,
        glow,
        phase: placeRng() * TWO_PI,
        panner: null,
        gain: null,
        analyser: null,
        data: null,
        amp: 0,
        loaded: false,
      });
    });
    bodiesRef.current = bodies;

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── the walk / re-mix / render loop ───────────────────────────────────────
    const fwd = new THREE.Vector3();
    const tmp = new THREE.Vector3();

    const frame = (tsMs: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const ts = tsMs / 1000;
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      if (!(dt > 0) || dt > 0.05) dt = 0.016;

      const walking = phaseRef.current === "walking";

      // 1) look: joystick look-rate (touch) always applies; mouse handled by move handler
      yawRef.current -= lookJoyRef.current.x * dt * 2.6;
      pitchRef.current = clamp(
        pitchRef.current - lookJoyRef.current.y * dt * 2.0,
        -1.2,
        1.2,
      );

      // 2) move
      const yaw = yawRef.current;
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      // horizontal basis: forward (-sinY,-cosY), right (cosY,-sinY)
      let mf = 0;
      let mr = 0;
      if (walking) {
        const keys = keysRef.current;
        if (keys.has("w")) mf += 1;
        if (keys.has("s")) mf -= 1;
        if (keys.has("d")) mr += 1;
        if (keys.has("a")) mr -= 1;
        mf += -moveJoyRef.current.y; // stick up = forward
        mr += moveJoyRef.current.x;
      } else {
        // idle self-demo: a slow seeded drift so the hall is alive on load
        yawRef.current += dt * 0.12;
        mf = 0.35 + 0.25 * Math.sin(ts * 0.2);
      }
      const len = Math.hypot(mf, mr);
      if (len > 1) {
        mf /= len;
        mr /= len;
      }
      const p = posRef.current;
      p.x += (-sinY * mf + cosY * mr) * MOVE_SPEED * dt;
      p.z += (-cosY * mf - sinY * mr) * MOVE_SPEED * dt;
      // clamp inside the hall
      const r = Math.hypot(p.x, p.z);
      if (r > HALL_RADIUS) {
        p.x = (p.x / r) * HALL_RADIUS;
        p.z = (p.z / r) * HALL_RADIUS;
      }
      p.y = EYE_Y;

      camera.position.copy(p);
      camera.rotation.y = yawRef.current;
      camera.rotation.x = pitchRef.current;

      // 3) drive the AudioListener (position + orientation) from the camera
      const ctx = ctxRef.current;
      if (ctx && enteredRef.current) {
        camera.getWorldDirection(fwd);
        const l = ctx.listener;
        const now = ctx.currentTime;
        if (l.positionX) {
          l.positionX.setTargetAtTime(p.x, now, 0.02);
          l.positionY.setTargetAtTime(p.y, now, 0.02);
          l.positionZ.setTargetAtTime(p.z, now, 0.02);
          l.forwardX.setTargetAtTime(fwd.x, now, 0.02);
          l.forwardY.setTargetAtTime(fwd.y, now, 0.02);
          l.forwardZ.setTargetAtTime(fwd.z, now, 0.02);
          l.upX.setTargetAtTime(0, now, 0.02);
          l.upY.setTargetAtTime(1, now, 0.02);
          l.upZ.setTargetAtTime(0, now, 0.02);
        } else {
          const ld = l as unknown as {
            setPosition(x: number, y: number, z: number): void;
            setOrientation(
              fx: number,
              fy: number,
              fz: number,
              ux: number,
              uy: number,
              uz: number,
            ): void;
          };
          ld.setPosition(p.x, p.y, p.z);
          ld.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
        }
      }

      // 4) per-body amplitude + proximity → glow, scale, dominant label
      let bestScore = -1;
      let bestBody: Body | null = null;
      for (const b of bodiesRef.current) {
        // own amplitude from its analyser (its own contribution)
        let target = 0;
        if (b.analyser && b.data) {
          b.analyser.getByteFrequencyData(b.data);
          let sum = 0;
          for (let i = 0; i < b.data.length; i++) sum += b.data[i];
          target = sum / (b.data.length * 255);
        }
        b.amp = lerp(b.amp, target, clamp(dt * 6, 0, 1));

        tmp.set(b.pos.x - p.x, 0, b.pos.z - p.z);
        const dist = tmp.length();
        const prox = computeProximity(dist);

        // idle shimmer before audio; audio-driven once loaded
        const shimmer = 0.5 + 0.5 * Math.sin(ts * 0.9 + b.phase);
        const heard = b.loaded ? b.amp : shimmer * 0.4;
        const lit = heard * (0.35 + prox * 1.3);

        const mat = b.pillar.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.6 + lit * 3.4;
        const gm = b.glow.material as THREE.SpriteMaterial;
        gm.opacity = 0.28 + lit * 0.9;
        const gs = 8.5 + lit * 5;
        b.glow.scale.set(gs, gs * 1.25, 1);
        const py = 1 + heard * 0.25;
        b.pillar.scale.set(1, py, 1);

        const score = b.loaded ? b.amp * prox : prox;
        if (score > bestScore) {
          bestScore = score;
          bestBody = b;
        }
      }

      // 5) float the dominant song's title above its body (projected to screen)
      const label = labelRef.current;
      if (label && bestBody) {
        tmp.copy(bestBody.pos);
        tmp.y += 4.2;
        tmp.project(camera);
        const inView = tmp.z < 1 && tmp.x > -1.3 && tmp.x < 1.3;
        if (inView) {
          const sx = (tmp.x * 0.5 + 0.5) * mount.clientWidth;
          const sy = (-tmp.y * 0.5 + 0.5) * mount.clientHeight;
          label.style.opacity = "1";
          label.style.transform = `translate(-50%,-50%) translate(${sx}px,${sy}px)`;
          if (label.textContent !== bestBody.track.title) {
            label.textContent = bestBody.track.title;
          }
        } else {
          label.style.opacity = "0";
        }
      } else if (label) {
        label.style.opacity = "0";
      }

      // 6) throttled HUD
      hudTickRef.current++;
      if (hudTickRef.current % 12 === 0 && bestBody) {
        let loadedN = 0;
        for (const b of bodiesRef.current) if (b.loaded) loadedN++;
        setHud({ nearest: bestBody.track.title, loaded: loadedN });
      }

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const d of disposablesRef.current) {
        try {
          d.dispose();
        } catch {
          /* noop */
        }
      }
      disposablesRef.current = [];
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      bodiesRef.current = [];
    };
  }, []);

  // ── keyboard (WASD) ─────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(k)) {
        keysRef.current.add(k);
        if (phaseRef.current === "walking") e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ── mouse-look via pointer lock (desktop) ───────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!lockedRef.current) return;
      yawRef.current -= e.movementX * 0.0022;
      pitchRef.current = clamp(
        pitchRef.current - e.movementY * 0.0022,
        -1.2,
        1.2,
      );
    };
    const onLockChange = () => {
      const el = rendererRef.current?.domElement;
      const isLocked = !!el && document.pointerLockElement === el;
      lockedRef.current = isLocked;
      setLocked(isLocked);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, []);

  const requestLook = useCallback(() => {
    if (isTouch) return;
    const el = rendererRef.current?.domElement;
    el?.requestPointerLock?.();
  }, [isTouch]);

  // ── twin touch joysticks ────────────────────────────────────────────────────
  const makeJoystick = useCallback(
    (target: { current: { x: number; y: number } }) => {
      const start = { x: 0, y: 0 };
      const RADIUS = 52;
      const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        start.x = e.clientX;
        start.y = e.clientY;
        target.current.x = 0;
        target.current.y = 0;
      };
      const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.buttons === 0 && e.pointerType === "mouse") return;
        const dx = clamp((e.clientX - start.x) / RADIUS, -1, 1);
        const dy = clamp((e.clientY - start.y) / RADIUS, -1, 1);
        target.current.x = dx;
        target.current.y = dy;
      };
      const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
        (e.target as Element).releasePointerCapture?.(e.pointerId);
        target.current.x = 0;
        target.current.y = 0;
      };
      return { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp };
    },
    [],
  );

  const moveStick = useRef(makeJoystick(moveJoyRef)).current;
  const lookStick = useRef(makeJoystick(lookJoyRef)).current;

  // ── Enter the hall: start audio, load the subset, attach panners ────────────
  const enter = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "walking") {
      // already inside — just re-capture the mouse
      requestLook();
      return;
    }
    setError(null);
    setNotice(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      let safe = safeRef.current;
      if (!safe) {
        safe = createSafeMaster(ctx);
        safeRef.current = safe;
      }
      enteredRef.current = true;
      setPhase("walking");
      requestLook();

      // load the curated subset sequentially (caps peak decode memory), fading
      // each track in as it arrives so the hall fills with sound progressively.
      let anyOk = false;
      let anyFail = false;
      for (const b of bodiesRef.current) {
        if (!ctxRef.current || ctxRef.current.state === "closed") break;
        if (!enteredRef.current) break;
        try {
          const { buffer } = await loadRealTrackBuffer(ctx, b.track.id);
          if (!enteredRef.current) break;

          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;

          const panner = ctx.createPanner();
          panner.panningModel = "HRTF";
          panner.distanceModel = "inverse";
          panner.refDistance = REF_DIST;
          panner.rolloffFactor = ROLLOFF;
          panner.maxDistance = MAX_DIST;
          if (panner.positionX) {
            panner.positionX.value = b.pos.x;
            panner.positionY.value = b.pos.y;
            panner.positionZ.value = b.pos.z;
          } else {
            (
              panner as unknown as {
                setPosition(x: number, y: number, z: number): void;
              }
            ).setPosition(b.pos.x, b.pos.y, b.pos.z);
          }

          const gain = ctx.createGain();
          gain.gain.value = 0.0001;

          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;

          // src → panner → gain → safe.input ; src → analyser (passive own-amp tap)
          src.connect(panner);
          panner.connect(gain);
          gain.connect(safe.input);
          src.connect(analyser);

          src.start();
          gain.gain.setTargetAtTime(0.85, ctx.currentTime, 1.1);

          b.panner = panner;
          b.gain = gain;
          b.analyser = analyser;
          b.data = new Uint8Array(analyser.frequencyBinCount);
          b.loaded = true;
          anyOk = true;
        } catch {
          anyFail = true;
        }
      }

      if (!anyOk) {
        enteredRef.current = false;
        setError(
          "None of the recordings could load right now. Check your connection and try entering again.",
        );
        setPhase("idle");
        return;
      }
      if (anyFail) {
        setNotice(
          "Some tracks couldn't load and were skipped — the rest of the hall is playing.",
        );
      }
    } catch (err) {
      enteredRef.current = false;
      setError(
        err instanceof Error
          ? `The hall could not open (${err.message}). Try again.`
          : "The hall could not open. Try again.",
      );
      setPhase("idle");
    }
  }, [requestLook]);

  // ── full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      enteredRef.current = false;
      for (const b of bodiesRef.current) {
        try {
          b.gain?.disconnect();
          b.panner?.disconnect();
          b.analyser?.disconnect();
        } catch {
          /* ctx closing */
        }
      }
      safeRef.current?.disconnect();
      safeRef.current = null;
      if (document.pointerLockElement) document.exitPointerLock?.();
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* the 3D hall */}
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none"
        onClick={() => {
          if (phaseRef.current === "walking") requestLook();
        }}
      />

      {/* dominant-song floating label (positioned each frame) */}
      <div
        ref={labelRef}
        className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded-md border border-border/60 bg-background/40 px-2.5 py-1 text-sm font-medium text-foreground backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: 0 }}
      />

      {/* chrome */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* title */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6 pt-14">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            13840 · hall of songs · spatial sound-walk
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Walk inside your catalog
          </h1>
          <p className="text-base text-muted-foreground">
            Every one of Karel&apos;s recordings is a glowing pillar in one dark
            hall, all playing at once. Where you stand is the mix: walk toward a
            song and it blooms; leave it behind and it fades to a whisper.
          </p>
          {phase === "walking" && (
            <p className="text-sm text-primary">
              Nearest · {hud.nearest} · {hud.loaded}/{N} tracks sounding
            </p>
          )}
        </header>
      </div>

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        {error && <p className="max-w-2xl text-sm text-destructive">{error}</p>}
        {!webglOk && (
          <p className="max-w-2xl text-sm text-destructive">
            WebGL is unavailable in this browser, so the hall can&apos;t be
            drawn. Try a hardware-accelerated browser to walk the catalog.
          </p>
        )}
        {notice && !error && (
          <p className="max-w-2xl text-sm text-muted-foreground">{notice}</p>
        )}
        {webglOk && phase !== "walking" && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isTouch
              ? "Left stick walks · right stick looks around."
              : "WASD to walk · move the mouse to look · click the hall to capture the mouse (Esc releases it)."}
          </p>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          {phase !== "walking" ? (
            <button
              onClick={() => void enter()}
              disabled={phase === "loading" || !webglOk}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Opening…" : "Enter the hall"}
            </button>
          ) : (
            !isTouch &&
            !locked && (
              <button
                onClick={requestLook}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Capture the mouse
              </button>
            )
          )}
        </div>
      </div>

      {/* twin touch joysticks */}
      {isTouch && phase === "walking" && (
        <>
          <div
            className="absolute bottom-24 left-6 z-20 flex h-28 w-28 touch-none items-center justify-center rounded-full border border-border/60 bg-background/30 backdrop-blur-sm"
            {...moveStick}
          >
            <span className="pointer-events-none font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              walk
            </span>
          </div>
          <div
            className="absolute bottom-24 right-6 z-20 flex h-28 w-28 touch-none items-center justify-center rounded-full border border-border/60 bg-background/30 backdrop-blur-sm"
            {...lookStick}
          >
            <span className="pointer-events-none font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              look
            </span>
          </div>
        </>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              {README_TEXT.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
