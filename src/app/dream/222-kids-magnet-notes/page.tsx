"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap anywhere to drop a glowing star magnet. Six pentatonic note-bubbles
// float on the canvas and are pulled toward the nearest magnet by spring
// attraction. When a bubble drifts close enough it rings its note and
// bounces outward — then drifts back in for the next ring. Multiple magnets
// create layered orbital melodies. Zero permissions, zero API, zero deps.

// C major pentatonic C3–E4 (BANDIMAL: bigger = lower)
const NOTES = [
  { color: "#a78bfa", glow: "#6d28d9", freq: 130.81, r: 44 }, // C3 violet
  { color: "#2dd4bf", glow: "#0f766e", freq: 164.81, r: 38 }, // E3 teal
  { color: "#34d399", glow: "#047857", freq: 196.00, r: 32 }, // G3 emerald
  { color: "#fbbf24", glow: "#b45309", freq: 220.00, r: 28 }, // A3 amber
  { color: "#67e8f9", glow: "#0e7490", freq: 261.63, r: 24 }, // C4 cyan
  { color: "#f472b6", glow: "#9d174d", freq: 329.63, r: 20 }, // E4 rose
] as const;

const SPRING   = 0.20;  // attraction constant (s^-2): accel = SPRING * distance
const DAMP     = 0.987; // velocity damping per frame (~60 fps)
const BROWN    = 18;    // Brownian impulse (px/s²)
const RING_R   = 52;    // trigger ring distance (px)
const KICK_V   = 82;    // outward kick speed on ring (px/s)
const COOLDOWN = 0.7;   // seconds between rings per bubble
const MAX_MAGS = 4;     // max simultaneous magnets

type Note = {
  x: number; y: number;
  vx: number; vy: number;
  ni: number;
  cd: number;    // cooldown remaining (s)
  flash: number; // 0–1 brightness extra
  flashT: number;
};

type Magnet = { id: number; x: number; y: number; born: number };
type Star   = { fx: number; fy: number; r: number; ph: number };

function ringNote(freq: number, actx: AudioContext): void {
  const now = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  o.connect(g);
  g.connect(actx.destination);
  g.gain.setValueAtTime(0.26, now);
  g.gain.setTargetAtTime(0.001, now + 0.06, 0.42);
  o.start(now);
  o.stop(now + 2.0);
}

export default function KidsMagnetNotes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef     = useRef<AudioContext | null>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;
    let stars: Star[] = [];
    const magnets: Magnet[] = [];
    let magId = 0;
    let lt = 0;

    const buildStars = () =>
      Array.from({ length: 64 }, () => ({
        fx: Math.random(), fy: Math.random(),
        r: 0.4 + Math.random() * 1.4, ph: Math.random() * Math.PI * 2,
      }));

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      stars = buildStars();
    };
    resize();

    // Init notes scattered across the canvas
    const notes: Note[] = NOTES.map((_, ni) => ({
      x:  W * (0.12 + Math.random() * 0.76),
      y:  H * (0.12 + Math.random() * 0.76),
      vx: (Math.random() - 0.5) * 55,
      vy: (Math.random() - 0.5) * 55,
      ni, cd: Math.random() * COOLDOWN, flash: 0, flashT: 0,
    }));

    window.addEventListener("resize", resize);

    const addMagnet = (x: number, y: number) => {
      if (magnets.length >= MAX_MAGS) magnets.shift();
      magnets.push({ id: magId++, x, y, born: performance.now() });
    };

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      if (!acRef.current) acRef.current = new AudioContext();
      const rect = canvas.getBoundingClientRect();
      addMagnet(e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener("pointerdown", onPointer);

    const animate = (ts: number) => {
      const gc = canvas.getContext("2d");
      if (!gc) { rafRef.current = requestAnimationFrame(animate); return; }
      gc.setTransform(dpr, 0, 0, dpr, 0, 0);

      const dt = lt ? Math.min((ts - lt) / 1000, 0.05) : 0.016;
      lt = ts;

      // ── physics ──────────────────────────────────────────────────────────
      for (const n of notes) {
        n.cd    = Math.max(0, n.cd - dt);
        n.flashT = Math.max(0, n.flashT - dt);
        n.flash  = n.flashT > 0 ? n.flashT / 0.22 : 0;

        // Brownian walk
        n.vx += (Math.random() - 0.5) * BROWN * dt;
        n.vy += (Math.random() - 0.5) * BROWN * dt;

        if (magnets.length > 0) {
          // Find nearest magnet
          let nearD = Infinity;
          let nearX = 0, nearY = 0;
          for (const m of magnets) {
            const ex = m.x - n.x, ey = m.y - n.y;
            const d  = Math.sqrt(ex * ex + ey * ey);
            if (d < nearD) { nearD = d; nearX = m.x; nearY = m.y; }
          }

          if (nearD < 600) {
            // Spring attraction: accel = SPRING * displacement
            n.vx += SPRING * (nearX - n.x) * dt;
            n.vy += SPRING * (nearY - n.y) * dt;

            // Ring when close enough
            if (nearD < RING_R && n.cd === 0 && acRef.current) {
              n.cd    = COOLDOWN;
              n.flash = 1;
              n.flashT = 0.22;
              ringNote(NOTES[n.ni].freq, acRef.current);
              // Outward kick
              const safeD = Math.max(nearD, 1);
              n.vx += -((nearX - n.x) / safeD) * KICK_V;
              n.vy += -((nearY - n.y) / safeD) * KICK_V;
            }
          }
        }

        // Damp + integrate
        n.vx *= DAMP;
        n.vy *= DAMP;
        n.x  += n.vx * dt;
        n.y  += n.vy * dt;

        // Wall bounce (buffer = note radius)
        const nr = NOTES[n.ni].r;
        if (n.x < nr)     { n.x = nr;     n.vx =  Math.abs(n.vx) * 0.65; }
        if (n.x > W - nr) { n.x = W - nr; n.vx = -Math.abs(n.vx) * 0.65; }
        if (n.y < nr)     { n.y = nr;     n.vy =  Math.abs(n.vy) * 0.65; }
        if (n.y > H - nr) { n.y = H - nr; n.vy = -Math.abs(n.vy) * 0.65; }
      }

      // ── draw ─────────────────────────────────────────────────────────────
      gc.fillStyle = "#040112";
      gc.fillRect(0, 0, W, H);

      // Stars
      for (const s of stars) {
        const a = 0.18 + 0.16 * Math.sin(ts * 0.00055 + s.ph);
        gc.beginPath();
        gc.arc(s.fx * W, s.fy * H, s.r, 0, Math.PI * 2);
        gc.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        gc.fill();
      }

      // Magnets: concentric attraction rings + glowing 5-point star
      for (const m of magnets) {
        const age   = (performance.now() - m.born) / 1000;
        const pulse = 0.82 + 0.18 * Math.sin(age * 3.6);
        const mr    = 17 * pulse;

        // Attraction rings (three faint halos)
        for (let ring = 1; ring <= 3; ring++) {
          gc.beginPath();
          gc.arc(m.x, m.y, RING_R * (ring * 0.38), 0, Math.PI * 2);
          gc.strokeStyle = `rgba(253,230,138,${(0.12 / ring).toFixed(2)})`;
          gc.lineWidth = 1.0;
          gc.stroke();
        }

        // Star body
        gc.shadowColor = "#f9a825";
        gc.shadowBlur  = 26 * pulse;
        gc.beginPath();
        for (let i = 0; i < 10; i++) {
          const ang = (i * Math.PI) / 5 - Math.PI / 2;
          const rad = i % 2 === 0 ? mr : mr * 0.40;
          const px  = m.x + Math.cos(ang) * rad;
          const py  = m.y + Math.sin(ang) * rad;
          if (i === 0) gc.moveTo(px, py); else gc.lineTo(px, py);
        }
        gc.closePath();
        gc.fillStyle = "#fde68a";
        gc.fill();
        gc.shadowBlur = 0;
      }

      // Note bubbles
      for (const n of notes) {
        const nd   = NOTES[n.ni];
        const extra = n.flash * 0.32;
        const glow  = 9 + n.flash * 26;

        gc.shadowColor = nd.glow;
        gc.shadowBlur  = glow;
        gc.beginPath();
        gc.arc(n.x, n.y, nd.r * (1 + extra), 0, Math.PI * 2);
        const alpha = Math.round((0.76 + n.flash * 0.24) * 255).toString(16).padStart(2, "0");
        gc.fillStyle = nd.color + alpha;
        gc.fill();

        // Specular highlight (soap-bubble sheen)
        gc.shadowBlur = 0;
        gc.beginPath();
        gc.arc(n.x - nd.r * 0.30, n.y - nd.r * 0.30, nd.r * 0.20, 0, Math.PI * 2);
        gc.fillStyle = "rgba(255,255,255,0.36)";
        gc.fill();
      }

      // Hint text (fades after 6 s)
      const hintAlpha = Math.max(0, Math.min(1, (8000 - ts) / 3000));
      if (hintAlpha > 0) {
        gc.font = `${16 * dpr / dpr}px sans-serif`;
        gc.fillStyle = `rgba(255,255,255,${(hintAlpha * 0.55).toFixed(2)})`;
        gc.textAlign = "center";
        gc.fillText("Tap the sky to drop a magnet ✦", W / 2, H - 28);
      }

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    // Auto-demo: 2 magnets so the canvas is immediately alive
    const t1 = setTimeout(() => addMagnet(W * 0.34, H * 0.44), 900);
    const t2 = setTimeout(() => addMagnet(W * 0.70, H * 0.52), 2000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointer);
      acRef.current?.close();
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#040112] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
      />

      <div className="absolute top-0 left-0 right-0 p-4 text-center pointer-events-none">
        <h1 className="text-2xl font-bold text-white/95">Musical Magnets</h1>
        <p className="text-base text-white/75 mt-1">
          Tap anywhere — bubbles float toward your magnet and sing ✦
        </p>
      </div>

      <div className="absolute top-4 right-4">
        <Link
          href="/dream"
          className="text-white/55 text-sm hover:text-white/80 transition-colors"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
