"use client";

/**
 * 566-kids-shake-band — Shake the tablet; a batucada band plays back.
 *
 * Reference: Brazilian batucada bloco — street carnival percussion ensemble.
 * Shake intensity tiers map to instruments:
 *   gentle jiggle → chocalho (shaker grains)
 *   light shake   → repique (mid tom)
 *   medium shake  → caixa (snare crack)
 *   hard slam     → surdo (kick drum) + agogo bell accent
 *
 * Renderer: Three.js (present in package.json as "three": "^0.182.0").
 * Four glowing 3D characters on a stage — one per instrument, each a bold
 * saturated color. They bounce and flash on hits.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { buildAudioEngine, mapMagnitudeToHit, type BandHit, type AudioEngine } from "./audio";
import { makeMotionDetector, type MotionDetector } from "./motion";

// ── Character definitions ─────────────────────────────────────────────────

interface BandMember {
  hit: BandHit;
  label: string;
  color: number;
  emoji: string;
  baseY: number;
  bounceY: number;
  glowColor: string;  // CSS color for HTML overlay
}

const BAND_MEMBERS: BandMember[] = [
  {
    hit: "surdo",
    label: "Surdo",
    color: 0xff4d6a,   // rose-red
    emoji: "🥁",
    baseY: -0.6,
    bounceY: 1.2,
    glowColor: "rgba(255,77,106,",
  },
  {
    hit: "caixa",
    label: "Caixa",
    color: 0xfbbf24,   // amber
    emoji: "🪘",
    baseY: -0.5,
    bounceY: 1.0,
    glowColor: "rgba(251,191,36,",
  },
  {
    hit: "repique",
    label: "Repique",
    color: 0x34d399,   // emerald
    emoji: "🎶",
    baseY: -0.5,
    bounceY: 0.9,
    glowColor: "rgba(52,211,153,",
  },
  {
    hit: "chocalho",
    label: "Chocalho",
    color: 0xa78bfa,   // violet
    emoji: "🪗",
    baseY: -0.5,
    bounceY: 0.8,
    glowColor: "rgba(167,139,250,",
  },
  {
    hit: "agogo",
    label: "Agogô",
    color: 0x38bdf8,   // sky blue
    emoji: "🔔",
    baseY: -0.4,
    bounceY: 0.7,
    glowColor: "rgba(56,189,248,",
  },
];

// ── Three.js stage builder ────────────────────────────────────────────────

interface StageCharacter {
  mesh: THREE.Mesh;
  innerMesh: THREE.Mesh;
  light: THREE.PointLight;
  baseY: number;
  bounceY: number;
  bounceVel: number;
  spinVel: number;
  idlePhase: number;
}

function buildStage(canvas: HTMLCanvasElement): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  characters: StageCharacter[];
  dispose: () => void;
} {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setClearColor(0x0a0118, 1);

  const scene = new THREE.Scene();

  // Fog for depth
  scene.fog = new THREE.FogExp2(0x0a0118, 0.08);

  const camera = new THREE.PerspectiveCamera(
    60,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.5, 7);
  camera.lookAt(0, 0, 0);

  // Ambient fill
  const ambientLight = new THREE.AmbientLight(0x221144, 0.8);
  scene.add(ambientLight);

  // Stage floor plane
  const floorGeo = new THREE.PlaneGeometry(16, 8);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a0a2e,
    roughness: 0.9,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  scene.add(floor);

  // Stage back wall
  const wallGeo = new THREE.PlaneGeometry(16, 6);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x0d0625,
    roughness: 1.0,
    metalness: 0.0,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 1.5, -4);
  scene.add(wall);

  // Build 5 characters spaced evenly
  const characters: StageCharacter[] = [];
  const N = BAND_MEMBERS.length;
  const span = 7.0;

  BAND_MEMBERS.forEach((member, i) => {
    const xPos = -span / 2 + (i / (N - 1)) * span;

    // Body — rounded box shape using icosahedron for cute look
    const bodyGeo = new THREE.IcosahedronGeometry(0.55, 1);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: member.color,
      roughness: 0.3,
      metalness: 0.6,
      emissive: member.color,
      emissiveIntensity: 0.15,
    });
    const mesh = new THREE.Mesh(bodyGeo, bodyMat);
    mesh.position.set(xPos, member.baseY, 0);
    scene.add(mesh);

    // Inner bright core
    const coreGeo = new THREE.SphereGeometry(0.28, 12, 8);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
    });
    const innerMesh = new THREE.Mesh(coreGeo, coreMat);
    innerMesh.position.copy(mesh.position);
    scene.add(innerMesh);

    // Per-character point light
    const light = new THREE.PointLight(member.color, 0.0, 6);
    light.position.set(xPos, member.baseY + 0.5, 1.5);
    scene.add(light);

    characters.push({
      mesh,
      innerMesh,
      light,
      baseY: member.baseY,
      bounceY: member.bounceY,
      bounceVel: 0,
      spinVel: 0,
      idlePhase: (i / N) * Math.PI * 2,
    });
  });

  // Ceiling spots (decorative)
  const spotColors = [0xff6b9d, 0xffd93d, 0x6bcb77, 0x4d96ff];
  spotColors.forEach((col, i) => {
    const sl = new THREE.PointLight(col, 0.3, 10);
    sl.position.set(-4 + i * 2.5, 4, -1);
    scene.add(sl);
  });

  function dispose() {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    renderer.dispose();
  }

  return { renderer, scene, camera, characters, dispose };
}

// ── Fake motion for desktop drag fallback ─────────────────────────────────

function computeDragVelocity(dx: number, dy: number, dt: number): number {
  if (dt < 1) return 0;
  const speed = Math.sqrt(dx * dx + dy * dy) / dt; // px/ms
  return Math.min(1.0, speed / 2.5);
}

// ── Main component ────────────────────────────────────────────────────────

export default function KidsShakeBand() {
  const [phase, setPhase] = useState<"idle" | "started" | "running">("idle");
  const [motionStatus, setMotionStatus] = useState<"unknown" | "granted" | "denied" | "unsupported">("unknown");
  const [shakeHint, setShakeHint] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const motionRef = useRef<MotionDetector | null>(null);
  const rafRef = useRef<number>(0);

  // Per-character flash state (index → {intensity, tier})
  const flashRef = useRef<Array<{ intensity: number; tier: number }>>(
    BAND_MEMBERS.map(() => ({ intensity: 0, tier: -1 }))
  );

  // Drag fallback state
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; lastT: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
    lastT: 0,
  });

  // Trigger a character flash by hit type
  const triggerFlash = useCallback((hitType: BandHit | null, gain: number) => {
    if (!hitType) return;
    const tierMap: Record<BandHit, number> = {
      chocalho: 3,
      repique: 2,
      caixa: 1,
      surdo: 0,
      agogo: 4,
    };
    const idx = tierMap[hitType];
    if (idx !== undefined) {
      flashRef.current[idx].intensity = Math.min(1.0, gain * 1.4);
      flashRef.current[idx].tier = idx;
    }
    // Surdo also lights up agogo (they often go together in groove)
    if (hitType === "surdo") {
      flashRef.current[4].intensity = gain * 0.6;
    }
  }, []);

  // ── Start handler ─────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    setPhase("started");

    // 1. Build audio (must be inside gesture)
    const audio = buildAudioEngine();
    audioRef.current = audio;
    audio.startGroove();

    // 2. Request motion permission (iOS requires inside gesture)
    const detector = makeMotionDetector();
    motionRef.current = detector;

    const result = await detector.requestAndStart();
    setMotionStatus(result);

    if (result === "granted") {
      detector.onShake((onset) => {
        const hit = mapMagnitudeToHit(onset.magnitude);
        if (hit) {
          audio.fireHit(hit.type, hit.gain);
          triggerFlash(hit.type, hit.gain);
        }
      });
    }

    // Show shake hint briefly
    setTimeout(() => setShakeHint(true), 600);
    setTimeout(() => setShakeHint(false), 3500);

    setPhase("running");
  }, [triggerFlash]);

  // ── Three.js render loop ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Build Three.js stage
    const stage = buildStage(canvas);
    const { renderer, scene, camera, characters } = stage;

    // Resize handler
    const handleResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    // ── Render loop ──
    const clock = new THREE.Clock();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = clock.elapsedTime;

      characters.forEach((char, i) => {
        const flash = flashRef.current[i];

        // Idle bob (gentle always-on dance)
        const idleAmp = 0.06 + (flash.intensity > 0.1 ? flash.intensity * 0.1 : 0);
        const idleBob = Math.sin(t * 2.2 + char.idlePhase) * idleAmp;

        // Bounce on hit
        if (flash.intensity > 0.01) {
          char.bounceVel += flash.intensity * char.bounceY * 18 * dt;
          char.spinVel += flash.intensity * 4 * dt;
        }

        // Physics: spring back to baseY
        const displacement = char.mesh.position.y - char.baseY;
        const springForce = -8.0 * displacement;
        const dampForce = -4.5 * char.bounceVel;
        char.bounceVel += (springForce + dampForce) * dt;
        char.mesh.position.y += char.bounceVel * dt + idleBob;
        char.innerMesh.position.y = char.mesh.position.y;

        // Spin on hit
        char.mesh.rotation.y += char.spinVel * dt;
        char.mesh.rotation.z += Math.sin(t * 1.5 + char.idlePhase) * 0.008;
        char.spinVel *= Math.pow(0.12, dt);

        // Scale pulse on flash
        const scalePulse = 1.0 + flash.intensity * 0.35;
        char.mesh.scale.setScalar(scalePulse);
        char.innerMesh.scale.setScalar(scalePulse * 0.9);

        // Emissive glow
        const mat = char.mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.12 + flash.intensity * 1.1;

        // Inner core opacity
        const coreMat = char.innerMesh.material as THREE.MeshBasicMaterial;
        coreMat.opacity = 0.15 + flash.intensity * 0.7;

        // Point light intensity
        char.light.intensity = flash.intensity * 2.5 + Math.sin(t * 3.0 + char.idlePhase) * 0.08;
        char.light.position.y = char.mesh.position.y + 0.8;

        // Decay flash
        flash.intensity *= Math.pow(0.02, dt); // fast decay ~50ms halflife
        if (flash.intensity < 0.001) flash.intensity = 0;
      });

      // Camera gentle sway
      camera.position.x = Math.sin(t * 0.18) * 0.15;
      camera.position.y = 1.5 + Math.sin(t * 0.27) * 0.06;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      stage.dispose();
    };
  }, [phase]);

  // ── Cleanup audio + motion on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      motionRef.current?.stop();
      audioRef.current?.stopGroove();
      audioRef.current?.close();
      audioRef.current = null;
      motionRef.current = null;
    };
  }, []);

  // ── Drag fallback for desktop ─────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, lastT: performance.now() };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const now = performance.now();
    const dt = now - dragRef.current.lastT;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    const vel = computeDragVelocity(dx, dy, dt);
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, lastT: now };

    if (vel > 0.12) {
      const audio = audioRef.current;
      if (!audio) return;
      const hit = mapMagnitudeToHit(vel);
      if (hit) {
        audio.fireHit(hit.type, hit.gain);
        triggerFlash(hit.type, hit.gain);
      }
    }
  }, [triggerFlash]);

  const handlePointerUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  // ── Idle page visuals (auto-demo groove animation) ────────────────────────
  // This is pure CSS animation, no audio — respects autoplay policy
  const idleCharColors = ["#ff4d6a", "#fbbf24", "#34d399", "#a78bfa", "#38bdf8"];

  if (phase === "idle") {
    return (
      <div className="min-h-screen bg-[#0a0118] flex flex-col items-center justify-center px-6 py-10 overflow-hidden">
        {/* Animated demo band (CSS only, no audio) */}
        <div className="flex gap-3 mb-8" aria-hidden="true">
          {idleCharColors.map((col, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: 40,
                height: 40,
                backgroundColor: col,
                boxShadow: `0 0 18px ${col}`,
                animation: `shake-idle ${0.7 + i * 0.13}s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>

        <h1 className="text-3xl font-bold text-white text-center mb-2 leading-tight">
          Shake Band 🎉
        </h1>
        <p className="text-base text-white/75 text-center mb-8 max-w-xs leading-relaxed">
          Shake the tablet to play with your band!<br />
          Shake hard for the big drum — gentle for the shaker.
        </p>

        <button
          onClick={handleStart}
          className="min-h-[72px] min-w-[72px] px-10 py-4 rounded-3xl text-2xl font-extrabold text-white transition-transform active:scale-95"
          style={{
            background: "linear-gradient(135deg, #ff4d6a 0%, #a78bfa 100%)",
            boxShadow: "0 0 32px rgba(167,139,250,0.5), 0 4px 24px rgba(0,0,0,0.4)",
          }}
        >
          Start 🥁
        </button>

        <p className="text-sm text-white/50 mt-5 text-center max-w-xs">
          Shake your device · or drag fast on screen
        </p>

        {/* Keyframe injection */}
        <style>{`
          @keyframes shake-idle {
            from { transform: translateY(0px) scale(1); }
            to   { transform: translateY(-14px) scale(1.15); }
          }
        `}</style>
      </div>
    );
  }

  // ── Running stage ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0118] relative overflow-hidden touch-none select-none">
      {/* Three.js canvas — full screen */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* Character name overlays (decorative, not required to understand) */}
      <div className="absolute bottom-20 inset-x-0 flex justify-around px-3 pointer-events-none" aria-hidden="true">
        {BAND_MEMBERS.map((m, i) => (
          <span
            key={i}
            className="text-xl font-bold"
            style={{ color: `#${m.color.toString(16).padStart(6, "0")}`, textShadow: `0 0 10px #${m.color.toString(16).padStart(6, "0")}` }}
          >
            {m.emoji}
          </span>
        ))}
      </div>

      {/* Status: no motion sensor */}
      {(motionStatus === "denied" || motionStatus === "unsupported") && (
        <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
          <p className="text-rose-300 text-base bg-black/60 rounded-xl px-4 py-2 text-center max-w-xs">
            {motionStatus === "denied"
              ? "Motion not allowed — drag fast to play!"
              : "No motion sensor — drag fast to play!"}
          </p>
        </div>
      )}

      {/* Shake hint — fades in briefly */}
      {shakeHint && motionStatus === "granted" && (
        <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
          <p className="text-emerald-300/95 text-xl font-bold animate-pulse">
            SHAKE IT! 🎉
          </p>
        </div>
      )}

      {/* Title badge */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <span className="text-sm text-white/50 bg-black/40 rounded-lg px-2 py-1">
          Shake Band
        </span>
      </div>

      {/* Drag hint for desktop (no motion) */}
      {motionStatus !== "granted" && (
        <div className="absolute bottom-6 inset-x-0 flex justify-center pointer-events-none">
          <span className="text-sm text-white/50">
            drag fast to play
          </span>
        </div>
      )}
    </div>
  );
}
