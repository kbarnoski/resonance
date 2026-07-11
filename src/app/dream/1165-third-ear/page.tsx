"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ThirdEarEngine,
  type EngineState,
  type PhaseName,
} from "./audio";

// ── frequency axis for the little diagram (log scale) ────────────────────────
const AXIS_LO = 100;
const AXIS_HI = 3200;
const logLo = Math.log(AXIS_LO);
const logHi = Math.log(AXIS_HI);

function freqToUnit(hz: number): number {
  if (hz <= 0) return 0;
  const u = (Math.log(hz) - logLo) / (logHi - logLo);
  return Math.max(0, Math.min(1, u));
}

const PHASE_LABEL: Record<PhaseName, string> = {
  statement: "statement",
  variation: "variation",
  rest: "rest",
  return: "return",
};

type UiPhase = "idle" | "running" | "unsupported";

export default function ThirdEarPage() {
  const [uiPhase, setUiPhase] = useState<UiPhase>("idle");
  const [carrier, setCarrier] = useState(0.45);
  const [phantom, setPhantom] = useState(true);
  const [readout, setReadout] = useState<EngineState | null>(null);

  const engineRef = useRef<ThirdEarEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastUiRef = useRef(0);

  // graceful degradation — decide support on mount (client only)
  useEffect(() => {
    if (!ThirdEarEngine.isSupported()) setUiPhase("unsupported");
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    engineRef.current?.stop();
    engineRef.current = null;
  }, []);

  // full teardown on unmount
  useEffect(() => teardown, [teardown]);

  // ── render loop for the instructional diagram ──────────────────────────────
  const drawFrame = useCallback((tSec: number) => {
    const canvas = canvasRef.current;
    const eng = engineRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 340;
    const cssH = canvas.clientHeight || 280;
    if (canvas.width !== Math.round(cssW * dpr)) canvas.width = Math.round(cssW * dpr);
    if (canvas.height !== Math.round(cssH * dpr)) canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssW, cssH);

    const st = eng?.getState() ?? null;
    if (st) {
      const nowMs = performance.now();
      if (nowMs - lastUiRef.current > 120) {
        lastUiRef.current = nowMs;
        setReadout(st);
      }
    }

    const padT = 22;
    const padB = 24;
    const axisX = cssW - 46;
    const trackTop = padT;
    const trackH = cssH - padT - padB;
    const yFor = (hz: number) => trackTop + (1 - freqToUnit(hz)) * trackH;

    // breathing calm anchor
    const breathe = 0.5 + 0.5 * Math.sin(tSec * 0.7);
    const cx = axisX * 0.42;
    const cy = trackTop + trackH * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 46 + breathe * 10, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + breathe * 0.05})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // frequency axis
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(axisX, trackTop);
    ctx.lineTo(axisX, trackTop + trackH);
    ctx.stroke();
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (const hz of [200, 500, 1000, 2000, 3000]) {
      const y = yFor(hz);
      ctx.fillText(`${hz}`, axisX + 6, y + 3);
      ctx.beginPath();
      ctx.moveTo(axisX - 3, y);
      ctx.lineTo(axisX, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("Hz", axisX + 6, trackTop - 8);

    if (st && st.running && st.f1 > 0) {
      const y1 = yFor(st.f1);
      const y2 = yFor(st.f2);
      const yd = yFor(st.delta);
      const px = cx;

      // bracket linking the two primaries (this gap = the music)
      ctx.strokeStyle = "rgba(125,211,252,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 40, y1);
      ctx.lineTo(px + 52, y1);
      ctx.lineTo(px + 52, y2);
      ctx.lineTo(px + 40, y2);
      ctx.stroke();
      ctx.fillStyle = "rgba(125,211,252,0.75)";
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Δ ${Math.round(st.delta)}`, px + 56, (y1 + y2) / 2 + 3);

      // the two PLAYED primaries (solid, cyan)
      for (const [y, label] of [
        [y2, "f₂ played"],
        [y1, "f₁ played"],
      ] as const) {
        ctx.beginPath();
        ctx.arc(px, y, phantom || label === "f₁ played" ? 6 : 3, 0, Math.PI * 2);
        ctx.fillStyle =
          !phantom && label === "f₂ played"
            ? "rgba(125,211,252,0.2)"
            : "rgba(125,211,252,0.95)";
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(label, px - 12, y + 4);
      }

      // the PHANTOM difference tone (violet, hollow, pulsing) — never played
      const pulse = 0.6 + 0.4 * Math.sin(tSec * 3.0);
      ctx.beginPath();
      ctx.arc(px, yd, 7 + pulse * 3, 0, Math.PI * 2);
      ctx.strokeStyle = phantom
        ? `rgba(196,181,253,${0.5 + pulse * 0.45})`
        : "rgba(196,181,253,0.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // dashed leader from mid-pair down to the phantom
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = "rgba(196,181,253,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, (y1 + y2) / 2);
      ctx.lineTo(px, yd);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = phantom ? "rgba(196,181,253,0.95)" : "rgba(196,181,253,0.4)";
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(phantom ? "phantom" : "(silent)", px - 14, yd + 4);
    }

    rafRef.current = requestAnimationFrame((ts) => drawFrame(ts / 1000));
  }, [phantom]);

  // keep the diagram alive in idle + running (idle shows the calm anchor)
  useEffect(() => {
    if (uiPhase === "unsupported") return;
    rafRef.current = requestAnimationFrame((ts) => drawFrame(ts / 1000));
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [uiPhase, drawFrame]);

  const handleBegin = useCallback(() => {
    if (engineRef.current) return;
    try {
      const eng = new ThirdEarEngine();
      eng.start();
      eng.setCarrier(carrier);
      eng.setPhantom(phantom);
      engineRef.current = eng;
      setUiPhase("running");
    } catch {
      setUiPhase("unsupported");
    }
  }, [carrier, phantom]);

  const handleStop = useCallback(() => {
    teardown();
    setReadout(null);
    setUiPhase("idle");
  }, [teardown]);

  const handleCarrier = (v: number) => {
    setCarrier(v);
    engineRef.current?.setCarrier(v);
  };

  const handlePhantom = () => {
    const next = !phantom;
    setPhantom(next);
    engineRef.current?.setPhantom(next);
  };

  const running = uiPhase === "running";
  const carrierHz = readout?.carrierHz ?? 1200 + (2700 - 1200) * carrier;

  return (
    <main className="min-h-dvh w-full bg-[#050507] text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            dream · 1165
          </p>
          <h1 className="font-semibold text-3xl text-foreground sm:text-4xl">
            The Third Ear
          </h1>
          <p className="text-base text-foreground">
            What if the instrument were inside your own ear? The melody you hear
            is one your cochlea makes — a phantom{" "}
            <span className="text-violet-300">difference tone</span> that no
            speaker ever plays.
          </p>
        </header>

        {uiPhase === "unsupported" ? (
          <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-4">
            <p className="text-base text-violet-200">
              Web Audio isn&rsquo;t available in this browser, so this piece
              can&rsquo;t make sound. Try a recent Chrome, Safari, or Firefox.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-muted p-4">
              <p className="text-base font-medium text-foreground">
                🎧 Put on headphones. Close your eyes. Listen for the low tune.
              </p>
              <p className="mt-1.5 text-base text-muted-foreground">
                Two high tones sound together; only their{" "}
                <span className="text-violet-300">gap</span> carries the melody —
                and that gap is generated inside <em>you</em>, not the speakers.
              </p>
            </div>

            {/* instructional diagram */}
            <div className="rounded-xl border border-border bg-black/40 p-3">
              <canvas
                ref={canvasRef}
                className="h-[280px] w-full"
                aria-label="Diagram: two played primary tones (high) and a phantom difference tone (low)."
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
                <span>
                  <span className="text-violet-300">● f₁, f₂</span> played ·{" "}
                  <span className="text-violet-300">◯ phantom</span> = in your ear
                </span>
                {running && readout && (
                  <span className="text-muted-foreground">
                    phase: {PHASE_LABEL[readout.phase]}
                  </span>
                )}
              </div>
            </div>

            {/* transport */}
            {!running ? (
              <button
                type="button"
                onClick={handleBegin}
                className="min-h-[44px] w-full rounded-xl bg-violet-500/25 px-4 py-3 text-lg font-medium text-violet-100 transition-colors hover:bg-violet-500/35"
              >
                Begin
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="min-h-[44px] w-full rounded-xl border border-border bg-muted px-4 py-3 text-lg font-medium text-foreground transition-colors hover:bg-accent"
              >
                Stop
              </button>
            )}

            {/* live expressive control */}
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <label htmlFor="carrier" className="text-base text-foreground">
                  Carrier height
                </label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {Math.round(carrierHz)} Hz
                </span>
              </div>
              <input
                id="carrier"
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={carrier}
                onChange={(e) => handleCarrier(Number(e.target.value))}
                className="h-11 w-full cursor-pointer accent-violet-400"
              />
              <p className="text-sm text-muted-foreground">
                Sweep it: the played pitch climbs, but the phantom melody stays
                put. Find the height where your ear-tone rings loudest.
              </p>
            </div>

            {/* A/B proof toggle */}
            <button
              type="button"
              onClick={handlePhantom}
              disabled={!running}
              className={`min-h-[44px] w-full rounded-xl border px-4 py-2.5 text-base font-medium transition-colors disabled:opacity-40 ${
                phantom
                  ? "border-violet-400/30 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                  : "border-border bg-muted text-foreground hover:bg-accent"
              }`}
            >
              {phantom
                ? "Both tones on — mute one to prove the melody vanishes"
                : "One tone muted — the phantom is gone. Turn both back on"}
            </button>

            <p className="text-sm text-muted-foreground">
              Best with headphones. Start at low volume and raise gently — these
              are sustained tones. Stop any time.
            </p>
          </>
        )}

        <footer className="mt-auto border-t border-border pt-4 text-xs text-muted-foreground">
          After Tartini&rsquo;s <em>il terzo suono</em> (1714) and Maryanne
          Amacher&rsquo;s <em>Making the Third Ear</em> (1999). The composition
          lives in the difference tone.
        </footer>
      </div>
    </main>
  );
}
