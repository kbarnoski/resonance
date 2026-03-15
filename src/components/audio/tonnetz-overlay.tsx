"use client";

import { useRef, useEffect, useMemo } from "react";

interface TonnetzOverlayProps {
  notes: { time: number; duration: number; midi: number }[];
  chords: { time: number; duration: number; chord: string }[];
  currentTime: number;
}

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Tonnetz layout: hexagonal grid where
 *   - Horizontal axis = perfect 5ths (each step +7 semitones)
 *   - Diagonal NE = major 3rds (each step +4 semitones)
 *   - Diagonal NW = minor 3rds (each step +3 semitones)
 *
 * We lay out a 7x5 grid of pitch classes.
 */

const COLS = 7;
const ROWS = 5;
const HEX_RADIUS = 22;

// Build the pitch-class grid: row offsets by minor 3rds, cols by perfect 5ths
function buildGrid(): number[][] {
  const grid: number[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < COLS; col++) {
      // Each row down = +3 semitones (minor 3rd), each col right = +7 semitones (perfect 5th)
      // Start from C (pitch class 0) at center
      const centerRow = Math.floor(ROWS / 2);
      const centerCol = Math.floor(COLS / 2);
      const pc = ((row - centerRow) * 3 + (col - centerCol) * 7 + 120) % 12;
      rowData.push(pc);
    }
    grid.push(rowData);
  }
  return grid;
}

function hexCenter(row: number, col: number): { x: number; y: number } {
  const xSpacing = HEX_RADIUS * 1.85;
  const ySpacing = HEX_RADIUS * 1.6;
  const xOffset = row % 2 === 1 ? xSpacing / 2 : 0;
  const centerCol = Math.floor(COLS / 2);
  const centerRow = Math.floor(ROWS / 2);
  return {
    x: (col - centerCol) * xSpacing + xOffset,
    y: (row - centerRow) * ySpacing,
  };
}

function drawHex(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function chordRootPc(chord: string): number | null {
  const match = chord.match(/^([A-G][#b]?)/);
  if (!match) return null;
  const root = match[1];
  const map: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
    E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10, B: 11,
  };
  return map[root] ?? null;
}

export function TonnetzOverlay({ notes, chords, currentTime }: TonnetzOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grid = useMemo(() => buildGrid(), []);

  // Active pitch classes at current time
  const activePcs = useMemo(() => {
    const pcs = new Set<number>();
    for (const n of notes) {
      if (currentTime >= n.time && currentTime < n.time + n.duration) {
        pcs.add(n.midi % 12);
      }
    }
    return pcs;
  }, [notes, currentTime]);

  // Current chord root
  const currentChordRoot = useMemo(() => {
    for (let i = chords.length - 1; i >= 0; i--) {
      const c = chords[i];
      if (currentTime >= c.time && currentTime < c.time + c.duration) {
        return chordRootPc(c.chord);
      }
    }
    return null;
  }, [chords, currentTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(devicePixelRatio, 2);
    const w = 300;
    const h = 260;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const pc = grid[row][col];
        const pos = hexCenter(row, col);
        const hx = cx + pos.x;
        const hy = cy + pos.y;

        const isActive = activePcs.has(pc);
        const isRoot = currentChordRoot === pc;

        // Draw hex
        drawHex(ctx, hx, hy, HEX_RADIUS - 2);

        if (isRoot) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (isActive) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Glow for active/root
        if (isRoot || isActive) {
          ctx.save();
          ctx.shadowColor = "rgba(255, 255, 255, 0.4)";
          ctx.shadowBlur = isRoot ? 12 : 6;
          drawHex(ctx, hx, hy, HEX_RADIUS - 2);
          ctx.strokeStyle = "transparent";
          ctx.fillStyle = isRoot ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.03)";
          ctx.fill();
          ctx.restore();
        }

        // Label
        const label = PITCH_NAMES[pc];
        ctx.font = `${isRoot ? "600" : "400"} ${isRoot ? 11 : 9}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isRoot
          ? "rgba(255, 255, 255, 0.9)"
          : isActive
            ? "rgba(255, 255, 255, 0.6)"
            : "rgba(255, 255, 255, 0.2)";
        ctx.fillText(label, hx, hy);
      }
    }
  }, [grid, activePcs, currentChordRoot]);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 12, opacity: 0.6 }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
