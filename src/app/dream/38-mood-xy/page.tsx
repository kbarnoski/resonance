"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";

// ── Chord definitions ─────────────────────────────────────────────────────────
const CHORD_MAJOR = [0, 4, 7];
const CHORD_MINOR = [0, 3, 7];
const CHORD_DIM   = [0, 3, 6];

function chordForValence(vl: number): number[] {
  if (vl > 0.33) return CHORD_MAJOR;
  if (vl < -0.33) return CHORD_DIM;
  return CHORD_MINOR;
}

function chordNameFor(vl: number): string {
  if (vl > 0.33) return "major";
  if (vl < -0.33) return "dim";
  return "minor";
}

// ── Mood → audio parameter mappings ──────────────────────────────────────────

// arousal [-1,1] → BPM [40, 140]
function bpmFor(ar: number): number {
  return Math.round(40 + ((ar + 1) / 2) * 100);
}

// arousal [-1,1] → simultaneous voice count [1, 4]
function voicesFor(ar: number): number {
  return Math.max(1, Math.round(1 + ((ar + 1) / 2) * 3));
}

// arousal [-1,1] → base frequency: C3 (calm) to C5 (excited)
function baseFreqFor(ar: number): number {
  return 130.81 * Math.pow(2, ((ar + 1) / 2) * 2);
}

// arousal [-1,1] → attack time: 0.8s (slow pads) to 0.04s (staccato)
function attackFor(ar: number): number {
  return Math.max(0.02, 0.8 - ((ar + 1) / 2) * 0.76);
}

// Note duration: primary driver is arousal (beat fraction), secondary is valence (sadder = longer)
function durationFor(ar: number, bpm: number, vl: number): number {
  const beatDur = 60 / bpm;
  // calm → 90% of beat (sustained pad); excited → 25% of beat (staccato)
  const arFactor = 0.9 - ((ar + 1) / 2) * 0.65;
  // sad → 40% longer sustain than happy
  const vlMod = 1 + ((1 - vl) / 2) * 0.4;
  return beatDur * arFactor * vlMod;
}

// valence [-1,1] → filter cutoff: 400 Hz (dull, sad) to 5000 Hz (bright, happy)
function filterFcFor(vl: number): number {
  return 400 * Math.pow(12.5, (vl + 1) / 2);
}

// ── Quadrant label ────────────────────────────────────────────────────────────
function quadLabel(vl: number, ar: number): string {
  const a = ar > 0.15 ? "energetic" : ar < -0.15 ? "calm" : "still";
  const v = vl > 0.15 ? "happy" : vl < -0.15 ? "sad" : "neutral";
  return `${a} · ${v}`;
}

// ── Background color: bilinear blend of 4 quadrant hues ───────────────────────
// Corners: excited+happy=amber, excited+sad=purple, calm+happy=teal, calm+sad=navy
function bgRgb(vl: number, ar: number): [number, number, number] {
  const tx = (vl + 1) / 2;  // 0=sad  → 1=happy
  const ty = (ar + 1) / 2;  // 0=calm → 1=excited
  // [excited+happy, excited+sad, calm+happy, calm+sad]
  const c: [number, number, number][] = [
    [210, 130, 20],  // amber
    [80, 0, 190],    // purple
    [10, 150, 100],  // teal
    [5, 20, 110],    // navy
  ];
  return [
    Math.round(ty * tx * c[0][0] + ty * (1 - tx) * c[1][0] + (1 - ty) * tx * c[2][0] + (1 - ty) * (1 - tx) * c[3][0]),
    Math.round(ty * tx * c[0][1] + ty * (1 - tx) * c[1][1] + (1 - ty) * tx * c[2][1] + (1 - ty) * (1 - tx) * c[3][1]),
    Math.round(ty * tx * c[0][2] + ty * (1 - tx) * c[1][2] + (1 - ty) * tx * c[2][2] + (1 - ty) * (1 - tx) * c[3][2]),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MoodXY() {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const posRef     = useRef({ vl: 0, ar: 0 }); // current mood position
  const isDragging = useRef(false);
  const acRef      = useRef<AudioContext | null>(null);
  const filterRef  = useRef<BiquadFilterNode | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailRef   = useRef<{ vl: number; ar: number; t: number }[]>([]);
  const animRef    = useRef(0);

  const [playing,  setPlaying]  = useState(false);
  const [label,    setLabel]    = useState("still · neutral");
  const [hudBpm,   setHudBpm]   = useState(70);
  const [hudChord, setHudChord] = useState("minor");

  // Convert canvas pointer coords to mood space [-1, 1]
  const moodFromPtr = useCallback(
    (cx: number, cy: number, w: number, h: number) => ({
      vl: Math.max(-1, Math.min(1, (cx / w) * 2 - 1)),
      ar: Math.max(-1, Math.min(1, 1 - (cy / h) * 2)),
    }),
    []
  );

  // Schedule one oscillator note with an ADSR envelope
  const fireNote = useCallback(
    (freq: number, startTime: number, attack: number, dur: number, voices: number) => {
      const ac   = acRef.current;
      const filt = filterRef.current;
      if (!ac || !filt) return;
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(filt);
      osc.type = "triangle";
      osc.frequency.value = freq;
      // Peak gain normalised for voice count (RMS-ish sum)
      const peak = 0.18 / Math.sqrt(voices);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(peak, startTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
      osc.start(startTime);
      osc.stop(startTime + dur + 0.05);
    },
    []
  );

  // Trigger one chord event from the current mood position
  const triggerChord = useCallback(() => {
    const ac   = acRef.current;
    const filt = filterRef.current;
    if (!ac || !filt) return;
    const { vl, ar } = posRef.current;
    const bpm       = bpmFor(ar);
    const voices    = voicesFor(ar);
    const chord     = chordForValence(vl);
    const baseFreq  = baseFreqFor(ar);
    const dur       = durationFor(ar, bpm, vl);
    const rawAttack = attackFor(ar);
    const attack    = Math.min(rawAttack, dur * 0.4); // attack never exceeds 40% of note
    const isArp     = ar > 0.2; // arpeggiate when energetic
    const arpStep   = isArp ? (60 / bpm) / voices : 0;
    const now       = ac.currentTime;

    // Smooth filter transition toward current valence brightness
    filt.frequency.exponentialRampToValueAtTime(
      Math.max(80, filterFcFor(vl)),
      now + 0.3
    );

    for (let i = 0; i < Math.min(voices, chord.length); i++) {
      fireNote(baseFreq * Math.pow(2, chord[i] / 12), now + i * arpStep, attack, dur, voices);
    }
  }, [fireNote]);

  // Start audio engine and scheduler
  const startPlaying = useCallback(() => {
    const ac    = new AudioContext();
    acRef.current = ac;

    const filt = ac.createBiquadFilter();
    filt.type  = "lowpass";
    filt.frequency.value = 2000;
    filt.Q.value = 0.7;
    filterRef.current = filt;

    const master = ac.createGain();
    master.gain.value = 0.7;
    filt.connect(master);
    master.connect(ac.destination);

    // Fire once immediately, then on each beat
    triggerChord();
    setPlaying(true);

    const tick = () => {
      triggerChord();
      timerRef.current = setTimeout(tick, 60000 / bpmFor(posRef.current.ar));
    };
    timerRef.current = setTimeout(tick, 60000 / bpmFor(posRef.current.ar));
  }, [triggerChord]);

  // Stop audio engine
  const stopPlaying = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    acRef.current?.close();
    acRef.current   = null;
    filterRef.current = null;
    setPlaying(false);
  }, []);

  // ── Pointer handling ────────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      isDragging.current = true;
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const mood = moodFromPtr(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
      posRef.current = mood;
      trailRef.current.push({ ...mood, t: Date.now() });
    },
    [moodFromPtr]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDragging.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mood = moodFromPtr(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
      posRef.current = mood;
      trailRef.current.push({ ...mood, t: Date.now() });
      if (trailRef.current.length > 500) trailRef.current.splice(0, 150);
    },
    [moodFromPtr]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // ── Canvas render loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const el = canvas.parentElement;
      w = el ? el.clientWidth : window.innerWidth;
      h = el ? el.clientHeight : window.innerHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let lastHud = 0;

    const render = (ts: number) => {
      const { vl, ar } = posRef.current;
      const [rr, gg, bb] = bgRgb(vl, ar);

      // Clear to near-black
      ctx.fillStyle = "rgb(6,6,10)";
      ctx.fillRect(0, 0, w, h);

      // Mood-colored glow centered at the dot
      const dx = ((vl + 1) / 2) * w;
      const dy = ((1 - ar) / 2) * h;
      const glow = ctx.createRadialGradient(dx, dy, 0, dx, dy, Math.min(w, h) * 0.72);
      glow.addColorStop(0, `rgba(${rr},${gg},${bb},0.32)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Axis grid (dashed)
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);   ctx.lineTo(w / 2, h);
      ctx.moveTo(0, h / 2);   ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Axis labels
      ctx.font = "10px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.textAlign = "right";
      ctx.fillText("← sad", w / 2 - 14, h / 2 - 8);
      ctx.textAlign = "left";
      ctx.fillText("happy →", w / 2 + 14, h / 2 - 8);
      ctx.textAlign = "center";
      ctx.fillText("energetic ↑", w / 2, 18);
      ctx.fillText("↓ calm", w / 2, h - 8);

      // Quadrant corner labels (very faint)
      ctx.font = "9px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.textAlign = "left";
      ctx.fillText("energetic · happy", w / 2 + 12, 40);
      ctx.fillText("calm · happy", w / 2 + 12, h - 28);
      ctx.textAlign = "right";
      ctx.fillText("energetic · sad", w / 2 - 12, 40);
      ctx.fillText("calm · sad", w / 2 - 12, h - 28);

      // Trail (additive blending for brightness)
      const nowMs = Date.now();
      ctx.globalCompositeOperation = "lighter";
      for (const pt of trailRef.current) {
        const age = (nowMs - pt.t) / 3500;
        if (age >= 1) continue;
        const tx = ((pt.vl + 1) / 2) * w;
        const ty = ((1 - pt.ar) / 2) * h;
        ctx.beginPath();
        ctx.arc(tx, ty, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.22 * (1 - age)})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      trailRef.current = trailRef.current.filter(pt => nowMs - pt.t < 3500);

      // Dot glow halo
      ctx.shadowBlur = 28;
      ctx.shadowColor = `rgb(${rr},${gg},${bb})`;
      ctx.beginPath();
      ctx.arc(dx, dy, 13, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner mood-colored dot
      ctx.beginPath();
      ctx.arc(dx, dy, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fill();

      // HUD text update ~5 Hz
      if (ts - lastHud > 200) {
        lastHud = ts;
        setLabel(quadLabel(vl, ar));
        setHudBpm(bpmFor(ar));
        setHudChord(chordNameFor(vl));
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Cleanup audio on unmount
  useEffect(() => () => { stopPlaying(); }, [stopPlaying]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      {/* Mood-plane canvas — always rendered, even before Play */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: "crosshair" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* Top-center: live mood label */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center pointer-events-none">
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/70 mb-1">Mood XY</div>
        <div className="text-lg tracking-wide text-foreground">{label}</div>
        {playing && (
          <div className="text-[11px] text-muted-foreground/70 mt-1 tracking-wider">
            {hudBpm} BPM · {hudChord}
          </div>
        )}
      </div>

      {/* Pre-play splash */}
      {!playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="pointer-events-auto text-center px-6">
            <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Mood XY</h1>
            <p className="text-sm text-muted-foreground max-w-sm mb-2 leading-relaxed">
              Navigate your musical mood on a 2D plane.
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-xs mb-6 leading-relaxed">
              X axis: valence — sad ← → happy.<br />
              Y axis: arousal — calm ↕ energetic.<br />
              Drag the dot. The synthesizer follows.
            </p>
            <button
              onClick={startPlaying}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              ▶ Play
            </button>
            <Link
              href="/dream"
              className="block mt-8 text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
            >
              ← back to dream sandbox
            </Link>
          </div>
        </div>
      )}

      {/* Running controls */}
      {playing && (
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end pointer-events-auto">
          <button
            onClick={stopPlaying}
            className="text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded"
          >
            stop
          </button>
          <Link href="/dream" className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground">
            ← back
          </Link>
        </div>
      )}

      {/* Design notes link */}
      <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/70 pointer-events-none select-none">
        /dream/38-mood-xy
      </div>
    </div>
  );
}
