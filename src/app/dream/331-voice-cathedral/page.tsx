"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 331 · Voice Cathedral
//
// Sing a single note and watch it BLOOM into a choir that surrounds you in 3-D
// space — a one-person overtone cathedral you build, one note at a time, with
// your own voice. Spatial audio (HRTF) is the primary medium; the on-screen
// radar is a minimal, legible companion. Best on headphones.
//
// INPUT  : live voice (analysis-only — never recorded, stored, or transmitted)
// OUTPUT : HRTF-panned just-intonation voices around a D2 drone + inline-SVG radar
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Scene from "./scene";
import { detectPitch, MedianTracker } from "./pitch";
import {
  CathedralEngine,
  snapToJI,
  type SnappedNote,
  type VoiceSnapshot,
} from "./audio";

type Phase = "idle" | "running" | "no-mic";

// Commitment gating constants.
const STABILITY_SEMITONES = 0.6; // pitch must hold within this band…
const STABILITY_MS = 120; // …for this long before it commits.
const COOLDOWN_MS = 700; // min gap between commits.

// Convert Hz → "F♯3"-style name for the *currently sung* (un-snapped) note.
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
function nameForHz(hz: number): string {
  if (hz <= 0 || !isFinite(hz)) return "—";
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function semitonesBetween(a: number, b: number): number {
  return Math.abs(12 * Math.log2(a / b));
}

export default function VoiceCathedralPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [singingNote, setSingingNote] = useState<string>("—");
  const [chord, setChord] = useState<string[]>([]);
  const [voiceCount, setVoiceCount] = useState(0);
  const [voices, setVoices] = useState<VoiceSnapshot[]>([]);
  const [breath, setBreath] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  // Mutable engine / DSP refs (kept out of React state).
  const engineRef = useRef<CathedralEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const medianRef = useRef<MedianTracker>(new MedianTracker(5));
  const rafRef = useRef<number | null>(null);

  // Commitment-gating state.
  const candidateHzRef = useRef<number | null>(null);
  const candidateSinceRef = useRef<number>(0);
  const lastCommitRef = useRef<number>(0);
  const sawSilenceRef = useRef<boolean>(true); // retrigger gap latch.

  // Auto-demo arpeggio state.
  const demoRef = useRef<{ active: boolean; idx: number; nextAt: number }>({
    active: false,
    idx: 0,
    nextAt: 0,
  });

  const commit = useCallback((snapped: SnappedNote, when: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.commit(snapped);
    lastCommitRef.current = when;
    setChord(engine.chordNames());
  }, []);

  // The per-frame loop: pitch detection, gating, orbit tick, UI snapshot.
  const loop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const now = performance.now();

    // Breathing phase for the listener dot (~6s cycle).
    setBreath((Math.sin(now / 1000 * (Math.PI * 2 / 6)) + 1) / 2);

    // ── Auto-demo: programmatically "sing" a rising JI arpeggio ──
    const demo = demoRef.current;
    if (demo.active) {
      if (now >= demo.nextAt) {
        const ratios = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
        const r = ratios[demo.idx % ratios.length];
        const oct = Math.floor(demo.idx / ratios.length) % 2; // span a couple octaves
        const hz = 73.42 * r * Math.pow(2, 1 + oct); // D3-ish upward
        const snapped = snapToJI(hz);
        commit(snapped, now);
        setSingingNote(snapped.name);
        demo.idx++;
        demo.nextAt = now + 1400;
      }
    } else {
      // ── Live mic pitch detection ──
      const analyser = analyserRef.current;
      const buf = bufRef.current;
      if (analyser && buf) {
        analyser.getFloatTimeDomainData(buf);
        const raw = detectPitch(buf, {
          sampleRate: engine.ctx.sampleRate,
          minHz: 70,
          maxHz: 1000,
        });

        if (raw == null) {
          setSingingNote("—");
          medianRef.current.reset();
          candidateHzRef.current = null;
          sawSilenceRef.current = true; // breath ended → allow retrigger
        } else {
          const hz = medianRef.current.push(raw);
          setSingingNote(nameForHz(hz));

          const cand = candidateHzRef.current;
          if (cand == null || semitonesBetween(hz, cand) > STABILITY_SEMITONES) {
            // Drifted out of band → start a fresh stability window.
            candidateHzRef.current = hz;
            candidateSinceRef.current = now;
          } else {
            // Holding steady. Slowly track the center.
            candidateHzRef.current = cand * 0.85 + hz * 0.15;
            const held = now - candidateSinceRef.current;
            const sinceCommit = now - lastCommitRef.current;
            if (
              held >= STABILITY_MS &&
              sinceCommit >= COOLDOWN_MS &&
              sawSilenceRef.current
            ) {
              const snapped = snapToJI(candidateHzRef.current);
              commit(snapped, now);
              sawSilenceRef.current = false; // require a gap before next bloom
              candidateSinceRef.current = now; // reset window
            }
          }
        }
      }
    }

    engine.tick();
    const snap = engine.snapshot();
    setVoices(snap);
    setVoiceCount(snap.length);

    rafRef.current = requestAnimationFrame(loop);
  }, [commit]);

  // Start with live mic (gesture-gated; creates + resumes AudioContext here).
  const start = useCallback(async () => {
    setError(null);
    try {
      const engine = new CathedralEngine();
      engineRef.current = engine;
      await engine.start();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const source = engine.ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = engine.ctx.createAnalyser();
      analyser.fftSize = 2048;
      bufRef.current = new Float32Array(analyser.fftSize);
      source.connect(analyser); // analysis-only: never connected to destination.
      analyserRef.current = analyser;

      demoRef.current.active = false;
      setPhase("running");
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      // Mic denied / unavailable → graceful degradation to auto-demo.
      setError(
        "Microphone unavailable or denied. You can still hear the cathedral with the Auto-demo below.",
      );
      setPhase("no-mic");
    }
  }, [loop]);

  // Auto-demo (no mic): programmatically sing a rising JI arpeggio.
  const startDemo = useCallback(async () => {
    setError(null);
    try {
      let engine = engineRef.current;
      if (!engine) {
        engine = new CathedralEngine();
        engineRef.current = engine;
      }
      await engine.start();
      demoRef.current = { active: true, idx: 0, nextAt: performance.now() + 400 };
      if (phase !== "running") setPhase("running");
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop);
    } catch {
      setError("Audio could not start in this browser.");
    }
  }, [loop, phase]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        sourceRef.current?.disconnect();
        analyserRef.current?.disconnect();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const running = phase === "running";

  return (
    <main className="min-h-screen bg-[#08070a] text-foreground px-6 py-10 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <header className="mb-8">
          <p className="font-mono text-violet-300 text-base mb-2">
            331 · voice cathedral
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
            Sing one note. Build a choir around your head.
          </h1>
          <p className="mt-3 text-base text-muted-foreground leading-relaxed">
            Hold a single steady note and it blooms into a sustained voice,
            snapped to just intonation over a D2 drone and placed somewhere on a
            slowly orbiting ring around you. Sing again and again to stack a
            one-person overtone cathedral.{" "}
            <span className="text-violet-300/95">Best on headphones.</span>
          </p>
        </header>

        {/* Live legibility panel */}
        <section className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
          <div className="rounded-lg border border-border bg-muted px-4 py-3">
            <div className="text-base text-muted-foreground">singing now</div>
            <div className="text-2xl text-foreground mt-1">{singingNote}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted px-4 py-3 sm:col-span-1">
            <div className="text-base text-muted-foreground">voices</div>
            <div className="text-2xl text-foreground mt-1">{voiceCount}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted px-4 py-3">
            <div className="text-base text-muted-foreground">cathedral built</div>
            <div className="text-2xl text-foreground mt-1 leading-tight">
              {chord.length ? chord.join(" · ") : "—"}
            </div>
          </div>
        </section>

        {/* Radar */}
        <section className="mb-6 rounded-2xl border border-border bg-black/30 py-6">
          <Scene voices={voices} breath={breath} singing={singingNote !== "—"} />
        </section>

        {/* Controls */}
        <section className="flex flex-wrap items-center gap-3">
          {!running && (
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] px-5 py-2.5 rounded-lg bg-violet-500/90 hover:bg-violet-400 text-foreground text-base font-medium transition-colors"
            >
              Start with my voice
            </button>
          )}
          <button
            type="button"
            onClick={startDemo}
            className="min-h-[44px] px-5 py-2.5 rounded-lg border border-border bg-muted hover:bg-accent text-foreground text-base font-medium transition-colors"
          >
            {running ? "Auto-demo (no mic)" : "Auto-demo without a mic"}
          </button>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="ml-auto min-h-[44px] px-4 py-2.5 rounded-lg text-muted-foreground hover:text-foreground text-base transition-colors"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </section>

        {error && (
          <p className="mt-4 text-base text-violet-300" role="alert">
            {error}
          </p>
        )}

        {running && (
          <p className="mt-4 text-base text-muted-foreground">
            Sing a clear, steady note for about a quarter-second to commit a
            voice. Let your breath fall, then sing again — one breath blooms one
            voice.
          </p>
        )}

        {showNotes && (
          <section className="mt-6 rounded-2xl border border-border bg-muted p-5 text-base text-muted-foreground leading-relaxed space-y-3">
            <h2 className="text-xl text-foreground">Design notes</h2>
            <p>
              The primary medium here is spatial audio over headphones, not the
              screen. A YIN-style autocorrelation detector tracks your pitch; a
              short median window kills octave jumps. A note only commits once it
              holds within ~0.6 semitones for ~120&nbsp;ms, with a ~700&nbsp;ms
              cooldown and a required breath-gap — so a single held note blooms
              exactly one voice.
            </p>
            <p>
              Each committed pitch snaps to the nearest just-intonation degree of
              a D2 root, becomes a sustained additive voice, and is placed at a
              golden-angle azimuth on a gently orbiting ring through an HRTF
              PannerNode. An always-on JI drone anchors the field; a brick-wall
              compressor and a procedural convolution reverb keep nine voices
              clip-free and cathedral-sized.
            </p>
            <p className="text-muted-foreground">
              Your voice is analysis-only: it is never recorded, stored, or
              transmitted, and the mic is never routed to the speakers.
            </p>
            <p className="text-muted-foreground">
              Lineage: Pauline Oliveros&apos; <em>Deep Listening</em>; David Hykes
              &amp; the Harmonic Choir; La Monte Young&apos;s just-intonation
              drones; and this lab&apos;s own <em>308 · orbit-choir</em> HRTF
              piece.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
