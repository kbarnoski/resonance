"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  NOTES,
  N_MAGNETS,
  type Magnet,
  type Filing,
  computePoles,
  computeField,
  nearestMagnet,
  buildFilings,
  buildMagnets,
  applyDrift,
  computeProximity,
} from "./field";

/* ── tunables (all in CSS px unless noted; * dpr at use) ── */
const MAGNET_CSS = 38; // visual radius → 76px diameter ≥ 64 tap target
const GRAB_CSS = 56; // generous grab radius for little fingers
const FILINGS = 4200; // particle budget (capped for 60fps)
const STREAK_CSS = 7; // half-length of a filing streak
const FLOW_CSS = 0.9; // how far a filing slides along the field per frame
const BRIDGE_CSS = 240; // magnet-pair distance at which fields "bridge"
const IDLE_MS = 4000; // go autonomous after this much stillness

type PointerMap = Map<number, number>; // pointerId → magnet index

export default function IronGardenPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(true);
  const [started, setStarted] = useState(false);

  /* sim state (refs so the rAF loop never restarts) */
  const dprRef = useRef(1);
  const magsRef = useRef<Magnet[]>([]);
  const filsRef = useRef<Filing[]>([]);
  const dragRef = useRef<PointerMap>(new Map());
  const dragVelRef = useRef<number[]>([]); // per-magnet recent motion (for hum)
  const lastTouchRef = useRef<number>(0);
  const tRef = useRef(0);
  const rafRef = useRef(0);

  /* audio */
  const actxRef = useRef<AudioContext | null>(null);
  const noteGainRef = useRef<GainNode[]>([]);
  const padGainRef = useRef<GainNode | null>(null);
  const startedRef = useRef(false);

  /* keep a stable ref to the start trigger for pointer handler */
  const beginRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx = canvas.getContext("2d");
    const AC = typeof window !== "undefined" ? window.AudioContext : undefined;
    if (!ctx || !AC) {
      setSupported(false);
      return;
    }

    function resize() {
      dprRef.current = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0) {
        canvas.width = Math.round(w * dprRef.current);
        canvas.height = Math.round(h * dprRef.current);
      }
      magsRef.current = buildMagnets(canvas.width, canvas.height);
      filsRef.current = buildFilings(FILINGS, canvas.width, canvas.height);
      dragVelRef.current = new Array(N_MAGNETS).fill(0);
    }
    resize();
    window.addEventListener("resize", resize);
    lastTouchRef.current = performance.now();

    /* ── audio graph, built on first gesture ── */
    function beginAudio() {
      if (startedRef.current) return;
      startedRef.current = true;
      const actx = new AC!();
      if (actx.state === "suspended") void actx.resume();
      actxRef.current = actx;

      /* master: gentle compressor/limiter so it can never get harsh */
      const comp = actx.createDynamicsCompressor();
      comp.threshold.value = -22;
      comp.knee.value = 24;
      comp.ratio.value = 12;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      const master = actx.createGain();
      master.gain.value = 0.9;
      comp.connect(master);
      master.connect(actx.destination);

      /* soft plate reverb for bloom */
      const irLen = Math.floor(actx.sampleRate * 2.6);
      const ir = actx.createBuffer(2, irLen, actx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let k = 0; k < irLen; k++) d[k] = (Math.random() * 2 - 1) * Math.exp((-4.2 * k) / irLen);
      }
      const conv = actx.createConvolver();
      conv.buffer = ir;
      const revGain = actx.createGain();
      revGain.gain.value = 0.5;
      conv.connect(revGain);
      revGain.connect(comp);

      /* per-magnet voice: two detuned oscillators for a soft choir */
      noteGainRef.current = [];
      for (let i = 0; i < N_MAGNETS; i++) {
        const g = actx.createGain();
        g.gain.value = 0;
        const lp = actx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1400;
        for (const det of [-3, 3]) {
          const osc = actx.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = NOTES[i].freq;
          osc.detune.value = det;
          osc.connect(g);
          osc.start();
        }
        g.connect(lp);
        lp.connect(conv);
        lp.connect(comp);
        noteGainRef.current.push(g);
      }

      /* ambient pad in key (root + fifth, very quiet) so cold load isn't silent */
      const padGain = actx.createGain();
      padGain.gain.value = 0.0;
      const padLp = actx.createBiquadFilter();
      padLp.type = "lowpass";
      padLp.frequency.value = 700;
      padGain.connect(padLp);
      padLp.connect(conv);
      padLp.connect(comp);
      for (const f of [NOTES[0].freq / 2, NOTES[2].freq / 2]) {
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const lfo = actx.createOscillator();
        lfo.frequency.value = 0.07 + Math.random() * 0.05;
        const lfoGain = actx.createGain();
        lfoGain.gain.value = 1.5;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);
        osc.connect(padGain);
        osc.start();
        lfo.start();
      }
      padGain.gain.setTargetAtTime(0.05, actx.currentTime, 1.5);
      padGainRef.current = padGain;
    }

    function begin() {
      beginAudio();
      setStarted(true);
      lastTouchRef.current = performance.now();
    }
    beginRef.current = begin;

    /* ── multi-touch drag via Pointer Events ── */
    function pointFromEvent(e: PointerEvent): [number, number] {
      const rect = canvas.getBoundingClientRect();
      const dpr = dprRef.current;
      return [(e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr];
    }

    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      beginRef.current();
      const [px, py] = pointFromEvent(e);
      const mags = magsRef.current;
      const grab = GRAB_CSS * dprRef.current;
      let best = -1;
      let bestD = grab;
      for (let i = 0; i < mags.length; i++) {
        if ([...dragRef.current.values()].includes(i)) continue; // already held
        const d = Math.hypot(mags[i].x - px, mags[i].y - py);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        dragRef.current.set(e.pointerId, best);
        canvas.setPointerCapture(e.pointerId);
        magsRef.current[best].glow = 1;
      }
      lastTouchRef.current = performance.now();
    }

    function onPointerMove(e: PointerEvent) {
      const idx = dragRef.current.get(e.pointerId);
      if (idx === undefined) return;
      e.preventDefault();
      const [px, py] = pointFromEvent(e);
      const m = magsRef.current[idx];
      const moved = Math.hypot(px - m.x, py - m.y);
      dragVelRef.current[idx] = Math.min(1, dragVelRef.current[idx] + moved / (40 * dprRef.current));
      m.x = px;
      m.y = py;
      lastTouchRef.current = performance.now();
    }

    function onPointerUp(e: PointerEvent) {
      if (dragRef.current.has(e.pointerId)) {
        dragRef.current.delete(e.pointerId);
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      }
      lastTouchRef.current = performance.now();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    /* ── reusable scratch ── */
    const bvec: [number, number] = [0, 0];

    function frame() {
      const W = canvas.width;
      const H = canvas.height;
      const dpr = dprRef.current;
      const c = ctx!;
      const mags = magsRef.current;
      const fils = filsRef.current;
      const now = performance.now();
      tRef.current += 0.016;
      const t = tRef.current;
      const idle = now - lastTouchRef.current > IDLE_MS;

      /* dipole half-separation scales with magnet size */
      const half = MAGNET_CSS * 0.62 * dpr;

      /* autonomous drift when idle: glide magnets along smooth noise paths */
      const held = dragRef.current;
      const heldIdx = new Set(held.values());
      for (let i = 0; i < mags.length; i++) {
        const m = mags[i];
        m.half = half;
        /* slowly rotate the dipole axis so field lines breathe */
        const axAng = Math.atan2(m.ay, m.ax) + 0.0025;
        m.ax = Math.cos(axAng);
        m.ay = Math.sin(axAng);
        if (idle && !heldIdx.has(i)) {
          const cx = W / 2 + applyDrift(t * m.seedR, m.seedX) * W * 0.34;
          const cy = H / 2 + applyDrift(t * m.seedR, m.seedY) * H * 0.34;
          m.x += (cx - m.x) * 0.012;
          m.y += (cy - m.y) * 0.012;
        }
        /* keep on-canvas */
        const r = MAGNET_CSS * dpr;
        m.x = Math.max(r, Math.min(W - r, m.x));
        m.y = Math.max(r, Math.min(H - r, m.y));
        /* ease glow + decay hum motion */
        const tgt = heldIdx.has(i) ? 1 : 0.25;
        m.glow += (tgt - m.glow) * 0.08;
        dragVelRef.current[i] *= 0.9;
      }

      const poles = computePoles(mags);
      const soft = (28 * dpr) * (28 * dpr); // softening radius²
      const flow = FLOW_CSS * dpr;
      const streak = STREAK_CSS * dpr;

      /* ── advance + align filings, batched into one stroke ── */
      c.fillStyle = "#05061a";
      c.fillRect(0, 0, W, H);

      c.save();
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      /* group strokes by hue to minimise state changes: bucket per magnet */
      for (let h = 0; h < N_MAGNETS; h++) {
        c.beginPath();
        let any = false;
        const hue = NOTES[h].hue;
        for (let i = 0; i < fils.length; i++) {
          const f = fils[i];
          if (f.hue !== h) continue;
          any = true;
          c.moveTo(f.x - f.dx * streak, f.y - f.dy * streak);
          c.lineTo(f.x + f.dx * streak, f.y + f.dy * streak);
        }
        if (any) {
          c.strokeStyle = `hsla(${hue},80%,72%,0.5)`;
          c.lineWidth = 1.15 * dpr;
          c.stroke();
        }
      }
      c.restore();

      /* physics update for filings (after draw so colours match this frame) */
      for (let i = 0; i < fils.length; i++) {
        const f = fils[i];
        computeField(f.x, f.y, poles, soft, bvec);
        const bx = bvec[0];
        const by = bvec[1];
        const mag = Math.hypot(bx, by);
        if (mag > 1e-12) {
          const nx = bx / mag;
          const ny = by / mag;
          /* smooth the orientation so streaks don't jitter */
          f.dx += (nx - f.dx) * 0.4;
          f.dy += (ny - f.dy) * 0.4;
          const nn = Math.hypot(f.dx, f.dy) || 1;
          f.dx /= nn;
          f.dy /= nn;
          /* slide along field so filings accumulate into chains (lines of force) */
          f.x += f.dx * flow;
          f.y += f.dy * flow;
          f.mag = mag;
        }
        f.age += 1;
        f.hue = nearestMagnet(f.x, f.y, mags);

        /* respawn if off-screen, in a dead zone, or stale (keeps field alive) */
        const dead = f.mag < 4e-7;
        if (f.x < 0 || f.x > W || f.y < 0 || f.y > H || (dead && f.age > 90) || f.age > 600) {
          f.x = Math.random() * W;
          f.y = Math.random() * H;
          f.age = 0;
        }
      }

      /* ── connecting field-line ribbons + chord audio ── */
      const bridge = BRIDGE_CSS * dpr;
      const actx = actxRef.current;
      const at = actx ? actx.currentTime : 0;
      /* per-magnet target loudness = max proximity + own hum */
      const loud = new Array<number>(N_MAGNETS).fill(0);

      c.save();
      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < mags.length; i++) {
        for (let j = i + 1; j < mags.length; j++) {
          const prox = computeProximity(mags[i].x, mags[i].y, mags[j].x, mags[j].y, bridge);
          if (prox > 0.02) {
            const a = prox * prox;
            /* draw a soft glowing bridge tinting both hues (the visible line) */
            const grad = c.createLinearGradient(mags[i].x, mags[i].y, mags[j].x, mags[j].y);
            grad.addColorStop(0, `hsla(${NOTES[i].hue},85%,72%,${(a * 0.32).toFixed(3)})`);
            grad.addColorStop(0.5, `hsla(${NOTES[i].hue},85%,80%,${(a * 0.12).toFixed(3)})`);
            grad.addColorStop(1, `hsla(${NOTES[j].hue},85%,72%,${(a * 0.32).toFixed(3)})`);
            c.strokeStyle = grad;
            c.lineWidth = (0.5 + a * 4) * dpr;
            c.beginPath();
            c.moveTo(mags[i].x, mags[i].y);
            c.lineTo(mags[j].x, mags[j].y);
            c.stroke();
            /* the chord blooms with proximity² */
            const v = a * 0.14;
            if (v > loud[i]) loud[i] = v;
            if (v > loud[j]) loud[j] = v;
          }
        }
      }
      c.restore();

      /* single-note hum while grabbing/moving a magnet alone */
      for (let i = 0; i < mags.length; i++) {
        const hum = dragVelRef.current[i] * 0.07;
        if (hum > loud[i]) loud[i] = hum;
      }
      if (actx && noteGainRef.current.length) {
        for (let i = 0; i < N_MAGNETS; i++) {
          noteGainRef.current[i].gain.setTargetAtTime(loud[i], at, 0.18);
        }
      }

      /* ── draw magnet-flowers on top ── */
      c.save();
      c.globalCompositeOperation = "lighter";
      const R = MAGNET_CSS * dpr;
      for (let i = 0; i < mags.length; i++) {
        const m = mags[i];
        const hue = NOTES[i].hue;
        const g = 0.45 + m.glow * 0.55 + (loud[i] / 0.14) * 0.4;
        /* outer halo */
        const glowR = R * (1.7 + m.glow * 0.7);
        const halo = c.createRadialGradient(m.x, m.y, R * 0.25, m.x, m.y, glowR);
        halo.addColorStop(0, `hsla(${hue},90%,85%,${(0.22 * g).toFixed(3)})`);
        halo.addColorStop(0.4, `hsla(${hue},80%,62%,${(0.1 * g).toFixed(3)})`);
        halo.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = halo;
        c.beginPath();
        c.arc(m.x, m.y, glowR, 0, Math.PI * 2);
        c.fill();
        /* flower petals: 6 soft lobes around the core */
        for (let p = 0; p < 6; p++) {
          const ang = (p / 6) * Math.PI * 2 + t * 0.2;
          const pr = R * 0.62;
          const lx = m.x + Math.cos(ang) * pr;
          const ly = m.y + Math.sin(ang) * pr;
          c.fillStyle = `hsla(${hue},85%,78%,${(0.32 * g).toFixed(3)})`;
          c.beginPath();
          c.arc(lx, ly, R * 0.42, 0, Math.PI * 2);
          c.fill();
        }
        /* bright core */
        c.fillStyle = `hsla(${hue},90%,86%,${Math.min(1, 0.7 + g * 0.2).toFixed(3)})`;
        c.beginPath();
        c.arc(m.x, m.y, R * 0.5, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      void actxRef.current?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#05061a] text-foreground overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide text-foreground">Iron Garden</h1>
          <p className="text-base text-foreground mt-0.5">
            Drag the glowing flowers — watch the invisible magnet lines appear and hear them sing together.
          </p>
        </div>
        <Link href="/dream" className="text-base text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">
          ← Dream Lab
        </Link>
      </header>

      <div className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none select-none block" />

        {!supported && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="text-base text-violet-300 text-center max-w-md">
              This little garden needs a browser with Canvas2D and the Web Audio API. Please try a recent
              version of Safari, Chrome, or Firefox.
            </p>
          </div>
        )}

        {supported && !started && (
          <button
            type="button"
            onClick={() => beginRef.current()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#05061a]/55 backdrop-blur-[2px] cursor-pointer"
            aria-label="Tap to begin the Iron Garden"
          >
            <span className="text-6xl select-none" aria-hidden>
              🌸
            </span>
            <span className="text-2xl text-foreground px-6 py-2.5 rounded-full border border-border min-h-[44px] flex items-center">
              tap to begin
            </span>
          </button>
        )}
      </div>

      <footer className="px-4 py-2.5 border-t border-border shrink-0 flex items-center justify-between gap-3">
        <span className="text-base text-muted-foreground">For kids 4+ · drag with one or two fingers</span>
        <Link
          href="/dream/953-kids-iron-garden/README.md"
          className="text-base text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
        >
          Design notes ↗
        </Link>
      </footer>
    </div>
  );
}
