"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  loadTrackAnalysis,
  chordRoot,
  pitchClassHue,
  type TrackAnalysis,
} from "../_shared/trackAnalysis";
import { NebulaScene, hasWebGL, type NebulaFrame } from "./scene";
import { chordToField, neutralField, type ChordField } from "./chordField";

// ─────────────────────────────────────────────────────────────────────────────
// 16752-chordnebula — the inside of one of Karel's recordings, as a place.
//
// A three.js volumetric raymarched nebula (fullscreen ShaderMaterial) you slowly
// drift through. His track plays; the live FFT is the nebula's breath, and the
// CHORD actually sounding sets the hue + structure: its pitch-classes bloom as
// coloured light-cores inside the cloud, consonant chords open calm luminous
// caverns, dense chords thicken + darken the medium. The cosmic-ambient pole —
// meditative, boundless, slow. A place to be inside, not an assault.
// ─────────────────────────────────────────────────────────────────────────────

/** Circular approach toward a target hue (0..1) along the shortest arc. */
function approachHue(cur: number, target: number, k: number): number {
  let d = target - cur;
  d -= Math.round(d); // wrap to [-0.5, 0.5)
  let v = cur + d * k;
  v -= Math.floor(v);
  return v;
}

interface Bands {
  energy: number;
  bass: number;
  mid: number;
  treble: number;
}

function readBands(freq: Uint8Array): Bands {
  const n = freq.length;
  const avg = (lo: number, hi: number) => {
    const a = Math.max(0, Math.floor(lo));
    const b = Math.min(n, Math.floor(hi));
    let s = 0;
    for (let i = a; i < b; i++) s += freq[i];
    return b > a ? s / (b - a) / 255 : 0;
  };
  // bins are ~43 Hz wide at fftSize 1024 / 44.1k.
  return {
    bass: avg(1, 8),
    mid: avg(8, 60),
    treble: avg(60, 240),
    energy: avg(1, 200),
  };
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [nowTitle, setNowTitle] = useState<string | null>(null);
  const [chordLabel, setChordLabel] = useState<string>("—");
  const [error, setError] = useState<string | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [analysisMissing, setAnalysisMissing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── engine refs ────────────────────────────────────────────────────────────
  const sceneRef = useRef<NebulaScene | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const analysisRef = useRef<TrackAnalysis | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const playingRef = useRef(false);
  const startCtxTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const pausedOffsetRef = useRef(0);
  const chordIdxRef = useRef(0);

  const rafRef = useRef<number | null>(null);
  const reducedRef = useRef(false);

  // smoothed visual state (mutated in the frame loop, no re-render)
  const fieldRef = useRef<ChordField>(neutralField());
  const smoothRef = useRef({
    energy: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    consonance: 0.55,
    densityBias: 0,
    minor: 0,
    rootHue: 0,
    hasChord: 0,
  });
  const pcSmoothRef = useRef<number[]>(new Array<number>(12).fill(0));
  const shaderTimeRef = useRef(0);
  const lookTargetRef = useRef({ x: 0, y: 0 });
  const lookRef = useRef({ x: 0, y: 0 });
  const lastNowRef = useRef(0);
  const labelTickRef = useRef(0);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // ── Mount: build the GL nebula + start the idle drift immediately ──────────
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const canvas = canvasRef.current;
    const mount = mountRef.current;
    if (!canvas || !mount) return;

    if (!hasWebGL()) {
      setWebglFailed(true);
      return;
    }
    let scene: NebulaScene;
    try {
      scene = new NebulaScene(canvas);
    } catch {
      setWebglFailed(true);
      return;
    }
    sceneRef.current = scene;

    const runResize = () => {
      const r = mount.getBoundingClientRect();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      scene.resize(r.width, r.height, dpr);
    };
    runResize();
    window.addEventListener("resize", runResize);

    lastNowRef.current = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastNowRef.current) / 1000);
      lastNowRef.current = now;
      shaderTimeRef.current += dt * (reducedRef.current ? 0.55 : 1);

      const sm = smoothRef.current;

      // ── targets: FFT breath + current chord field (only while playing) ──────
      let tE = 0,
        tB = 0,
        tM = 0,
        tT = 0;
      let tField = fieldRef.current;
      let tHasChord = 0;
      let tRootHue = sm.rootHue;

      const master = masterRef.current;
      const freq = freqRef.current;
      if (playingRef.current && master && freq) {
        master.analyser.getByteFrequencyData(freq);
        const bands = readBands(freq);
        tE = bands.energy;
        tB = bands.bass;
        tM = bands.mid;
        tT = bands.treble;

        const analysis = analysisRef.current;
        const buffer = bufferRef.current;
        const ctx = ctxRef.current;
        if (analysis && analysis.chords.length && buffer && ctx) {
          const dur = buffer.duration || 1;
          let pos =
            startOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current);
          pos = ((pos % dur) + dur) % dur;
          const chords = analysis.chords;
          let idx = chordIdxRef.current;
          if (idx >= chords.length || chords[idx].time > pos) idx = 0;
          while (idx + 1 < chords.length && chords[idx + 1].time <= pos) idx++;
          chordIdxRef.current = idx;
          const c = chords[idx];
          if (c) {
            tField = chordToField(c.chord);
            fieldRef.current = tField;
            tHasChord = 1;
            const root = chordRoot(c.chord);
            if (root !== null) tRootHue = pitchClassHue(root) / 360;
            // throttle React label updates to ~4/s
            if (now - labelTickRef.current > 240) {
              labelTickRef.current = now;
              setChordLabel(c.chord);
            }
          }
        }
      }

      // ── slow smoothing (no strobe) ──────────────────────────────────────────
      const ke = 0.08; // energy/bands
      const kf = 0.05; // fields + pcs (gentle chord cross-fades)
      sm.energy += (tE - sm.energy) * ke;
      sm.bass += (tB - sm.bass) * ke;
      sm.mid += (tM - sm.mid) * ke;
      sm.treble += (tT - sm.treble) * ke;
      sm.consonance += (tField.consonance - sm.consonance) * kf;
      sm.densityBias += (tField.densityBias - sm.densityBias) * kf;
      sm.minor += (tField.minor - sm.minor) * kf;
      sm.hasChord += (tHasChord - sm.hasChord) * kf;
      sm.rootHue = approachHue(sm.rootHue, tRootHue, kf);

      const pc = pcSmoothRef.current;
      const tgt = tField.pcs;
      for (let i = 0; i < 12; i++) pc[i] += (tgt[i] - pc[i]) * kf;

      // look-around ease
      const lk = lookRef.current;
      lk.x += (lookTargetRef.current.x - lk.x) * 0.05;
      lk.y += (lookTargetRef.current.y - lk.y) * 0.05;

      // gentle luminance breath with the music — slow, well under any strobe rate
      const bright = 0.9 + 0.1 * Math.min(1, sm.energy * 1.3);

      const nf: NebulaFrame = {
        time: shaderTimeRef.current,
        energy: sm.energy,
        bass: sm.bass,
        mid: sm.mid,
        treble: sm.treble,
        bright,
        consonance: sm.consonance,
        densityBias: sm.densityBias,
        minor: sm.minor,
        rootHue: sm.rootHue,
        hasChord: sm.hasChord,
        pcs: pc,
        lookX: lk.x,
        lookY: lk.y,
      };
      sceneRef.current?.render(nf);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", runResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ── pointer + tilt look-around (secondary input) ───────────────────────────
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      lookTargetRef.current = { x: nx * 0.28, y: -ny * 0.2 };
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      lookTargetRef.current = {
        x: Math.max(-0.4, Math.min(0.4, (e.gamma / 45) * 0.28)),
        y: Math.max(-0.3, Math.min(0.3, ((e.beta - 45) / 45) * 0.2)),
      };
    };
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, []);

  // ── full audio teardown on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      try {
        sourceRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      sourceRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
    };
  }, []);

  const ensureContext = useCallback((): { ctx: AudioContext; master: SafeMaster } => {
    if (ctxRef.current && masterRef.current) {
      return { ctx: ctxRef.current, master: masterRef.current };
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    const master = createSafeMaster(ctx);
    masterRef.current = master;
    freqRef.current = new Uint8Array(
      new ArrayBuffer(master.analyser.frequencyBinCount),
    );
    return { ctx, master };
  }, []);

  const startSource = useCallback((offset: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !master || !buffer) return;
    try {
      sourceRef.current?.stop();
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(master.input);
    const dur = buffer.duration || 1;
    const off = ((offset % dur) + dur) % dur;
    src.start(0, off);
    sourceRef.current = src;
    startCtxTimeRef.current = ctx.currentTime;
    startOffsetRef.current = off;
    chordIdxRef.current = 0;
  }, []);

  // Load a track from Karel's verified catalog and begin the voyage.
  const playTrack = useCallback(
    async (id: string) => {
      setError(null);
      setAnalysisMissing(false);
      setLoading(true);
      const { ctx } = ensureContext();
      void ctx.resume();
      try {
        const [{ buffer, title }, analysis] = await Promise.all([
          loadRealTrackBuffer(ctx, id),
          loadTrackAnalysis(id).catch(() => null),
        ]);
        bufferRef.current = buffer;
        analysisRef.current = analysis;
        if (!analysis || !analysis.chords.length) setAnalysisMissing(true);
        pausedOffsetRef.current = 0;
        fieldRef.current = neutralField();
        setNowTitle(title);
        startSource(0);
        setPlaying(true);
      } catch {
        setError(
          "That recording could not be loaded right now. The nebula still drifts; try another track.",
        );
      } finally {
        setLoading(false);
      }
    },
    [ensureContext, startSource],
  );

  // Pause / resume the current buffer without refetching.
  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      const ctx = ctxRef.current;
      const buffer = bufferRef.current;
      if (ctx && buffer) {
        const dur = buffer.duration || 1;
        let pos =
          startOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current);
        pos = ((pos % dur) + dur) % dur;
        pausedOffsetRef.current = pos;
      }
      try {
        sourceRef.current?.stop();
        sourceRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      sourceRef.current = null;
      setPlaying(false);
      return;
    }
    // resume
    if (bufferRef.current) {
      void ctxRef.current?.resume();
      startSource(pausedOffsetRef.current);
      setPlaying(true);
    } else {
      void playTrack(selectedId);
    }
  }, [playTrack, selectedId, startSource]);

  const onPickTrack = useCallback(
    (id: string) => {
      setSelectedId(id);
      setChordLabel("—");
      void playTrack(id);
    },
    [playTrack],
  );

  const started = nowTitle !== null;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ display: webglFailed ? "none" : "block" }}
        />
      </div>

      {webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-background p-8">
          <p className="max-w-md text-center text-base text-muted-foreground">
            This device can&apos;t open a WebGL canvas, so the volumetric nebula
            can&apos;t render here. On a WebGL-capable browser you&apos;d drift
            through a cloud lit by the chords of Karel&apos;s recording.
          </p>
        </div>
      )}

      {/* Top-left chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-5 sm:p-8">
        <div className="max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            16752 · chordnebula · cosmic-ambient
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Inside the recording
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            A volumetric nebula you drift through, breathing with Karel&apos;s
            music. The chord sounding right now sets its colour — each note blooms
            a light-core in the cloud; consonance opens calm luminous caverns.
          </p>
          {started && (
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {nowTitle}
              <span className="mx-2 opacity-40">·</span>
              chord {chordLabel}
              {analysisMissing && (
                <span className="ml-2 opacity-60">(no analysis — hue drift)</span>
              )}
            </p>
          )}
          {error && <p className="mt-3 text-base text-destructive">{error}</p>}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-3 px-5">
        {!started ? (
          <button
            onClick={() => void playTrack(selectedId)}
            disabled={loading || webglFailed}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Entering…" : "Enter the nebula"}
          </button>
        ) : (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={togglePlay}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <select
              value={selectedId}
              onChange={(e) => onPickTrack(e.target.value)}
              disabled={loading}
              aria-label="Choose a track"
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {WELCOME_HOME_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Corner: design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute right-4 top-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:top-8"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One full-screen{" "}
                <span className="text-foreground">three.js ShaderMaterial</span>{" "}
                raymarches a 3D FBM density field — genuine emission/absorption
                volume integration (Beer–Lambert transmittance, front-to-back),
                after Íñigo Quílez&apos;s volumetric{" "}
                <span className="text-foreground">Raymarching clouds</span>. The
                field flows toward the camera, so you drift forward through it.
              </p>
              <p>
                Karel&apos;s live FFT is the nebula&apos;s{" "}
                <span className="text-foreground">breath</span>: bass swells the
                medium, treble adds fine detail, overall energy lifts the glow.
                The <span className="text-foreground">chord</span> sounding right
                now sets hue + structure — its pitch-classes bloom as coloured
                light-cores inside the cloud, consonant chords open calm luminous
                caverns, dense/altered chords thicken and darken the medium.
              </p>
              <p>
                Palette is the Resonance violet brand, blooming to warm cores —
                a nod to Refik Anadol&apos;s <em>latent</em> nebulae. The
                chord→colour mapping follows the spirit of{" "}
                <span className="text-foreground">Chord Colourizer</span>{" "}
                (arXiv 2510.10173). No mic, no synths: audio is Karel&apos;s real
                catalogue only, through the shared ear-safety master. No analysis
                → the hue simply drifts. Motion is a slow cosmic drift with no
                strobe.
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

      <PrototypeNav slugs={["16752-chordnebula"]} />
    </main>
  );
}
