"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getRealtimeImageService } from "@/lib/journeys/realtime-image-service";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { getGhostAngelTheme } from "@/lib/journeys/ghost-flash-images";
import { GHOST_ANGEL_WHITE, GHOST_ANGEL_BLACK, GHOST_ANGEL_WINGLESS_WHITE, GHOST_ANGEL_MARKER, GHOST_ANGEL_WINGLESS_MARKER, GHOST_NEGATIVE_PROMPT, getGhostAgeForPhase, getGhostOverlayForPhase } from "@/lib/journeys/journeys";
import { getDislikedImagePhrases } from "@/lib/journeys/adaptive-engine";
import { createSeededRandom } from "@/lib/journeys/seeded-random";
import { getTierProfile } from "@/lib/audio/device-tier";
import { useAudioStore } from "@/lib/audio/audio-store";
import { glitchRecord, glitchFlush } from "@/lib/journeys/glitch-recorder";
import { isVideoActive, markVideoActive, markJourneyBoundary, inBoundarySettle } from "@/lib/journeys/video-activity";

interface AiImageLayerProps {
  /** AI prompt for image generation */
  prompt: string;
  /** Composition conductor (Karel 2026-09-28 review — "too busy, all the
   *  highest layering all of the time"): the journey's interpolated
   *  phase intensity (0-1). Drives how many image layers may coexist,
   *  how fast new ones arrive, and how much Ken Burns motion they get.
   *  Quiet phases = fewer, stiller images; the climax earns the rest. */
  intensity?: number;
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
  /** Imagery-budget share (0-1). When the depth-parallax base is active it
   *  takes part of the imagery budget, and this scales the collage down so
   *  imagery NEVER doubles up and buries the shaders (Karel 2026-09-26:
   *  "shaders need to be on average 50% of the experience"). */
  imageryScale?: number;
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
  /** Still image OR a living video loop (Wave 2, 2026-09-25) — canvas
   *  drawImage handles both; videos are muted, looping, playsInline. */
  img: HTMLImageElement | HTMLVideoElement;
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
  /** Graceful 8s boundary fade (installation journey change) */
  boundaryFade?: boolean;
  /** Per-layer fade-in override — settle-born layers ease in over 8s. */
  fadeInMs?: number;
}

// Pacing — spec v3 §6: slow crossfades and long tails so images BUILD
// and interweave into the "infinite surreal collage" feel the user
// asked for. 6s fade in, 4s peak, 10s long fade-out tail, new image
// every ~7s. Total life 20s with ~3 images overlapping at any time.
const DISSOLVE_DURATION = 6000;
const FADEOUT_DURATION = 10000;
const PURGE_FADEOUT_DURATION = 1500; // snappy clear when a new journey begins
// Installation boundary fade (Karel 2026-09-26: Snowflake's ice lingered
// into Realized): old-journey stills fade over 8s — long enough that the
// new journey's first image lands first (no void), short enough that no
// cross-journey imagery survives past the first breath.
const BOUNDARY_FADEOUT_DURATION = 8000;
const MIN_PEAK_DURATION = 7000; // Karel 2026-09-28: no "really fast images coming in only to transition out fast"
const GEN_INTERVAL_MIN_BASE = 6500;
const GEN_INTERVAL_MAX_BASE = 7500;
const POETRY_GEN_DELAY = 1500; // 1.5s after new poetry line — react faster
const PROMPT_DEBOUNCE = 1500; // 1.5s debounce on prompt changes
// Ken Burns rebuilt 2026-09-25 (frontier deep-dive): the old 50s cycle on a
// ~20s layer life yielded ~1.5% zoom — imperceptible, "a slideshow". The
// cycle now matches the layer's actual life so every image completes a
// visible cinematic move (10-22% scale travel), and direction alternates
// between push-in and pull-back for shot variety.
const KEN_BURNS_DURATION = 22; // seconds — matches ~20s layer life
// Layer count and concurrency are device-tier driven (see getTierProfile).
// Resolved per-render via the tier profile so values stay in sync with the
// rest of the perf budget (bloom, particles, gen cadence).

// Cinematic POV + interpretation/mood vocabularies live in
// prompt-decoration.ts, shared with the offline harvest script so
// pre-baked images use the identical prompt assembly.
import { CINEMATIC_PERSPECTIVES, PROMPT_INTERPRETATIONS, PROMPT_MOODS, tramokyoGradeForPhase } from "@/lib/journeys/prompt-decoration";
import { packImageIndexForProgress } from "@/lib/journeys/pack-image-allocation";

// Figures removed — Ghost journey has its own figure prompts baked into aiPrompts.
// All other journeys generate imagery from their aiPrompt only.

// ── Offline pack imagery (Tramokyo kiosk) ──
// When the server runs with OFFLINE_PACK=1, /api/pack/local-images maps
// journey ids → pre-harvested image URLs, letting built-in journeys use
// packed imagery instead of live fal. Online the route 404s → null,
// fetched once per session (shared with device-tier's installation probe).
import { fetchPackLocalImages, isPackActive } from "@/lib/offline/pack-client";

// ── Opportunistic live fal on the kiosk ──
// Packed images are the guaranteed backbone; when the desert hotspot is
// actually up, every other gen tick ALSO fires a live fal request as a
// bonus layer. Failures cost nothing visually (the local image already
// pushed) and back off for 2 minutes. Requires FAL_KEY in the kiosk env;
// live attempts respect the image service's session cost cap.
const LIVE_OVERLAY_BACKOFF_MS = 120_000;
let liveOverlayEnabled: boolean | null = null;
let liveOverlayBackoffUntil = 0;
let liveOverlayTick = 0;
function shouldAttemptLiveOverlay(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (performance.now() < liveOverlayBackoffUntil) return false;
  if (liveOverlayEnabled === null) {
    liveOverlayEnabled = false; // pessimistic until the status check lands
    getRealtimeImageService()
      .checkAvailability()
      .then((ok) => { liveOverlayEnabled = ok; });
    return false;
  }
  if (!liveOverlayEnabled) return false;
  return liveOverlayTick++ % 2 === 0;
}

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
  imageryScale = 1,
  onFirstImage,
  promptSeed,
  journeyId,
  onImageReady,
  localImageUrls,
  intensity = 1,
}: AiImageLayerProps) {
  // Conductor state — ref so the RAF/interval closures always see the
  // live phase intensity without rebuilding.
  const intensityRef = useRef(intensity);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);
  /** How many image layers the current musical moment supports. The old
   *  behavior (tier cap always — 8 on high, 12 on installation) is what
   *  read as "a wall of moving images" (Karel 2026-09-28). */
  const conductedMaxLayers = useCallback(() => {
    const t = intensityRef.current;
    // Solo band: at opening/integration quiet (<0.35) exactly ONE image
    // holds the frame — the crisp asymmetric negative-space moment
    // (Karel 2026-09-28 design principle).
    const cap = t < 0.4 ? 1 : t < 0.6 ? 2 : t < 0.85 ? 3 : 4; // solo band widened 2026-09-28
    return Math.min(getTierProfile().maxAiLayers, cap);
  }, []);
  // Video spotlight (Karel 2026-09-28: "the morphs are amazing and a
  // lot of great detail gets lost... because of effects"): while a
  // living clip is playing, the imagery canvas eases up toward 0.8 so
  // the film reads clearly through the shader wash, then settles back.
  // Hooks live up here with the rest (rules-of-hooks).
  const [videoSpotlight, setVideoSpotlight] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const active = layersRef.current.some(
        (l) => !("complete" in l.img) && l.state !== "fading-out" && !(l.img as HTMLVideoElement).ended,
      );
      setVideoSpotlight((prev) => {
        if (prev !== active) glitchRecord("spotlight", active ? "on" : "off");
        return prev === active ? prev : active;
      });
    }, 500);
    return () => clearInterval(id);
  }, []);
  const [packUrls, setPackUrls] = useState<string[] | null>(null);
  // ── Living video loops (Wave 2 pilot) ──
  // /tramokyo-pack/local-clips.json maps journeyId → { phaseIdx: clipUrl }.
  // Static file in the pack — offline-safe, 404s to null online.
  const clipsRef = useRef<Record<string, Record<string, string | { h264: string; hevc?: string }>> | null>(null);
  // HEVC main10 kills gradient banding at the source (10-bit); Chrome on
  // macOS hardware-decodes it. Fall back to the 8-bit H.264 elsewhere.
  const canHevcRef = useRef<boolean | null>(null);
  const lastClipPhaseRef = useRef<number>(-1);
  const heroPushedForRef = useRef<number>(-1);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingMorphRef = useRef<{ forPhase: number; url: string } | null>(null);
  const journeyEpochRef = useRef(0);
  const journeyChangeAtRef = useRef(0);
  useEffect(() => {
    // Correctness audit 2026-09-25 #2: isPackActive() is synchronously false
    // at mount (probe still in flight), which permanently disabled clips.
    // Fetch unconditionally — the file 404s online and the catch handles it.
    fetch("/tramokyo-pack/local-clips.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { clipsRef.current = m; })
      .catch(() => { clipsRef.current = null; });
  }, []);
  const hasPropLocalImages = Array.isArray(localImageUrls) && localImageUrls.length > 0;
  useEffect(() => {
    if (hasPropLocalImages || !journeyId) return;
    let cancelled = false;
    fetchPackLocalImages().then((map) => {
      if (cancelled) return;
      const urls = map?.[journeyId];
      setPackUrls(urls && urls.length > 0 ? urls : null);
    });
    return () => { cancelled = true; };
  }, [journeyId, hasPropLocalImages]);

  const effectiveLocalUrls = hasPropLocalImages ? localImageUrls! : packUrls ?? [];
  const hasLocalImages = effectiveLocalUrls.length > 0;
  const localImageUrlsRef = useRef(effectiveLocalUrls);
  useEffect(() => {
    localImageUrlsRef.current = effectiveLocalUrls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localImageUrls, packUrls]);
  const localImageIndexRef = useRef(0);
  // Last phase-mapped pack index pushed — slow phases hold a frame
  // across multiple 7s ticks, so redundant pushes are skipped.
  const lastPackIndexRef = useRef(-1);
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
      // Soft reset on journey change: cancel anything in-flight from the
      // previous journey (so wrong-prompt images don't deliver), clear
      // cache + callbacks. THEN mark every still-visible layer as
      // purge-fading so the old journey's imagery smoothly fades out
      // over PURGE_FADEOUT_DURATION (1.5s) instead of either dropping
      // abruptly OR sitting at full opacity for the 5+s before the
      // new journey's first image lands. Without the purge, layers
      // only fade when displaced by a new image at capacity — which
      // means a long visible gap of old imagery that suddenly
      // disappears as new ones cycle in.
      const service = getRealtimeImageService();
      service.cancelInFlight();
      service.clearImageCache();
      service.clearFrameCallback();
      promptChangeTimeRef.current = performance.now();
      lastGenTimeRef.current = 0;
      genCountRef.current = 0;
      firstImageFiredRef.current = false;
      // 2026-09-19 audit: the pack-cadence refs must reset per journey.
      // Without this, journey B's first phase-mapped index (often 0)
      // equals journey A's last, the dedupe skips the push, and — since
      // installation mode never purges — journey A's imagery lingers
      // over journey B until progress crosses into slice 1.
      lastPackIndexRef.current = -1;
      localImageIndexRef.current = 0;
      lastClipPhaseRef.current = -1; // clips re-arm per journey
      heroPushedForRef.current = -1;
      pendingMorphRef.current = null;
      glitchRecord("journey-change", `${prevJourneyId ?? "-"} -> ${journeyId}`);
      glitchFlush("journey-change");
      // Boundary freeze protocol: open the settle window for the title
      // seconds — parallax holds, post glides slowly, no clips.
      if (prevJourneyId != null) markJourneyBoundary(10500);
      journeyEpochRef.current++;
      journeyChangeAtRef.current = performance.now();
      activeVideoRef.current = null;
      pendingVideoRef.current = null;
      // Same staleness class for STILLS (2026-09-27): a 400ms gen tick can
      // land between the journey-id change and the new journey's pack URLs
      // resolving, pushing old-journey stills under the new journey's
      // phases. Drop them synchronously; the pack fetch effect repopulates
      // (cached promise — resolves in a microtask).
      if (!hasPropLocalImages) {
        localImageUrlsRef.current = [];
        setPackUrls(null);
      }

      // Installation (Tramokyo): NEVER purge to black between journeys —
      // the previous journey's imagery holds until the new journey's
      // first (local pack) image displaces it, so transitions crossfade
      // image→image with no void window (Karel 2026-08-30). The main
      // app keeps the purge for prompt correctness.
      const skipPurge = useAudioStore.getState().installationMode;
      const now = performance.now();
      const existingLayers = layersRef.current;
      for (const layer of existingLayers) {
        // Installation: old-journey stills get the graceful BOUNDARY fade
        // (Karel 2026-09-26 — ice from Snowflake was lingering minutes
        // into Realized under the old keep-forever rule); videos always
        // fade normally (decoder hygiene).
        if (skipPurge && "complete" in layer.img) {
          if (layer.state !== "fading-out") {
            layer.fadeStartOpacity = layer.opacity;
            layer.state = "fading-out";
            layer.fadeStartTime = now;
            layer.boundaryFade = true;
          }
          continue;
        }
        if (layer.state !== "fading-out") {
          layer.fadeStartOpacity = layer.opacity;
          layer.state = "fading-out";
          layer.fadeStartTime = now;
          layer.purge = true;
        }
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

  /** Release a media element's decoder + buffers (perf audit C1). Stills no-op. */
  const releaseMedia = useCallback((m: HTMLImageElement | HTMLVideoElement) => {
    if ("complete" in m) return;
    try { m.pause(); m.removeAttribute("src"); m.load(); } catch { /* torn down */ }
    if (activeVideoRef.current === m) activeVideoRef.current = null;
    if (pendingVideoRef.current === m) pendingVideoRef.current = null;
  }, []);

  // Push new image onto the layer stack — keeps 2-3 images visible simultaneously.
  // Only the OLDEST layer fades out when at capacity; recent layers stay at peak.
  // This creates a sense of video — imagery is always moving and always in transition.
  const pushImage = useCallback((img: HTMLImageElement | HTMLVideoElement): boolean => {
    const service = getRealtimeImageService();
    // Only stills enter the LRU cache — videos are pack-local loops.
    if ("complete" in img) service.cacheImage(promptRef.current, img);

    // Signal parent that first AI image is ready (for intro gating)
    if (!firstImageFiredRef.current) {
      firstImageFiredRef.current = true;
      onFirstImageRef.current?.();
    }

    // Notify overlay layer of new image — STILLS ONLY (correctness #10:
    // an .mp4 src spawns an invisible clone that squats a clone slot).
    if ("complete" in img) onImageReadyRef.current?.(img.src);

    const layers = layersRef.current;
    const now = performance.now();

    // Evict fully invisible layers first
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].opacity <= 0 && layers[i].state === "fading-out") {
        releaseMedia(layers[i].img);
        layers.splice(i, 1);
      }
    }

    // Only fade out the OLDEST visible layer when at capacity —
    // but skip layers that haven't held at peak for MIN_PEAK_DURATION yet.
    // If nothing can be evicted, drop the incoming image (next gen will try again).
    if (layers.length >= conductedMaxLayers()) {
      // Never cut a layer mid-entrance (Karel 2026-09-28: "right after
      // the text an image dropped"): a fading-in layer is only evictable
      // once it's been arriving for 2.5s+. If nothing can gracefully
      // leave, the INCOMING image waits — dropping something the viewer
      // hasn't seen yet is invisible; dropping a half-born one is a glitch.
      const oldestVisible = layers.find((l) =>
        (l.state === "fading-in" && now - l.fadeStartTime >= 2500) ||
        (l.state === "peak" && now - l.peakStartTime >= MIN_PEAK_DURATION)
      );
      if (oldestVisible) {
        glitchRecord("layer-evict", `cap=${conductedMaxLayers()}`);
        oldestVisible.fadeStartOpacity = oldestVisible.opacity;
        oldestVisible.state = "fading-out";
        oldestVisible.fadeStartTime = now;
        // NOTE: createdTime is NOT touched — Ken Burns continues smoothly
      } else {
        // All visible layers are still within their minimum peak hold — drop incoming image
        return false;
      }
    }

    // Hard cap: if still over limit after starting a fade, force-remove oldest fading
    if (layers.length >= conductedMaxLayers() + 1) {
      // Never hard-remove a layer the viewer can still see — a splice at
      // opacity 0.5 IS the "image drops out" glitch. Visible layers keep
      // fading; the momentary cap overshoot costs one extra drawImage.
      const oldestFadingIdx = layers.findIndex((l) => l.state === "fading-out" && l.opacity <= 0.05);
      if (oldestFadingIdx >= 0) {
        releaseMedia(layers[oldestFadingIdx].img);
        layers.splice(oldestFadingIdx, 1);
      }
    }

    // Randomize Ken Burns params for visual variety
    // Favor source-over — screen/lighten between layers can cause additive blow-out
    const roll = Math.random();
    const blendMode: GlobalCompositeOperation = roll < 0.65 ? "source-over" : roll < 0.85 ? "screen" : "lighten";
    const isVideo = !("complete" in img);
    // Conductor (Karel 2026-09-28): motion follows the music. Quiet
    // phases get a gentle drift, the climax gets the full cinematic
    // move — and VIDEOS play STILL: they carry their own generated
    // motion, and panning/scaling a playing 1080p clip both compounds
    // the nausea and is a prime frame-stutter suspect.
    // Karel 2026-09-28 (final motion law): the base state is a STILL,
    // crisp image — no Ken Burns at all below the build. Movement is
    // earned: gentle drift in the build, the full cinematic move only
    // near the climax. Videos always render static (their motion is
    // in the file).
    const t0 = intensityRef.current;
    // Full cinematic move is earned by the ARC, not a breath-wave peak:
    // sqxfce pushed motion=1.00 images at p0.30 (the wave crested to
    // 0.85+ a third of the way in) — Karel: "a big image came in and
    // moved... I don't want really fast images". The full move needs
    // both climax intensity AND the journey's second half.
    const { currentTime: mCur, duration: mDur } = useAudioStore.getState();
    const mProg = mDur > 0 ? mCur / mDur : 0;
    const motionScale = isVideo ? 0 : t0 < 0.6 ? 0 : t0 < 0.85 ? 0.35 : mProg > 0.45 ? 1 : 0.35;
    // Visible cinematic travel: up to 10-22% scale change per layer life,
    // alternating push-in and pull-back. Still-image endpoints stay ≥1.06
    // so cover-fit always overflows and the pan never exposes an edge;
    // videos render at exact cover with zero pan.
    const travel = (0.10 + Math.random() * 0.12) * motionScale;
    const pushIn = Math.random() < 0.6; // 60% push in, 40% pull back
    const nearScale = isVideo ? 1.0 : 1.06 + Math.random() * 0.04; // 1.06-1.10
    const scaleStart = pushIn ? nearScale : nearScale + travel;
    const scaleEnd = pushIn ? nearScale + travel : nearScale;
    const panX = (Math.random() - 0.5) * 2 * motionScale; // -1 to 1, conducted
    const panY = (Math.random() - 0.5) * 2 * motionScale;

    glitchRecord(isVideo ? "layer-push-video" : "layer-push-still", `n=${layers.length + 1} motion=${motionScale.toFixed(2)}`);
    layers.push({
      img,
      // Boundary settle: the new journey's first still must EASE in over
      // 8s, matching the outgoing 8s fades — recorded firsthand
      // (frames f0203-f0204, session 1ebs19): Realized's ember still
      // popped in at the right edge on the default fade = Karel's
      // "lower right quick increase in brightness".
      fadeInMs: !isVideo && inBoundarySettle() ? 8000 : undefined,
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
    return true;
  }, [releaseMedia, conductedMaxLayers]);

  // Trigger an image generation (REST)
  // skipCache=true for periodic refreshes (same prompt, want new image)
  const triggerGeneration = useCallback((skipCache = false) => {
    // ── Local-image mode: packed URLs instead of calling fal.ai ──
    // The packed image always pushes (guaranteed cadence); when the
    // hotspot is reachable we fall through and ALSO fire a live fal gen
    // as a bonus layer on top of the packed backbone.
    //
    // PHASE-AWARE SELECTION (2026-09-19): pack images are generated in
    // phase order with weighted per-phase counts, so the story position
    // is encoded in the slot index. Selecting by playback progress +
    // phase slice keeps the journey's narrative aligned with the music
    // — a blind fixed-cadence cycle runs ahead of weighted allocations
    // and plays the arc out of order (Ghost's storyline appeared
    // "almost backwards" to Karel). Falls back to sequential cycling
    // when progress/phases are unavailable.
    const isPackOverlay = localImageUrlsRef.current.length > 0;
    if (isPackOverlay) {
      const urls = localImageUrlsRef.current;
      const { currentTime, duration } = useAudioStore.getState();
      const progress = duration > 0 ? currentTime / duration : -1;
      // Boundary quiet zone (Karel 2026-09-28: "not allow new elements
      // to come in at a certain point... the outcome we want is pure
      // seamlessness"): nothing new is born in the final 4% — whatever
      // is already alive plays through and hands off via the boundary
      // crossfades.
      if (progress > 0.96) return;
      // Morph quiet window (z2wg4u: layer-evict + still-push 9ms before
      // a 108ms frame gap while a morph eased out): still churn waits
      // the few seconds a clip is visible — a decode stall on held
      // stills is invisible, one under playing video is a glitch.
      if (isVideoActive()) return;
      // One mover at a time (sqxfce forensics): a still push + parallax
      // upload landing within 2.5s of a shader switch stacks stalls
      // into a visible hitch on whatever is moving. The imagery yields.
      if (getJourneyEngine().getMsSinceAnySwitch() < 2500) return;
      // Handoff holdoff: the journey-change tick itself stalls ~180ms
      // (purges + engine restart + title mount) — the first new still
      // waits out that window so its birth isn't part of the pile-up.
      if (performance.now() - journeyChangeAtRef.current < 1500) return;
      const journeyPhases = getJourneyEngine().getJourney()?.phases;
      // Phase mapping applies only to PACK-harvested lists (generated in
      // phase order with the tramokyo weights). Curated prop-supplied
      // localImageUrls (local-image journey mode) have no phase encoding
      // — they keep the classic sequential cycle (2026-09-19 audit).
      let idx = hasPropLocalImages
        ? -1
        : packImageIndexForProgress(journeyPhases, urls.length, progress);
      if (idx < 0) {
        idx = localImageIndexRef.current % urls.length;
        localImageIndexRef.current = idx + 1;
      }
      lastGenTimeRef.current = performance.now();
      // Slow phases have fewer images than 7s ticks — holding the same
      // frame is intentional; skip the redundant push.
      if (idx !== lastPackIndexRef.current) {
        lastPackIndexRef.current = idx;
        const stillUrl = urls[idx];
        loadImage(stillUrl)
          .then((img) => {
            if (pushImage(img)) glitchRecord("still", stillUrl.split("/").pop() ?? "");
            // Feed the depth-parallax base layer (it no-ops without depth
            // coverage) — STAGGERED 1.5s behind the collage push: the
            // texture upload (2x 1024^2) landing in the same frame as the
            // collage's first draw stacked into one visible stall.
            if (stillUrl.includes("/images/journeys/")) {
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("resonance:pack-still", {
                  detail: {
                    src: stillUrl,
                    depthSrc: stillUrl.replace("/images/journeys/", "/depth/journeys/").replace(/\.jpg(\?.*)?$/, ".png"),
                  },
                }));
              }, 1500);
            }
          })
          .catch(() => { /* broken URL, skip */ });
      }

      // ── Living video (Wave 2, rebuilt after 2026-09-25 audits): travel
      // morphs at phase boundaries + hero loops within phases. High tier
      // only; one video pending/active at a time; every element released.
      // 2026-09-27 review (Johnny/Joseph): read the id via ref, NOT the
      // prop. This callback's deps intentionally omit journeyId, and in
      // the installation loop the layer never remounts across journeys —
      // so the prop capture froze the clip set at the mount-time journey
      // (Snowflake's clips played through the entire set). The fal path
      // already reads journeyIdRef; clips must too.
      const clipJourneyId = journeyIdRef.current;
      const clips = clipJourneyId ? clipsRef.current?.[clipJourneyId] : null;
      // No morphs in the journey's final act (Karel 2026-09-28: the
      // p0.93 morph "comes in and then sits and is kind of a blob") —
      // the ending belongs to held stills easing toward the boundary.
      // And none during the boundary settle window after a handoff.
      if (clips && journeyPhases && progress >= 0 && progress <= 0.85 && !inBoundarySettle() && getTierProfile().maxAiLayers >= 8) {
        // (2026-09-28b: the >=0.5 intensity gate here was meant for hero
        // clips — now disabled entirely — but also delayed early travel
        // morphs. Morphs are phase transitions; they always play.)
        // Correctness #1: phase.start/end are NORMALIZED 0-1 fractions —
        // the old seconds comparison never matched and the feature was dead.
        let phaseIdx = -1;
        for (let i = 0; i < journeyPhases.length; i++) {
          const ph = journeyPhases[i] as { start?: number; end?: number };
          if (typeof ph.start !== "number" || typeof ph.end !== "number") continue;
          const isLast = i === journeyPhases.length - 1;
          if (progress >= ph.start && (progress < ph.end || (isLast && progress <= 1))) { phaseIdx = i; break; }
        }
        if (canHevcRef.current === null) {
          const probe = document.createElement("video");
          canHevcRef.current = probe.canPlayType('video/mp4; codecs="hvc1.2.4.L120.B0"') !== "";
        }
        const pick = (e?: string | { h264: string; hevc?: string }) =>
          typeof e === "string" ? e : e ? (canHevcRef.current && e.hevc ? e.hevc : e.h264) : undefined;
        const pushVideoUrl = (url: string, onRejected?: () => void) => {
          const epoch = journeyEpochRef.current;
          const v = document.createElement("video");
          v.muted = true;
          v.loop = false; // play once, hold last frame — restarts visibly jump
          v.playsInline = true;
          v.preload = "auto";
          v.src = url;
          pendingVideoRef.current = v; // synchronous — busy is honest (#8)
          v.addEventListener("error", () => {
            if (pendingVideoRef.current === v) pendingVideoRef.current = null;
            releaseMedia(v);
            onRejected?.(); // re-arm so the phase can retry (#9)
          }, { once: true });
          v.addEventListener("canplay", () => {
            if (pendingVideoRef.current === v) pendingVideoRef.current = null;
            if (journeyEpochRef.current !== epoch) { releaseMedia(v); return; } // stale journey (C3)
            if (!pushImage(v)) { releaseMedia(v); onRejected?.(); return; } // stack full (C2)
            glitchRecord("clip", url.split("/").pop() ?? url);
            activeVideoRef.current = v;
            // Quiet window for the whole visible life of the clip:
            // playback + the long ended-fade, plus a settle margin.
            markVideoActive(((Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5) * 1000) + 4500);
            // Karel 2026-09-28: a snowing clip that "just comes to a
            // stop" reads as a glitch. When the video ends, ease the
            // layer out over the normal long fade instead of freezing.
            v.addEventListener("ended", () => {
              glitchRecord("video-ended");
              markVideoActive(4000); // cover the ease-out fade
              const layer = layersRef.current.find((l) => l.img === v);
              if (layer && layer.state !== "fading-out") {
                layer.fadeStartOpacity = layer.opacity;
                layer.state = "fading-out";
                layer.fadeStartTime = performance.now();
              }
            }, { once: true });
            v.play().catch(() => { /* autoplay policy — holds first frame */ });
          }, { once: true });
          v.load();
        };
        const busyNow = () => {
          if (pendingVideoRef.current) return true;
          const av = activeVideoRef.current;
          return !!av && !av.ended && layersRef.current.some((l) => l.img === av);
        };

        const prevPhase = lastClipPhaseRef.current;
        if (phaseIdx >= 0 && phaseIdx !== prevPhase) {
          lastClipPhaseRef.current = phaseIdx;
          heroPushedForRef.current = -1; // new phase — hero re-arms
          const travel = prevPhase >= 0 && phaseIdx === prevPhase + 1
            ? pick(clips["t" + prevPhase] as string | { h264: string; hevc?: string })
            : undefined;
          if (travel) pendingMorphRef.current = { forPhase: phaseIdx, url: travel };
        }
        // Morph first (retried across ticks if a video was busy — #22).
        // HERO CLIPS DISABLED (Karel 2026-09-28: "i do not want you to
        // use any hero movies... they dont meet my quality bar" — wan's
        // open-ended animation judders even without the 4.83s seam,
        // while Kling's still-to-still morphs are inherently smooth).
        // Journeys are crisp stills; the morphs are the only living
        // video, exactly at phase transitions where motion belongs.
        // Flip HEROES_ENABLED if a better generator earns its way back
        // (sample-before-batch law applies).
        const HEROES_ENABLED = false;
        const morph = pendingMorphRef.current;
        if (morph && morph.forPhase === phaseIdx && !busyNow()) {
          pendingMorphRef.current = null;
          pushVideoUrl(morph.url);
        } else if (!morph || morph.forPhase !== phaseIdx) {
          if (morph) pendingMorphRef.current = null; // phase moved on — drop stale morph
          const heroUrl = HEROES_ENABLED ? pick(clips[String(phaseIdx)] as string | { h264: string; hevc?: string }) : undefined;
          if (heroUrl && phaseIdx >= 0 && heroPushedForRef.current !== phaseIdx && !busyNow()) {
            heroPushedForRef.current = phaseIdx;
            pushVideoUrl(heroUrl, () => { if (heroPushedForRef.current === phaseIdx) heroPushedForRef.current = -1; });
          }
        }
      }

      if (!shouldAttemptLiveOverlay()) return;
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
      const pov = perspectives[Math.floor(rng() * perspectives.length)];
      const interp = PROMPT_INTERPRETATIONS[Math.floor(rng() * PROMPT_INTERPRETATIONS.length)];
      const mood = PROMPT_MOODS[Math.floor(rng() * PROMPT_MOODS.length)];

      variedPrompt = `${basePrompt}, ${pov}, ${interp}, ${mood}, no snowflakes`;
    }
    // Tramokyo kiosk: opportunistic live gens carry the same grade the
    // packed backbone was harvested with, so a live bonus frame never
    // reads as un-graded next to packed imagery. Color/light only, so it
    // also applies on the strict-camera branch.
    if (isPackActive()) {
      variedPrompt = `${variedPrompt}, ${tramokyoGradeForPhase(getJourneyEngine().getCurrentPhase())}`;
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
    // Per-image thumbs feedback loop — append distinctive prompt clauses
    // from past dislikes (scoped to this journey) into the negative
    // prompt, so fal stops producing variants the user already rejected.
    // Uses localStorage, which is admin-synced from DB on page load.
    const dislikedPhrases = getDislikedImagePhrases(activeJourney?.id ?? null);
    const baseNegative = isGhost ? GHOST_NEGATIVE_PROMPT : "";
    const mergedNegative = [baseNegative, ...dislikedPhrases].filter(Boolean).join(", ");
    const negativePrompt = mergedNegative.length > 0 ? mergedNegative : undefined;

    // Per-journey character LoRA — when populated (Ghost gets one
     // trained via scripts/train-ghost-lora.mjs), the server routes
     // to fal-ai/flux-lora so identity holds across every frame
     // without the per-call cost of PuLID.
    const characterLora = activeJourney?.characterLoraUrl ?? undefined;

    service
      .generateFrameREST({
        prompt: variedPrompt,
        denoisingStrength: denoisingRef.current,
        width: 1024,
        height: 1024,
        negativePrompt,
        characterLora: characterLora ?? undefined,
        highQuality: useAudioStore.getState().highQualityImages,
      })
      .then(async (url) => {
        // Kiosk overlay mode: a live result is a bonus, a failure just
        // means the hotspot dropped — back off and let the packed
        // backbone carry the visuals alone for a while.
        if (isPackOverlay) {
          if (!url) {
            liveOverlayBackoffUntil = performance.now() + LIVE_OVERLAY_BACKOFF_MS;
            return;
          }
          liveOverlayBackoffUntil = 0;
        }
        if (!url) {
          // fal returned null. If the service has been failing for 3+
          // consecutive calls, switch to the pre-baked fallback library
          // so the visualizer stays alive during fal outages / network
          // drops / cost-cap exhaustion. No-op if the operator hasn't
          // populated /public/installation-fallback for this journey.
          if (service.isStalling()) {
            try {
              const { pickFallbackImage } = await import("@/lib/journeys/fallback-image-library");
              const fallbackUrl = await pickFallbackImage(requestJourneyId ?? null);
              if (fallbackUrl && journeyIdRef.current === requestJourneyId) {
                const img = await loadImage(fallbackUrl);
                pushImage(img);
              }
            } catch { /* fallback unavailable, freeze on last frame */ }
          }
          return;
        }
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
      .catch(() => {
        if (isPackOverlay) liveOverlayBackoffUntil = performance.now() + LIVE_OVERLAY_BACKOFF_MS;
      })
      .finally(() => { loadingCountRef.current = Math.max(0, loadingCountRef.current - 1); });
  }, [loadImage, pushImage, hasPropLocalImages]);

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

    return () => {
      cancelled = true;
      clearInterval(retryId);
      // 2026-09-19 audit: without clearing the singleton's frame
      // callback, it retains a closure over this unmounted component's
      // whole layer stack (HTMLImageElements included) until the next
      // journey overwrites it.
      try { getRealtimeImageService().clearFrameCallback(); } catch { /* fine */ }
    };
  }, [enabled, hasLocalImages, loadImage, pushImage]);

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
      // Conductor: quiet phases breathe slower — fewer arrivals, longer
      // holds; the climax keeps the full cadence (Karel 2026-09-28).
      const t = intensityRef.current;
      // 2026-09-28c: climax churn was every ~6s (push+evict pairs) —
      // "too abrupt and causes glitches". Each image now breathes
      // longer at every intensity; the static-vs-overwhelm balance
      // lives in MIN_PEAK + cap, not raw turnover speed.
      const paceMul = t < 0.5 ? 1.6 : t < 0.8 ? 1.35 : 1.2;
      nextInterval = (GEN_INTERVAL_MIN_BASE + Math.random() * (GEN_INTERVAL_MAX_BASE - GEN_INTERVAL_MIN_BASE)) * tierMul * paceMul;
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

  // Audio → imagery (2026-09-25): the music finally touches the pictures.
  // Amplitude breathes layer luminance and adds a micro push on the Ken
  // Burns scale; bass leans into the pan rate. Smoothed here (one-pole)
  // so imagery swells with phrases, never twitches — meditative by law.
  const audioRef = useRef({ amp: 0, bass: 0 });
  useEffect(() => {
    const a = audioRef.current;
    a.amp = a.amp * 0.9 + (audioAmplitude || 0) * 0.1;
    a.bass = a.bass * 0.9 + (audioBass || 0) * 0.1;
  }, [audioAmplitude, audioBass]);

  // 60fps render loop — smooth cross-dissolve compositing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastW = 0;
    let lastH = 0;

    // 2026-09-19 audit: this loop used to redraw every display frame
    // (120fps on ProMotion) forever, even with zero layers — a constant
    // compositor load that raises the GPU pressure driving overnight
    // context loss. Cap to the device tier's frame budget and skip the
    // whole draw when there is nothing to composite.
    // 45fps is indistinguishable for slow crossfades + Ken Burns pans
    // and halves the fill cost on 90-120Hz panels.
    const minFrameMs = 1000 / 45;
    let lastDraw = 0;

    function render() {
      if (!canvas || !ctx) return;
      const nowTs = performance.now();
      if (nowTs - lastDraw < minFrameMs || layersRef.current.length === 0) {
        // Still keep the canvas clear when the last layer just vanished.
        if (layersRef.current.length === 0 && lastW > 0) {
          ctx.clearRect(0, 0, lastW, lastH);
          lastW = 0;
          lastH = 0;
        }
        animRef.current = requestAnimationFrame(render);
        return;
      }
      lastDraw = nowTs;

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
          const rawProgress = Math.min(1, elapsed / (layer.fadeInMs ?? DISSOLVE_DURATION));
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
          const fadeDuration = layer.purge ? PURGE_FADEOUT_DURATION : layer.boundaryFade ? BOUNDARY_FADEOUT_DURATION : FADEOUT_DURATION;
          const rawProgress = Math.min(1, elapsed / fadeDuration);
          const easedProgress = easeInOutCubic(rawProgress);
          layer.opacity = layer.fadeStartOpacity * (1 - easedProgress);
          if (rawProgress >= 1) {
            const media = layers[i].img;
            if (!("complete" in media)) {
              try { (media as HTMLVideoElement).pause(); (media as HTMLVideoElement).removeAttribute("src"); (media as HTMLVideoElement).load(); } catch { /* torn down */ }
            }
            layers.splice(i, 1);
            continue;
          }
        }
        // "peak" layers stay at opacity 1 — no change needed
      }

      // Draw surviving layers with Ken Burns pan/zoom.
      // Aspect-preserving COVER fit: fal generates 1024×1024 (square) images
      // but the canvas is whatever size the viewport has — wide on laptop
      // fullscreen, narrow in a resized window, portrait on phone. Drawing
      // with sw=w, sh=h stretched every image to the canvas aspect ratio,
      // which squished pillars vertically in wide windows and stretched
      // them in narrow ones. Now: compute cover dimensions from the image's
      // own aspect ratio so it fills the short axis and overflows on the
      // long one (center-cropped), which matches object-fit: cover.
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const ready = "complete" in layer.img
          ? (layer.img as HTMLImageElement).complete
          : (layer.img as HTMLVideoElement).readyState >= 2;
        if (layer.opacity <= 0.001 || !ready) continue;

        ctx.globalCompositeOperation = i === 0 ? "source-over" : layer.blendMode;
        // Amplitude breathes luminance: quiet passages settle to ~92%,
        // full phrases lift to 100% — a slow living swell, never a flicker.
        // Normalized to the real music range (mean-spectrum amp rarely
        // exceeds ~0.3 — correctness audit #11).
        const lift = Math.min(1, audioRef.current.amp / 0.3);
        ctx.globalAlpha = Math.min(1, layer.opacity * (0.92 + lift * 0.08));

        // Ken Burns: uses createdTime (never reset) for perfectly smooth motion
        const layerAge = (now - layer.createdTime) / 1000;
        const kenBurnsT = Math.min(1, layerAge / KEN_BURNS_DURATION);
        // Ease the Ken Burns motion too for a dreamy feel
        const kenBurnsEased = easeInOutCubic(kenBurnsT);
        // Micro push from amplitude (≤1.2%) rides on top of the authored move.
        const scale = (layer.scaleStart + (layer.scaleEnd - layer.scaleStart) * kenBurnsEased) * (1 + lift * 0.012);
        const maxPan = (scale - 1) * 0.5;
        const panOffsetX = layer.panX * maxPan * kenBurnsEased * w;
        const panOffsetY = layer.panY * maxPan * kenBurnsEased * h;

        // Cover-fit: fill canvas without distorting the image's own aspect.
        const isVideo = !("complete" in layer.img);
        const imgW = (isVideo ? (layer.img as HTMLVideoElement).videoWidth : (layer.img as HTMLImageElement).naturalWidth) || layer.img.width || 1;
        const imgH = (isVideo ? (layer.img as HTMLVideoElement).videoHeight : (layer.img as HTMLImageElement).naturalHeight) || layer.img.height || 1;
        const imgAspect = imgW / imgH;
        const canvasAspect = w / h;
        let baseW: number;
        let baseH: number;
        if (imgAspect > canvasAspect) {
          // Image wider than canvas → match height, overflow sides.
          baseH = h;
          baseW = h * imgAspect;
        } else {
          // Image taller or equal aspect → match width, overflow top/bottom.
          baseW = w;
          baseH = w / imgAspect;
        }
        const sw = baseW * scale;
        const sh = baseH * scale;
        const dx = (w - sw) / 2 + panOffsetX;
        const dy = (h - sh) / 2 + panOffsetY;

        ctx.drawImage(layer.img, dx, dy, sw, sh);
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animRef.current);
      // Perf audit C1: every held video must release its decoder on unmount.
      for (const l of layersRef.current) releaseMedia(l.img);
      layersRef.current = [];
      activeVideoRef.current = null;
      pendingVideoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const baseAiOpacity = shaderOpacity >= 1.0
    ? 0.85
    : Math.max(0.12, Math.min(0.65, 1 - shaderOpacity) * imageryScale);
  const aiLayerOpacity = aiOnly
    ? undefined
    : videoSpotlight
      ? Math.max(baseAiOpacity, 0.62)
      : baseAiOpacity;

  return (
    <canvas
      data-trail-src="1"
      ref={canvasRef}
      data-ai-image-canvas
      className="absolute inset-0 w-full h-full"
      style={
        aiOnly
          ? { zIndex: 2, pointerEvents: "none" }
          : { zIndex: 2, mixBlendMode: "screen", opacity: aiLayerOpacity, transition: "opacity 2600ms ease-in-out", pointerEvents: "none" }
      }
    />
  );
}
