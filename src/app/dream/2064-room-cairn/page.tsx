"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CairnEngine, type LayerInfo } from "./audio";
import { MATERIALS, ORDER, type MaterialId } from "./materials";
import { mulberry32 } from "./rng";
import { OnsetDetector, materialForCentroid } from "./onset";

interface Pebble {
  id: number;
  x: number;
  color: string;
  kind: "tap" | "fall";
  rot: number;
  size: number;
}

interface GhostStep {
  at: number;
  run: () => void;
}

interface GhostState {
  active: boolean;
  start: number;
  idx: number;
  cycle: number;
  steps: GhostStep[];
}

const clamp01 = (x: number) => Math.max(0.05, Math.min(1, x));
const AUTO_LAY_GAP = 1.4; // seconds of silence after a burst → auto-lay

export default function RoomCairnPage() {
  const engineRef = useRef<CairnEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new CairnEngine();

  const [started, setStarted] = useState(false);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ghostOn, setGhostOn] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [pebbles, setPebbles] = useState<Pebble[]>([]);
  const [sensitivity, setSensitivity] = useState(1);
  const [autoLay, setAutoLay] = useState(true);
  const [lastHeard, setLastHeard] = useState<MaterialId | null>(null);

  const startedRef = useRef(false);
  const versionRef = useRef(-1);
  const lastInteractRef = useRef(0);
  const everInteractedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const rngVisualRef = useRef<() => number>(mulberry32(0xca1c19));
  const pebbleIdRef = useRef(0);
  const removalTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const stoneRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const stoneAnimated = useRef<Set<number>>(new Set());
  const pebbleAnimated = useRef<Set<number>>(new Set());
  const detectorRef = useRef<OnsetDetector | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const lastOnsetAtRef = useRef(0);
  const autoLayRef = useRef(true);
  const ghostRef = useRef<GhostState>({
    active: false,
    start: 0,
    idx: 0,
    cycle: 0,
    steps: [],
  });

  useEffect(() => {
    autoLayRef.current = autoLay;
  }, [autoLay]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  // ── visual helpers ─────────────────────────────────────────────────────────
  const fireHaptic = useCallback((materialId: MaterialId, vel: number) => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    const ms = Math.round(MATERIALS[materialId].haptic * clamp01(vel));
    try {
      navigator.vibrate(Math.max(6, ms));
    } catch {
      /* silent no-op where unsupported */
    }
  }, []);

  const spawnPebble = useCallback(
    (color: string, vel: number, kind: "tap" | "fall" = "tap") => {
      const rng = rngVisualRef.current;
      const id = pebbleIdRef.current++;
      const x = Math.round((rng() * 2 - 1) * 92);
      const rot = Math.round((rng() * 2 - 1) * 70);
      const size = kind === "tap" ? 12 + vel * 10 : 9 + rng() * 6;
      setPebbles((prev) => {
        const next = [...prev, { id, x, color, kind, rot, size }];
        return next.length > 16 ? next.slice(next.length - 16) : next;
      });
      const timer = setTimeout(
        () => {
          setPebbles((prev) => prev.filter((p) => p.id !== id));
          pebbleAnimated.current.delete(id);
          removalTimers.current.delete(timer);
        },
        kind === "fall" ? 780 : 700,
      );
      removalTimers.current.add(timer);
    },
    [],
  );

  const spawnTumbleDebris = useCallback(
    (color: string) => {
      for (let i = 0; i < 4; i++) spawnPebble(color, 0.4, "fall");
    },
    [spawnPebble],
  );

  const pulseStone = useCallback((layerId: number) => {
    const el = stoneRefs.current.get(layerId);
    if (!el) return;
    if (reducedMotionRef.current) {
      el.animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], {
        duration: 280,
        easing: "ease-out",
      });
      return;
    }
    el.animate(
      [
        { transform: "scale(1)", filter: "brightness(1)" },
        { transform: "scale(1.16)", filter: "brightness(1.9)", offset: 0.18 },
        { transform: "scale(1)", filter: "brightness(1)" },
      ],
      { duration: 300, easing: "ease-out" },
    );
  }, []);

  const markUser = useCallback(() => {
    const engine = engineRef.current;
    lastInteractRef.current = engine ? engine.now() : 0;
    everInteractedRef.current = true;
    if (ghostRef.current.active) {
      ghostRef.current.active = false;
      setGhostOn(false);
    }
  }, []);

  // ── the core impact gesture (shared by room onsets and the ghost) ──────────
  const handleStrike = useCallback(
    (materialId: MaterialId, vel: number, isUser: boolean) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.tap(materialId, vel);
      spawnPebble(MATERIALS[materialId].color, vel, "tap");
      if (isUser) {
        fireHaptic(materialId, vel);
        markUser();
      }
    },
    [spawnPebble, fireHaptic, markUser],
  );

  // ── deterministic ghost performer (headless self-demo) ─────────────────────
  const makeGhostSteps = useCallback(
    (rng: () => number): GhostStep[] => {
      const engine = engineRef.current;
      if (!engine) return [];
      const pick = () => ORDER[Math.floor(rng() * ORDER.length)];
      const vel = () => 0.5 + rng() * 0.4;
      const m1 = pick();
      const m2 = pick();
      const m3 = pick();
      const strike = (m: MaterialId) => handleStrike(m, vel(), false);
      const knockOldest = () => {
        const ls = engine.getLayers();
        if (!ls.length) return;
        const mat = ls[0].material;
        engine.deleteLayer(ls[0].id);
        spawnTumbleDebris(MATERIALS[mat].color);
      };
      return [
        { at: 0.0, run: () => strike(m1) },
        { at: 0.42, run: () => strike(m1) },
        { at: 0.8, run: () => strike(m1) },
        { at: 1.2, run: () => strike(m1) },
        { at: 1.55, run: () => void engine.lay() }, // LAY — first looping layer
        { at: 2.35, run: () => strike(m2) },
        { at: 2.7, run: () => strike(m2) },
        { at: 3.15, run: () => strike(m2) },
        { at: 3.45, run: () => void engine.lay() }, // second layer → PHASING
        { at: 5.2, run: () => strike(m3) },
        { at: 5.75, run: () => strike(m3) },
        { at: 6.05, run: () => void engine.lay() }, // third layer
        { at: 11.0, run: knockOldest }, // KNOCK A STONE OFF — audible un-making
        {
          at: 13.8,
          run: () => {
            const ls = engine.getLayers();
            if (ls[0]) engine.cycleMaterial(ls[0].id); // CHANGE a stone's material
          },
        },
        { at: 16.8, run: knockOldest },
        { at: 18.2, run: () => strike(m1) },
        { at: 18.6, run: () => strike(m1) },
        { at: 18.9, run: () => void engine.lay() },
        { at: 24.0, run: () => {} }, // let the last figure breathe, then loop
      ];
    },
    [handleStrike, spawnTumbleDebris],
  );

  const runGhost = useCallback(
    (now: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const g = ghostRef.current;
      const since = now - lastInteractRef.current;
      const armDelay = everInteractedRef.current ? 15 : 1.2;
      if (!g.active) {
        if (since >= armDelay) {
          engine.clear();
          g.cycle += 1;
          const rng = mulberry32((0x51fe2064 ^ (g.cycle * 2654435761)) >>> 0);
          g.steps = makeGhostSteps(rng);
          g.start = now;
          g.idx = 0;
          g.active = true;
          setGhostOn(true);
        }
        return;
      }
      while (g.idx < g.steps.length && now - g.start >= g.steps[g.idx].at) {
        g.steps[g.idx].run();
        g.idx += 1;
      }
      if (g.idx >= g.steps.length) {
        g.active = false;
        setGhostOn(false);
        lastInteractRef.current = now; // brief pause, then the demo loops
      }
    },
    [makeGhostSteps],
  );

  // ── boot audio + microphone inside the Begin gesture ───────────────────────
  const onBegin = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const ok = await engine.begin();
    if (!ok) {
      setAudioError(
        "Audio is blocked in this browser — the cairn is silent, but the ghost and visuals still play.",
      );
    }
    startedRef.current = true;
    lastInteractRef.current = engine.now();
    setStarted(true);

    // Attach the ambient mic to the SAME AudioContext as the engine.
    const ctx = engine.audioContext;
    if (ctx && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        const det = new OnsetDetector(ctx, stream);
        det.sensitivity = sensitivity;
        detectorRef.current = det;
        setListening(true);
      } catch {
        setMicError(
          "Microphone blocked — the room can't play the cairn. The ghost performer keeps going; allow mic access and reload to play with sound.",
        );
      }
    } else if (ok) {
      setMicError(
        "This browser exposes no microphone — the ghost performer plays on its own.",
      );
    }
  }, [sensitivity]);

  // ── main loop: mic onset detection + scheduler tick + visuals + ghost ──────
  useEffect(() => {
    if (!started) return;
    const engine = engineRef.current;
    if (!engine) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = engine.now();

      // 1. listen to the room
      const det = detectorRef.current;
      if (det) {
        const onset = det.detect(now);
        if (meterRef.current) {
          meterRef.current.style.transform = `scaleX(${Math.min(1, det.level * 1.6)})`;
        }
        if (onset) {
          const mid = materialForCentroid(onset.centroid);
          handleStrike(mid, onset.velocity, true);
          setLastHeard(mid);
          lastOnsetAtRef.current = now;
        }
      }

      // 2. hands-free auto-lay after a burst falls silent
      if (
        autoLayRef.current &&
        !ghostRef.current.active &&
        engine.pendingCount >= 2 &&
        lastOnsetAtRef.current > 0 &&
        now - lastOnsetAtRef.current > AUTO_LAY_GAP
      ) {
        if (engine.lay()) {
          fireHaptic("wood", 0.5);
          lastOnsetAtRef.current = 0;
        }
      }

      // 3. sound scheduler + visuals
      engine.tick();
      const impacts = engine.drainVisual();
      for (const im of impacts) pulseStone(im.layerId);
      if (engine.version !== versionRef.current) {
        versionRef.current = engine.version;
        setLayers(engine.getLayers());
        setPendingCount(engine.pendingCount);
        setMuted(engine.muted);
      }

      // 4. the ghost performer (fills silence, self-demo)
      runGhost(now);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, pulseStone, runGhost, handleStrike, fireHaptic]);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      detectorRef.current?.destroy();
      detectorRef.current = null;
      engineRef.current?.destroy();
      engineRef.current = null;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // ── control handlers ───────────────────────────────────────────────────────
  const onSensitivity = useCallback((v: number) => {
    setSensitivity(v);
    if (detectorRef.current) detectorRef.current.sensitivity = v;
  }, []);

  const onLay = useCallback(() => {
    markUser();
    lastOnsetAtRef.current = 0;
    if (engineRef.current?.lay()) fireHaptic("wood", 0.5);
  }, [markUser, fireHaptic]);

  const onDiscard = useCallback(() => {
    markUser();
    lastOnsetAtRef.current = 0;
    engineRef.current?.discardPending();
  }, [markUser]);

  const onKnock = useCallback(
    (id: number, material: MaterialId) => {
      markUser();
      engineRef.current?.deleteLayer(id);
      spawnTumbleDebris(MATERIALS[material].color);
      fireHaptic("stone", 0.9);
    },
    [markUser, spawnTumbleDebris, fireHaptic],
  );

  const onCycle = useCallback(
    (id: number) => {
      markUser();
      engineRef.current?.cycleMaterial(id);
      fireHaptic("droplet", 0.6);
    },
    [markUser, fireHaptic],
  );

  const onLayerMute = useCallback(
    (id: number) => {
      markUser();
      engineRef.current?.toggleLayerMute(id);
    },
    [markUser],
  );

  const onToggleMaster = useCallback(() => {
    markUser();
    engineRef.current?.setMasterMuted(!(engineRef.current?.muted ?? false));
  }, [markUser]);

  const onClear = useCallback(() => {
    markUser();
    lastOnsetAtRef.current = 0;
    engineRef.current?.clear();
  }, [markUser]);

  const setStoneRef = (id: number) => (el: HTMLDivElement | null) => {
    if (el) {
      stoneRefs.current.set(id, el);
      if (!stoneAnimated.current.has(id)) {
        stoneAnimated.current.add(id);
        if (!reducedMotionRef.current) {
          el.animate(
            [
              { transform: "translateY(-34px)", opacity: 0 },
              { transform: "translateY(0)", opacity: 1 },
            ],
            { duration: 440, easing: "cubic-bezier(.2,.85,.25,1)" },
          );
        }
      }
    } else {
      stoneRefs.current.delete(id);
      stoneAnimated.current.delete(id);
    }
  };

  const setPebbleRef = (p: Pebble) => (el: HTMLDivElement | null) => {
    if (!el || pebbleAnimated.current.has(p.id)) return;
    pebbleAnimated.current.add(p.id);
    if (reducedMotionRef.current) {
      el.style.opacity = "0.5";
      el.animate([{ opacity: 0.5 }, { opacity: 0 }], {
        duration: 600,
        fill: "forwards",
      });
      return;
    }
    const frames: Keyframe[] =
      p.kind === "fall"
        ? [
            { transform: "translateY(0) rotate(0deg)", opacity: 0.9 },
            {
              transform: `translateY(130px) rotate(${p.rot}deg)`,
              opacity: 0,
            },
          ]
        : [
            { transform: "translateY(-48px) scale(0.55)", opacity: 0 },
            { transform: "translateY(0) scale(1)", opacity: 0.95, offset: 0.5 },
            { transform: "translateY(3px) scale(1)", opacity: 0 },
          ];
    el.animate(frames, {
      duration: p.kind === "fall" ? 760 : 660,
      easing: "cubic-bezier(.3,.7,.3,1)",
      fill: "forwards",
    });
  };

  const primaryBtn =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary";
  const secondaryBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40";
  const label =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0b0c0f] text-foreground">
      {/* ── the dark field (no pointer play — the room is the instrument) ── */}
      <div className="absolute inset-0 select-none" />

      {/* falling pebbles (transient, one per strike) */}
      <div className="pointer-events-none absolute left-1/2 top-[40%] z-10">
        {pebbles.map((p) => (
          <div
            key={p.id}
            ref={setPebbleRef(p)}
            style={{
              position: "absolute",
              left: `${p.x}px`,
              top: 0,
              width: `${p.size}px`,
              height: `${p.size * 0.8}px`,
              background: p.color,
              borderRadius: "48% 48% 44% 44% / 60% 60% 40% 40%",
              boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.35)",
            }}
          />
        ))}
      </div>

      {/* the cairn — one settled stone per laid layer, newest on top */}
      <div className="pointer-events-none absolute bottom-[30%] left-1/2 z-10 flex -translate-x-1/2 flex-col-reverse items-center gap-[6px]">
        {started && layers.length === 0 && (
          <span className="mb-2 max-w-xs text-center text-sm text-muted-foreground">
            {ghostOn ? "" : "clap, snap or tap into the room to drop a stone"}
          </span>
        )}
        {layers.map((l, i) => {
          const m = MATERIALS[l.material];
          const w = 40 + Math.min(l.eventCount, 6) * 4;
          return (
            <div
              key={l.id}
              ref={setStoneRef(l.id)}
              title={`layer ${i + 1} · ${m.label}`}
              style={{
                width: `${w}px`,
                height: `${w * 0.62}px`,
                background: m.color,
                opacity: l.muted ? 0.28 : 0.95,
                borderRadius: "46% 46% 42% 42% / 62% 62% 40% 40%",
                boxShadow:
                  "inset 0 -3px 6px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5)",
              }}
            />
          );
        })}
      </div>

      {/* back link + design notes */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* ── pre-begin hero (never a blank screen) ── */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="mb-2 flex flex-col-reverse items-center gap-[6px] opacity-90">
            {(["stone", "wood", "ceramic"] as MaterialId[]).map((mid, i) => (
              <div
                key={mid}
                style={{
                  width: `${52 - i * 6}px`,
                  height: `${(52 - i * 6) * 0.62}px`,
                  background: MATERIALS[mid].color,
                  borderRadius: "46% 46% 42% 42% / 62% 62% 40% 40%",
                  boxShadow:
                    "inset 0 -3px 6px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5)",
                }}
              />
            ))}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Room Cairn
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            The room plays the cairn. Clap, snap, tap the desk or click your
            tongue — the microphone hears each transient and drops a stone. Its
            brightness picks the material; its force sets the weight. Fall silent
            and your figure loops. Best played with your eyes closed.
          </p>
          <button onClick={() => void onBegin()} className={primaryBtn}>
            Begin — let the room in
          </button>
          <p className="max-w-md text-sm text-muted-foreground">
            You&rsquo;ll be asked for microphone access. Prefer not to? Just
            listen — a ghost performer builds and un-builds a cairn on its own.
          </p>
        </div>
      )}

      {/* ── running HUD (title + status) ── */}
      {started && (
        <div className="pointer-events-none absolute left-4 top-14 z-20 max-w-xs space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Room Cairn
          </h1>
          <p className={label}>
            {listening ? "listening" : "silent"} · {layers.length}/5 stones
          </p>
          {lastHeard && (
            <p className="text-sm text-muted-foreground">
              heard: <span className="text-foreground">{lastHeard}</span>
            </p>
          )}
          {pendingCount > 0 && (
            <p className="text-sm text-primary">
              figure: {pendingCount} hit{pendingCount === 1 ? "" : "s"} —{" "}
              {autoLay ? "pause to loop it" : "Lay it to loop"}
            </p>
          )}
          {ghostOn && (
            <p className="text-sm text-muted-foreground">
              ghost performer playing — make a sound to take over
            </p>
          )}
          {audioError && (
            <p className="text-sm text-destructive">{audioError}</p>
          )}
          {micError && <p className="text-sm text-destructive">{micError}</p>}
        </div>
      )}

      {/* ── control surface ── */}
      {started && (
        <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-4">
          <div className="w-full max-w-lg space-y-3 rounded-lg border border-border bg-background/70 p-3 backdrop-blur-md">
            {/* input meter + sensitivity */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={label}>room input</span>
                <span className={label}>sensitivity</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-accent">
                  <div
                    ref={meterRef}
                    className="h-full origin-left bg-primary"
                    style={{ transform: "scaleX(0)" }}
                  />
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={2.2}
                  step={0.1}
                  value={sensitivity}
                  onChange={(e) => onSensitivity(Number(e.target.value))}
                  className="w-32 accent-primary"
                  aria-label="microphone sensitivity"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                bright → droplet · mid → ceramic / wood · dark thud → stone
              </p>
            </div>

            {/* primary actions */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={onLay}
                disabled={pendingCount === 0}
                className={primaryBtn}
              >
                Lay layer
              </button>
              {pendingCount > 0 && (
                <button onClick={onDiscard} className={secondaryBtn}>
                  Discard
                </button>
              )}
              <button
                onClick={() => setAutoLay((v) => !v)}
                className={secondaryBtn}
                aria-pressed={autoLay}
              >
                Auto-lay: {autoLay ? "on" : "off"}
              </button>
              <button
                onClick={onToggleMaster}
                className={secondaryBtn}
                aria-pressed={muted}
              >
                {muted ? "Unmute" : "Mute all"}
              </button>
              <button
                onClick={onClear}
                disabled={layers.length === 0 && pendingCount === 0}
                className={secondaryBtn}
              >
                Clear
              </button>
            </div>

            {/* laid layers (editable memory) */}
            {layers.length > 0 && (
              <div className="space-y-1.5">
                <span className={label}>the cairn · knock a stone off</span>
                <ul className="space-y-1.5">
                  {layers.map((l, i) => {
                    const m = MATERIALS[l.material];
                    return (
                      <li
                        key={l.id}
                        className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1"
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{ background: m.color }}
                        />
                        <span className="w-24 shrink-0 text-sm text-foreground">
                          {i + 1}. {m.label}
                        </span>
                        <button
                          onClick={() => onCycle(l.id)}
                          className="min-h-[44px] rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="Change this stone's material (transforms on the next pass)"
                        >
                          material
                        </button>
                        <button
                          onClick={() => onLayerMute(l.id)}
                          className="min-h-[44px] rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {l.muted ? "unmute" : "mute"}
                        </button>
                        <button
                          onClick={() => onKnock(l.id, l.material)}
                          className="ml-auto min-h-[44px] rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="Knock this stone off — the loop loses this layer"
                        >
                          knock off ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── design notes overlay ── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Room Cairn — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                What if the <em>room</em> played the instrument? This is cycle 2
                of Impact Cairn. The un-build grammar is unchanged — but there is
                no pointer, no tap on glass. The visitor performs with their body
                and the room&rsquo;s acoustics.
              </p>
              <p>
                The microphone feeds an <code>AnalyserNode</code>; every frame we
                measure <strong>spectral flux</strong> — the sum of positive
                bin-to-bin increases in magnitude — and fire a strike when it
                spikes above an adaptive threshold (running mean + margin·std),
                gated by a ~100 ms refractory period so one clap is one strike.
                The onset frame&rsquo;s <strong>spectral centroid</strong>{" "}
                (brightness) chooses the material: a bright snap or tongue-click →
                droplet, mid → ceramic / wood, a dark desk-thud → stone. Peak
                amplitude sets velocity.
              </p>
              <p>
                Every sound is a <em>collision</em>, not a note. No scale, no
                tuning: each strike is a broadband transient driving a small bank
                of decaying <em>inharmonic</em> resonant modes (modal synthesis),
                with ±4% per-hit jitter so no pitch ever forms. The synth is
                identical to cycle 1.
              </p>
              <p>
                The cairn is <strong>editable memory</strong>. Play a burst of
                sounds, then fall silent — the figure auto-lays into a looping
                layer (or press Lay). Layers loop at slightly independent rates
                and <em>phase</em> against each other (Steve Reich,{" "}
                <em>Clapping Music</em>). Knock a stone off and the loop audibly
                loses it (with a tumble); change a laid stone&rsquo;s material;
                mute; clear. Un-making is a first-class gesture.
              </p>
              <p>
                A <code>navigator.vibrate</code> pulse, scaled by velocity and
                material, fires on every strike where supported. With no mic (or
                permission denied) a deterministic seeded ghost performer builds
                and un-builds the cairn forever off the audio clock, so the piece
                demos itself headless; a real onset takes over instantly and it
                re-arms after ~15 s of silence.
              </p>
              <p>
                References: J. P. Bello et al., &ldquo;A Tutorial on Onset
                Detection in Music Signals,&rdquo; IEEE TSALP, 2005 (spectral
                flux) · Steve Reich, <em>Clapping Music</em> (phasing) · Pauline
                Oliveros, <em>Deep Listening</em> (eyes-closed listening). Cycle 2
                of <code>1990-impact-cairn</code>.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className={`mt-5 ${secondaryBtn}`}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
