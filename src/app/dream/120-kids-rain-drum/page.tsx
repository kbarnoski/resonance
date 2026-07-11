"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// 4 zones left→right: C3 E3 G3 A3 (C-major pentatonic — always consonant together)
const ZONE_HZ = [130.81, 164.81, 196.0, 220.0];

type WeatherType = "rain" | "snow" | "leaves";
const WEATHER_ORDER: WeatherType[] = ["rain", "snow", "leaves"];
const WEATHER_EMOJI: Record<WeatherType, string> = { rain: "🌧️", snow: "❄️", leaves: "🍃" };

const PHYS: Record<WeatherType, { g: number; maxVy: number; interval: number; drift: number }> = {
  rain:   { g: 0.22,  maxVy: 9.0, interval: 28, drift: 0.00 },
  snow:   { g: 0.022, maxVy: 2.0, interval: 50, drift: 1.50 },
  leaves: { g: 0.065, maxVy: 4.0, interval: 38, drift: 2.00 },
};

const ZONE_TINT: Record<WeatherType, string> = {
  rain:   "rgba(30,60,140,0.18)",
  snow:   "rgba(200,220,240,0.10)",
  leaves: "rgba(30,100,40,0.16)",
};

const ZONE_GLOW: Record<WeatherType, string> = {
  rain:   "#60a5fa",
  snow:   "#e2e8f0",
  leaves: "#86efac",
};

const LEAF_COLORS = ["#86efac", "#fbbf24", "#f97316", "#a3e635", "#fb923c"];

interface Drop {
  id: number;
  zone: number;
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  rot: number; rotV: number;
  phase: number;
  type: WeatherType;
  color: string;
}

interface Splash {
  x: number; y: number;
  r: number; maxR: number;
  life: number;
  color: string;
}

let _dropId = 0;
const MAX_DROPS = 50;

function dropColor(type: WeatherType): string {
  if (type === "rain") return "#60a5fa";
  if (type === "snow") return "#e2e8f0";
  return LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
}

function playDrop(ac: AudioContext, hz: number, type: WeatherType) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  const t = ac.currentTime;
  if (type === "snow") {
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    osc.start(t); osc.stop(t + 1.8);
  } else if (type === "leaves") {
    osc.type = "triangle";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.11, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    osc.start(t); osc.stop(t + 1.1);
  } else {
    osc.type = "triangle";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.start(t); osc.stop(t + 0.7);
  }
}

export default function KidsRainDrum() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef = useRef<AudioContext | null>(null);
  const wxRef = useRef<WeatherType[]>(["rain", "snow", "leaves", "rain"]);
  const [started, setStarted] = useState(false);

  function handleStart() {
    const ac = new AudioContext();
    acRef.current = ac;
    // Ambient pad: C3 + E3 + G3 — always-on, barely audible
    [130.81, 164.81, 196.0].forEach((f) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = 0.013;
      o.connect(g);
      g.connect(ac.destination);
      o.start();
    });
    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;

    const ctx = canvas.getContext("2d")!;

    function resize() {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const drops: Drop[] = [];
    const splashes: Splash[] = [];
    const counters = [0, 0, 0, 0];
    const lastNoteMs = [0, 0, 0, 0];
    let frame = 0;
    let lastTs = 0;
    let rafId = 0;

    function spawnDrop(zone: number) {
      if (drops.length >= MAX_DROPS) return;
      const type = wxRef.current[zone];
      const zW = W / 4;
      const x = zone * zW + zW * 0.1 + Math.random() * zW * 0.8;
      const r =
        type === "snow" ? 5 + Math.random() * 4 :
        type === "rain" ? 2.5 + Math.random() * 1.5 :
        4 + Math.random() * 3;
      drops.push({
        id: _dropId++, zone, x,
        y: 95 + Math.random() * 15,
        vx: type === "rain" ? (Math.random() - 0.5) * 0.5 : 0,
        vy: type === "rain" ? 1.5 + Math.random() * 2
          : type === "snow" ? 0.3 + Math.random() * 0.5
          : 0.7 + Math.random() * 0.8,
        r, rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.08,
        phase: Math.random() * Math.PI * 2,
        type, color: dropColor(type),
      });
    }

    function drawDrop(d: Drop) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.globalAlpha = 0.88;
      ctx.shadowColor = d.color;
      if (d.type === "rain") {
        ctx.rotate(d.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r * 0.5, d.r * 1.7, 0, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.shadowBlur = 5;
        ctx.fill();
      } else if (d.type === "snow") {
        ctx.beginPath();
        ctx.arc(0, 0, d.r, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 0.6;
        for (let i = 0; i < 6; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI) / 3 + d.rot);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, d.r * 1.5); ctx.stroke();
          ctx.restore();
        }
      } else {
        // leaf: small rotated ellipse
        ctx.rotate(d.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r * 0.45, d.r * 1.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.shadowBlur = 7;
        ctx.fill();
      }
      ctx.restore();
    }

    function tick(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      frame++;
      const nowMs = performance.now();

      // Spawn drops
      for (let z = 0; z < 4; z++) {
        const p = PHYS[wxRef.current[z]];
        if (++counters[z] >= p.interval) { counters[z] = 0; spawnDrop(z); }
      }

      // Update drops
      const toRemove: number[] = [];
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const p = PHYS[d.type];
        d.vy = Math.min(d.vy + p.g, p.maxVy);
        d.vx += p.drift * Math.sin(ts / 900 + d.phase) * 0.01;
        d.x += d.vx; d.y += d.vy; d.rot += d.rotV;
        const zW = W / 4, zL = d.zone * zW;
        if (d.x < zL + 4) d.vx += 0.15;
        if (d.x > zL + zW - 4) d.vx -= 0.15;
        if (d.y > H - 12) {
          toRemove.push(i);
          const ac = acRef.current;
          if (ac && nowMs - lastNoteMs[d.zone] > 65) {
            playDrop(ac, ZONE_HZ[d.zone], d.type);
            lastNoteMs[d.zone] = nowMs;
          }
          splashes.push({
            x: d.x, y: H - 8, r: 0,
            maxR: 14 + Math.random() * 12, life: 1, color: d.color,
          });
        }
      }
      for (let i = toRemove.length - 1; i >= 0; i--) drops.splice(toRemove[i], 1);

      // Update splashes
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.r += s.maxR * 4 * dt;
        s.life -= 3.5 * dt;
        if (s.r > s.maxR * 1.1 || s.life <= 0) splashes.splice(i, 1);
      }

      // ── Draw ──────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);
      const zW = W / 4;

      // Zone tints
      for (let z = 0; z < 4; z++) {
        ctx.fillStyle = ZONE_TINT[wxRef.current[z]];
        ctx.fillRect(z * zW, 0, zW, H);
      }

      // Zone dividers
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let z = 1; z < 4; z++) {
        ctx.beginPath(); ctx.moveTo(z * zW, 0); ctx.lineTo(z * zW, H); ctx.stroke();
      }

      // Clouds
      for (let z = 0; z < 4; z++) {
        const cx = z * zW + zW / 2;
        const type = wxRef.current[z];
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.09)";
        ctx.shadowColor = ZONE_GLOW[type];
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(cx, 38, 24, 0, Math.PI * 2);
        ctx.arc(cx - 14, 44, 16, 0, Math.PI * 2);
        ctx.arc(cx + 14, 44, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.font = "20px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(WEATHER_EMOJI[type], cx, 41);

        if (frame < 240) {
          ctx.font = "9px monospace";
          ctx.fillStyle = "rgba(255,255,255,0.28)";
          ctx.textAlign = "center";
          ctx.fillText("tap ↑", cx, 72);
        }
      }

      // Splashes (below drops)
      for (const s of splashes) {
        ctx.save();
        ctx.globalAlpha = s.life * 0.5;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Drops
      for (const d of drops) drawDrop(d);

      // Ground strip
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, H - 8, W, 8);

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame((ts) => { lastTs = ts; tick(ts); });

    function handlePointerDown(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const py = e.clientY - rect.top;
      if (py > 90) return; // only cloud area
      const px = e.clientX - rect.left;
      const zone = Math.min(3, Math.max(0, Math.floor((px / W) * 4)));
      const cur = WEATHER_ORDER.indexOf(wxRef.current[zone]);
      const next = [...wxRef.current] as WeatherType[];
      next[zone] = WEATHER_ORDER[(cur + 1) % WEATHER_ORDER.length];
      wxRef.current = next;
      counters[zone] = 0; // spawn new weather type's drops sooner
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    canvas.addEventListener("pointerdown", handlePointerDown);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      ro.disconnect();
    };
  }, [started]);

  return (
    <div className="flex flex-col h-screen bg-[#070b12] text-foreground">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h1 className="text-2xl font-serif text-foreground">Rain Drum</h1>
        <p className="text-base text-muted-foreground mt-0.5">
          Four clouds drop notes from the sky. Tap a cloud to change its weather.
        </p>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {!started && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#070b12]/80">
            <button
              onClick={handleStart}
              className="bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/40 text-violet-200 text-lg font-medium px-10 py-3.5 rounded-2xl min-h-[56px] transition-colors"
            >
              ▶ Start
            </button>
          </div>
        )}
      </div>

      <div className="px-5 py-2 flex-shrink-0 flex items-center justify-between">
        <Link href="/dream" className="text-muted-foreground text-xs hover:text-muted-foreground transition-colors">
          ← dream lab
        </Link>
        <span className="text-muted-foreground text-xs">cycle 142 · kids</span>
      </div>
    </div>
  );
}
