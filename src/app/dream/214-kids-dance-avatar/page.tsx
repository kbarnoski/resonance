"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap the glowing dancer — each body part plays its own note!

// C major pentatonic — BANDIMAL: bigger radius = lower pitch
const PARTS = [
  { xr: 0.50, yr: 0.13, r: 34, hz: 261.63, hue: 190 },  // C4  cyan     head   (small/high)
  { xr: 0.19, yr: 0.41, r: 40, hz: 195.99, hue: 150 },  // G3  emerald  l-hand
  { xr: 0.81, yr: 0.41, r: 40, hz: 220.00, hue:  40 },  // A3  amber    r-hand
  { xr: 0.33, yr: 0.79, r: 52, hz: 131.63, hue: 270 },  // C3  violet   l-foot (large/low)
  { xr: 0.67, yr: 0.79, r: 48, hz: 164.81, hue: 175 },  // E3  teal     r-foot
] as const;

// Body-part tap sequence for the visual demo (before first user touch)
const DEMO_SEQ: readonly number[] = [0, 2, 1, 4, 3, 2, 0, 4, 1, 3];

// Bell timbre: triangle fundamental + two inharmonic partials
const PARTIALS: [number, number][] = [[1, 0.50], [2.756, 0.12], [5.404, 0.04]];

type Spark  = { x: number; y: number; vx: number; vy: number; hue: number; a: number; r: number };
type Ripple = { cx: number; cy: number; r: number; hue: number; a: number };

type St = {
  actx:    AudioContext | null;
  flash:   number[];
  scale:   number[];
  scaleV:  number[];
  sparks:  Spark[];
  ripples: Ripple[];
  awake:   boolean;
  lastTs:  number;
  demoHnd: ReturnType<typeof setTimeout> | null;
  demoI:   number;
};

function partXY(i: number, W: number, H: number): [number, number] {
  return [W * PARTS[i].xr, H * PARTS[i].yr];
}

function playBell(actx: AudioContext, hz: number): void {
  const t = actx.currentTime;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.52, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
  g.connect(actx.destination);
  for (const [ratio, amp] of PARTIALS) {
    const osc = actx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz * ratio;
    const ga = actx.createGain();
    ga.gain.value = amp;
    osc.connect(ga).connect(g);
    osc.start(t);
    osc.stop(t + 1.55);
  }
}

function scatterSparks(st: St, cx: number, cy: number, hue: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 2.5 + Math.random() * 4.2;
    st.sparks.push({
      x: cx, y: cy,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd - 1.8,
      hue, a: 1, r: 2 + Math.random() * 3.5,
    });
  }
}

export default function DanceAvatar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<St>({
    actx: null,
    flash:  [0, 0, 0, 0, 0],
    scale:  [1, 1, 1, 1, 1],
    scaleV: [0, 0, 0, 0, 0],
    sparks: [], ripples: [],
    awake: false, lastTs: 0,
    demoHnd: null, demoI: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = stRef.current;
    let raf = 0;
    let pageLoadTs = 0;

    // Punch a body part: visual always, sound only when awake
    function punchPart(i: number): void {
      if (!canvas) return;
      const [cx, cy] = partXY(i, canvas.width, canvas.height);
      st.flash[i]  = 1;
      st.scaleV[i] = 0.28;
      scatterSparks(st, cx, cy, PARTS[i].hue, 13);
      st.ripples.push({ cx, cy, r: PARTS[i].r * 0.5, hue: PARTS[i].hue, a: 0.95 });
      if (st.actx && st.awake) playBell(st.actx, PARTS[i].hz);
    }

    // Visual-only demo: cycles through body parts before first user tap
    function runDemo(): void {
      if (st.awake) return;
      const i = DEMO_SEQ[st.demoI % DEMO_SEQ.length];
      punchPart(i);
      st.demoI++;
      st.demoHnd = setTimeout(runDemo, 480 + Math.round(Math.random() * 140));
    }
    st.demoHnd = setTimeout(runDemo, 1900);

    function handleDown(e: PointerEvent): void {
      e.preventDefault();
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width  / rect.width);
      const y = (e.clientY - rect.top)  * (canvas.height / rect.height);
      // Find nearest part within generous hitbox
      let best = -1, bestD = Infinity;
      for (let i = 0; i < PARTS.length; i++) {
        const [cx, cy] = partXY(i, canvas.width, canvas.height);
        const d = Math.hypot(x - cx, y - cy);
        if (d < PARTS[i].r * 1.55 && d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) return;
      if (!st.actx) st.actx = new AudioContext();
      if (st.actx.state === "suspended") void st.actx.resume();
      if (!st.awake) {
        st.awake = true;
        if (st.demoHnd) { clearTimeout(st.demoHnd); st.demoHnd = null; }
      }
      punchPart(best);
    }
    canvas.addEventListener("pointerdown", handleDown, { passive: false });

    function drawFrame(ts: number): void {
      if (!canvas) return;
      const gc = canvas.getContext("2d");
      if (!gc) return;
      if (pageLoadTs === 0) pageLoadTs = ts;
      const dt = Math.min((ts - st.lastTs) / 1000, 0.05);
      st.lastTs = ts;
      const W = canvas.width, H = canvas.height;

      gc.fillStyle = "#09090f";
      gc.fillRect(0, 0, W, H);

      // Body skeleton anchor points
      const shX = W * 0.50, shY = H * 0.29;  // shoulder center
      const hpX = W * 0.50, hpY = H * 0.60;  // hip center
      const [hx, hy]   = partXY(0, W, H);
      const [lhx, lhy] = partXY(1, W, H);
      const [rhx, rhy] = partXY(2, W, H);
      const [lfx, lfy] = partXY(3, W, H);
      const [rfx, rfy] = partXY(4, W, H);

      // Draw skeleton (decorative connecting lines)
      gc.save();
      gc.strokeStyle = "rgba(255,255,255,0.13)";
      gc.lineWidth = Math.max(3, W * 0.012);
      gc.lineCap = "round";
      // Spine: head → shoulders → hips
      gc.beginPath();
      gc.moveTo(hx, hy + PARTS[0].r);
      gc.lineTo(shX, shY);
      gc.lineTo(hpX, hpY);
      gc.stroke();
      // Left arm
      gc.beginPath(); gc.moveTo(shX, shY); gc.lineTo(lhx, lhy); gc.stroke();
      // Right arm
      gc.beginPath(); gc.moveTo(shX, shY); gc.lineTo(rhx, rhy); gc.stroke();
      // Left leg
      gc.beginPath(); gc.moveTo(hpX, hpY); gc.lineTo(lfx, lfy); gc.stroke();
      // Right leg
      gc.beginPath(); gc.moveTo(hpX, hpY); gc.lineTo(rfx, rfy); gc.stroke();
      gc.restore();

      // Draw each body-part circle
      for (let i = 0; i < PARTS.length; i++) {
        const p  = PARTS[i];
        const [cx, cy] = partXY(i, W, H);
        const f  = st.flash[i];
        const hue = p.hue;

        // Spring-physics bounce
        st.scaleV[i] += -(st.scale[i] - 1) * 220 * dt;
        st.scaleV[i] *= Math.pow(0.02, dt);      // damping
        st.scale[i]  += st.scaleV[i] * dt;

        // Gentle breathing idle animation (unique phase per part)
        const breath = 1 + 0.038 * Math.sin(ts * 0.00088 + i * 1.35);
        const drawR  = p.r * st.scale[i] * breath;

        // Outer radial glow
        const grd = gc.createRadialGradient(cx, cy, drawR * 0.25, cx, cy, drawR * 1.75);
        grd.addColorStop(0, `hsla(${hue},70%,60%,${0.17 + f * 0.28})`);
        grd.addColorStop(1, `hsla(${hue},70%,40%,0)`);
        gc.fillStyle = grd;
        gc.beginPath(); gc.arc(cx, cy, drawR * 1.75, 0, Math.PI * 2); gc.fill();

        // Main filled circle
        gc.beginPath(); gc.arc(cx, cy, drawR, 0, Math.PI * 2);
        gc.fillStyle = `hsla(${hue},65%,${38 + f * 28}%,0.92)`;
        gc.fill();
        gc.strokeStyle = `hsla(${hue},80%,76%,${0.30 + f * 0.50})`;
        gc.lineWidth = 2.5;
        gc.stroke();

        // Cute face on the head circle
        if (i === 0) {
          const eyeR   = drawR * 0.11;
          const eyeOff = drawR * 0.30;
          gc.fillStyle = "rgba(255,255,255,0.88)";
          gc.beginPath(); gc.arc(cx - eyeOff, cy - drawR * 0.08, eyeR, 0, Math.PI * 2); gc.fill();
          gc.beginPath(); gc.arc(cx + eyeOff, cy - drawR * 0.08, eyeR, 0, Math.PI * 2); gc.fill();
          gc.beginPath();
          gc.arc(cx, cy + drawR * 0.08, drawR * 0.28, 0.18, Math.PI - 0.18);
          gc.strokeStyle = "rgba(255,255,255,0.82)";
          gc.lineWidth = eyeR * 0.95;
          gc.stroke();
        }

        st.flash[i] = Math.max(0, f - dt * 4.5);
      }

      // Expanding ripple rings
      for (let i = st.ripples.length - 1; i >= 0; i--) {
        const rp = st.ripples[i];
        rp.r += Math.min(W, H) * 0.19 * dt;
        rp.a -= dt * 2.1;
        if (rp.a <= 0) { st.ripples.splice(i, 1); continue; }
        gc.beginPath(); gc.arc(rp.cx, rp.cy, rp.r, 0, Math.PI * 2);
        gc.strokeStyle = `hsla(${rp.hue},78%,70%,${rp.a})`;
        gc.lineWidth = 2;
        gc.stroke();
      }

      // Sparkle particles
      for (let i = st.sparks.length - 1; i >= 0; i--) {
        const sp = st.sparks[i];
        sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.09;
        sp.a -= dt * 2.7;
        if (sp.a <= 0) { st.sparks.splice(i, 1); continue; }
        gc.beginPath(); gc.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        gc.fillStyle = `hsla(${sp.hue},94%,72%,${sp.a})`;
        gc.fill();
      }

      // Hint text (fades after 8 s, hidden once awake)
      const hintAge = ts - pageLoadTs;
      if (!st.awake && hintAge < 8000) {
        const alpha = hintAge < 5500 ? 0.82 : 0.82 * (1 - (hintAge - 5500) / 2500);
        gc.font = `bold ${Math.round(Math.min(W, H) * 0.046)}px ui-sans-serif, system-ui, sans-serif`;
        gc.textAlign = "center";
        gc.textBaseline = "alphabetic";
        gc.fillStyle = `rgba(255,255,255,${alpha})`;
        gc.fillText("Tap the dancer! 🕺", W / 2, H * 0.94);
      }

      raf = requestAnimationFrame(drawFrame);
    }

    function resize(): void {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(canvas.offsetWidth  * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", handleDown);
      if (st.demoHnd) clearTimeout(st.demoHnd);
      st.actx?.close();
    };
  }, []);

  return (
    <main style={{
      background: "#09090f",
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px 8px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: "1.2rem", fontWeight: 700,
            color: "#fff", fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}>
            Dance Avatar
          </h1>
          <p style={{
            margin: "2px 0 0", fontSize: "0.875rem",
            color: "rgba(255,255,255,0.72)",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}>
            Tap the dancer · each body part plays a note!
          </p>
        </div>
        <Link href="/dream" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.48)", textDecoration: "none" }}>
          ← dream lab
        </Link>
      </div>
      <canvas
        ref={canvasRef}
        style={{ flex: 1, display: "block", touchAction: "none", width: "100%", minHeight: 0 }}
      />
    </main>
  );
}
