"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// C-major pentatonic C3 → A4
const PENTA_HZ = [130.81, 164.81, 196.0, 220.0, 261.63, 329.63, 392.0, 440.0];

const FLOWER_COLORS = [
  "#c084fc", // 0 C3 — violet
  "#818cf8", // 1 E3 — indigo
  "#60a5fa", // 2 G3 — blue
  "#34d399", // 3 A3 — emerald
  "#a3e635", // 4 C4 — lime
  "#facc15", // 5 E4 — yellow
  "#fb923c", // 6 G4 — amber
  "#f472b6", // 7 A4 — rose
];

const SEED_DELAY = 10;    // seconds until flower seeds itself
const BLOOM_DUR = 0.65;   // seconds for bud → full bloom animation
const MAX_FLOWERS = 12;
const LONG_PRESS_MS = 480;
const HIT_R = 50;         // px — tap-to-burst hit radius
const SEED_MIN = 28;      // px — min seed distance
const SEED_MAX = 62;      // px — max seed distance

interface Sparkle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;           // 1 → 0
  color: string;
  r: number;
}

interface Flower {
  id: number;
  x: number; y: number;
  noteIdx: number;
  phase: "growing" | "bloomed" | "seeding" | "dead";
  age: number;            // seconds since created
  bloomT: number;         // 0 → 1
  seedSpawned: boolean;
  sparkles: Sparkle[];
  gainNode: GainNode | null;
}

let _gid = 0;

function makeSparkles(x: number, y: number, color: string, n: number): Sparkle[] {
  return Array.from({ length: n }, () => {
    const angle = Math.random() * Math.PI * 2;
    const spd = 30 + Math.random() * 75;
    return {
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 20,
      life: 1,
      color,
      r: 2.5 + Math.random() * 2.5,
    };
  });
}

function paintFlower(ctx: CanvasRenderingContext2D, f: Flower, now: number): void {
  if (f.phase === "dead") return;
  const { x, y, bloomT, phase, noteIdx, id } = f;
  const col = FLOWER_COLORS[noteIdx];

  // Fade out during seeding
  let alpha = 1;
  if (phase === "seeding") {
    const sa = f.age - SEED_DELAY;
    alpha = Math.max(0, 1 - sa / 1.6);
  }

  // Gentle pulse when fully open
  const pulse =
    phase === "bloomed" ? 1 + 0.035 * Math.sin(now * 2.2 + id * 1.1) : 1;

  // Petal dimensions scale up with bloomT (start at 0 = just a bud dot)
  const budR = 5 + bloomT * 10;
  const petalW = bloomT * 14;
  const petalH = bloomT * 20;
  const petalD = 5 + bloomT * 14; // distance from center to petal base

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.shadowColor = col;
  ctx.shadowBlur = 10 + 14 * bloomT;

  // 5 petals, each drawn as a rotated ellipse displaced from center
  if (bloomT > 0.02) {
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(
        0,
        -(petalD + petalH / 2),
        Math.max(0.1, petalW),
        Math.max(0.1, petalH / 2 + 4),
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = col + "bb";
      ctx.fill();
      ctx.restore();
    }
  }

  // Center circle
  ctx.beginPath();
  ctx.arc(0, 0, budR, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();

  ctx.restore();
}

export default function KidsBloomGarden() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const actx = new AudioContext();
    const flowers: Flower[] = [];
    const stopFns = new Map<number, (fadeS: number) => void>();

    // Canvas sizing
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // Ambient C3+E3+G3 pad — very quiet; screen never dead-silent
    const setupAmbient = () => {
      [130.81, 164.81, 196.0].forEach((hz, i) => {
        const osc = actx.createOscillator();
        const g = actx.createGain();
        osc.type = "sine";
        osc.frequency.value = hz;
        const delay = i * 0.5;
        const t0 = actx.currentTime;
        g.gain.setValueAtTime(0, t0 + delay);
        g.gain.linearRampToValueAtTime(0.02, t0 + delay + 2.5);
        osc.connect(g).connect(actx.destination);
        osc.start(t0 + delay);
      });
    };
    setupAmbient();

    // Create sustained audio for a flower; register its stop-closure
    const growAudio = (noteIdx: number, id: number): GainNode | null => {
      const hz = PENTA_HZ[noteIdx];
      const now = actx.currentTime;
      const master = actx.createGain();
      master.gain.setValueAtTime(0.001, now);
      master.gain.linearRampToValueAtTime(0.15, now + 0.85);
      master.connect(actx.destination);

      const osc = actx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz;
      osc.connect(master);
      osc.start(now);

      // Soft 2nd harmonic for warmth
      const osc2 = actx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = hz * 2;
      const g2 = actx.createGain();
      g2.gain.value = 0.06;
      osc2.connect(g2).connect(master);
      osc2.start(now);

      stopFns.set(id, (fadeS: number) => {
        const t = actx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0.001, t + fadeS);
        osc.stop(t + fadeS + 0.05);
        osc2.stop(t + fadeS + 0.05);
      });

      return master;
    };

    const fadeAudio = (id: number, fadeS: number) => {
      const fn = stopFns.get(id);
      if (fn) {
        fn(fadeS);
        stopFns.delete(id);
      }
    };

    // Short pop note when a flower is burst
    const popNote = (noteIdx: number) => {
      const hz = PENTA_HZ[noteIdx];
      const now = actx.currentTime;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      g.connect(actx.destination);
      const osc = actx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz;
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.6);
      // Quick noise click
      const buf = actx.createBuffer(
        1,
        Math.floor(actx.sampleRate * 0.06),
        actx.sampleRate
      );
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
      const src = actx.createBufferSource();
      const ng = actx.createGain();
      ng.gain.setValueAtTime(0.1, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      src.buffer = buf;
      src.connect(ng).connect(actx.destination);
      src.start(now);
    };

    // Plant a new flower bud at CSS pixel coords
    const plantAt = (px: number, py: number) => {
      const liveCount = flowers.filter((f) => f.phase !== "dead").length;
      if (liveCount >= MAX_FLOWERS) return;
      const tooClose = flowers.some(
        (f) => f.phase !== "dead" && Math.hypot(f.x - px, f.y - py) < 38
      );
      if (tooClose) return;
      const noteIdx = Math.max(0, Math.min(7, Math.round((px / w) * 7)));
      const id = _gid++;
      flowers.push({
        id,
        x: px,
        y: py,
        noteIdx,
        phase: "growing",
        age: 0,
        bloomT: 0,
        seedSpawned: false,
        sparkles: [],
        gainNode: growAudio(noteIdx, id),
      });
    };

    // Burst the nearest flower within HIT_R; return true if one was found
    const tryBurst = (px: number, py: number): boolean => {
      for (const f of flowers) {
        if (f.phase === "dead") continue;
        if (Math.hypot(f.x - px, f.y - py) < HIT_R) {
          fadeAudio(f.id, 0.1);
          popNote(f.noteIdx);
          f.sparkles.push(
            ...makeSparkles(f.x, f.y, FLOWER_COLORS[f.noteIdx], 20)
          );
          f.phase = "dead";
          return true;
        }
      }
      return false;
    };

    // Input — long press to plant, tap to burst
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let pressX = 0;
    let pressY = 0;
    let pressStartMs = 0;
    let pressedMoved = false;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (tryBurst(px, py)) return;
      pressX = px;
      pressY = py;
      pressStartMs = performance.now();
      pressedMoved = false;
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (!pressedMoved) plantAt(pressX, pressY);
        pressTimer = null;
      }, LONG_PRESS_MS);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - pressX;
      const dy = e.clientY - rect.top - pressY;
      if (Math.hypot(dx, dy) > 12) pressedMoved = true;
    };

    const onUp = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // Animation loop
    let lastT = performance.now() / 1000;
    let raf = 0;

    const tick = (nowMs: number) => {
      const now = nowMs / 1000;
      const dt = Math.min(now - lastT, 0.1);
      lastT = now;

      // Dark background with subtle trail
      ctx.fillStyle = "rgba(2, 4, 18, 0.22)";
      ctx.fillRect(0, 0, w, h);

      for (const f of flowers) {
        if (f.phase === "dead") continue;
        f.age += dt;

        // Growing → bloomed
        if (f.phase === "growing") {
          f.bloomT = Math.min(1, f.age / BLOOM_DUR);
          if (f.bloomT >= 1) f.phase = "bloomed";
        }

        // Bloomed → seeding at SEED_DELAY
        if (f.phase === "bloomed" && f.age >= SEED_DELAY) {
          f.phase = "seeding";
          fadeAudio(f.id, 1.6);
          f.sparkles.push(
            ...makeSparkles(f.x, f.y, FLOWER_COLORS[f.noteIdx], 10)
          );
        }

        // Seeding — spawn child bud, then die
        if (f.phase === "seeding") {
          const sa = f.age - SEED_DELAY;
          if (!f.seedSpawned && sa >= 0.5) {
            f.seedSpawned = true;
            const liveCount = flowers.filter(
              (ff) => ff.phase !== "dead"
            ).length;
            if (liveCount < MAX_FLOWERS) {
              const angle = Math.random() * Math.PI * 2;
              const dist = SEED_MIN + Math.random() * (SEED_MAX - SEED_MIN);
              const nx = Math.max(32, Math.min(w - 32, f.x + Math.cos(angle) * dist));
              const ny = Math.max(32, Math.min(h - 32, f.y + Math.sin(angle) * dist));
              const delta = Math.random() < 0.5 ? -1 : 1;
              const newNote = Math.max(0, Math.min(7, f.noteIdx + delta));
              const childId = _gid++;
              flowers.push({
                id: childId,
                x: nx,
                y: ny,
                noteIdx: newNote,
                phase: "growing",
                age: 0,
                bloomT: 0,
                seedSpawned: false,
                sparkles: [],
                gainNode: growAudio(newNote, childId),
              });
            }
          }
          if (sa >= 2.0) {
            f.phase = "dead";
            continue;
          }
        }

        paintFlower(ctx, f, now);
      }

      // Press-ring indicator — growing arc while holding before bloom
      if (pressTimer !== null && !pressedMoved) {
        const elapsed = nowMs - pressStartMs;
        const progress = Math.min(1, elapsed / LONG_PRESS_MS);
        const ringR = 20 + progress * 8;
        const arcAlpha = 0.45 + progress * 0.45;
        ctx.save();
        // Faint full-circle track
        ctx.strokeStyle = "rgba(167,139,250,0.15)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pressX, pressY, ringR, 0, Math.PI * 2);
        ctx.stroke();
        // Progress arc
        ctx.strokeStyle = `rgba(167,139,250,${arcAlpha})`;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.shadowColor = "#a78bfa";
        ctx.shadowBlur = 8 + 10 * progress;
        ctx.beginPath();
        ctx.arc(pressX, pressY, ringR, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.stroke();
        // Center seed dot
        ctx.fillStyle = `rgba(167,139,250,${arcAlpha})`;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(pressX, pressY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Sparkles (from all flowers including dead ones mid-burst)
      for (const f of flowers) {
        for (let i = f.sparkles.length - 1; i >= 0; i--) {
          const s = f.sparkles[i];
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vy += 55 * dt; // gravity arc
          s.life -= dt * 1.15;
          if (s.life <= 0) {
            f.sparkles.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = s.life * 0.9;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 6;
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(s.x, s.y, Math.max(0.5, s.r * s.life), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Prune fully dead flowers with no remaining sparkles
      for (let i = flowers.length - 1; i >= 0; i--) {
        if (flowers[i].phase === "dead" && flowers[i].sparkles.length === 0) {
          flowers.splice(i, 1);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      if (pressTimer) clearTimeout(pressTimer);
      actx.close();
    };
  }, [started]);

  if (!started) {
    return (
      <div className="min-h-screen bg-[#020412] flex flex-col items-center justify-center text-white px-6">
        <div className="max-w-sm w-full flex flex-col items-center gap-6 text-center">
          <div className="text-5xl flex gap-2">🌸 🌼 🌺</div>
          <h1 className="text-3xl font-bold text-white/95">Bloom Garden</h1>
          <p className="text-base text-white/80 leading-relaxed">
            Press and hold anywhere to plant a glowing flower — it blooms and
            plays a soft note. After a while it seeds itself, and a new bud
            grows nearby. Tap any flower to burst it into sparkles.
          </p>
          <p className="text-sm text-white/60">
            Left side plays low notes · right side plays high notes
          </p>
          <button
            onPointerDown={() => setStarted(true)}
            className="mt-2 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold text-lg rounded-2xl px-8 py-4 min-h-[64px] min-w-[200px] transition-colors"
          >
            Start the garden
          </button>
        </div>
        <Link
          href="/dream"
          className="absolute bottom-6 text-white/55 text-sm hover:text-white/80 transition-colors"
        >
          ← dream lab
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#020412] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full touch-none"
        style={{ background: "#020412" }}
      />
      <div className="fixed bottom-5 left-0 right-0 flex justify-center pointer-events-none">
        <span className="text-white/55 text-sm bg-black/30 px-3 py-1.5 rounded-full">
          hold to plant · tap to burst
        </span>
      </div>
      <Link
        href="/dream"
        className="fixed top-4 left-4 text-white/55 text-sm pointer-events-auto hover:text-white/80 transition-colors"
      >
        ← dream lab
      </Link>
    </div>
  );
}
