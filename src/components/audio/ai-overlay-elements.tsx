"use client";

import { glitchRecord } from "@/lib/journeys/glitch-recorder";
import { inBoundarySettle } from "@/lib/journeys/video-activity";

import { useEffect, useRef, useCallback } from "react";
import { getTierProfile } from "@/lib/audio/device-tier";

interface AiOverlayElementsProps {
  /** Current AI image URL from the main AiImageLayer */
  imageUrl: string | null;
  enabled: boolean;
  phase: string;
  journeyId?: string;
  /** Conductor intensity — clones follow the music like every other
   *  layer (boundary forensics 2026-09-28: FIVE 0.5-opacity clones
   *  were live at a quiet journey ending, then all purged at once). */
  intensity?: number;
}

/** Base max simultaneous active clones on screen — multiplied by tier.cloneScale. */
const MAX_CLONES_BASE = 5;

/** Base probability of creating a clone when a new image arrives — multiplied by tier.cloneScale. */
const CLONE_PROBABILITY_BASE = 1.0;

/** Base interval to spawn clones from the last image even without new images arriving.
 *  On lower tiers this is divided by cloneScale (so 0.5 scale = 7000ms interval). */
const RESPAWN_INTERVAL_BASE = 3500;

let cloneIdCounter = 0;

interface CloneRecord {
  id: number;
  styleEl: HTMLStyleElement;
  el: HTMLDivElement;
}

export function AiOverlayElements({
  imageUrl,
  enabled,
  phase,
  journeyId,
  intensity = 1,
}: AiOverlayElementsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeClonesRef = useRef<CloneRecord[]>([]);
  // Initialize as undefined so the first journey load triggers the purge
  // effect — otherwise prev would equal current on first mount and any
  // stale clones from a previous mount/HMR could survive.
  const intensityRef = useRef(intensity);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);
  const prevJourneyRef = useRef<string | undefined>(undefined);
  const prevPhaseRef = useRef(phase);
  const imageCountRef = useRef(0);
  const lastImageUrlRef = useRef<string | null>(null);
  const respawnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Soft purge — fade clones out over 1.5s then remove. Used on
   *  journey change so overlay elements don't snap-disappear; they
   *  drift away as the new journey's elements come in. */
  const purgeAll = useCallback(() => {
    // 8s — matches the collage layers' boundary fade so the whole
    // image world dims as ONE slow motion, not two speeds.
    const FADE_MS = 8000;
    // BATCHED read phase then write phase — the old per-clone
    // capture->pin->reflow forced FIVE synchronous layouts inside the
    // journey-change tick (part of the recorded 177ms handoff stall,
    // session 1ebs19). One reflow total now.
    const clones = activeClonesRef.current;
    const pinned = clones.map((c) => getComputedStyle(c.el).opacity);
    clones.forEach((c, i) => {
      glitchRecord("clone-purge", `pinned=${pinned[i]}`);
      c.el.style.animation = "none";
      c.el.style.opacity = pinned[i];
    });
    if (clones.length > 0) void clones[0].el.offsetWidth; // single reflow
    for (const c of clones) {
      const { el, styleEl } = c;
      el.style.transition = `opacity ${FADE_MS}ms ease-out`;
      el.style.opacity = "0";
      setTimeout(() => {
        el.remove();
        styleEl.remove();
      }, FADE_MS + 100);
    }
    activeClonesRef.current = [];
  }, []);

  /** Create a clone that "lifts off" from a random region of the AI image */
  const spawnClone = useCallback(
    (src: string) => {
      const container = containerRef.current;
      if (!container) return;
      // Boundary settle: a 40%-viewport clone fading in during the
      // title card was the un-conducted mover at every handoff
      // (headless run eog2tz: clone-spawn 300ms after journey-change).
      if (inBoundarySettle()) return;
      const tier = getTierProfile();
      // Conducted census: quiet passages hold at most one clone, the
      // build two, only the climax earns the full tier count.
      const t = intensityRef.current;
      const conductedCap = t < 0.4 ? 1 : t < 0.6 ? 2 : Number.POSITIVE_INFINITY;
      const maxClones = Math.min(conductedCap, Math.max(1, Math.round(MAX_CLONES_BASE * tier.cloneScale)));
      if (activeClonesRef.current.length >= maxClones) return;

      const id = ++cloneIdCounter;
      glitchRecord("clone-spawn", src.split("/").pop() ?? "");

      // Pick a random focal point — avoid edges, favor off-center
      const focalX = 15 + Math.random() * 70; // 15-85% from left
      const focalY = 15 + Math.random() * 70; // 15-85% from top

      // Clone size: 35-55% of viewport
      const sizeVw = 35 + Math.random() * 20;
      const sizeVh = sizeVw * 0.85; // slightly shorter than wide

      // Drift direction and distance
      const driftAngle = Math.random() * Math.PI * 2;
      const driftDist = 40 + Math.random() * 60; // 40-100px
      const driftX = Math.cos(driftAngle) * driftDist;
      const driftY = Math.sin(driftAngle) * driftDist;

      // Timing
      const totalDuration = 16 + Math.random() * 8; // 16-24s — longer lifetime for more overlap

      // Keyframe percentages
      const fadeInEnd = 22; // 22% — longer fade in so clones never pop
      const dissolveStart = 65; // 65% = start dissolving — generous peak hold
      // 100% = fully gone

      const animName = `clone-drift-${id}`;
      const keyframes = `
        @keyframes ${animName} {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.0) translate(0px, 0px);
            filter: blur(0px);
          }
          ${fadeInEnd}% {
            opacity: 0.55;
            transform: translate(-50%, -50%) scale(1.03) translate(${driftX * 0.1}px, ${driftY * 0.1}px);
            filter: blur(0px);
          }
          ${dissolveStart}% {
            opacity: 0.5;
            transform: translate(-50%, -50%) scale(1.15) translate(${driftX * 0.6}px, ${driftY * 0.6}px);
            filter: blur(2px);
          }
          85% {
            opacity: 0.2;
            transform: translate(-50%, -50%) scale(1.25) translate(${driftX * 0.85}px, ${driftY * 0.85}px);
            filter: blur(8px);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.35) translate(${driftX}px, ${driftY}px);
            filter: blur(14px);
          }
        }
      `;

      const styleEl = document.createElement("style");
      styleEl.textContent = keyframes;
      document.head.appendChild(styleEl);

      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        left: `${focalX}%`,
        top: `${focalY}%`,
        width: `${sizeVw}vw`,
        height: `${sizeVh}vh`,
        backgroundImage: `url(${src})`,
        backgroundSize: "100vw 100vh",
        backgroundPosition: `calc(-1 * ${focalX}vw + ${sizeVw / 2}vw) calc(-1 * ${focalY}vh + ${sizeVh / 2}vh)`,
        backgroundRepeat: "no-repeat",
        WebkitMaskImage:
          "radial-gradient(ellipse at center, rgba(0,0,0,0.7) 15%, rgba(0,0,0,0.3) 35%, transparent 55%)",
        maskImage:
          "radial-gradient(ellipse at center, rgba(0,0,0,0.7) 15%, rgba(0,0,0,0.3) 35%, transparent 55%)",
        pointerEvents: "none",
        opacity: "0",
        willChange: "opacity, transform, filter",
        animation: `${animName} ${totalDuration}s ease-in-out forwards`,
      });

      container.appendChild(el);

      const record: CloneRecord = { id, styleEl, el };
      activeClonesRef.current.push(record);

      // Auto-cleanup after animation ends
      setTimeout(
        () => {
          el.remove();
          styleEl.remove();
          activeClonesRef.current = activeClonesRef.current.filter(
            (c) => c.id !== id
          );
        },
        totalDuration * 1000 + 300
      );
    },
    []
  );

  // Handle journey change — purge everything
  useEffect(() => {
    if (journeyId !== prevJourneyRef.current) {
      prevJourneyRef.current = journeyId;
      purgeAll();
      imageCountRef.current = 0;
      lastImageUrlRef.current = null;
    }
  }, [journeyId, purgeAll]);

  // Handle phase change — reset image counter so first images of new phase get clones
  useEffect(() => {
    if (phase !== prevPhaseRef.current) {
      prevPhaseRef.current = phase;
      imageCountRef.current = 0;
    }
  }, [phase]);

  // React to new images from AiImageLayer
  useEffect(() => {
    if (!enabled || !imageUrl) return;

    imageCountRef.current++;
    lastImageUrlRef.current = imageUrl;

    // Every new image spawns a clone (tier-scaled) — keeps constant motion so
    // scenes never feel like a slideshow. Subtle by design: clones peak at 0.55 opacity.
    const tier = getTierProfile();
    if (Math.random() > CLONE_PROBABILITY_BASE * tier.cloneScale) return;

    spawnClone(imageUrl);
  }, [imageUrl, enabled, spawnClone]);

  // Respawn timer — keeps clones alive even when no new images arrive
  useEffect(() => {
    if (!enabled) {
      if (respawnTimerRef.current) clearInterval(respawnTimerRef.current);
      return;
    }

    const tier = getTierProfile();
    const tierMax = Math.max(1, Math.round(MAX_CLONES_BASE * tier.cloneScale));
    // Lower tier = longer interval. Multiply, not divide, so weak hardware spawns less often.
    const tierInterval = RESPAWN_INTERVAL_BASE / Math.max(0.2, tier.cloneScale);
    respawnTimerRef.current = setInterval(() => {
      const url = lastImageUrlRef.current;
      if (!url) return;
      if (activeClonesRef.current.length >= tierMax) return;
      spawnClone(url);
    }, tierInterval);

    return () => {
      if (respawnTimerRef.current) clearInterval(respawnTimerRef.current);
    };
  }, [enabled, spawnClone]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      purgeAll();
      if (respawnTimerRef.current) clearInterval(respawnTimerRef.current);
    };
  }, [purgeAll]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    />
  );
}
