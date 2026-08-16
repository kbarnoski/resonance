"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14256 · mididuet — play a live DUET with yourself. One of Karel's own catalog
// takes plays as the accompaniment BED (real audio). On top, every note he
// plays on his MIDI keyboard is voiced by CONCATENATIVE resynthesis: we pick a
// real slice of HIS catalog whose pitch matches the played note and play that
// slice (lightly pitch-nudged, velocity-scaled) live. He plays his own timbre,
// over his own music. Zero oscillators anywhere.
//
//   ONE QUESTION — What if you could play a live duet with yourself: your MIDI
//   keyboard voiced entirely in grains of your OWN recorded piano, over one of
//   your own recordings?
//
//   INPUT   Web MIDI (a lab first) — or the computer keyboard as a fallback
//           piano, so the duet is always playable.
//   OUTPUT  bed take (real audio) + concatenative catalog grains, both through
//           safeMaster; a warm paper/ink piano-roll on Canvas2D.
//
//   References: CoSaRef (arXiv:2410.16785); "The Concatenator" (arXiv:2411.04366).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackNote } from "../_shared/trackAnalysis";
import { runInput } from "./midi";
import {
  ConcatVoice,
  buildGrainIndex,
  addNotesToIndex,
  bedFallbackIndex,
  type GrainIndex,
} from "./voice";

// ── art palette: warm ink on paper (raw hex allowed inside canvas art) ────────
const PAPER = "#f2ecdd";
const PAPER_EDGE = "#e7dfca";
const PRINT = "#c9bfa4"; // faint printed bed roll
const PRINT_SOFT = "#d8cfb6";
const INK = "#7a3b1e"; // sienna — live played notes
const INK_BRIGHT = "#b5651d"; // umber highlight for loud notes
const PLAY_LINE = "#5c4326"; // playhead

// ── piano-roll geometry ───────────────────────────────────────────────────────
const CANVAS_H = 420;
const MIDI_LO = 33;
const MIDI_HI = 93;
const PX_PER_SEC = 78;
const PAD_Y = 26;

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

interface PlayedNote {
  midi: number;
  startPos: number; // bed position (s) when struck
  endPos: number | null; // null while held
  velocity: number;
}

const KEY_HINT = "z x c v b n m  ·  a s d f g h j k l  (w e t y u o p = sharps)";

export default function Page() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bedId, setBedId] = useState<string>(REAL_TRACKS[0].id);
  const [bedTitle, setBedTitle] = useState<string>(REAL_TRACKS[0].title);
  const [inputLabel, setInputLabel] = useState<string>("waiting for input…");
  const [hasMidi, setHasMidi] = useState(false);
  const [grainInfo, setGrainInfo] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);

  // ── audio + render refs ─────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bedSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceRef = useRef<ConcatVoice | null>(null);
  const disposeInputRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bedStartRef = useRef<number>(0);
  const bedNotesRef = useRef<TrackNote[]>([]);
  const playedRef = useRef<PlayedNote[]>([]);
  const runningRef = useRef(false);

  const yForMidi = useCallback((m: number, h: number) => {
    const n = (clamp(m, MIDI_LO, MIDI_HI) - MIDI_LO) / (MIDI_HI - MIDI_LO);
    return PAD_Y + (1 - n) * (h - 2 * PAD_Y);
  }, []);

  // ── render loop ─────────────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 900;
    const cssH = CANVAS_H;
    if (canvas.width !== Math.round(cssW * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // paper
    const grd = g.createLinearGradient(0, 0, 0, cssH);
    grd.addColorStop(0, PAPER);
    grd.addColorStop(1, PAPER_EDGE);
    g.fillStyle = grd;
    g.fillRect(0, 0, cssW, cssH);

    const pos =
      ctx && runningRef.current ? ctx.currentTime - bedStartRef.current : 0;
    const playheadX = cssW * 0.6;

    // faint printed staff lines every octave
    g.strokeStyle = PRINT_SOFT;
    g.lineWidth = 1;
    for (let m = MIDI_LO; m <= MIDI_HI; m += 12) {
      const y = yForMidi(m, cssH);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(cssW, y);
      g.stroke();
    }

    // printed BED roll (Karel's recorded notes, scrolling under the performance)
    const notes = bedNotesRef.current;
    g.fillStyle = PRINT;
    for (const n of notes) {
      const x = (n.time - pos) * PX_PER_SEC + playheadX;
      const w = Math.max(2, n.duration * PX_PER_SEC);
      if (x + w < 0 || x > cssW) continue;
      const y = yForMidi(n.midi, cssH);
      g.globalAlpha = 0.55;
      g.beginPath();
      const h = 3;
      const r = 1.5;
      roundRect(g, x, y - h / 2, w, h, r);
      g.fill();
    }
    g.globalAlpha = 1;

    // LIVE ink strokes — Karel's played notes (concatenative catalog voice)
    const played = playedRef.current;
    const kept: PlayedNote[] = [];
    for (const p of played) {
      const end = p.endPos ?? pos;
      const x0 = (p.startPos - pos) * PX_PER_SEC + playheadX;
      const x1 = (end - pos) * PX_PER_SEC + playheadX;
      if (x1 < -60) continue; // cull long-gone strokes
      kept.push(p);
      const y = yForMidi(p.midi, cssH);
      const vh = 3 + (p.velocity / 127) * 8;
      g.fillStyle = p.velocity > 96 ? INK_BRIGHT : INK;
      g.globalAlpha = 0.9;
      roundRect(g, x0, y - vh / 2, Math.max(3, x1 - x0), vh, vh / 2);
      g.fill();
      // struck-note head dot
      g.beginPath();
      g.arc(x0, y, vh * 0.55, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    playedRef.current = kept;

    // playhead
    g.strokeStyle = PLAY_LINE;
    g.lineWidth = 1.5;
    g.globalAlpha = 0.7;
    g.beginPath();
    g.moveTo(playheadX, 0);
    g.lineTo(playheadX, cssH);
    g.stroke();
    g.globalAlpha = 1;

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [yForMidi]);

  // single render loop owned for the component's lifetime — draws idle paper
  // before Start and the live performance while running (via runningRef).
  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [drawFrame]);

  // ── teardown ────────────────────────────────────────────────────────────────
  // note: the render loop is owned by a dedicated mount effect, so teardown
  // does NOT touch rafRef — Stop leaves the idle paper animating.
  const teardown = useCallback(() => {
    runningRef.current = false;
    disposeInputRef.current?.();
    disposeInputRef.current = null;
    voiceRef.current?.stopAll();
    voiceRef.current = null;
    if (bedSrcRef.current) {
      try {
        bedSrcRef.current.stop();
        bedSrcRef.current.disconnect();
      } catch {
        /* already stopped */
      }
      bedSrcRef.current = null;
    }
    masterRef.current?.disconnect();
    masterRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
    playedRef.current = [];
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // ── start the duet ──────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (running || loading) return;
    setError(null);
    setLoading(true);
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtor();
      await ctx.resume();
      ctxRef.current = ctx;

      const master = createSafeMaster(ctx);
      master.setGain(0.85);
      masterRef.current = master;

      // 1) BED — one real take as the accompaniment
      const bed = await loadRealTrackBuffer(ctx, bedId);
      setBedTitle(bed.title);
      const bedAnalysis = await loadTrackAnalysis(bedId);
      bedNotesRef.current = bedAnalysis?.notes ?? [];

      // 2) GRAIN INDEX — bed + up to 2 other catalog tracks (keep it fast)
      const others = REAL_TRACKS.filter((t) => t.id !== bedId).slice(0, 2);
      const index: GrainIndex = await buildGrainIndex(
        ctx,
        others.map((t) => t.id),
      );
      if (bedAnalysis && bedAnalysis.notes.length > 0) {
        addNotesToIndex(index, bed.buffer, bedAnalysis.notes);
      }
      const finalIndex = index.count > 0 ? index : bedFallbackIndex(bed.buffer);
      setGrainInfo(
        finalIndex.fromAnalysis
          ? `${finalIndex.count} real catalog grains · ${finalIndex.midis.length} pitches`
          : "bed-granulation fallback (no analysis)",
      );

      const voice = new ConcatVoice(ctx, master.input, finalIndex);
      voiceRef.current = voice;

      // play the bed once through, gently under the performance
      const bedGain = ctx.createGain();
      bedGain.gain.value = 0.42;
      const src = ctx.createBufferSource();
      src.buffer = bed.buffer;
      src.connect(bedGain);
      bedGain.connect(master.input);
      bedStartRef.current = ctx.currentTime + 0.05;
      src.start(bedStartRef.current);
      bedSrcRef.current = src;

      // 3) live INPUT — Web MIDI first, keyboard fallback
      disposeInputRef.current = runInput({
        onNoteOn: (midi, velocity) => {
          voiceRef.current?.noteOn(midi, velocity);
          if (runningRef.current) {
            const ctxNow = ctxRef.current;
            const pos = ctxNow ? ctxNow.currentTime - bedStartRef.current : 0;
            playedRef.current.push({
              midi,
              startPos: pos,
              endPos: null,
              velocity,
            });
          }
        },
        onNoteOff: (midi) => {
          voiceRef.current?.noteOff(midi);
          const ctxNow = ctxRef.current;
          const pos = ctxNow ? ctxNow.currentTime - bedStartRef.current : 0;
          // close the most recent still-open stroke at this pitch
          for (let i = playedRef.current.length - 1; i >= 0; i--) {
            const n = playedRef.current[i];
            if (n.midi === midi && n.endPos === null) {
              n.endPos = pos;
              break;
            }
          }
        },
        onStatus: (label, midiDevice) => {
          setInputLabel(label);
          setHasMidi(midiDevice);
        },
      });

      runningRef.current = true;
      setRunning(true);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      teardown();
      setError(
        e instanceof Error
          ? `Could not start: ${e.message}`
          : "Could not start the duet.",
      );
    }
  }, [running, loading, bedId, teardown]);

  const stop = useCallback(() => {
    teardown();
    setRunning(false);
    setInputLabel("waiting for input…");
    setHasMidi(false);
  }, [teardown]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 text-foreground">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        14256 · mididuet
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        A duet with yourself
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        One of Karel&apos;s own recordings plays as the accompaniment. Every note
        you play on a MIDI keyboard is voiced by <em>concatenative resynthesis</em>
        {" "}— a real slice of his catalog at the matching pitch, nudged to your
        note and shaped by your touch. His timbre, live, over his own music. No
        oscillators anywhere.
      </p>

      {/* controls */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            bed take
          </span>
          <select
            value={bedId}
            onChange={(e) => setBedId(e.target.value)}
            disabled={running || loading}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
          >
            {REAL_TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>

        {!running ? (
          <button
            onClick={start}
            disabled={loading}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Start duet"}
          </button>
        ) : (
          <button
            onClick={stop}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>
        )}

        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* status row */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span
          className={
            hasMidi
              ? "font-mono text-xs uppercase tracking-[0.18em] text-primary"
              : "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
          }
        >
          input · {inputLabel}
        </span>
        {running && grainInfo && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            voice · {grainInfo}
          </span>
        )}
        {running && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            bed · {bedTitle}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      )}

      {/* piano roll */}
      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ height: CANVAS_H }}
        />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {running
          ? "Play. Printed gray marks are the recording; your sienna strokes are live catalog grains."
          : "Plug in a MIDI keyboard (or use your computer keys) and press Start."}
      </p>
      <p className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        keys · {KEY_HINT}
      </p>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The question.</strong> What
                if you could play a live duet with yourself — your MIDI keyboard
                voiced entirely in grains of your OWN recorded piano, over one of
                your own recordings?
              </p>
              <p>
                <strong className="text-foreground">The voice.</strong> We index
                Karel&apos;s catalog: each analysed note is a real slice of that
                track&apos;s audio at a known pitch. A live note-on grabs the
                nearest-pitch slice, nudges its playback rate to your exact note
                (clamped to ±1 octave), and windows it with a velocity-scaled
                envelope. It is his own timbre, resequenced in real time.
              </p>
              <p>
                <strong className="text-foreground">Lineage.</strong> CoSaRef,
                &ldquo;Annotation-Free MIDI-to-Audio Synthesis via Concatenative
                Synthesis and Generative Refinement&rdquo; (arXiv:2410.16785), and
                &ldquo;The Concatenator: A Bayesian Approach to Real-Time
                Concatenative Musaicing&rdquo; (arXiv:2411.04366).
              </p>
              <p>
                First use of Web MIDI in the lab; degrades to the computer
                keyboard so the duet is always playable.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14256-mididuet"]} />
    </main>
  );
}

// canvas rounded-rect helper (named draw*, never use*)
function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
