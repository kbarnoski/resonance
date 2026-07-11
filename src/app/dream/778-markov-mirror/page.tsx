'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChain,
  recordTransition,
  sampleNext,
  type MarkovChain,
} from './markov';
import { buildSynth, playNote, teardownSynth, type SynthVoice } from './synth';

// ── Note definitions ──────────────────────────────────────────────────────────

// C major: C D E F G A B — one octave from C4 to C5, plus D5 E5
// MIDI: C4=60, D4=62, E4=64, F4=65, G4=67, A4=69, B4=71, C5=72, D5=74, E5=76
const SCALE_NOTES: { id: string; label: string; midi: number }[] = [
  { id: 'C4',  label: 'C4',  midi: 60 },
  { id: 'D4',  label: 'D4',  midi: 62 },
  { id: 'E4',  label: 'E4',  midi: 64 },
  { id: 'F4',  label: 'F4',  midi: 65 },
  { id: 'G4',  label: 'G4',  midi: 67 },
  { id: 'A4',  label: 'A4',  midi: 69 },
  { id: 'B4',  label: 'B4',  midi: 71 },
  { id: 'C5',  label: 'C5',  midi: 72 },
  { id: 'D5',  label: 'D5',  midi: 74 },
  { id: 'E5',  label: 'E5',  midi: 76 },
];

// Keyboard mapping: a s d f g h j k l → scale degrees 1–9
const KEY_MAP: Record<string, string> = {
  a: 'C4', s: 'D4', d: 'E4', f: 'F4', g: 'G4',
  h: 'A4', j: 'B4', k: 'C5', l: 'D5',
};

// Bass root MIDI for the soft bass pulse every 4 improvisation steps
const BASS_MIDI = 48; // C3

// Ring layout helpers
const TWO_PI = Math.PI * 2;
function ringPos(index: number, total: number, cx: number, cy: number, r: number) {
  const angle = (index / total) * TWO_PI - Math.PI / 2;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AppMode = 'splash' | 'teach' | 'improvise';

interface GraphEdge {
  from: string;
  to: string;
  count: number;
}

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

// ── Graph building (pure, no hooks) ──────────────────────────────────────────

function buildGraphData(
  chain: MarkovChain,
  cx: number,
  cy: number,
  radius: number
): { nodes: GraphNode[]; edges: GraphEdge[]; maxEdgeCount: number } {
  const total = SCALE_NOTES.length;
  const nodes: GraphNode[] = SCALE_NOTES.map((n, i) => {
    const pos = ringPos(i, total, cx, cy, radius);
    return { id: n.id, label: n.label, x: pos.x, y: pos.y };
  });

  const edges: GraphEdge[] = [];
  let maxEdgeCount = 1;

  for (const [from, targets] of Object.entries(chain.order1)) {
    for (const [to, count] of Object.entries(targets)) {
      edges.push({ from, to, count });
      if (count > maxEdgeCount) maxEdgeCount = count;
    }
  }

  return { nodes, edges, maxEdgeCount };
}

// Compute a curved quadratic path for an edge (offset so bi-directional edges don't overlap)
function edgePath(
  x1: number, y1: number,
  x2: number, y2: number,
  curvature: number = 0.25
): string {
  if (Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) < 0.5) {
    // Self-loop
    const r = 14;
    return `M ${x1} ${y1} C ${x1 + r * 2} ${y1 - r} ${x1 + r * 2} ${y1 + r} ${x1} ${y1}`;
  }
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const px = -dy / len;
  const py = dx / len;
  const cpx = mx + px * len * curvature;
  const cpy = my + py * len * curvature;
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MarkovMirror() {
  const [appMode, setAppMode] = useState<AppMode>('splash');
  const [chain, setChain] = useState<MarkovChain>(createChain());
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [activeEdge, setActiveEdge] = useState<{ from: string; to: string } | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [transitionCount, setTransitionCount] = useState(0);

  // Refs that survive renders without causing re-renders
  const synthRef = useRef<SynthVoice | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chainRef = useRef<MarkovChain>(createChain());
  const modeRef = useRef<AppMode>('splash');
  const prevNoteRef = useRef<string | null>(null);
  const prev2NoteRef = useRef<string | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const impTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impStepRef = useRef<number>(0);
  const activeNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 500, h: 500 });

  // Keep refs in sync with state
  useEffect(() => { chainRef.current = chain; }, [chain]);
  useEffect(() => { modeRef.current = appMode; }, [appMode]);

  // SVG resize observer
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) {
        const w = e.contentRect.width;
        const h = e.contentRect.height;
        setSvgSize({ w, h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Audio init (called on first user gesture in splash) ───────────────────
  const initAudio = useCallback(() => {
    if (ctxRef.current) return true;
    try {
      const ctx = new AudioContext();
      const synth = buildSynth(ctx);
      ctxRef.current = ctx;
      synthRef.current = synth;
      // Resume if suspended (iOS)
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => { /* will retry on gesture */ });
      }
      return true;
    } catch {
      setAudioError('Web Audio API not available in this browser.');
      return false;
    }
  }, []);

  // ── Flash active note highlight briefly ──────────────────────────────────
  const flashNote = useCallback((id: string) => {
    setActiveNote(id);
    if (activeNoteTimerRef.current) clearTimeout(activeNoteTimerRef.current);
    activeNoteTimerRef.current = setTimeout(() => setActiveNote(null), 300);
  }, []);

  // ── Play a note through the synth ────────────────────────────────────────
  const triggerNote = useCallback((noteId: string, isBass = false) => {
    const ctx = ctxRef.current;
    const synth = synthRef.current;
    if (!ctx || !synth) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* ignore */ });

    const note = SCALE_NOTES.find(n => n.id === noteId);
    if (!note) return;
    playNote(synth, {
      midi: isBass ? BASS_MIDI : note.midi,
      when: ctx.currentTime,
      duration: isBass ? 0.9 : 0.55,
      velocity: isBass ? 0.45 : 0.7,
      isBass,
    });
  }, []);

  // ── Record a played note into the Markov chain ───────────────────────────
  const recordNote = useCallback((noteId: string) => {
    const now = performance.now();
    const gap = now - lastPlayTimeRef.current;
    lastPlayTimeRef.current = now;

    // Phrase reset if gap > 900ms
    if (gap > 900) {
      prevNoteRef.current = null;
      prev2NoteRef.current = null;
    }

    const prev1 = prevNoteRef.current;
    const prev2 = prev2NoteRef.current;

    recordTransition(chainRef.current, prev2, prev1, noteId);

    // Update state for render
    setChain({ ...chainRef.current });
    setTransitionCount(chainRef.current.totalTransitions);

    // If there was a previous note, flash the edge
    if (prev1 !== null) {
      setActiveEdge({ from: prev1, to: noteId });
      setTimeout(() => setActiveEdge(null), 280);
    }

    prev2NoteRef.current = prev1;
    prevNoteRef.current = noteId;
  }, []);

  // ── Handle a key press (teach or improvise mode) ──────────────────────────
  const handleNotePress = useCallback((noteId: string) => {
    if (!initAudio()) return;
    if (modeRef.current === 'splash') return;

    triggerNote(noteId);
    flashNote(noteId);

    if (modeRef.current === 'teach') {
      recordNote(noteId);
    }
  }, [initAudio, triggerNote, flashNote, recordNote]);

  // ── Improvise loop ────────────────────────────────────────────────────────
  const stopImprovise = useCallback(() => {
    if (impTimerRef.current) {
      clearTimeout(impTimerRef.current);
      impTimerRef.current = null;
    }
  }, []);

  const scheduleNextStep = useCallback(() => {
    if (modeRef.current !== 'improvise') return;

    const fallback = SCALE_NOTES.map(n => n.id);
    const nextNote = sampleNext(
      chainRef.current,
      prev2NoteRef.current,
      prevNoteRef.current,
      fallback
    );

    impStepRef.current += 1;
    const step = impStepRef.current;

    // Soft bass pulse every 4 steps
    if (step % 4 === 0) {
      triggerNote('C4', true); // C3 bass (isBass=true overrides midi to BASS_MIDI)
    }

    triggerNote(nextNote);
    flashNote(nextNote);

    // Show the edge being walked
    const prev1 = prevNoteRef.current;
    if (prev1 !== null) {
      setActiveEdge({ from: prev1, to: nextNote });
    }

    prev2NoteRef.current = prevNoteRef.current;
    prevNoteRef.current = nextNote;

    // Humanized timing: 280–520ms between steps
    const baseInterval = 380;
    const jitter = (Math.random() - 0.5) * 240;
    const delay = Math.max(160, baseInterval + jitter);

    impTimerRef.current = setTimeout(scheduleNextStep, delay);
  }, [triggerNote, flashNote]);

  const startImprovise = useCallback(() => {
    if (!initAudio()) return;
    stopImprovise();
    impStepRef.current = 0;
    prevNoteRef.current = null;
    prev2NoteRef.current = null;
    scheduleNextStep();
  }, [initAudio, stopImprovise, scheduleNextStep]);

  // ── Mode switching ────────────────────────────────────────────────────────
  const switchToTeach = useCallback(() => {
    stopImprovise();
    setActiveEdge(null);
    setAppMode('teach');
    prevNoteRef.current = null;
    prev2NoteRef.current = null;
  }, [stopImprovise]);

  const switchToImprovise = useCallback(() => {
    setAppMode('improvise');
    startImprovise();
  }, [startImprovise]);

  const handleForget = useCallback(() => {
    stopImprovise();
    const fresh = createChain();
    chainRef.current = fresh;
    setChain(fresh);
    setTransitionCount(0);
    setActiveEdge(null);
    prevNoteRef.current = null;
    prev2NoteRef.current = null;
    if (modeRef.current === 'improvise') {
      setAppMode('teach');
    }
  }, [stopImprovise]);

  // Toggle improvise with spacebar
  useEffect(() => {
    if (appMode === 'splash') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement) return; // don't intercept button clicks
      if (e.repeat) return;

      if (e.key === ' ') {
        e.preventDefault();
        if (modeRef.current === 'improvise') {
          switchToTeach();
        } else {
          switchToImprovise();
        }
        return;
      }

      const noteId = KEY_MAP[e.key.toLowerCase()];
      if (noteId) {
        handleNotePress(noteId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appMode, handleNotePress, switchToTeach, switchToImprovise]);

  // Stop improvise when mode changes back to teach
  useEffect(() => {
    if (appMode !== 'improvise') {
      stopImprovise();
    }
  }, [appMode, stopImprovise]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopImprovise();
      if (activeNoteTimerRef.current) clearTimeout(activeNoteTimerRef.current);
      if (synthRef.current) teardownSynth(synthRef.current);
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => { /* ignore */ });
        ctxRef.current = null;
      }
    };
  }, [stopImprovise]);

  // ── Graph layout computations ─────────────────────────────────────────────
  const { w: svgW, h: svgH } = svgSize;
  const graphCx = svgW / 2;
  const graphCy = svgH / 2;
  const ringRadius = Math.min(svgW, svgH) * 0.37;

  const { nodes, edges, maxEdgeCount } = buildGraphData(
    chain, graphCx, graphCy, ringRadius
  );

  const nodeMap: Record<string, GraphNode> = {};
  for (const n of nodes) nodeMap[n.id] = n;

  // ── Splash screen ─────────────────────────────────────────────────────────
  if (appMode === 'splash') {
    return (
      <div className="relative flex flex-col items-center justify-center h-full gap-6 text-center px-6 bg-[#07091a]">
        <div className="text-5xl select-none opacity-80" aria-hidden>◎</div>
        <h1 className="text-2xl font-mono font-bold text-foreground">Markov Mirror</h1>
        <p className="text-base text-muted-foreground max-w-sm leading-relaxed">
          Play a melody on the keyboard below — the system learns your note transitions
          and builds a visible Markov graph. Then let it improvise forever in your style
          while you watch the melody walk its own learned web.
        </p>
        <ul className="text-sm text-muted-foreground font-mono text-left space-y-1">
          <li><span className="text-violet-300">a s d f g h j k l</span> → C D E F G A B C D</li>
          <li><span className="text-violet-300">space</span> → toggle Improvise / Teach</li>
          <li>tap / click the keys to play</li>
        </ul>
        {audioError && (
          <p className="text-violet-300 text-base">{audioError}</p>
        )}
        <button
          onClick={() => {
            initAudio();
            setAppMode('teach');
          }}
          className="min-h-[48px] px-8 py-3 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-base font-mono hover:bg-violet-500/30 transition-colors"
        >
          Start Teaching
        </button>
        <a
          href="/dream/778-markov-mirror/README.md"
          className="absolute bottom-4 right-4 text-xs text-muted-foreground hover:text-muted-foreground transition-colors font-mono"
        >
          Read the design notes ↗
        </a>
      </div>
    );
  }

  // ── Active prototype view ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#07091a] select-none overflow-hidden">

      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-border">
        <h1 className="text-xl font-mono text-foreground">Markov Mirror</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-muted-foreground">
            {transitionCount} transition{transitionCount !== 1 ? 's' : ''} learned
          </span>
          {audioError && (
            <span className="text-violet-300 text-sm">{audioError}</span>
          )}
          <a
            href="/dream/778-markov-mirror/README.md"
            className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors font-mono"
          >
            design notes ↗
          </a>
        </div>
      </div>

      {/* ── SVG Graph ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        <svg
          ref={svgRef}
          className="w-full h-full"
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label="Markov transition graph"
        >
          <defs>
            {/* Arrowhead marker — default */}
            <marker
              id="arrow-default"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 Z" fill="rgba(139,92,246,0.55)" />
            </marker>
            {/* Arrowhead marker — active/glowing edge */}
            <marker
              id="arrow-active"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 Z" fill="#a78bfa" />
            </marker>
            {/* Arrowhead marker — bright */}
            <marker
              id="arrow-bright"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 Z" fill="#34d399" />
            </marker>
            {/* Radial gradient for active node glow */}
            <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
            </radialGradient>
            {/* Active edge glow filter */}
            <filter id="glow-filter" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="node-glow-filter" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background ring hint */}
          {ringRadius > 0 && (
            <circle
              cx={graphCx}
              cy={graphCy}
              r={ringRadius}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
          )}

          {/* Empty state label */}
          {edges.length === 0 && (
            <text
              x={graphCx}
              y={graphCy}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-sm"
              fill="rgba(255,255,255,0.2)"
              fontSize="14"
              fontFamily="monospace"
            >
              play notes to grow the graph
            </text>
          )}

          {/* ── Edges ─────────────────────────────────────────────────── */}
          {edges.map((edge) => {
            const fromNode = nodeMap[edge.from];
            const toNode = nodeMap[edge.to];
            if (!fromNode || !toNode) return null;

            const t = edge.count / maxEdgeCount; // 0..1 normalized weight
            const strokeW = 0.5 + t * 3.5;
            const opacity = 0.15 + t * 0.65;

            const isActive =
              activeEdge !== null &&
              activeEdge.from === edge.from &&
              activeEdge.to === edge.to;

            // Check if this is a "heavy" edge (top-used ones brighten in emerald)
            const isHeavy = t > 0.6;

            let strokeColor: string;
            let markerId: string;
            let strokeOpacity: number;
            let filter: string | undefined;

            if (isActive) {
              strokeColor = '#a78bfa'; // violet-400
              strokeOpacity = 1;
              markerId = 'url(#arrow-active)';
              filter = 'url(#glow-filter)';
            } else if (isHeavy) {
              strokeColor = '#34d399'; // emerald-400
              strokeOpacity = opacity;
              markerId = 'url(#arrow-bright)';
              filter = undefined;
            } else {
              strokeColor = 'rgba(139,92,246,0.8)'; // violet-500
              strokeOpacity = opacity;
              markerId = 'url(#arrow-default)';
              filter = undefined;
            }

            const d = edgePath(fromNode.x, fromNode.y, toNode.x, toNode.y, 0.22);

            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={d}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isActive ? strokeW * 1.8 : strokeW}
                strokeOpacity={strokeOpacity}
                markerEnd={markerId}
                filter={filter}
              />
            );
          })}

          {/* ── Nodes ─────────────────────────────────────────────────── */}
          {nodes.map((node) => {
            const isActive = activeNote === node.id;
            const hasData = chain.order1[node.id] !== undefined ||
              Object.values(chain.order1).some(t => t[node.id] !== undefined);

            // Node size: bigger if it has data
            const baseR = 16;
            const dataBonus = hasData ? 4 : 0;
            const r = baseR + dataBonus;

            return (
              <g
                key={node.id}
                role="button"
                aria-label={`Play ${node.label}`}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleNotePress(node.id);
                }}
              >
                {/* Glow halo for active node */}
                {isActive && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r + 16}
                    fill="url(#node-glow)"
                  />
                )}
                {/* Node body */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={isActive ? 'rgba(167,139,250,0.85)' : hasData ? 'rgba(139,92,246,0.30)' : 'rgba(255,255,255,0.05)'}
                  stroke={isActive ? '#c4b5fd' : hasData ? 'rgba(139,92,246,0.65)' : 'rgba(255,255,255,0.15)'}
                  strokeWidth={isActive ? 2 : 1.5}
                  filter={isActive ? 'url(#node-glow-filter)' : undefined}
                />
                {/* Label */}
                <text
                  x={node.x}
                  y={node.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="11"
                  fontFamily="monospace"
                  fill={isActive ? '#fff' : hasData ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)'}
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Mode indicator overlay */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <span className={`text-xs font-mono px-3 py-1 rounded-full border ${
            appMode === 'improvise'
              ? 'border-violet-400/40 text-violet-300 bg-violet-900/30'
              : 'border-violet-400/30 text-violet-300 bg-violet-900/20'
          }`}>
            {appMode === 'improvise' ? '◉ improvising' : '◎ teaching'}
          </span>
        </div>
      </div>

      {/* ── Piano keyboard ───────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 pb-3 pt-1 border-t border-border">
        {/* Keyboard label row */}
        <div className="flex items-center gap-1 mb-1 justify-center">
          {SCALE_NOTES.map((note) => {
            const keyChar = Object.entries(KEY_MAP).find(([, id]) => id === note.id)?.[0];
            return (
              <div key={note.id} className="flex-1 text-center">
                <span className="text-xs font-mono text-muted-foreground">{keyChar}</span>
              </div>
            );
          })}
        </div>

        {/* Piano keys */}
        <div className="flex gap-1 justify-center">
          {SCALE_NOTES.map((note) => {
            const isActive = activeNote === note.id;
            return (
              <button
                key={note.id}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleNotePress(note.id);
                }}
                className={`
                  flex-1 rounded-lg font-mono transition-all duration-75
                  flex flex-col items-center justify-end pb-2
                  min-h-[56px] min-w-[44px] text-xs
                  border select-none
                  ${isActive
                    ? 'bg-violet-400/80 border-violet-300 text-foreground shadow-[0_0_16px_rgba(167,139,250,0.6)] scale-95'
                    : 'bg-muted border-border text-muted-foreground hover:bg-accent hover:border-border hover:text-muted-foreground'
                  }
                `}
                aria-label={`Play ${note.label}`}
              >
                <span className="text-[10px] leading-none">{note.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Control bar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pb-4 pt-2 flex items-center gap-2 flex-wrap border-t border-border">
        <button
          onClick={switchToTeach}
          className={`min-h-[44px] px-4 py-2.5 rounded-lg text-base font-mono border transition-colors ${
            appMode === 'teach'
              ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
              : 'bg-muted border-border text-muted-foreground hover:text-muted-foreground hover:bg-accent'
          }`}
        >
          Teach
        </button>
        <button
          onClick={appMode === 'improvise' ? switchToTeach : switchToImprovise}
          className={`min-h-[44px] px-4 py-2.5 rounded-lg text-base font-mono border transition-colors ${
            appMode === 'improvise'
              ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
              : 'bg-muted border-border text-muted-foreground hover:text-muted-foreground hover:bg-accent'
          }`}
        >
          {appMode === 'improvise' ? '◉ Improvise' : 'Improvise'}
        </button>
        <span className="text-muted-foreground font-mono text-sm hidden sm:inline">space</span>

        <div className="flex-1" />

        <button
          onClick={handleForget}
          className="min-h-[44px] px-4 py-2.5 rounded-lg text-base font-mono border border-violet-400/25 text-violet-300/75 hover:bg-violet-900/20 hover:text-violet-300 transition-colors"
        >
          Forget
        </button>
      </div>
    </div>
  );
}
