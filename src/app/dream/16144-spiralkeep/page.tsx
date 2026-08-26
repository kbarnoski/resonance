"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16144-spiralkeep — ONE living membrane per ALBUM that REMEMBERS.
//
// A cycle-2 graduation of 16000-morphonate. Morphonate grows a Gray-Scott coral
// that RESETS every visit and every track. Spiralkeep instead runs an EXCITABLE
// MEDIUM (the Barkley model — rotating spiral waves, not coral) and makes it
// PERSISTENT and PER-ALBUM: the (u,v) field is serialized to localStorage and
// restored on load, so the spirals RESUME scrolling across reloads and return
// visits, and every track in an album injects into the SAME accumulating field.
// Returning feels like returning to a weather system that kept turning while you
// were gone — the page even tells you how long it has been turning, across how
// many visits.
//
// Audio is ONLY Karel's real recording, routed through the safe master bus. His
// take plays start to finish; each note onset injects a supra-threshold
// excitation blob (pitch-class → angle, register → radius, velocity → size) and
// each chord change breaks a fresh wavefront at its root and re-steers the
// medium's excitability (bright/major → tighter faster spirals, quiet/minor →
// slow broad scrolls). No synthesis, ever; if the analysis is missing, onsets
// fall back to analyser spectral flux.
//
// Reference: D. Barkley, "A model for fast computer simulation of waves in
// excitable media", Physica D 49 (1991); the Belousov-Zhabotinsky reaction;
// EngramNCA (arXiv:2504.11855) as the "membrane that remembers" anchor.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { PrototypeNav } from "../_shared/prototype-nav";
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
import { createSpiralMedium, type SpiralMedium } from "./medium";
import {
  loadMedium,
  saveMedium,
  clearMedium,
  decodeField,
  formatAge,
} from "./persist";

// ── Barkley excitability defaults (steered per-frame by the harmony) ─────────
const A = 0.75;
const B_BASE = 0.02;
const EPS_BASE = 0.05;
const STEPS_ACTIVE = 8;
const STEPS_IDLE = 6;
const STEPS_REDUCED = 3;
const WARM_STEPS = 220; // birth spirals from a fresh seed before first frame
const AUTOSAVE_MS = 10000;

interface Excite {
  cx: number;
  cy: number;
  radius: number;
  amount: number;
  brk: boolean;
}

// ── small helpers (never prefixed `use`) ─────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Which album (collection name) a track belongs to — the persistence key. */
function albumOf(trackId: string): string {
  for (const c of COLLECTIONS) {
    if (c.tracks.some((t) => t.id === trackId)) return c.name;
  }
  return COLLECTIONS[0].name;
}

// Note → excitation blob: root pitch-class → angle, register → radius, velocity
// → size. Amount is kept supra-threshold so the blob actually launches a wave.
function exciteForNote(midi: number, velocity: number): Excite {
  const pc = ((midi % 12) + 12) % 12;
  const angle = (pc / 12) * Math.PI * 2 - Math.PI / 2;
  const reg = clamp((midi - 30) / 66, 0, 1);
  const ring = 0.06 + reg * 0.36;
  const vel = clamp(velocity / 127, 0, 1);
  return {
    cx: 0.5 + ring * Math.cos(angle),
    cy: 0.5 + ring * Math.sin(angle),
    radius: 0.015 + vel * 0.03,
    amount: 0.85 + vel * 0.15,
    brk: false,
  };
}

// ── component ────────────────────────────────────────────────────────────────

export default function SpiralkeepPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // display-only UI state
  const [playing, setPlaying] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [trackId, setTrackId] = useState(COLLECTIONS[0].tracks[0].id);
  const [trackTitle, setTrackTitle] = useState(COLLECTIONS[0].tracks[0].title);
  const [albumName, setAlbumName] = useState(COLLECTIONS[0].name);
  const [keyInfo, setKeyInfo] = useState<string | null>(null);
  const [chordLabel, setChordLabel] = useState<string>("—");
  const [driver, setDriver] = useState<"harmony" | "onset">("harmony");
  const [ageLabel, setAgeLabel] = useState<string>("0m 00s");
  const [visits, setVisits] = useState<number>(0);
  const [persistOk, setPersistOk] = useState(true);

  // engine + audio refs
  const engineRef = useRef<SpiralMedium | null>(null);
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
  const reducedRef = useRef(false);

  // per-album memory bookkeeping
  const loadedAlbumRef = useRef<string | null>(null);
  const ageBaseRef = useRef(0); // accumulated grow-time before this session
  const visitsRef = useRef(0);
  const sessionStartRef = useRef(0); // performance.now()/1000 when album loaded

  // fallback (spectral-flux) onset state
  const prevSpecRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const fluxAvgRef = useRef(0);
  const lastOnsetRef = useRef(0);
  const ambientClockRef = useRef(0);

  const actionsRef = useRef<{
    play: () => void;
    selectTrack: (id: string) => void;
    newMedium: () => void;
  } | null>(null);

  useEffect(() => {
    currentTrackRef.current = trackId;
  }, [trackId]);

  // Header chip: key + tempo for the selected take; degrade quietly.
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

  // ── the one big engine effect: GL, audio, memory, render loop ───────────────
  useEffect(() => {
    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas: HTMLCanvasElement = canvasMaybe;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const engine = createSpiralMedium(canvas);
    if (!engine) {
      setWebglOk(false);
      return;
    }
    engineRef.current = engine;

    // total accumulated grow-time for the currently-loaded album
    const computeAge = (): number =>
      ageBaseRef.current + (performance.now() / 1000 - sessionStartRef.current);

    // Save THIS album's field + age + visits. Never throws.
    const saveCurrent = (): void => {
      const album = loadedAlbumRef.current;
      const eng = engineRef.current;
      if (!album || !eng) return;
      const total = computeAge();
      saveMedium(album, eng.serialize(), total, visitsRef.current);
      // roll the accumulator forward so age stays monotonic without double count
      ageBaseRef.current = total;
      sessionStartRef.current = performance.now() / 1000;
      setAgeLabel(formatAge(total));
    };

    // Birth a fresh field of broken wavefronts and warm it into spirals.
    const seedFresh = (): void => {
      engine.seed(4);
      engine.step(A, B_BASE, EPS_BASE, WARM_STEPS);
    };

    // Load (or create) an album's remembered medium into the engine.
    const loadAlbum = (album: string): void => {
      const rec = loadMedium(album);
      let restored = false;
      if (rec) {
        const bytes = decodeField(rec);
        if (bytes && engine.restore(bytes)) {
          restored = true;
          ageBaseRef.current = rec.ageSeconds;
          visitsRef.current = rec.visits + 1;
          // nudge the restored field back to life (it may have paused mid-wave)
          engine.step(A, B_BASE, EPS_BASE, 40);
        }
      }
      if (!restored) {
        seedFresh();
        ageBaseRef.current = 0;
        visitsRef.current = 1;
      }
      sessionStartRef.current = performance.now() / 1000;
      loadedAlbumRef.current = album;
      setAlbumName(album);
      setVisits(visitsRef.current);
      setAgeLabel(formatAge(ageBaseRef.current));
      // persist immediately so the visit is remembered even on a quick exit
      saveCurrent();
    };

    // Initial album for the initially-selected take.
    loadAlbum(albumOf(currentTrackRef.current));

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

    // Fallback onset: spectral flux, splat from centroid + loudness.
    const detectFluxOnset = (now: number): Excite | null => {
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
        const c = (cur[i] + 140) / 140;
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
      if (flux > avg * 1.8 + 0.004 && now - lastOnsetRef.current > 150) {
        lastOnsetRef.current = now;
        const centroid = mag > 0 ? wsum / (mag * n) : 0.5;
        const angle = centroid * Math.PI * 2 - Math.PI / 2;
        const energy = readEnergy();
        const ring = 0.06 + centroid * 0.34;
        return {
          cx: 0.5 + ring * Math.cos(angle),
          cy: 0.5 + ring * Math.sin(angle),
          radius: 0.02 + energy * 0.04,
          amount: 0.85 + energy * 0.15,
          brk: energy > 0.4,
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

      let energy = 0.12;
      let epsNow = EPS_BASE;
      let bNow = B_BASE;
      const injects: Excite[] = [];

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
              injects.push(exciteForNote(note.midi, note.velocity));
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
            // Chord quality + energy steer the excitability of the medium:
            // bright/major → smaller eps (tighter, faster spirals); quiet/minor
            // → larger eps (slow, broad scrolls).
            epsNow =
              EPS_BASE + (minor ? 0.02 : -0.012) - energy * 0.008;
            bNow = B_BASE + (minor ? 0.008 : -0.004) + energy * 0.004;
            // A chord CHANGE breaks a fresh wavefront at its root — a new defect
            // that accumulates into the album's history.
            if (cp !== lastChordRef.current) {
              lastChordRef.current = cp;
              setChordLabel(chord.chord);
              const root = chordRoot(chord.chord);
              if (root !== null) {
                const angle = (root / 12) * Math.PI * 2 - Math.PI / 2;
                const ring = minor ? 0.16 : 0.26;
                injects.push({
                  cx: 0.5 + ring * Math.cos(angle),
                  cy: 0.5 + ring * Math.sin(angle),
                  radius: 0.05 + energy * 0.04,
                  amount: 1.0,
                  brk: true,
                });
              }
            }
          }
        } else {
          // ONSET DRIVER (no analysis) — spectral-flux, centroid steers eps.
          const s = detectFluxOnset(nowMs);
          if (s) injects.push(s);
          epsNow = EPS_BASE - energy * 0.012;
          bNow = B_BASE - energy * 0.003;
        }
      } else {
        // AMBIENT (pre-play): occasional gentle broken injections so the medium
        // is visibly turning before the take begins. Calmer if reduced-motion.
        const period = reduced ? 9000 : 4600;
        if (nowMs - ambientClockRef.current > period) {
          ambientClockRef.current = nowMs;
          const a = Math.random() * Math.PI * 2;
          const r = 0.1 + Math.random() * 0.3;
          injects.push({
            cx: 0.5 + r * Math.cos(a),
            cy: 0.5 + r * Math.sin(a),
            radius: 0.03,
            amount: 0.95,
            brk: Math.random() < 0.5,
          });
        }
      }

      epsNow = clamp(epsNow, 0.028, 0.09);
      bNow = clamp(bNow, 0.006, 0.03);

      for (const s of injects) eng.inject(s.cx, s.cy, s.radius, s.amount, s.brk);

      const steps = reduced
        ? STEPS_REDUCED
        : playingRef.current
          ? STEPS_ACTIVE
          : STEPS_IDLE;
      eng.step(A, bNow, epsNow, steps);
      eng.render(w, h, energy);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // periodic readouts + autosave
    const ageTimer = window.setInterval(() => {
      setAgeLabel(formatAge(computeAge()));
    }, 1000);
    const saveTimer = window.setInterval(saveCurrent, AUTOSAVE_MS);

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

    // Start (or restart) Karel's real take for `id`. Never touches the field —
    // switching takes inside an album keeps the medium scrolling.
    async function startTake(id: string): Promise<void> {
      if (startingRef.current) return;
      startingRef.current = true;
      try {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
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
        const buf = await ensureBuffer(ctx, id);
        const master = masterRef.current;
        if (!buf || !master) return;

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
    }

    actionsRef.current = {
      play: () => {
        if (playingRef.current) return;
        void startTake(currentTrackRef.current);
      },
      selectTrack: (id) => {
        const prevAlbum = loadedAlbumRef.current;
        const nextAlbum = albumOf(id);
        currentTrackRef.current = id;
        // switching ALBUMS swaps the remembered medium; switching takes WITHIN
        // an album leaves the field turning untouched.
        if (nextAlbum !== prevAlbum) {
          saveCurrent();
          loadAlbum(nextAlbum);
        }
        if (playingRef.current) void startTake(id);
      },
      newMedium: () => {
        const album = loadedAlbumRef.current;
        if (!album) return;
        clearMedium(album);
        seedFresh();
        ageBaseRef.current = 0;
        visitsRef.current = 1;
        sessionStartRef.current = performance.now() / 1000;
        setVisits(1);
        setAgeLabel(formatAge(0));
        setChordLabel("—");
        saveCurrent();
      },
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveCurrent();
    };
    const onBeforeUnload = () => saveCurrent();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);

    // surface whether persistence is actually available (private mode → off)
    try {
      const probe = "dream:spiralkeep:probe";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
    } catch {
      setPersistOk(false);
    }

    // ── cleanup ────────────────────────────────────────────────────────────
    return () => {
      saveCurrent();
      cancelAnimationFrame(raf);
      window.clearInterval(ageTimer);
      window.clearInterval(saveTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
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
    // Mount-once engine; UI reads/writes flow through refs and state setters.
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
            Dream 16144 · spiralkeep
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            A membrane that remembers
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            One excitable medium per album, growing rotating spiral waves that
            keep scrolling across visits and across every track — return to it
            and it kept turning while you were gone.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
              album: <span className="text-foreground">{albumName}</span>
            </span>
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
          Read the design notes
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
          <div className="max-w-sm text-center">
            <p className="text-base leading-relaxed text-destructive">
              This browser doesn&apos;t provide WebGL2 with float render targets.
            </p>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              The excitable medium needs them to grow its spiral waves. Try a
              recent Chrome, Firefox, or Safari.
            </p>
          </div>
        </div>
      )}

      {/* bottom controls */}
      {webglOk && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 pb-16 sm:p-6 sm:pb-16">
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
                  Take is live — the medium is turning
                </span>
              )}

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs uppercase tracking-[0.18em]">
                  take
                </span>
                <select
                  value={trackId}
                  onChange={(e) => {
                    setTrackId(e.target.value);
                    actionsRef.current?.selectTrack(e.target.value);
                  }}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
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
                onClick={() => setConfirmNew(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                New medium
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <p className="text-sm leading-relaxed text-muted-foreground">
                This {albumName} medium has been turning{" "}
                <span className="text-foreground">{ageLabel}</span> across{" "}
                <span className="text-foreground">{visits}</span>{" "}
                {visits === 1 ? "visit" : "visits"}.
              </p>
              {!persistOk && (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  memory off (private mode)
                </span>
              )}
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Press play and let it run. Each note injects excitation where its
              pitch-class points; each chord change breaks a fresh wavefront and
              re-steers the medium — bright passages spin tight fast spirals,
              quiet ones settle into slow broad scrolls. Nothing resets: switch
              takes and the same field keeps turning; come back tomorrow and it
              is exactly where you left it.
            </p>
          </div>
        </div>
      )}

      {/* confirm: New medium */}
      {confirmNew && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setConfirmNew(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Start a new {albumName} medium?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              This forgets everything this album&apos;s medium has accumulated —
              its {ageLabel} of turning and every spiral it grew — and seeds a
              fresh field of broken wavefronts. This cannot be undone.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => {
                  actionsRef.current?.newMedium();
                  setConfirmNew(false);
                }}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Seed a new medium
              </button>
              <button
                onClick={() => setConfirmNew(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Keep turning
              </button>
            </div>
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
                if Karel&apos;s whole album grew one living membrane that
                remembers — an excitable medium whose spiral waves keep scrolling
                across visits and across every track, never resetting, so
                returning to it feels like returning to a weather system that
                kept turning while you were gone?
              </p>
              <p>
                <span className="text-foreground">An excitable medium.</span> Two
                fields run on the GPU — u, a fast excitation, and v, a slow
                recovery — under the Barkley model: du/dt = (1/ε)·u(1−u)(u−(v+b)/a)
                + Du·∇²u, dv/dt = u − v. Unlike morphonate&apos;s Gray-Scott coral,
                an excitable medium grows rotating spiral waves and spreading
                target fronts: a broken wavefront curls up into a spiral, and
                defects accumulate into turbulence.
              </p>
              <p>
                <span className="text-foreground">
                  A membrane that remembers.
                </span>{" "}
                The field is downsampled, byte-packed, and saved to localStorage
                under a per-album key, then restored on load — so the spirals
                resume where they left off across reloads and return visits. It
                also keeps its age and visit count: this medium has been turning{" "}
                {ageLabel} across {visits}{" "}
                {visits === 1 ? "visit" : "visits"}. One medium per album, not per
                track: switching takes within an album keeps the same field
                turning and injects new excitation into it.
              </p>
              <p>
                <span className="text-foreground">Harmony as weather.</span>{" "}
                Karel&apos;s real take plays start to finish. Each note injects a
                supra-threshold excitation blob (pitch-class → angle, register →
                radius, velocity → size). Each chord change breaks a fresh
                wavefront at its root and re-steers the medium&apos;s
                excitability — bright, major passages tighten into fast spirals;
                quiet, minor ones spread into slow broad scrolls. If a
                take&apos;s analysis is missing, injections fall back to analyser
                spectral-flux onsets. No synthesis, ever.
              </p>
              <p>
                <span className="text-foreground">Palette.</span> Saturated
                cyan-teal ink on a cool bone/porcelain ground: excited wavefronts
                glow bright cyan, the refractory tail deepens to teal on pale cool
                paper — a deliberately cool third register, neither warm ember nor
                grayscale.
              </p>
              <p>
                <span className="text-foreground">
                  What&apos;s new vs morphonate.
                </span>{" "}
                16000-morphonate is a Gray-Scott membrane that resets every visit
                and every track. Spiralkeep changes the substrate to an excitable
                medium (spirals, not coral), adds true localStorage persistence
                with age and visit tracking, makes the field per-album and
                accumulating across takes, and commits the cyan-teal-on-bone
                palette. It does not claim to be a lab first — only a graduation
                of that specific prototype.
              </p>
              <p>
                <span className="text-foreground">References.</span> D. Barkley,{" "}
                <em>
                  A model for fast computer simulation of waves in excitable media
                </em>{" "}
                (Physica D, 1991); the Belousov-Zhabotinsky reaction; and EngramNCA
                (arXiv:2504.11855), a neural-cellular-automaton model of memory
                transfer, as the &ldquo;membrane that remembers&rdquo; anchor.
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                input: autonomous(his-take+harmony) · output:
                WebGL2-excitable-medium(persistent,per-album) · technique:
                Barkley-spiral-waves-steered-by-harmony · palette:
                cyan-teal-on-bone
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

      <PrototypeNav slugs={["16144-spiralkeep"]} />
    </div>
  );
}
