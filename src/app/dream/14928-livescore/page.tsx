"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14928 · Livescore — Resonance renders Karel's music as a self-writing SCORE
// made of pure TYPE. No shader, no particles, no geometry, no color save one
// violet accent. The words themselves are the visualization.
//
//   ONE QUESTION
//   What if the visualization were nothing but Geist type on near-black — the
//   "now" chord written huge in violet, breathing with his touch; section
//   captions marching over the form; melody note-names scattering like filigree
//   at the frame edges; a mono readout of key / tempo / meter / dB / time?
//
//   INPUT   ALWAYS one of Karel's real recordings (REAL_TRACKS), looped through
//           ONE createSafeMaster. Zero synthesis.
//   OUTPUT  the DOM — pure text, laid out and animated every frame from the
//           track's analysis walked against playback position.
//   VERB    walk chords → write the hero → breathe it off smoothed RMS →
//           march sections → scatter recent melody → read out the meters.
//
//   Named reference — Norman McLaren, *Synchromy* (1971): music rendered as
//   visible marks on the film strip. Livescore is its typographic descendant,
//   in the current-year lineage of animated-text lyric scores.
//
//   Fallback — analysis null / no chords → the hero word is a live spectral
//   descriptor (BRIGHT / WARM / DARK) off master.analyser, the scatter is the
//   strongest bin mapped to a note-name, readout says "spectral fallback". The
//   piece is never blank.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  loadTrackAnalysis,
  type TrackAnalysis,
} from "../_shared/trackAnalysis";

// ── note-name helpers ────────────────────────────────────────────────────────
const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

function midiToName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

/** Nearest MIDI note-name for a raw frequency (for the spectral fallback). */
function freqToName(freq: number): string {
  if (freq <= 0) return "—";
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return midiToName(midi);
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// ── deterministic hash → [0,1), so scatter positions never jump per frame ────
function pickUnit(seed: number): number {
  let t = (seed | 0) + 0x9e3779b9;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

// ── a scattered melody token ─────────────────────────────────────────────────
interface ScatterToken {
  key: string;
  name: string;
  leftPct: number;
  topPct: number;
  opacity: number;
  scale: number;
}

const TRACKS = REAL_TRACKS;

export default function Livescore() {
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string>(TRACKS[0].id);
  const [showNotes, setShowNotes] = useState(false);

  // Live UI state driven off the animation loop.
  const [sectionLabel, setSectionLabel] = useState<string>("");
  const [sectionDesc, setSectionDesc] = useState<string>("");
  const [scatter, setScatter] = useState<ScatterToken[]>([]);
  const [readout, setReadout] = useState({
    key: "—",
    tempo: "—",
    meter: "—",
    db: "—",
    elapsed: "0:00",
    fallback: false,
  });

  // Audio + analysis + loop refs (never re-render on these).
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const analysisRef = useRef<TrackAnalysis | null>(null);
  const durationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const heroWrapRef = useRef<HTMLDivElement | null>(null);
  const heroWordRef = useRef<string>("");
  const rmsSmoothRef = useRef<number>(0);
  const timeBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const freqBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const reducedRef = useRef<boolean>(false);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      srcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    try {
      srcRef.current?.disconnect();
    } catch {
      /* noop */
    }
    srcRef.current = null;
    masterRef.current?.disconnect();
    masterRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {});
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // ── the animation loop ─────────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;

    const reduced = reducedRef.current;
    const analysis = analysisRef.current;
    const duration = durationRef.current || 1;
    const pos = (ctx.currentTime - startTimeRef.current) % duration;

    // ── smoothed RMS off the master analyser (time domain) ──
    const analyser = master.analyser;
    let tbuf = timeBufRef.current;
    if (!tbuf || tbuf.length !== analyser.fftSize) {
      tbuf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      timeBufRef.current = tbuf;
    }
    analyser.getByteTimeDomainData(tbuf);
    let sumSq = 0;
    for (let i = 0; i < tbuf.length; i++) {
      const v = (tbuf[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / tbuf.length);
    const lerp = reduced ? 0.08 : 0.15;
    rmsSmoothRef.current += (rms - rmsSmoothRef.current) * lerp;
    const smooth = rmsSmoothRef.current;

    // ── decide the hero word ──
    let hero = "";
    const hasChords = !!analysis && analysis.chords.length > 0;
    if (hasChords && analysis) {
      const chords = analysis.chords;
      let idx = 0;
      for (let i = 0; i < chords.length; i++) {
        if (chords[i].time <= pos) idx = i;
        else break;
      }
      hero = chords[idx]?.chord ?? "";
    } else {
      // spectral fallback: centroid → BRIGHT / WARM / DARK
      let fbuf = freqBufRef.current;
      if (!fbuf || fbuf.length !== analyser.frequencyBinCount) {
        fbuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        freqBufRef.current = fbuf;
      }
      analyser.getByteFrequencyData(fbuf);
      let num = 0;
      let den = 0;
      let peakMag = 0;
      let peakBin = 0;
      for (let i = 0; i < fbuf.length; i++) {
        const m = fbuf[i];
        num += i * m;
        den += m;
        if (m > peakMag) {
          peakMag = m;
          peakBin = i;
        }
      }
      const centroidBin = den > 0 ? num / den : 0;
      const centroidNorm = centroidBin / fbuf.length; // 0..1
      hero = centroidNorm > 0.42 ? "BRIGHT" : centroidNorm > 0.18 ? "WARM" : "DARK";

      // strongest bin → frequency → note-name for the scatter
      const nyquist = ctx.sampleRate / 2;
      const peakFreq = (peakBin / fbuf.length) * nyquist;
      const name = peakMag > 8 ? freqToName(peakFreq) : "—";
      setScatter([
        {
          key: `fb-${name}`,
          name,
          leftPct: 50 + (pickUnit(peakBin) - 0.5) * 30,
          topPct: 60 + (pickUnit(peakBin * 7 + 1) - 0.5) * 20,
          opacity: 0.28 + Math.min(0.4, smooth * 1.4),
          scale: 1,
        },
      ]);
    }

    // ── write / rewrite the hero word (WAAPI on change) ──
    // The wrapper carries the re-write animation (blur/scale/opacity) so it
    // never clobbers the inner element's breathing transform.
    const el = heroRef.current;
    const wrap = heroWrapRef.current;
    if (el) {
      if (hero !== heroWordRef.current) {
        heroWordRef.current = hero;
        el.textContent = hero;
        if (wrap && typeof wrap.animate === "function") {
          if (!reduced) {
            wrap.animate(
              [
                { filter: "blur(12px)", opacity: 0.0, transform: "scale(1.06)" },
                { filter: "blur(0px)", opacity: 1, transform: "scale(1)" },
              ],
              { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            );
          } else {
            wrap.animate(
              [{ opacity: 0.4 }, { opacity: 1 }],
              { duration: 600, easing: "ease" },
            );
          }
        }
      }
      // BREATHE: weight 220..860 + subtle scale off smoothed RMS.
      const loud = Math.min(1, smooth * 3.2);
      const weight = Math.round(220 + loud * 640);
      const scaleAmt = reduced ? 1 + loud * 0.015 : 1 + loud * 0.06;
      el.style.fontWeight = String(weight);
      el.style.fontVariationSettings = `"wght" ${weight}`;
      el.style.setProperty("--breathe", scaleAmt.toFixed(3));
    }

    // ── section caption (evenly mapped across the buffer duration) ──
    const sections = analysis?.summary?.sections;
    if (sections && sections.length > 0) {
      const span = duration / sections.length;
      const si = Math.min(sections.length - 1, Math.floor(pos / span));
      const s = sections[si];
      setSectionLabel((prev) => (prev === s.label ? prev : s.label));
      const desc = s.description && s.description.length <= 90 ? s.description : "";
      setSectionDesc((prev) => (prev === desc ? prev : desc));
    }

    // ── melody scatter: onsets within the last ~1.2s (real notes only;
    //    the spectral fallback set its own scatter above) ──
    if (hasChords && analysis) {
      const notes = analysis.notes;
      const windowSec = 1.2;
      const tokens: ScatterToken[] = [];
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        const age = pos - n.time;
        if (age < 0 || age > windowSec) continue;
        const seed = (n.midi << 8) ^ Math.round(n.time * 1000);
        const decay = 1 - age / windowSec; // 1 → 0
        tokens.push({
          key: `${n.midi}-${n.time.toFixed(3)}`,
          name: midiToName(n.midi),
          leftPct: 8 + pickUnit(seed) * 84,
          topPct: 18 + pickUnit(seed * 3 + 11) * 64,
          opacity: 0.12 + decay * 0.5,
          scale: reduced ? 1 : 0.9 + decay * 0.4,
        });
        if (tokens.length >= 40) break;
      }
      setScatter(tokens);
    }

    // ── readout ──
    const db = smooth > 0 ? 20 * Math.log10(smooth) : -Infinity;
    const dbStr = Number.isFinite(db) ? `${db.toFixed(0)} dB` : "-∞ dB";
    setReadout({
      key: analysis?.key_signature ?? "—",
      tempo: analysis?.tempo != null ? `${Math.round(analysis.tempo)} BPM` : "—",
      meter: analysis?.time_signature ?? "—",
      db: dbStr,
      elapsed: fmtTime(pos),
      fallback: !hasChords,
    });

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    setError(null);
    setLoading(true);
    try {
      reducedRef.current =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

      const AC = window.AudioContext || (window as unknown as {
        webkitAudioContext: typeof AudioContext;
      }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const master = createSafeMaster(ctx);
      masterRef.current = master;

      // audio + analysis in parallel; analysis may be null (fallback covers it)
      const [{ buffer }, analysis] = await Promise.all([
        loadRealTrackBuffer(ctx, trackId),
        loadTrackAnalysis(trackId).catch(() => null),
      ]);
      analysisRef.current = analysis;
      durationRef.current = buffer.duration;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(master.input);
      srcRef.current = src;

      startTimeRef.current = ctx.currentTime;
      src.start();

      setStarted(true);
      setLoading(false);
      heroWordRef.current = "";
      rmsSmoothRef.current = 0;
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (e) {
      setLoading(false);
      cleanup();
      setError(
        e instanceof Error
          ? `Audio failed to load — ${e.message}`
          : "Audio failed to load.",
      );
    }
  }, [trackId, runFrame, cleanup]);

  const currentTitle = TRACKS.find((t) => t.id === trackId)?.title ?? "";

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ── the score: pure type ────────────────────────────────────────── */}
      {started && (
        <>
          {/* section caption, top */}
          <div className="pointer-events-none absolute inset-x-0 top-8 z-10 flex flex-col items-center gap-1 px-6 text-center">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {sectionLabel || currentTitle}
            </div>
            {sectionDesc && (
              <div className="max-w-md font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground/50">
                {sectionDesc}
              </div>
            )}
          </div>

          {/* melody scatter */}
          <div className="pointer-events-none absolute inset-0 z-0">
            {scatter.map((t) => (
              <span
                key={t.key}
                className="absolute font-sans text-sm text-muted-foreground"
                style={{
                  left: `${t.leftPct}%`,
                  top: `${t.topPct}%`,
                  opacity: t.opacity,
                  transform: `translate(-50%, -50%) scale(${t.scale})`,
                }}
              >
                {t.name}
              </span>
            ))}
          </div>

          {/* the hero chord — breathing violet type */}
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
            <div ref={heroWrapRef} className="flex items-center justify-center">
              <div
                ref={heroRef}
                className="select-none text-center font-sans font-semibold tracking-tight text-primary"
                style={{
                  fontSize: "clamp(3rem, 12vw, 9rem)",
                  lineHeight: 1,
                  transform: "scale(var(--breathe, 1))",
                  willChange: "transform, font-weight",
                }}
              />
            </div>
          </div>

          {/* fixed readout, bottom */}
          <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6 text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>{readout.fallback ? "spectral fallback" : `key ${readout.key}`}</span>
            <span aria-hidden>·</span>
            <span>{readout.tempo}</span>
            <span aria-hidden>·</span>
            <span>{readout.meter}</span>
            <span aria-hidden>·</span>
            <span>{readout.db}</span>
            <span aria-hidden>·</span>
            <span>{readout.elapsed}</span>
          </div>
        </>
      )}

      {/* ── chrome ───────────────────────────────────────────────────────── */}
      {!started ? (
        <div className="relative z-20 mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Livescore
            </h1>
            <p className="text-base text-muted-foreground">
              Your music, written as a self-composing score of pure type — the
              chord breathing in violet, its melody scattering around it.
            </p>
          </div>

          <label className="flex flex-col items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Track
            </span>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={start}
            disabled={loading}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Start"}
          </button>

          {error && (
            <p className="text-base text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        // playing: title fades to a corner
        <div className="pointer-events-none absolute left-6 top-6 z-20">
          <span className="text-base font-semibold tracking-tight text-muted-foreground/60">
            Livescore
          </span>
        </div>
      )}

      {/* design notes trigger */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute bottom-6 right-6 z-30 min-h-[44px] rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="flex flex-col gap-3 font-sans text-sm leading-relaxed text-muted-foreground">
              <p>
                Livescore is a deliberately text-only reading of Resonance: no
                shader, no particles, no geometry, no color but one violet accent.
                The whole image is Geist type on near-black. The words are the
                visualization.
              </p>
              <p>
                The map: the current chord — the last one whose time has passed —
                is written huge in violet at center, re-writing itself with a
                quick blur-and-scale each time it changes, and breathing its font
                weight (220–860) and scale off a smoothed RMS read of Karel&apos;s
                touch. Formal sections caption the top; melody note-names from the
                last ~1.2 seconds scatter around the edges and fade with age; a
                mono strip reads key, tempo, meter, live dB and elapsed time.
              </p>
              <p>
                With no analysis, the hero becomes a live spectral descriptor —
                BRIGHT / WARM / DARK off the centroid — and the scatter tracks the
                strongest frequency bin, so the piece is never blank.
              </p>
              <p>
                Named reference: Norman McLaren&apos;s <em>Synchromy</em> (1971),
                where music was rendered as visible marks on the film strip.
                Livescore is its typographic descendant, in the current-year
                lineage of animated-text lyric scores.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14928-livescore"]} />
    </main>
  );
}
