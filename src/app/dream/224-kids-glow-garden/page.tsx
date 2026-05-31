"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap to plant a glowing flower — it grows and sings its pentatonic note.
// Plant two flowers near each other and they glow brighter, an arc connects
// them, and a resonance chord rings out. WHERE you plant = which harmonies
// you get. The garden IS the music.

const PITCHES = [130.81, 164.81, 196.00, 220.00, 261.63]; // C3 E3 G3 A3 C4
const COLORS  = ["#a78bfa", "#2dd4bf", "#34d399", "#fbbf24", "#f472b6"];
const GLOWS   = ["#7c3aed", "#0f766e", "#047857", "#b45309", "#9d174d"];
const RADII   = [52, 44, 36, 30, 24]; // BANDIMAL: bigger = lower pitch
const NEAR_FRAC = 0.34; // proximity threshold as fraction of canvas width
const MAX_FL    = 7;
const GROW_MS   = 1400;

let gId = 0;

type Star = { fx: number; fy: number; r: number; ph: number };

interface Fl {
  id: number; x: number; zone: number; bornAt: number;
  osc: OscillatorNode | null; gain: GainNode | null;
}

export default function KidsGlowGarden() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef     = useRef<AudioContext | null>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;
    const flowers: Fl[] = [];
    const chimedPairs   = new Set<string>();
    let stars: Star[]   = [];

    const buildStars = (): Star[] =>
      Array.from({ length: 54 }, () => ({
        fx: Math.random(), fy: Math.random() * 0.80,
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
    window.addEventListener("resize", resize);

    // ── audio ──────────────────────────────────────────────────────────────

    function startFlowerAudio(f: Fl, ac: AudioContext, retroactive: boolean) {
      const osc = ac.createOscillator();
      const gn  = ac.createGain();
      osc.type  = "triangle";
      osc.frequency.value = PITCHES[f.zone];
      const now  = ac.currentTime;
      const ramp = retroactive ? 0.5 : GROW_MS / 1000;
      gn.gain.setValueAtTime(0, now);
      gn.gain.linearRampToValueAtTime(0.055, now + ramp);
      osc.connect(gn);
      gn.connect(ac.destination);
      osc.start(now);
      f.osc = osc;
      f.gain = gn;
    }

    function stopFlowerAudio(f: Fl) {
      if (!f.osc || !f.gain) return;
      if (acRef.current) {
        const now = acRef.current.currentTime;
        f.gain.gain.setTargetAtTime(0, now, 0.10);
        f.osc.stop(now + 0.4);
      }
      f.osc = null;
      f.gain = null;
    }

    function playAmbient(ac: AudioContext) {
      ([
        [65.41, 0.010],
        [98.00, 0.007],
      ] as [number, number][]).forEach(([hz, g]) => {
        const osc = ac.createOscillator();
        const gn  = ac.createGain();
        osc.type  = "sine";
        osc.frequency.value = hz;
        gn.gain.setValueAtTime(0, ac.currentTime);
        gn.gain.linearRampToValueAtTime(g, ac.currentTime + 3);
        osc.connect(gn);
        gn.connect(ac.destination);
        osc.start();
      });
    }

    function chimeResonance(ac: AudioContext, hz1: number, hz2: number) {
      const lo = Math.min(hz1, hz2);
      const t  = ac.currentTime;
      ([
        [hz1,      0.055],
        [hz2,      0.055],
        [lo * 1.5, 0.038], // perfect fifth above the lower note
      ] as [number, number][]).forEach(([hz, g]) => {
        const osc = ac.createOscillator();
        const gn  = ac.createGain();
        osc.type  = "sine";
        osc.frequency.value = hz;
        gn.gain.setValueAtTime(g, t);
        gn.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
        osc.connect(gn);
        gn.connect(ac.destination);
        osc.start(t);
        osc.stop(t + 2.5);
      });
    }

    function ensureAC() {
      if (!acRef.current) {
        acRef.current = new AudioContext();
        playAmbient(acRef.current);
        // Retroactively start audio for any visual-only demo flowers
        for (const f of flowers) {
          if (!f.osc) startFlowerAudio(f, acRef.current, true);
        }
        // Retroactively chime any resonance pairs already in proximity range
        const nd = W * NEAR_FRAC;
        for (let i = 0; i < flowers.length; i++) {
          for (let j = i + 1; j < flowers.length; j++) {
            const a = flowers[i], b = flowers[j];
            if (Math.abs(a.x - b.x) < nd) {
              const key = [Math.min(a.id, b.id), Math.max(a.id, b.id)].join("_");
              if (!chimedPairs.has(key)) {
                chimedPairs.add(key);
                chimeResonance(acRef.current, PITCHES[a.zone], PITCHES[b.zone]);
              }
            }
          }
        }
      }
    }

    // ── flower management ──────────────────────────────────────────────────

    function plantFlower(cssX: number) {
      const zone = Math.min(4, Math.floor((cssX / W) * 5));
      const f: Fl = { id: gId++, x: cssX, zone, bornAt: Date.now(), osc: null, gain: null };
      if (acRef.current) {
        startFlowerAudio(f, acRef.current, false);
        const nd = W * NEAR_FRAC;
        for (const e of flowers) {
          if (Math.abs(e.x - cssX) < nd) {
            const key = [Math.min(e.id, f.id), Math.max(e.id, f.id)].join("_");
            if (!chimedPairs.has(key)) {
              chimedPairs.add(key);
              chimeResonance(acRef.current, PITCHES[e.zone], PITCHES[zone]);
            }
          }
        }
      }
      if (flowers.length >= MAX_FL) {
        const old = flowers.shift()!;
        stopFlowerAudio(old);
        const oldId = String(old.id);
        for (const k of [...chimedPairs]) {
          if (k.split("_").includes(oldId)) chimedPairs.delete(k);
        }
      }
      flowers.push(f);
    }

    function removeFlower(idx: number) {
      const f = flowers[idx];
      stopFlowerAudio(f);
      const fId = String(f.id);
      for (const k of [...chimedPairs]) {
        if (k.split("_").includes(fId)) chimedPairs.delete(k);
      }
      flowers.splice(idx, 1);
    }

    // ── drawing ────────────────────────────────────────────────────────────

    function drawFlower(gc: CanvasRenderingContext2D, f: Fl, ts: number) {
      const growth = Math.min(1, (Date.now() - f.bornAt) / GROW_MS);
      if (growth < 0.03) return;
      const x      = f.x;
      const R      = RADII[f.zone];
      const color  = COLORS[f.zone];
      const glow   = GLOWS[f.zone];
      const groundY  = H - 8;
      const headFull = H * 0.28;
      const headY    = groundY - (groundY - headFull) * growth;
      const nd       = W * NEAR_FRAC;
      const isNear   = flowers.some(o => o.id !== f.id && Math.abs(o.x - f.x) < nd);
      const extra    = isNear ? 14 : 0;
      const pulse    = 1 + 0.07 * Math.sin(ts * 0.0018 + f.id * 1.4);

      // Stem
      gc.beginPath();
      gc.moveTo(x, groundY);
      gc.lineTo(x, headY + R * growth);
      gc.strokeStyle = `${color}77`;
      gc.lineWidth   = 2.5;
      gc.stroke();

      // Petals bloom after 30% growth
      const petalT = Math.max(0, (growth - 0.30) / 0.70);
      if (petalT > 0) {
        const pr = R * 0.58 * petalT;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + ts * 0.00022;
          gc.beginPath();
          gc.ellipse(
            x + Math.cos(ang) * R * 0.72, headY + Math.sin(ang) * R * 0.72,
            pr, pr * 0.50, ang, 0, Math.PI * 2,
          );
          gc.fillStyle   = `${color}88`;
          gc.shadowColor = glow;
          gc.shadowBlur  = (5 + extra * 0.4) * petalT;
          gc.fill();
          gc.shadowBlur  = 0;
        }
      }

      // Center disc
      gc.beginPath();
      gc.arc(x, headY, R * growth * pulse, 0, Math.PI * 2);
      gc.fillStyle   = color;
      gc.shadowColor = glow;
      gc.shadowBlur  = (20 + extra) * growth;
      gc.fill();
      gc.shadowBlur  = 0;

      // Specular highlight
      gc.beginPath();
      gc.arc(x - R * 0.26 * growth, headY - R * 0.26 * growth, R * 0.15 * growth, 0, Math.PI * 2);
      gc.fillStyle = "rgba(255,255,255,0.27)";
      gc.fill();
    }

    function drawArcs(gc: CanvasRenderingContext2D, ts: number) {
      const nd      = W * NEAR_FRAC;
      const groundY  = H - 8;
      const headFull = H * 0.28;
      for (let i = 0; i < flowers.length; i++) {
        for (let j = i + 1; j < flowers.length; j++) {
          const f1 = flowers[i], f2 = flowers[j];
          if (Math.abs(f1.x - f2.x) >= nd) continue;
          const g1 = Math.min(1, (Date.now() - f1.bornAt) / GROW_MS);
          const g2 = Math.min(1, (Date.now() - f2.bornAt) / GROW_MS);
          const h1 = groundY - (groundY - headFull) * g1;
          const h2 = groundY - (groundY - headFull) * g2;
          const mx = (f1.x + f2.x) / 2;
          const my = Math.min(h1, h2) - 44;
          const al = 0.28 + 0.14 * Math.sin(ts * 0.0016 + i * 0.9);
          gc.beginPath();
          gc.moveTo(f1.x, h1);
          gc.quadraticCurveTo(mx, my, f2.x, h2);
          gc.strokeStyle = `rgba(255,255,255,${al.toFixed(2)})`;
          gc.lineWidth   = 1.8;
          gc.shadowColor = "#ffffff";
          gc.shadowBlur  = 10;
          gc.stroke();
          gc.shadowBlur  = 0;
        }
      }
    }

    // ── animation loop ─────────────────────────────────────────────────────

    const animate = (ts: number) => {
      rafRef.current = requestAnimationFrame(animate);
      const gc = canvas.getContext("2d");
      if (!gc) return;
      gc.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Sky background
      gc.fillStyle = "#040112";
      gc.fillRect(0, 0, W, H);

      // Twinkling stars
      for (const s of stars) {
        const a = 0.18 + 0.17 * Math.sin(ts * 0.00055 + s.ph);
        gc.beginPath();
        gc.arc(s.fx * W, s.fy * H, s.r, 0, Math.PI * 2);
        gc.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        gc.fill();
      }

      // Soil strip
      const soil = gc.createLinearGradient(0, H * 0.84, 0, H);
      soil.addColorStop(0, "rgba(30,14,4,0)");
      soil.addColorStop(0.5, "rgba(30,14,4,0.76)");
      soil.addColorStop(1, "rgba(12,6,2,0.96)");
      gc.fillStyle = soil;
      gc.fillRect(0, H * 0.84, W, H * 0.16);

      drawArcs(gc, ts);
      for (const f of flowers) drawFlower(gc, f, ts);

      // Hint text fades from 6 s → 9 s
      const hintAlpha = Math.max(0, Math.min(1, (9000 - ts) / 3000));
      if (hintAlpha > 0) {
        gc.font      = "15px sans-serif";
        gc.fillStyle = `rgba(255,255,255,${(hintAlpha * 0.50).toFixed(2)})`;
        gc.textAlign = "center";
        gc.fillText("Tap to plant a flower ✦ plant near others to hear their harmony", W / 2, H - 28);
      }
    };
    rafRef.current = requestAnimationFrame(animate);

    // ── pointer events ─────────────────────────────────────────────────────

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      ensureAC();
      const rect    = canvas.getBoundingClientRect();
      const cssX    = e.clientX - rect.left;
      const cssY    = e.clientY - rect.top;
      const groundY  = H - 8;
      const headFull = H * 0.28;
      let tapIdx = -1;
      for (let i = 0; i < flowers.length; i++) {
        const f      = flowers[i];
        const growth = Math.min(1, (Date.now() - f.bornAt) / GROW_MS);
        const headY  = groundY - (groundY - headFull) * growth;
        const R      = RADII[f.zone] * 1.7; // generous tap radius for kids
        const dx = cssX - f.x, dy = cssY - headY;
        if (dx * dx + dy * dy < R * R) { tapIdx = i; break; }
      }
      if (tapIdx >= 0) removeFlower(tapIdx);
      else plantFlower(cssX);
    };
    canvas.addEventListener("pointerdown", onPointer);

    // Auto-demo: two flowers in resonance range so the arc appears from load
    const t1 = setTimeout(() => plantFlower(canvas.offsetWidth * 0.29), 900);
    const t2 = setTimeout(() => plantFlower(canvas.offsetWidth * 0.62), 1600);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(t1); clearTimeout(t2);
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
        <h1 className="text-2xl font-bold text-white/95">Glow Garden</h1>
        <p className="text-base text-white/75 mt-1">
          Tap to grow a flower — plant near others to hear their harmony ✦
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
