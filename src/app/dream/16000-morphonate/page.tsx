"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16000-morphonate — a living reaction–diffusion membrane that Karel's harmony
// literally grows. His full real recording plays start to finish; a GPU
// Gray-Scott simulation (two chemicals ping-ponged through a fragment shader)
// evolves continuously and is never reset — so a five-minute take paints an
// ever-different organism that is never the same at minute 5 as at minute 1.
//
// Each note/chord onset injects a soft splat of activator at a screen position
// derived from the chord root (pitch-class → angle) and register (→ radius);
// loud onsets make bigger splats. The current chord's quality (major/minor) and
// the analyser's spectral energy steer the feed/kill "climate", so bright major
// passages bloom into fine coral while quiet minor ones settle into slow blobs.
//
// Audio is ONLY Karel's real recording, routed through the safe master bus and
// analysed for spectral energy. If the precomputed analysis is missing, splats
// fall back to analyser onset detection (spectral flux) so the piece still lives.
//
// Reference: Alan Turing, "The Chemical Basis of Morphogenesis" (1952); the
// Gray-Scott model; Karl Sims' GPU reaction–diffusion work.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  loadTrackAnalysis,
  type TrackAnalysis,
  chordRoot,
  chordIsMinor,
} from "../_shared/trackAnalysis";
import { createMorphoEngine, type MorphoEngine } from "./morphogl";

// ── RD "climate" defaults (Gray-Scott feed/kill) ────────────────────────────
const BASE_FEED = 0.0545;
const BASE_KILL = 0.062;
const STEPS_ACTIVE = 6;
const STEPS_REDUCED = 2;

interface Splat {
  cx: number;
  cy: number;
  radius: number;
  amount: number;
}

// ── small helpers (never prefixed `use`) ─────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Map a note (root pitch-class → angle, register → radius, velocity → size) to
// a splat position + strength on the membrane.
function splatForNote(midi: number, velocity: number): Splat {
  const pc = ((midi % 12) + 12) % 12;
  const angle = (pc / 12) * Math.PI * 2 - Math.PI / 2;
  const reg = clamp((midi - 30) / 66, 0, 1); // low..high register
  const ring = 0.05 + reg * 0.38;
  const vel = clamp(velocity / 127, 0, 1);
  return {
    cx: 0.5 + ring * Math.cos(angle),
    cy: 0.5 + ring * Math.sin(angle),
    radius: 0.018 + vel * 0.05,
    amount: 0.5 + vel * 0.5,
  };
}

// ── component ────────────────────────────────────────────────────────────────

export default function MorphonatePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // display-only UI state
  const [playing, setPlaying] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [trackId, setTrackId] = useState(COLLECTIONS[0].tracks[0].id);
  const [trackTitle, setTrackTitle] = useState(COLLECTIONS[0].tracks[0].title);
  const [keyInfo, setKeyInfo] = useState<string | null>(null);
  const [chordLabel, setChordLabel] = useState<string>("—");
  const [driver, setDriver] = useState<"harmony" | "onset">("harmony");
  const [feed, setFeed] = useState(BASE_FEED);
  const [kill, setKill] = useState(BASE_KILL);

  // engine refs
  const engineRef = useRef<MorphoEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<Map<string, AudioBuffer>>(new Map());
  const analysisRef = useRef<TrackAnalysis | null>(null);
  const startTimeRef = useRef(0);
  const notePtrRef = useRef(0);
  const chordPtrRef = useRef(0);
  const lastChordRef = useRef(-1);
  const playingRef = useRef(false);
  const startingRef = useRef(false);
  const currentTrackRef = useRef(trackId);
  const feedRef = useRef(feed);
  const killRef = useRef(kill);
  const reducedRef = useRef(false);

  // fallback (spectral-flux) onset detection state
  const prevSpecRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const fluxAvgRef = useRef(0);
  const lastOnsetRef = useRef(0);
  const ambientClockRef = useRef(0);

  const actionsRef = useRef<{ play: () => void; reseed: () => void } | null>(
    null,
  );

  useEffect(() => {
    currentTrackRef.current = trackId;
  }, [trackId]);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);
  useEffect(() => {
    killRef.current = kill;
  }, [kill]);

  // Lightweight analysis for the header chip; degrade quietly.
  useEffect(() => {
    let alive = true;
    setKeyInfo(null);
    loadTrackAnalysis(trackId)
      .then((a) => {
        if (!alive || !a) return;
        const parts: string[] = [];
        if (a.key_signature) parts.push(a.key_signature);
        if (a.tempo) parts.push(`${Math.round(a.tempo)} bpm`);
        if (parts.length) setKeyInfo(parts.join(" · "));
      })
      .catch(() => {
        /* analysis is optional */
      });
    return () => {
      alive = false;
    };
  }, [trackId]);

  // ── the one big engine effect: GL, audio, render loop ───────────────────────
  useEffect(() => {
    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas: HTMLCanvasElement = canvasMaybe;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const engine = createMorphoEngine(canvas);
    if (!engine) {
      setWebglOk(false);
      return;
    }
    engineRef.current = engine;

    // Ignite a fresh membrane and warm it up so the idle canvas already lives.
    const igniteMembrane = () => {
      const seeds: Array<[number, number]> = [];
      const n = 6 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        seeds.push([0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6]);
      }
      engine.seed(seeds);
      engine.step(BASE_FEED, BASE_KILL, 240); // warm the pattern into being
    };
    igniteMembrane();

    const sizeCanvas = (): { w: number; h: number } => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      return { w, h };
    };

    // Spectral energy (0..1) from the safe-master analyser.
    const readEnergy = (): number => {
      const analyser = masterRef.current?.analyser;
      if (!analyser) return 0;
      const n = analyser.frequencyBinCount;
      const freq: Uint8Array<ArrayBuffer> = new Uint8Array(n);
      analyser.getByteFrequencyData(freq);
      let sum = 0;
      for (let i = 1; i < n; i++) sum += freq[i];
      return clamp(sum / (n * 200), 0, 1);
    };

    // Fallback: detect onsets by spectral flux, splat from centroid + loudness.
    const detectFluxOnset = (now: number): Splat | null => {
      const analyser = masterRef.current?.analyser;
      if (!analyser) return null;
      const n = analyser.frequencyBinCount;
      const cur: Float32Array<ArrayBuffer> = new Float32Array(n);
      analyser.getFloatFrequencyData(cur);
      const prev = prevSpecRef.current;
      prevSpecRef.current = cur;
      if (!prev || prev.length !== n) return null;
      let flux = 0;
      let wsum = 0;
      let mag = 0;
      for (let i = 1; i < n; i++) {
        const c = (cur[i] + 140) / 140; // dB → rough 0..1
        const p = (prev[i] + 140) / 140;
        const d = c - p;
        if (d > 0) flux += d;
        const m = Math.max(0, c);
        wsum += m * i;
        mag += m;
      }
      flux /= n;
      const avg = fluxAvgRef.current * 0.92 + flux * 0.08;
      fluxAvgRef.current = avg;
      if (flux > avg * 1.8 + 0.004 && now - lastOnsetRef.current > 160) {
        lastOnsetRef.current = now;
        const centroid = mag > 0 ? wsum / (mag * n) : 0.5; // 0..1
        const angle = centroid * Math.PI * 2 - Math.PI / 2;
        const energy = readEnergy();
        const ring = 0.06 + centroid * 0.36;
        return {
          cx: 0.5 + ring * Math.cos(angle),
          cy: 0.5 + ring * Math.sin(angle),
          radius: 0.02 + energy * 0.05,
          amount: 0.45 + energy * 0.55,
        };
      }
      return null;
    };

    let raf = 0;
    const frame = () => {
      const { w, h } = sizeCanvas();
      const nowMs = performance.now();
      const reduced = reducedRef.current;
      const eng = engineRef.current;
      if (!eng) return;

      let energy = 0.14;
      let feedNow = feedRef.current;
      let killNow = killRef.current;
      const splats: Splat[] = [];

      if (playingRef.current && ctxRef.current) {
        const elapsed = ctxRef.current.currentTime - startTimeRef.current;
        energy = readEnergy();
        const analysis = analysisRef.current;

        if (analysis && analysis.notes.length) {
          // HARMONY DRIVER — walk the note + chord timelines against playback.
          let np = notePtrRef.current;
          let produced = 0;
          while (
            np < analysis.notes.length &&
            analysis.notes[np].time <= elapsed
          ) {
            const note = analysis.notes[np];
            if (elapsed - note.time < 0.4 && produced < 4) {
              splats.push(splatForNote(note.midi, note.velocity));
              produced++;
            }
            np++;
          }
          notePtrRef.current = np;

          let cp = chordPtrRef.current;
          while (
            cp + 1 < analysis.chords.length &&
            analysis.chords[cp + 1].time <= elapsed
          ) {
            cp++;
          }
          chordPtrRef.current = cp;
          const chord = analysis.chords[cp];
          if (chord) {
            const minor = chordIsMinor(chord.chord);
            // Chord quality + energy steer the feed/kill morphology.
            feedNow =
              feedRef.current + energy * 0.01 + (minor ? -0.004 : 0.003);
            killNow =
              killRef.current + energy * 0.0035 + (minor ? -0.002 : 0.001);
            // A chord CHANGE marks itself with a larger reagent bloom at its root.
            if (cp !== lastChordRef.current) {
              lastChordRef.current = cp;
              setChordLabel(chord.chord);
              const root = chordRoot(chord.chord);
              if (root !== null) {
                const angle = (root / 12) * Math.PI * 2 - Math.PI / 2;
                const ring = minor ? 0.16 : 0.26;
                splats.push({
                  cx: 0.5 + ring * Math.cos(angle),
                  cy: 0.5 + ring * Math.sin(angle),
                  radius: 0.06 + energy * 0.05,
                  amount: 0.7 + energy * 0.3,
                });
              }
            }
          }
        } else {
          // ONSET DRIVER (no analysis) — spectral-flux splats, centroid steers climate.
          const s = detectFluxOnset(nowMs);
          if (s) splats.push(s);
          feedNow = feedRef.current + energy * 0.012;
          killNow = killRef.current + energy * 0.004;
        }
      } else {
        // AMBIENT (pre-play): a slow drift + the occasional gentle auto-splat so
        // the membrane is alive before the take begins. Held calm if reduced.
        const period = reduced ? 9000 : 4200;
        if (nowMs - ambientClockRef.current > period) {
          ambientClockRef.current = nowMs;
          const a = Math.random() * Math.PI * 2;
          const r = 0.1 + Math.random() * 0.3;
          splats.push({
            cx: 0.5 + r * Math.cos(a),
            cy: 0.5 + r * Math.sin(a),
            radius: 0.03,
            amount: 0.6,
          });
        }
      }

      feedNow = clamp(feedNow, 0.01, 0.09);
      killNow = clamp(killNow, 0.045, 0.075);

      for (const s of splats) eng.splat(s.cx, s.cy, s.radius, s.amount);

      const steps = reduced
        ? STEPS_REDUCED
        : playingRef.current
          ? STEPS_ACTIVE
          : 3;
      eng.step(feedNow, killNow, steps);
      eng.render(w, h, energy);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ── audio / actions ──────────────────────────────────────────────────────
    async function ensureBuffer(
      ctx: AudioContext,
      id: string,
    ): Promise<AudioBuffer | null> {
      const cached = bufferRef.current.get(id);
      if (cached) return cached;
      try {
        const { buffer, title } = await loadRealTrackBuffer(ctx, id);
        bufferRef.current.set(id, buffer);
        if (id === currentTrackRef.current) setTrackTitle(title);
        return buffer;
      } catch {
        setError(
          "Could not load Karel's recording. Check the connection and try again.",
        );
        return null;
      }
    }

    function stopSource(): void {
      const src = srcRef.current;
      if (src) {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        try {
          src.disconnect();
        } catch {
          /* detached */
        }
        srcRef.current = null;
      }
    }

    actionsRef.current = {
      play: () => {
        if (playingRef.current || startingRef.current) return;
        startingRef.current = true;
        void (async () => {
          try {
            const AC =
              window.AudioContext ??
              (
                window as unknown as {
                  webkitAudioContext?: typeof AudioContext;
                }
              ).webkitAudioContext;
            if (!AC) {
              setError("Web Audio is unavailable in this browser.");
              return;
            }
            let ctx = ctxRef.current;
            if (!ctx) {
              ctx = new AC();
              ctxRef.current = ctx;
              masterRef.current = createSafeMaster(ctx);
            }
            await ctx.resume();
            const id = currentTrackRef.current;
            const buf = await ensureBuffer(ctx, id);
            const master = masterRef.current;
            if (!buf || !master) return;

            // Load the analysis for THIS take (or null → onset fallback).
            const a = await loadTrackAnalysis(id).catch(() => null);
            analysisRef.current = a;
            setDriver(a && a.notes.length ? "harmony" : "onset");

            stopSource();
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(master.input);
            src.onended = () => {
              if (srcRef.current === src) {
                playingRef.current = false;
                setPlaying(false);
              }
            };
            notePtrRef.current = 0;
            chordPtrRef.current = 0;
            lastChordRef.current = -1;
            prevSpecRef.current = null;
            fluxAvgRef.current = 0;
            startTimeRef.current = ctx.currentTime;
            src.start(0);
            srcRef.current = src;
            playingRef.current = true;
            setPlaying(true);
          } finally {
            startingRef.current = false;
          }
        })();
      },
      reseed: () => {
        igniteMembrane();
      },
    };

    // ── cleanup ────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      stopSource();
      const ctx = ctxRef.current;
      if (ctx) {
        masterRef.current?.disconnect();
        void ctx.close().catch(() => {});
      }
      engineRef.current?.dispose();
      engineRef.current = null;
      ctxRef.current = null;
      masterRef.current = null;
    };
    // Mount-once engine; UI reads/writes go through refs and state setters.
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* top-left: title + one-sentence description + chips */}
      <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-6">
        <div className="pointer-events-auto max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 16000 · morphonate
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            A membrane his harmony grows
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Karel&apos;s full take feeds a living reaction–diffusion organism —
            his chords seed and steer it, so the image is never the same at
            minute five as at minute one.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
              {trackTitle}
            </span>
            {keyInfo && (
              <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-muted-foreground">
                {keyInfo}
              </span>
            )}
            <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
              chord: <span className="text-foreground">{chordLabel}</span>
            </span>
            <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
              drive: {driver}
            </span>
          </div>
        </div>
      </div>

      {/* top-right: design notes */}
      <div className="pointer-events-none absolute right-0 top-0 p-5 sm:p-6">
        <button
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* error / webgl notice */}
      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center px-4">
          <p className="pointer-events-auto rounded-md border border-destructive/40 bg-background/80 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        </div>
      )}
      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className="max-w-sm text-center text-base leading-relaxed text-muted-foreground">
            This piece needs WebGL2 with float render targets to grow its
            membrane, and this browser doesn&apos;t provide them. Try a recent
            Chrome, Firefox, or Safari.
          </p>
        </div>
      )}

      {/* bottom controls */}
      {webglOk && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-3">
              {!playing ? (
                <button
                  onClick={() => actionsRef.current?.play()}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Play the take
                </button>
              ) : (
                <span className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
                  Take is live — the membrane is growing
                </span>
              )}

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs uppercase tracking-[0.18em]">
                  take
                </span>
                <select
                  value={trackId}
                  disabled={playing}
                  onChange={(e) => {
                    setTrackId(e.target.value);
                    currentTrackRef.current = e.target.value;
                  }}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
                >
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <button
                onClick={() => actionsRef.current?.reseed()}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                New membrane
              </button>
            </div>

            {/* RD climate sliders */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="w-24 font-mono text-xs uppercase tracking-[0.18em]">
                  feed {feed.toFixed(4)}
                </span>
                <input
                  type="range"
                  min={0.02}
                  max={0.07}
                  step={0.0005}
                  value={feed}
                  onChange={(e) => setFeed(parseFloat(e.target.value))}
                  className="h-1 w-40 cursor-pointer accent-foreground"
                />
              </label>
              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="w-24 font-mono text-xs uppercase tracking-[0.18em]">
                  kill {kill.toFixed(4)}
                </span>
                <input
                  type="range"
                  min={0.05}
                  max={0.07}
                  step={0.0005}
                  value={kill}
                  onChange={(e) => setKill(parseFloat(e.target.value))}
                  className="h-1 w-40 cursor-pointer accent-foreground"
                />
              </label>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Press play and let it run. Each note injects reagent where the
              pitch-class points; each chord change steers the climate — bright
              passages bloom into fine coral, quiet ones settle into slow blobs.
              The membrane keeps its whole history, so leave it a while.
            </p>
          </div>
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question:</span> what
                if Karel&apos;s harmony literally grew the image — a living
                membrane that his chord changes seed and steer, so a five-minute
                take paints an organism that is never the same at minute five as
                at minute one?
              </p>
              <p>
                <span className="text-foreground">
                  A morphogenic membrane.
                </span>{" "}
                A Gray-Scott reaction–diffusion simulation runs entirely on the
                GPU: two chemicals — a substrate and an activator — live in a
                pair of float textures that are ping-ponged through a fragment
                shader many times a frame. Diffusion plus the reaction term
                spontaneously forms spots, stripes, mitosis, and coral. Nothing
                is ever reset, so the field carries its whole history.
              </p>
              <p>
                <span className="text-foreground">Harmony as gardener.</span>{" "}
                His real recording plays start to finish. Every note injects a
                soft splat of activator at a position set by its pitch-class
                (root → angle) and register (→ radius); louder notes make bigger
                splats. Each chord change blooms a larger reagent seed at its
                root and re-steers the feed/kill climate — major and bright
                passages push toward fine coral, minor and quiet ones toward
                slow blobs — so the pattern&apos;s morphology tracks the music.
              </p>
              <p>
                <span className="text-foreground">Palette.</span> Deliberately
                achromatic: a near-black substrate, a luminous bone-white
                membrane, and only a whisper of cold cyan along the most active
                reaction fronts when the music is bright.
              </p>
              <p>
                <span className="text-foreground">Only his sound.</span> The
                audio is Karel&apos;s real take alone, routed through the safe
                master bus; its spectral energy drives the visuals. If a
                take&apos;s precomputed analysis is missing, splats fall back to
                analyser onset detection (spectral flux) so the membrane still
                lives.
              </p>
              <p>
                <span className="text-foreground">References.</span> Alan
                Turing, <em>The Chemical Basis of Morphogenesis</em> (1952),
                which proposed reaction–diffusion as the mechanism of biological
                pattern formation; the Gray-Scott model of it; and Karl Sims&apos;
                GPU reaction–diffusion work.
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                input: autonomous(his-take+harmony) · output:
                WebGL2-reaction-diffusion · technique:
                Gray-Scott-morphogenesis-steered-by-harmony · palette:
                achromatic-ink
              </p>
            </div>
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
