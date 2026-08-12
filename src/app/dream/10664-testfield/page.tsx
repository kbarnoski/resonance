"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10664 · test•field — drag a scan-head across a wall of pure data and HEAR its
// bit-structure.
//
//   ONE QUESTION
//   What if you could physically drag a scan-head across a wall of pure data and
//   HEAR its bit-structure — a hyper-precise, dissociative datamatics field where
//   the threshold between signal and perception dissolves?
//
//   A seeded generative source is Floyd–Steinberg dithered into a 128×64 field of
//   1-bit black/white cells (barcode bands + data lines — a datamatics wall, not
//   TV static). You DRAG a vertical scan column across it; the column reads every
//   lit bit it covers and sonifies it — bit row → log-spaced sine partial
//   (~120 Hz–8 kHz), with a filtered-noise CLICK on each leading edge. Sparse,
//   crisp, sine-and-click. Release and an auto-scan sweeps left→right forever, so
//   the muted / no-input state still performs. Bit-depth (1/2/4) coarsens or
//   refines the grain.
//
//   OUTPUT is pure SVG-DOM: static white rects for the lit bits (run-length
//   merged, built once per field), one translucent red scan column, and a pool of
//   hot red cells for the bits currently under the head. No canvas, no WebGL.
//
//   FLICKER-SAFE: the "fast data" is expressed spatially (dense static grid + a
//   smoothly moving column). Individual cells never strobe; there is no
//   full-frame luminance flash.
//
//   PALETTE: Ikeda 1-bit — pure black ground, white bits, a single red accent.
//
//   REF  Ryoji Ikeda — *test pattern* (2008–) and *datamatics* (2006–), most
//   recently *data.gram* (2026): data → 1-bit barcode/binary fields at variable
//   bit-depth, sonified as sine-and-click at the threshold of perception.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { generateField, type BitField } from "./field";

const COLS = 128;
const ROWS = 64;
const MAX_HOT = ROWS; // scan column can light at most one cell per row
const MAX_PARTIALS = 7; // keep the sonification sparse / crisp

type Phase = "muted" | "audio" | "failed";

// Log-spaced frequency for a bit row (row 0 = top = high, row ROWS-1 = low).
function rowToFreq(row: number): number {
  const lo = 120;
  const hi = 8000;
  const t = 1 - row / (ROWS - 1); // top rows → high
  return lo * Math.pow(hi / lo, t);
}

export default function TestField() {
  const [field, setField] = useState<BitField>(() =>
    generateField(0, 4, COLS, ROWS),
  );
  const [depth, setDepth] = useState(4);
  const [counter, setCounter] = useState(0);
  const [phase, setPhase] = useState<Phase>("muted");
  const [dragging, setDragging] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({ col: 0, bits: 0 });

  // DOM / audio refs — never React state inside the rAF loop.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const staticGroupRef = useRef<SVGGElement | null>(null);
  const hotGroupRef = useRef<SVGGElement | null>(null);
  const scanRectRef = useRef<SVGRectElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const noiseBufRef = useRef<AudioBuffer | null>(null);

  const rafRef = useRef(0);
  const autoXRef = useRef(0); // auto-scan position in columns (float)
  const pointerColRef = useRef<number | null>(null); // null = not dragging
  const draggingRef = useRef(false);
  const lastReadColRef = useRef(-1);
  const fieldRef = useRef<BitField>(field);
  fieldRef.current = field;

  // ── Build the static 1-bit field into the SVG once per field ───────────────
  useEffect(() => {
    const g = staticGroupRef.current;
    if (!g) return;
    const { bits, cols, rows } = field;
    // Run-length merge lit cells per row → far fewer nodes, crisp barcode look.
    let s = "";
    for (let y = 0; y < rows; y++) {
      let x = 0;
      while (x < cols) {
        if (bits[y * cols + x] === 1) {
          const start = x;
          while (x < cols && bits[y * cols + x] === 1) x++;
          s += `<rect x="${start}" y="${y}" width="${x - start}" height="1" fill="#ffffff"/>`;
        } else {
          x++;
        }
      }
    }
    g.innerHTML = s;
  }, [field]);

  // ── The animation loop — always running (self-performs while muted) ────────
  useEffect(() => {
    const hotPool: SVGRectElement[] = [];
    const hg = hotGroupRef.current;
    if (hg) {
      for (let i = 0; i < MAX_HOT; i++) {
        const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        r.setAttribute("width", "1");
        r.setAttribute("height", "1");
        r.setAttribute("fill", "#ff2200");
        r.setAttribute("opacity", "0");
        hg.appendChild(r);
        hotPool.push(r);
      }
    }

    let last = performance.now();
    let readoutAcc = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Resolve scan position (columns). Pointer wins while dragging; else auto.
      let colF: number;
      if (draggingRef.current && pointerColRef.current !== null) {
        colF = pointerColRef.current;
        autoXRef.current = colF; // keep auto in sync so release is seamless
      } else {
        autoXRef.current += dt * (COLS / 8); // full sweep ≈ 8 s
        if (autoXRef.current >= COLS) autoXRef.current -= COLS;
        colF = autoXRef.current;
      }

      const scan = scanRectRef.current;
      if (scan) scan.setAttribute("x", (colF - 0.6).toFixed(3));

      const k = Math.floor(colF);
      const f = fieldRef.current;
      const kClamped = Math.max(0, Math.min(COLS - 1, k));

      // Light the hot cells + sonify only when the integer column changes.
      if (kClamped !== lastReadColRef.current) {
        lastReadColRef.current = kClamped;
        const litRows: number[] = [];
        for (let y = 0; y < ROWS; y++) {
          if (f.bits[y * COLS + kClamped] === 1) litRows.push(y);
        }
        // paint hot pool
        for (let i = 0; i < hotPool.length; i++) {
          if (i < litRows.length) {
            hotPool[i].setAttribute("x", String(kClamped));
            hotPool[i].setAttribute("y", String(litRows[i]));
            hotPool[i].setAttribute("opacity", "0.95");
          } else {
            hotPool[i].setAttribute("opacity", "0");
          }
        }
        sonifyColumn(litRows);
        readoutAcc = 1;
      }

      // Throttled React readout (never every frame).
      if (readoutAcc > 0) {
        readoutAcc = 0;
        const count = (() => {
          let n = 0;
          for (let y = 0; y < ROWS; y++)
            if (f.bits[y * COLS + kClamped] === 1) n++;
          return n;
        })();
        setReadout({ col: kClamped, bits: count });
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (hg) hg.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Audio: sonify one column's lit bits (sine partials + edge click) ───────
  const sonifyColumn = useCallback((litRows: number[]) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;

    // Leading-edge click — a short filtered noise burst.
    const nb = noiseBufRef.current;
    if (nb) {
      const src = ctx.createBufferSource();
      src.buffer = nb;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 1.2;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t0);
      cg.gain.exponentialRampToValueAtTime(0.09, t0 + 0.002);
      cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
      src.connect(bp).connect(cg).connect(master.input);
      src.start(t0);
      src.stop(t0 + 0.04);
    }

    if (litRows.length === 0) return;
    // Sample evenly to stay sparse & crisp — never a wall of sound.
    const step = Math.max(1, Math.ceil(litRows.length / MAX_PARTIALS));
    const chosen: number[] = [];
    for (let i = 0; i < litRows.length && chosen.length < MAX_PARTIALS; i += step)
      chosen.push(litRows[i]);

    const peak = 0.13 / Math.sqrt(chosen.length);
    for (const row of chosen) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = rowToFreq(row);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      osc.connect(g).connect(master.input);
      osc.start(t0);
      osc.stop(t0 + 0.08);
    }
  }, []);

  // ── Start audio (only inside this user gesture) ────────────────────────────
  const startAudio = useCallback(() => {
    if (ctxRef.current) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      const master = createSafeMaster(ctx);
      master.setGain(0.55);
      // Pre-render a short white-noise buffer for edge clicks (seeded PRNG).
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      let a = 0x10664 >>> 0;
      for (let i = 0; i < len; i++) {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        ch[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
      }
      noiseBufRef.current = buf;
      ctxRef.current = ctx;
      masterRef.current = master;
      void ctx.resume();
      setPhase("audio");
    } catch {
      setPhase("failed");
    }
  }, []);

  // ── Teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
      masterRef.current = null;
    };
  }, []);

  // ── Pointer → scan column ──────────────────────────────────────────────────
  const colFromEvent = useCallback((clientX: number): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(COLS - 0.001, frac * COLS));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      draggingRef.current = true;
      pointerColRef.current = colFromEvent(e.clientX);
      setDragging(true);
    },
    [colFromEvent],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      pointerColRef.current = colFromEvent(e.clientX);
    },
    [colFromEvent],
  );
  const endDrag = useCallback(() => {
    draggingRef.current = false;
    pointerColRef.current = null;
    setDragging(false);
  }, []);

  // ── Regenerate / bit-depth ─────────────────────────────────────────────────
  const regenerate = useCallback(() => {
    const next = counter + 1;
    setCounter(next);
    setField(generateField(next, depth, COLS, ROWS));
  }, [counter, depth]);

  const setBitDepth = useCallback(
    (d: number) => {
      setDepth(d);
      setField(generateField(counter, d, COLS, ROWS));
    },
    [counter],
  );

  const secondaryBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <div className="relative min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            10664 · test•field
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Drag a scan-head across a wall of data — and hear its bit-structure.
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            A 128×64 field of 1-bit cells, Floyd–Steinberg-dithered from a seeded
            datamatics source. Drag the red column to read the lit bits as
            sine-and-click; release and it scans itself. Hyper-precise,
            dissociative, at the threshold of perception.
          </p>
        </header>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {phase !== "audio" && (
            <button
              type="button"
              onClick={startAudio}
              disabled={phase === "failed"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {phase === "failed" ? "Audio unavailable" : "Start audio"}
            </button>
          )}
          <button type="button" onClick={regenerate} className={secondaryBtn}>
            Regenerate
          </button>
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              bit-depth
            </span>
            {[1, 2, 4].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setBitDepth(d)}
                aria-pressed={depth === d}
                className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                  depth === d
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {d}-bit
              </button>
            ))}
          </div>
        </div>

        {phase === "failed" && (
          <p className="text-sm text-destructive">
            Audio could not start on this device — the field still scans and
            renders silently.
          </p>
        )}

        {/* The datamatics field — pure SVG-DOM */}
        <div className="relative w-full select-none overflow-hidden rounded-lg border border-border">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${COLS} ${ROWS}`}
            preserveAspectRatio="none"
            shapeRendering="crispEdges"
            className="block w-full touch-none"
            style={{ aspectRatio: `${COLS} / ${ROWS}`, cursor: "ew-resize" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          >
            {/* black ground */}
            <rect x="0" y="0" width={COLS} height={ROWS} fill="#000000" />
            {/* static lit bits (built imperatively) */}
            <g ref={staticGroupRef} />
            {/* hot cells under the head (pooled, built imperatively) */}
            <g ref={hotGroupRef} />
            {/* the red scan column */}
            <rect
              ref={scanRectRef}
              x="0"
              y="0"
              width="1.2"
              height={ROWS}
              fill="#ff2200"
              opacity="0.55"
            />
          </svg>

          {/* status badge */}
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
            <span className="rounded border border-border bg-background/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
              {dragging ? "scanning" : "auto — drag to scan"}
            </span>
          </div>
          <div className="pointer-events-none absolute right-3 top-3">
            <span className="rounded border border-border bg-background/80 px-2 py-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground backdrop-blur-sm">
              col {String(readout.col).padStart(3, "0")} · {String(readout.bits).padStart(2, "0")} bits
              {phase === "audio" ? "" : " · muted"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="font-mono text-xs text-muted-foreground">
            bit row → sine partial (top ≈ 8 kHz · bottom ≈ 120 Hz) · leading edge
            → click
          </p>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 text-sm leading-relaxed text-muted-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
              How test•field works
            </h2>
            <p className="mb-3">
              A seeded generative source — vertical barcode column-bands, a few
              hot horizontal data lines, and a deterministic block-noise — is
              Floyd–Steinberg error-diffusion dithered down to a pure 1-bit
              matrix of {COLS}×{ROWS} cells. It reads as <em>data</em>, not TV
              static. Base seed 0x10664; Regenerate reseeds deterministically
              (no <code>Math.random</code>, no clock).
            </p>
            <p className="mb-3">
              The renderer is pure SVG-DOM: lit bits become white rects
              (run-length merged, built once per field), plus one translucent red
              scan column and a pool of hot red cells. No canvas, no WebGL.
            </p>
            <p className="mb-3">
              Drag the scan column across the wall; each time it enters a new
              integer column it reads that column&apos;s lit bits and sonifies
              them — bit row → log-spaced sine partial (~120 Hz–8 kHz, sampled to
              stay sparse) plus a short filtered-noise click on the leading edge.
              Release and an auto-scan sweeps left→right forever, so even muted
              and untouched the piece performs within a second. Bit-depth
              (1/2/4) coarsens the source into blocks before dithering — Ikeda&apos;s
              variable bit-depth.
            </p>
            <p className="mb-3">
              Flicker-safe by construction: the &ldquo;fast data&rdquo; is
              spatial (a dense static grid + a smoothly moving column). Cells
              never strobe; there is no full-frame flash.
            </p>
            <p className="text-xs">
              Reference: Ryoji Ikeda — <em>test pattern</em> (2008–) and{" "}
              <em>datamatics</em> (2006–), most recently <em>data.gram</em>{" "}
              (2026): data converted to 1-bit barcode/binary fields at variable
              bit-depth, sonified as sine-and-click at the threshold of
              perception.
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["10664-testfield"]} />
    </div>
  );
}
