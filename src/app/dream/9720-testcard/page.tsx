"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";

// Seeded RNG so the idle auto-demo is identical every load (alive on a muted
// 06:30 review phone without any interaction).
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

// ── PALETTE (canvas art only) ────────────────────────────────────────────────
const K = "#000000"; // black
const W = "#ffffff"; // white
const R = "#ff2200"; // the one red accent

// ── SPECTRAL CLUSTER (NOT pentatonic) ────────────────────────────────────────
// Just-intonation / undecimal partials spanning ~3 octaves. Includes 11/4 and
// 11/2 (undecimal, microtonal), deliberately austere and non-diatonic.
const RATIOS = [1, 3 / 2, 2, 11 / 4, 3, 15 / 4, 4, 11 / 2, 8] as const;
const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l"] as const;
const N = RATIOS.length;

// Per-partial loudness: lower partials carry more weight.
const LEVELS = RATIOS.map((_, i) => 0.85 / (1 + 0.35 * i));

interface Sim {
  active: boolean[];
  amp: number[]; // lerped visual/audio amplitude 0..1 (frame-exact drive)
  freq: number[]; // current sounding frequency per partial
  fund: number;
  scroll: number;
  cursor: number; // 0..1 sweep position
  strobe: boolean;
  crossed: number; // last trigger-column index the cursor passed
}

// ── AUDIO ────────────────────────────────────────────────────────────────────
interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  osc: OscillatorNode[];
  gain: GainNode[];
  noise: AudioBuffer;
}

function buildAudio(fund: number): AudioGraph | null {
  const AC =
    typeof window !== "undefined"
      ? (window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)
      : undefined;
  if (!AC) return null;
  const ctx = new AC();

  // Safety limiter so a full cluster never clips / spikes.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 12;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  const osc: OscillatorNode[] = [];
  const gain: GainNode[] = [];
  for (let i = 0; i < N; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    // slight per-partial inharmonic detune → slow beating / shimmer
    o.frequency.value = fund * RATIOS[i] * (1 + 0.004 * i);
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(master);
    o.start();
    osc.push(o);
    gain.push(g);
  }

  // Reusable white-noise buffer for glitch clicks.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  return { ctx, master, osc, gain, noise };
}

function fireClick(ag: AudioGraph, hz: number, vel: number) {
  const { ctx, master, noise } = ag;
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = hz;
  bp.Q.value = 6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.12 * vel, now + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(now);
  src.stop(now + 0.08);
}

// ── RENDER (1-bit black / white / red) ───────────────────────────────────────
function drawFrame(
  cx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sim: Sim,
) {
  // Black field.
  cx.fillStyle = K;
  cx.fillRect(0, 0, w, h);

  const step = 3;
  const cols = Math.ceil(w / step);

  // Precompute active partials' spatial periods + duty from live amplitude.
  const periods: number[] = [];
  const duties: number[] = [];
  const on: boolean[] = [];
  for (let i = 0; i < N; i++) {
    const a = sim.amp[i];
    on[i] = a > 0.04;
    // higher freq → tighter barcode (denser)
    periods[i] = Math.max(3, Math.min(90, Math.round(2600 / sim.freq[i])));
    duties[i] = 0.28 + 0.45 * a;
  }

  // XOR interference of partial barcodes → moiré "spectrum made visible".
  cx.fillStyle = W;
  for (let c = 0; c < cols; c++) {
    const worldX = c * step + sim.scroll;
    let parity = 0;
    for (let i = 0; i < N; i++) {
      if (!on[i]) continue;
      const p = periods[i];
      const m = ((worldX % p) + p) % p;
      if (m < duties[i] * p) parity ^= 1;
    }
    if (parity) cx.fillRect(c * step, 0, step, h);
  }

  // CRT scanlines: thin black horizontal lines carve the white field.
  cx.fillStyle = K;
  for (let y = 0; y < h; y += 4) cx.fillRect(0, y, w, 1);

  // Moving horizontal signal band (slow, luminance-stable).
  const bandY = ((sim.scroll * 0.35) % (h + 60)) - 30;
  cx.fillStyle = W;
  cx.fillRect(0, bandY, w, 2);

  // ── Scan cursor: invert a strip, red 1px line on top. ──────────────────────
  const cxPos = sim.cursor * w;
  const stripW = 22;
  const x0 = Math.max(0, cxPos - stripW / 2);
  cx.save();
  cx.globalCompositeOperation = "difference";
  cx.fillStyle = W; // XOR-invert luminance under the strip
  cx.fillRect(x0, 0, stripW, h);
  cx.restore();

  cx.fillStyle = R;
  cx.fillRect(cxPos - 0.5, 0, 1.5, h);

  // Top data rail: red ticks for each active partial + white progress.
  cx.fillStyle = K;
  cx.fillRect(0, 0, w, 10);
  let anyOn = false;
  for (let i = 0; i < N; i++) {
    if (sim.amp[i] > 0.04) {
      anyOn = true;
      cx.fillStyle = R;
      const tx = (i / N) * w + 4;
      cx.fillRect(tx, 3, Math.max(2, sim.amp[i] * (w / N - 8)), 4);
    }
  }
  cx.fillStyle = anyOn ? W : "#333";
  cx.fillRect(cxPos - 1, 0, 2, 10);
}

export default function TestCardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agRef = useRef<AudioGraph | null>(null);
  const rafRef = useRef<number>(0);
  // Idle auto-demo: silently latches a rotating seeded subset of partials so the
  // barcode field breathes on load. Turns off the moment the visitor plays a key.
  const idleRef = useRef(true);
  const demoRngRef = useRef<() => number>(mulberry32(0x9720));
  const simRef = useRef<Sim>({
    active: Array(N).fill(false),
    amp: Array(N).fill(0),
    freq: RATIOS.map((r) => 87.31 * r),
    fund: 87.31,
    scroll: 0,
    cursor: 0,
    strobe: false,
    crossed: -1,
  });

  const [started, setStarted] = useState(false);
  const [audioOk, setAudioOk] = useState(true);
  const [active, setActive] = useState<boolean[]>(Array(N).fill(false));
  const [fund, setFund] = useState(87.31);
  const [strobe, setStrobe] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Keep sim mirror in step with React state (motion loop reads the ref).
  useEffect(() => {
    simRef.current.active = active;
  }, [active]);
  useEffect(() => {
    simRef.current.strobe = strobe;
  }, [strobe]);
  useEffect(() => {
    simRef.current.fund = fund;
    const freq = RATIOS.map((r, i) => fund * r * (1 + 0.004 * i));
    simRef.current.freq = freq;
    const ag = agRef.current;
    if (ag)
      freq.forEach((f, i) =>
        ag.osc[i].frequency.setTargetAtTime(f, ag.ctx.currentTime, 0.05),
      );
  }, [fund]);

  const applyGain = useCallback((i: number, target: number) => {
    const ag = agRef.current;
    if (!ag) return;
    ag.gain[i].gain.setTargetAtTime(
      Math.max(0.0001, target),
      ag.ctx.currentTime,
      0.06,
    );
  }, []);

  const toggle = useCallback(
    (i: number) => {
      idleRef.current = false; // visitor is playing — hand the field to them
      setActive((prev) => {
        const next = [...prev];
        next[i] = !next[i];
        applyGain(i, next[i] ? LEVELS[i] : 0);
        return next;
      });
    },
    [applyGain],
  );

  const silence = useCallback(() => {
    setActive(Array(N).fill(false));
    for (let i = 0; i < N; i++) applyGain(i, 0);
  }, [applyGain]);

  const shiftFund = useCallback((dir: number) => {
    // microtonal 7-EDO step (deliberately non-diatonic)
    setFund((f) => Math.max(40, Math.min(174, f * Math.pow(2, dir / 7))));
  }, []);

  const start = useCallback(() => {
    if (!agRef.current) {
      const ag = buildAudio(simRef.current.fund);
      if (!ag) {
        setAudioOk(false);
        setStarted(true);
        return;
      }
      agRef.current = ag;
    }
    agRef.current.ctx.resume();
    setStarted(true);
  }, []);

  // Physical keyboard bindings a–l.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const i = KEYS.indexOf(e.key.toLowerCase() as (typeof KEYS)[number]);
      if (i >= 0) {
        e.preventDefault();
        if (!started) start();
        toggle(i);
      } else if (e.key === "ArrowUp") {
        shiftFund(1);
      } else if (e.key === "ArrowDown") {
        shiftFund(-1);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [toggle, shiftFund, start, started]);

  // Animation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.getContext("2d");
    if (!cx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let strobeToggle = 0;
    let lastStrobe = 0;
    const reduced = prefersReducedMotion();
    const motion = reduced ? 0.18 : 1; // calm the crawl for reduced-motion
    let demoClock = 0;

    const loop = (t: number) => {
      const sim = simRef.current;

      // Idle auto-demo: rotate a seeded subset of partials ON (visual only — no
      // applyGain, so it stays silent until the visitor actually plays). Gives a
      // muted-phone glance a living barcode field with zero interaction.
      if (idleRef.current) {
        demoClock += 1;
        const period = reduced ? 260 : 150;
        if (demoClock % period === 0) {
          const rng = demoRngRef.current;
          const next = Array(N).fill(false);
          const count = 2 + Math.floor(rng() * 3); // 2–4 partials sounding
          for (let k = 0; k < count; k++) next[Math.floor(rng() * N)] = true;
          sim.active = next;
        }
      }

      // Amplitude envelope (visual + drives audio implicitly on toggle).
      for (let i = 0; i < N; i++) {
        const target = sim.active[i] ? LEVELS[i] : 0;
        sim.amp[i] += (target - sim.amp[i]) * 0.12;
      }

      // Scrolling barcode (spatial motion, no luminance flicker).
      sim.scroll += 0.6 * motion;

      // Scan cursor: one sweep ≈ 2.6s.
      sim.cursor = (sim.cursor + motion / (2.6 * 60)) % 1;

      // Glitch clicks at 4 trigger columns, synced to the cursor.
      const anyOn = sim.amp.some((a) => a > 0.05);
      const seg = Math.floor(sim.cursor * 4);
      if (seg !== sim.crossed) {
        sim.crossed = seg;
        if (anyOn && agRef.current) {
          const idx = sim.amp.findIndex((a) => a > 0.05);
          fireClick(
            agRef.current,
            sim.freq[Math.max(0, idx)] * 4,
            0.6 + 0.4 * Math.random(),
          );
        }
      }

      drawFrame(cx, w, h, sim);

      // Optional slow strobe (opt-in, gated ≤3 Hz).
      if (sim.strobe && anyOn) {
        if (t - lastStrobe > 340) {
          lastStrobe = t;
          strobeToggle ^= 1;
        }
        if (strobeToggle) {
          cx.fillStyle = W;
          cx.globalCompositeOperation = "difference";
          cx.fillRect(0, 0, w, h);
          cx.globalCompositeOperation = "source-over";
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Cleanup audio on unmount.
  useEffect(() => {
    return () => {
      const ag = agRef.current;
      if (ag) {
        ag.osc.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
        });
        ag.ctx.close();
        agRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      {/* Canvas field */}
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ background: K }}
        />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/70 backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream Lab · 9720
            </p>
            <h1 className="max-w-xl px-6 text-center text-4xl font-semibold tracking-tight text-foreground">
              TEST&nbsp;CARD
            </h1>
            <p className="max-w-md px-6 text-center text-base text-muted-foreground">
              Play a spectral cluster and watch it render, frame-exact, as a
              1-bit black-white-red data test pattern.
            </p>
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
            {!audioOk && (
              <p className="text-sm text-destructive">
                Web Audio unavailable — visuals only.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Chrome */}
      <div className="border-t border-border bg-background/95 px-4 py-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Spectral cluster · fund {fund.toFixed(1)} Hz
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => shiftFund(-1)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                fund −
              </button>
              <button
                onClick={() => shiftFund(1)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                fund +
              </button>
              <button
                onClick={silence}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Silence
              </button>
            </div>
          </div>

          {/* Keyboard */}
          <div className="grid grid-cols-9 gap-1.5">
            {KEYS.map((k, i) => (
              <button
                key={k}
                onClick={() => {
                  if (!started) start();
                  toggle(i);
                }}
                className={`min-h-[44px] rounded-md border text-sm font-medium transition-colors ${
                  active[i]
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span className="font-mono text-xs uppercase">{k}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={strobe}
                onChange={(e) => setStrobe(e.target.checked)}
                className="h-4 w-4 accent-[color:var(--destructive)]"
              />
              slow invert-strobe (≤3 Hz, off by default)
              {strobe && (
                <button
                  onClick={() => setStrobe(false)}
                  className="rounded-md border border-destructive px-2 text-xs text-destructive"
                >
                  kill
                </button>
              )}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowNotes(true)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:underline"
              >
                Design notes
              </button>
              <Link
                href="/dream"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:underline"
              >
                ← gallery
              </Link>
            </div>
          </div>
        </div>
      </div>

      <PrototypeNav slugs={["9720-testcard"]} />

      {/* Notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Test Card — design notes
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Playing a chord renders as a stark 1-bit data test pattern, after
              Ryoji Ikeda&apos;s <em>test pattern</em> (2008–) and{" "}
              <em>data-verse</em>: audio signal converted in real time into
              black-and-white barcode / scanline imagery with red as the sole
              accent.
            </p>
            <ul className="mt-4 space-y-2 text-base text-muted-foreground">
              <li>
                • Nine stacked sine partials form a microtonal just-intonation
                cluster (undecimal 11/4, 11/2 — not pentatonic). Keys a–l toggle
                partials; ↑/↓ shift the fundamental by a 7-EDO step.
              </li>
              <li>
                • Each frame the barcode columns are an XOR interference of every
                sounding partial: higher frequency → denser bars, louder → wider
                bars. Silence empties the field.
              </li>
              <li>
                • A red scan cursor sweeps (~2.6 s), inverting a strip and firing
                filtered-noise glitch clicks at grid crossings.
              </li>
              <li>
                • Palette is pure #000 / #fff / one #ff2200. Motion is slow
                scrolling and a moving cursor — no fast full-field flicker.
              </li>
            </ul>
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              state: data-sublime · pole: intense
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
