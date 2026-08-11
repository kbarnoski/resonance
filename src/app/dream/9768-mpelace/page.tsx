"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import {
  COL_MAX,
  COL_MIN,
  PROGRESSION,
  ROW_MAX,
  ROW_MIN,
  cellKey,
  hexToPixel,
  makeGrid,
  type HexCell,
  type TuningMode,
} from "./tuning";
import { InternalSynth } from "./synth";
import {
  MpeVoicePool,
  listOutputs,
  requestMidiAccess,
  webMidiSupported,
  type MpeOutput,
  type MpeSendInfo,
} from "./midi";

// ─────────────────────────────────────────────────────────────────────────────
// MPELACE (9768) — a browser isomorphic keyboard that is also a real
// microtonal MIDI-OUT surface. See README.md for the full write-up:
// Bosanquet generalised keyboard / Wicki–Hayden layout, MPE per-note
// pitch-bend, 5-limit JI vs 31-EDO, and Plomp & Levelt beating-as-shimmer.
// ─────────────────────────────────────────────────────────────────────────────

// Seeded PRNG for the auto-arpeggiator (deterministic — never Math.random).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VELOCITY = 0.85; // fixed tap velocity — deterministic, no RNG needed
const SHIMMER_MAX_HZ = 3; // safety clamp on the visual pulse rate (≤ ~3 Hz)

// Computer-keyboard fallback for the "keyboard" input tag: four playable rows
// mapped straight onto four lattice rows, same columns (-3..3) throughout —
// the isomorphism holds on the QWERTY rows too (a shifted shape is still a
// fixed relative interval).
const KEY_ROWS: { row: number; keys: string }[] = [
  { row: 2, keys: "zxcvbnm" },
  { row: 1, keys: "asdfghj" },
  { row: 0, keys: "1234567" },
  { row: -1, keys: "qwertyu" },
];
const KEY_TO_CELL = new Map<string, { col: number; row: number }>();
for (const { row, keys } of KEY_ROWS) {
  for (let i = 0; i < keys.length; i++) {
    KEY_TO_CELL.set(keys[i], { col: i + COL_MIN, row });
  }
}

interface HeldNote {
  cell: HexCell;
  refCount: number;
  phase: number;
  source: "user" | "arp";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function MpelacePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const synthRef = useRef<InternalSynth | null>(null);
  const mpeRef = useRef<MpeVoicePool>(new MpeVoicePool());
  const midiAccessRef = useRef<MIDIAccess | null>(null);

  const modeRef = useRef<TuningMode>("ji5");
  const gridRef = useRef<Map<string, HexCell>>(new Map());
  const heldRef = useRef<Map<string, HeldNote>>(new Map());
  const pointerCellRef = useRef<Map<number, string>>(new Map());
  const activeKeysRef = useRef<Set<string>>(new Set());

  const interactedRef = useRef(false);
  const reducedRef = useRef(false);
  const rngRef = useRef(mulberry32(0x9768));
  const arpStateRef = useRef({ progIdx: 0, order: [0, 1, 2], noteIdx: 0, lastStep: 0, key: "" });

  const layoutRef = useRef({ size: 26, offX: 0, offY: 0 });

  const [audioOn, setAudioOn] = useState(false);
  const [mode, setMode] = useState<TuningMode>("ji5");
  const [autoOn, setAutoOn] = useState(true);
  const [midiState, setMidiState] = useState<"checking" | "unsupported" | "denied" | "ready">("checking");
  const [outputs, setOutputs] = useState<MpeOutput[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string>("");
  const [lastSend, setLastSend] = useState<(MpeSendInfo & { name: string; cents: number }) | null>(null);

  // ── grid + audio helpers ────────────────────────────────────────────────
  const rebuildGrid = useCallback((m: TuningMode) => {
    const map = new Map<string, HexCell>();
    for (const cell of makeGrid(m)) map.set(cellKey(cell.col, cell.row), cell);
    gridRef.current = map;
  }, []);

  const ensureAudio = useCallback(() => {
    if (ctxRef.current) {
      void ctxRef.current.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    void ctx.resume();
    const master = createSafeMaster(ctx, { gain: 0.16 });
    ctxRef.current = ctx;
    masterRef.current = master;
    synthRef.current = new InternalSynth(ctx, master.input);
    setAudioOn(true);
  }, []);

  const takeControl = useCallback(() => {
    if (!interactedRef.current) {
      interactedRef.current = true;
      setAutoOn(false);
      // release any lingering auto-arp visual holds cleanly
      for (const [key, held] of heldRef.current) {
        if (held.source === "arp") heldRef.current.delete(key);
      }
    }
    ensureAudio();
  }, [ensureAudio]);

  const startCell = useCallback(
    (key: string, source: "user" | "arp") => {
      const cell = gridRef.current.get(key);
      if (!cell) return;
      const existing = heldRef.current.get(key);
      if (existing) {
        existing.refCount += 1;
        return;
      }
      heldRef.current.set(key, { cell, refCount: 1, phase: 0, source });

      // MPE-out and the internal synth only ever sound for real user input —
      // the pre-interaction auto-arpeggiator is visual-only (see brief: no
      // AudioContext before a gesture, and nothing should be sent to a real
      // MIDI device until the player has taken control).
      if (source === "user") {
        if (synthRef.current) synthRef.current.noteOn(key, cell.freqHz, VELOCITY);
        const bendSemitones = cell.cents / 100;
        const info = mpeRef.current.noteOn(key, cell.midi, bendSemitones, VELOCITY);
        setLastSend({ ...info, name: cell.name, cents: cell.cents });
      }
    },
    [],
  );

  const stopCell = useCallback((key: string, source: "user" | "arp") => {
    const held = heldRef.current.get(key);
    if (!held) return;
    held.refCount -= 1;
    if (held.refCount > 0) return;
    heldRef.current.delete(key);
    if (source === "user") {
      if (synthRef.current) synthRef.current.noteOff(key);
      mpeRef.current.noteOff(key);
    }
  }, []);

  const toggleMode = useCallback(() => {
    takeControl();
    const next: TuningMode = modeRef.current === "ji5" ? "edo31" : "ji5";
    modeRef.current = next;
    setMode(next);
    rebuildGrid(next);
  }, [rebuildGrid, takeControl]);

  const selectOutput = useCallback((id: string) => {
    takeControl();
    setSelectedOutputId(id);
    const access = midiAccessRef.current;
    const output = access ? access.outputs.get(id) ?? null : null;
    mpeRef.current.setOutput(output ?? null);
  }, [takeControl]);

  // ── mount: MIDI access, canvas rig, pointer/keyboard, render loop ───────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    rebuildGrid(modeRef.current);
    const mpe = mpeRef.current; // stable for this effect's lifetime; captured for cleanup

    let cancelled = false;
    if (webMidiSupported()) {
      requestMidiAccess().then((access) => {
        if (cancelled) return;
        if (!access) {
          setMidiState("denied");
          return;
        }
        midiAccessRef.current = access;
        const refreshOutputs = () => {
          const outs = listOutputs(access);
          setOutputs(outs);
          setSelectedOutputId((cur) => {
            if (cur && outs.some((o) => o.id === cur)) return cur;
            if (outs.length > 0) {
              const out = access.outputs.get(outs[0].id) ?? null;
              mpe.setOutput(out);
              return outs[0].id;
            }
            mpe.setOutput(null);
            return "";
          });
        };
        refreshOutputs();
        access.onstatechange = refreshOutputs;
        setMidiState("ready");
      });
    } else {
      setMidiState("unsupported");
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      computeLayout(canvas.width, canvas.height);
    };

    function computeLayout(w: number, h: number) {
      // bounding box of the grid at unit hex size, then scale to fit.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let r = ROW_MIN; r <= ROW_MAX; r++) {
        for (let c = COL_MIN; c <= COL_MAX; c++) {
          const { x, y } = hexToPixel(c, r, 1);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
      const hexPad = 1.15; // room for the hex's own radius + label
      const spanX = (maxX - minX) + hexPad * 2;
      const spanY = (maxY - minY) + hexPad * 2;
      const pad = 40;
      const size = clamp(Math.min((w - pad) / spanX, (h - pad) / spanY), 14, 52);
      layoutRef.current = {
        size,
        offX: w / 2 - size * (minX + maxX) / 2,
        offY: h / 2 - size * (minY + maxY) / 2,
      };
    }

    resize();
    window.addEventListener("resize", resize);

    // ── pointer play ────────────────────────────────────────────────────
    function localPoint(e: PointerEvent): { x: number; y: number } {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
    }

    function pixelToCellKey(px: number, py: number): string | null {
      const { size, offX, offY } = layoutRef.current;
      const x = (px - offX) / size;
      const y = (py - offY) / size;
      const r = y / 1.5;
      const q = x / Math.sqrt(3) - r / 2;
      // cube rounding
      const rx = q, rz = r, ry = -q - r;
      let ix = Math.round(rx), iy = Math.round(ry), iz = Math.round(rz);
      const dx = Math.abs(ix - rx), dy = Math.abs(iy - ry), dz = Math.abs(iz - rz);
      if (dx > dy && dx > dz) ix = -iy - iz;
      else if (dy > dz) iy = -ix - iz;
      else iz = -ix - iy;
      const col = ix, row = iz;
      if (col < COL_MIN || col > COL_MAX || row < ROW_MIN || row > ROW_MAX) return null;
      return cellKey(col, row);
    }

    const onPointerDown = (e: PointerEvent) => {
      takeControl();
      const p = localPoint(e);
      const key = pixelToCellKey(p.x, p.y);
      if (!key) return;
      pointerCellRef.current.set(e.pointerId, key);
      startCell(key, "user");
      canvas!.setPointerCapture(e.pointerId);
    };
    const onPointerUp = (e: PointerEvent) => {
      const key = pointerCellRef.current.get(e.pointerId);
      if (key) stopCell(key, "user");
      pointerCellRef.current.delete(e.pointerId);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

    // ── keyboard play + shortcuts ───────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (k === "t") { e.preventDefault(); toggleMode(); return; }
      const cellPos = KEY_TO_CELL.get(k);
      if (!cellPos) return;
      takeControl();
      if (e.repeat || activeKeysRef.current.has(k)) return;
      activeKeysRef.current.add(k);
      startCell(cellKey(cellPos.col, cellPos.row), "user");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!activeKeysRef.current.has(k)) return;
      activeKeysRef.current.delete(k);
      const cellPos = KEY_TO_CELL.get(k);
      if (cellPos) stopCell(cellKey(cellPos.col, cellPos.row), "user");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── seeded auto-arpeggiator: I–vi–IV–V, visual-only pre-interaction ──
    const shuffleOrder = (n: number): number[] => {
      const arr = Array.from({ length: n }, (_, i) => i);
      const rng = rngRef.current;
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    arpStateRef.current.order = shuffleOrder(3);
    const stepMs = reducedRef.current ? 900 : 620;

    const arpStep = (now: number) => {
      if (interactedRef.current) return;
      const st = arpStateRef.current;
      if (now - st.lastStep < stepMs) return;
      st.lastStep = now;
      if (st.key) stopCell(st.key, "arp");
      const chord = PROGRESSION[st.progIdx];
      const cellPos = chord.cells[st.order[st.noteIdx]];
      const key = cellKey(cellPos.col, cellPos.row);
      startCell(key, "arp");
      st.key = key;
      st.noteIdx += 1;
      if (st.noteIdx >= chord.cells.length) {
        st.noteIdx = 0;
        st.order = shuffleOrder(chord.cells.length);
        st.progIdx = (st.progIdx + 1) % PROGRESSION.length;
      }
    };

    // ── render loop ───────────────────────────────────────────────────
    let prev = performance.now();
    arpStateRef.current.lastStep = prev;

    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      arpStep(now);

      const reduced = reducedRef.current;
      for (const held of heldRef.current.values()) {
        const rate = reduced ? Math.min(held.cell.diffHz, 0.4) : Math.min(held.cell.diffHz, SHIMMER_MAX_HZ);
        held.phase += 6.28318530718 * rate * dt;
      }

      drawScene(ctx2d, canvas!, gridRef.current, heldRef.current, layoutRef.current);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      if (midiAccessRef.current) midiAccessRef.current.onstatechange = null;
      mpe.dispose();
      if (synthRef.current) synthRef.current.disposeAll();
      if (masterRef.current) masterRef.current.disconnect();
      if (ctxRef.current) ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      masterRef.current = null;
      synthRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const midiNotice =
    midiState === "unsupported"
      ? "Web MIDI unavailable — internal synth only."
      : midiState === "denied"
        ? "Web MIDI permission denied — internal synth only."
        : null;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Isomorphic hex lattice keyboard: tap or click a cell to sound its exact just-intonation or 31-EDO pitch."
      />

      {/* hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">MPELACE</h1>
          <p className="mt-1 max-w-md text-base text-muted-foreground">
            A hex isomorphic keyboard — any chord shape is rigid and slides
            anywhere. Tuned to exact 5-limit just intonation (toggle 31-EDO),
            it plays its own Web Audio synth AND routes out via true per-note
            MPE MIDI to your DAW or hardware, in exact microtonal tuning.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={takeControl}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start
              </button>
            ) : (
              <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 font-mono text-xs text-muted-foreground">
                sound live
              </span>
            )}
            <button
              type="button"
              onClick={toggleMode}
              aria-pressed={mode === "edo31"}
              className={
                mode === "edo31"
                  ? "min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  : "min-h-[44px] rounded-md border border-border bg-background/60 px-5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              }
            >
              {mode === "edo31" ? "31-EDO — t for JI" : "5-limit JI — t for 31-EDO"}
            </button>

            {outputs.length > 0 && (
              <select
                aria-label="MIDI output device"
                value={selectedOutputId}
                onChange={(e) => selectOutput(e.target.value)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
              >
                {outputs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            )}
          </div>
          {midiNotice && <p className="mt-2 text-base text-destructive">{midiNotice}</p>}
          {!midiNotice && outputs.length === 0 && midiState === "ready" && (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground/80">
              Web MIDI ready, no output device found — internal synth only. Plug in a device to route out.
            </p>
          )}
          {autoOn && (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground/80">
              auto-arpeggiating (seeded) I–vi–IV–V · tap a cell or press a key to take over
            </p>
          )}
        </div>
      </div>

      {/* readout: MPE mechanism made legible */}
      <div className="pointer-events-none absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
        <div className="rounded-lg border border-border bg-background/70 px-4 py-3 text-right backdrop-blur-sm">
          <div className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {lastSend ? lastSend.name : "—"}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
            {lastSend ? `${lastSend.cents >= 0 ? "+" : ""}${lastSend.cents.toFixed(1)}¢` : "tap a cell"}
            {" · "}
            {mode === "edo31" ? "31-EDO" : "just"}
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums text-primary">
            {lastSend ? `MPE ch${lastSend.channel} · bend ${lastSend.bend14}` : "MPE ch— · bend —"}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
            {outputs.length > 0 ? "sending" : "would send (no device)"}
          </div>
        </div>
      </div>

      {/* instructions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-4 sm:bottom-16">
        <div className="pointer-events-auto max-w-xl rounded-lg border border-border bg-background/70 p-4 text-center backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            isomorphic lattice · consonance is geometry
          </p>
          <p className="mt-1.5 text-base text-muted-foreground">
            Tap/click hexes to play (multi-touch chords work). Keys 1234567 /
            qwertyu / asdfghj / zxcvbnm play four lattice rows. <b>t</b> toggles
            JI ↔ 31-EDO. Neighbours are consonant: right = fifth (3/2), up-right
            = major third (5/4). Violet marks the tonic and every held note;
            held cells shimmer at |exact − 12-TET| Hz — still if near-tempered,
            gently beating if a pure third or seventh.
          </p>
        </div>
      </div>

      <PrototypeNav slugs={["9768-mpelace"]} />
    </main>
  );
}

// ── drawing ──────────────────────────────────────────────────────────────
// Clinical high-key palette: near-white ground, ink/graphite lattice lines,
// one violet accent for the active/root cell. Raw hex is fine here — this is
// the art layer, a deliberate fixed instrument-panel look independent of the
// site's light/dark theme (matching the sibling prototypes' convention).
const COL_GROUND = "#f6f5f2";
const COL_INK = "#26262b";
const COL_LINE = "#c9c8c2";
const COL_LABEL = "#5b5a58";
const COL_VIOLET = "#7c3aed";
const COL_VIOLET_SOFT = "rgba(124,58,237,0.16)";

function hexPath(g: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30); // pointy-top
    const x = cx + size * 0.92 * Math.cos(angle);
    const y = cy + size * 0.92 * Math.sin(angle);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function drawScene(
  g: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  grid: Map<string, HexCell>,
  held: Map<string, HeldNote>,
  layout: { size: number; offX: number; offY: number },
) {
  const w = canvas.width, h = canvas.height;
  g.fillStyle = COL_GROUND;
  g.fillRect(0, 0, w, h);

  const { size, offX, offY } = layout;
  const fontSize = Math.max(8, Math.round(size * 0.34));

  for (const cell of grid.values()) {
    const { x, y } = hexToPixel(cell.col, cell.row, size);
    const cx = x + offX, cy = y + offY;
    const isRoot = cell.col === 0 && cell.row === 0;
    const heldNote = held.get(cellKey(cell.col, cell.row));

    hexPath(g, cx, cy, size);
    if (heldNote) {
      const glow = 0.5 + 0.5 * Math.sin(heldNote.phase);
      g.fillStyle = `rgba(124,58,237,${(0.22 + 0.30 * glow).toFixed(3)})`;
    } else if (isRoot) {
      g.fillStyle = COL_VIOLET_SOFT;
    } else {
      g.fillStyle = "#ffffff";
    }
    g.fill();
    g.lineWidth = isRoot || heldNote ? 2 : 1;
    g.strokeStyle = isRoot || heldNote ? COL_VIOLET : COL_LINE;
    g.stroke();

    g.fillStyle = heldNote ? COL_VIOLET : COL_INK;
    g.font = `600 ${fontSize}px ui-monospace, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(cell.name, cx, cy - fontSize * 0.45);
    g.fillStyle = COL_LABEL;
    g.font = `${Math.max(7, fontSize * 0.72)}px ui-monospace, monospace`;
    const centsTxt = `${cell.cents >= 0 ? "+" : ""}${cell.cents.toFixed(0)}¢`;
    g.fillText(centsTxt, cx, cy + fontSize * 0.55);
  }
}
