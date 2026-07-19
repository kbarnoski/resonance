"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { README } from "./readme-text";
import { createAudioEngine, type AudioEngine } from "./audio";
import { analyzeHarmony, TONIC_MIDI } from "./harmony";
import { createGhost } from "./ghost";

// --- Computer-keyboard layout: QWERTY home + upper row -> JI scale degrees ---
// Home row a s d f g h j k l = ascending diatonic degrees; upper row
// w e t y u o p = the in-between (chromatic) degrees. Root sits an octave
// above the drone so it is clearly audible on laptop speakers.
const KEY_BASE = TONIC_MIDI + 12;
const KEY_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
};

// Smoothed visual state we push into CSS custom properties each frame.
interface Vis {
  hue: number;
  hue2: number;
  axes: number;
  warp: number;
  scale: number;
  bloom: number;
  tension: number;
  spin: number; // accumulated degrees
  breath: number; // accumulated seconds for slow tunnel breathing
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function Page() {
  const [started, setStarted] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [midiNotice, setMidiNotice] = useState<string | null>(null);
  const [hint, setHint] = useState("idle — the ghost will begin shortly");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const ghostRef = useRef<ReturnType<typeof createGhost> | null>(null);
  const ghostActiveRef = useRef(false);
  const lastInputRef = useRef(0);
  const lastFrameRef = useRef(0);
  const reducedRef = useRef(false);
  const heldKeys = useRef<Set<string>>(new Set());
  const visRef = useRef<Vis>({
    hue: 45,
    hue2: 30,
    axes: 6,
    warp: 0,
    scale: 1,
    bloom: 0.3,
    tension: 0,
    spin: 0,
    breath: 0,
  });

  // --- Player note gates: any player action pauses the ghost. ---
  const playerNoteOn = useCallback((midi: number, vel: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    lastInputRef.current = performance.now();
    if (ghostActiveRef.current) {
      ghostRef.current?.stop((m) => eng.noteOff(m));
      ghostActiveRef.current = false;
    }
    eng.noteOn(midi, vel);
    setHint("playing");
  }, []);

  const playerNoteOff = useCallback((midi: number) => {
    engineRef.current?.noteOff(midi);
  }, []);

  // --- Begin: unlock audio (needs a user gesture). ---
  const begin = useCallback(async () => {
    if (engineRef.current) {
      await engineRef.current.resume();
      setStarted(true);
      return;
    }
    const eng = createAudioEngine();
    engineRef.current = eng;
    ghostRef.current = createGhost();
    await eng.resume();
    lastInputRef.current = performance.now() - 4000; // ghost starts ~2s in
    setStarted(true);
  }, []);

  // --- Render loop: harmony -> smoothed visuals -> CSS custom properties. ---
  useEffect(() => {
    if (!started) return;
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    lastFrameRef.current = performance.now();

    const runFrame = () => {
      const eng = engineRef.current;
      const stage = stageRef.current;
      if (!eng || !stage) {
        rafRef.current = requestAnimationFrame(runFrame);
        return;
      }
      const now = performance.now();
      let dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      if (dt > 0.1) dt = 0.1; // clamp after tab-switch
      const reduced = reducedRef.current;

      // Ghost takes over after ~6s idle so the piece never sits dead.
      const idle = now - lastInputRef.current;
      if (idle > 6000) {
        if (!ghostActiveRef.current) {
          ghostActiveRef.current = true;
          setHint("ghost player — improvising");
        }
        ghostRef.current?.advance(
          dt,
          (m, v) => eng.noteOn(m, v),
          (m) => eng.noteOff(m)
        );
      }

      // One source of truth: analyze what is actually sounding.
      const sounding = eng.sounding();
      const { tension, register, voices } = analyzeHarmony(sounding);
      let velSum = 0;
      for (const s of sounding) velSum += s.gain;
      const avgGain = voices > 0 ? velSum / voices : 0;
      const bloomTarget = Math.min(1, voices * 0.18 + avgGain * 0.5);

      const v = visRef.current;
      // Smooth everything so nothing flashes; tension eases over ~1s.
      const k = Math.min(1, dt * 3.2);
      v.tension = lerp(v.tension, tension, k);
      v.bloom = lerp(v.bloom, bloomTarget, Math.min(1, dt * 2.2));
      v.hue = lerp(v.hue, 45 + v.tension * 155, k); // gold -> teal
      v.hue2 = lerp(v.hue2, 30 + v.tension * 270, k); // amber -> magenta
      v.axes = lerp(v.axes, 6 + v.tension * 12, k); // more axes than reality
      v.warp = lerp(v.warp, v.tension * 16, k); // shear at dissonance
      v.scale = lerp(v.scale, 1 + register * 0.5, Math.min(1, dt * 1.4));

      if (!reduced) {
        // Continuous, slow motion only. Spin rate stays well under 0.15 Hz
        // (<= ~45 deg/s even at peak tension = ~0.125 Hz).
        const spinRate = 6 + v.tension * 39; // deg/s
        v.spin = (v.spin + spinRate * dt) % 360;
        v.breath += dt;
      }

      // Slow tunnel breathing via a continuous sine of accumulated time.
      const breathe = 1 + Math.sin(v.breath * 0.35) * 0.08;
      const scale = v.scale * breathe;

      const st = stage.style;
      st.setProperty("--hue", v.hue.toFixed(1));
      st.setProperty("--hue2", v.hue2.toFixed(1));
      st.setProperty("--axes", v.axes.toFixed(2));
      st.setProperty("--warp", v.warp.toFixed(2) + "deg");
      st.setProperty("--scale", scale.toFixed(3));
      st.setProperty("--bloom", v.bloom.toFixed(3));
      st.setProperty("--tension", v.tension.toFixed(3));
      st.setProperty("--spin", v.spin.toFixed(2) + "deg");

      rafRef.current = requestAnimationFrame(runFrame);
    };
    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [started]);

  // --- Web MIDI: primary instrument, with graceful absence handling. ---
  useEffect(() => {
    if (!started) return;
    const attached: MIDIInput[] = [];
    let cancelled = false;

    const onMessage = (e: MIDIMessageEvent) => {
      if (!e.data) return;
      const [status, note, vel] = e.data;
      const cmd = status & 0xf0;
      if (cmd === 0x90 && vel > 0) playerNoteOn(note, vel / 127);
      else if (cmd === 0x80 || (cmd === 0x90 && vel === 0))
        playerNoteOff(note);
    };

    if (!navigator.requestMIDIAccess) {
      setMidiNotice(
        "No Web MIDI here — play with your computer keyboard, or just watch the ghost."
      );
    } else {
      navigator
        .requestMIDIAccess()
        .then((acc) => {
          if (cancelled) return;
          let count = 0;
          acc.inputs.forEach((input) => {
            count += 1;
            input.addEventListener("midimessage", onMessage as EventListener);
            attached.push(input);
          });
          setMidiNotice(
            count === 0
              ? "MIDI ready, no device connected — use your computer keyboard."
              : null
          );
        })
        .catch(() => {
          setMidiNotice(
            "MIDI access denied — play with your computer keyboard instead."
          );
        });
    }

    return () => {
      cancelled = true;
      for (const input of attached)
        input.removeEventListener("midimessage", onMessage as EventListener);
    };
  }, [started, playerNoteOn, playerNoteOff]);

  // --- Computer-keyboard fallback (always available). ---
  useEffect(() => {
    if (!started) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const deg = KEY_MAP[key];
      if (deg === undefined) return;
      if (heldKeys.current.has(key)) return;
      heldKeys.current.add(key);
      playerNoteOn(KEY_BASE + deg, 0.72);
    };
    const onUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const deg = KEY_MAP[key];
      if (deg === undefined) return;
      heldKeys.current.delete(key);
      playerNoteOff(KEY_BASE + deg);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [started, playerNoteOn, playerNoteOff]);

  // --- Full teardown on unmount. ---
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const eng = engineRef.current;
      engineRef.current = null;
      if (eng) void eng.close();
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#05010f] text-foreground">
      <style dangerouslySetInnerHTML={{ __html: STAGE_CSS }} />

      {/* The entire artwork: pure CSS compositor, no canvas / WebGL / SVG. */}
      <div className="cv-root" aria-hidden="true">
        <div ref={stageRef} className="cv-stage">
          <div className="cv-layer cv-tunnel" />
          <div className="cv-layer cv-lattice" />
          <div className="cv-layer cv-lattice cv-mirror" />
          <div className="cv-layer cv-spiral" />
          <div className="cv-layer cv-veil" />
          <div className="cv-layer cv-core" />
        </div>
        <div className="cv-vignette" />
      </div>

      {/* Chrome overlay */}
      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between p-5 sm:p-8">
        <header className="pointer-events-auto max-w-xl">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Comma Veil
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            A DMT form-constant mandala rendered in the CSS compositor alone —
            play just-intonation harmony and the consonance you hold warps the
            impossible geometry.
          </p>
          {midiNotice && (
            <p className="mt-2 text-sm text-muted-foreground">{midiNotice}</p>
          )}
        </header>

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          ) : (
            <span className="rounded-md border border-border bg-background/50 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
              {hint}
            </span>
          )}
          {started && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              keys a s d f g h j k l · w e t y u o p — or a MIDI keyboard
            </span>
          )}
        </div>
      </div>

      {/* Read-the-design-notes affordance */}
      <button
        onClick={() => setNotesOpen(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {notesOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Comma Veil
            </h2>
            {README.split("\n\n").map((para, i) => (
              <p
                key={i}
                className="mt-3 text-sm leading-relaxed text-muted-foreground"
              >
                {para}
              </p>
            ))}
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1952-comma-veil"]} />
    </main>
  );
}

/* ------------------------------------------------------------------ *
 * The render substrate: stacked animated <div>s built ENTIRELY from
 * CSS gradients, fused with mix-blend-mode, feathered with mask-image,
 * kaleidoscope-mirrored with transforms, and driven by the custom
 * properties the render loop rewrites each frame. No canvas anywhere.
 * ------------------------------------------------------------------ */
const STAGE_CSS = `
.cv-root { position:absolute; inset:0; overflow:hidden; background:
  radial-gradient(circle at 50% 50%, #0b0326 0%, #05010f 60%, #020008 100%); }
.cv-stage {
  position:absolute; inset:0;
  --hue:45; --hue2:30; --spin:0deg; --axes:6; --warp:0deg;
  --scale:1; --bloom:0.3; --tension:0;
  -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 0%, #000 38%, transparent 82%);
  mask-image: radial-gradient(circle at 50% 50%, #000 0%, #000 38%, transparent 82%);
}
.cv-layer {
  position:absolute; inset:0; margin:auto;
  width:150vmax; height:150vmax; border-radius:50%;
  will-change: transform;
}
.cv-tunnel {
  background: repeating-radial-gradient(circle at 50% 50%,
    hsl(var(--hue) 85% 58%) 0,
    hsl(calc(var(--hue) + 20) 70% 32%) 1.4%,
    hsl(var(--hue2) 65% 22%) 2.8%,
    transparent 6.2%);
  transform: rotate(var(--spin)) scale(var(--scale));
  mix-blend-mode: screen; opacity:0.85;
  filter: saturate(calc(1 + var(--tension)));
}
.cv-lattice {
  background: repeating-conic-gradient(from var(--spin) at 50% 50%,
    hsl(var(--hue) 90% 62%) 0deg,
    hsl(var(--hue2) 82% 48%) calc(0.42 * (360deg / var(--axes))),
    transparent calc(360deg / var(--axes)));
  mix-blend-mode: screen; opacity:0.62;
  transform: skewX(var(--warp));
}
.cv-mirror {
  transform: scaleX(-1) skewX(var(--warp)) rotate(calc(var(--spin) * -0.6));
  mix-blend-mode: overlay; opacity:0.5;
}
.cv-spiral {
  background: conic-gradient(from calc(var(--spin) * -1) at 50% 50%,
    hsl(var(--hue2) 85% 55%), hsl(var(--hue) 85% 55%),
    hsl(var(--hue2) 85% 55%), hsl(var(--hue) 85% 55%),
    hsl(var(--hue2) 85% 55%));
  -webkit-mask-image: repeating-radial-gradient(circle at 50% 50%, #000 0 5%, transparent 5% 11%);
  mask-image: repeating-radial-gradient(circle at 50% 50%, #000 0 5%, transparent 5% 11%);
  mix-blend-mode: soft-light; opacity:0.75;
  transform: rotate(calc(var(--spin) * 0.7)) scale(calc(1.05 + var(--tension) * 0.3));
}
.cv-veil {
  background: repeating-conic-gradient(from calc(var(--spin) * 0.3) at 50% 50%,
    hsl(var(--hue2) 90% 60%) 0deg,
    hsl(calc(var(--hue2) + 55) 90% 55%) 7deg,
    hsl(calc(var(--hue2) - 45) 90% 55%) 14deg,
    hsl(var(--hue2) 90% 60%) 21deg);
  -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 70%);
  mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 70%);
  mix-blend-mode: overlay;
  opacity: calc(var(--tension) * 0.85);
  transform: rotate(calc(var(--spin) * -0.2));
  filter: blur(1.5px);
}
.cv-core {
  width:80vmax; height:80vmax;
  background: radial-gradient(circle at 50% 50%,
    hsl(var(--hue) 100% calc(60% + var(--bloom) * 18%)) 0%,
    hsl(var(--hue2) 90% 52%) 16%,
    transparent 54%);
  mix-blend-mode: screen;
  opacity: calc(0.32 + var(--bloom) * 0.5);
  transform: scale(calc(0.78 + var(--bloom) * 0.6));
  filter: blur(calc(5px + var(--bloom) * 16px));
}
.cv-vignette {
  position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(circle at 50% 50%, transparent 40%, #05010f 92%);
}
@media (prefers-reduced-motion: reduce) {
  .cv-core { filter: blur(10px); }
}
`;
