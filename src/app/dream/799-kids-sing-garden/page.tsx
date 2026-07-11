"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { AudioEngine } from "./audio";
import {
  LSystem,
  GardenState,
  pitchToAngle,
  rmsToRadius,
  glowIntensity,
  type PlantParams,
  type BranchSegment,
} from "./lsystem";

// ── constants ────────────────────────────────────────────────────────────────
const BG_COLOR = 0xfdf6e3; // warm cream
const GOODNIGHT_START_MS = 12 * 60 * 1000;

// Tip bloom colours: warm greens and golds
const TIP_COLORS = [
  0x86efac, 0xa3e635, 0xfde68a, 0xfbbf24, 0x6ee7b7,
  0xd9f99d, 0xfef08a, 0xbbf7d0, 0xfcd34d, 0x99f6e4,
];

// ── Three.js scene helpers ───────────────────────────────────────────────────

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ground: THREE.Mesh;
}

function buildScene(canvas: HTMLCanvasElement): SceneRefs {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG_COLOR);
  scene.fog = new THREE.FogExp2(BG_COLOR, 0.04);

  // Warm daylight lighting
  const ambient = new THREE.AmbientLight(0xfff8e1, 0.7);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff3cd, 1.4);
  sun.position.set(5, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 1024;
  sun.shadow.mapSize.height = 1024;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xe0f2fe, 0.3);
  fill.position.set(-4, 3, -2);
  scene.add(fill);

  // Ground plane
  const groundGeo = new THREE.CircleGeometry(12, 64);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0xd1fae5 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Camera from slight elevation
  const camera = new THREE.PerspectiveCamera(
    55,
    canvas.clientWidth / canvas.clientHeight,
    0.05,
    100
  );
  camera.position.set(0, 4, 8);
  camera.lookAt(0, 1.2, 0);

  return { renderer, scene, camera, ground };
}

function resizeRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement
): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

// ── plant drawing ────────────────────────────────────────────────────────────

interface PlantMeshes {
  branches: THREE.Mesh[];
  blooms: THREE.Mesh[];
}

function drawPlant(
  scene: THREE.Scene,
  segments: BranchSegment[],
  params: PlantParams,
  cx: number,
  cz: number
): PlantMeshes {
  const branches: THREE.Mesh[] = [];
  const blooms: THREE.Mesh[] = [];

  // Bark colour: greenish brown, modulated by pitch class
  const hue = 0.25 + (params.pitchClass / 11) * 0.15; // 0.25–0.40 (green to yellow-green)
  const branchColor = new THREE.Color().setHSL(hue, 0.45, 0.35);

  for (const seg of segments) {
    const radius = rmsToRadius(params.rms, seg.depth);
    const dx = seg.x1 - seg.x0 + cx - cx; // offset already applied in buildSegments
    const dy = seg.y1 - seg.y0;
    const dz = seg.z1 - seg.z0 + cz - cz;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (length < 0.001) continue;

    const geo = new THREE.CylinderGeometry(radius * 0.6, radius, length, 5, 1);
    const mat = new THREE.MeshLambertMaterial({
      color: branchColor,
      emissive: new THREE.Color(0x4ade80),
      emissiveIntensity: glowIntensity(params.rms, false),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;

    // Position at segment midpoint
    mesh.position.set(
      (seg.x0 + seg.x1) / 2,
      (seg.y0 + seg.y1) / 2,
      (seg.z0 + seg.z1) / 2
    );

    // Orient along segment direction
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
    mesh.setRotationFromQuaternion(quaternion);

    scene.add(mesh);
    branches.push(mesh);

    // Bloom sphere at tips
    if (seg.isTip) {
      const bloomRadius = radius * 2.5 + 0.02;
      const bloomGeo = new THREE.SphereGeometry(bloomRadius, 8, 6);
      const tipColorHex = TIP_COLORS[Math.floor(seg.glowSeed * TIP_COLORS.length)];
      const bloomMat = new THREE.MeshLambertMaterial({
        color: tipColorHex,
        emissive: new THREE.Color(tipColorHex),
        emissiveIntensity: 0.3,
      });
      const bloom = new THREE.Mesh(bloomGeo, bloomMat);
      bloom.position.set(seg.x1, seg.y1, seg.z1);
      scene.add(bloom);
      blooms.push(bloom);
    }
  }

  return { branches, blooms };
}

function applyGlow(
  meshes: PlantMeshes,
  glowing: boolean,
  rms: number,
  t: number
): void {
  const intensity = glowIntensity(rms, glowing);
  const pulse = glowing ? 0.5 + 0.5 * Math.sin(t * 0.006) : 1;

  for (const mesh of meshes.branches) {
    const mat = mesh.material as THREE.MeshLambertMaterial;
    mat.emissiveIntensity = intensity * pulse;
  }
  for (const bloom of meshes.blooms) {
    const mat = bloom.material as THREE.MeshLambertMaterial;
    mat.emissiveIntensity = glowing ? 0.8 + 0.5 * Math.sin(t * 0.008 + 1) : 0.3;
    const s = glowing ? 1 + 0.12 * Math.sin(t * 0.006) : 1;
    bloom.scale.setScalar(s);
  }
}

function disposePlantMeshes(scene: THREE.Scene, meshes: PlantMeshes): void {
  for (const mesh of [...meshes.branches, ...meshes.blooms]) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => m.dispose());
    } else {
      mesh.material.dispose();
    }
  }
}

// ── growing plant (live, per-note) ───────────────────────────────────────────

interface GrowingPlant {
  lsystem: LSystem;
  params: PlantParams;
  iterations: number;
  cx: number;
  cz: number;
  meshes: PlantMeshes | null;
  lastSegCount: number;
  notesAccum: Array<{ hz: number; duration: number }>;
  hz: number;
  angle: number;
  stepLen: number;
}

function rebuildGrowingMeshes(
  scene: THREE.Scene,
  gp: GrowingPlant
): PlantMeshes {
  if (gp.meshes) disposePlantMeshes(scene, gp.meshes);
  const str = gp.lsystem.iterate(gp.iterations);
  const segs = LSystem.buildSegments(str, gp.angle, gp.stepLen, gp.cx, gp.cz);
  gp.lastSegCount = segs.length;
  return drawPlant(scene, segs, gp.params, gp.cx, gp.cz);
}

// ── main component ───────────────────────────────────────────────────────────

export default function KidsSingGarden() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const gardenRef = useRef<GardenState>(new GardenState());
  const plantMeshesRef = useRef<Map<number, PlantMeshes>>(new Map());
  const growingRef = useRef<GrowingPlant | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const [started, setStarted] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [plantCount, setPlantCount] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);

  // README content (static — no I/O needed)
  const readmeText = `
**For**: kids (4+)

Sing into the mic and watch a living garden grow in real time.

**How to play**: Press Start Garden → sing or hum → watch your plant grow → go quiet → the garden sings your melody back!

**References**: L-systems (Prusinkiewicz & Lindenmayer, *The Algorithmic Beauty of Plants*) · Mort Garson, *Mother Earth's Plantasia* (1976) · Chris Wilson autocorrelation pitch detection · Pauline Oliveros, *Deep Listening*
  `.trim();

  const handleSilence = useCallback(() => {
    if (!audioRef.current || !sceneRef.current) return;

    const phrase = audioRef.current.getPhrase();
    if (phrase.length === 0) return;

    // Commit the growing plant to the permanent garden
    const gp = growingRef.current;
    if (gp) {
      const garden = gardenRef.current;
      const finalStr = gp.lsystem.iterate(gp.iterations);
      const finalSegs = LSystem.buildSegments(finalStr, gp.angle, gp.stepLen, gp.cx, gp.cz);

      // Add to garden at the next spiral position
      garden.addPlant(gp.params, finalSegs);
      const newIdx = garden.plants.length - 1;
      const plant = garden.plants[newIdx];

      // Rebuild meshes at the plant's final position
      if (gp.meshes) disposePlantMeshes(sceneRef.current.scene, gp.meshes);
      const permaSegs = LSystem.buildSegments(
        gp.lsystem.iterate(gp.iterations),
        gp.angle,
        gp.stepLen,
        plant.cx,
        plant.cz
      );
      const permaMeshes = drawPlant(
        sceneRef.current.scene,
        permaSegs,
        gp.params,
        plant.cx,
        plant.cz
      );
      plantMeshesRef.current.set(newIdx, permaMeshes);
      growingRef.current = null;
      setPlantCount(garden.plants.length);
    }

    // Play call-and-response
    audioRef.current.playCallResponse(phrase);
    audioRef.current.clearPhrase();

    // Glow all plants
    gardenRef.current.glowAll();
    setIsReplaying(true);

    // Stop glow after melody duration
    const totalDur = phrase.reduce((s, n) => s + Math.min(1.2, n.duration) * 0.85 + 0.05, 0);
    setTimeout(() => {
      gardenRef.current.stopAllGlow();
      setIsReplaying(false);
    }, (totalDur + 1) * 1000);
  }, []);

  const handlePitch = useCallback((hz: number, rms: number) => {
    if (!sceneRef.current) return;
    const { scene } = sceneRef.current;
    const garden = gardenRef.current;

    // Map hz → pitchClass (C=0…B=11)
    const pitchClass = Math.round(12 * Math.log2(hz / 16.352)) % 12;
    const angle = pitchToAngle(hz);
    const iterations = rms > 0.6 ? 4 : rms > 0.3 ? 3 : 2;
    const stepLen = 0.18 + rms * 0.14;

    const gp = growingRef.current;

    if (!gp) {
      // Start a new growing plant at centre (will be relocated on silence)
      const params: PlantParams = { pitchClass, rms, notes: [] };
      const lsystem = LSystem.forParams(params);
      const nextIdx = garden.plants.length;
      const goldenAngle = 137.5077640500378 * (Math.PI / 180);
      const r = nextIdx === 0 ? 0 : 0.6 + nextIdx * 0.35;
      const theta = nextIdx * goldenAngle;
      const cx = r * Math.cos(theta);
      const cz = r * Math.sin(theta);

      const newGp: GrowingPlant = {
        lsystem,
        params,
        iterations,
        cx,
        cz,
        meshes: null,
        lastSegCount: 0,
        notesAccum: [],
        hz,
        angle,
        stepLen,
      };
      newGp.meshes = rebuildGrowingMeshes(scene, newGp);
      growingRef.current = newGp;
    } else {
      // Update existing growing plant
      const changed =
        Math.abs(angle - gp.angle) > 0.02 ||
        Math.abs(stepLen - gp.stepLen) > 0.01 ||
        iterations !== gp.iterations;

      gp.params.rms = rms;
      gp.params.pitchClass = pitchClass;
      gp.angle = angle;
      gp.stepLen = stepLen;
      gp.iterations = iterations;
      gp.hz = hz;

      if (changed) {
        gp.lsystem = LSystem.forParams(gp.params);
        gp.meshes = rebuildGrowingMeshes(scene, gp);
      } else {
        // Apply glow update without rebuilding
        if (gp.meshes) applyGlow(gp.meshes, false, rms, performance.now());
      }
    }
  }, []);

  const startGarden = useCallback(async () => {
    if (!canvasRef.current) return;

    // Test WebGL
    const testCtx = canvasRef.current.getContext("webgl2") || canvasRef.current.getContext("webgl");
    if (!testCtx) {
      setNoWebGL(true);
      return;
    }

    // Build scene
    const sceneRefs = buildScene(canvasRef.current);
    sceneRef.current = sceneRefs;
    startTimeRef.current = performance.now();

    // Start audio
    const engine = new AudioEngine();
    audioRef.current = engine;

    try {
      await engine.start(handlePitch, handleSilence);
    } catch {
      // engine handles internally with ghost hum
    }

    // Check if mic was denied (engine falls back to ghost mode)
    // We detect this by trying independently
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicDenied(true);
    }

    setStarted(true);

    // Animation loop
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (!sceneRef.current) return;

      const { renderer, scene, camera } = sceneRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;

      resizeRenderer(renderer, camera, canvas);

      const nowMs = performance.now();
      const elapsed = nowMs - startTimeRef.current;

      // Goodnight fade after 12 minutes
      const fadeT =
        elapsed > GOODNIGHT_START_MS
          ? Math.max(0, 1 - (elapsed - GOODNIGHT_START_MS) / (2 * 60 * 1000))
          : 1;

      // Update permanent plant glows
      const garden = gardenRef.current;
      for (let i = 0; i < garden.plants.length; i++) {
        const plant = garden.plants[i];
        const meshes = plantMeshesRef.current.get(i);
        if (meshes) {
          applyGlow(meshes, plant.glowing, plant.params.rms * fadeT, nowMs);
        }
      }

      // Camera gentle drift
      const drift = nowMs * 0.00008;
      camera.position.x = Math.sin(drift) * 0.4;
      camera.lookAt(0, 1.2 + Math.sin(drift * 0.7) * 0.1, 0);

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [handlePitch, handleSilence]);

  // Teardown on unmount
  useEffect(() => {
    // Capture refs at effect setup time so the cleanup closure has stable values
    const rafRefCapture = rafRef;
    const audioRefCapture = audioRef;
    const sceneRefCapture = sceneRef;
    const plantMeshesCapture = plantMeshesRef;
    const growingCapture = growingRef;

    return () => {
      if (rafRefCapture.current !== null) cancelAnimationFrame(rafRefCapture.current);
      audioRefCapture.current?.stop();

      const sr = sceneRefCapture.current;
      if (sr) {
        // Dispose all plant meshes
        for (const meshes of plantMeshesCapture.current.values()) {
          disposePlantMeshes(sr.scene, meshes);
        }
        const gp = growingCapture.current;
        if (gp?.meshes) disposePlantMeshes(sr.scene, gp.meshes);

        // Dispose ground
        sr.ground.geometry.dispose();
        (sr.ground.material as THREE.Material).dispose();

        sr.renderer.forceContextLoss();
        sr.renderer.dispose();
      }
    };
  }, []);

  return (
    <div className="relative w-full min-h-screen" style={{ background: "#fdf6e3" }}>
      {/* Canvas fills behind everything */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: started && !noWebGL ? "block" : "none" }}
      />

      {/* UI overlay — always on top */}
      <div className="relative z-10 flex flex-col items-center pointer-events-none"
        style={{ minHeight: "100vh" }}>

        {/* Header */}
        <div className="w-full px-4 pt-6 pb-2 flex flex-col items-center pointer-events-auto">
          <h1 className="text-stone-900 font-bold tracking-tight text-center"
            style={{ fontSize: "clamp(1.5rem, 4vw, 2.5rem)" }}>
            🌱 Singing Garden
          </h1>
          <p className="text-stone-700 text-center mt-1" style={{ fontSize: "clamp(1rem, 2.5vw, 1.2rem)" }}>
            Sing to grow a plant. Go quiet — the garden sings back.
          </p>
        </div>

        {/* Status badges */}
        {started && (
          <div className="flex gap-2 mt-2 pointer-events-auto flex-wrap justify-center px-2">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-violet-100 text-violet-800 border border-violet-200">
              🌿 {plantCount} plant{plantCount !== 1 ? "s" : ""}
            </span>
            {isReplaying && (
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-violet-100 text-violet-800 border border-violet-200 animate-pulse">
                🔔 Garden is singing…
              </span>
            )}
            {micDenied && (
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-violet-100 text-violet-700 border border-violet-200">
                Mic unavailable — ghost garden is growing
              </span>
            )}
          </div>
        )}

        {/* No WebGL notice */}
        {noWebGL && (
          <div className="mt-8 mx-4 p-4 rounded-xl bg-violet-50 border border-violet-200 text-stone-800 text-center max-w-md pointer-events-auto">
            <p className="font-semibold text-lg">WebGL not available</p>
            <p className="text-sm mt-1 text-stone-600">
              Your browser or device does not support WebGL. Try Chrome or Firefox on a desktop.
              The ambient garden sounds will still play.
            </p>
          </div>
        )}

        {/* Start button */}
        {!started && (
          <div className="flex-1 flex flex-col items-center justify-center pointer-events-auto">
            <button
              onClick={startGarden}
              className="px-10 py-6 rounded-3xl font-bold text-foreground shadow-xl transition-transform active:scale-95"
              style={{
                fontSize: "clamp(1.2rem, 3.5vw, 1.8rem)",
                background: "linear-gradient(135deg, #4ade80, #22c55e)",
                minWidth: 200,
                minHeight: 80,
                boxShadow: "0 6px 24px rgba(74,222,128,0.4)",
              }}
            >
              🌸 Start Garden
            </button>
            <p className="text-stone-500 text-sm mt-4 text-center max-w-xs">
              No reading needed — just sing!
            </p>
          </div>
        )}

        {/* Bottom toolbar */}
        <div className="w-full px-4 pb-4 pt-2 flex justify-center pointer-events-auto">
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="text-stone-600 text-sm underline underline-offset-2 hover:text-stone-800 transition-colors"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>
      </div>

      {/* Design notes panel */}
      {showNotes && (
        <div className="relative z-20 mx-auto max-w-2xl px-4 pb-8">
          <div className="rounded-2xl bg-stone-50/95 border border-stone-200 p-5 shadow-lg text-stone-800"
            style={{ fontSize: 15, lineHeight: 1.6 }}>
            <h2 className="font-bold text-stone-900 text-lg mb-2">Design Notes</h2>
            <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700">
              {readmeText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
