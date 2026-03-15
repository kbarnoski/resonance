"use client";

interface ChordTimelineProps {
  chords: { chord: string; time: number; duration: number }[];
  currentTime: number;
  duration: number;
  hideHeading?: boolean;
  className?: string;
}

const CHORD_COLORS = [
  "bg-primary/20 text-primary",
  "bg-primary/15 text-primary",
  "bg-primary/25 text-primary",
  "bg-primary/10 text-primary",
  "bg-primary/30 text-primary",
  "bg-primary/18 text-primary",
  "bg-primary/12 text-primary",
  "bg-primary/22 text-primary",
];

export function ChordTimeline({
  chords,
  currentTime,
  duration,
  hideHeading,
  className,
}: ChordTimelineProps) {
  if (chords.length === 0 || duration === 0) return null;

  // Assign colors to unique chords by index
  const uniqueChords = [...new Set(chords.map((c) => c.chord))];
  const colorMap = new Map(
    uniqueChords.map((chord, i) => [chord, CHORD_COLORS[i % CHORD_COLORS.length]])
  );

  // Find currently active chord
  const activeChord = chords.find(
    (c) => currentTime >= c.time && currentTime < c.time + c.duration
  );

  return (
    <div className={className ?? "space-y-2"}>
      {!hideHeading && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Chord Timeline</h3>
          {activeChord && (
            <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-bold text-primary">
              {activeChord.chord}
            </span>
          )}
        </div>
      )}
      <div className="relative h-10 rounded-lg border bg-card overflow-hidden">
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 transition-all duration-100"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />

        {/* Chord blocks */}
        {chords.map((chord, i) => {
          const left = (chord.time / duration) * 100;
          const width = (chord.duration / duration) * 100;
          const isActive =
            currentTime >= chord.time && currentTime < chord.time + chord.duration;

          return (
            <div
              key={i}
              className={`absolute top-0 bottom-0 flex items-center justify-center text-xs font-medium border-r border-background/50 ${
                colorMap.get(chord.chord) ?? CHORD_COLORS[0]
              } ${isActive ? "ring-2 ring-primary z-5" : ""}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${chord.chord} (${chord.time.toFixed(1)}s)`}
            >
              {width > 3 && <span className="truncate px-1">{chord.chord}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
