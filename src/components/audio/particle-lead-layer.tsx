"use client";

/**
 * ParticleLeadLayer — the GPU particle engine as a journey's lead actor
 * (opt-in per journey: src/lib/journeys/particle-lead.ts). Renders nothing
 * — and costs nothing — for every journey that isn't cast.
 *
 * Compositing: a transparent WebGL2 canvas (black = see-through) blended
 * `plus-lighter` (additive) above the imagery/parallax and the shader stack,
 * below post-processing. Its opacity rides --shader-opacity so the intro /
 * outro choreography that fades shaders fades the lead with them.
 *
 * Audio: reads the SAME analyser node the shader stack reads (passed down
 * through JourneyCompositor), with the kinetic EQ's own band split (bins
 * 0-5 / 6-30 / 31-63) and BAND_PROFILES time-dilation ranges — one
 * analyser, one band definition for shaders and particles alike.
 *
 * Perf (device tier): high 262k @ DPR ≤1.5 · medium 131k @ DPR ≤1.25 ·
 * low 65k @ DPR 1, no trails. While it leads, the caller strips the
 * dual/tertiary shaders (withParticleLeadSupports) — one supporting shader.
 *
 * World element: when the cast carries an `arc` (Lantern), soul + density
 * follow the track's own timeline (useAudioStore currentTime) — sparse motes
 * in the quiet, a swarm on builds, a cosmic swirl at the summit, one ember
 * at the end.
 *
 * Image dissolve ↔ reform: when a new still enters the collage (imageSrc),
 * the field becomes the outgoing still, breaks into a music-driven swirl and
 * reassembles into the incoming one (engine.dissolveTo) — gated by
 * dissolveAllowed(): never during a travel morph / handoff / phase change,
 * never at the summit, spaced ≥18 s.
 *
 * Probe: window.__resonanceParticleLead (journey, soul, density, dissolve,
 * fps, count, bands).
 */
import { useEffect, useRef, useState } from "react";
import type { AnalyserLike } from "@/lib/audio/audio-engine";
import { useAudioStore } from "@/lib/audio/audio-store";
import { isVideoActive, inBoundarySettle } from "@/lib/journeys/video-activity";
import { getDeviceTier } from "@/lib/audio/device-tier";
import { createParticleEngine, type ParticleEngine } from "@/lib/particles/particle-engine";
import { SpectrumProcessor } from "@/lib/particles/spectrum";
import { lerpPalette, type ParticlePalette } from "@/lib/particles/souls";
import { arcAt, dissolveAllowed, particlePaletteFrom, soulForPhase, type ParticleLeadCast } from "@/lib/journeys/particle-lead";
import type { JourneyFrame } from "@/lib/journeys/types";

const TIER_BUDGET = {
  // Measured headless on the kiosk's M4 Pro, Lantern in pack mode (journey
  // alone, 3 shaders: 99 fps): 410k @ DPR 2 → 65 fps · 410k @ 1.5 → 74 ·
  // 262k @ 1.5 → 109 fps, p95 16.7 ms (one supporting shader). DPR matches
  // the shader stack's 1.5× ceiling (visualizer.tsx).
  high: { count: 262_144, dpr: 1.5, trailScale: 1 },
  medium: { count: 131_072, dpr: 1.25, trailScale: 1 },
  low: { count: 65_536, dpr: 1, trailScale: 0 },
} as const;

export function ParticleLeadLayer({
  cast,
  journeyId,
  frame,
  analyser,
  imageSrc = null,
  paused = false,
}: {
  cast: ParticleLeadCast;
  journeyId: string;
  frame: JourneyFrame | null;
  analyser: AnalyserLike | null;
  /** The still that just entered the collage (dissolve trigger). */
  imageSrc?: string | null;
  paused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const analyserRef = useRef<AnalyserLike | null>(analyser);
  const pausedRef = useRef(paused);
  const paletteTarget = useRef<ParticlePalette | null>(null);
  const [failed, setFailed] = useState(false);
  analyserRef.current = analyser;
  pausedRef.current = paused;

  const phaseSoul = soulForPhase(cast, frame?.phase);
  const phaseRef = useRef<{ phase: string | undefined; at: number }>({ phase: undefined, at: 0 });
  if (frame?.phase !== phaseRef.current.phase) phaseRef.current = { phase: frame?.phase, at: performance.now() };
  const densityRef = useRef(1);
  const lastDissolveRef = useRef(-1e9);
  const pal = frame?.palette;
  const palKey = pal ? `${pal.primary}${pal.accent}${pal.glow}` : "";

  // engine lifecycle — one per journey
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tier = getDeviceTier();
    const budget = TIER_BUDGET[tier] ?? TIER_BUDGET.medium;
    const proc = new SpectrumProcessor({ bins: 96, source: "kinetic" });
    let bytes = new Uint8Array(128);
    let engine: ParticleEngine;
    try {
      engine = createParticleEngine(canvas, {
        count: budget.count,
        dpr: budget.dpr,
        trailScale: budget.trailScale,
        transparent: true,
        gain: cast.gain ?? 1,
        soul: cast.arc ? arcAt(cast.arc, 0).soul : soulForPhase(cast, null),
        onContextLost: () => setFailed(true),
        audio: (dt) => {
          const a = analyserRef.current;
          if (!a || pausedRef.current) {
            proc.ingestBytes(null);
          } else {
            if (bytes.length !== a.frequencyBinCount) bytes = new Uint8Array(a.frequencyBinCount);
            try {
              a.getByteFrequencyData(bytes as Uint8Array<ArrayBuffer>);
              proc.ingestBytes(bytes);
            } catch {
              proc.ingestBytes(null);
            }
          }
          proc.step(dt);
          return proc.frame();
        },
      });
    } catch {
      setFailed(true); // no WebGL2 float targets — the journey plays without its lead
      return;
    }
    engineRef.current = engine;
    engine.start();
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    // palette glides toward the phase palette (never snaps at a boundary)
    let current: ParticlePalette | null = null;
    let arcSoul: string | null = null;
    const iv = window.setInterval(() => {
      // world-element arc on the track's own clock
      if (cast.arc) {
        const { currentTime } = useAudioStore.getState();
        const a = arcAt(cast.arc, currentTime || 0);
        densityRef.current = a.density;
        engine.setDensity(a.density);
        if (a.soul !== arcSoul) {
          engine.setSoul(a.soul, arcSoul === null ? 0.5 : 8);
          arcSoul = a.soul;
        }
      }
      const target = paletteTarget.current;
      if (target) {
        current = current ? lerpPalette(current, target, 0.06) : target;
        engine.setPalette(current);
      }
      const st = engine.stats();
      (window as unknown as Record<string, unknown>).__resonanceParticleLead = {
        journeyId,
        name: cast.name,
        soul: st.soul,
        transition: st.transition,
        fps: st.fps,
        fpsLow: st.fpsLow,
        count: st.count,
        dpr: st.dpr,
        tier,
        density: st.density,
        dissolve: st.dissolve,
        dissolves: dissolveCount.current,
        stills: stillsSeen.current,
        gate: lastGate.current,
        gateIn: gateInRef.current,
        bands: st.bands,
        bandLevels: st.bandLevels,
        swell: st.swell,
        meanLum: st.meanLum,
        maxLumStep: st.maxLumStep,
        state: st.state,
        t: Date.now(),
      };
    }, 100);

    return () => {
      window.clearInterval(iv);
      window.removeEventListener("resize", onResize);
      engine.dispose();
      engineRef.current = null;
      delete (window as unknown as Record<string, unknown>).__resonanceParticleLead;
    };
  }, [cast, journeyId]);

  // soul follows the phase arc (8 s flow, never a cut) — unless a timeline arc drives it
  useEffect(() => {
    if (!cast.arc) engineRef.current?.setSoul(phaseSoul, 8);
  }, [phaseSoul, cast.arc]);

  // image dissolve ↔ reform on each new still (gated for restraint)
  const dissolveCount = useRef(0);
  const stillsSeen = useRef(0);
  const lastGate = useRef("");
  const gateInRef = useRef<unknown>(null);
  useEffect(() => {
    if (!cast.dissolve || !imageSrc) return;
    stillsSeen.current++;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img
      .decode()
      .then(() => {
        const engine = engineRef.current;
        if (cancelled || !engine || !img.naturalWidth) return;
        // small sample canvas: the stills only colour ~400k motes, and a
        // tiny upload never stalls the frame
        const w = 384;
        const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const c2 = cv.getContext("2d");
        if (!c2) return;
        c2.drawImage(img, 0, 0, w, h);
        const { currentTime, duration } = useAudioStore.getState();
        const now = performance.now();
        const gateIn = {
          t: currentTime || 0,
          duration: duration || 0,
          density: densityRef.current,
          sinceLastDissolve: (now - lastDissolveRef.current) / 1000,
          sincePhaseChange: (now - phaseRef.current.at) / 1000,
          morphActive: isVideoActive(),
          boundarySettle: inBoundarySettle(),
        };
        const ok = dissolveAllowed(gateIn);
        gateInRef.current = gateIn;
        lastGate.current = ok ? "open" : isVideoActive() ? "morph" : inBoundarySettle() ? "settle" : "restraint";
        if (engine.dissolveTo(cv, img.naturalWidth / img.naturalHeight, ok)) {
          lastDissolveRef.current = now;
          dissolveCount.current++;
        }
      })
      .catch(() => {
        /* a still that can't be sampled just doesn't dissolve */
      });
    return () => {
      cancelled = true;
    };
  }, [imageSrc, cast.dissolve]);

  // palette target follows the phase palette
  useEffect(() => {
    paletteTarget.current = particlePaletteFrom(pal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palKey]);

  if (failed) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 2,
        pointerEvents: "none",
        mixBlendMode: "plus-lighter",
        opacity: "var(--shader-opacity, 1)" as unknown as number,
      }}
    />
  );
}
