"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2218 · MISSING BASS
// "What if the deep bass drone you feel in your chest isn't actually in the
//  sound at all?"
//
// An ears-first cosmic-ambient drone built on the missing-fundamental / residue-
// pitch illusion (Schouten; Seebeck; Helmholtz). We synthesise only the UPPER
// harmonics of a low tone and high-pass away everything below them, so there is
// provably no acoustic energy at the fundamental — yet the brain reconstructs
// and "hears" the absent low pitch. Play a scale of phantom roots on the home
// row; a binaural beat entrains; a Reveal A/B adds the real f0 so you can hear
// how close your reconstructed pitch was.
//
// INPUT: keyboard (home row) + pointer.  OUTPUT: Web Audio + Canvas2D spectrum.
// HEADPHONES REQUIRED — the illusion and the binaural beat both depend on them.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PhantomBassEngine, SCALE } from "./audio";
import { drawSpectrum, type DrawState } from "./visual";

type Phase = "idle" | "playing" | "unavailable";

export default function MissingBassPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [density, setDensity] = useState(6); // 3..8 harmonics
  const [beat, setBeat] = useState(4); // 0..8 Hz binaural
  const [volume, setVolume] = useState(0.55);
  const [reveal, setReveal] = useState(false);
  const [held, setHeld] = useState<number[]>([]);

  const engineRef = useRef<PhantomBassEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const heldRef = useRef<Set<number>>(new Set());

  // ── keep live params flowing to the engine without rebuilding it ──
  useEffect(() => {
    engineRef.current?.setDensity(density);
  }, [density]);
  useEffect(() => {
    engineRef.current?.setBeat(beat);
  }, [beat]);
  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    engineRef.current?.setReveal(reveal);
  }, [reveal]);

  const noteOn = useCallback((i: number) => {
    if (heldRef.current.has(i)) return;
    heldRef.current.add(i);
    setHeld(Array.from(heldRef.current));
    engineRef.current?.noteOn(i, SCALE[i].f0);
  }, []);

  const noteOff = useCallback((i: number) => {
    if (!heldRef.current.has(i)) return;
    heldRef.current.delete(i);
    setHeld(Array.from(heldRef.current));
    engineRef.current?.noteOff(i);
  }, []);

  const begin = useCallback(async () => {
    if (engineRef.current) return;
    try {
      const eng = new PhantomBassEngine();
      await eng.resume();
      eng.setDensity(density);
      eng.setBeat(beat);
      eng.setVolume(volume);
      engineRef.current = eng;
      setPhase("playing");
    } catch {
      setPhase("unavailable");
    }
  }, [density, beat, volume]);

  // ── keyboard: home row plays phantom roots; arrows tune density/beat ──
  useEffect(() => {
    if (phase !== "playing") return;
    const keyIndex = (k: string) => SCALE.findIndex((s) => s.key === k);

    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const i = keyIndex(k);
      if (i >= 0) {
        e.preventDefault();
        noteOn(i);
        return;
      }
      if (k === "arrowup") {
        e.preventDefault();
        setDensity((d) => Math.min(8, +(d + 0.5).toFixed(1)));
      } else if (k === "arrowdown") {
        e.preventDefault();
        setDensity((d) => Math.max(3, +(d - 0.5).toFixed(1)));
      } else if (k === "arrowright") {
        e.preventDefault();
        setBeat((b) => Math.min(8, +(b + 0.5).toFixed(1)));
      } else if (k === "arrowleft") {
        e.preventDefault();
        setBeat((b) => Math.max(0, +(b - 0.5).toFixed(1)));
      } else if (k === "r") {
        e.preventDefault();
        setReveal((r) => !r);
      }
    };
    const up = (e: KeyboardEvent) => {
      const i = keyIndex(e.key.toLowerCase());
      if (i >= 0) noteOff(i);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [phase, noteOn, noteOff]);

  // ── render loop ──
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    const eng = engineRef.current;
    if (!canvas || !eng) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bins = new Uint8Array(eng.analyser.frequencyBinCount);
    let beatPhase = 0;
    let last = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      eng.analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let b = 4; b < bins.length; b++) sum += bins[b];
      const amp = Math.min(1, sum / bins.length / 60);

      beatPhase = (beatPhase + dt * eng.beatHz) % 1;

      const state: DrawState = {
        freq: bins,
        sampleRate: eng.ctx.sampleRate,
        fftSize: eng.analyser.fftSize,
        roots: eng.activeRoots(),
        beatPhase,
        amp,
        reveal: eng.revealed,
      };
      drawSpectrum(ctx, w, h, state);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // ── teardown ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-col gap-2 px-6 pt-8 pb-4 sm:px-10">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          2218 · dream lab
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Missing Bass
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The deep bass you feel here isn&rsquo;t in the sound. We play only the
          upper harmonics of a low tone and high-pass away everything beneath
          them &mdash; so there is no energy at the fundamental &mdash; yet your
          brain reconstructs and hears the absent low pitch. A phantom bass,
          played on the home row.
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
          Headphones required
        </p>
      </header>

      {phase === "idle" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16">
          <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
            Put on headphones, then hold the home-row keys{" "}
            <span className="font-mono text-foreground">A S D F G H J K</span> to
            sound a slow chord of <em>missing</em> fundamentals. Nothing plays
            until you begin.
          </p>
          <button
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        </section>
      )}

      {phase === "unavailable" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16">
          <p className="max-w-md text-center text-sm leading-relaxed text-destructive">
            Web Audio is unavailable in this browser, so the phantom bass
            can&rsquo;t be synthesised. Try a current desktop browser with
            headphones.
          </p>
        </section>
      )}

      {phase === "playing" && (
        <section className="flex flex-1 flex-col gap-4 px-6 pb-8 sm:px-10">
          <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-lg border border-border">
            <canvas
              ref={canvasRef}
              className="h-full w-full"
              style={{ display: "block" }}
            />
          </div>

          {/* home-row keys */}
          <div className="flex flex-wrap gap-2">
            {SCALE.map((s, i) => {
              const on = held.includes(i);
              return (
                <button
                  key={s.key}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    noteOn(i);
                  }}
                  onPointerUp={() => noteOff(i)}
                  onPointerLeave={() => noteOff(i)}
                  className={
                    "min-h-[44px] flex-1 rounded-md border px-3 text-sm transition-colors " +
                    (on
                      ? "border-primary bg-primary/20 text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
                  }
                >
                  <span className="block font-mono text-xs uppercase tracking-[0.18em]">
                    {s.key}
                  </span>
                  <span className="block text-[0.7rem] text-muted-foreground">
                    {s.note} · {Math.round(s.f0)}Hz
                  </span>
                </button>
              );
            })}
          </div>

          {/* controls */}
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Harmonic density · {density.toFixed(1)} <span aria-hidden>↑↓</span>
              </span>
              <input
                type="range"
                min={3}
                max={8}
                step={0.5}
                value={density}
                onChange={(e) => setDensity(+e.target.value)}
                className="accent-primary"
              />
              <span className="text-[0.7rem] text-muted-foreground">
                more harmonics &rarr; more vivid phantom bass
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Binaural beat · {beat.toFixed(1)} Hz{" "}
                <span aria-hidden>←→</span>
              </span>
              <input
                type="range"
                min={0}
                max={8}
                step={0.5}
                value={beat}
                onChange={(e) => setBeat(+e.target.value)}
                className="accent-primary"
              />
              <span className="text-[0.7rem] text-muted-foreground">
                slow L/R detune for entrainment
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Volume · {Math.round(volume * 100)}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(+e.target.value)}
                className="accent-primary"
              />
              <button
                onClick={() => setReveal((r) => !r)}
                className={
                  "min-h-[44px] rounded-md border px-4 text-sm transition-colors " +
                  (reveal
                    ? "border-primary bg-primary/20 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
                }
              >
                {reveal ? "Reveal ON — real f0 added" : "Reveal OFF — pure phantom"}{" "}
                <span className="font-mono text-xs">(R)</span>
              </button>
            </label>
          </div>

          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.18em]">
              Design notes
            </summary>
            <p className="mt-2 max-w-2xl leading-relaxed">
              Each held key renders sine oscillators at the 3rd&ndash;8th
              harmonics of an <em>absent</em> fundamental (55&ndash;110 Hz),
              summed through a cascaded 135 Hz high-pass. No oscillator is ever
              created at f0, so the entire low band is empty &mdash; watch the
              live spectrum: bars only appear above the dashed cutoff, while the
              ghost markers mark where you nonetheless hear a pitch. The right
              ear&rsquo;s harmonics are detuned by the beat rate for a binaural
              beat. <strong>Reveal</strong> adds a real sine at f0 (bypassing the
              high-pass, drawn in amber) so you can A/B your reconstructed pitch
              against the genuine one &mdash; then switch it off and the bass
              persists as pure illusion. Residue pitch: Schouten (1940);
              Seebeck (1841); Helmholtz.
            </p>
          </details>

          <Link
            href="/dream"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            &larr; all prototypes
          </Link>
        </section>
      )}
    </main>
  );
}
