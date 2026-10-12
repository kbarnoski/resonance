"use client";

/**
 * NEW PARTICLE FORMS — sample station (particle expansion, batch 1, 2026-10-12).
 * Four live engines, one new form each, driven by a gentle synthetic 92 bpm
 * beat (bass punch, mid swell, treble shimmer) so the music response shows.
 * Nothing here is in the show until Karel approves it. ?s=aurora,attractor,starburst,smokering
 * Kiosk/dev only.
 */

import { useEffect, useRef } from "react";
import { createParticleEngine, type ParticleEngine } from "@/lib/particles/particle-engine";
import type { SpectrumFrame } from "@/lib/particles/spectrum";
import type { SoulId } from "@/lib/particles/souls";

const TITLE: Record<string, string> = { aurora: "Aurora", attractor: "Strange Attractor", starburst: "Starburst", smokering: "Smoke Rings" };

const BINS = 128;
function syntheticBeat(): (dt: number) => SpectrumFrame {
  const levels = new Float32Array(BINS), drive = new Float32Array(BINS);
  let t = 0, onsets = 0, lastBeat = -1;
  const clocks = { bass: 0, mid: 0, treble: 0 };
  return (dt) => {
    t += dt;
    const beat = (t * 92) / 60;
    if (Math.floor(beat) !== lastBeat) { lastBeat = Math.floor(beat); onsets++; }
    const kick = Math.exp(-(beat % 1) * 5);
    const swell = 0.5 + 0.5 * Math.sin(t * 0.4);
    const shimmer = 0.3 + 0.3 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
    for (let i = 0; i < BINS; i++) {
      const f = i / BINS;
      const v = f < 0.2 ? 0.25 + 0.65 * kick : f < 0.6 ? 0.25 + 0.4 * swell : 0.15 + 0.35 * shimmer;
      levels[i] = v;
      drive[i] = f < 0.2 ? kick * 0.9 - 0.2 : f < 0.6 ? swell * 0.6 - 0.2 : shimmer - 0.2;
    }
    const rates = { bass: 1 + kick, mid: 1 + swell * 0.4, treble: 1 + shimmer };
    clocks.bass += dt * rates.bass; clocks.mid += dt * rates.mid; clocks.treble += dt * rates.treble;
    return { bins: BINS, levels, drive, bands: { bass: kick * 0.9 - 0.2, mid: swell * 0.6 - 0.2, treble: shimmer - 0.2 }, bandLevels: { bass: 0.25 + 0.65 * kick, mid: 0.25 + 0.4 * swell, treble: 0.15 + 0.35 * shimmer }, swell: kick, onsets, clocks: { ...clocks }, rates };
  };
}

export default function NewForms() {
  const refs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const souls = ((typeof location !== "undefined" ? new URLSearchParams(location.search).get("s") : null)?.split(",") ?? ["aurora", "attractor", "starburst", "smokering"]).slice(0, 4);
  useEffect(() => {
    const engines: ParticleEngine[] = [];
    souls.forEach((soul, i) => {
      const c = refs[i].current;
      if (!c) return;
      const e = createParticleEngine(c, { count: 160_000, dpr: 1, transparent: false, gain: 1.7, camScale: 1.35, maxSpeed: 2.2, soul: soul as SoulId, audio: syntheticBeat() });
      e.setGain(1.45); e.setDensity(0.85); e.setReact(2.64); e.start();
      engines.push(e);
    });
    return () => { for (const e of engines) e.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <main className="fixed inset-0 bg-black grid grid-cols-2 grid-rows-2 gap-px">
      {souls.map((s, i) => (
        <div key={s} className="relative">
          <canvas ref={refs[i]} className="w-full h-full block" />
          <span className="absolute top-3 left-4 text-sm tracking-widest text-white/80 font-mono">{i + 1} · {TITLE[s] ?? s}</span>
        </div>
      ))}
    </main>
  );
}
