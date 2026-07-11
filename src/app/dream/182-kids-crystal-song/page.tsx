"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

/* ── crystal data — left=lowest/tallest, right=highest/shortest (BANDIMAL rule) ── */
const CRYSTALS = [
  { freq: 130.81, hue: 268, hf: 0.60, wf: 0.50 },  // violet  C3
  { freq: 164.81, hue: 130, hf: 0.52, wf: 0.46 },  // emerald E3
  { freq: 196.00, hue:  42, hf: 0.47, wf: 0.43 },  // amber   G3
  { freq: 220.00, hue: 175, hf: 0.43, wf: 0.40 },  // teal    A3
  { freq: 261.63, hue: 350, hf: 0.39, wf: 0.37 },  // rose    C4
  { freq: 329.63, hue: 192, hf: 0.35, wf: 0.34 },  // cyan    E4
] as const;
const N = CRYSTALS.length;

type Spark  = { x: number; y: number; vx: number; vy: number; a: number; r: number; hue: number };
type Ripple = { x: number; y: number; r: number; maxR: number; a: number; hue: number };
type Voice  = { env: GainNode; oscs: OscillatorNode[] };

export default function CrystalSongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef   = useRef<AudioContext | null>(null);
  const rafRef    = useRef<number>(0);
  const dprRef    = useRef<number>(1);

  const glowRef    = useRef<number[]>(Array.from({ length: N }, () => 0));
  const shimPhases = useRef<number[]>(Array.from({ length: N }, (_, i) => i * 1.047));

  const voicesRef  = useRef<Map<number, { voice: Voice; ci: number }>>(new Map());
  const heldRef    = useRef<Set<number>>(new Set());
  const sparksRef  = useRef<Spark[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const resRef     = useRef<number>(0);  // resonance flash 0..1
  const hintRef    = useRef<boolean>(true);

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    function resize() {
      dprRef.current = Math.min(window.devicePixelRatio || 1, 3);
      if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
        canvas.width  = canvas.offsetWidth  * dprRef.current;
        canvas.height = canvas.offsetHeight * dprRef.current;
      }
    }
    resize();
    window.addEventListener("resize", resize);

    function getCi(cssX: number) {
      return Math.min(N - 1, Math.max(0, Math.floor((cssX / canvas.offsetWidth) * N)));
    }

    /* ── glass bell synthesis ── */
    function beginBell(ci: number): Voice {
      const actx = actxRef.current!;
      const freq  = CRYSTALS[ci].freq;
      const t     = actx.currentTime;

      const env = actx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.42, t + 0.010);
      env.gain.setTargetAtTime(0.20, t + 0.013, 0.09);
      env.connect(actx.destination);

      /* fundamental + octave + 2× octave (glass harmonic partials) */
      const freqs = [freq, freq * 2.0, freq * 4.0];
      const amps  = [1.0,  0.14,       0.04];
      const oscs: OscillatorNode[] = [];
      for (let i = 0; i < 3; i++) {
        const osc = actx.createOscillator();
        osc.frequency.value = freqs[i];
        const g = actx.createGain();
        g.gain.value = amps[i];
        osc.connect(g);
        g.connect(env);
        osc.start(t);
        oscs.push(osc);
      }
      return { env, oscs };
    }

    function endBell(voice: Voice) {
      const actx = actxRef.current;
      if (!actx) return;
      const t = actx.currentTime;
      try {
        voice.env.gain.cancelScheduledValues(t);
        voice.env.gain.setValueAtTime(voice.env.gain.value, t);
        voice.env.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
        for (const osc of voice.oscs) osc.stop(t + 2.3);
      } catch (_) { /* already stopped */ }
    }

    function spawnSparks(x: number, y: number, hue: number) {
      const dpr = dprRef.current;
      for (let i = 0; i < 16; i++) {
        const ang   = Math.random() * Math.PI * 2;
        const speed = 2.5 + Math.random() * 5.5;
        sparksRef.current.push({
          x, y,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - 1.8,
          a:  0.85 + Math.random() * 0.15,
          r:  (1.5 + Math.random() * 2.0) * dpr,
          hue,
        });
      }
      if (sparksRef.current.length > 240) sparksRef.current = sparksRef.current.slice(-240);
    }

    /* ── pointer events ── */
    function onDown(e: PointerEvent) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);

      if (!actxRef.current) {
        const actx = new AudioContext();
        if (actx.state === "suspended") void actx.resume();
        actxRef.current = actx;
        /* cave ambient drone at C2 */
        const droneOsc  = actx.createOscillator();
        const droneGain = actx.createGain();
        droneOsc.frequency.value = 65.4;
        droneGain.gain.value = 0.013;
        droneOsc.connect(droneGain);
        droneGain.connect(actx.destination);
        droneOsc.start();
      }
      hintRef.current = false;

      const rect = canvas.getBoundingClientRect();
      const ci   = getCi(e.clientX - rect.left);
      const voice = beginBell(ci);
      voicesRef.current.set(e.pointerId, { voice, ci });
      heldRef.current.add(ci);
      glowRef.current[ci] = 1.0;

      /* visual feedback: sparks at crystal tip + ripple at base */
      const W = canvas.width, H = canvas.height, dpr = dprRef.current;
      const floorY = H * 0.82;
      const colW   = W / N;
      const cx     = (ci + 0.5) * colW;
      const height = CRYSTALS[ci].hf * floorY;
      const tipY   = floorY - height;
      spawnSparks(cx, tipY, CRYSTALS[ci].hue);
      ripplesRef.current.push({
        x: cx, y: tipY + height * 0.08,
        r: 0, maxR: colW * 0.42,
        a: 0.75, hue: CRYSTALS[ci].hue,
      });
      /* extra sparkle ring at tip */
      ripplesRef.current.push({
        x: cx, y: tipY,
        r: 0, maxR: colW * 0.22,
        a: 0.55, hue: CRYSTALS[ci].hue,
      });

      /* resonance: 4+ crystals held simultaneously */
      if (heldRef.current.size >= 4) resRef.current = 0.60;

      /* discard oldest ripples if too many */
      if (ripplesRef.current.length > 40) ripplesRef.current = ripplesRef.current.slice(-40);
      void dpr;
    }

    function onUp(e: PointerEvent) {
      const entry = voicesRef.current.get(e.pointerId);
      if (!entry) return;
      endBell(entry.voice);
      voicesRef.current.delete(e.pointerId);
      heldRef.current.clear();
      for (const { ci: c } of voicesRef.current.values()) heldRef.current.add(c);
    }

    canvas.addEventListener("pointerdown",   onDown);
    canvas.addEventListener("pointerup",     onUp);
    canvas.addEventListener("pointercancel", onUp);

    /* ── crystal drawing ── */
    function drawCrystal(
      ci: number, cx: number, baseY: number,
      height: number, w: number,
      glow: number, shimmer: number
    ) {
      const hue  = CRYSTALS[ci].hue;
      const dpr  = dprRef.current;
      const halfW = w / 2;
      const bodyFrac = 0.70;         // body takes 70% of height; tip the rest
      const bodyH    = height * bodyFrac;
      const shoulderY = baseY - bodyH;
      const tipY      = baseY - height;

      ctx.beginPath();
      ctx.moveTo(cx - halfW, baseY);
      ctx.lineTo(cx - halfW, shoulderY);
      ctx.lineTo(cx,          tipY);
      ctx.lineTo(cx + halfW, shoulderY);
      ctx.lineTo(cx + halfW, baseY);
      ctx.closePath();

      const alpha = 0.36 + shimmer * 0.10 + glow * 0.50;
      const grad = ctx.createLinearGradient(cx, baseY, cx, tipY);
      grad.addColorStop(0,    `hsla(${hue},72%,16%,${(alpha * 0.55).toFixed(2)})`);
      grad.addColorStop(0.40, `hsla(${hue},80%,40%,${(alpha * 0.88).toFixed(2)})`);
      grad.addColorStop(0.80, `hsla(${hue},88%,60%,${alpha.toFixed(2)})`);
      grad.addColorStop(1,    `hsla(${hue},95%,80%,${(alpha * 1.15).toFixed(2)})`);

      ctx.shadowColor = `hsla(${hue},100%,65%,${(glow * 0.78 + shimmer * 0.11).toFixed(2)})`;
      ctx.shadowBlur  = (10 + glow * 42 + shimmer * 8) * dpr;
      ctx.fillStyle   = grad;
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue},90%,72%,${(0.14 + glow * 0.44 + shimmer * 0.06).toFixed(2)})`;
      ctx.lineWidth   = 1.0 * dpr;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      /* inner facet highlights */
      const facetAlpha = (0.10 + glow * 0.18 + shimmer * 0.04).toFixed(2);
      for (const mx of [-0.28, 0.28]) {
        ctx.beginPath();
        ctx.moveTo(cx + halfW * mx, baseY);
        ctx.lineTo(cx + halfW * mx, shoulderY);
        ctx.lineTo(cx,               tipY);
        ctx.strokeStyle = `hsla(${hue},55%,92%,${facetAlpha})`;
        ctx.lineWidth   = 0.6 * dpr;
        ctx.stroke();
      }
    }

    /* ── main render loop ── */
    let prevTs = 0;
    function frame(ts: number) {
      const dt   = Math.min(0.05, (ts - prevTs) / 1000);
      prevTs = ts;
      const W    = canvas.width;
      const H    = canvas.height;
      const dpr  = dprRef.current;
      const colW = W / N;
      const floorY = H * 0.82;

      /* background */
      ctx.fillStyle = "#030610";
      ctx.fillRect(0, 0, W, H);

      /* subtle vignette */
      const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.10, W * 0.5, H * 0.5, H * 0.80);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      /* crystals */
      for (let ci = 0; ci < N; ci++) {
        const phase   = shimPhases.current[ci];
        const shimmer = 0.42 + 0.58 * Math.sin(ts * 0.00058 + phase);

        if (heldRef.current.has(ci)) {
          glowRef.current[ci] = 1.0;
        } else {
          glowRef.current[ci] = Math.max(0, glowRef.current[ci] - dt * 0.80);
        }
        const glow = glowRef.current[ci];

        /* subtle breathing scale */
        const breathe = 1 + shimmer * 0.025 + glow * 0.045;
        const cx     = (ci + 0.5) * colW;
        const height = CRYSTALS[ci].hf * floorY * breathe;
        const w      = CRYSTALS[ci].wf * colW  * breathe;

        drawCrystal(ci, cx, floorY, height, w, glow, shimmer);
      }

      /* cave floor (drawn over crystal bases to sell the "emerging from rock" look) */
      const floorGrad = ctx.createLinearGradient(0, floorY, 0, H);
      floorGrad.addColorStop(0, "rgba(6,12,24,0.97)");
      floorGrad.addColorStop(0.4, "rgba(3,7,16,1.0)");
      floorGrad.addColorStop(1,   "rgba(1,3,8,1.0)");
      ctx.fillStyle = floorGrad;
      ctx.beginPath();
      ctx.moveTo(0, floorY);
      for (let px = 0; px <= W; px += 5) {
        const wy = floorY + Math.sin(px * 0.0088 + ts * 0.00028) * 2.8 * dpr;
        ctx.lineTo(px, wy);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      /* cave ceiling hint — faint dark gradient from top */
      const ceilGrad = ctx.createLinearGradient(0, 0, 0, H * 0.08);
      ceilGrad.addColorStop(0, "rgba(0,0,0,0.50)");
      ceilGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ceilGrad;
      ctx.fillRect(0, 0, W, H * 0.08);

      /* ripples */
      ripplesRef.current = ripplesRef.current.filter(rp => rp.a > 0.01);
      for (const rp of ripplesRef.current) {
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${rp.hue},90%,70%,${rp.a.toFixed(2)})`;
        ctx.lineWidth   = 1.4 * dpr;
        ctx.shadowBlur  = 7 * dpr;
        ctx.shadowColor = `hsla(${rp.hue},100%,65%,${(rp.a * 0.45).toFixed(2)})`;
        ctx.stroke();
        ctx.shadowBlur = 0;
        rp.r += (rp.maxR - rp.r) * 0.08;
        rp.a *= 0.88;
      }

      /* sparks */
      sparksRef.current = sparksRef.current.filter(sp => sp.a > 0.02);
      for (const sp of sparksRef.current) {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        ctx.fillStyle   = `hsla(${sp.hue},95%,76%,${sp.a.toFixed(2)})`;
        ctx.shadowBlur  = 5 * dpr;
        ctx.shadowColor = `hsla(${sp.hue},100%,70%,${(sp.a * 0.45).toFixed(2)})`;
        ctx.fill();
        ctx.shadowBlur = 0;
        sp.x  += sp.vx;
        sp.y  += sp.vy;
        sp.vy += 0.13;
        sp.vx *= 0.96;
        sp.a  *= 0.91;
      }

      /* resonance flash when 4+ crystals held simultaneously */
      if (resRef.current > 0.01) {
        ctx.fillStyle = `rgba(210,230,255,${(resRef.current * 0.20).toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);
        resRef.current *= 0.87;
        if (resRef.current < 0.01) resRef.current = 0;
      }

      /* hint */
      if (hintRef.current) {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = `${Math.round(15 * dpr)}px ui-monospace, monospace`;
        ctx.fillStyle    = "rgba(255,255,255,0.28)";
        ctx.fillText("tap the crystals  ✦", W / 2, H * 0.44);
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown",   onDown);
      canvas.removeEventListener("pointerup",     onUp);
      canvas.removeEventListener("pointercancel", onUp);
      void actxRef.current?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-black text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Crystal Song</h1>
          <p className="text-base text-muted-foreground mt-0.5">
            Six glowing crystals — each one holds a note
          </p>
        </div>
        <Link
          href="/dream"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Dream Lab
        </Link>
      </header>

      <canvas
        ref={canvasRef}
        className="flex-1 w-full touch-none select-none"
        style={{ display: "block" }}
      />

      <footer className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between">
        <span className="text-xs text-muted-foreground/70">
          For kids 3+ · Zero permissions · Zero API · Zero deps
        </span>
        <Link
          href="/dream/182-kids-crystal-song/README.md"
          className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          Design notes ↗
        </Link>
      </footer>
    </div>
  );
}
