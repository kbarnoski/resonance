"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mulberry32, stepArc, fillField } from "./field";
import { createAudioEngine, RATIOS, type AudioEngine } from "./audio";

const RES = 40; // marching-cubes grid resolution
const HALF_EXTENT = 13; // world half-size of the meshed box around the camera
const MAX_POLY = 90_000;
const SPEED = 1.35; // world units / second of forward drift
const REBUILD_EVERY = 14; // frames between mesh recentres/rebuilds

/** MarchingCubes exposes these via runtime-assigned members; type them here. */
interface MCMesh extends THREE.Mesh {
  field: Float32Array;
  size: number;
  isolation: number;
  update: () => void;
}

const STAGE_LABELS = [
  "infinite space",
  "infinite consciousness",
  "nothingness",
] as const;

function stageFor(a: number): string {
  if (a < 0.34) return STAGE_LABELS[0];
  if (a < 0.66) return STAGE_LABELS[1];
  return STAGE_LABELS[2];
}

export default function FormlessPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState(false);
  const [hud, setHud] = useState({ stage: STAGE_LABELS[0] as string, k: 1.05 });

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const breathRef = useRef(0);

  const handleStart = useCallback(() => {
    if (started) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const engine = createAudioEngine(ctx, mulberry32(0x5304));
      engine.start();
      engineRef.current = engine;
    } catch {
      // audio unavailable — the flight still runs silently
    }
    setStarted(true);
  }, [started]);

  const stopMic = useCallback(() => {
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    micAnalyserRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    breathRef.current = 0;
  }, []);

  const handleMicToggle = useCallback(async () => {
    if (micOn) {
      stopMic();
      setMicOn(false);
      return;
    }
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser); // never routed to destination
      micStreamRef.current = stream;
      micSourceRef.current = source;
      micAnalyserRef.current = analyser;
      setMicError(false);
      setMicOn(true);
    } catch {
      setMicError(true);
      setMicOn(false);
    }
  }, [micOn, stopMic]);

  // three.js scene + flight loop
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglError(true);
      return;
    }
    if (!renderer.getContext()) {
      setWebglError(true);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    let width = mount.clientWidth || window.innerWidth;
    let height = mount.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    renderer.setClearColor(0x05030b, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const bg = new THREE.Color(0x05030b);
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 2.5, 18);

    const camera = new THREE.PerspectiveCamera(
      74,
      width / Math.max(1, height),
      0.1,
      60,
    );
    camera.position.set(0, 0, 0);

    const material = new THREE.MeshStandardMaterial({
      color: 0x3a1d78,
      emissive: 0x5b2ec9,
      emissiveIntensity: 0.55,
      roughness: 0.34,
      metalness: 0.12,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });

    const mc = new MarchingCubes(
      RES,
      material,
      false,
      false,
      MAX_POLY,
    ) as unknown as MCMesh;
    mc.scale.setScalar(HALF_EXTENT);
    mc.frustumCulled = false;
    scene.add(mc);

    const ambient = new THREE.AmbientLight(0x150c26, 0.7);
    scene.add(ambient);
    const keyLight = new THREE.PointLight(0xa78bfa, 26, 34, 2);
    const fillLight = new THREE.PointLight(0x6366f1, 14, 40, 2);
    scene.add(keyLight);
    scene.add(fillLight);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.95,
      0.6,
      0.0,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // camera steering state
    const rand = mulberry32(0x5304);
    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    const p3 = rand() * Math.PI * 2;
    let userYaw = 0;
    let userPitch = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const boxCenter: [number, number, number] = [0, 0, 0];

    function onPointerDown(e: PointerEvent) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      userYaw += (e.clientX - lastX) * 0.005;
      userPitch += (e.clientY - lastY) * 0.005;
      userPitch = Math.max(-1.0, Math.min(1.0, userPitch));
      lastX = e.clientX;
      lastY = e.clientY;
    }
    function onPointerUp(e: PointerEvent) {
      dragging = false;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // pointer already released
      }
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);

    function resize() {
      if (!mount) return;
      width = mount.clientWidth || window.innerWidth;
      height = mount.clientHeight || window.innerHeight;
      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloom.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();

    const forward = new THREE.Vector3(0, 0, -1);
    const micBuf = new Uint8Array(1024);
    const start = performance.now();
    let prev = start;
    let raf = 0;
    let frame = 0;
    let lastMorphIndex = -1;

    function buildMesh(k: number, morph: number, c: number, breath: number) {
      boxCenter[0] = camera.position.x;
      boxCenter[1] = camera.position.y;
      boxCenter[2] = camera.position.z;
      fillField(mc.field, mc.size, boxCenter, HALF_EXTENT, k, morph);
      mc.isolation = c + breath * 0.45;
      mc.position.set(boxCenter[0], boxCenter[1], boxCenter[2]);
      mc.update();
    }

    function loop() {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = (now - start) / 1000;

      const arc = stepArc(now - start);

      // breath from mic (slow RMS) opens the space
      const analyser = micAnalyserRef.current;
      if (analyser) {
        analyser.getByteTimeDomainData(micBuf);
        let sum = 0;
        for (let i = 0; i < micBuf.length; i++) {
          const v = (micBuf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / micBuf.length);
        breathRef.current += (Math.min(1, rms * 6) - breathRef.current) * 0.05;
      } else if (breathRef.current > 0.001) {
        breathRef.current *= 0.95;
      }
      const breath = breathRef.current;

      // steering: seeded auto-wander plus eased user drag
      if (!dragging) {
        userYaw *= 0.96;
        userPitch *= 0.96;
      }
      const autoYaw =
        0.55 * Math.sin(t * 0.021 + p1) + 0.28 * Math.sin(t * 0.0085 + p2);
      const autoPitch = 0.2 * Math.sin(t * 0.017 + p3);
      const yaw = autoYaw + userYaw;
      const pitch = Math.max(-1.15, Math.min(1.15, autoPitch + userPitch));
      const cp = Math.cos(pitch);
      forward.set(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
      forward.normalize();

      camera.position.addScaledVector(forward, SPEED * dt);
      camera.lookAt(
        camera.position.x + forward.x,
        camera.position.y + forward.y,
        camera.position.z + forward.z,
      );

      // lights ride with the camera so structure stays lit as we fly
      keyLight.position.copy(camera.position);
      fillLight.position.set(
        camera.position.x + forward.x * 4,
        camera.position.y + 3,
        camera.position.z + forward.z * 4,
      );

      // material response to the "nothingness" dissolve
      material.opacity = 0.62 + 0.34 * (1 - arc.a);
      material.emissiveIntensity = 0.45 + 0.35 * arc.a;

      // throttled mesh recentre/rebuild — infinite flight without per-frame cost
      if (frame % REBUILD_EVERY === 0) {
        buildMesh(arc.k, arc.morph, arc.c, breath);
      }

      // soft bell on each morph crossing
      if (arc.morphIndex !== lastMorphIndex) {
        if (lastMorphIndex !== -1) {
          engineRef.current?.bell(RATIOS[arc.morphIndex % RATIOS.length]);
        }
        lastMorphIndex = arc.morphIndex;
      }

      engineRef.current?.update(arc.a, breath);
      composer.render();

      if (frame % 18 === 0) {
        setHud({ stage: stageFor(arc.a), k: arc.k });
      }
      frame++;
    }

    // prime the first mesh so something is on screen immediately
    buildMesh(1.05, 0, 0, 0);
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      mc.geometry.dispose();
      material.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // audio + mic teardown on unmount
  useEffect(() => {
    return () => {
      stopMic();
      engineRef.current?.stop();
      engineRef.current?.dispose();
      engineRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
    };
  }, [stopMic]);

  if (webglError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-lg border border-border bg-background p-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Formless
          </h1>
          <p className="mt-3 text-base leading-relaxed text-destructive">
            This flight needs WebGL, and your browser could not provide a
            context. Try a hardware-accelerated browser to enter the manifold.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0" />

      {/* top-right chrome */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        {started && (
          <button
            onClick={handleMicToggle}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {micOn ? "Breath on" : "Use breath"}
          </button>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {micError && (
        <div className="absolute right-4 top-20 z-20 max-w-xs text-right">
          <p className="text-sm text-destructive">
            Microphone unavailable — the flight continues without breath.
          </p>
        </div>
      )}

      {/* HUD once running */}
      {started && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 space-y-1">
          <div className="flex flex-wrap gap-x-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>arūpa · {hud.stage}</span>
            <span>dilation {hud.k.toFixed(2)}</span>
          </div>
          <div className="font-mono text-xs text-muted-foreground/80">
            drag to steer · release to drift
          </div>
        </div>
      )}

      {/* title gate */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background/90 p-8 shadow-lg">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream lab · arūpa jhāna
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Formless — the geometry of boundless awareness
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              A slow, hands-free flight through a real triangulated minimal
              surface — a boundless soap-film manifold whose form enacts the
              formless meditative arc: the sphere of infinite space, of infinite
              consciousness, of nothingness.
            </p>
            <button
              onClick={handleStart}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You are flying through a{" "}
              <span className="text-foreground">
                triply-periodic minimal surface
              </span>{" "}
              — a soap-film manifold with no boundary, no centre, everywhere
              self-similar and connected. It is the geometric embodiment of the
              formless (arūpa) jhānas, where awareness becomes boundless and the
              brain shifts from a segregated to a globally-integrated
              organization.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              An auto-advancing absorption parameter traces the arc: the lattice{" "}
              <span className="text-foreground">dilates</span> (infinite space),
              the surface <span className="text-foreground">morphs</span> between
              gyroid, Schwarz-P and Schwarz-D (infinite consciousness), and the
              isolevel drifts so the walls{" "}
              <span className="text-foreground">thin and open</span>
              (nothingness), before a gentle return.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The mesh is real geometry, extracted with{" "}
              <span className="text-foreground">marching cubes</span> and rebuilt
              around the camera as you move, so the flight is endless. The drone
              is just-intoned over a low B1; at first its partials are detuned
              and stereo-spread (segregated), and as absorption deepens they fuse
              to centre into one integrated tone — sonifying the same brain
              finding.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Safety: there is no strobe — only slow luminance drift.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
