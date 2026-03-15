"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getRealtimeImageService } from "@/lib/journeys/realtime-image-service";

interface AiImageLayerProps {
  /** AI prompt for image generation */
  prompt: string;
  /** Denoising strength (0-1) — higher = more visual transformation */
  denoisingStrength: number;
  /** Target generation FPS */
  targetFps: number;
  audioAmplitude: number;
  audioBass: number;
  enabled: boolean;
  /** When true, AI images are the sole visual — full opacity, no blend */
  aiOnly?: boolean;
}

/**
 * AI image layer — generates and renders AI imagery via fal.ai.
 *
 * Works in two modes:
 * - Blended: layered on top of shader with lighten blend (journey/normal)
 * - AI-only: sole visual at full opacity (AI-only viz modes)
 *
 * Uses fal.ai WebSocket for ~250ms latency, REST fallback otherwise.
 * Smooth 60fps cross-dissolve morphing between generated frames.
 */
export function AiImageLayer({
  prompt,
  denoisingStrength,
  targetFps,
  audioAmplitude,
  audioBass,
  enabled,
  aiOnly = false,
}: AiImageLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevImageRef = useRef<HTMLImageElement | null>(null);
  const nextImageRef = useRef<HTMLImageElement | null>(null);
  const blendRef = useRef(1);
  const animRef = useRef<number>(0);
  const lastGenTimeRef = useRef(0);
  const lastFrameDataRef = useRef<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const promptRef = useRef(prompt);
  const denoisingRef = useRef(denoisingStrength);
  const targetFpsRef = useRef(targetFps);
  const audioRef = useRef({ amplitude: audioAmplitude, bass: audioBass });

  useEffect(() => { promptRef.current = prompt; }, [prompt]);
  useEffect(() => { denoisingRef.current = denoisingStrength; }, [denoisingStrength]);
  useEffect(() => { targetFpsRef.current = targetFps; }, [targetFps]);
  useEffect(() => { audioRef.current = { amplitude: audioAmplitude, bass: audioBass }; }, [audioAmplitude, audioBass]);

  // Check availability and connect
  useEffect(() => {
    if (!enabled) return;

    const service = getRealtimeImageService();

    (async () => {
      const isAvailable = await service.checkAvailability();
      setAvailable(isAvailable);
      // Skip WebSocket — REST is more reliable. WS has protocol issues with this model.
    })();

    // Register frame callback (for WebSocket results)
    service.onFrame((imageUrl) => {
      if (nextImageRef.current) {
        prevImageRef.current = nextImageRef.current;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        nextImageRef.current = img;
        blendRef.current = 0;
      };
      img.onerror = () => {};
      img.src = imageUrl;
    });
  }, [enabled]);

  const captureCanvas = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return null;
    try {
      return canvas.toDataURL("image/jpeg", 0.5);
    } catch { return null; }
  }, []);

  // Frame generation loop — runs independently of journey system
  useEffect(() => {
    if (!enabled || available !== true) return;

    const service = getRealtimeImageService();
    let genCount = 0;

    const generateFrame = () => {
      const currentPrompt = promptRef.current;
      const currentDenoising = denoisingRef.current;
      const audio = audioRef.current;
      if (!currentPrompt) return;
      if (service.isCapped()) return;

      const now = performance.now();
      // Generate every ~25 seconds for cinematic pacing
      const intervalMs = 25000;
      if (genCount > 0 && now - lastGenTimeRef.current < intervalMs) return;
      lastGenTimeRef.current = now;

      genCount++;
      service.generateFrameREST({
        prompt: currentPrompt,
        denoisingStrength: currentDenoising,
        previousFrameDataUrl: undefined, // skip img2img for speed
        width: 1024,
        height: 1024,
      }).then((url) => {
        if (!url) return;
        if (nextImageRef.current) prevImageRef.current = nextImageRef.current;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          nextImageRef.current = img;
          blendRef.current = 0;
        };
        img.onerror = () => {};
        img.src = url;
        lastFrameDataRef.current = url;
      }).catch(() => {});
    };

    // Fire immediately, then continue on interval
    generateFrame();
    const genInterval = setInterval(generateFrame, 300);

    return () => clearInterval(genInterval);
  }, [enabled, available, captureCanvas]);

  // 60fps render loop — smooth morphing dissolve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastW = 0, lastH = 0;

    function render() {
      if (!canvas || !ctx) return;

      const dpr = devicePixelRatio;
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;

      if (w !== lastW || h !== lastH) {
        canvas.width = w;
        canvas.height = h;
        lastW = w;
        lastH = h;
      }

      ctx.clearRect(0, 0, w, h);

      const prev = prevImageRef.current;
      const next = nextImageRef.current;

      // Very slow dissolve — viewer should barely notice the transition
      if (blendRef.current < 1) {
        blendRef.current = Math.min(1, blendRef.current + 0.002); // ~500 frames (~8s) to dissolve
      }

      if (prev && prev.complete) {
        ctx.globalAlpha = 1 - blendRef.current;
        ctx.drawImage(prev, 0, 0, w, h);
      }

      if (next && next.complete) {
        ctx.globalAlpha = blendRef.current;
        ctx.drawImage(next, 0, 0, w, h);
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Don't render if disabled or unavailable
  if (!enabled || available === false) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={aiOnly ? {
          zIndex: 2,
          pointerEvents: "none",
        } : {
          zIndex: 2,
          mixBlendMode: "lighten",
          opacity: 0.85,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
