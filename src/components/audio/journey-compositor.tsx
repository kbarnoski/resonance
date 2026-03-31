"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AiImageLayer } from "./ai-image-layer";
import { PostProcessingLayer } from "./post-processing-layer";
import type { JourneyFrame } from "@/lib/journeys/types";

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
  children,
}: JourneyCompositorProps) {
  const effectivePrompt = frame?.aiPrompt ?? aiPrompt ?? "";
  const effectiveDenoising = frame?.denoisingStrength ?? 0.5;
  const effectiveTargetFps = frame?.targetFps ?? 2;
  const effectiveShaderOpacity = frame?.shaderOpacity ?? 1.0;
  const showAi = aiEnabled && !!effectivePrompt;

  // Intro gating: shaders start hidden, fade in after first AI image arrives.
  // This creates a clean intro where the user sees imagery first, then the
  // shader blends in on top — never bare shaders without imagery.
  const [aiReady, setAiReady] = useState(false);
  const shaderOpacityRef = useRef(0);
  const shaderFadeRef = useRef<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleFirstImage = useCallback(() => {
    setAiReady(true);
  }, []);

  // Reset when AI is disabled (journey ends)
  useEffect(() => {
    if (!aiEnabled) {
      setAiReady(false);
      shaderOpacityRef.current = 0;
      if (rootRef.current) {
        rootRef.current.style.setProperty("--shader-opacity", "1");
      }
    }
  }, [aiEnabled]);

  // Animate shader fade-in after first AI image.
  // Sets --shader-opacity CSS variable so shader layers fade without
  // creating a stacking context that would trap the bottom bar.
  useEffect(() => {
    if (!aiReady || !showAi) return;
    cancelAnimationFrame(shaderFadeRef.current);

    const target = effectiveShaderOpacity;
    const fadeIn = () => {
      // Fade in over ~3s, capped at the journey's shaderOpacity
      shaderOpacityRef.current = Math.min(target, shaderOpacityRef.current + 0.006);
      if (rootRef.current) {
        rootRef.current.style.setProperty("--shader-opacity", String(shaderOpacityRef.current));
      }
      if (shaderOpacityRef.current < target) {
        shaderFadeRef.current = requestAnimationFrame(fadeIn);
      }
    };
    shaderFadeRef.current = requestAnimationFrame(fadeIn);

    return () => cancelAnimationFrame(shaderFadeRef.current);
  }, [aiReady, showAi, effectiveShaderOpacity]);

  if (!showAi && !frame) {
    return <>{children}</>;
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={showAi ? { "--shader-opacity": "0" } as React.CSSProperties : undefined}
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
          onFirstImage={handleFirstImage}
          promptSeed={promptSeed}
        />
      )}

      {/* Post-processing — z-3, above AI but below controls */}
      {frame && (
        <PostProcessingLayer
          chromaticAberration={frame.chromaticAberration}
          vignette={frame.vignette}
          bloomIntensity={frame.bloomIntensity}
          audioAmplitude={audioAmplitude}
          filmGrain={frame.filmGrain}
          particleDensity={frame.particleDensity}
          halation={frame.halation}
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
