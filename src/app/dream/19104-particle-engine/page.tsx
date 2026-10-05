"use client";

/* ── 19104 · Particle Engine ──────────────────────────────────────────────────
 *
 *  ONE DECISION (Karel, 2026-10-05): do I want this crisp, sound-driven
 *  particle look as the lead visual in journeys, instead of shader-drawn
 *  particles?
 *
 *  Default = the SHOWCASE (showcase.tsx): pure black, tap once, Karel's
 *  "Rebound" plays and the field flows through four souls with small
 *  captions; once per cycle (or 'C') the screen splits 50/50 against
 *  today's shader lead (galaxy-seed) on the same audio.
 *  ?lab=1 = the original lab UI (lab.tsx): souls, density, take picker,
 *  live readouts, ImmersiveHud.
 *
 *  Engine: src/lib/particles/ · Probe: window.__resonanceParticles
 * ──────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { LabView } from "./lab";
import { ShowcaseView } from "./showcase";

export default function ParticleEnginePage() {
  // resolved after mount (no hydration mismatch); black until then
  const [mode, setMode] = useState<"pending" | "lab" | "show">("pending");
  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).get("lab") === "1" ? "lab" : "show");
  }, []);
  if (mode === "pending") return <main className="fixed inset-0 z-[60] bg-black" />;
  return mode === "lab" ? <LabView /> : <ShowcaseView />;
}
