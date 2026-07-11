"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 330 · Stillness — an ANTI-instrument
//   "What if an instrument rewarded SILENCE instead of noise — a room that
//   BLOOMS in your stillness and SCATTERS at the first sound you make?"
//
//   INPUT     microphone level, INVERTED, with RMS hysteresis (QUIET / NOISE).
//             Fallbacks that need no mic: press-&-hold "be quiet" + a hands-free
//             "breathing" auto-demo.
//   OUTPUT    a just-intonation drone (E2 root) that blooms partial-by-partial
//             in silence and collapses on a startle; an inline-SVG room whose
//             central light blooms and whose motes scatter at sound.
//   REFS      Cage 4'33" (inverted), Oliveros Deep Listening, Radigue drone.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DroneEngine } from "./audio";
import { Scene, createMotes, runMotes, type Mote } from "./scene";

// ── The two named tuning constants the brief asks for, at the top. ──
const QUIET = 0.045; // sustained RMS below this → the room blooms
const NOISE = 0.12; // a rising edge above this → startle

const STORAGE_KEY = "dream-330-stillness-longest";

type Provenance = "listening" | "touch" | "auto";

export default function StillnessPage() {
  const [begun, setBegun] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<Provenance>("auto");
  const [autoDemo, setAutoDemo] = useState(true);

  // Displayed state (throttled from the animation loop).
  const [streak, setStreak] = useState(0);
  const [longest, setLongest] = useState(0);
  const [displayRms, setDisplayRms] = useState(0);
  const [displayBloom, setDisplayBloom] = useState(0);

  // ── Refs that the rAF loop reads/writes without re-rendering ──
  const engineRef = useRef<DroneEngine | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number>(0);

  const motesRef = useRef<Mote[]>(createMotes(46));
  const bloomRef = useRef(0);
  const rmsRef = useRef(0);
  const streakRef = useRef(0);
  const longestRef = useRef(0);
  const startleFlashRef = useRef(0);
  const scatterRef = useRef(0);
  const wasOverNoiseRef = useRef(false);
  const lastTsRef = useRef(0);
  const lastHudRef = useRef(0);

  // Input-mode refs (read inside the loop to dodge stale closures).
  const holdingRef = useRef(false);
  const autoDemoRef = useRef(true);
  const provenanceRef = useRef<Provenance>("auto");
  useEffect(() => {
    autoDemoRef.current = autoDemo;
  }, [autoDemo]);

  // Render-trigger: bumping this state re-renders <Scene> each frame.
  const [, setTick] = useState(0);

  // Load the persisted longest streak once.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const v = parseFloat(raw);
        if (!Number.isNaN(v)) {
          longestRef.current = v;
          setLongest(v);
        }
      }
    } catch {
      /* localStorage unavailable — non-fatal */
    }
  }, []);

  const persistLongest = useCallback((v: number) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Math.round(v)));
    } catch {
      /* ignore */
    }
  }, []);

  // ── Per-frame: compute the inverted-silence drive and update everything. ──
  const runFrame = useCallback(
    (ts: number) => {
      const last = lastTsRef.current || ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;
      const tSec = ts / 1000;

      // 1) Measure the room's RMS (mic), or synthesize it (touch / auto-demo).
      let rms = 0;
      const mode = provenanceRef.current;
      if (mode === "listening" && analyserRef.current && timeBufRef.current) {
        const buf = timeBufRef.current;
        analyserRef.current.getFloatTimeDomainData(
          buf as unknown as Float32Array<ArrayBuffer>
        );
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        rms = Math.sqrt(sum / buf.length);
      } else if (mode === "touch") {
        // While held, the room "is quiet"; on release we emit a brief noise edge.
        rms = holdingRef.current ? 0.012 : 0.34;
      } else {
        // auto-demo "breathing": a slow sine that crosses the QUIET/NOISE bands,
        // with an occasional startle spike so the piece is alive on its own.
        const breath = (Math.sin(tSec * 0.32) + 1) / 2; // 0..1, ~20s cycle
        rms = 0.006 + breath * 0.07;
        // Every ~24s, a deliberate "sound" to demonstrate the startle.
        if (Math.sin(tSec * 0.26) > 0.985) rms = 0.3;
      }
      // Smooth the measured RMS a little for the meter & detector.
      rmsRef.current = rmsRef.current * 0.7 + rms * 0.3;
      const smRms = rmsRef.current;

      // 2) Hysteresis: rising edge over NOISE = startle; sustained < QUIET = bloom.
      const overNoise = smRms >= NOISE;
      if (overNoise && !wasOverNoiseRef.current) {
        // STARTLE
        bloomRef.current = 0;
        streakRef.current = 0;
        scatterRef.current = 1;
        startleFlashRef.current = 1;
        engineRef.current?.startle();
      }
      wasOverNoiseRef.current = overNoise;

      // 3) Bloom integrates upward only while genuinely quiet (< QUIET).
      if (smRms < QUIET) {
        bloomRef.current = Math.min(1, bloomRef.current + dt * 0.12);
        streakRef.current += dt;
        if (streakRef.current > longestRef.current) {
          longestRef.current = streakRef.current;
        }
      } else if (!overNoise) {
        // In the ambiguous band (QUIET..NOISE) the bloom gently recedes and the
        // streak pauses — you're not silent enough to grow.
        bloomRef.current = Math.max(0, bloomRef.current - dt * 0.08);
      }

      // 4) Push the bloom into the audio engine.
      engineRef.current?.setBloom(bloomRef.current);

      // 5) Advance motes + decay transient impulses.
      runMotes(motesRef.current, bloomRef.current, scatterRef.current, dt, tSec);
      scatterRef.current = 0;
      startleFlashRef.current = Math.max(0, startleFlashRef.current - dt * 2);

      // 6) Re-render the scene; throttle the React-state HUD to ~10fps.
      setTick((n) => (n + 1) % 1000000);
      if (ts - lastHudRef.current > 100) {
        lastHudRef.current = ts;
        setDisplayRms(smRms);
        setDisplayBloom(bloomRef.current);
        setStreak(streakRef.current);
        setLongest(longestRef.current);
      }

      rafRef.current = requestAnimationFrame(runFrame);
    },
    []
  );

  // Persist longest on unmount and whenever it ratchets up (debounced via HUD).
  useEffect(() => {
    if (longest > 0) persistLongest(longest);
  }, [longest, persistLongest]);

  // ── Teardown ──
  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    engineRef.current?.stop();
    engineRef.current = null;
    persistLongest(longestRef.current);
  }, [persistLongest]);

  useEffect(() => () => teardown(), [teardown]);

  // ── Begin: create the AudioContext (user gesture), try the mic, start loop. ──
  const begin = useCallback(async () => {
    if (begun) return;
    const engine = new DroneEngine();
    engineRef.current = engine;
    await engine.resume();
    engine.start();

    // Try the mic, but never block on it — fallbacks fully cover denial.
    let mode: Provenance = autoDemoRef.current ? "auto" : "touch";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const src = engine.ctx.createMediaStreamSource(stream);
      const analyser = engine.ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      src.connect(analyser); // NOT connected to destination — no feedback.
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * 4)
      );
      mode = "listening";
      setMicError(null);
    } catch {
      setMicError(
        "Microphone unavailable — use Be quiet (press & hold), or leave the breathing auto-demo running. The piece works fully without a mic."
      );
      // If the mic is denied, keep auto-demo so the page is never silent/static.
      mode = autoDemoRef.current ? "auto" : "touch";
    }

    provenanceRef.current = mode;
    setProvenance(mode);
    setBegun(true);
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(runFrame);
  }, [begun, runFrame]);

  // ── Press-&-hold "be quiet" handlers (mouse, touch, keyboard) ──
  const setHold = useCallback(
    (down: boolean) => {
      holdingRef.current = down;
      // Holding forces touch-mode so the gesture has authority over the mic/auto.
      if (down && provenanceRef.current !== "touch") {
        provenanceRef.current = "touch";
        setProvenance("touch");
        autoDemoRef.current = false;
        setAutoDemo(false);
      }
    },
    []
  );

  const toggleAuto = useCallback(() => {
    setAutoDemo((prev) => {
      const next = !prev;
      autoDemoRef.current = next;
      if (next) {
        provenanceRef.current = "auto";
        setProvenance("auto");
      } else if (analyserRef.current) {
        provenanceRef.current = "listening";
        setProvenance("listening");
      } else {
        provenanceRef.current = "touch";
        setProvenance("touch");
      }
      return next;
    });
  }, []);

  const badge = (() => {
    if (provenance === "listening")
      return { text: "Listening 🎤", cls: "text-violet-300/95 border-violet-400/40" };
    if (provenance === "touch")
      return { text: "Touch mode ✋", cls: "text-violet-300/95 border-violet-400/40" };
    return { text: "Auto-demo (breathing)", cls: "text-violet-300 border-violet-400/40" };
  })();

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05060f] text-foreground">
      {/* ── The SVG room ── */}
      <div className="absolute inset-0">
        <Scene
          motes={motesRef.current}
          bloom={bloomRef.current}
          rms={displayRms}
          quiet={QUIET}
          noise={NOISE}
          startleFlash={startleFlashRef.current}
        />
      </div>

      {/* ── Header ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-xl">
            <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
              Stillness
            </h1>
            <p className="mt-1 text-base text-foreground">
              An anti-instrument: the room blooms in your silence and scatters at
              the first sound you make.
            </p>
          </div>
          <span
            className={`pointer-events-auto shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${badge.cls}`}
          >
            {badge.text}
          </span>
        </div>
      </header>

      {/* ── Stillness HUD (top-center-ish) ── */}
      {begun && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 text-center sm:top-28">
          <div className="font-serif text-5xl tabular-nums text-foreground sm:text-6xl">
            {streak.toFixed(1)}
            <span className="text-2xl text-muted-foreground">s</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            stillness streak · bloom {(displayBloom * 100).toFixed(0)}%
          </div>
          <div className="mt-1 text-base text-violet-300/95">
            longest stillness: {Math.round(longest)}s
          </div>
        </div>
      )}

      {/* ── Bottom controls ── */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7">
        {!begun ? (
          <div className="flex flex-col items-start gap-3">
            <button
              onClick={begin}
              className="min-h-[44px] rounded-xl bg-violet-500/90 px-6 py-2.5 text-base font-medium text-foreground shadow-lg shadow-violet-900/40 transition hover:bg-violet-400"
            >
              Begin — then be still
            </button>
            <p className="max-w-md text-base text-muted-foreground">
              Sound is the enemy here. Stay quiet and the drone deepens; make a
              noise and it collapses. Cage&rsquo;s <em>4&prime;33&Prime;</em>,
              turned inside out.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onMouseDown={() => setHold(true)}
              onMouseUp={() => setHold(false)}
              onMouseLeave={() => setHold(false)}
              onTouchStart={(e) => {
                e.preventDefault();
                setHold(true);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                setHold(false);
              }}
              className="min-h-[44px] touch-none select-none rounded-xl border border-violet-400/40 bg-violet-500/15 px-5 py-2.5 text-base font-medium text-violet-300/95 transition active:bg-violet-500/30"
            >
              Be quiet (press &amp; hold)
            </button>
            <button
              onClick={toggleAuto}
              className={`min-h-[44px] rounded-xl border px-5 py-2.5 text-base font-medium transition ${
                autoDemo
                  ? "border-violet-400/50 bg-violet-500/20 text-violet-300"
                  : "border-border bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {autoDemo ? "Auto-demo: on" : "Auto-demo: off"}
            </button>
            <span className="text-sm text-muted-foreground">
              release / make a sound → startle
            </span>
          </div>
        )}

        {micError && (
          <p className="mt-3 max-w-lg text-base text-violet-300">{micError}</p>
        )}
      </div>

      {/* ── Design notes link ── */}
      <Link
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/330-stillness/README.md"
        target="_blank"
        className="absolute right-5 top-20 z-10 text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 transition hover:text-foreground sm:right-7 sm:top-24"
      >
        Design notes
      </Link>
    </main>
  );
}
