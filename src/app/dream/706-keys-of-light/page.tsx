"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 706-keys-of-light — Karel's playing, revealed as light out of the dark.
//
// A piece's real note roll (every MIDI note his hands played, with time / pitch
// / length / velocity, from the track analysis) streams across the screen like
// an aurora. Each note is a soft horizontal filament: its height is the pitch,
// its length the duration, its brightness the velocity. A still "now" line sits
// left-of-center; a filament flares as it crosses — that's the note sounding
// right then. Low notes glow deep amber, high notes pale to gold-white.
//
// It's the LED reveal Karel likes — sound arriving out of darkness — but the
// light is literally his notes. Audio → safeMaster → speakers.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackNote } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

type Phase = "idle" | "loading" | "playing" | "error";

const NOW_X = 0.3; // now-line fraction of width
const SECONDS_AHEAD = 6.5;
const SECONDS_BEHIND = 2.5;

export default function KeysOfLightPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeId, setActiveId] = useState<string>(COLLECTIONS[0].tracks[0].id);
  const [title, setTitle] = useState<string>(COLLECTIONS[0].tracks[0].title);

  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const notesRef = useRef<TrackNote[]>([]);
  const cursorRef = useRef(0); // first note index still possibly visible
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  const stopSource = useCallback(() => {
    const s = srcRef.current;
    if (s) { try { s.onended = null; s.stop(); } catch { /* stopped */ } srcRef.current = null; }
  }, []);

  useEffect(() => () => {
    stopSource();
    cancelAnimationFrame(rafRef.current);
    safeRef.current?.disconnect();
    ctxRef.current?.close().catch(() => {});
  }, [stopSource]);

  const play = useCallback(async (id: string) => {
    stopSource();
    setActiveId(id);
    setPhase("loading");
    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      ctxRef.current = ctx;
      safeRef.current = createSafeMaster(ctx);
    }
    await ctx.resume().catch(() => {});
    let buffer: AudioBuffer;
    try {
      const [audio, analysis] = await Promise.all([
        loadRealTrackBuffer(ctx, id),
        loadTrackAnalysis(id),
      ]);
      buffer = audio.buffer;
      setTitle(audio.title);
      notesRef.current = analysis?.notes ?? [];
    } catch {
      setPhase("error");
      return;
    }
    cursorRef.current = 0;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(safeRef.current!.input);
    src.onended = () => { if (srcRef.current === src) { srcRef.current = null; setPhase("idle"); } };
    srcRef.current = src;
    startedAtRef.current = ctx.currentTime;
    src.start();
    setPhase("playing");
  }, [stopSource]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const yForMidi = (midi: number, H: number) => {
      const lo = 33, hi = 96;
      const cl = Math.max(lo, Math.min(hi, midi));
      return H * (0.9 - ((cl - lo) / (hi - lo)) * 0.8);
    };

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;

      g.fillStyle = "rgba(4,5,9,0.32)";
      g.fillRect(0, 0, W, H);

      const nowX = W * NOW_X;
      const span = SECONDS_AHEAD + SECONDS_BEHIND;
      const pxPerSec = W / span;

      if (phase === "playing" && ctxRef.current) {
        const t = ctxRef.current.currentTime - startedAtRef.current;
        const notes = notesRef.current;

        // advance cursor past notes fully behind the window
        let start = cursorRef.current;
        while (start < notes.length && notes[start].time + notes[start].duration < t - SECONDS_BEHIND) start++;
        cursorRef.current = start;

        g.globalCompositeOperation = "lighter";
        for (let i = start; i < notes.length; i++) {
          const nt = notes[i];
          if (nt.time > t + SECONDS_AHEAD) break; // sorted: rest are further future
          const x0 = nowX + (nt.time - t) * pxPerSec;
          const len = Math.max(dpr * 3, nt.duration * pxPerSec);
          const y = yForMidi(nt.midi, H);

          const sounding = t >= nt.time && t <= nt.time + nt.duration;
          const vel = Math.min(1, nt.velocity / 110);
          const pitchN = Math.max(0, Math.min(1, (nt.midi - 33) / 63));
          const hue = 44 - pitchN * 16; // low amber → high gold
          const light = 40 + pitchN * 26 + (sounding ? 22 : 0);
          const alpha = (0.18 + vel * 0.5) * (sounding ? 1 : 0.66);
          const h = dpr * (2 + vel * 3) * (sounding ? 1.8 : 1);

          g.fillStyle = `hsla(${hue}, ${70 + pitchN * 20}%, ${light}%, ${alpha})`;
          g.beginPath();
          // rounded filament
          const r = h / 2;
          g.moveTo(x0 + r, y - r);
          g.arcTo(x0 + len, y - r, x0 + len, y, r);
          g.arcTo(x0 + len, y + r, x0 + len - r, y + r, r);
          g.lineTo(x0 + r, y + r);
          g.arcTo(x0, y + r, x0, y, r);
          g.arcTo(x0, y - r, x0 + r, y - r, r);
          g.fill();

          if (sounding) {
            const glow = g.createRadialGradient(x0, y, 0, x0, y, H * 0.05 * (0.5 + vel));
            glow.addColorStop(0, `hsla(${hue}, 90%, ${light + 8}%, ${0.5 * vel})`);
            glow.addColorStop(1, `hsla(${hue}, 90%, ${light}%, 0)`);
            g.fillStyle = glow;
            g.beginPath();
            g.arc(x0, y, H * 0.05 * (0.5 + vel), 0, Math.PI * 2);
            g.fill();
          }
        }
        g.globalCompositeOperation = "source-over";
      }

      // now-line shimmer
      const lg = g.createLinearGradient(nowX - 2, 0, nowX + 2, 0);
      lg.addColorStop(0, "rgba(255,224,180,0)");
      lg.addColorStop(0.5, "rgba(255,224,180,0.22)");
      lg.addColorStop(1, "rgba(255,224,180,0)");
      g.fillStyle = lg;
      g.fillRect(nowX - dpr * 8, 0, dpr * 16, H);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#04050a] text-neutral-200">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center gap-1 text-center">
        <div className="text-sm font-light tracking-wide text-amber-100">{title}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500">
          keys of light · Karel Barnoski
        </div>
        {phase === "loading" && (
          <div className="mt-1 animate-pulse text-xs uppercase tracking-widest text-neutral-500">loading</div>
        )}
        {phase === "idle" && (
          <div className="mt-1 text-xs text-neutral-500">pick a piece below</div>
        )}
        {phase === "error" && (
          <div className="mt-1 text-xs text-red-400/80">could not load track</div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-5 flex justify-center px-4">
        <select
          value={activeId}
          onChange={(e) => void play(e.target.value)}
          className="max-w-[90vw] rounded-full border border-white/15 bg-black/50 px-4 py-2 text-sm text-neutral-200 backdrop-blur-sm focus:border-amber-200/50 focus:outline-none"
        >
          {COLLECTIONS.map((c) => (
            <optgroup key={c.name} label={c.name}>
              {c.tracks.map((t) => (
                <option key={t.id} value={t.id} className="bg-neutral-900">{t.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </main>
  );
}
