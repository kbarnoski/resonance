"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getRealtimeImageService } from "@/lib/journeys/realtime-image-service";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";

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
  /** When false, stop generating new images (existing images stay visible) */
  generating?: boolean;
  /** Journey shader opacity (0-1). Controls AI layer opacity inversely —
   *  higher shaderOpacity = lower AI presence. Default 1.0 (AI minimal). */
  shaderOpacity?: number;
}

interface ImageLayer {
  img: HTMLImageElement;
  opacity: number;
  state: "fading-in" | "peak" | "fading-out";
  /** Time when fade state last changed — used for fade progress */
  fadeStartTime: number;
  /** Opacity at the moment fade-out began — prevents jump from partial→1 */
  fadeStartOpacity: number;
  /** Time when layer was created — used for Ken Burns, never modified */
  createdTime: number;
  // Ken Burns: each layer gets a unique slow pan/zoom trajectory
  scaleStart: number;
  scaleEnd: number;
  panX: number; // -1 to 1 direction
  panY: number; // -1 to 1 direction
  blendMode: GlobalCompositeOperation;
}

const DISSOLVE_DURATION = 5000; // 5 seconds for smooth dissolves
const GEN_INTERVAL_MIN = 10000; // 10 seconds between generations
const GEN_INTERVAL_MAX = 15000; // 15 seconds max — no image stays > 20s
const POETRY_GEN_DELAY = 2500; // 2.5s after new poetry line
const PROMPT_DEBOUNCE = 2000; // 2s debounce on prompt changes
const KEN_BURNS_DURATION = 50; // seconds — full motion cycle
const MAX_LAYERS = 3; // allow up to 3 overlapping layers for smooth cross-dissolves

/** Smooth ease-in-out cubic — no jarring linear interpolation */
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * AI image layer — generates and renders AI imagery via fal.ai.
 *
 * Multi-layer compositing with smooth cross-dissolve transitions:
 *   - Each new image fades in over DISSOLVE_DURATION
 *   - Previous images fade out from their current opacity (no jumps)
 *   - Ken Burns motion uses a stable creation timestamp (never reset)
 *   - Layers are only removed after fully faded out
 */
export function AiImageLayer({
  prompt,
  denoisingStrength,
  targetFps,
  audioAmplitude,
  audioBass,
  enabled,
  aiOnly = false,
  generating = true,
  shaderOpacity = 1.0,
}: AiImageLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<ImageLayer[]>([]);
  const animRef = useRef<number>(0);
  const lastGenTimeRef = useRef(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const promptRef = useRef(prompt);
  const denoisingRef = useRef(denoisingStrength);
  const generatingRef = useRef(generating);
  const poetryLineRef = useRef("");
  const poetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);
  const genCountRef = useRef(0);
  const promptChangeTimeRef = useRef(0);

  // Sync props → refs
  useEffect(() => { generatingRef.current = generating; }, [generating]);
  useEffect(() => {
    promptRef.current = prompt;
    // Cancel in-flight request for old prompt and debounce 2s
    getRealtimeImageService().cancelInFlight();
    promptChangeTimeRef.current = performance.now();
    lastGenTimeRef.current = 0;
  }, [prompt]);
  useEffect(() => { denoisingRef.current = denoisingStrength; }, [denoisingStrength]);

  // Load image with decode() for off-main-thread processing
  const loadImage = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (img.decode) {
          img.decode().then(() => resolve(img)).catch(() => resolve(img));
        } else {
          resolve(img);
        }
      };
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  // Push new image onto the layer stack with smooth cross-dissolve
  const pushImage = useCallback((img: HTMLImageElement) => {
    const service = getRealtimeImageService();
    service.cacheImage(promptRef.current, img);

    const layers = layersRef.current;
    const now = performance.now();

    // Transition existing visible layers to fading-out,
    // preserving their current opacity so there's no jump
    for (const layer of layers) {
      if (layer.state === "fading-in" || layer.state === "peak") {
        layer.fadeStartOpacity = layer.opacity; // capture current opacity
        layer.state = "fading-out";
        layer.fadeStartTime = now;
        // NOTE: createdTime is NOT touched — Ken Burns continues smoothly
      }
    }

    // Only evict layers that are fully invisible (opacity ≤ 0)
    // This prevents visible layers from being ripped away
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].opacity <= 0 && layers[i].state === "fading-out") {
        layers.splice(i, 1);
      }
    }

    // Hard cap: if we still have too many layers, remove the oldest fading-out one
    if (layers.length >= MAX_LAYERS) {
      const oldestFadingIdx = layers.findIndex((l) => l.state === "fading-out");
      if (oldestFadingIdx >= 0) {
        layers.splice(oldestFadingIdx, 1);
      }
    }

    // Randomize Ken Burns params for visual variety
    const blendModes: GlobalCompositeOperation[] = ["source-over", "screen", "lighten"];
    const scaleStart = 1.0 + Math.random() * 0.12; // 1.0 - 1.12
    const scaleEnd = 1.04 + Math.random() * 0.16;  // 1.04 - 1.20
    const panX = (Math.random() - 0.5) * 2;        // -1 to 1
    const panY = (Math.random() - 0.5) * 2;        // -1 to 1
    const blendMode = blendModes[Math.floor(Math.random() * blendModes.length)];

    layers.push({
      img,
      opacity: 0,
      state: "fading-in",
      fadeStartTime: now,
      fadeStartOpacity: 0,
      createdTime: now, // stable timestamp for Ken Burns — never modified
      scaleStart,
      scaleEnd,
      panX,
      panY,
      blendMode,
    });
  }, []);

  // Trigger an image generation (REST)
  // skipCache=true for periodic refreshes (same prompt, want new image)
  const triggerGeneration = useCallback((skipCache = false) => {
    const service = getRealtimeImageService();
    if (service.isCapped() || loadingRef.current) return;

    const currentPrompt = promptRef.current;
    if (!currentPrompt) return;

    // Check LRU cache (only on first load or prompt change, not periodic refreshes)
    if (!skipCache) {
      const cached = service.getCachedImage(currentPrompt);
      if (cached) {
        pushImage(cached);
        lastGenTimeRef.current = performance.now();
        return;
      }
    }

    loadingRef.current = true;
    lastGenTimeRef.current = performance.now();

    // Add a variation seed so the same prompt produces different images
    const seed = Math.floor(Math.random() * 999999);
    const variedPrompt = `${currentPrompt}, variation ${seed}`;

    service
      .generateFrameREST({
        prompt: variedPrompt,
        denoisingStrength: denoisingRef.current,
        width: 1024,
        height: 1024,
      })
      .then(async (url) => {
        if (!url) return;
        try {
          const img = await loadImage(url);
          pushImage(img);
        } catch { /* load failed, skip */ }
      })
      .catch(() => {})
      .finally(() => { loadingRef.current = false; });
  }, [loadImage, pushImage]);

  // Poetry-driven generation: poll journey engine for new poetry lines
  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      const line = getJourneyEngine().getCurrentPoetryLine();
      if (line && line !== poetryLineRef.current) {
        poetryLineRef.current = line;
        if (poetryTimerRef.current) clearTimeout(poetryTimerRef.current);
        poetryTimerRef.current = setTimeout(() => {
          if (generatingRef.current) triggerGeneration();
        }, POETRY_GEN_DELAY);
      }
    }, 500);

    return () => clearInterval(id);
  }, [enabled, triggerGeneration]);

  // Check availability + register WS frame callback
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const service = getRealtimeImageService();

    // Try up to 3 times with increasing delay (covers slow server start)
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return;
        const ok = await service.checkAvailability();
        if (ok) {
          setAvailable(true);
          return;
        }
        // Wait before retry: 2s, 4s
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
      if (!cancelled) setAvailable(false);
    })();

    service.onFrame(async (imageUrl) => {
      try {
        const img = await loadImage(imageUrl);
        pushImage(img);
      } catch { /* skip broken frames */ }
    });

    return () => { cancelled = true; };
  }, [enabled, loadImage, pushImage]);

  // Generation loop — fires immediately, then every 25-35s
  useEffect(() => {
    if (!enabled || available !== true) return;
    genCountRef.current = 0;
    // Pick a stable interval for this cycle (not re-randomized each tick)
    let nextInterval = 0;

    const tick = () => {
      if (!generatingRef.current) return;
      const now = performance.now();

      // Debounce: wait 2s after prompt changes before generating
      if (now - promptChangeTimeRef.current < PROMPT_DEBOUNCE) return;

      if (genCountRef.current > 0 && now - lastGenTimeRef.current < nextInterval) return;
      const isFirstGen = genCountRef.current === 0;
      genCountRef.current++;
      // Pick next interval for after this generation
      nextInterval = GEN_INTERVAL_MIN + Math.random() * (GEN_INTERVAL_MAX - GEN_INTERVAL_MIN);
      // Skip cache on periodic updates (not the first load)
      triggerGeneration(!isFirstGen);
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [enabled, available, triggerGeneration]);

  // Track aiOnly in a ref so the render loop can read it
  const aiOnlyRef = useRef(aiOnly);
  useEffect(() => { aiOnlyRef.current = aiOnly; }, [aiOnly]);

  // 60fps render loop — smooth cross-dissolve compositing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastW = 0;
    let lastH = 0;

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

      // In aiOnly mode, fill black so shaders never show through during cross-dissolves
      if (aiOnlyRef.current) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      const now = performance.now();
      const layers = layersRef.current;

      // Update layer opacities — evict fully faded layers in-place
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        const elapsed = now - layer.fadeStartTime;
        const rawProgress = Math.min(1, elapsed / DISSOLVE_DURATION);
        const easedProgress = easeInOutCubic(rawProgress);

        if (layer.state === "fading-in") {
          // Fade from 0 → 1 with easing
          layer.opacity = easedProgress;
          if (rawProgress >= 1) {
            layer.state = "peak";
            layer.opacity = 1;
          }
        } else if (layer.state === "fading-out") {
          // Fade from captured opacity → 0 with easing
          // fadeStartOpacity preserves whatever opacity the layer had when
          // it was told to fade out — no jump from 0.5 → 1.0
          layer.opacity = layer.fadeStartOpacity * (1 - easedProgress);
          if (rawProgress >= 1) {
            layers.splice(i, 1);
            continue;
          }
        }
        // "peak" layers stay at opacity 1 — no change needed
      }

      // Draw surviving layers with Ken Burns pan/zoom
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (layer.opacity <= 0.001 || !layer.img.complete) continue;

        ctx.globalCompositeOperation = i === 0 ? "source-over" : layer.blendMode;
        ctx.globalAlpha = layer.opacity;

        // Ken Burns: uses createdTime (never reset) for perfectly smooth motion
        const layerAge = (now - layer.createdTime) / 1000;
        const kenBurnsT = Math.min(1, layerAge / KEN_BURNS_DURATION);
        // Ease the Ken Burns motion too for a dreamy feel
        const kenBurnsEased = easeInOutCubic(kenBurnsT);
        const scale = layer.scaleStart + (layer.scaleEnd - layer.scaleStart) * kenBurnsEased;
        const maxPan = (scale - 1) * 0.5;
        const panOffsetX = layer.panX * maxPan * kenBurnsEased * w;
        const panOffsetY = layer.panY * maxPan * kenBurnsEased * h;

        const sw = w * scale;
        const sh = h * scale;
        const dx = (w - sw) / 2 + panOffsetX;
        const dy = (h - sh) / 2 + panOffsetY;

        ctx.drawImage(layer.img, dx, dy, sw, sh);
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Cleanup poetry timer on unmount
  useEffect(() => {
    return () => {
      if (poetryTimerRef.current) clearTimeout(poetryTimerRef.current);
    };
  }, []);

  if (!enabled || available === false) return null;

  // AI layer opacity: inverse of shader opacity, clamped for visual balance.
  // When shaderOpacity is high (0.7+), AI is subtle. When low (0.3-0.5), AI is prominent.
  // For non-journey usage (shaderOpacity=1.0), defaults to 0.85 for backwards compat.
  const aiLayerOpacity = aiOnly
    ? undefined
    : shaderOpacity >= 1.0
      ? 0.85
      : Math.max(0.15, Math.min(0.65, 1 - shaderOpacity));

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={
        aiOnly
          ? { zIndex: 2, pointerEvents: "none" }
          : { zIndex: 2, mixBlendMode: "screen", opacity: aiLayerOpacity, pointerEvents: "none" }
      }
    />
  );
}
