"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  DEFAULT_PARAMS,
  WORLD_H,
  MAX_BASIN_STEPS,
  makeRng,
  defaultMagnets,
  geometryToFreq,
  computeBasinCell,
  spawnBob,
  stepBob,
  type Bob,
  type Magnet,
} from "./pendulum";
import { createAudio, type AudioEngine } from "./audio";
import { README_TEXT } from "./readme-text";

// ── warm-metal basin palette on charcoal ────────────────────────────────────
// magnet index → colour: copper · brass · verdigris
const METAL_RGB: [number, number, number][] = [
  [192, 106, 58], // copper
  [216, 166, 63], // brass
  [70, 181, 138], // verdigris
];
const METAL_HEX = [0xc06a3a, 0xd8a63f, 0x46b58a];
const METAL_NAME = ["copper", "brass", "verdigris"];
const CHARCOAL = 0x110d0b;

const GRID = 96; // basin resolution
const ROWS_PER_FRAME = 3;
const MAX_BOBS = 7;
const TRAIL_POINTS = 460; // preallocated line vertices

interface BobView {
  bob: Bob;
  line: THREE.Line;
  positions: Float32Array;
  mat: THREE.LineBasicMaterial;
  fade: number; // 1 while relevant, decays after capture
}

interface Readout {
  flying: number;
  captures: [number, number, number];
  last: string;
}

export default function MagnetBasinPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const startedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({
    flying: 0,
    captures: [0, 0, 0],
    last: "—",
  });

  // ── three.js scene + simulation loop ──────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setErr("WebGL is unavailable on this device — the basin map can't render, but audio still plays.");
      // audio-only fallback loop so it still demos on Begin.
      return runAudioOnlyFallback(startedRef, audioRef);
    }

    renderer.setClearColor(CHARCOAL, 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "crosshair";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    const params = DEFAULT_PARAMS;
    const magnets: Magnet[] = defaultMagnets();

    // ── basin texture ────────────────────────────────────────────────────────
    const texData = new Uint8Array(GRID * GRID * 4);
    for (let i = 0; i < GRID * GRID; i++) {
      texData[i * 4] = (CHARCOAL >> 16) & 255;
      texData[i * 4 + 1] = (CHARCOAL >> 8) & 255;
      texData[i * 4 + 2] = CHARCOAL & 255;
      texData[i * 4 + 3] = 255;
    }
    const basinTex = new THREE.DataTexture(texData, GRID, GRID, THREE.RGBAFormat);
    basinTex.needsUpdate = true;
    basinTex.magFilter = THREE.LinearFilter;
    basinTex.minFilter = THREE.LinearFilter;

    const planeGeom = new THREE.PlaneGeometry(2 * WORLD_H, 2 * WORLD_H);
    const planeMat = new THREE.MeshBasicMaterial({ map: basinTex });
    const plane = new THREE.Mesh(planeGeom, planeMat);
    plane.position.z = 0;
    scene.add(plane);

    let basinRow = 0; // progressive fill cursor

    const cellWorld = (idx: number) => -WORLD_H + ((idx + 0.5) / GRID) * 2 * WORLD_H;

    function fillBasinRows(rows: number) {
      for (let r = 0; r < rows && basinRow < GRID; r++, basinRow++) {
        const j = basinRow;
        const wy = cellWorld(j);
        for (let i = 0; i < GRID; i++) {
          const wx = cellWorld(i);
          const res = computeBasinCell(wx, wy, magnets, params);
          const b = 0.3 + 0.7 * Math.pow(1 - res.settle, 1.4);
          const rgb = METAL_RGB[res.magnet];
          const o = (j * GRID + i) * 4;
          texData[o] = Math.min(255, rgb[0] * b);
          texData[o + 1] = Math.min(255, rgb[1] * b);
          texData[o + 2] = Math.min(255, rgb[2] * b);
          texData[o + 3] = 255;
        }
      }
      basinTex.needsUpdate = true;
    }

    // ── magnet markers ─────────────────────────────────────────────────────────
    const magnetGroups: THREE.Group[] = [];
    const haloMats: THREE.MeshBasicMaterial[] = [];
    const discGeom = new THREE.CircleGeometry(0.05, 32);
    const haloGeom = new THREE.CircleGeometry(0.11, 32);
    const ringGeom = new THREE.RingGeometry(0.062, 0.075, 32);
    for (let i = 0; i < magnets.length; i++) {
      const g = new THREE.Group();
      const halo = new THREE.Mesh(
        haloGeom,
        new THREE.MeshBasicMaterial({
          color: METAL_HEX[i],
          transparent: true,
          opacity: 0.22,
        }),
      );
      halo.position.z = 0.02;
      const disc = new THREE.Mesh(
        discGeom,
        new THREE.MeshBasicMaterial({ color: METAL_HEX[i] }),
      );
      disc.position.z = 0.03;
      const ring = new THREE.Mesh(
        ringGeom,
        new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.85 }),
      );
      ring.position.z = 0.031;
      g.add(halo, disc, ring);
      g.position.set(magnets[i].x, magnets[i].y, 0);
      scene.add(g);
      magnetGroups.push(g);
      haloMats.push(halo.material as THREE.MeshBasicMaterial);
    }

    // ── bob trajectory pool ──────────────────────────────────────────────────
    const bobViews: BobView[] = [];
    function makeBobView(bob: Bob): BobView {
      const positions = new Float32Array(TRAIL_POINTS * 3);
      const geom = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute("position", attr);
      geom.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({
        color: 0xfff2d8,
        transparent: true,
        opacity: 0.95,
      });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      line.position.z = 0.015;
      scene.add(line);
      return { bob, line, positions, mat, fade: 1 };
    }

    // capture bookkeeping (accumulated, flushed to React state ~4×/s)
    const captures: [number, number, number] = [0, 0, 0];
    let lastCaptor = -1;

    function release(wx: number, wy: number) {
      const active = bobViews.filter((v) => v.bob.captured < 0).length;
      if (active >= MAX_BOBS) return;
      bobViews.push(makeBobView(spawnBob(wx, wy)));
    }

    // ── pointer interaction ────────────────────────────────────────────────────
    const ndc = new THREE.Vector3();
    function toWorld(clientX: number, clientY: number): { x: number; y: number } {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
        0,
      );
      ndc.unproject(camera);
      return { x: ndc.x, y: ndc.y };
    }

    let dragMagnet = -1;
    let painting = false;
    let lastPaint = { x: 0, y: 0 };

    function markBasinDirty() {
      basinRow = 0;
    }

    function onDown(e: PointerEvent) {
      renderer.domElement.setPointerCapture(e.pointerId);
      const w = toWorld(e.clientX, e.clientY);
      // grab a nearby magnet?
      for (let i = 0; i < magnets.length; i++) {
        if (Math.hypot(magnets[i].x - w.x, magnets[i].y - w.y) < 0.11) {
          dragMagnet = i;
          return;
        }
      }
      // otherwise release a bob (within the plane)
      if (Math.abs(w.x) <= WORLD_H && Math.abs(w.y) <= WORLD_H) {
        release(w.x, w.y);
        painting = true;
        lastPaint = { x: w.x, y: w.y };
      }
    }

    function onMove(e: PointerEvent) {
      if (dragMagnet < 0 && !painting) return;
      const w = toWorld(e.clientX, e.clientY);
      if (dragMagnet >= 0) {
        const cx = Math.max(-0.9, Math.min(0.9, w.x));
        const cy = Math.max(-0.9, Math.min(0.9, w.y));
        magnets[dragMagnet].x = cx;
        magnets[dragMagnet].y = cy;
        magnets[dragMagnet].freq = geometryToFreq(cx, cy);
        magnetGroups[dragMagnet].position.set(cx, cy, 0);
        markBasinDirty();
      } else if (painting) {
        if (Math.hypot(w.x - lastPaint.x, w.y - lastPaint.y) > 0.09) {
          if (Math.abs(w.x) <= WORLD_H && Math.abs(w.y) <= WORLD_H) {
            release(w.x, w.y);
            lastPaint = { x: w.x, y: w.y };
          }
        }
      }
    }

    function onUp(e: PointerEvent) {
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragMagnet = -1;
      painting = false;
    }

    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);

    // ── resize ─────────────────────────────────────────────────────────────────
    function resize() {
      const w = mount!.clientWidth || 1;
      const h = mount!.clientHeight || 1;
      const aspect = w / h;
      const half = WORLD_H * 1.06;
      if (aspect >= 1) {
        camera.left = -half * aspect;
        camera.right = half * aspect;
        camera.top = half;
        camera.bottom = -half;
      } else {
        camera.left = -half;
        camera.right = half;
        camera.top = half / aspect;
        camera.bottom = -half / aspect;
      }
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── auto-demo (seeded) ─────────────────────────────────────────────────────
    const rng = makeRng(0x2020);
    const autoQueue: { frame: number; x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      autoQueue.push({
        frame: 24 + i * 70,
        x: (rng() * 2 - 1) * 0.72,
        y: (rng() * 2 - 1) * 0.72,
      });
    }
    let autoIndex = 0;

    // ── main loop ──────────────────────────────────────────────────────────────
    let raf = 0;
    let frame = 0;
    let flightWasActive = false;

    function loop() {
      raf = requestAnimationFrame(loop);
      frame++;

      // progressively compute the basin field
      if (basinRow < GRID) fillBasinRows(ROWS_PER_FRAME);

      // seeded auto-demo releases
      while (autoIndex < autoQueue.length && frame >= autoQueue[autoIndex].frame) {
        release(autoQueue[autoIndex].x, autoQueue[autoIndex].y);
        autoIndex++;
      }

      // slow, safe halo breathing (disabled under reduced-motion)
      if (!reduceMotion) {
        const pulse = 0.22 + 0.06 * Math.sin(frame * 0.03);
        for (const m of haloMats) m.opacity = pulse;
      }

      // step every bob; pick a flight telemetry from the liveliest flyer
      const audio = audioRef.current;
      let flying = 0;
      let flightFreq = 0;
      let flightSpeed = 0;
      for (let vi = bobViews.length - 1; vi >= 0; vi--) {
        const v = bobViews[vi];
        const wasFlying = v.bob.captured < 0;
        const tel = stepBob(v.bob, magnets, params, 4);

        // push trail into the line geometry
        const trail = v.bob.trail;
        const pts = Math.min(TRAIL_POINTS, trail.length / 2);
        const start = trail.length / 2 - pts;
        for (let p = 0; p < pts; p++) {
          const ti = (start + p) * 2;
          v.positions[p * 3] = trail[ti];
          v.positions[p * 3 + 1] = trail[ti + 1];
          v.positions[p * 3 + 2] = 0;
        }
        v.line.geometry.setDrawRange(0, pts);
        (v.line.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

        if (wasFlying) {
          flying++;
          // track the fastest flyer for the flight voice
          if (tel.speed > flightSpeed) {
            flightSpeed = tel.speed;
            flightFreq = tel.blendFreq;
          }
        }

        if (tel.justCaptured >= 0) {
          const c = tel.justCaptured;
          captures[c]++;
          lastCaptor = c;
          v.mat.color.setHex(METAL_HEX[c]);
          if (startedRef.current && audio) audio.strike(magnets[c].freq);
        }

        // fade + recycle captured trails
        if (v.bob.captured >= 0) {
          v.fade -= 0.0065;
          v.mat.opacity = Math.max(0, v.fade * 0.9);
          if (v.fade <= 0) {
            scene.remove(v.line);
            v.line.geometry.dispose();
            v.mat.dispose();
            bobViews.splice(vi, 1);
          }
        }
      }

      // drive the flight voice
      if (startedRef.current && audio) {
        const active = flying > 0;
        if (active !== flightWasActive) {
          audio.setFlightActive(active);
          flightWasActive = active;
        }
        if (active) audio.updateFlight(flightFreq, flightSpeed);
      }

      // publish a readout ~4×/second
      if (frame % 15 === 0) {
        setReadout({
          flying,
          captures: [captures[0], captures[1], captures[2]],
          last: lastCaptor >= 0 ? METAL_NAME[lastCaptor] : "—",
        });
      }

      renderer.render(scene, camera);
    }
    loop();

    // ── teardown ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      for (const v of bobViews) {
        v.line.geometry.dispose();
        v.mat.dispose();
      }
      for (const g of magnetGroups) {
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            (o.material as THREE.Material).dispose();
          }
        });
      }
      discGeom.dispose();
      haloGeom.dispose();
      ringGeom.dispose();
      planeGeom.dispose();
      planeMat.dispose();
      basinTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  const begin = useCallback(async () => {
    if (!audioRef.current) audioRef.current = createAudio();
    await audioRef.current.resume();
    startedRef.current = true;
    setStarted(true);
  }, []);

  // dispose audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0" />

      {/* title + readout chrome */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Magnet Basin
        </h1>
        <p className="mt-1 max-w-sm text-base text-muted-foreground">
          Release a pendulum into a field of magnets. Which one catches it is a
          fractal basin — and a note.
        </p>
        {started && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
            <span>flying: {readout.flying}</span>
            <span style={{ color: `rgb(${METAL_RGB[0].join(",")})` }}>
              copper {readout.captures[0]}
            </span>
            <span style={{ color: `rgb(${METAL_RGB[1].join(",")})` }}>
              brass {readout.captures[1]}
            </span>
            <span style={{ color: `rgb(${METAL_RGB[2].join(",")})` }}>
              verdigris {readout.captures[2]}
            </span>
            <span>last: {readout.last}</span>
          </div>
        )}
      </div>

      {/* notes link */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-5 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* WebGL fallback notice */}
      {err && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-background/80 px-4 py-2 text-sm text-destructive">
          {err}
        </div>
      )}

      {/* start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/50 backdrop-blur-sm">
          <div className="max-w-md px-6 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Play deterministic chaos
            </h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Click or drag on the plane to drop a bob; watch it spiral to its
              captor magnet and hear the capture ring. Drag a magnet to reshape
              and re-tune the basin.
            </p>
          </div>
          <button
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Release a bob
          </button>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README_TEXT}
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ── audio-only fallback when WebGL is unavailable ────────────────────────────
// Keeps the prototype demoable: seeded bobs are integrated headless and their
// captures still ring, so pressing Begin produces the evolving chord.
function runAudioOnlyFallback(
  startedRef: { current: boolean },
  audioRef: { current: AudioEngine | null },
): () => void {
  const params = DEFAULT_PARAMS;
  const magnets = defaultMagnets();
  const rng = makeRng(0x2020);
  const queue: { frame: number; bob: Bob }[] = [];
  for (let i = 0; i < 6; i++) {
    queue.push({
      frame: 40 + i * 90,
      bob: spawnBob((rng() * 2 - 1) * 0.72, (rng() * 2 - 1) * 0.72),
    });
  }
  const live: Bob[] = [];
  let raf = 0;
  let frame = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    frame++;
    while (queue.length && frame >= queue[0].frame) live.push(queue.shift()!.bob);
    for (let i = live.length - 1; i >= 0; i--) {
      const tel = stepBob(live[i], magnets, params, 4);
      if (tel.justCaptured >= 0) {
        if (startedRef.current && audioRef.current) {
          audioRef.current.strike(magnets[tel.justCaptured].freq);
        }
        live.splice(i, 1);
      } else if (live[i].steps >= MAX_BASIN_STEPS * 2) {
        live.splice(i, 1);
      }
    }
  }
  loop();
  return () => cancelAnimationFrame(raf);
}
