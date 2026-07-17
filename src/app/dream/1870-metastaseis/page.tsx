"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  buildShells,
  cameraPath,
  type Shell,
  type Vec3,
} from "./surface";
import { MetastaseisAudio } from "./audio";

// ════════════════════════════════════════════════════════════════════════════
// 1870 — METASTASEIS
//
// THE QUESTION: What if a Xenakis ruled-surface building IS the score — you fly
// through the architecture and hear its geometry?
//
// Xenakis drew straight string glissandi in Metastaseis (1953–54), then rebuilt
// that geometry as the Philips Pavilion's warped hyperbolic-paraboloid shells
// (Expo 1958). arXiv:2607.06589 inverts it: a ruling line swept over time IS a
// glissando; point-density becomes an instrumental energy block. This piece is
// that inverse instrument — flyable architecture you can hear.
// ════════════════════════════════════════════════════════════════════════════

interface ShellObject {
  geom: THREE.BufferGeometry;
  posAttr: THREE.BufferAttribute;
  colAttr: THREE.BufferAttribute;
  uCount: number; // number of u-family lines (first uCount*2 vertices)
  vCount: number;
}

const DIM: [number, number, number] = [0.14, 0.06, 0.3]; // violet-800 base
const LIT: [number, number, number] = [0.78, 0.66, 1.0]; // violet-300 crest

function v3(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

// Write shell geometry (positions) into fixed-size buffers. Not a hook.
function writeGeometry(objs: ShellObject[], shells: Shell[]): void {
  for (let s = 0; s < shells.length; s++) {
    const shell = shells[s];
    const obj = objs[s];
    const pos = obj.posAttr.array as Float32Array;
    let i = 0;
    for (const line of shell.uLines) {
      pos[i++] = line.a.x;
      pos[i++] = line.a.y;
      pos[i++] = line.a.z;
      pos[i++] = line.b.x;
      pos[i++] = line.b.y;
      pos[i++] = line.b.z;
    }
    for (const line of shell.vLines) {
      pos[i++] = line.a.x;
      pos[i++] = line.a.y;
      pos[i++] = line.a.z;
      pos[i++] = line.b.x;
      pos[i++] = line.b.y;
      pos[i++] = line.b.z;
    }
    obj.posAttr.needsUpdate = true;
    obj.geom.computeBoundingSphere();
  }
}

export default function MetastaseisPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [glError, setGlError] = useState(false);
  const [sweepSpeed, setSweepSpeed] = useState(0.5);
  const [morph, setMorph] = useState(1.0);

  // Mutable state shared with the animation loop (avoids re-running the effect).
  const paramsRef = useRef({ sweepSpeed: 0.5, morph: 1.0 });
  const audioRef = useRef<MetastaseisAudio | null>(null);
  const shellsRef = useRef<Shell[]>([]);
  const objsRef = useRef<ShellObject[]>([]);
  const startedRef = useRef(false);

  useEffect(() => {
    paramsRef.current.sweepSpeed = sweepSpeed;
  }, [sweepSpeed]);

  // Morph slider rebuilds shell geometry deterministically in place.
  useEffect(() => {
    paramsRef.current.morph = morph;
    if (objsRef.current.length === 0) return;
    const shells = buildShells(morph);
    shellsRef.current = shells;
    writeGeometry(objsRef.current, shells);
  }, [morph]);

  // Scene + audio-trigger loop. Runs once; visuals animate immediately on load.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Deterministic architecture — same shells every load.
    const shells = buildShells(paramsRef.current.morph);
    shellsRef.current = shells;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    const objs: ShellObject[] = [];

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x05030a, 0.028);

      camera = new THREE.PerspectiveCamera(
        56,
        container.clientWidth / container.clientHeight,
        0.1,
        120,
      );

      for (const shell of shells) {
        const uCount = shell.uLines.length;
        const vCount = shell.vLines.length;
        const vertCount = (uCount + vCount) * 2;
        const geom = new THREE.BufferGeometry();
        const posAttr = new THREE.BufferAttribute(
          new Float32Array(vertCount * 3),
          3,
        );
        const colAttr = new THREE.BufferAttribute(
          new Float32Array(vertCount * 3),
          3,
        );
        posAttr.setUsage(THREE.DynamicDrawUsage);
        colAttr.setUsage(THREE.DynamicDrawUsage);
        geom.setAttribute("position", posAttr);
        geom.setAttribute("color", colAttr);

        // v-lines: constant faint net.
        const col = colAttr.array as Float32Array;
        for (let k = uCount * 2; k < vertCount; k++) {
          col[k * 3] = DIM[0] * 0.7;
          col[k * 3 + 1] = DIM[1] * 0.7;
          col[k * 3 + 2] = DIM[2] * 0.7;
        }

        const mat = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const lines = new THREE.LineSegments(geom, mat);
        scene.add(lines);
        objs.push({ geom, posAttr, colAttr, uCount, vCount });
      }

      writeGeometry(objs, shells);
      objsRef.current = objs;
    } catch {
      setGlError(true);
      renderer = null;
    }

    // ─── animation + audio-trigger loop ─────────────────────────────────────
    let frame = 0;
    let raf = 0;
    const phase = [0.0, 0.37, 0.71];
    const prevP = [phase[0], phase[1], phase[2]];
    let dragYaw = 0;
    let dragPitch = 0;
    const timeScale = reduced ? 0.5 : 1.0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      frame++;
      const vt = (frame / 60) * timeScale;
      const { sweepSpeed: spd } = paramsRef.current;
      const sweepRate = (reduced ? 0.03 : 0.05) * (0.2 + spd); // cycles / sec
      const sweepDur = Math.min(2.6, 1 / (sweepRate * 8));

      const audio = audioRef.current;
      const sh = shellsRef.current;

      for (let s = 0; s < sh.length; s++) {
        const p = (vt * sweepRate + phase[s]) % 1;
        const prev = prevP[s];
        const shell = sh[s];
        const obj = objsRef.current[s];

        // Fire glissandi for lines the playhead crossed this frame.
        if (audio && startedRef.current && audio.running) {
          for (const line of shell.uLines) {
            const crossed =
              prev <= p
                ? line.u > prev && line.u <= p
                : line.u > prev || line.u <= p;
            if (crossed) {
              audio.playGlissando(
                {
                  freqA: line.freqA,
                  freqB: line.freqB,
                  span: line.span,
                  register: shell.register,
                },
                sweepDur,
              );
            }
          }
        }
        prevP[s] = p;

        // Comet-trail luminance under the playhead (no strobe: smooth decay).
        if (obj) {
          const col = obj.colAttr.array as Float32Array;
          for (let k = 0; k < shell.uLines.length; k++) {
            const u = shell.uLines[k].u;
            let ph = p - u;
            if (ph < 0) ph += 1;
            const intensity = Math.exp(-ph * 11);
            const r = DIM[0] + (LIT[0] - DIM[0]) * intensity;
            const g = DIM[1] + (LIT[1] - DIM[1]) * intensity;
            const b = DIM[2] + (LIT[2] - DIM[2]) * intensity;
            const base = k * 2 * 3;
            col[base] = r;
            col[base + 1] = g;
            col[base + 2] = b;
            col[base + 3] = r;
            col[base + 4] = g;
            col[base + 5] = b;
          }
          obj.colAttr.needsUpdate = true;
        }
      }

      // Seeded flight + user orbit nudge (nudge decays so the demo resumes).
      if (renderer && scene && camera) {
        const { pos, target } = cameraPath(vt);
        const tgt = v3(target);
        const offset = v3(pos).sub(tgt);
        const sph = new THREE.Spherical().setFromVector3(offset);
        sph.theta += dragYaw;
        sph.phi = Math.max(0.2, Math.min(Math.PI - 0.2, sph.phi + dragPitch));
        offset.setFromSpherical(sph);
        camera.position.copy(tgt).add(offset);
        camera.lookAt(tgt);
        dragYaw *= 0.985;
        dragPitch *= 0.985;
        renderer.render(scene, camera);
      }
    };
    raf = requestAnimationFrame(tick);

    // ─── pointer orbit ──────────────────────────────────────────────────────
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const el = renderer?.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      dragYaw += (e.clientX - lastX) * 0.005;
      dragPitch += (e.clientY - lastY) * 0.004;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    el?.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    const onResize = () => {
      if (!renderer || !camera || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ─── cleanup ────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      el?.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      for (const o of objs) {
        o.geom.dispose();
      }
      if (scene) {
        scene.traverse((child) => {
          if (child instanceof THREE.LineSegments) {
            (child.material as THREE.Material).dispose();
          }
        });
      }
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
      objsRef.current = [];
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const handleBegin = useCallback(async () => {
    if (startedRef.current) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      const audio = new MetastaseisAudio(reduced);
      audioRef.current = audio;
      await audio.start();
      startedRef.current = true;
      setStarted(true);
    } catch {
      // Audio may be blocked; visuals continue regardless.
      setStarted(true);
      startedRef.current = true;
    }
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      {/* three.js canvas mount */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {/* WebGL failure notice (audio can still run) */}
      {glError && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL is unavailable, so the architecture can&apos;t be drawn — but
            the seeded glissando score still plays if you tap Begin.
          </p>
        </div>
      )}

      {/* Title + description */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Metastaseis
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          Fly through a Xenakis ruled-surface building and hear its geometry —
          every straight ruling line is a glissando.
        </p>
      </div>

      {/* Begin overlay — visuals already run; this unlocks audio */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background/80 p-8 text-center shadow-lg">
            <p className="max-w-sm text-base text-muted-foreground">
              The architecture is already sweeping. Tap to sound its ruling
              lines as glissandi.
            </p>
            <button
              type="button"
              onClick={handleBegin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-16 left-0 z-10 flex flex-col gap-3 p-6 sm:p-8">
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
            Sweep speed
          </span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={sweepSpeed}
            onChange={(e) => setSweepSpeed(parseFloat(e.target.value))}
            className="w-44 accent-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
            Surface warp
          </span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={morph}
            onChange={(e) => setMorph(parseFloat(e.target.value))}
            className="w-44 accent-primary"
          />
        </label>
      </div>

      {/* Design notes trigger */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Inverse Xenakis
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Iannis Xenakis composed <em>Metastaseis</em> (1953–54) as fields
                of straight string glissandi, then turned that same ruled
                geometry into the Philips Pavilion (Brussels Expo 1958, with Le
                Corbusier) — nine warped hyperbolic-paraboloid shells.
              </p>
              <p>
                A hyperbolic paraboloid is a ruled surface: it is woven from two
                families of perfectly straight lines. Following arXiv:2607.06589
                (&ldquo;Extending Xenakis&rdquo;, July 2026), this piece inverts
                his move. Each straight ruling line, swept by the playhead, is
                sounded as a glissando — its pitch glides between the heights of
                the line&apos;s two endpoints. Steep lines, where projected
                ruling density spikes, fire pizzicato energy blocks.
              </p>
              <p>
                Everything is deterministic: a fixed-seed PRNG builds the shells
                and the flight, so the same architecture sings on every load. No
                microphone, camera, or network. Drag to orbit; the flight
                resumes on its own. Motion and voice count reduce under a
                reduced-motion preference, but the piece stays alive.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1870-metastaseis"]} />
    </main>
  );
}
