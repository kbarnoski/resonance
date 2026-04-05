"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getRealtimeImageService } from "@/lib/journeys/realtime-image-service";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { createSeededRandom } from "@/lib/journeys/seeded-random";

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
  /** Fires once when the first AI image is ready and painted */
  onFirstImage?: () => void;
  /** Optional seed for deterministic prompt variation (shared playback) */
  promptSeed?: number;
  /** Stable journey identifier — only purge layers when this changes (new journey).
   *  Phase transitions within the same journey use graceful crossfade instead. */
  journeyId?: string;
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
  /** Fast fade — used when purging layers for a new journey */
  purge?: boolean;
}

const DISSOLVE_DURATION = 4000; // 4s fade-in — smooth cross-dissolve
const FADEOUT_DURATION = 8000; // 8s fade-out — images linger longer for layered depth
const PURGE_FADEOUT_DURATION = 500; // 0.5s fast fade — prevents old journey images lingering
const GEN_INTERVAL_MIN = 6000; // 6s between generations — keep imagery flowing
const GEN_INTERVAL_MAX = 10000; // 10s max — ensures constant visual movement
const POETRY_GEN_DELAY = 1500; // 1.5s after new poetry line — react faster
const PROMPT_DEBOUNCE = 1500; // 1.5s debounce on prompt changes
const KEN_BURNS_DURATION = 50; // seconds — full motion cycle
const MAX_LAYERS = 6; // 6 overlapping layers — denser visual flow, more layered depth
const MAX_CONCURRENT_GENS = 2; // 2 parallel REST requests for faster imagery fill

/** Smooth ease-in-out cubic — no jarring linear interpolation */
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * AI image layer — generates and renders AI imagery via fal.ai.
 *
 * Multi-layer compositing with up to 3 simultaneously visible images:
 *   - Each new image fades in over DISSOLVE_DURATION
 *   - Only the OLDEST layer fades out when at capacity — recent layers stay at peak
 *   - Ken Burns motion uses a stable creation timestamp (never reset)
 *   - Fade-out is slower than fade-in, keeping images visible during transitions
 *   - Creates a "video" feel where imagery is always moving and always in transition
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
  onFirstImage,
  promptSeed,
  journeyId,
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
  const loadingCountRef = useRef(0); // number of in-flight REST requests
  const genCountRef = useRef(0);
  const promptChangeTimeRef = useRef(0);
  const firstImageFiredRef = useRef(false);
  const onFirstImageRef = useRef(onFirstImage);
  onFirstImageRef.current = onFirstImage;
  const promptSeedRef = useRef(promptSeed);
  promptSeedRef.current = promptSeed;

  const journeyIdRef = useRef(journeyId);

  // Sync props → refs
  useEffect(() => { generatingRef.current = generating; }, [generating]);
  useEffect(() => {
    const prevJourneyId = journeyIdRef.current;
    journeyIdRef.current = journeyId;
    promptRef.current = prompt;

    // Cancel in-flight requests and clear the LRU image cache so old
    // images can't resurface via cache hits on the new prompt's first generation.
    const service = getRealtimeImageService();
    service.cancelInFlight();
    service.clearImageCache();
    promptChangeTimeRef.current = performance.now();
    lastGenTimeRef.current = 0;

    // Only PURGE (fast 0.5s fade) when switching to an entirely different journey.
    // Phase transitions within the same journey use graceful crossfade — old images
    // fade naturally (8s) while new ones emerge, creating smooth visual flow.
    const isNewJourney = journeyId !== prevJourneyId && prevJourneyId != null;
    if (isNewJourney) {
      const layers = layersRef.current;
      const now = performance.now();
      for (const layer of layers) {
        if (layer.state !== "fading-out") {
          layer.fadeStartOpacity = layer.opacity;
          layer.state = "fading-out";
          layer.fadeStartTime = now;
          layer.purge = true;
        }
      }
    }
    // For same-journey phase transitions: old images stay visible and fade naturally
    // via the normal MAX_LAYERS eviction when new images arrive. This prevents the
    // "images come and go really fast" flash at phase boundaries.
  }, [prompt, journeyId]);
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

  // Push new image onto the layer stack — keeps 2-3 images visible simultaneously.
  // Only the OLDEST layer fades out when at capacity; recent layers stay at peak.
  // This creates a sense of video — imagery is always moving and always in transition.
  const pushImage = useCallback((img: HTMLImageElement) => {
    const service = getRealtimeImageService();
    service.cacheImage(promptRef.current, img);

    // Signal parent that first AI image is ready (for intro gating)
    if (!firstImageFiredRef.current) {
      firstImageFiredRef.current = true;
      onFirstImageRef.current?.();
    }

    const layers = layersRef.current;
    const now = performance.now();

    // Evict fully invisible layers first
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].opacity <= 0 && layers[i].state === "fading-out") {
        layers.splice(i, 1);
      }
    }

    // Only fade out the OLDEST visible layer when at capacity
    // This keeps 2-3 images stacked and visible at the same time
    if (layers.length >= MAX_LAYERS) {
      const oldestVisible = layers.find((l) => l.state === "fading-in" || l.state === "peak");
      if (oldestVisible) {
        oldestVisible.fadeStartOpacity = oldestVisible.opacity;
        oldestVisible.state = "fading-out";
        oldestVisible.fadeStartTime = now;
        // NOTE: createdTime is NOT touched — Ken Burns continues smoothly
      }
    }

    // Hard cap: if still over limit after starting a fade, force-remove oldest fading
    if (layers.length >= MAX_LAYERS + 1) {
      const oldestFadingIdx = layers.findIndex((l) => l.state === "fading-out");
      if (oldestFadingIdx >= 0) {
        layers.splice(oldestFadingIdx, 1);
      }
    }

    // Randomize Ken Burns params for visual variety
    // Favor source-over — screen/lighten between layers can cause additive blow-out
    const roll = Math.random();
    const blendMode: GlobalCompositeOperation = roll < 0.65 ? "source-over" : roll < 0.85 ? "screen" : "lighten";
    const scaleStart = 1.0 + Math.random() * 0.12; // 1.0 - 1.12
    const scaleEnd = 1.04 + Math.random() * 0.16;  // 1.04 - 1.20
    const panX = (Math.random() - 0.5) * 2;        // -1 to 1
    const panY = (Math.random() - 0.5) * 2;        // -1 to 1

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
    if (service.isCapped()) return;
    // Allow up to MAX_CONCURRENT_GENS parallel requests
    if (loadingCountRef.current >= MAX_CONCURRENT_GENS) return;

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

    loadingCountRef.current++;
    lastGenTimeRef.current = performance.now();

    // Three independent variation axes — each generation picks one from each,
    // producing thousands of unique combinations from the same base prompt.
    // This prevents consecutive images from looking similar.
    const compositions = [
      "extreme close-up macro detail", "wide aerial view",
      "diagonal composition", "centered symmetrical",
      "off-center with vast negative space", "tightly cropped abstract fragment",
      "layered depth with foreground blur", "radial emanating from center",
      "scattered elements with generous empty space",
      "single dominant form filling the frame", "two contrasting fields meeting",
      "spiral composition", "minimal elements in vast emptiness",
      "small forms against expansive void", "dense texture filling the frame",
    ];
    const interpretations = [
      "painterly and impressionistic", "photographic and textural",
      "geometric and structured", "fluid and organic",
      "minimal and sparse", "dense and layered",
      "dreamy and soft focus", "sharp and crystalline",
      "ethereal and translucent", "raw and tactile",
      "microscopic detail", "atmospheric and hazy",
    ];
    const moods = [
      "quiet solitude", "vast stillness", "gentle motion",
      "raw power", "delicate fragility", "infinite depth",
      "emerging from darkness", "dissolving into light",
      "tension between opposites", "peaceful emptiness",
    ];
    // When a promptSeed is set (shared playback), derive deterministic variation
    // from seed + genCount so consecutive generations differ but are reproducible.
    const rng = promptSeedRef.current != null
      ? createSeededRandom(promptSeedRef.current + genCountRef.current)
      : Math.random;
    const comp = compositions[Math.floor(rng() * compositions.length)];
    const interp = interpretations[Math.floor(rng() * interpretations.length)];
    const mood = moods[Math.floor(rng() * moods.length)];
    const variedPrompt = `${currentPrompt}, ${comp}, ${interp}, ${mood}, no snowflakes`;

    // Capture current prompt to discard stale responses after a prompt change
    const requestPrompt = currentPrompt;

    service
      .generateFrameREST({
        prompt: variedPrompt,
        denoisingStrength: denoisingRef.current,
        width: 1024,
        height: 1024,
      })
      .then(async (url) => {
        if (!url) return;
        // Discard if prompt changed while request was in flight
        if (promptRef.current !== requestPrompt) return;
        try {
          const img = await loadImage(url);
          pushImage(img);
        } catch { /* load failed, skip */ }
      })
      .catch(() => {})
      .finally(() => { loadingCountRef.current = Math.max(0, loadingCountRef.current - 1); });
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

  // Check availability + register WS frame callback.
  // Retries periodically (every 30s) if initial checks fail — covers
  // transient outages without blocking the entire journey.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const service = getRealtimeImageService();

    const checkWithRetries = async () => {
      // Try up to 3 times with increasing delay (covers slow server start)
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
    };

    checkWithRetries();

    // Periodic retry if unavailable — service may come back during a journey
    const retryId = setInterval(() => {
      if (cancelled) return;
      // Only retry if still unavailable
      service.checkAvailability().then((ok) => {
        if (ok && !cancelled) setAvailable(true);
      }).catch(() => {});
    }, 30_000);

    service.onFrame(async (imageUrl) => {
      try {
        const img = await loadImage(imageUrl);
        pushImage(img);
      } catch { /* skip broken frames */ }
    });

    return () => { cancelled = true; clearInterval(retryId); };
  }, [enabled, loadImage, pushImage]);

  // Generation loop — fires 2 requests immediately for fast initial imagery,
  // then keeps 2-3 images flowing at all times for the "video" feel
  useEffect(() => {
    if (!enabled || available !== true) return;
    genCountRef.current = 0;
    let nextInterval = 0;

    const tick = () => {
      if (!generatingRef.current) return;
      const now = performance.now();

      // Skip debounce on first 2 gens for instant imagery
      if (genCountRef.current > 1 && now - promptChangeTimeRef.current < PROMPT_DEBOUNCE) return;

      // First 2 generations fire immediately (parallel fill)
      if (genCountRef.current < 2) {
        genCountRef.current++;
        triggerGeneration(genCountRef.current > 1); // first uses cache, second skips
        return;
      }

      if (now - lastGenTimeRef.current < nextInterval) return;
      genCountRef.current++;
      nextInterval = GEN_INTERVAL_MIN + Math.random() * (GEN_INTERVAL_MAX - GEN_INTERVAL_MIN);
      triggerGeneration(true); // always skip cache for ongoing gens
    };

    // Fire first tick immediately
    tick();
    // Second tick fires 200ms later (stagger the 2 initial parallel requests)
    const stagger = setTimeout(tick, 200);
    const id = setInterval(tick, 400); // check frequently
    return () => {
      clearTimeout(stagger);
      clearInterval(id);
    };
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

      // Cap at 1.5x — AI images are blended/panned, full retina is wasted GPU fill
      const dpr = Math.min(devicePixelRatio, 1.5);
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

        if (layer.state === "fading-in") {
          const rawProgress = Math.min(1, elapsed / DISSOLVE_DURATION);
          const easedProgress = easeInOutCubic(rawProgress);
          layer.opacity = easedProgress;
          if (rawProgress >= 1) {
            layer.state = "peak";
            layer.opacity = 1;
          }
        } else if (layer.state === "fading-out") {
          // Slow fade-out keeps images visible longer during transitions
          // Purge layers use a fast 2s fade to clear old journey imagery quickly
          const fadeDuration = layer.purge ? PURGE_FADEOUT_DURATION : FADEOUT_DURATION;
          const rawProgress = Math.min(1, elapsed / fadeDuration);
          const easedProgress = easeInOutCubic(rawProgress);
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
