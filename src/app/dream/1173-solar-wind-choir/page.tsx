"use client";

// ════════════════════════════════════════════════════════════════════════════
// Solar Wind Choir (1173)
//
// THE ONE QUESTION: "What if you could hear the sun's weather hitting Earth
// right now — the real, live solar wind sung as a choir?"
//
// Three live, keyless NOAA SWPC feeds (plasma, magnetic field, planetary K) are
// fetched CLIENT-SIDE every ~60s, mapped to an 8-voice just-intonation choir,
// and drawn as a bright, daylit sun→Earth scene. Wind speed sets the register &
// streak speed, proton density the chord richness & particle count, Bz the
// consonant↔tense harmony and violet-storm palette, Bt the choir's shimmer, and
// Kp an aurora ribbon + shimmer voices. On any feed failure an embedded snapshot
// keeps it singing and rendering.
//
// Lineage: Helioradar AV (av.helioradar.com, 2026) real-time NOAA sonification;
// Andrea Polli, "Atmospherics / Weather Works" (atmospheric data sonification).
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSolarWind, FALLBACK, type SolarWind } from "./feeds";
import { computeTargets, type Targets } from "./mapping";
import { makeScene, drawScene, type Scene } from "./render";
import { startChoir, type ChoirAudio } from "./audio";

export default function SolarWindChoirPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const targetsRef = useRef<Targets>(computeTargets(FALLBACK));
  const audioRef = useRef<ChoirAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedRef = useRef<boolean>(false);

  const [started, setStarted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [data, setData] = useState<SolarWind>(FALLBACK);
  const [notesOpen, setNotesOpen] = useState(false);

  // ── Poll one sample, update targets + (if running) the choir ────────────────
  const pull = useCallback(async () => {
    const sample = await fetchSolarWind();
    setData(sample);
    targetsRef.current = computeTargets(sample);
    audioRef.current?.applyData(sample);
  }, []);

  // ── Mount: size canvas, draw idle immediately, start RAF + live polling ─────
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    sceneRef.current = makeScene();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      const last = lastRef.current || now;
      const dt = Math.min(0.05, (now - last) / 1000);
      lastRef.current = now;
      const rect = canvas.getBoundingClientRect();
      if (sceneRef.current) {
        drawScene(
          ctx,
          sceneRef.current,
          rect.width,
          rect.height,
          targetsRef.current,
          dt,
          reducedRef.current,
        );
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    // Live from frame one — numbers + palette update even before audio starts.
    void pull();
    pollRef.current = setInterval(() => void pull(), 60_000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      if (pollRef.current) clearInterval(pollRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [pull]);

  // ── Begin: one gesture creates the AudioContext + choir ─────────────────────
  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;
      audioRef.current = startChoir(ctx, data);
    } catch {
      setAudioFailed(true);
    }
  }, [started, data]);

  const stop = useCallback(() => {
    audioRef.current?.stop();
    audioRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setStarted(false);
    setAudioFailed(false);
  }, []);

  const live = data.live;
  const stamp = data.timeTag
    ? data.timeTag.replace(" ", "T").slice(0, 19) + "Z UTC"
    : "";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0a0d16] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ── Live numeric readout (dark translucent panel for contrast) ── */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-md">
        <div className="mb-2 flex items-center gap-2 text-base">
          <span
            className={
              live
                ? "inline-block h-2.5 w-2.5 rounded-full bg-emerald-400"
                : "inline-block h-2.5 w-2.5 rounded-full bg-amber-400"
            }
          />
          <span
            className={
              live
                ? "font-mono text-emerald-300"
                : "font-mono text-amber-300"
            }
          >
            {live ? `● live · ${stamp}` : "○ using sample data"}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 font-mono text-base tabular-nums text-white/95">
          <dt className="text-white/75">wind speed</dt>
          <dd className="text-right">{Math.round(data.speed)} km/s</dd>
          <dt className="text-white/75">density</dt>
          <dd className="text-right">{data.density.toFixed(1)} p/cm³</dd>
          <dt className="text-white/75">Bz (GSM)</dt>
          <dd
            className={
              data.bz < 0 ? "text-right text-violet-300" : "text-right"
            }
          >
            {data.bz.toFixed(1)} nT
          </dd>
          <dt className="text-white/75">Bt</dt>
          <dd className="text-right">{data.bt.toFixed(1)} nT</dd>
          <dt className="text-white/75">Kp index</dt>
          <dd className="text-right">{data.kp.toFixed(1)} / 9</dd>
        </dl>
      </div>

      {/* ── Title ── */}
      <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-[18rem] rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-right backdrop-blur-md">
        <h1 className="text-xl font-semibold text-white">Solar Wind Choir</h1>
        <p className="mt-1 text-base leading-snug text-white/75">
          The sun&rsquo;s weather hitting Earth right now, sung as a
          just-intonation choir.
        </p>
      </div>

      {/* ── Transport ── */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-3">
        {!started ? (
          <button
            type="button"
            onClick={begin}
            className="min-h-[44px] rounded-full border border-white/20 bg-white/90 px-6 py-2.5 text-base font-semibold text-black transition hover:bg-white"
          >
            ▶ Begin
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="min-h-[44px] rounded-full border border-white/20 bg-black/50 px-6 py-2.5 text-base font-semibold text-white/95 backdrop-blur-md transition hover:bg-black/70"
          >
            ■ Stop
          </button>
        )}
        {audioFailed && (
          <span className="rounded-lg bg-black/60 px-3 py-2 text-base text-amber-300 backdrop-blur-md">
            Audio could not start here — the sky still moves.
          </span>
        )}
      </div>

      {/* ── Design notes ── */}
      <button
        type="button"
        onClick={() => setNotesOpen((v) => !v)}
        className="absolute bottom-4 right-4 z-20 min-h-[44px] rounded-full border border-white/15 bg-black/50 px-4 py-2.5 text-base text-white/85 backdrop-blur-md transition hover:text-white"
      >
        {notesOpen ? "Close notes" : "About"}
      </button>

      {notesOpen && (
        <div className="absolute inset-0 z-30 flex justify-center overflow-y-auto bg-[#0a0d16]/92 px-4 py-10 backdrop-blur-md">
          <div className="max-w-2xl">
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mb-4 min-h-[44px] rounded-full border border-white/15 px-4 py-2.5 text-base text-white/85 hover:text-white"
            >
              Close
            </button>
            <h2 className="text-xl font-semibold text-white">
              Solar Wind Choir
            </h2>
            <div className="mt-3 space-y-3 text-base leading-relaxed text-white/85">
              <p>
                Three live NOAA Space Weather Prediction Center feeds — solar-wind
                plasma, interplanetary magnetic field, and the planetary K index —
                are fetched in your browser every ~60&nbsp;seconds and mapped onto
                an eight-voice just-intonation choir over a sun→Earth daylight
                scene.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Wind speed</strong> lifts the choir&rsquo;s register and
                  drives the streak speed.
                </li>
                <li>
                  <strong>Proton density</strong> fills out the chord and thickens
                  the particle flow.
                </li>
                <li>
                  <strong>Bz</strong> (southward = storm) cross-fades the harmony
                  from consonant to tense and tints the sky violet.
                </li>
                <li>
                  <strong>Bt</strong> raises the choir&rsquo;s shimmer.
                </li>
                <li>
                  <strong>Kp</strong> lights an aurora ribbon and adds shimmer
                  voices.
                </li>
              </ul>
              <p className="text-white/70">
                If the feeds are unreachable, an embedded snapshot keeps it singing
                and rendering — the badge then reads &ldquo;using sample
                data.&rdquo; Brightness only drifts slowly; there is no strobe.
              </p>
              <p className="text-white/70">
                Lineage: Helioradar AV (2026); Andrea Polli, &ldquo;Atmospherics /
                Weather Works.&rdquo;
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
