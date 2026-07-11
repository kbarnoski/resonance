"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { EveryNoteAudio } from "./audio";
import {
  PETALS,
  PETAL_COUNT,
  reharmonize,
  lerpHue,
  type ChordCandidate,
} from "./harmony";

// ── Visual state held in refs (no React churn in the rAF loop) ──────────────
interface PetalState {
  hit: number; // 0..1 bloom flash, decays
}

interface Bloom {
  x: number; // normalized
  y: number;
  age: number; // seconds
  hue: number;
  borrowed: boolean;
}

// A short auto-demo phrase. INCLUDES deliberately out-of-key/chromatic notes
// (C#, D#, F#, G#, A#) so a silent glance shows the chord chasing a "wrong"
// note. Index = pitch class 0..11.
const DEMO_PHRASE: { pc: number; at: number }[] = [
  { pc: 0, at: 1.0 }, // C  — home
  { pc: 4, at: 2.0 }, // E
  { pc: 6, at: 3.0 }, // F# — chromatic! harmony chases it (D7)
  { pc: 7, at: 4.0 }, // G
  { pc: 3, at: 5.2 }, // D# — chromatic mediant pull (Ebmaj7)
  { pc: 9, at: 6.4 }, // A
  { pc: 10, at: 7.6 }, // A# — borrowed bVII (Bbmaj9)
  { pc: 0, at: 8.8 }, // C  — home again
];

export default function KidsEveryNote() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<EveryNoteAudio | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);

  const petalsRef = useRef<PetalState[]>(
    Array.from({ length: PETAL_COUNT }, () => ({ hit: 0 })),
  );
  const bloomsRef = useRef<Bloom[]>([]);
  const chordRef = useRef<ChordCandidate | null>(null);
  const fieldHueRef = useRef(210); // current aurora tint, glides toward chord
  const targetHueRef = useRef(210);
  const shimmerRef = useRef(0); // 0..1 borrowed-chord shimmer boost
  const startTimeRef = useRef(0);
  const touchedRef = useRef(false); // first real touch stops the demo

  const [started, setStarted] = useState(false);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [chordName, setChordName] = useState("listening…");
  const [showNotes, setShowNotes] = useState(false);

  // Petal ring layout in normalized coords (y down). 12 petals, generous gaps.
  const petalLayout = useCallback((): { x: number; y: number; r: number }[] => {
    const out: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < PETAL_COUNT; i++) {
      const a = (i / PETAL_COUNT) * Math.PI * 2 - Math.PI / 2;
      out.push({
        x: 0.5 + Math.cos(a) * 0.36,
        y: 0.5 + Math.sin(a) * 0.36,
        r: 0.075,
      });
    }
    return out;
  }, []);

  // Core action: tap a petal → reharmonize → glide pads, bell, bloom, re-tint.
  const tapPetal = useCallback(
    (i: number, fromDemo = false) => {
      const audio = audioRef.current;
      const petal = PETALS[i];
      const result = reharmonize(petal.pc, chordRef.current);
      chordRef.current = result.chord;

      if (audio) {
        audio.glideChord(result.voiceHz, result.chord.borrowed);
        audio.bell(result.bellHz, result.role);
      }

      // visuals
      petalsRef.current[i].hit = 1;
      targetHueRef.current = result.chord.hue;
      if (result.chord.borrowed) shimmerRef.current = 1;

      const layout = petalLayout();
      bloomsRef.current.push({
        x: layout[i].x,
        y: layout[i].y,
        age: 0,
        hue: result.chord.hue,
        borrowed: result.chord.borrowed,
      });
      if (bloomsRef.current.length > 24) bloomsRef.current.shift();

      setChordName(result.chord.name + (result.chord.borrowed ? " ✦" : ""));

      if (!fromDemo) touchedRef.current = true;
    },
    [petalLayout],
  );

  // ── Canvas drawing (calm aurora/garden field) ─────────────────────────────
  const drawField = useCallback(
    (
      g: CanvasRenderingContext2D,
      w: number,
      h: number,
      elapsed: number,
      hue: number,
      shimmer: number,
      layout: { x: number; y: number; r: number }[],
    ) => {
      // dark base
      g.fillStyle = "#04060e";
      g.fillRect(0, 0, w, h);

      // drifting aurora ribbons, tinted toward the current chord hue
      g.globalCompositeOperation = "lighter";
      const bands = 5;
      for (let b = 0; b < bands; b++) {
        const ph = elapsed * 0.12 + b * 1.3;
        const yBase = h * (0.25 + 0.12 * b);
        const bandHue = (hue + b * 14) % 360;
        const grad = g.createLinearGradient(0, yBase - h * 0.2, 0, yBase + h * 0.2);
        grad.addColorStop(0, `hsla(${bandHue}, 70%, 55%, 0)`);
        grad.addColorStop(0.5, `hsla(${bandHue}, 75%, 58%, ${0.06 + 0.03 * Math.sin(ph)})`);
        grad.addColorStop(1, `hsla(${bandHue}, 70%, 55%, 0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, yBase);
        const seg = 14;
        for (let s = 0; s <= seg; s++) {
          const x = (s / seg) * w;
          const yy =
            yBase +
            Math.sin(ph + s * 0.5) * h * 0.06 +
            Math.sin(ph * 0.6 + s * 0.9) * h * 0.04;
          g.lineTo(x, yy);
        }
        g.lineTo(w, yBase + h * 0.34);
        g.lineTo(0, yBase + h * 0.34);
        g.closePath();
        g.fill();
      }

      // a soft central glow that holds the chord color
      const cx = w * 0.5;
      const cy = h * 0.5;
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.5);
      glow.addColorStop(0, `hsla(${hue}, 65%, 60%, ${0.1 + shimmer * 0.08})`);
      glow.addColorStop(1, `hsla(${hue}, 65%, 30%, 0)`);
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);

      // shimmer particles on borrowed chords
      if (shimmer > 0.01) {
        const n = Math.floor(shimmer * 28);
        for (let p = 0; p < n; p++) {
          const a = (p / n) * Math.PI * 2 + elapsed * 0.5;
          const rad = (Math.min(w, h) * 0.2) * (0.6 + 0.4 * Math.sin(elapsed * 2 + p));
          const px = cx + Math.cos(a) * rad;
          const py = cy + Math.sin(a) * rad;
          g.fillStyle = `hsla(${(hue + 40) % 360}, 90%, 75%, ${shimmer * 0.5})`;
          g.beginPath();
          g.arc(px, py, 1.6, 0, Math.PI * 2);
          g.fill();
        }
      }

      // ── petals ──
      const blooms = bloomsRef.current;
      for (let i = 0; i < layout.length; i++) {
        const px = layout[i].x * w;
        const py = layout[i].y * h;
        const r = layout[i].r * Math.min(w, h);
        const petal = PETALS[i];
        const hit = petalsRef.current[i].hit;

        // bloom ring rising from a recent tap
        for (const bl of blooms) {
          if (Math.abs(bl.x - layout[i].x) < 0.001 && Math.abs(bl.y - layout[i].y) < 0.001) {
            const rr = r + bl.age * Math.min(w, h) * 0.18;
            const al = Math.max(0, 0.5 - bl.age * 0.5);
            if (al > 0) {
              g.strokeStyle = `hsla(${bl.hue}, 85%, 70%, ${al})`;
              g.lineWidth = 3;
              g.beginPath();
              g.arc(px, py, rr, 0, Math.PI * 2);
              g.stroke();
            }
          }
        }

        // petal body
        const pr = r * (1 + hit * 0.25);
        const pg = g.createRadialGradient(
          px - pr * 0.3,
          py - pr * 0.3,
          pr * 0.1,
          px,
          py,
          pr,
        );
        pg.addColorStop(0, `hsla(${petal.hue}, 85%, ${62 + hit * 25}%, 0.95)`);
        pg.addColorStop(1, `hsla(${petal.hue}, 70%, 32%, 0.85)`);
        g.fillStyle = pg;
        g.beginPath();
        g.arc(px, py, pr, 0, Math.PI * 2);
        g.fill();

        // halo on hit
        if (hit > 0.01) {
          g.strokeStyle = `hsla(${petal.hue}, 95%, 80%, ${hit * 0.8})`;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(px, py, pr + 6 + hit * 10, 0, Math.PI * 2);
          g.stroke();
        }

        // note label
        g.globalCompositeOperation = "source-over";
        g.fillStyle = `hsla(0,0%,100%,0.92)`;
        g.font = `${Math.round(r * 0.42)}px ui-monospace, monospace`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(petal.name, px, py);
        g.globalCompositeOperation = "lighter";
      }
      g.globalCompositeOperation = "source-over";
    },
    [],
  );

  // ── Main effect: canvas setup + rAF loop + input + demo ─────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const g = canvas.getContext("2d");
    if (!g) {
      setCanvasFailed(true);
      return; // audio still runs; notice shown
    }
    ctx2dRef.current = g;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const layout = petalLayout();

    const hitPetal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      const aspect = rect.width / rect.height;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < layout.length; i++) {
        const dx = (nx - layout[i].x) * aspect;
        const dy = ny - layout[i].y;
        const d = Math.hypot(dx, dy);
        if (d < layout[i].r * 1.4 && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    const onPointerDown = (e: PointerEvent) => {
      const i = hitPetal(e.clientX, e.clientY);
      if (i >= 0) tapPetal(i);
    };
    canvas.addEventListener("pointerdown", onPointerDown);

    // keyboard fallback: 12 keys across the home row + numbers
    const KEYS = ["z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m"];
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0) tapPetal(i);
    };
    window.addEventListener("keydown", onKey);

    // ── auto-demo: scripted ghost-finger phrase, stops on first real touch ──
    const demoTimers: number[] = [];
    for (const step of DEMO_PHRASE) {
      demoTimers.push(
        window.setTimeout(() => {
          if (!touchedRef.current) tapPetal(step.pc, true);
        }, step.at * 1000),
      );
    }
    // loop the demo gently until touched
    const demoLoop = window.setInterval(() => {
      if (touchedRef.current) return;
      const base = performance.now();
      for (const step of DEMO_PHRASE) {
        demoTimers.push(
          window.setTimeout(() => {
            if (!touchedRef.current) tapPetal(step.pc, true);
          }, step.at * 1000),
        );
      }
      void base;
    }, 11000);

    // ── rAF loop ──
    let raf = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const elapsed = (now - startTimeRef.current) / 1000;

      // glide field hue toward target
      fieldHueRef.current = lerpHue(
        fieldHueRef.current,
        targetHueRef.current,
        Math.min(1, dt * 1.6),
      );
      // decay shimmer + petal hits + blooms
      shimmerRef.current *= Math.pow(0.25, dt);
      if (shimmerRef.current < 0.01) shimmerRef.current = 0;
      for (const p of petalsRef.current) {
        p.hit *= Math.pow(0.02, dt);
        if (p.hit < 0.003) p.hit = 0;
      }
      for (const bl of bloomsRef.current) bl.age += dt;
      bloomsRef.current = bloomsRef.current.filter((b) => b.age < 1.4);

      drawField(
        g,
        canvas.width,
        canvas.height,
        elapsed,
        fieldHueRef.current,
        shimmerRef.current,
        layout,
      );
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPointerDown);
      demoTimers.forEach((t) => clearTimeout(t));
      clearInterval(demoLoop);
      ctx2dRef.current = null;
    };
  }, [started, petalLayout, tapPetal, drawField]);

  // audio cleanup on unmount
  useEffect(() => {
    return () => {
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const handleStart = async () => {
    if (audioRef.current) return;
    try {
      const audio = new EveryNoteAudio();
      audioRef.current = audio;
      startTimeRef.current = performance.now();
      await audio.start();
      setStarted(true);
    } catch {
      setStarted(true); // still show the visual even if audio failed
    }
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#04060e] text-foreground px-4 py-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl sm:text-3xl font-mono font-bold mb-1 text-foreground">
          Every Note
        </h1>
        <p className="text-base text-foreground mb-2">
          Touch any colored petal — all twelve. There is no wrong note. The
          music underneath quietly changes its chord to hold whatever you
          touch, so every color blooms into something beautiful.
        </p>
        <p className="text-base text-muted-foreground mb-4">
          12 chromatic petals · the harmony chases your note · no microphone, no
          reading
        </p>

        {!started ? (
          <div className="flex flex-col items-center gap-8 mt-8">
            <div className="relative" style={{ width: 240, height: 240 }}>
              {PETALS.map((p, i) => {
                const a = (i / PETAL_COUNT) * Math.PI * 2 - Math.PI / 2;
                const cx = 120 + Math.cos(a) * 92;
                const cy = 120 + Math.sin(a) * 92;
                return (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      left: cx - 24,
                      top: cy - 24,
                      width: 48,
                      height: 48,
                      background: `radial-gradient(circle at 38% 32%, hsl(${p.hue},85%,64%), hsl(${p.hue},70%,32%))`,
                      boxShadow: `0 0 16px hsl(${p.hue},80%,55%)`,
                      opacity: 0.9,
                    }}
                  />
                );
              })}
            </div>
            <button
              onClick={handleStart}
              className="bg-violet-400/15 border border-violet-300/40 text-violet-100/95 text-xl font-semibold px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] active:scale-95 transition-transform"
            >
              Start
            </button>
            <p className="text-base text-muted-foreground text-center max-w-md">
              A calm garden of light. Tap any petal and listen for the chord
              that blooms to catch it.
            </p>
          </div>
        ) : (
          <div className="relative w-full">
            <canvas
              ref={canvasRef}
              className="w-full rounded-2xl touch-none select-none"
              style={{
                height: "66vh",
                display: "block",
                background: "#04060e",
              }}
            />
            {canvasFailed && (
              <div className="absolute inset-0 flex items-center justify-center p-6 rounded-2xl bg-[#04060e]/90">
                <p className="text-violet-300 text-base text-center max-w-sm">
                  Canvas drawing is not available on this device, so the garden
                  can&apos;t glow — but the sound still plays. Use keys Z S X D
                  C V G B H N J M to touch the twelve notes.
                </p>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-base text-muted-foreground font-mono">
                chord:{" "}
                <span className="text-foreground">{chordName}</span>
              </span>
              <span className="text-base text-muted-foreground">
                keys: Z S X D C V G B H N J M
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowNotes((s) => !s)}
          className="mt-5 text-base text-muted-foreground underline underline-offset-2 px-4 py-2.5 min-h-[44px]"
        >
          {showNotes ? "Hide design notes" : "Read the design notes"}
        </button>
        {showNotes && (
          <div className="mt-3 text-base text-muted-foreground space-y-2 leading-relaxed">
            <p>
              Most &ldquo;kids music&rdquo; toys hide every wrong note behind a
              5-note pentatonic cage. This does the opposite: it gives a
              4-year-old the <em>whole</em> 12-note chromatic palette and makes
              the harmony chase whatever they touch.
            </p>
            <p>
              Each tap is a hard constraint fed to a small reharmonizer that{" "}
              <strong>retrieves</strong> a lush palette of candidate chords
              (diatonic plus borrowed colors), <strong>edits/scores</strong>{" "}
              them by fit (chord-tone &gt; 9th/13th &gt; a penalty for harsh
              clashes), and <strong>reranks</strong> by nearest-voice
              voice-leading so the pad voices glide minimally. The winner&apos;s
              chord plays underneath, re-tinting the aurora. A &ldquo;wrong&rdquo;
              note simply becomes the color of a new chord.
            </p>
            <p className="text-muted-foreground">
              The retrieve → edit → rerank decomposition follows He, Li, Sun &amp;
              Huang, <em>A Decomposed Retrieval-Edit-Rerank Framework for Chord
              Generation</em> (arXiv:2605.07489, 2026). The lesson is pre-verbal:
              consonance is contextual — no note is wrong, the world just blooms
              a new color to hold it.
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between text-base text-muted-foreground">
          <span>For kids 4+ · zero permissions</span>
          <Link href="/dream" className="underline">
            ← dream lab
          </Link>
        </div>
      </div>
    </main>
  );
}
