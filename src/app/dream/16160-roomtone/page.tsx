"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16160-roomtone — "What if Karel's own recording became the ROOM his other
// recording is played through?"
//
// Real-time CONVOLUTION as cross-synthesis: one of his takes, trimmed, is dropped
// raw into a ConvolverNode as its impulse response — it becomes the acoustic
// space — and a second take is played through it. Tilt (or pointer-drag / an
// auto-demo) morphs the wet/dry blend between the dry voice take and the voice
// heard inside the room take. Visual is inline SVG only.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS } from "../_shared/welcomeHome";
import { createEngine, type RoomtoneEngine, type Strata } from "./engine";
import { RoomCrossSection } from "./RoomCrossSection";

type OrientCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type TiltState = "idle" | "active" | "unavailable" | "denied";

const DEFAULT_VOICE = "8dafed88-4761-4dd3-a0f4-93f310441093"; // "Welcome Home"
const DEFAULT_ROOM = "aaaa7e9a-a3ac-4cad-9390-6720555f00a7"; // "The Knife"

const EMPTY_STRATA: Strata = { voice: [], room: [], envelope: [] };

function titleFor(id: string): string {
  return REAL_TRACKS.find((t) => t.id === id)?.title ?? "—";
}

export default function RoomtonePage() {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE);
  const [roomId, setRoomId] = useState(DEFAULT_ROOM);
  const [strata, setStrata] = useState<Strata>(EMPTY_STRATA);

  const [blend, setBlend] = useState(0.5);
  const [tilt, setTilt] = useState<TiltState>("idle");
  const [autoDemo, setAutoDemo] = useState(true);

  const engineRef = useRef<RoomtoneEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const blendRef = useRef(0.5);
  const draggingRef = useRef(false);
  const lastInteractRef = useRef(0);
  const tiltActiveRef = useRef(false);
  const lastDisplayRef = useRef(0);

  // getters handed to the SVG live layer (stable identity)
  const getRms = useCallback(() => engineRef.current?.getRms() ?? 0, []);
  const getPlayhead = useCallback(
    () => engineRef.current?.getPlayheadPct() ?? 0,
    [],
  );

  const setBlendBoth = useCallback((v: number) => {
    const c = Math.min(1, Math.max(0, v));
    blendRef.current = c;
    engineRef.current?.setBlend(c);
    const now = performance.now();
    if (now - lastDisplayRef.current > 70) {
      lastDisplayRef.current = now;
      setBlend(c);
    }
  }, []);

  // ── the driving frame loop: apply blend, run the auto-demo when idle ────────
  useEffect(() => {
    if (!playing) return;
    const loop = () => {
      const now = performance.now();
      const idle =
        !draggingRef.current &&
        !tiltActiveRef.current &&
        now - lastInteractRef.current > 3800;
      if (autoDemo && idle) {
        // slow hands-free sweep so the effect is always audible
        setBlendBoth(0.5 + 0.44 * Math.sin(now * 0.00035));
      } else {
        engineRef.current?.setBlend(blendRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, autoDemo, setBlendBoth]);

  // ── device tilt: gamma → wet/dry blend; a hard forward tilt swaps the room ──
  useEffect(() => {
    if (!playing) return;
    let swapArmed = true;
    const onOrient = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma;
      const beta = e.beta;
      if (gamma == null) return;
      tiltActiveRef.current = true;
      lastInteractRef.current = performance.now();
      setTilt((s) => (s === "active" ? s : "active"));
      // −45°..+45° maps across the wet/dry crossfade
      const t = Math.max(0, Math.min(1, (gamma + 45) / 90));
      setBlendBoth(t);
      // steep forward tilt (beta) past ~55° swaps which take is the room
      if (beta != null) {
        if (beta > 55 && swapArmed) {
          swapArmed = false;
          void doSwap();
        } else if (beta < 40) {
          swapArmed = true;
        }
      }
    };
    window.addEventListener("deviceorientation", onOrient as EventListener);
    return () =>
      window.removeEventListener(
        "deviceorientation",
        onOrient as EventListener,
      );
    // doSwap is stable enough; blend setter is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, setBlendBoth]);

  // ── full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const refreshStrata = useCallback(() => {
    const s = engineRef.current?.getStrata();
    if (s) setStrata({ ...s });
  }, []);

  const requestTilt = useCallback(async () => {
    const Ctor =
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as OrientCtor | undefined)
        : undefined;
    if (!Ctor) {
      setTilt("unavailable");
      return;
    }
    if (Ctor.requestPermission) {
      try {
        const p = await Ctor.requestPermission();
        setTilt(p === "granted" ? "idle" : "denied");
      } catch {
        setTilt("denied");
      }
    } else {
      // non-iOS: events arrive without a permission gate (or not at all)
      setTilt("idle");
    }
  }, []);

  const handlePlay = useCallback(async () => {
    setError(null);
    if (playing) {
      engineRef.current?.stop();
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      if (!engineRef.current) {
        engineRef.current = createEngine({ voiceId, roomId });
      }
      await engineRef.current.start();
      refreshStrata();
      lastInteractRef.current = 0; // let auto-demo take over immediately
      setPlaying(true);
      void requestTilt();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not load Karel's takes — ${err.message}`
          : "Could not load Karel's takes.",
      );
      engineRef.current?.destroy();
      engineRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [playing, voiceId, roomId, refreshStrata, requestTilt]);

  async function doSwap() {
    const eng = engineRef.current;
    if (!eng) return;
    await eng.swapRoles();
    setVoiceId(eng.voiceId());
    setRoomId(eng.roomId());
    refreshStrata();
    lastInteractRef.current = performance.now();
  }

  const changeTake = useCallback(
    async (which: "voice" | "room", id: string) => {
      const nextVoice = which === "voice" ? id : voiceId;
      const nextRoom = which === "room" ? id : roomId;
      if (nextVoice === nextRoom) return; // need two distinct takes
      setVoiceId(nextVoice);
      setRoomId(nextRoom);
      const eng = engineRef.current;
      if (!eng) return;
      setLoading(true);
      setError(null);
      try {
        await eng.loadTakes(nextVoice, nextRoom);
        refreshStrata();
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not load that take — ${err.message}`
            : "Could not load that take.",
        );
      } finally {
        setLoading(false);
      }
    },
    [voiceId, roomId, refreshStrata],
  );

  // ── pointer-drag over the art = blend (desktop / no-permission fallback) ────
  const onPointerBlend = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const t = (e.clientX - rect.left) / rect.width;
      lastInteractRef.current = performance.now();
      setBlendBoth(t);
    },
    [setBlendBoth],
  );
  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onPointerBlend(e);
    },
    [onPointerBlend],
  );
  const endDrag = useCallback(() => {
    draggingRef.current = false;
    lastInteractRef.current = performance.now();
  }, []);

  const tiltNotice = useMemo(() => {
    switch (tilt) {
      case "active":
        return "Tilt live — lean left/right to morph the room, tilt forward to swap it.";
      case "denied":
        return "Motion access declined — drag across the section, or let the auto-demo sweep it.";
      case "unavailable":
        return "No motion sensor here — drag across the section, or let the auto-demo sweep it.";
      default:
        return "Drag across the section to blend, or tilt your phone. Auto-demo sweeps when idle.";
    }
  }, [tilt]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream · 16160 · roomtone
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            His recording becomes the room
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Two of Karel&rsquo;s piano takes. A few raw seconds of one are
            loaded straight into a convolver as its impulse response — that take
            becomes the acoustic space — and the other take is played{" "}
            <span className="text-foreground">through</span> it. Convolution is
            cross-synthesis: the room take&rsquo;s character reshapes the voice
            take. Blend from dry to fully-inside-the-room below.
          </p>
        </header>

        {/* the SVG cross-section (drag to blend) */}
        <div
          className="relative cursor-ew-resize"
          onPointerDown={startDrag}
          onPointerMove={onPointerBlend}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <RoomCrossSection
            strata={strata}
            blend={blend}
            active={playing}
            voiceTitle={titleFor(voiceId)}
            roomTitle={titleFor(roomId)}
            getRms={getRms}
            getPlayheadPct={getPlayhead}
          />
        </div>

        {/* transport + blend readout */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePlay}
            disabled={loading}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {loading
              ? "Loading his takes…"
              : playing
                ? "Stop"
                : "Play his catalog"}
          </button>
          <button
            type="button"
            onClick={() => void doSwap()}
            disabled={!playing || loading}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            Swap which take is the room
          </button>
          <button
            type="button"
            onClick={() => setAutoDemo((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Auto-demo: {autoDemo ? "on" : "off"}
          </button>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {blend < 0.02
              ? "fully dry"
              : blend > 0.98
                ? "fully in the room"
                : `${Math.round(blend * 100)}% wet`}
          </span>
        </div>

        {/* explicit accessible blend slider */}
        <div className="mt-4">
          <label
            htmlFor="blend"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
          >
            Dry voice ←→ inside the room
          </label>
          <input
            id="blend"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={blend}
            onChange={(e) => {
              lastInteractRef.current = performance.now();
              setBlendBoth(parseFloat(e.target.value));
            }}
            className="mt-2 w-full accent-primary"
          />
        </div>

        {/* take pickers */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="voice-take"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Voice take (played through)
            </label>
            <select
              id="voice-take"
              value={voiceId}
              onChange={(e) => void changeTake("voice", e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id} disabled={t.id === roomId}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="room-take"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Room take (the raw impulse response)
            </label>
            <select
              id="room-take"
              value={roomId}
              onChange={(e) => void changeTake("room", e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id} disabled={t.id === voiceId}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* status / notices */}
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {tiltNotice}
        </p>
        {error && (
          <p className="mt-2 text-sm leading-relaxed text-destructive">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The question: what if Karel&rsquo;s own recording became the{" "}
                <span className="text-foreground">room</span> his other
                recording is played through? A few raw seconds of the{" "}
                <span className="text-foreground">room take</span> are trimmed
                and handed to a <code className="font-mono text-xs">
                  ConvolverNode
                </code>{" "}
                as its impulse response. The{" "}
                <span className="text-foreground">voice take</span> is then
                played through that convolver. Convolution smears one signal by
                the other, so the room take&rsquo;s notes, resonance and decay
                literally re-shape the voice take — cross-synthesis, not a
                simulated hall.
              </p>
              <p>
                Wet path: source → convolver → wet gain. Dry path: source → dry
                gain. A tilt / drag / auto-demo crossfades between them. Both
                paths sum into the shared safe-master limiter, and the wet path
                carries a make-up attenuation, because convolving two loud
                musical takes blooms hard.
              </p>
              <p>
                The visual is inline SVG only — an architectural cross-section.
                The vault ceiling is drawn from the impulse-response decay
                envelope; the two takes are laid down as vector strata (voice
                threading through the chamber, room take as bedrock). The
                chamber stains deeper magenta the wetter the blend, and a
                sounding-line sweeps the voice-take playhead.
              </p>
              <p>
                Lineage: Nugen Audio&rsquo;s <em>Paragon</em> (2026) re-synthesises
                reverb from 3D recordings of real spaces; the classic framing
                (Sound on Sound / iZotope) is that convolution simply{" "}
                <span className="text-foreground">is</span> cross-synthesis. Here
                the &ldquo;space&rdquo; sampled is not a room but another of his
                own performances.
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

      <PrototypeNav slugs={["16160-roomtone"]} />
    </main>
  );
}
