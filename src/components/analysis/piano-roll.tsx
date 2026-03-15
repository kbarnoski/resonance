"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PianoRollProps {
  notes: { midi: number; time: number; duration: number; velocity: number }[];
  currentTime: number;
  duration: number;
  defaultOpen?: boolean;
}

export function PianoRoll({ notes, currentTime, duration, defaultOpen = false }: PianoRollProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (notes.length === 0 || duration === 0) return null;

  const SVG_WIDTH = 1200;
  const SVG_HEIGHT = 300;
  const PADDING = { top: 10, bottom: 10, left: 40, right: 10 };

  const plotWidth = SVG_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;

  // Find note range
  const midiValues = notes.map((n) => n.midi);
  const minMidi = Math.max(0, Math.min(...midiValues) - 2);
  const maxMidi = Math.min(127, Math.max(...midiValues) + 2);
  const midiRange = maxMidi - minMidi || 1;

  function timeToX(t: number): number {
    return PADDING.left + (t / duration) * plotWidth;
  }

  function midiToY(midi: number): number {
    return PADDING.top + plotHeight - ((midi - minMidi) / midiRange) * plotHeight;
  }

  const noteHeight = Math.max(2, Math.min(8, plotHeight / midiRange));

  // Generate piano key labels (every octave C)
  const labels: { midi: number; name: string }[] = [];
  for (let m = minMidi; m <= maxMidi; m++) {
    if (m % 12 === 0) {
      labels.push({ midi: m, name: `C${Math.floor(m / 12) - 1}` });
    }
  }

  const playheadX = timeToX(currentTime);

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        className="w-full justify-between text-sm font-medium text-muted-foreground"
        onClick={() => setOpen(!open)}
      >
        Piano Roll
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {open && (
      <div className="rounded-lg border bg-card overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full min-w-[400px] sm:min-w-[600px]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines for octave Cs */}
          {labels.map((l) => (
            <g key={l.midi}>
              <line
                x1={PADDING.left}
                x2={SVG_WIDTH - PADDING.right}
                y1={midiToY(l.midi)}
                y2={midiToY(l.midi)}
                stroke="currentColor"
                strokeOpacity={0.1}
              />
              <text
                x={PADDING.left - 4}
                y={midiToY(l.midi) + 3}
                textAnchor="end"
                fontSize={10}
                fill="currentColor"
                opacity={0.5}
              >
                {l.name}
              </text>
            </g>
          ))}

          {/* Notes */}
          {notes.map((note, i) => {
            const x = timeToX(note.time);
            const w = Math.max(2, (note.duration / duration) * plotWidth);
            const y = midiToY(note.midi) - noteHeight / 2;
            const isActive =
              currentTime >= note.time && currentTime < note.time + note.duration;
            const opacity = 0.4 + (note.velocity / 127) * 0.6;

            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={w}
                height={noteHeight}
                rx={1}
                fill={isActive ? "hsl(var(--primary))" : "hsl(var(--primary))"}
                opacity={isActive ? 1 : opacity}
                stroke={isActive ? "hsl(var(--primary))" : "none"}
                strokeWidth={isActive ? 1.5 : 0}
              />
            );
          })}

          {/* Playhead */}
          <line
            x1={playheadX}
            x2={playheadX}
            y1={PADDING.top}
            y2={SVG_HEIGHT - PADDING.bottom}
            stroke="hsl(var(--destructive))"
            strokeWidth={1.5}
          />
        </svg>
      </div>
      )}
    </div>
  );
}
