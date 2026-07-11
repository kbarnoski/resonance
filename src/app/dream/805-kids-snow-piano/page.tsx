"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  fetchPianoBuffer,
  makeFallbackBellBuffer,
  makeMasterChain,
  makeSliceBuffer,
  railPlaybackRate,
  RAIL_COUNT,
  type MasterChain,
} from "./audio";

// ---------------------------------------------------------------------------
// Snow-globe constants
// ---------------------------------------------------------------------------
const GLOBE_R = 1.0; // sphere radius (world units)
const MOTE_COUNT = 220;
const RAIL_Y = -GLOBE_R * 0.62; // height of the chime rails near the bottom
const RAIL_BAND = 0.085; // vertical thickness of the landing band
const REST_AFTER = 0.28; // seconds a mote must rest in the band before chiming

// Wintery palette (soft blue-white-silver), one tint per rail.
const RAIL_HEX = [
  0xa5c8ff, // C4 pale blue
  0xc4d8ff, // D4
  0xe6f0ff, // E4 silver-white
  0xc9e0ff, // G4
  0xb0d2ff, // A4
];

interface Mote {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rail: number; // which chime rail this mote belongs to (by x-band)
  restT: number; // accumulated time resting in the landing band
  alive: number; // 1 = drifting, <1 = dissolving (sparkle fade)
  seed: number; // per-mote phase for shimmer
}

type Status = "intro" | "running" | "nowebgl";

export default function SnowPianoPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>("intro");
  const [usingFallbackVoice, setUsingFallbackVoice] = useState(false);
  const [tiltActive, setTiltActive] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Gravity direction set by tilt / drag / auto-drift. Unit-ish vector in
  // globe space (x right, y up). Default = down.
  const gravityRef = useRef({ x: 0, y: -1 });
  // Smoothed gravity actually applied to physics.
  const smoothGravRef = useRef({ x: 0, y: -1 });
  // Drag state for desktop fallback.
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });
  // Auto-drift phase so motes always land hands-free.
  const autoRef = useRef(0);
  const tiltSeenRef = useRef(false);

  // Audio holders (kept in refs so teardown can reach them).
  const ctxRef = useRef<AudioContext | null>(null);
  const chainRef = useRef<MasterChain | null>(null);
  const sourceBufRef = useRef<AudioBuffer | null>(null);
  const fallbackBufRef = useRef<AudioBuffer | null>(null);
  const padNodesRef = useRef<AudioNode[]>([]);
  const lastChimeRef = useRef(0);

  // ------------------------------------------------------------------
  // Trigger one soft chime for a rail (uses Karel's slice or fallback).
  // ------------------------------------------------------------------
  const playChime = useCallback((railIndex: number) => {
    const ctx = ctxRef.current;
    const chain = chainRef.current;
    if (!ctx || !chain) return;

    // Gentle rate-limit so a cascade never stacks into a loud transient.
    const now = ctx.currentTime;
    if (now - lastChimeRef.current < 0.012) return;
    lastChimeRef.current = now;

    const source = sourceBufRef.current ?? fallbackBufRef.current;
    if (!source) return;

    const src = ctx.createBufferSource();
    // For the real recording we carve a fresh soft slice each time.
    // For the fallback bell we already have a clean enveloped buffer.
    src.buffer = sourceBufRef.current
      ? makeSliceBuffer(ctx, source)
      : source;
    src.playbackRate.value = railPlaybackRate(railIndex);

    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const peak = 0.22;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    src.connect(g);
    g.connect(chain.input);
    src.start(now);
    src.stop(now + 1.6);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }, []);

  // ------------------------------------------------------------------
  // Always-on soft ambient pad (C2 + G2) so it is never silent.
  // ------------------------------------------------------------------
  const startPad = useCallback((ctx: AudioContext, chain: MasterChain) => {
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0001;
    padGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.5);
    padGain.connect(chain.input);
    const nodes: AudioNode[] = [padGain];
    // C2 = 65.4Hz, G2 = 98Hz
    [65.41, 98.0].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.06 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.012;
      lfo.connect(lfoGain);
      const og = ctx.createGain();
      og.gain.value = 0.5;
      lfoGain.connect(og.gain);
      osc.connect(og);
      og.connect(padGain);
      osc.start();
      lfo.start();
      nodes.push(osc, lfo, lfoGain, og);
    });
    padNodesRef.current = nodes;
  }, []);

  // ------------------------------------------------------------------
  // START: must create/resume AudioContext + request orientation perm,
  // all inside this user tap. Then boot the three.js scene.
  // ------------------------------------------------------------------
  const handleStart = useCallback(async () => {
    if (typeof window === "undefined") return;

    // --- WebGL feature-detect ---
    let glOk = false;
    try {
      const test = document.createElement("canvas");
      glOk = !!(
        test.getContext("webgl2") || test.getContext("webgl")
      );
    } catch {
      glOk = false;
    }
    if (!glOk) {
      setStatus("nowebgl");
      return;
    }

    // --- Audio (inside the tap) ---
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        if (ctx.state === "suspended") await ctx.resume();
        const chain = makeMasterChain(ctx);
        ctxRef.current = ctx;
        chainRef.current = chain;
        fallbackBufRef.current = makeFallbackBellBuffer(ctx);
        startPad(ctx, chain);

        // Try Karel's real piano; fall back to the bell on any failure.
        fetchPianoBuffer(ctx)
          .then((buf) => {
            if (buf) {
              sourceBufRef.current = buf;
            } else {
              setUsingFallbackVoice(true);
            }
          })
          .catch(() => setUsingFallbackVoice(true));
      } else {
        setUsingFallbackVoice(true);
      }
    } catch {
      setUsingFallbackVoice(true);
    }

    // --- Device orientation permission (iOS) inside the tap ---
    try {
      const DOE = window.DeviceOrientationEvent as
        | (typeof DeviceOrientationEvent & {
            requestPermission?: () => Promise<"granted" | "denied">;
          })
        | undefined;
      if (DOE && typeof DOE.requestPermission === "function") {
        const perm = await DOE.requestPermission();
        if (perm === "granted") setTiltActive(true);
      } else if (DOE) {
        // Non-iOS: listener added in effect; assume available until proven.
        setTiltActive(true);
      }
    } catch {
      // Permission errors are fine; drag + auto-drift keep it alive.
    }

    setStatus("running");
  }, [startPad]);

  // ------------------------------------------------------------------
  // Device orientation listener (added once running).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (status !== "running") return;
    if (typeof window === "undefined") return;

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tiltSeenRef.current = true;
      // gamma: left/right [-90,90]; beta: front/back [-180,180].
      // Lateral tilt steers x; forward/back tilt nudges the downward bias.
      const gx = Math.max(-1, Math.min(1, e.gamma / 45));
      const gy = Math.max(-1, Math.min(1, (e.beta - 35) / 45));
      const tx = gx;
      const ty = -1 + Math.max(-0.5, Math.min(0.5, gy)) * 0.5;
      const m = Math.hypot(tx, ty) || 1;
      gravityRef.current = { x: tx / m, y: ty / m };
    };

    window.addEventListener("deviceorientation", onOrient, true);
    return () => window.removeEventListener("deviceorientation", onOrient, true);
  }, [status]);

  // ------------------------------------------------------------------
  // three.js scene + physics loop.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (status !== "running") return;
    if (typeof window === "undefined") return;
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setStatus("nowebgl");
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1830); // deep wintery night-blue

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 4.0);

    const sizeTo = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    renderer.setSize(mount.clientWidth || 300, mount.clientHeight || 300, false);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    sizeTo();

    // --- Soft glass globe ---
    const globeGeo = new THREE.SphereGeometry(GLOBE_R, 48, 48);
    const globeMat = new THREE.MeshBasicMaterial({
      color: 0x9ec6ff,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // Faint rim highlight sphere (front side) for a snow-globe glass feel.
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0xcfe4ff,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Mesh(globeGeo, rimMat));

    // --- Chime rails: glowing arcs near the bottom ---
    const railGroup = new THREE.Group();
    for (let r = 0; r < RAIL_COUNT; r++) {
      const x0 = (r / RAIL_COUNT) * 2 - 1; // -1..1
      const x1 = ((r + 1) / RAIL_COUNT) * 2 - 1;
      const cx = (x0 + x1) * 0.5 * GLOBE_R * 0.86;
      const halfW = (x1 - x0) * 0.5 * GLOBE_R * 0.78;
      const railGeo = new THREE.BoxGeometry(halfW * 2 * 0.86, 0.012, 0.4);
      const railMat = new THREE.MeshBasicMaterial({
        color: RAIL_HEX[r],
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(cx, RAIL_Y, 0);
      railGroup.add(rail);
    }
    scene.add(railGroup);

    // --- Motes as additive glowing points ---
    const motes: Mote[] = [];
    const positions = new Float32Array(MOTE_COUNT * 3);
    const colors = new Float32Array(MOTE_COUNT * 3);
    const railColor = new THREE.Color();
    for (let i = 0; i < MOTE_COUNT; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const rr = GLOBE_R * 0.85 * Math.cbrt(Math.random());
      const pos = new THREE.Vector3(
        rr * Math.sin(phi) * Math.cos(theta),
        rr * Math.cos(phi),
        rr * Math.sin(phi) * Math.sin(theta),
      );
      const rail = Math.max(
        0,
        Math.min(RAIL_COUNT - 1, Math.floor(((pos.x / GLOBE_R) * 0.5 + 0.5) * RAIL_COUNT)),
      );
      motes.push({
        pos,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
        ),
        rail,
        restT: 0,
        alive: 1,
        seed: Math.random() * 100,
      });
      railColor.setHex(RAIL_HEX[rail]);
      colors[i * 3] = railColor.r;
      colors[i * 3 + 1] = railColor.g;
      colors[i * 3 + 2] = railColor.b;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    moteGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const moteMat = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(moteGeo, moteMat);
    scene.add(points);

    // --- Pointer drag → tilt (desktop fallback) ---
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragRef.current = { active: true, x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const rect = el.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      const tx = nx;
      const ty = -1 + Math.max(-0.5, Math.min(0.5, ny)) * 0.5;
      const m = Math.hypot(tx, ty) || 1;
      gravityRef.current = { x: tx / m, y: ty / m };
    };
    const onUp = (e: PointerEvent) => {
      dragRef.current.active = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    window.addEventListener("resize", sizeTo);

    // --- Physics + render loop ---
    let raf = 0;
    let last = performance.now();
    const GRAV = 1.5; // gravity strength
    const DAMP = 0.86; // velocity damping (snow falls slowly)

    const tick = (nowMs: number) => {
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;

      // Always-on gentle auto-drift so motes land hands-free within ~2s.
      autoRef.current += dt;
      const autoX = Math.sin(autoRef.current * 0.7) * 0.55;
      const baseG = gravityRef.current;
      // If no real tilt seen and not dragging, bias gravity sideways slowly.
      const driftX = tiltSeenRef.current || dragRef.current.active ? 0 : autoX;
      const gx = baseG.x + driftX;
      const gy = baseG.y;
      const gmag = Math.hypot(gx, gy) || 1;
      const targetG = { x: gx / gmag, y: gy / gmag };

      // Smooth gravity transitions (no jarring snaps).
      const sg = smoothGravRef.current;
      sg.x += (targetG.x - sg.x) * Math.min(1, dt * 4);
      sg.y += (targetG.y - sg.y) * Math.min(1, dt * 4);

      const posAttr = moteGeo.getAttribute("position") as THREE.BufferAttribute;
      const colAttr = moteGeo.getAttribute("color") as THREE.BufferAttribute;

      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];

        if (m.alive < 1) {
          // Dissolving sparkle: fade + drift up gently, then respawn at top.
          m.alive -= dt * 1.6;
          m.pos.y += dt * 0.3;
          if (m.alive <= 0) {
            // Respawn near the top of the globe.
            const theta = Math.random() * Math.PI * 2;
            const rr = GLOBE_R * 0.7 * Math.random();
            m.pos.set(
              Math.cos(theta) * rr,
              GLOBE_R * (0.55 + Math.random() * 0.3),
              Math.sin(theta) * rr * 0.6,
            );
            m.vel.set(
              (Math.random() - 0.5) * 0.1,
              0,
              (Math.random() - 0.5) * 0.1,
            );
            m.restT = 0;
            m.alive = 1;
          }
        } else {
          // Apply gravity + a touch of shimmer turbulence.
          m.vel.x += sg.x * GRAV * dt;
          m.vel.y += sg.y * GRAV * dt;
          m.vel.x += Math.sin(nowMs * 0.001 + m.seed) * 0.04 * dt;
          m.vel.z += Math.cos(nowMs * 0.0011 + m.seed) * 0.03 * dt;
          m.vel.multiplyScalar(Math.pow(DAMP, dt * 60));
          m.pos.addScaledVector(m.vel, dt);

          // Keep inside the sphere (soft bounce).
          const r = m.pos.length();
          if (r > GLOBE_R * 0.92) {
            m.pos.multiplyScalar((GLOBE_R * 0.92) / r);
            const n = m.pos.clone().normalize();
            const vn = m.vel.dot(n);
            m.vel.addScaledVector(n, -vn * 1.4);
            m.vel.multiplyScalar(0.6);
          }

          // Landing band check (near the bottom rails).
          const inBand =
            m.pos.y < RAIL_Y + RAIL_BAND &&
            m.pos.y > RAIL_Y - RAIL_BAND &&
            Math.abs(m.vel.y) < 0.35;
          if (inBand) {
            m.restT += dt;
            if (m.restT >= REST_AFTER) {
              // Determine rail by x position at landing.
              const rail = Math.max(
                0,
                Math.min(
                  RAIL_COUNT - 1,
                  Math.floor(((m.pos.x / GLOBE_R) * 0.5 + 0.5) * RAIL_COUNT),
                ),
              );
              m.rail = rail;
              railColor.setHex(RAIL_HEX[rail]);
              colAttr.setXYZ(i, railColor.r * 2, railColor.g * 2, railColor.b * 2);
              playChime(rail);
              m.alive = 0.999; // begin dissolve
            }
          } else {
            m.restT = Math.max(0, m.restT - dt * 0.5);
          }
        }

        // Per-mote brightness shimmer via color scale while alive.
        const shimmer = m.alive < 1 ? m.alive : 1;
        const base = new THREE.Color(RAIL_HEX[m.rail]);
        colAttr.setXYZ(
          i,
          base.r * shimmer,
          base.g * shimmer,
          base.b * shimmer,
        );
        posAttr.setXYZ(i, m.pos.x, m.pos.y, m.pos.z);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // Slow rotation of the whole globe for life.
      globe.rotation.y += dt * 0.05;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // --- Full teardown ---
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", sizeTo);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      moteGeo.dispose();
      moteMat.dispose();
      globeGeo.dispose();
      globeMat.dispose();
      rimMat.dispose();
      railGroup.children.forEach((c) => {
        const mesh = c as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* ignore */
      }
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [status, playChime]);

  // ------------------------------------------------------------------
  // Audio teardown on unmount.
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      padNodesRef.current.forEach((n) => {
        try {
          if (n instanceof OscillatorNode) n.stop();
        } catch {
          /* ignore */
        }
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      });
      padNodesRef.current = [];
      const chain = chainRef.current;
      if (chain) {
        [chain.input, chain.master, chain.lowpass, chain.comp].forEach((n) => {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        });
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {
          /* ignore */
        });
      }
      ctxRef.current = null;
      chainRef.current = null;
    };
  }, []);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0b1830] text-foreground">
      {/* three.js mount */}
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* Top bar: back + title */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
        <Link
          href="/dream"
          className="pointer-events-auto inline-flex min-h-[44px] items-center rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur-sm hover:bg-accent"
        >
          ← Lab
        </Link>
        <h1 className="mt-1 text-right text-xl font-semibold text-foreground drop-shadow">
          Snow Piano
        </h1>
      </div>

      {/* Intro / Start overlay */}
      {status === "intro" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[#0b1830]/80 p-6 text-center backdrop-blur-sm">
          <div className="text-6xl" aria-hidden>
            ❄️
          </div>
          <p className="max-w-md text-xl text-foreground">
            Tilt the snow globe. Karel&apos;s piano pours out as glowing snow
            that chimes when it lands.
          </p>
          <p className="max-w-md text-base text-muted-foreground">
            Tilt your device — or drag with your finger or mouse. It plays all
            by itself too.
          </p>
          <button
            type="button"
            onClick={handleStart}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-violet-300 px-10 py-5 text-2xl font-semibold text-[#0b1830] shadow-lg transition hover:bg-violet-200 active:scale-95"
            style={{ minWidth: 200, minHeight: 80 }}
          >
            ▶ Start
          </button>
        </div>
      )}

      {/* No-WebGL friendly notice */}
      {status === "nowebgl" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#0b1830] p-6 text-center">
          <div className="text-6xl" aria-hidden>
            ❄️
          </div>
          <p className="max-w-md text-xl text-foreground">
            This snow globe needs WebGL, which isn&apos;t available here.
          </p>
          <p className="text-base text-violet-300">
            Try a different browser or device to watch the snow fall.
          </p>
        </div>
      )}

      {/* Running-state notices */}
      {status === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-4 text-center">
          {usingFallbackVoice && (
            <p className="text-base font-medium text-violet-300">
              Playing a soft bell voice (Karel&apos;s recording couldn&apos;t
              load).
            </p>
          )}
          {!tiltActive && (
            <p className="text-base text-violet-300">
              Tilt not available — drag to tilt, or just watch it play itself.
            </p>
          )}
        </div>
      )}

      {/* Design notes affordance */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-4 right-4 z-30 inline-flex min-h-[44px] items-center rounded-full bg-muted px-4 py-2.5 text-base text-muted-foreground backdrop-blur-sm hover:bg-accent"
      >
        {showNotes ? "Close" : "Design notes"}
      </button>
      {showNotes && (
        <div className="absolute bottom-20 right-4 z-30 max-w-xs rounded-2xl bg-[#0b1830]/95 p-4 text-base text-foreground shadow-xl ring-1 ring-border">
          <p className="mb-2 text-lg font-semibold text-foreground">
            A snow-globe music box
          </p>
          <p className="text-base text-muted-foreground">
            Tilt is the only input. Glowing motes are Karel&apos;s real piano;
            when one settles on a chime rail it plays a soft pentatonic window
            of his recording, then dissolves into sparkles. No score, no fail —
            just calm play.
          </p>
        </div>
      )}
    </main>
  );
}
