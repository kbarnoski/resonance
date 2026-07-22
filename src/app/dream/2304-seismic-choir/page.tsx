"use client";

// ════════════════════════════════════════════════════════════════════════════
// 2304 · Seismic Choir
//
// THE ONE QUESTION: "What if Resonance's carrier wave were the living Earth —
// its real, in-the-last-hour earthquakes sung as a spatial cosmic-ambient
// choir?"
//
// The USGS real-time earthquake feed is fetched CLIENT-SIDE (keyless, CORS-open
// — no API route, no secret). Each quake becomes ONE sustained voice in an
// additive spatial choir: magnitude → pitch + loudness, depth → timbre,
// longitude → stereo pan, latitude → detune. A slowly rotating three.js globe
// marks every quake at its true lon/lat; click a marker to SOLO its voice.
// There is no master calm→peak knob — the Earth's live stream is the score.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchQuakes,
  topByMagnitude,
  type Quake,
  type QuakeSource,
} from "./data";
import { SeismicChoir } from "./audio";
import { SeismicGlobe } from "./globe";
import { README_TEXT } from "./readme-text";
import { PrototypeNav } from "../_shared/prototype-nav";

const MAX_VOICES = 24;
const POLL_MS = 60_000;

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function relTime(ms: number): string {
  if (!ms) return "sample";
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ago`;
}

export default function SeismicChoirPage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<SeismicGlobe | null>(null);
  const choirRef = useRef<SeismicChoir | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quakesRef = useRef<Quake[]>([]);
  const soloHandlerRef = useRef<(id: string | null) => void>(() => {});

  const [started, setStarted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [source, setSource] = useState<QuakeSource | null>(null);
  const [count, setCount] = useState(0);
  const [soloId, setSoloId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // Pull the current seismic state and push it into globe + choir.
  const pull = useCallback(async () => {
    const { quakes, source: src } = await fetchQuakes();
    const sounding = topByMagnitude(quakes, MAX_VOICES);
    quakesRef.current = sounding;
    setSource(src);
    setCount(sounding.length);
    globeRef.current?.setQuakes(sounding);
    choirRef.current?.update(sounding);
    // Drop a solo whose quake has left the feed.
    setSoloId((cur) => (cur && sounding.some((q) => q.id === cur) ? cur : null));
  }, []);

  // Mount: set up the globe (if WebGL), render the idle scene, start polling.
  useEffect(() => {
    soloHandlerRef.current = (id) => setSoloId(id);

    const ok = hasWebGL();
    setWebglOk(ok);

    const host = hostRef.current;
    if (ok && host) {
      const globe = new SeismicGlobe(host, (id) => soloHandlerRef.current(id));
      globeRef.current = globe;

      const loop = (now: number) => {
        const dt = lastRef.current ? (now - lastRef.current) / 1000 : 0.016;
        lastRef.current = now;
        globe.tick(Math.min(dt, 0.05), now / 1000);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    void pull();
    pollRef.current = setInterval(() => void pull(), POLL_MS);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      globeRef.current?.dispose();
      globeRef.current = null;
      choirRef.current?.dispose();
      choirRef.current = null;
    };
  }, [pull]);

  // Sync solo selection into both engines.
  useEffect(() => {
    globeRef.current?.setSolo(soloId);
    choirRef.current?.setSolo(soloId);
  }, [soloId]);

  const start = useCallback(async () => {
    if (started) return;
    try {
      const choir = new SeismicChoir();
      choirRef.current = choir;
      await choir.start();
      choir.update(quakesRef.current);
      choir.setSolo(soloId);
      setStarted(true);
    } catch {
      setAudioFailed(true);
    }
  }, [started, soloId]);

  const stop = useCallback(() => {
    choirRef.current?.dispose();
    choirRef.current = null;
    setStarted(false);
  }, []);

  const soloQuake = soloId
    ? quakesRef.current.find((q) => q.id === soloId) ?? null
    : null;

  const sourceLabel =
    source === "hour"
      ? "live · past hour"
      : source === "day"
        ? "live · past day"
        : source === "bundled"
          ? "using cached sample data"
          : "loading…";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#03070a] text-foreground">
      {/* ── Globe host (or WebGL-unavailable notice) ── */}
      {webglOk ? (
        <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-muted-foreground">
            WebGL is unavailable here, so the globe can&rsquo;t be drawn — but the
            seismic choir still plays. Press Start to hear the planet&rsquo;s
            current seismic state.
          </p>
        </div>
      )}

      {/* ── Title ── */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[22rem] rounded-lg border border-border bg-background/60 px-4 py-3 backdrop-blur-md">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Seismic Choir
        </h1>
        <p className="mt-1 text-base leading-snug text-muted-foreground">
          The living Earth&rsquo;s real, recent earthquakes sung as a spatial
          cosmic-ambient choir.
        </p>
      </div>

      {/* ── Status line ── */}
      <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-lg border border-border bg-background/60 px-4 py-3 text-right backdrop-blur-md">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {sourceLabel}
        </div>
        <div className="mt-1 font-mono text-base tabular-nums text-foreground">
          {count} voices
        </div>
      </div>

      {/* ── Solo stats panel ── */}
      {soloQuake && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 w-[20rem] max-w-[90vw] -translate-x-1/2 rounded-lg border border-border bg-background/70 px-4 py-3 backdrop-blur-md">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            soloed voice · M{soloQuake.mag.toFixed(1)}
          </div>
          <div className="mt-1 text-base font-medium leading-snug text-foreground">
            {soloQuake.place}
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-sm tabular-nums text-muted-foreground">
            <dt>depth</dt>
            <dd className="text-right text-foreground">
              {Math.round(soloQuake.depthKm)} km
            </dd>
            <dt>when</dt>
            <dd className="text-right text-foreground">
              {relTime(soloQuake.time)}
            </dd>
            <dt>lon / lat</dt>
            <dd className="text-right text-foreground">
              {soloQuake.lon.toFixed(1)}, {soloQuake.lat.toFixed(1)}
            </dd>
          </dl>
        </div>
      )}

      {/* ── Transport ── */}
      <div className="absolute bottom-6 left-4 z-20 flex flex-wrap items-center gap-3">
        {!started ? (
          <button
            type="button"
            onClick={() => void start()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>
        )}
        {soloId && (
          <button
            type="button"
            onClick={() => setSoloId(null)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Clear solo
          </button>
        )}
        {webglOk && (
          <span className="hidden font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            drag to orbit · click a marker to solo
          </span>
        )}
        {audioFailed && (
          <span className="text-sm text-destructive">
            Audio could not start here — the globe still turns.
          </span>
        )}
      </div>

      {/* ── Design notes ── */}
      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="absolute bottom-6 right-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {notesOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
              {README_TEXT}
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2304-seismic-choir"]} />
    </main>
  );
}
