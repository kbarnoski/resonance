"use client";

import { useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { CityAudio } from "./audio";
import {
  buildSyntheticCity,
  DaySimulator,
  DEFAULT_NETWORK,
  diffCounts,
  fetchNetwork,
  projectStations,
  type Station,
  systemFullness,
} from "./city";

// SVG viewBox — a wide civic map.
const VBW = 1000;
const VBH = 700;

// Cadence.
const SIM_INTERVAL = 2200; // ms between simulated poll steps
const LIVE_INTERVAL = 25000; // ms between real Citybikes polls
const MAX_AUDIBLE_EVENTS = 7; // rate-limit plucks/pulses per poll
const PULSE_POOL = 64;

// ---- pure visual mappings (shared by initial JSX + imperative updates) ----
function stationFill(frac: number): string {
  const f = Math.max(0, Math.min(1, frac));
  const light = 24 + f * 54; // dim (empty) -> bright violet (full)
  const sat = 42 + f * 44;
  return `hsl(268 ${sat}% ${light}%)`;
}
function stationRadius(capacity: number): number {
  const c = Math.max(1, Math.min(60, capacity));
  return 4 + (c / 60) * 6;
}
function stationOpacity(frac: number): number {
  return 0.34 + Math.max(0, Math.min(1, frac)) * 0.56;
}

type Pulse = {
  x: number;
  y: number;
  start: number; // frame the pulse began
  life: number; // frames
  kind: "undock" | "return";
  active: boolean;
};

type Readout = {
  fullness: number;
  inMotion: number;
  eventsPerMin: number;
  total: number;
};

export default function CityBreathPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [started, setStarted] = useState(false);
  const [live, setLive] = useState(false);
  const [networkName, setNetworkName] = useState<string>("Simulated city");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({
    fullness: 0,
    inMotion: 0,
    eventsPerMin: 0,
    total: 0,
  });

  // ----- refs (the animation/audio value path never touches React state) ----
  const stationsRef = useRef<Station[]>([]);
  const stationEls = useRef<Array<SVGCircleElement | null>>([]);
  const pulseEls = useRef<Array<SVGCircleElement | null>>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const pulseHead = useRef(0);
  const audioRef = useRef<CityAudio | null>(null);
  const frameRef = useRef(0);
  const motionRef = useRef(0);
  const pollEventLog = useRef<number[]>([]); // events per recent poll
  const intervalMsRef = useRef(SIM_INTERVAL);
  const reducedRef = useRef(false);

  // Imperatively repaint one station circle from its current counts.
  const paintStation = (i: number) => {
    const el = stationEls.current[i];
    const s = stationsRef.current[i];
    if (!el || !s) return;
    const frac = s.capacity > 0 ? s.free / s.capacity : 0;
    el.setAttribute("fill", stationFill(frac));
    el.setAttribute("fill-opacity", stationOpacity(frac).toFixed(3));
  };

  const spawnPulse = (x: number, y: number, kind: "undock" | "return") => {
    const slot = pulseHead.current;
    pulseHead.current = (pulseHead.current + 1) % PULSE_POOL;
    const base = reducedRef.current ? 150 : 78;
    pulsesRef.current[slot] = {
      x,
      y,
      start: frameRef.current,
      life: kind === "undock" ? base : Math.round(base * 0.8),
      kind,
      active: true,
    };
  };

  // Apply a freshly polled set of free-counts: mutate stations, fire audio,
  // spawn pulses (rate-limited), refresh the aggregate drone.
  const runPollUpdate = (nextCounts: number[]) => {
    const st = stationsRef.current;
    if (st.length === 0 || nextCounts.length !== st.length) return;
    const prev = st.map((s) => s.free);
    const events = diffCounts(st, prev, nextCounts);

    // Apply every count change (all stations repaint), but only sonify the
    // biggest movements so a busy minute never becomes a wall of plucks.
    for (let i = 0; i < st.length; i++) {
      if (nextCounts[i] !== st[i].free) {
        st[i].free = nextCounts[i];
        paintStation(i);
      }
    }

    let undockTotal = 0;
    let returnTotal = 0;
    for (const ev of events) {
      if (ev.kind === "undock") undockTotal += ev.magnitude;
      else returnTotal += ev.magnitude;
    }
    motionRef.current = Math.max(
      0,
      motionRef.current + undockTotal - returnTotal,
    );

    const audio = audioRef.current;
    const n = Math.min(events.length, MAX_AUDIBLE_EVENTS);
    for (let k = 0; k < n; k++) {
      const ev = events[k];
      if (ev.kind === "undock") {
        audio?.pluckUndock(ev.x, ev.y, ev.magnitude);
        spawnPulse(ev.x, ev.y, "undock");
      } else {
        audio?.toneReturn(ev.x, ev.y, ev.magnitude);
        spawnPulse(ev.x, ev.y, "return");
      }
    }

    audio?.setFullness(systemFullness(st));

    // rolling events/min from the last polls (no wall-clock needed).
    pollEventLog.current.push(events.length);
    if (pollEventLog.current.length > 20) pollEventLog.current.shift();
    const avgPerPoll =
      pollEventLog.current.reduce((a, b) => a + b, 0) /
      pollEventLog.current.length;
    const pollsPerMin = 60000 / intervalMsRef.current;

    setReadout({
      fullness: systemFullness(st),
      inMotion: motionRef.current,
      eventsPerMin: Math.round(avgPerPoll * pollsPerMin),
      total: st.reduce((a, s) => a + s.free, 0),
    });
  };

  // Swap the whole city (synthetic -> live). Re-renders the circle layer once.
  const swapCity = (next: Station[], name: string, ts: number | null) => {
    projectStations(next);
    stationsRef.current = next;
    stationEls.current = new Array(next.length).fill(null);
    setStations(next);
    setNetworkName(name);
    setUpdatedAt(ts);
    setLive(true);
    pollEventLog.current = [];
    motionRef.current = 0;
  };

  // ---- mount: build the synthetic city, start sim + live attempt + rAF ----
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    let disposed = false;

    // 1) synthetic city up front so the piece breathes with zero network.
    const synth = buildSyntheticCity();
    projectStations(synth);
    stationsRef.current = synth;
    stationEls.current = new Array(synth.length).fill(null);
    setStations(synth);
    setReadout({
      fullness: systemFullness(synth),
      inMotion: 0,
      eventsPerMin: 0,
      total: synth.reduce((a, s) => a + s.free, 0),
    });

    const simulator = new DaySimulator(synth);
    intervalMsRef.current = SIM_INTERVAL;
    let simTimer: number | null = window.setInterval(() => {
      if (disposed) return;
      // Only run the simulator while we are NOT on a live feed.
      if (!liveActive) runPollUpdate(simulator.step());
    }, SIM_INTERVAL);

    // 2) attempt the real Citybikes feed; hand over if it connects.
    let liveActive = false;
    const controller = new AbortController();
    let liveTimer: number | null = null;

    const startLivePolling = () => {
      intervalMsRef.current = LIVE_INTERVAL;
      liveTimer = window.setInterval(async () => {
        if (disposed) return;
        try {
          const { snapshot } = await fetchNetwork(
            DEFAULT_NETWORK,
            controller.signal,
          );
          if (disposed) return;
          // Align by id to the current live stations; fall back on length.
          const cur = stationsRef.current;
          const byId = new Map(snapshot.stations.map((s) => [s.id, s.free]));
          const nextCounts = cur.map((s) =>
            byId.has(s.id) ? (byId.get(s.id) as number) : s.free,
          );
          setUpdatedAt(snapshot.updatedAt);
          runPollUpdate(nextCounts);
        } catch {
          // transient error — keep the last good live state; sim stays off.
        }
      }, LIVE_INTERVAL);
    };

    // Give the synthetic a brief head start, then try to connect.
    const connectTimer = window.setTimeout(async () => {
      if (disposed) return;
      try {
        const { name, snapshot } = await fetchNetwork(
          DEFAULT_NETWORK,
          controller.signal,
        );
        if (disposed) return;
        liveActive = true;
        swapCity(snapshot.stations, name, snapshot.updatedAt);
        startLivePolling();
      } catch {
        // Offline / CORS / aborted — stay on the deterministic simulated city.
        if (!disposed) setLive(false);
      }
    }, 600);

    // 3) rAF pulse loop — mutates the pre-built pulse pool, never rebuilds it.
    let raf = 0;
    const loop = () => {
      frameRef.current++;
      const frame = frameRef.current;
      const pulses = pulsesRef.current;
      for (let i = 0; i < PULSE_POOL; i++) {
        const el = pulseEls.current[i];
        const p = pulses[i];
        if (!el) continue;
        if (!p || !p.active) {
          if (el.getAttribute("fill-opacity") !== "0")
            el.setAttribute("fill-opacity", "0");
          continue;
        }
        const age = frame - p.start;
        const prog = age / p.life;
        if (prog >= 1) {
          p.active = false;
          el.setAttribute("fill-opacity", "0");
          continue;
        }
        const grow = p.kind === "undock" ? 52 : 34;
        const r = 3 + prog * grow;
        const peak = p.kind === "undock" ? 0.5 : 0.32;
        const op = peak * (1 - prog);
        el.setAttribute("cx", (p.x * VBW).toFixed(1));
        el.setAttribute("cy", (p.y * VBH).toFixed(1));
        el.setAttribute("r", r.toFixed(1));
        el.setAttribute("fill-opacity", op.toFixed(3));
        el.setAttribute(
          "stroke-opacity",
          (op * 0.9).toFixed(3),
        );
        el.setAttribute("stroke-width", (1.4 * (1 - prog) + 0.3).toFixed(2));
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    return () => {
      disposed = true;
      controller.abort();
      if (simTimer !== null) window.clearInterval(simTimer);
      if (liveTimer !== null) window.clearInterval(liveTimer);
      window.clearTimeout(connectTimer);
      window.cancelAnimationFrame(raf);
      audioRef.current?.stop();
      audioRef.current = null;
      simTimer = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = async () => {
    if (audioRef.current) return;
    try {
      const audio = new CityAudio(reducedRef.current);
      audioRef.current = audio;
      await audio.start();
      audio.setFullness(systemFullness(stationsRef.current));
      setStarted(true);
      setError(null);
    } catch {
      audioRef.current = null;
      setError("Audio could not start in this browser.");
    }
  };

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* ---- the SVG city map (built once; loops mutate attributes) ---- */}
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <rect x="0" y="0" width={VBW} height={VBH} fill="hsl(268 32% 6%)" />
        {/* station dots */}
        <g>
          {stations.map((s, i) => {
            const frac = s.capacity > 0 ? s.free / s.capacity : 0;
            return (
              <circle
                key={s.id}
                ref={(el) => {
                  stationEls.current[i] = el;
                }}
                cx={(s.x * VBW).toFixed(1)}
                cy={(s.y * VBH).toFixed(1)}
                r={stationRadius(s.capacity).toFixed(1)}
                fill={stationFill(frac)}
                fillOpacity={stationOpacity(frac)}
              />
            );
          })}
        </g>
        {/* ripple pulse pool */}
        <g fill="none" stroke="hsl(268 90% 78%)">
          {Array.from({ length: PULSE_POOL }).map((_, i) => (
            <circle
              key={`p${i}`}
              ref={(el) => {
                pulseEls.current[i] = el;
              }}
              cx={0}
              cy={0}
              r={0}
              fill="hsl(268 90% 72%)"
              fillOpacity={0}
              stroke="hsl(268 90% 82%)"
              strokeOpacity={0}
            />
          ))}
        </g>
      </svg>

      {/* legibility wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/80 via-background/20 to-background/85" />

      {/* ---- header / controls ---- */}
      <div className="relative z-10 flex flex-col gap-3 p-6 sm:p-10">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Urban mobility sonification
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-3xl">
          City Breath
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
          A whole city breathing &mdash; its live bike-share system emptying and
          filling in real time, every ride an undocked string, every return a
          warm resonant tone, over a drone that swells as the city fills.
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">
              Listen a while &mdash; the drone breathes with the city&apos;s tide.
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {/* LIVE / SIMULATED status line */}
        <div className="mt-1 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em]">
          <span
            className={
              live
                ? "inline-block h-2 w-2 rounded-full bg-primary"
                : "inline-block h-2 w-2 rounded-full bg-muted-foreground"
            }
          />
          <span className={live ? "text-primary" : "text-muted-foreground"}>
            {live ? `Live · ${networkName}` : "Simulated"}
          </span>
          {live && updatedAt && (
            <span className="text-muted-foreground/70">
              feed {new Date(updatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* ---- live readout ---- */}
      <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-1 font-mono text-sm sm:left-10">
        <div className="text-foreground">
          {readout.total.toLocaleString()} bikes docked
        </div>
        <div className="text-muted-foreground">
          system fullness{" "}
          <span className="text-primary">
            {(readout.fullness * 100).toFixed(0)}%
          </span>
        </div>
        <div className="text-muted-foreground">
          in motion <span className="text-foreground">{readout.inMotion}</span>
        </div>
        <div className="text-muted-foreground">
          {readout.eventsPerMin} events / min
        </div>
      </div>

      {/* ---- design notes overlay ---- */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              A city, heard
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Every ~25 seconds the piece polls one city&apos;s bike-share
                network through the Citybikes aggregator &mdash; a CORS-open
                wrapper over the GBFS open-mobility standard &mdash; and diffs
                the new snapshot against the last. A station whose free-bike
                count dropped means a bike was undocked and ridden off; a rise
                means one was returned.
              </p>
              <p>
                Each undock is struck as a warm Karplus-Strong plucked string,
                tuned by the station&apos;s longitude on a pentatonic scale and
                panned by its latitude. Each return is a softer, lower resonant
                tone. Underneath, an aggregate drone tracks the whole
                system&apos;s fullness &mdash; it thins as the morning rush
                empties downtown and warms as the evening refills.
              </p>
              <p>
                If the network is unreachable, a fully deterministic simulated
                city of 120 stations breathes in its place, so the piece is
                never silent or still. This is a piece about a city &mdash; its
                tidal, civic rhythm &mdash; not an inner landscape.
              </p>
              <p className="text-muted-foreground/70">
                Reference: the General Bikeshare Feed Specification (GBFS) open
                standard, via Citybikes. Urban-mobility sonification remains a
                near-empty space.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1806-city-breath"]} />
    </main>
  );
}
