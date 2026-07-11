"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap the drum pads — after your rhythm, the drum talks back!

const PADS = [
  { hue: 270, scale: 1.00 },   // 0 kick   violet  biggest=lowest (BANDIMAL)
  { hue:  45, scale: 0.72 },   // 1 hihat  amber   smallest=highest
  { hue: 340, scale: 0.84 },   // 2 snare  rose
  { hue: 175, scale: 0.92 },   // 3 tom    teal    medium-large
] as const;

type Ripple = { cx: number; cy: number; r: number; maxR: number; hue: number; a: number };
type St = {
  actx:       AudioContext | null;
  ripples:    Ripple[];
  flash:      number[];
  hitSeq:     number[];
  matrix:     number[][];
  lastTapMs:  number;
  pending:    boolean;
  responding: boolean;
  respHandle: ReturnType<typeof setTimeout> | null;
  autoHandle: ReturnType<typeof setTimeout> | null;
  awake:      boolean;
  lastTs:     number;
};

function quadCtr(pad: number, W: number, H: number): [number, number] {
  return [W * (pad % 2 === 0 ? 0.25 : 0.75), H * (pad < 2 ? 0.25 : 0.75)];
}
function padIdx(x: number, y: number, W: number, H: number): number {
  return (x >= W / 2 ? 1 : 0) + (y >= H / 2 ? 2 : 0);
}

function playDrum(actx: AudioContext, pad: number): void {
  const t = actx.currentTime;
  if (pad === 0) {                                           // kick
    const osc = actx.createOscillator(), env = actx.createGain();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    env.gain.setValueAtTime(0.85, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
    osc.connect(env).connect(actx.destination);
    osc.start(t); osc.stop(t + 0.41);
  } else if (pad === 1) {                                    // hihat
    const len = Math.ceil(actx.sampleRate * 0.07);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() - 0.5) * 2;
    const src = actx.createBufferSource(); src.buffer = buf;
    const hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500;
    const env = actx.createGain();
    env.gain.setValueAtTime(0.42, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(hp).connect(env).connect(actx.destination); src.start(t);
  } else if (pad === 2) {                                    // snare
    const len = Math.ceil(actx.sampleRate * 0.13);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() - 0.5) * 2;
    const src = actx.createBufferSource(); src.buffer = buf;
    const bp = actx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.7;
    const nv = actx.createGain();
    nv.gain.setValueAtTime(0.55, t); nv.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(bp).connect(nv).connect(actx.destination); src.start(t);
    const osc2 = actx.createOscillator(), tv = actx.createGain();
    osc2.frequency.value = 185;
    tv.gain.setValueAtTime(0.35, t); tv.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc2.connect(tv).connect(actx.destination); osc2.start(t); osc2.stop(t + 0.08);
  } else {                                                   // tom
    const osc = actx.createOscillator(), env = actx.createGain();
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.22);
    env.gain.setValueAtTime(0.70, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(env).connect(actx.destination);
    osc.start(t); osc.stop(t + 0.33);
  }
}

function markovNext(matrix: number[][], from: number): number {
  const row = matrix[from];
  const total = row.reduce((s, v) => s + v, 0);
  if (total === 0) {
    const w = [0.35, 0.20, 0.28, 0.17];
    let r = Math.random();
    for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) return i; }
    return 0;
  }
  let r = Math.random() * total;
  for (let i = 0; i < 4; i++) { r -= row[i]; if (r <= 0) return i; }
  return 3;
}

function buildSeq(matrix: number[][], start: number, len: number): number[] {
  const s: number[] = []; let c = start;
  for (let i = 0; i < len; i++) { c = markovNext(matrix, c); s.push(c); }
  return s;
}

function fireStep(st: St, seq: number[], step: number, stepMs: number): void {
  if (!st.responding || step >= seq.length) { st.responding = false; return; }
  const p = seq[step];
  if (st.actx) playDrum(st.actx, p);
  st.flash[p] = 1.0;
  st.respHandle = setTimeout(() => fireStep(st, seq, step + 1, stepMs), stepMs);
}

function startResp(st: St): void {
  if (st.responding || !st.actx || st.hitSeq.length < 2) return;
  st.responding = true;
  st.pending = false;
  const seq = buildSeq(st.matrix, st.hitSeq[st.hitSeq.length - 1], 8);
  fireStep(st, seq, 0, 375);  // 8th notes at 80 BPM
}

function drawPad(
  ctx: CanvasRenderingContext2D,
  p: number, W: number, H: number,
  fl: number, ts: number,
): void {
  const [cx, cy] = quadCtr(p, W, H);
  const { hue, scale } = PADS[p];
  const baseR = Math.min(W / 2, H / 2) * 0.40;
  const r     = baseR * scale;

  // Quadrant ambient tint clipped to its quadrant rect
  ctx.save();
  ctx.beginPath();
  ctx.rect(p % 2 === 0 ? 0 : W / 2, p < 2 ? 0 : H / 2, W / 2, H / 2);
  ctx.clip();
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.9);
  bg.addColorStop(0, `hsla(${hue},75%,55%,${0.07 + fl * 0.22})`);
  bg.addColorStop(1, `hsla(${hue},75%,30%,0)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Outer glow halo
  const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.8);
  glow.addColorStop(0, `hsla(${hue},80%,65%,${fl * 0.30})`);
  glow.addColorStop(1, `hsla(${hue},80%,40%,0)`);
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2); ctx.fill();

  // Drum face fill
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const face = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.22, 0, cx, cy, r);
  face.addColorStop(0, `hsla(${hue},55%,${48 + fl * 28}%,${0.32 + fl * 0.46})`);
  face.addColorStop(1, `hsla(${hue},72%,28%,${0.14 + fl * 0.22})`);
  ctx.fillStyle = face;
  ctx.fill();

  // Drum rim
  ctx.strokeStyle = `hsla(${hue},85%,70%,${0.52 + fl * 0.44})`;
  ctx.lineWidth   = 2.5 + fl * 4.5;
  ctx.stroke();

  // Inner ring (drum-head center)
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.46, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${hue},60%,82%,${0.16 + fl * 0.28})`;
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // Resonance ellipse (kick + tom only): subtle horizontal oval that wobbles on hit
  if (p === 0 || p === 3) {
    const wobble = fl * r * 0.09 * Math.sin(ts * 0.018);
    ctx.beginPath();
    ctx.ellipse(cx, cy + wobble, r * 0.68, r * 0.20, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue},60%,78%,${0.11 + fl * 0.22})`;
    ctx.lineWidth   = 1.2;
    ctx.stroke();
  }
}

export default function KidsDrumTap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stRef = useRef<St>({
    actx: null, ripples: [], flash: [0, 0, 0, 0],
    hitSeq: [],
    matrix: [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
    lastTapMs: 0, pending: false, responding: false,
    respHandle: null, autoHandle: null, awake: false, lastTs: 0,
  });
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = stRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize(): void {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    function hitPad(px: number, py: number): void {
      if (!canvas) return;
      const W = canvas.width, H = canvas.height;
      if (!st.awake) { st.actx = new AudioContext(); st.awake = true; }
      if (st.actx?.state === "suspended") st.actx.resume();
      const pad = padIdx(px, py, W, H);
      if (st.actx) playDrum(st.actx, pad);
      st.flash[pad] = 1.0;
      st.ripples.push({ cx: px, cy: py, r: 0, maxR: Math.min(W, H) * 0.28, hue: PADS[pad].hue, a: 0.88 });
      if (st.ripples.length > 24) st.ripples.shift();
      if (st.hitSeq.length > 0) st.matrix[st.hitSeq[st.hitSeq.length - 1]][pad]++;
      st.hitSeq.push(pad);
      if (st.hitSeq.length > 16) st.hitSeq.shift();
      st.lastTapMs = performance.now();
      if (st.hitSeq.length >= 2) st.pending = true;
      if (st.responding) {
        st.responding = false;
        if (st.respHandle) { clearTimeout(st.respHandle); st.respHandle = null; }
      }
    }

    function onDown(e: PointerEvent): void {
      if (!canvas) return;
      e.preventDefault();
      if (st.autoHandle) { clearTimeout(st.autoHandle); st.autoHandle = null; }
      const rect = canvas.getBoundingClientRect();
      hitPad((e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    }
    canvas.addEventListener("pointerdown", onDown, { passive: false });

    // Demo auto-rhythm after 2.2 s if no interaction
    st.autoHandle = setTimeout(() => {
      if (st.awake) return;
      st.actx = new AudioContext();
      st.awake = true;
      if (!canvas) return;
      const W = canvas.width, H = canvas.height;
      const demoSeq = [0, 1, 2, 1, 0, 1, 3, 1];  // kick hat snare hat kick hat tom hat
      let step = 0;
      const runDemo = (): void => {
        if (step >= demoSeq.length) return;
        const p = demoSeq[step++];
        const [cx, cy] = quadCtr(p, W, H);
        hitPad(cx, cy);
        if (step < demoSeq.length) st.autoHandle = setTimeout(runDemo, 375);
      };
      runDemo();
    }, 2200);

    function draw(ts: number): void {
      rafRef.current = requestAnimationFrame(draw);
      if (!canvas) return;
      const dt = Math.min((ts - (st.lastTs || ts)) / 1000, 0.05);
      st.lastTs = ts;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;

      // Trigger response after 1.5 s of silence (≥2 taps)
      if (st.pending && !st.responding && st.actx &&
          performance.now() - st.lastTapMs > 1500) {
        startResp(st);
      }

      // Background
      ctx.fillStyle = "#080810";
      ctx.fillRect(0, 0, W, H);

      // Pads
      for (let p = 0; p < 4; p++) drawPad(ctx, p, W, H, st.flash[p], ts);

      // Divider cross
      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
      ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
      ctx.stroke();

      // Ripples
      for (const rip of st.ripples) {
        ctx.beginPath(); ctx.arc(rip.cx, rip.cy, rip.r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${rip.hue},80%,75%,${rip.a})`;
        ctx.lineWidth   = 2.2;
        ctx.stroke();
        rip.r += dt * 310;
        rip.a *= Math.pow(0.92, dt * 60);
      }
      st.ripples = st.ripples.filter(r => r.a > 0.01);

      // Response indicator: 4 small pulsing dots at bottom when drum is talking back
      if (st.responding) {
        for (let p = 0; p < 4; p++) {
          const dotX = W * (0.30 + p * 0.135);
          const dotY = H * 0.972;
          const dotR = W * 0.013;
          ctx.beginPath(); ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${PADS[p].hue},80%,70%,${0.28 + st.flash[p] * 0.68})`;
          ctx.fill();
        }
      }

      // Hint text (fades 0 – 8 s)
      const hintalpha = Math.max(0, Math.min(1, (8000 - ts) / 3000));
      if (hintalpha > 0) {
        const fs = Math.round(Math.min(W, H) * 0.028);
        ctx.font        = `${fs}px monospace`;
        ctx.textAlign   = "center";
        ctx.fillStyle   = `rgba(255,255,255,${hintalpha * 0.52})`;
        ctx.fillText("tap a rhythm  •  drum talks back", W / 2, H * 0.956);
      }

      // Decay flash per pad
      for (let p = 0; p < 4; p++) st.flash[p] *= Math.pow(0.84, dt * 60);
    }

    draw(0);

    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", resize);
      if (st.autoHandle) clearTimeout(st.autoHandle);
      if (st.respHandle) clearTimeout(st.respHandle);
      st.actx?.close();
    };
  }, []);

  return (
    <div className="relative w-full h-dvh bg-[#080810] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />
      <nav className="absolute top-3 right-4 z-10">
        <Link
          href="/dream"
          className="text-muted-foreground text-xs font-mono hover:text-foreground transition-colors"
        >
          ← dream lab
        </Link>
      </nav>
    </div>
  );
}
