// Hand-designed arrangement of material objects on a 1000x1400 reference board.
// The board is scaled to fit the canvas at draw/step time. Fundamentals are
// drawn from a C-major pentatonic so every collision lands in a pleasant scale.

import type { Obstacle } from "./physics";

export const BOARD_W = 1000;
export const BOARD_H = 1400;

// C-major pentatonic across a few octaves.
// C3 D3 E3 G3 A3 C4 D4 E4 G4 A4 C5 D5 E5 G5
const PENTA = [
  130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25, 783.99,
];

function circle(
  cx: number,
  cy: number,
  r: number,
  material: Obstacle["material"],
  pi: number,
  restitution: number,
  sticky = false,
): Obstacle {
  return {
    shape: "circle",
    material,
    fundamentalHz: PENTA[pi],
    cx,
    cy,
    ax: cx,
    ay: cy,
    bx: cx,
    by: cy,
    r,
    restitution,
    sticky,
    pulse: 0,
  };
}

function bar(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  material: Obstacle["material"],
  pi: number,
  restitution: number,
): Obstacle {
  return {
    shape: "capsule",
    material,
    fundamentalHz: PENTA[pi],
    cx: (ax + bx) / 2,
    cy: (ay + by) / 2,
    ax,
    ay,
    bx,
    by,
    r,
    restitution,
    sticky: false,
    pulse: 0,
  };
}

export function makeLevel(): Obstacle[] {
  const o: Obstacle[] = [];

  // Top wooden ramps to scatter the drop.
  o.push(bar(120, 230, 430, 320, 16, "wood", 5, 0.4));
  o.push(bar(880, 230, 570, 320, 16, "wood", 6, 0.4));

  // Wooden peg field — quick warm taps.
  o.push(circle(300, 430, 24, "wood", 2, 0.55));
  o.push(circle(500, 470, 24, "wood", 4, 0.55));
  o.push(circle(700, 430, 24, "wood", 7, 0.55));

  // Glass bell circle — bright rings (the pretty middle layer).
  o.push(circle(220, 600, 34, "glass", 9, 0.7));
  o.push(circle(400, 660, 30, "glass", 11, 0.7));
  o.push(circle(600, 660, 30, "glass", 12, 0.7));
  o.push(circle(780, 600, 34, "glass", 10, 0.7));

  // Metal chime bars — long shimmer, angled so marbles ride and ring.
  o.push(bar(150, 820, 420, 900, 13, "metal", 8, 0.62));
  o.push(bar(850, 820, 580, 900, 13, "metal", 13, 0.62));
  o.push(bar(360, 1010, 640, 1010, 12, "metal", 5, 0.55));

  // Sticky-mud blob (gentle stakes): traps a marble until freed.
  o.push(circle(500, 1130, 40, "drum", 0, 0.2, true));

  // Drum pads near the bottom — boom before exit.
  o.push(circle(250, 1230, 46, "drum", 0, 0.5));
  o.push(circle(750, 1230, 46, "drum", 3, 0.5));

  return o;
}

export const MATERIAL_COLOR: Record<Obstacle["material"], string> = {
  wood: "#c08a4a",
  glass: "#7dd3fc",
  metal: "#cbd5e1",
  drum: "#fb7185",
};

export const MATERIAL_GLOW: Record<Obstacle["material"], string> = {
  wood: "#f0b86e",
  glass: "#e0f7ff",
  metal: "#ffffff",
  drum: "#ffd0d8",
};
