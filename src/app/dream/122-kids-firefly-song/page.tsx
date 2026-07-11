"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// C-major pentatonic, 2 octaves: C3 → A4
const PENTA_HZ  = [130.81, 164.81, 196.0, 220.0, 261.63, 329.63, 392.0, 440.0];
const PENTA_HUE = [270, 235, 195, 155, 115, 75, 35, 355]; // hsl hues: violet → rose

const NUM_FF  = 10;  // target firefly count
const CATCH_R = 72;  // catch radius in CSS px (generous for 4yo)
const TRAIL   = 12;  // trail dot count

interface FF {
  id:       number;
  x:        number;
  y:        number;
  angle:    number;           // travel direction (radians)
  pitchIdx: number;
  trail:    { x: number; y: number }[];
  caughtBy: number | null;   // active pointerId or null
  phase:    number;           // drives visual pulse + drift variation
}

let _nid = 0;

function spawnFF(W: number, H: number, pitchIdx?: number): FF {
  const pad = 60;
  return {
    id:       ++_nid,
    x:        pad + Math.random() * (W - pad * 2),
    y:        pad + Math.random() * (H - pad * 2),
    angle:    Math.random() * Math.PI * 2,
    pitchIdx: pitchIdx ?? Math.floor(Math.random() * PENTA_HZ.length),
    trail:    [],
    caughtBy: null,
    phase:    Math.random() * Math.PI * 2,
  };
}

export default function KidsFireflySong() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const acRef     = useRef<AudioContext | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !started) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ac = acRef.current;
    if (!ac) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 3);
    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;

    const resize = () => {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Ambient pad: C3 + E3 + G3
    const ambGain = ac.createGain();
    ambGain.gain.value = 0.016;
    ambGain.connect(ac.destination);
    const ambFreqs = [130.81, 164.81, 196.0];
    const ambOscs = ambFreqs.map(hz => {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = hz;
      o.connect(ambGain);
      o.start();
      return o;
    });

    // Fireflies — one per pitch index on startup
    const ffs: FF[] = Array.from({ length: NUM_FF }, (_, i) =>
      spawnFF(W, H, i % PENTA_HZ.length)
    );

    // Sustained oscillators for caught fireflies (key = ff.id)
    const oscs = new Map<number, { osc: OscillatorNode; gn: GainNode }>();

    const startTone = (ff: FF) => {
      const gn = ac.createGain();
      gn.gain.setValueAtTime(0, ac.currentTime);
      gn.gain.linearRampToValueAtTime(0.22, ac.currentTime + 0.04);
      gn.connect(ac.destination);
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = PENTA_HZ[ff.pitchIdx];
      osc.connect(gn);
      osc.start();
      oscs.set(ff.id, { osc, gn });
    };

    const stopTone = (ffId: number) => {
      const node = oscs.get(ffId);
      if (!node) return;
      const t = ac.currentTime;
      node.gn.gain.cancelScheduledValues(t);
      node.gn.gain.setValueAtTime(node.gn.gain.value, t);
      node.gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      node.osc.stop(t + 0.4);
      oscs.delete(ffId);
    };

    const pluckNote = (hz: number) => {
      const gn = ac.createGain();
      const t = ac.currentTime;
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      gn.connect(ac.destination);
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      osc.connect(gn);
      osc.start(t);
      osc.stop(t + 0.55);
    };

    // Pointer tracking in CSS px
    const ptrs = new Map<number, { x: number; y: number }>();

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      ptrs.set(e.pointerId, { x: px, y: py });

      // Nearest uncaught firefly within catch radius
      let best: FF | null = null;
      let bestD = CATCH_R;
      for (const ff of ffs) {
        if (ff.caughtBy !== null) continue;
        const d = Math.hypot(ff.x - px, ff.y - py);
        if (d < bestD) { best = ff; bestD = d; }
      }

      if (best) {
        best.caughtBy = e.pointerId;
        startTone(best);
      } else {
        // Missed: pluck a random note and optionally spawn a new firefly nearby
        const pIdx = Math.floor(Math.random() * PENTA_HZ.length);
        pluckNote(PENTA_HZ[pIdx]);
        if (ffs.length < NUM_FF + 3) {
          const nf = spawnFF(W, H, pIdx);
          nf.x = Math.max(30, Math.min(W - 30, px + (Math.random() - 0.5) * 60));
          nf.y = Math.max(30, Math.min(H - 30, py + (Math.random() - 0.5) * 60));
          ffs.push(nf);
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ptrs.set(e.pointerId, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    const onRelease = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      for (const ff of ffs) {
        if (ff.caughtBy === e.pointerId) {
          ff.caughtBy = null;
          stopTone(ff.id);
          // Scatter in a new random direction
          ff.angle += (Math.random() - 0.5) * Math.PI;
        }
      }
    };

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onRelease);
    canvas.addEventListener("pointercancel", onRelease);
    canvas.style.touchAction = "none";

    let raf = 0;
    let frame = 0;
    const SPEED = 1.0; // CSS px per frame

    const tick = () => {
      raf = requestAnimationFrame(tick);
      frame++;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      const PAD = 38;

      for (const ff of ffs) {
        const caughtBy = ff.caughtBy;

        if (caughtBy !== null) {
          // Follow the catching pointer with spring lag
          const p = ptrs.get(caughtBy);
          if (p) {
            ff.x += (p.x - ff.x) * 0.13;
            ff.y += (p.y - ff.y) * 0.13;
          }
        } else {
          // Lissajous-like drift: slowly rotating direction vector
          ff.angle += 0.013 + Math.sin(ff.phase * 0.11) * 0.005;
          ff.x += Math.cos(ff.angle) * SPEED;
          ff.y += Math.sin(ff.angle) * SPEED;

          // Mild repulsion from active pointers
          for (const [, p] of ptrs) {
            const dx = ff.x - p.x;
            const dy = ff.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d > 0 && d < 52) {
              ff.x += (dx / d) * 1.6;
              ff.y += (dy / d) * 1.6;
            }
          }

          // Reflect off walls
          if (ff.x < PAD) {
            ff.x = PAD;
            if (Math.cos(ff.angle) < 0)
              ff.angle = Math.atan2(Math.sin(ff.angle), -Math.cos(ff.angle));
          } else if (ff.x > W - PAD) {
            ff.x = W - PAD;
            if (Math.cos(ff.angle) > 0)
              ff.angle = Math.atan2(Math.sin(ff.angle), -Math.cos(ff.angle));
          }
          if (ff.y < PAD) {
            ff.y = PAD;
            if (Math.sin(ff.angle) < 0)
              ff.angle = Math.atan2(-Math.sin(ff.angle), Math.cos(ff.angle));
          } else if (ff.y > H - PAD) {
            ff.y = H - PAD;
            if (Math.sin(ff.angle) > 0)
              ff.angle = Math.atan2(-Math.sin(ff.angle), Math.cos(ff.angle));
          }
        }

        // Trail (updated every 2 frames)
        if (frame % 2 === 0) {
          ff.trail.push({ x: ff.x, y: ff.y });
          if (ff.trail.length > TRAIL) ff.trail.shift();
        }
        ff.phase += caughtBy !== null ? 0.12 : 0.038;

        const hue = PENTA_HUE[ff.pitchIdx];
        const pulse = 0.5 + 0.5 * Math.sin(ff.phase);
        const isCaught = caughtBy !== null;
        const baseR = isCaught ? 11 : 7;
        const glowR = baseR * (1 + 0.35 * pulse);

        // Comet trail
        for (let i = 0; i < ff.trail.length; i++) {
          const tp = ff.trail[i];
          const a = (i / ff.trail.length) * 0.55;
          const r = Math.max(1, glowR * (i / ff.trail.length) * 0.65);
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue},100%,65%,${a})`;
          ctx.fill();
        }

        // Outer glow halo
        const outerR = glowR * 5;
        const grad = ctx.createRadialGradient(ff.x, ff.y, 0, ff.x, ff.y, outerR);
        grad.addColorStop(0,   `hsla(${hue},100%,95%,${isCaught ? 1 : 0.9})`);
        grad.addColorStop(0.3, `hsla(${hue},100%,70%,${isCaught ? 0.75 : 0.5})`);
        grad.addColorStop(1,   `hsla(${hue},90%,50%,0)`);
        ctx.beginPath();
        ctx.arc(ff.x, ff.y, outerR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Bright white core
        ctx.beginPath();
        ctx.arc(ff.x, ff.y, Math.max(1, glowR * 0.38), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue},40%,99%,1)`;
        ctx.fill();
      }

      // Maintain firefly count
      if (frame % 180 === 0 && ffs.length < NUM_FF) {
        ffs.push(spawnFF(W, H));
      }
      if (ffs.length > NUM_FF + 4 && frame % 240 === 0) {
        const idx = ffs.findIndex(f => f.caughtBy === null);
        if (idx >= 0) ffs.splice(idx, 1);
      }
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onRelease);
      canvas.removeEventListener("pointercancel", onRelease);
      ambOscs.forEach(o => { try { o.stop(); } catch (_) {} });
      for (const id of [...oscs.keys()]) {
        try { stopTone(id); } catch (_) {}
      }
    };
  }, [started]);

  const handleStart = () => {
    if (acRef.current) return;
    const ac = new AudioContext();
    void ac.resume();
    acRef.current = ac;
    setStarted(true);
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-black text-foreground px-4 py-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold mb-2 text-foreground">Firefly Song</h1>
        <p className="text-base text-muted-foreground mb-2">
          Touch a firefly to catch it — it follows your finger and sings its note.
          Let go and it drifts away.
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          Catch two or three at once to make a chord. No microphone needed.
        </p>

        {!started ? (
          <>
            <div className="flex gap-2 justify-center my-6">
              {PENTA_HUE.map((h, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-full"
                  style={{
                    background: `hsl(${h},100%,65%)`,
                    boxShadow: `0 0 8px hsl(${h},100%,60%)`,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-center">
              <button
                onClick={handleStart}
                className="bg-violet-400/20 border border-violet-300/50 text-violet-200/95 text-xl font-semibold px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] active:scale-95 transition-transform"
              >
                ✨ Begin
              </button>
            </div>
          </>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full rounded-2xl"
            style={{ height: "68vh", display: "block", background: "#000" }}
          />
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>For kids (4+) · no mic · touch to catch · multi-touch OK</span>
          <Link href="/dream" className="underline">
            ← dream lab
          </Link>
        </div>
      </div>
    </main>
  );
}
