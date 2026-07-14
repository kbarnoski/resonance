"use client";

import { useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { BytebeatEngine } from "./engine";
import {
  FORMULAS,
  T_RATE_MAX,
  T_RATE_MIN,
  T_RATE_STEP,
  T_RATE_DEFAULT,
} from "./formulas";

/**
 * 1664 · bytemill — a bytebeat glitch machine you PLAY.
 *
 * Raw 8-bit "bytebeat" audio is synthesised directly from a single integer
 * formula of a running sample counter `t` (e.g. `t*((t>>12|t>>8)&63&t>>4)`).
 * The visitor switches among a curated formula library, bends the t-rate
 * (tempo/pitch) and live-substitutes an arithmetic constant `k` into the
 * expression — mutating the sound with the keyboard. A deterministic ghost
 * performance plays it unattended until a real key takes over.
 *
 * Synthesis runs in an AudioWorklet loaded from an inline Blob URL (see
 * engine.ts). Visuals are a CRT oscilloscope of the live waveform plus a
 * scrolling bitfield of the low byte's 8 bits — you literally see the bit
 * patterns that make the rhythm.
 */

type Live = {
  formulaIndex: number;
  kValues: number[];
  tRate: number;
  playing: boolean;
  human: boolean;
  ghostStart: number;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function renderFormula(expr: string) {
  return expr.split(/(k)/g).map((part, i) =>
    part === "k" ? (
      <span key={i} className="font-bold text-primary">
        k
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function BytemillPage() {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [isHuman, setIsHuman] = useState(false);
  const [formulaIndex, setFormulaIndex] = useState(0);
  const [unsupported, setUnsupported] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const kRef = useRef<HTMLSpanElement | null>(null);
  const rateRef = useRef<HTMLSpanElement | null>(null);

  const bytesRef = useRef<Uint8Array>(new Uint8Array(1024));
  const cleanupRef = useRef<() => void>(() => {});
  const controlsRef = useRef<{
    selectFormula: (i: number) => void;
    bendRate: (dir: number) => void;
    bendK: (dir: number) => void;
    togglePlay: () => void;
  } | null>(null);

  useEffect(() => () => cleanupRef.current(), []);

  const startAudio = async () => {
    if (started) return;
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) {
      setUnsupported(true);
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AudioCtor();
    } catch {
      setUnsupported(true);
      return;
    }
    // AudioWorklet availability is verified implicitly: engine.init() below
    // calls audioWorklet.addModule and is wrapped in try/catch, which surfaces
    // the unsupported notice on any browser that lacks it.

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const L: Live = {
      formulaIndex: 0,
      kValues: FORMULAS.map((f) => f.kDefault),
      tRate: T_RATE_DEFAULT,
      playing: true,
      human: false,
      ghostStart: 0,
    };

    const onBytes = (bytes: Uint8Array) => {
      bytesRef.current = bytes;
    };

    const engine = new BytebeatEngine(ctx, onBytes);
    try {
      await engine.init();
      await ctx.resume();
    } catch {
      setUnsupported(true);
      engine.dispose();
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
      return;
    }

    L.ghostStart = ctx.currentTime;

    const updateReadouts = () => {
      if (kRef.current)
        kRef.current.textContent = String(L.kValues[L.formulaIndex]);
      if (rateRef.current) rateRef.current.textContent = L.tRate.toFixed(0);
    };

    const pushFormula = () => {
      const f = FORMULAS[L.formulaIndex];
      engine.setFormula(f.expr);
      engine.setK(L.kValues[L.formulaIndex]);
      setFormulaIndex(L.formulaIndex);
      updateReadouts();
    };

    const takeOver = () => {
      if (!L.human) {
        L.human = true;
        setIsHuman(true);
      }
    };

    // ---- controls (shared by keyboard + on-screen buttons) --------------
    const selectFormula = (i: number) => {
      if (i < 0 || i >= FORMULAS.length) return;
      takeOver();
      L.formulaIndex = i;
      pushFormula();
    };
    const bendRate = (dir: number) => {
      takeOver();
      L.tRate = clamp(L.tRate + dir * T_RATE_STEP, T_RATE_MIN, T_RATE_MAX);
      engine.setTRate(L.tRate);
      updateReadouts();
    };
    const bendK = (dir: number) => {
      takeOver();
      const f = FORMULAS[L.formulaIndex];
      L.kValues[L.formulaIndex] = clamp(
        L.kValues[L.formulaIndex] + dir,
        f.kMin,
        f.kMax
      );
      engine.setK(L.kValues[L.formulaIndex]);
      updateReadouts();
    };
    const togglePlay = () => {
      takeOver();
      L.playing = !L.playing;
      setPlaying(L.playing);
      if (L.playing) {
        ctx.resume().catch(() => {});
      } else {
        ctx.suspend().catch(() => {});
      }
    };
    controlsRef.current = { selectFormula, bendRate, bendK, togglePlay };

    // ---- keyboard --------------------------------------------------------
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat && e.code === "Space") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key >= "1" && e.key <= "8") {
        selectFormula(Number(e.key) - 1);
        return;
      }
      switch (e.key) {
        case "ArrowRight":
        case "]":
          e.preventDefault();
          bendRate(1);
          break;
        case "ArrowLeft":
        case "[":
          e.preventDefault();
          bendRate(-1);
          break;
        case "ArrowUp":
        case "=":
        case "+":
          e.preventDefault();
          bendK(1);
          break;
        case "ArrowDown":
        case "-":
        case "_":
          e.preventDefault();
          bendK(-1);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // ---- ghost performance (deterministic) -------------------------------
    const runGhost = () => {
      if (L.human || !L.playing || ctx.state !== "running") return;
      const now = ctx.currentTime - L.ghostStart;
      const fi = Math.floor(now / 5.5) % FORMULAS.length;
      if (fi !== L.formulaIndex) {
        L.formulaIndex = fi;
        pushFormula();
      }
      const f = FORMULAS[fi];
      const mid = (f.kMin + f.kMax) / 2;
      const amp = (f.kMax - f.kMin) / 2;
      const kv = clamp(Math.round(mid + amp * Math.sin(now * 0.6)), f.kMin, f.kMax);
      if (kv !== L.kValues[fi]) {
        L.kValues[fi] = kv;
        engine.setK(kv);
      }
      const tr = clamp(
        Math.round(9000 + 4500 * Math.sin(now * 0.22)),
        T_RATE_MIN,
        T_RATE_MAX
      );
      if (tr !== L.tRate) {
        L.tRate = tr;
        engine.setTRate(tr);
      }
      updateReadouts();
    };

    // ---- visuals ---------------------------------------------------------
    const canvas = canvasRef.current!;
    const g = canvas.getContext("2d")!;
    const bitCols = 512;
    const bitRows = 8;
    const bitSmall = document.createElement("canvas");
    bitSmall.width = bitCols;
    bitSmall.height = bitRows;
    const bg = bitSmall.getContext("2d")!;
    const bitImage = bg.createImageData(bitCols, bitRows);

    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = Math.max(1, Math.floor(rect.width));
      cssH = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let frameCount = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      runGhost();

      frameCount++;
      // Reduced-motion: render less often and drop glow/scanlines.
      if (reduced && frameCount % 3 !== 0) return;

      const W = cssW;
      const H = cssH;
      const scopeH = Math.floor(H * 0.52);
      const bitTop = scopeH + 6;
      const bitH = H - bitTop;
      const bytes = bytesRef.current;
      const N = bytes.length;

      // CRT persistence fade instead of hard clear.
      g.globalAlpha = 1;
      g.fillStyle = reduced ? "#05070a" : "rgba(5, 8, 10, 0.32)";
      g.fillRect(0, 0, W, H);
      if (reduced) {
        g.fillStyle = "#05070a";
        g.fillRect(0, 0, W, H);
      }

      // ---- oscilloscope --------------------------------------------------
      const margin = 10;
      const usableH = scopeH - margin * 2;
      g.lineWidth = 1.6;
      g.strokeStyle = "#39ff9a";
      if (!reduced) {
        g.shadowBlur = 8;
        g.shadowColor = "rgba(57, 255, 154, 0.7)";
      }
      g.beginPath();
      for (let x = 0; x <= W; x++) {
        const idx = Math.min(N - 1, Math.floor((x / W) * (N - 1)));
        const v = bytes[idx] / 255;
        const y = margin + (1 - v) * usableH;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.shadowBlur = 0;

      // baseline
      g.strokeStyle = "rgba(57, 255, 154, 0.18)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, margin + usableH / 2);
      g.lineTo(W, margin + usableH / 2);
      g.stroke();

      // ---- scrolling bitfield -------------------------------------------
      const start = N - bitCols;
      const data = bitImage.data;
      for (let c = 0; c < bitCols; c++) {
        const byte = bytes[start + c] | 0;
        for (let b = 0; b < bitRows; b++) {
          const on = (byte >> b) & 1;
          // bit 0 (LSB) at the bottom row.
          const row = bitRows - 1 - b;
          const p = (row * bitCols + c) * 4;
          if (on) {
            data[p] = 40;
            data[p + 1] = 255;
            data[p + 2] = 150;
            data[p + 3] = 255;
          } else {
            data[p] = 6;
            data[p + 1] = 24;
            data[p + 2] = 18;
            data[p + 3] = 255;
          }
        }
      }
      bg.putImageData(bitImage, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(bitSmall, 0, bitTop, W, bitH);
      g.imageSmoothingEnabled = true;

      // ---- CRT scanlines + vignette -------------------------------------
      if (!reduced) {
        g.fillStyle = "rgba(0, 0, 0, 0.16)";
        for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      }
    };
    raf = requestAnimationFrame(draw);

    pushFormula();
    updateReadouts();
    setStarted(true);
    setPlaying(true);

    cleanupRef.current = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      ro.disconnect();
      controlsRef.current = null;
      engine.dispose();
      if (ctx.state !== "closed") ctx.close().catch(() => {});
    };
  };

  const activeFormula = FORMULAS[formulaIndex];

  return (
    <div className="relative flex min-h-[calc(100vh-3rem)] w-full flex-col bg-background px-5 py-8 text-foreground sm:px-8">
      <header className="mx-auto w-full max-w-4xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          1664 · bytemill
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          A bytebeat glitch machine you play
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Pure algorithmic grit: 8-bit audio synthesised straight from one
          integer formula of a running counter. Switch formulas, bend the rate,
          and mutate the constant live from your keyboard.
        </p>
      </header>

      <main className="mx-auto mt-6 flex w-full max-w-4xl flex-1 flex-col gap-5">
        {/* canvas: CRT oscilloscope + scrolling bitfield */}
        <div className="relative w-full overflow-hidden rounded-lg border border-border bg-[#05070a]">
          <canvas
            ref={canvasRef}
            className="block h-[46vh] max-h-[520px] min-h-[280px] w-full"
          />
          {!started ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
              {unsupported ? (
                <p className="max-w-sm px-6 text-center text-base text-destructive">
                  This browser can&apos;t create the audio worklet needed for
                  live bytebeat synthesis. Try a recent Chrome, Firefox, or
                  Safari.
                </p>
              ) : (
                <>
                  <p className="max-w-sm px-6 text-center text-base text-muted-foreground">
                    Sound is loud, harsh and aliased on purpose. It starts
                    playing itself — press keys any time to take over.
                  </p>
                  <button
                    onClick={startAudio}
                    className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Play
                  </button>
                </>
              )}
            </div>
          ) : null}
          {/* live status badge */}
          {started ? (
            <div className="pointer-events-none absolute right-3 top-3 font-mono text-[11px] uppercase tracking-[0.18em]">
              <span
                className={isHuman ? "text-primary" : "text-muted-foreground/70"}
              >
                {isHuman ? "you have it" : "ghost playing"}
              </span>
            </div>
          ) : null}
        </div>

        {/* current formula readout */}
        <section className="rounded-lg border border-border bg-background/60 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              formula {formulaIndex + 1} · {activeFormula.name}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              t-rate <span ref={rateRef}>{T_RATE_DEFAULT}</span> Hz
            </p>
          </div>
          <pre className="mt-2 overflow-x-auto font-mono text-base leading-relaxed text-foreground sm:text-lg">
            <code>({renderFormula(activeFormula.expr)}) &amp; 255</code>
          </pre>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            <span className="font-bold text-primary">k</span> ={" "}
            <span ref={kRef} className="text-foreground">
              {activeFormula.kDefault}
            </span>{" "}
            · {activeFormula.kHint}{" "}
            <span className="text-muted-foreground/60">
              (range {activeFormula.kMin}–{activeFormula.kMax})
            </span>
          </p>
        </section>

        {/* controls */}
        <section className="flex flex-col gap-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            keys
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FORMULAS.map((f, i) => (
              <button
                key={f.name}
                onClick={() => controlsRef.current?.selectFormula(i)}
                disabled={!started}
                className={`min-h-[44px] rounded-md border px-3 text-sm transition-colors disabled:opacity-40 ${
                  i === formulaIndex
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title={f.name}
              >
                <span className="font-mono">{i + 1}</span>{" "}
                <span className="hidden sm:inline">{f.name}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              t-rate
            </span>
            <button
              onClick={() => controlsRef.current?.bendRate(-1)}
              disabled={!started}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              title="Slower / lower — arrow left or ["
            >
              [ slower
            </button>
            <button
              onClick={() => controlsRef.current?.bendRate(1)}
              disabled={!started}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              title="Faster / higher — arrow right or ]"
            >
              faster ]
            </button>

            <span className="ml-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              constant k
            </span>
            <button
              onClick={() => controlsRef.current?.bendK(-1)}
              disabled={!started}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              title="Decrease k — minus"
            >
              − k
            </button>
            <button
              onClick={() => controlsRef.current?.bendK(1)}
              disabled={!started}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              title="Increase k — equals"
            >
              + k
            </button>

            <button
              onClick={() => controlsRef.current?.togglePlay()}
              disabled={!started}
              className="ml-2 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              title="Play / pause — spacebar"
            >
              {playing ? "❚❚ pause" : "▶ play"}
            </button>
          </div>

          <p className="font-mono text-xs leading-relaxed text-muted-foreground/70">
            1–8 pick a formula · ←/→ or [ ] bend t-rate · ↑/↓ or −/= mutate
            <span className="font-bold text-primary"> k</span> · space play/pause
          </p>
        </section>
      </main>

      <PrototypeNav slugs={["1664-bytemill"]} />
    </div>
  );
}
