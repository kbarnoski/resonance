"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PRESETS,
  presetById,
  fetchSea,
  makeSyntheticSea,
  type Preset,
  type SeaState,
  type SeaDrive,
} from "./marine";
import { GamelanEngine, type TuningName } from "./audio";
import { startScene, type SceneHandle } from "./gl";

const POLL_MS = 5 * 60 * 1000; // re-poll live feed every 5 min

type Source = "live" | "simulated" | "connecting";

interface SeaSlot {
  preset: Preset;
  source: Source;
  drive: SeaDrive;
  waveHeight: number;
}

const ZERO_DRIVE: SeaDrive = { roughness: 0.3, period: 8, direction: 180, swell: 0.3 };

export default function MarineGamelanPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const engineRef = useRef<GamelanEngine | null>(null);

  // per-slot polling/abort/synthetic state lives in refs so timers read fresh.
  const abortRef = useRef<{ a: AbortController | null; b: AbortController | null }>({
    a: null,
    b: null,
  });
  const synthClockRef = useRef(0);
  const intervalsRef = useRef<number[]>([]);
  const bloomRafRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [audioOk, setAudioOk] = useState(true);
  const [tuning, setTuning] = useState<TuningName>("slendro");
  const [snap, setSnap] = useState(false);
  const [muted, setMuted] = useState(false);
  const [crossfade, setCrossfade] = useState(0);
  const [idA, setIdA] = useState("drake");
  const [idB, setIdB] = useState("maldives");

  const [slotA, setSlotA] = useState<SeaSlot>({
    preset: presetById("drake"),
    source: "connecting",
    drive: ZERO_DRIVE,
    waveHeight: 0,
  });
  const [slotB, setSlotB] = useState<SeaSlot>({
    preset: presetById("maldives"),
    source: "connecting",
    drive: ZERO_DRIVE,
    waveHeight: 0,
  });

  // Whichever slot is "primary" for the shader: blend by crossfade so the
  // image reads the sea you are mostly hearing.
  const applyShaderDrive = useCallback(
    (a: SeaSlot, b: SeaSlot, x: number) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const mix = (k: keyof SeaDrive) => a.drive[k] * (1 - x) + b.drive[k] * x;
      scene.setDrive({
        roughness: mix("roughness"),
        period: mix("period"),
        direction: x < 0.5 ? a.drive.direction : b.drive.direction,
        swell: mix("swell"),
      });
    },
    [],
  );

  // Push a fresh SeaState into a slot: updates engine voice + UI + shader.
  const ingest = useCallback(
    (which: "a" | "b", state: SeaState, preset: Preset) => {
      const engine = engineRef.current;
      const slot: SeaSlot = {
        preset,
        source: state.source,
        drive: state.drive,
        waveHeight: state.waveHeight,
      };
      if (which === "a") {
        engine?.voiceA.setDrive(state.drive);
        setSlotA(slot);
      } else {
        engine?.voiceB.setDrive(state.drive);
        setSlotB(slot);
      }
    },
    [],
  );

  // Poll one slot once: try live, fall back to synthetic.
  const pollSlot = useCallback(
    async (which: "a" | "b", preset: Preset) => {
      const ctrl = new AbortController();
      if (which === "a") {
        abortRef.current.a?.abort();
        abortRef.current.a = ctrl;
      } else {
        abortRef.current.b?.abort();
        abortRef.current.b = ctrl;
      }
      const live = await fetchSea(preset, ctrl.signal).catch(() => null);
      if (ctrl.signal.aborted) return;
      if (live) {
        ingest(which, live, preset);
      } else {
        const synth = makeSyntheticSea(preset, synthClockRef.current);
        ingest(which, synth, preset);
      }
    },
    [ingest],
  );

  // Re-bind a slot to a different preset (button / B-picker).
  const selectPreset = useCallback(
    (which: "a" | "b", id: string) => {
      const preset = presetById(id);
      if (which === "a") setIdA(id);
      else setIdB(id);
      if (started) void pollSlot(which, preset);
    },
    [started, pollSlot],
  );

  // ── Start: gesture-gated AudioContext + scene + polling loops ───────────
  const handleStart = useCallback(() => {
    if (started) return;
    setStarted(true);

    // audio (gesture-gated inside the tap for iOS)
    try {
      const engine = new GamelanEngine();
      engine.resume();
      engine.setTuning(tuning);
      engine.setSnap(snap);
      engine.setCrossfade(crossfade);
      engineRef.current = engine;
      setAudioOk(true);
    } catch {
      engineRef.current = null;
      setAudioOk(false);
    }

    // visuals
    const canvas = canvasRef.current;
    if (canvas) {
      const scene = startScene(canvas);
      if (scene) {
        sceneRef.current = scene;
        setWebglOk(true);
      } else {
        setWebglOk(false);
      }
    }

    // synthetic clock advances even before/without live data.
    const tick = window.setInterval(() => {
      synthClockRef.current += 0.5;
    }, 500);
    intervalsRef.current.push(tick);

    // initial poll for both slots + 5-min re-poll.
    void pollSlot("a", presetById(idA));
    void pollSlot("b", presetById(idB));
    const repoll = window.setInterval(() => {
      void pollSlot("a", presetById(idA));
      void pollSlot("b", presetById(idB));
    }, POLL_MS);
    intervalsRef.current.push(repoll);

    // bloom + level driver: tap the master so the violet bloom pulses with
    // the actual audio, and feed the shader its loudness.
    const driveBloom = () => {
      const eng = engineRef.current;
      const scn = sceneRef.current;
      if (eng && scn) {
        const lvl = eng.masterLevel();
        scn.setLevel(lvl);
        // pulse on transients (loudness above a threshold)
        if (lvl > 0.32) scn.pulseBloom(Math.min(0.5, (lvl - 0.32) * 1.2));
      }
      bloomRafRef.current = requestAnimationFrame(driveBloom);
    };
    bloomRafRef.current = requestAnimationFrame(driveBloom);
  }, [started, tuning, snap, crossfade, idA, idB, pollSlot]);

  // While simulated, refresh that slot's synthetic sea so it keeps evolving.
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      if (slotA.source === "simulated") {
        const s = makeSyntheticSea(slotA.preset, synthClockRef.current);
        engine.voiceA.setDrive(s.drive);
        setSlotA((prev) => ({ ...prev, drive: s.drive, waveHeight: s.waveHeight }));
      }
      if (slotB.source === "simulated") {
        const s = makeSyntheticSea(slotB.preset, synthClockRef.current);
        engine.voiceB.setDrive(s.drive);
        setSlotB((prev) => ({ ...prev, drive: s.drive, waveHeight: s.waveHeight }));
      }
    }, 700);
    return () => window.clearInterval(id);
  }, [started, slotA.source, slotB.source, slotA.preset, slotB.preset]);

  // Keep the shader drive in sync with both slots + crossfade.
  useEffect(() => {
    applyShaderDrive(slotA, slotB, crossfade);
  }, [slotA, slotB, crossfade, applyShaderDrive]);

  // Live control bindings.
  useEffect(() => {
    engineRef.current?.setTuning(tuning);
  }, [tuning]);
  useEffect(() => {
    engineRef.current?.setSnap(snap);
  }, [snap]);
  useEffect(() => {
    engineRef.current?.setCrossfade(crossfade);
  }, [crossfade]);
  useEffect(() => {
    engineRef.current?.setMuted(muted);
  }, [muted]);

  // ── Full teardown ───────────────────────────────────────────────────────
  useEffect(() => {
    const aborts = abortRef.current;
    const intervals = intervalsRef.current;
    return () => {
      cancelAnimationFrame(bloomRafRef.current);
      for (const id of intervals) window.clearInterval(id);
      intervalsRef.current = [];
      aborts.a?.abort();
      aborts.b?.abort();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const badge = (s: Source) =>
    s === "live" ? (
      <span className="text-emerald-300/95">live feed</span>
    ) : s === "simulated" ? (
      <span className="text-rose-300">(live feed unavailable — simulated sea)</span>
    ) : (
      <span className="text-white/55">connecting…</span>
    );

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05070f] text-white">
      {/* WebGL2 caustic water-light — the main visualization */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* dark scrim for text legibility */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-5 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Marine Gamelan
          </h1>
          <p className="max-w-2xl text-base text-white/80">
            The real, live state of the world&rsquo;s oceans plays a bronze
            gamelan — heavy seas roughen the metal into a beating, detuned clang
            while calm seas stay sparse, high and sweet.
          </p>
        </header>

        {!started ? (
          <button
            onClick={handleStart}
            className="w-fit rounded-xl bg-violet-500/90 px-6 py-3 text-base font-medium text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-400"
          >
            Start the sea
          </button>
        ) : (
          <div className="space-y-5">
            {!webglOk && (
              <p className="text-base text-rose-300">
                WebGL2 unavailable — the audio keeps playing without the caustic
                shader.
              </p>
            )}
            {!audioOk && (
              <p className="text-base text-rose-300">
                Web Audio unavailable — the visuals keep running without sound.
              </p>
            )}

            {/* preset buttons → drive Sea A */}
            <div className="space-y-2">
              <div className="text-sm uppercase tracking-wide text-white/55">
                Sea A
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPreset("a", p.id)}
                    className={`rounded-lg px-4 py-2.5 text-base transition ${
                      idA === p.id
                        ? "bg-white/90 text-black"
                        : "bg-white/10 text-white/80 hover:bg-white/20"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* dual-sea crossfade + B picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-wide text-white/55">
                  Sea B &amp; crossfade
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPreset("b", p.id)}
                    className={`rounded-lg px-4 py-2.5 text-base transition ${
                      idB === p.id
                        ? "bg-amber-300/90 text-black"
                        : "bg-white/10 text-white/80 hover:bg-white/20"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="block space-y-1">
                <span className="text-sm text-white/75">
                  Crossfade A → B ({Math.round((1 - crossfade) * 100)}% /{" "}
                  {Math.round(crossfade * 100)}%)
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={crossfade}
                  onChange={(e) => setCrossfade(parseFloat(e.target.value))}
                  className="h-2 w-full cursor-pointer accent-violet-400"
                />
              </label>
            </div>

            {/* toggles + panic */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  setTuning((t) => (t === "slendro" ? "pelog" : "slendro"))
                }
                className="rounded-lg bg-white/10 px-4 py-2.5 text-base text-white/85 transition hover:bg-white/20"
              >
                Tuning: {tuning === "slendro" ? "Slendro" : "Pelög"}
              </button>
              <button
                onClick={() => setSnap((v) => !v)}
                className={`rounded-lg px-4 py-2.5 text-base transition ${
                  snap
                    ? "bg-emerald-400/90 text-black"
                    : "bg-white/10 text-white/85 hover:bg-white/20"
                }`}
              >
                Snap to groove: {snap ? "on" : "off"}
              </button>
              <button
                onClick={() => setMuted((v) => !v)}
                className={`rounded-lg px-4 py-2.5 text-base transition ${
                  muted
                    ? "bg-rose-400/90 text-black"
                    : "bg-white/10 text-white/85 hover:bg-white/20"
                }`}
              >
                {muted ? "Muted — tap to unmute" : "Panic mute"}
              </button>
            </div>

            {/* live 4-value sea meters */}
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["A", slotA],
                  ["B", slotB],
                ] as const
              ).map(([label, slot]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-base text-white/95">
                      {slot.preset.label}
                    </span>
                    {badge(slot.source)}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-white/75">
                    <div className="flex justify-between">
                      <dt>Wave height</dt>
                      <dd className="text-white/90">
                        {slot.waveHeight.toFixed(2)} m
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Period</dt>
                      <dd className="text-white/90">
                        {slot.drive.period.toFixed(1)} s
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Direction</dt>
                      <dd className="text-white/90">
                        {Math.round(slot.drive.direction)}°
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Roughness</dt>
                      <dd className="text-amber-300/95">
                        {slot.drive.roughness.toFixed(2)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto pt-4">
          <Link
            href="/dream/864-marine-gamelan/README.md"
            className="text-sm text-violet-300 underline-offset-4 hover:underline"
          >
            Read the design notes →
          </Link>
        </div>
      </div>
    </main>
  );
}
