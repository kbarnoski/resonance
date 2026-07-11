"use client";
import { useRef, useEffect } from "react";

// C3, E3, G3 — a C major triad
const FREQS = [130.81, 164.81, 196.0];
const RGBS: [number, number, number][] = [
  [255, 72, 110],  // rose  → C3
  [255, 165, 30],  // amber → E3
  [128, 68, 255],  // violet → G3
];
const NOTE_LABELS = ["C", "E", "G"];
const R = 108; // circle radius in CSS px
const GAIN_LEVELS = [0.042, 0.14, 0.22]; // ambient, one overlap, two overlaps

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    circles: [
      { x: 0, y: 0, overlapCount: 0, osc: null as OscillatorNode | null, gain: null as GainNode | null },
      { x: 0, y: 0, overlapCount: 0, osc: null as OscillatorNode | null, gain: null as GainNode | null },
      { x: 0, y: 0, overlapCount: 0, osc: null as OscillatorNode | null, gain: null as GainNode | null },
    ],
    actx: null as AudioContext | null,
    dragIdx: -1,
    dragOff: { dx: 0, dy: 0 },
    started: false,
  });
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = stateRef.current;

    const placeCircles = (w: number, h: number) => {
      st.circles[0].x = w * 0.27;  st.circles[0].y = h * 0.38;
      st.circles[1].x = w * 0.73;  st.circles[1].y = h * 0.38;
      st.circles[2].x = w * 0.50;  st.circles[2].y = h * 0.70;
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      placeCircles(w, h);
    };

    const beginAudio = () => {
      if (st.actx) return;
      const actx = new AudioContext();
      st.actx = actx;
      for (let i = 0; i < 3; i++) {
        const osc = actx.createOscillator();
        const gn = actx.createGain();
        osc.type = "triangle";
        osc.frequency.value = FREQS[i];
        gn.gain.value = 0.042;
        osc.connect(gn);
        gn.connect(actx.destination);
        osc.start();
        st.circles[i].osc = osc;
        st.circles[i].gain = gn;
      }
    };

    const computeOverlaps = () => {
      const c = st.circles;
      for (let i = 0; i < 3; i++) c[i].overlapCount = 0;
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const dx = c[i].x - c[j].x;
          const dy = c[i].y - c[j].y;
          const threshold = R * 2;
          if (dx * dx + dy * dy < threshold * threshold) {
            c[i].overlapCount++;
            c[j].overlapCount++;
          }
        }
      }
    };

    const applyGains = () => {
      const actx = st.actx;
      if (!actx) return;
      const t = actx.currentTime;
      for (let i = 0; i < 3; i++) {
        const gn = st.circles[i].gain;
        if (gn) gn.gain.setTargetAtTime(GAIN_LEVELS[st.circles[i].overlapCount], t, 0.05);
      }
    };

    const drawFrame = (ts: number) => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#09090f";
      ctx.fillRect(0, 0, w, h);

      computeOverlaps();
      if (st.started) applyGains();

      const pulse = Math.sin(ts * 0.0016) * 5; // gentle ±5px breathe when isolated

      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 3; i++) {
        const c = st.circles[i];
        const oc = c.overlapCount;
        const rgb = RGBS[i];
        const rVal = rgb[0], gVal = rgb[1], bVal = rgb[2];
        const radius = R + (oc === 0 ? pulse : 0);
        ctx.save();
        ctx.globalAlpha = 0.44 + oc * 0.13;
        ctx.shadowColor = `rgb(${rVal},${gVal},${bVal})`;
        ctx.shadowBlur = 18 + oc * 22;
        ctx.beginPath();
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${rVal},${gVal},${bVal})`;
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      // Faint note labels inside circles (readable by parents, invisible to kids in flow)
      ctx.font = "bold 22px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < 3; i++) {
        const c = st.circles[i];
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillText(NOTE_LABELS[i], c.x, c.y);
      }

      // Pre-start hint
      if (!st.started) {
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.font = "17px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("drag the circles together", w / 2, h * 0.1);
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    const findCircle = (x: number, y: number) => {
      for (let i = 2; i >= 0; i--) {
        const dx = x - st.circles[i].x;
        const dy = y - st.circles[i].y;
        if (dx * dx + dy * dy <= (R + 12) * (R + 12)) return i;
      }
      return -1;
    };

    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const idx = findCircle(x, y);
      if (idx < 0) return;
      if (!st.started) { st.started = true; beginAudio(); }
      st.dragIdx = idx;
      st.dragOff.dx = x - st.circles[idx].x;
      st.dragOff.dy = y - st.circles[idx].y;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (st.dragIdx < 0) return;
      const rect = canvas.getBoundingClientRect();
      st.circles[st.dragIdx].x = e.clientX - rect.left - st.dragOff.dx;
      st.circles[st.dragIdx].y = e.clientY - rect.top - st.dragOff.dy;
    };

    const onUp = () => { st.dragIdx = -1; };

    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(drawFrame);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      st.actx?.close();
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#09090f] text-foreground select-none">
      <div className="px-5 pt-8 pb-3">
        <h1 className="text-2xl font-bold text-foreground mb-1">Color Mix</h1>
        <p className="text-base text-muted-foreground">
          Three colors, three notes. Drag them together — the colors mix and the music grows.
          When all three meet, a C major chord glows white.
        </p>
      </div>
      <canvas
        ref={canvasRef}
        className="flex-1 w-full touch-none"
        style={{ cursor: "grab", minHeight: 0 }}
      />
      <p className="text-xs text-muted-foreground px-5 py-3 text-center">
        <a href="/dream/149-kids-color-mix/README.md" className="underline hover:text-muted-foreground transition-colors">
          design notes
        </a>
        {" · "}For kids 3+ · Zero permissions · Zero API · Zero deps
      </p>
    </div>
  );
}
