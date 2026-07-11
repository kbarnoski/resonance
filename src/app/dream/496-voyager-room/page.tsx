"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AgentSpec,
  BrainState,
  NoteEvent,
  buildAgents,
  chooseNote,
  isDue,
  answeringEdge,
  tensionLabel,
  midiName,
  ROOT_MIDI,
  SCALE,
} from "./agents";
import {
  Partial,
  computeRoughness,
  midiToFreq,
  notePartials,
} from "./roughness";

// Per-agent live visual + audio runtime state (lives in a ref, not React state).
interface AgentRT {
  activity: number; // 0..1 smoothed loudness for orb size/brightness
  lastMidi: number;
  edgeTo: number; // agent id this is currently answering, or -1
  spikePhase: number;
}

export default function VoyagerRoom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [canvasOk, setCanvasOk] = useState(true);

  // Conductor controls (React state drives the UI; mirrored into a ref for the loop).
  const [tension, setTension] = useState(0.25);
  const [tempo, setTempo] = useState(96); // BPM
  const [spotlight, setSpotlight] = useState(-1);
  const [autoDemo, setAutoDemo] = useState(true);

  // Live readouts surfaced to the UI.
  const [readout, setReadout] = useState({
    roughness: 0,
    label: "Resolved",
    chord: "—",
  });

  // ── Refs holding the audio graph + live mutable state ──────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const agentsRef = useRef<AgentSpec[]>(buildAgents());
  const rtRef = useRef<AgentRT[]>(
    buildAgents().map(() => ({
      activity: 0,
      lastMidi: ROOT_MIDI,
      edgeTo: -1,
      spikePhase: Math.random() * Math.PI * 2,
    })),
  );

  // Frame-synchronous clock state.
  const prevFrameRef = useRef<NoteEvent[]>([]);
  const curFrameRef = useRef<NoteEvent[]>([]);
  const frameRef = useRef(0);
  const loudnessRef = useRef<number[]>([0, 0, 0, 0, 0]);
  const leaderMotifRef = useRef<number>(0);
  const soundingRef = useRef<Partial[]>([]);

  // Controls mirrored for the rAF/clock callbacks (avoids stale closures).
  const tensionRef = useRef(tension);
  const tempoRef = useRef(tempo);
  const spotlightRef = useRef(spotlight);
  const autoRef = useRef(autoDemo);
  tensionRef.current = tension;
  tempoRef.current = tempo;
  spotlightRef.current = spotlight;
  autoRef.current = autoDemo;

  // Auto-demo tension arc clock.
  const startTimeRef = useRef(0);
  const beatPulseRef = useRef(0);

  // ── Voice synthesis: one short tone per emitted event ──────────────────
  const playVoice = useCallback(
    (spec: AgentSpec, midi: number, amp: number, beatSec: number) => {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      const freq = midiToFreq(midi);

      const osc = ctx.createOscillator();
      osc.type = spec.osc;
      osc.frequency.value = freq;

      // Gentle low-pass to tame saw/square edges, opens slightly with tension.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      const t = tensionRef.current;
      lp.frequency.value = 900 + 2600 * (0.4 + 0.6 * t);
      lp.Q.value = 0.7;

      const g = ctx.createGain();
      const pan = ctx.createStereoPanner();
      pan.pan.value = spec.pan;

      // Note length scales with the beat; drifter sustains longer.
      const dur =
        beatSec * (spec.personality === "drifter" ? 3.2 : 1.6);
      const peak = Math.min(0.5, amp * 0.5);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      osc.connect(lp).connect(g).connect(pan).connect(master);
      osc.start(now);
      osc.stop(now + dur + 0.05);
      osc.onended = () => {
        osc.disconnect();
        lp.disconnect();
        g.disconnect();
        pan.disconnect();
      };
    },
    [],
  );

  // ── The frame-synchronous step: advance one beat for the whole ensemble ─
  const stepFrame = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const specs = agentsRef.current;
    const rt = rtRef.current;
    const frame = frameRef.current;
    const beatSec = 60 / tempoRef.current;

    // Auto-demo self-conducts a slow tension arc (settle → build → release).
    let effTension = tensionRef.current;
    if (autoRef.current) {
      const elapsed = (ctx.currentTime - startTimeRef.current) % 20; // ~20s loop
      // Triangle-ish arc 0.12 → 0.9 → 0.12.
      const phase = elapsed / 20;
      const arc =
        phase < 0.5 ? phase * 2 : (1 - phase) * 2; // 0..1..0
      effTension = 0.12 + arc * 0.78;
    }

    // Recompute leader motif occasionally so the room evolves.
    if (frame % 16 === 0) {
      leaderMotifRef.current = SCALE[Math.floor(Math.random() * 3)]; // root-ish
    }

    const state: BrainState = {
      prevFrame: prevFrameRef.current,
      sounding: soundingRef.current,
      tension: effTension,
      loudness: loudnessRef.current,
      spotlight: spotlightRef.current,
      leaderMotif: leaderMotifRef.current,
    };

    curFrameRef.current = [];
    const newSounding: Partial[] = [];

    for (const spec of specs) {
      if (!isDue(spec, state, frame)) continue;
      const ev = chooseNote(spec, state, frame);
      curFrameRef.current.push(ev);
      playVoice(spec, ev.midi, ev.amp, beatSec);

      // Update runtime visual/loudness state for this agent.
      const r = rt[spec.id];
      r.lastMidi = ev.midi;
      r.activity = Math.min(1, r.activity * 0.4 + ev.amp);
      loudnessRef.current[spec.id] =
        loudnessRef.current[spec.id] * 0.5 + ev.amp;
      r.edgeTo = answeringEdge(spec, state);

      newSounding.push(
        ...notePartials(ev.midi, ev.amp, spec.partialWeights),
      );
    }

    // Sounding partials = this frame's notes (they overlap into the next).
    soundingRef.current = newSounding;

    // Decay loudness window.
    for (let i = 0; i < loudnessRef.current.length; i++) {
      loudnessRef.current[i] *= 0.75;
    }

    // Roll the frame buffer (StreamMUSE frame-sync: read prev, write cur).
    prevFrameRef.current = curFrameRef.current;
    frameRef.current = frame + 1;
    beatPulseRef.current = 1;
  }, [playVoice]);

  // ── Clock loop via setTimeout chained to tempo (allows live tempo change) ─
  useEffect(() => {
    if (!started) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!alive) return;
      stepFrame();
      const beatSec = 60 / tempoRef.current;
      timer = setTimeout(tick, beatSec * 1000);
    };
    // First tick on next macrotask so audio graph is settled.
    timer = setTimeout(tick, 80);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [started, stepFrame]);

  // ── Render loop (Canvas2D) ─────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) {
      setCanvasOk(false);
      return;
    }
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      setCanvasOk(false);
      return;
    }
    let raf = 0;
    let lastReadout = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const cx = W / 2;
      const cy = H / 2;
      const specs = agentsRef.current;
      const rt = rtRef.current;

      // Live roughness of the currently sounding cluster.
      const rough = computeRoughness(soundingRef.current);

      // Background.
      ctx2d.fillStyle = "#0a0514";
      ctx2d.fillRect(0, 0, W, H);

      const ringR = Math.min(W, H) * 0.33;

      // Beat pulse decays each frame.
      const pulse = beatPulseRef.current;
      beatPulseRef.current *= 0.86;

      // ── Edges: lit lines for agents answering/imitating another ──
      const pos = specs.map((_, i) => {
        const a = (i / specs.length) * Math.PI * 2 - Math.PI / 2;
        return { x: cx + Math.cos(a) * ringR, y: cy + Math.sin(a) * ringR };
      });
      for (const spec of specs) {
        const r = rt[spec.id];
        if (r.edgeTo >= 0 && r.edgeTo < pos.length) {
          const a = pos[spec.id];
          const b = pos[r.edgeTo];
          const grad = ctx2d.createLinearGradient(a.x, a.y, b.x, b.y);
          grad.addColorStop(0, spec.color);
          grad.addColorStop(1, specs[r.edgeTo].color);
          ctx2d.strokeStyle = grad;
          ctx2d.globalAlpha = 0.35 + 0.4 * r.activity;
          ctx2d.lineWidth = 1 + 2 * r.activity;
          ctx2d.beginPath();
          ctx2d.moveTo(a.x, a.y);
          ctx2d.lineTo(b.x, b.y);
          ctx2d.stroke();
          ctx2d.globalAlpha = 1;
        }
      }

      // ── Center tension ring ──
      const calmHue = 270 - rough * 0; // violet base
      const ringColor =
        rough < 0.4
          ? `hsl(${158 - rough * 40}, 70%, 62%)` // emerald→violet calm
          : `hsl(${20 + (1 - rough) * 20}, 85%, 64%)`; // amber→rose tense
      const jitter = rough * 8;
      ctx2d.save();
      ctx2d.translate(cx, cy);
      for (let k = 0; k < 2; k++) {
        ctx2d.beginPath();
        const rr = ringR * 0.42 + k * 6;
        const segs = 48;
        for (let s = 0; s <= segs; s++) {
          const ang = (s / segs) * Math.PI * 2;
          const wob =
            jitter * Math.sin(ang * 6 + performance.now() * 0.004 + k);
          const x = Math.cos(ang) * (rr + wob);
          const y = Math.sin(ang) * (rr + wob);
          if (s === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
        ctx2d.strokeStyle = ringColor;
        ctx2d.globalAlpha = k === 0 ? 0.9 : 0.35;
        ctx2d.lineWidth = k === 0 ? 2.5 : 1;
        ctx2d.stroke();
      }
      // Beat pulse disc.
      ctx2d.beginPath();
      ctx2d.arc(0, 0, ringR * 0.18 * (0.8 + pulse * 0.6), 0, Math.PI * 2);
      ctx2d.fillStyle = ringColor;
      ctx2d.globalAlpha = 0.12 + pulse * 0.25;
      ctx2d.fill();
      ctx2d.globalAlpha = 1;
      ctx2d.restore();
      void calmHue;

      // ── Agent orbs ──
      const now = performance.now();
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        const r = rt[i];
        r.activity *= 0.94; // decay toward rest
        const p = pos[i];
        const isSpot = spotlightRef.current === spec.id;

        const baseR = 14 + r.activity * 26 + (isSpot ? 8 : 0);
        // Dissonance → spiky; consonance → smooth.
        const spikes = Math.round(6 + rough * 8);
        r.spikePhase += 0.02 + r.activity * 0.05;

        ctx2d.save();
        ctx2d.translate(p.x, p.y);

        // Glow.
        const glow = ctx2d.createRadialGradient(0, 0, 0, 0, 0, baseR * 2.4);
        glow.addColorStop(0, spec.color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx2d.globalAlpha = 0.3 + r.activity * 0.5;
        ctx2d.fillStyle = glow;
        ctx2d.beginPath();
        ctx2d.arc(0, 0, baseR * 2.4, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.globalAlpha = 1;

        // Orb body — sprouts spikes when room is tense.
        ctx2d.beginPath();
        const steps = 40;
        for (let s = 0; s <= steps; s++) {
          const ang = (s / steps) * Math.PI * 2;
          const spk =
            Math.sin(ang * spikes + r.spikePhase) * rough * baseR * 0.45;
          const rad = baseR + spk;
          const x = Math.cos(ang) * rad;
          const y = Math.sin(ang) * rad;
          if (s === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
        ctx2d.closePath();
        ctx2d.fillStyle = spec.color;
        ctx2d.globalAlpha = 0.85;
        ctx2d.fill();
        if (isSpot) {
          ctx2d.strokeStyle = "#ffffff";
          ctx2d.lineWidth = 2;
          ctx2d.globalAlpha = 0.9;
          ctx2d.stroke();
        }
        ctx2d.globalAlpha = 1;

        // Label.
        ctx2d.fillStyle = "rgba(255,255,255,0.78)";
        ctx2d.font = "11px ui-monospace, monospace";
        ctx2d.textAlign = "center";
        ctx2d.fillText(spec.name, 0, baseR + 16);
        ctx2d.restore();
        void now;
      }

      // ── Center text readout ──
      const label = tensionLabel(rough);
      ctx2d.fillStyle = "rgba(255,255,255,0.95)";
      ctx2d.font = "600 15px ui-monospace, monospace";
      ctx2d.textAlign = "center";
      ctx2d.fillText(label, cx, cy - 6);
      ctx2d.fillStyle = "rgba(255,255,255,0.6)";
      ctx2d.font = "11px ui-monospace, monospace";
      const chordNames = soundingRef.current.length
        ? Array.from(
            new Set(
              prevFrameRef.current.map((e) => midiName(e.midi)),
            ),
          ).join(" ")
        : "—";
      ctx2d.fillText(`roughness ${rough.toFixed(2)}`, cx, cy + 12);
      ctx2d.fillText(chordNames || "—", cx, cy + 26);

      // Throttled React readout (4 Hz) for the side panel.
      if (now - lastReadout > 250) {
        lastReadout = now;
        setReadout({ roughness: rough, label, chord: chordNames || "—" });
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  // ── Canvas tap → spotlight nearest agent ───────────────────────────────
  const handleCanvasPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const ringR = Math.min(rect.width, rect.height) * 0.33;
      const specs = agentsRef.current;
      let nearest = -1;
      let nd = 1e9;
      for (let i = 0; i < specs.length; i++) {
        const a = (i / specs.length) * Math.PI * 2 - Math.PI / 2;
        const ox = cx + Math.cos(a) * ringR;
        const oy = cy + Math.sin(a) * ringR;
        const d = Math.hypot(px - ox, py - oy);
        if (d < nd) {
          nd = d;
          nearest = i;
        }
      }
      // Tap center clears spotlight; tap an orb toggles it.
      if (Math.hypot(px - cx, py - cy) < ringR * 0.5) {
        setSpotlight(-1);
      } else if (nd < 60) {
        setSpotlight((cur) => (cur === nearest ? -1 : nearest));
      }
    },
    [],
  );

  // ── Start: create + resume AudioContext inside the tap (iOS) ────────────
  const start = useCallback(async () => {
    if (started) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();

    // Master chain → brick-wall limiter → destination.
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 2;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    master.connect(comp).connect(ctx.destination);

    ctxRef.current = ctx;
    masterRef.current = master;
    startTimeRef.current = ctx.currentTime;
    frameRef.current = 0;
    setStarted(true);
  }, [started]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  const agents = agentsRef.current;

  return (
    <main className="min-h-screen bg-[#0a0514] text-foreground px-5 py-6 flex flex-col items-center">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Voyager Room
        </h1>
        <p className="mt-2 text-base text-muted-foreground max-w-2xl">
          A small ensemble of autonomous machine musicians listens to each other
          and to you. You don&apos;t play the notes — you conduct the room&apos;s
          harmonic tension, leaning into dissonance and releasing it.
        </p>
        <p className="mt-1 text-base text-muted-foreground font-mono">
          Homage to George Lewis&apos;s <em>Voyager</em> · frame-synchronous
          jamming after StreamMUSE (arXiv 2606.11886).
        </p>

        {!started ? (
          <button
            onClick={start}
            className="mt-6 min-h-[44px] px-5 py-2.5 rounded-lg bg-violet-500/20 text-violet-200 border border-violet-400/40 hover:bg-violet-500/30 transition text-base font-medium"
          >
            ▶ Start / Conduct the room
          </button>
        ) : (
          <div className="mt-5 grid gap-5">
            {!canvasOk && (
              <div className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-4 py-3 text-base text-violet-200/95">
                Canvas 2D is unavailable on this device — visuals are off, but the
                ensemble is still playing. Use the controls below to conduct.
              </div>
            )}

            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointer}
              className="w-full rounded-xl border border-border bg-black/30 touch-none"
              style={{ height: "min(60vh, 460px)" }}
            />

            {/* TENSION — the primary control */}
            <div>
              <div className="flex items-center justify-between text-base">
                <label className="text-foreground font-medium">
                  Tension{" "}
                  <span className="text-muted-foreground font-mono text-sm">
                    consonance ⇄ dissonance
                  </span>
                </label>
                <span className="font-mono text-violet-300">
                  {tension.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={tension}
                disabled={autoDemo}
                onChange={(e) => setTension(parseFloat(e.target.value))}
                onPointerDown={() => setAutoDemo(false)}
                className="w-full mt-2 accent-violet-400 disabled:opacity-50"
              />
            </div>

            {/* TEMPO */}
            <div>
              <div className="flex items-center justify-between text-base">
                <label className="text-foreground font-medium">Tempo</label>
                <span className="font-mono text-violet-300">{tempo} BPM</span>
              </div>
              <input
                type="range"
                min={48}
                max={160}
                step={1}
                value={tempo}
                onChange={(e) => setTempo(parseInt(e.target.value, 10))}
                className="w-full mt-2 accent-violet-400"
              />
            </div>

            {/* Spotlight + auto-demo */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base text-muted-foreground mr-1">Spotlight:</span>
              {agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() =>
                    setSpotlight((cur) => (cur === a.id ? -1 : a.id))
                  }
                  className="min-h-[44px] px-3 py-2 rounded-lg border text-sm font-mono transition"
                  style={{
                    borderColor:
                      spotlight === a.id ? a.color : "rgba(255,255,255,0.15)",
                    background:
                      spotlight === a.id ? `${a.color}33` : "transparent",
                    color: spotlight === a.id ? "#fff" : "rgba(255,255,255,0.75)",
                  }}
                >
                  {a.name}
                </button>
              ))}
              <button
                onClick={() => setAutoDemo((v) => !v)}
                className={`min-h-[44px] px-3 py-2 rounded-lg border text-sm font-medium transition ${
                  autoDemo
                    ? "border-violet-400/50 bg-violet-500/15 text-violet-200"
                    : "border-border text-muted-foreground"
                }`}
              >
                {autoDemo ? "Auto-conduct: ON" : "Auto-conduct: OFF"}
              </button>
            </div>

            {/* Readout */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-base font-mono text-muted-foreground">
              <span>
                state:{" "}
                <span className="text-violet-300/95">{readout.label}</span>
              </span>
              <span>
                roughness:{" "}
                <span className="text-violet-300">
                  {readout.roughness.toFixed(2)}
                </span>
              </span>
              <span>
                voicing:{" "}
                <span className="text-violet-300/95">{readout.chord}</span>
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              Tap an orb to spotlight a soloist (others defer). Drag the tension
              slider to lean into or release the room&apos;s dissonance. Auto-conduct
              runs a slow ~20s settle → build → release arc until you take over.
            </p>
          </div>
        )}

        <div className="mt-8 text-sm text-muted-foreground">
          <Link
            href="/dream/496-voyager-room/README.md"
            className="underline decoration-muted-foreground hover:text-muted-foreground"
          >
            Read the design notes →
          </Link>
        </div>
      </div>
    </main>
  );
}
