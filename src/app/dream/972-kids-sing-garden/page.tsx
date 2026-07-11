"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { detectPitch } from "./pitch";
import {
  allDegrees,
  degreeInfo,
  DRONE_MIDIS,
  DEMO_PHRASE,
  midiToHz,
  runVoiceLeading,
  snapToDegree,
  type ChordEvent,
} from "./harmony";

// ---------------------------------------------------------------------------
// Visual model: a watercolor/ink garden that accumulates as the child sings.
// Each held note grows a plant (pitch -> height); each chord underneath blooms
// a flower whose color encodes harmonic function. Louder voice = bolder stroke.
// ---------------------------------------------------------------------------

interface Plant {
  x: number; // 0..1 fraction of canvas width
  height: number; // 0..1 (tall = high pitch)
  degree: number; // scale degree 1..7 (drives petal count)
  color: string;
  bold: number; // 0..1 stroke boldness from loudness
  bloom: number; // 0..1 bloom animation progress
  born: number; // ms timestamp
  cadence: boolean;
  sway: number; // random phase
}

const MAX_PLANTS = 26;
const NEW_PLANT_MS = 260; // throttle: at most one new plant per this interval

function drawGarden(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plants: Plant[],
  now: number,
  livePitch: { degree: number; height: number; color: string; level: number } | null
): void {
  // Soft paper wash background (ink-and-watercolor, NOT cosmic glow).
  ctx.fillStyle = "#f6f1e7";
  ctx.fillRect(0, 0, w, h);
  // faint paper grain bands
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < h; i += 4) {
    ctx.fillStyle = i % 8 === 0 ? "#000000" : "#ffffff";
    ctx.fillRect(0, i, w, 1);
  }
  ctx.globalAlpha = 1;

  // ground wash
  const grd = ctx.createLinearGradient(0, h * 0.62, 0, h);
  grd.addColorStop(0, "rgba(63,174,107,0.0)");
  grd.addColorStop(1, "rgba(63,120,80,0.22)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  const groundY = h * 0.92;

  for (const p of plants) {
    const age = (now - p.born) / 1000;
    const bloom = Math.min(1, p.bloom + age * 0); // bloom updated in step()
    const x = p.x * w;
    const stemH = (0.12 + p.height * 0.7) * h;
    const sway = Math.sin(now / 900 + p.sway) * (6 + p.height * 14);
    const topX = x + sway;
    const topY = groundY - stemH * bloom;

    // watercolor pooled base — a soft translucent blob at the root
    ctx.globalAlpha = 0.16 + p.bold * 0.12;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(x, groundY, 14 + p.bold * 22, 7 + p.bold * 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // ink stem — wobbly bezier, boldness controls width
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "rgba(40,60,45,0.8)";
    ctx.lineWidth = 1.5 + p.bold * 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.bezierCurveTo(
      x - 8,
      groundY - stemH * 0.4 * bloom,
      topX + 10,
      topY + stemH * 0.4,
      topX,
      topY
    );
    ctx.stroke();

    // a couple of leaves along the stem
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#3f8f5e";
    for (let li = 1; li <= 2; li++) {
      const t = li / 3;
      const lx = x + (topX - x) * t;
      const ly = groundY - stemH * bloom * t;
      const dir = li % 2 === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.ellipse(lx + dir * 10, ly, 12, 5, dir * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // bloom — layered translucent petals (watercolor wet-on-wet feel)
    const r = (8 + p.height * 16 + p.bold * 8) * bloom;
    const petals = 5 + (p.degree % 3);
    ctx.globalAlpha = 0.32 + p.bold * 0.18;
    for (let layer = 0; layer < 3; layer++) {
      const lr = r * (1 - layer * 0.22);
      ctx.fillStyle = p.color;
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2 + layer * 0.4 + now / 4000;
        const px = topX + Math.cos(a) * lr * 0.62;
        const py = topY + Math.sin(a) * lr * 0.62;
        ctx.beginPath();
        ctx.ellipse(px, py, lr * 0.6, lr * 0.42, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // golden center / cadence halo
    ctx.globalAlpha = 0.9 * bloom;
    ctx.fillStyle = p.cadence ? "#fff3c4" : "#ffe08a";
    ctx.beginPath();
    ctx.arc(topX, topY, Math.max(2, r * 0.28), 0, Math.PI * 2);
    ctx.fill();
    if (p.cadence) {
      // resolution ripple — a warm ring announcing "home"
      const ripple = Math.min(1, age / 1.1);
      ctx.globalAlpha = (1 - ripple) * 0.5;
      ctx.strokeStyle = "#f7c948";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(topX, topY, r + ripple * 60, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // live pitch indicator — a soft vertical brush where the current note sits
  if (livePitch) {
    ctx.globalAlpha = 0.18 + livePitch.level * 0.4;
    ctx.fillStyle = livePitch.color;
    const lx = w * 0.5;
    const lh = (0.12 + livePitch.height * 0.7) * h;
    ctx.fillRect(lx - 6 - livePitch.level * 18, groundY - lh, 12 + livePitch.level * 36, lh);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------

interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  // upper accompaniment voices (3) + bass (1) as held, retuned oscillators
  voices: { osc: OscillatorNode; gain: GainNode }[];
  bass: { osc: OscillatorNode; gain: GainNode };
  dronePad: GainNode;
}

export default function KidsSingGardenPage() {
  const [started, setStarted] = useState(false);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [lastLabel, setLastLabel] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // audio
  const graphRef = useRef<AudioGraph | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);

  // harmony / visual state held in refs (mutated inside rAF)
  const plantsRef = useRef<Plant[]>([]);
  const prevVoicesRef = useRef<number[] | null>(null);
  const prevDegreeRef = useRef<number | null>(null);
  const lastPlantAtRef = useRef(0);
  const lastDegreeChangeRef = useRef(0);
  const stableDegreeRef = useRef<number | null>(null);
  const livePitchRef = useRef<{
    degree: number;
    height: number;
    color: string;
    level: number;
  } | null>(null);

  // auto-demo
  const demoActiveRef = useRef(false);
  const demoIdxRef = useRef(0);
  const demoNextAtRef = useRef(0);

  // ---- audio helpers ------------------------------------------------------

  const buildGraph = useCallback((ctx: AudioContext): AudioGraph => {
    const master = ctx.createGain();
    master.gain.value = 0.26;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6500;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;

    master.connect(lp);
    lp.connect(comp);
    comp.connect(ctx.destination);

    // always-on soft tonic drone pad
    const dronePad = ctx.createGain();
    dronePad.gain.value = 0.0;
    dronePad.connect(master);
    for (const m of DRONE_MIDIS) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = midiToHz(m);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(dronePad);
      o.start();
    }
    dronePad.gain.linearRampToValueAtTime(0.0, ctx.currentTime);
    dronePad.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);

    // three accompaniment voices + bass, started silent and retuned live
    const voices = Array.from({ length: 3 }, () => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = midiToHz(60);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      return { osc, gain };
    });
    const bassOsc = ctx.createOscillator();
    bassOsc.type = "triangle";
    bassOsc.frequency.value = midiToHz(43);
    const bassGain = ctx.createGain();
    bassGain.gain.value = 0;
    bassOsc.connect(bassGain);
    bassGain.connect(master);
    bassOsc.start();

    return { ctx, master, voices, bass: { osc: bassOsc, gain: bassGain }, dronePad };
  }, []);

  // Apply a chord event to the audio graph (gentle, roughly constant level so
  // singing louder never makes the synth harsh).
  const applyChord = useCallback((ev: ChordEvent) => {
    const g = graphRef.current;
    if (!g) return;
    const t = g.ctx.currentTime;
    const GLIDE = 0.12; // smooth voice-leading glide between chord tones
    ev.voices.forEach((m, i) => {
      const v = g.voices[i];
      if (!v) return;
      v.osc.frequency.cancelScheduledValues(t);
      v.osc.frequency.linearRampToValueAtTime(midiToHz(m), t + GLIDE);
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.linearRampToValueAtTime(0.16, t + 0.06);
    });
    g.bass.osc.frequency.cancelScheduledValues(t);
    g.bass.osc.frequency.linearRampToValueAtTime(midiToHz(ev.bass), t + GLIDE);
    g.bass.gain.gain.cancelScheduledValues(t);
    g.bass.gain.gain.linearRampToValueAtTime(ev.cadence ? 0.24 : 0.2, t + 0.06);
  }, []);

  // Commit a sung/tapped scale degree: voice-lead the harmony + grow a plant.
  const commitDegree = useCallback(
    (degree: number, melodyHeight: number, level: number, now: number) => {
      const ev = runVoiceLeading(degree, prevVoicesRef.current, prevDegreeRef.current);
      prevVoicesRef.current = ev.voices;
      prevDegreeRef.current = degree;
      applyChord(ev);

      const info = degreeInfo(degree);
      setLastLabel(`${info.label} · ${info.fn}${ev.cadence ? " · home ✿" : ""}`);

      if (now - lastPlantAtRef.current > NEW_PLANT_MS) {
        lastPlantAtRef.current = now;
        plantsRef.current.push({
          x: 0.06 + Math.random() * 0.88,
          height: melodyHeight,
          degree,
          color: ev.color,
          bold: Math.min(1, 0.3 + level * 1.6),
          bloom: 0,
          born: now,
          cadence: ev.cadence,
          sway: Math.random() * Math.PI * 2,
        });
        if (plantsRef.current.length > MAX_PLANTS) plantsRef.current.shift();
      }
    },
    [applyChord]
  );

  // ---- main loop ----------------------------------------------------------

  const stepFrame = useCallback(() => {
    const now = performance.now();
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(stepFrame);
      return;
    }
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      rafRef.current = requestAnimationFrame(stepFrame);
      return;
    }

    // animate blooms
    for (const p of plantsRef.current) {
      p.bloom = Math.min(1, p.bloom + 0.045);
    }

    // ---- AUTO-DEMO: sing a short phrase ending in a cadence ----
    if (demoActiveRef.current) {
      if (now >= demoNextAtRef.current) {
        const phrase = DEMO_PHRASE;
        const degree = phrase[demoIdxRef.current % phrase.length];
        // map degree to a pleasant height (1 low .. 7 high) for the demo
        const height = 0.2 + (degree - 1) / 6 * 0.7;
        commitDegree(degree, height, 0.5, now);
        livePitchRef.current = {
          degree,
          height,
          color: degreeInfo(degree).color,
          level: 0.5,
        };
        demoIdxRef.current++;
        demoNextAtRef.current = now + 420;
        if (demoIdxRef.current >= phrase.length) {
          demoActiveRef.current = false;
          // let voices fade after the cadence; live mic (if any) takes over
        }
      }
    }

    // ---- LIVE MIC pitch detection ----
    const analyser = analyserRef.current;
    const buf = timeBufRef.current;
    const g = graphRef.current;
    if (analyser && buf && g && !demoActiveRef.current) {
      analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
      const { hz, rms } = detectPitch(buf, g.ctx.sampleRate);
      if (hz > 0) {
        const { degree, melodyMidi } = snapToDegree(hz);
        const height = Math.max(0, Math.min(1, (melodyMidi - 48) / 36));
        const level = Math.min(1, rms * 6);
        livePitchRef.current = {
          degree,
          height,
          color: degreeInfo(degree).color,
          level,
        };
        // Only commit a new chord when the degree is held stable briefly —
        // avoids retriggering on every jittery frame.
        if (stableDegreeRef.current !== degree) {
          stableDegreeRef.current = degree;
          lastDegreeChangeRef.current = now;
        } else if (
          now - lastDegreeChangeRef.current > 90 &&
          prevDegreeRef.current !== degree
        ) {
          commitDegree(degree, height, level, now);
        }
      } else {
        // gate down voices gently during silence (drone keeps it alive)
        livePitchRef.current = null;
        stableDegreeRef.current = null;
        const t = g.ctx.currentTime;
        for (const v of g.voices) {
          v.gain.gain.cancelScheduledValues(t);
          v.gain.gain.linearRampToValueAtTime(0.04, t + 0.4);
        }
        g.bass.gain.gain.cancelScheduledValues(t);
        g.bass.gain.gain.linearRampToValueAtTime(0.06, t + 0.4);
        prevDegreeRef.current = null;
      }
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    drawGarden(ctx2d, w, h, plantsRef.current, now, livePitchRef.current);

    rafRef.current = requestAnimationFrame(stepFrame);
  }, [commitDegree]);

  // ---- start / teardown ---------------------------------------------------

  const start = useCallback(async () => {
    if (started) return;
    setStarted(true);

    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    graphRef.current = buildGraph(ctx);

    // try mic
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * 4)
      );
      src.connect(analyser); // NOT connected to destination — no feedback
      setMicOk(true);
    } catch (e) {
      setMicOk(false);
      setMicError(
        e instanceof Error
          ? "Microphone is off, so use the colored sing-pads below. " + e.message
          : "Microphone is off, so use the colored sing-pads below."
      );
    }

    // hands-free auto-demo within ~1s so a glance sees + hears a cadence
    demoActiveRef.current = true;
    demoIdxRef.current = 0;
    demoNextAtRef.current = performance.now() + 800;

    rafRef.current = requestAnimationFrame(stepFrame);
  }, [started, buildGraph, stepFrame]);

  // size the canvas to its box, dpr-aware
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      const c = canvas.getContext("2d");
      if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [started]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const g = graphRef.current;
      if (g) {
        try {
          g.voices.forEach((v) => v.osc.stop());
          g.bass.osc.stop();
        } catch {
          // already stopped
        }
        try {
          g.master.disconnect();
        } catch {
          // ignore
        }
        void g.ctx.close();
      }
      graphRef.current = null;
      analyserRef.current = null;
      timeBufRef.current = null;
    };
  }, []);

  // a sing-pad tap routes through the IDENTICAL accompaniment pipeline
  const tapPad = useCallback(
    (degree: number) => {
      demoActiveRef.current = false;
      const now = performance.now();
      const height = 0.2 + ((degree - 1) / 6) * 0.7;
      commitDegree(degree, height, 0.6, now);
      livePitchRef.current = {
        degree,
        height,
        color: degreeInfo(degree).color,
        level: 0.6,
      };
      // brief auto-release of the live indicator
      window.setTimeout(() => {
        if (livePitchRef.current?.degree === degree) livePitchRef.current = null;
      }, 500);
    },
    [commitDegree]
  );

  const pads = allDegrees();

  return (
    <main className="min-h-screen bg-neutral-950 text-foreground flex flex-col">
      <header className="px-4 pt-5 pb-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Sing Garden{" "}
          <span className="text-violet-300 font-mono text-base align-middle">
            972
          </span>
        </h1>
        <p className="text-base text-muted-foreground mt-1 max-w-2xl">
          Sing any note. The garden grows a flower and a real chord blooms{" "}
          <span className="text-foreground">underneath</span> to hold your voice —
          no wrong notes, real harmony.
        </p>
      </header>

      {/* Canvas garden */}
      <div className="relative flex-1 min-h-[44vh] px-3">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-2xl shadow-inner"
          style={{ touchAction: "none" }}
          aria-label="Watercolor garden that grows as you sing"
        />

        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-950/70 rounded-2xl">
            <button
              onClick={start}
              className="min-h-[72px] min-w-[72px] px-8 py-5 rounded-full bg-violet-500 hover:bg-violet-400 active:scale-95 transition text-foreground text-xl font-semibold shadow-lg"
            >
              ▶ Start singing
            </button>
            <p className="text-base text-muted-foreground font-mono">
              tap to wake the garden + mic
            </p>
          </div>
        )}

        {started && lastLabel && (
          <div className="absolute top-3 left-3 font-mono text-base text-neutral-900 bg-muted rounded-lg px-3 py-1.5">
            {lastLabel}
          </div>
        )}
      </div>

      {/* mic error / fallback notice */}
      {started && micOk === false && (
        <p className="px-4 pt-3 text-base text-violet-300 font-mono">
          {micError ?? "Microphone is off — use the colored sing-pads below."}
        </p>
      )}
      {started && micOk === true && (
        <p className="px-4 pt-3 text-base text-muted-foreground font-mono">
          🎤 Listening locally — your voice is never recorded or sent anywhere.
          Or tap a pad.
        </p>
      )}

      {/* Sing pads — always available, color = harmonic function */}
      {started && (
        <div className="px-3 pt-3 pb-5">
          <div className="grid grid-cols-7 gap-2 max-w-3xl mx-auto">
            {pads.map((d) => (
              <button
                key={d.degree}
                onClick={() => tapPad(d.degree)}
                className="min-h-[64px] rounded-xl active:scale-95 transition flex items-center justify-center text-neutral-900 font-mono text-lg font-bold shadow"
                style={{ backgroundColor: d.color }}
                aria-label={`Sing scale degree ${d.degree}, ${d.fn} chord`}
              >
                {d.degree}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Design notes */}
      <div className="px-4 pb-8">
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] px-4 py-2.5 rounded-lg bg-muted hover:bg-accent text-foreground text-base font-mono"
        >
          {showNotes ? "Hide" : "Read"} the design notes
        </button>
        {showNotes && (
          <div className="mt-3 max-w-2xl text-base text-muted-foreground space-y-3 leading-relaxed">
            <p>
              <span className="text-foreground">The question:</span> what if a
              child sang any note and a real harmonic garden grew a chord that
              genuinely <span className="text-violet-300">supports</span> it —
              no wrong notes, but real functional harmony underneath, not a safe
              pentatonic?
            </p>
            <p>
              Your voice is the melody, snapped to the nearest degree of{" "}
              <span className="font-mono">C major</span> (always in tune). Each
              degree implies its diatonic triad (1→I, 2→ii, 3→iii, 4→IV, 5→V,
              6→vi, 7→vii°) and three inner voices + a bass{" "}
              <span className="text-foreground">voice-lead</span> to the nearest
              chord tones. Sing 5 then 1, or land on the leading tone (7) and
              resolve, to hear a real V→I cadence — the warm gold halo means
              &ldquo;home.&rdquo;
            </p>
            <p className="font-mono text-sm text-muted-foreground">
              input: mic / live voice pitch (autocorrelation/YIN) · output:
              Canvas2D watercolor/ink garden · technique: functional
              voice-leading accompaniment · vibe: ink-and-watercolor, not cosmic
              glow.
            </p>
            <p className="text-sm">
              Color = function: tonic gold (home), dominant orange (tension),
              subdominant green, predominant/minor cool blue &amp; violet.
            </p>
            <Link
              href="/dream"
              className="inline-block mt-2 text-violet-300 hover:text-violet-200 font-mono text-base"
            >
              ← back to the lab
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
