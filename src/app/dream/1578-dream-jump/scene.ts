// scene.ts — deterministic generator for one hypnagogic "dream room".
//
// A scene is a full-viewport arrangement of pure DOM/CSS elements: angled
// gradient walls (clip-path trapezoids), a receding floor plane, crossing
// shafts of light, floating radial light-orbs, one faceted conic prism, and a
// faint ruled lattice for architectural structure. It is deliberately NOT a
// radial mandala and NOT a log-polar tunnel — it reads as a cubist, ecstatic
// room you have been teleported into. Everything is derived from a single seed
// via mulberry32 so the same seed always paints the same room.

import type { CSSProperties } from "react";
import { mulberry32 } from "./random";

export interface DreamLayer {
  key: string;
  outer: CSSProperties; // placement (position / transform / clip)
  inner: CSSProperties; // paint (gradient / blend / blur) + slow drift
  animClass: string; // which drift keyframe the inner layer runs
}

export interface DreamScene {
  seed: number;
  rootHz: number; // audio root the drone re-tunes to
  hue: number; // dominant violet hue (for chrome accents if needed)
  bg: string; // container background gradient
  layers: DreamLayer[];
}

// Low, warm roots — a loose just-intonation-friendly set (Hz).
const ROOTS = [98.0, 110.0, 130.81, 146.83, 164.81, 196.0];
const ANIM = ["dj-a", "dj-b", "dj-c"];

export function makeScene(seed: number): DreamScene {
  const rnd = mulberry32(seed >>> 0);
  const rand = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  // Palette family: violet -> magenta -> cyan accent.
  const hueV = 255 + rnd() * 55; // 255..310  (violet / magenta)
  const hueM = hueV + 18 + rnd() * 34; // pink / magenta side
  const hueC = 184 + rnd() * 26; // 184..210 (cyan accent)
  const hues = [hueV, hueM, hueC];

  const bg =
    `radial-gradient(130% 120% at ${rand(20, 80).toFixed(1)}% ${rand(12, 62).toFixed(1)}%, ` +
    `hsl(${hueV.toFixed(0)} 74% 16% / 0.96), ` +
    `hsl(${hueM.toFixed(0)} 60% 7% / 0.98) 52%, ` +
    `hsl(${hueV.toFixed(0)} 55% 3%) 100%)`;

  const layers: DreamLayer[] = [];
  let idx = 0;

  const add = (outer: CSSProperties, inner: CSSProperties) => {
    const merged: CSSProperties = {
      position: "absolute",
      inset: 0,
      animationDelay: `${(-rand(0, 12)).toFixed(1)}s`,
      ...inner,
    };
    // custom property for per-layer drift duration
    (merged as Record<string, string | number>)["--dur"] =
      `${rand(16, 30).toFixed(1)}s`;
    layers.push({
      key: `s${(seed >>> 0).toString(16)}-l${idx}`,
      outer: { position: "absolute", ...outer },
      inner: merged,
      animClass: pick(ANIM),
    });
    idx++;
  };

  // Two angled "walls" — trapezoids anchored to left and right edges.
  for (let w = 0; w < 2; w++) {
    const left = w === 0;
    const h = pick(hues);
    add(
      { inset: 0 },
      {
        background: `linear-gradient(${rand(60, 120).toFixed(0)}deg, hsl(${h.toFixed(0)} 88% ${rand(46, 62).toFixed(0)}% / ${rand(0.4, 0.62).toFixed(2)}), transparent 72%)`,
        clipPath: left
          ? `polygon(0 0, ${rand(34, 52).toFixed(0)}% 0, ${rand(18, 34).toFixed(0)}% 100%, 0 100%)`
          : `polygon(100% 0, ${rand(48, 66).toFixed(0)}% 0, ${rand(66, 82).toFixed(0)}% 100%, 100% 100%)`,
        mixBlendMode: "screen",
        filter: `blur(${rand(2, 9).toFixed(1)}px)`,
      },
    );
  }

  // A receding floor / horizon plane.
  {
    const h = pick(hues);
    add(
      { left: 0, right: 0, bottom: 0, top: `${rand(52, 68).toFixed(0)}%` },
      {
        inset: "auto",
        background: `linear-gradient(180deg, transparent, hsl(${h.toFixed(0)} 80% ${rand(40, 55).toFixed(0)}% / 0.5))`,
        clipPath: `polygon(${rand(20, 34).toFixed(0)}% 0, ${rand(66, 80).toFixed(0)}% 0, 100% 100%, 0 100%)`,
        mixBlendMode: "screen",
        filter: `blur(${rand(3, 10).toFixed(1)}px)`,
      },
    );
  }

  // Crossing shafts of light.
  const shafts = 3 + Math.floor(rnd() * 3); // 3..5
  for (let s = 0; s < shafts; s++) {
    const ang = rand(0, 180);
    const h = pick(hues);
    add(
      {
        left: "50%",
        top: "50%",
        width: "230vmax",
        height: `${rand(3, 12).toFixed(1)}vmin`,
        transform: `translate(-50%,-50%) rotate(${ang.toFixed(1)}deg) translateY(${rand(-42, 42).toFixed(1)}vmin)`,
        transformOrigin: "center",
      },
      {
        background: `linear-gradient(90deg, transparent, hsl(${h.toFixed(0)} 95% 66% / ${rand(0.25, 0.55).toFixed(2)}) 50%, transparent)`,
        mixBlendMode: "plus-lighter",
        filter: `blur(${rand(1, 5).toFixed(1)}px)`,
      },
    );
  }

  // Floating light-orbs, alternating cyan accents.
  const orbs = 2 + Math.floor(rnd() * 3); // 2..4
  for (let o = 0; o < orbs; o++) {
    const size = rand(24, 58);
    const h = o % 2 === 0 ? hueC : pick(hues);
    add(
      {
        left: `${rand(8, 82).toFixed(1)}%`,
        top: `${rand(8, 74).toFixed(1)}%`,
        width: `${size.toFixed(1)}vmin`,
        height: `${size.toFixed(1)}vmin`,
      },
      {
        borderRadius: "50%",
        background: `radial-gradient(circle at 50% 45%, hsl(${h.toFixed(0)} 96% 72% / ${rand(0.5, 0.8).toFixed(2)}), hsl(${h.toFixed(0)} 90% 50% / 0.15) 55%, transparent 72%)`,
        mixBlendMode: "screen",
        filter: `blur(${rand(2, 12).toFixed(1)}px)`,
      },
    );
  }

  // One faceted conic prism — a hard-edged kaleidoscopic shard (not a mandala).
  {
    const h = pick(hues);
    add(
      {
        left: `${rand(30, 70).toFixed(1)}%`,
        top: `${rand(28, 62).toFixed(1)}%`,
        width: `${rand(40, 80).toFixed(1)}vmin`,
        height: `${rand(40, 80).toFixed(1)}vmin`,
        transform: `translate(-50%,-50%) rotate(${rand(0, 360).toFixed(1)}deg)`,
      },
      {
        clipPath: "polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%)",
        background: `conic-gradient(from ${rand(0, 360).toFixed(0)}deg at 50% 50%, hsl(${h.toFixed(0)} 90% 60% / .55), hsl(${hueC.toFixed(0)} 90% 60% / .5), hsl(${hueM.toFixed(0)} 90% 62% / .55), hsl(${h.toFixed(0)} 90% 60% / .55))`,
        mixBlendMode: "color-dodge",
        filter: `blur(${rand(0.5, 3).toFixed(1)}px)`,
        opacity: 0.7,
      },
    );
  }

  // Faint ruled lattice — architectural structure across the room.
  {
    add(
      { inset: "-20%", transform: `rotate(${rand(-24, 24).toFixed(1)}deg)` },
      {
        inset: 0,
        background: `repeating-linear-gradient(${rand(0, 180).toFixed(0)}deg, hsl(${hueC.toFixed(0)} 80% 60% / 0.06) 0 2px, transparent 2px ${rand(26, 60).toFixed(0)}px)`,
        mixBlendMode: "overlay",
        opacity: 0.5,
      },
    );
  }

  return { seed: seed >>> 0, rootHz: pick(ROOTS), hue: hueV, bg, layers };
}
