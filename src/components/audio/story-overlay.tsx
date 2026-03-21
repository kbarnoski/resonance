"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import gsap from "gsap";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { createCathedralImpulse, speakLine } from "@/lib/audio/text-overlay-utils";
import type { JourneyPhaseId } from "@/lib/journeys/types";

const PHASE_ORDER: JourneyPhaseId[] = [
  "threshold", "expansion", "transcendence",
  "illumination", "return", "integration",
];

const FRAGMENT_DURATION = 10000; // ms per fragment

const LOADING_MESSAGES = [
  "composing your story...",
  "weaving the narrative...",
  "almost ready...",
];

/** Split paragraph text into sentence-level fragments */
function splitIntoFragments(text: string): string[] {
  // Split on sentence endings followed by space or end
  const raw = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (raw.length === 0) return [text];
  // Merge very short fragments with the next one
  const merged: string[] = [];
  for (const fragment of raw) {
    if (merged.length > 0 && merged[merged.length - 1].length < 40) {
      merged[merged.length - 1] += " " + fragment;
    } else {
      merged.push(fragment);
    }
  }
  return merged;
}

export interface StoryOverlayProps {
  currentPhase: string | null;
  whisperEnabled: boolean;
  voiceOverride?: string | null;
  language?: string;
  isPlaying?: boolean;
}

export function StoryOverlay({
  currentPhase,
  whisperEnabled,
  voiceOverride,
  language,
  isPlaying,
}: StoryOverlayProps) {
  const storyData = useAudioStore((s) => s.storyData);
  const storyLoading = useAudioStore((s) => s.storyLoading);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeElRef = useRef<HTMLDivElement | null>(null);
  const lastPhaseRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const fragmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fragmentIndexRef = useRef(0);
  const currentFragmentsRef = useRef<string[]>([]);

  // Loading message cycling
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);

  useEffect(() => {
    if (!storyLoading) return;
    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    const interval = setInterval(() => {
      i = Math.min(i + 1, LOADING_MESSAGES.length - 1);
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 6000);
    return () => clearInterval(interval);
  }, [storyLoading]);

  // Whisper refs
  const whisperEnabledRef = useRef(whisperEnabled);
  const voiceOverrideRef = useRef(voiceOverride);
  const languageRef = useRef(language);

  useEffect(() => { whisperEnabledRef.current = whisperEnabled; }, [whisperEnabled]);
  useEffect(() => { voiceOverrideRef.current = voiceOverride; }, [voiceOverride]);
  useEffect(() => { languageRef.current = language; }, [language]);

  // Audio context for whisper/reverb
  const audioCtxRef = useRef<AudioContext | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (!whisperEnabled) return;

    const ctx = new AudioContext();
    const convolver = ctx.createConvolver();
    convolver.buffer = createCathedralImpulse(ctx);

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1.0;
    dryGain.connect(ctx.destination);

    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.85;
    convolver.connect(wetGain);
    wetGain.connect(ctx.destination);

    audioCtxRef.current = ctx;
    convolverRef.current = convolver;
    dryGainRef.current = dryGain;

    return () => {
      ctx.close();
      audioCtxRef.current = null;
      convolverRef.current = null;
      dryGainRef.current = null;
    };
  }, [whisperEnabled]);

  const clearFragmentTimer = useCallback(() => {
    if (fragmentTimerRef.current) {
      clearTimeout(fragmentTimerRef.current);
      fragmentTimerRef.current = null;
    }
  }, []);

  // Show a single fragment with frosted glass backdrop
  const showFragment = useCallback((text: string) => {
    const container = containerRef.current;
    if (!container || cancelledRef.current) return;

    // Fade out previous
    if (activeElRef.current) {
      const prev = activeElRef.current;
      gsap.to(prev, {
        opacity: 0,
        y: -12,
        duration: 1.5,
        ease: "power2.in",
        onComplete: () => prev.remove(),
      });
    }

    // Create frosted glass container
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "50%";
    el.style.top = "60%";
    el.style.transform = "translate(-50%, -50%)";
    el.style.maxWidth = "520px";
    el.style.width = "85vw";
    el.style.textAlign = "center";
    el.style.padding = "24px 32px";
    el.style.borderRadius = "14px";
    el.style.backdropFilter = "blur(20px) saturate(1.1)";
    el.style.setProperty("-webkit-backdrop-filter", "blur(20px) saturate(1.1)");
    el.style.backgroundColor = "rgba(0, 0, 0, 0.35)";
    el.style.border = "1px solid rgba(255, 255, 255, 0.06)";
    el.style.fontFamily = "var(--font-geist-sans)";
    el.style.fontWeight = "300";
    el.style.fontSize = "1.1rem";
    el.style.lineHeight = "1.75";
    el.style.letterSpacing = "-0.01em";
    el.style.color = "rgba(255,255,255,0.85)";
    el.style.textShadow = "0 1px 8px rgba(0,0,0,0.6), 0 4px 24px rgba(0,0,0,0.4)";
    el.style.opacity = "0";
    el.textContent = text;

    container.appendChild(el);
    activeElRef.current = el;

    // Fade in
    gsap.fromTo(
      el,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 1.8, ease: "power2.out", delay: 0.3 }
    );

    // Speak if whisper enabled
    if (whisperEnabledRef.current && audioCtxRef.current && convolverRef.current && dryGainRef.current) {
      speakLine(text, {
        audioCtx: audioCtxRef.current,
        convolver: convolverRef.current,
        dryGain: dryGainRef.current,
        voice: voiceOverrideRef.current,
        phase: lastPhaseRef.current,
        language: languageRef.current,
        cancelled: cancelledRef,
      });
    }
  }, []);

  // Show a paragraph as sequential fragments
  const showParagraph = useCallback((text: string, imagePrompt: string) => {
    if (cancelledRef.current) return;

    // Clear any running fragment sequence
    clearFragmentTimer();

    // Feed image prompt to journey engine
    try {
      const engine = getJourneyEngine();
      if (engine.isActive()) {
        engine.setCurrentStoryImagePrompt(imagePrompt);
      }
    } catch {}

    // Split into fragments
    const fragments = splitIntoFragments(text);
    currentFragmentsRef.current = fragments;
    fragmentIndexRef.current = 0;

    // Show first fragment immediately
    showFragment(fragments[0]);

    // Schedule remaining fragments
    const scheduleNext = (idx: number) => {
      if (idx >= fragments.length || cancelledRef.current) return;
      fragmentTimerRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        showFragment(fragments[idx]);
        scheduleNext(idx + 1);
      }, FRAGMENT_DURATION);
    };

    if (fragments.length > 1) {
      scheduleNext(1);
    }
  }, [showFragment, clearFragmentTimer]);

  // React to phase changes
  useEffect(() => {
    if (!storyData || !currentPhase || !isPlaying) return;
    if (currentPhase === lastPhaseRef.current) return;
    lastPhaseRef.current = currentPhase;

    // Clear fragment timer — new phase means new paragraph
    clearFragmentTimer();

    const phaseIndex = PHASE_ORDER.indexOf(currentPhase as JourneyPhaseId);
    const paragraph = storyData.paragraphs[phaseIndex];
    if (paragraph) {
      showParagraph(paragraph.text, paragraph.imagePrompt);
    }
  }, [currentPhase, storyData, isPlaying, showParagraph, clearFragmentTimer]);

  // Show first paragraph immediately when story data arrives
  useEffect(() => {
    if (!storyData || storyData.paragraphs.length === 0) return;
    if (lastPhaseRef.current !== null) return; // Already showing a phase

    const firstParagraph = storyData.paragraphs[0];
    if (firstParagraph) {
      lastPhaseRef.current = firstParagraph.phaseId;
      showParagraph(firstParagraph.text, firstParagraph.imagePrompt);
    }
  }, [storyData, showParagraph]);

  // Cleanup on unmount
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      clearFragmentTimer();
      if (containerRef.current) {
        gsap.killTweensOf(containerRef.current.querySelectorAll("*"));
      }
    };
  }, [clearFragmentTimer]);

  // Clear fragment timer if story data changes
  useEffect(() => {
    clearFragmentTimer();
  }, [storyData, clearFragmentTimer]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 8 }}
      aria-hidden="true"
    >
      {/* Loading indicator — bottom of screen with frosted pill */}
      {storyLoading && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: "15%",
            padding: "10px 20px",
            borderRadius: "20px",
            backdropFilter: "blur(16px) saturate(1.1)",
            WebkitBackdropFilter: "blur(16px) saturate(1.1)",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.75rem",
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.03em",
          }}
        >
          {loadingMsg}
        </div>
      )}
    </div>
  );
}
