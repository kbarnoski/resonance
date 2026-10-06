"use client";

// showcase.tsx — the clean review cut of the particle engine, built for ONE
// decision (Karel, 2026-10-05): "do I want this crisp, sound-driven particle
// look as the lead visual in journeys, instead of shader-drawn particles?"
//
// Pure black, no chrome. One tap starts Karel's "Rebound" (picked by
// measurement: the strongest bass AND high end in the catalog — bass
// −27.6 dB, treble −54.3 dB with the second-highest treble onset flux). The
// field then flows through the four souls (~50 s each, 8 s blends), with a
// small caption fading in at each change. Once per cycle the screen splits
// 50/50: LEFT = today's shader lead (galaxy-seed, the Kinetic Lab lead
// actor) on the same audio, RIGHT = the particle Vortex. 'C' toggles that
// comparison at any time. The old lab UI lives at ?lab=1.

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive } from "../_shared/immersive";
import {
  createParticleEngine,
  ParticleEngineUnsupported,
  type ParticleEngine,
  type SoulId,
} from "@/lib/particles/particle-engine";
import { createSpectrumAnalyzer, type SpectrumAnalyzer, type SpectrumFrame } from "@/lib/particles/spectrum";
// import the one shader directly — not the 238-shader registry
import { FRAG as GALAXY_SEED_FRAG } from "@/lib/shaders/galaxy-seed";
import { createShaderLayer, type ShaderLayer } from "./compare";

const TRACK = REAL_TRACKS.find((t) => t.title === "Rebound") ?? REAL_TRACKS[0];

interface Segment {
  soul: SoulId;
  dur: number;
  split?: boolean;
  title: string;
  line: string;
}

const SEQUENCE: readonly Segment[] = [
  { soul: "vortex", dur: 48, title: "Vortex", line: "the bass breathes the galaxy" },
  {
    soul: "vortex",
    dur: 32,
    split: true,
    title: "Today · Particles",
    line: "left: the shader lead journeys draw now — right: real particles, each hearing its own band",
  },
  { soul: "smoke", dur: 50, title: "Smoke of Light", line: "the middle voices carry the current" },
  { soul: "bloom", dur: 50, title: "Fibonacci Bloom", line: "every swell opens the flower" },
  { soul: "murmuration", dur: 50, title: "Murmuration", line: "the high notes scatter the flock" },
];

const CAPTION_SEC = 8;

export function ShowcaseView() {
  const { enter } = useImmersive();
  const pCanvas = useRef<HTMLCanvasElement | null>(null);
  const sCanvas = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const shaderRef = useRef<ShaderLayer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const specRef = useRef<SpectrumAnalyzer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const frameRef = useRef<SpectrumFrame | null>(null);
  const playingRef = useRef(false);
  const splitOverride = useRef<boolean | null>(null);

  const [started, setStarted] = useState(false);
  const [split, setSplit] = useState(false);
  const [caption, setCaption] = useState<{ title: string; line: string; on: boolean }>({ title: "", line: "", on: false });
  const [fatal, setFatal] = useState("");

  // ── engines (created on mount, rendered only after the tap) ────────────────
  useEffect(() => {
    const canvas = pCanvas.current;
    if (!canvas) return;
    let engine: ParticleEngine;
    try {
      engine = createParticleEngine(canvas, {
        probe: true, // dream lab: verification read-back is fine here (never in journeys)
        count: 409_600,
        soul: "vortex",
        onContextLost: () => setFatal("The GPU context was lost — reload to restore the field."),
        audio: (dt) => {
          const spec = specRef.current;
          if (!spec || !playingRef.current) {
            frameRef.current = null;
            return null;
          }
          const f = spec.update(dt);
          frameRef.current = f;
          return f;
        },
      });
    } catch (e) {
      setFatal(
        e instanceof ParticleEngineUnsupported
          ? "This browser can't run the GPU particle field — try desktop Chrome, Edge or Safari 17+."
          : "The particle engine failed to start.",
      );
      return;
    }
    engineRef.current = engine;
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    if (sCanvas.current) shaderRef.current = createShaderLayer(sCanvas.current, GALAXY_SEED_FRAG);

    window.__resonanceParticles = {
      stats: () => ({ ...engine.stats(), playing: playingRef.current, split: splitOverride.current }),
      setSoul: (id: SoulId, sec?: number) => engine.setSoul(id, sec),
      setCount: (c: number) => engine.setCount(c),
    };
    return () => {
      window.removeEventListener("resize", onResize);
      engine.dispose();
      shaderRef.current?.dispose();
      engineRef.current = null;
      delete window.__resonanceParticles;
    };
  }, []);

  // ── comparison shader loop: runs only while the split is (or was just) up ──
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let last = 0;
    let clock = 0;
    let lv = { bass: 0, mid: 0, treble: 0 };
    let offAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const f = frameRef.current;
      // same kinetic dilation the journey layer gets: bass-band clock
      clock += dt * (f?.rates.bass ?? 1);
      const k = 1 - Math.exp(-dt / 0.12);
      const t = f?.bandLevels ?? { bass: 0, mid: 0, treble: 0 };
      lv = { bass: lv.bass + (t.bass - lv.bass) * k, mid: lv.mid + (t.mid - lv.mid) * k, treble: lv.treble + (t.treble - lv.treble) * k };
      const visible = sCanvas.current?.dataset.on === "1";
      if (visible) offAt = now;
      if (visible || now - offAt < 3000) {
        shaderRef.current?.render(clock, lv.bass, lv.mid, lv.treble, (lv.bass + lv.mid + lv.treble) / 3);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // ── the sequence: souls + captions + the split moment ──────────────────────
  useEffect(() => {
    if (!started) return;
    const t0 = performance.now();
    let seg = -1;
    let captionTimer = 0;
    const total = SEQUENCE.reduce((s, x) => s + x.dur, 0);
    const show = (title: string, line: string) => {
      setCaption({ title, line, on: true });
      window.clearTimeout(captionTimer);
      captionTimer = window.setTimeout(() => setCaption((c) => ({ ...c, on: false })), CAPTION_SEC * 1000);
    };
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) % total;
      let acc = 0;
      let idx = 0;
      for (let i = 0; i < SEQUENCE.length; i++) {
        if (t < acc + SEQUENCE[i].dur) { idx = i; break; }
        acc += SEQUENCE[i].dur;
      }
      if (idx !== seg) {
        const s = SEQUENCE[idx];
        const prev = seg >= 0 ? SEQUENCE[seg] : null;
        seg = idx;
        if (!prev || prev.soul !== s.soul) engineRef.current?.setSoul(s.soul, 8);
        show(s.title, s.line);
      }
      const want = splitOverride.current ?? !!SEQUENCE[seg].split;
      setSplit(want);
    };
    tick();
    const iv = window.setInterval(tick, 250);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(captionTimer);
    };
  }, [started]);

  // ── 'C' toggles the comparison any time ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "c" && e.key !== "C") return;
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const next = !(splitOverride.current ?? split);
      splitOverride.current = next;
      setSplit(next);
      if (next) {
        setCaption({ title: "Today · Particles", line: "left: the shader lead journeys draw now — right: real particles", on: true });
        window.setTimeout(() => setCaption((c) => ({ ...c, on: false })), CAPTION_SEC * 1000);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [split]);

  // ── audio ──────────────────────────────────────────────────────────────────
  const playTrack = useCallback(async () => {
    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctx: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      ctxRef.current = ctx;
      const safe = createSafeMaster(ctx, { gain: 0.8 });
      safe.analyser.fftSize = 4096;
      safe.analyser.smoothingTimeConstant = 0.45;
      safeRef.current = safe;
      specRef.current = createSpectrumAnalyzer(safe.analyser, { bins: 128 });
    }
    await ctx.resume().catch(() => {});
    try {
      const loaded = await loadRealTrackBuffer(ctx, TRACK.id);
      const src = ctx.createBufferSource();
      src.buffer = loaded.buffer;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + 3);
      src.connect(g);
      g.connect(safeRef.current!.input);
      src.onended = () => {
        if (srcRef.current === src) void playTrack(); // loop the take
      };
      srcRef.current = src;
      src.start();
      playingRef.current = true;
    } catch {
      setCaption({ title: "Silence", line: "the recording couldn't load — the field keeps breathing on its own", on: true });
    }
  }, []);

  useEffect(() => {
    return () => {
      const src = srcRef.current;
      srcRef.current = null;
      if (src) {
        src.onended = null;
        try { src.stop(); } catch { /* already stopped */ }
      }
      safeRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const begin = useCallback(() => {
    if (started || fatal) return;
    setStarted(true);
    enter();
    engineRef.current?.start();
    void playTrack();
  }, [started, fatal, enter, playTrack]);

  return (
    <main
      className={`fixed inset-0 z-[60] overflow-hidden bg-black ${started ? "cursor-none" : "cursor-pointer"}`}
      onClick={begin}
    >
      <canvas ref={pCanvas} className="absolute inset-0 h-full w-full" aria-label="Particle field listening to Karel's piano" />
      <canvas
        ref={sCanvas}
        data-on={split ? "1" : "0"}
        className="absolute inset-0 h-full w-full transition-opacity duration-[2500ms] ease-in-out"
        style={{ clipPath: "inset(0 50% 0 0)", opacity: split ? 1 : 0 }}
        aria-hidden
      />
      {/* split seam + side labels */}
      <div
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-muted-foreground/20 transition-opacity duration-[2500ms]"
        style={{ opacity: split ? 1 : 0 }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-6 flex font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/60 transition-opacity duration-[2500ms]"
        style={{ opacity: split ? 1 : 0 }}
      >
        <span className="w-1/2 text-center">shader · today</span>
        <span className="w-1/2 text-center">particles · 410k</span>
      </div>

      {/* tap to begin */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity duration-1000"
        style={{ opacity: started ? 0 : 1 }}
      >
        {fatal ? (
          <p className="max-w-md px-6 text-center text-base leading-relaxed text-destructive">{fatal}</p>
        ) : (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">tap anywhere to begin</p>
            <p className="text-sm text-muted-foreground/60">
              Particle Engine · Karel Barnoski, &ldquo;{TRACK.title}&rdquo;
            </p>
          </>
        )}
      </div>

      {/* caption */}
      <div
        className="pointer-events-none absolute bottom-8 left-8 max-w-md transition-opacity duration-[1500ms] ease-in-out sm:bottom-10 sm:left-10"
        style={{ opacity: caption.on ? 1 : 0 }}
      >
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">{caption.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground/70">{caption.line}</p>
      </div>
    </main>
  );
}
