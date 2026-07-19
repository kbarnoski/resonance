"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CairnEngine, type LayerInfo } from "./audio";
import { MATERIALS, ORDER, type MaterialId } from "./materials";
import { mulberry32 } from "./rng";

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

export default function ImpactCairnPage() {
  const engineRef = useRef<CairnEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new CairnEngine();

  const [started, setStarted] = useState(false);
  const [selMat, setSelMat] = useState<MaterialId>("ceramic");
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ghostOn, setGhostOn] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [pebbles, setPebbles] = useState<Pebble[]>([]);

  const startedRef = useRef(false);
  const selMatRef = useRef<MaterialId>("ceramic");
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
  const ghostRef = useRef<GhostState>({
    active: false,
    start: 0,
    idx: 0,
    cycle: 0,
    steps: [],
  });

  useEffect(() => {
    selMatRef.current = selMat;
  }, [selMat]);

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
      el.animate(
        [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }],
        { duration: 280, easing: "ease-out" },
      );
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

  // ── the core impact gesture (shared by user taps and the ghost) ────────────
  const handleTap = useCallback(
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

  // ── deterministic ghost-drummer program (self-demo) ────────────────────────
  const makeGhostSteps = useCallback(
    (rng: () => number): GhostStep[] => {
      const engine = engineRef.current;
      if (!engine) return [];
      const pick = () => ORDER[Math.floor(rng() * ORDER.length)];
      const vel = () => 0.5 + rng() * 0.4;
      const m1 = pick();
      const m2 = pick();
      const m3 = pick();
      const tap = (m: MaterialId) => handleTap(m, vel(), false);
      const knockOldest = () => {
        const ls = engine.getLayers();
        if (!ls.length) return;
        const mat = ls[0].material;
        engine.deleteLayer(ls[0].id);
        spawnTumbleDebris(MATERIALS[mat].color);
      };
      return [
        { at: 0.0, run: () => tap(m1) },
        { at: 0.42, run: () => tap(m1) },
        { at: 0.8, run: () => tap(m1) },
        { at: 1.2, run: () => tap(m1) },
        { at: 1.55, run: () => void engine.lay() }, // LAY — first looping layer
        { at: 2.35, run: () => tap(m2) },
        { at: 2.7, run: () => tap(m2) },
        { at: 3.15, run: () => tap(m2) },
        { at: 3.45, run: () => void engine.lay() }, // second layer → PHASING begins
        { at: 5.2, run: () => tap(m3) },
        { at: 5.75, run: () => tap(m3) },
        { at: 6.05, run: () => void engine.lay() }, // third layer
        { at: 11.0, run: knockOldest }, // KNOCK A STONE OFF — un-making is audible
        {
          at: 13.8,
          run: () => {
            const ls = engine.getLayers();
            if (ls[0]) engine.cycleMaterial(ls[0].id); // CHANGE a laid stone's material
          },
        },
        { at: 16.8, run: knockOldest },
        { at: 18.2, run: () => tap(m1) },
        { at: 18.6, run: () => tap(m1) },
        { at: 18.9, run: () => void engine.lay() },
        { at: 24.0, run: () => {} }, // let the last figure breathe, then loop
      ];
    },
    [handleTap, spawnTumbleDebris],
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
          const rng = mulberry32((0x51fe1990 ^ (g.cycle * 2654435761)) >>> 0);
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

  // ── boot audio inside a user gesture ───────────────────────────────────────
  const onBegin = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const ok = await engine.begin();
    if (!ok) {
      setAudioError(
        "Audio is blocked in this browser — the cairn is silent, but the visuals still play.",
      );
    }
    startedRef.current = true;
    lastInteractRef.current = engine.now();
    setStarted(true);
  }, []);

  // ── main loop: scheduler tick + visuals + ghost (rAF, ctx-clock timing) ─────
  useEffect(() => {
    if (!started) return;
    const engine = engineRef.current;
    if (!engine) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      engine.tick();
      const impacts = engine.drainVisual();
      for (const im of impacts) pulseStone(im.layerId);
      if (engine.version !== versionRef.current) {
        versionRef.current = engine.version;
        setLayers(engine.getLayers());
        setPendingCount(engine.pendingCount);
        setMuted(engine.muted);
      }
      runGhost(engine.now());
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, pulseStone, runGhost]);

  // ── keyboard: space = strike, 1–4 = choose material ────────────────────────
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        void engineRef.current?.resume();
        handleTap(selMatRef.current, 0.7, true);
      } else if (e.key >= "1" && e.key <= "4") {
        const idx = Number(e.key) - 1;
        if (idx < ORDER.length) setSelMat(ORDER[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, handleTap]);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // ── field pointer strike ───────────────────────────────────────────────────
  const onFieldPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!startedRef.current || e.button !== 0) return;
      void engineRef.current?.resume();
      const vel =
        e.pressure && e.pressure > 0 ? clamp01(0.2 + e.pressure * 0.95) : 0.62;
      handleTap(selMatRef.current, vel, true);
    },
    [handleTap],
  );

  // ── control handlers ───────────────────────────────────────────────────────
  const onLay = useCallback(() => {
    markUser();
    if (engineRef.current?.lay()) fireHaptic("wood", 0.5);
  }, [markUser, fireHaptic]);

  const onDiscard = useCallback(() => {
    markUser();
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
      {/* ── the dark field (tap anywhere to strike) ── */}
      <div
        onPointerDown={onFieldPointerDown}
        className="absolute inset-0 touch-none select-none"
        style={{ cursor: started ? "pointer" : "default" }}
      />

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
      <div className="pointer-events-none absolute bottom-[24%] left-1/2 z-10 flex -translate-x-1/2 flex-col-reverse items-center gap-[6px]">
        {started && layers.length === 0 && (
          <span className="mb-2 text-sm text-muted-foreground">
            {ghostOn ? "" : "tap to drop a stone · lay it to loop"}
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
          {/* a few decorative settled stones */}
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
            Impact Cairn
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            Build music by stacking timed physical impacts — then un-build it by
            knocking a stone off. No notes, no scale: every sound is a collision.
            Best played with your eyes closed.
          </p>
          <button onClick={() => void onBegin()} className={primaryBtn}>
            Begin
          </button>
          <p className="text-sm text-muted-foreground">
            Or just listen — a ghost drummer builds and un-builds a cairn on its
            own.
          </p>
        </div>
      )}

      {/* ── running HUD (title + status) ── */}
      {started && (
        <div className="pointer-events-none absolute left-4 top-14 z-20 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Impact Cairn
          </h1>
          <p className={label}>{selMat} · {layers.length}/5 stones</p>
          {pendingCount > 0 && (
            <p className="text-sm text-primary">
              figure: {pendingCount} hit{pendingCount === 1 ? "" : "s"} — Lay it
              to loop
            </p>
          )}
          {ghostOn && (
            <p className="text-sm text-muted-foreground">
              ghost drummer playing — tap to take over
            </p>
          )}
          {audioError && (
            <p className="max-w-xs text-sm text-destructive">{audioError}</p>
          )}
        </div>
      )}

      {/* ── control surface ── */}
      {started && (
        <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-16">
          <div className="w-full max-w-lg space-y-3 rounded-lg border border-border bg-background/70 p-3 backdrop-blur-md">
            {/* materials */}
            <div className="space-y-1.5">
              <span className={label}>material</span>
              <div className="flex flex-wrap gap-1.5">
                {ORDER.map((mid, i) => {
                  const active = selMat === mid;
                  return (
                    <button
                      key={mid}
                      onClick={() => {
                        markUser();
                        setSelMat(mid);
                      }}
                      className={`flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: MATERIALS[mid].color }}
                      />
                      {mid}
                      <span className="text-muted-foreground/60">{i + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* primary actions */}
            <div className="flex flex-wrap gap-1.5">
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
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Impact Cairn — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                What if you built music by stacking timed physical impacts you
                can play eyes-closed — feeling every hit in your hand — and could
                un-build it by knocking a stone off?
              </p>
              <p>
                Every sound is a <em>collision</em>, not a note. There is no
                scale and no tuning: each hit is a broadband noise transient
                driving a small bank of decaying <em>inharmonic</em> resonant
                modes (modal synthesis), with ±4% per-hit frequency jitter so no
                stable pitch ever forms. Four materials — droplet, ceramic, wood,
                stone — differ only in modal ratios, decay, and excitation
                colour. Timbre and rhythm are the whole composition.
              </p>
              <p>
                The cairn is <strong>editable memory</strong>. Tapped figures
                become looping layers (a look-ahead scheduler runs off the audio
                clock). Layers loop at slightly independent rates and{" "}
                <em>phase</em> against each other (Steve Reich). You can knock a
                stone off — the loop audibly loses that layer — change a laid
                stone&rsquo;s material (it transforms on the next pass), mute, or
                clear. Un-making is a first-class gesture.
              </p>
              <p>
                Haptics are a real second feedback channel:{" "}
                <code>navigator.vibrate</code> fires a velocity- and
                material-scaled pulse on every strike where the device supports
                it (silent no-op otherwise). Where available,{" "}
                <code>PointerEvent.pressure</code> gives real strike velocity.
              </p>
              <p>
                References: Kato &amp; Baba (Tokyo Metropolitan University),
                &ldquo;A MIDI-Controlled Water-Droplet Interface for Generating
                Droplet Impact Sounds,&rdquo; SIGGRAPH 2026 Emerging
                Technologies · Steve Reich, <em>Clapping Music</em> (phasing) ·
                Pauline Oliveros, <em>Deep Listening</em>.
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
