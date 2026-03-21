"use client";

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
  children: React.ReactNode;
}

/**
 * Composites shader, AI imagery, and post-processing.
 *
 * Z-index stack (all layers share the same stacking context):
 *   Shader canvas: default (from children)
 *   AI images: z-index 2, pointer-events none
 *   Post-processing: z-index 3, pointer-events none
 *   Control bar: z-index 10 (set inside VisualizerCore)
 *   Mode palette: z-index 30-40 (set inside VisualizerCore)
 *   Poetry: z-index 5, pointer-events none
 *
 * Controls stay interactive because they have higher z-index than AI/post layers.
 */
export function JourneyCompositor({
  frame,
  audioAmplitude,
  audioBass,
  aiEnabled,
  aiPrompt,
  aiOnly = false,
  aiGenerating = true,
  children,
}: JourneyCompositorProps) {
  const effectivePrompt = frame?.aiPrompt ?? aiPrompt ?? "";
  const effectiveDenoising = frame?.denoisingStrength ?? 0.5;
  const effectiveTargetFps = frame?.targetFps ?? 2;
  const effectiveShaderOpacity = frame?.shaderOpacity ?? 1.0;
  const showAi = aiEnabled && !!effectivePrompt;

  if (!showAi && !frame) {
    return <>{children}</>;
  }

  return (
    <div className="absolute inset-0">
      {/* Shader + controls + poetry (children render at default z-index) */}
      {children}

      {/* AI imagery — z-2, above shader but below controls (z-10+) */}
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
    </div>
  );
}
