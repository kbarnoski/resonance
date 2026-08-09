"use client";

// ════════════════════════════════════════════════════════════════════════════
// Tensegrity (8952) — route /dream/8952-tensegrity
//
// THE ONE QUESTION: "What if you could PLAY a tensegrity — rigid struts that
// touch nothing, floating in a net of tension cables — by grabbing a node and
// sculpting it, so the prestress redistributes through the ENTIRE globally-
// coupled network and every cable retunes and rings at once?"
//
// Each cable's live tension becomes a plucked-string pitch (taut = high). The
// net is globally coupled, so dragging ONE node retunes the whole chord.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { SEED, mulberry32 } from "./prng";
import {
  buildTensegrity,
  incidentCables,
  perturbNode,
  step,
  type World,
} from "./tensegrity";
import {
  computeFrame,
  createGLRenderer,
  drawFallback2D,
  worldToScreen,
  type Camera,
  type DrawState,
  type GLRenderer,
} from "./render";
import { createAudioEngine, tensionToFreq, type AudioEngine } from "./audio";

interface Interaction {
  mode: "none" | "orbit" | "drag";
  node: number;
  lastX: number;
  lastY: number;
  moved: number;
  moveX: number; // last world-space move (for flick)
  moveY: number;
  moveZ: number;
}

export default function TensegrityPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // mutable refs shared between the rAF loop and pointer handlers
  const worldRef = useRef<World | null>(null);
  const camRef = useRef<Camera>({
    azimuth: 0.9,
    elevation: 0.32,
    distance: 6.4,
    target: [0, 0.85, 0],
  });
  const audioRef = useRef<AudioEngine | null>(null);
  const audioReadyRef = useRef(false);
  const interactedRef = useRef(false);
  const inter = useRef<Interaction>({
    mode: "none",
    node: -1,
    lastX: 0,
    lastY: 0,
    moved: 0,
    moveX: 0,
    moveY: 0,
    moveZ: 0,
  });

  // Voice a pluck at `node` as a chord of its incident cables' tension-pitches.
  const emitPluck = useCallback((world: World, node: number, strength: number) => {
    const eng = audioRef.current;
    if (!eng || !audioReadyRef.current) return;
    const cables = incidentCables(world, node);
    for (const bi of cables) {
      const bar = world.bars[bi];
      const tn = Math.min(1, bar.tension / world.maxTension);
      const freq = tensionToFreq(tn);
      const gain = Math.max(0.03, Math.min(0.5, strength * (0.4 + 0.6 * tn)));
      eng.pluck(freq, gain, tn);
    }
  }, []);

  const beginAudio = useCallback(() => {
    if (audioRef.current) {
      void audioRef.current.ctx.resume();
      audioReadyRef.current = true;
      setAudioReady(true);
      return;
    }
    const eng = createAudioEngine();
    if (!eng) {
      setAudioUnavailable(true);
      return;
    }
    audioRef.current = eng;
    void eng.ctx.resume();
    audioReadyRef.current = true;
    setAudioReady(true);
    const w = worldRef.current;
    if (w) emitPluck(w, 3, 0.5); // welcome chord on a top node
  }, [emitPluck]);

  // ── main effect: build world, GL, loop, listeners ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const world = buildTensegrity(SEED);
    worldRef.current = world;

    let renderer: GLRenderer | null = createGLRenderer(canvas);
    let ctx2d: CanvasRenderingContext2D | null = null;
    if (!renderer) {
      setGlFailed(true);
      ctx2d = canvas.getContext("2d");
    }

    const rng = mulberry32(SEED ^ 0x1234);
    let raf = 0;
    let last = performance.now();
    let breezeTimer = 0.9; // first gentle breeze ~0.9s after load
    let mounted = true;

    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    const frameLoop = (now: number) => {
      if (!mounted) return;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp after tab-switch
      const w = worldRef.current;
      if (!w) {
        raf = requestAnimationFrame(frameLoop);
        return;
      }

      // physics (2 substeps for stability)
      step(w, dt * 0.5);
      step(w, dt * 0.5);

      // seeded auto-breeze — animates (and, once begun, plays) the net hands-free
      breezeTimer -= dt;
      if (breezeTimer <= 0) {
        breezeTimer = 1.4 + rng() * 1.6;
        const freeNodes = [3, 4, 5];
        const node = freeNodes[Math.floor(rng() * freeNodes.length)];
        const mag = (interactedRef.current ? 0.14 : 0.24) * (0.6 + rng());
        perturbNode(
          w,
          node,
          (rng() - 0.5) * mag,
          (rng() - 0.5) * mag,
          (rng() - 0.5) * mag,
        );
        emitPluck(w, node, 0.16 + rng() * 0.1);
      }

      // idle auto-orbit keeps the structure alive
      const it = inter.current;
      if (it.mode === "none") camRef.current.azimuth += 0.08 * dt;

      const cw = canvas.clientWidth || 640;
      const ch = canvas.clientHeight || 480;
      const frame = computeFrame(camRef.current, cw, ch);
      const st: DrawState = { hover: -1, drag: it.mode === "drag" ? it.node : -1 };

      if (renderer) {
        renderer.render(w, frame, st, cw, ch, dpr);
      } else if (ctx2d) {
        if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
          canvas.width = Math.floor(cw * dpr);
          canvas.height = Math.floor(ch * dpr);
        }
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawFallback2D(ctx2d, w, frame, cw, ch, st);
      }

      raf = requestAnimationFrame(frameLoop);
    };
    raf = requestAnimationFrame(frameLoop);

    // ── pointer input ──
    const pickNode = (cx: number, cy: number): number => {
      const w = worldRef.current;
      if (!w) return -1;
      const cw = canvas.clientWidth || 640;
      const ch = canvas.clientHeight || 480;
      const frame = computeFrame(camRef.current, cw, ch);
      let best = -1;
      let bestD = 30; // px threshold
      for (let i = 0; i < w.nodes.length; i++) {
        if (w.nodes[i].pinned) continue;
        const n = w.nodes[i];
        const s = worldToScreen([n.x, n.y, n.z], frame.viewProj, cw, ch);
        if (!s.visible) continue;
        const d = Math.hypot(s.x - cx, s.y - cy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const node = pickNode(cx, cy);
      inter.current = {
        mode: node >= 0 ? "drag" : "orbit",
        node,
        lastX: cx,
        lastY: cy,
        moved: 0,
        moveX: 0,
        moveY: 0,
        moveZ: 0,
      };
      interactedRef.current = true;
      canvas.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const it = inter.current;
      if (it.mode === "none") return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const dx = cx - it.lastX;
      const dy = cy - it.lastY;
      it.lastX = cx;
      it.lastY = cy;
      it.moved += Math.abs(dx) + Math.abs(dy);

      if (it.mode === "orbit") {
        camRef.current.azimuth += dx * 0.008;
        camRef.current.elevation = Math.max(
          -1.25,
          Math.min(1.35, camRef.current.elevation - dy * 0.008),
        );
        return;
      }

      // drag a node in the camera plane
      const w = worldRef.current;
      if (!w || it.node < 0) return;
      const cw = canvas.clientWidth || 640;
      const ch = canvas.clientHeight || 480;
      const frame = computeFrame(camRef.current, cw, ch);
      const wpp = frame.worldPerPixel;
      const mvx = frame.right[0] * dx * wpp + frame.up[0] * -dy * wpp;
      const mvy = frame.right[1] * dx * wpp + frame.up[1] * -dy * wpp;
      const mvz = frame.right[2] * dx * wpp + frame.up[2] * -dy * wpp;
      const n = w.nodes[it.node];
      n.x += mvx;
      n.y += mvy;
      n.z += mvz;
      n.px = n.x; // hold — zero residual velocity while gripped
      n.py = n.y;
      n.pz = n.z;
      it.moveX = mvx;
      it.moveY = mvy;
      it.moveZ = mvz;
    };

    const endInteraction = (e: PointerEvent) => {
      const it = inter.current;
      const w = worldRef.current;
      if (it.mode === "drag" && w && it.node >= 0) {
        if (it.moved < 6) {
          emitPluck(w, it.node, 0.5); // tap = pluck
        } else {
          // flick: fling the node and ring the retuned chord
          const k = 2.4;
          perturbNode(w, it.node, it.moveX * k, it.moveY * k, it.moveZ * k);
          const mag = Math.hypot(it.moveX, it.moveY, it.moveZ);
          emitPluck(w, it.node, Math.min(0.6, 0.25 + mag * 6));
        }
      }
      inter.current = {
        mode: "none",
        node: -1,
        lastX: 0,
        lastY: 0,
        moved: 0,
        moveX: 0,
        moveY: 0,
        moveZ: 0,
      };
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be gone */
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", endInteraction);
    canvas.addEventListener("pointercancel", endInteraction);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", endInteraction);
      canvas.removeEventListener("pointercancel", endInteraction);
      if (renderer) {
        renderer.dispose();
        renderer = null;
      }
      if (audioRef.current) {
        audioRef.current.dispose();
        audioRef.current = null;
        audioReadyRef.current = false;
      }
      worldRef.current = null;
    };
  }, [emitPluck]);

  const resetStructure = useCallback(() => {
    worldRef.current = buildTensegrity(SEED);
    interactedRef.current = false;
  }, []);

  return (
    <main className="relative flex min-h-dvh flex-col bg-background text-foreground">
      {/* Full-bleed instrument */}
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          aria-label="Tensegrity instrument — drag a floating node to retune the cable net"
        />

        {/* Header overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-5 sm:p-7">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 8952 · Floating compression
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Tensegrity
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Rigid struts touch nothing — they float in a net of tension cables.
            Grab a glowing node and sculpt it: the prestress redistributes through
            the whole coupled net, and every cable retunes and rings at once.
          </p>
        </div>

        {/* Controls */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-5 sm:p-7">
          {glFailed && (
            <p className="pointer-events-auto max-w-md text-sm text-destructive">
              WebGL2 is unavailable — showing a Canvas2D projection instead. The
              structure, physics and sound are identical.
            </p>
          )}
          {audioUnavailable && (
            <p className="pointer-events-auto max-w-md text-sm text-destructive">
              Web Audio is unavailable in this browser — the structure still moves
              and can be sculpted, but silently.
            </p>
          )}
          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {!audioReady ? (
              <button
                type="button"
                onClick={beginAudio}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin — turn on sound
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const w = worldRef.current;
                  if (w) emitPluck(w, 3 + Math.floor(mulberry32(SEED)() * 3), 0.5);
                }}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Pluck the net
              </button>
            )}
            <button
              type="button"
              onClick={resetStructure}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Reset structure
            </button>
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {showNotes ? "Hide notes" : "Design notes"}
            </button>
          </div>
        </div>

        {/* Design notes */}
        {showNotes && (
          <div className="pointer-events-auto absolute right-5 top-24 z-20 max-w-sm rounded-lg border border-border bg-popover/90 p-5 text-sm text-muted-foreground shadow-lg backdrop-blur-md sm:right-7">
            <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              How it works
            </h2>
            <p className="mb-2">
              A 3-strut tensegrity prism: 6 nodes, 3 rigid struts that touch
              nothing, held apart by 9 tension-only cables. Verlet integration
              with constraint relaxation — struts hold their length exactly,
              cables can only pull.
            </p>
            <p className="mb-2">
              Each cable&apos;s live tension sets a plucked-string pitch (taut =
              high, like tightening a guitar string). The net is globally coupled,
              so moving one node re-tensions all cables — one grab drops a whole
              chord out of the coupling.
            </p>
            <p className="text-muted-foreground/80">
              After Kenneth Snelson (Needle Tower) &amp; Buckminster Fuller; the
              force-density method (Schek 1974); Skelton &amp; de Oliveira,
              Tensegrity Systems.
            </p>
          </div>
        )}
      </div>

      <PrototypeNav slugs={["8952-tensegrity"]} />
    </main>
  );
}
