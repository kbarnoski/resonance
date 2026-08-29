"use client";

/* ── 16368 · Many Returns ────────────────────────────────────────────────────
 *
 *  ONE IDEA: take a SINGLE one of Karel's piano takes and let it grow itself into
 *  a Steve-Reich / Brian-Eno phase choir — many copies of the SAME ~7s loop
 *  window, each on its OWN AudioBufferSourceNode at a slightly different,
 *  incommensurate loop LENGTH, drifting through phase forever (never re-syncing).
 *  This is the Eno *Music for Airports* seven-tape-loop mechanism; the drift IS
 *  the composition. Whole-buffer decoupled loops only — no granular grains.
 *
 *  Each ghost ages like a Basinski *Disintegration Loop*: its lowpass slowly
 *  closes, its gain dims over minutes, oldest ghosts recede into a dark wash as
 *  new bright ones enter. Live ghosts are capped; the oldest retires.
 *
 *  OUTPUT is a Canvas2D phase-portrait: one shared clock-ring, each live ghost a
 *  hand sweeping it at ITS OWN rate (∝ 1/loopLength). Because the rates are
 *  incommensurate the hands form an ever-shifting fan that never repeats; where
 *  two hands COINCIDE a soft bloom fires and a wear-ring accumulates — a memory
 *  trace of the drift, so the field genuinely differs at minute 5 vs minute 1.
 *
 *  Palette: ashlight / faded-archive — pewter-grey ground, desaturated grey
 *  hands, one bone signal for the newest ghost. No grain pass; texture comes
 *  from layered translucent hands + wear-rings. See README.md.
 *
 *  AUDIO is Karel's ONE decoded recording only, routed through safeMaster —
 *  nothing reaches ctx.destination directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  WELCOME_HOME_TRACKS,
  COLLECTIONS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { Ensemble, type GhostView } from "./engine";

type Status = "idle" | "loading" | "running" | "error";

// ── phase-field palette (canvas art only — chrome uses semantic tokens) ───────
const GROUND = "#0a0b0d"; // near-black pewter ground
const RING = "#3a3d42"; // ash-grey clock ring
const RING_DIM = "#22242833"; // faint concentric guides
const BONE = "#ece8de"; // newest-ghost signal

const WEAR_BINS = 720; // angular resolution of the memory trace
const COINCIDE_EPS = 0.052; // radians — phase-coincidence threshold

// desaturated grey tint per ghost, brighter/sharper when new, dim when aged.
function handColor(v: GhostView, isNewest: boolean, alpha: number): string {
  if (isNewest) {
    const l = 92 - v.ageNorm * 20;
    return `hsla(44, 12%, ${l}%, ${alpha})`;
  }
  // narrow muted band around neutral pewter; hue drifts a touch per ghost
  const hue = 30 + (v.ratioIndex % 6) * 26; // 30..160, but very low sat → reads grey
  const sat = 9;
  const light = 66 - v.ageNorm * 40;
  return `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
}

export default function ManyReturns() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [title, setTitle] = useState<string>(WELCOME_HOME_TRACKS[0].title);
  const [liveCount, setLiveCount] = useState(0);
  const [baseLoopLen, setBaseLoopLen] = useState(7.0);
  const [driftSpread, setDriftSpread] = useState(1.0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const ensembleRef = useRef<Ensemble | null>(null);
  const rafRef = useRef<number>(0);
  const wearRef = useRef<Float32Array>(new Float32Array(WEAR_BINS));
  const bloomsRef = useRef<{ angle: number; born: number; strength: number }[]>([]);
  const pulseRef = useRef(0);

  // keep control values reachable inside the (stable) animation callback
  const controlsRef = useRef({ baseLoopLen, driftSpread });
  useEffect(() => {
    controlsRef.current = { baseLoopLen, driftSpread };
    if (ensembleRef.current) {
      ensembleRef.current.baseLoopLen = baseLoopLen;
      ensembleRef.current.driftSpread = driftSpread;
    }
  }, [baseLoopLen, driftSpread]);

  // ── canvas sizing (DPR + resize aware) ──────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }, []);

  useEffect(() => {
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas]);

  // ── the render loop ─────────────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ens = ensembleRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !ens || !g) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }

    ens.step();
    const views = ens.getViews();
    const level = ens.level();
    const now = performance.now() / 1000;
    setLiveCount(ens.liveCount);

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.4; // outer ring radius
    const rIn = R * 0.16; // hands start here

    // ground with a soft vignette
    const bg = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.5);
    bg.addColorStop(0, "#101216");
    bg.addColorStop(1, GROUND);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // ── phase-coincidence detection → blooms + wear accumulation ──────────────
    const wear = wearRef.current;
    for (let i = 0; i < views.length; i++) {
      for (let j = i + 1; j < views.length; j++) {
        const a = views[i];
        const b = views[j];
        if (a.retiring || b.retiring) continue;
        let d = Math.abs(a.phase01 - b.phase01);
        d = Math.min(d, 1 - d); // wrap-around distance in phase
        const dr = d * Math.PI * 2;
        if (dr < COINCIDE_EPS) {
          const mid = ((a.phase01 + b.phase01) / 2) * Math.PI * 2 - Math.PI / 2;
          const strength = (1 - dr / COINCIDE_EPS) * Math.min(a.level, b.level);
          // register a fresh bloom (throttled by proximity to an existing one)
          const recent = bloomsRef.current.find(
            (x) => Math.abs(x.angle - mid) < 0.04 && now - x.born < 0.5,
          );
          if (!recent && strength > 0.05) {
            bloomsRef.current.push({ angle: mid, born: now, strength });
            pulseRef.current = Math.min(1, pulseRef.current + strength * 0.5);
          }
          // memory trace: accumulate wear at this angle
          const bin = Math.floor((mid + Math.PI / 2) / (Math.PI * 2) * WEAR_BINS);
          const bb = ((bin % WEAR_BINS) + WEAR_BINS) % WEAR_BINS;
          wear[bb] = Math.min(6, wear[bb] + strength * 0.06);
        }
      }
    }

    // ── concentric wear-rings (memory of where alignments keep landing) ───────
    g.strokeStyle = RING_DIM;
    g.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      g.beginPath();
      g.arc(cx, cy, rIn + (R - rIn) * (k / 3.4), 0, Math.PI * 2);
      g.stroke();
    }

    // wear trace drawn as faint radial ticks whose length grows with accumulation
    for (let b = 0; b < WEAR_BINS; b++) {
      const w = wear[b];
      if (w < 0.02) continue;
      const ang = (b / WEAR_BINS) * Math.PI * 2 - Math.PI / 2;
      const len = Math.min(R * 0.9, R * 0.02 + w * R * 0.06);
      const r0 = R + 2;
      g.strokeStyle = `rgba(143,146,152,${Math.min(0.5, 0.06 + w * 0.08)})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      g.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
      g.stroke();
      wear[b] *= 0.9995; // very slow decay so the trace persists over minutes
    }

    // ── the shared clock ring ─────────────────────────────────────────────────
    g.strokeStyle = RING;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();

    // find the newest live ghost (highest id ≈ youngest)
    let newestId = -1;
    let minAge = Infinity;
    for (const v of views) {
      if (!v.retiring && v.age < minAge) {
        minAge = v.age;
        newestId = v.id;
      }
    }

    // ── moiré chord lines: faint arcs connecting the hand tips ────────────────
    const live = views.filter((v) => !v.retiring && v.level > 0.02);
    g.lineWidth = 1;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const aA = live[i].phase01 * Math.PI * 2 - Math.PI / 2;
        const aB = live[j].phase01 * Math.PI * 2 - Math.PI / 2;
        const alpha = 0.04 * Math.min(live[i].level, live[j].level);
        if (alpha < 0.006) continue;
        g.strokeStyle = `rgba(150,153,160,${alpha})`;
        g.beginPath();
        g.moveTo(cx + Math.cos(aA) * R, cy + Math.sin(aA) * R);
        g.lineTo(cx + Math.cos(aB) * R, cy + Math.sin(aB) * R);
        g.stroke();
      }
    }

    // ── the hands ─────────────────────────────────────────────────────────────
    for (const v of views) {
      const ang = v.phase01 * Math.PI * 2 - Math.PI / 2;
      const isNew = v.id === newestId;
      const tipX = cx + Math.cos(ang) * R;
      const tipY = cy + Math.sin(ang) * R;
      const inX = cx + Math.cos(ang) * rIn;
      const inY = cy + Math.sin(ang) * rIn;

      const baseAlpha = (0.18 + v.level * 0.6) * (v.retiring ? 0.5 : 1);
      // oldest hands blur: draw a wide soft under-stroke first
      if (v.ageNorm > 0.25) {
        g.strokeStyle = handColor(v, isNew, baseAlpha * 0.35 * (1 - v.ageNorm * 0.5));
        g.lineWidth = 6 + v.ageNorm * 10;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(inX, inY);
        g.lineTo(tipX, tipY);
        g.stroke();
      }
      // the sharp hand — newest is brightest/thinnest-crisp
      g.strokeStyle = handColor(v, isNew, baseAlpha);
      g.lineWidth = isNew ? 2.4 : 1.4 + (1 - v.ageNorm) * 1.2;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(inX, inY);
      g.lineTo(tipX, tipY);
      g.stroke();

      // tip mark on the ring
      const tr = isNew ? 5 : 2.5 + (1 - v.ageNorm) * 2;
      g.fillStyle = isNew ? BONE : handColor(v, false, Math.min(1, baseAlpha + 0.15));
      g.beginPath();
      g.arc(tipX, tipY, tr, 0, Math.PI * 2);
      g.fill();
    }

    // ── blooms at coincidences (the visual "beats") ──────────────────────────
    bloomsRef.current = bloomsRef.current.filter((bl) => now - bl.born < 1.4);
    for (const bl of bloomsRef.current) {
      const t = (now - bl.born) / 1.4; // 0..1
      const bx = cx + Math.cos(bl.angle) * R;
      const by = cy + Math.sin(bl.angle) * R;
      const grad = g.createRadialGradient(bx, by, 0, bx, by, R * 0.4 * (0.4 + bl.strength));
      const a = (1 - t) * Math.min(0.6, 0.2 + bl.strength);
      grad.addColorStop(0, `rgba(217,214,205,${a})`);
      grad.addColorStop(1, "rgba(217,214,205,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(bx, by, R * 0.4 * (0.4 + bl.strength), 0, Math.PI * 2);
      g.fill();
    }

    // gentle level pulse on strong coincidence (subtle, safeMaster-smoothed)
    if (masterRef.current) {
      const p = pulseRef.current;
      masterRef.current.setGain(0.82 + p * 0.1);
      pulseRef.current *= 0.94;
    }

    // faint center mark keyed to overall level
    g.fillStyle = `rgba(180,182,188,${0.1 + level * 0.3})`;
    g.beginPath();
    g.arc(cx, cy, rIn * 0.5, 0, Math.PI * 2);
    g.fill();

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── build the ensemble ──────────────────────────────────────────────────────
  const build = useCallback(
    async (id: string) => {
      setStatus("loading");
      setError("");
      // tear down any prior run
      cancelAnimationFrame(rafRef.current);
      ensembleRef.current?.dispose();
      wearRef.current = new Float32Array(WEAR_BINS);
      bloomsRef.current = [];

      try {
        let ctx = ctxRef.current;
        if (!ctx) {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (!AC) throw new Error("no-webaudio");
          ctx = new AC();
          ctxRef.current = ctx;
        }
        if (ctx.state === "suspended") await ctx.resume();

        if (!masterRef.current) masterRef.current = createSafeMaster(ctx);

        const { buffer, title: t } = await loadRealTrackBuffer(ctx, id);
        setTitle(t);

        const ens = new Ensemble(ctx, buffer, masterRef.current);
        ens.baseLoopLen = controlsRef.current.baseLoopLen;
        ens.driftSpread = controlsRef.current.driftSpread;
        ensembleRef.current = ens;
        ens.start();

        sizeCanvas();
        setStatus("running");
        rafRef.current = requestAnimationFrame(runFrame);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          msg === "no-webaudio"
            ? "This browser has no Web Audio support — the choir cannot sound."
            : "Could not load the recording. Please try again.",
        );
        setStatus("error");
      }
    },
    [runFrame, sizeCanvas],
  );

  // ── cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      ensembleRef.current?.dispose();
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── click a hand → mute/unmute that ghost ───────────────────────────────────
  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const ens = ensembleRef.current;
    const canvas = canvasRef.current;
    if (!ens || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const clickAng = Math.atan2(py - cy, px - cx);
    // find the live ghost whose hand angle is nearest the click
    const views = ens.getViews();
    let best: GhostView | null = null;
    let bestD = 0.18; // radians tolerance
    for (const v of views) {
      if (v.retiring) continue;
      const ang = v.phase01 * Math.PI * 2 - Math.PI / 2;
      let d = Math.abs(ang - clickAng);
      d = Math.min(d, Math.PI * 2 - d);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    if (best) ens.toggleMute(best.id);
  }, []);

  const running = status === "running";

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-8">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            16368 · canon lineage · cycle 3
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Many Returns</h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            One of Karel&rsquo;s piano takes, grown into a phase choir — many
            copies of the same loop at incommensurate lengths, drifting through
            phase forever. Watch the hands sweep one clock at different rates;
            wherever two coincide, the field blooms.
          </p>
        </header>

        {/* the canvas hero */}
        <div className="relative overflow-hidden rounded-lg border border-border bg-black/40">
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="block h-[62vh] max-h-[680px] w-full cursor-pointer"
            style={{ maxWidth: "100%" }}
          />

          {status !== "running" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-sm">
              {status === "error" ? (
                <p className="max-w-sm px-6 text-center text-sm text-destructive">
                  {error}
                </p>
              ) : status === "loading" ? (
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  loading the take&hellip;
                </p>
              ) : (
                <p className="max-w-sm px-6 text-center text-sm text-muted-foreground">
                  The choir builds itself once you start — a fresh ghost enters
                  every few seconds. Give it thirty seconds hands-off, or author
                  it yourself below.
                </p>
              )}
              <button
                onClick={() => build(trackId)}
                disabled={status === "loading"}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {status === "error" ? "Try again" : "Begin the choir"}
              </button>
            </div>
          )}

          {running && (
            <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-0.5">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {title}
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {liveCount} voices drifting
              </span>
            </div>
          )}
        </div>

        {/* authoring controls */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => ensembleRef.current?.addGhost()}
              disabled={!running}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              Add a voice
            </button>
            <button
              onClick={() => ensembleRef.current?.thin()}
              disabled={!running}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Thin the choir
            </button>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              click a hand to mute / unmute it
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                loop window — {baseLoopLen.toFixed(1)}s (shapes new voices)
              </span>
              <input
                type="range"
                min={5}
                max={10}
                step={0.1}
                value={baseLoopLen}
                onChange={(e) => setBaseLoopLen(parseFloat(e.target.value))}
                className="accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                drift spread — {driftSpread.toFixed(2)}× (how fast phases part)
              </span>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.05}
                value={driftSpread}
                onChange={(e) => setDriftSpread(parseFloat(e.target.value))}
                className="accent-primary"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              take — rebuilds the ensemble from another recording
            </span>
            <select
              value={trackId}
              onChange={(e) => {
                setTrackId(e.target.value);
                if (running || status === "error") build(e.target.value);
              }}
              className="min-h-[44px] w-full max-w-sm rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
            >
              {COLLECTIONS.map((c) => (
                <optgroup key={c.name} label={c.name}>
                  {c.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </section>
      </div>

      {/* design-notes corner affordance */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-4 right-4 min-h-[44px] rounded-md border border-border bg-background/80 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-2xl font-semibold tracking-tight">
              Many Returns
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A single one of Karel&rsquo;s piano takes answers itself. A ~7-second
                window from the recording is copied across many voices, each played
                on its own looping node at a slightly different, incommensurate
                length (ratios ~1.000, 1.037, 1.081, 1.129, 1.181, 1.237). Because
                the lengths never share a common multiple, no two voices ever
                re-sync — they drift through phase forever. This is the mechanism of
                Brian Eno&rsquo;s <em>Music for Airports</em> (1978), built from seven
                tape loops of incommensurate length, and of Steve Reich&rsquo;s{" "}
                <em>Piano Phase</em>. The drift is the composition.
              </p>
              <p>
                Each voice also <em>ages</em>: its lowpass slowly closes and its gain
                dims over minutes, so the oldest voices recede into a dark wash while
                new bright ones enter — the erosion of William Basinski&rsquo;s{" "}
                <em>The Disintegration Loops</em>. Live voices are capped; the oldest
                retires when a new one arrives.
              </p>
              <p>
                The picture is the ensemble&rsquo;s phase-portrait: one shared clock,
                each voice a hand sweeping it at its own rate (faster for shorter
                loops). Where two hands coincide, a bloom fires and a wear-ring
                accumulates at that angle — a memory trace that builds over minutes,
                so the field at minute five is nothing like minute one.
              </p>
              <p>
                Play it: <strong>Add a voice</strong> commits the next incommensurate
                length; <strong>Thin the choir</strong> retires the oldest; the
                sliders shape how new voices drift; clicking a hand mutes it. Or walk
                away — it builds and drifts on its own.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 pb-6">
        <Link
          href="/dream"
          className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          ← back to the index
        </Link>
      </div>
    </main>
  );
}
