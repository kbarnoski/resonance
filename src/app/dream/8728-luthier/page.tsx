"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  buildPreset,
  DEFAULT_K_UI,
  DEFAULT_M_UI,
  DEFAULT_Z_UI,
  FIELD_H,
  mulberry32,
  pluckVisual,
  resetModel,
  stepVisual,
} from "./engine";
import type { MILink, Model, PresetName } from "./engine";
import { makeAudioRig } from "./audio";
import type { AudioRig } from "./audio";

type Mode = "pluck" | "mass" | "wire" | "ground" | "listener" | "erase";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "pluck", label: "Pluck", hint: "drag a mass and let go" },
  { id: "mass", label: "Add mass", hint: "click empty space" },
  { id: "wire", label: "Wire", hint: "drag mass → mass" },
  { id: "ground", label: "Ground", hint: "click a mass to anchor it" },
  { id: "listener", label: "Listener", hint: "click the mass you hear" },
  { id: "erase", label: "Erase", hint: "click a mass or link" },
];

const HIT_R = 0.03; // phys-space pick radius
const MAX_PLUCK = 12;

// palette (canvas art layer only) — luthier's blueprint: steel + brass on ink
const BG = "#0a0d12";
const GRID = "#111820";
const STEEL: [number, number, number] = [64, 78, 94];
const BRASS: [number, number, number] = [224, 168, 58];
const GROUND_COL = "#a4b4c4";
const LISTENER_COL = "#e0a83a";
const HELD_COL = "#f6d98f";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function rgb(c: [number, number, number], a = 1) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function mix(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(
    lerp(a[1], b[1], t)
  )},${Math.round(lerp(a[2], b[2], t))})`;
}

function nearestNode(model: Model, x: number, y: number): number {
  let best = -1;
  let bd = HIT_R * HIT_R;
  for (let i = 0; i < model.nodes.length; i++) {
    const n = model.nodes[i];
    const dx = n.x - x;
    const dy = n.y - y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function segDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function nearestLink(model: Model, x: number, y: number): number {
  let best = -1;
  let bd = 0.02;
  for (let i = 0; i < model.links.length; i++) {
    const A = model.nodes[model.links[i].a];
    const B = model.nodes[model.links[i].b];
    const d = segDist(x, y, A.x, A.y, B.x, B.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function removeNode(model: Model, idx: number) {
  model.nodes.splice(idx, 1);
  model.links = model.links.filter((l) => l.a !== idx && l.b !== idx);
  for (const l of model.links) {
    if (l.a > idx) l.a--;
    if (l.b > idx) l.b--;
  }
  if (model.listener === idx) model.listener = 0;
  else if (model.listener > idx) model.listener--;
}

/** Choose a good node + velocity to auto-pluck this preset for the self-demo. */
function autoPluckSpec(
  model: Model,
  preset: PresetName,
  rng: () => number
): { i: number; vx: number; vy: number } {
  const speed = 5 + rng() * 1.5;
  if (preset === "string") {
    return { i: Math.floor(model.nodes.length * 0.5), vx: 0, vy: speed };
  }
  // ring / web: radial kick outward from the network centroid
  let cx = 0;
  let cy = 0;
  for (const n of model.nodes) {
    cx += n.rx;
    cy += n.ry;
  }
  cx /= model.nodes.length;
  cy /= model.nodes.length;
  // pick a non-fixed node farthest-ish from center
  let i = model.listener;
  for (let k = 0; k < model.nodes.length; k++) {
    if (!model.nodes[k].fixed) {
      i = k;
      break;
    }
  }
  const n = model.nodes[i];
  const dx = n.rx - cx;
  const dy = n.ry - cy;
  const len = Math.hypot(dx, dy) || 1;
  return { i, vx: (dx / len) * speed, vy: (dy / len) * speed };
}

export default function LuthierPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelRef = useRef<Model>(buildPreset("string"));
  const rigRef = useRef<AudioRig | null>(null);
  const snapRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const heldRef = useRef<number>(-1);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);
  const presetRef = useRef<PresetName>("string");
  const rngRef = useRef<() => number>(mulberry32(0x8728));
  // material live-read by the rAF visual sim
  const matRef = useRef({ k: DEFAULT_K_UI, z: DEFAULT_Z_UI, m: DEFAULT_M_UI });
  // pointer velocity tracking
  const dragRef = useRef<{
    active: boolean;
    node: number;
    samples: { x: number; y: number; t: number }[];
    wireFrom: number;
    cursor: { x: number; y: number };
  }>({ active: false, node: -1, samples: [], wireFrom: -1, cursor: { x: 0, y: 0 } });

  const [mode, setMode] = useState<Mode>("pluck");
  const [running, setRunning] = useState(false);
  const [workletOk, setWorkletOk] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [kUI, setKUI] = useState(DEFAULT_K_UI);
  const [zUI, setZUI] = useState(DEFAULT_Z_UI);
  const [mUI, setMUI] = useState(DEFAULT_M_UI);
  const [preset, setPreset] = useState<PresetName>("string");
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);

  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ---- capability detection ------------------------------------------------
  useEffect(() => {
    const hasWorklet =
      typeof window !== "undefined" &&
      typeof (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: unknown })
          .webkitAudioContext) !== "undefined" &&
      typeof AudioWorkletNode !== "undefined";
    setWorkletOk(hasWorklet);
    if (!hasWorklet) {
      setNotice(
        "AudioWorklet is unavailable in this browser — showing the network vibrating without sound."
      );
    }
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }, []);

  // ---- render + visual physics loop ---------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const model = modelRef.current;
      // adopt worklet snapshot when playing
      if (runningRef.current && snapRef.current) {
        const s = snapRef.current;
        if (s.length === model.nodes.length * 2) {
          for (let i = 0; i < model.nodes.length; i++) {
            model.nodes[i].x = s[2 * i];
            model.nodes[i].y = s[2 * i + 1];
          }
        }
      } else {
        stepVisual(
          model,
          matRef.current.m,
          matRef.current.z,
          heldRef.current,
          reducedRef.current
        );
      }

      // size
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (
        canvas.width !== Math.round(cssW * dpr) ||
        canvas.height !== Math.round(cssH * dpr)
      ) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const S = (v: number) => v * cssW; // phys -> css px
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, cssW, cssH);

      // blueprint grid
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      const step = cssW / 16;
      ctx.beginPath();
      for (let gx = step; gx < cssW; gx += step) {
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, cssH);
      }
      for (let gy = step; gy < cssH; gy += step) {
        ctx.moveTo(0, gy);
        ctx.lineTo(cssW, gy);
      }
      ctx.stroke();

      const nodes = model.nodes;

      // links, coloured by strain
      for (const l of model.links) {
        const A = nodes[l.a];
        const B = nodes[l.b];
        if (!A || !B) continue;
        const len = Math.hypot(B.x - A.x, B.y - A.y);
        const strain = Math.min(1, (Math.abs(len - l.L0) / (l.L0 || 1)) * 16);
        ctx.strokeStyle = mix(STEEL, BRASS, strain);
        ctx.lineWidth = 1.4 + strain * 2.2;
        ctx.beginPath();
        ctx.moveTo(S(A.x), S(A.y));
        ctx.lineTo(S(B.x), S(B.y));
        ctx.stroke();
      }

      // wire preview
      const drag = dragRef.current;
      if (modeRef.current === "wire" && drag.wireFrom >= 0) {
        const A = nodes[drag.wireFrom];
        if (A) {
          ctx.strokeStyle = rgb(BRASS, 0.5);
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(S(A.x), S(A.y));
          ctx.lineTo(S(drag.cursor.x), S(drag.cursor.y));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const disp = Math.hypot(n.x - n.rx, n.y - n.ry);
        const glow = Math.min(1, disp * 14);
        const cx = S(n.x);
        const cy = S(n.y);
        const isL = i === model.listener;
        const isHeld = i === heldRef.current;

        if (n.fixed) {
          // grounded: hollow steel anchor
          ctx.strokeStyle = GROUND_COL;
          ctx.lineWidth = 2;
          const r = 6;
          ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
          ctx.beginPath();
          ctx.moveTo(cx - r - 3, cy + r + 2);
          ctx.lineTo(cx + r + 3, cy + r + 2);
          ctx.stroke();
          continue;
        }

        if (glow > 0.02) {
          ctx.beginPath();
          ctx.fillStyle = rgb(BRASS, 0.16 * glow);
          ctx.arc(cx, cy, 10 + glow * 12, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        const base: [number, number, number] = [124, 136, 150];
        ctx.fillStyle = isHeld
          ? HELD_COL
          : isL
            ? LISTENER_COL
            : mix(base, BRASS, glow);
        ctx.arc(cx, cy, isL ? 6.5 : 5, 0, Math.PI * 2);
        ctx.fill();
        if (isL) {
          ctx.strokeStyle = rgb(BRASS, 0.9);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    // seeded auto-pluck for the muted self-demo (~0.5s after load)
    const t = window.setTimeout(() => {
      const spec = autoPluckSpec(modelRef.current, presetRef.current, rngRef.current);
      pluckVisual(modelRef.current, spec.i, spec.vx, spec.vy);
    }, 520);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearTimeout(t);
    };
  }, []);

  // ---- teardown on unmount -------------------------------------------------
  useEffect(() => {
    return () => {
      const rig = rigRef.current;
      rigRef.current = null;
      snapRef.current = null;
      if (rig) void rig.destroy();
    };
  }, []);

  // ---- audio start / stop --------------------------------------------------
  const startAudio = useCallback(async () => {
    if (!workletOk) return;
    try {
      const rig = await makeAudioRig(
        modelRef.current,
        kUI,
        zUI,
        mUI,
        (positions) => {
          snapRef.current = positions;
        }
      );
      rigRef.current = rig;
      runningRef.current = true;
      setRunning(true);
      setNotice(null);
      // audible confirmation pluck
      const spec = autoPluckSpec(
        modelRef.current,
        presetRef.current,
        rngRef.current
      );
      rig.pluck(spec.i, spec.vx, spec.vy);
    } catch (err) {
      setNotice(
        "Could not start audio — showing the network vibrating without sound."
      );
      console.error(err);
    }
  }, [workletOk, kUI, zUI, mUI]);

  const stopAudio = useCallback(async () => {
    const rig = rigRef.current;
    rigRef.current = null;
    runningRef.current = false;
    snapRef.current = null;
    setRunning(false);
    if (rig) await rig.destroy();
    resetModel(modelRef.current);
  }, []);

  const toggleAudio = useCallback(() => {
    if (running) void stopAudio();
    else void startAudio();
  }, [running, startAudio, stopAudio]);

  // ---- material live retune ------------------------------------------------
  const onMaterial = useCallback(
    (which: "k" | "z" | "m", v: number) => {
      if (which === "k") setKUI(v);
      if (which === "z") setZUI(v);
      if (which === "m") setMUI(v);
      const next = { ...matRef.current, [which]: v };
      matRef.current = next;
      rigRef.current?.sendMaterial(next.k, next.z, next.m);
    },
    []
  );

  // ---- preset load ---------------------------------------------------------
  const loadPreset = useCallback((name: PresetName) => {
    const model = buildPreset(name);
    modelRef.current = model;
    presetRef.current = name;
    heldRef.current = -1;
    setPreset(name);
    resetModel(model);
    if (rigRef.current) {
      rigRef.current.sendTopology(model);
      rigRef.current.sendMaterial(
        matRef.current.k,
        matRef.current.z,
        matRef.current.m
      );
    }
    bump();
    // pluck shortly after so the change in timbre is immediately audible/visible
    window.setTimeout(() => {
      const spec = autoPluckSpec(model, name, rngRef.current);
      if (rigRef.current) rigRef.current.pluck(spec.i, spec.vx, spec.vy);
      else pluckVisual(model, spec.i, spec.vx, spec.vy);
    }, 120);
  }, [bump]);

  // ---- topology commit (after edits) --------------------------------------
  const commitTopology = useCallback(() => {
    if (rigRef.current) rigRef.current.sendTopology(modelRef.current);
    bump();
  }, [bump]);

  // ---- pointer helpers -----------------------------------------------------
  const toPhys = useCallback((e: React.PointerEvent | PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.width,
    };
  }, []);

  const applyGrab = useCallback((i: number) => {
    heldRef.current = i;
    const n = modelRef.current.nodes[i];
    if (n) {
      n.vx = 0;
      n.vy = 0;
    }
    rigRef.current?.grab(i);
  }, []);

  const applyGrabMove = useCallback((i: number, x: number, y: number) => {
    const n = modelRef.current.nodes[i];
    if (n) {
      n.x = x;
      n.y = y;
      n.vx = 0;
      n.vy = 0;
    }
    rigRef.current?.grabMove(i, x, y);
  }, []);

  const applyRelease = useCallback((i: number, vx: number, vy: number) => {
    heldRef.current = -1;
    const n = modelRef.current.nodes[i];
    if (n && !n.fixed) {
      n.vx = vx;
      n.vy = vy;
    }
    rigRef.current?.release(i, vx, vy);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = toPhys(e);
      const model = modelRef.current;
      const m = modeRef.current;
      const ni = nearestNode(model, p.x, p.y);
      const drag = dragRef.current;
      (e.target as Element).setPointerCapture?.(e.pointerId);

      if (m === "pluck") {
        if (ni >= 0 && !model.nodes[ni].fixed) {
          drag.active = true;
          drag.node = ni;
          drag.samples = [{ x: p.x, y: p.y, t: performance.now() }];
          applyGrab(ni);
        }
        return;
      }
      if (m === "mass") {
        const py = Math.max(0.03, Math.min(FIELD_H - 0.03, p.y));
        model.nodes.push({
          x: p.x,
          y: py,
          vx: 0,
          vy: 0,
          rx: p.x,
          ry: py,
          fixed: false,
        });
        commitTopology();
        return;
      }
      if (m === "wire") {
        if (ni >= 0) {
          drag.wireFrom = ni;
          drag.cursor = { x: p.x, y: p.y };
        }
        return;
      }
      if (m === "ground") {
        if (ni >= 0) {
          model.nodes[ni].fixed = !model.nodes[ni].fixed;
          model.nodes[ni].vx = 0;
          model.nodes[ni].vy = 0;
          commitTopology();
        }
        return;
      }
      if (m === "listener") {
        if (ni >= 0) {
          model.listener = ni;
          rigRef.current?.setListener(ni);
          bump();
        }
        return;
      }
      if (m === "erase") {
        if (ni >= 0) {
          removeNode(model, ni);
          commitTopology();
        } else {
          const li = nearestLink(model, p.x, p.y);
          if (li >= 0) {
            model.links.splice(li, 1);
            commitTopology();
          }
        }
        return;
      }
    },
    [applyGrab, bump, commitTopology, toPhys]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      const m = modeRef.current;
      if (m === "pluck" && drag.active && drag.node >= 0) {
        const p = toPhys(e);
        drag.samples.push({ x: p.x, y: p.y, t: performance.now() });
        if (drag.samples.length > 6) drag.samples.shift();
        const py = Math.max(0.02, Math.min(FIELD_H - 0.02, p.y));
        applyGrabMove(drag.node, p.x, py);
      } else if (m === "wire" && drag.wireFrom >= 0) {
        const p = toPhys(e);
        drag.cursor = { x: p.x, y: p.y };
      }
    },
    [applyGrabMove, toPhys]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      const m = modeRef.current;
      const model = modelRef.current;

      if (m === "pluck" && drag.active && drag.node >= 0) {
        // estimate release velocity from recent samples
        const s = drag.samples;
        let vx = 0;
        let vy = 0;
        if (s.length >= 2) {
          const a = s[0];
          const b = s[s.length - 1];
          const dt = Math.max(0.016, (b.t - a.t) / 1000);
          vx = (b.x - a.x) / dt;
          vy = (b.y - a.y) / dt;
        }
        let sp = Math.hypot(vx, vy);
        if (sp < 1.2) {
          // a plain tap still sounds — nudge along the network's local normal
          vx = 0;
          vy = 3.2;
          sp = 3.2;
        }
        if (sp > MAX_PLUCK) {
          vx = (vx / sp) * MAX_PLUCK;
          vy = (vy / sp) * MAX_PLUCK;
        }
        const damp = reducedRef.current ? 0.5 : 1;
        applyRelease(drag.node, vx * damp, vy * damp);
        drag.active = false;
        drag.node = -1;
        drag.samples = [];
        return;
      }

      if (m === "wire" && drag.wireFrom >= 0) {
        const p = toPhys(e);
        const ni = nearestNode(model, p.x, p.y);
        if (ni >= 0 && ni !== drag.wireFrom) {
          const a = Math.min(ni, drag.wireFrom);
          const b = Math.max(ni, drag.wireFrom);
          const exists = model.links.some(
            (l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)
          );
          if (!exists) {
            const A = model.nodes[a];
            const B = model.nodes[b];
            const L0 = Math.hypot(B.rx - A.rx, B.ry - A.ry);
            const link: MILink = { a, b, L0 };
            model.links.push(link);
            commitTopology();
          }
        }
        drag.wireFrom = -1;
      }
    },
    [applyRelease, commitTopology, toPhys]
  );

  const activeHint = MODES.find((mm) => mm.id === mode)?.hint ?? "";
  const nodeCount = modelRef.current.nodes.length;
  const linkCount = modelRef.current.links.length;
  const groundCount = modelRef.current.nodes.filter((n) => n.fixed).length;

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Dream lab · 8728
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                The Luthier
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {showNotes ? "Hide notes" : "Design notes"}
            </button>
          </div>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            Wire your own instrument — drop masses, string springs between them,
            ground some, then pluck it and hear the exact shape you built. The
            network you see vibrating <em>is</em> the waveform you hear.
          </p>
        </header>

        {showNotes && (
          <section className="rounded-lg border border-border bg-muted/40 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              How it works
            </p>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                There is no separate synth. A network of point masses joined by
                spring + damper links is integrated at audio rate with
                semi-implicit (symplectic) Euler, one step per sample, inside an
                AudioWorklet. The velocity of the highlighted <em>listener</em>{" "}
                node, soft-clipped, is the audio you hear. The same node
                positions, streamed back ~60×/second, are the picture.
              </p>
              <p>
                Topology and material are the timbre. A tensioned line of masses
                is a string with a near-harmonic overtone series. A closed loop
                is a bell — its bending modes are inharmonic. A triangulated web
                is a dense modal cluster with no single pitch. Change stiffness,
                damping, or mass and the whole object retunes live.
              </p>
              <p className="text-muted-foreground/80">
                Honest limits: topology → timbre is real, but the integrator
                runs a small net for numerical stability, and the on-screen
                self-demo uses a softened main-thread solver so it can animate
                before any audio exists.
              </p>
              <p className="text-muted-foreground/80">
                Reference: Claude Cadoz / CORDIS-ANIMA (ACROE, Grenoble) and the
                miPhysics mass-interaction library (2026).
              </p>
            </div>
          </section>
        )}

        {notice && (
          <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-destructive">
            {notice}
          </p>
        )}

        {/* canvas workbench */}
        <div className="overflow-hidden rounded-lg border border-border">
          <canvas
            ref={canvasRef}
            className="block w-full touch-none"
            style={{ aspectRatio: `1 / ${FIELD_H}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        {/* transport + tool row */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleAudio}
              disabled={!workletOk}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? "Stop" : "Start · build & play"}
            </button>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {nodeCount} masses · {linkCount} springs · {groundCount} grounded
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Tool — {activeHint}
            </p>
            <div className="flex flex-wrap gap-2">
              {MODES.map((mm) => (
                <button
                  key={mm.id}
                  type="button"
                  onClick={() => setMode(mm.id)}
                  aria-pressed={mode === mm.id}
                  className={
                    mode === mm.id
                      ? "min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                      : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  }
                >
                  {mm.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Presets — load, then reshape
            </p>
            <div className="flex flex-wrap gap-2">
              {(["string", "ring", "web"] as PresetName[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => loadPreset(p)}
                  aria-pressed={preset === p}
                  className={
                    preset === p
                      ? "min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground capitalize"
                      : "min-h-[44px] rounded-md border border-border bg-background/60 px-5 text-sm capitalize text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  }
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* material sliders */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Slider
              label="Stiffness (k)"
              value={kUI}
              onChange={(v) => onMaterial("k", v)}
            />
            <Slider
              label="Damping (z)"
              value={zUI}
              onChange={(v) => onMaterial("z", v)}
            />
            <Slider
              label="Mass (m)"
              value={mUI}
              onChange={(v) => onMaterial("m", v)}
            />
          </div>
        </div>
      </div>

      <PrototypeNav slugs={["8728-luthier"]} />
    </main>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </label>
  );
}
