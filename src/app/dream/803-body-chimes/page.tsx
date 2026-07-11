"use client";

// ── Body Chimes · Struck Room ────────────────────────────────────────────────
// "What if your whole moving body played an invisible, room-sized instrument of
//  STRUCK RESONANT BODIES — bars, bowls and bells suspended in 3D — each limb
//  striking the ones it sweeps through, ringing with real MODAL physical-
//  modeling synthesis, slowly accreting into an evolving resonant cloud?"
//
// INPUT  : front camera → MediaPipe Pose (CDN at runtime). Wrists, ankles, head
//          become luminous strikers projected into the room.
// OUTPUT : three.js WebGL — a dark volumetric field of glowing resonant bodies.
// CORE   : 3D collision (striker sweeps through a body) → MODAL synthesis voice
//          (a bank of inharmonic damped-sine modes, bandpass-resonator method).
// ACCRETE: every strike feeds a sympathetic mode-bed that lingers and grows, so
//          the room is a fuller, drifting cloud at minute 5 than minute 1.
// VIBE   : adult, meditative, installation. Warm-metallic amber/violet glow.

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  ModalEngine,
  makeBodyField,
  type ResonantBodySpec,
} from "./audio";
import {
  createLandmarker,
  strikersFromLandmarks,
  ghostStrikers,
  STRIKER_KEYS,
  type StrikerSet,
  type StrikerKey,
  type PoseLandmarkerInst,
} from "./pose";

type Phase = "idle" | "running";

const FIELD_COUNT = 24;

// Map normalized body space ([-1,1] x/y, 0..1 depth) into world coordinates.
function toWorld(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x * 4.2, y * 2.8, -2.0 - (1 - z) * 3.2);
}

// Per-body visual + collision state kept outside React.
interface BodyVisual {
  spec: ResonantBodySpec;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  world: THREE.Vector3;
  ring: number; // 0..1 current ring brightness (decays each frame)
  lastStrike: number; // perf time of last strike (refractory)
  baseScale: number;
}

interface StrikerVisual {
  orb: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  prev: THREE.Vector3;
  speed: number;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  bodies: BodyVisual[];
  strikers: Map<StrikerKey, StrikerVisual>;
  particles: THREE.Points;
  particleGeo: THREE.BufferGeometry;
  particleMat: THREE.PointsMaterial;
  cloudLight: THREE.PointLight;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

const REFRACTORY_MS = 280; // per-body anti-machine-gun window
const STRIKE_RADIUS = 0.9; // world-space proximity for a strike

export default function BodyChimesPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [ghostMode, setGhostMode] = useState(false);
  const [glError, setGlError] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const engineRef = useRef<ModalEngine | null>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const lastPoseAtRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const ghostActiveRef = useRef<boolean>(false);
  const smoothRef = useRef<StrikerSet | null>(null);
  const lastEvolveRef = useRef<number>(0);

  // ── three.js scene construction ──
  const buildScene = useCallback((): boolean => {
    const mount = mountRef.current;
    if (!mount) return false;
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
    renderer.setClearColor(0x070509, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070509, 0.07);

    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
    camera.position.set(0, 0.4, 7.6);
    camera.lookAt(0, 0, -2.5);

    // Warm dim ambient so metal reads without flattening the dark.
    scene.add(new THREE.AmbientLight(0x3a2a20, 0.6));
    const key = new THREE.DirectionalLight(0xffd9a0, 0.5);
    key.position.set(2, 4, 3);
    scene.add(key);
    const violet = new THREE.PointLight(0x6a4cff, 0.7, 30);
    violet.position.set(-4, -1, -2);
    scene.add(violet);
    // A point light at the room centre that brightens as the cloud accretes.
    const cloudLight = new THREE.PointLight(0xffb066, 0.0, 24);
    cloudLight.position.set(0, 0, -3);
    scene.add(cloudLight);

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];

    // Shared geometries per body kind (varied shapes: bar, bowl, bell).
    const barGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.9, 12);
    const bowlGeo = new THREE.SphereGeometry(
      1,
      24,
      16,
      0,
      Math.PI * 2,
      Math.PI * 0.4,
      Math.PI * 0.6,
    );
    const bellGeo = new THREE.ConeGeometry(1, 1.5, 20, 1, true);
    geometries.push(barGeo, bowlGeo, bellGeo);

    const specs = makeBodyField(FIELD_COUNT);
    const bodies: BodyVisual[] = [];
    for (const spec of specs) {
      const geo =
        spec.kind === "bar" ? barGeo : spec.kind === "bowl" ? bowlGeo : bellGeo;
      const col = new THREE.Color().setHSL(spec.hue, 0.75, 0.5);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col.clone().multiplyScalar(0.25),
        metalness: 0.85,
        roughness: 0.32,
      });
      materials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      const world = toWorld(spec.pos.x, spec.pos.y, spec.pos.z * 0.5 + 0.5);
      mesh.position.copy(world);
      mesh.rotation.set(
        spec.id * 0.7,
        spec.id * 1.3,
        spec.kind === "bar" ? Math.PI * 0.5 * ((spec.id % 2) - 0.5) : 0,
      );
      const baseScale = spec.radius * 1.6;
      mesh.scale.setScalar(baseScale);
      scene.add(mesh);
      bodies.push({
        spec,
        mesh,
        mat,
        world,
        ring: 0,
        lastStrike: -9999,
        baseScale,
      });
    }

    // Striker light-orbs.
    const strikers = new Map<StrikerKey, StrikerVisual>();
    const orbGeo = new THREE.SphereGeometry(0.16, 16, 16);
    geometries.push(orbGeo);
    for (const key of STRIKER_KEYS) {
      const isHead = key === "head";
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(isHead ? 0.1 : 0.07, 0.6, 0.7),
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
      });
      materials.push(mat);
      const orb = new THREE.Mesh(orbGeo, mat);
      orb.visible = false;
      scene.add(orb);
      strikers.set(key, {
        orb,
        mat,
        prev: new THREE.Vector3(),
        speed: 0,
      });
    }

    // Atmospheric dust particles for volumetric depth.
    const N = 700;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = -Math.random() * 12 - 0.5;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    const particleMat = new THREE.PointsMaterial({
      color: 0xffcaa0,
      size: 0.04,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      bodies,
      strikers,
      particles,
      particleGeo,
      particleMat,
      cloudLight,
      geometries,
      materials,
    };
    return true;
  }, []);

  // ── per-frame: project strikers, test collisions, ring bodies ──
  const renderFrame = useCallback((raw: StrikerSet, isGhost: boolean) => {
    const s = sceneRef.current;
    if (!s) return;
    const now = performance.now();

    // Low-pass smooth strikers for liquid motion (ghost is already smooth).
    const prev = smoothRef.current;
    const a = isGhost ? 1 : 0.4;
    let cur = raw;
    if (prev) {
      const merged = {} as StrikerSet;
      for (const k of STRIKER_KEYS) {
        const np = raw[k];
        const pp = prev[k] ?? np;
        merged[k] = {
          x: pp.x + (np.x - pp.x) * a,
          y: pp.y + (np.y - pp.y) * a,
          z: pp.z + (np.z - pp.z) * a,
          v: np.v,
        };
      }
      cur = merged;
    }
    smoothRef.current = cur;

    const engine = engineRef.current;

    // Update striker orbs + speeds, then collide against the field.
    for (const key of STRIKER_KEYS) {
      const sv = s.strikers.get(key);
      const p = cur[key];
      if (!sv) continue;
      if (!p || p.v < 0.25) {
        sv.orb.visible = false;
        continue;
      }
      const world = toWorld(p.x, p.y, p.z);
      // Speed (world units/frame) → strike velocity.
      const speed = sv.orb.visible ? world.distanceTo(sv.prev) : 0;
      sv.speed = sv.speed * 0.6 + speed * 0.4;
      sv.prev.copy(world);
      sv.orb.position.copy(world);
      sv.orb.visible = true;
      const glow = 0.7 + Math.min(1, sv.speed * 4) * 1.1;
      sv.orb.scale.setScalar(glow);
      sv.mat.opacity = 0.6 + Math.min(0.4, sv.speed * 3);

      // Collision test against each body.
      if (engine) {
        for (const b of s.bodies) {
          const dist = world.distanceTo(b.world);
          if (dist > STRIKE_RADIUS) continue;
          if (now - b.lastStrike < REFRACTORY_MS) continue;
          // Need real movement to strike (so a resting limb doesn't drone).
          const vel = Math.min(1, sv.speed * 5 + 0.12);
          if (sv.speed < 0.008) continue;
          b.lastStrike = now;
          // Closer + faster → louder. Falloff with distance.
          const prox = 1 - dist / STRIKE_RADIUS;
          engine.strike(b.spec, vel * (0.4 + prox * 0.6));
          b.ring = Math.min(1.4, b.ring + 0.8 + vel * 0.6);
        }
      }
    }

    // Decay + animate ringing bodies.
    for (const b of s.bodies) {
      b.ring *= 0.93;
      const wob = b.ring * Math.sin(now * 0.02 + b.spec.id) * 0.12;
      b.mesh.scale.setScalar(b.baseScale * (1 + b.ring * 0.18 + wob));
      b.mesh.rotation.y += 0.0015 + b.ring * 0.01;
      const e = 0.25 + b.ring * 1.6;
      b.mat.emissive.setHSL(b.spec.hue, 0.7, Math.min(0.65, 0.12 + b.ring * 0.4));
      b.mat.emissiveIntensity = e;
    }

    // Accretion visuals: cloud light grows with the audio cloud level.
    if (engine) {
      const cloud = engine.cloudLevel();
      s.cloudLight.intensity = cloud * 1.8;
      s.particleMat.opacity = 0.28 + cloud * 0.4;
    }

    // Slow drifting dust + breathing camera orbit (installation feel).
    s.particles.rotation.y += 0.0004;
    const t = now * 0.001;
    s.camera.position.x = Math.sin(t * 0.08) * 1.3;
    s.camera.position.y = 0.4 + Math.sin(t * 0.05) * 0.4;
    s.camera.lookAt(0, 0, -2.5);

    s.renderer.render(s.scene, s.camera);

    // Long-form evolution tick (~once/second).
    if (engine && now - lastEvolveRef.current > 1000) {
      lastEvolveRef.current = now;
      engine.evolve();
      engine.reap();
    }
  }, []);

  // ── main loop ──
  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const now = performance.now();
    const lm = landmarkerRef.current;
    const video = videoRef.current;

    let got = false;
    if (lm && video && video.readyState >= 2) {
      try {
        const res = lm.detectForVideo(video, now);
        const p = res.landmarks?.[0];
        if (p && p.length > 28) {
          lastPoseAtRef.current = now;
          ghostActiveRef.current = false;
          if (ghostMode) setGhostMode(false);
          renderFrame(strikersFromLandmarks(p), false);
          got = true;
        }
      } catch {
        /* detection hiccup — fall through to ghost */
      }
    }

    // No live pose for ~2s (or no camera/model) → self-playing ghost body.
    if (!got) {
      const idle =
        now - lastPoseAtRef.current > 2000 || lastPoseAtRef.current === 0;
      if (idle) {
        if (!ghostActiveRef.current) {
          ghostActiveRef.current = true;
          setGhostMode(true);
        }
        const tSec = (now - startedAtRef.current) / 1000;
        renderFrame(ghostStrikers(tSec), true);
      }
    }
  }, [ghostMode, renderFrame]);

  // ── camera + landmarker (best-effort) ──
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
        landmarkerRef.current = await createLandmarker();
        setNotice(null);
      } catch {
        setNotice("Camera unavailable — the room plays itself.");
      }
    } catch {
      setNotice("Camera unavailable — the room plays itself.");
    }
  }, []);

  // ── primary action: Start (AudioContext inside the gesture for iOS) ──
  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("running");
    startedAtRef.current = performance.now();
    lastPoseAtRef.current = 0;
    lastEvolveRef.current = performance.now();

    const engine = new ModalEngine();
    engineRef.current = engine;
    try {
      await engine.start(makeBodyField(FIELD_COUNT));
    } catch {
      setNotice("Audio could not start in this browser.");
    }

    if (!sceneRef.current && !glError) buildScene();
    startCamera();
  }, [phase, glError, buildScene, startCamera]);

  // Build scene early so the field shimmers BEFORE audio unlocks.
  useEffect(() => {
    if (!buildScene()) return;
    startedAtRef.current = performance.now();
    const preview = () => {
      rafRef.current = requestAnimationFrame(preview);
      const tSec = (performance.now() - startedAtRef.current) / 1000;
      renderFrame(ghostStrikers(tSec), true);
    };
    rafRef.current = requestAnimationFrame(preview);

    const onResize = () => {
      const sc = sceneRef.current;
      const mount = mountRef.current;
      if (!sc || !mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      sc.camera.aspect = w / h;
      sc.camera.updateProjectionMatrix();
      sc.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When Start is pressed, swap the preview rAF for the real (camera) loop.
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
        for (const g of s.geometries) g.dispose();
        for (const m of s.materials) m.dispose();
        s.particleGeo.dispose();
        s.particleMat.dispose();
        s.renderer.dispose();
        s.renderer.forceContextLoss();
        if (s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
        sceneRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#070509] text-foreground">
      {/* three.js canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* hidden video element feeding MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">
            WebGL is unavailable in this browser, so the struck room can&apos;t
            render. Modal synthesis still rings when you press Start.
          </p>
        </div>
      )}

      {/* top-left: title + description */}
      <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-7">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Body Chimes
        </h1>
        <p className="mt-2 max-w-md text-base leading-snug text-foreground">
          Your moving body plays an invisible, room-sized instrument of struck
          resonant bodies. Each limb rings the bars, bowls and bells it sweeps
          through; the room slowly accretes into a shimmering cloud.
        </p>
        <p className="mt-2 max-w-md font-mono text-base text-muted-foreground">
          Camera stays on-device. Nothing is stored or sent.
        </p>
      </div>

      {/* status line */}
      {phase === "running" && ghostMode && (
        <div className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 sm:left-7">
          <p className="font-mono text-base text-violet-200/80">
            ghost body — the room is playing itself
          </p>
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 w-[min(90vw,40rem)] -translate-x-1/2 p-4 text-center">
          <p className="text-base text-violet-300">{notice}</p>
        </div>
      )}

      {/* Start button */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex items-end justify-center pb-16 sm:items-center sm:pb-0">
          <button
            onClick={start}
            className="pointer-events-auto min-h-[44px] rounded-full border border-violet-200/30 bg-violet-100/10 px-4 py-2.5 font-mono text-base font-medium text-foreground backdrop-blur-md transition-colors hover:bg-violet-100/20"
          >
            ▶ Start — enter the struck room
          </button>
        </div>
      )}

      {/* corner: scroll to in-page design notes */}
      <a
        href="#notes"
        className="pointer-events-auto absolute bottom-4 right-4 min-h-[44px] rounded-full border border-border bg-black/50 px-4 py-2.5 font-mono text-base text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
      >
        Read the design notes
      </a>

      {/* in-page design notes (anchor target, scrolls into view) */}
      <section
        id="notes"
        className="absolute left-0 top-full w-full bg-[#070509] px-6 py-12 sm:px-10"
      >
        <div className="mx-auto max-w-2xl">
          <h2 className="font-serif text-2xl font-semibold text-foreground">
            Design notes — Body Chimes / Struck Room
          </h2>
          <p className="mt-4 text-base leading-relaxed text-foreground">
            The room suspends {FIELD_COUNT} resonant bodies — bars, bowls and
            bells — in a dark 3D volume, each tuned to a just-intonation degree
            over a low ~110&nbsp;Hz root so the field is always consonant. Your
            wrists, ankles and head become luminous strikers. When a striker
            sweeps through a body with real speed, it strikes it: the body rings
            and visibly blooms, and its amplitude is set by the limb&apos;s
            velocity. A per-body refractory window stops machine-gunning.
          </p>
          <p className="mt-4 text-base leading-relaxed text-foreground">
            Each ring is genuine <strong>modal synthesis</strong>: a bank of
            high-Q bandpass resonators excited by a short impulse, one resonator
            per physical mode. The partials are inharmonic and characteristic of
            the body — bells ~[1, 2.0, 2.4, 3.0, 4.5, 5.33], free-free bars ~[1,
            2.76, 5.40, 8.93, 13.34], singing bowls nearly harmonic ~[1, 2.01,
            2.83, 4.22, 5.0]. Higher modes are excited less and decay faster, as
            in a real struck metal body.
          </p>
          <p className="mt-4 text-base leading-relaxed text-foreground">
            Long-form <strong>accretion</strong>: every strike feeds a
            sympathetic mode-bed — always-on resonators tuned to the scale that
            linger for ~25&nbsp;s and slowly grow over ~4 minutes, biased by a
            struck-body memory and a ±0.35% root detune that breathes on a
            90-second cycle. Minute&nbsp;5 sounds fuller and subtly shifted from
            minute&nbsp;1. The central warm light brightens with the cloud.
          </p>
          <p className="mt-4 text-base leading-relaxed text-foreground">
            References: <strong>Vrengt</strong> (Erdem, Jensenius et al.,
            NIME&nbsp;2019 / arXiv:2010.03779) — the shared body-machine
            instrument framing of dance-as-musicianship; the{" "}
            <strong>modal synthesis</strong> tradition of struck bars, plates
            and bells (cf. Cadoz / ACROE CORDIS-ANIMA physical modeling); and
            Bernhard Leitner&apos;s sound-sculpture installations for the
            room-as-instrument spatial sensibility.
          </p>
          <p className="mt-4 font-mono text-base text-muted-foreground">
            Controls: press Start, then move. Camera denied or MediaPipe
            unavailable → a ghost body drifts through the field so the piece
            plays hands-free.
          </p>
        </div>
      </section>
    </main>
  );
}
