"use client";
import { useEffect, useRef, useState } from "react";

// 5 rhythmic patterns: true = active beat (light up + sound), false = rest
const PATTERNS: boolean[][] = [
  [true,  true,  true,  true],   // 1 2 3 4  — learn the tempo first
  [true,  true,  false, true],   // 1 2 . 4  — skip beat 3
  [true,  false, true,  true],   // 1 . 3 4  — skip beat 2
  [true,  true,  true,  false],  // 1 2 3 .  — skip beat 4
  [false, true,  false, true],   // . 2 . 4  — backbeat only
];

const BPM       = 80;
const BEAT_MS   = (60 / BPM) * 1000;    // 750 ms / beat
const ON_WIN_MS = BEAT_MS * 0.22;       // ±165 ms "on beat" window

// C4, E4, G4, A4 (pentatonic, all consonant with the ambient C3/G3 pad)
const NOTES_HZ  = [261.63, 329.63, 392.0, 440.0];

interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  color: string; r: number;
}

export default function KidsClapBackPage() {
  const [started, setStarted] = useState(false);
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const acRef  = useRef<AudioContext | null>(null);

  function handleStart() {
    const ac = new AudioContext();
    acRef.current = ac;
    // Soft ambient pad — C3 + G3, barely audible heartbeat
    ([[130.81, 0.013], [196.0, 0.009]] as [number, number][]).forEach(([f, g]) => {
      const osc = ac.createOscillator();
      const gn  = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gn.gain.value = g;
      osc.connect(gn);
      gn.connect(ac.destination);
      osc.start();
    });
    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    const cv = cvRef.current;
    if (!cv) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      cv.width  = cv.offsetWidth  * dpr;
      cv.height = cv.offsetHeight * dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // All mutable animation state in one plain object (no React re-renders)
    const S = {
      phase:      "demo" as "demo" | "wait" | "listen",
      phaseStart: performance.now(),
      prevBeat:   -1,
      patIdx:     0,
      sparks:     [] as Spark[],
    };

    const ac = acRef.current!;

    function playNote(hz: number, vol: number) {
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = hz;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(vol, t + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
      osc.connect(env);
      env.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    }

    function fireSparks(x: number, y: number, big: boolean) {
      const COLORS = ["#c084fc", "#f472b6", "#34d399", "#fbbf24", "#38bdf8", "#a78bfa"];
      const count  = big ? 22 : 9;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = big ? (2.5 + Math.random() * 5.5) : (1 + Math.random() * 2.5);
        S.sparks.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - (big ? 0.7 : 0),
          life:  1,
          decay: big ? 0.016 : 0.030,
          color: COLORS[i % COLORS.length],
          r:     big ? (2.5 + Math.random() * 2) : (1.5 + Math.random() * 1.5),
        });
      }
    }

    let raf = 0;

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      const W  = cv.offsetWidth;
      const H  = cv.offsetHeight;
      const CX = W / 2;
      const CY = H / 2;
      const R  = Math.min(W, H) * 0.27;

      // ── Background ───────────────────────────────────────────────────
      ctx2d.fillStyle = "#07070f";
      ctx2d.fillRect(0, 0, W, H);

      // ── Phase transitions ─────────────────────────────────────────────
      const elapsed  = ts - S.phaseStart;
      const cycleDur = BEAT_MS * 4;

      if (S.phase === "demo" && elapsed >= cycleDur) {
        S.phase = "wait"; S.phaseStart = ts; S.prevBeat = -1;
      } else if (S.phase === "wait" && elapsed >= BEAT_MS * 1.5) {
        S.phase = "listen"; S.phaseStart = ts; S.prevBeat = -1;
      } else if (S.phase === "listen" && elapsed >= cycleDur) {
        S.patIdx++;
        S.phase = "demo"; S.phaseStart = ts; S.prevBeat = -1;
      }

      // ── Current beat index ────────────────────────────────────────────
      const beatIdx  = S.phase === "wait"
        ? -1
        : Math.min(3, Math.floor((ts - S.phaseStart) / BEAT_MS));
      const pat      = PATTERNS[S.patIdx % PATTERNS.length];

      // Fire demo note on beat change
      if (S.phase === "demo" && beatIdx >= 0 && beatIdx !== S.prevBeat) {
        S.prevBeat = beatIdx;
        if (pat[beatIdx]) playNote(NOTES_HZ[beatIdx], 0.36);
      }
      if (S.phase === "listen" && beatIdx >= 0 && beatIdx !== S.prevBeat) {
        S.prevBeat = beatIdx;
        // intentionally silent — child provides the sounds by tapping
      }

      // ── Onset pulse strength (decays from 1→0 within first 38% of beat) ──
      const beatElapsed = beatIdx >= 0
        ? (ts - S.phaseStart) - beatIdx * BEAT_MS
        : 0;
      const onset = Math.max(0, 1 - beatElapsed / (BEAT_MS * 0.38));

      // ── Main circle ───────────────────────────────────────────────────
      let circleCol: string;
      let circleAlpha: number;
      let glowPx: number;

      if (S.phase === "demo") {
        const active = beatIdx >= 0 && pat[beatIdx];
        circleCol   = "#c084fc";
        circleAlpha = active ? (0.6 + 0.32 * onset) : 0.22;
        glowPx      = active ? (52 + 22 * onset) : 10;
      } else if (S.phase === "wait") {
        const wp    = (Math.sin(ts * 0.0055) + 1) / 2;
        circleCol   = "#34d399";
        circleAlpha = 0.42 + 0.32 * wp;
        glowPx      = 26 + 18 * wp;
      } else {
        // listen phase
        const active = beatIdx >= 0 && pat[beatIdx];
        circleCol   = "#38bdf8";
        circleAlpha = active ? (0.42 + 0.22 * onset) : 0.16;
        glowPx      = active ? (28 + 14 * onset) : 6;
      }

      const pulseR = R * (1 + 0.065 * onset);

      ctx2d.save();
      ctx2d.shadowBlur  = glowPx;
      ctx2d.shadowColor = circleCol;
      ctx2d.globalAlpha = circleAlpha;
      ctx2d.beginPath();
      ctx2d.arc(CX, CY, pulseR, 0, Math.PI * 2);
      ctx2d.strokeStyle = circleCol;
      ctx2d.lineWidth   = 5;
      ctx2d.stroke();
      ctx2d.fillStyle   = circleCol + "18";
      ctx2d.fill();
      ctx2d.restore();

      // ── Beat indicator dots ───────────────────────────────────────────
      const dotY   = CY + R + 58;
      const dotGap = Math.min(58, W / 7);

      for (let i = 0; i < 4; i++) {
        const dx      = CX + (i - 1.5) * dotGap;
        const isCurr  = S.phase !== "wait" && beatIdx === i;
        const isActive = pat[i];
        const dotR    = isCurr ? 13 : 9;

        ctx2d.save();
        ctx2d.beginPath();
        ctx2d.arc(dx, dotY, dotR, 0, Math.PI * 2);

        if (S.phase === "demo") {
          ctx2d.fillStyle  = isActive
            ? (isCurr ? "#c084fc" : "#c084fc66")
            : "#232340";
          ctx2d.shadowBlur  = isCurr && isActive ? 14 : 0;
          ctx2d.shadowColor = "#c084fc";
        } else if (S.phase === "wait") {
          ctx2d.fillStyle  = isActive ? "#34d39944" : "#1a1a33";
          ctx2d.shadowBlur = 0;
        } else {
          ctx2d.fillStyle  = isActive
            ? (isCurr ? "#38bdf8" : "#38bdf866")
            : "#1a1a33";
          ctx2d.shadowBlur  = isCurr && isActive ? 14 : 0;
          ctx2d.shadowColor = "#38bdf8";
        }
        ctx2d.fill();
        ctx2d.restore();
      }

      // ── Phase label ───────────────────────────────────────────────────
      const labelFS = Math.max(18, Math.min(24, W * 0.055));
      let labelText: string;
      let labelCol: string;
      if (S.phase === "demo") {
        labelText = "👀  watch";
        labelCol  = "#c084fc";
      } else if (S.phase === "wait") {
        labelText = "✨  your turn!";
        labelCol  = "#34d399";
      } else {
        labelText = "👆  tap it!";
        labelCol  = "#38bdf8";
      }

      ctx2d.save();
      ctx2d.font         = `bold ${labelFS}px monospace`;
      ctx2d.textAlign    = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillStyle    = labelCol;
      ctx2d.shadowBlur   = 10;
      ctx2d.shadowColor  = labelCol;
      ctx2d.fillText(labelText, CX, CY - R - 50);
      ctx2d.restore();

      // ── Sparks ────────────────────────────────────────────────────────
      S.sparks = S.sparks.filter(sp => sp.life > 0);
      for (const sp of S.sparks) {
        sp.x  += sp.vx;
        sp.y  += sp.vy;
        sp.vy += 0.1;
        sp.life -= sp.decay;
        if (sp.life <= 0) continue;
        ctx2d.save();
        ctx2d.globalAlpha = Math.max(0, sp.life);
        ctx2d.shadowBlur  = 7;
        ctx2d.shadowColor = sp.color;
        ctx2d.fillStyle   = sp.color;
        ctx2d.beginPath();
        ctx2d.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.restore();
      }
    };

    raf = requestAnimationFrame(frame);

    // ── Tap handler ───────────────────────────────────────────────────────
    const onTap = (e: PointerEvent) => {
      e.preventDefault();
      if (ac.state === "suspended") void ac.resume();
      if (S.phase !== "listen") return;

      const nowMs  = performance.now();
      const elap   = nowMs - S.phaseStart;
      const beat   = Math.min(3, Math.floor(elap / BEAT_MS));
      const offset = elap - beat * BEAT_MS;
      const curPat = PATTERNS[S.patIdx % PATTERNS.length];

      const onBeat = offset < ON_WIN_MS || offset > BEAT_MS - ON_WIN_MS;
      const big    = onBeat && curPat[beat];

      fireSparks(e.clientX, e.clientY, big);
      playNote(NOTES_HZ[beat], big ? 0.40 : 0.12);
    };

    cv.addEventListener("pointerdown", onTap, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      cv.removeEventListener("pointerdown", onTap);
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#07070f] text-foreground gap-6 px-6 text-center select-none">
        <div className="text-5xl mb-1">🥁</div>
        <h1 className="text-3xl font-bold text-violet-300 font-mono">Clap Back</h1>
        <p className="text-base text-muted-foreground max-w-xs leading-relaxed">
          Watch the glowing circle tap out a beat.
          <br />
          When it turns green — tap it back!
        </p>
        <button
          onClick={handleStart}
          className="mt-2 bg-violet-600 hover:bg-violet-500 active:scale-95 transition-transform text-foreground text-xl font-bold px-8 py-4 rounded-2xl min-h-[60px] min-w-[180px]"
        >
          Let&apos;s Play! 🎵
        </button>
        <p className="text-xs text-muted-foreground">For kids 4+ · No mic needed · Zero permissions</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full bg-[#07070f] overflow-hidden select-none">
      <canvas ref={cvRef} className="w-full h-full touch-none" />
      <a
        href="README.md"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-4 right-4 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        design notes
      </a>
    </div>
  );
}
