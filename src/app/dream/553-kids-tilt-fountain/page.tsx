"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  buildChain,
  resetChain,
  triggerZone,
  type ZoneTimbre,
} from "./audio";
import {
  stepOrbs,
  smoothGravity,
  makeOrb,
  orbInZone,
  orbZoneXNorm,
  ORB_COLORS,
  type Orb,
  type GravityState,
  type Zone,
} from "./physics";

// ---------- constants ----------
const MAX_ORBS = 180;
const EMIT_INTERVAL = 0.10; // seconds between new orbs
const WORLD_W = 4.0;
const WORLD_H = 6.0;
const WORLD_D = 2.5;
const AUTO_DEMO_RESUME_S = 4.0; // seconds of idle before auto-demo resumes
const GHOST_SPEED = 0.35; // rad/s for ghost tilt oscillation

// Zone layout — 5 zones at different heights, spanning world width
function buildZones(): Zone[] {
  return [
    {
      idx: 0, cx: -1.2, cy: 1.8, cz: 0,
      hw: 0.65, hh: 0.22, hd: 0.8,
      color: 0xc084fc, timbre: "bell", flashStrength: 0,
    },
    {
      idx: 1, cx: 0.8, cy: 0.8, cz: 0,
      hw: 0.7, hh: 0.22, hd: 0.8,
      color: 0x67e8f9, timbre: "string", flashStrength: 0,
    },
    {
      idx: 2, cx: -0.5, cy: -0.15, cz: 0,
      hw: 0.6, hh: 0.22, hd: 0.8,
      color: 0x06d6a0, timbre: "chime", flashStrength: 0,
    },
    {
      idx: 3, cx: 1.3, cy: -1.1, cz: 0,
      hw: 0.65, hh: 0.22, hd: 0.8,
      color: 0xffbe0b, timbre: "marimba", flashStrength: 0,
    },
    {
      idx: 4, cx: -1.0, cy: -2.1, cz: 0,
      hw: 0.7, hh: 0.22, hd: 0.8,
      color: 0xff6b9d, timbre: "bell", flashStrength: 0,
    },
  ];
}

// ---------- component ----------
export default function KidsTiltFountain() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"start" | "permission" | "play">("start");
  const [tiltNotice, setTiltNotice] = useState<string>("");

  // Hold mutable play state outside React to avoid re-renders in the loop
  const playStateRef = useRef<{
    actx: AudioContext | null;
    chain: AudioNode | null;
    orbs: Orb[];
    zones: Zone[];
    gravity: GravityState;
    targetGravity: GravityState;
    ghostAngle: number;
    usingRealTilt: boolean;
    lastRealInputTime: number; // performance.now() / 1000
    emitAccum: number;
    colorCursor: number;
    emitterX: number; // current emitter world-x (follows gravity lean)
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    orbMeshes: Map<number, THREE.Mesh>;
    zoneMeshes: THREE.Mesh[];
    raf: number;
    lastTime: number;
  }>({
    actx: null,
    chain: null,
    orbs: [],
    zones: [],
    gravity: { gx: 0, gy: 9.8, gz: 0 },
    targetGravity: { gx: 0, gy: 9.8, gz: 0 },
    ghostAngle: 0,
    usingRealTilt: false,
    lastRealInputTime: 0,
    emitAccum: 0,
    colorCursor: 0,
    emitterX: 0,
    renderer: null,
    scene: null,
    camera: null,
    orbMeshes: new Map(),
    zoneMeshes: [],
    raf: 0,
    lastTime: 0,
  });

  // ---------- start handler — called on button tap ----------
  const handleStart = useCallback(async () => {
    setPhase("permission");

    // Try to request iOS tilt permission
    let notice = "";

    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (DeviceOrientationEvent as any).requestPermission();
        if (res !== "granted") notice = "Tilt denied — using pointer control instead";
      } catch {
        notice = "Tilt unavailable — using pointer control instead";
      }
    } else if (typeof DeviceOrientationEvent === "undefined") {
      notice = "No tilt sensor — move pointer / use arrow keys";
    }
    // Android / desktop: event fires without permission — no notice needed

    if (notice) setTiltNotice(notice);
    setPhase("play");

    // Build AudioContext inside user gesture
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const actx = new AudioCtx();
    const chain = buildChain(actx);
    const ps = playStateRef.current;
    ps.actx = actx;
    ps.chain = chain;
    ps.zones = buildZones();
    // Auto-demo ghost runs until first real tilt/pointer event arrives
  }, []);

  // ---------- Three.js + physics loop (runs when phase === "play") ----------
  useEffect(() => {
    if (phase !== "play") return;
    const container = mountRef.current;
    if (!container) return;

    const ps = playStateRef.current;

    // --- Three.js setup ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x060412, 1);
    container.appendChild(renderer.domElement);
    ps.renderer = renderer;

    const scene = new THREE.Scene();
    ps.scene = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.01,
      60
    );
    camera.position.set(0, 0.4, 7.5);
    camera.lookAt(0, 0, 0);
    ps.camera = camera;

    // Ambient light — very dim, orbs are emissive
    const ambientLight = new THREE.AmbientLight(0x1a0a2e, 1.0);
    scene.add(ambientLight);

    // Subtle point light for depth
    const ptLight = new THREE.PointLight(0x6644aa, 1.8, 12);
    ptLight.position.set(0, 3, 3);
    scene.add(ptLight);

    // --- Zone meshes (flat boxes, glowing) ---
    const zoneGeos: THREE.BoxGeometry[] = [];
    const zoneMats: THREE.MeshStandardMaterial[] = [];

    for (const z of ps.zones) {
      const geo = new THREE.BoxGeometry(z.hw * 2, z.hh * 2, z.hd * 1.6);
      const mat = new THREE.MeshStandardMaterial({
        color: z.color,
        emissive: z.color,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(z.cx, z.cy, z.cz);
      scene.add(mesh);
      ps.zoneMeshes.push(mesh);
      zoneGeos.push(geo);
      zoneMats.push(mat);
    }

    // Emitter glow — small sphere at top
    const emitterGeo = new THREE.SphereGeometry(0.15, 10, 10);
    const emitterMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const emitterMesh = new THREE.Mesh(emitterGeo, emitterMat);
    emitterMesh.position.set(0, WORLD_H * 0.42, 0);
    scene.add(emitterMesh);

    // Orb geometry (shared)
    const orbGeo = new THREE.SphereGeometry(1, 8, 8); // scaled per orb

    // --- Resize handler ---
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // --- Tilt / input handlers ---
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0; // left/right tilt -90..90
      const beta = e.beta ?? 0;   // front/back tilt -180..180

      // gamma → gx, beta offset → gz (depth lean)
      const gx = Math.max(-15, Math.min(15, (gamma / 90) * 15));
      const gz = Math.max(-8, Math.min(8, ((beta - 45) / 90) * 8));
      ps.targetGravity = { gx, gy: 9.8, gz };
      ps.usingRealTilt = true;
      ps.lastRealInputTime = performance.now() / 1000;
    };

    // Pointer fallback
    const handlePointerMove = (e: PointerEvent) => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      // Map pointer X to gx (-12 to 12), Y to gz
      const gx = ((e.clientX / w) - 0.5) * 24;
      const gz = ((e.clientY / h) - 0.5) * 10;
      ps.targetGravity = { gx, gy: 9.8, gz };
      ps.usingRealTilt = true;
      ps.lastRealInputTime = performance.now() / 1000;
    };

    // Arrow keys fallback
    const keysHeld = new Set<string>();
    const handleKeyDown = (e: KeyboardEvent) => {
      keysHeld.add(e.key);
      ps.usingRealTilt = true;
      ps.lastRealInputTime = performance.now() / 1000;
    };
    const handleKeyUp = (e: KeyboardEvent) => keysHeld.delete(e.key);

    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // --- animation / physics loop ---
    const tick = (nowMs: number) => {
      const now = nowMs / 1000;
      const dt = Math.min(now - (ps.lastTime || now), 0.05);
      ps.lastTime = now;

      // Arrow key gravity update
      if (keysHeld.size > 0) {
        const step = 8 * dt;
        if (keysHeld.has("ArrowLeft"))  ps.targetGravity.gx = Math.max(-14, ps.targetGravity.gx - step * 15);
        if (keysHeld.has("ArrowRight")) ps.targetGravity.gx = Math.min(14,  ps.targetGravity.gx + step * 15);
        if (keysHeld.has("ArrowUp"))    ps.targetGravity.gz = Math.max(-8,  ps.targetGravity.gz - step * 10);
        if (keysHeld.has("ArrowDown"))  ps.targetGravity.gz = Math.min(8,   ps.targetGravity.gz + step * 10);
      }

      // Auto-demo ghost tilt
      const idleS = now - ps.lastRealInputTime;
      const ghostActive = !ps.usingRealTilt || idleS > AUTO_DEMO_RESUME_S;
      if (ghostActive) {
        ps.ghostAngle += GHOST_SPEED * dt;
        const ga = ps.ghostAngle;
        // Figure-8-ish oscillation
        const gx = Math.sin(ga) * 10;
        const gz = Math.sin(ga * 0.7) * 4;
        ps.targetGravity = { gx, gy: 9.8, gz };
      }

      // Smooth gravity
      ps.gravity = smoothGravity(ps.gravity, ps.targetGravity, 0.08);

      // Emitter position tracks gravity lean
      const targetEmitX = -(ps.gravity.gx / 9.8) * (WORLD_W * 0.38);
      ps.emitterX += (targetEmitX - ps.emitterX) * 0.06;
      emitterMesh.position.x = ps.emitterX;

      // Emit new orbs
      ps.emitAccum += dt;
      while (ps.emitAccum >= EMIT_INTERVAL) {
        ps.emitAccum -= EMIT_INTERVAL;
        const liveCount = ps.orbs.filter((o) => o.alive).length;
        if (liveCount < MAX_ORBS) {
          const orb = makeOrb(
            ps.emitterX + (Math.random() - 0.5) * 0.2,
            WORLD_H * 0.42 - 0.2,
            (Math.random() - 0.5) * 0.3,
            ps.colorCursor % ORB_COLORS.length
          );
          ps.colorCursor++;
          ps.orbs.push(orb);

          // Create mesh
          const mat = new THREE.MeshStandardMaterial({
            color: orb.color,
            emissive: orb.color,
            emissiveIntensity: 1.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(orbGeo, mat);
          mesh.scale.setScalar(orb.radius);
          scene.add(mesh);
          ps.orbMeshes.set(orb.id, mesh);
        }
      }

      // Physics step
      stepOrbs(ps.orbs, ps.gravity, dt, WORLD_W, WORLD_H, WORLD_D);

      // Zone collision → sound
      const actx = ps.actx;
      const chain = ps.chain;
      if (actx && chain) {
        for (const orb of ps.orbs) {
          if (!orb.alive) continue;
          for (const zone of ps.zones) {
            if (!orbInZone(orb, zone)) continue;
            // Rate-limit: 80ms per zone per orb
            if (
              orb.lastZoneHit === zone.idx &&
              now - orb.lastZoneHitTime < 0.08
            ) continue;
            orb.lastZoneHit = zone.idx;
            orb.lastZoneHitTime = now;
            orb.flash = 1.0;
            zone.flashStrength = 1.0;
            triggerZone({
              actx,
              chain,
              zoneIdx: zone.idx,
              timbre: zone.timbre as ZoneTimbre,
              xNorm: orbZoneXNorm(orb, zone),
              volume: 0.32,
            });
          }
        }
      }

      // Update zone mesh flash
      for (let i = 0; i < ps.zones.length; i++) {
        const z = ps.zones[i];
        z.flashStrength = Math.max(0, z.flashStrength - dt * 4.5);
        const mat = zoneMats[i];
        mat.emissiveIntensity = 0.35 + z.flashStrength * 2.2;
        mat.opacity = 0.28 + z.flashStrength * 0.42;
      }

      // Update orb meshes
      for (const orb of ps.orbs) {
        const mesh = ps.orbMeshes.get(orb.id);
        if (!mesh) continue;

        if (!orb.alive) {
          scene.remove(mesh);
          (mesh.material as THREE.MeshStandardMaterial).dispose();
          ps.orbMeshes.delete(orb.id);
          continue;
        }

        mesh.position.set(orb.x, orb.y, orb.z);
        mesh.scale.setScalar(orb.radius * (1 + orb.flash * 0.6));
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.8 + orb.flash * 3.5;
      }

      // Remove dead orbs from array (periodic cleanup)
      if (ps.orbs.length > MAX_ORBS * 1.5) {
        ps.orbs = ps.orbs.filter((o) => o.alive);
      }

      // Render
      renderer.render(scene, camera);
      ps.raf = requestAnimationFrame(tick);
    };

    ps.raf = requestAnimationFrame(tick);

    // Cleanup
    return () => {
      cancelAnimationFrame(ps.raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);

      // Dispose Three.js resources
      for (const mesh of ps.orbMeshes.values()) {
        (mesh.material as THREE.MeshStandardMaterial).dispose();
        scene.remove(mesh);
      }
      ps.orbMeshes.clear();
      orbGeo.dispose();
      emitterGeo.dispose();
      emitterMat.dispose();
      for (const g of zoneGeos) g.dispose();
      for (const m of zoneMats) m.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      ps.renderer = null;
      ps.scene = null;
      ps.camera = null;
      ps.zoneMeshes = [];
      ps.orbs = [];

      if (ps.actx) {
        ps.actx.close();
        ps.actx = null;
        ps.chain = null;
        resetChain();
      }
    };
  }, [phase]);

  // ---------- Start screen ----------
  if (phase === "start" || phase === "permission") {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-[#060412] px-6 select-none">
        {/* Animated preview orbs */}
        <div className="flex gap-5 mb-10">
          {[0xff6b9d, 0xffbe0b, 0x06d6a0, 0x74b9ff].map((c, i) => {
            const hex = `#${c.toString(16).padStart(6, "0")}`;
            return (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 54,
                  height: 54,
                  background: hex,
                  boxShadow: `0 0 24px 8px ${hex}60`,
                  transform: `translateY(${Math.sin(i * 1.2) * 10}px)`,
                  animation: `bounce ${1.2 + i * 0.2}s ease-in-out infinite alternate`,
                }}
              />
            );
          })}
        </div>

        <h1 className="text-4xl font-bold text-foreground mb-3 text-center tracking-tight">
          Tilt Fountain
        </h1>
        <p className="text-xl text-foreground text-center max-w-[300px] mb-3 leading-relaxed">
          Tip the tablet to pour glowing orbs through a garden of bells &amp; chimes
        </p>
        <p className="text-base text-muted-foreground text-center max-w-[280px] mb-10 leading-relaxed">
          Every path = a different melody 🎶
        </p>

        <button
          onClick={handleStart}
          disabled={phase === "permission"}
          className="bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:bg-violet-900 text-foreground font-bold text-2xl rounded-3xl px-12 py-5 min-h-[72px] min-w-[220px] transition-colors shadow-lg shadow-violet-900/60"
          style={{ touchAction: "manipulation" }}
        >
          {phase === "permission" ? "Starting…" : "🎵 Tip me!"}
        </button>

        <p className="mt-4 text-base text-muted-foreground text-center max-w-[260px] leading-relaxed">
          (tap to play — no tilt sensor needed!)
        </p>

        <Link
          href="/dream"
          className="mt-14 text-sm text-muted-foreground hover:text-muted-foreground transition-colors"
        >
          ← Dream lab
        </Link>

        <style>{`
          @keyframes bounce {
            from { transform: translateY(-8px); }
            to   { transform: translateY(8px); }
          }
        `}</style>
      </div>
    );
  }

  // ---------- Play screen ----------
  return (
    <div className="relative w-full overflow-hidden" style={{ height: "100dvh" }}>
      {/* Three.js canvas injected here */}
      <div ref={mountRef} className="w-full h-full" style={{ background: "#060412" }} />

      {/* Tilt notice */}
      {tiltNotice && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-violet-300 text-sm bg-black/50 px-4 py-2 rounded-full pointer-events-none select-none max-w-[90vw] text-center">
          {tiltNotice}
        </div>
      )}

      {/* Zone legend — icons only, no reading required */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-3 pointer-events-none select-none">
        {(["🔔", "🎸", "🎐", "🪘", "🔔"] as const).map((icon, i) => (
          <span key={i} className="text-2xl opacity-60">{icon}</span>
        ))}
      </div>

      {/* Hint for desktop */}
      <div className="absolute top-4 right-4 text-muted-foreground/70 text-xs pointer-events-none select-none hidden md:block">
        Move pointer or ← → keys to steer
      </div>

      <Link
        href="/dream"
        className="absolute top-4 left-4 text-muted-foreground text-sm hover:text-foreground transition-colors"
      >
        ← Dream lab
      </Link>

      <Link
        href="/dream/553-kids-tilt-fountain/README.md"
        className="absolute bottom-5 right-4 text-muted-foreground/70 text-xs hover:text-muted-foreground transition-colors"
      >
        notes
      </Link>
    </div>
  );
}
