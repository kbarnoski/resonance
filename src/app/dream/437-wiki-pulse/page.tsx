"use client";

/**
 * 437 — Wiki-Pulse
 * ─────────────────
 * What does the entire planet's live editing of human knowledge sound like —
 * right now, this second?
 *
 * Sonifies the Wikimedia EventStreams `recentchange` SSE firehose.
 * Every glowing point is a real Wikipedia edit, happening right now.
 *
 * References:
 *   Hatnote "Listen to Wikipedia" (LaPorte & Hashemi, 2013)
 *   Ryoji Ikeda "data-cosm [n°1]" (180 Studios, 2025–2026)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { buildAudioEngine } from "./audio";
import { buildVisualEngine } from "./visual";
import { createStreamController } from "./stream";
import type { WikiAudioEngine } from "./audio";
import type { VisualEngine } from "./visual";
import type { StreamStats } from "./stream";

// ── Design notes text (shown in overlay — do not fetch README at runtime) ───

const DESIGN_NOTES = `
WIKI-PULSE — Design Notes

THE QUESTION
What does the entire planet's live editing of human knowledge sound like — right now?

DATA SOURCE
Wikimedia EventStreams SSE firehose (no API key):
https://stream.wikimedia.org/v2/stream/recentchange
~8–30 events/second at peak; ~12% of edits are bots.

SONIFICATION MAPPINGS
• Bot edit → dry cold click (bandpass-filtered white noise burst, high-freq, ~35ms).
  Bots are clearly mechanical: colder, drier, harder. The listener should hear the machine tide.
• Human main-article edit → warm triangle-osc pluck with glide:
  - Addition (delta > 0): upward pitch glide (Hatnote bell homage)
  - Removal (delta < 0): downward pitch fall, softer (Hatnote strings homage)
  - Magnitude → register: small edits = high+quiet, large = low+louder
• New page → brief two-oscillator chord stab (magenta, accent)
• Log event → low soft sine thud (bureaucratic background)
• Categorize → very quiet ultra-high tick

Pitch: equal-temperament minor-pentatonic + extensions, but never voiced as a
chord — arrivals are aperiodic so it refuses to resolve (no grid, no arc).

VISUAL MAPPINGS (three.js 3D point field)
• X-axis → wiki language/project (enwiki left, wikidata right)
• Y-axis → byte delta (additions above, removals below center)
• Z-axis → depth jitter + slow forward drift
• Color: human edits = cyan/teal, bots = amber, new = magenta, log = grey-green
• Size ∝ log(|byteDelta|+1) — large edits glow larger
• Lifetime ~3–4s with fade in/out; no more than 600 points at once
• Additive blending: overlapping points bloom into white

LIVE vs DEMO FALLBACK
If the SSE connection fails within 4s (network block, CORS issue), a synthetic
generator emits realistic fake events (~10/sec, ~12% bot, realistic delta
distribution) through the same sonify/visualize code path.

AUDIO SAFETY
DynamicsCompressor limiter at −8 dBFS. Max 8 concurrent voices (overflow dropped).
AudioContext created inside the tap-to-start gesture (iOS-safe).

NAMED REFERENCES
• Hatnote "Listen to Wikipedia" (Stephen LaPorte & Mahmoud Hashemi, 2013):
  Bells for additions, strings for removals, pitch proportional to edit size.
  This piece uses the same up/down glide metaphor but with a harder, data-clinical timbre.
• Ryoji Ikeda "data-cosm [n°1]" (180 Studios, on view through Feb 2026):
  Clinical glowing-point aesthetic on black — the visual language of this piece
  inherits that lineage directly.

LAB NOVELTY
The Resonance lab has previously sonified seismic data (418-seismic-pulse),
solar wind (aurora-adjacent pieces), and generative physics simulations.
This is the first piece in the lab to sonify a live human-activity stream —
every event is a person (or bot) touching a shared text right now.

UNVERIFIED (build sandbox has no network/audio/GPU)
• Whether the live SSE feed actually connects from a given network context.
• Whether the sound density is comfortable on a phone at ~10 evts/sec.
• Whether the three.js point field renders at 60fps on a mid-range phone.
• The exact bot/human ratio audible in the real firehose (should be ~12% bots).
`.trim();

// ── Component ─────────────────────────────────────────────────────────────────

export default function WikiPulsePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef     = useRef<WikiAudioEngine | null>(null);
  const visualRef    = useRef<VisualEngine | null>(null);
  const rafRef       = useRef<number>(0);
  const streamRef    = useRef<{ stop: () => void } | null>(null);

  const [started, setStarted] = useState(false);
  const [stats, setStats]     = useState<StreamStats>({
    status: "connecting",
    editsPerSec: 0,
    botFraction: 0,
    totalEvents: 0,
  });
  const [showNotes, setShowNotes] = useState(false);

  // ── Kick everything off on tap ─────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (started) return;
    setStarted(true);

    // 1. Audio engine (created inside gesture for iOS)
    const audio = buildAudioEngine();
    audioRef.current = audio;

    // 2. Visual engine
    const container = containerRef.current;
    if (!container) return;
    const visual = buildVisualEngine(container);
    visualRef.current = visual;

    // 3. Animation loop
    function runFrame(ts: number) {
      rafRef.current = requestAnimationFrame(runFrame);
      visual.drawFrame(ts);
    }
    rafRef.current = requestAnimationFrame(runFrame);

    // 4. Stream controller
    const stream = createStreamController(
      (evt) => {
        audio.spawnSound(evt);
        visual.spawnParticle(evt);
      },
      (newStats) => {
        setStats(newStats);
      }
    );
    streamRef.current = stream;
  }, [started]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.stop();
      audioRef.current?.dispose();
      visualRef.current?.dispose();
    };
  }, []);

  // ── Keyboard shortcut: Space = toggle notes ────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "n" || e.key === "N") setShowNotes((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Status display ─────────────────────────────────────────────────────────
  const statusText =
    stats.status === "live"
      ? "live stream"
      : stats.status === "connecting"
      ? "connecting…"
      : stats.status === "demo"
      ? "demo stream (live feed unavailable)"
      : "stream error — using demo";

  const statusColor =
    stats.status === "live"
      ? "text-emerald-400"
      : stats.status === "connecting"
      ? "text-white/55"
      : "text-amber-300/95";

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">

      {/* Three.js mount point */}
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      />

      {/* Tap-to-start overlay */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/80">
          <h1 className="text-3xl font-mono font-bold text-white/95 tracking-widest mb-2 text-center px-4">
            WIKI-PULSE
          </h1>
          <p className="text-base font-mono text-white/70 mb-8 text-center px-6 max-w-sm">
            Every glowing point is a real Wikipedia edit, happening right now.
          </p>
          <button
            onClick={handleStart}
            className="px-6 py-3 font-mono text-base font-bold bg-white text-black rounded-none
                       hover:bg-white/90 active:bg-white/70 transition-colors
                       min-h-[44px] tracking-widest"
            style={{ minWidth: 200 }}
          >
            TAP TO START
          </button>
          <p className="text-sm font-mono text-white/40 mt-4 text-center px-4">
            Connects to the Wikimedia EventStreams live firehose
          </p>
        </div>
      )}

      {/* HUD — top-left title + description */}
      {started && (
        <div className="absolute top-14 left-0 right-0 px-5 pt-2 pointer-events-none z-10">
          <h1 className="text-2xl font-mono font-bold text-white/95 tracking-widest">
            WIKI-PULSE
          </h1>
          <p className="text-base font-mono text-white/70 mt-0.5">
            Every glowing point is a real Wikipedia edit, happening right now.
          </p>
        </div>
      )}

      {/* Status readout — bottom-left */}
      {started && (
        <div className="absolute bottom-16 left-5 z-10 pointer-events-none">
          <div className={`text-sm font-mono ${statusColor}`}>
            ◉ {statusText}
          </div>
          <div className="text-sm font-mono text-white/55 mt-1">
            {stats.editsPerSec.toFixed(1)} edits/sec
            &nbsp;·&nbsp;
            {(stats.botFraction * 100).toFixed(0)}% bot
            &nbsp;·&nbsp;
            {stats.totalEvents.toLocaleString()} total
          </div>
        </div>
      )}

      {/* Legend — bottom-right */}
      {started && (
        <div className="absolute bottom-16 right-5 z-10 pointer-events-none space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-300 opacity-80" />
            <span className="text-xs font-mono text-white/55">human edit</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 opacity-80" />
            <span className="text-xs font-mono text-white/55">bot edit</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-fuchsia-400 opacity-80" />
            <span className="text-xs font-mono text-white/55">new page</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "rgba(120,180,120,0.8)" }} />
            <span className="text-xs font-mono text-white/55">log / categorize</span>
          </div>
          <div className="text-xs font-mono text-white/35 mt-2 text-right">
            X: wiki · Y: byte delta
          </div>
        </div>
      )}

      {/* Design notes toggle button — top-right corner */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute top-16 right-4 z-20 px-3 py-2 text-xs font-mono
                   text-white/55 hover:text-white/80 border border-white/15
                   hover:border-white/35 transition-colors bg-black/60
                   min-h-[44px] flex items-center"
        aria-label="Toggle design notes"
      >
        {showNotes ? "close notes" : "read design notes"}
      </button>

      {/* Design notes panel */}
      {showNotes && (
        <div
          className="absolute inset-y-0 right-0 z-30 w-full max-w-md bg-black/95
                     border-l border-white/10 overflow-y-auto"
          role="dialog"
          aria-label="Design notes"
        >
          <div className="p-6 pt-16">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-mono font-bold text-white/95 tracking-widest">
                DESIGN NOTES
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="text-white/55 hover:text-white font-mono text-sm px-2 py-1 min-h-[44px]"
              >
                ✕
              </button>
            </div>
            <pre className="text-xs font-mono text-white/70 whitespace-pre-wrap leading-relaxed">
              {DESIGN_NOTES}
            </pre>
            <div className="mt-6 pt-4 border-t border-white/10">
              <p className="text-xs font-mono text-white/40">
                Press N to toggle this panel
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Visual axis labels (left = enwiki, right = wikidata) */}
      {started && !showNotes && (
        <div className="absolute bottom-5 left-0 right-0 flex justify-between px-5 z-10 pointer-events-none">
          <span className="text-xs font-mono text-white/25">enwiki</span>
          <span className="text-xs font-mono text-white/25">wikidata</span>
        </div>
      )}

      {/* Credit link */}
      <Link
        href="/dream"
        className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-mono
                   text-white/25 hover:text-white/50 transition-colors z-10"
      >
        RESONANCE / DREAM
      </Link>
    </div>
  );
}
