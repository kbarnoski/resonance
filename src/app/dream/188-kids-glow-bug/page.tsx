"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

/* ── 5 garden lamps: left = lowest pitch (BANDIMAL rule: bigger = lower) ── */
const LAMPS = [
  { xFrac: 0.12, freq: 130.81, hue: 268, r: 32 }, // C3  violet
  { xFrac: 0.29, freq: 164.81, hue: 148, r: 27 }, // E3  emerald
  { xFrac: 0.50, freq: 196.00, hue:  42, r: 23 }, // G3  amber
  { xFrac: 0.71, freq: 220.00, hue: 345, r: 19 }, // A3  rose
  { xFrac: 0.88, freq: 261.63, hue: 200, r: 16 }, // C4  sky
] as const;

const LAMP_Y    = 0.60; // lamp centre Y as fraction of canvas height
const GROUND_Y  = 0.80; // ground line Y fraction
const BUG_R     = 9;    // bug radius (CSS px)
const ARRIVE_R  = 36;   // distance at which bug "enters" the lamp
const MAX_BUGS  = 10;
const SPAWN_MS  = 3200; // auto-spawn demo interval (ms)

type Bug   = { id: number; x: number; y: number; vx: number; vy: number; phase: number; target: number };
type Spark = { x: number; y: number; vx: number; vy: number; a: number; hue: number };

let glowBugId = 0;

/* ── reverb impulse ── */
function buildReverb(actx: AudioContext): ConvolverNode {
  const sr  = actx.sampleRate;
  const len = Math.floor(sr * 1.4);
  const buf = actx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-4 * i / len);
    }
  }
  const node = actx.createConvolver();
  node.buffer = buf;
  return node;
}

/* ── bell chime: triangle + slight 2nd harmonic, shared reverb bus ── */
function ringChime(actx: AudioContext, convIn: AudioNode, freq: number) {
  const now  = actx.currentTime;
  const osc  = actx.createOscillator();
  const osc2 = actx.createOscillator();
  const env  = actx.createGain();
  const env2 = actx.createGain();

  osc.type  = "triangle";
  osc.frequency.value  = freq;
  osc2.type = "triangle";
  osc2.frequency.value = freq * 2.013; // slightly detuned octave

  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.28, now + 0.007);
  env.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

  env2.gain.setValueAtTime(0, now);
  env2.gain.linearRampToValueAtTime(0.09, now + 0.007);
  env2.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

  osc.connect(env);
  osc2.connect(env2);
  env.connect(actx.destination);  env.connect(convIn);
  env2.connect(actx.destination); env2.connect(convIn);

  osc.start(now);  osc.stop(now + 2.2);
  osc2.start(now); osc2.stop(now + 1.2);
}

export default function GlowBugPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext("2d")!;
    const dpr    = Math.min(window.devicePixelRatio || 1, 3);
    let W = 0, H = 0;

    function resize() {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    /* ── audio (deferred until first tap for autoplay policy) ── */
    let actx: AudioContext | null = null;
    let conv: ConvolverNode | null = null;

    function initAudio() {
      if (actx) return;
      actx = new AudioContext();
      if (actx.state === "suspended") void actx.resume();
      conv = buildReverb(actx);
      /* route reverb output through a shared wet bus */
      const revBus = actx.createGain();
      revBus.gain.value = 0.30;
      conv.connect(revBus);
      revBus.connect(actx.destination);
      /* ambient pad: C3 + G3 sine at very low gain */
      for (const f of [130.81, 196.00]) {
        const osc = actx.createOscillator();
        const g   = actx.createGain();
        osc.type  = "sine";
        osc.frequency.value = f;
        g.gain.value = 0.012;
        osc.connect(g);
        g.connect(actx.destination);
        osc.start();
      }
    }

    /* ── scene state ── */
    const bugs: Bug[]    = [];
    const glows          = new Array<number>(LAMPS.length).fill(0); // 0..1 per lamp
    const sparks: Spark[] = [];
    const hint = { shown: true };
    let lastAutoSpawn = -SPAWN_MS;

    function lampXY(i: number): [number, number] {
      return [LAMPS[i].xFrac * W, LAMP_Y * H];
    }

    function spawnBug(x: number, y: number) {
      /* choose nearest lamp as target */
      let best = 0, bestD = Infinity;
      for (let i = 0; i < LAMPS.length; i++) {
        const [lx, ly] = lampXY(i);
        const d = Math.hypot(x - lx, y - ly);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (bugs.length >= MAX_BUGS) bugs.shift();
      bugs.push({
        id:     glowBugId++,
        x:      Math.max(BUG_R, Math.min(W - BUG_R, x)),
        y:      Math.max(BUG_R, Math.min(H - BUG_R, y)),
        vx:     (Math.random() - 0.5) * 1.4,
        vy:     -1.6 - Math.random() * 0.6,
        phase:  Math.random() * Math.PI * 2,
        target: best,
      });
    }

    function arriveAtLamp(idx: number, lx: number, ly: number) {
      glows[idx] = 1.0;
      /* sparkle burst */
      const hue = LAMPS[idx].hue;
      for (let k = 0; k < 14; k++) {
        const ang = (k / 14) * Math.PI * 2;
        const spd = 1.4 + Math.random() * 2.8;
        sparks.push({
          x: lx, y: ly,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.2,
          a:  0.90,
          hue,
        });
      }
      if (sparks.length > 200) sparks.splice(0, sparks.length - 200);
      /* chime */
      const lActx = actx;
      const lConv = conv;
      if (lActx && lConv) ringChime(lActx, lConv, LAMPS[idx].freq);
    }

    function onDown(e: PointerEvent) {
      e.preventDefault();
      initAudio();
      hint.shown = false;
      const rect = canvas.getBoundingClientRect();
      spawnBug(e.clientX - rect.left, e.clientY - rect.top);
    }
    canvas.addEventListener("pointerdown", onDown);

    /* ── render loop ── */
    let raf = 0;
    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      if (W === 0 || H === 0) return;

      /* auto-spawn demo bug from the soil area */
      if (ts - lastAutoSpawn > SPAWN_MS) {
        lastAutoSpawn = ts;
        const rx = W * (0.12 + Math.random() * 0.76);
        const ry = H * 0.90;
        spawnBug(rx, ry);
      }

      /* clear + sky gradient */
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0,   "#020509");
      sky.addColorStop(0.5, "#030812");
      sky.addColorStop(1,   "#040610");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      /* ground strip */
      const groundGrad = ctx.createLinearGradient(0, GROUND_Y * H, 0, H);
      groundGrad.addColorStop(0, "rgba(18, 9, 4, 0.96)");
      groundGrad.addColorStop(1, "rgba(8, 4, 2, 1)");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, GROUND_Y * H, W, H * (1 - GROUND_Y));

      /* decay lamp glows */
      for (let i = 0; i < LAMPS.length; i++) {
        if (glows[i] > 0) glows[i] = Math.max(0, glows[i] - 0.020);
      }

      /* draw stems + lamps */
      for (let i = 0; i < LAMPS.length; i++) {
        const [lx, ly] = lampXY(i);
        const lr    = LAMPS[i].r;
        const hue   = LAMPS[i].hue;
        const glow  = glows[i];
        const pulse = 0.13 + 0.07 * Math.sin(ts * 0.00060 * (1 + i * 0.22));
        const total = pulse + glow * 0.78;

        /* stem */
        ctx.beginPath();
        ctx.moveTo(lx, GROUND_Y * H);
        ctx.lineTo(lx, ly + lr * 0.9);
        ctx.lineWidth   = 2.2;
        ctx.strokeStyle = `hsla(${hue},52%,36%,0.55)`;
        ctx.stroke();

        /* outer halo */
        const haloR = lr * (2.5 + total * 1.6);
        const haloG = ctx.createRadialGradient(lx, ly, 0, lx, ly, haloR);
        haloG.addColorStop(0,   `hsla(${hue},85%,72%,${(0.25 + total * 0.52).toFixed(2)})`);
        haloG.addColorStop(0.5, `hsla(${hue},70%,52%,${(0.05 + total * 0.10).toFixed(2)})`);
        haloG.addColorStop(1,   "rgba(0,0,0,0)");
        ctx.fillStyle = haloG;
        ctx.beginPath();
        ctx.arc(lx, ly, haloR, 0, Math.PI * 2);
        ctx.fill();

        /* lamp orb */
        ctx.shadowColor = `hsla(${hue},100%,72%,${(0.45 + glow * 0.5).toFixed(2)})`;
        ctx.shadowBlur  = (7 + glow * 18) * dpr;
        const orbG = ctx.createRadialGradient(
          lx - lr * 0.28, ly - lr * 0.28, 0,
          lx,             ly,             lr,
        );
        orbG.addColorStop(0,   `hsla(${hue},88%,96%,${(0.72 + total * 0.24).toFixed(2)})`);
        orbG.addColorStop(0.55,`hsla(${hue},78%,65%,${(0.52 + total * 0.30).toFixed(2)})`);
        orbG.addColorStop(1,   `hsla(${hue},65%,42%,0.50)`);
        ctx.fillStyle = orbG;
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      /* update + draw sparks (additive) */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x  += sp.vx;
        sp.y  += sp.vy;
        sp.vy += 0.09;
        sp.vx *= 0.97;
        sp.a  *= 0.91;
        if (sp.a < 0.02) { sparks.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, Math.max(0.5, 3.2 * sp.a), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${sp.hue},90%,78%,${sp.a.toFixed(2)})`;
        ctx.fill();
      }
      ctx.restore();

      /* update + draw bugs (additive) */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = bugs.length - 1; i >= 0; i--) {
        const b = bugs[i];
        const [lx, ly] = lampXY(b.target);
        const dx   = lx - b.x;
        const dy   = ly - b.y;
        const dist = Math.hypot(dx, dy) || 1;

        /* arrive check */
        if (dist < ARRIVE_R) {
          arriveAtLamp(b.target, lx, ly);
          bugs.splice(i, 1);
          continue;
        }

        /* attraction + damping */
        b.vx += (dx / dist) * 0.057;
        b.vy += (dy / dist) * 0.057;
        b.vx *= 0.96;
        b.vy *= 0.96;

        /* sinusoidal drift for organic flight */
        b.phase += 0.056;
        b.x += b.vx + Math.sin(b.phase) * 0.85;
        b.y += b.vy;

        /* stay in canvas */
        b.x = Math.max(BUG_R, Math.min(W - BUG_R, b.x));
        b.y = Math.max(BUG_R, Math.min(H - BUG_R, b.y));

        /* bug glow halo */
        const bugG = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, BUG_R * 2.6);
        bugG.addColorStop(0,    "rgba(255, 238, 105, 0.90)");
        bugG.addColorStop(0.38, "rgba(250, 195,  42, 0.55)");
        bugG.addColorStop(1,    "rgba(0, 0, 0, 0)");
        ctx.fillStyle = bugG;
        ctx.beginPath();
        ctx.arc(b.x, b.y, BUG_R * 2.6, 0, Math.PI * 2);
        ctx.fill();

        /* bright core */
        ctx.fillStyle = "rgba(255, 252, 195, 0.95)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, BUG_R * 0.40, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      /* hint */
      if (hint.shown) {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = "15px ui-monospace, monospace";
        ctx.fillStyle    = "rgba(255,255,255,0.28)";
        ctx.fillText("tap anywhere to release glow-bugs  ✨", W / 2, H * 0.72);
      }
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      void actx?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-black text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Glow Bugs</h1>
          <p className="text-base text-muted-foreground mt-0.5">
            Release glow-bugs · they drift to the garden lamps and chime
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
        className="flex-1 w-full touch-none select-none cursor-pointer"
        style={{ display: "block" }}
      />

      <footer className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          For kids 3+ · Zero permissions · Zero API · Zero deps
        </span>
        <Link
          href="/dream/188-kids-glow-bug/README.md"
          className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
        >
          Design notes ↗
        </Link>
      </footer>
    </div>
  );
}
