"use client";

/**
 * SPATIAL PAIRING sample station (particle upgrade step 1, 2026-10-12).
 * Two live engines side by side, identical in every way but the pairing:
 *   left  NOW — each particle gets a random point of the image (the show build)
 *   right NEW — each particle gets the point on its own side (spatial-pairing.ts)
 * Both start from the same form, then gather into the same emblem, hold, and
 * release. Query: ?e=the-bloom,amboise&from=lissajous,torus
 * Kiosk/dev only (the Vercel deployments have no pack).
 */

import { useEffect, useRef, useState } from "react";
import { createParticleEngine, type ParticleEngine } from "@/lib/particles/particle-engine";
import type { SoulId } from "@/lib/particles/souls";
import { pairOrder, PAIR_GROUPS } from "@/lib/particles/spatial-pairing";
import { formCanvas, uvFor } from "../forms/form-images";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PairingSample() {
  const left = useRef<HTMLCanvasElement>(null);
  const right = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState("loading");

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const emblems = (q.get("e") ?? "the-bloom").split(",");
    const froms = (q.get("from") ?? "lissajous").split(",") as SoulId[];
    const mk = (c: HTMLCanvasElement, pairing: boolean) =>
      createParticleEngine(c, {
        count: 160_000, dpr: 1, transparent: false, gain: 1.7, camScale: 1.35, maxSpeed: 2.2, soul: froms[0], pairing,
      });
    const engines: ParticleEngine[] = [mk(left.current!, false), mk(right.current!, true)];
    for (const e of engines) { e.setGain(1.45); e.start(); }
    let alive = true;
    const say = (s: string) => { setStage(s); (window as unknown as { __pairStage: string }).__pairStage = s; };
    (async () => {
      await wait(4000); // programs warm
      for (let round = 0; ; round++) {
        const from = froms[round % froms.length];
        const name = emblems[round % emblems.length];
        const img = await formCanvas(`/tramokyo-pack/emblems/${name}.jpg`, 512);
        if (!alive || !img) return;
        const uv = uvFor(img, engines[0].imageSampleCount());
        const pair = uv ? pairOrder(uv, PAIR_GROUPS) : undefined;
        say(`form ${from}`);
        for (const e of engines) {
          e.setImageForm(0, 0); e.setSoul(from, 1.5); e.setShape([0.3, 0.5, 0.2, 0.6], true);
          e.setSizeScale(1.6); e.setDensity(0.85); e.setCamScale(1);
        }
        await wait(8000);
        if (!alive) return;
        say(`gather ${name}`);
        for (const e of engines) {
          e.loadFormImage(img, img.width / Math.max(1, img.height), uv, true, pair);
          const lit = Number(q.get("lit") ?? 0.97);
          e.setImageLiteral(lit); e.setImageScale(0.55); e.setImageTint(0); e.setDensity(1); e.setImageForm(lit, 1);
        }
        await wait(8000);
        if (!alive) return;
        say(`release ${name}`);
        for (const e of engines) e.setImageForm(0, 0);
        await wait(5000);
      }
    })();
    return () => { alive = false; for (const e of engines) e.dispose(); };
  }, []);

  const label = "absolute top-3 left-4 text-xs tracking-widest text-white/70 font-mono";
  return (
    <main className="fixed inset-0 bg-black grid grid-cols-2 gap-px">
      <div className="relative"><canvas ref={left} className="w-full h-full block" /><span className={label}>NOW · random pairing</span></div>
      <div className="relative"><canvas ref={right} className="w-full h-full block" /><span className={label}>NEW · spatial pairing</span></div>
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/50 font-mono">{stage}</span>
    </main>
  );
}
