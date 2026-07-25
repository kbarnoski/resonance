"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCrowd,
  CROWD_SIZES,
  MAX_AGENTS,
  SEED,
  type Crowd,
  type Frame,
} from "./sim";
import { createWebGL2Renderer, type Renderer } from "./gl";
import { createAudio, type AudioEngine } from "./audio";

const FALLBACK_DOTS = 132;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Scripted auto-conduct arc: lone clapper → roar → locked ovation → fade.
function autoLevel(tSec: number): number {
  const period = 26;
  const p = (tSec % period) / period; // 0..1
  if (p < 0.14) return smoothstep(0, 0.14, p) * 0.34; // one awkward clapper
  if (p < 0.4) return 0.34 + smoothstep(0.14, 0.4, p) * 0.32; // enthusiastic roar
  if (p < 0.72) return 0.66 + smoothstep(0.4, 0.72, p) * 0.32; // tip into unison
  return 0.98 * (1 - smoothstep(0.72, 1, p)); // hush back down
}

function phaseLabel(f: Frame): string {
  if (f.activeN <= 2) return "a lone, awkward clapper";
  if (f.r > 0.7) return "thunderous UNISON — locked";
  if (f.r > 0.4) return "finding the rhythm…";
  if (f.activeN > 300) return "a roaring ovation";
  return "scattered applause";
}

export default function Ovation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);

  const crowdRef = useRef<Crowd | null>(null);
  const glRef = useRef<Renderer | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const levelRef = useRef(0); // smoothed conduct level 0..1
  const targetRef = useRef(0);
  const autoRef = useRef(true);
  const autoClockRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const dotSpansRef = useRef<HTMLSpanElement[]>([]);
  const hudCountRef = useRef(0);
  const sizeIdxRef = useRef(3);

  const [started, setStarted] = useState(false);
  const [glOk, setGlOk] = useState(true);
  const [audioOk, setAudioOk] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [auto, setAuto] = useState(true);
  const [hud, setHud] = useState<Frame>({
    r: 0,
    activeN: 0,
    crowd: 400,
    baseHz: 0,
    pulse: 0,
    level: 0,
    psi: 0,
  });
  const [sizeIdx, setSizeIdx] = useState(3);

  const loop = useCallback((ts: number) => {
    const crowd = crowdRef.current;
    if (!crowd) return;
    const last = lastTsRef.current || ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    lastTsRef.current = ts;

    // Conduct level: auto-arc or held-key swell/hush.
    if (autoRef.current) {
      autoClockRef.current += dt;
      targetRef.current = autoLevel(autoClockRef.current);
    } else {
      const k = keysRef.current;
      const rate = 0.85;
      if (k.has("up") || k.has("space")) targetRef.current += rate * dt;
      if (k.has("down")) targetRef.current -= rate * dt;
      targetRef.current = Math.max(0, Math.min(1, targetRef.current));
    }
    levelRef.current += (targetRef.current - levelRef.current) * Math.min(1, dt * 6);
    const L = levelRef.current;

    const f = crowd.step(dt, L);

    // Drive audio.
    const audio = audioRef.current;
    if (audio) {
      const bed =
        smoothstep(0.03, 0.7, L) * Math.min(1, f.activeN / 250 + 0.05);
      const cheer =
        smoothstep(0.75, 1, L) * Math.min(1, f.activeN / 700);
      audio.send({ bed, pulse: f.pulse, r: f.r, cheer });
    }

    // Draw.
    const gl = glRef.current;
    if (gl) {
      gl.frame(crowd.posX, crowd.posY, crowd.flash, f.crowd, f.r);
    } else {
      const spans = dotSpansRef.current;
      const stride = Math.max(1, Math.floor(f.crowd / FALLBACK_DOTS));
      for (let d = 0; d < spans.length; d++) {
        const idx = Math.min(f.crowd - 1, d * stride);
        const fl = crowd.flash[idx];
        const s = spans[d];
        if (s) {
          s.style.opacity = String(0.12 + fl * 0.88);
          s.style.transform = `scale(${1 + fl * 1.4})`;
        }
      }
    }

    // HUD throttle.
    hudCountRef.current++;
    if (hudCountRef.current % 5 === 0) setHud(f);

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    if (started) return;
    crowdRef.current = createCrowd(SEED);
    crowdRef.current.setCrowd(CROWD_SIZES[sizeIdx]);

    // WebGL2.
    const canvas = canvasRef.current;
    if (canvas) {
      const r = createWebGL2Renderer(canvas, MAX_AGENTS);
      if (r) {
        const rect = canvas.getBoundingClientRect();
        r.resize(rect.width, rect.height, Math.min(2, window.devicePixelRatio || 1));
        glRef.current = r;
        setGlOk(true);
      } else {
        setGlOk(false);
      }
    }

    // Audio.
    try {
      const a = await createAudio(SEED);
      await a.resume();
      audioRef.current = a;
      setAudioOk(true);
    } catch {
      setAudioOk(false);
    }

    if (!glRef.current && !audioRef.current) {
      setNotice(
        "WebGL2 and Web Audio are unavailable — running the silent auto-conducted demo.",
      );
    } else if (!glRef.current) {
      setNotice("WebGL2 unavailable — showing the lightweight crowd meter.");
    } else if (!audioRef.current) {
      setNotice("Web Audio unavailable — the ovation is silent, but still conducts.");
    }

    setStarted(true);
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [started, sizeIdx, loop]);

  // Keyboard.
  useEffect(() => {
    if (!started) return;
    const setCrowdSize = (idx: number) => {
      const clamped = Math.max(0, Math.min(CROWD_SIZES.length - 1, idx));
      setSizeIdx(clamped);
      crowdRef.current?.setCrowd(CROWD_SIZES[clamped]);
    };
    const takeControl = () => {
      if (autoRef.current) {
        autoRef.current = false;
        setAuto(false);
        targetRef.current = levelRef.current;
      }
    };
    const down = (e: KeyboardEvent) => {
      const key = e.key;
      if (key === " " || key === "ArrowUp" || key === "ArrowDown") {
        e.preventDefault();
        takeControl();
        keysRef.current.add(
          key === " " ? "space" : key === "ArrowUp" ? "up" : "down",
        );
        return;
      }
      if (key === "w" || key === "W") {
        takeControl();
        keysRef.current.add("up");
        return;
      }
      if (key === "s" || key === "S") {
        takeControl();
        keysRef.current.add("down");
        return;
      }
      if (key >= "1" && key <= "6") {
        setCrowdSize(Number(key) - 1);
        return;
      }
      if (key === "+" || key === "=") {
        setCrowdSize(sizeIdxRef.current + 1);
        return;
      }
      if (key === "-" || key === "_") {
        setCrowdSize(sizeIdxRef.current - 1);
        return;
      }
      if (key === "a" || key === "A") {
        autoRef.current = !autoRef.current;
        setAuto(autoRef.current);
        if (autoRef.current) autoClockRef.current = 0;
        else targetRef.current = levelRef.current;
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = e.key;
      if (key === " ") keysRef.current.delete("space");
      if (key === "ArrowUp" || key === "w" || key === "W") keysRef.current.delete("up");
      if (key === "ArrowDown" || key === "s" || key === "S") keysRef.current.delete("down");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started]);

  // Keep a ref of sizeIdx for keyboard handler stability.
  useEffect(() => {
    sizeIdxRef.current = sizeIdx;
  }, [sizeIdx]);

  // Resize.
  useEffect(() => {
    if (!started) return;
    const onResize = () => {
      const canvas = canvasRef.current;
      const gl = glRef.current;
      if (canvas && gl) {
        const rect = canvas.getBoundingClientRect();
        gl.resize(rect.width, rect.height, Math.min(2, window.devicePixelRatio || 1));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [started]);

  // Cleanup.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      glRef.current?.dispose();
      audioRef.current?.dispose();
    };
  }, []);

  const registerDot = useCallback((el: HTMLSpanElement | null, i: number) => {
    if (el) dotSpansRef.current[i] = el;
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background text-foreground">
      {/* Art canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: started && glOk ? "block" : "none" }}
      />

      {/* DOM fallback field */}
      {started && !glOk && (
        <div
          ref={fallbackRef}
          className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-1.5 p-10"
        >
          {Array.from({ length: FALLBACK_DOTS }).map((_, i) => (
            <span
              key={i}
              ref={(el) => registerDot(el, i)}
              className="h-2 w-2 rounded-full bg-primary"
              style={{ opacity: 0.12 }}
            />
          ))}
        </div>
      )}

      {/* Intro / hero */}
      {!started && (
        <div className="relative z-10 mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-5 px-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Ovation — the sound of many hands clapping
          </h1>
          <p className="text-base text-muted-foreground">
            Conduct a crowd&apos;s applause, from one lone, awkward clapper up to
            a thundering standing ovation that spontaneously locks into rhythmic
            unison — and back down again. Thousands of coupled oscillators,
            pure noise transients, no melody.
          </p>
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start the applause
          </button>
          <p className="text-sm text-muted-foreground">
            Hold{" "}
            <kbd className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
              Space
            </kbd>{" "}
            or{" "}
            <kbd className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
              ↑ / ↓
            </kbd>{" "}
            to swell or hush · number keys{" "}
            <kbd className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
              1–6
            </kbd>{" "}
            set crowd size ·{" "}
            <kbd className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
              A
            </kbd>{" "}
            toggles auto-conduct.
          </p>
        </div>
      )}

      {/* HUD */}
      {started && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Ovation</h1>
            <p className="max-w-xs text-base text-muted-foreground">
              {phaseLabel(hud)}
            </p>
            {notice && (
              <p className="max-w-xs text-sm text-destructive">{notice}</p>
            )}
            <div className="mt-1 flex flex-col gap-1.5 font-mono text-xs text-muted-foreground">
              <MeterRow label="coherence r" value={hud.r} />
              <MeterRow label="intensity" value={hud.level} />
              <div className="flex gap-4">
                <span>crowd {hud.crowd.toLocaleString()}</span>
                <span>clapping {hud.activeN.toLocaleString()}</span>
                <span>{hud.baseHz.toFixed(1)} Hz</span>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-16 left-4 z-10 flex flex-col gap-1 font-mono text-xs text-muted-foreground">
            <span>
              <kbd className="rounded bg-accent px-1 py-0.5">Space</kbd> /{" "}
              <kbd className="rounded bg-accent px-1 py-0.5">↑↓</kbd> swell · hush
            </span>
            <span>
              <kbd className="rounded bg-accent px-1 py-0.5">1–6</kbd> /{" "}
              <kbd className="rounded bg-accent px-1 py-0.5">± </kbd> crowd size
            </span>
            <span>
              <kbd className="rounded bg-accent px-1 py-0.5">A</kbd>{" "}
              auto-conduct {auto ? "on" : "off"}
              {!audioOk && " · muted"}
            </span>
          </div>

          <button
            onClick={() => setShowNotes((v) => !v)}
            className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-popover/80 px-4 text-sm font-medium text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
          >
            {showNotes ? "Close" : "Read the design notes"}
          </button>

          {showNotes && (
            <div className="absolute right-4 top-20 z-20 max-w-sm rounded-md border border-border bg-popover/90 p-5 text-sm leading-relaxed text-muted-foreground backdrop-blur-md">
              <p className="mb-2 text-foreground">
                A conductible Kuramoto crowd.
              </p>
              <p className="mb-2">
                Each dot is one clapper: a phase oscillator with its own natural
                rate. Mean-field coupling nudges every phase toward the crowd
                average. As you swell to a full ovation the rate spread narrows
                and coupling K climbs, so the crowd tips from an incoherent hiss
                of claps into periodic UNISON — the order parameter{" "}
                <span className="font-mono">r</span> runs 0 → 1.
              </p>
              <p className="mb-2">
                Every clap is a few-ms burst of bandpassed noise (no pitch).
                When coherence is low the burst grains smear across the frame
                (diffuse patter); when high they stack into one thunderous smack,
                and wavefronts sweep the arena.
              </p>
              <p className="text-xs">
                After Néda, Ravasz, Brechet, Vicsek &amp; Barabási,
                &ldquo;The sound of many hands clapping,&rdquo; Nature 403
                (2000), and Kuramoto&apos;s coupled-oscillator model.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MeterRow({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24">{label}</span>
      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-accent">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-9 text-right">{value.toFixed(2)}</span>
    </div>
  );
}
