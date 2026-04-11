"use client";

import { useEffect, useRef, useMemo } from "react";
import { AiImageLayer } from "./ai-image-layer";
import { PostProcessingLayer } from "./post-processing-layer";
import { FlashAngel } from "./flash-angel";
import type { JourneyFrame } from "@/lib/journeys/types";
import { getEffectScale, getBloomScale } from "@/lib/journeys/adaptive-engine";

interface JourneyCompositorProps {
  frame: JourneyFrame | null;
  audioAmplitude: number;
  audioBass: number;
  aiEnabled: boolean;
  /** AI prompt override (for non-journey AI usage) */
  aiPrompt?: string;
  /** When true, AI images are the sole visual (no shader underneath) */
  aiOnly?: boolean;
  /** When false, stop generating new AI images (existing stay visible) */
  aiGenerating?: boolean;
  /** Optional seed for deterministic AI prompt variation (shared playback) */
  promptSeed?: number;
  /** Stable journey identifier — only purge AI images when this changes */
  journeyId?: string;
  /** Opt-in: enable bass-hit white flash + pre-activation glow (Ghost only) */
  enableBassFlash?: boolean;
  children: React.ReactNode;
}

/**
 * Composites shader, AI imagery, and post-processing.
 *
 * Intro: AI imagery appears full-screen first, then shaders fade in on top.
 * Outro: When song ends, AI imagery stays visible as shaders fade naturally.
 *
 * Z-index stack (all layers share the same stacking context):
 *   Shader canvas: default (from children) — fades in via --shader-opacity
 *   AI images: z-index 2, pointer-events none
 *   Post-processing: z-index 3, pointer-events none
 *   Control bar: z-index 10 (set inside VisualizerCore)
 *   Mode palette: z-index 30-40 (set inside VisualizerCore)
 *   Poetry: z-index 5, pointer-events none
 *
 * Shader opacity is controlled via the --shader-opacity CSS custom property
 * instead of wrapping children in an opacity div. This avoids creating a
 * stacking context that would trap the bottom bar below the AI layer.
 * VisualizerCore's shader layers consume var(--shader-opacity, 1).
 */
export function JourneyCompositor({
  frame,
  audioAmplitude,
  audioBass,
  aiEnabled,
  aiPrompt,
  aiOnly = false,
  aiGenerating = true,
  promptSeed,
  journeyId,
  enableBassFlash = false,
  children,
}: JourneyCompositorProps) {
  const effectivePrompt = frame?.aiPrompt ?? aiPrompt ?? "";
  const effectiveDenoising = frame?.denoisingStrength ?? 0.5;
  const effectiveTargetFps = frame?.targetFps ?? 2;
  const showAi = aiEnabled && !!effectivePrompt;

  // Detect light-background phases from prompt — scale down GPU-expensive effects
  // Binary detection (target), but we smooth the actual multiplier to prevent flash
  const isLightPhaseTarget = useMemo(
    () => /WHITE BACKGROUND|PALE BACKGROUND|LIGHT BACKGROUND/i.test(effectivePrompt),
    [effectivePrompt]
  );

  // Smooth light-phase multiplier: 1.0 = normal dark, 0.0 = full light-bg reduction.
  // Ref-only — no React state. The compositor already re-renders at ~30fps from frame
  // updates, so the ref value is sampled naturally without extra re-renders.
  const lightScaleRef = useRef(isLightPhaseTarget ? 0 : 1);
  const lightScaleRafRef = useRef<number>(0);

  useEffect(() => {
    const target = isLightPhaseTarget ? 0 : 1;
    if (Math.abs(lightScaleRef.current - target) < 0.01) {
      lightScaleRef.current = target;
      return;
    }
    cancelAnimationFrame(lightScaleRafRef.current);
    const rate = 0.008; // ~125 frames ≈ 2s at 60fps
    const animate = () => {
      const cur = lightScaleRef.current;
      const diff = target - cur;
      lightScaleRef.current = Math.abs(diff) < 0.01 ? target : cur + Math.sign(diff) * rate;
      if (lightScaleRef.current !== target) {
        lightScaleRafRef.current = requestAnimationFrame(animate);
      }
    };
    lightScaleRafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(lightScaleRafRef.current);
  }, [isLightPhaseTarget]);

  // Read ref value during render — sampled at ~30fps from journey frame updates
  const lightScale = lightScaleRef.current;

  const effectiveShaderOpacity = frame?.shaderOpacity ?? 1.0;
  const isMobile = useMemo(
    () => typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent),
    []
  );

  // Adaptive scaling — learned from user feedback patterns
  const adaptiveConditions = {
    hasDualShader: !!frame?.dualShaderMode,
    isLightBg: lightScale < 0.5,
    isMobile,
    bloom: frame?.bloomIntensity ?? 0,
    shader: frame?.shaderMode,
    dualShader: frame?.dualShaderMode,
  };
  const adaptiveScale = getEffectScale(adaptiveConditions);
  const adaptiveBloom = getBloomScale(adaptiveConditions);

  // Per-type event impulse reactions
  const impulse = frame?.eventImpulse ?? 0;
  const evtType = frame?.eventType ?? null;
  // Pre-activation ramp — builds ~1.5s before bass hit (0→1)
  const approach = frame?.eventApproach ?? 0;

  // Bass hit counter — alternates angel design between the two flash points
  const bassHitCountRef = useRef(0);
  const inBassHitRef = useRef(false);
  if (enableBassFlash && impulse > 0.5 && evtType === "bass_hit" && !inBassHitRef.current) {
    bassHitCountRef.current += 1;
    inBassHitRef.current = true;
  }
  if (impulse <= 0.1 || evtType !== "bass_hit") {
    inBassHitRef.current = false;
  }

  const eventReaction = useMemo(() => {
    if (impulse === 0 || !evtType) {
      return { bloom: 0, chromatic: 0, vignetteOpen: 0, halation: 0 };
    }
    switch (evtType) {
      case "bass_hit":
        // MASSIVE subsonic reverberation — only on journeys with enableBassFlash
        if (!enableBassFlash) return { bloom: 0, chromatic: 0, vignetteOpen: 0, halation: 0 };
        return { bloom: impulse * 4.0, chromatic: impulse * 0.60, vignetteOpen: impulse * 0.80, halation: impulse * 0.50 };
      case "texture_change":
        return { bloom: impulse * 0.20, chromatic: 0, vignetteOpen: 0, halation: impulse * 0.15 };
      case "climax":
        return { bloom: impulse * 1.00, chromatic: impulse * 0.25, vignetteOpen: impulse * 0.50, halation: impulse * 0.20 };
      case "drop":
        return { bloom: impulse * -0.50, chromatic: impulse * 0.10, vignetteOpen: impulse * -0.30, halation: 0 };
      case "silence":
        return { bloom: impulse * -0.80, chromatic: 0, vignetteOpen: impulse * -0.60, halation: 0 };
      case "new_idea":
        return { bloom: impulse * 0.40, chromatic: impulse * 0.10, vignetteOpen: impulse * 0.20, halation: 0 };
      default:
        return { bloom: impulse * 0.60, chromatic: impulse * 0.15, vignetteOpen: impulse * -0.30, halation: 0 };
    }
  }, [impulse, evtType, enableBassFlash]);

  // ─── Shader opacity ───
  // Tracks effectiveShaderOpacity via CSS custom property.
  // On journey start (first frame after null), ramps from 1.0 to target over ~1.5s
  // to prevent a brightness flash from additive layers arriving asynchronously.
  const shaderOpacityRef = useRef(effectiveShaderOpacity);
  const rootRef = useRef<HTMLDivElement>(null);
  const introRampRafRef = useRef<number>(0);
  const wasDefaultOpacityRef = useRef(true); // true when no journey frame

  useEffect(() => {
    const prev = shaderOpacityRef.current;
    shaderOpacityRef.current = effectiveShaderOpacity;

    // Detect journey start: opacity drops from 1.0 (no frame) to journey value
    const isJourneyStart = wasDefaultOpacityRef.current && effectiveShaderOpacity < 1.0;
    wasDefaultOpacityRef.current = effectiveShaderOpacity >= 1.0;

    if (isJourneyStart && rootRef.current) {
      // Ramp from current (1.0) to target over ~1.5s using exponential ease
      cancelAnimationFrame(introRampRafRef.current);
      let current = prev;
      const ramp = () => {
        const target = shaderOpacityRef.current;
        current += (target - current) * 0.04;
        if (Math.abs(current - target) < 0.005) {
          current = target;
          introRampRafRef.current = 0;
        }
        rootRef.current?.style.setProperty("--shader-opacity", String(current));
        if (current !== target) {
          introRampRafRef.current = requestAnimationFrame(ramp);
        }
      };
      introRampRafRef.current = requestAnimationFrame(ramp);
      return () => {
        cancelAnimationFrame(introRampRafRef.current);
        introRampRafRef.current = 0;
      };
    }

    // Normal update — set directly (skip if intro ramp is active)
    if (!introRampRafRef.current && rootRef.current) {
      rootRef.current.style.setProperty("--shader-opacity", String(effectiveShaderOpacity));
    }
  }, [effectiveShaderOpacity]);

  // Pre-activation + bass hit shader boost (Ghost-only, gated by enableBassFlash).
  // Approach ramp: shaders get brighter ~1.5s before the hit.
  // On hit: spike to max then settle back fast.
  useEffect(() => {
    if (!rootRef.current || !enableBassFlash) return;
    if (approach > 0 && impulse <= 0) {
      // Building up — ramp shader opacity toward 1.0
      const ramped = Math.min(1.0, shaderOpacityRef.current + approach * approach * 0.6);
      rootRef.current.style.setProperty("--shader-opacity", String(ramped));
      return;
    }
    if (impulse > 0 && evtType === "bass_hit") {
      // Hit! Spike to max so shaders flash with the white overlay
      rootRef.current.style.setProperty("--shader-opacity", "1");
      const timer = setTimeout(() => {
        if (rootRef.current) {
          rootRef.current.style.setProperty("--shader-opacity", String(shaderOpacityRef.current));
        }
      }, 150);
      return () => clearTimeout(timer);
    }
    // Neither approaching nor firing — restore normal
    if (approach <= 0 && impulse <= 0 && rootRef.current) {
      rootRef.current.style.setProperty("--shader-opacity", String(shaderOpacityRef.current));
    }
  }, [approach, impulse, evtType, enableBassFlash]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
    >
      {/* AI imagery — z-2, above shader but below controls */}
      {showAi && (
        <AiImageLayer
          prompt={effectivePrompt}
          denoisingStrength={effectiveDenoising}
          targetFps={effectiveTargetFps}
          audioAmplitude={audioAmplitude}
          audioBass={audioBass}
          enabled={true}
          aiOnly={aiOnly}
          generating={aiGenerating}
          shaderOpacity={effectiveShaderOpacity}
          promptSeed={promptSeed}
          journeyId={journeyId}
        />
      )}

      {/* Pre-activation glow — bloom buildup before bass hit (Ghost only) */}
      {enableBassFlash && approach > 0.1 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            pointerEvents: "none",
            background: `radial-gradient(ellipse at center, rgba(200,220,255,${approach * approach * 0.25}) 0%, transparent 60%)`,
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* Bass hit full-screen flash — Ghost only, gated by enableBassFlash */}
      {enableBassFlash && impulse > 0 && evtType === "bass_hit" && (
        <>
          {/* Full-screen white flash — impulse⁴ decays FAST (bright→gone in <0.5s) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 4,
              pointerEvents: "none",
              backgroundColor: `rgba(255, 255, 255, ${Math.min(1, impulse * impulse * impulse * impulse * 0.95)})`,
            }}
          />
          {/* Dark particle angel — full opacity during hold, linear fade over 1s */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 5,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: impulse,
              filter: `blur(${(1 - impulse) * 1.5}px)`,
            }}
          >
            <FlashAngel variant={(bassHitCountRef.current % 2) as 0 | 1} />
          </div>
          {/* Subsonic shockwave ring expanding outward beneath the flash */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 3,
              pointerEvents: "none",
              background: `radial-gradient(ellipse at center, transparent ${(1 - impulse) * 30}%, rgba(200,220,255,${impulse * impulse * 0.35}) ${(1 - impulse) * 50 + 20}%, transparent ${(1 - impulse) * 70 + 30}%)`,
              transform: `scale(${1 + (1 - impulse) * 0.5})`,
              mixBlendMode: "screen",
            }}
          />
        </>
      )}

      {/* Post-processing — adaptive scaling from feedback + smooth light-phase reduction + typed event reactions */}
      {/* lightScale: 1.0 = dark bg (full effects), 0.0 = light bg (reduced).
          lerp(reducedValue, fullValue, lightScale) for each property. */}
      {frame && (
        <PostProcessingLayer
          chromaticAberration={frame.chromaticAberration * adaptiveScale + eventReaction.chromatic}
          vignette={(frame.vignette * (0.3 + 0.7 * lightScale)) * adaptiveScale * Math.max(0, 1 - eventReaction.vignetteOpen)}
          bloomIntensity={Math.min(1.5, (frame.bloomIntensity * (0.2 + 0.8 * lightScale)) * adaptiveScale * adaptiveBloom + eventReaction.bloom * 0.3 + approach * approach * 0.4)}
          audioAmplitude={audioAmplitude}
          filmGrain={0}
          particleDensity={(frame.particleDensity * (0.3 + 0.7 * lightScale)) * adaptiveScale}
          halation={Math.min(0.8, (frame.halation * lightScale) * adaptiveScale + eventReaction.halation)}
          palette={frame.palette}
        />
      )}

      {/* Children rendered directly — no opacity wrapper.
          Shader layers in VisualizerCore read var(--shader-opacity, 1).
          Bottom bar (z-10) stays at full opacity in the normal stacking context. */}
      {children}
    </div>
  );
}
