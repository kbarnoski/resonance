"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { startEngine, type HelioEngine } from "./audio";
import {
  createSyntheticSky,
  driversFromSky,
  fetchSky,
  type Sky,
  type SkyDrivers,
} from "./sky";

const SEED = 0x9512;
const POLL_MS = 60_000; // re-poll NOAA every ~60s
const SYNTH_STEP_MS = 6_000; // gentle wander when running on the synthetic sky

// Eight auroral curtains. Each carries a hue offset (relative to the live base
// hue), a horizontal position/width, a drift animation, and a breathing speed.
// Colours live INSIDE the art layer only — greens→teal→violet.
const CURTAINS = [
  { hueOff: -18, left: 4, width: 20, drift: 0, dur: 41, breathe: 17, sat: 82, light: 52 },
  { hueOff: 6, left: 15, width: 26, drift: 1, dur: 53, breathe: 23, sat: 78, light: 55 },
  { hueOff: -34, left: 30, width: 18, drift: 2, dur: 47, breathe: 19, sat: 85, light: 50 },
  { hueOff: 22, left: 40, width: 30, drift: 3, dur: 61, breathe: 27, sat: 74, light: 57 },
  { hueOff: -8, left: 55, width: 22, drift: 0, dur: 44, breathe: 21, sat: 80, light: 53 },
  { hueOff: 40, left: 66, width: 24, drift: 2, dur: 57, breathe: 25, sat: 70, light: 58 },
  { hueOff: -26, left: 78, width: 19, drift: 1, dur: 49, breathe: 18, sat: 84, light: 51 },
  { hueOff: 14, left: 86, width: 23, drift: 3, dur: 63, breathe: 29, sat: 76, light: 56 },
] as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function HeliosongPage() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [sky, setSky] = useState<Sky | null>(null);
  const [usingSynthetic, setUsingSynthetic] = useState(false);
  const [statusMsg, setStatusMsg] = useState(
    "Press play to open the live sky as a carrier wave.",
  );

  const skyLayerRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<HelioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const synthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const synthRef = useRef(createSyntheticSky(SEED));
  const liveRef = useRef(false);

  // driver smoothing: rAF lerps `cur` toward `target`, writing CSS vars.
  const targetRef = useRef<SkyDrivers>({
    storm: 0.2,
    south: 0.1,
    flow: 0.4,
    body: 0.5,
    field: 0.3,
  });
  const curRef = useRef<SkyDrivers>({ ...targetRef.current });
  const reducedRef = useRef(false);

  const applySky = useCallback((next: Sky) => {
    setSky(next);
    const drivers = driversFromSky(next);
    targetRef.current = drivers;
    engineRef.current?.update(drivers);
  }, []);

  // write the smoothed drivers to CSS custom properties on the sky layer.
  const writeVars = useCallback(() => {
    const el = skyLayerRef.current;
    if (!el) return;
    const c = curRef.current;
    // base hue: calm green (128) → tense violet (288) as Bz goes south.
    const hue = lerp(128, 288, c.south);
    // overall glow rises with storm + field; darken with strong south.
    const intensity = 0.35 + c.storm * 0.4 + c.field * 0.35;
    const darken = 0.15 + c.south * 0.55;
    el.style.setProperty("--sky-hue", hue.toFixed(1));
    el.style.setProperty("--sky-intensity", intensity.toFixed(3));
    el.style.setProperty("--sky-dark", darken.toFixed(3));
    el.style.setProperty("--sky-flow", c.flow.toFixed(3));
  }, []);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    let running = true;
    const tick = () => {
      if (!running) return;
      const cur = curRef.current;
      const tgt = targetRef.current;
      const k = 0.03; // slow easing — everything breathes, nothing jumps
      cur.storm = lerp(cur.storm, tgt.storm, k);
      cur.south = lerp(cur.south, tgt.south, k);
      cur.flow = lerp(cur.flow, tgt.flow, k);
      cur.body = lerp(cur.body, tgt.body, k);
      cur.field = lerp(cur.field, tgt.field, k);
      writeVars();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [writeVars]);

  const pollLive = useCallback(async () => {
    try {
      const s = await fetchSky();
      if (s.live) {
        liveRef.current = true;
        setUsingSynthetic(false);
        applySky(s);
        setStatusMsg(
          "Live sky online — the current solar wind is the carrier wave.",
        );
        return;
      }
    } catch {
      /* fall through to synthetic */
    }
    // no live data: stay on the synthetic sky, note it once.
    if (!liveRef.current) {
      setUsingSynthetic(true);
      setStatusMsg("Streaming a boundless synthetic sky.");
    }
  }, [applySky]);

  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // 1) Audio + an immediate synthetic-sky drone (never silent, never blank).
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      ctxRef.current = ctx;
      const seed = synthRef.current.step();
      applySky(seed);
      engineRef.current = startEngine(ctx);
      engineRef.current.update(driversFromSky(seed));
      setUsingSynthetic(true);
      setStatusMsg("Reaching for the live sky…");
    } catch {
      setStatusMsg("Audio could not start in this browser.");
      return;
    }

    // 2) Reach for live NOAA data; poll every ~60s.
    void pollLive();
    pollTimerRef.current = setInterval(() => void pollLive(), POLL_MS);

    // 3) Between polls, keep a gentle synthetic wander whenever we're offline.
    synthTimerRef.current = setInterval(() => {
      if (!liveRef.current) applySky(synthRef.current.step());
    }, SYNTH_STEP_MS);
  }, [started, applySky, pollLive]);

  // teardown on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (synthTimerRef.current) clearInterval(synthTimerRef.current);
      engineRef.current?.stop();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        setTimeout(() => {
          try {
            void ctx.close();
          } catch {
            /* already closing */
          }
        }, 1500);
      }
    };
  }, []);

  const reduced = reducedRef.current;

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* ── The DOM/CSS aurora — pure light, no canvas ─────────────────── */}
      <div
        ref={skyLayerRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={
          {
            "--sky-hue": "128",
            "--sky-intensity": started ? "0.5" : "0.28",
            "--sky-dark": "0.2",
            "--sky-flow": "0.4",
            background:
              "radial-gradient(120% 80% at 50% 120%, hsl(0 0% 4%) 0%, hsl(240 30% 2%) 60%, hsl(0 0% 0%) 100%)",
          } as React.CSSProperties
        }
      >
        {/* faint star/veil wash */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 40% at 50% 0%, hsla(calc(var(--sky-hue) + 20), 70%, 40%, calc(0.10 * var(--sky-intensity))) 0%, transparent 70%)",
          }}
        />
        {CURTAINS.map((c, i) => (
          <div
            key={i}
            className="hs-curtain"
            style={
              {
                position: "absolute",
                top: "-20%",
                left: `${c.left}%`,
                width: `${c.width}%`,
                height: "150%",
                filter: "blur(26px)",
                mixBlendMode: "screen",
                background: `linear-gradient(177deg,
                  transparent 0%,
                  hsla(calc(var(--sky-hue) + ${c.hueOff}), ${c.sat}%, ${c.light}%, calc(${(0.42).toFixed(2)} * var(--sky-intensity) * (1 - 0.5 * var(--sky-dark)))) 42%,
                  hsla(calc(var(--sky-hue) + ${c.hueOff + 24}), ${c.sat}%, ${c.light - 12}%, calc(0.28 * var(--sky-intensity))) 66%,
                  transparent 100%)`,
                animation: reduced
                  ? "none"
                  : `hs-drift${c.drift} ${c.dur}s ease-in-out infinite, hs-breathe ${c.breathe}s ease-in-out infinite`,
                animationDelay: `${i * -3.7}s, ${i * -2.3}s`,
                opacity: started ? 1 : 0.5,
                transition: "opacity 3s ease",
              } as React.CSSProperties
            }
          />
        ))}
        {/* deep-sky darkening overlay driven by southward Bz */}
        <div
          className="absolute inset-0"
          style={{
            background: "hsl(255 40% 3%)",
            opacity: "calc(0.55 * var(--sky-dark))",
            mixBlendMode: "multiply",
          }}
        />
      </div>

      {/* ── Foreground UI (chrome uses semantic tokens only) ───────────── */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Heliosong
          </h1>
          <p className="text-base text-muted-foreground">
            The live sky as a carrier wave — real-time NOAA space-weather turned
            into an infinite, non-looping cosmic drone beneath breathing auroral
            light.
          </p>
        </header>

        {!started ? (
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] w-fit rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Play the sky
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-base text-muted-foreground">{statusMsg}</p>
            {usingSynthetic && (
              <p className="text-base text-destructive">
                Live sky unavailable — showing a synthetic sky.
              </p>
            )}
          </div>
        )}

        {started && sky && (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-base text-muted-foreground sm:grid-cols-3">
            <Reading label="Kp index" value={sky.kp.toFixed(1)} />
            <Reading
              label="Bz (nT)"
              value={`${sky.bz >= 0 ? "+" : ""}${sky.bz.toFixed(1)}`}
            />
            <Reading label="Bt (nT)" value={sky.bt.toFixed(1)} />
            <Reading label="Wind (km/s)" value={sky.speed.toFixed(0)} />
            <Reading label="Density (/cm³)" value={sky.density.toFixed(1)} />
            <Reading label="Source" value={sky.live ? "NOAA live" : "synthetic"} />
          </dl>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="w-fit text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {showNotes ? "Hide design notes" : "Design notes"}
          </button>
          {showNotes && (
            <div className="flex flex-col gap-3 rounded-md border border-border p-4 text-base text-muted-foreground">
              <p>
                Three NOAA SWPC products (solar-wind plasma, magnetic field,
                planetary K-index) are polled every ~60s and parsed to their
                last valid reading. Each fetch has a 4s timeout; if any fail the
                piece falls back to a seeded synthetic sky so it is never silent
                and never blank.
              </p>
              <p>
                Sonification: Kp drives event density and roughness; southward
                Bz drops the root pitch and pulls the harmony toward the minor /
                tension scale while darkening the light; wind speed sets the
                shimmer rate and how often pads swell; plasma density opens the
                master filter. Seeded randomness keeps minting new pad entries,
                so the arrangement evolves and never loops.
              </p>
              <p>
                Light is pure DOM/CSS — eight layered auroral curtains that drift
                and breathe well under 3 Hz, with no strobe or flicker. Reduced
                motion freezes the drift.
              </p>
              <p className="text-muted-foreground/80">
                References: Helioradar AV (av.helioradar.com, v1.0.0, 2026-02-01)
                and NOAA SWPC Real-Time Solar Wind.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* keyframes for the aurora — slow drift + breathing, no strobe */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes hs-drift0 { 0%,100% { transform: translate(0%, -3%) skewX(-4deg); } 50% { transform: translate(3%, 4%) skewX(3deg); } }
@keyframes hs-drift1 { 0%,100% { transform: translate(-2%, 2%) skewX(5deg); } 50% { transform: translate(4%, -4%) skewX(-3deg); } }
@keyframes hs-drift2 { 0%,100% { transform: translate(2%, -4%) skewX(-6deg); } 50% { transform: translate(-4%, 3%) skewX(4deg); } }
@keyframes hs-drift3 { 0%,100% { transform: translate(-3%, 3%) skewX(3deg); } 50% { transform: translate(2%, -3%) skewX(-5deg); } }
@keyframes hs-breathe { 0%,100% { opacity: calc(0.55 + 0.15 * var(--sky-flow)); } 50% { opacity: 1; } }
`,
        }}
      />

      <PrototypeNav slugs={["9512-heliosong"]} />
    </main>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted-foreground/70">{label}</dt>
      <dd className="font-mono text-base text-foreground">{value}</dd>
    </div>
  );
}
