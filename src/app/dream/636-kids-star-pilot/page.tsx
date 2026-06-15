"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// STAR PILOT — fly a glowing little ship with a game controller through a field
// of musical star-gates. Steer to weave through tuned gates that sing, press
// buttons to drop sparkly drums. Recent gates echo back on a slow pulse, so a
// melody accumulates and evolves. Kids prototype, playful arcade wonder.
//
// Subsystems:
//   1. Gamepad API polling (stick axes + button edges) + keyboard fallback
//   2. Ship flight physics + star-gate proximity/collision detection
//   3. Tuned-gate chime synth + sparkly percussion + loop-memory sequencer
//   4. Canvas2D glowing starfield render
//
// Reference lineage: Toshio Iwai's Electroplankton (Nintendo DS, 2005) and
// Tetsuya Mizuguchi's Rez / Child of Eden — flying through a synaesthetic
// music space where play becomes melody.
// ---------------------------------------------------------------------------

// Just-intonation pentatonic over a low root (A2 ~ 110Hz). Ratios 1, 9/8,
// 5/4, 3/2, 5/3, then octave up. Pure, bell-like, never dissonant.
const ROOT = 146.83; // D3
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2];

const GATE_COLORS = [
  "#c084fc", // violet
  "#67e8f9", // cyan
  "#34d399", // emerald
  "#fbbf24", // amber
  "#f472b6", // pink
  "#818cf8", // indigo
  "#5eead4", // teal
];

const NUM_GATES = 6;
const GATE_R = 46; // gate ring radius
const SHIP_R = 11;
const TRAIL_LEN = 22;

const ACCEL = 720; // thrust px/s² from full stick
const DRAG = 1.6; // velocity damping per second
const MAX_SPEED = 360;
const GATE_COOLDOWN = 0.45; // s before a gate can ring again from the ship
const MEMORY_LEN = 8; // how many recent gate-notes are remembered
const SEQ_INTERVAL = 0.42; // s between loop-memory echoes
const IDLE_RESUME = 5; // s of no input before auto-flight resumes
const PERC_COOLDOWN = 0.09; // s rate-limit on drum drops

interface Gate {
  x: number; // normalized 0..1
  y: number;
  noteIdx: number;
  colorIdx: number;
  phase: number; // twinkle phase
  flash: number; // 0..1 bloom on ring
}

interface TrailPt {
  x: number;
  y: number;
}

// --- Audio voices -----------------------------------------------------------

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
}

function makeRig(): AudioRig {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.7;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7500;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 4;
  comp.ratio.value = 16; // brick-wall-ish
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  master.connect(lp).connect(comp).connect(ctx.destination);
  return { ctx, master };
}

// Struck-bell / pluck tone for a gate note. echo=true plays it softer (memory).
function strikeBell(
  rig: AudioRig,
  noteIdx: number,
  when: number,
  echo: boolean,
): void {
  const { ctx, master } = rig;
  const hz = ROOT * RATIOS[noteIdx % RATIOS.length];
  const peak = echo ? 0.13 : 0.26;
  const dur = echo ? 0.9 : 1.3;

  const partials: Array<[number, number]> = [
    [1, 1],
    [2, 0.45],
    [2.76, 0.22], // slightly inharmonic = bell shimmer
    [4, 0.12],
  ];
  for (const [mult, amp] of partials) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz * mult;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak * amp, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }
}

// Sparkly percussion: soft mallet/woodblock thump + a noise shimmer.
function dropPercussion(rig: AudioRig, variant: number): void {
  const { ctx, master } = rig;
  const now = ctx.currentTime;

  // Mallet body
  const bodyHz = 220 + variant * 70;
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(bodyHz, now);
  osc.frequency.exponentialRampToValueAtTime(bodyHz * 0.6, now + 0.08);
  og.gain.setValueAtTime(0, now);
  og.gain.linearRampToValueAtTime(0.22, now + 0.004);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(og).connect(master);
  osc.start(now);
  osc.stop(now + 0.22);

  // Shimmer: short filtered noise burst
  const len = Math.floor(ctx.sampleRate * 0.16);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3200 + variant * 600;
  bp.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.12, now);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  src.connect(bp).connect(ng).connect(master);
  src.start(now);
  src.stop(now + 0.18);
}

// --- Component --------------------------------------------------------------

export default function StarPilot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rigRef = useRef<AudioRig | null>(null);
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);

  // Mutable scene state (refs to avoid stale closures in RAF)
  const shipRef = useRef({ x: 0.5, y: 0.5, vx: 0, vy: 0 });
  const trailRef = useRef<TrailPt[]>([]);
  const gatesRef = useRef<Gate[]>([]);
  const gateCdRef = useRef<number[]>([]); // per-gate ring cooldown timers
  const memoryRef = useRef<number[]>([]); // recent gate noteIdxs
  const seqClockRef = useRef(0); // scheduler accumulator for loop-memory
  const seqPosRef = useRef(0); // which memory slot to echo next
  const idleTimerRef = useRef(0); // s since last real input
  const percCdRef = useRef(0);
  const autoTRef = useRef(0); // auto-flight phase

  // Input state
  const keysRef = useRef<Record<string, boolean>>({});
  const padIndexRef = useRef<number | null>(null);
  const prevButtonsRef = useRef<boolean[]>([]);

  const [started, setStarted] = useState(false);
  const [hasGamepad, setHasGamepad] = useState(false);
  const [canvasOk, setCanvasOk] = useState(true);
  const [gateHits, setGateHits] = useState(0);

  // Init gates once
  if (gatesRef.current.length === 0) {
    const gates: Gate[] = [];
    for (let i = 0; i < NUM_GATES; i++) {
      const ang = (i / NUM_GATES) * Math.PI * 2;
      gates.push({
        x: 0.5 + Math.cos(ang) * 0.32,
        y: 0.5 + Math.sin(ang) * 0.32,
        noteIdx: i % RATIOS.length,
        colorIdx: i % GATE_COLORS.length,
        phase: Math.random() * Math.PI * 2,
        flash: 0,
      });
    }
    gatesRef.current = gates;
    gateCdRef.current = new Array(NUM_GATES).fill(0);
  }

  const rememberNote = useCallback((noteIdx: number) => {
    const mem = memoryRef.current;
    mem.push(noteIdx);
    if (mem.length > MEMORY_LEN) mem.shift();
  }, []);

  const ringGate = useCallback(
    (gi: number, echo: boolean) => {
      const g = gatesRef.current[gi];
      g.flash = 1;
      const rig = rigRef.current;
      if (rig) strikeBell(rig, g.noteIdx, rig.ctx.currentTime, echo);
      if (!echo) {
        rememberNote(g.noteIdx);
        setGateHits((c) => c + 1);
      }
    },
    [rememberNote],
  );

  // --- Main loop ------------------------------------------------------------
  const runFrame = useCallback(
    (t: number) => {
      rafRef.current = requestAnimationFrame(runFrame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) {
        setCanvasOk(false);
        return;
      }

      const last = lastTRef.current || t;
      let dt = (t - last) / 1000;
      lastTRef.current = t;
      if (dt > 0.05) dt = 0.05; // clamp after tab switch

      const W = canvas.width;
      const H = canvas.height;

      // --- Input: poll gamepad, read keyboard --------------------------
      let ax = 0;
      let ay = 0;
      let realInput = false;
      const dropVariants: number[] = [];

      const pads =
        typeof navigator !== "undefined" && navigator.getGamepads
          ? navigator.getGamepads()
          : [];
      let pad: Gamepad | null = null;
      if (padIndexRef.current != null) pad = pads[padIndexRef.current] ?? null;
      if (!pad) {
        for (const p of pads) {
          if (p) {
            pad = p;
            padIndexRef.current = p.index;
            break;
          }
        }
      }

      if (pad) {
        const sx = pad.axes[0] ?? 0;
        const sy = pad.axes[1] ?? 0;
        const dead = 0.18;
        if (Math.abs(sx) > dead) ax += sx;
        if (Math.abs(sy) > dead) ay += sy;
        // Button press edges → percussion (face buttons 0..3)
        const prev = prevButtonsRef.current;
        for (let b = 0; b < Math.min(pad.buttons.length, 4); b++) {
          const down = pad.buttons[b].pressed;
          if (down && !prev[b]) dropVariants.push(b);
          prev[b] = down;
        }
        if (Math.abs(sx) > dead || Math.abs(sy) > dead || dropVariants.length)
          realInput = true;
      }

      // Keyboard fallback (also additive if a pad is present)
      const k = keysRef.current;
      if (k["arrowleft"] || k["a"]) {
        ax -= 1;
        realInput = true;
      }
      if (k["arrowright"] || k["d"]) {
        ax += 1;
        realInput = true;
      }
      if (k["arrowup"] || k["w"]) {
        ay -= 1;
        realInput = true;
      }
      if (k["arrowdown"] || k["s"]) {
        ay += 1;
        realInput = true;
      }

      // Idle timer / auto-flight
      if (realInput) {
        idleTimerRef.current = 0;
      } else {
        idleTimerRef.current += dt;
      }
      const auto = idleTimerRef.current > IDLE_RESUME || !started;
      if (auto) {
        autoTRef.current += dt;
        const a = autoTRef.current;
        // Gentle wandering lissajous thrust
        ax = Math.cos(a * 0.55) * 0.7;
        ay = Math.sin(a * 0.42 + 1.3) * 0.7;
      }

      // --- Ship physics ------------------------------------------------
      const ship = shipRef.current;
      const mag = Math.hypot(ax, ay);
      if (mag > 1) {
        ax /= mag;
        ay /= mag;
      }
      ship.vx += ax * ACCEL * dt;
      ship.vy += ay * ACCEL * dt;
      // drag
      const drag = Math.exp(-DRAG * dt);
      ship.vx *= drag;
      ship.vy *= drag;
      const spd = Math.hypot(ship.vx, ship.vy);
      if (spd > MAX_SPEED) {
        ship.vx = (ship.vx / spd) * MAX_SPEED;
        ship.vy = (ship.vy / spd) * MAX_SPEED;
      }
      // integrate in pixel space then normalize back
      let px = ship.x * W + ship.vx * dt;
      let py = ship.y * H + ship.vy * dt;
      // soft bounce at edges (never a fail state)
      const m = SHIP_R + 4;
      if (px < m) {
        px = m;
        ship.vx = Math.abs(ship.vx) * 0.6;
      }
      if (px > W - m) {
        px = W - m;
        ship.vx = -Math.abs(ship.vx) * 0.6;
      }
      if (py < m) {
        py = m;
        ship.vy = Math.abs(ship.vy) * 0.6;
      }
      if (py > H - m) {
        py = H - m;
        ship.vy = -Math.abs(ship.vy) * 0.6;
      }
      ship.x = px / W;
      ship.y = py / H;

      // trail
      const trail = trailRef.current;
      trail.push({ x: px, y: py });
      if (trail.length > TRAIL_LEN) trail.shift();

      // --- Percussion drops --------------------------------------------
      percCdRef.current -= dt;
      if (dropVariants.length && percCdRef.current <= 0 && rigRef.current) {
        dropPercussion(rigRef.current, dropVariants[0]);
        percCdRef.current = PERC_COOLDOWN;
      }

      // --- Gate collision / ringing ------------------------------------
      const gates = gatesRef.current;
      const cds = gateCdRef.current;
      for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        g.phase += dt * 1.4;
        g.flash *= Math.exp(-3.2 * dt);
        cds[i] -= dt;
        const gx = g.x * W;
        const gy = g.y * H;
        const dist = Math.hypot(px - gx, py - gy);
        if (dist < GATE_R + SHIP_R && cds[i] <= 0) {
          cds[i] = GATE_COOLDOWN;
          ringGate(i, false);
        }
      }

      // --- Loop-memory sequencer (slow self-playing arpeggio) ----------
      if (started && memoryRef.current.length > 0) {
        seqClockRef.current += dt;
        if (seqClockRef.current >= SEQ_INTERVAL) {
          seqClockRef.current -= SEQ_INTERVAL;
          const mem = memoryRef.current;
          const pos = seqPosRef.current % mem.length;
          const noteIdx = mem[pos];
          seqPosRef.current = (pos + 1) % mem.length;
          // find a matching gate to flash + ring softly
          const gi = gates.findIndex((g) => g.noteIdx === noteIdx);
          if (gi >= 0) ringGate(gi, true);
          else if (rigRef.current)
            strikeBell(rigRef.current, noteIdx, rigRef.current.ctx.currentTime, true);
        }
      }

      // --- Render -------------------------------------------------------
      drawScene(ctx2d, W, H, gates, trail, px, py, ship.vx, ship.vy, auto, t);
    },
    [ringGate, started],
  );

  // Start RAF on mount (auto-demo runs even before audio start)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!canvas.getContext("2d")) {
      setCanvasOk(false);
      return;
    }
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(runFrame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [runFrame]);

  // Keyboard + gamepad connect listeners
  useEffect(() => {
    const checkPads = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      setHasGamepad(Array.from(pads).some((p) => p != null));
    };
    checkPads();

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          " ",
          "w",
          "a",
          "s",
          "d",
        ].includes(key)
      ) {
        e.preventDefault();
      }
      keysRef.current[key] = true;
      // Drums: space + number keys 1-4
      if (rigRef.current && percCdRef.current <= 0) {
        if (key === " ") {
          dropPercussion(rigRef.current, 0);
          percCdRef.current = PERC_COOLDOWN;
        } else if (["1", "2", "3", "4"].includes(key)) {
          dropPercussion(rigRef.current, parseInt(key, 10) - 1);
          percCdRef.current = PERC_COOLDOWN;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    const onConnect = (e: GamepadEvent) => {
      padIndexRef.current = e.gamepad.index;
      setHasGamepad(true);
    };
    const onDisconnect = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const any = Array.from(pads).some((p) => p != null);
      setHasGamepad(any);
      if (!any) padIndexRef.current = null;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      const rig = rigRef.current;
      if (rig) {
        try {
          rig.ctx.close();
        } catch {
          // ignore
        }
        rigRef.current = null;
      }
    };
  }, []);

  const handleStart = useCallback(() => {
    if (!rigRef.current) {
      rigRef.current = makeRig();
    }
    const rig = rigRef.current;
    if (rig && rig.ctx.state === "suspended") {
      void rig.ctx.resume();
    }
    // seed the memory so music starts evolving right away
    if (memoryRef.current.length === 0) {
      memoryRef.current = [0, 2, 4];
    }
    idleTimerRef.current = IDLE_RESUME + 1; // begin in gentle auto-flight
    setStarted(true);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060f] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Glowing starfield with a flying ship and musical gates"
      />

      {/* Top HUD */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center px-4 pt-6 text-center">
        <h1 className="font-serif text-2xl text-white/95 sm:text-3xl">
          Star Pilot
        </h1>
        <p className="mt-1 max-w-md text-base text-white/75">
          Fly through the singing gates. Weave a melody in the stars.
        </p>

        {!canvasOk && (
          <p className="mt-3 text-base text-rose-300">
            Your browser can&apos;t open a 2D canvas, so the starfield
            can&apos;t draw.
          </p>
        )}

        {canvasOk && !hasGamepad && (
          <p className="mt-3 text-base text-violet-300">
            Connect a controller, or use the arrow keys (or WASD) to steer.
            Press space or 1–4 for sparkly drums.
          </p>
        )}
        {canvasOk && hasGamepad && (
          <p className="mt-3 text-base text-white/75">
            Controller ready. Push the stick to fly, tap the buttons for drums.
          </p>
        )}
      </div>

      {/* Start gate */}
      {!started && canvasOk && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[64px] rounded-2xl border border-violet-300/40 bg-violet-500/20 px-8 py-3.5 text-xl font-medium text-white shadow-[0_0_40px_rgba(168,85,247,0.45)] backdrop-blur transition hover:bg-violet-500/30"
          >
            ▶ Start flying
          </button>
        </div>
      )}

      {/* Bottom HUD */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-1 px-4 pb-5 text-center">
        {started && (
          <p className="font-mono text-base text-white/55">
            gates rung: {gateHits} · recent notes keep echoing
          </p>
        )}
        <p className="font-mono text-sm text-white/55">
          Read the design notes:
          src/app/dream/636-kids-star-pilot/README.md
        </p>
        <Link
          href="/dream"
          className="pointer-events-auto mt-1 text-sm text-violet-300 underline-offset-4 hover:underline"
        >
          ← back to the dream lab
        </Link>
      </div>
    </main>
  );
}

// --- Rendering (Canvas2D, additive glow) -----------------------------------

// Persistent twinkle starfield seeds (module scope so they're stable).
const STAR_SEEDS: Array<{ x: number; y: number; s: number; tw: number }> = [];
function ensureStars(): void {
  if (STAR_SEEDS.length) return;
  for (let i = 0; i < 140; i++) {
    STAR_SEEDS.push({
      x: Math.random(),
      y: Math.random(),
      s: 0.4 + Math.random() * 1.6,
      tw: Math.random() * Math.PI * 2,
    });
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gates: Gate[],
  trail: TrailPt[],
  sx: number,
  sy: number,
  vx: number,
  vy: number,
  auto: boolean,
  t: number,
): void {
  ensureStars();
  const tm = t / 1000;

  // Space background with a faint nebula gradient
  const bg = ctx.createRadialGradient(
    W * 0.5,
    H * 0.5,
    0,
    W * 0.5,
    H * 0.5,
    Math.max(W, H) * 0.75,
  );
  bg.addColorStop(0, "#0b0a22");
  bg.addColorStop(0.6, "#070718");
  bg.addColorStop(1, "#03030c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Twinkling stars
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const st of STAR_SEEDS) {
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(tm * 1.5 + st.tw));
    ctx.fillStyle = `rgba(200,210,255,${0.25 * tw})`;
    ctx.beginPath();
    ctx.arc(st.x * W, st.y * H, st.s * tw + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Star-gates
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const g of gates) {
    const gx = g.x * W;
    const gy = g.y * H;
    const breathe = 0.5 + 0.5 * Math.sin(g.phase);
    const col = GATE_COLORS[g.colorIdx];
    const r = GATE_R * (1 + g.flash * 0.35);

    // bloom halo
    const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 2.4);
    halo.addColorStop(0, hexA(col, 0.16 + g.flash * 0.4));
    halo.addColorStop(0.5, hexA(col, 0.06 + g.flash * 0.15));
    halo.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(gx, gy, r * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // ring
    ctx.lineWidth = 3 + g.flash * 5;
    ctx.strokeStyle = hexA(col, 0.55 + 0.35 * breathe + g.flash * 0.5);
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.stroke();

    // bright core
    ctx.fillStyle = hexA("#ffffff", 0.18 + g.flash * 0.5);
    ctx.beginPath();
    ctx.arc(gx, gy, 4 + g.flash * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Ship trail (additive)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < trail.length; i++) {
    const p = trail[i];
    const a = (i / trail.length) * 0.5;
    const rad = (i / trail.length) * 9 + 2;
    ctx.fillStyle = `rgba(140,200,255,${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ship glow
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, SHIP_R * 4);
  sg.addColorStop(0, "rgba(255,255,255,0.95)");
  sg.addColorStop(0.3, "rgba(170,210,255,0.6)");
  sg.addColorStop(1, "rgba(120,170,255,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sx, sy, SHIP_R * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ship body — a little comet pointing in travel direction
  const ang = Math.atan2(vy, vx);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(SHIP_R, 0);
  ctx.lineTo(-SHIP_R * 0.7, SHIP_R * 0.7);
  ctx.lineTo(-SHIP_R * 0.3, 0);
  ctx.lineTo(-SHIP_R * 0.7, -SHIP_R * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Subtle "auto-pilot" indicator
  if (auto) {
    ctx.fillStyle = "rgba(196,181,253,0.5)";
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillText("auto-flight", sx, sy - SHIP_R * 3.4);
  }
}

// hex (#rrggbb) + alpha → rgba string
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
