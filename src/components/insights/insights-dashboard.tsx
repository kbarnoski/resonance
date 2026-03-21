"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LibrarySummaryPanel } from "@/components/insights/library-summary";
import { KeyDistribution } from "@/components/insights/key-distribution";
import { ChordFrequency } from "@/components/insights/chord-frequency";
import { ProgressionPatterns } from "@/components/insights/progression-patterns";
import { SimilarRecordings } from "@/components/insights/similar-recordings";
import { InsightsChat } from "@/components/insights/insights-chat";
import {
  getKeyDistribution,
  getChordFrequency,
  findCommonProgressions,
  findSimilarRecordings,
  getHarmonicTendencies,
} from "@/lib/analysis/cross-recording";
import {
  Music, Gauge, Hash, Clock, Fingerprint, Palette,
} from "lucide-react";

interface AnalysisData {
  id: string;
  title: string;
  duration: number | null;
  created_at: string;
  key_signature: string | null;
  tempo: number | null;
  time_signature: string | null;
  chords: { chord: string; time: number; duration: number }[];
}

interface InsightsDashboardProps {
  analyses: AnalysisData[];
  totalRecordings: number;
}

function formatTotalTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.05]">
          <Icon className="h-5 w-5 text-white/40" />
        </div>
        <div className="min-w-0">
          <p
            className="text-xl font-light leading-none tracking-tight tabular-nums truncate text-white/90 sm:text-2xl"
            title={value}
          >
            {value}
          </p>
          <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function InsightsDashboard({ analyses, totalRecordings }: InsightsDashboardProps) {
  const count = analyses.length;
  const keyDist = getKeyDistribution(analyses);
  const chordFreq = getChordFrequency(analyses);
  const { tendencies, dominantStyle } = getHarmonicTendencies(analyses);

  // Quick stats
  const mostCommonKey = keyDist.length > 0 ? keyDist[0].key : "--";
  const tempos = analyses.map((a) => a.tempo).filter((t): t is number => t != null);
  const avgTempo = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;
  const allUniqueChords = new Set<string>();
  for (const a of analyses) {
    for (const c of a.chords) allUniqueChords.add(c.chord);
  }
  const totalDuration = analyses
    .map((a) => a.duration)
    .filter((d): d is number => d != null)
    .reduce((a, b) => a + b, 0);

  // For sections that need 2+ or 3+
  const progressions = count >= 2 ? findCommonProgressions(analyses) : [];
  const similar = count >= 3 ? findSimilarRecordings(analyses) : [];

  // Musical DNA: favorite keys
  const topKeys = keyDist.slice(0, 3);

  // Top chords as badges
  const topChords = chordFreq.slice(0, 10);

  // Tempo range
  const minTempo = tempos.length > 0 ? Math.round(Math.min(...tempos)) : null;
  const maxTempo = tempos.length > 0 ? Math.round(Math.max(...tempos)) : null;

  return (
    <div className="space-y-8">
      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 md:grid-cols-6">
        <StatCard
          label="Recordings"
          value={String(totalRecordings)}
          icon={Music}
        />
        <StatCard
          label="Analyzed"
          value={String(count)}
          icon={Hash}
        />
        <StatCard
          label="Top Key"
          value={mostCommonKey}
          icon={Music}
        />
        <StatCard
          label="Avg Tempo"
          value={avgTempo ? `${avgTempo}` : "--"}
          icon={Gauge}
        />
        <StatCard
          label="Chords"
          value={String(allUniqueChords.size)}
          icon={Fingerprint}
        />
        <StatCard
          label="Duration"
          value={totalDuration > 0 ? formatTotalTime(totalDuration) : "--"}
          icon={Clock}
        />
      </div>

      {/* Musical DNA (1+ recordings) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-light text-muted-foreground">
            <Palette className="h-4 w-4" />
            Your Musical DNA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Favorite keys */}
          <div>
            <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
              {count === 1 ? "Your Key" : "Favorite Keys"}
            </p>
            <div className="flex flex-wrap gap-2">
              {topKeys.length > 0 ? (
                topKeys.map(({ key, count: c }) => (
                  <Badge key={key} variant="outline" className="text-sm">
                    {key}
                    {count > 1 && <span className="ml-1 text-xs text-muted-foreground">({c})</span>}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No key data</span>
              )}
            </div>
          </div>

          {/* Chord vocabulary */}
          <div>
            <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
              Chord Vocabulary ({allUniqueChords.size} unique)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {topChords.map(({ chord }) => (
                <Badge key={chord} variant="secondary" className="text-xs">
                  {chord}
                </Badge>
              ))}
              {allUniqueChords.size > 10 && (
                <span className="flex items-center text-xs text-muted-foreground">
                  +{allUniqueChords.size - 10} more
                </span>
              )}
            </div>
          </div>

          {/* Tempo range */}
          <div>
            <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
              Tempo Range
            </p>
            <p className="text-sm">
              {minTempo != null && maxTempo != null
                ? minTempo === maxTempo
                  ? `${minTempo} BPM`
                  : `${minTempo} -- ${maxTempo} BPM`
                : "No tempo data"}
            </p>
          </div>

          {/* Harmonic tendencies */}
          {tendencies.length > 0 && (
            <div>
              <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                Harmonic Tendencies
              </p>
              <div className="space-y-1">
                {tendencies.map((t) => (
                  <p key={t} className="text-sm text-muted-foreground">
                    {t}
                  </p>
                ))}
              </div>
              <p className="mt-1 text-sm font-medium">
                Style: {dominantStyle}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key & Chord Charts (2+ recordings) */}
      {count >= 2 && (
        <div className="grid gap-6 md:grid-cols-2">
          <KeyDistribution data={keyDist} />
          <ChordFrequency data={chordFreq} />
        </div>
      )}

      {/* Progression Patterns (2+ recordings) */}
      {count >= 2 && progressions.length > 0 && (
        <ProgressionPatterns progressions={progressions} />
      )}

      {/* Similar Recordings (3+ recordings) */}
      {count >= 3 && similar.length > 0 && (
        <SimilarRecordings pairs={similar} />
      )}

      {/* AI Library Overview (1+ recordings) */}
      <LibrarySummaryPanel analyses={analyses} />

      {/* AI Chat (1+ recordings) */}
      <InsightsChat analyses={analyses} />
    </div>
  );
}
