"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 4376 · Drag
//
//   ONE QUESTION — What if your own delayed echo, returning across a canyon,
//   could physically drag your tempo off the beat — and the game is to hold a
//   true pulse against the gravity of a partner who is literally you, one
//   canyon-width ago?
//
//   Real phenomenon: Chafe, Cáceres & Gurevich found that musicians performing
//   against a transmission delay drift in tempo — SHORT delays accelerate an
//   ensemble (each rushes to fill the gap), LONG delays decelerate it (each waits
//   for the other), with a narrow ~10–20 ms sweet spot where tempo can lock. You
//   tap a pulse; the echo returns across a "canyon" you widen; a live drift trace
//   shows you being pulled sharp (narrow) or flat (wide). Nothing snaps to a grid.
//
//   INPUT   keyboard / tap (Space + pad + A S D F). No camera, file or mic.
//   OUTPUT  inline SVG only (no Canvas2D, no WebGL). Elements are mutated per
//           frame via refs.
//   TECH    Web-Audio delay-line-as-instrument + inter-onset-interval tempo
//           tracking. No FFT / AnalyserNode.
//   REF     Chafe, Cáceres, Gurevich, "Effect of temporal separation on
//           synchronization in rhythmic performance" (CCRMA SoundWIRE). README.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeAudio, type DragAudio } from "./audio";
import {
  canyonPx,
  clamp,
  driftTargetBpm,
  DemoPlayer,
  LOCK_BEATS,
  LOCK_TOL,
  MAX_DRIFT,
  NOTES,
  ONEWAY_MAX,
  ONEWAY_MIN,
  TARGET_MAX,
  TARGET_MIN,
  TempoTracker,
  TAP_FREQ,
} from "./viz";

// SVG frame geometry (viewBox 0 0 1200 700)
const CX = 600; // canyon centre
const CANYON_Y = 150; // canyon row
const CENTER_Y = 430; // "true pulse" axis of the instrument
const SCALE_Y = 175; // px per full-scale drift (±MAX_DRIFT)
const X0 = 110; // trace left (old)
const X1 = 1080; // trace right (now)
const SAMPLE_MS = 33; // trace sample cadence
const BUF_N = 200; // trace samples (~6.6 s window)
const PING_N = 22; // pooled ripple circles
const PING_LIFE = 1150; // ms

type Ping = { active: boolean; x: number; y: number; born: number; kind: number };

export default function DragPage() {
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [soundLocked, setSoundLocked] = useState(true);
  const [auto, setAuto] = useState(true);
  const [locked, setLocked] = useState(false);
  const [oneWayUi, setOneWayUi] = useState(90);
  const [targetUi, setTargetUi] = useState(100);
  const [metroUi, setMetroUi] = useState(true);

  // params mirrored into refs so the rAF loop reads latest without re-subscribing
  const oneWayRef = useRef(90);
  const targetRef = useRef(100);
  const autoRef = useRef(true);
  const metroRef = useRef(true);

  const audioRef = useRef<DragAudio | null>(null);
  const startedRef = useRef(false);
  const rafRef = useRef(0);
  const fireTapRef = useRef<(tapMs: number, freq: number) => void>(() => {});

  const trackerRef = useRef(new TempoTracker());
  const demoRef = useRef(new DemoPlayer(0x5eed42));
  const bufRef = useRef<number[]>(Array.from({ length: BUF_N }, () => 0));
  const pingsRef = useRef<Ping[]>(
    Array.from({ length: PING_N }, () => ({ active: false, x: 0, y: 0, born: 0, kind: 0 })),
  );
  const echoQRef = useRef<{ fireAt: number; x: number; y: number }[]>([]);

  // dynamic SVG element refs
  const traceRef = useRef<SVGPolylineElement | null>(null);
  const areaRef = useRef<SVGPathElement | null>(null);
  const massRef = useRef<SVGCircleElement | null>(null);
  const massGlowRef = useRef<SVGCircleElement | null>(null);
  const tetherRef = useRef<SVGLineElement | null>(null);
  const predRef = useRef<SVGLineElement | null>(null);
  const lockBandRef = useRef<SVGRectElement | null>(null);
  const youRef = useRef<SVGCircleElement | null>(null);
  const echoRef = useRef<SVGCircleElement | null>(null);
  const canyonLineRef = useRef<SVGLineElement | null>(null);
  const canyonLabRef = useRef<SVGTextElement | null>(null);
  const pingRefs = useRef<(SVGCircleElement | null)[]>([]);

  // readouts (mutated via textContent to keep the loop cheap)
  const bpmValRef = useRef<HTMLSpanElement | null>(null);
  const driftValRef = useRef<HTMLSpanElement | null>(null);
  const canyonValRef = useRef<HTMLSpanElement | null>(null);
  const stateValRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const audio = makeAudio();
    if (!audio) {
      setError("This browser has no Web Audio support — the canyon stays silent.");
    } else {
      audioRef.current = audio;
      audio.setCanyon(oneWayRef.current);
      audio.setMetro(metroRef.current);
    }

    const tracker = trackerRef.current;
    const demo = demoRef.current;
    const buf = bufRef.current;
    const pings = pingsRef.current;
    const echoQ = echoQRef.current;

    let lastFrame = performance.now();
    let sampleAcc = 0;
    let displayDrift = 0;
    let lockAccum = 0;
    let lockedNow = false;
    let nextTickCtx = 0;
    demo.reset(lastFrame);

    function findPing(): Ping {
      let oldest = pings[0];
      for (const p of pings) {
        if (!p.active) return p;
        if (p.born < oldest.born) oldest = p;
      }
      return oldest;
    }
    function spawnPing(x: number, y: number, kind: number, now: number): void {
      const p = findPing();
      p.active = true;
      p.x = x;
      p.y = y;
      p.born = now;
      p.kind = kind;
    }

    function fireTap(tapMs: number, freq: number, now: number): void {
      const audioNow = audioRef.current;
      if (audioNow && startedRef.current) {
        playPluck(audioNow, freq);
      }
      const youX = CX + canyonPx(oneWayRef.current) / 2;
      const echoX = CX - canyonPx(oneWayRef.current) / 2;
      spawnPing(youX, CANYON_Y, 0, now);
      echoQ.push({ fireAt: tapMs + 2 * oneWayRef.current, x: echoX, y: CANYON_Y });
      tracker.push(tapMs, targetRef.current);
    }
    fireTapRef.current = (tapMs, freq) => fireTap(tapMs, freq, performance.now());

    function frame(now: number): void {
      const dt = Math.min(now - lastFrame, 60);
      lastFrame = now;

      const target = targetRef.current;
      const oneWay = oneWayRef.current;
      const beatMs = 60000 / target;

      // 1 · demo virtual player
      if (autoRef.current) {
        demo.step(now, target, oneWay, (tapMs, noteIdx) => {
          fireTap(tapMs, NOTES[noteIdx].freq, now);
        });
      }

      // 2 · metronome scheduling (audio only)
      const audioNow = audioRef.current;
      if (audioNow && startedRef.current && metroRef.current) {
        const ctxNow = audioNow.now();
        if (nextTickCtx < ctxNow) nextTickCtx = ctxNow + 0.05;
        while (nextTickCtx < ctxNow + 0.12) {
          audioNow.tick(nextTickCtx);
          nextTickCtx += beatMs / 1000;
        }
      } else {
        nextTickCtx = 0;
      }

      // 3 · echo pings (the return across the canyon)
      for (let i = echoQ.length - 1; i >= 0; i--) {
        if (now >= echoQ[i].fireAt) {
          spawnPing(echoQ[i].x, echoQ[i].y, 1, now);
          echoQ.splice(i, 1);
        }
      }

      // 4 · update ping pool
      for (let i = 0; i < pings.length; i++) {
        const el = pingRefs.current[i];
        const p = pings[i];
        if (!el) continue;
        if (!p.active) {
          el.setAttribute("opacity", "0");
          continue;
        }
        const age = (now - p.born) / PING_LIFE;
        if (age >= 1) {
          p.active = false;
          el.setAttribute("opacity", "0");
          continue;
        }
        const r = 6 + age * 84;
        el.setAttribute("cx", p.x.toFixed(1));
        el.setAttribute("cy", p.y.toFixed(1));
        el.setAttribute("r", r.toFixed(1));
        el.setAttribute("opacity", ((1 - age) * (p.kind === 0 ? 0.5 : 0.3)).toFixed(3));
        el.setAttribute("stroke", p.kind === 0 ? "#a78bfa" : "#4c1d95");
      }

      // 5 · drift → display easing + trace buffer
      const recent = tracker.lastTapMs > 0 && now - tracker.lastTapMs < 2.2 * beatMs;
      const goal = recent ? tracker.drift : 0;
      displayDrift += 0.16 * (goal - displayDrift);
      sampleAcc += dt;
      while (sampleAcc >= SAMPLE_MS) {
        buf.push(displayDrift);
        if (buf.length > BUF_N) buf.shift();
        sampleAcc -= SAMPLE_MS;
      }

      // 6 · trace polyline + filled area
      let pts = "";
      let area = `M ${X0} ${CENTER_Y}`;
      const n = buf.length;
      for (let i = 0; i < n; i++) {
        const x = X0 + (i / (n - 1)) * (X1 - X0);
        const y = CENTER_Y - (clamp(buf[i], -MAX_DRIFT, MAX_DRIFT) / MAX_DRIFT) * SCALE_Y;
        pts += `${x.toFixed(1)},${y.toFixed(1)} `;
        area += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      area += ` L ${X1} ${CENTER_Y} Z`;
      traceRef.current?.setAttribute("points", pts.trim());
      areaRef.current?.setAttribute("d", area);

      // 7 · mass on the axis (rightmost sample)
      const massY =
        CENTER_Y - (clamp(displayDrift, -MAX_DRIFT, MAX_DRIFT) / MAX_DRIFT) * SCALE_Y;
      massRef.current?.setAttribute("cy", massY.toFixed(1));
      massGlowRef.current?.setAttribute("cy", massY.toFixed(1));
      tetherRef.current?.setAttribute("y2", massY.toFixed(1));

      // 8 · lock logic
      if (recent && Math.abs(tracker.drift) < LOCK_TOL) lockAccum += dt;
      else lockAccum = 0;
      const nowLocked = lockAccum > LOCK_BEATS * beatMs;
      if (nowLocked !== lockedNow) {
        lockedNow = nowLocked;
        setLocked(nowLocked);
        lockBandRef.current?.setAttribute("opacity", nowLocked ? "0.24" : "0.06");
        massGlowRef.current?.setAttribute("opacity", nowLocked ? "0.55" : "0.22");
      }

      // 9 · Chafe pull marker (prediction, not measurement)
      const predY = CENTER_Y - (driftTargetBpm(oneWay) / MAX_DRIFT) * SCALE_Y;
      predRef.current?.setAttribute("y1", predY.toFixed(1));
      predRef.current?.setAttribute("y2", predY.toFixed(1));

      // 10 · canyon nodes follow the slider
      const cpx = canyonPx(oneWay);
      const youX = CX + cpx / 2;
      const echoX = CX - cpx / 2;
      youRef.current?.setAttribute("cx", youX.toFixed(1));
      echoRef.current?.setAttribute("cx", echoX.toFixed(1));
      canyonLineRef.current?.setAttribute("x1", echoX.toFixed(1));
      canyonLineRef.current?.setAttribute("x2", youX.toFixed(1));
      canyonLabRef.current?.setAttribute("x", CX.toFixed(1));

      // 11 · readouts
      if (bpmValRef.current)
        bpmValRef.current.textContent = recent ? tracker.bpm.toFixed(1) : "—";
      if (driftValRef.current) {
        const d = recent ? tracker.drift : 0;
        driftValRef.current.textContent = `${d >= 0 ? "+" : ""}${d.toFixed(1)}`;
      }
      if (canyonValRef.current)
        canyonValRef.current.textContent = `${Math.round(oneWay)} ms · ${Math.round(2 * oneWay)} rt`;
      if (stateValRef.current) {
        stateValRef.current.textContent = !recent
          ? "silent"
          : nowLocked
            ? "LOCKED"
            : tracker.drift > LOCK_TOL
              ? "rushing sharp"
              : tracker.drift < -LOCK_TOL
                ? "dragging flat"
                : "near true";
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    function onKey(e: KeyboardEvent): void {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      let freq = -1;
      if (e.code === "Space" || k === " ") freq = TAP_FREQ;
      else {
        const note = NOTES.find((nt) => nt.key === k);
        if (note) freq = note.freq;
      }
      if (freq < 0) return;
      e.preventDefault();
      takeOver();
      const now = performance.now();
      fireTap(now, freq, now);
    }
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playPluck(audio: DragAudio, freq: number): void {
    audio.playTap(freq, audio.now() + 0.015);
  }

  async function startAudio(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) return;
    await audio.resume();
    startedRef.current = true;
    setSoundLocked(audio.suspended());
  }

  // first human input silences the demo and hands over
  function takeOver(): void {
    void startAudio();
    if (autoRef.current) {
      autoRef.current = false;
      setAuto(false);
    }
  }

  function toggleAuto(): void {
    const next = !autoRef.current;
    autoRef.current = next;
    setAuto(next);
    if (next) demoRef.current.reset(performance.now());
    void startAudio();
  }

  function onOneWay(e: React.ChangeEvent<HTMLInputElement>): void {
    const v = Number(e.target.value);
    setOneWayUi(v);
    oneWayRef.current = v;
    audioRef.current?.setCanyon(v);
  }
  function onTarget(e: React.ChangeEvent<HTMLInputElement>): void {
    const v = Number(e.target.value);
    setTargetUi(v);
    targetRef.current = v;
  }
  function toggleMetro(): void {
    const next = !metroRef.current;
    metroRef.current = next;
    setMetroUi(next);
    audioRef.current?.setMetro(next);
  }

  return (
    <div className="relative h-screen w-full touch-none overflow-hidden bg-background select-none">
      {/* Instrument */}
      <svg
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="drag-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.28" />
          </linearGradient>
          <radialGradient id="drag-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ede9fe" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* canyon row — you vs. your displaced self */}
        <line
          ref={canyonLineRef}
          x1={CX - 200}
          y1={CANYON_Y}
          x2={CX + 200}
          y2={CANYON_Y}
          stroke="#5b5175"
          strokeWidth={1.5}
          strokeDasharray="2 8"
        />
        {Array.from({ length: PING_N }, (_, i) => (
          <circle
            key={i}
            ref={(el) => {
              pingRefs.current[i] = el;
            }}
            cx={CX}
            cy={CANYON_Y}
            r={6}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth={2}
            opacity={0}
          />
        ))}
        <circle ref={echoRef} cx={CX - 200} cy={CANYON_Y} r={7} fill="#4c1d95" />
        <circle ref={youRef} cx={CX + 200} cy={CANYON_Y} r={9} fill="#a78bfa" />
        <g className="text-muted-foreground">
          <text
            ref={canyonLabRef}
            x={CX}
            y={CANYON_Y - 22}
            textAnchor="middle"
            className="fill-current font-mono"
            fontSize={15}
            letterSpacing="2"
          >
            ◄ canyon ►
          </text>
          <text
            x={CX - 214}
            y={CANYON_Y + 4}
            textAnchor="end"
            className="fill-current"
            fontSize={14}
          >
            echo
          </text>
          <text x={CX + 216} y={CANYON_Y + 4} className="fill-current" fontSize={14}>
            you
          </text>
        </g>

        {/* instrument axis — the true pulse */}
        <rect
          ref={lockBandRef}
          x={X0}
          y={CENTER_Y - (LOCK_TOL / MAX_DRIFT) * SCALE_Y}
          width={X1 - X0}
          height={(2 * LOCK_TOL / MAX_DRIFT) * SCALE_Y}
          fill="#8b5cf6"
          opacity={0.06}
        />
        <line x1={X0} y1={CENTER_Y} x2={X1} y2={CENTER_Y} stroke="#6d5f8a" strokeWidth={1.5} />

        {/* Chafe pull prediction */}
        <line
          ref={predRef}
          x1={X1 + 6}
          y1={CENTER_Y}
          x2={X1 + 60}
          y2={CENTER_Y}
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeDasharray="5 4"
          opacity={0.5}
        />

        {/* drift trace */}
        <path ref={areaRef} d="" fill="url(#drag-area)" />
        <polyline
          ref={traceRef}
          points=""
          fill="none"
          stroke="#8b5cf6"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />

        {/* mass pulled off the true pulse */}
        <line
          ref={tetherRef}
          x1={X1}
          y1={CENTER_Y}
          x2={X1}
          y2={CENTER_Y}
          stroke="#8b5cf6"
          strokeWidth={1.5}
          opacity={0.5}
        />
        <circle ref={massGlowRef} cx={X1} cy={CENTER_Y} r={30} fill="url(#drag-glow)" opacity={0.22} />
        <circle ref={massRef} cx={X1} cy={CENTER_Y} r={11} fill="#ede9fe" />

        <g className="text-muted-foreground">
          <text
            x={X0}
            y={CENTER_Y - SCALE_Y - 8}
            className="fill-current font-mono"
            fontSize={14}
            letterSpacing="3"
          >
            RUSH ▲
          </text>
          <text
            x={X0}
            y={CENTER_Y + SCALE_Y + 22}
            className="fill-current font-mono"
            fontSize={14}
            letterSpacing="3"
          >
            DRAG ▼
          </text>
          <text
            x={X1 + 6}
            y={CENTER_Y + SCALE_Y + 22}
            textAnchor="end"
            className="fill-current font-mono"
            fontSize={12}
            letterSpacing="2"
          >
            chafe pull
          </text>
        </g>
      </svg>

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Drag
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Hold a true pulse against the gravity of your own echo. Widen the canyon
            and your delayed self drags your tempo off the beat — sharp when it&apos;s
            near, flat when it&apos;s far. Land inside the band and hold to lock.
          </p>
        </div>
        <Link
          href="/dream"
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream lab
        </Link>
      </div>

      {/* Controls / HUD */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs uppercase tracking-[0.18em]">
          <span className="text-muted-foreground">
            tempo <span ref={bpmValRef} className="text-primary">—</span> bpm
          </span>
          <span className="text-muted-foreground">
            drift <span ref={driftValRef} className="text-primary">+0.0</span>
          </span>
          <span className="text-muted-foreground">
            canyon <span ref={canyonValRef} className="text-foreground">180 ms · 180 rt</span>
          </span>
          <span className={locked ? "text-primary" : "text-muted-foreground"}>
            <span ref={stateValRef}>silent</span>
          </span>
          <span className="text-muted-foreground">{auto ? "demo drift" : "you"}</span>
        </div>

        {/* Sliders */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-3">
            <span className="w-28 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              canyon
            </span>
            <input
              type="range"
              min={ONEWAY_MIN}
              max={ONEWAY_MAX}
              step={1}
              value={oneWayUi}
              onChange={onOneWay}
              aria-label="canyon width (one-way delay, ms)"
              className="h-11 w-56 accent-primary"
            />
          </label>
          <label className="flex items-center gap-3">
            <span className="w-28 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              target bpm
            </span>
            <input
              type="range"
              min={TARGET_MIN}
              max={TARGET_MAX}
              step={1}
              value={targetUi}
              onChange={onTarget}
              aria-label="target tempo (BPM)"
              className="h-11 w-56 accent-primary"
            />
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground">
              {targetUi}
            </span>
          </label>
        </div>

        {/* Buttons + tap pad */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              takeOver();
              fireTapRef.current(performance.now(), TAP_FREQ);
            }}
            className="min-h-[64px] min-w-[160px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            TAP
          </button>
          <button
            onClick={() => void startAudio()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {soundLocked ? "Start sound" : "Sound on"}
          </button>
          <button
            onClick={toggleAuto}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {auto ? "Stop demo" : "Demo drift"}
          </button>
          <button
            onClick={toggleMetro}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {metroUi ? "Metronome on" : "Metronome off"}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span className="text-foreground">space</span> / pad tap ·{" "}
          <span className="text-foreground">A S D F</span> pitched taps ·{" "}
          drag the <span className="text-foreground">canyon</span> to feel the pull
          {soundLocked && <span className="text-primary"> · tap to enable sound</span>}
        </p>

        {error && <p className="max-w-lg text-sm text-destructive">{error}</p>}
      </div>

      {/* Design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              You, one canyon-width ago
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                When two musicians play across a network delay their tempo does not
                stay put — it drifts. Chafe, Cáceres &amp; Gurevich (CCRMA SoundWIRE)
                found that <span className="text-foreground">short</span> delays make
                an ensemble accelerate (each player rushes to fill the gap they hear)
                while <span className="text-foreground">long</span> delays make it
                decelerate (each waits for the other). Only a narrow ~10–20 ms
                one-way window lets a steady tempo lock.
              </p>
              <p>
                Here your partner is literally you: every tap is echoed back across a
                canyon whose width you set (5–500 ms one-way; the DelayNode returns at
                2× — there and back — with a soft, lowpassed, opposite-panned feedback
                tail, the &quot;distant&quot; you). The trace measures your real
                inter-tap intervals — nothing snaps to a grid. It tends to ride sharp
                at a narrow canyon and flat at a wide one; the dashed marker is the
                Chafe pull the theory predicts. Hold within ±{LOCK_TOL} BPM of target
                for {LOCK_BEATS} beats to lock.
              </p>
              <p>
                Sound is a delay-line instrument, not spectral analysis: no FFT, no
                AnalyserNode. The visuals are inline SVG. The demo is a seeded virtual
                player (mulberry32) so the drift reads on a headless review screen with
                no input; tap and it hands the pulse to you.
              </p>
              <p className="text-xs">
                Not verified headless: real audio timbre / panning, the felt magnitude
                of the pull on a live human, and exact latency of your own OS audio
                path — the demo bakes in the Chafe law; a real player supplies their
                own drift.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
