"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  DripEngine,
  RIPPLE_LIFE_MS,
  RIPPLE_LIFE_MS_CALM,
  type Tap,
} from "./engine";
import { makeDripAudio, type DripAudio } from "./audio";

const SEED = 0x8680;

// ── Canvas art palette (raw hex/hsl allowed ONLY inside the Canvas) ──
function colorForFreq(freq: number, alpha: number): string {
  const t = Math.max(
    0,
    Math.min(1, (Math.log(freq) - Math.log(180)) / (Math.log(2600) - Math.log(180))),
  );
  const hue = 196 - t * 30; // teal → cyan
  const light = 54 + t * 30; // higher plink = brighter ring
  return `hsla(${hue}, 78%, ${light}%, ${alpha})`;
}

/** Redraw the whole pool for one frame. Pure canvas work, no React. */
function drawPool(
  c: CanvasRenderingContext2D,
  bg: CanvasGradient,
  w: number,
  h: number,
  engine: DripEngine,
  now: number,
  reduced: boolean,
  selectedId: number | null,
): void {
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);

  const life = reduced ? RIPPLE_LIFE_MS_CALM : RIPPLE_LIFE_MS;
  const maxTravel = Math.max(w, h) * 0.7;

  // ── expanding rings (additive, so overlaps glow where they cross) ──
  c.globalCompositeOperation = "lighter";
  for (const r of engine.ripples) {
    const elapsed = now - r.start;
    if (elapsed < 0) continue;
    const p = elapsed / life;
    if (p >= 1) continue;
    const px = r.x * w;
    const py = r.y * h;
    const radius = p * maxTravel;
    const fade = Math.pow(1 - p, 1.5);

    c.beginPath();
    c.arc(px, py, radius, 0, Math.PI * 2);
    c.strokeStyle = colorForFreq(r.freq, fade * 0.5);
    c.lineWidth = reduced ? 1 : 1.6;
    c.stroke();

    if (!reduced && radius > 6) {
      c.beginPath();
      c.arc(px, py, radius * 0.82, 0, Math.PI * 2);
      c.strokeStyle = colorForFreq(r.freq, fade * 0.18);
      c.lineWidth = 1;
      c.stroke();
    }

    // specular splash at the impact point, brief
    if (elapsed < 240) {
      const s = 1 - elapsed / 240;
      c.beginPath();
      c.arc(px, py, 3 + s * 4, 0, Math.PI * 2);
      c.fillStyle = colorForFreq(r.freq, s * 0.85);
      c.fill();
    }
  }
  c.globalCompositeOperation = "source-over";

  // ── tap markers + readouts ──
  c.font = "11px ui-monospace, monospace";
  c.textAlign = "left";
  c.textBaseline = "middle";
  for (const t of engine.taps) {
    const px = t.x * w;
    const py = t.y * h;
    const sel = t.id === selectedId;

    c.beginPath();
    c.arc(px, py, sel ? 9 : 7, 0, Math.PI * 2);
    c.strokeStyle = sel
      ? "hsla(190, 90%, 78%, 0.95)"
      : "hsla(190, 70%, 66%, 0.55)";
    c.lineWidth = sel ? 2 : 1.4;
    c.stroke();

    c.beginPath();
    c.arc(px, py, 2.2, 0, Math.PI * 2);
    c.fillStyle = "hsla(190, 85%, 82%, 0.9)";
    c.fill();

    const freq = engine.freqOf(t);
    const label = `${Math.round(freq)} Hz · ${engine
      .bubbleMm(t)
      .toFixed(1)} mm · ${(t.periodMs / 1000).toFixed(1)}s`;
    c.fillStyle = sel
      ? "hsla(190, 80%, 86%, 0.92)"
      : "hsla(190, 40%, 74%, 0.55)";
    c.fillText(label, px + 13, py);
  }
}

type Drag = { id: number; startY: number; startNote: number } | null;

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<DripEngine | null>(null);
  const audioRef = useRef<DripAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);
  const bgRef = useRef<CanvasGradient | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef<Drag>(null);
  const selectedRef = useRef<number | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [, setUiTick] = useState(0);

  const bump = useCallback(() => setUiTick((n) => n + 1), []);
  const select = useCallback((id: number | null) => {
    selectedRef.current = id;
    setSelectedId(id);
  }, []);

  // ── size / DPR handling ──
  const applyResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const c = canvas.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizeRef.current = { w, h };
    const g = c.createRadialGradient(
      w * 0.5,
      h * 0.42,
      Math.min(w, h) * 0.05,
      w * 0.5,
      h * 0.55,
      Math.max(w, h) * 0.75,
    );
    g.addColorStop(0, "#0c1a22");
    g.addColorStop(0.55, "#08131a");
    g.addColorStop(1, "#04090d");
    bgRef.current = g;
  }, []);

  // ── the frame loop ──
  const runFrame = useCallback((ts: number) => {
    if (!runningRef.current) return;
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    const c = canvas?.getContext("2d");
    const bg = bgRef.current;
    if (engine && c && bg) {
      const reduced = reducedRef.current;
      const events = engine.tick(
        ts,
        reduced ? RIPPLE_LIFE_MS_CALM : RIPPLE_LIFE_MS,
      );
      const audio = audioRef.current;
      const ac = ctxRef.current;
      if (audio && ac) {
        for (const ev of events) {
          audio.plink(ev.freq, ac.currentTime + 0.012, 0.85);
        }
      }
      const { w, h } = sizeRef.current;
      drawPool(c, bg, w, h, engine, ts, reduced, selectedRef.current);
    }
    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── mount: build engine, seed the auto-demo, start visuals ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const engine = new DripEngine(SEED);
    engine.seedDemo(performance.now());
    engineRef.current = engine;

    applyResize();
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(runFrame);

    const onResize = () => applyResize();
    window.addEventListener("resize", onResize);

    return () => {
      runningRef.current = false;
      window.removeEventListener("resize", onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
      if (ctxRef.current) {
        const ac = ctxRef.current;
        ctxRef.current = null;
        setTimeout(() => {
          ac.close().catch(() => {});
        }, 400);
      }
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [applyResize, runFrame]);

  // ── lazily open the AudioContext on the first user gesture ──
  const startAudio = useCallback(() => {
    if (ctxRef.current) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      if (ac.state === "suspended") ac.resume().catch(() => {});
      ctxRef.current = ac;
      const audio = makeDripAudio(ac, 0.5);
      audio.ambience(true);
      audioRef.current = audio;
      setAudioOn(true);
      setAudioError(false);
    } catch {
      setAudioError(true);
    }
  }, []);

  const beginFromIntro = useCallback(() => {
    startAudio();
    setShowIntro(false);
  }, [startAudio]);

  // ── pointer: place / select taps; vertical drag sets pitch ──
  const normFromEvent = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      clientY: e.clientY,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      startAudio();
      setShowIntro(false);
      const engine = engineRef.current;
      const { w, h } = sizeRef.current;
      const p = normFromEvent(e);
      if (!engine || !p) return;

      // hit-test existing taps (~22px radius)
      let hit: Tap | null = null;
      let best = 22 * 22;
      for (const t of engine.taps) {
        const dx = t.x * w - p.x * w;
        const dy = t.y * h - p.y * h;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) {
          best = d2;
          hit = t;
        }
      }

      const target =
        hit ??
        engine.addTap(
          p.x,
          p.y,
          Math.floor(engine.scale.length * 0.45),
          2000,
          performance.now(),
        );
      select(target.id);
      dragRef.current = {
        id: target.id,
        startY: p.clientY,
        startNote: target.noteIndex,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      bump();
    },
    [normFromEvent, select, startAudio, bump],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      const engine = engineRef.current;
      if (!drag || !engine) return;
      // drag UP raises pitch: ~26px per scale step
      const steps = Math.round((drag.startY - e.clientY) / 26);
      engine.setNote(drag.id, drag.startNote + steps);
      bump();
    },
    [bump],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // keep the control card's numbers fresh as taps drip (period readout etc.)
  useEffect(() => {
    if (selectedId == null) return;
    const iv = window.setInterval(bump, 400);
    return () => window.clearInterval(iv);
  }, [selectedId, bump]);

  const engine = engineRef.current;
  const selected =
    selectedId != null ? engine?.find(selectedId) ?? null : null;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#04090d] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* title + status, top-left */}
      <div className="pointer-events-none absolute left-5 top-5 z-10 max-w-xs">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Dripsong
        </h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          a water-clock of plinks
        </p>
        {audioError ? (
          <p className="mt-2 text-base text-destructive">
            Audio could not start — the pool still ripples in silence.
          </p>
        ) : !audioOn ? (
          <p className="mt-2 text-base text-muted-foreground">
            Tap the water to start sound and drop a tap.
          </p>
        ) : null}
      </div>

      {/* selected-tap control card, bottom-left */}
      {selected && engine ? (
        <div className="absolute bottom-5 left-5 z-20 w-64 rounded-lg border border-border bg-background/85 p-4 shadow-lg backdrop-blur-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Tap
          </p>
          <p className="mt-1 text-base text-foreground">
            {Math.round(engine.freqOf(selected))} Hz
            <span className="text-muted-foreground">
              {" "}
              · {engine.bubbleMm(selected).toFixed(1)} mm bubble
            </span>
          </p>
          <p className="text-base text-muted-foreground">
            drips every {(selected.periodMs / 1000).toFixed(2)} s
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Pitch / size</span>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Smaller drop, higher pitch is down; lower pitch"
                onClick={() => {
                  engine.adjustNote(selected.id, -1);
                  bump();
                }}
                className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background/60 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Higher pitch"
                onClick={() => {
                  engine.adjustNote(selected.id, 1);
                  bump();
                }}
                className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background/60 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Period</span>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Drip less often"
                onClick={() => {
                  engine.adjustPeriod(selected.id, 250);
                  bump();
                }}
                className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background/60 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Drip more often"
                onClick={() => {
                  engine.adjustPeriod(selected.id, -250);
                  bump();
                }}
                className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background/60 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              engine.removeTap(selected.id);
              select(null);
              bump();
            }}
            className="mt-4 min-h-[44px] w-full rounded-md border border-border bg-background/60 px-4 text-sm text-destructive transition-colors hover:bg-accent hover:text-foreground"
          >
            Remove tap
          </button>
        </div>
      ) : null}

      {/* design-notes button, bottom-right */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute bottom-5 right-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* intro overlay — visuals already animate behind it */}
      {showIntro ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/45 px-6 backdrop-blur-[2px]">
          <div className="max-w-md rounded-lg border border-border bg-background/80 p-6 text-center shadow-lg">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              A leaky-roof water-clock
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Each drop&apos;s pitch is the real Minnaert resonance of the air
              bubble it traps —{" "}
              <span className="text-primary">bigger drop, lower plink</span>.
              Place taps on the pool; each drips at its own period, weaving a
              canon that never quite repeats.
            </p>
            <button
              type="button"
              onClick={beginFromIntro}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        </div>
      ) : null}

      {/* design-notes modal */}
      {showNotes ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 px-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              The plink of a dripping tap is not the splash — it is a tiny air
              bubble entrained on impact, ringing at its{" "}
              <span className="text-foreground">Minnaert frequency</span>. At 1
              atm in water this reduces to f · r ≈ 3.26 (Hz·metre), so a big
              drop traps a big bubble and plinks LOW, a small drop plinks high.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Each plink is a fast-decaying sine at that frequency with the
              characteristic rising-pitch chirp (the bubble shrinks as it
              rings), plus a short band-passed impact tick and a faint sub. The
              reachable bubble sizes are quantized to a minor-pentatonic scale
              so the physics stays musical.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Placing several taps at incommensurate periods makes an evolving
              polyrhythm — a musical clepsydra. Where, how big, and how often
              you drip is the whole composition.
            </p>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Physical vs cosmetic
            </p>
            <p className="mt-1 text-base leading-relaxed text-muted-foreground">
              Physically modeled: the pitch (Minnaert f·r), the up-chirp, and
              the size→pitch inversion. Cosmetic: the ripple field is drawn with
              additive alpha, not a wave PDE.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <PrototypeNav slugs={["8680-dripsong"]} />
    </main>
  );
}
