"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const N_VOICES = 5;
const BASE_BPM = 72;

// Irrational, mutually-incommensurate ratios.
// No two share a common rational period — true convergence is effectively never.
// 1, √2, φ, e/2, π/2
const TEMPO_RATIOS: number[] = [
  1,
  Math.SQRT2,       // 1.41421356…
  1.6180339887,     // φ (golden ratio)
  Math.E / 2,       // 1.35914091…
  Math.PI / 2,      // 1.57079632…
];

const RATIO_LABELS: string[] = ["1", "√2", "φ", "e/2", "π/2"];

// D pentatonic across 2 octaves — zero harmonic tension
const PENTATONIC_NOTES: number[] = [
  293.66, 329.63, 369.99, 440.0, 493.88,
  587.33, 659.25, 739.99, 880.0, 987.77,
];

// Melodic cell: rising then falling, indices into PENTATONIC_NOTES
const CELL_INDICES: number[] = [0, 2, 4, 3, 6, 5, 1, 3];
const CELL_LEN = CELL_INDICES.length;

// "A Tale of Two Clocks" lookahead scheduler
const SCHEDULE_INTERVAL_MS = 25;
const LOOKAHEAD_S = 0.12;

// Visual
const MARKS_PER_LANE = 44;
const SVG_H = 310;
const LANE_H = 48;
const NOW_FRAC = 0.22; // playhead at 22% from left
const PX_PER_SEC = 58; // scroll speed (same for all voices; beat spacing differs)

// Ikeda-clean palette: violet / blue / emerald / cyan / purple
const VOICE_COLORS: string[] = [
  "#a78bfa",
  "#60a5fa",
  "#34d399",
  "#67e8f9",
  "#c084fc",
];

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface VoiceMark {
  beatIndex: number;
  scheduledTime: number; // seconds on the shared clock
  noteFreq: number;
}

interface VoiceState {
  cellPos: number;
  nextBeatTime: number;
  beatPeriodS: number;
  marks: VoiceMark[];
  beatCount: number;
  activeMark: number | null;
}

// ---------------------------------------------------------------------------
// AUDIO HELPERS (no hooks — pure functions)
// ---------------------------------------------------------------------------

function scheduleNote(
  ac: AudioContext,
  dest: GainNode,
  freq: number,
  t: number
): void {
  // Bell/pluck: sine fundamental + inharmonic partial, fast decay
  const env = ac.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.16, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  env.connect(dest);

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(env);
  osc.start(t);
  osc.stop(t + 1.7);

  // Inharmonic partial — bell character
  const env2 = ac.createGain();
  env2.gain.setValueAtTime(0, t);
  env2.gain.linearRampToValueAtTime(0.06, t + 0.002);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  env2.connect(dest);

  const osc2 = ac.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2.756;
  osc2.connect(env2);
  osc2.start(t);
  osc2.stop(t + 0.75);
}

function buildVoiceState(
  voiceIdx: number,
  startTime: number,
  sp: number
): VoiceState {
  const ratio = 1 + (TEMPO_RATIOS[voiceIdx] - 1) * sp;
  const beatPeriodS = 60 / (BASE_BPM * ratio);
  // Pre-populate marks: 8 in the past + 32 ahead
  const marks: VoiceMark[] = [];
  for (let i = 0; i < MARKS_PER_LANE; i++) {
    const t = startTime + (i - 8) * beatPeriodS;
    marks.push({
      beatIndex: i,
      scheduledTime: t,
      noteFreq: PENTATONIC_NOTES[CELL_INDICES[i % CELL_LEN]],
    });
  }
  return {
    cellPos: MARKS_PER_LANE % CELL_LEN,
    nextBeatTime: startTime + (MARKS_PER_LANE - 8) * beatPeriodS,
    beatPeriodS,
    marks,
    beatCount: MARKS_PER_LANE,
    activeMark: null,
  };
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export default function PolytempoLoomPage() {
  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [spread, setSpread] = useState(1.0);
  const [showNotes, setShowNotes] = useState(false);

  // refs — mutable engine state (never triggers re-renders)
  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const voicesRef = useRef<VoiceState[]>([]);
  const spreadRef = useRef(1.0);
  const startedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // whether audio is live (AudioContext.currentTime) vs visual-only (performance.now)
  const audioLiveRef = useRef(false);

  // sync spread ref
  useEffect(() => {
    spreadRef.current = spread;
  }, [spread]);

  // -------------------------------------------------------------------------
  // VISUAL LOOP — runs from mount, uses performance.now before audio starts
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Initialize visual-only voice states
    const t0 = performance.now() / 1000;
    voicesRef.current = Array.from({ length: N_VOICES }, (_, i) =>
      buildVoiceState(i, t0, spreadRef.current)
    );

    function drawLoom() {
      const svgEl = svgRef.current;
      if (!svgEl) {
        rafRef.current = requestAnimationFrame(drawLoom);
        return;
      }

      // Clock: use AudioContext time if audio is live, else performance.now
      const nowTime = audioLiveRef.current && acRef.current
        ? acRef.current.currentTime
        : performance.now() / 1000;

      const W = svgEl.clientWidth || 800;
      const nowX = W * NOW_FRAC;

      // Visual-only: keep advancing marks so the scroll stays alive
      if (!audioLiveRef.current) {
        const sp = spreadRef.current;
        for (let vi = 0; vi < N_VOICES; vi++) {
          const voice = voicesRef.current[vi];
          // Recompute period if spread changed
          const ratio = 1 + (TEMPO_RATIOS[vi] - 1) * sp;
          voice.beatPeriodS = 60 / (BASE_BPM * ratio);
          // Add new marks ahead
          while (voice.nextBeatTime < nowTime + LOOKAHEAD_S + 6) {
            const cellPos = voice.cellPos;
            voice.marks.push({
              beatIndex: voice.beatCount,
              scheduledTime: voice.nextBeatTime,
              noteFreq: PENTATONIC_NOTES[CELL_INDICES[cellPos]],
            });
            if (voice.marks.length > MARKS_PER_LANE) voice.marks.shift();
            voice.cellPos = (cellPos + 1) % CELL_LEN;
            voice.nextBeatTime += voice.beatPeriodS;
            voice.beatCount += 1;
          }
          // Trigger visual activation without audio
          for (const mark of voice.marks) {
            const dt = mark.scheduledTime - nowTime;
            if (dt >= -0.06 && dt < 0) {
              voice.activeMark = mark.beatIndex;
            } else if (dt < -0.13 && voice.activeMark === mark.beatIndex) {
              voice.activeMark = null;
            }
          }
        }
      }

      for (let vi = 0; vi < N_VOICES; vi++) {
        const voice = voicesRef.current[vi];
        const laneY = 28 + vi * LANE_H;
        const midY = laneY + 14;
        const color = VOICE_COLORS[vi];

        const groupId = `lane-g-${vi}`;
        let group = svgEl.getElementById(groupId) as SVGGElement | null;
        if (!group) {
          group = document.createElementNS("http://www.w3.org/2000/svg", "g");
          group.setAttribute("id", groupId);
          svgEl.appendChild(group);
        }

        // Clear
        while (group.firstChild) group.removeChild(group.firstChild);

        // Lane baseline
        const baseline = document.createElementNS("http://www.w3.org/2000/svg", "line");
        baseline.setAttribute("x1", "56");
        baseline.setAttribute("y1", String(midY));
        baseline.setAttribute("x2", String(W));
        baseline.setAttribute("y2", String(midY));
        baseline.setAttribute("stroke", color);
        baseline.setAttribute("stroke-opacity", "0.10");
        baseline.setAttribute("stroke-width", "1");
        group.appendChild(baseline);

        // Mark dots
        for (const mark of voice.marks) {
          const dt = mark.scheduledTime - nowTime;
          const x = nowX + dt * PX_PER_SEC;
          if (x < 50 || x > W + 4) continue;

          const isActive = voice.activeMark === mark.beatIndex;
          const isPast = dt < 0;

          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", String(Math.round(x)));
          dot.setAttribute("cy", String(midY));
          dot.setAttribute("r", isActive ? "5.5" : "2.5");
          dot.setAttribute("fill", color);
          dot.setAttribute("fill-opacity", isActive ? "1" : isPast ? "0.22" : "0.60");
          if (isActive) {
            dot.setAttribute("filter", `url(#glow${vi})`);
          }
          group.appendChild(dot);
        }
      }

      rafRef.current = requestAnimationFrame(drawLoom);
    }

    rafRef.current = requestAnimationFrame(drawLoom);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // -------------------------------------------------------------------------
  // AUDIO SCHEDULER
  // -------------------------------------------------------------------------
  const runScheduler = useCallback(() => {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;

    const now = ac.currentTime;
    const sp = spreadRef.current;

    for (let vi = 0; vi < N_VOICES; vi++) {
      const voice = voicesRef.current[vi];
      const ratio = 1 + (TEMPO_RATIOS[vi] - 1) * sp;
      voice.beatPeriodS = 60 / (BASE_BPM * ratio);

      while (voice.nextBeatTime < now + LOOKAHEAD_S) {
        const noteFreq = PENTATONIC_NOTES[CELL_INDICES[voice.cellPos]];
        scheduleNote(ac, master, noteFreq, voice.nextBeatTime);

        const beatIdx = voice.beatCount;
        voice.marks.push({
          beatIndex: beatIdx,
          scheduledTime: voice.nextBeatTime,
          noteFreq,
        });
        if (voice.marks.length > MARKS_PER_LANE) voice.marks.shift();

        // Schedule visual flash via setTimeout (fire delay in ms)
        const fireDelay = (voice.nextBeatTime - now) * 1000;
        const voiceSnap = voice;
        const bidxSnap = beatIdx;
        setTimeout(() => {
          voiceSnap.activeMark = bidxSnap;
          setTimeout(() => {
            if (voiceSnap.activeMark === bidxSnap) voiceSnap.activeMark = null;
          }, 130);
        }, Math.max(0, fireDelay));

        voice.cellPos = (voice.cellPos + 1) % CELL_LEN;
        voice.nextBeatTime += voice.beatPeriodS;
        voice.beatCount += 1;
      }
    }
  }, []);

  // -------------------------------------------------------------------------
  // BEGIN HANDLER
  // -------------------------------------------------------------------------
  const handleBegin = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    try {
      const ac = new AudioContext();

      // Brick-wall compressor on master bus
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 6;
      comp.ratio.value = 20;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      comp.connect(ac.destination);

      const master = ac.createGain();
      master.gain.value = 0.50;
      master.connect(comp);

      acRef.current = ac;
      masterRef.current = master;

      // Re-anchor voice states to AudioContext time
      const nowAc = ac.currentTime;
      const sp = spreadRef.current;
      voicesRef.current = Array.from({ length: N_VOICES }, (_, i) => {
        const ratio = 1 + (TEMPO_RATIOS[i] - 1) * sp;
        const beatPeriodS = 60 / (BASE_BPM * ratio);
        return {
          cellPos: 0,
          nextBeatTime: nowAc + i * 0.07, // tiny stagger
          beatPeriodS,
          marks: [],
          beatCount: 0,
          activeMark: null,
        };
      });

      audioLiveRef.current = true;
      runScheduler();
      intervalRef.current = setInterval(runScheduler, SCHEDULE_INTERVAL_MS);
      setStarted(true);
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : String(err));
      setStarted(true);
    }
  }, [runScheduler]);

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      acRef.current?.close();
    };
  }, []);

  // Derived display values (no extra state — computed from spread)
  const voiceInfos = TEMPO_RATIOS.map((r, i) => {
    const ratio = 1 + (r - 1) * spread;
    return { label: RATIO_LABELS[i], bpm: (BASE_BPM * ratio).toFixed(1) };
  });

  return (
    <div className="relative flex flex-col min-h-full bg-[#070710] text-foreground overflow-x-hidden">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-6 pt-8 pb-3">
        <h1 className="text-2xl font-mono font-semibold tracking-tight text-foreground">
          Polytempo Loom
        </h1>
        <p className="text-base text-muted-foreground mt-1.5 max-w-xl leading-relaxed">
          Five voices, identical pitches, irrational tempo ratios.
          No shared downbeat &mdash; ever. The only tension lives in time.
        </p>
      </div>

      {/* ── SVG Loom ───────────────────────────────────────────── */}
      <div className="px-4">
        <div
          className="relative w-full rounded-lg border border-border overflow-hidden bg-[#04040c]"
          style={{ height: SVG_H }}
        >
          <svg
            ref={svgRef}
            width="100%"
            height={SVG_H}
            className="w-full block"
            aria-label="Polytempo loom — five scrolling note-onset lanes"
          >
            <defs>
              {VOICE_COLORS.map((col, i) => (
                <filter
                  key={i}
                  id={`glow${i}`}
                  x="-80%"
                  y="-80%"
                  width="260%"
                  height="260%"
                >
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blurred" />
                  <feFlood floodColor={col} floodOpacity="0.7" result="colorFill" />
                  <feComposite in="colorFill" in2="blurred" operator="in" result="colorGlow" />
                  <feMerge>
                    <feMergeNode in="colorGlow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              ))}
            </defs>

            {/* Playhead "now" line */}
            <line
              x1={`${NOW_FRAC * 100}%`}
              y1="0"
              x2={`${NOW_FRAC * 100}%`}
              y2={SVG_H}
              stroke="white"
              strokeOpacity="0.16"
              strokeWidth="1"
              strokeDasharray="3 7"
            />

            {/* NOW label */}
            <text
              x={`${NOW_FRAC * 100}%`}
              y="12"
              fill="white"
              fillOpacity="0.3"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
            >
              NOW
            </text>

            {/* Lane labels (static — rendered once in JSX) */}
            {voiceInfos.map((info, i) => {
              const laneY = 28 + i * LANE_H;
              return (
                <g key={i}>
                  <text
                    x="6"
                    y={laneY + 7}
                    fill={VOICE_COLORS[i]}
                    fillOpacity="0.90"
                    fontSize="10"
                    fontFamily="monospace"
                    dominantBaseline="middle"
                  >
                    {info.label}
                  </text>
                  <text
                    x="6"
                    y={laneY + 21}
                    fill={VOICE_COLORS[i]}
                    fillOpacity="0.50"
                    fontSize="8.5"
                    fontFamily="monospace"
                    dominantBaseline="middle"
                  >
                    {info.bpm}
                  </text>
                </g>
              );
            })}

            {/* Bottom caption */}
            <text
              x="50%"
              y={SVG_H - 8}
              fill="white"
              fillOpacity="0.22"
              fontSize="8.5"
              fontFamily="monospace"
              textAnchor="middle"
            >
              near-alignment is not resolution &mdash; the drift is permanent
            </text>
          </svg>
        </div>
      </div>

      {/* ── Controls ───────────────────────────────────────────── */}
      <div className="px-6 py-5 flex flex-col gap-5">

        {/* Begin / status */}
        {!started ? (
          <div className="flex flex-col items-start gap-2">
            <button
              onClick={handleBegin}
              className="min-h-[44px] px-6 py-2.5 rounded-full bg-violet-500/20 border border-violet-400/40 text-violet-300 text-base font-mono hover:bg-violet-500/30 transition-colors"
            >
              Begin
            </button>
            <p className="text-muted-foreground text-sm font-mono">
              Audio requires a gesture &mdash; the loom drifts visually until you begin.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
            <span className="text-violet-300/95 font-mono text-sm">
              {audioError ? "visual only — audio unavailable" : "running — no resolution possible"}
            </span>
          </div>
        )}

        {/* Audio error */}
        {audioError && (
          <p className="text-violet-300 text-sm font-mono border border-violet-400/30 rounded px-3 py-2 bg-violet-950/30">
            AudioContext error: {audioError}
          </p>
        )}

        {/* Spread slider */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="spread" className="text-muted-foreground text-sm font-mono">
              stir the loom
            </label>
            <span className="text-muted-foreground text-xs font-mono">
              &times; {spread.toFixed(2)}
            </span>
          </div>
          <input
            id="spread"
            type="range"
            min={0.3}
            max={2.0}
            step={0.05}
            value={spread}
            onChange={(e) => setSpread(Number(e.target.value))}
            className="w-full accent-violet-400"
          />
          <p className="text-muted-foreground text-xs font-mono">
            narrows or widens mutual drift velocity &mdash; ratios stay irrational at every setting
          </p>
        </div>

        {/* Voice stat cards */}
        <div className="grid grid-cols-5 gap-1.5">
          {voiceInfos.map((info, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-0.5 rounded px-1.5 py-2 border"
              style={{ borderColor: VOICE_COLORS[i] + "2a" }}
            >
              <span
                className="text-sm font-mono font-semibold leading-none"
                style={{ color: VOICE_COLORS[i] }}
              >
                {info.label}
              </span>
              <span className="text-muted-foreground text-xs font-mono leading-none mt-1">
                {info.bpm}
              </span>
              <span className="text-muted-foreground/70 text-[10px] font-mono leading-none">bpm</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Design notes ───────────────────────────────────────── */}
      <div className="px-6 pb-8">
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="text-muted-foreground text-sm font-mono hover:text-muted-foreground transition-colors"
        >
          {showNotes ? "▲ hide design notes" : "▼ read the design notes"}
        </button>

        {showNotes && (
          <div className="mt-3 border-l border-border pl-4 space-y-3 max-w-2xl">
            <p className="text-muted-foreground text-sm font-mono">
              Five voices share one pitch set: D pentatonic across 2 octaves.
              Zero harmonic tension. The entire drama is metric.
            </p>
            <p className="text-muted-foreground text-sm font-mono">
              Tempo ratios: 1, &radic;2, &phi; (golden ratio), e/2, &pi;/2.
              These are mutually irrational &mdash; no two voices ever simultaneously
              return to beat 1. Convergence is effectively impossible.
            </p>
            <p className="text-muted-foreground text-sm font-mono">
              Directly in the lineage of Conlon Nancarrow&rsquo;s{" "}
              <em>Studies for Player Piano</em> &mdash; especially Study No. 40
              &ldquo;Transcendental&rdquo; (a canon at the ratio e:&pi;) and his
              &radic;2 canons. Where the ratio is irrational, the layers share no
              common period; no structural downbeat can ever align.
            </p>
            <p className="text-muted-foreground text-sm font-mono">
              The SVG loom scrolls all lanes at the same pixel-per-second rate.
              Each lane&rsquo;s mark spacing encodes its own beat period, so faster
              voices show denser marks. Near-vertical alignments across lanes are
              transient moir&eacute; effects &mdash; not structural events.
            </p>
            <p className="text-muted-foreground text-sm font-mono">
              Scheduler: Web Audio &ldquo;Tale of Two Clocks&rdquo; pattern.
              setInterval every 25&nbsp;ms, scheduling 120&nbsp;ms ahead via
              precise AudioContext.currentTime. No drift accumulation.
            </p>
            <a
              href="/dream/514-polytempo-loom/README.md"
              className="block text-violet-300 text-sm font-mono hover:text-violet-200 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              full README &rarr;
            </a>
          </div>
        )}
      </div>

      {/* ── Corner link ────────────────────────────────────────── */}
      <a
        href="/dream/514-polytempo-loom/README.md"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-4 right-4 text-muted-foreground/70 text-xs font-mono hover:text-muted-foreground transition-colors"
      >
        design notes &nearr;
      </a>
    </div>
  );
}
