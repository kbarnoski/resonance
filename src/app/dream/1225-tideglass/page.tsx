"use client";

// ── Tideglass ────────────────────────────────────────────────────────────────
// "What if your two hands were grain-heads moving through a cloud of sound —
//  reaching wide scatters it, lifting them raises the pitch, and your body's
//  place in the room pans it in space?"
//
// INPUT  : webcam full-body pose (MediaPipe PoseLandmarker, CDN at runtime) —
//          hands (wrists) + torso. Fallback: two draggable hand-pucks + drift.
// OUTPUT : three.js — a point-cloud grain field in DEPTH, grains lighting up as
//          amber sparks when they fire, the two hands as bright attractors.
// VOICE  : granular synthesis + true stereo spatialization (see audio.ts).
// PALETTE: deep teal → violet nebular gradient with warm amber grain-sparks.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";
import Link from "next/link";
import { GranularEngine } from "./audio";
import {
  createLandmarker,
  frameFromLandmarks,
  makeFrame,
  demoFrame,
  type PoseFrame,
  type PoseLandmarkerInst,
} from "./pose";

type Phase = "idle" | "running";

const CLOUD_COUNT = 1600;
const AMBER = new THREE.Color(1.0, 0.62, 0.24);
const TEAL = new THREE.Color(0.12, 0.82, 0.78);
const VIOLET = new THREE.Color(0.52, 0.2, 0.9);

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  cloud: THREE.Points;
  cloudGeo: THREE.BufferGeometry;
  cloudMat: THREE.PointsMaterial;
  basePos: Float32Array; // per-point world position (for spark lookup)
  baseCol: Float32Array; // per-point dim teal→violet base colour
  colAttr: THREE.BufferAttribute;
  spark: Float32Array; // per-point amber charge, decays each frame
  handMeshes: THREE.Mesh[]; // two attractors
  handHalos: THREE.Mesh[];
  handGeo: THREE.SphereGeometry;
  haloGeo: THREE.SphereGeometry;
  handMats: THREE.MeshBasicMaterial[];
  haloMats: THREE.MeshBasicMaterial[];
}

// Normalized ([-1,1] y-up) hand → world position. Hands sit inside the cloud
// volume so they move THROUGH the grain field.
function worldOf(x: number, y: number): [number, number, number] {
  return [x * 5.5, y * 3.6, -3.4];
}

export default function TideglassPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [glError, setGlError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const engineRef = useRef<GranularEngine | null>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const startedAtRef = useRef<number>(0);
  const lastPoseAtRef = useRef<number>(0);
  const smoothRef = useRef<PoseFrame | null>(null);
  const levelRef = useRef<[number, number]>([0, 0]); // smoothed spark level/hand

  // Fallback pucks: normalized [-1,1] y-up. Drift when not being dragged.
  const puckRef = useRef({ lx: -0.7, ly: 0.1, rx: 0.7, ry: 0.1 });
  const dragRef = useRef<"left" | "right" | null>(null);
  const leftPuckElRef = useRef<HTMLDivElement>(null);
  const rightPuckElRef = useRef<HTMLDivElement>(null);

  // Write the fallback pucks' on-screen position straight to the DOM (they move
  // via the rAF loop, which mutates a ref and must not trigger React re-renders).
  const syncPuckDom = useCallback(() => {
    const p = puckRef.current;
    const l = leftPuckElRef.current;
    const r = rightPuckElRef.current;
    if (l) {
      l.style.left = `${((p.lx + 1) / 2) * 100}%`;
      l.style.top = `${((1 - p.ly) / 2) * 100}%`;
    }
    if (r) {
      r.style.left = `${((p.rx + 1) / 2) * 100}%`;
      r.style.top = `${((1 - p.ry) / 2) * 100}%`;
    }
  }, []);

  // ── three.js scene construction ──
  const buildScene = useCallback((): boolean => {
    const mount = mountRef.current;
    if (!mount) return false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setGlError(true);
      return false;
    }
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0); // gradient comes from CSS behind
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 100);
    camera.position.set(0, 0, 6.2);
    camera.lookAt(0, 0, -4);

    const group = new THREE.Group();
    scene.add(group);

    // Point-cloud grain field distributed through a volume in depth.
    const basePos = new Float32Array(CLOUD_COUNT * 3);
    const baseCol = new Float32Array(CLOUD_COUNT * 3);
    const colArr = new Float32Array(CLOUD_COUNT * 3);
    const spark = new Float32Array(CLOUD_COUNT);
    const tmp = new THREE.Color();
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const x = (Math.random() * 2 - 1) * 6.2;
      const y = (Math.random() * 2 - 1) * 4.0;
      const z = -1 - Math.random() * 13; // -1 (near) .. -14 (far)
      basePos[i * 3] = x;
      basePos[i * 3 + 1] = y;
      basePos[i * 3 + 2] = z;
      // Depth gradient: near = teal, far = violet. Dim base so sparks read.
      const t = THREE.MathUtils.clamp((z + 14) / 13, 0, 1); // 0 far .. 1 near
      tmp.copy(VIOLET).lerp(TEAL, t);
      const dim = 0.28 + Math.random() * 0.14;
      baseCol[i * 3] = tmp.r * dim;
      baseCol[i * 3 + 1] = tmp.g * dim;
      baseCol[i * 3 + 2] = tmp.b * dim;
      colArr[i * 3] = baseCol[i * 3];
      colArr[i * 3 + 1] = baseCol[i * 3 + 1];
      colArr[i * 3 + 2] = baseCol[i * 3 + 2];
    }
    const cloudGeo = new THREE.BufferGeometry();
    cloudGeo.setAttribute("position", new THREE.BufferAttribute(basePos, 3));
    const colAttr = new THREE.BufferAttribute(colArr, 3);
    cloudGeo.setAttribute("color", colAttr);
    const cloudMat = new THREE.PointsMaterial({
      size: 0.08,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cloud = new THREE.Points(cloudGeo, cloudMat);
    group.add(cloud);

    // Two hand attractors (amber core + soft halo), additive glow.
    const handGeo = new THREE.SphereGeometry(0.16, 20, 20);
    const haloGeo = new THREE.SphereGeometry(0.5, 20, 20);
    const handMeshes: THREE.Mesh[] = [];
    const handHalos: THREE.Mesh[] = [];
    const handMats: THREE.MeshBasicMaterial[] = [];
    const haloMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 2; i++) {
      const core = new THREE.MeshBasicMaterial({
        color: 0xffc06a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.MeshBasicMaterial({
        color: 0xff9838,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
      });
      const cm = new THREE.Mesh(handGeo, core);
      const hm = new THREE.Mesh(haloGeo, halo);
      group.add(hm);
      group.add(cm);
      handMeshes.push(cm);
      handHalos.push(hm);
      handMats.push(core);
      haloMats.push(halo);
    }

    sceneRef.current = {
      renderer,
      scene,
      camera,
      group,
      cloud,
      cloudGeo,
      cloudMat,
      basePos,
      baseCol,
      colAttr,
      spark,
      handMeshes,
      handHalos,
      handGeo,
      haloGeo,
      handMats,
      haloMats,
    };
    return true;
  }, []);

  // Boost the cloud point nearest a hand's world position → an amber spark.
  const boostNear = useCallback(
    (s: SceneRefs, wx: number, wy: number, wz: number) => {
      let best = -1;
      let bestD = Infinity;
      // Sample a handful of random points; boost the closest. Cheap + lively.
      for (let k = 0; k < 18; k++) {
        const idx = (Math.random() * CLOUD_COUNT) | 0;
        const dx = s.basePos[idx * 3] - wx;
        const dy = s.basePos[idx * 3 + 1] - wy;
        const dz = s.basePos[idx * 3 + 2] - wz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = idx;
        }
      }
      if (best >= 0) s.spark[best] = Math.min(1, s.spark[best] + 0.85);
    },
    [],
  );

  // ── one render + audio frame ──
  const renderFrame = useCallback(
    (frame: PoseFrame, sparks: { left: number; right: number }) => {
      const s = sceneRef.current;
      if (!s) return;

      // Low-pass smooth the frame for liquid motion.
      const prev = smoothRef.current;
      const a = 0.28;
      const cur: PoseFrame = prev
        ? {
            lx: prev.lx + (frame.lx - prev.lx) * a,
            ly: prev.ly + (frame.ly - prev.ly) * a,
            rx: prev.rx + (frame.rx - prev.rx) * a,
            ry: prev.ry + (frame.ry - prev.ry) * a,
            torsoX: prev.torsoX + (frame.torsoX - prev.torsoX) * a,
            lean: prev.lean + (frame.lean - prev.lean) * a,
            spread: prev.spread + (frame.spread - prev.spread) * a,
            visible: frame.visible,
          }
        : frame;
      smoothRef.current = cur;

      // Drive audio.
      const engine = engineRef.current;
      if (engine) engine.update(cur);

      // Place the two hand attractors and scatter their sparks into the cloud.
      const hands: Array<[number, number]> = [
        [cur.lx, cur.ly],
        [cur.rx, cur.ry],
      ];
      const counts = [sparks.left, sparks.right];
      for (let i = 0; i < 2; i++) {
        const [hx, hy] = hands[i];
        const [wx, wy, wz] = worldOf(hx, hy);
        s.handMeshes[i].position.set(wx, wy, wz);
        s.handHalos[i].position.set(wx, wy, wz);

        // Scatter up to a few sparks per hand per frame near the attractor.
        const n = Math.min(counts[i], 6);
        for (let k = 0; k < n; k++) {
          boostNear(
            s,
            wx + (Math.random() - 0.5) * 1.4,
            wy + (Math.random() - 0.5) * 1.4,
            wz + (Math.random() - 0.5) * 3.0,
          );
        }

        // Smooth per-hand brightness (≤3 Hz — no flashing) from grain rate.
        const lvl = levelRef.current;
        const target = Math.min(1, counts[i] / 4);
        lvl[i] += (target - lvl[i]) * 0.12;
        const glow = 0.55 + lvl[i] * 0.9;
        s.handMats[i].opacity = 0.7 + lvl[i] * 0.3;
        s.handMeshes[i].scale.setScalar(0.8 + lvl[i] * 0.7);
        s.handHalos[i].scale.setScalar(glow);
        s.haloMats[i].opacity = 0.1 + lvl[i] * 0.18;
      }

      // Decay + rewrite the cloud colours (amber sparks fading over base).
      const col = s.colAttr.array as Float32Array;
      const sp = s.spark;
      const base = s.baseCol;
      for (let i = 0; i < CLOUD_COUNT; i++) {
        const c = sp[i];
        if (c > 0.001) {
          col[i * 3] = base[i * 3] + AMBER.r * c;
          col[i * 3 + 1] = base[i * 3 + 1] + AMBER.g * c;
          col[i * 3 + 2] = base[i * 3 + 2] + AMBER.b * c;
          sp[i] = c * 0.9; // smooth decay, well under a flash rate
        } else if (c !== 0) {
          col[i * 3] = base[i * 3];
          col[i * 3 + 1] = base[i * 3 + 1];
          col[i * 3 + 2] = base[i * 3 + 2];
          sp[i] = 0;
        }
      }
      s.colAttr.needsUpdate = true;

      // Slow drift so the field breathes; torso place nudges the parallax.
      const tms = performance.now();
      s.group.rotation.y = Math.sin(tms * 0.00006) * 0.14 + cur.torsoX * 0.12;
      s.group.rotation.x = Math.sin(tms * 0.00004) * 0.05;
      s.renderer.render(s.scene, s.camera);
    },
    [boostNear],
  );

  // ── main loop ──
  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const now = performance.now();
    const engine = engineRef.current;

    // 1) Try live pose.
    let frame: PoseFrame | null = null;
    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (lm && video && video.readyState >= 2) {
      try {
        const res = lm.detectForVideo(video, now);
        const p = res.landmarks?.[0];
        if (p && p.length > 24) {
          const f = frameFromLandmarks(p);
          if (f.visible) {
            frame = f;
            lastPoseAtRef.current = now;
            if (fallback) setFallback(false);
          }
        }
      } catch {
        /* detection hiccup — fall through */
      }
    }

    // 2) Fallback pucks (+ auto-drift on any hand not being dragged).
    if (!frame && fallback) {
      const p = puckRef.current;
      const t = (now - startedAtRef.current) / 1000;
      const drift = demoFrame(t);
      if (dragRef.current !== "left") {
        p.lx += (drift.lx - p.lx) * 0.02;
        p.ly += (drift.ly - p.ly) * 0.02;
      }
      if (dragRef.current !== "right") {
        p.rx += (drift.rx - p.rx) * 0.02;
        p.ry += (drift.ry - p.ry) * 0.02;
      }
      frame = makeFrame(p.lx, p.ly, p.rx, p.ry);
      syncPuckDom();
    }

    // 3) Live pose lost for a moment (camera on, but no body) → auto-drift.
    if (!frame) {
      const t = (now - startedAtRef.current) / 1000;
      frame = demoFrame(t);
    }

    const sparks = engine ? engine.consumeGrains() : { left: 0, right: 0 };
    renderFrame(frame, sparks);
  }, [fallback, renderFrame, syncPuckDom]);

  // ── camera + landmarker (best-effort; drops to fallback on any failure) ──
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      try {
        landmarkerRef.current = await createLandmarker("GPU");
        setNotice(null);
      } catch {
        try {
          landmarkerRef.current = await createLandmarker("CPU");
          setNotice(null);
        } catch {
          setFallback(true);
          setNotice(
            "Body tracking couldn't load — drag the two hand-pucks (or let them drift) to play the grain cloud.",
          );
        }
      }
    } catch {
      setFallback(true);
      setNotice(
        "No camera — drag the two hand-pucks below (or just watch them drift) to scrub the grain cloud.",
      );
    }
  }, []);

  // ── primary action: Start (create AudioContext inside the gesture) ──
  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("running");
    startedAtRef.current = performance.now();
    lastPoseAtRef.current = 0;

    const engine = new GranularEngine();
    engineRef.current = engine;
    try {
      await engine.start();
    } catch {
      setNotice("Audio could not start in this browser.");
    }

    if (!sceneRef.current && !glError) buildScene();
    startCamera();
  }, [phase, glError, buildScene, startCamera]);

  // Build the scene + run an idle preview (auto-drift) BEFORE audio unlocks.
  useEffect(() => {
    if (!buildScene()) return;
    startedAtRef.current = performance.now();

    const preview = () => {
      rafRef.current = requestAnimationFrame(preview);
      const t = (performance.now() - startedAtRef.current) / 1000;
      const f = demoFrame(t);
      // A gentle trickle of sparks so the field shimmers before Start.
      const sp = {
        left: Math.random() < 0.5 ? 1 : 0,
        right: Math.random() < 0.5 ? 1 : 0,
      };
      renderFrame(f, sp);
    };
    rafRef.current = requestAnimationFrame(preview);

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

  // Swap the preview rAF for the real loop once Start is pressed.
  useEffect(() => {
    if (phase !== "running") return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase, loop]);

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
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const engine = engineRef.current;
      if (engine) {
        engine.stop();
        engineRef.current = null;
      }

      const s = sceneRef.current;
      if (s) {
        s.cloudGeo.dispose();
        s.cloudMat.dispose();
        s.handGeo.dispose();
        s.haloGeo.dispose();
        for (const m of s.handMats) m.dispose();
        for (const m of s.haloMats) m.dispose();
        s.renderer.dispose();
        if (s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
        sceneRef.current = null;
      }
    };
  }, []);

  // ── fallback puck dragging ──
  const puckPointer = useCallback(
    (which: "left" | "right") =>
      (e: ReactPointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        dragRef.current = which;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      },
    [],
  );
  const puckMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const which = dragRef.current;
    if (!which) return;
    const host = mountRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1; // [-1,1]
    const ny = -(((e.clientY - r.top) / r.height) * 2 - 1); // y up
    const p = puckRef.current;
    if (which === "left") {
      p.lx = Math.max(-1, Math.min(1, nx));
      p.ly = Math.max(-1, Math.min(1, ny));
    } else {
      p.rx = Math.max(-1, Math.min(1, nx));
      p.ry = Math.max(-1, Math.min(1, ny));
    }
  }, []);
  const puckUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <main
      className="relative h-[100dvh] w-full overflow-hidden text-foreground"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 22%, #0f3d47 0%, #0b2440 38%, #1a1140 72%, #0a0618 100%)",
      }}
    >
      {/* three.js canvas mount (also the pointer surface for the pucks) */}
      <div
        ref={mountRef}
        className="absolute inset-0"
        onPointerMove={fallback ? puckMove : undefined}
        onPointerUp={fallback ? puckUp : undefined}
        onPointerLeave={fallback ? puckUp : undefined}
      />

      {/* hidden video feeding MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">
            WebGL is unavailable here, so the grain field can&apos;t render. The
            granular cloud still plays in stereo when you press Start.
          </p>
        </div>
      )}

      {/* Fallback hand-pucks */}
      {phase === "running" && fallback && (
        <>
          <div
            ref={leftPuckElRef}
            role="button"
            aria-label="Left grain-head — drag to scrub"
            tabIndex={0}
            onPointerDown={puckPointer("left")}
            className="absolute z-20 h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-violet-200/80 bg-violet-300/30 backdrop-blur-sm active:cursor-grabbing"
            style={{ left: "15%", top: "45%" }}
          />
          <div
            ref={rightPuckElRef}
            role="button"
            aria-label="Right grain-head — drag to scrub"
            tabIndex={0}
            onPointerDown={puckPointer("right")}
            className="absolute z-20 h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-violet-200/80 bg-violet-300/30 backdrop-blur-sm active:cursor-grabbing"
            style={{ left: "85%", top: "45%" }}
          />
        </>
      )}

      {/* top-left: title + description */}
      <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-7">
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
          Tideglass
        </h1>
        <p className="mt-2 max-w-md text-base leading-snug text-muted-foreground">
          Your two hands are grain-heads moving through a cloud of sound. Reach
          wide to scatter it, lift a hand to raise its pitch, and step across the
          room to pan the whole cloud in space.
        </p>
        <p className="mt-2 max-w-md font-mono text-base text-muted-foreground">
          Camera stays on-device. Nothing is stored or sent.
        </p>
      </div>

      {/* status line */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 sm:left-7">
          {fallback ? (
            <p className="max-w-xs text-base text-violet-300">
              Fallback mode — drag the two amber pucks, or let them drift and the
              cloud plays itself.
            </p>
          ) : (
            <p className="font-mono text-base text-violet-200/75">
              tracking body — hands are grain-heads
            </p>
          )}
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 w-[min(90vw,42rem)] -translate-x-1/2 p-4 text-center">
          <p className="text-base text-violet-300">{notice}</p>
        </div>
      )}

      {/* Start button */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex items-end justify-center pb-16 sm:items-center sm:pb-0">
          <button
            onClick={start}
            className="pointer-events-auto min-h-[44px] rounded-full border border-violet-200/40 bg-violet-300/10 px-4 py-2.5 font-mono text-base font-medium text-foreground backdrop-blur-md transition-colors hover:bg-violet-300/20"
          >
            ▶ Start — scrub the grain cloud
          </button>
        </div>
      )}

      {/* corner: design notes */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute bottom-4 right-4 min-h-[44px] rounded-full border border-border bg-black/50 px-4 py-2.5 font-mono text-base text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="absolute bottom-20 right-4 w-[min(92vw,32rem)] rounded-xl border border-border bg-black/85 p-5 backdrop-blur-md">
          <h2 className="font-mono text-xl font-semibold text-foreground">
            Design notes
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Each hand is a granular grain-head scrubbing a synthesized wavetable.
            Hand height sets grain playback-rate + filter cutoff; the reach
            between your hands sets grain density (wide = a dense scatter,
            together = a focused point-source); where you stand pans the cloud in
            true stereo. Grains are short windowed FM wavelets fired by a bounded
            look-ahead scheduler, each lighting an amber spark in the point
            cloud. Pose model: BlazePose (Google, 2020). Granular theory: Curtis
            Roads, <em>Microsound</em> (2001). See the README for honest edges.
          </p>
          <Link
            href="/dream/1225-tideglass/README.md"
            className="mt-3 inline-block font-mono text-base text-violet-300 hover:text-violet-200"
          >
            README →
          </Link>
        </div>
      )}
    </main>
  );
}
