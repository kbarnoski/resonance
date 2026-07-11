'use client';
import { useEffect, useRef, useState } from 'react';

// C-major pentatonic: C D E G A — three octaves
const PENTA_HZ = [
  130.81, 146.83, 164.81, 196.0, 220.0,
  261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25,
];

// Bilinear zone weights from normalised position:
// [sun(top-right), cloud(top-left), rain(bottom-left), wind(bottom-right)]
function computeZoneWeights(xNorm: number, yNorm: number): number[] {
  const x = Math.max(0, Math.min(1, xNorm));
  const y = Math.max(0, Math.min(1, yNorm));
  return [
    x * (1 - y),         // sun  — top-right
    (1 - x) * (1 - y),   // cloud — top-left
    (1 - x) * y,          // rain  — bottom-left
    x * y,                 // wind  — bottom-right
  ];
}

// For multiple pointers: take the max weight per zone
function mergeZoneWeights(all: number[][]): number[] {
  if (all.length === 0) return [0, 0, 0, 0];
  return [0, 1, 2, 3].map(i => Math.max(...all.map(w => w[i])));
}

function buildImpulse(ac: AudioContext, dur: number, dec: number): AudioBuffer {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, dec);
    }
  }
  return buf;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  cr: number; cg: number; cb: number;
  size: number;
}

interface SunRay {
  angle: number;
  speed: number;
  len: number;
}

const ZONES = [
  { icon: '☀️', name: 'Sun',   pos: 'top right',    color: '#fbbf24' },
  { icon: '☁️', name: 'Cloud', pos: 'top left',     color: '#94a3b8' },
  { icon: '🌧️', name: 'Rain',  pos: 'bottom left',  color: '#38bdf8' },
  { icon: '💨', name: 'Wind',  pos: 'bottom right', color: '#34d399' },
];

export default function KidsWeatherMusic() {
  const [started, setStarted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ptrsRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Audio ──────────────────────────────────────────────────────────────────
    const ac = new AudioContext();
    const master = ac.createGain();
    master.gain.value = 0.75;
    master.connect(ac.destination);

    const rev = ac.createConvolver();
    rev.buffer = buildImpulse(ac, 1.8, 3.5);
    const revGain = ac.createGain();
    revGain.gain.value = 0.22;
    rev.connect(revGain);
    revGain.connect(master);

    // Per-zone gain nodes
    const sunGain = ac.createGain();
    const cloudGain = ac.createGain();
    const rainGain = ac.createGain();
    const windGain = ac.createGain();
    sunGain.gain.value = 0.01;  sunGain.connect(master);
    cloudGain.gain.value = 0.02; cloudGain.connect(master); cloudGain.connect(rev);
    rainGain.gain.value = 0.01;  rainGain.connect(master);
    windGain.gain.value = 0.02;  windGain.connect(master); windGain.connect(rev);

    // Cloud: Am chord — A3 C4 E4, always running
    const cloudOscs = [220.0, 261.63, 329.63].map(freq => {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(cloudGain);
      o.start();
      return o;
    });

    // Wind: glissando oscillator, always running
    const windOsc = ac.createOscillator();
    windOsc.type = 'sine';
    windOsc.frequency.value = PENTA_HZ[3]; // G3
    windOsc.connect(windGain);
    windOsc.start();

    let windPhase = 0;
    let sunNoteIdx = 0;
    let lastSunMs = 0;
    let lastRainMs = 0;
    const SUN_FREQS = [261.63, 329.63, 392.0, 523.25]; // C4 E4 G4 C5

    function triggerSunNote(nowMs: number, weight: number) {
      if (weight < 0.02) return;
      const interval = 185 + (1 - weight) * 1100;
      if (nowMs - lastSunMs < interval) return;
      lastSunMs = nowMs;
      const freq = SUN_FREQS[sunNoteIdx++ % SUN_FREQS.length];
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const env = ac.createGain();
      env.gain.setValueAtTime(0, ac.currentTime);
      env.gain.linearRampToValueAtTime(0.38 * weight, ac.currentTime + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.4);
      o.connect(env);
      env.connect(sunGain);
      o.start();
      o.stop(ac.currentTime + 0.45);
    }

    function triggerRainDrop(nowMs: number, weight: number) {
      if (weight < 0.02) return;
      const interval = 100 + (1 - weight) * 750;
      if (nowMs - lastRainMs < interval) return;
      lastRainMs = nowMs;
      const freq = PENTA_HZ[Math.floor(Math.random() * PENTA_HZ.length)];
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const env = ac.createGain();
      env.gain.setValueAtTime(0, ac.currentTime);
      env.gain.linearRampToValueAtTime(0.28 * weight, ac.currentTime + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.26);
      o.connect(env);
      env.connect(rainGain);
      o.start();
      o.stop(ac.currentTime + 0.3);
    }

    // ── Canvas ─────────────────────────────────────────────────────────────────
    let dpr = window.devicePixelRatio || 1;
    const doResize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    doResize();
    const rObs = new ResizeObserver(doResize);
    rObs.observe(canvas);
    const ctx = canvas.getContext('2d')!;

    // Particle arrays
    const cloudPuffs: Particle[] = [];
    const rainDrops: Particle[] = [];
    const windStreaks: Particle[] = [];

    // Sun rays (static angle state, mutated each frame)
    const rays: SunRay[] = Array.from({ length: 14 }, (_, i) => ({
      angle: (i / 14) * Math.PI * 2,
      speed: 0.003 + Math.random() * 0.002,
      len: 0.5 + Math.random() * 0.4,
    }));

    // Smoothed zone weights (exponential moving average)
    let smSun = 0, smCloud = 0, smRain = 0, smWind = 0;
    let lastCloudSpawn = 0, lastRainSpawn = 0, lastWindSpawn = 0;
    let animId = 0;

    const drawFrame = (nowMs: number) => {
      animId = requestAnimationFrame(drawFrame);
      const W = canvas.width;
      const H = canvas.height;
      const CW = canvas.offsetWidth;
      const CH = canvas.offsetHeight;

      // Compute target zone weights from active pointers
      const pts = ptrsRef.current;
      let targets: number[];
      if (pts.size > 0) {
        const all: number[][] = [];
        pts.forEach(({ x, y }) => all.push(computeZoneWeights(x / CW, y / CH)));
        targets = mergeZoneWeights(all);
      } else {
        targets = [0.05, 0.05, 0.05, 0.05]; // quiet ambient when idle
      }

      // Smooth weights toward targets
      smSun   = smSun   * 0.88 + targets[0] * 0.12;
      smCloud = smCloud * 0.88 + targets[1] * 0.12;
      smRain  = smRain  * 0.88 + targets[2] * 0.12;
      smWind  = smWind  * 0.88 + targets[3] * 0.12;

      // Update audio gains
      sunGain.gain.setTargetAtTime(smSun * 0.55, ac.currentTime, 0.08);
      cloudGain.gain.setTargetAtTime(smCloud * 0.28 + 0.014, ac.currentTime, 0.12);
      rainGain.gain.setTargetAtTime(smRain * 0.5, ac.currentTime, 0.06);
      windGain.gain.setTargetAtTime(smWind * 0.38 + 0.012, ac.currentTime, 0.1);

      // Wind glissando: oscillator frequency sweeps through pentatonic scale
      windPhase += 0.005 + smWind * 0.02;
      const wfi = ((Math.sin(windPhase) + 1) / 2) * (PENTA_HZ.length - 1);
      const wlo = Math.floor(wfi);
      const whi = Math.min(wlo + 1, PENTA_HZ.length - 1);
      windOsc.frequency.setTargetAtTime(
        PENTA_HZ[wlo] + (PENTA_HZ[whi] - PENTA_HZ[wlo]) * (wfi - wlo),
        ac.currentTime, 0.18,
      );

      // Trigger discrete notes for sun and rain
      triggerSunNote(nowMs, smSun);
      triggerRainDrop(nowMs, smRain);

      // ── Draw ────────────────────────────────────────────────────────────────
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, W, H);

      const maxDist = Math.sqrt(W * W + H * H) * 0.62;

      // Corner glow backgrounds
      if (smSun > 0.01) {
        const sunGrad = ctx.createRadialGradient(W, 0, 0, W, 0, maxDist);
        const sa = Math.min(0.55, smSun * 0.72);
        sunGrad.addColorStop(0,    `rgba(253,224,71,${sa})`);
        sunGrad.addColorStop(0.45, `rgba(251,191,36,${sa * 0.3})`);
        sunGrad.addColorStop(1,    'rgba(251,191,36,0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, W, H);
      }
      if (smCloud > 0.01) {
        const clGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxDist);
        const ca = Math.min(0.42, smCloud * 0.56);
        clGrad.addColorStop(0,    `rgba(148,163,184,${ca})`);
        clGrad.addColorStop(0.45, `rgba(100,116,139,${ca * 0.3})`);
        clGrad.addColorStop(1,    'rgba(100,116,139,0)');
        ctx.fillStyle = clGrad;
        ctx.fillRect(0, 0, W, H);
      }
      if (smRain > 0.01) {
        const rnGrad = ctx.createRadialGradient(0, H, 0, 0, H, maxDist);
        const ra = Math.min(0.5, smRain * 0.66);
        rnGrad.addColorStop(0,    `rgba(56,189,248,${ra})`);
        rnGrad.addColorStop(0.45, `rgba(14,165,233,${ra * 0.3})`);
        rnGrad.addColorStop(1,    'rgba(14,165,233,0)');
        ctx.fillStyle = rnGrad;
        ctx.fillRect(0, 0, W, H);
      }
      if (smWind > 0.01) {
        const wdGrad = ctx.createRadialGradient(W, H, 0, W, H, maxDist);
        const wa = Math.min(0.5, smWind * 0.66);
        wdGrad.addColorStop(0,    `rgba(52,211,153,${wa})`);
        wdGrad.addColorStop(0.45, `rgba(16,185,129,${wa * 0.3})`);
        wdGrad.addColorStop(1,    'rgba(16,185,129,0)');
        ctx.fillStyle = wdGrad;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Sun rays from top-right corner ──────────────────────────────────────
      if (smSun > 0.04) {
        const dLen = Math.sqrt(W * W + H * H);
        ctx.globalCompositeOperation = 'lighter';
        for (const ray of rays) {
          ray.angle += ray.speed * (0.2 + smSun * 0.8);
          const alpha = Math.min(0.3, smSun * 0.36);
          const ex = W + Math.cos(ray.angle) * dLen * ray.len;
          const ey = 0 + Math.sin(ray.angle) * dLen * ray.len;
          const rayGrad = ctx.createLinearGradient(W, 0, ex, ey);
          rayGrad.addColorStop(0, `rgba(253,224,71,${alpha})`);
          rayGrad.addColorStop(1, 'rgba(253,224,71,0)');
          ctx.fillStyle = rayGrad;
          const perp = ray.angle + Math.PI / 2;
          const sp = dLen * 0.038;
          ctx.beginPath();
          ctx.moveTo(W, 0);
          ctx.lineTo(ex + Math.cos(perp) * sp, ey + Math.sin(perp) * sp);
          ctx.lineTo(ex - Math.cos(perp) * sp, ey - Math.sin(perp) * sp);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // ── Cloud puffs in top-left quadrant ────────────────────────────────────
      if (smCloud > 0.06 && nowMs - lastCloudSpawn > 260 / smCloud) {
        lastCloudSpawn = nowMs;
        cloudPuffs.push({
          x: Math.random() * W * 0.5,
          y: Math.random() * H * 0.4,
          vx: (Math.random() - 0.5) * 0.4 * dpr,
          vy: -(0.15 + Math.random() * 0.3) * dpr,
          life: 1,
          cr: 148, cg: 163, cb: 184,
          size: (28 + Math.random() * 44) * dpr,
        });
      }
      for (let i = cloudPuffs.length - 1; i >= 0; i--) {
        const p = cloudPuffs[i];
        p.life -= 0.005;
        p.x += p.vx;
        p.y += p.vy;
        if (p.life <= 0) { cloudPuffs.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${p.life * smCloud * 0.3})`;
        ctx.fill();
      }

      // ── Rain drops in bottom-left quadrant ──────────────────────────────────
      if (smRain > 0.05 && nowMs - lastRainSpawn > 65 / smRain) {
        lastRainSpawn = nowMs;
        for (let n = 0; n < Math.ceil(smRain * 2.5); n++) {
          rainDrops.push({
            x: Math.random() * W * 0.55,
            y: 0,
            vx: (Math.random() - 0.3) * 0.5 * dpr,
            vy: (3.5 + Math.random() * 3) * dpr,
            life: 1,
            cr: 56, cg: 189, cb: 248,
            size: (1.5 + Math.random() * 2.5) * dpr,
          });
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = rainDrops.length - 1; i >= 0; i--) {
        const p = rainDrops[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.016;
        if (p.life <= 0 || p.y > H + 10) { rainDrops.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${p.life * smRain * 0.65})`;
        ctx.fill();
      }

      // ── Wind streaks in bottom-right quadrant ───────────────────────────────
      if (smWind > 0.05 && nowMs - lastWindSpawn > 55 / smWind) {
        lastWindSpawn = nowMs;
        for (let n = 0; n < Math.ceil(smWind * 3); n++) {
          windStreaks.push({
            x: W * 0.5 + Math.random() * W * 0.5,
            y: H * 0.55 + Math.random() * H * 0.45,
            vx: -(2.5 + Math.random() * 3.5) * dpr,
            vy: (Math.random() - 0.5) * 1.2 * dpr,
            life: 1,
            cr: 52, cg: 211, cb: 153,
            size: (1.5 + Math.random() * 2.5) * dpr,
          });
        }
      }
      for (let i = windStreaks.length - 1; i >= 0; i--) {
        const p = windStreaks[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.025 * dpr;
        p.life -= 0.011;
        if (p.life <= 0 || p.x < -10) { windStreaks.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * 4.5, p.size, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${p.life * smWind * 0.6})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    animId = requestAnimationFrame(drawFrame);

    // ── Pointer events ─────────────────────────────────────────────────────────
    const pts = ptrsRef.current;

    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, getPos(e));
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, getPos(e));
    };
    const onUp = (e: PointerEvent) => { pts.delete(e.pointerId); };

    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    return () => {
      cancelAnimationFrame(animId);
      rObs.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      cloudOscs.forEach(o => o.stop(0));
      windOsc.stop(0);
      ac.close();
    };
  }, [started]);

  if (!started) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-6 py-10">
        <h1 className="text-3xl font-bold text-foreground text-center mb-3">
          Weather Music
        </h1>
        <p className="text-base text-muted-foreground text-center mb-8 max-w-sm leading-relaxed">
          Touch and hold anywhere to play the weather.<br />
          Drag between corners to blend the sounds.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-10 w-full max-w-xs">
          {ZONES.map(z => (
            <div key={z.name} className="rounded-2xl bg-muted border border-border p-4 text-center">
              <div className="text-4xl mb-1">{z.icon}</div>
              <div className="text-base font-medium" style={{ color: z.color }}>{z.name}</div>
              <div className="text-sm text-muted-foreground">{z.pos}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setStarted(true)}
          className="min-h-[64px] px-10 rounded-2xl text-xl font-bold text-foreground bg-violet-600 hover:bg-violet-500 transition-colors"
        >
          Play ☁️☀️🌧️💨
        </button>
        <p className="text-sm text-muted-foreground/70 mt-4 text-center">No permissions needed</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] relative overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
      />
      {/* Corner icons — HTML overlays for reliable emoji rendering */}
      <span className="absolute top-3 right-4 text-3xl pointer-events-none select-none opacity-50">☀️</span>
      <span className="absolute top-3 left-4  text-3xl pointer-events-none select-none opacity-50">☁️</span>
      <span className="absolute bottom-10 left-4  text-3xl pointer-events-none select-none opacity-50">🌧️</span>
      <span className="absolute bottom-10 right-4 text-3xl pointer-events-none select-none opacity-50">💨</span>
      <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none">
        <span className="text-sm text-muted-foreground/70">hold · drag · blend</span>
      </div>
    </div>
  );
}
