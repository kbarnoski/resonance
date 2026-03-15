"use client";

import { useMemo, useRef, useState, useEffect } from "react";

interface AnalysisHUDProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: any;
  currentTime: number;
  duration: number;
  compact?: boolean;
  onSectionChange?: (section: string) => void;
}

/** Discretize time to ~10Hz to avoid per-frame recalcs */
function disc(time: number): number {
  return Math.round(time * 10) / 10;
}

/**
 * Map a chord root to a hue (0-360) using the circle of fifths.
 * C=0, G=30, D=60, A=90, E=120, B=150, F#=180, Db=210, Ab=240, Eb=270, Bb=300, F=330
 */
function chordToHue(chord: string): number {
  const roots: Record<string, number> = {
    C: 200, G: 170, D: 140, A: 30, E: 50, B: 80,
    "F#": 160, Gb: 160, "C#": 230, Db: 230,
    "G#": 260, Ab: 260, "D#": 290, Eb: 290,
    "A#": 320, Bb: 320, F: 340,
  };
  // Extract root from chord name (e.g., "Cmaj7" -> "C", "F#m" -> "F#")
  const match = chord.match(/^([A-G][#b]?)/);
  if (!match) return 200;
  return roots[match[1]] ?? 200;
}

function isMinorChord(chord: string): boolean {
  const name = chord.replace(/^[A-G][#b]?/, "");
  return /^m($|[^a])/.test(name) || /^min/.test(name);
}

export function AnalysisHUD({ analysis, currentTime, duration, compact, onSectionChange }: AnalysisHUDProps) {
  const dt = disc(currentTime);
  const prevChordRef = useRef<string>("");
  const [chordFade, setChordFade] = useState(1);

  // Current chord lookup
  const currentChord = useMemo(() => {
    const chords = analysis?.chords;
    if (!chords || chords.length === 0) return null;
    for (let i = chords.length - 1; i >= 0; i--) {
      const c = chords[i];
      if (dt >= c.time && dt < c.time + c.duration) return c.chord as string;
    }
    const last = chords[chords.length - 1];
    if (dt >= last.time) return last.chord as string;
    return null;
  }, [analysis?.chords, dt]);

  // Next chord (for anticipation)
  const nextChord = useMemo(() => {
    const chords = analysis?.chords;
    if (!chords || chords.length === 0) return null;
    for (let i = 0; i < chords.length; i++) {
      if (chords[i].time > dt) return chords[i].chord as string;
    }
    return null;
  }, [analysis?.chords, dt]);

  // Chord transition fade
  useEffect(() => {
    if (currentChord && currentChord !== prevChordRef.current) {
      setChordFade(0);
      const timer = setTimeout(() => setChordFade(1), 50);
      prevChordRef.current = currentChord;
      return () => clearTimeout(timer);
    }
  }, [currentChord]);

  // Meta line
  const keySignature = analysis?.key_signature;
  const tempo = analysis?.tempo;
  const timeSig = analysis?.time_signature;

  // Current section
  const currentSection = useMemo(() => {
    const sections = analysis?.summary?.sections;
    if (!sections || sections.length === 0 || !duration) return null;
    const sectionDuration = duration / sections.length;
    const index = Math.min(Math.floor(dt / sectionDuration), sections.length - 1);
    const section = sections[index];
    const name = typeof section === "string" ? section : section?.label ?? section?.name ?? "";
    return { name, index, total: sections.length };
  }, [analysis?.summary?.sections, duration, dt]);

  // Fire onSectionChange when section transitions
  const prevSectionRef = useRef<string>("");
  useEffect(() => {
    if (!currentSection || !onSectionChange) return;
    if (currentSection.name !== prevSectionRef.current) {
      if (prevSectionRef.current) onSectionChange(currentSection.name);
      prevSectionRef.current = currentSection.name;
    }
  }, [currentSection, onSectionChange]);

  // Note activity — count notes active at current time
  const noteActivity = useMemo(() => {
    const notes = analysis?.notes;
    if (!notes || notes.length === 0) return 0;
    let count = 0;
    for (const n of notes) {
      if (dt >= n.time && dt < n.time + n.duration) count++;
    }
    return count;
  }, [analysis?.notes, dt]);

  // Harmonic color based on current chord
  const hue = currentChord ? chordToHue(currentChord) : 200;
  const saturation = currentChord ? (isMinorChord(currentChord) ? 40 : 55) : 20;
  const density = Math.min(noteActivity / 10, 1);

  const hasContent = currentChord || keySignature;
  if (!hasContent) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-white/70">
        {currentChord && (
          <span
            className="font-light transition-all duration-500"
            style={{
              fontSize: "1.1rem",
              fontFamily: "var(--font-geist-sans)",
              opacity: chordFade,
              color: `hsl(${hue}, ${saturation}%, 85%)`,
            }}
          >
            {currentChord}
          </span>
        )}
        {keySignature && (
          <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)" }} className="text-white/30">
            {keySignature}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="absolute top-0 left-0 w-full pointer-events-none select-none" style={{ zIndex: 10 }}>
      {/* Harmonic color wash — ambient glow tied to the current chord */}
      <div
        className="absolute top-0 left-0 w-full h-64 transition-all duration-1000 ease-out"
        style={{
          background: `radial-gradient(ellipse 80% 100% at 20% 0%, hsla(${hue}, ${saturation}%, 30%, ${0.08 + density * 0.06}) 0%, transparent 70%)`,
        }}
      />

      {/* Main HUD content */}
      <div className="relative p-6 md:p-8 max-w-lg">
        {/* Current chord — large, typographic, colored */}
        {currentChord && (
          <div className="mb-2">
            <span
              className="transition-all duration-500 ease-out"
              style={{
                fontSize: "2.5rem",
                fontFamily: "var(--font-geist-sans)",
                fontWeight: 200,
                letterSpacing: "-0.02em",
                color: `hsl(${hue}, ${saturation}%, 82%)`,
                opacity: chordFade,
                textShadow: `0 0 40px hsla(${hue}, ${saturation}%, 50%, 0.3), 0 0 8px rgba(0,0,0,0.8)`,
              }}
            >
              {currentChord}
            </span>
            {nextChord && nextChord !== currentChord && (
              <span
                className="ml-3 text-white/15"
                style={{
                  fontSize: "1rem",
                  fontFamily: "var(--font-geist-sans)",
                  fontWeight: 200,
                }}
              >
                {nextChord}
              </span>
            )}
          </div>
        )}

        {/* Key / Tempo / Time Sig */}
        <div
          className="flex items-center gap-2 text-white/35 mb-3"
          style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)" }}
        >
          {keySignature && <span>{keySignature}</span>}
          {keySignature && tempo && <span className="text-white/15">·</span>}
          {tempo && <span>~{Math.round(tempo)} BPM</span>}
          {tempo && timeSig && <span className="text-white/15">·</span>}
          {timeSig && <span>{timeSig}</span>}
        </div>

        {/* Section label */}
        {currentSection && (
          <div
            className="text-white/25 italic transition-opacity duration-700 mb-3"
            style={{
              fontSize: "0.8rem",
              fontFamily: "var(--font-geist-sans)",
              fontWeight: 200,
              textShadow: "0 0 8px rgba(0,0,0,0.6)",
            }}
          >
            {currentSection.name}
          </div>
        )}

        {/* Note activity — organic bars */}
        {noteActivity > 0 && (
          <div className="flex items-end gap-[3px] h-5">
            {[0.5, 0.8, 1.0, 0.7, 0.4, 0.9, 0.6].slice(0, Math.min(noteActivity, 7)).map((scale, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-200"
                style={{
                  width: "2px",
                  height: `${Math.max(3, density * scale * 20)}px`,
                  backgroundColor: `hsla(${hue}, ${saturation}%, 70%, ${0.15 + density * scale * 0.3})`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Section progress — thin line at top */}
      {currentSection && duration > 0 && (
        <div className="absolute top-0 left-0 w-full h-[2px]">
          <div
            className="h-full transition-all duration-300 ease-linear"
            style={{
              width: `${(currentTime / duration) * 100}%`,
              background: `linear-gradient(90deg, transparent 0%, hsla(${hue}, ${saturation}%, 60%, 0.3) 100%)`,
            }}
          />
        </div>
      )}
    </div>
  );
}
