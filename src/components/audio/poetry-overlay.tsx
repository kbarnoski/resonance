"use client";

import { useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import type { Mood } from "@/lib/audio/vibe-detection";
import { POETRY_THEMES, TYPOGRAPHY_OVERRIDES, TYPOGRAPHY_FONTS_URL, type PoetryTheme, type TypographicVariant } from "@/lib/audio/poetry-themes";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { useAudioStore } from "@/lib/audio/audio-store";

export interface PoetryOverlayProps {
  mood: Mood;
  keySignature?: string | null;
  tempo?: number | null;
  summary?: string;
  whisperEnabled?: boolean;
  liveText?: string | null;
  liveEnabled?: boolean;
  phase?: string | null;
  voiceOverride?: string | null;
  intervalOverride?: number | null;
  moodOverride?: Mood | null;
  realmImagery?: string | null;
  typographyTheme?: string | null;
  isPlaying?: boolean;
  storyContext?: string | null;
}

// ─── Keyword extraction for dedup ───

const STOP_WORDS = new Set([
  "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or", "but",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might",
  "shall", "can", "with", "from", "into", "that", "this", "these", "those",
  "it", "its", "not", "no", "nor", "so", "as", "if", "by", "up", "out",
  "off", "over", "under", "again", "then", "once", "here", "there", "when",
  "where", "why", "how", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "than", "too", "very", "just", "about",
  "your", "you", "they", "them", "their", "our", "we", "my", "me", "him",
  "her", "his", "she", "he", "who", "what", "which",
]);

function extractKeywords(lines: string[]): string[] {
  const keywords = new Set<string>();
  for (const line of lines) {
    const words = line.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && !STOP_WORDS.has(word)) {
        keywords.add(word);
      }
    }
  }
  return Array.from(keywords);
}

// ─── Constants ───

const STAGGER_SECONDS = 5;
const MAX_ACTIVE_LINES = 3;
const BATCH_SIZE = 5;
const REFETCH_THRESHOLD = 2;
const WHISPER_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable",
  "nova", "onyx", "shimmer", "sage", "verse", "marin", "cedar",
] as const;

// Single-word font size range (scaled down for better proportion)
const SINGLE_WORD_SIZE_RANGE: [number, number] = [1.8, 3.0];

// Scale factor applied to theme sizeRange values
const SIZE_SCALE = 0.55;

// ─── Collision avoidance ───

interface OccupiedZone {
  top: number; // percent
  left: number;
  width: number; // percent (estimated)
  height: number; // percent (estimated)
  expiresAt: number;
}

function zonesOverlap(a: OccupiedZone, b: OccupiedZone): boolean {
  return !(a.left + a.width < b.left || b.left + b.width < a.left ||
           a.top + a.height < b.top || b.top + b.height < a.top);
}

function estimateZone(top: number, left: number, text: string, fontSize: number): OccupiedZone {
  // Rough estimate: each char ~0.6em wide, line height ~1.2em
  const charWidthVw = fontSize * 0.6 * (100 / window.innerWidth) * 16; // rem to vw approx
  const widthPct = Math.min(80, text.length * charWidthVw);
  const heightPct = fontSize * 1.3 * (100 / window.innerHeight) * 16;
  return { top, left, width: widthPct, height: heightPct, expiresAt: 0 };
}

// ─── Helpers ───

function createCathedralImpulse(ctx: AudioContext): AudioBuffer {
  const duration = 6;
  const length = ctx.sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = Math.pow(1 - t, 1.8);
      const earlyBoost = i < ctx.sampleRate * 0.08 ? 1.4 : 1.0;
      const noise = Math.random() * 2 - 1;
      data[i] = noise * envelope * earlyBoost * 0.7;
    }
  }
  return impulse;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isSingleWord(text: string): boolean {
  return text.trim().split(/\s+/).length <= 2;
}

// ─── Component ───

export function PoetryOverlay({
  mood,
  keySignature,
  tempo,
  summary,
  whisperEnabled,
  liveText,
  liveEnabled,
  phase,
  voiceOverride,
  intervalOverride,
  moodOverride,
  realmImagery,
  typographyTheme,
  isPlaying,
  storyContext,
}: PoetryOverlayProps) {
  const language = useAudioStore((s) => s.language);
  const effectiveMood = moodOverride ?? mood;
  const theme: PoetryTheme = (typographyTheme ? TYPOGRAPHY_OVERRIDES[typographyTheme] : undefined) ?? POETRY_THEMES[effectiveMood];

  // Container ref for GSAP targets
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCountRef = useRef(0);

  // Load Google Fonts when a typography override is active
  useEffect(() => {
    if (!typographyTheme || !TYPOGRAPHY_OVERRIDES[typographyTheme]) return;
    const id = "poetry-typography-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = TYPOGRAPHY_FONTS_URL;
    document.head.appendChild(link);
  }, [typographyTheme]);

  const bufferRef = useRef<string[]>([]);
  const fetchingRef = useRef(false);
  const sessionLinesRef = useRef<Set<string>>(new Set());
  const cancelledRef = useRef(false);
  const occupiedZonesRef = useRef<OccupiedZone[]>([]);

  // Refs that sync from props
  const whisperEnabledRef = useRef(whisperEnabled);
  const liveEnabledRef = useRef(liveEnabled);
  const voiceOverrideRef = useRef(voiceOverride);
  const phaseRef = useRef(phase);
  const isPlayingRef = useRef(isPlaying);
  const languageRef = useRef(language);
  const realmImageryRef = useRef(realmImagery);
  const storyContextRef = useRef(storyContext);
  const themeRef = useRef(theme);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { realmImageryRef.current = realmImagery; }, [realmImagery]);
  useEffect(() => { storyContextRef.current = storyContext; }, [storyContext]);
  useEffect(() => { whisperEnabledRef.current = whisperEnabled; }, [whisperEnabled]);
  useEffect(() => { liveEnabledRef.current = liveEnabled; }, [liveEnabled]);
  useEffect(() => { voiceOverrideRef.current = voiceOverride; }, [voiceOverride]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);

  // ─── Fetch poetry batch ───
  const fetchBatch = useCallback(async () => {
    if (fetchingRef.current || cancelledRef.current) return;
    fetchingRef.current = true;

    try {
      const avoid = Array.from(sessionLinesRef.current);
      const avoidKeywords = extractKeywords(avoid);

      const res = await fetch("/api/poetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mood: moodOverride ?? mood,
          key_signature: keySignature,
          tempo,
          summary,
          count: BATCH_SIZE,
          avoid,
          avoidKeywords,
          phase: phaseRef.current ?? undefined,
          language: languageRef.current,
          imagery: realmImageryRef.current ?? undefined,
          vizTheme: typographyTheme ?? undefined,
          storyContext: storyContextRef.current ?? undefined,
          poetryType: "mixed",
        }),
      });

      if (!res.ok || cancelledRef.current) return;
      const data = await res.json();
      if (Array.isArray(data.lines)) {
        const newLines = data.lines.filter((l: string) => !sessionLinesRef.current.has(l));
        bufferRef.current.push(...newLines);
        for (const line of newLines) {
          sessionLinesRef.current.add(line);
        }
      }
    } catch {
      // Silently fail
    } finally {
      fetchingRef.current = false;
    }
  }, [mood, moodOverride, keySignature, tempo, summary, realmImagery, typographyTheme]);

  // When viz theme changes, flush stale buffer
  const prevThemeRef = useRef(typographyTheme);
  useEffect(() => {
    if (prevThemeRef.current === typographyTheme) return;
    prevThemeRef.current = typographyTheme;
    bufferRef.current = [];
    fetchBatch();
  }, [typographyTheme, fetchBatch]);

  // ─── Web Audio reverb ───
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
    wetGainRef.current = wetGain;

    return () => {
      ctx.close();
      audioCtxRef.current = null;
      convolverRef.current = null;
      dryGainRef.current = null;
      wetGainRef.current = null;
    };
  }, [whisperEnabled]);

  // ─── Speak a line ───
  const speakLine = useCallback(async (text: string) => {
    const ctx = audioCtxRef.current;
    const convolver = convolverRef.current;
    const dryGain = dryGainRef.current;
    if (!ctx || !convolver || !dryGain || !whisperEnabledRef.current) return;

    try {
      if (ctx.state === "suspended") await ctx.resume();
      const voice = voiceOverrideRef.current ?? pickRandom(WHISPER_VOICES);

      const res = await fetch("/api/poetry/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, phase: phaseRef.current, language: languageRef.current }),
      });

      if (!res.ok || cancelledRef.current) return;

      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      if (cancelledRef.current) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dryGain);
      source.connect(convolver);
      source.start();
    } catch {
      // Silently fail
    }
  }, []);

  // ─── Find non-overlapping position ───
  const findPosition = useCallback((text: string, fontSize: number): { top: number; left: number } => {
    const now = Date.now();
    // Clean expired zones
    occupiedZonesRef.current = occupiedZonesRef.current.filter((z) => z.expiresAt > now);

    for (let attempt = 0; attempt < 8; attempt++) {
      const top = 8 + Math.random() * 65;
      const left = 3 + Math.random() * 55;
      const candidate = estimateZone(top, left, text, fontSize);

      const collision = occupiedZonesRef.current.some((z) => zonesOverlap(z, candidate));
      if (!collision) return { top, left };
    }

    // Fallback: use a less crowded vertical zone
    const top = 8 + Math.random() * 65;
    const left = 3 + Math.random() * 55;
    return { top, left };
  }, []);

  // ─── Animate a single line with GSAP ───
  const animateLine = useCallback((lineText: string) => {
    const container = containerRef.current;
    if (!container || cancelledRef.current) return;

    const t = themeRef.current;
    const variant = pickRandom(t.variants);
    const color = pickRandom(t.colors);
    const singleWord = isSingleWord(lineText);
    const wordCount = lineText.trim().split(/\s+/).length;

    // Size: single words get larger, multi-word scaled down
    const [rawMin, rawMax] = singleWord ? SINGLE_WORD_SIZE_RANGE : t.sizeRange;
    const [minSize, maxSize] = singleWord ? [rawMin, rawMax] : [rawMin * SIZE_SCALE, rawMax * SIZE_SCALE];
    const fontSize = minSize + Math.random() * (maxSize - minSize);

    // Hold duration based on word count
    const holdDuration = Math.max(3, wordCount * 0.8);

    // Text transform
    const displayText =
      variant.textTransform === "uppercase" ? lineText.toUpperCase()
      : variant.textTransform === "lowercase" ? lineText.toLowerCase()
      : lineText;

    // Find collision-free position
    const { top, left } = findPosition(displayText, fontSize);

    // Create DOM element
    const el = document.createElement("span");
    el.style.position = "absolute";
    el.style.top = `${top}%`;
    el.style.left = `${left}%`;
    el.style.maxWidth = "80vw";
    el.style.fontFamily = variant.fontFamily;
    el.style.fontWeight = String(variant.fontWeight);
    el.style.fontSize = `${fontSize}rem`;
    el.style.lineHeight = "1.15";
    el.style.letterSpacing = variant.letterSpacing;
    el.style.color = color;
    el.style.textShadow = t.textShadow;
    el.style.opacity = "0";
    el.style.willChange = "transform, opacity";

    if (singleWord) {
      // Per-character spans for staggered animation
      for (const char of displayText) {
        const span = document.createElement("span");
        span.textContent = char;
        span.style.display = "inline-block";
        span.style.opacity = "0";
        el.appendChild(span);
      }
    } else {
      el.textContent = displayText;
    }

    container.appendChild(el);
    activeCountRef.current++;

    // Register occupied zone
    const zone = estimateZone(top, left, displayText, fontSize);
    const totalDuration = 1.5 + holdDuration + 2.0;
    zone.expiresAt = Date.now() + totalDuration * 1000;
    occupiedZonesRef.current.push(zone);

    // Build GSAP timeline
    const tl = gsap.timeline({
      onComplete: () => {
        el.remove();
        activeCountRef.current--;
      },
    });

    // Subtle continuous drift direction (random per line)
    const driftX = (Math.random() - 0.5) * 12; // -6 to 6 px
    const driftY = (Math.random() - 0.5) * 8;  // -4 to 4 px
    const totalVisible = holdDuration + 3.5; // fade-in + hold + fade-out

    if (singleWord) {
      const chars = el.querySelectorAll("span");
      // Entrance: per-character stagger with slow fade
      tl.to(el, { opacity: 1, duration: 0.1 });
      tl.fromTo(
        chars,
        { opacity: 0, y: 12, scale: 0.95 },
        {
          opacity: 1, y: 0, scale: 1,
          duration: 1.0,
          stagger: 0.04,
          ease: "power2.out",
        },
        0
      );
      // Subtle drift during entire visible duration
      tl.to(el, { x: driftX, y: driftY, duration: totalVisible, ease: "none" }, 0);
      // Hold
      tl.to(el, { duration: holdDuration });
      // Exit: slow per-character fade out
      tl.to(chars, {
        opacity: 0, y: -8,
        duration: 1.4,
        stagger: 0.03,
        ease: "power1.in",
      });
      tl.to(el, { opacity: 0, duration: 0.5 }, "-=0.5");
    } else {
      // Entrance: slow, gentle fade
      tl.fromTo(el,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 1.5, ease: "power2.out" }
      );
      // Subtle drift during entire visible duration
      tl.to(el, { x: driftX, y: driftY, duration: totalVisible, ease: "none" }, 0);
      // Hold
      tl.to(el, { duration: holdDuration });
      // Exit: slow fade out
      tl.to(el,
        { opacity: 0, y: -8, duration: 2.0, ease: "power1.in" }
      );
    }

    // Feed line into journey engine for text→image feedback
    try {
      const engine = getJourneyEngine();
      if (engine.isActive()) {
        engine.setCurrentPoetryLine(lineText);
      }
    } catch {
      // Journey engine may not be active
    }

    // Speak
    if (whisperEnabledRef.current) {
      speakLine(lineText);
    }
  }, [findPosition, speakLine]);

  // ─── Main loop ───
  useEffect(() => {
    cancelledRef.current = false;
    bufferRef.current = [];
    sessionLinesRef.current = new Set();
    occupiedZonesRef.current = [];

    // Clear any existing GSAP-animated children
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
    activeCountRef.current = 0;

    fetchBatch();

    const effectiveInterval = intervalOverride ?? STAGGER_SECONDS;

    const interval = setInterval(() => {
      if (isPlayingRef.current === false) return;
      if (liveEnabledRef.current) return;
      if (bufferRef.current.length === 0) return;
      if (activeCountRef.current >= MAX_ACTIVE_LINES) return;

      const lineText = bufferRef.current.shift()!;
      animateLine(lineText);

      if (bufferRef.current.length <= REFETCH_THRESHOLD) {
        fetchBatch();
      }
    }, effectiveInterval * 1000);

    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
      // Kill all active GSAP tweens on our container
      if (containerRef.current) {
        gsap.killTweensOf(containerRef.current.querySelectorAll("*"));
      }
    };
  }, [fetchBatch, animateLine, intervalOverride]);

  // ─── Live text injection ───
  useEffect(() => {
    if (!liveText) return;
    animateLine(liveText);
  }, [liveText, animateLine]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 8 }}
      aria-hidden="true"
    />
  );
}
