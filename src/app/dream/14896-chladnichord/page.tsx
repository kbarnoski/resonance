"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  REAL_TRACKS,
  loadRealTrackBuffer,
  type WelcomeHomeTrack,
} from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackAnalysis,
} from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";

// ─────────────────────────────────────────────────────────────────────────────
// CHLADNICHORD — the shape of the chord.
//
// Karel's real piano loops through the safe master. Its live harmony drives a
// square-plate Chladni simulation: thousands of grains of "sand" migrate to the
// nodal lines of the vibrating plate — the places that stay still — so the
// figure on screen literally IS the standing-wave geometry of the sound right
// now. As the harmony brightens or darkens, the plate's mode (m,n) morphs and
// the sand reorganizes into a new figure.
//
// Nodal function on the unit square:  f = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)
// Grains feel a force DOWN the gradient of f² (toward |f|=0 nodal lines), plus
// a jitter that scales with loudness — playing louder shakes the plate harder,
// scattering the grains before they settle; quiet passages let the figure
// crystallize sharply.
//
// Reference: ChladniSonify, "A Visual-Acoustic Mapping Method for Chladni
// Patterns in New Media Art Creation" (arXiv 2605.09846, 2026); Ernst Chladni's
// plate experiments (1787); Nigel Stanford, "Cymatics" (2014).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TRACK = REAL_TRACKS[2]; // "Welcome Home"
const PARTICLE_COUNT = 11000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Voice {
  src: AudioBufferSourceNode;
}

// Analytic gradient of f² is 2·f·∇f. computeMode packs the per-frame constants.
function playbackChord(
  analysis: TrackAnalysis | null,
  tSec: number,
): { root: number | null; minor: boolean; label: string } {
  if (!analysis || analysis.chords.length === 0) {
    return { root: null, minor: false, label: "—" };
  }
  const chords = analysis.chords;
  // last chord whose onset is <= tSec (binary-ish walk is overkill; linear scan
  // over a handful-per-second is fine and allocates nothing).
  let cur = chords[0];
  for (let i = 0; i < chords.length; i++) {
    if (chords[i].time <= tSec) cur = chords[i];
    else break;
  }
  return {
    root: chordRoot(cur.chord),
    minor: chordIsMinor(cur.chord),
    label: cur.chord,
  };
}

export default function ChladnichordPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const plateRef = useRef<{ ox: number; oy: number; size: number }>({
    ox: 0,
    oy: 0,
    size: 0,
  });

  // audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const voiceRef = useRef<Voice | null>(null);
  const analysisRef = useRef<TrackAnalysis | null>(null);
  const freqBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const startTimeRef = useRef(0);
  const durationRef = useRef(0);
  const audioLiveRef = useRef(false);

  // particle field (typed arrays, no per-frame allocation)
  const pxRef = useRef<Float32Array | null>(null);
  const pyRef = useRef<Float32Array | null>(null);

  // live mode state (floats so figures MORPH rather than snap)
  const modeMRef = useRef(2);
  const modeNRef = useRef(3);
  const targetMRef = useRef(2);
  const targetNRef = useRef(3);
  const lastFrameRef = useRef(0);
  const reducedRef = useRef(false);

  // pointer sprinkle
  const draggingRef = useRef(false);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const [audioLive, setAudioLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCanvas, setNoCanvas] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [trackId, setTrackId] = useState(DEFAULT_TRACK.id);
  const [readout, setReadout] = useState({
    m: 2,
    n: 3,
    chord: "—",
    key: "—",
    hasAnalysis: false,
  });
  const readoutTickRef = useRef(0);

  // ── particle init ──────────────────────────────────────────────────────────
  const seedParticles = useCallback(() => {
    const px = new Float32Array(PARTICLE_COUNT);
    const py = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      px[i] = Math.random();
      py[i] = Math.random();
    }
    pxRef.current = px;
    pyRef.current = py;
  }, []);

  // ── audio plumbing ───────────────────────────────────────────────────────
  const startSource = useCallback((buffer: AudioBuffer) => {
    const ctx = audioCtxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(master.input);
    src.start();
    voiceRef.current = { src };
    startTimeRef.current = ctx.currentTime;
    durationRef.current = buffer.duration;
  }, []);

  const begin = useCallback(
    async (id: string) => {
      if (loading) return;
      setError(null);
      setLoading(true);
      try {
        if (!audioCtxRef.current) {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          audioCtxRef.current = new AC();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") await ctx.resume();

        if (!masterRef.current) {
          masterRef.current = createSafeMaster(ctx);
          masterRef.current.setGain(0.85);
          freqBufRef.current = new Uint8Array(
            new ArrayBuffer(masterRef.current.analyser.frequencyBinCount),
          );
        }

        // stop any current source (track switch)
        if (voiceRef.current) {
          try {
            voiceRef.current.src.stop();
          } catch {
            /* already stopped */
          }
          voiceRef.current = null;
        }

        const { buffer } = await loadRealTrackBuffer(ctx, id);
        analysisRef.current = await loadTrackAnalysis(id); // may be null
        startSource(buffer);

        audioLiveRef.current = true;
        setAudioLive(true);
        setTrackId(id);
      } catch (e) {
        setError(
          `Couldn't load Karel's audio — ${
            e instanceof Error ? e.message : "unknown error"
          }. The plate needs the real recording to vibrate.`,
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, startSource],
  );

  // ── main loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      setNoCanvas(true);
      return;
    }
    ctx2dRef.current = ctx;
    if (!pxRef.current) seedParticles();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      sizeRef.current = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = Math.min(w, h) * 0.86;
      plateRef.current = {
        ox: (w - size) / 2,
        oy: (h - size) / 2,
        size,
      };
    };
    resize();
    window.addEventListener("resize", resize);

    const PI = Math.PI;

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dtMs = lastFrameRef.current ? now - lastFrameRef.current : 16;
      lastFrameRef.current = now;
      const dt = clamp(dtMs / 1000, 0.001, 0.05);

      const { w, h } = sizeRef.current;
      const plate = plateRef.current;
      const px = pxRef.current;
      const py = pyRef.current;
      if (!px || !py) return;

      // ── read the music ──────────────────────────────────────────────────
      let amp = 0;
      let centroid = 0.3;
      const master = masterRef.current;
      const fb = freqBufRef.current;
      if (audioLiveRef.current && master && fb) {
        master.analyser.getByteFrequencyData(fb);
        let sum = 0;
        let wsum = 0;
        const n = fb.length;
        for (let i = 0; i < n; i++) {
          const v = fb[i];
          sum += v;
          wsum += v * i;
        }
        amp = clamp(sum / (n * 255) * 2.2, 0, 1);
        centroid = sum > 0 ? clamp(wsum / (sum * n), 0, 1) : 0.3;
      }

      // map harmony → target plate mode (m,n)
      if (audioLiveRef.current) {
        const ctxA = audioCtxRef.current;
        const analysis = analysisRef.current;
        const bright = Math.pow(clamp(centroid * 2.4, 0, 1), 0.7); // 0..1
        let tM: number;
        let tN: number;
        if (analysis && ctxA && durationRef.current > 0) {
          const t =
            (ctxA.currentTime - startTimeRef.current) % durationRef.current;
          const ch = playbackChord(analysis, t);
          const root = ch.root ?? 0;
          // root of the chord picks a base geometry; brightness adds structure;
          // minor colouring nudges toward a denser figure.
          tM = 2 + (root % 5) + (ch.minor ? 1 : 0);
          tN = 3 + Math.round(bright * 5);
        } else {
          // spectral-only fallback
          tM = 2 + Math.round(bright * 4);
          tN = 3 + Math.round(clamp(amp * 1.4, 0, 1) * 4);
        }
        // never let m == n (the figure would vanish)
        if (Math.abs(tM - tN) < 1) tN = tM + 1;
        targetMRef.current = clamp(tM, 2, 8);
        targetNRef.current = clamp(tN, 3, 9);
      }

      // smooth morph toward target (~0.8s; slower under reduced motion)
      const tau = reducedRef.current ? 1.6 : 0.8;
      const k = 1 - Math.exp(-dt / tau);
      modeMRef.current += (targetMRef.current - modeMRef.current) * k;
      modeNRef.current += (targetNRef.current - modeNRef.current) * k;
      const m = modeMRef.current;
      const nn = modeNRef.current;
      const mp = m * PI;
      const np = nn * PI;

      // ── step particles down ∇(f²) toward the nodal lines ─────────────────
      const descent = 0.0011;
      const jitterBase = reducedRef.current ? 0.0016 : 0.0042;
      const jitter = jitterBase * (0.15 + amp);
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = px[i];
        const y = py[i];
        const cnx = Math.cos(np * x);
        const cmx = Math.cos(mp * x);
        const cny = Math.cos(np * y);
        const cmy = Math.cos(mp * y);
        const snx = Math.sin(np * x);
        const smx = Math.sin(mp * x);
        const sny = Math.sin(np * y);
        const smy = Math.sin(mp * y);
        // f = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)
        const f = cnx * cmy - cmx * cny;
        // ∂f/∂x, ∂f/∂y
        const fx = -np * snx * cmy + mp * smx * cny;
        const fy = -mp * cnx * smy + np * cmx * sny;
        // ∇(f²) = 2·f·∇f  → step opposite (toward |f| minima)
        let dx = -descent * 2 * f * fx;
        let dy = -descent * 2 * f * fy;
        if (dx > 0.03) dx = 0.03;
        else if (dx < -0.03) dx = -0.03;
        if (dy > 0.03) dy = 0.03;
        else if (dy < -0.03) dy = -0.03;
        // jitter grows with loudness AND with distance from the node, so grains
        // sitting on a nodal line stay put while the rest keep scattering.
        const js = jitter * (0.25 + (f < 0 ? -f : f));
        let nx = x + dx + (Math.random() - 0.5) * js;
        let ny = y + dy + (Math.random() - 0.5) * js;
        // reflect at edges
        if (nx < 0) nx = -nx;
        else if (nx > 1) nx = 2 - nx;
        if (ny < 0) ny = -ny;
        else if (ny > 1) ny = 2 - ny;
        px[i] = nx;
        py[i] = ny;
      }

      // ── pointer sprinkle: re-scatter a batch near the pointer ────────────
      if (draggingRef.current && pointerRef.current && plate.size > 0) {
        const ux = (pointerRef.current.x - plate.ox) / plate.size;
        const uy = (pointerRef.current.y - plate.oy) / plate.size;
        if (ux >= 0 && ux <= 1 && uy >= 0 && uy <= 1) {
          const batch = 420;
          for (let b = 0; b < batch; b++) {
            const i = (Math.random() * PARTICLE_COUNT) | 0;
            px[i] = clamp(ux + (Math.random() - 0.5) * 0.14, 0, 1);
            py[i] = clamp(uy + (Math.random() - 0.5) * 0.14, 0, 1);
          }
        }
      }

      // ── draw ──────────────────────────────────────────────────────────────
      // deep indigo / near-black plate with a gentle trailing wash
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#05060f";
      ctx.fillRect(0, 0, w, h);

      // plate body — a touch lighter than the void so its square reads
      const g = ctx.createRadialGradient(
        plate.ox + plate.size / 2,
        plate.oy + plate.size / 2,
        plate.size * 0.1,
        plate.ox + plate.size / 2,
        plate.oy + plate.size / 2,
        plate.size * 0.75,
      );
      g.addColorStop(0, "#0d1230");
      g.addColorStop(1, "#080a1c");
      ctx.fillStyle = g;
      ctx.fillRect(plate.ox, plate.oy, plate.size, plate.size);
      ctx.strokeStyle = "rgba(120,150,255,0.14)";
      ctx.lineWidth = 1;
      ctx.strokeRect(plate.ox + 0.5, plate.oy + 0.5, plate.size, plate.size);

      // luminous cyan-white sand; 'lighter' so packed nodal lines glow brighter
      ctx.globalCompositeOperation = "lighter";
      const alpha = reducedRef.current ? 0.22 : 0.3;
      ctx.fillStyle = `rgba(190,235,255,${alpha})`;
      const s = plate.size;
      const ox = plate.ox;
      const oy = plate.oy;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const cx = ox + px[i] * s;
        const cy = oy + py[i] * s;
        ctx.fillRect(cx, cy, 1.4, 1.4);
      }
      ctx.globalCompositeOperation = "source-over";

      // throttled readout update (~6/s)
      if (now - readoutTickRef.current > 160) {
        readoutTickRef.current = now;
        const ctxA = audioCtxRef.current;
        const analysis = analysisRef.current;
        let chordLabel = "—";
        if (audioLiveRef.current && analysis && ctxA && durationRef.current > 0) {
          const t =
            (ctxA.currentTime - startTimeRef.current) % durationRef.current;
          chordLabel = playbackChord(analysis, t).label;
        }
        setReadout({
          m: Math.round(m),
          n: Math.round(nn),
          chord: chordLabel,
          key: analysis?.key_signature ?? "—",
          hasAnalysis: !!analysis,
        });
      }
    };

    rafRef.current = requestAnimationFrame(frame);

    // pointer handlers
    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      toLocal(e);
    };
    const onMove = (e: PointerEvent) => {
      if (draggingRef.current) toLocal(e);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [seedParticles]);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      try {
        voiceRef.current?.src.stop();
      } catch {
        /* already stopped */
      }
      masterRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const currentTitle =
    REAL_TRACKS.find((t: WelcomeHomeTrack) => t.id === trackId)?.title ??
    DEFAULT_TRACK.title;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="A vibrating square plate. Grains of luminous sand migrate to the nodal lines of the standing wave driven by Karel's piano, forming a figure that morphs as the harmony changes."
      />

      {/* hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            cross-modal physics · chladni plate
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Chladnichord
          </h1>
          <p className="mt-1 max-w-md text-base text-muted-foreground">
            See the standing-wave shape of your own music — each chord as a
            physical vibration figure, drawn by sand finding the still lines of
            the plate.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!audioLive ? (
              <button
                type="button"
                onClick={() => begin(trackId)}
                disabled={loading}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? "Loading…" : "Play & watch the plate"}
              </button>
            ) : (
              <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 font-mono text-xs text-muted-foreground">
                sound live · {currentTitle}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>

          {/* track selector */}
          <div className="mt-3 flex max-w-lg flex-wrap gap-1.5">
            {REAL_TRACKS.map((t: WelcomeHomeTrack) => {
              const active = t.id === trackId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => (audioLive ? begin(t.id) : setTrackId(t.id))}
                  disabled={loading}
                  className={
                    active
                      ? "min-h-[32px] rounded-md bg-primary/90 px-3 text-xs font-medium text-primary-foreground transition-colors disabled:opacity-60"
                      : "min-h-[32px] rounded-md border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                  }
                >
                  {t.title}
                </button>
              );
            })}
          </div>

          {error && (
            <p className="mt-2 max-w-md text-base text-destructive">{error}</p>
          )}
          {noCanvas && (
            <p className="mt-2 max-w-md text-base text-destructive">
              Canvas2D is unavailable in this browser, so the plate can&apos;t be
              drawn.
            </p>
          )}
        </div>
      </div>

      {/* readout */}
      {audioLive && (
        <div className="pointer-events-none absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
          <div className="rounded-lg border border-border bg-background/70 px-4 py-3 text-right backdrop-blur-sm">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              plate mode
            </div>
            <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-foreground">
              ({readout.m},{readout.n})
            </div>
            <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
              chord · {readout.chord}
            </div>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground/80">
              {readout.hasAnalysis
                ? `key ${readout.key || "—"}`
                : "spectral-only mode"}
            </div>
          </div>
        </div>
      )}

      {/* hint */}
      {audioLive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
            drag on the plate to sprinkle fresh sand · watch it re-migrate
          </p>
        </div>
      )}

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Chladnichord — design notes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The question: what if you could SEE the standing-wave shape of your
              own music — the geometry of each chord as a physical vibration
              pattern?
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Karel&apos;s real piano loops through the ear-safe master. Its live
              harmony drives a square-plate Chladni simulation:{" "}
              {PARTICLE_COUNT.toLocaleString()} grains of sand migrate down the
              gradient of{" "}
              <span className="font-mono text-xs">
                f = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)
              </span>{" "}
              toward its nodal lines — the places on the plate that stay still —
              so the figure you see literally is the standing-wave geometry of
              the sound right now.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The chord&apos;s root and the spectrum&apos;s brightness pick the
              plate mode{" "}
              <span className="font-mono text-xs">(m,n)</span>, interpolated over
              ~0.8s so figures morph rather than snap. Loudness shakes the plate
              harder — quiet passages let the figure crystallize sharply. With no
              analysis available it degrades to the analyser spectrum alone.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Reference:{" "}
              <span className="text-foreground">ChladniSonify</span> — &ldquo;A
              Visual-Acoustic Mapping Method for Chladni Patterns in New Media Art
              Creation&rdquo; (arXiv 2605.09846, 2026); Ernst Chladni&apos;s plate
              experiments (1787); Nigel Stanford, &ldquo;Cymatics&rdquo; (2014).
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14896-chladnichord"]} />
    </main>
  );
}
