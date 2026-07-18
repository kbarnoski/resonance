"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { AudioEngine, type ChordGroup } from "./audio";
import {
  cellsForKey,
  chordPcs,
  COL_LABELS,
  INITIAL_VOICING,
  keyName,
  MAX_MIDI,
  MIN_MIDI,
  modLabel,
  modulate,
  voiceLead,
  type Key,
} from "./harmony";
import { README } from "./readme-text";

// ── cold graphite palette (SVG art layer only — raw hex is exempt) ────────────
const GROUND = "#0b0c0e"; // charcoal ground
const PANEL = "#131519"; // faint cool grey cell fill
const HAIR = "#3a3f46"; // hairline structure
const INK = "#e9edf1"; // near-white ink
const INK_DIM = "#6a717a"; // muted cool grey
const ACTIVE = "#eef2f6"; // inverted near-white

// ── SVG geometry (viewBox 0 0 120 200, portrait) ─────────────────────────────
const VB_W = 120;
const VB_H = 200;
const G = { x0: 8, y0: 64, w: 104, h: 104, cols: 4, rows: 3 };
const RIB_TOP = 16;
const RIB_BOTTOM = 52;
const LANE_X = [24, 48, 72, 96];
const MOD_Y = 174;
const MOD_H = 16;

function cellRect(i: number) {
  const col = i % G.cols;
  const row = Math.floor(i / G.cols);
  const cw = G.w / G.cols;
  const ch = G.h / G.rows;
  return { x: G.x0 + col * cw, y: G.y0 + row * ch, w: cw, h: ch, col };
}
function modRect(i: number) {
  const mw = G.w / 2;
  return { x: G.x0 + i * mw, y: MOD_Y, w: mw, h: MOD_H };
}
function pitchY(m: number): number {
  const t = (m - MIN_MIDI) / (MAX_MIDI - MIN_MIDI);
  return RIB_BOTTOM - t * (RIB_BOTTOM - RIB_TOP);
}

type Hit =
  | { type: "chord"; index: number }
  | { type: "mod"; index: number }
  | null;

function hitTest(x: number, y: number): Hit {
  for (let i = 0; i < 12; i++) {
    const r = cellRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return { type: "chord", index: i };
    }
  }
  for (let i = 0; i < 2; i++) {
    const r = modRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return { type: "mod", index: i };
    }
  }
  return null;
}

interface PointerEntry {
  cell: number; // >=0 chord cell, -1 = modulation (ignore drag)
  group: ChordGroup | null;
}

export default function TenFingersPage() {
  const engineRef = useRef<AudioEngine | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointersRef = useRef<Map<number, PointerEntry>>(new Map());
  const anchorRef = useRef<number[]>([...INITIAL_VOICING]);
  const targetRef = useRef<number[]>([...INITIAL_VOICING]);
  const displayRef = useRef<number[]>([...INITIAL_VOICING]);
  const activeCountRef = useRef(0);
  const levelRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const polyRef = useRef<SVGPolylineElement | null>(null);
  const ribbonRef = useRef<SVGGElement | null>(null);
  const dotRefs = useRef<Array<SVGCircleElement | null>>([]);

  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [key, setKey] = useState<Key>({ tonicPc: 0, mode: "major" });
  const [active, setActive] = useState<number[]>([]);
  const [modFlash, setModFlash] = useState<number | null>(null);
  const [lastChord, setLastChord] = useState<string>("—");

  const cells = useMemo(() => cellsForKey(key), [key]);
  const keyRef = useRef(key);
  keyRef.current = key;
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  const syncActive = useCallback(() => {
    const arr: number[] = [];
    let count = 0;
    pointersRef.current.forEach((e) => {
      if (e.cell >= 0) {
        arr.push(e.cell);
        count++;
      }
    });
    activeCountRef.current = count;
    setActive(arr);
  }, []);

  // Voice a chord for a pointer, gliding from the current anchor voicing.
  const triggerChord = useCallback(
    (pid: number, index: number) => {
      const engine = engineRef.current;
      if (!engine || !engine.ready) return;
      const cell = cellsRef.current[index];
      const pcs = chordPcs(cell, keyRef.current);
      const from = anchorRef.current.slice();
      const to = voiceLead(from, pcs);
      anchorRef.current = to;
      targetRef.current = to.slice();

      const group = engine.press(from, to);
      const prev = pointersRef.current.get(pid);
      if (prev?.group) prev.group.release();
      pointersRef.current.set(pid, { cell: index, group });
      setLastChord(cell.roman);
      syncActive();
    },
    [syncActive],
  );

  const doModulate = useCallback((index: number) => {
    setKey((k) => modulate(k, index === 0 ? "dominant" : "relative"));
    setModFlash(index);
    window.setTimeout(() => setModFlash(null), 220);
  }, []);

  const svgPoint = useCallback((e: React.PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!started) return;
      const p = svgPoint(e);
      if (!p) return;
      const hit = hitTest(p.x, p.y);
      if (!hit) return;
      try {
        svgRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (hit.type === "mod") {
        pointersRef.current.set(e.pointerId, { cell: -1, group: null });
        doModulate(hit.index);
        return;
      }
      triggerChord(e.pointerId, hit.index);
    },
    [started, svgPoint, triggerChord, doModulate],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const entry = pointersRef.current.get(e.pointerId);
      if (!entry || entry.cell < 0) return;
      const p = svgPoint(e);
      if (!p) return;
      const hit = hitTest(p.x, p.y);
      if (hit && hit.type === "chord" && hit.index !== entry.cell) {
        triggerChord(e.pointerId, hit.index); // glissando with voice-leading
      }
    },
    [svgPoint, triggerChord],
  );

  const endPointer = useCallback(
    (e: React.PointerEvent) => {
      const entry = pointersRef.current.get(e.pointerId);
      if (entry?.group) entry.group.release();
      pointersRef.current.delete(e.pointerId);
      try {
        svgRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      syncActive();
    },
    [syncActive],
  );

  const begin = useCallback(async () => {
    try {
      if (!engineRef.current) engineRef.current = new AudioEngine();
      await engineRef.current.resume();
      setAudioError(null);
      setStarted(true);
    } catch {
      setAudioError("Audio could not start on this device — the grid is silent.");
    }
  }, []);

  // rAF: glide the display voicing toward the target; fade the ribbon with play.
  useEffect(() => {
    const loop = () => {
      const disp = displayRef.current;
      const tgt = targetRef.current;
      for (let i = 0; i < 4; i++) {
        disp[i] += (tgt[i] - disp[i]) * 0.18;
      }
      const wantLevel = activeCountRef.current > 0 ? 1 : 0;
      levelRef.current += (wantLevel - levelRef.current) * 0.08;

      const pts = disp.map((m, i) => `${LANE_X[i]},${pitchY(m).toFixed(2)}`).join(" ");
      polyRef.current?.setAttribute("points", pts);
      for (let i = 0; i < 4; i++) {
        const d = dotRefs.current[i];
        if (d) d.setAttribute("cy", pitchY(disp[i]).toFixed(2));
      }
      ribbonRef.current?.setAttribute(
        "opacity",
        (0.22 + 0.62 * levelRef.current).toFixed(3),
      );
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Teardown on unmount.
  useEffect(() => {
    const pointers = pointersRef.current;
    return () => {
      pointers.forEach((e) => e.group?.release());
      pointers.clear();
      engineRef.current?.stop();
    };
  }, []);

  const activeSet = useMemo(() => new Set(active), [active]);
  const refLines = [48, 60, 72]; // C3, C4, C5
  const refNames = ["C3", "C4", "C5"];

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* header chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ten Fingers</h1>
        <p className="max-w-xl text-base text-muted-foreground">
          A glass chord instrument that speaks real functional harmony — press a cell to voice a
          diatonic function, hold several to conduct a progression, and it stays silent until you
          touch it.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            key {keyName(key)}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            chord {lastChord}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {active.length > 0 ? `${active.length} held` : started ? "silent" : "idle"}
          </span>
        </div>
      </div>

      {/* the instrument */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none", background: GROUND }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      >
        {/* voice-leading ribbon */}
        <g ref={ribbonRef} opacity={0.22}>
          {refLines.map((m, i) => (
            <g key={m}>
              <line
                x1={16}
                x2={104}
                y1={pitchY(m)}
                y2={pitchY(m)}
                stroke={HAIR}
                strokeWidth={0.25}
              />
              <text
                x={12}
                y={pitchY(m) + 1.4}
                fontSize={3}
                fill={INK_DIM}
                fontFamily="ui-monospace, monospace"
                textAnchor="end"
              >
                {refNames[i]}
              </text>
            </g>
          ))}
          {LANE_X.map((x) => (
            <line
              key={x}
              x1={x}
              x2={x}
              y1={RIB_TOP}
              y2={RIB_BOTTOM}
              stroke={HAIR}
              strokeWidth={0.2}
            />
          ))}
          <polyline
            ref={polyRef}
            fill="none"
            stroke={INK}
            strokeWidth={0.6}
            strokeLinejoin="round"
            points={displayRef.current
              .map((m, i) => `${LANE_X[i]},${pitchY(m)}`)
              .join(" ")}
          />
          {LANE_X.map((x, i) => (
            <circle
              key={x}
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              cx={x}
              cy={pitchY(displayRef.current[i])}
              r={1.4}
              fill={INK}
            />
          ))}
        </g>

        {/* column function headers */}
        {COL_LABELS.map((label, c) => {
          const cw = G.w / G.cols;
          return (
            <text
              key={label}
              x={G.x0 + c * cw + cw / 2}
              y={G.y0 - 3}
              fontSize={2.6}
              fill={INK_DIM}
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
              style={{ letterSpacing: "0.14em" }}
            >
              {label}
            </text>
          );
        })}

        {/* chord matrix */}
        {cells.map((cell, i) => {
          const r = cellRect(i);
          const on = activeSet.has(i);
          const pad = 1.3;
          return (
            <g key={i}>
              <rect
                x={r.x + pad}
                y={r.y + pad}
                width={r.w - pad * 2}
                height={r.h - pad * 2}
                rx={1.2}
                fill={on ? ACTIVE : PANEL}
                stroke={on ? ACTIVE : HAIR}
                strokeWidth={0.3}
                style={{ transition: "fill 110ms linear, stroke 110ms linear" }}
              />
              <text
                x={r.x + r.w / 2}
                y={r.y + r.h / 2 + 2.2}
                fontSize={6}
                fill={on ? GROUND : INK}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
                style={{ transition: "fill 110ms linear" }}
              >
                {cell.roman}
              </text>
              <text
                x={r.x + r.w / 2}
                y={r.y + r.h - 3}
                fontSize={2.2}
                fill={on ? GROUND : INK_DIM}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
                style={{ letterSpacing: "0.1em", transition: "fill 110ms linear" }}
              >
                {cell.cat}
              </text>
            </g>
          );
        })}

        {/* modulation strip */}
        {[0, 1].map((i) => {
          const r = modRect(i);
          const on = modFlash === i;
          const pad = 1.3;
          return (
            <g key={i}>
              <rect
                x={r.x + pad}
                y={r.y + pad}
                width={r.w - pad * 2}
                height={r.h - pad * 2}
                rx={1.2}
                fill={on ? ACTIVE : "transparent"}
                stroke={on ? ACTIVE : HAIR}
                strokeWidth={0.3}
                strokeDasharray="1.4 1.2"
                style={{ transition: "fill 110ms linear, stroke 110ms linear" }}
              />
              <text
                x={r.x + r.w / 2}
                y={r.y + r.h / 2 + 1.4}
                fontSize={3}
                fill={on ? GROUND : INK_DIM}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
                style={{ letterSpacing: "0.14em", transition: "fill 110ms linear" }}
              >
                {modLabel(key, i === 0 ? "dominant" : "relative")}
              </text>
            </g>
          );
        })}
      </svg>

      {/* start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-end justify-center p-8 sm:items-center">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background/70 p-6 backdrop-blur-sm">
            <p className="max-w-sm text-center text-base text-muted-foreground">
              The grid is a still, cold lattice until a real finger lands on it. Press to wake the
              audio, then play — one finger or ten.
            </p>
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Touch to play
            </button>
          </div>
        </div>
      )}

      {audioError && (
        <p className="absolute bottom-20 left-5 z-20 text-sm text-destructive sm:left-7">
          {audioError}
        </p>
      )}

      {/* design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-5 top-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:right-7 sm:top-7"
      >
        Read the design notes
      </button>
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README}
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1910-ten-fingers"]} />
    </main>
  );
}
