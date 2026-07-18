"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { README } from "./readme-text";
import { GardenAudio, type VoiceSpec } from "./audio";
import {
  addChild,
  createTree,
  layoutTree,
  mulberry32,
  navChild,
  navParent,
  navSibling,
  nearestLeaves,
  pathNotes,
  pathToRoot,
  type PhraseNote,
  type Pt,
  type Tree,
} from "./tree";

// Canvas-only botanical palette (raw hex allowed here, never in UI chrome).
const LINEN_TOP = "#f3ecda";
const LINEN_BOT = "#e7dcc2";
const MOSS = "#5c6b46";
const MOSS_DIM = "#8a9670";
const GOLD = "#c69a3e";
const GOLD_BRIGHT = "#eac865";
const SEED = 0x5eed1938;

// Face buttons A/B/X/Y map to these scale-degree indices in D Dorian.
const BUTTON_DEGREES = [0, 1, 2, 4]; // 1, 2, 3, 5
const MAX_NODES = 64;
const VOICE_LEAVES = 7;
const IDLE_MS = 5500;
const BUFFER_CAP = 6;

type InputMode = "idle" | "keyboard" | "gamepad" | "ghost";

export default function ForkingGardenPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [hud, setHud] = useState({
    nodes: 1,
    leaves: 1,
    voices: 1,
    buffer: 0,
    mode: "idle" as InputMode,
  });

  // Imperative engine refs (no re-render churn).
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<GardenAudio | null>(null);
  const treeRef = useRef<Tree>(createTree());
  const cursorRef = useRef<number>(0);
  const bufferRef = useRef<PhraseNote[]>([]);
  const posRef = useRef<Map<number, Pt>>(new Map());
  const layoutVersionRef = useRef<number>(-1);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const rngRef = useRef<() => number>(mulberry32(SEED));

  const lastInputRef = useRef<number>(0);
  const modeRef = useRef<InputMode>("idle");
  const ghostNextRef = useRef<number>(0);
  const ghostCommitsRef = useRef<number>(0);
  const flowRef = useRef<number>(0);
  const hudTimerRef = useRef<number>(0);
  const startMsRef = useRef<number>(0);

  // Gamepad edge-detection state.
  const padPrevBtnRef = useRef<boolean[]>([]);
  const padStickCooldownRef = useRef<number>(0);

  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const a = audioRef.current;
    audioRef.current = null;
    if (a) void a.dispose();
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // ---- voice reconciliation ------------------------------------------------
  const rebuildVoices = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const tree = treeRef.current;
    const cursor = cursorRef.current;
    const specs: VoiceSpec[] = [];
    // Foreground: the root→cursor path (may be an internal node).
    specs.push({ key: -1, notes: pathNotes(tree, cursor), foreground: true });
    const near = nearestLeaves(tree, cursor, VOICE_LEAVES);
    for (const leaf of near) {
      // Skip the cursor's own leaf — its path is already the foreground voice.
      if (leaf === cursor) continue;
      specs.push({
        key: leaf,
        notes: pathNotes(tree, leaf),
        foreground: false,
      });
    }
    audio.updateVoices(specs);
  }, []);

  // ---- actions -------------------------------------------------------------
  const markInput = useCallback((mode: InputMode) => {
    lastInputRef.current = performance.now();
    modeRef.current = mode;
  }, []);

  const tapDegree = useCallback((degIndex: number) => {
    if (bufferRef.current.length >= BUFFER_CAP) return;
    // Occasional octave lift on higher degrees for melodic lift.
    const oct = degIndex >= 4 && rngRef.current() > 0.7 ? 1 : 0;
    bufferRef.current.push({ deg: degIndex, oct });
  }, []);

  const commit = useCallback(() => {
    const tree = treeRef.current;
    if (tree.nodes.size >= MAX_NODES) {
      // Garden is full — keep it musical by clearing the buffer only.
      bufferRef.current = [];
      return;
    }
    let phrase = bufferRef.current;
    if (phrase.length === 0) {
      // Nothing buffered: seed a tiny consonant gesture so a commit is audible.
      phrase = [
        { deg: 0, oct: 0 },
        { deg: 2, oct: 0 },
      ];
    }
    const id = addChild(tree, cursorRef.current, phrase);
    cursorRef.current = id;
    bufferRef.current = [];
    rebuildVoices();
  }, [rebuildVoices]);

  const doNav = useCallback(
    (dir: "up" | "down" | "left" | "right") => {
      const tree = treeRef.current;
      const cur = cursorRef.current;
      let next = cur;
      if (dir === "up") next = navParent(tree, cur);
      else if (dir === "down") next = navChild(tree, cur);
      else if (dir === "left") next = navSibling(tree, cur, -1);
      else next = navSibling(tree, cur, 1);
      if (next !== cur) {
        cursorRef.current = next;
        rebuildVoices();
      }
    },
    [rebuildVoices],
  );

  // ---- keyboard ------------------------------------------------------------
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let handled = true;
      switch (k) {
        case "arrowup":
        case "w":
          markInput("keyboard");
          doNav("up");
          break;
        case "arrowdown":
        case "s":
          markInput("keyboard");
          doNav("down");
          break;
        case "arrowleft":
        case "a":
          markInput("keyboard");
          doNav("left");
          break;
        case "arrowright":
        case "d":
          markInput("keyboard");
          doNav("right");
          break;
        case "1":
          markInput("keyboard");
          tapDegree(BUTTON_DEGREES[0]);
          break;
        case "2":
          markInput("keyboard");
          tapDegree(BUTTON_DEGREES[1]);
          break;
        case "3":
          markInput("keyboard");
          tapDegree(BUTTON_DEGREES[2]);
          break;
        case "4":
          markInput("keyboard");
          tapDegree(BUTTON_DEGREES[3]);
          break;
        case " ":
        case "enter":
          markInput("keyboard");
          commit();
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, markInput, doNav, tapDegree, commit]);

  // ---- gamepad connect (just to flag presence) -----------------------------
  useEffect(() => {
    if (!started) return;
    const onConnect = () => markInput("gamepad");
    window.addEventListener("gamepadconnected", onConnect);
    return () => window.removeEventListener("gamepadconnected", onConnect);
  }, [started, markInput]);

  const pollGamepad = useCallback(
    (now: number) => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad: Gamepad | null = null;
      for (const p of pads) if (p) { pad = p; break; }
      if (!pad) return;
      const gp = pad;

      // Face buttons 0..3 (A B X Y), edge-triggered.
      const prev = padPrevBtnRef.current;
      const readBtn = (i: number) => !!gp.buttons[i]?.pressed;
      for (let i = 0; i < 4; i++) {
        const p = readBtn(i);
        if (p && !prev[i]) {
          markInput("gamepad");
          tapDegree(BUTTON_DEGREES[i]);
        }
        prev[i] = p;
      }
      // Commit: right shoulder (5) or either trigger (6/7).
      const commitBtn = readBtn(5) || readBtn(6) || readBtn(7);
      if (commitBtn && !prev[5]) {
        markInput("gamepad");
        commit();
      }
      prev[5] = commitBtn;

      // Left stick navigation with a cooldown so one push = one step.
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      const dead = 0.55;
      if (now >= padStickCooldownRef.current) {
        let moved = false;
        if (ay < -dead) {
          doNav("up");
          moved = true;
        } else if (ay > dead) {
          doNav("down");
          moved = true;
        } else if (ax < -dead) {
          doNav("left");
          moved = true;
        } else if (ax > dead) {
          doNav("right");
          moved = true;
        }
        if (moved) {
          markInput("gamepad");
          padStickCooldownRef.current = now + 260;
        }
      }
    },
    [markInput, tapDegree, commit, doNav],
  );

  // ---- ghost gardener ------------------------------------------------------
  const ghostStep = useCallback(
    (now: number) => {
      const rng = rngRef.current;
      const tree = treeRef.current;
      if (tree.nodes.size >= MAX_NODES) {
        // Full garden: keep the foreground wandering so the sound keeps shifting.
        const dirs = ["up", "down", "left", "right"] as const;
        doNav(dirs[Math.floor(rng() * 4)]);
        ghostNextRef.current = now + 900;
        return;
      }

      // Decide: extend the current branch, or jump back and FORK a new one.
      const cursorNode = tree.nodes.get(cursorRef.current);
      const depth = cursorNode ? cursorNode.depth : 0;
      const forceBack = depth >= 7;
      const wantFork = forceBack || rng() < 0.42;
      if (wantFork) {
        const hops = 1 + Math.floor(rng() * Math.min(3, Math.max(1, depth)));
        for (let i = 0; i < hops; i++) doNav("up");
        // Sometimes slide to a sibling before forking to spread the delta.
        if (rng() < 0.5) doNav(rng() < 0.5 ? "left" : "right");
      }

      // Build a short modal phrase by a gentle random walk.
      bufferRef.current = [];
      const len = 3 + Math.floor(rng() * 3); // 3..5 notes
      let deg = Math.floor(rng() * 7);
      for (let i = 0; i < len; i++) {
        const move = rng();
        if (move < 0.55) deg += rng() < 0.5 ? 1 : -1; // step
        else if (move < 0.75) deg += rng() < 0.5 ? 2 : -2; // small leap
        deg = ((deg % 7) + 7) % 7;
        const oct = deg >= 5 && rng() > 0.7 ? 1 : 0;
        bufferRef.current.push({ deg, oct });
      }
      commit();
      ghostCommitsRef.current++;
      // Thicken steadily: ~1.0–1.4s between commits.
      ghostNextRef.current = now + 1000 + rng() * 400;
    },
    [doNav, commit],
  );

  // ---- main loop -----------------------------------------------------------
  const frame = useCallback(() => {
    const now = performance.now();
    const canvas = canvasRef.current;
    const audio = audioRef.current;

    // Input: poll gamepad every frame.
    pollGamepad(now);

    // Ghost takes over after idle.
    const idle = now - lastInputRef.current > IDLE_MS;
    if (idle) {
      modeRef.current = "ghost";
      if (now >= ghostNextRef.current) ghostStep(now);
    }

    // Audio scheduling.
    if (audio) audio.tick();

    // Draw.
    if (canvas) drawGarden(canvas, now);

    // Throttled HUD.
    if (now - hudTimerRef.current > 250) {
      hudTimerRef.current = now;
      const tree = treeRef.current;
      let leafCount = 0;
      for (const n of tree.nodes.values())
        if (n.children.length === 0) leafCount++;
      setHud({
        nodes: tree.nodes.size,
        leaves: leafCount,
        voices: Math.min(leafCount, VOICE_LEAVES) + 1,
        buffer: bufferRef.current.length,
        mode: modeRef.current,
      });
    }

    rafRef.current = requestAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollGamepad, ghostStep]);

  // ---- drawing -------------------------------------------------------------
  const drawGarden = useCallback((canvas: HTMLCanvasElement, now: number) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement;
    const cssW = parent ? parent.clientWidth : canvas.width;
    const cssH = parent ? parent.clientHeight : canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (
      canvas.width !== Math.round(cssW * dpr) ||
      canvas.height !== Math.round(cssH * dpr)
    ) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      layoutVersionRef.current = -1; // force relayout
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = cssW;
    const H = cssH;

    // Linen ground.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, LINEN_TOP);
    bg.addColorStop(1, LINEN_BOT);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const tree = treeRef.current;
    // Relayout on structural change or resize.
    if (
      layoutVersionRef.current !== tree.version ||
      sizeRef.current.w !== W ||
      sizeRef.current.h !== H
    ) {
      posRef.current = layoutTree(tree, W, H, Math.min(60, W * 0.08));
      layoutVersionRef.current = tree.version;
      sizeRef.current = { w: W, h: H };
    }
    const pos = posRef.current;

    const cursor = cursorRef.current;
    const activePath = new Set(pathToRoot(tree, cursor));
    const pulses = audioRef.current?.getPulses() ?? new Map<number, number>();
    const nearSet = new Set(nearestLeaves(tree, cursor, VOICE_LEAVES));
    flowRef.current = now / 1000;

    // Subtree size drives trunk thickness (river delta: thick near root).
    const subtreeSize = new Map<number, number>();
    const sizeOf = (id: number): number => {
      const n = tree.nodes.get(id);
      if (!n) return 1;
      if (n.children.length === 0) {
        subtreeSize.set(id, 1);
        return 1;
      }
      let s = 1;
      for (const c of n.children) s += sizeOf(c);
      subtreeSize.set(id, s);
      return s;
    };
    sizeOf(tree.root);
    const rootSize = subtreeSize.get(tree.root) ?? 1;

    // Edges.
    for (const n of tree.nodes.values()) {
      if (n.parent === null) continue;
      const a = pos.get(n.parent);
      const b = pos.get(n.id);
      if (!a || !b) continue;
      const onActive = activePath.has(n.id) && activePath.has(n.parent);
      const size = subtreeSize.get(n.id) ?? 1;
      const w = 1 + 6 * Math.sqrt(size / rootSize);
      const midx = (a.x + b.x) / 2;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(midx, a.y, midx, b.y, b.x, b.y);
      if (onActive) {
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = w + 1.5;
        ctx.globalAlpha = 0.95;
      } else {
        ctx.strokeStyle = MOSS;
        ctx.lineWidth = w;
        ctx.globalAlpha = 0.5;
      }
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Flow highlight travelling along active edges.
      if (onActive) {
        const t = (flowRef.current * 0.5 + n.id * 0.13) % 1;
        const px = bezier(a.x, midx, midx, b.x, t);
        const py = bezier(a.y, a.y, b.y, b.y, t);
        ctx.beginPath();
        ctx.arc(px, py, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = GOLD_BRIGHT;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Nodes.
    for (const n of tree.nodes.values()) {
      const p = pos.get(n.id);
      if (!p) continue;
      const isLeafNode = n.children.length === 0;
      const onActive = activePath.has(n.id);
      const pulse = isLeafNode
        ? pulses.get(n.id) ?? 0
        : n.id === cursor
          ? pulses.get(-1) ?? 0
          : 0;

      // Sounding leaves glow.
      if (isLeafNode && nearSet.has(n.id) && pulse > 0.02) {
        const r = 6 + pulse * 16;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, onActive ? GOLD_BRIGHT : "#b7c48f");
        g.addColorStop(1, "rgba(120,140,90,0)");
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      const base = onActive ? GOLD : isLeafNode ? MOSS : MOSS_DIM;
      const dotR = (isLeafNode ? 3.2 : 2.4) + pulse * 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = base;
      ctx.fill();
    }

    // Cursor ring — where you are standing.
    const cp = pos.get(cursor);
    if (cp) {
      const fgPulse = pulses.get(-1) ?? 0;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 8 + fgPulse * 5, 0, Math.PI * 2);
      ctx.strokeStyle = GOLD_BRIGHT;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, []);

  // ---- start ---------------------------------------------------------------
  const begin = useCallback(async () => {
    setStarted(true);
    startMsRef.current = performance.now();
    lastInputRef.current = performance.now();
    ghostNextRef.current = performance.now() + IDLE_MS + 400;
    try {
      const audio = new GardenAudio();
      audioRef.current = audio;
      await audio.start();
      rebuildVoices();
    } catch {
      setAudioFailed(true);
    }
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(frame);
  }, [frame, rebuildVoices]);

  const modeLabel: Record<InputMode, string> = {
    idle: "waiting",
    keyboard: "keyboard",
    gamepad: "gamepad",
    ghost: "ghost gardener",
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            1938 · Forking Garden
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            A garden where every future you grew is playing at once
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            Grow a branching version-tree of short modal phrases. Every leaf is a
            looping voice, so all your alternate histories sound together — the
            path you are standing on rings loudest.
          </p>
        </header>

        <div className="relative overflow-hidden rounded-lg border border-border">
          <canvas
            ref={canvasRef}
            className="block h-[62vh] w-full"
            aria-label="Branching river-delta of the composition tree"
          />

          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
              <p className="max-w-md px-6 text-center text-base text-muted-foreground">
                Plug in a gamepad or use the keyboard. Leave it idle for ~5
                seconds and a ghost gardener grows the delta for you.
              </p>
              <button
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter the garden
              </button>
            </div>
          )}
        </div>

        {/* HUD + controls */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground">
          <span>
            input:{" "}
            <span className="text-foreground">{modeLabel[hud.mode]}</span>
          </span>
          <span>
            nodes: <span className="text-foreground">{hud.nodes}</span>
          </span>
          <span>
            leaves: <span className="text-foreground">{hud.leaves}</span>
          </span>
          <span>
            voices sounding:{" "}
            <span className="text-foreground">{hud.voices}</span>
          </span>
          <span>
            phrase buffer:{" "}
            <span className="text-foreground">{hud.buffer}</span>/{BUFFER_CAP}
          </span>
          {audioFailed && (
            <span className="text-destructive">audio unavailable</span>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-background/60 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Gamepad
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>Left stick — steer the cursor (up parent · down child · L/R siblings)</li>
              <li>A B X Y — tap scale degrees (1, 2, 3, 5)</li>
              <li>Right shoulder / trigger — commit (forks if not a leaf)</li>
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Keyboard
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>Arrows / WASD — steer the cursor</li>
              <li>1 2 3 4 — tap scale degrees</li>
              <li>Space / Enter — commit the buffered phrase</li>
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={() => setShowNotes(true)}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Design notes
              </p>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
              {README}
            </pre>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1938-forking-garden"]} />
    </div>
  );
}

// Cubic Bézier scalar helper for flow particles.
function bezier(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const u = 1 - t;
  return (
    u * u * u * p0 +
    3 * u * u * t * p1 +
    3 * u * t * t * p2 +
    t * t * t * p3
  );
}
