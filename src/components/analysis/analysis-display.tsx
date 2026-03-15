"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Music, Guitar,
  BookOpen, Lightbulb, ListMusic,
} from "lucide-react";
import {
  classifyChords,
  FUNCTION_COLORS,
  type ClassifiedChord,
} from "@/lib/analysis/chord-utils";

interface Summary {
  overview: string;
  key_center: string;
  sections: { label: string; description: string }[];
  chord_vocabulary: string[];
  harmonic_highlights: string;
  rhythm_and_feel: string;
  relearning_tips: string;
}

interface AnalysisDisplayProps {
  analysis: {
    key_signature: string | null;
    key_confidence?: number;
    tempo: number | null;
    time_signature: string | null;
    chords: { chord: string; time: number; duration: number }[];
    harmonic_rhythm?: string;
    progressions?: string[];
    melody?: { midi: number; time: number; duration: number; velocity: number }[];
    bass_line?: { midi: number; time: number; duration: number; velocity: number }[];
    notes: { midi: number; time: number; duration: number; velocity: number }[];
    summary?: Summary | null;
  };
  compact?: boolean;
}

const FUNCTION_ORDER: ClassifiedChord["function"][] = [
  "tonic",
  "subdominant",
  "dominant",
  "chromatic",
];

const FUNCTION_LABELS: Record<ClassifiedChord["function"], string> = {
  tonic: "Tonic",
  subdominant: "Subdominant",
  dominant: "Dominant",
  chromatic: "Other",
};

const MAX_PER_GROUP = 3;

function FunctionalChordVocabulary({
  chords,
  keySignature,
}: {
  chords: string[];
  keySignature: string | null;
}) {
  // Count frequency of each chord
  const chordCounts = new Map<string, number>();
  for (const c of chords) {
    chordCounts.set(c, (chordCounts.get(c) || 0) + 1);
  }
  const uniqueChords = [...new Set(chords)];

  // Classify all unique chords
  const classified = classifyChords(uniqueChords, keySignature);

  // Group by function
  const groups = new Map<ClassifiedChord["function"], ClassifiedChord[]>();
  for (const fn of FUNCTION_ORDER) {
    groups.set(fn, []);
  }
  for (const c of classified) {
    groups.get(c.function)!.push(c);
  }

  // Sort each group by frequency (most used first)
  for (const [, items] of groups) {
    items.sort(
      (a, b) => (chordCounts.get(b.name) ?? 0) - (chordCounts.get(a.name) ?? 0)
    );
  }

  // Filter out empty groups
  const nonEmptyGroups = FUNCTION_ORDER.filter(
    (fn) => (groups.get(fn)?.length ?? 0) > 0
  );

  if (nonEmptyGroups.length === 0) return null;

  return (
    <div className="border-b pb-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
        <Guitar className="h-4 w-4" />
        Chord Vocabulary
      </div>
      <div className="space-y-2">
        {nonEmptyGroups.map((fn) => {
          const items = groups.get(fn)!;
          const visible = items.slice(0, MAX_PER_GROUP);
          const remaining = items.length - MAX_PER_GROUP;
          const colors = FUNCTION_COLORS[fn];

          return (
            <div key={fn}>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                {FUNCTION_LABELS[fn]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visible.map((chord) => (
                  <Badge
                    key={chord.name}
                    variant="outline"
                    className={`text-sm border-0 ${colors.badge}`}
                  >
                    {chord.name}
                    {chord.roman && (
                      <sup className="ml-1 text-[10px] opacity-70">
                        {chord.roman}
                      </sup>
                    )}
                  </Badge>
                ))}
                {remaining > 0 && (
                  <span className="flex items-center text-xs text-muted-foreground">
                    +{remaining} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeachingSummary({
  summary,
  compact,
  keySignature,
  chords,
}: {
  summary: Summary;
  compact?: boolean;
  keySignature: string | null;
  chords: { chord: string; time: number; duration: number }[];
}) {
  const chordNames = chords.map((c) => c.chord);

  return (
    <div className="space-y-3">
      {/* Overview */}
      <div className="border-b pb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
          <BookOpen className="h-4 w-4" />
          Overview
        </div>
        <p className="text-sm leading-relaxed">{summary.overview}</p>
        <p className="mt-2 text-sm">
          <span className="font-medium">Key Center:</span>{" "}
          <span className="text-muted-foreground">{summary.key_center}</span>
        </p>
        {summary.rhythm_and_feel && (
          <p className="mt-1 text-sm">
            <span className="font-medium">Feel:</span>{" "}
            <span className="text-muted-foreground">{summary.rhythm_and_feel}</span>
          </p>
        )}
      </div>

      {/* Sections Timeline — hidden in compact mode */}
      {!compact && summary.sections.length > 0 && (
        <div className="border-b pb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
            <ListMusic className="h-4 w-4" />
            Sections
          </div>
          <div className="relative space-y-4">
            {summary.sections.map((section, i) => (
              <div key={i} className="relative pl-6">
                <div className="absolute left-0 top-1 h-3 w-3 rounded-full bg-primary" />
                {i < summary.sections.length - 1 && (
                  <div className="absolute left-[5px] top-4 bottom-0 w-0.5 bg-border" />
                )}
                <p className="text-sm font-medium">{section.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">
                  {section.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Functional Chord Vocabulary */}
      {chordNames.length > 0 && (
        <FunctionalChordVocabulary
          chords={chordNames}
          keySignature={keySignature}
        />
      )}

      {/* Harmonic Highlights */}
      {summary.harmonic_highlights && (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Music className="h-4 w-4" />
            Harmonic Highlights
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {summary.harmonic_highlights}
          </p>
        </div>
      )}

      {/* Relearning Tips — hidden in compact mode */}
      {!compact && summary.relearning_tips && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-primary">
              <Lightbulb className="h-4 w-4" />
              Tips for Relearning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">
              {summary.relearning_tips}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AnalysisDisplay({ analysis, compact }: AnalysisDisplayProps) {
  const hasSummary = analysis.summary && typeof analysis.summary === "object";

  if (!hasSummary) {
    // Fallback: show functional chord vocabulary even without a summary
    const chordNames = analysis.chords.map((c) => c.chord);
    if (chordNames.length > 0) {
      return (
        <FunctionalChordVocabulary
          chords={chordNames}
          keySignature={analysis.key_signature}
        />
      );
    }
    return null;
  }

  return (
    <TeachingSummary
      summary={analysis.summary!}
      compact={compact}
      keySignature={analysis.key_signature}
      chords={analysis.chords}
    />
  );
}
