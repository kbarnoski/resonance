"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

/* ── zone data ─────────────────────────────────────────────────────────────── */
const ZONES = [
  { name: "Wood",  emoji: "🪵", r: 217, g: 119, b:   6 },
  { name: "Metal", emoji: "🔔", r:  34, g: 211, b: 238 },
  { name: "Water", emoji: "💧", r: 129, g: 140, b: 248 },
  { name: "Earth", emoji: "🥁", r: 146, g:  64, b:  14 },
  { name: "Glass", emoji: "🫙", r: 251, g: 113, b: 133 },
];

type Ripple = { x: number; y: number; r: number; maxR: number; a: number; zi: number };
type Flash  = { a: number; zi: number };
type Coord  = { x: number; y: number };

/* ── synthesis ─────────────────────────────────────────────────────────────── */
function synthWood(actx: AudioContext, vol: number) {
  const t = actx.currentTime;
  const n = (actx.sampleRate * 0.22) | 0;
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(); src.buffer = buf;
  const lpf = actx.createBiquadFilter();
  lpf.type = "lowpass"; lpf.frequency.value = 270; lpf.Q.value = 2;
  const env = actx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.55 * vol, t + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  src.connect(lpf); lpf.connect(env); env.connect(actx.destination);
  src.start(t); src.stop(t + 0.22);
  // body resonance thud
  const osc = actx.createOscillator(); osc.frequency.value = 185;
  const eg2 = actx.createGain();
  eg2.gain.setValueAtTime(0.28 * vol, t);
  eg2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  osc.connect(eg2); eg2.connect(actx.destination);
  osc.start(t); osc.stop(t + 0.12);
}

function synthMetal(actx: AudioContext, vol: number) {
  const t = actx.currentTime;
  const n = (actx.sampleRate * 0.95) | 0;
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(); src.buffer = buf;
  const bpf = actx.createBiquadFilter();
  bpf.type = "bandpass"; bpf.frequency.value = 820; bpf.Q.value = 18;
  const env = actx.createGain();
  env.gain.setValueAtTime(0.72 * vol, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.82);
  src.connect(bpf); bpf.connect(env); env.connect(actx.destination);
  src.start(t); src.stop(t + 0.96);
}

function synthWater(actx: AudioContext, vol: number) {
  const t = actx.currentTime;
  const n = (actx.sampleRate * 0.42) | 0;
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(); src.buffer = buf;
  const lpf = actx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.setValueAtTime(900, t);
  lpf.frequency.exponentialRampToValueAtTime(180, t + 0.32);
  const env = actx.createGain();
  env.gain.setValueAtTime(0.56 * vol, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
  src.connect(lpf); lpf.connect(env); env.connect(actx.destination);
  src.start(t); src.stop(t + 0.44);
}

function synthEarth(actx: AudioContext, vol: number) {
  const t = actx.currentTime;
  const osc = actx.createOscillator(); osc.frequency.value = 72;
  const env = actx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.88 * vol, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
  osc.connect(env); env.connect(actx.destination);
  osc.start(t); osc.stop(t + 0.50);
}

function synthGlass(actx: AudioContext, vol: number) {
  const t = actx.currentTime;
  const osc = actx.createOscillator(); osc.frequency.value = 2440;
  const env = actx.createGain();
  env.gain.setValueAtTime(0.40 * vol, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.086);
  osc.connect(env); env.connect(actx.destination);
  osc.start(t); osc.stop(t + 0.10);
}

const SYNTHS = [synthWood, synthMetal, synthWater, synthEarth, synthGlass];

function playZone(actx: AudioContext, zi: number, loud: boolean) {
  SYNTHS[zi]?.(actx, loud ? 1.35 : 1.0);
}

/* ── component ─────────────────────────────────────────────────────────────── */
export default function TextureDrumPage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const actxRef    = useRef<AudioContext | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const flashRef   = useRef<Flash | null>(null);
  const rafRef     = useRef<number>(0);
  const dprRef     = useRef<number>(1);
  const hintRef    = useRef<boolean>(true);
  const activeRef  = useRef<Map<number, number>>(new Map());  // pointerId → zi
  const coordsRef  = useRef<Map<number, Coord>>(new Map());   // pointerId → canvas-px coords
  const timersRef  = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    function resize() {
      const cvs = canvasRef.current;
      if (!cvs) return;
      dprRef.current = window.devicePixelRatio || 1;
      if (cvs.offsetWidth > 0 && cvs.offsetHeight > 0) {
        cvs.width  = cvs.offsetWidth  * dprRef.current;
        cvs.height = cvs.offsetHeight * dprRef.current;
      }
    }
    resize();
    window.addEventListener("resize", resize);

    function getZi(cssX: number): number {
      return Math.min(4, Math.max(0, Math.floor((cssX / canvas.offsetWidth) * 5)));
    }

    function doHit(pointerId: number, zi: number) {
      const actx = actxRef.current;
      if (!actx) return;
      const loud = activeRef.current.size >= 2;
      playZone(actx, zi, loud);
      const coords = coordsRef.current.get(pointerId);
      const W = canvas.width, H = canvas.height;
      const cx = coords ? coords.x : (zi + 0.5) * (W / 5);
      const cy = coords ? coords.y : H * 0.42;
      const maxR = Math.sqrt(W * W + H * H) * 0.48;
      ripplesRef.current.push({ x: cx, y: cy, r: 0, maxR, a: 0.70, zi });
      if (loud) flashRef.current = { a: 0.28, zi };
      hintRef.current = false;
    }

    function onDown(e: PointerEvent) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      if (!actxRef.current) actxRef.current = new AudioContext();

      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const zi   = getZi(cssX);
      activeRef.current.set(e.pointerId, zi);
      coordsRef.current.set(e.pointerId, {
        x: cssX * dprRef.current,
        y: cssY * dprRef.current,
      });

      doHit(e.pointerId, zi);

      const pid = e.pointerId;
      const timer = setInterval(() => {
        const currentZi = activeRef.current.get(pid);
        if (currentZi !== undefined) doHit(pid, currentZi);
      }, 80);
      timersRef.current.set(pid, timer);
    }

    function onUp(e: PointerEvent) {
      activeRef.current.delete(e.pointerId);
      coordsRef.current.delete(e.pointerId);
      const t = timersRef.current.get(e.pointerId);
      if (t !== undefined) {
        clearInterval(t);
        timersRef.current.delete(e.pointerId);
      }
    }

    canvas.addEventListener("pointerdown",   onDown);
    canvas.addEventListener("pointerup",     onUp);
    canvas.addEventListener("pointercancel", onUp);

    let startTs = 0;
    function frame(ts: number) {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const W = canvas.width, H = canvas.height;
      const dpr = dprRef.current;
      const zW  = W / 5;
      const playH  = H * 0.80;
      const labelY = H * 0.80;

      ctx.fillStyle = "#080808";
      ctx.fillRect(0, 0, W, H);

      /* ── draw 5 material zones ── */
      for (let i = 0; i < 5; i++) {
        const zd = ZONES[i] ?? ZONES[0];
        const { r, g, b, emoji, name } = zd;
        const zx = i * zW;

        // subtle gradient background
        const grad = ctx.createLinearGradient(zx, 0, zx, playH);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.12)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0.05)`);
        ctx.fillStyle = grad;
        ctx.fillRect(zx, 0, zW, playH);

        // material texture (clipped to zone)
        ctx.save();
        ctx.beginPath();
        ctx.rect(zx, 0, zW, playH);
        ctx.clip();
        ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
        ctx.lineWidth = 1;

        if (i === 0) {
          // Wood — wavy horizontal grain
          for (let ly = 14 * dpr; ly < playH; ly += 16 * dpr) {
            ctx.beginPath();
            for (let px = zx; px <= zx + zW; px += 5) {
              const wy = ly + Math.sin(px * 0.013 + ly * 0.04) * 3.5 * dpr;
              if (px === zx) ctx.moveTo(px, wy); else ctx.lineTo(px, wy);
            }
            ctx.stroke();
          }
        } else if (i === 1) {
          // Metal — diagonal hatch lines
          for (let lx = zx - playH; lx < zx + zW + playH; lx += 22 * dpr) {
            ctx.beginPath();
            ctx.moveTo(lx, playH);
            ctx.lineTo(lx + playH, 0);
            ctx.stroke();
          }
        } else if (i === 2) {
          // Water — animated sine waves
          for (let row = 0; row < 9; row++) {
            const ly = (playH / 9) * (row + 0.5);
            ctx.beginPath();
            for (let px = zx; px <= zx + zW; px += 4) {
              const wy = ly + Math.sin(px * 0.024 + elapsed * 0.0017 + row * 0.88) * 5 * dpr;
              if (px === zx) ctx.moveTo(px, wy); else ctx.lineTo(px, wy);
            }
            ctx.stroke();
          }
        } else if (i === 3) {
          // Earth — stippled dots (deterministic positions)
          ctx.fillStyle = `rgba(${r},${g},${b},0.22)`;
          const maxX = Math.max(1, Math.floor(zW - 4 * dpr));
          const maxY = Math.max(1, Math.floor(playH - 4 * dpr));
          for (let d = 0; d < 110; d++) {
            const ex = zx + ((d * 139 + i * 43) % maxX) + 2 * dpr;
            const ey = ((d * 89 + i * 17) % maxY) + 2 * dpr;
            ctx.fillRect(ex, ey, 2.5 * dpr, 2.5 * dpr);
          }
        } else {
          // Glass — sparse sparkle crosses
          const maxX = Math.max(1, Math.floor(zW - 8 * dpr));
          const maxY = Math.max(1, Math.floor(playH - 8 * dpr));
          for (let s = 0; s < 22; s++) {
            const sx = zx + ((s * 173 + 31) % maxX) + 4 * dpr;
            const sy = ((s * 107 + 53) % maxY) + 4 * dpr;
            const sz = (3 + (s % 3)) * dpr;
            ctx.beginPath();
            ctx.moveTo(sx - sz, sy); ctx.lineTo(sx + sz, sy);
            ctx.moveTo(sx, sy - sz); ctx.lineTo(sx, sy + sz);
            ctx.stroke();
          }
        }
        ctx.restore();

        // zone separator
        if (i > 0) {
          ctx.strokeStyle = "rgba(255,255,255,0.07)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(zx, 0); ctx.lineTo(zx, H);
          ctx.stroke();
        }

        // label area
        ctx.fillStyle = `rgba(${r},${g},${b},0.08)`;
        ctx.fillRect(zx, labelY, zW, H - labelY);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.22)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(zx, labelY); ctx.lineTo(zx + zW, labelY);
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // emoji
        ctx.font = `${Math.round(34 * dpr)}px serif`;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(emoji, zx + zW * 0.5, labelY + (H - labelY) * 0.36);
        // name
        ctx.font = `bold ${Math.round(12 * dpr)}px ui-monospace, monospace`;
        ctx.fillStyle = `rgba(${r},${g},${b},0.90)`;
        ctx.fillText(name, zx + zW * 0.5, labelY + (H - labelY) * 0.75);
      }

      /* ── ripples ── */
      ripplesRef.current = ripplesRef.current.filter(rp => rp.a > 0.015);
      for (const rp of ripplesRef.current) {
        const zd = ZONES[rp.zi] ?? ZONES[0];
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${zd.r},${zd.g},${zd.b},${rp.a})`;
        ctx.lineWidth = 2.5 * dpr;
        ctx.shadowBlur  = 10 * dpr;
        ctx.shadowColor = `rgba(${zd.r},${zd.g},${zd.b},0.4)`;
        ctx.stroke();
        ctx.shadowBlur = 0;
        rp.r += (rp.maxR - rp.r) * 0.055;
        rp.a *= 0.875;
      }

      /* ── accent flash ── */
      const fl = flashRef.current;
      if (fl && fl.a > 0.01) {
        const zd = ZONES[fl.zi] ?? ZONES[0];
        ctx.fillStyle = `rgba(${zd.r},${zd.g},${zd.b},${fl.a})`;
        ctx.fillRect(0, 0, W, H);
        fl.a *= 0.72;
        if (fl.a <= 0.01) flashRef.current = null;
      }

      /* ── hint ── */
      if (hintRef.current) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${Math.round(14 * dpr)}px ui-monospace, monospace`;
        ctx.fillStyle = "rgba(255,255,255,0.38)";
        ctx.fillText("tap · hold to roll · two fingers for accent", W / 2, H * 0.43);
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
      for (const t of timersRef.current.values()) clearInterval(t);
      void actxRef.current?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-black text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Texture Drum</h1>
          <p className="text-base text-muted-foreground mt-0.5">
            Five surfaces · five sounds — wood, metal, water, earth, glass
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
        style={{ display: "block", cursor: "default" }}
      />

      <footer className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between">
        <span className="text-xs text-muted-foreground/70">
          For kids 3+ · Zero permissions · Zero API · Zero deps
        </span>
        <Link
          href="/dream/181-kids-texture-drum/README.md"
          className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          Design notes ↗
        </Link>
      </footer>
    </div>
  );
}
