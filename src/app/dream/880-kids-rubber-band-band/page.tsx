"use client";

/**
 * 880-kids-rubber-band-band
 *
 * What if a kids instrument were a wall of stretchy glowing rubber-bands you
 * pluck — and OVER-STRETCHING one leaves it slack and OUT OF TUNE until you
 * retune it, so a wrong choice persists?
 *
 * INPUT  : touch / pointer drag (mouse works too)
 * OUTPUT : inline SVG (animated <path>/<line>/<circle>) — NOT canvas / WebGL
 * VIBE   : playful, colorful, warm band stage
 *
 * Technique: a damped-spring string model animated on SVG paths + a
 * Karplus-Strong-style plucked-string synth + a detune/retune state machine.
 * Over-stretch a band and it goes slack + flat + buzzy and STAYS that way;
 * the child must turn its tuning peg back up to snap it taut and true again.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Stage geometry (SVG viewBox units) ──────────────────────────────────────
const VW = 1000;
const VH = 680;
const PEG_X = 132; // x of the tuning-peg posts (left)
const ANCHOR_X = 920; // x of the fixed right anchor
const SPAN = ANCHOR_X - PEG_X;

// ── Musical mode: C major pentatonic, ascending from C4 ──────────────────────
// MIDI: C4=60, D4=62, E4=64, G4=67, A4=69, C5=72, D5=74
const BAND_MIDI = [60, 62, 64, 67, 69, 72, 74];
const N_BANDS = BAND_MIDI.length;

// Warm, saturated band colors (one per pitch). [stroke, glow].
const BAND_COLORS: { core: string; glow: string }[] = [
  { core: "#ff6b6b", glow: "#ff9a8b" }, // warm red
  { core: "#ff9f43", glow: "#ffd08a" }, // orange
  { core: "#feca57", glow: "#fff0a8" }, // amber
  { core: "#1dd1a1", glow: "#7bf5d4" }, // emerald
  { core: "#48dbfb", glow: "#a8edff" }, // sky
  { core: "#a29bfe", glow: "#d6d2ff" }, // violet
  { core: "#ff8fc8", glow: "#ffc8e6" }, // pink
];

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Per-band physics + tuning state ──────────────────────────────────────────
interface Band {
  i: number;
  midi: number;
  y: number; // resting horizontal line y
  // Lateral displacement of the band's mid-point (px). Animated spring.
  disp: number; // current displacement
  vel: number; // velocity for the wobble spring
  pluckSign: number; // direction of last pluck (for visual lean)
  // Tuning: 1 = perfectly taut/true, drops toward ~0 when over-stretched.
  // While < tautThreshold the band is "slack / out of tune" and stays there.
  taut: number; // 0..1 tension/tune health
  detuned: boolean; // latched out-of-tune state (persists until retuned)
  pegAngle: number; // tuning-peg rotation (deg), visual feedback
  glow: number; // 0..1 brightness envelope after a pluck
}

const TAUT_THRESHOLD = 0.78; // below this → latched out of tune
const OVERSTRETCH_PX = 150; // drag the mid-point past this → over-stretched

function makeBands(): Band[] {
  const top = 96;
  const gap = (VH - 150 - top) / (N_BANDS - 1);
  return BAND_MIDI.map((midi, i) => ({
    i,
    midi,
    y: top + i * gap,
    disp: 0,
    vel: 0,
    pluckSign: 1,
    taut: 1,
    detuned: false,
    pegAngle: 0,
    glow: 0,
  }));
}

// ── Audio engine ─────────────────────────────────────────────────────────────
// Kid-safe chain: per-voice → master gain(≤0.3) → lowpass(≤7500) → compressor → out.
interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  padGain: GainNode;
  padOscs: OscillatorNode[];
}

function buildAudioEngine(): AudioEngine | null {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();

  const master = ctx.createGain();
  master.gain.value = 0.26; // ≤ 0.3

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7200; // ≤ 7500
  lowpass.Q.value = 0.6;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 24;
  comp.ratio.value = 8;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  // Always-on soft warm pad (C + G drone) so it is never silent.
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  padGain.connect(master);
  const padOscs: OscillatorNode[] = [];
  [midiToHz(48), midiToHz(55), midiToHz(60)].forEach((f, idx) => {
    const o = ctx.createOscillator();
    o.type = idx === 2 ? "triangle" : "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = idx === 2 ? 0.14 : 0.3;
    // gentle detune shimmer
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 + idx * 0.03;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 1.4;
    lfo.connect(lfoG);
    lfoG.connect(o.detune);
    lfo.start();
    o.connect(g);
    g.connect(padGain);
    o.start();
    padOscs.push(o);
  });
  // fade pad in softly
  padGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.6);

  return { ctx, master, lowpass, comp, padGain, padOscs };
}

// Karplus-Strong pluck: a short burst of noise through a tuned feedback comb.
// detune: 0 = true pitch; >0 flattens & adds buzz (out-of-tune contrast).
function pluck(
  eng: AudioEngine,
  midi: number,
  velocity: number, // 0..1 pluck strength
  detune: number, // 0..1 amount of out-of-tune
): void {
  const ctx = eng.ctx;
  const now = ctx.currentTime;

  // A flat band drops pitch and loses brightness; never gets louder/harsher.
  const semitonesFlat = detune * 1.9; // up to ~2 semitones flat
  const freq = midiToHz(midi) * Math.pow(2, -semitonesFlat / 12);
  const period = 1 / freq;

  // String body: a comb (DelayNode + feedback) excited by a noise burst.
  const delay = ctx.createDelay(0.06);
  delay.delayTime.value = Math.min(period, 0.05);

  const feedback = ctx.createGain();
  // shorter decay when slack (dead, dull), bright sustain when taut+true.
  feedback.gain.value = 0.93 - detune * 0.22;

  // Damping filter inside the loop (Karplus-Strong lowpass averaging).
  const loopLP = ctx.createBiquadFilter();
  loopLP.type = "lowpass";
  loopLP.frequency.value = detune > 0.05 ? 1400 : 5200; // dull when detuned
  loopLP.Q.value = 0.2;

  delay.connect(loopLP);
  loopLP.connect(feedback);
  feedback.connect(delay);

  // Noise burst (one period or so of white noise) as the exciter.
  const burstLen = Math.max(0.012, period * 2);
  const buf = ctx.createBuffer(1, Math.ceil(burstLen * ctx.sampleRate), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let n = 0; n < data.length; n++) data[n] = (Math.random() * 2 - 1);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const exciteGain = ctx.createGain();
  const peak = 0.5 * (0.45 + 0.55 * velocity); // gentle scaling, never a blast
  exciteGain.gain.setValueAtTime(peak, now);
  exciteGain.gain.exponentialRampToValueAtTime(0.0008, now + burstLen);

  src.connect(exciteGain);
  exciteGain.connect(delay);

  // Output envelope for the whole pluck.
  const out = ctx.createGain();
  const decay = detune > 0.05 ? 0.9 : 1.9; // slack note dies sooner
  out.gain.setValueAtTime(0.0001, now);
  out.gain.linearRampToValueAtTime(0.9, now + 0.004);
  out.gain.exponentialRampToValueAtTime(0.0006, now + decay);

  delay.connect(out);

  // For a detuned band, add a soft low buzz (rattle) — unmistakable but quiet.
  if (detune > 0.05) {
    const buzz = ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = freq * 0.5;
    const buzzLP = ctx.createBiquadFilter();
    buzzLP.type = "lowpass";
    buzzLP.frequency.value = 900;
    const buzzG = ctx.createGain();
    buzzG.gain.setValueAtTime(0.0001, now);
    buzzG.gain.linearRampToValueAtTime(0.05 * velocity, now + 0.02);
    buzzG.gain.exponentialRampToValueAtTime(0.0004, now + 0.5);
    buzz.connect(buzzLP);
    buzzLP.connect(buzzG);
    buzzG.connect(out);
    buzz.start(now);
    buzz.stop(now + 0.6);
  }

  out.connect(eng.master);

  src.start(now);
  src.stop(now + burstLen + 0.02);

  // Clean up the loop after it has decayed.
  window.setTimeout(() => {
    try {
      delay.disconnect();
      loopLP.disconnect();
      feedback.disconnect();
      out.disconnect();
      exciteGain.disconnect();
    } catch {
      /* already gone */
    }
  }, (decay + 0.3) * 1000);
}

// ── Build an SVG path for a band given displacement & sag ────────────────────
// The band is anchored at (PEG_X, y) and (ANCHOR_X, y). A quadratic curve
// bulges to the band's lateral displacement at the mid-point. When slack it
// also sags downward (gravity) to read as "out of tune".
function bandPath(b: Band): string {
  const x0 = PEG_X;
  const x1 = ANCHOR_X;
  const sag = (1 - b.taut) * 46; // slack bands droop
  const ctrlY = b.y + b.disp + sag;
  // Two control points for a smooth bulge that meets both anchors flat-ish.
  const c1x = x0 + SPAN * 0.32;
  const c2x = x0 + SPAN * 0.68;
  return `M ${x0} ${b.y} C ${c1x} ${ctrlY} ${c2x} ${ctrlY} ${x1} ${b.y}`;
}

type Phase = "idle" | "ready" | "running";

// Auto-demo step list (ms offsets handled by a scheduler).
interface DemoEvent {
  t: number;
  kind: "pluck" | "overstretch" | "retune";
  band: number;
}

export default function RubberBandBand() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [, forceRender] = useState(0);

  const engRef = useRef<AudioEngine | null>(null);
  const bandsRef = useRef<Band[]>(makeBands());
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Interaction state
  const dragRef = useRef<{
    band: number;
    mode: "pluck" | "peg";
    pointerId: number;
    startClientY: number;
  } | null>(null);
  const autoDemoRef = useRef<{ start: number; idx: number } | null>(null);
  const interactedRef = useRef(false);

  // ── Geometry helpers (client px → svg units) ───────────────────────────────
  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * VW;
    const y = ((clientY - r.top) / r.height) * VH;
    return { x, y };
  }, []);

  // Apply a pluck to a band (used by both touch + auto-demo).
  const triggerPluck = useCallback((bi: number, displacement: number) => {
    const b = bandsRef.current[bi];
    if (!b) return;
    const eng = engRef.current;
    const mag = Math.min(1, Math.abs(displacement) / 90);
    b.disp = displacement;
    b.vel = 0;
    b.pluckSign = Math.sign(displacement) || 1;
    b.glow = 1;
    if (eng) {
      const detuneAmt = b.detuned ? 1 - b.taut : 0;
      pluck(eng, b.midi, 0.5 + mag * 0.5, detuneAmt);
    }
  }, []);

  // Over-stretch: latch a band into the slack/out-of-tune state.
  const overstretch = useCallback((bi: number) => {
    const b = bandsRef.current[bi];
    if (!b) return;
    b.detuned = true;
    // Drop well below the in-tune threshold so the band reads as clearly slack
    // and stays latched out of tune until it is retuned past TAUT_THRESHOLD.
    b.taut = Math.min(0.35, TAUT_THRESHOLD - 0.4);
    b.pegAngle = -34; // peg visibly loosened
  }, []);

  // Retune: bring a band back to taut + true.
  const retuneStep = useCallback((bi: number, amount: number) => {
    const b = bandsRef.current[bi];
    if (!b) return;
    b.taut = Math.min(1, b.taut + amount);
    b.pegAngle = -34 * (1 - (b.taut - 0.35) / (1 - 0.35));
    if (b.taut >= 0.985) {
      b.taut = 1;
      b.detuned = false;
      b.pegAngle = 0;
      b.glow = 1; // celebratory glow when it snaps true
      b.disp = 6;
      b.vel = -40;
    }
  }, []);

  // ── Animation loop: damped-spring wobble for every band ─────────────────────
  const stepFrame = useCallback((ts: number) => {
    const last = lastTsRef.current || ts;
    let dt = (ts - last) / 1000;
    lastTsRef.current = ts;
    if (dt > 0.05) dt = 0.05; // clamp

    const bands = bandsRef.current;
    const dragging = dragRef.current;

    for (const b of bands) {
      const held = dragging && dragging.band === b.i && dragging.mode === "pluck";
      if (!held) {
        // Spring back to 0 displacement. Stiffness depends on tautness:
        // a taut band rings higher/faster; a slack band wobbles slow + dull.
        const stiffness = 220 * (0.45 + 0.55 * b.taut);
        const damping = 5.5 + (1 - b.taut) * 6; // slack = more damping (dead)
        const accel = -stiffness * b.disp - damping * b.vel;
        b.vel += accel * dt;
        b.disp += b.vel * dt;
        if (Math.abs(b.disp) < 0.05 && Math.abs(b.vel) < 0.05) {
          b.disp = 0;
          b.vel = 0;
        }
      }
      // Glow envelope decays.
      b.glow = Math.max(0, b.glow - dt * 1.4);
    }

    // ── Auto-demo scheduler ─────────────────────────────────────────────────
    const demo = autoDemoRef.current;
    if (demo && !interactedRef.current) {
      const elapsed = ts - demo.start;
      const events: DemoEvent[] = DEMO_EVENTS;
      while (demo.idx < events.length && elapsed >= events[demo.idx].t) {
        const ev = events[demo.idx];
        if (ev.kind === "pluck") triggerPluck(ev.band, (ev.band % 2 ? 1 : -1) * 64);
        else if (ev.kind === "overstretch") {
          overstretch(ev.band);
          triggerPluck(ev.band, -120);
        } else if (ev.kind === "retune") {
          retuneStep(ev.band, 1); // snap true in one go for the demo
          triggerPluck(ev.band, 40);
        }
        demo.idx += 1;
      }
      if (demo.idx >= events.length) {
        // loop the demo
        demo.start = ts + 900;
        demo.idx = 0;
        // reset the demo band so the loop shows the arc again
        const rb = bandsRef.current[DEMO_BAND];
        rb.detuned = false;
        rb.taut = 1;
        rb.pegAngle = 0;
      }
    }

    forceRender((n) => (n + 1) & 0xffff);
    rafRef.current = requestAnimationFrame(stepFrame);
  }, [triggerPluck, overstretch, retuneStep]);

  // ── Start (must run inside the user gesture for iOS) ─────────────────────────
  const handleStart = useCallback(() => {
    if (phase === "running") return;
    const eng = buildAudioEngine();
    if (!eng) {
      setAudioError("Sound could not start, but you can still play the bands.");
      setPhase("running");
    } else {
      engRef.current = eng;
      eng.ctx
        .resume()
        .then(() => {
          setAudioError(null);
        })
        .catch(() => {
          setAudioError("Sound is asleep — tap a band to wake it.");
        });
      setPhase("running");
    }
    // arm the hands-free auto-demo
    interactedRef.current = false;
    autoDemoRef.current = { start: performance.now() + 1100, idx: 0 };
    lastTsRef.current = 0;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(stepFrame);
    }
  }, [phase, stepFrame]);

  // Stop the auto-demo on first real interaction.
  const cancelDemo = useCallback(() => {
    interactedRef.current = true;
    autoDemoRef.current = null;
  }, []);

  // ── Pointer handlers ─────────────────────────────────────────────────────────
  const onBandPointerDown = useCallback(
    (e: React.PointerEvent, bi: number) => {
      cancelDemo();
      const { y } = clientToSvg(e.clientX, e.clientY);
      const b = bandsRef.current[bi];
      if (!b) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        band: bi,
        mode: "pluck",
        pointerId: e.pointerId,
        startClientY: y,
      };
      b.vel = 0;
    },
    [cancelDemo, clientToSvg],
  );

  const onPegPointerDown = useCallback(
    (e: React.PointerEvent, bi: number) => {
      cancelDemo();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const { y } = clientToSvg(e.clientX, e.clientY);
      dragRef.current = {
        band: bi,
        mode: "peg",
        pointerId: e.pointerId,
        startClientY: y,
      };
    },
    [cancelDemo, clientToSvg],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { y } = clientToSvg(e.clientX, e.clientY);
      const b = bandsRef.current[drag.band];
      if (!b) return;
      if (drag.mode === "pluck") {
        // Lateral displacement = how far the finger has moved off the band line.
        const d = y - b.y;
        b.disp = Math.max(-OVERSTRETCH_PX - 40, Math.min(OVERSTRETCH_PX + 40, d));
        b.vel = 0;
        // Over-stretch: drag the band way past its limit → latch out of tune.
        if (!b.detuned && Math.abs(d) > OVERSTRETCH_PX) {
          overstretch(drag.band);
        }
      } else {
        // Peg turn: drag UP to tighten (retune). Movement upward = negative dy.
        const dy = drag.startClientY - y; // up = positive
        if (b.detuned && dy > 0) {
          retuneStep(drag.band, dy / 2600);
          drag.startClientY = y; // incremental
        }
      }
    },
    [clientToSvg, overstretch, retuneStep],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.pointerId !== e.pointerId) return;
      const b = bandsRef.current[drag.band];
      if (drag.mode === "pluck" && b) {
        // Release = PLUCK. Velocity from how far it was pulled.
        triggerPluck(drag.band, b.disp);
      }
      dragRef.current = null;
    },
    [triggerPluck],
  );

  // ── Mount: idle SVG visible. Teardown on unmount. ───────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      autoDemoRef.current = null;
      const eng = engRef.current;
      if (eng) {
        try {
          eng.padGain.gain.cancelScheduledValues(eng.ctx.currentTime);
          eng.padOscs.forEach((o) => {
            try {
              o.stop();
            } catch {
              /* already stopped */
            }
            o.disconnect();
          });
          eng.padGain.disconnect();
          eng.master.disconnect();
          eng.lowpass.disconnect();
          eng.comp.disconnect();
          eng.ctx.close();
        } catch {
          /* best effort */
        }
        engRef.current = null;
      }
    };
  }, []);

  const bands = bandsRef.current;

  return (
    <main className="min-h-screen w-full bg-[#1a1012] text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Rubber-Band Band
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Pull a glowing band and let go to make it sing. Pull{" "}
              <span className="text-violet-300/95">too far</span> and it goes
              floppy and sad — turn its knob to fix it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-muted-foreground transition hover:bg-accent"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </header>

        {audioError && (
          <p className="text-base text-violet-300">{audioError}</p>
        )}

        {showNotes && (
          <section className="rounded-2xl border border-border bg-black/30 p-4 text-base leading-relaxed text-muted-foreground">
            <p className="text-foreground">
              A wall of stretchy glowing rubber-bands tuned to a warm C major
              pentatonic. Drag a band sideways and release to pluck it — a
              Karplus-Strong plucked-string tone — and watch it wobble and
              settle on a damped spring.
            </p>
            <p className="mt-3">
              <span className="text-violet-300">The stakes:</span> if you
              over-stretch a band it goes{" "}
              <span className="text-violet-300/95">slack and out of tune</span>{" "}
              and <em>stays</em> that way — flat, buzzy, and drooping. Nothing
              rescues it for you. To fix it you grab its tuning peg and turn it
              back up until the band snaps taut and{" "}
              <span className="text-violet-300/95">glows true</span> again. The
              wrong choice is visible, audible, and lasting; the fix is earned.
            </p>
            <p className="mt-3 text-muted-foreground">
              Technique: SVG spring-string animation + pluck synth + detune
              state machine. Refs: Karplus &amp; Strong (1983); the monochord /
              rubber-band as a child&apos;s first tunable string. The out-of-tune
              note is a deliberately LARGE, unmistakable contrast (RESEARCH §528,
              2026-06-23; PMC11336827) — but never louder or harsher.
            </p>
          </section>
        )}

        <div className="relative overflow-hidden rounded-3xl border border-border shadow-2xl">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VW} ${VH}`}
            className="block h-auto w-full touch-none select-none"
            style={{ aspectRatio: `${VW} / ${VH}` }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              <radialGradient id="stageGlow" cx="50%" cy="38%" r="75%">
                <stop offset="0%" stopColor="#3a1f24" />
                <stop offset="100%" stopColor="#160d0f" />
              </radialGradient>
              <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>

            <rect x="0" y="0" width={VW} height={VH} fill="url(#stageGlow)" />

            {/* Left peg post & right anchor post */}
            <rect
              x={PEG_X - 22}
              y={40}
              width={20}
              height={VH - 110}
              rx={10}
              fill="#2c1c20"
              stroke="#4a2f35"
              strokeWidth={2}
            />
            <rect
              x={ANCHOR_X + 4}
              y={40}
              width={20}
              height={VH - 110}
              rx={10}
              fill="#2c1c20"
              stroke="#4a2f35"
              strokeWidth={2}
            />

            {/* Bands */}
            {bands.map((b) => {
              const col = BAND_COLORS[b.i % BAND_COLORS.length];
              const dull = b.detuned;
              const strokeW = 7 + b.glow * 4 + (dull ? 0 : 2 * b.taut);
              const coreColor = dull ? "#7a5d52" : col.core;
              const glowColor = dull ? "#5a423b" : col.glow;
              const glowOpacity = dull ? 0.25 : 0.4 + b.glow * 0.5;
              const path = bandPath(b);
              return (
                <g key={b.i}>
                  {/* glow underlay */}
                  <path
                    d={path}
                    fill="none"
                    stroke={glowColor}
                    strokeWidth={strokeW + 12}
                    strokeLinecap="round"
                    opacity={glowOpacity}
                    filter="url(#soft)"
                  />
                  {/* core band */}
                  <path
                    d={path}
                    fill="none"
                    stroke={coreColor}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    opacity={dull ? 0.85 : 1}
                  />
                  {/* fat invisible hit area for easy plucking (≥64px tall) */}
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={70}
                    strokeLinecap="round"
                    style={{ cursor: "grab", touchAction: "none" }}
                    onPointerDown={(e) => onBandPointerDown(e, b.i)}
                  />

                  {/* Tuning peg at the left, turns when loosened/retuned */}
                  <g
                    transform={`translate(${PEG_X - 12} ${b.y}) rotate(${b.pegAngle})`}
                    style={{ cursor: "pointer", touchAction: "none" }}
                    onPointerDown={(e) => onPegPointerDown(e, b.i)}
                  >
                    {/* peg hit halo (≥64px) */}
                    <circle r={38} fill="transparent" />
                    <circle
                      r={20}
                      fill={dull ? "#3a2a2c" : "#241719"}
                      stroke={dull ? "#ffb14e" : col.core}
                      strokeWidth={dull ? 4 : 3}
                    />
                    {/* peg handle */}
                    <rect
                      x={-5}
                      y={-26}
                      width={10}
                      height={20}
                      rx={4}
                      fill={dull ? "#ffb14e" : col.glow}
                    />
                    {dull && (
                      <circle
                        r={28}
                        fill="none"
                        stroke="#ffb14e"
                        strokeWidth={2}
                        opacity={0.5 + 0.4 * Math.sin(performance.now() / 220)}
                      />
                    )}
                  </g>
                </g>
              );
            })}

            {/* Idle / start overlay */}
            {phase !== "running" && (
              <g>
                <rect x="0" y="0" width={VW} height={VH} fill="#000" opacity={0.45} />
                <text
                  x={VW / 2}
                  y={VH / 2 - 18}
                  textAnchor="middle"
                  fontSize="34"
                  fontWeight="700"
                  fill="#ffffff"
                >
                  Tap Start, then pull a band!
                </text>
              </g>
            )}
          </svg>

          {/* HTML Start button overlay (≥44px, inside the tap for iOS) */}
          {phase !== "running" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <button
                type="button"
                onClick={handleStart}
                className="pointer-events-auto min-h-[44px] rounded-full bg-violet-400 px-8 py-3 text-lg font-bold text-[#241719] shadow-lg transition active:scale-95"
                style={{ marginTop: 64 }}
              >
                ▶ Start
              </button>
            </div>
          )}
        </div>

        <p className="text-base text-muted-foreground">
          Drag a band up or down and let go to pluck. Pull way too far and it
          sags out of tune — turn its little knob upward to tighten it back to a
          sweet note.
        </p>
      </div>
    </main>
  );
}

// ── Auto-demo choreography (ms) ──────────────────────────────────────────────
const DEMO_BAND = 3; // the band we over-stretch then rescue
const DEMO_EVENTS: DemoEvent[] = [
  { t: 0, kind: "pluck", band: 0 },
  { t: 650, kind: "pluck", band: 2 },
  { t: 1300, kind: "pluck", band: 4 },
  { t: 2200, kind: "overstretch", band: DEMO_BAND }, // wrong choice — persists
  { t: 3000, kind: "pluck", band: DEMO_BAND }, // hear it flat & buzzy
  { t: 3900, kind: "pluck", band: DEMO_BAND }, // still wrong (persists)
  { t: 4900, kind: "retune", band: DEMO_BAND }, // earn the fix
  { t: 5500, kind: "pluck", band: DEMO_BAND }, // sweet again
];
