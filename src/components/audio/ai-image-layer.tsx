"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getRealtimeImageService } from "@/lib/journeys/realtime-image-service";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { getGhostAngelTheme } from "@/lib/journeys/ghost-flash-images";
import { GHOST_ANGEL_WHITE, GHOST_ANGEL_BLACK, GHOST_ANGEL_WINGLESS_WHITE, GHOST_ANGEL_MARKER, GHOST_ANGEL_WINGLESS_MARKER, GHOST_NEGATIVE_PROMPT, getGhostAgeForPhase, getGhostOverlayForPhase } from "@/lib/journeys/journeys";
import { createSeededRandom } from "@/lib/journeys/seeded-random";
import { getTierProfile } from "@/lib/audio/device-tier";

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
  /** Fires with the image src whenever a new AI image is composited */
  onImageReady?: (src: string) => void;
  /** When present, cycle through these URLs on the gen interval instead of calling fal.ai.
   *  The AI generation pipeline is bypassed entirely — zero network calls, no cost cap. */
  localImageUrls?: string[];
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
  /** Time when layer reached peak opacity — used for MIN_PEAK_DURATION hold */
  peakStartTime: number;
  // Ken Burns: each layer gets a unique slow pan/zoom trajectory
  scaleStart: number;
  scaleEnd: number;
  panX: number; // -1 to 1 direction
  panY: number; // -1 to 1 direction
  blendMode: GlobalCompositeOperation;
  /** Fast fade — used when purging layers for a new journey */
  purge?: boolean;
}

// Pacing — spec v3 §6: slow crossfades and long tails so images BUILD
// and interweave into the "infinite surreal collage" feel the user
// asked for. 6s fade in, 4s peak, 10s long fade-out tail, new image
// every ~7s. Total life 20s with ~3 images overlapping at any time.
const DISSOLVE_DURATION = 6000;
const FADEOUT_DURATION = 10000;
const PURGE_FADEOUT_DURATION = 1500; // snappy clear when a new journey begins
const MIN_PEAK_DURATION = 4000;
const GEN_INTERVAL_MIN_BASE = 6500;
const GEN_INTERVAL_MAX_BASE = 7500;
const POETRY_GEN_DELAY = 1500; // 1.5s after new poetry line — react faster
const PROMPT_DEBOUNCE = 1500; // 1.5s debounce on prompt changes
const KEN_BURNS_DURATION = 50; // seconds — full motion cycle
// Layer count and concurrency are device-tier driven (see getTierProfile).
// Resolved per-render via the tier profile so values stay in sync with the
// rest of the perf budget (bloom, particles, gen cadence).

/**
 * Phase-aware cinematic perspectives — POV evolves through the journey arc.
 *
 * Inspired by:
 *   Kubrick — one-point perspective, symmetrical framing, slow zooms
 *   Tarkovsky — contemplative drift, water surfaces, rooms as mindscapes
 *   Malick — nature POV, looking up through canopy, magic hour backlight
 *   Villeneuve — vast negative space, scale contrast, silhouettes against geometry
 *   Spielberg — low-angle wonder, reaction before reveal
 *   Hitchcock — subjective POV, deep focus tension, overhead moral reckoning
 */
const CINEMATIC_PERSPECTIVES: Record<string, string[]> = {
  // ── Threshold: grounding, orientation, gentle entry ──
  threshold: [
    "extreme wide aerial view looking down at 45 degrees, vast empty landscape, soft diffused light",
    "eye-level symmetrical one-point perspective down a dimly lit corridor, warm light at vanishing point",
    "camera at water surface level half submerged, looking across still lake toward distant forms",
    "low angle looking up through bare branches at overcast sky, natural geometric patterns",
    "medium wide shot centered on archway, silhouetted against soft interior light",
    "bird's eye view looking straight down at a crossroads of paths, long shadows extending",
    "slow dolly-forward perspective through empty room toward a window, foreground soft focus",
    "wide landscape with deep atmospheric perspective, three distinct depth layers: dark foreground silhouette, mid-ground structures, bright distant horizon",
    "camera low to ground looking across a textured surface toward the horizon, shallow depth of field",
    "centered symmetrical composition through a natural frame of rock or foliage, distant vanishing point",
  ],
  // ── Expansion: growing intensity, deepening engagement ──
  expansion: [
    "tracking shot moving through environment at eye height, motion blur on background, sharp foreground detail",
    "low angle looking up at towering vertical forms, converging lines creating dramatic forced perspective",
    "deep perspective looking into vast space, layered elements receding into distance",
    "worm's eye view from ground level looking straight up through organic forms at bright sky above",
    "slowly ascending perspective, camera rising, world expanding outward revealing hidden patterns",
    "telephoto compression flattening foreground against vast background, layers embedded in surroundings",
    "split-depth composition: sharp foreground detail on one side, deep background in focus on the other",
    "extreme close-up of a single reflective surface showing the world within its curved shape",
    "diagonal composition with strong leading lines pulling eye from lower left to upper right",
    "medium shot through layers of translucent material, each layer adding depth and color",
  ],
  // ── Transcendence: peak intensity, rule-breaking, the sublime ──
  transcendence: [
    "Dutch angle 25 degrees, dramatic chiaroscuro, forms half-lit half-shadow, tilting diagonally",
    "extreme close-up macro detail, shallow depth of field, single point of sharp focus surrounded by abstract bokeh",
    "symmetrical one-point perspective with blinding white light at vanishing point, all detail dissolving into radiance",
    "bird's eye from extreme height looking straight down, vast concentric pattern radiating from center",
    "abstract perspective with no clear up or down, floating in space, contradictory light sources, gravity dissolved",
    "vast negative space, single point of luminous color at center, overwhelming emptiness in all directions",
    "camera inside looking out through fractured prismatic surface, world broken into shifted copies, chromatic edges",
    "extreme low angle looking straight up at overwhelming scale, immense form towering above",
    "radial composition emanating from center, energy and light bursting outward in all directions",
    "tilted overhead perspective looking down at forms reaching upward, lit from above, spiraling composition",
  ],
  // ── Illumination: revelation, clarity emerging from intensity ──
  illumination: [
    "wide panoramic view from a high vantage point, world laid out below in golden light, vast and clear",
    "centered composition in a pool of warm directional light, surrounding darkness",
    "camera looking through crystalline transparent forms, light refracting into spectral colors, sharp detail",
    "overhead view at 45 degrees looking down at intricate patterns revealed by raking side light",
    "eye-level perspective across a threshold, looking from shadow into brilliance, light pouring through",
    "extreme close-up of luminous surface texture, backlit, every detail revealed, ethereal translucence",
    "slow zoom into a single detail that contains the whole — fractal, recursive, infinite",
    "two-point perspective with converging horizontals meeting at center, balanced and centered",
    "panoramic sweep with focal point sharp against soft atmospheric background, sense of revelation",
    "looking up from below at light streaming through an opening, volumetric rays, particles visible in beams",
  ],
  // ── Return: descent, grounding, coming back to earth ──
  return: [
    "same wide establishing perspective as opening but now at golden hour, warmer light, longer shadows",
    "medium close-up of organic textures in soft natural light, rim light on edges, peaceful warmth",
    "still centered overhead view looking down at calm surface with subtle ripples expanding from center",
    "eye-level across a threshold, looking from interior into exterior light, warm transition",
    "extreme wide landscape with balanced proportions, environment in harmony, balanced light",
    "close-up of natural textures at rest, warm light, fine detail, objects suggesting completion",
    "long perspective down a gently curving path, softer geometry than rigid corridors, warm ambient light",
    "camera slowly pulling back, revealing more of the surrounding world, gentle recession",
    "low angle through grass or low vegetation, layered depth planes, sky above, grounded and intimate",
    "reflected image in still water, both the real and reflected world equally sharp, perfect symmetry",
  ],
  // ── Integration: resolution, stillness, transformed view ──
  integration: [
    "perfectly still wide shot, environment in equilibrium, natural light, no dramatic angles",
    "intimate close-up of natural detail, soft wrap-around light, shallow focus, tender stillness",
    "bird's eye looking down at a complete pattern or mandala, the whole journey visible as a single form",
    "eye-level one-point perspective but with the corridor now opening into vast bright space, doors open",
    "extreme wide composition where all elements merge with the landscape, integrated and whole",
    "medium shot through a window or frame, inner and outer worlds connected through light",
    "camera at rest, observational, wide and unhurried, the composition breathes with generous space",
    "looking up at sky with no ground visible, pure atmosphere and light, weightless and free",
    "close-up of a small natural detail — leaf, stone, water drop — containing reflected light of the whole",
    "wide symmetric composition with warm golden tones, everything in its place, resolved and complete",
  ],
};

// Figures removed — Ghost journey has its own figure prompts baked into aiPrompts.
// All other journeys generate imagery from their aiPrompt only.

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
  onImageReady,
  localImageUrls,
}: AiImageLayerProps) {
  const hasLocalImages = Array.isArray(localImageUrls) && localImageUrls.length > 0;
  const localImageUrlsRef = useRef(localImageUrls ?? []);
  useEffect(() => {
    localImageUrlsRef.current = localImageUrls ?? [];
  }, [localImageUrls]);
  const localImageIndexRef = useRef(0);
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
  const onImageReadyRef = useRef(onImageReady);
  onImageReadyRef.current = onImageReady;
  const promptSeedRef = useRef(promptSeed);
  promptSeedRef.current = promptSeed;

  const journeyIdRef = useRef(journeyId);

  // Sync props → refs
  useEffect(() => { generatingRef.current = generating; }, [generating]);
  useEffect(() => {
    const prevJourneyId = journeyIdRef.current;
    journeyIdRef.current = journeyId;
    promptRef.current = prompt;

    // Reset on EVERY journey id change, including the first one this session.
    // Previously this only fired on switches (prev != null), so any stale state
    // from a singleton, HMR, or prior page navigation could leak into the first
    // journey of a new session — leading to imagery that doesn't match the prompt.
    const isJourneyStart = journeyId != null && journeyId !== prevJourneyId;

    if (isJourneyStart) {
      // Aggressive reset: cancel everything, clear cache, force-remove layers
      // so the next journey starts truly fresh with no leftover frames in
      // flight, no leftover images on the stack, and no stale callbacks.
      const service = getRealtimeImageService();
      service.cancelInFlight();
      service.clearImageCache();
      service.clearFrameCallback();
      promptChangeTimeRef.current = performance.now();
      lastGenTimeRef.current = 0;
      genCountRef.current = 0;
      firstImageFiredRef.current = false;

      // Hard-purge any existing layers immediately. On first load the array
      // is empty so this is a no-op; on switches it removes any leftover
      // imagery from the previous journey instead of letting it fade for 2.5s.
      layersRef.current = [];
      // Also clear the canvas so old layer pixels don't persist in GPU memory
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      // Same-journey prompt change (either phase transition OR a within-
      // phase sequence advance). Do NOT cancel in-flight requests — the
      // per-sequence cadence changes the prompt every ~5s, and PuLID
      // gens take ~10s, so cancelling would guarantee no image ever
      // lands. The landing site only discards outputs if the journey
      // itself changed mid-flight; within a journey, late-arriving
      // frames from a previous sequence entry are still visually
      // relevant, so they're pushed to the stack.
      promptChangeTimeRef.current = performance.now();
    }
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

    // Notify overlay layer of new image
    onImageReadyRef.current?.(img.src);

    const layers = layersRef.current;
    const now = performance.now();

    // Evict fully invisible layers first
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].opacity <= 0 && layers[i].state === "fading-out") {
        layers.splice(i, 1);
      }
    }

    // Only fade out the OLDEST visible layer when at capacity —
    // but skip layers that haven't held at peak for MIN_PEAK_DURATION yet.
    // If nothing can be evicted, drop the incoming image (next gen will try again).
    if (layers.length >= getTierProfile().maxAiLayers) {
      const oldestVisible = layers.find((l) =>
        (l.state === "fading-in") ||
        (l.state === "peak" && now - l.peakStartTime >= MIN_PEAK_DURATION)
      );
      if (oldestVisible) {
        oldestVisible.fadeStartOpacity = oldestVisible.opacity;
        oldestVisible.state = "fading-out";
        oldestVisible.fadeStartTime = now;
        // NOTE: createdTime is NOT touched — Ken Burns continues smoothly
      } else {
        // All visible layers are still within their minimum peak hold — drop incoming image
        return;
      }
    }

    // Hard cap: if still over limit after starting a fade, force-remove oldest fading
    if (layers.length >= getTierProfile().maxAiLayers + 1) {
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
      peakStartTime: 0, // set when layer reaches peak in render loop
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
    // ── Local-image mode: cycle provided URLs instead of calling fal.ai ──
    if (localImageUrlsRef.current.length > 0) {
      const urls = localImageUrlsRef.current;
      const idx = localImageIndexRef.current % urls.length;
      localImageIndexRef.current = idx + 1;
      lastGenTimeRef.current = performance.now();
      loadImage(urls[idx])
        .then((img) => pushImage(img))
        .catch(() => { /* broken URL, skip */ });
      return;
    }

    const service = getRealtimeImageService();
    if (service.isCapped()) return;
    // Allow up to MAX_CONCURRENT_GENS parallel requests
    if (loadingCountRef.current >= getTierProfile().maxConcurrentAiGens) return;

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

    // ── Cinematic POV system ──
    // Perspectives evolve through the journey arc, inspired by Kubrick's
    // one-point perspective, Tarkovsky's contemplative duration, Malick's
    // nature POV, Villeneuve's scale contrast, and Spielberg's low-angle awe.
    // Each phase gets perspectives appropriate to its emotional register.
    //
    // Journeys with strictCameraPrompt=true (e.g. Ghost) have per-phase camera
    // instructions baked into their prompts and skip the random decoration so
    // the POVs don't fight the required camera angle.
    const activeJourney = getJourneyEngine().getJourney();
    const strictCamera = activeJourney?.strictCameraPrompt === true;

    // When a promptSeed is set (shared playback), derive deterministic variation
    // from seed + genCount so consecutive generations differ but are reproducible.
    const rng = promptSeedRef.current != null
      ? createSeededRandom(promptSeedRef.current + genCountRef.current)
      : Math.random;

    // Ghost-only: substitute the angel-descriptor markers for the current
    // variant and prepend per-phase age + surreal overlay (spec v2 §2 §3a).
    // <<GHOST_ANGEL_WINGLESS>> is always the white wingless angel
    // (used in phases before she finds her wings at the pool).
    // <<GHOST_ANGEL>> is the winged angel, white or possessed-black
    // depending on the bass-flash count.
    let basePrompt = currentPrompt;
    if (activeJourney?.id === "ghost") {
      const currentGhostPhase = getJourneyEngine().getCurrentPhase();
      const age = getGhostAgeForPhase(currentGhostPhase);
      const overlay = getGhostOverlayForPhase(currentGhostPhase);

      if (basePrompt.includes(GHOST_ANGEL_WINGLESS_MARKER)) {
        basePrompt = basePrompt.split(GHOST_ANGEL_WINGLESS_MARKER).join(GHOST_ANGEL_WINGLESS_WHITE);
      }
      if (basePrompt.includes(GHOST_ANGEL_MARKER)) {
        const theme = getGhostAngelTheme();
        const descriptor = theme === "black" ? GHOST_ANGEL_BLACK : GHOST_ANGEL_WHITE;
        basePrompt = basePrompt.split(GHOST_ANGEL_MARKER).join(descriptor);
      }

      // Prepend age + overlay so every Ghost frame carries them without
      // needing to hand-edit all ~40 sequence entries.
      basePrompt = `${age}. ${overlay}. ${basePrompt}`;
    }

    let variedPrompt: string;
    if (strictCamera) {
      // Base prompt already dictates the camera — don't layer random perspectives on top.
      variedPrompt = `${basePrompt}, no snowflakes`;
    } else {
      const phase = getJourneyEngine().getCurrentPhase();
      const perspectives = CINEMATIC_PERSPECTIVES[phase ?? "threshold"] ?? CINEMATIC_PERSPECTIVES.threshold;

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
      const pov = perspectives[Math.floor(rng() * perspectives.length)];
      const interp = interpretations[Math.floor(rng() * interpretations.length)];
      const mood = moods[Math.floor(rng() * moods.length)];

      variedPrompt = `${basePrompt}, ${pov}, ${interp}, ${mood}, no snowflakes`;
    }

    // Capture the journey id at dispatch time. We only discard landings if
    // the journey itself changed — sequence-driven prompt changes happen
    // every few seconds within a phase, and PuLID gens take longer than
    // that, so a strict prompt-match check would drop every frame.
    const requestJourneyId = journeyIdRef.current;

    // Ghost journey: pass the shared negative prompt so random people,
    // bird feathers, yellow centers, etc. stay out of the image.
    //
    // PuLID face-reference is NOT passed here. PuLID was locking onto
    // the reference portrait's front-face camera so aggressively that
    // every gen looked like a close portrait regardless of the scene
    // prompt's camera instructions (extreme wide, low angle, overhead,
    // etc.). Plain flux/dev follows scene composition much better. Face
    // identity drifts slightly between frames but the detailed angel
    // descriptor (braids, translucent dress, butterfly wings) keeps the
    // character recognizable.
    const isGhost = activeJourney?.id === "ghost";
    const negativePrompt = isGhost ? GHOST_NEGATIVE_PROMPT : undefined;

    service
      .generateFrameREST({
        prompt: variedPrompt,
        denoisingStrength: denoisingRef.current,
        width: 1024,
        height: 1024,
        negativePrompt,
      })
      .then(async (url) => {
        if (!url) return;
        // Discard only if the journey itself changed mid-flight (hard
        // discontinuity). Within a journey, let sequenced frames land
        // even if the prompt has advanced — the scene is still relevant.
        if (journeyIdRef.current !== requestJourneyId) return;

        // ── Visual compliance gate ──
        // For journeys with strict visual requirements (e.g. Ghost), every
        // generated frame is checked against a fast vision model before it
        // reaches the layer stack. If the check fails, the frame is silently
        // discarded — the next generation tick will try again.
        if (strictCamera) {
          try {
            const validateRes = await fetch("/api/ai-image/validate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageUrl: url }),
            });
            if (validateRes.ok) {
              const { valid } = await validateRes.json();
              if (!valid) {
                // Silent drop — no pushImage, generation loop will fire again
                return;
              }
            }
          } catch { /* validation error, fall through and show the image */ }
        }

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
    // Local-image mode: skip all network checks, mark ready immediately
    if (hasLocalImages) {
      setAvailable(true);
      return;
    }
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
      const tierMul = getTierProfile().aiImageIntervalMultiplier;
      nextInterval = (GEN_INTERVAL_MIN_BASE + Math.random() * (GEN_INTERVAL_MAX_BASE - GEN_INTERVAL_MIN_BASE)) * tierMul;
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
  }, [enabled, available, generating, triggerGeneration]);

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
            layer.peakStartTime = now;
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
