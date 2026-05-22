"use client";

import { useEffect, useRef, useState } from "react";

// **For**: kids (4+)

// C-major pentatonic — always sounds good, no wrong notes
const NOTES = [
  { freq: 261.63, color: "#E63946" }, // C4 red
  { freq: 293.66, color: "#F4A261" }, // D4 orange
  { freq: 329.63, color: "#E9C46A" }, // E4 yellow
  { freq: 392.00, color: "#2ABFA8" }, // G4 teal
  { freq: 440.00, color: "#4A90D9" }, // A4 blue
  { freq: 523.25, color: "#A855C8" }, // C5 purple
  { freq: 587.33, color: "#F07830" }, // D5 deep orange
] as const;

const PAD_FREQS = [130.81, 164.81, 196.0] as const; // C3 E3 G3 ambient pad
const BASKET_W = 130;
const DROP_R = 28;
const MIN_REPLAY = 5;

interface Drop {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  noteIdx: number;
  burst: boolean;
  burstR: number;
  alpha: number;
}

type Phase = "idle" | "playing";

export default function KidsTiltRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);

  // All game state in refs — avoids stale closures in RAF loop
  const wRef = useRef(0);
  const hRef = useRef(0);
  const dropsRef = useRef<Drop[]>([]);
  const basketXRef = useRef(200);
  const gammaRef = useRef(0); // smoothed DeviceOrientation gamma (left-right tilt)
  const hasOrientRef = useRef(false);
  const dropIdRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const spawnMsRef = useRef(1350); // ms between spawns, decreases over time
  const caughtRef = useRef<number[]>([]); // sequence of caught note indices
  const rafRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const replayingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [caughtCount, setCaughtCount] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);

  // ─── Audio ───────────────────────────────────────────────────────────────

  function bootAudio(): AudioContext {
    if (!actxRef.current) {
      const actx = new AudioContext();
      actxRef.current = actx;
      const master = actx.createGain();
      master.gain.value = 0.032;
      master.connect(actx.destination);
      // Soft C-major triad pad — makes the app feel "alive" when silent
      PAD_FREQS.forEach((freq, i) => {
        const osc = actx.createOscillator();
        const g = actx.createGain();
        const lfo = actx.createOscillator();
        const lg = actx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        lfo.frequency.value = 0.08 + i * 0.025;
        lg.gain.value = 0.07;
        lfo.connect(lg);
        lg.connect(g.gain);
        osc.connect(g);
        g.connect(master);
        osc.start();
        lfo.start();
      });
    }
    if (actxRef.current.state === "suspended") void actxRef.current.resume();
    return actxRef.current;
  }

  function playNote(noteIdx: number, vel = 0.52) {
    const actx = actxRef.current;
    if (!actx) return;
    const freq = NOTES[noteIdx].freq;
    const t = actx.currentTime;
    const env = actx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.014);
    env.gain.setValueAtTime(vel, t + 0.08);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.88);
    env.connect(actx.destination);
    const o1 = actx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;
    o1.connect(env);
    o1.start(t);
    o1.stop(t + 0.93);
    const g2 = actx.createGain();
    g2.gain.value = 0.18;
    const o2 = actx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    o2.connect(g2);
    g2.connect(env);
    o2.start(t);
    o2.stop(t + 0.93);
  }

  // ─── Game helpers ─────────────────────────────────────────────────────────

  function spawnDrop() {
    const W = wRef.current;
    const noteIdx = Math.floor(Math.random() * NOTES.length);
    dropsRef.current.push({
      id: dropIdRef.current++,
      x: DROP_R + 12 + Math.random() * (W - DROP_R * 2 - 24),
      y: -DROP_R,
      vx: (Math.random() - 0.5) * 0.9,
      vy: 2.1 + Math.random() * 1.1,
      noteIdx,
      burst: false,
      burstR: DROP_R,
      alpha: 1,
    });
  }

  // ─── Render / game loop ────────────────────────────────────────────────────

  function renderFrame(ts: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = wRef.current;
    const H = hRef.current;

    // Move basket toward tilt target (smooth follow)
    if (hasOrientRef.current) {
      const g = Math.max(-50, Math.min(50, gammaRef.current));
      const targetX = W / 2 + (g / 50) * (W / 2 - BASKET_W / 2 - 16);
      basketXRef.current += (targetX - basketXRef.current) * 0.16;
    }
    basketXRef.current = Math.max(
      BASKET_W / 2 + 6,
      Math.min(W - BASKET_W / 2 - 6, basketXRef.current)
    );

    // Spawn new drop
    if (ts - lastSpawnRef.current > spawnMsRef.current) {
      spawnDrop();
      lastSpawnRef.current = ts;
      spawnMsRef.current = Math.max(680, spawnMsRef.current - 5);
    }

    const bx = basketXRef.current;
    const basketTop = H - 88;

    // Physics + catch detection
    const alive: Drop[] = [];
    for (const d of dropsRef.current) {
      if (!d.burst) {
        d.x += d.vx;
        d.y += d.vy;
        d.vy += 0.045; // gravity
        // Catch
        if (
          d.y + DROP_R >= basketTop &&
          d.y <= basketTop + 52 &&
          Math.abs(d.x - bx) < BASKET_W / 2 + 5
        ) {
          d.burst = true;
          d.burstR = DROP_R;
          d.alpha = 1;
          playNote(d.noteIdx);
          caughtRef.current.push(d.noteIdx);
          setCaughtCount(caughtRef.current.length);
        }
        // Off-screen
        if (
          d.y > H + DROP_R ||
          d.x < -DROP_R * 2 ||
          d.x > W + DROP_R * 2
        ) {
          continue;
        }
      } else {
        d.burstR += 3.8;
        d.alpha -= 0.055;
        if (d.alpha <= 0) continue;
      }
      alive.push(d);
    }
    dropsRef.current = alive;

    // ── Draw ──────────────────────────────────────────────────────────────

    ctx.clearRect(0, 0, W, H);

    // Night-sky gradient background
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#06051a");
    sky.addColorStop(1, "#0e0b2a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Deterministic stars (golden-ratio spiral, no per-frame allocation)
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let i = 0; i < 38; i++) {
      const sx = ((i * 0.6180339887) % 1) * W;
      const sy = ((i * 0.3819660112) % 1) * (H * 0.55);
      ctx.beginPath();
      ctx.arc(sx, sy, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drops
    for (const d of dropsRef.current) {
      const col = NOTES[d.noteIdx].color;
      if (!d.burst) {
        ctx.save();
        // Soft glow halo
        const glow = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, DROP_R * 2.4);
        glow.addColorStop(0, col + "99");
        glow.addColorStop(1, col + "00");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(d.x, d.y, DROP_R * 2.4, 0, Math.PI * 2);
        ctx.fill();
        // Solid body
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(d.x, d.y, DROP_R, 0, Math.PI * 2);
        ctx.fill();
        // Highlight sheen
        ctx.fillStyle = "rgba(255,255,255,0.42)";
        ctx.beginPath();
        ctx.arc(
          d.x - DROP_R * 0.3,
          d.y - DROP_R * 0.3,
          DROP_R * 0.38,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      } else {
        // Burst rings
        ctx.save();
        ctx.globalAlpha = Math.max(0, d.alpha);
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.burstR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.max(0, d.alpha * 0.45);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.burstR * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Basket arc — glowing bowl
    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(255,255,255,0.35)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(bx - BASKET_W / 2, basketTop);
    ctx.quadraticCurveTo(bx, basketTop + 54, bx + BASKET_W / 2, basketTop);
    ctx.stroke();
    // Wider, dimmer backing stroke for presence
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(bx - BASKET_W / 2, basketTop);
    ctx.quadraticCurveTo(bx, basketTop + 54, bx + BASKET_W / 2, basketTop);
    ctx.stroke();
    ctx.restore();

    // Score display
    const count = caughtRef.current.length;
    if (count > 0) {
      ctx.save();
      ctx.font = "bold 26px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.textAlign = "center";
      ctx.fillText(`♪ ${count}`, W / 2, 58);
      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }

  // ─── Start ────────────────────────────────────────────────────────────────

  async function startGame() {
    bootAudio();

    // iOS 13+ requires explicit permission for DeviceOrientationEvent
    type DOEType = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<PermissionState>;
    };
    const DOE = DeviceOrientationEvent as DOEType;
    if (typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        hasOrientRef.current = result === "granted";
      } catch {
        hasOrientRef.current = false;
      }
    }
    // Android / Chrome: hasOrientRef flips on first event (see useEffect)

    const canvas = canvasRef.current;
    if (!canvas) return;
    basketXRef.current = wRef.current / 2;
    lastSpawnRef.current = performance.now();
    phaseRef.current = "playing";
    setPhase("playing");
    rafRef.current = requestAnimationFrame(renderFrame);
  }

  // ─── Replay melody ────────────────────────────────────────────────────────

  async function replayMelody() {
    if (replayingRef.current || !actxRef.current) return;
    replayingRef.current = true;
    setIsReplaying(true);
    const notes = [...caughtRef.current];
    for (let i = 0; i < notes.length; i++) {
      playNote(notes[i], 0.46);
      await new Promise<void>((res) => setTimeout(res, 315));
    }
    replayingRef.current = false;
    setIsReplaying(false);
  }

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      wRef.current = canvas.offsetWidth;
      hRef.current = canvas.offsetHeight;
      canvas.width = wRef.current * dpr;
      canvas.height = hRef.current * dpr;
      canvas.style.width = `${wRef.current}px`;
      canvas.style.height = `${hRef.current}px`;
      ctx.scale(dpr, dpr);
      if (phaseRef.current === "idle") {
        basketXRef.current = wRef.current / 2;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      hasOrientRef.current = true;
      gammaRef.current = gammaRef.current * 0.82 + e.gamma * 0.18;
    };
    window.addEventListener("deviceorientation", onOrientation);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("deviceorientation", onOrientation);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ─── Pointer fallback (desktop mouse / direct touch) ─────────────────────

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (phaseRef.current !== "playing") return;
    if (hasOrientRef.current) return; // tilt has priority
    const rect = canvasRef.current!.getBoundingClientRect();
    basketXRef.current = e.clientX - rect.left;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: "calc(100vh - 3rem)", touchAction: "none" }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        onPointerMove={handlePointerMove}
      />

      {/* Start screen */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 px-6">
          <div className="text-center">
            <div className="text-6xl mb-4">🌈</div>
            <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
              Rain Catcher
            </h1>
            <p className="text-white/80 text-lg leading-relaxed max-w-xs mx-auto">
              Tilt the screen to move the basket.
              <br />
              Catch the drops to make music!
            </p>
          </div>
          <button
            onClick={startGame}
            className="bg-violet-500 hover:bg-violet-400 active:scale-95 text-white font-bold rounded-full text-2xl transition-all shadow-xl shadow-violet-500/30"
            style={{ minWidth: 220, minHeight: 72, padding: "0 2.5rem" }}
          >
            ▶ Start
          </button>
          <p className="text-white/50 text-base text-center">
            Move your mouse to steer on desktop
          </p>
        </div>
      )}

      {/* Replay button — appears after MIN_REPLAY catches */}
      {phase === "playing" && caughtCount >= MIN_REPLAY && (
        <div className="absolute bottom-24 right-5 pointer-events-auto">
          <button
            onClick={replayMelody}
            disabled={isReplaying}
            className="bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold rounded-full text-lg transition-colors shadow-lg"
            style={{ minHeight: 56, padding: "0 1.5rem" }}
          >
            {isReplaying ? "♪ …" : "▶ Replay"}
          </button>
        </div>
      )}
    </div>
  );
}
