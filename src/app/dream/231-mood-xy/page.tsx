"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ─── chord voicing tables (semitones from C in the base octave) ───────────────
const CHORDS: Record<string, readonly number[]> = {
  major:      [0, 4, 7, 12, 16, 19],   // C E G C' E' G'
  minor:      [0, 3, 7, 12, 15, 19],   // C Eb G C' Eb' G'
  diminished: [0, 3, 6,  9, 12, 15],   // C Eb Gb A C' Eb'
};

type ChordType = "major" | "minor" | "diminished";

type SynthParams = {
  valence:   number;      // –1 (sad) … +1 (happy)
  arousal:   number;      //  0 (calm) … +1 (excited)
  bpm:       number;      // 40–140
  voices:    number;      // 1–6
  attackSec: number;      // 0.02–0.82 s
  durSec:    number;      // 0.4–3.0 s
  filterHz:  number;      // 200–4200 Hz
  chordType: ChordType;
  baseOct:   number;      // 2, 3, or 4
  oscType:   OscillatorType;
  stagger:   number;      // 0–0.045 s between arpeggio voices
};

function midiHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function synthParams(nx: number, ny: number): SynthParams {
  const valence   = nx * 2 - 1;
  const arousal   = 1 - ny;
  const bpm       = 40 + arousal * 100;
  const voices    = Math.max(1, Math.round(1 + arousal * 5));
  const attackSec = 0.02 + (1 - arousal) * 0.8;
  const durSec    = 0.4 + ((1 - (valence + 1) / 2)) * 2.6;
  const filterHz  = 200 + ((valence + 1) / 2) * 4000;
  const chordType: ChordType =
    valence > 0.33 ? "major" : valence < -0.33 ? "diminished" : "minor";
  const baseOct   = arousal < 0.33 ? 2 : arousal < 0.66 ? 3 : 4;
  const oscType: OscillatorType = arousal > 0.55 ? "triangle" : "sine";
  const stagger   = arousal > 0.5 ? 0.045 : 0;
  return { valence, arousal, bpm, voices, attackSec, durSec, filterHz, chordType, baseOct, oscType, stagger };
}

function playChord(
  ctx: AudioContext,
  master: GainNode,
  when: number,
  p: SynthParams,
) {
  const chord = CHORDS[p.chordType];
  const n = Math.min(p.voices, chord.length);
  const vol = 0.16 / n;
  for (let i = 0; i < n; i++) {
    const t    = when + i * p.stagger;
    const midi = 24 + p.baseOct * 12 + chord[i];
    const freq = midiHz(midi);

    const osc  = ctx.createOscillator();
    osc.type   = p.oscType;
    osc.frequency.value = freq;

    const flt  = ctx.createBiquadFilter();
    flt.type   = "lowpass";
    flt.frequency.value = p.filterHz;
    flt.Q.value = 1.2;

    const env  = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + p.attackSec);
    env.gain.linearRampToValueAtTime(0, t + p.durSec);

    osc.connect(flt);
    flt.connect(env);
    env.connect(master);

    osc.start(t);
    osc.stop(t + p.durSec + 0.05);
  }
}

// bilinear blend of 4 dark quadrant tones → background RGB
function bgRGB(valence: number, arousal: number): [number, number, number] {
  const vn = (valence + 1) / 2; // 0=sad … 1=happy
  const an = arousal;            // 0=calm … 1=excited
  // quadrant target colors (dark, rich)
  const eH = [42, 20,  8] as const;  // excited·happy — deep amber
  const eS = [20,  4, 38] as const;  // excited·sad   — deep purple
  const cH = [ 8, 28, 40] as const;  // calm·happy    — deep teal
  const cS = [ 6,  6, 28] as const;  // calm·sad      — deep navy

  const top: [number, number, number] = [
    eS[0] * (1 - vn) + eH[0] * vn,
    eS[1] * (1 - vn) + eH[1] * vn,
    eS[2] * (1 - vn) + eH[2] * vn,
  ];
  const bot: [number, number, number] = [
    cS[0] * (1 - vn) + cH[0] * vn,
    cS[1] * (1 - vn) + cH[1] * vn,
    cS[2] * (1 - vn) + cH[2] * vn,
  ];
  return [
    bot[0] * (1 - an) + top[0] * an,
    bot[1] * (1 - an) + top[1] * an,
    bot[2] * (1 - an) + top[2] * an,
  ];
}

const TRAIL_MAX = 72;

export default function MoodXY() {
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const animRef     = useRef(0);
  const schedRef    = useRef(0);
  const audioRef    = useRef<AudioContext | null>(null);
  const masterRef   = useRef<GainNode | null>(null);
  const nextNoteRef = useRef(0);
  const dotRef      = useRef({ x: 0.5, y: 0.5 });
  const dragging    = useRef(false);
  const trailRef    = useRef<Array<{ x: number; y: number }>>([]);
  const bgRef       = useRef<[number, number, number]>([6, 6, 28]);
  const [started, setStarted] = useState(false);

  // ── pointer events ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toNorm = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      };
    };
    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      canvas.setPointerCapture(e.pointerId);
      dotRef.current = toNorm(e);
    };
    const onMove = (e: PointerEvent) => {
      if (dragging.current) dotRef.current = toNorm(e);
    };
    const onUp = () => { dragging.current = false; };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup",   onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup",   onUp);
    };
  }, []);

  // ── render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !started) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    let dpr = 1, w = 0, h = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      c.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (now: number) => {
      const dot = dotRef.current;
      const p   = synthParams(dot.x, dot.y);

      // smooth background toward target quadrant color
      const [tr, tg, tb] = bgRGB(p.valence, p.arousal);
      const [cr, cg, cb] = bgRef.current;
      const lr = 0.04;
      bgRef.current = [cr + (tr - cr) * lr, cg + (tg - cg) * lr, cb + (tb - cb) * lr];
      c.fillStyle = `rgb(${bgRef.current[0] | 0},${bgRef.current[1] | 0},${bgRef.current[2] | 0})`;
      c.fillRect(0, 0, w, h);

      // fading trail
      const trail = trailRef.current;
      trail.push({ x: dot.x, y: dot.y });
      if (trail.length > TRAIL_MAX) trail.shift();
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i];
        const alpha = (i / TRAIL_MAX) * 0.44;
        const rad   = 2 + (i / TRAIL_MAX) * 7;
        c.beginPath();
        c.arc(t.x * w, t.y * h, rad, 0, Math.PI * 2);
        c.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
        c.fill();
      }

      // center axis dashes
      c.save();
      c.strokeStyle = "rgba(255,255,255,0.09)";
      c.lineWidth = 1;
      c.setLineDash([5, 7]);
      c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
      c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
      c.setLineDash([]);
      c.restore();

      // edge axis labels
      c.font = "11px 'Courier New', monospace";
      c.fillStyle = "rgba(255,255,255,0.38)";
      c.textAlign = "center";
      c.fillText("EXCITED", w / 2, 16);
      c.fillText("CALM",    w / 2, h - 8);

      c.save();
      c.translate(13, h / 2);
      c.rotate(-Math.PI / 2);
      c.textAlign = "center";
      c.fillText("SAD", 0, 0);
      c.restore();

      c.save();
      c.translate(w - 13, h / 2);
      c.rotate(-Math.PI / 2);
      c.textAlign = "center";
      c.fillText("HAPPY", 0, 0);
      c.restore();

      // corner quadrant labels
      c.font = "10px 'Courier New', monospace";
      c.fillStyle = "rgba(255,255,255,0.22)";
      c.textAlign = "left";
      c.fillText("excited · happy", w / 2 + 10, 30);
      c.fillText("calm · happy",    w / 2 + 10, h - 20);
      c.textAlign = "right";
      c.fillText("excited · sad",   w / 2 - 10, 30);
      c.fillText("calm · sad",      w / 2 - 10, h - 20);

      // dot: beat-synced glow pulse
      const dx = dot.x * w;
      const dy = dot.y * h;
      const beatMs  = (60 / p.bpm) * 1000;
      const phase   = (now % beatMs) / beatMs;
      const pulse   = 0.72 + 0.28 * Math.sin(phase * Math.PI * 2);
      const glowR   = 42 * pulse;

      const grd = c.createRadialGradient(dx, dy, 0, dx, dy, glowR);
      grd.addColorStop(0,    "rgba(255,255,255,0.85)");
      grd.addColorStop(0.25, "rgba(255,255,255,0.28)");
      grd.addColorStop(1,    "rgba(255,255,255,0)");
      c.beginPath();
      c.arc(dx, dy, glowR, 0, Math.PI * 2);
      c.fillStyle = grd;
      c.fill();

      c.beginPath();
      c.arc(dx, dy, 9, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255,0.95)";
      c.fill();

      // HUD: quadrant · chord · BPM at bottom center
      c.textAlign = "center";
      c.font = "13px 'Courier New', monospace";
      c.fillStyle = "rgba(255,255,255,0.60)";
      const quadLabel = `${p.arousal >= 0.5 ? "excited" : "calm"} · ${p.valence >= 0 ? "happy" : "sad"}`;
      const chLabel   = p.chordType === "diminished" ? "dim" : p.chordType;
      c.fillText(`${quadLabel}  ·  ${chLabel}  ·  ${Math.round(p.bpm)} bpm`, w / 2, h - 36);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  // ── audio look-ahead scheduler ─────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;

    const ctx    = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.70;
    master.connect(ctx.destination);
    audioRef.current  = ctx;
    masterRef.current = master;
    nextNoteRef.current = ctx.currentTime + 0.05;

    const audioTick = () => {
      const a = audioRef.current;
      const m = masterRef.current;
      if (!a || !m) return;

      const dot = dotRef.current;
      const p   = synthParams(dot.x, dot.y);

      // catch up if tab was backgrounded
      if (nextNoteRef.current < a.currentTime - 0.5) {
        nextNoteRef.current = a.currentTime + 0.02;
      }

      const interval  = 60 / p.bpm;
      const lookahead = 0.15;
      while (nextNoteRef.current < a.currentTime + lookahead) {
        playChord(a, m, nextNoteRef.current, p);
        nextNoteRef.current += interval;
      }

      schedRef.current = requestAnimationFrame(audioTick);
    };
    audioTick();

    return () => {
      cancelAnimationFrame(schedRef.current);
      ctx.close();
      audioRef.current  = null;
      masterRef.current = null;
    };
  }, [started]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#06061c]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ touchAction: "none" }}
      />

      {/* title — always visible */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h1 className="text-xl font-semibold text-foreground">Mood XY</h1>
      </div>

      {/* start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/55">
          <h2 className="text-3xl font-semibold text-foreground">Mood XY</h2>
          <p className="text-base text-muted-foreground text-center max-w-sm px-6 leading-relaxed">
            Drag the dot through the emotion plane.<br />
            The music synthesizes to match where you are.
          </p>
          <p className="text-sm text-muted-foreground font-mono">
            valence (sad ↔ happy) · arousal (calm ↔ excited)
          </p>
          <button
            onClick={() => setStarted(true)}
            className="mt-2 px-8 py-3 rounded-full bg-violet-500/80 hover:bg-violet-500 transition-colors text-foreground text-base font-medium min-h-[44px]"
          >
            Start
          </button>
        </div>
      )}

      {/* nav */}
      <div className="absolute bottom-4 left-4 z-10">
        <Link
          href="/dream"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
