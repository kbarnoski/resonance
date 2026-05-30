"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap a glowing circle to add its voice. Tap again to remove it. Build a whole band!

// ── audio constants ─────────────────────────────────────────────
const BPM  = 80;
const BEAT = 60 / BPM;   // 0.75 s per beat
const LDUR = 4 * BEAT;   // 3.0 s per loop (4 beats)
const LOOK = 0.12;       // look-ahead scheduling window (s)

// [beatOffset, durationBeats, hz]
type Nv = readonly [number, number, number];

// Phase-locked loop patterns — all 4 beats long
const PAT: Nv[][] = [
  // 0 · Bass (C3 130 Hz) — two warm heartbeat pulses
  [[0, 1.75, 130.81], [2, 1.75, 130.81]],
  // 1 · Mid (C3→E3→G3→E3 arpeggio)
  [[0, 0.55, 130.81], [1, 0.55, 164.81], [2, 0.55, 196.00], [3, 0.55, 164.81]],
  // 2 · Melody (C4 pentatonic rise + fall)
  [[0, 0.33, 261.63], [0.5, 0.33, 329.63], [1, 0.33, 392.00], [1.5, 0.33, 440.00],
   [2, 0.33, 392.00], [2.5, 0.33, 329.63], [3, 0.33, 261.63], [3.5, 0.33, 196.00]],
  // 3 · Rhythm (short triangle clicks on 8th notes — A4 440 Hz, 60 ms each)
  [[0, 0.08, 440], [0.5, 0.08, 440], [1, 0.08, 440], [1.5, 0.08, 440],
   [2, 0.08, 440], [2.5, 0.08, 440], [3, 0.08, 440], [3.5, 0.08, 440]],
  // 4 · Shimmer (C5→E5→G5→C5 high twinkles)
  [[0.5, 0.28, 523.25], [1.5, 0.28, 659.25], [2.5, 0.28, 783.99], [3.5, 0.28, 523.25]],
];

// Peak gain per layer (musical mix balance)
const GAINS = [0.30, 0.22, 0.30, 0.14, 0.13];

// ── visual constants ─────────────────────────────────────────────
// BANDIMAL rule: bigger radius = lower pitch
const LYRS = [
  { xr: 0.28, yr: 0.75, r: 76, hue: 270, name: "Bass"    }, // C3 violet
  { xr: 0.72, yr: 0.75, r: 62, hue: 175, name: "Mid"     }, // G3 teal
  { xr: 0.50, yr: 0.18, r: 50, hue: 190, name: "Melody"  }, // C4 cyan
  { xr: 0.16, yr: 0.47, r: 40, hue:  40, name: "Rhythm"  }, // A4 amber
  { xr: 0.84, yr: 0.47, r: 30, hue:   0, name: "Shimmer" }, // C5 rose
] as const;

// ── types ────────────────────────────────────────────────────────
type Ripple = { cx: number; cy: number; r: number; maxR: number; hue: number; a: number };
type Spark  = { x: number; y: number; vx: number; vy: number; a: number; hue: number };

type St = {
  actx:      AudioContext | null;
  t0:        number;           // actx.currentTime when beat 0 started
  active:    boolean[];        // which layers are on
  scheduled: Set<string>;      // "li_iter_beat" already fired
  glow:      number[];         // per-layer glow intensity [0,1]
  ripples:   Ripple[];
  sparks:    Spark[];
  wallStart: number;           // performance.now() at mount
  allFlash:  number;           // 0→1 flash when all 5 go on simultaneously
};

// ── audio helpers ─────────────────────────────────────────────────
function playNote(
  actx: AudioContext, when: number, hz: number, durS: number, gain: number,
): void {
  const g = actx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.014);
  g.gain.exponentialRampToValueAtTime(0.001, when + Math.max(durS, 0.04));
  g.connect(actx.destination);
  const osc = actx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = hz;
  osc.connect(g);
  osc.start(when);
  osc.stop(when + Math.max(durS, 0.04) + 0.02);
}

function scheduleActive(st: St): void {
  if (!st.actx) return;
  const actx = st.actx;
  const now   = actx.currentTime;
  const iter0 = Math.max(0, Math.floor((now - st.t0) / LDUR) - 1);
  const iter1 = Math.floor((now + LOOK - st.t0) / LDUR) + 1;

  for (let li = 0; li < 5; li++) {
    if (!st.active[li]) continue;
    const pattern = PAT[li];
    for (let it = iter0; it <= iter1; it++) {
      const loopStart = st.t0 + it * LDUR;
      for (const [beat, durB, hz] of pattern) {
        const when = loopStart + beat * BEAT;
        if (when < now - 0.01 || when > now + LOOK) continue;
        const key = `${li}_${it}_${beat}`;
        if (st.scheduled.has(key)) continue;
        playNote(actx, when, hz, durB * BEAT, GAINS[li]);
        st.scheduled.add(key);
      }
    }
  }

  // Prune old keys to avoid memory leak
  if (st.scheduled.size > 300) {
    const cutIter = Math.floor((now - st.t0) / LDUR) - 2;
    for (const k of st.scheduled) {
      if (parseInt(k.split("_")[1]) < cutIter) st.scheduled.delete(k);
    }
  }
}

// ── canvas helpers ────────────────────────────────────────────────
function addSparks(st: St, cx: number, cy: number, hue: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 2.5 + Math.random() * 5;
    st.sparks.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1.5, a: 1, hue });
  }
}

function lyrXY(li: number, W: number, H: number): [number, number] {
  return [LYRS[li].xr * W, LYRS[li].yr * H];
}

// ── component ─────────────────────────────────────────────────────
export default function BandBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<St>({
    actx: null, t0: 0,
    active:    [false, false, false, false, false],
    scheduled: new Set(),
    glow:      [0, 0, 0, 0, 0],
    ripples:   [], sparks: [],
    wallStart: performance.now(),
    allFlash:  0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = stRef.current;
    let rafId = 0;

    // ── resize ──
    const resize = () => {
      const dpr = devicePixelRatio;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    // ── main RAF loop ──
    const draw = (ts: number) => {
      const gc = canvas.getContext("2d");
      if (!gc) { rafId = requestAnimationFrame(draw); return; }
      rafId = requestAnimationFrame(draw);

      const dpr = devicePixelRatio;
      const W   = canvas.offsetWidth;   // CSS px
      const H   = canvas.offsetHeight;

      // Audio scheduling
      scheduleActive(st);

      // Compute beat phase (0→1 per beat) for pulse animation
      let beatPhase = 0;
      if (st.actx) {
        const elapsed = st.actx.currentTime - st.t0;
        beatPhase = (elapsed % BEAT) / BEAT;
      }
      const beatPulse = Math.max(0, 1 - beatPhase * 5); // quick spike each beat

      // Update glow targets
      for (let i = 0; i < 5; i++) {
        const target = st.active[i] ? Math.max(0.55, 0.55 + beatPulse * 0.45) : 0.08;
        st.glow[i] += (target - st.glow[i]) * 0.18;
      }

      // Decay allFlash
      if (st.allFlash > 0) st.allFlash = Math.max(0, st.allFlash - 0.025);

      // ── draw in CSS px (scale to physical) ──
      gc.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      gc.fillStyle = "#06060f";
      gc.fillRect(0, 0, W, H);

      // All-5-on flash
      if (st.allFlash > 0) {
        gc.fillStyle = `rgba(255,255,220,${st.allFlash * 0.12})`;
        gc.fillRect(0, 0, W, H);
      }

      // ── draw connection lines between active layers ──
      const activeLyrs = LYRS.map((_, i) => i).filter(i => st.active[i]);
      if (activeLyrs.length >= 2) {
        for (let ai = 0; ai < activeLyrs.length - 1; ai++) {
          for (let bi = ai + 1; bi < activeLyrs.length; bi++) {
            const i = activeLyrs[ai], j = activeLyrs[bi];
            const [x1, y1] = lyrXY(i, W, H);
            const [x2, y2] = lyrXY(j, W, H);
            const h1 = LYRS[i].hue, h2 = LYRS[j].hue;
            const grad = gc.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, `hsla(${h1},90%,65%,0.12)`);
            grad.addColorStop(1, `hsla(${h2},90%,65%,0.12)`);
            gc.beginPath();
            gc.moveTo(x1, y1);
            gc.lineTo(x2, y2);
            gc.strokeStyle = grad;
            gc.lineWidth = 1.5;
            gc.stroke();
          }
        }
      }

      // ── draw circles ──
      for (let i = 0; i < 5; i++) {
        const L  = LYRS[i];
        const [cx, cy] = lyrXY(i, W, H);
        const g  = st.glow[i];
        const on = st.active[i];
        const hue = L.hue;
        const r  = L.r;

        // Outer glow halo
        const halo = gc.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.2);
        halo.addColorStop(0, `hsla(${hue},90%,65%,${g * 0.5})`);
        halo.addColorStop(1, `hsla(${hue},80%,50%,0)`);
        gc.beginPath();
        gc.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
        gc.fillStyle = halo;
        gc.fill();

        // Circle fill
        gc.beginPath();
        gc.arc(cx, cy, r, 0, Math.PI * 2);
        gc.fillStyle = on
          ? `hsl(${hue},75%,${22 + g * 24}%)`
          : `hsl(${hue},40%,8%)`;
        gc.shadowBlur  = on ? 28 : 10;
        gc.shadowColor = `hsl(${hue},90%,65%)`;
        gc.fill();
        gc.shadowBlur  = 0;
        gc.shadowColor = "transparent";

        // Circle rim
        gc.beginPath();
        gc.arc(cx, cy, r, 0, Math.PI * 2);
        gc.strokeStyle = `hsla(${hue},90%,70%,${on ? 0.75 + g * 0.25 : 0.18})`;
        gc.lineWidth   = on ? 2 : 1;
        gc.stroke();

        // Name label inside circle
        const fontSize = Math.round(r * 0.38);
        gc.font        = `600 ${fontSize}px ui-monospace, monospace`;
        gc.textAlign   = "center";
        gc.textBaseline = "middle";
        gc.fillStyle   = on ? `hsla(${hue},20%,95%,${0.7 + g * 0.3})` : `hsla(${hue},60%,60%,0.30)`;
        gc.fillText(L.name, cx, cy);
      }

      // ── draw ripples ──
      st.ripples = st.ripples.filter(rp => rp.a > 0.02);
      for (const rp of st.ripples) {
        rp.r += 2.8;
        rp.a *= 0.93;
        gc.beginPath();
        gc.arc(rp.cx, rp.cy, rp.r, 0, Math.PI * 2);
        gc.strokeStyle = `hsla(${rp.hue},85%,70%,${rp.a})`;
        gc.lineWidth   = 2;
        gc.stroke();
      }

      // ── draw sparks ──
      st.sparks = st.sparks.filter(sp => sp.a > 0.04);
      for (const sp of st.sparks) {
        sp.x  += sp.vx;
        sp.y  += sp.vy;
        sp.vy += 0.15;
        sp.a  *= 0.92;
        gc.beginPath();
        gc.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
        gc.fillStyle = `hsla(${sp.hue},90%,75%,${sp.a})`;
        gc.fill();
      }

      // ── hint text ──
      const elapsed = ts - st.wallStart;
      if (elapsed < 8000) {
        const fade = elapsed < 500 ? elapsed / 500 : elapsed > 6000 ? 1 - (elapsed - 6000) / 2000 : 1;
        gc.font = "500 17px ui-monospace, monospace";
        gc.textAlign = "center";
        gc.textBaseline = "middle";
        gc.fillStyle = `rgba(255,255,255,${fade * 0.55})`;
        gc.fillText("Tap a circle to add its sound 🎵", W / 2, H / 2);
      }

      // ── all-5-on message ──
      if (st.allFlash > 0.6) {
        gc.font = `700 ${Math.round(W * 0.055)}px ui-monospace, monospace`;
        gc.textAlign = "center";
        gc.textBaseline = "middle";
        gc.fillStyle = `rgba(255,255,200,${(st.allFlash - 0.6) / 0.4 * 0.9})`;
        gc.fillText("✨ Full Band! ✨", W / 2, H / 2);
      }

      gc.setTransform(1, 0, 0, 1, 0, 0);
    };

    rafId = requestAnimationFrame(draw);

    // ── pointer events ──
    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const y    = e.clientY - rect.top;
      const W    = canvas.offsetWidth;
      const H    = canvas.offsetHeight;

      for (let i = 0; i < 5; i++) {
        const [cx, cy] = lyrXY(i, W, H);
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > LYRS[i].r + 16) continue;

        // Wake audio on first touch
        if (!st.actx) {
          st.actx = new AudioContext();
          st.t0   = st.actx.currentTime;
        }

        // Toggle layer
        st.active[i] = !st.active[i];
        const on      = st.active[i];
        const hue     = LYRS[i].hue;
        const n       = on ? 14 : 8;
        addSparks(st, cx, cy, hue, n);
        st.ripples.push({ cx, cy, r: LYRS[i].r * 0.5, maxR: LYRS[i].r * 2, hue, a: 0.9 });

        // If all 5 are now on, trigger flash
        if (st.active.every(Boolean)) {
          st.allFlash = 1;
          // Extra sparks from all circles
          for (let j = 0; j < 5; j++) {
            const [jx, jy] = lyrXY(j, W, H);
            addSparks(st, jx, jy, LYRS[j].hue, 10);
          }
        }
        break;
      }
    };

    canvas.addEventListener("pointerdown", onDown);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      stRef.current.actx?.close();
    };
  }, []);

  return (
    <main className="relative w-full h-screen bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
      />
      <div className="absolute top-3 left-4 z-10">
        <Link
          href="/dream"
          className="text-white/55 text-sm hover:text-white/80 transition-colors"
        >
          ← dream lab
        </Link>
      </div>
      <div className="absolute bottom-3 right-4 z-10">
        <Link
          href="/dream/216-kids-band-builder/readme"
          className="text-white/40 text-xs hover:text-white/65 transition-colors"
        >
          design notes
        </Link>
      </div>
    </main>
  );
}
