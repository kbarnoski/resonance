"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 703-harmonic-bloom — watch Karel's harmony bloom.
//
// Pick a piece. Its real chord progression (from the track's musical analysis)
// drives a slow mandala: every chord change re-blooms the rose — the root note
// sets its hue around the circle of fifths, minor colors go cooler and dimmer,
// richer chords (9ths, 11ths, add-tones) grow more petals. The prose "section"
// summary tints the whole field so you feel the form move. Transitions are
// eased, never cut. Audio → safeMaster → speakers.
//
// It's a way to SEE the composition — the harmony and the form — while you hear
// it, instead of only watching a waveform.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  pitchClassHue,
  type TrackChord,
  type TrackSection,
} from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

type Phase = "idle" | "loading" | "playing" | "error";

interface SectionRange {
  label: string;
  start: number;
  end: number;
}

function chordComplexity(sym: string): number {
  const body = sym.replace(/^[A-Ga-g][#b]?/, "");
  let c = 0;
  if (/9/.test(body)) c += 1;
  if (/11/.test(body)) c += 2;
  if (/13/.test(body)) c += 2;
  if (/7/.test(body)) c += 1;
  if (/sus/.test(body)) c += 1;
  if (/add/.test(body)) c += 1;
  if (/[#b]\d/.test(body)) c += 1; // alterations
  if (/\//.test(sym)) c += 1; // slash / inversion
  return c;
}

function parseSections(sections: TrackSection[] | undefined): SectionRange[] {
  if (!sections) return [];
  const out: SectionRange[] = [];
  for (const s of sections) {
    const m = s.label.match(/(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)/);
    if (!m) continue;
    const start = +m[1] * 60 + +m[2];
    const end = +m[3] * 60 + +m[4];
    const label = s.label.replace(/\s*\([^)]*\)\s*$/, "").trim();
    out.push({ label, start, end });
  }
  return out;
}

export default function HarmonicBloomPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeId, setActiveId] = useState<string>(COLLECTIONS[0].tracks[0].id);
  const [title, setTitle] = useState<string>(COLLECTIONS[0].tracks[0].title);
  const [keyName, setKeyName] = useState<string>("");
  const [chordLabel, setChordLabel] = useState<string>("");
  const [sectionLabel, setSectionLabel] = useState<string>("");

  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const chordsRef = useRef<TrackChord[]>([]);
  const sectionsRef = useRef<SectionRange[]>([]);
  const chordIdxRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  // eased visual state (current) + targets the chords drive it toward
  const visRef = useRef({ hue: 40, sat: 60, petals: 6, rot: 0, bloom: 0, secHue: 40 });
  const tRef = useRef({ hue: 40, sat: 60, petals: 6, rot: 0, bloom: 0, secHue: 40 });
  const chordLabelRef = useRef("");
  const sectionLabelRef = useRef("");

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
    setChordLabel("");
    setSectionLabel("");

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
      chordsRef.current = analysis?.chords ?? [];
      sectionsRef.current = parseSections(analysis?.summary?.sections);
      setKeyName(analysis?.key_signature ?? "");
    } catch {
      setPhase("error");
      return;
    }

    chordIdxRef.current = 0;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(safeRef.current!.input);
    src.onended = () => {
      if (srcRef.current === src) { srcRef.current = null; setPhase("idle"); }
    };
    srcRef.current = src;
    startedAtRef.current = ctx.currentTime;
    src.start();
    setPhase("playing");
  }, [stopSource]);

  // render loop
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

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      const unit = Math.min(W, H);
      const v = visRef.current;
      const vt = tRef.current;

      // advance chord + section by playback time
      if (phase === "playing" && ctxRef.current) {
        const t = ctxRef.current.currentTime - startedAtRef.current;
        const chords = chordsRef.current;
        let idx = chordIdxRef.current;
        while (idx + 1 < chords.length && chords[idx + 1].time <= t) idx++;
        while (idx > 0 && chords[idx].time > t) idx--;
        chordIdxRef.current = idx;
        const cur = chords[idx];
        if (cur && cur.chord && cur.chord !== chordLabelRef.current) {
          chordLabelRef.current = cur.chord;
          setChordLabel(cur.chord);
          const root = chordRoot(cur.chord);
          if (root !== null) vt.hue = pitchClassHue(root);
          vt.sat = chordIsMinor(cur.chord) ? 42 : 72;
          vt.petals = 5 + Math.min(9, chordComplexity(cur.chord));
          vt.rot += Math.PI / 7; // each change nudges rotation
          vt.bloom = 1;
        }
        // section
        const sec = sectionsRef.current.find((s) => t >= s.start && t < s.end);
        const secLabel = sec?.label ?? "";
        if (secLabel !== sectionLabelRef.current) {
          sectionLabelRef.current = secLabel;
          setSectionLabel(secLabel);
          const si = sec ? sectionsRef.current.indexOf(sec) : 0;
          vt.secHue = 30 + ((si + 1) * 47) % 300;
        }
      }

      // ease toward targets
      v.hue += (vt.hue - v.hue) * 0.05;
      v.sat += (vt.sat - v.sat) * 0.05;
      v.petals += (vt.petals - v.petals) * 0.05;
      v.secHue += (vt.secHue - v.secHue) * 0.03;
      v.bloom += (vt.bloom - v.bloom) * 0.06;
      vt.bloom *= 0.96; // bloom pulse decays
      v.rot += (vt.rot - v.rot) * 0.04;

      // background wash (section)
      g.fillStyle = "rgba(5,6,11,0.20)";
      g.fillRect(0, 0, W, H);
      const wash = g.createRadialGradient(cx, cy, unit * 0.1, cx, cy, unit * 0.7);
      wash.addColorStop(0, `hsla(${v.secHue}, 40%, 10%, 0.25)`);
      wash.addColorStop(1, "rgba(5,6,11,0)");
      g.fillStyle = wash;
      g.fillRect(0, 0, W, H);

      // the rose / mandala
      const petals = Math.round(v.petals);
      const R = unit * (0.16 + v.bloom * 0.05);
      g.save();
      g.translate(cx, cy);
      g.rotate(v.rot);
      g.globalCompositeOperation = "lighter";
      for (let layer = 0; layer < 3; layer++) {
        const rr = R * (1 - layer * 0.22);
        const a = (0.10 + v.bloom * 0.10) * (1 - layer * 0.25);
        g.strokeStyle = `hsla(${v.hue + layer * 8}, ${v.sat}%, ${58 - layer * 6}%, ${a})`;
        g.lineWidth = dpr * (1.5 - layer * 0.3);
        g.beginPath();
        const steps = 720;
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * Math.PI * 2;
          const petal = Math.cos(petals * th);
          const rad = rr * (0.55 + 0.45 * Math.abs(petal));
          const x = Math.cos(th) * rad;
          const y = Math.sin(th) * rad;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.restore();

      // soft core
      const core = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.4);
      core.addColorStop(0, `hsla(${v.hue}, ${v.sat}%, 70%, ${0.12 + v.bloom * 0.2})`);
      core.addColorStop(1, `hsla(${v.hue}, ${v.sat}%, 70%, 0)`);
      g.globalCompositeOperation = "source-over";
      g.fillStyle = core;
      g.beginPath();
      g.arc(cx, cy, R * 0.4, 0, Math.PI * 2);
      g.fill();
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#05060b] text-neutral-200">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center gap-1 text-center">
        <div className="text-sm font-light tracking-wide text-amber-100">{title}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500">
          {keyName ? `${keyName} · ` : ""}Karel Barnoski
        </div>
        {phase === "playing" && (
          <>
            <div className="mt-2 text-3xl font-extralight tracking-wide text-amber-50/90">
              {chordLabel || "—"}
            </div>
            {sectionLabel && (
              <div className="text-[11px] italic text-neutral-400">{sectionLabel}</div>
            )}
          </>
        )}
        {phase === "loading" && (
          <div className="mt-2 animate-pulse text-xs uppercase tracking-widest text-neutral-500">loading</div>
        )}
        {phase === "error" && (
          <div className="mt-2 text-xs text-red-400/80">could not load track</div>
        )}
      </div>

      {/* track picker */}
      <div className="absolute inset-x-0 bottom-5 flex justify-center px-4">
        <select
          value={activeId}
          onChange={(e) => void play(e.target.value)}
          className="max-w-[90vw] rounded-full border border-white/15 bg-black/50 px-4 py-2 text-sm text-neutral-200 backdrop-blur-sm focus:border-amber-200/50 focus:outline-none"
        >
          {COLLECTIONS.map((c) => (
            <optgroup key={c.name} label={c.name}>
              {c.tracks.map((t) => (
                <option key={t.id} value={t.id} className="bg-neutral-900">
                  {t.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </main>
  );
}
