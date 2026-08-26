"use client";

// ════════════════════════════════════════════════════════════════════════════
// 6360 · HONEYCOMB — deepen your own breakthrough
//
// THE ONE QUESTION: what if you could hold your thumb down and slowly turn a
// single dial from calm boundlessness up to a full jeweled hyperbolic-lattice
// breakthrough — flying forward through an ever-multiplying non-Euclidean
// honeycomb whose folding, speed and sound you control?
//
// This is a PLAYED instrument. One continuous scalar `depth ∈ [0,1]` is driven by
// a press-and-drag gesture (drag UP to climb, DOWN to descend) and that ONE
// control drives BOTH the geometry AND the audio intensity jointly. Light touch
// = a slow, sparse honeycomb drifting far away; full press = accelerating flight
// through a dense, kaleidoscopically-multiplying jeweled lattice.
//
// TECHNIQUE (what makes this build distinct): a real 3D honeycomb tunnel you fly
// THROUGH, built from a single THREE.InstancedMesh of glowing hexagonal rings
// arranged in nested radial layers, repeated down the z-axis and scrolled toward
// the camera forever. As depth rises: forward speed climbs, radial mirror-symmetry
// order multiplies, more nested layers ignite, the tunnel twist folds harder,
// emissive jewel colours saturate and shift indigo → gold → magenta, and an
// UnrealBloom glow intensifies. Audio: a just-intonation drone (droneBank) whose
// upper partials open with depth + an endless-rising Shepard glissando, washed
// through a code-built void reverb, capped by a limiter at ≤0.18.
//
// ALIVE-ON-LOAD: after a single "Begin" gesture an auto-breath slowly oscillates
// the depth up and down (seeded ~48 s sine) so the piece climbs and descends on
// its own on a silent phone. The MOMENT you press, you take over; the auto-breath
// resumes a few seconds after you let go.
//
// SAFETY: photosensitive-safe by construction — intensity is carried by camera
// speed, geometry density and slow colour/luminance drift, never by strobe.
// prefers-reduced-motion slows everything. Refs: Klüver form constants (1926) ·
// Bressloff–Cowan et al. (2001) · Escher's Circle Limit.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { startShepard, type ShepardEngine } from "../_shared/visionary/shepard";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";

// ── tiny seeded PRNG (house rule: no Math.random / Date.now / new Date) ───────
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

// ── geometry / flight tunables ────────────────────────────────────────────────
const DEPTH = 16; // z-planes of cells stacked into the tunnel
const LAYERS = 5; // max nested radial layers per plane
const SYM_MAX = 18; // max angular copies (kaleidoscope order) at breakthrough
const SYM_MIN = 3; // angular copies at rest
const CAP = DEPTH * LAYERS * SYM_MAX; // instance capacity
const DZ = 3.4; // spacing between z-planes
const SPAN = DEPTH * DZ; // total tunnel depth before recycle
const PASS = 2.2; // how far past the camera a plane travels before wrapping
const BASE_R = 2.1; // innermost layer radius
const LAYER_GAP = 1.45; // radial gap between nested layers

const RESUME_DELAY = 3.0; // s of no input before auto-breath takes back over
const BREATH_PERIOD = 48; // s per full auto-breath climb+descend

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  drone: DroneBank;
  shep: ShepardEngine;
  reverb: VoidReverb;
  // three (may be absent if WebGL failed)
  renderer?: THREE.WebGLRenderer;
  composer?: EffectComposer;
  bloom?: UnrealBloomPass;
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  mesh?: THREE.InstancedMesh;
  geo?: THREE.TorusGeometry;
  mat?: THREE.MeshBasicMaterial;
  fog?: THREE.FogExp2;
  onResize?: () => void;
  // play state
  depth: number;
  target: number;
  pressing: boolean;
  lastInputT: number;
  scroll: number;
  spin: number;
  elapsed: number;
  prevT: number;
  raf: number;
  reduced: boolean;
  hueDrift: number;
  // per-cell seeded jitter
  jitter: Float32Array;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// hue path indigo(0.70) → gold(0.13) → magenta(0.88) as depth climbs
function depthHue(d: number): number {
  return d < 0.5 ? lerp(0.7, 0.13, d / 0.5) : lerp(0.13, 0.88, (d - 0.5) / 0.5);
}

function stateWord(d: number): string {
  if (d < 0.25) return "drift";
  if (d < 0.5) return "approach";
  if (d < 0.75) return "multiply";
  return "breakthrough";
}

export default function Honeycomb() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const meterFillRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const pctRef = useRef<HTMLDivElement | null>(null);

  const [started, setStarted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hinted, setHinted] = useState(false);

  // ── per-frame update (single loop; guards on whether three exists) ──────────
  const runFrame = useCallback((tMs: number) => {
    const e = engineRef.current;
    if (!e) return;
    const now = tMs / 1000;
    let dt = now - e.prevT;
    e.prevT = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    e.elapsed += dt;

    // ── resolve the dial target: user drag, else auto-breath ──────────────────
    if (!e.pressing && now - e.lastInputT > RESUME_DELAY) {
      const ph = (e.elapsed / BREATH_PERIOD) * Math.PI * 2;
      // seeded soft breath: fundamental + a small second harmonic
      const breath =
        0.5 - 0.42 * Math.cos(ph) - 0.05 * Math.cos(ph * 2 + e.hueDrift);
      e.target = clamp01(breath);
    }
    // smooth the actual depth toward the target (languid when auto, snappy on grab)
    const tau = e.pressing ? 0.28 : e.reduced ? 1.4 : 0.7;
    e.depth += (e.target - e.depth) * (1 - Math.exp(-dt / tau));
    const depth = e.depth;

    // ── audio couples to depth ─────────────────────────────────────────────────
    e.drone.setDrive(depth);
    e.shep.setDrive(depth);
    e.shep.step(dt);
    e.reverb.setWet(0.3 + 0.42 * depth);

    // ── advance flight ────────────────────────────────────────────────────────
    const speedCap = e.reduced ? 9 : 26;
    const speed = lerp(1.6, speedCap, depth * depth);
    e.scroll += speed * dt;
    e.spin += dt * (0.08 + depth * (e.reduced ? 0.25 : 0.6));
    e.hueDrift += dt * 0.05;

    // ── UI meter (direct DOM, no per-frame React state) ───────────────────────
    if (meterFillRef.current)
      meterFillRef.current.style.height = `${(depth * 100).toFixed(1)}%`;
    if (labelRef.current) labelRef.current.textContent = stateWord(depth);
    if (pctRef.current)
      pctRef.current.textContent = `${Math.round(depth * 100)}`;

    // ── geometry (skip if no WebGL) ───────────────────────────────────────────
    const { mesh, camera, composer, bloom, fog, scene } = e;
    if (mesh && camera && composer && bloom && fog && scene) {
      const sym = Math.round(lerp(SYM_MIN, SYM_MAX, depth));
      const activeLayers = Math.max(1, Math.round(lerp(1, LAYERS, depth)));
      const twist = lerp(0.04, e.reduced ? 0.14 : 0.34, depth) * (Math.PI / 8);
      const cellScale = lerp(1.35, 1.7, depth);
      const baseHue = depthHue(depth);
      const sat = lerp(0.45, 0.96, depth);
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();

      let i = 0;
      for (let d = 0; d < DEPTH; d++) {
        // z of this plane; scrolls toward the camera then recycles behind it
        let raw = (d * DZ + e.scroll) % SPAN;
        if (raw < 0) raw += SPAN;
        const z = raw - SPAN + PASS; // range (-SPAN+PASS, PASS]
        // nearness 0(far)→1(near) for fade-in of freshly-recycled planes
        const near = clamp01((z + SPAN - PASS) / SPAN);
        const fadeIn = clamp01(near * 1.4); // hide the far pop
        const planeTwist = z * twist * 0.16;

        for (let l = 0; l < LAYERS; l++) {
          const rActive = l < activeLayers;
          const radius = BASE_R + l * LAYER_GAP;
          const dir = l % 2 === 0 ? 1 : -1; // counter-rotating layers → kaleidoscope
          const layerOffset = (l % 2) * (Math.PI / sym); // half-step mirror stagger

          for (let a = 0; a < SYM_MAX; a++) {
            const idx = i++;
            const active = rActive && a < sym;
            if (!active) {
              dummy.position.set(0, 0, PASS + 50); // park far behind, scale 0
              dummy.scale.setScalar(0.0001);
              dummy.rotation.set(0, 0, 0);
              dummy.updateMatrix();
              mesh.setMatrixAt(idx, dummy.matrix);
              continue;
            }
            const ja = e.jitter[idx * 2];
            const jb = e.jitter[idx * 2 + 1];
            const ang =
              (a * Math.PI * 2) / sym +
              dir * e.spin +
              layerOffset +
              planeTwist +
              jb * 0.05;
            const r = radius + Math.sin(e.elapsed * 0.6 + ja * 6.2831853) * 0.12;
            const x = Math.cos(ang) * r;
            const y = Math.sin(ang) * r;
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, 0, ang + e.spin * 0.5);
            const sc = cellScale * (0.85 + 0.3 * fadeIn);
            dummy.scale.setScalar(sc);
            dummy.updateMatrix();
            mesh.setMatrixAt(idx, dummy.matrix);

            // jewel colour: hue drifts per layer/angle + slow global drift
            let hue = baseHue + l * 0.03 + a * 0.006 + e.hueDrift * 0.2 + ja * 0.05;
            hue -= Math.floor(hue);
            const light = lerp(0.32, 0.62, depth) * (0.4 + 0.6 * fadeIn);
            col.setHSL(hue, sat, clamp01(light));
            mesh.setColorAt(idx, col);
          }
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      // camera: subtle FOV widen (rush) + slow roll (tunnel turn), no bob
      const fov = lerp(66, 82, depth);
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.rotation.z = e.spin * 0.12;
      fog.density = lerp(0.052, 0.03, depth); // see further at breakthrough
      bloom.strength = lerp(0.5, e.reduced ? 1.0 : 1.7, depth);

      composer.render();
    }

    e.raf = requestAnimationFrame(runFrame);
  }, []);

  // ── Begin: unlock audio, build the world, start the loop ────────────────────
  const begin = useCallback(async () => {
    if (engineRef.current) return;
    const reduced = prefersReducedMotion();
    const rng = mulberry32(0x6360);

    // audio graph: master(0.18) → limiter → destination
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    try {
      await ctx.resume();
    } catch {
      /* resumed by gesture */
    }
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 2.2);
    master.connect(limiter);
    limiter.connect(ctx.destination);

    const reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.6, wet: 0.4 });
    reverb.output.connect(master);
    // shared bus feeding both dry master and the void tail
    const mix = ctx.createGain();
    mix.connect(master);
    mix.connect(reverb.input);

    const drone = startDroneBank(ctx, mix, {
      root: 55,
      ratios: [1, 9 / 8, 5 / 4, 3 / 2, 15 / 8, 2, 5 / 2],
      cutoffLow: 170,
      cutoffHigh: 3000,
      peakGain: 0.22,
    });
    const shep = startShepard(ctx, mix, {
      partials: 9,
      fLow: 27.5,
      baseRate: 0.02,
      driveRate: 0.17,
      dir: 1,
      peakGain: 0.28,
    });

    // seeded per-cell jitter
    const jitter = new Float32Array(CAP * 2);
    for (let k = 0; k < jitter.length; k++) jitter[k] = rng() * 2 - 1;

    const e: Engine = {
      ctx,
      master,
      drone,
      shep,
      reverb,
      depth: 0.06,
      target: 0.06,
      pressing: false,
      lastInputT: -1e9,
      scroll: 0,
      spin: 0,
      elapsed: 0,
      prevT: performance.now() / 1000,
      raf: 0,
      reduced,
      hueDrift: rng() * 6.28,
      jitter,
    };

    // ── three.js honeycomb tunnel ─────────────────────────────────────────────
    const wrap = wrapRef.current;
    if (wrap) {
      try {
        const w = wrap.clientWidth || 1;
        const h = wrap.clientHeight || 1;
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });
        const glLost = () => {}; // context-loss listener keeps console quiet
        renderer.domElement.addEventListener("webglcontextlost", glLost);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        renderer.setClearColor(0x05040a, 1);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        wrap.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const bgCol = new THREE.Color(0x05040a);
        const fog = new THREE.FogExp2(bgCol, 0.052);
        scene.fog = fog;

        const camera = new THREE.PerspectiveCamera(66, w / h, 0.1, 220);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);

        // hexagonal ring (torus, 6 tubular segments → hexagon) — a glowing cell
        const geo = new THREE.TorusGeometry(0.5, 0.062, 6, 6);
        const mat = new THREE.MeshBasicMaterial({ toneMapped: true });
        const mesh = new THREE.InstancedMesh(geo, mat, CAP);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        // prime instanceColor so it exists before per-frame writes
        const c0 = new THREE.Color(0x120a20);
        for (let k = 0; k < CAP; k++) mesh.setColorAt(k, c0);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        scene.add(mesh);

        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloom = new UnrealBloomPass(
          new THREE.Vector2(w, h),
          0.6,
          0.72,
          0.55,
        );
        composer.addPass(bloom);
        composer.addPass(new OutputPass());

        const onResize = () => {
          const nw = wrap.clientWidth || 1;
          const nh = wrap.clientHeight || 1;
          renderer.setSize(nw, nh);
          composer.setSize(nw, nh);
          bloom.setSize(nw, nh);
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
        };
        window.addEventListener("resize", onResize);

        e.renderer = renderer;
        e.composer = composer;
        e.bloom = bloom;
        e.scene = scene;
        e.camera = camera;
        e.mesh = mesh;
        e.geo = geo;
        e.mat = mat;
        e.fog = fog;
        e.onResize = onResize;
      } catch {
        setWebglFailed(true); // audio still plays; loop still runs the meter
      }
    }

    engineRef.current = e;
    setStarted(true);
    e.raf = requestAnimationFrame(runFrame);
  }, [runFrame]);

  // ── cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const e = engineRef.current;
      if (!e) return;
      cancelAnimationFrame(e.raf);
      if (e.onResize) window.removeEventListener("resize", e.onResize);
      try {
        e.drone.stop();
        e.shep.stop();
      } catch {
        /* closing */
      }
      try {
        e.mesh?.dispose();
        e.geo?.dispose();
        e.mat?.dispose();
        e.bloom?.dispose();
        e.composer?.dispose?.();
        if (e.renderer) {
          e.renderer.domElement.remove();
          e.renderer.dispose();
          e.renderer.forceContextLoss?.();
        }
      } catch {
        /* dispose best-effort */
      }
      const ctx = e.ctx;
      setTimeout(() => {
        if (ctx.state !== "closed") ctx.close().catch(() => {});
      }, 900);
      engineRef.current = null;
    };
  }, []);

  // ── pointer → depth (drag up = climb, down = descend) ────────────────────────
  const setTargetFromPointer = useCallback((clientY: number) => {
    const e = engineRef.current;
    const wrap = wrapRef.current;
    if (!e || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const t = 1 - (clientY - rect.top) / Math.max(1, rect.height);
    e.target = clamp01(t);
    e.lastInputT = performance.now() / 1000;
  }, []);

  const onPointerDown = useCallback(
    (ev: React.PointerEvent) => {
      const e = engineRef.current;
      if (!e) return;
      e.pressing = true;
      (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
      setTargetFromPointer(ev.clientY);
      if (!hinted) setHinted(true);
    },
    [setTargetFromPointer, hinted],
  );
  const onPointerMove = useCallback(
    (ev: React.PointerEvent) => {
      const e = engineRef.current;
      if (!e || !e.pressing) return;
      setTargetFromPointer(ev.clientY);
    },
    [setTargetFromPointer],
  );
  const onPointerUp = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.pressing = false;
    e.lastInputT = performance.now() / 1000;
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* ART LAYER */}
      <div
        ref={wrapRef}
        onPointerDown={started ? onPointerDown : undefined}
        onPointerMove={started ? onPointerMove : undefined}
        onPointerUp={started ? onPointerUp : undefined}
        onPointerCancel={started ? onPointerUp : undefined}
        className="absolute inset-0 touch-none select-none"
        style={{ cursor: started ? "ns-resize" : "default" }}
      />

      {/* WebGL-failed notice (audio keeps playing) */}
      {started && webglFailed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-sm text-center text-sm text-destructive">
            WebGL is unavailable, so the honeycomb can’t render — but the sound is
            still playing. Drag up and down anywhere to deepen or calm the drone.
          </p>
        </div>
      )}

      {/* DIAL METER + STATE (chrome uses semantic tokens; violet accent) */}
      {started && (
        <div className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-3 sm:right-6">
          <div className="flex flex-col items-end gap-1">
            <div
              ref={labelRef}
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              drift
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span ref={pctRef}>6</span> depth
            </div>
          </div>
          <div className="relative h-48 w-1.5 overflow-hidden rounded-md border border-border bg-background/50">
            <div
              ref={meterFillRef}
              className="absolute bottom-0 left-0 w-full bg-primary"
              style={{ height: "6%" }}
            />
          </div>
        </div>
      )}

      {/* HINT */}
      {started && !hinted && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            press &amp; drag up to climb
          </p>
        </div>
      )}

      {/* HERO / BEGIN */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-lg text-center">
            <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Resonance · dream 6360
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Honeycomb
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
              Deepen your own breakthrough. Press and hold, then drag your thumb
              up to fly forward through an ever-multiplying jeweled honeycomb — the
              geometry and the sound climb together — and down to drift back into
              calm boundlessness.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Begin
              </button>
              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Sound on. It plays itself on load — then it’s yours to play.
            </p>
          </div>
        </div>
      )}

      {/* DESIGN NOTES MODAL */}
      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              One continuous dial — <span className="text-foreground">depth</span> —
              drives everything at once. Light touch is a slow, sparse honeycomb
              drifting far away; full press is accelerating flight through a dense,
              kaleidoscopically-multiplying jeweled lattice. Radial mirror-symmetry
              order, nested layers, forward speed, tunnel twist, jewel saturation
              and bloom all rise together, and the just-intonation drone opens its
              upper partials while an endless Shepard glissando climbs beneath.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              The tunnel is one <span className="text-foreground">InstancedMesh</span>{" "}
              of glowing hexagonal rings, scrolled toward the camera forever. On
              load an auto-breath oscillates the depth so the piece is alive
              untouched; the instant you press, you take over.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              After Klüver’s form constants (1926), Bressloff–Cowan et al. (2001),
              Escher’s <span className="italic">Circle Limit</span> hyperbolic
              tessellations, and the jeweled-breakthrough phenomenology of
              visionary states.
              Photosensitive-safe: no strobe — intensity rides speed, density and
              slow drift; reduced-motion slows all of it.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
