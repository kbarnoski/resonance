"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap each part of a glowing face to wake it up.
// Eyes blink on their own rhythm, nose bounces to a beat, mouth sings a melody,
// head hums a deep drone. Light up all five — the face celebrates!

const C2 = 65.41;
const C3 = 130.81;
const E3 = 164.81;
const G3 = 196.00;
const A3 = 220.00;
const C4 = 261.63;
const MELODY = [C3, G3, A3, E3, C4, A3, G3, E3];

type TimerID = ReturnType<typeof setInterval>;

interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  r: number; alpha: number; col: string;
}

// Part indices
const HEAD  = 0;
const LEYE  = 1;
const REYE  = 2;
const NOSE  = 3;
const MOUTH = 4;

const COLS = ["#a78bfa", "#2dd4bf", "#fbbf24", "#f472b6", "#67e8f9"];
const GLWS = ["#7c3aed", "#0f766e", "#b45309", "#9d174d", "#0891b2"];

export default function KidsFaceSong() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef     = useRef<AudioContext | null>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W   = canvas.offsetWidth;
    let H   = canvas.offsetHeight;

    const active: boolean[]  = [false, false, false, false, false];
    const sparks: Spark[]    = [];
    let celebrateUntil       = 0;

    let headOsc:   OscillatorNode | null = null;
    let headGain:  GainNode | null       = null;
    let eyeTimerL: TimerID | null        = null;
    let eyeTimerR: TimerID | null        = null;
    let noseTimer: TimerID | null        = null;
    let mouthTmr:  TimerID | null        = null;
    let mouthStep  = 0;

    // ── geometry ──────────────────────────────────────────────────────────────
    function geom() {
      const cx = W / 2;
      const cy = H / 2 - H * 0.04;
      const hR = Math.min(W, H) * 0.265;
      const eR = hR * 0.155;
      const nR = hR * 0.095;
      const mR = hR * 0.40;
      return {
        cx, cy, hR, eR, nR, mR,
        lx: cx - hR * 0.34, ly: cy - hR * 0.20,
        rx: cx + hR * 0.34, ry: cy - hR * 0.20,
        nx: cx,             ny: cy + hR * 0.06,
        my: cy + hR * 0.30,
      };
    }

    // ── audio ──────────────────────────────────────────────────────────────────
    function pluck(hz: number, gain: number, dur: number) {
      const ac = acRef.current;
      if (!ac) return;
      const osc = ac.createOscillator();
      const gn  = ac.createGain();
      osc.type  = "triangle";
      osc.frequency.value = hz;
      const t = ac.currentTime;
      gn.gain.setValueAtTime(gain, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gn); gn.connect(ac.destination);
      osc.start(t); osc.stop(t + dur + 0.05);
    }

    function startPart(part: number) {
      if (active[part]) return;
      const ac = acRef.current;
      if (!ac) return;
      active[part] = true;

      if (part === HEAD) {
        const osc = ac.createOscillator();
        const gn  = ac.createGain();
        osc.type  = "triangle";
        osc.frequency.value = C2;
        gn.gain.setValueAtTime(0, ac.currentTime);
        gn.gain.linearRampToValueAtTime(0.048, ac.currentTime + 0.7);
        osc.connect(gn); gn.connect(ac.destination);
        osc.start();
        headOsc = osc; headGain = gn;
      }
      if (part === LEYE) {
        pluck(G3, 0.12, 0.5);
        eyeTimerL = setInterval(() => pluck(G3, 0.10, 0.45), 800);
      }
      if (part === REYE) {
        pluck(E3, 0.12, 0.5);
        eyeTimerR = setInterval(() => pluck(E3, 0.10, 0.45), 1200);
      }
      if (part === NOSE) {
        pluck(A3, 0.14, 0.28);
        noseTimer = setInterval(() => pluck(A3, 0.12, 0.26), 600);
      }
      if (part === MOUTH) {
        mouthStep = 0;
        pluck(MELODY[0], 0.10, 0.40);
        mouthTmr = setInterval(() => {
          mouthStep = (mouthStep + 1) % MELODY.length;
          pluck(MELODY[mouthStep], 0.10, 0.40);
        }, 500);
      }
    }

    function stopPart(part: number) {
      if (!active[part]) return;
      active[part] = false;
      const ac = acRef.current;

      if (part === HEAD && ac) {
        headGain?.gain.setTargetAtTime(0, ac.currentTime, 0.15);
        headOsc?.stop(ac.currentTime + 0.6);
        headOsc = null; headGain = null;
      }
      if (part === LEYE  && eyeTimerL !== null) { clearInterval(eyeTimerL);  eyeTimerL  = null; }
      if (part === REYE  && eyeTimerR !== null) { clearInterval(eyeTimerR);  eyeTimerR  = null; }
      if (part === NOSE  && noseTimer !== null) { clearInterval(noseTimer);  noseTimer  = null; }
      if (part === MOUTH && mouthTmr  !== null) { clearInterval(mouthTmr);   mouthTmr   = null; }
    }

    function startAmbient(ac: AudioContext) {
      ([
        [C2,    0.009],
        [98.00, 0.006],
      ] as [number, number][]).forEach(([hz, g]) => {
        const osc = ac.createOscillator();
        const gn  = ac.createGain();
        osc.type  = "sine";
        osc.frequency.value = hz;
        gn.gain.setValueAtTime(0, ac.currentTime);
        gn.gain.linearRampToValueAtTime(g, ac.currentTime + 3);
        osc.connect(gn); gn.connect(ac.destination);
        osc.start();
      });
    }

    function ensureAC() {
      if (!acRef.current) {
        acRef.current = new AudioContext();
        startAmbient(acRef.current);
      }
    }

    // ── drawing ────────────────────────────────────────────────────────────────
    function drawFace(gc: CanvasRenderingContext2D, ts: number) {
      const { cx, cy, hR, eR, nR, mR, lx, ly, rx, ry, nx, ny, my } = geom();

      // Head circle
      const hp = 1 + 0.035 * Math.sin(ts * 0.0015);
      gc.beginPath();
      gc.arc(cx, cy, hR * hp, 0, Math.PI * 2);
      gc.fillStyle = active[HEAD] ? `${COLS[HEAD]}18` : `${COLS[HEAD]}09`;
      gc.shadowColor = GLWS[HEAD];
      gc.shadowBlur  = active[HEAD] ? 30 : 0;
      gc.fill(); gc.shadowBlur = 0;

      gc.beginPath();
      gc.arc(cx, cy, hR * hp, 0, Math.PI * 2);
      gc.strokeStyle = active[HEAD] ? `${COLS[HEAD]}cc` : `${COLS[HEAD]}44`;
      gc.lineWidth   = 3.5;
      gc.shadowColor = GLWS[HEAD];
      gc.shadowBlur  = active[HEAD] ? 22 : 8;
      gc.stroke(); gc.shadowBlur = 0;

      // Left eye — gentle blink when active
      const lbT = active[LEYE]
        ? Math.max(0.22, Math.abs(Math.sin(ts * 0.0025)))
        : 1.0;
      gc.beginPath();
      gc.ellipse(lx, ly, eR, eR * lbT, 0, 0, Math.PI * 2);
      gc.fillStyle   = active[LEYE] ? COLS[LEYE] : `${COLS[LEYE]}44`;
      gc.shadowColor = GLWS[LEYE];
      gc.shadowBlur  = active[LEYE] ? 18 : 5;
      gc.fill(); gc.shadowBlur = 0;

      // Right eye — independent blink rhythm
      const rbT = active[REYE]
        ? Math.max(0.22, Math.abs(Math.sin(ts * 0.0020 + 1.1)))
        : 1.0;
      gc.beginPath();
      gc.ellipse(rx, ry, eR, eR * rbT, 0, 0, Math.PI * 2);
      gc.fillStyle   = active[REYE] ? COLS[REYE] : `${COLS[REYE]}44`;
      gc.shadowColor = GLWS[REYE];
      gc.shadowBlur  = active[REYE] ? 18 : 5;
      gc.fill(); gc.shadowBlur = 0;

      // Nose — bounce to beat
      const np = active[NOSE]
        ? 1 + 0.18 * Math.abs(Math.sin(ts * (Math.PI * 2 / 600)))
        : 1.0;
      gc.beginPath();
      gc.arc(nx, ny, nR * np, 0, Math.PI * 2);
      gc.fillStyle   = active[NOSE] ? COLS[NOSE] : `${COLS[NOSE]}44`;
      gc.shadowColor = GLWS[NOSE];
      gc.shadowBlur  = active[NOSE] ? 15 : 4;
      gc.fill(); gc.shadowBlur = 0;

      // Mouth arc — open slightly while singing
      const mOpen = active[MOUTH]
        ? 0.16 + 0.12 * Math.abs(Math.sin(ts * (Math.PI / 500)))
        : 0;
      gc.beginPath();
      gc.arc(cx, my - mR * mOpen * 0.35, mR, Math.PI * 0.14, Math.PI * 0.86);
      gc.strokeStyle = active[MOUTH] ? `${COLS[MOUTH]}ee` : `${COLS[MOUTH]}55`;
      gc.lineWidth   = 5;
      gc.lineCap     = "round";
      gc.shadowColor = GLWS[MOUTH];
      gc.shadowBlur  = active[MOUTH] ? 18 : 5;
      gc.stroke(); gc.shadowBlur = 0;

      // Celebration text
      if (ts < celebrateUntil) {
        const a = Math.max(0, Math.min(1, (celebrateUntil - ts) / 400));
        gc.font      = `bold ${Math.round(hR * 0.32)}px sans-serif`;
        gc.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        gc.textAlign = "center";
        gc.fillText("La la la! ✨", cx, cy - hR * 1.22);
      }
    }

    function tickSparks(gc: CanvasRenderingContext2D) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        gc.beginPath();
        gc.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        const hex = Math.round(s.alpha * 255).toString(16).padStart(2, "0");
        gc.fillStyle = s.col + hex;
        gc.fill();
        s.x += s.vx; s.y += s.vy; s.vy += 0.11; s.alpha -= 0.022;
        if (s.alpha <= 0) sparks.splice(i, 1);
      }
    }

    function emitSparks(x: number, y: number, n: number, col: string) {
      for (let i = 0; i < n; i++) {
        const a  = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        const sp = 1.4 + Math.random() * 2.8;
        sparks.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
          r: 2 + Math.random() * 2.5,
          alpha: 1,
          col,
        });
      }
    }

    const animate = (ts: number) => {
      rafRef.current = requestAnimationFrame(animate);
      const gc = canvas.getContext("2d");
      if (!gc) return;
      gc.setTransform(dpr, 0, 0, dpr, 0, 0);
      gc.fillStyle = "#050010";
      gc.fillRect(0, 0, W, H);
      drawFace(gc, ts);
      tickSparks(gc);

      const ha = Math.max(0, Math.min(1, (9000 - ts) / 3000));
      if (ha > 0) {
        gc.font      = "15px sans-serif";
        gc.fillStyle = `rgba(255,255,255,${(ha * 0.48).toFixed(2)})`;
        gc.textAlign = "center";
        gc.fillText("Tap the face to make it sing! ✦", W / 2, H - 28);
      }
    };

    // ── pointer events ─────────────────────────────────────────────────────────
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      ensureAC();
      const rect = canvas.getBoundingClientRect();
      const px   = e.clientX - rect.left;
      const py   = e.clientY - rect.top;
      const { cx, cy, hR, eR, nR, mR, lx, ly, rx, ry, nx, ny, my } = geom();

      const d2 = (ax: number, ay: number, bx: number, by: number) =>
        (ax - bx) ** 2 + (ay - by) ** 2;
      const HE = Math.max(32, eR * 2.2);
      const HN = Math.max(32, nR * 2.6);

      let hit = -1;
      if      (d2(px, py, lx, ly) < HE * HE) hit = LEYE;
      else if (d2(px, py, rx, ry) < HE * HE) hit = REYE;
      else if (d2(px, py, nx, ny) < HN * HN) hit = NOSE;
      else if (Math.abs(py - my) < 52 && Math.abs(px - cx) < mR * 0.88) hit = MOUTH;
      else if (d2(px, py, cx, cy) < (hR * 1.10) ** 2) hit = HEAD;

      if (hit < 0) return;

      if (active[hit]) {
        stopPart(hit);
        emitSparks(px, py, 8, COLS[hit]);
      } else {
        startPart(hit);
        emitSparks(px, py, 18, COLS[hit]);
        if (active.every(v => v)) {
          celebrateUntil = performance.now() + 2400;
          emitSparks(cx, cy, 36, "#ffffff");
        }
      }
    };
    canvas.addEventListener("pointerdown", onPointer);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointer);
      if (eyeTimerL !== null) clearInterval(eyeTimerL);
      if (eyeTimerR !== null) clearInterval(eyeTimerR);
      if (noseTimer !== null) clearInterval(noseTimer);
      if (mouthTmr  !== null) clearInterval(mouthTmr);
      acRef.current?.close();
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#050010] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
      />
      <div className="absolute top-0 left-0 right-0 p-4 text-center pointer-events-none">
        <h1 className="text-2xl font-bold text-white/95">Face Song</h1>
        <p className="text-base text-white/75 mt-1">
          Tap each part of the face to make it sing ✦
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
