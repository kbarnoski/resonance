"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  applyListenerOrientation,
  applyPannerPosition,
  azimuthToXZ,
  angleDelta,
  computeAzimuths,
  computeProximity,
  FOUND_WITHIN,
  NUM_VOICES,
  VOICE_HUE,
  VOICE_HZ,
  VOICE_NAME,
  type Voice,
} from "./audio";

// Auto-tour speed (degrees/second) when there is no orientation sensor.
const AUTO_TOUR_DPS = 70;
// Heading smoothing factor toward target (per frame, ~60fps).
const HEADING_SMOOTH = 0.12;

type Mode = "idle" | "sensor" | "auto" | "drag";

interface DotState {
  azimuth: number;
  glow: number; // 0..1 visual brightness
  found: boolean;
}

export default function KidsSoundHunt() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [notice, setNotice] = useState<string>("");
  const [foundCount, setFoundCount] = useState(0);
  const [complete, setComplete] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [dots, setDots] = useState<DotState[]>(() =>
    computeAzimuths(NUM_VOICES).map((azimuth) => ({ azimuth, glow: 0, found: false })),
  );

  // Live heading the UI reads (debounced into state via rAF).
  const [headingDisplay, setHeadingDisplay] = useState(0);

  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const voicesRef = useRef<Voice[]>([]);
  const droneRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Heading state in refs so the animation loop never restarts.
  const headingRef = useRef(0); // smoothed current heading
  const targetHeadingRef = useRef(0); // where we want to be (sensor/drag/auto)
  const modeRef = useRef<Mode>("idle");
  const lastTsRef = useRef<number>(0);
  const completeRef = useRef(false);
  const dragRef = useRef<{ active: boolean; lastX: number }>({ active: false, lastX: 0 });

  // Soft chime when a voice is first found.
  const playChime = useCallback((hz: number, hue: number) => {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;
    const now = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(hz * 2, now); // an octave up = sparkle
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.08); // soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2); // long decay
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + 2.4);
    void hue;
  }, []);

  const playComplete = useCallback(() => {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;
    const now = ac.currentTime;
    // A soft rising shimmer over the chord tones.
    VOICE_HZ.forEach((hz, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(hz * 2, now);
      const t0 = now + i * 0.12;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.07, t0 + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.5);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + 3.6);
    });
  }, []);

  // Main start gesture: build the audio graph + request sensor permission.
  const handleStart = useCallback(async () => {
    if (started) return;

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      setNotice("This browser has no Web Audio support.");
      return;
    }
    const ac = new Ctx();
    acRef.current = ac;
    await ac.resume().catch(() => {});

    // --- kid-safe master chain: master gain -> lowpass -> compressor -> out ---
    const master = ac.createGain();
    master.gain.value = 0.28; // <= 0.3
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000; // <= 7500
    lp.Q.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.attack.value = 0.05;
    comp.release.value = 0.4;
    master.connect(lp).connect(comp).connect(ac.destination);
    masterRef.current = master;

    // --- always-on gentle drone bed so it never feels broken ---
    const droneOsc = ac.createOscillator();
    const droneGain = ac.createGain();
    droneOsc.type = "sine";
    droneOsc.frequency.value = VOICE_HZ[0] / 2; // sub C2 hum
    droneGain.gain.value = 0;
    droneGain.gain.setValueAtTime(0, ac.currentTime);
    droneGain.gain.linearRampToValueAtTime(0.05, ac.currentTime + 2.5);
    droneOsc.connect(droneGain).connect(master);
    droneOsc.start();
    droneRef.current = { osc: droneOsc, gain: droneGain };

    // --- spatialized voices around the ring ---
    const azimuths = computeAzimuths(NUM_VOICES);
    const voices: Voice[] = azimuths.map((azimuth, idx) => {
      const panner = ac.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.maxDistance = 12;
      panner.rolloffFactor = 0.6;
      const { x, z } = azimuthToXZ(azimuth, 3);
      applyPannerPosition(panner, x, 0, z);

      const gain = ac.createGain();
      gain.gain.value = 0.0001; // silent until the beam approaches

      const osc = ac.createOscillator();
      osc.type = idx % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = VOICE_HZ[idx];

      // gentle vibrato so each voice feels alive/animal-like
      const lfo = ac.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 3 + (idx % 4) * 0.7;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = 2.5 + (idx % 3); // small pitch wobble in Hz
      lfo.connect(lfoGain).connect(osc.frequency);

      osc.connect(gain).connect(panner).connect(master);
      osc.start();
      lfo.start();

      return { idx, azimuth, panner, gain, osc, lfo, lfoGain, found: false };
    });
    voicesRef.current = voices;

    setStarted(true);

    // --- input mode resolution ---
    const DOE = (
      window as unknown as {
        DeviceOrientationEvent?: {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
      }
    ).DeviceOrientationEvent;

    let granted = false;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        granted = res === "granted";
      } catch {
        granted = false;
      }
    } else if (typeof window.DeviceOrientationEvent !== "undefined") {
      // Non-iOS: assume available; we confirm when the first event arrives.
      granted = true;
    }

    if (granted) {
      let gotEvent = false;
      const onOrient = (e: DeviceOrientationEvent) => {
        // Prefer compass alpha; fall back to gamma tilt as a sweep axis.
        let h: number | null = null;
        const wk = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
        if (typeof wk === "number" && !Number.isNaN(wk)) {
          h = wk;
        } else if (typeof e.alpha === "number" && e.alpha !== null) {
          h = 360 - e.alpha; // alpha decreases clockwise; flip for compass feel
        } else if (typeof e.gamma === "number" && e.gamma !== null) {
          h = ((e.gamma + 90) / 180) * 360;
        }
        if (h === null) return;
        gotEvent = true;
        targetHeadingRef.current = h;
        if (modeRef.current !== "sensor") {
          modeRef.current = "sensor";
          setMode("sensor");
          setNotice("");
        }
      };
      window.addEventListener("deviceorientation", onOrient, true);
      orientCleanupRef.current = () =>
        window.removeEventListener("deviceorientation", onOrient, true);

      // If no real event within 1.4s, fall back to auto-tour.
      window.setTimeout(() => {
        if (!gotEvent && modeRef.current !== "sensor") {
          modeRef.current = "auto";
          setMode("auto");
          setNotice("No motion sensor here — auto-tour is sweeping for you. Drag the ring to steer.");
        }
      }, 1400);
    } else {
      modeRef.current = "auto";
      setMode("auto");
      setNotice("Motion sensor unavailable — auto-tour is sweeping for you. Drag the ring to steer.");
    }
  }, [started]);

  const orientCleanupRef = useRef<(() => void) | null>(null);

  // The animation/audio loop. Runs once started.
  useEffect(() => {
    if (!started) return;

    const tick = (ts: number) => {
      const ac = acRef.current;
      if (!ac) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const last = lastTsRef.current || ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;

      // Advance auto-tour target.
      if (modeRef.current === "auto") {
        targetHeadingRef.current = (targetHeadingRef.current + AUTO_TOUR_DPS * dt) % 360;
      }

      // Smooth heading toward target (shortest path).
      const delta = angleDelta(targetHeadingRef.current, headingRef.current);
      headingRef.current = (headingRef.current + delta * HEADING_SMOOTH + 360) % 360;
      const heading = headingRef.current;

      // Rotate the listener to face the current heading.
      const listener = ac.listener;
      const fwd = azimuthToXZ(heading, 1);
      applyListenerOrientation(listener, fwd.x, 0, fwd.z);

      // Update each voice's swell from beam proximity.
      let foundNow = 0;
      const newDots: DotState[] = [];
      const voices = voicesRef.current;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        const d = angleDelta(v.azimuth, heading);
        const prox = computeProximity(d);
        const target = 0.0001 + prox * 0.9;
        // smooth, slow gain follow (long-ish time constant)
        v.gain.gain.setTargetAtTime(target, ac.currentTime, 0.15);

        if (!v.found && Math.abs(d) <= FOUND_WITHIN) {
          v.found = true;
          foundNow++;
          playChime(VOICE_HZ[v.idx], VOICE_HUE[v.idx]);
        }
        newDots.push({
          azimuth: v.azimuth,
          glow: v.found ? Math.max(0.45, prox) : prox * 0.55,
          found: v.found,
        });
      }

      if (foundNow > 0) {
        const total = voices.filter((v) => v.found).length;
        setFoundCount(total);
        if (total >= NUM_VOICES && !completeRef.current) {
          completeRef.current = true;
          setComplete(true);
          playComplete();
        }
      }

      setDots(newDots);
      setHeadingDisplay(heading);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [started, playChime, playComplete]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (orientCleanupRef.current) orientCleanupRef.current();
      const voices = voicesRef.current;
      voices.forEach((v) => {
        try {
          v.osc.stop();
          v.lfo.stop();
        } catch {
          /* already stopped */
        }
        v.osc.disconnect();
        v.lfo.disconnect();
        v.lfoGain.disconnect();
        v.gain.disconnect();
        v.panner.disconnect();
      });
      const drone = droneRef.current;
      if (drone) {
        try {
          drone.osc.stop();
        } catch {
          /* already stopped */
        }
        drone.osc.disconnect();
        drone.gain.disconnect();
      }
      const master = masterRef.current;
      if (master) master.disconnect();
      const ac = acRef.current;
      if (ac && ac.state !== "closed") ac.close().catch(() => {});
    };
  }, []);

  // Drag-to-turn handlers (works on desktop + as override on mobile).
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = true;
    dragRef.current.lastX = e.clientX;
    modeRef.current = "drag";
    setMode("drag");
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    dragRef.current.lastX = e.clientX;
    targetHeadingRef.current = (targetHeadingRef.current + dx * 0.5 + 360) % 360;
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    // After a manual turn, resume auto-tour if there is no live sensor.
    if (mode !== "sensor") {
      modeRef.current = "auto";
      setMode("auto");
    }
  }, [mode]);

  // --- Visual layout for the ring (SVG) ---
  const SIZE = 320;
  const C = SIZE / 2;
  const R = 124;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b0a14] text-foreground">
      {/* warm dim lantern background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 42%, rgba(80,52,28,0.35), rgba(11,10,20,0) 70%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-xl flex-col items-center px-5 py-8">
        <header className="w-full text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Sound Hunt
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Close your eyes, hold the tablet like a lantern, and slowly turn your body to find
            gentle animal sounds floating in the dark. Headphones make the 3D magic best.
          </p>
        </header>

        {!started ? (
          <div className="mt-12 flex flex-1 flex-col items-center justify-center gap-6">
            <button
              type="button"
              onClick={handleStart}
              className="flex min-h-[96px] min-w-[96px] items-center justify-center rounded-full bg-violet-200/90 px-10 py-6 text-2xl font-semibold text-[#2a1c0e] shadow-[0_0_40px_rgba(245,210,150,0.35)] transition hover:bg-violet-100 active:scale-95"
            >
              Light the lantern
            </button>
            <p className="max-w-xs text-center text-base text-muted-foreground">
              Tap to begin. We will ask to use your motion sensor so turning your body sweeps the
              listening beam.
            </p>
          </div>
        ) : (
          <div className="mt-8 flex flex-1 flex-col items-center gap-6">
            {/* compass / ring visual */}
            <div
              className="relative touch-none select-none"
              style={{ width: SIZE, height: SIZE }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                {/* outer ring */}
                <circle
                  cx={C}
                  cy={C}
                  r={R}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1.5}
                />
                {/* listening beam wedge pointing "up" = front */}
                <g transform={`rotate(${headingDisplay} ${C} ${C})`}>
                  <path
                    d={beamPath(C, R + 18, 46)}
                    fill="url(#beamGrad)"
                    opacity={complete ? 0.85 : 0.55}
                  />
                </g>
                {/* central lantern glow */}
                <circle
                  cx={C}
                  cy={C}
                  r={complete ? 26 : 16}
                  fill="rgba(245,210,150,0.9)"
                  style={{ filter: "blur(6px)" }}
                />
                <circle cx={C} cy={C} r={6} fill="rgba(255,244,225,0.95)" />

                {/* the hidden voices as dim dots */}
                {dots.map((d, i) => {
                  const pos = ringPos(d.azimuth, C, R);
                  const hue = VOICE_HUE[i];
                  const g = d.glow;
                  return (
                    <g key={i}>
                      {d.found && (
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={16}
                          fill={`hsla(${hue},70%,60%,${0.18 + g * 0.25})`}
                          style={{ filter: "blur(5px)" }}
                        />
                      )}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={d.found ? 7 : 5}
                        fill={`hsla(${hue},${d.found ? 75 : 40}%,${
                          d.found ? 68 : 38 + g * 30
                        }%,${0.35 + g * 0.6})`}
                      />
                    </g>
                  );
                })}

                <defs>
                  <linearGradient id="beamGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="rgba(245,210,150,0)" />
                    <stop offset="100%" stopColor="rgba(245,210,150,0.5)" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* status line */}
            <div className="text-center">
              <p className="text-lg text-foreground">
                {complete
                  ? "All found — sweet dreams. Keep turning to play forever."
                  : `Found ${foundCount} of ${NUM_VOICES}`}
              </p>
              {foundCount > 0 && (
                <p className="mt-1 text-base text-muted-foreground">
                  {dots
                    .map((d, i) => (d.found ? VOICE_NAME[i] : null))
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="mt-2 text-base text-muted-foreground">
                {mode === "sensor"
                  ? "Turn your body slowly to sweep the beam."
                  : "Drag the ring to turn — or let the auto-tour sweep for you."}
              </p>
            </div>

            {notice && (
              <p className="max-w-sm text-center text-base text-violet-300">{notice}</p>
            )}
          </div>
        )}

        {/* corner design notes affordance */}
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="fixed bottom-4 right-4 min-h-[44px] min-w-[44px] rounded-full border border-border bg-black/30 px-4 py-2.5 text-base text-muted-foreground backdrop-blur transition hover:bg-black/50"
        >
          {showNotes ? "Close" : "Design notes"}
        </button>

        {showNotes && (
          <div className="fixed inset-x-4 bottom-20 z-20 mx-auto max-w-md rounded-2xl border border-border bg-[#15131f]/95 p-5 text-base text-muted-foreground shadow-2xl backdrop-blur">
            <h2 className="mb-2 text-xl font-semibold text-foreground">Design notes</h2>
            <p className="mb-2">
              Eight gentle voices, each a C-major pentatonic chord tone, are placed at fixed
              azimuths around a 360° ring with Web Audio{" "}
              <span className="text-foreground">PannerNode (HRTF)</span> spatialization. Your compass
              heading rotates the AudioListener; when the listening beam nears a voice it swells,
              latches a soft chime, and its dot glows. Collect all eight and the full chord blooms.
            </p>
            <p className="mb-2 text-muted-foreground">
              Inspired by PlugSonic (web/mobile binaural sonic narratives, Geronazzo et al.) and
              Pauline Oliveros&apos; Deep Listening. Built for calm, eyes-closed, bedtime play —
              nothing is ever &quot;wrong.&quot;
            </p>
            <Link href="/dream" className="text-violet-200/90 underline">
              Back to the dream lab
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

// --- pure visual helpers (no browser globals) ---

function ringPos(azimuthDeg: number, c: number, r: number): { x: number; y: number } {
  // azimuth 0 = top (front), increasing clockwise
  const rad = ((azimuthDeg - 90) * Math.PI) / 180;
  return { x: c + Math.cos(rad) * r, y: c + Math.sin(rad) * r };
}

function beamPath(c: number, r: number, halfWidthDeg: number): string {
  const a0 = (-90 - halfWidthDeg) * (Math.PI / 180);
  const a1 = (-90 + halfWidthDeg) * (Math.PI / 180);
  const x0 = c + Math.cos(a0) * r;
  const y0 = c + Math.sin(a0) * r;
  const x1 = c + Math.cos(a1) * r;
  const y1 = c + Math.sin(a1) * r;
  return `M ${c} ${c} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}
