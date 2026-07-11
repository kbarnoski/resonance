"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeAudioEngine, type AudioEngine, DRUM_COLORS } from "./audio";
import { makeRenderer, type GLRenderer, type Sprite } from "./gl";

// ── Minimal typed view of the haptics API (playEffect typings vary) ──────────
type DualRumble = {
  duration: number;
  strongMagnitude: number;
  weakMagnitude: number;
  startDelay?: number;
};
type HapticActuator = {
  playEffect?: (type: string, params: DualRumble) => Promise<unknown>;
  reset?: () => Promise<unknown>;
};
type GamepadWithHaptics = Gamepad & {
  vibrationActuator?: HapticActuator;
};

const STAR_COUNT = 700;
const AUTO_DEMO_IDLE_MS = 600; // start auto-demo almost immediately on mount

type Phase = "idle" | "playing";

export default function KidsRumbleBand() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [noWebGL, setNoWebGL] = useState(false);
  const [padConnected, setPadConnected] = useState(false);
  const [hapticsOk, setHapticsOk] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Stable refs
  const phaseRef = useRef<Phase>("idle");
  const rafRef = useRef(0);
  const audioRef = useRef<AudioEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rendererRef = useRef<GLRenderer | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const startTimeRef = useRef(0);
  const lastBeatRef = useRef(-1);
  const lastInteractRef = useRef(0);

  // star field (clip-space)
  const starsRef = useRef<
    { x: number; y: number; phase: number; hue: number; sz: number }[]
  >([]);

  // live ripples from drum hits
  const ripplesRef = useRef<
    { x: number; y: number; t: number; r: number; g: number; b: number }[]
  >([]);

  // creature state (smoothed), clip-space targets
  const melRef = useRef({ x: -0.45, y: 0, mag: 0, sel: 0.5 });
  const harRef = useRef({ x: 0.45, y: 0, mag: 0, sel: 0.5 });

  // touch fallback stick state — null when not dragging
  const touchMelRef = useRef<{ x: number; y: number } | null>(null);
  const touchHarRef = useRef<{ x: number; y: number } | null>(null);

  // previous gamepad button states for edge-detect
  const prevButtonsRef = useRef<boolean[]>([]);

  const markInteract = useCallback(() => {
    lastInteractRef.current = performance.now();
  }, []);

  // ── Haptic pulse helper ──
  const pulse = useCallback(
    (strong: number, weak: number, duration: number) => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p) continue;
        const act = (p as GamepadWithHaptics).vibrationActuator;
        if (act && typeof act.playEffect === "function") {
          act
            .playEffect("dual-rumble", {
              duration,
              strongMagnitude: strong,
              weakMagnitude: weak,
            })
            .catch(() => {});
        }
      }
    },
    [],
  );

  // ── Drum hit (shared by gamepad + touch buttons) ──
  const fireDrum = useCallback(
    (pad: number, sx: number, sy: number) => {
      const eng = audioRef.current;
      if (!eng) return;
      const col = eng.hitDrum(pad);
      ripplesRef.current.push({ x: sx, y: sy, t: 0, ...col });
      if (ripplesRef.current.length > 40) ripplesRef.current.shift();
      // extra rumble bump on each drum
      pulse(0.55, 0.35, 130);
      markInteract();
    },
    [pulse, markInteract],
  );

  // ── Poll gamepad each frame ──
  const pollGamepad = useCallback(() => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let active: GamepadWithHaptics | null = null;
    for (const p of pads) {
      if (p) {
        active = p as GamepadWithHaptics;
        break;
      }
    }
    if (!active) return false;

    // sticks: axes[0],[1] = left, axes[2],[3] = right
    const ax = active.axes;
    const dz = 0.12;
    const lx = Math.abs(ax[0] ?? 0) > dz ? (ax[0] ?? 0) : 0;
    const ly = Math.abs(ax[1] ?? 0) > dz ? (ax[1] ?? 0) : 0;
    const rx = Math.abs(ax[2] ?? 0) > dz ? (ax[2] ?? 0) : 0;
    const ry = Math.abs(ax[3] ?? 0) > dz ? (ax[3] ?? 0) : 0;

    const lmag = Math.min(1, Math.hypot(lx, ly));
    const rmag = Math.min(1, Math.hypot(rx, ry));
    if (lmag > dz || rmag > dz) markInteract();

    // map stick to note selection: combine angle+height into 0..1
    const lsel = (lx * 0.5 + 0.5) * 0.6 + (-ly * 0.5 + 0.5) * 0.4;
    const rsel = (rx * 0.5 + 0.5) * 0.6 + (-ry * 0.5 + 0.5) * 0.4;
    audioRef.current?.setMelody(lmag, Math.max(0, Math.min(1, lsel)));
    audioRef.current?.setHarmony(rmag, Math.max(0, Math.min(1, rsel)));

    // creature target positions (left half / right half of screen)
    melRef.current.x = -0.45 + lx * 0.4;
    melRef.current.y = -ly * 0.55;
    melRef.current.mag = lmag;
    harRef.current.x = 0.45 + rx * 0.4;
    harRef.current.y = -ry * 0.55;
    harRef.current.mag = rmag;

    // face buttons A B X Y → standard mapping indices 0,1,2,3
    const btns = active.buttons;
    const prev = prevButtonsRef.current;
    const drumIdx = [0, 1, 2, 3];
    for (let k = 0; k < drumIdx.length; k++) {
      const b = btns[drumIdx[k]];
      const pressed = !!b && b.pressed;
      if (pressed && !prev[drumIdx[k]]) {
        // place ripple roughly where the creatures are for variety
        const sx = (Math.random() - 0.5) * 1.4;
        const sy = (Math.random() - 0.5) * 1.2;
        fireDrum(k, sx, sy);
      }
    }
    // triggers/bumpers (4,5 bumpers; 6,7 triggers) → sparkle
    for (const ti of [4, 5, 6, 7]) {
      const b = btns[ti];
      const pressed = !!b && b.pressed;
      if (pressed && !prev[ti]) {
        audioRef.current?.sparkle();
        pulse(0.2, 0.5, 200);
        markInteract();
      }
    }
    // store button states
    const snapshot: boolean[] = [];
    for (let i = 0; i < btns.length; i++) snapshot[i] = btns[i].pressed;
    prevButtonsRef.current = snapshot;

    return true;
  }, [fireDrum, pulse, markInteract]);

  // ── Main loop ──
  const start = useCallback(async () => {
    if (phaseRef.current === "playing") return;
    phaseRef.current = "playing";
    setPhase("playing");

    // 1. AudioContext inside the gesture
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    await ctx.resume().catch(() => {});
    const engine = makeAudioEngine(ctx);
    audioRef.current = engine;
    engine.resume();

    // 2. WebGL2
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
    }) as WebGL2RenderingContext | null;
    if (gl) {
      glRef.current = gl;
      try {
        rendererRef.current = makeRenderer(gl);
      } catch {
        setNoWebGL(true);
      }
    } else {
      setNoWebGL(true);
    }

    // 3. init stars
    const stars: typeof starsRef.current = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 2.2,
        y: (Math.random() - 0.5) * 2.0,
        phase: Math.random() * Math.PI * 2,
        hue: Math.random(),
        sz: 0.006 + Math.random() * 0.02,
      });
    }
    starsRef.current = stars;

    // feature-detect haptics on whatever pad exists
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && typeof (p as GamepadWithHaptics).vibrationActuator?.playEffect === "function") {
        setHapticsOk(true);
      }
    }

    startTimeRef.current = performance.now();
    lastInteractRef.current = 0; // force auto-demo immediately

    const bps = engine.bpsBeat;

    const loop = () => {
      const now = performance.now();
      const t = (now - startTimeRef.current) / 1000;
      const w = canvas ? canvas.width : 1;
      const h = canvas ? canvas.height : 1;

      const hasPad = pollGamepad();
      if (hasPad !== padConnected) setPadConnected(hasPad);

      // touch fallback overrides
      if (touchMelRef.current) {
        const tm = touchMelRef.current;
        const mag = Math.min(1, Math.hypot(tm.x, tm.y));
        const sel = (tm.x * 0.5 + 0.5) * 0.6 + (-tm.y * 0.5 + 0.5) * 0.4;
        audioRef.current?.setMelody(mag, Math.max(0, Math.min(1, sel)));
        melRef.current.x = -0.45 + tm.x * 0.4;
        melRef.current.y = -tm.y * 0.55;
        melRef.current.mag = mag;
        markInteract();
      }
      if (touchHarRef.current) {
        const th = touchHarRef.current;
        const mag = Math.min(1, Math.hypot(th.x, th.y));
        const sel = (th.x * 0.5 + 0.5) * 0.6 + (-th.y * 0.5 + 0.5) * 0.4;
        audioRef.current?.setHarmony(mag, Math.max(0, Math.min(1, sel)));
        harRef.current.x = 0.45 + th.x * 0.4;
        harRef.current.y = -th.y * 0.55;
        harRef.current.mag = mag;
        markInteract();
      }

      const idle = now - lastInteractRef.current > AUTO_DEMO_IDLE_MS;

      // ── Auto-demo: hands-free Lissajous + occasional drums ──
      if (idle && !hasPad) {
        const lm = 0.5 + 0.4 * Math.sin(t * 0.7);
        const lsel = 0.5 + 0.45 * Math.sin(t * 0.53);
        const hm = 0.45 + 0.4 * Math.sin(t * 0.9 + 1.3);
        const hsel = 0.5 + 0.45 * Math.sin(t * 0.61 + 2.0);
        audioRef.current?.setMelody(lm, lsel);
        audioRef.current?.setHarmony(hm, hsel);
        melRef.current.x = -0.45 + 0.35 * Math.sin(t * 0.7);
        melRef.current.y = 0.45 * Math.sin(t * 1.1);
        melRef.current.mag = lm;
        harRef.current.x = 0.45 + 0.35 * Math.cos(t * 0.9);
        harRef.current.y = 0.45 * Math.sin(t * 0.8 + 1.0);
        harRef.current.mag = hm;
      } else if (idle && hasPad) {
        // pad present but resting: gentle sustain over drone
        audioRef.current?.setMelody(0.12, 0.5 + 0.2 * Math.sin(t * 0.5));
        audioRef.current?.setHarmony(0.1, 0.5 + 0.2 * Math.cos(t * 0.4));
      }

      // ── Beat tracking (felt pulse) ──
      const beatPos = t * bps; // beats elapsed
      const beatIndex = Math.floor(beatPos);
      const beatFrac = beatPos - beatIndex;
      // a soft envelope: spike at the start of each beat, decays
      const beatEnv = Math.exp(-beatFrac * 6.0);

      if (beatIndex !== lastBeatRef.current) {
        lastBeatRef.current = beatIndex;
        // felt pulse: gentle on every beat, accent every 4th
        const accent = beatIndex % 4 === 0;
        pulse(accent ? 0.45 : 0.22, accent ? 0.25 : 0.14, accent ? 150 : 90);
        // auto-demo drum on the downbeat occasionally
        if (idle && !hasPad && beatIndex % 2 === 0) {
          const pad = (beatIndex / 2) % 4;
          fireDrum(pad, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5));
          // un-mark interact so auto-demo keeps running
          lastInteractRef.current = 0;
        }
      }
      if (idle) lastInteractRef.current = 0; // keep demo alive while idle

      // ── Build sprites ──
      const renderer = rendererRef.current;
      if (renderer) {
        const sprites: Sprite[] = [];
        // stars breathing with the beat
        const stars2 = starsRef.current;
        for (let i = 0; i < stars2.length; i++) {
          const s = stars2[i];
          const tw = 0.5 + 0.5 * Math.sin(t * 1.5 + s.phase);
          const b = 0.18 + 0.32 * tw + beatEnv * 0.35;
          // warm-cool hue per star
          const r = 0.4 + 0.5 * s.hue;
          const g = 0.3 + 0.3 * (1 - s.hue);
          const bl = 0.6 + 0.3 * (1 - s.hue);
          sprites.push({
            x: s.x,
            y: s.y,
            size: s.sz * (1 + beatEnv * 0.5),
            r,
            g,
            b: bl,
            alpha: b * 0.5,
          });
        }

        // creatures
        const mel = melRef.current;
        const har = harRef.current;
        const melGlow = 0.5 + mel.mag * 0.9 + beatEnv * 0.3;
        // warm melody creature (orange/amber)
        for (let k = 0; k < 5; k++) {
          const rr = 0.05 + k * 0.04;
          sprites.push({
            x: mel.x + Math.sin(t * 1.3 + k) * 0.02,
            y: mel.y + Math.cos(t * 1.1 + k) * 0.02,
            size: 0.06 + rr + mel.mag * 0.05,
            r: 1.0,
            g: 0.55 + 0.2 * Math.sin(t + k),
            b: 0.25,
            alpha: melGlow * (0.35 - k * 0.05),
          });
        }
        const harGlow = 0.5 + har.mag * 0.9 + beatEnv * 0.3;
        // cool harmony creature (cyan/violet)
        for (let k = 0; k < 5; k++) {
          const rr = 0.05 + k * 0.04;
          sprites.push({
            x: har.x + Math.sin(t * 1.5 + k) * 0.02,
            y: har.y + Math.cos(t * 1.3 + k) * 0.02,
            size: 0.06 + rr + har.mag * 0.05,
            r: 0.4,
            g: 0.7 + 0.2 * Math.sin(t + k),
            b: 1.0,
            alpha: harGlow * (0.35 - k * 0.05),
          });
        }

        // ripples
        const rip = ripplesRef.current;
        for (let i = rip.length - 1; i >= 0; i--) {
          const rp = rip[i];
          rp.t += 0.016;
          if (rp.t > 1.1) {
            rip.splice(i, 1);
            continue;
          }
          const radius = rp.t * 0.5;
          const fade = 1 - rp.t / 1.1;
          const ringCount = 14;
          for (let a = 0; a < ringCount; a++) {
            const ang = (a / ringCount) * Math.PI * 2;
            sprites.push({
              x: rp.x + Math.cos(ang) * radius,
              y: rp.y + Math.sin(ang) * radius,
              size: 0.03 + 0.02 * fade,
              r: rp.r,
              g: rp.g,
              b: rp.b,
              alpha: fade * 0.6,
            });
          }
        }

        renderer.draw(sprites, beatEnv, t, w, h);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [pollGamepad, fireDrum, pulse, markInteract, padConnected]);

  // ── Resize canvas to device pixels ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [phase]);

  // ── gamepadconnected listener ──
  useEffect(() => {
    const onConnect = () => {
      setPadConnected(true);
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (p && typeof (p as GamepadWithHaptics).vibrationActuator?.playEffect === "function") {
          setHapticsOk(true);
        }
      }
    };
    const onDisconnect = () => setPadConnected(false);
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    return () => {
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  // ── Teardown ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const p of pads) {
          const act = p && (p as GamepadWithHaptics).vibrationActuator;
          if (act && typeof act.reset === "function") act.reset().catch(() => {});
        }
      } catch {
        // ignore
      }
      rendererRef.current?.dispose();
      rendererRef.current = null;
      glRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      const c = ctxRef.current;
      if (c && c.state !== "closed") c.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  // ── Touch virtual stick drag handlers ──
  const makeStickHandlers = (side: "mel" | "har") => {
    const target = side === "mel" ? touchMelRef : touchHarRef;
    const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let nx = (e.clientX - cx) / (rect.width / 2);
      let ny = (e.clientY - cy) / (rect.height / 2);
      const m = Math.hypot(nx, ny);
      if (m > 1) {
        nx /= m;
        ny /= m;
      }
      target.current = { x: nx, y: ny };
      audioRef.current?.resume();
    };
    const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      onMove(e);
    };
    const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      target.current = null;
    };
    return { onPointerDown: onDown, onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (target.current) onMove(e);
    }, onPointerUp: onUp, onPointerCancel: onUp };
  };

  const melStick = makeStickHandlers("mel");
  const harStick = makeStickHandlers("har");

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black text-foreground select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Title + notes link */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
        <div>
          <h1 className="font-serif text-2xl text-foreground drop-shadow">
            Feel the Beat
          </h1>
          <p className="mt-1 max-w-md text-base text-muted-foreground">
            Push the sticks to sing. Mash the buttons to drum. The controller
            buzzes with the beat.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="pointer-events-auto rounded-full border border-border bg-black/40 px-3 py-2 text-base text-muted-foreground backdrop-blur hover:text-foreground"
        >
          notes
        </button>
      </div>

      {/* WebGL failure notice */}
      {noWebGL && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-lg bg-black/70 px-4 py-2 text-base text-violet-300">
          WebGL2 unavailable — visuals are off, but the music keeps playing.
        </div>
      )}

      {/* Start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-6xl" aria-hidden>
              🎮✨
            </div>
            <p className="mt-4 max-w-sm px-6 text-base text-muted-foreground">
              Play music with a game controller you already hold. Or just tap
              the buttons below — it works either way.
            </p>
          </div>
          <button
            type="button"
            onClick={start}
            className="rounded-full bg-gradient-to-r from-violet-400 to-violet-400 px-10 py-5 text-2xl font-semibold text-black shadow-lg"
            style={{ minHeight: 72, minWidth: 200 }}
          >
            ▶ Start
          </button>
        </div>
      )}

      {/* Play controls (visible while playing) */}
      {phase === "playing" && (
        <>
          {/* Controller / haptics hint */}
          <div className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 text-center">
            {!padConnected && (
              <p className="text-base text-muted-foreground">
                Connect a game controller, or play with the buttons below.
              </p>
            )}
            {padConnected && (
              <p className="text-base text-muted-foreground">
                Controller connected{" "}
                {hapticsOk ? "· rumble on 🤚" : "· (no rumble on this pad)"}
              </p>
            )}
          </div>

          {/* Bottom control row: stick - drums - stick */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex items-end justify-between gap-3 p-4 pb-16">
            {/* Left virtual stick (melody) */}
            <div
              {...melStick}
              className="flex h-32 w-32 shrink-0 touch-none items-center justify-center rounded-full border-2 border-violet-300/40 bg-violet-400/10 backdrop-blur"
              style={{ minHeight: 96, minWidth: 96 }}
              aria-label="Melody stick"
            >
              <div className="h-12 w-12 rounded-full bg-violet-300/70" />
            </div>

            {/* Drum buttons A B X Y */}
            <div className="grid grid-cols-2 gap-3">
              {DRUM_COLORS.map((c, i) => {
                const bg = `rgb(${Math.round(c.r * 255)}, ${Math.round(
                  c.g * 255,
                )}, ${Math.round(c.b * 255)})`;
                const label = ["A", "B", "X", "Y"][i];
                return (
                  <button
                    key={label}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      audioRef.current?.resume();
                      fireDrum(
                        i,
                        (Math.random() - 0.5) * 1.2,
                        (Math.random() - 0.5) * 0.6,
                      );
                    }}
                    className="flex items-center justify-center rounded-2xl text-2xl font-bold text-black/70 shadow-lg active:scale-95"
                    style={{
                      backgroundColor: bg,
                      width: 76,
                      height: 76,
                      touchAction: "none",
                    }}
                    aria-label={`Drum ${label}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Right virtual stick (harmony) */}
            <div
              {...harStick}
              className="flex h-32 w-32 shrink-0 touch-none items-center justify-center rounded-full border-2 border-violet-300/40 bg-violet-400/10 backdrop-blur"
              style={{ minHeight: 96, minWidth: 96 }}
              aria-label="Harmony stick"
            >
              <div className="h-12 w-12 rounded-full bg-violet-300/70" />
            </div>
          </div>
        </>
      )}

      {/* Notes panel */}
      {showNotes && (
        <div className="absolute right-4 top-16 z-40 max-w-sm rounded-xl border border-border bg-black/85 p-4 text-base text-muted-foreground backdrop-blur">
          <p className="mb-2 text-foreground">Feel the Beat</p>
          <p className="mb-2">
            A 4-year-old conducts two glowing creature-voices with the two
            thumbsticks, mashes the face buttons to drum, and the controller{" "}
            <span className="text-foreground">rumbles on the beat</span> so they
            feel the music in their hands.
          </p>
          <Link
            href="/dream/856-kids-rumble-band/README.md"
            className="text-violet-300 underline"
          >
            Read the design notes →
          </Link>
        </div>
      )}
    </main>
  );
}
