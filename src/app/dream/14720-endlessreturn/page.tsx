"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14720-endlessreturn — "Endless Return" · pole: dream · altered-states/visionary
//
// THE QUESTION: what if your OWN piano recording could fall forever?
//
// A Shepard–Risset endless glissando built entirely from Karel's REAL piano —
// an auditory illusion of perpetual descent (or, at will, ascent) that only a
// human ear completes. ONE decoded AudioBuffer of his piano is spawned as N=7
// looping layers an octave apart (playbackRate = 2^k). Every frame ALL layers'
// playbackRate glides slowly in log-pitch; a raised-cosine (Hann) window over
// log-frequency fades layers in at one end and out at the other, so the octave
// wrap is inaudible — pitch seems to descend without end while the spectral
// centroid stays put. First Shepard–Risset in the lab made from real catalog
// audio (priors were pure synth partials).
//
// SUBSTRATE: 100% inline SVG DOM vector — no <canvas>, no WebGL. A rotating
// barber-pole helix of stacked octave rings, each ring mapped octave-height →
// hue (continuous rainbow), glow pulsing to the master analyser, rotation
// direction + speed matched to the audio glide. Built once, MUTATED per frame.
//
// STEER with the keyboard/scroll: Space = play/pause · ↑/↓ or scroll = reverse
// direction & set glide rate · number keys 1–8 = pick which real track feeds
// the illusion. Autonomous slow descent by default.
//
// Ref: Roger Shepard (1964) & Jean-Claude Risset — the Shepard–Risset glissando.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ── Engine constants ────────────────────────────────────────────────────────
const N = 7; // octave layers (Shepard partials) — one BufferSource each
const LEVEL = 0.5; // per-layer gain ceiling before the Hann window
const DEFAULT_GLIDE = -0.06; // octaves/sec — slow autonomous descent
const GLIDE_MIN = -0.5;
const GLIDE_MAX = 0.5;
const GLIDE_STEP = 0.035;

// ── SVG geometry ──────────────────────────────────────────────────────────
const VW = 420;
const VH = 660;
const MARGIN = 70;
const DRAW_H = VH - MARGIN * 2;
const CX = VW / 2;
const XAMP = 118; // helix horizontal swing
const RX = 96; // ring radius
const TURNS = 2.15; // helix turns across the spectrum
const TWO_PI = Math.PI * 2;

const STEERABLE = REAL_TRACKS.slice(0, 8);

const mod = (x: number, m: number) => ((x % m) + m) % m;

type Phase = "idle" | "loading" | "running" | "error";

interface RingRefs {
  glow: SVGEllipseElement | null;
  core: SVGEllipseElement | null;
}

export default function EndlessReturnPage() {
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const gainsRef = useRef<GainNode[]>([]);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const rafRef = useRef<number>(0);
  const genRef = useRef<number>(0); // load generation guard

  // Live-steered scalars read inside the rAF loop.
  const glideRef = useRef<number>(DEFAULT_GLIDE);
  const thetaRef = useRef<number>(0); // running pitch phase (octaves)
  const rotRef = useRef<number>(0); // helix spin phase (radians)
  const ampRef = useRef<number>(0); // smoothed analyser RMS
  const playingRef = useRef<boolean>(false);
  const lastTsRef = useRef<number>(0);

  const timeDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const guideRef = useRef<SVGPathElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const ringRefs = useRef<RingRefs[]>(
    Array.from({ length: N }, () => ({ glow: null, core: null })),
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState<string>("");
  const [trackIdx, setTrackIdx] = useState<number>(0);
  const [glideView, setGlideView] = useState<number>(DEFAULT_GLIDE);
  const [playing, setPlaying] = useState<boolean>(false);
  const [showNotes, setShowNotes] = useState<boolean>(false);

  // ── Teardown ───────────────────────────────────────────────────────────
  const stopSources = useCallback(() => {
    for (const s of sourcesRef.current) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.disconnect();
      } catch {
        /* noop */
      }
    }
    for (const g of gainsRef.current) {
      try {
        g.disconnect();
      } catch {
        /* noop */
      }
    }
    sourcesRef.current = [];
    gainsRef.current = [];
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    stopSources();
    try {
      safeRef.current?.disconnect();
    } catch {
      /* noop */
    }
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {});
    }
    ctxRef.current = null;
    safeRef.current = null;
    bufferRef.current = null;
    playingRef.current = false;
  }, [stopSources]);

  useEffect(() => teardown, [teardown]);

  // ── Build the N Shepard layers from one decoded buffer ───────────────────
  const buildSources = useCallback((buffer: AudioBuffer) => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    if (!ctx || !safe) return;
    stopSources();
    const srcs: AudioBufferSourceNode[] = [];
    const gains: GainNode[] = [];
    for (let i = 0; i < N; i++) {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(g);
      g.connect(safe.input);
      // Decorrelate the octave copies by staggering their read offset so the
      // stack reads as a cloud of his playing, not one phase-locked note.
      const offset = (buffer.duration * i) / N;
      s.start(ctx.currentTime, offset % buffer.duration);
      srcs.push(s);
      gains.push(g);
    }
    sourcesRef.current = srcs;
    gainsRef.current = gains;
  }, [stopSources]);

  // ── The single frame loop ────────────────────────────────────────────────
  const frame = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(frame);
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    if (!ctx || !safe) return;

    const last = lastTsRef.current || ts;
    lastTsRef.current = ts;
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));

    // Analyser RMS → glow pulse.
    const td = timeDataRef.current;
    if (td) {
      safe.analyser.getByteTimeDomainData(td);
      let sum = 0;
      for (let i = 0; i < td.length; i++) {
        const c = (td[i] - 128) / 128;
        sum += c * c;
      }
      const rms = Math.sqrt(sum / td.length);
      ampRef.current += (rms - ampRef.current) * 0.18;
    }
    const amp = ampRef.current;

    const glide = glideRef.current;
    if (playingRef.current) {
      thetaRef.current += glide * dt;
      // Helix spin follows the glide: direction & speed matched to the audio.
      rotRef.current += glide * 9 * dt;
    }
    const theta = thetaRef.current;
    const rot = rotRef.current;
    const t = ctx.currentTime;

    for (let i = 0; i < N; i++) {
      // pos ∈ [0,N): each layer marches through the octave stack and wraps.
      const pos = mod(theta + i, N);
      const centred = pos - N / 2; // 0 at the middle octave
      const rate = Math.pow(2, centred); // playbackRate = 2^k
      // Raised-cosine (Hann) window over log-frequency, zero at both edges.
      const hann = 0.5 * (1 - Math.cos((TWO_PI * pos) / N));

      if (playingRef.current) {
        const src = sourcesRef.current[i];
        const g = gainsRef.current[i];
        if (src) src.playbackRate.setTargetAtTime(rate, t, 0.04);
        if (g) g.gain.setTargetAtTime(hann * LEVEL, t, 0.05);
      }

      // ── Visual: barber-pole helix ring ────────────────────────────────
      const refs = ringRefs.current[i];
      if (!refs.core || !refs.glow) continue;
      const yNorm = 1 - pos / N; // high pitch → top, descent → moves down
      const cy = MARGIN + yNorm * DRAW_H;
      const ang = pos * ((TWO_PI * TURNS) / N) + rot;
      const cx = CX + XAMP * Math.sin(ang);
      const depth = (Math.cos(ang) + 1) / 2; // 0 back … 1 front
      const rx = RX * (0.5 + 0.5 * depth);
      const ry = rx * 0.3;
      const hue = (pos / N) * 300; // continuous vertical rainbow
      const op = hann * (0.28 + 0.72 * depth);
      const sw = 1.4 + amp * 4.5 + depth * 1.2;

      refs.core.setAttribute("cx", cx.toFixed(1));
      refs.core.setAttribute("cy", cy.toFixed(1));
      refs.core.setAttribute("rx", rx.toFixed(1));
      refs.core.setAttribute("ry", ry.toFixed(1));
      refs.core.setAttribute("stroke", `hsl(${hue.toFixed(0)} 92% 62%)`);
      refs.core.setAttribute("stroke-width", sw.toFixed(2));
      refs.core.setAttribute("opacity", op.toFixed(3));

      refs.glow.setAttribute("cx", cx.toFixed(1));
      refs.glow.setAttribute("cy", cy.toFixed(1));
      refs.glow.setAttribute("rx", rx.toFixed(1));
      refs.glow.setAttribute("ry", ry.toFixed(1));
      refs.glow.setAttribute("stroke", `hsl(${hue.toFixed(0)} 95% 55%)`);
      refs.glow.setAttribute("stroke-width", (sw * 2.6).toFixed(2));
      refs.glow.setAttribute("opacity", (op * (0.25 + amp * 1.4)).toFixed(3));
    }

    // Traveling barber-pole stripes on the helix guide: dash offset rides glide.
    const guide = guideRef.current;
    if (guide && playingRef.current) {
      const cur = parseFloat(guide.getAttribute("stroke-dashoffset") || "0");
      guide.setAttribute("stroke-dashoffset", (cur + glide * 120 * dt).toFixed(2));
    }
  }, []);

  // ── Start / load a track ─────────────────────────────────────────────────
  const startTrack = useCallback(
    async (idx: number) => {
      const gen = ++genRef.current;
      setPhase("loading");
      setErrMsg("");
      try {
        if (typeof window === "undefined") return;
        let ctx = ctxRef.current;
        if (!ctx) {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          ctx = new AC();
          ctxRef.current = ctx;
          safeRef.current = createSafeMaster(ctx);
          safeRef.current.setGain(0.82);
          timeDataRef.current = new Uint8Array(
            new ArrayBuffer(safeRef.current.analyser.fftSize),
          );
        }
        if (ctx.state === "suspended") await ctx.resume();

        const { buffer } = await loadRealTrackBuffer(ctx, STEERABLE[idx].id);
        if (gen !== genRef.current) return; // superseded by a newer request
        bufferRef.current = buffer;
        buildSources(buffer);

        playingRef.current = true;
        setPlaying(true);
        setPhase("running");
        lastTsRef.current = 0;
        if (!rafRef.current) rafRef.current = requestAnimationFrame(frame);
      } catch (e) {
        if (gen !== genRef.current) return;
        console.error(e);
        setErrMsg(
          "Couldn't load this piano take. The illusion needs his real audio — try another number key.",
        );
        setPhase("error");
      }
    },
    [buildSources, frame],
  );

  const togglePlay = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || phase === "idle") {
      void startTrack(trackIdx);
      return;
    }
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      ctx.suspend().catch(() => {});
    } else {
      playingRef.current = true;
      setPlaying(true);
      ctx.resume().catch(() => {});
    }
  }, [phase, startTrack, trackIdx]);

  const selectTrack = useCallback(
    (idx: number) => {
      setTrackIdx(idx);
      // If the engine is live, swap the buffer feeding the illusion in place.
      if (ctxRef.current) void startTrack(idx);
    },
    [startTrack],
  );

  const nudgeGlide = useCallback((delta: number) => {
    const next = Math.max(GLIDE_MIN, Math.min(GLIDE_MAX, glideRef.current + delta));
    glideRef.current = next;
    setGlideView(next);
  }, []);

  // ── Keyboard steering ─────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeGlide(+GLIDE_STEP); // toward ascent
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeGlide(-GLIDE_STEP); // toward descent
      } else if (e.key >= "1" && e.key <= "8") {
        const idx = Number(e.key) - 1;
        if (idx < STEERABLE.length) selectTrack(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, nudgeGlide, selectTrack]);

  // ── Scroll-wheel steering (scroll up = ascend) ────────────────────────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      nudgeGlide((-e.deltaY / 100) * GLIDE_STEP);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [nudgeGlide]);

  const dir =
    glideView < -0.005 ? "descending" : glideView > 0.005 ? "ascending" : "still";

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream Lab · 14720 · Shepard–Risset
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Endless Return
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Your own piano recording, falling forever — a Shepard–Risset endless
            glissando resynthesized entirely from Karel&apos;s real catalog. The
            pitch seems to descend without end; only your ear completes the
            illusion.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* ── Stage ───────────────────────────────────────────── */}
          <div
            ref={stageRef}
            className="relative overflow-hidden rounded-lg border border-border bg-[#050509]"
            aria-label="Endless glissando helix"
          >
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              className="block h-full w-full"
              preserveAspectRatio="xMidYMid meet"
              role="img"
            >
              <defs>
                <linearGradient id="er-spectrum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(300 90% 60%)" />
                  <stop offset="20%" stopColor="hsl(255 90% 62%)" />
                  <stop offset="40%" stopColor="hsl(190 90% 58%)" />
                  <stop offset="60%" stopColor="hsl(130 85% 56%)" />
                  <stop offset="80%" stopColor="hsl(55 92% 58%)" />
                  <stop offset="100%" stopColor="hsl(5 92% 58%)" />
                </linearGradient>
                <radialGradient id="er-vignette" cx="50%" cy="46%" r="62%">
                  <stop offset="55%" stopColor="#050509" stopOpacity="0" />
                  <stop offset="100%" stopColor="#050509" stopOpacity="0.9" />
                </radialGradient>
              </defs>

              {/* Barber-pole helix guide — rainbow, traveling dashes ride the glide */}
              <path
                ref={guideRef}
                d={helixPath()}
                fill="none"
                stroke="url(#er-spectrum)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="10 16"
                opacity={0.5}
              />

              {/* The N octave rings (one per Shepard layer) */}
              {Array.from({ length: N }, (_, i) => (
                <g key={i}>
                  <ellipse
                    ref={(el) => {
                      ringRefs.current[i].glow = el;
                    }}
                    cx={CX}
                    cy={VH / 2}
                    rx={RX}
                    ry={RX * 0.3}
                    fill="none"
                    stroke="hsl(200 90% 60%)"
                    strokeWidth={4}
                    opacity={0}
                    style={{ filter: "blur(6px)" }}
                  />
                  <ellipse
                    ref={(el) => {
                      ringRefs.current[i].core = el;
                    }}
                    cx={CX}
                    cy={VH / 2}
                    rx={RX}
                    ry={RX * 0.3}
                    fill="none"
                    stroke="hsl(200 90% 60%)"
                    strokeWidth={2}
                    opacity={0}
                  />
                </g>
              ))}

              <rect
                x={0}
                y={0}
                width={VW}
                height={VH}
                fill="url(#er-vignette)"
                pointerEvents="none"
              />
            </svg>

            {/* Idle / loading overlay */}
            {phase !== "running" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/45 backdrop-blur-sm">
                {phase === "error" ? (
                  <p className="max-w-xs px-6 text-center text-base text-destructive">
                    {errMsg}
                  </p>
                ) : (
                  <button
                    onClick={() => void startTrack(trackIdx)}
                    disabled={phase === "loading"}
                    className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    {phase === "loading" ? "Loading his piano…" : "Begin the fall"}
                  </button>
                )}
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {STEERABLE[trackIdx].title}
                </p>
              </div>
            )}
          </div>

          {/* ── Controls ───────────────────────────────────────── */}
          <aside className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Transport
              </p>
              <button
                onClick={togglePlay}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {playing ? "Pause (Space)" : "Play (Space)"}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Glide · {dir}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => nudgeGlide(-GLIDE_STEP)}
                  className="min-h-[44px] flex-1 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  ↓ Descend
                </button>
                <button
                  onClick={() => nudgeGlide(+GLIDE_STEP)}
                  className="min-h-[44px] flex-1 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  ↑ Ascend
                </button>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    marginLeft: `${((Math.max(GLIDE_MIN, Math.min(GLIDE_MAX, glideView)) - GLIDE_MIN) / (GLIDE_MAX - GLIDE_MIN)) * 100}%`,
                    width: "3px",
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {glideView === 0
                  ? "Frozen"
                  : `${Math.abs(glideView).toFixed(2)} oct/sec ${glideView < 0 ? "down" : "up"}`}{" "}
                · arrows or scroll to steer
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Source take · keys 1–8
              </p>
              <div className="grid grid-cols-2 gap-2">
                {STEERABLE.map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => selectTrack(i)}
                    className={`min-h-[44px] rounded-md border px-3 text-left text-sm transition-colors ${
                      i === trackIdx
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </span>{" "}
                    {t.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border bg-background/60 p-3 text-sm text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                Legend
              </span>
              <p className="mt-1">
                Each glowing ring is one octave layer of his piano. Height → hue
                (rainbow). Rings fall and wrap forever; the spin and dash-travel
                match the glide direction.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* Design-notes affordance */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-4 right-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
            <h2 className="text-2xl font-semibold tracking-tight">
              Endless Return — design notes
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-base text-muted-foreground">
              <p>
                <strong className="text-foreground">The question:</strong> what
                if your own piano recording could fall forever?
              </p>
              <p>
                One decoded AudioBuffer of Karel&apos;s piano is spawned as seven
                looping layers an octave apart (playbackRate = 2^k). Every frame
                all layers glide slowly in log-pitch; a raised-cosine (Hann)
                window over log-frequency fades each layer in at one end and out
                at the other, so the octave wrap is inaudible — the perceived
                pitch descends endlessly while the spectral centroid stays fixed.
              </p>
              <p>
                <strong className="text-foreground">Reference:</strong> Roger
                Shepard (1964) and Jean-Claude Risset — the Shepard–Risset
                glissando. The illusion exploits uniquely-human perceptual
                binding (cf. audio-illusion robustness literature,
                arXiv:2601.08516): no meter measures endlessness, only your ear.
              </p>
              <p>
                <strong className="text-foreground">Controls:</strong> Space
                play/pause · ↑/↓ or scroll to reverse direction &amp; set the
                glide rate · number keys 1–8 pick which real take feeds the
                illusion. Default is a slow autonomous descent.
              </p>
              <p>
                <strong className="text-foreground">Next-cycle deepening:</strong>{" "}
                bind glide rate to the live analyser so the descent accelerates
                through his loud passages and stalls in the quiet ones — the
                illusion breathing with his own dynamics.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14720-endlessreturn"]} />
    </main>
  );
}

// Static helix guide path (barber-pole spine), sampled once.
function helixPath(): string {
  const pts: string[] = [];
  const steps = 160;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const y = MARGIN + t * DRAW_H;
    const x = CX + XAMP * Math.sin(t * TWO_PI * TURNS);
    pts.push(`${s === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}
