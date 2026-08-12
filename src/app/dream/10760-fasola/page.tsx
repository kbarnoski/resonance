"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ─────────────────────────────────────────────────────────────────────────────
// 10760-fasola — "Raise the hollow square"
//
// The lab's first Sacred Harp / shape-note piece. You read a hymn tune as the
// four classic 1846 Aikin shapes (fa = right-triangle, sol = oval, la =
// rectangle, mi = diamond), sung as shapes not words, in the raw OPEN dispersed
// harmony of the tradition. Add each voice yourself until the whole hollow
// square is ringing. Named reference: THE SACRED HARP (B.F. White & E.J. King,
// 1844) + the Aikin / Little & Smith four-shape "patent note" system + the
// tradition of dispersed harmony. A living oral technique, ported.
// ─────────────────────────────────────────────────────────────────────────────

// — deterministic PRNG —
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// nearest midi of a given pitch-class to a target register
function nearestPcMidi(pc: number, target: number) {
  const r = (((target - pc) % 12) + 12) % 12;
  const down = target - r;
  const up = down + 12;
  return target - down <= up - target ? down : up;
}

type Shape = "fa" | "sol" | "la" | "mi";

// movable-do fasola: by scale degree 1=fa 2=sol 3=la 4=fa 5=sol 6=la 7=mi 8=fa.
// The tune lives in A-minor pentatonic (degrees 1,b3,4,5,b7 of natural minor):
//   A(pc9)=deg1=fa · C(pc0)=deg3=la · D(pc2)=deg4=fa · E(pc4)=deg5=sol · G(pc7)=deg7=mi
const PC_SHAPE: Record<number, Shape> = { 9: "fa", 0: "la", 2: "fa", 4: "sol", 7: "mi" };

const TOTAL_BEATS = 64; // 16 bars of 4/4

type Ev = {
  startBeat: number;
  durBeats: number;
  shape: Shape;
  mid: [number, number, number, number]; // treble, alto, tenor, bass
  x: number;
  y: number;
};

function midiToY(m: number) {
  const t = (m - 54) / (74 - 54);
  return 160 - t * 120; // 40..160 in the staff viewBox
}

const STAFF_W = 1000;
const MARGIN_L = 96;
const MARGIN_R = 34;
const PLOT_W = STAFF_W - MARGIN_L - MARGIN_R;

function beatToX(beat: number) {
  return MARGIN_L + (beat / TOTAL_BEATS) * PLOT_W;
}

// Author the hymn once, deterministically.
function makeSong(): Ev[] {
  const rng = mulberry32(0x10760);
  const LADDER = [57, 60, 62, 64, 67, 69, 72, 74]; // A-minor pentatonic rungs
  const patterns: number[][] = [
    [2, 2],
    [2, 2],
    [4],
    [2, 1, 1],
    [1, 1, 2],
  ];
  // root offsets from A per bar — AABA: A={i,VII,iv,v}, B={III,VII,iv,v}
  const barPlan = [0, 10, 5, 7, 0, 10, 5, 7, 3, 10, 5, 7, 0, 10, 5, 7];
  const steps = [-2, -1, -1, 0, 1, 1, 2];

  let idx = 3; // start on E4
  let beat = 0;
  const events: Ev[] = [];

  for (let bar = 0; bar < 16; bar++) {
    const pat = patterns[Math.floor(rng() * patterns.length)];
    const rootPc = (9 + barPlan[bar]) % 12;
    const fifthPc = (rootPc + 7) % 12;
    const thirdPc = (rootPc + 3) % 12;
    const lastBar = bar % 4 === 3;

    for (let n = 0; n < pat.length; n++) {
      idx += steps[Math.floor(rng() * steps.length)];
      idx = Math.max(0, Math.min(7, idx));
      const cadence = lastBar && n === pat.length - 1;
      if (cadence) idx = bar === 15 ? 0 : 5; // land on the tonic

      const tenor = LADDER[idx];
      const useThird = cadence; // a rare open third for cadential colour
      const bass = nearestPcMidi(rootPc, 40);
      const treble = nearestPcMidi(rootPc, tenor + 12); // bare octave / doubling
      const alto = nearestPcMidi(useThird ? thirdPc : fifthPc, 60); // open fifth

      events.push({
        startBeat: beat,
        durBeats: pat[n],
        shape: PC_SHAPE[tenor % 12],
        mid: [treble, alto, tenor, bass],
        x: beatToX(beat),
        y: midiToY(tenor),
      });
      beat += pat[n];
    }
  }
  return events;
}

const SONG = makeSong();

// — the four sections of the singing, seated facing inward (hollow square) —
type VMeta = {
  id: number;
  name: string;
  key: string;
  formant: number;
  gain: number;
  detune: number[];
};
const VOICES: VMeta[] = [
  { id: 0, name: "Treble", key: "1", formant: 920, gain: 0.12, detune: [-7, 0, 6] },
  { id: 1, name: "Alto", key: "2", formant: 720, gain: 0.12, detune: [-5, 0, 5] },
  { id: 2, name: "Tenor", key: "3", formant: 600, gain: 0.17, detune: [-6, 0, 7] },
  { id: 3, name: "Bass", key: "4", formant: 430, gain: 0.15, detune: [-4, 0, 8] },
];

// order in which the auto-performer raises the parts: tune, then foundation,
// then the inner voice, then the top — the square fills in.
const AUTO_ORDER = [2, 3, 1, 0];
const AUTO_ENTRANCE_S = [0, 5, 10, 15];

// — SVG art palette (raw literals allowed only inside the art layer) —
const C_PARCH = "#f2ecdb";
const C_INK = "#211e28";
const C_INK_SOFT = "#4a4654";
const C_LINE = "#37333f";
const C_VIOLET = "#7c3aed";
const C_VIOLET_HI = "#a78bfa";

function shapePath(shape: Shape, x: number, y: number, h: number): string {
  if (shape === "fa") {
    // right-triangle, vertical left edge, pointing right
    return `M ${x - h} ${y - h} L ${x + h} ${y} L ${x - h} ${y + h} Z`;
  }
  if (shape === "mi") {
    // diamond
    return `M ${x} ${y - h} L ${x + h} ${y} L ${x} ${y + h} L ${x - h} ${y} Z`;
  }
  return ""; // sol (ellipse) and la (rect) render as their own elements
}

export default function FasolaPage() {
  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [voices, setVoices] = useState<boolean[]>([false, false, false, false]);
  const [bpm, setBpm] = useState(92);
  const [autoBadge, setAutoBadge] = useState(true);
  const [nowShape, setNowShape] = useState<Shape | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // engine refs (never re-created in the hot loop)
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const oscRef = useRef<OscillatorNode[]>([]);
  const rafRef = useRef<number>(0);

  const startedRef = useRef(false);
  const autoModeRef = useRef(true);
  const voicesRef = useRef<boolean[]>([false, false, false, false]);
  const bpmRef = useRef(92);

  // transport clock (visual-first, independent of audio)
  const beatBaseRef = useRef(0);
  const timeBaseRef = useRef(0);
  const prevAbsRef = useRef(0);
  const lastOnsetRef = useRef<number[]>([-9999, -9999, -9999, -9999]);
  const activeNoteRef = useRef(-1);

  // DOM refs for per-frame paints (no React churn in the loop)
  const noteRefs = useRef<(SVGElement | null)[]>([]);
  const playheadRef = useRef<SVGLineElement | null>(null);
  const blockRefs = useRef<(SVGGElement | null)[]>([null, null, null, null]);

  const nowRef = useCallback(() => performance.now(), []);

  const getBeat = useCallback((t: number) => {
    return beatBaseRef.current + ((t - timeBaseRef.current) * bpmRef.current) / 60000;
  }, []);

  // one detuned-sine vowel voice, soft attack, routed to the safe master
  const triggerVoice = useCallback((v: VMeta, freq: number, when: number, dur: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = v.formant;
    bp.Q.value = 3.5;
    bp.connect(g);
    g.connect(master.input);

    const oscs: OscillatorNode[] = [];
    for (const d of v.detune) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      o.detune.value = d;
      o.connect(bp);
      o.start(when);
      o.stop(when + dur + 0.35);
      oscs.push(o);
      oscRef.current.push(o);
      o.onended = () => {
        try {
          o.disconnect();
        } catch {
          /* closing */
        }
        const i = oscRef.current.indexOf(o);
        if (i >= 0) oscRef.current.splice(i, 1);
      };
    }
    const peak = v.gain;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.09); // soft choral attack
    g.gain.setValueAtTime(peak, when + Math.max(0.1, dur * 0.55));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.3);
  }, []);

  const bootAudio = useCallback(() => {
    if (startedRef.current || audioError) return;
    type WWin = Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? (window as WWin).webkitAudioContext;
    if (!AC) {
      setAudioError("Web Audio is unavailable — the hymn plays on silently.");
      return;
    }
    try {
      const ctx = new AC();
      const master = createSafeMaster(ctx);
      ctxRef.current = ctx;
      masterRef.current = master;
      void ctx.resume();
      startedRef.current = true;
      setStarted(true);
    } catch {
      setAudioError("Could not open the audio engine — the hymn plays on silently.");
    }
  }, [audioError]);

  const applyVoices = useCallback((next: boolean[]) => {
    voicesRef.current = next;
    setVoices(next);
  }, []);

  const toggleVoice = useCallback(
    (id: number) => {
      bootAudio();
      autoModeRef.current = false;
      setAutoBadge(false);
      const next = voicesRef.current.slice();
      next[id] = !next[id];
      applyVoices(next);
    },
    [applyVoices, bootAudio],
  );

  const handleStart = useCallback(() => {
    bootAudio();
    // Start unmutes the tune if the visitor hasn't chosen parts yet.
    if (autoModeRef.current) return; // auto keeps raising the parts
    if (!voicesRef.current.some(Boolean)) {
      const next = [false, false, true, false];
      applyVoices(next);
    }
  }, [applyVoices, bootAudio]);

  // — mount: start the visual transport immediately (auto-demo) —
  useEffect(() => {
    const t0 = performance.now();
    beatBaseRef.current = 0;
    timeBaseRef.current = t0;
    prevAbsRef.current = 0;

    const onKey = (e: KeyboardEvent) => {
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx >= 0) {
        e.preventDefault();
        toggleVoice(idx);
      }
    };
    window.addEventListener("keydown", onKey);

    const loop = () => {
      const now = nowRef();
      const curAbs = getBeat(now);
      const prevAbs = prevAbsRef.current;
      const loopBeat = ((curAbs % TOTAL_BEATS) + TOTAL_BEATS) % TOTAL_BEATS;

      // auto-performer raises the parts on a schedule
      if (autoModeRef.current) {
        const elapsed = (now - timeBaseRef.current) / 1000;
        const next = [false, false, false, false];
        for (let k = 0; k < AUTO_ORDER.length; k++) {
          if (elapsed >= AUTO_ENTRANCE_S[k]) next[AUTO_ORDER[k]] = true;
        }
        const cur = voicesRef.current;
        if (next.some((b, i) => b !== cur[i])) applyVoices(next);
      }

      const active = voicesRef.current;

      // edge-trigger note onsets crossed since last frame (per loop)
      for (const ev of SONG) {
        const k = Math.ceil((prevAbs - ev.startBeat) / TOTAL_BEATS);
        const onset = ev.startBeat + k * TOTAL_BEATS;
        if (onset > prevAbs && onset <= curAbs) {
          const secPerBeat = 60 / bpmRef.current;
          const durSec = ev.durBeats * secPerBeat;
          for (let id = 0; id < 4; id++) {
            if (!active[id]) continue;
            lastOnsetRef.current[id] = now;
            if (startedRef.current && ctxRef.current) {
              triggerVoice(VOICES[id], midiToFreq(ev.mid[id]), ctxRef.current.currentTime + 0.02, durSec);
            }
          }
        }
      }

      // playhead
      if (playheadRef.current) {
        const px = beatToX(loopBeat);
        playheadRef.current.setAttribute("x1", String(px));
        playheadRef.current.setAttribute("x2", String(px));
      }

      // currently-sounding tune note → light its shape
      let cur = -1;
      for (let i = 0; i < SONG.length; i++) {
        const ev = SONG[i];
        if (loopBeat >= ev.startBeat && loopBeat < ev.startBeat + ev.durBeats) {
          cur = i;
          break;
        }
      }
      if (cur !== activeNoteRef.current) {
        const prevEl = noteRefs.current[activeNoteRef.current];
        if (prevEl) {
          prevEl.setAttribute("fill", C_INK);
          prevEl.setAttribute("stroke", "none");
        }
        const el = noteRefs.current[cur];
        if (el) {
          el.setAttribute("fill", C_VIOLET);
          el.setAttribute("stroke", C_VIOLET_HI);
          el.setAttribute("stroke-width", "2");
        }
        activeNoteRef.current = cur;
        setNowShape(cur >= 0 ? SONG[cur].shape : null);
      }

      // hollow-square pulses
      for (let id = 0; id < 4; id++) {
        const grp = blockRefs.current[id];
        if (!grp) continue;
        const on = active[id];
        const env = Math.exp(-(now - lastOnsetRef.current[id]) / 320);
        if (on) {
          grp.setAttribute("fill", C_VIOLET);
          grp.setAttribute("fill-opacity", String(0.28 + 0.6 * env));
        } else {
          grp.setAttribute("fill", C_INK);
          grp.setAttribute("fill-opacity", "0.1");
        }
      }

      prevAbsRef.current = curAbs;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKey);
      for (const o of oscRef.current) {
        try {
          o.stop();
          o.disconnect();
        } catch {
          /* already stopped */
        }
      }
      oscRef.current = [];
      const master = masterRef.current;
      const ctx = ctxRef.current;
      if (master) master.disconnect();
      if (ctx && ctx.state !== "closed") void ctx.close();
      masterRef.current = null;
      ctxRef.current = null;
    };
  }, [applyVoices, getBeat, nowRef, toggleVoice, triggerVoice]);

  // bpm slider — rebase the clock so the phrase never jumps
  const onBpm = useCallback(
    (v: number) => {
      const now = performance.now();
      beatBaseRef.current = getBeat(now);
      timeBaseRef.current = now;
      bpmRef.current = v;
      setBpm(v);
    },
    [getBeat],
  );

  // — hollow-square geometry (viewBox 0 0 200 200) —
  const squareRects: Record<number, { x: number; y: number; w: number; h: number; tx: number; ty: number }> = {
    0: { x: 55, y: 18, w: 90, h: 30, tx: 100, ty: 37 }, // treble — top
    1: { x: 18, y: 55, w: 30, h: 90, tx: 33, ty: 103 }, // alto — left
    2: { x: 152, y: 55, w: 30, h: 90, tx: 167, ty: 103 }, // tenor — right
    3: { x: 55, y: 152, w: 90, h: 30, tx: 100, ty: 171 }, // bass — bottom
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-10 text-foreground">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Shape-note singing school · fasola
        </p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Raise the hollow square</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Read the hymn as the four old shapes — fa (triangle), sol (oval), la (rectangle), mi (diamond) — and
          sing the shapes, not the words. Add each voice until the whole square is ringing in open, dispersed
          harmony.
        </p>
        {autoBadge && (
          <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-md border border-border bg-accent/50 px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            auto — tap a part to sing it yourself
          </span>
        )}
      </header>

      {audioError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-base text-destructive">
          {audioError}
        </p>
      )}

      {/* — shape-note staff — */}
      <section className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          The tune — read the shapes left to right
        </p>
        <div className="overflow-x-auto rounded-md border border-border">
          <svg
            viewBox={`0 0 ${STAFF_W} 200`}
            className="block h-auto w-full min-w-[680px]"
            role="img"
            aria-label="A shape-note staff of a modal hymn tune, its notes drawn as fa, sol, la and mi shapes."
          >
            <rect x="0" y="0" width={STAFF_W} height="200" fill={C_PARCH} />
            {/* staff lines */}
            {[60, 80, 100, 120, 140].map((ly) => (
              <line key={ly} x1={MARGIN_L} y1={ly} x2={STAFF_W - MARGIN_R} y2={ly} stroke={C_LINE} strokeWidth="1.4" />
            ))}
            {/* barlines */}
            {Array.from({ length: 17 }, (_, b) => b * 4).map((bb) => (
              <line
                key={bb}
                x1={beatToX(bb)}
                y1="60"
                x2={beatToX(bb)}
                y2="140"
                stroke={C_INK_SOFT}
                strokeWidth={bb % 16 === 0 ? 2.2 : 1}
                opacity={bb % 16 === 0 ? 0.85 : 0.4}
              />
            ))}
            {/* clef-ish label */}
            <text x="30" y="106" fill={C_INK} fontSize="20" fontFamily="monospace" fontWeight="700">
              fa
            </text>
            <text x="30" y="128" fill={C_INK_SOFT} fontSize="11" fontFamily="monospace">
              Am
            </text>

            {/* noteheads */}
            {SONG.map((ev, i) => {
              const h = 9;
              const stem = (
                <line
                  x1={ev.x + h}
                  y1={ev.y}
                  x2={ev.x + h}
                  y2={ev.y - 34}
                  stroke={C_INK_SOFT}
                  strokeWidth="1.4"
                  opacity="0.6"
                />
              );
              const setRef = (el: SVGElement | null) => {
                noteRefs.current[i] = el;
              };
              if (ev.shape === "sol") {
                return (
                  <g key={i}>
                    {stem}
                    <ellipse ref={setRef} cx={ev.x} cy={ev.y} rx={h * 1.15} ry={h * 0.9} fill={C_INK} />
                  </g>
                );
              }
              if (ev.shape === "la") {
                return (
                  <g key={i}>
                    {stem}
                    <rect
                      ref={setRef}
                      x={ev.x - h}
                      y={ev.y - h * 0.82}
                      width={h * 2}
                      height={h * 1.64}
                      fill={C_INK}
                    />
                  </g>
                );
              }
              return (
                <g key={i}>
                  {stem}
                  <path ref={setRef} d={shapePath(ev.shape, ev.x, ev.y, h)} fill={C_INK} />
                </g>
              );
            })}

            {/* playhead */}
            <line
              ref={playheadRef}
              x1={MARGIN_L}
              y1="46"
              x2={MARGIN_L}
              y2="154"
              stroke={C_VIOLET}
              strokeWidth="2.4"
              opacity="0.9"
            />
          </svg>
        </div>
        {/* shape legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
          <LegendGlyph shape="fa" label="fa · triangle" />
          <LegendGlyph shape="sol" label="sol · oval" />
          <LegendGlyph shape="la" label="la · rectangle" />
          <LegendGlyph shape="mi" label="mi · diamond" />
          <span className="text-foreground">
            now:&nbsp;<span className="font-semibold text-primary">{nowShape ?? "—"}</span>
          </span>
        </div>
      </section>

      {/* — the hollow square + controls — */}
      <section className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            The hollow square — four sections facing in
          </p>
          <svg viewBox="0 0 200 200" className="mx-auto block w-full max-w-[320px]" role="img" aria-label="The hollow square of four singing sections.">
            <rect x="0" y="0" width="200" height="200" fill={C_PARCH} rx="6" />
            <rect x="70" y="70" width="60" height="60" fill="none" stroke={C_INK_SOFT} strokeWidth="1" opacity="0.4" />
            {VOICES.map((v) => {
              const r = squareRects[v.id];
              return (
                <g
                  key={v.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={voices[v.id]}
                  aria-label={`${v.name} voice, key ${v.key}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleVoice(v.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleVoice(v.id);
                    }
                  }}
                >
                  <g ref={(el) => { blockRefs.current[v.id] = el; }}>
                    <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="5" fill={C_INK} fillOpacity="0.1" />
                  </g>
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx="5"
                    fill="none"
                    stroke={voices[v.id] ? C_VIOLET : C_INK_SOFT}
                    strokeWidth={voices[v.id] ? 2 : 1.2}
                  />
                  <text
                    x={r.tx}
                    y={r.ty}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="monospace"
                    fontSize="12"
                    fontWeight="700"
                    fill={C_INK}
                  >
                    {v.name}
                  </text>
                  <text
                    x={r.tx}
                    y={r.ty + 13}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="monospace"
                    fontSize="8"
                    fill={C_INK_SOFT}
                  >
                    key {v.key}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {started ? "Singing" : "Start the singing"}
            </button>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Voices</p>
            <div className="grid grid-cols-2 gap-2">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => toggleVoice(v.id)}
                  aria-pressed={voices[v.id]}
                  className={`min-h-[44px] rounded-md border px-4 text-sm font-medium transition-colors ${
                    voices[v.id]
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="font-mono text-xs text-muted-foreground">{v.key}</span>&nbsp;&nbsp;{v.name}
                  {v.id === 2 && <span className="ml-1 text-xs text-muted-foreground">· the tune</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="tempo" className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Tempo · {bpm} bpm
            </label>
            <input
              id="tempo"
              type="range"
              min={60}
              max={132}
              value={bpm}
              onChange={(e) => onBpm(Number(e.target.value))}
              className="w-full accent-[color:var(--primary)]"
            />
          </div>
        </div>
      </section>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-md border border-border bg-card p-6 text-card-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 flex flex-col gap-3 text-base text-muted-foreground">
              <p>
                This ports a living oral technique: the four-shape (fasola) singing of <em>The Sacred Harp</em>{" "}
                (B.F. White &amp; E.J. King, 1844). Singers read the four Aikin / Little &amp; Smith &ldquo;patent
                notes&rdquo; — fa = triangle, sol = oval, la = rectangle, mi = diamond — and sing the shapes before
                the words.
              </p>
              <p>
                The tune is a seeded modal hymn in A-minor pentatonic (a gapped mode), an AABA phrase shape. Each
                pitch is solmized to its shape by scale degree. The tenor carries the tune, as in the tradition; the
                other parts are voiced in open, dispersed harmony — bare fifths and octaves, the raw &ldquo;hollow&rdquo;
                sound — so the square rings rather than blends.
              </p>
              <p>
                The four singers sit facing inward around a hollow square; tap a section (or press 1–4) to raise that
                voice. With no interaction, a seeded performer starts within a second and brings the parts in one by
                one.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["10760-fasola"]} />
    </main>
  );
}

function LegendGlyph({ shape, label }: { shape: Shape; label: string }) {
  const h = 7;
  const cx = 10;
  const cy = 10;
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="text-foreground">
        {shape === "sol" ? (
          <ellipse cx={cx} cy={cy} rx={h * 1.1} ry={h * 0.85} fill="currentColor" />
        ) : shape === "la" ? (
          <rect x={cx - h} y={cy - h * 0.8} width={h * 2} height={h * 1.6} fill="currentColor" />
        ) : (
          <path d={shapePath(shape, cx, cy, h)} fill="currentColor" />
        )}
      </svg>
      <span>{label}</span>
    </span>
  );
}
