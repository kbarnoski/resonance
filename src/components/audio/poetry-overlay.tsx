"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { Mood } from "@/lib/audio/vibe-detection";
import { POETRY_THEMES, TYPOGRAPHY_OVERRIDES, TYPOGRAPHY_FONTS_URL, type PoetryTheme, type TypographicVariant } from "@/lib/audio/poetry-themes";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";

export interface PoetryOverlayProps {
  mood: Mood;
  keySignature?: string | null;
  tempo?: number | null;
  summary?: string;
  whisperEnabled?: boolean;
  liveText?: string | null;
  liveEnabled?: boolean;
  /** Journey phase for phase-aware behavior */
  phase?: string | null;
  /** Override voice for journey phases */
  voiceOverride?: string | null;
  /** Override interval between poetry lines (seconds) */
  intervalOverride?: number | null;
  /** Override mood for journey phases */
  moodOverride?: Mood | null;
  /** Realm poetry imagery for prompts */
  realmImagery?: string | null;
  /** Typography theme key — realm ID (journey) or shader category (viz-only) */
  typographyTheme?: string | null;
}

interface ActiveLine {
  id: number;
  text: string;
  top: string;
  left: string;
  fontSize: string;
  duration: number;
  variant: TypographicVariant;
  color: string;
}

const STAGGER_SECONDS = 3;
const BATCH_SIZE = 5;
const REFETCH_THRESHOLD = 2;
const WHISPER_VOICES = ["shimmer", "nova", "fable", "alloy"] as const;

const HOLD_ANIMATIONS = ["poetry-float-hold", "poetry-drift-hold", "poetry-breathe-hold"];
const SWISS_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

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
}: PoetryOverlayProps) {
  const [activeLines, setActiveLines] = useState<ActiveLine[]>([]);
  const effectiveMood = moodOverride ?? mood;
  // Typography override (realm or category) takes priority over mood-based theme
  const theme: PoetryTheme = (typographyTheme ? TYPOGRAPHY_OVERRIDES[typographyTheme] : undefined) ?? POETRY_THEMES[effectiveMood];

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
  // Session-wide dedup — every line ever shown in this session
  const sessionLinesRef = useRef<Set<string>>(new Set());
  const lineIdRef = useRef(0);
  const cancelledRef = useRef(false);

  // Refs that sync from props without causing effect re-runs
  const whisperEnabledRef = useRef(whisperEnabled);
  const liveEnabledRef = useRef(liveEnabled);
  const voiceOverrideRef = useRef(voiceOverride);
  const phaseRef = useRef(phase);

  // Keep refs in sync
  useEffect(() => { whisperEnabledRef.current = whisperEnabled; }, [whisperEnabled]);
  useEffect(() => { liveEnabledRef.current = liveEnabled; }, [liveEnabled]);
  useEffect(() => { voiceOverrideRef.current = voiceOverride; }, [voiceOverride]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);

  // Stable ref to theme values for the main loop
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Fetch a fresh batch of lines from the API — sends full session history as avoid
  const fetchBatch = useCallback(async () => {
    if (fetchingRef.current || cancelledRef.current) return;
    fetchingRef.current = true;

    try {
      // Send all session lines as avoid list to prevent any repetition
      const avoid = Array.from(sessionLinesRef.current);

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
          phase: phase ?? undefined,
        }),
      });

      if (!res.ok || cancelledRef.current) return;
      const data = await res.json();
      if (Array.isArray(data.lines)) {
        // Filter out any lines that somehow match existing ones
        const newLines = data.lines.filter((l: string) => !sessionLinesRef.current.has(l));
        bufferRef.current.push(...newLines);
        for (const line of newLines) {
          sessionLinesRef.current.add(line);
        }
      }
    } catch {
      // Silently fail — show nothing rather than fall back to seed lines
    } finally {
      fetchingRef.current = false;
    }
  }, [mood, moodOverride, keySignature, tempo, summary, phase, realmImagery]);

  // Initialize Web Audio reverb chain — independent of main loop
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

  // Speak a line — reads whisper state from ref
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
        body: JSON.stringify({ text, voice, phase: phaseRef.current }),
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
  }, []); // No whisperEnabled dep — uses ref

  // Helper to create an ActiveLine from text
  const createActiveLine = useCallback((lineText: string): ActiveLine => {
    const t = themeRef.current;
    const [minSize, maxSize] = t.sizeRange;
    const [minDur, maxDur] = t.animationDuration;
    const id = lineIdRef.current++;
    const duration = minDur + Math.random() * (maxDur - minDur);
    const variant = pickRandom(t.variants);
    const color = pickRandom(t.colors);

    return {
      id,
      text: lineText,
      top: `${10 + Math.random() * 60}%`,
      left: `${5 + Math.random() * 55}%`,
      fontSize: `${minSize + Math.random() * (maxSize - minSize)}rem`,
      duration,
      variant,
      color,
    };
  }, []);

  // Main loop — pull from buffer, display, refetch when low
  useEffect(() => {
    cancelledRef.current = false;
    // NO seed lines preloading — buffer starts empty, all lines from API
    bufferRef.current = [];
    sessionLinesRef.current = new Set();
    setActiveLines([]);

    // Kick off initial API fetch
    fetchBatch();

    const effectiveInterval = intervalOverride ?? STAGGER_SECONDS;

    const interval = setInterval(() => {
      // When live mode is on, pause AI batch pulls
      if (liveEnabledRef.current) return;

      if (bufferRef.current.length === 0) return;

      const lineText = bufferRef.current.shift()!;
      const newLine = createActiveLine(lineText);

      setActiveLines((prev) => [...prev, newLine]);

      // Feed line into journey engine for text→image feedback
      try {
        const engine = getJourneyEngine();
        if (engine.isActive()) {
          engine.setCurrentPoetryLine(lineText);
        }
      } catch {
        // Journey engine may not be active
      }

      // Speak via ref
      if (whisperEnabledRef.current) {
        speakLine(lineText);
      }

      // Auto-remove after animation completes
      setTimeout(() => {
        setActiveLines((prev) => prev.filter((l) => l.id !== newLine.id));
      }, newLine.duration * 1000);

      // Refetch when buffer is running low
      if (bufferRef.current.length <= REFETCH_THRESHOLD) {
        fetchBatch();
      }
    }, effectiveInterval * 1000);

    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
      setActiveLines([]);
    };
  }, [fetchBatch, theme.sizeRange, theme.animationDuration, theme.variants, theme.animation, createActiveLine, speakLine, intervalOverride]);

  // Live text injection — when liveText changes, inject it as a new line
  useEffect(() => {
    if (!liveText) return;
    const newLine = createActiveLine(liveText);
    setActiveLines((prev) => [...prev, newLine]);

    // Feed into journey engine
    try {
      const engine = getJourneyEngine();
      if (engine.isActive()) {
        engine.setCurrentPoetryLine(liveText);
      }
    } catch {
      // ignore
    }

    if (whisperEnabledRef.current) {
      speakLine(liveText);
    }

    setTimeout(() => {
      setActiveLines((prev) => prev.filter((l) => l.id !== newLine.id));
    }, newLine.duration * 1000);
  }, [liveText, createActiveLine, speakLine]);

  if (activeLines.length === 0) return null;

  const isGlitch = theme.animation === "poetry-glitch";

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 8 }}
      aria-hidden="true"
    >
      {activeLines.map((line) => {
        const variant = line.variant;
        const text =
          variant.textTransform === "uppercase"
            ? line.text.toUpperCase()
            : variant.textTransform === "lowercase"
              ? line.text.toLowerCase()
              : line.text;

        const holdAnimation = pickRandom(HOLD_ANIMATIONS);

        // Single whole-line animation: lifecycle + gentle drift
        const outerAnimation = isGlitch
          ? `poetry-glitch ${line.duration}s ease-in-out forwards`
          : [
              `poetry-line-lifecycle ${line.duration}s ${SWISS_EASE} forwards`,
              `${holdAnimation} ${line.duration}s ease-in-out infinite`,
            ].join(", ");

        return (
          <span
            key={line.id}
            className="absolute"
            style={{
              top: line.top,
              left: line.left,
              maxWidth: "80vw",
              fontFamily: variant.fontFamily,
              fontWeight: variant.fontWeight,
              fontSize: line.fontSize,
              lineHeight: 1.15,
              letterSpacing: variant.letterSpacing,
              color: line.color,
              textShadow: theme.textShadow,
              opacity: 0,
              animation: outerAnimation,
              willChange: "transform, opacity",
            }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
