"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  makeFieldRenderer,
  type FieldRenderer,
  type FieldState,
} from "./render";
import { MagnetoAudio } from "./audio";
import {
  makeFlareClass,
  runLiveFetch,
  stormValueAt,
  STORM_DURATION,
  QUIET,
  type SpaceWeather,
} from "./noaa";
import {
  advanceMemory,
  applyMapping,
  makeRng,
  type Drive,
} from "./mapping";

const SEED = 0x1a2b3c4d;

interface Readout {
  speed: number;
  density: number;
  bz: number;
  kp: number;
  flareClass: string;
  level: number;
}

interface StatusPill {
  live: boolean;
  stampZ: string | null;
}

function stampToHHMM(iso: string | null): string {
  if (!iso) return "--:--";
  // NOAA time_tag like "2026-08-13 14:32:00.000" (UTC)
  const m = iso.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "--:--";
}

export default function MagnetosPage() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [mode, setMode] = useState<FieldRenderer["mode"] | "">("");
  const [status, setStatus] = useState<StatusPill>({
    live: false,
    stampZ: null,
  });
  const [readout, setReadout] = useState<Readout>({
    speed: QUIET.speed,
    density: QUIET.density,
    bz: QUIET.bz,
    kp: QUIET.kp,
    flareClass: makeFlareClass(QUIET.xrayFlux),
    level: 0.1,
  });
  const [stormOn, setStormOn] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const audioRef = useRef<MagnetoAudio | null>(null);
  const rafRef = useRef<number>(0);
  const pollRef = useRef<number>(0);

  // data pipeline refs (read by the loop without re-rendering)
  const liveRef = useRef<SpaceWeather | null>(null);
  const stormRef = useRef<{ active: boolean; t0: number }>({
    active: false,
    t0: 0,
  });
  const smoothRef = useRef<SpaceWeather>({ ...QUIET });
  const memoryRef = useRef<number>(0);
  const flareEnvRef = useRef<number>(0);
  const flareArmedRef = useRef<boolean>(true);
  const lastTimeRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);
  const readoutClockRef = useRef<number>(0);

  /* ── NOAA intake ──────────────────────────────────────────────────── */
  const pull = useCallback(async () => {
    const res = await runLiveFetch();
    if (res) {
      liveRef.current = res.data;
      setStatus({ live: true, stampZ: res.stampZ });
    } else if (liveRef.current === null) {
      // never got live data — remain in replay
      setStatus({ live: false, stampZ: null });
    }
  }, []);

  /* ── main loop: self-starts with QUIET before any fetch or audio ──── */
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = makeFieldRenderer(canvas, SEED);
    rendererRef.current = renderer;
    setMode(renderer.mode);
    if (renderer.mode === "none") return; // page shows fallback notice

    const applyResize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(r.width, r.height, dpr);
    };
    applyResize();
    const ro = new ResizeObserver(applyResize);
    ro.observe(wrap);

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const nowS = now / 1000;
      let dt = lastTimeRef.current ? nowS - lastTimeRef.current : 0.016;
      lastTimeRef.current = nowS;
      if (dt > 0.05) dt = 0.05;

      // pick the target state: scripted storm > live > quiet
      let target: SpaceWeather;
      const storm = stormRef.current;
      if (storm.active) {
        const et = nowS - storm.t0;
        target = stormValueAt(et);
        if (et > STORM_DURATION) {
          storm.active = false;
          setStormOn(false);
        }
      } else if (liveRef.current) {
        target = liveRef.current;
      } else {
        target = QUIET;
      }

      // ease raw physical values toward target
      const s = smoothRef.current;
      const k = Math.min(1, dt * 0.9);
      s.speed += (target.speed - s.speed) * k;
      s.density += (target.density - s.density) * k;
      s.bt += (target.bt - s.bt) * k;
      s.bz += (target.bz - s.bz) * k;
      s.kp += (target.kp - s.kp) * k;
      // flare flux eases faster up, slower down (feels like a real spike)
      const fk = target.xrayFlux > s.xrayFlux ? Math.min(1, dt * 2.2) : k;
      s.xrayFlux += (target.xrayFlux - s.xrayFlux) * fk;

      const drive: Drive = applyMapping(s, makeFlareClass(s.xrayFlux));

      // long-form memory accumulation
      memoryRef.current = advanceMemory(memoryRef.current, drive.level, dt);

      // flare envelope: smooth ramp (≥300ms) for the shader burst
      const fe = flareEnvRef.current;
      flareEnvRef.current = fe + (drive.flare - fe) * Math.min(1, dt / 0.4);

      // rising-edge flare → audio bell (armed/disarmed with hysteresis)
      if (drive.flare > 0.45 && flareArmedRef.current) {
        audioRef.current?.triggerFlare(drive.flare);
        flareArmedRef.current = false;
      } else if (drive.flare < 0.2) {
        flareArmedRef.current = true;
      }

      // drive audio
      const au = audioRef.current;
      if (au && startedRef.current) {
        au.update(drive, memoryRef.current);
        au.tickRise(dt, drive.level);
      }

      // drive visuals
      const fs: FieldState = {
        time: nowS,
        dt,
        level: drive.level,
        memory: memoryRef.current,
        flow: drive.flow,
        thickness: drive.thickness,
        south: drive.south,
        flare: flareEnvRef.current,
        reduced: reducedRef.current,
      };
      renderer.draw(fs);

      // throttle readout panel updates (~4/s)
      if (nowS - readoutClockRef.current > 0.25) {
        readoutClockRef.current = nowS;
        setReadout({
          speed: s.speed,
          density: s.density,
          bz: s.bz,
          kp: s.kp,
          flareClass: drive.flareClass,
          level: drive.level,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    // kick off NOAA (alive already; this just upgrades to LIVE when it lands)
    pull();
    pollRef.current = window.setInterval(pull, 60000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(pollRef.current);
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [pull]);

  /* ── audio start (first user gesture) ─────────────────────────────── */
  const ensureAudio = useCallback(async () => {
    if (audioRef.current) {
      // resume if suspended
      const c = audioRef.current.context;
      if (c.state === "suspended") await c.resume();
      return;
    }
    const au = new MagnetoAudio();
    audioRef.current = au;
    const rng = makeRng(SEED ^ 0x5f356495);
    await au.start(rng);
    startedRef.current = true;
    setStarted(true);
  }, []);

  const summonStorm = useCallback(async () => {
    await ensureAudio();
    stormRef.current = { active: true, t0: performance.now() / 1000 };
    flareArmedRef.current = true;
    setStormOn(true);
  }, [ensureAudio]);

  const listenLive = useCallback(async () => {
    await ensureAudio();
  }, [ensureAudio]);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
      startedRef.current = false;
    };
  }, []);

  const noWebGL = mode === "none";

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* full-viewport field */}
      <div ref={wrapRef} className="fixed inset-0 z-0">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {noWebGL && (
        <div className="fixed inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-border bg-background/90 p-6 text-center shadow-lg backdrop-blur-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Magnetos
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              This piece renders a live magnetic-field-line field in WebGL2, and
              your browser could not open a WebGL2 context. Try a recent desktop
              Chrome, Edge, or Firefox to feel the storm.
            </p>
          </div>
        </div>
      )}

      {/* header / title */}
      {!noWebGL && (
        <div className="pointer-events-none fixed left-0 top-0 z-20 p-5 sm:p-7">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            NOAA SWPC · live space weather
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Magnetos
          </h1>
          <p className="mt-1 max-w-sm text-base text-muted-foreground">
            The Sun and Earth&rsquo;s magnetosphere, right now &mdash; field
            lines that build toward breakthrough.
          </p>
        </div>
      )}

      {/* status pill */}
      {!noWebGL && (
        <div className="pointer-events-none fixed right-5 top-5 z-20 sm:right-7 sm:top-7">
          <span
            className={`rounded-full border border-border bg-background/70 px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] backdrop-blur-sm ${
              status.live ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {status.live
              ? `LIVE · ${stampToHHMM(status.stampZ)}Z`
              : "REPLAY · scripted"}
          </span>
        </div>
      )}

      {/* readout panel */}
      {!noWebGL && (
        <div className="pointer-events-none fixed bottom-20 left-5 z-20 sm:bottom-7 sm:left-7">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-1 rounded-lg border border-border bg-background/55 px-4 py-3 font-mono text-xs text-muted-foreground backdrop-blur-sm">
            <div className="flex justify-between gap-3">
              <dt>WIND</dt>
              <dd className="text-foreground">{readout.speed.toFixed(0)} km/s</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>DENS</dt>
              <dd className="text-foreground">
                {readout.density.toFixed(1)} p/cc
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Bz</dt>
              <dd
                className={
                  readout.bz < 0 ? "text-foreground" : "text-muted-foreground"
                }
              >
                {readout.bz.toFixed(1)} nT
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Kp</dt>
              <dd className="text-foreground">{readout.kp.toFixed(1)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>XRAY</dt>
              <dd className="text-foreground">{readout.flareClass}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>BUILD</dt>
              <dd className="text-foreground">
                {(readout.level * 100).toFixed(0)}%
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* opening gesture overlay (audio needs a user gesture) */}
      {!noWebGL && !started && (
        <div className="fixed inset-0 z-30 flex items-end justify-center p-6 pb-24 sm:items-center sm:pb-6">
          <div className="w-full max-w-md rounded-lg border border-border bg-background/80 p-6 text-center shadow-lg backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              tap to wake the field
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Real solar-wind, geomagnetic, and X-ray data drive a living field
              of light and sound. Conditions are usually quiet &mdash; summon a
              scripted storm to feel the full build toward breakthrough.
            </p>
            <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={summonStorm}
                className="min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                Summon storm
              </button>
              <button
                onClick={listenLive}
                className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:w-auto"
              >
                Listen live
              </button>
            </div>
          </div>
        </div>
      )}

      {/* running controls */}
      {!noWebGL && started && (
        <div className="fixed bottom-20 right-5 z-20 flex flex-col items-end gap-2 sm:bottom-7 sm:right-7">
          <button
            onClick={summonStorm}
            disabled={stormOn}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {stormOn ? "Storm building…" : "Summon storm"}
          </button>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
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
                A full-viewport WebGL2 fragment field. A ping-pong feedback
                texture holds the state: each frame the field is advected along a
                curl-noise flow shaped by a cosmic dipole, decayed, and re-seeded
                with thin iso-contour field lines. Calm conditions read as
                sparse, cool, slow teal lines; as Kp and southward Bz climb, the
                field densifies, folds, and reconnects &mdash; teal &rarr; gold
                &rarr; magenta &rarr; white.
              </p>
              <p>
                <span className="text-foreground">Data &rarr; field.</span>{" "}
                Solar-wind speed sets flow velocity, proton density sets line
                count and thickness, southward Bz drives reconnection tension,
                Kp raises the whole build, and GOES X-ray flares fire smooth
                reconnection bursts across the frame.
              </p>
              <p>
                <span className="text-foreground">Long-form memory.</span> A slow
                accumulator deposits a persistent lattice while a storm is
                active and bleeds away over minutes, so the field looks
                meaningfully different three minutes into a storm than at its
                start.
              </p>
              <p>
                <span className="text-foreground">Safety.</span> All sound runs
                through a master limiter at a calm level; luminance drifts
                smoothly and reconnection bursts ramp over more than 300&nbsp;ms
                (no strobe). <span className="text-foreground">Reduced
                motion</span> slows the flow and damps accumulation flashiness.
              </p>
              <p className="text-xs">
                Data: NOAA Space Weather Prediction Center (RTSW solar wind + mag,
                planetary Kp, GOES X-rays). Prior art:{" "}
                <span className="text-foreground">Helioradar AV</span>{" "}
                (av.helioradar.com, Feb 2026 real-time SWPC sonification).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["11488-magnetos"]} />
    </main>
  );
}
