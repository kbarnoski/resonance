// hunt.ts — animal placement, heading-to-facing logic, collect state machine
// ─────────────────────────────────────────────────────────────────────────────
// D-Dorian scale frequencies (D3–D5): D E F G A B C
// MIDI: 50 52 53 55 57 59 60  62 64 65 67 69 71 72
// We pick kid-safe sustained notes from this set for each animal.
// ─────────────────────────────────────────────────────────────────────────────

export interface Animal {
  id: number;
  name: string;
  emoji: string;
  // spatial position (fixed, relative to world-north)
  azimuthRad: number; // 0 = north, clockwise
  elevationRad: number; // 0 = horizon, + = above
  // synthesis params
  baseHz: number;
  waveType: OscillatorType;
  timbre: "owl" | "frog" | "bird" | "whale" | "cricket" | "firefly";
  color: string;
  // state
  collected: boolean;
  facingDwell: number; // seconds of continuous facing
  collectT: number;   // normalized 0→1 for collect animation
  swell: number;      // 0→1 smoothed facing strength
  flyInT: number;     // 0→1 collect fly-in animation
}

// D-Dorian: D3 E3 F3 G3 A3 B3 C4 D4 E4 F4 G4 A4 B4
const D_DORIAN_HZ = [
  146.83, // D3
  164.81, // E3
  174.61, // F3
  196.00, // G3
  220.00, // A3
  246.94, // B3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  349.23, // F4
  392.00, // G4
  440.00, // A4
  493.88, // B4
];

// Angle diff normalized to [-pi, pi]
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function makeAnimals(): Animal[] {
  return [
    {
      id: 0,
      name: "Owl",
      emoji: "🦉",
      azimuthRad: 0.0,               // north
      elevationRad: 0.3,             // slightly above
      baseHz: D_DORIAN_HZ[6],       // C4 — warm mid
      waveType: "sine",
      timbre: "owl",
      color: "#f59e42",
      collected: false,
      facingDwell: 0,
      collectT: 0,
      swell: 0,
      flyInT: 0,
    },
    {
      id: 1,
      name: "Frog",
      emoji: "🐸",
      azimuthRad: (Math.PI * 2) / 5,  // 72°
      elevationRad: -0.1,              // just below horizon (pond level)
      baseHz: D_DORIAN_HZ[3],         // G3
      waveType: "triangle",
      timbre: "frog",
      color: "#34d399",
      collected: false,
      facingDwell: 0,
      collectT: 0,
      swell: 0,
      flyInT: 0,
    },
    {
      id: 2,
      name: "Bird",
      emoji: "🐦",
      azimuthRad: (Math.PI * 4) / 5,  // 144°
      elevationRad: 0.6,               // up in the trees
      baseHz: D_DORIAN_HZ[11],        // A4 — bright
      waveType: "sine",
      timbre: "bird",
      color: "#60a5fa",
      collected: false,
      facingDwell: 0,
      collectT: 0,
      swell: 0,
      flyInT: 0,
    },
    {
      id: 3,
      name: "Whale",
      emoji: "🐋",
      azimuthRad: (Math.PI * 6) / 5,  // 216°
      elevationRad: -0.5,              // below (ocean depth)
      baseHz: D_DORIAN_HZ[0],         // D3 — deep
      waveType: "sine",
      timbre: "whale",
      color: "#818cf8",
      collected: false,
      facingDwell: 0,
      collectT: 0,
      swell: 0,
      flyInT: 0,
    },
    {
      id: 4,
      name: "Cricket",
      emoji: "🦗",
      azimuthRad: (Math.PI * 8) / 5,  // 288°
      elevationRad: 0.1,
      baseHz: D_DORIAN_HZ[7],         // D4 — crisp mid
      waveType: "triangle",
      timbre: "cricket",
      color: "#a3e635",
      collected: false,
      facingDwell: 0,
      collectT: 0,
      swell: 0,
      flyInT: 0,
    },
    {
      id: 5,
      name: "Firefly",
      emoji: "✨",
      azimuthRad: Math.PI,            // 180°
      elevationRad: 0.4,
      baseHz: D_DORIAN_HZ[4],        // A3 — gentle mid
      waveType: "sine",
      timbre: "firefly",
      color: "#fde68a",
      collected: false,
      facingDwell: 0,
      collectT: 0,
      swell: 0,
      flyInT: 0,
    },
  ];
}

// Facing width — animal is considered "centered" within this cone (radians)
export const FACING_CONE = 0.42; // ~24 degrees half-width

// How long to dwell in the cone before auto-collect (seconds)
export const DWELL_COLLECT_S = 1.2;

// Compute facing strength [0..1] for an animal given the current listener yaw
export function computeFacing(animal: Animal, listenerYaw: number): number {
  const diff = Math.abs(angleDiff(animal.azimuthRad, listenerYaw));
  return Math.max(0, 1 - diff / (FACING_CONE * 2));
}

// Compute world-space 3-D position for a panner given azimuth + elevation
// The listener is at origin facing +Z (north at yaw=0 handled by AudioListener orientation).
// We bake positions in a listener-relative world: north = (0,0,-1)
export function animalToXYZ(
  azimuthRad: number,
  elevationRad: number,
  radius: number,
): [number, number, number] {
  const cosEl = Math.cos(elevationRad);
  const x = Math.sin(azimuthRad) * cosEl * radius;
  const y = Math.sin(elevationRad) * radius;
  const z = -Math.cos(azimuthRad) * cosEl * radius;
  return [x, y, z];
}

// D-Dorian celebration melody (note indices into D_DORIAN_HZ)
export const CELEBRATION_MELODY = [0, 3, 6, 7, 9, 11, 9, 7, 6, 3, 0];
export { D_DORIAN_HZ };
