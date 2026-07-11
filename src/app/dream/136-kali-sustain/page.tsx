"use client";
import { useEffect, useRef, useState } from "react";

const RATIOS = [
  { num: 3, den: 2, name: "Perfect Fifth",   frac: "3∶2", hsl: [265, 55, 55] as [number,number,number] },
  { num: 4, den: 3, name: "Perfect Fourth",  frac: "4∶3", hsl: [185, 50, 48] as [number,number,number] },
  { num: 5, den: 4, name: "Major Third",     frac: "5∶4", hsl: [42,  70, 52] as [number,number,number] },
  { num: 6, den: 5, name: "Minor Third",     frac: "6∶5", hsl: [340, 60, 52] as [number,number,number] },
  { num: 7, den: 4, name: "Harm. Seventh",   frac: "7∶4", hsl: [230, 50, 50] as [number,number,number] },
  { num: 9, den: 8, name: "Whole Tone",      frac: "9∶8", hsl: [155, 52, 46] as [number,number,number] },
];
const NR = RATIOS.length;
const ROOT_C2 = 65.406;
const HOLD_S = 12;
const GLIDE_S = 12;
const CYCLE_S = HOLD_S + GLIDE_S;

type Mode = "idle" | "demo" | "mic";

export default function KaliSustainPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mode === "idle") return;

    const ac = new AudioContext();

    const master = ac.createGain();
    master.gain.setValueAtTime(0, ac.currentTime);
    master.gain.linearRampToValueAtTime(0.65, ac.currentTime + 2.5);
    master.connect(ac.destination);

    const rootOsc = ac.createOscillator();
    const rootGain = ac.createGain();
    rootOsc.type = "sine";
    rootOsc.frequency.value = ROOT_C2;
    rootGain.gain.value = 0.10;
    rootOsc.connect(rootGain);
    rootGain.connect(master);

    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    lfoGain.connect(rootOsc.frequency);

    const harmOsc = ac.createOscillator();
    const harmGain = ac.createGain();
    harmOsc.type = "sine";
    harmOsc.frequency.value = ROOT_C2 * RATIOS[0].num / RATIOS[0].den;
    harmGain.gain.value = 0.08;
    harmOsc.connect(harmGain);
    harmGain.connect(master);

    const octOsc = ac.createOscillator();
    const octGain = ac.createGain();
    octOsc.type = "sine";
    octOsc.frequency.value = ROOT_C2 * 2;
    octGain.gain.value = 0.032;
    octOsc.connect(octGain);
    octGain.connect(master);

    rootOsc.start();
    lfo.start();
    harmOsc.start();
    octOsc.start();

    const startTime = ac.currentTime;
    let rootHz = ROOT_C2;
    let lastHarmUpdate = 0;
    let lastMicMs = 0;

    let micStream: MediaStream | null = null;
    let micAnalyser: AnalyserNode | null = null;
    const timeDomBuf = new Float32Array(2048);

    if (mode === "mic") {
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((s) => {
          micStream = s;
          const src = ac.createMediaStreamSource(s);
          micAnalyser = ac.createAnalyser();
          micAnalyser.fftSize = 2048;
          src.connect(micAnalyser);
        })
        .catch(() => {});
    }

    const detectPitch = (buf: Float32Array, sr: number): number => {
      const N = buf.length >> 1;
      let maxR = -1;
      let bestT = -1;
      for (let tau = 80; tau < N; tau++) {
        let r = 0;
        for (let i = 0; i < N; i++) r += buf[i] * buf[i + tau];
        if (r > maxR) { maxR = r; bestT = tau; }
      }
      if (bestT <= 0) return -1;
      let rms = 0;
      for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
      if (Math.sqrt(rms / N) < 0.01) return -1;
      return sr / bestT;
    };

    const canvas = canvasRef.current!;
    const ctx2d = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    let rafId = 0;

    const frame = (nowMs: number) => {
      const nowAc = ac.currentTime;
      const elapsed = Math.max(0, nowAc - startTime);
      const totalPos = elapsed % (CYCLE_S * NR);
      const idx = Math.floor(totalPos / CYCLE_S) % NR;
      const within = totalPos - idx * CYCLE_S;
      const glideT = Math.max(0, Math.min(1, (within - HOLD_S) / GLIDE_S));
      const curR = RATIOS[idx];
      const nextR = RATIOS[(idx + 1) % NR];

      if (nowMs - lastHarmUpdate > 200) {
        lastHarmUpdate = nowMs;
        const ratioNow =
          curR.num / curR.den +
          glideT * (nextR.num / nextR.den - curR.num / curR.den);
        harmOsc.frequency.setTargetAtTime(rootHz * ratioNow, nowAc, 0.25);
      }

      if (mode === "mic" && micAnalyser && nowMs - lastMicMs > 600) {
        lastMicMs = nowMs;
        micAnalyser.getFloatTimeDomainData(timeDomBuf);
        const p = detectPitch(timeDomBuf, ac.sampleRate);
        if (p > 40 && p < 500 && Math.abs(p - rootHz) / rootHz > 0.02) {
          rootHz = p;
          rootOsc.frequency.setTargetAtTime(rootHz, nowAc, 0.3);
          octOsc.frequency.setTargetAtTime(rootHz * 2, nowAc, 0.3);
        }
      }

      // --- Draw ---
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      const [h1, s1, l1] = curR.hsl;
      const [h2, s2, l2] = nextR.hsl;
      const bh = h1 + (h2 - h1) * glideT;
      const bs = s1 + (s2 - s1) * glideT;
      const bl = l1 + (l2 - l1) * glideT;

      ctx2d.fillStyle = `hsl(${bh},${bs * 0.18}%,${3 + bl * 0.08}%)`;
      ctx2d.fillRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H * 0.42;
      const clockR = Math.min(W * 0.36, H * 0.34, 170);

      // Clock track
      ctx2d.save();
      ctx2d.strokeStyle = `hsla(${bh},${bs}%,${bl}%,0.10)`;
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, clockR, 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.restore();

      // Ratio nodes
      for (let i = 0; i < NR; i++) {
        const angle = (i / NR) * Math.PI * 2 - Math.PI / 2;
        const nx = cx + Math.cos(angle) * clockR;
        const ny = cy + Math.sin(angle) * clockR;
        const [nh, ns, nl] = RATIOS[i].hsl;
        const isActive = i === idx;
        const r = isActive ? 9 : 5;
        const alpha = isActive ? 0.95 : 0.40;

        ctx2d.save();
        ctx2d.shadowBlur = isActive ? 20 : 0;
        ctx2d.shadowColor = `hsla(${nh},${ns}%,${nl}%,0.9)`;
        ctx2d.beginPath();
        ctx2d.arc(nx, ny, r, 0, Math.PI * 2);
        ctx2d.fillStyle = `hsla(${nh},${ns}%,${nl}%,${alpha})`;
        ctx2d.fill();
        ctx2d.restore();

        // Fraction label
        ctx2d.fillStyle = `hsla(${nh},${ns}%,${nl * 1.3}%,${isActive ? 0.9 : 0.35})`;
        ctx2d.font = `${isActive ? 13 : 11}px monospace`;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        const labelDist = clockR + 22;
        ctx2d.fillText(
          RATIOS[i].frac,
          cx + Math.cos(angle) * labelDist,
          cy + Math.sin(angle) * labelDist
        );
      }

      // Sweep indicator dot
      const sweepFrac = (idx + glideT) / NR;
      const sweepAngle = sweepFrac * Math.PI * 2 - Math.PI / 2;
      const dotX = cx + Math.cos(sweepAngle) * clockR;
      const dotY = cy + Math.sin(sweepAngle) * clockR;

      ctx2d.save();
      ctx2d.shadowBlur = 28;
      ctx2d.shadowColor = `hsla(${bh},90%,85%,0.95)`;
      ctx2d.beginPath();
      ctx2d.arc(dotX, dotY, 7, 0, Math.PI * 2);
      ctx2d.fillStyle = `hsla(${bh},80%,88%,0.98)`;
      ctx2d.fill();
      ctx2d.restore();

      // Spoke from center to dot
      ctx2d.save();
      ctx2d.strokeStyle = `hsla(${bh},60%,70%,0.12)`;
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(cx, cy);
      ctx2d.lineTo(dotX, dotY);
      ctx2d.stroke();
      ctx2d.restore();

      // Center text: interval name
      ctx2d.shadowBlur = 0;
      ctx2d.fillStyle = `hsla(${bh},80%,85%,0.90)`;
      ctx2d.font = "bold 17px monospace";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillText(curR.name, cx, cy - 10);

      ctx2d.fillStyle = `hsla(${bh},60%,72%,0.65)`;
      ctx2d.font = "13px monospace";
      ctx2d.fillText(curR.frac, cx, cy + 12);

      // Timer bar (thin arc showing hold vs glide phase)
      const barR = clockR * 0.55;
      const holdEnd = (HOLD_S / CYCLE_S) * Math.PI * 2 - Math.PI / 2;
      const progressAngle = (within / CYCLE_S) * Math.PI * 2 - Math.PI / 2;
      const arcStart = -Math.PI / 2;

      ctx2d.save();
      ctx2d.strokeStyle = `hsla(${bh},40%,60%,0.12)`;
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, barR, 0, Math.PI * 2);
      ctx2d.stroke();

      ctx2d.strokeStyle = `hsla(${bh},70%,70%,${glideT > 0 ? 0.55 : 0.85})`;
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, barR, arcStart, Math.min(progressAngle, holdEnd));
      ctx2d.stroke();

      if (glideT > 0) {
        ctx2d.strokeStyle = `hsla(${bh},55%,65%,0.45)`;
        ctx2d.lineWidth = 2;
        ctx2d.setLineDash([3, 4]);
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, barR, holdEnd, progressAngle);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
      }
      ctx2d.restore();

      // Bottom labels
      ctx2d.shadowBlur = 0;
      ctx2d.fillStyle = "rgba(255,255,255,0.35)";
      ctx2d.font = "11px monospace";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "alphabetic";
      const phase = glideT > 0 ? `glide → ${nextR.frac}` : "hold";
      ctx2d.fillText(phase, cx, H * 0.82);

      if (mode === "mic") {
        ctx2d.fillStyle = "rgba(255,255,255,0.28)";
        ctx2d.fillText(`root ${Math.round(rootHz)} Hz`, cx, H * 0.86);
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      master.gain.setTargetAtTime(0, ac.currentTime, 0.4);
      setTimeout(() => {
        rootOsc.stop();
        lfo.stop();
        harmOsc.stop();
        octOsc.stop();
        ac.close();
      }, 600);
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  if (mode === "idle") {
    return (
      <div className="relative flex flex-col items-center justify-center h-full gap-6 text-center px-6">
        <div className="text-5xl leading-none select-none opacity-70">◎</div>
        <h1 className="text-2xl font-semibold text-foreground">Kali Sustain</h1>
        <p className="text-base text-muted-foreground max-w-xs">
          A C2 drone cycles through six just-intonation intervals — each held twelve
          seconds then gliding to the next. The clock shows where you are in the
          harmonic journey.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => setMode("demo")}
            className="min-h-[48px] px-8 py-3 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-base hover:bg-violet-500/30 transition-colors"
          >
            Begin (C2 root)
          </button>
          <button
            onClick={() => setMode("mic")}
            className="min-h-[48px] px-8 py-3 rounded-full bg-violet-500/15 border border-violet-400/25 text-violet-200 text-base hover:bg-violet-500/25 transition-colors"
          >
            Mic mode — tune to my voice
          </button>
        </div>
        <p className="text-xs text-muted-foreground/70">headphones recommended</p>
        <a
          href="/dream/136-kali-sustain/README.md"
          className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors absolute bottom-4 right-4"
        >
          design notes ↗
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <button
        onClick={() => setMode("idle")}
        className="absolute top-4 right-4 text-muted-foreground/70 hover:text-muted-foreground text-xs transition-colors"
      >
        ✕ stop
      </button>
    </div>
  );
}
