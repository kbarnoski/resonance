/**
 * L-system (Lindenmayer system) for the singing garden.
 * Grammar: F=forward, +=right, -=left, [=push, ]=pop
 * Pitch maps to branch angle; RMS maps to thickness + glow.
 */

export interface PlantParams {
  pitchClass: number; // 0–11 (C=0, D=2, E=4, G=7, A=9)
  rms: number; // 0–1 loudness
  notes: Array<{ hz: number; duration: number }>;
}

/** One branch segment for Three.js drawing */
export interface BranchSegment {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  depth: number; // 0 = trunk, higher = thinner
  isTip: boolean;
  glowSeed: number; // 0–1 for unique tip colour
}

export class LSystem {
  axiom: string;
  rules: Record<string, string>;

  constructor(axiom = "F", rules: Record<string, string> = {}) {
    this.axiom = axiom;
    this.rules = rules;
  }

  iterate(n: number): string {
    let s = this.axiom;
    for (let i = 0; i < n; i++) {
      let next = "";
      for (const ch of s) {
        next += this.rules[ch] ?? ch;
      }
      s = next;
    }
    return s;
  }

  /** Build a grammar tuned to pitch class and rms */
  static forParams(params: PlantParams): LSystem {
    const { pitchClass, rms } = params;

    // Higher pitch → tighter angle, more upward reach.
    // Lower pitch → wide spreading branches.
    const highPitch = pitchClass >= 7; // G or A → upward
    const medPitch = pitchClass >= 4 && pitchClass < 7; // E → balanced

    // Loud = more iterations, more branching
    const branchSymbol = rms > 0.5 ? "[+F][-F]" : "[+F]";
    const extraBranch = rms > 0.7 ? "[-F]" : "";

    let fRule: string;
    if (highPitch) {
      fRule = `FF${branchSymbol}${extraBranch}F`;
    } else if (medPitch) {
      fRule = `F${branchSymbol}${extraBranch}F`;
    } else {
      fRule = `F${branchSymbol}[-F]${extraBranch}F`;
    }

    return new LSystem("F", { F: fRule });
  }

  /** Convert an L-system string into branch segments via turtle graphics.
   *  All coordinates are in a local space centred at (cx, cz). */
  static buildSegments(
    lstr: string,
    angle: number, // branch angle in radians
    stepLen: number,
    cx: number,
    cz: number
  ): BranchSegment[] {
    const segments: BranchSegment[] = [];

    interface TurtleState {
      x: number;
      y: number;
      z: number;
      headingXZ: number; // angle in XZ plane (horizontal spread)
      headingY: number; // vertical lean
      depth: number;
    }

    const stack: TurtleState[] = [];
    const state: TurtleState = {
      x: cx,
      y: 0,
      z: cz,
      headingXZ: 0,
      headingY: Math.PI / 2, // start pointing up
      depth: 0,
    };

    for (const ch of lstr) {
      if (ch === "F") {
        const x0 = state.x;
        const y0 = state.y;
        const z0 = state.z;

        // Move forward: horizontal spread + vertical climb
        state.x += Math.cos(state.headingXZ) * Math.cos(state.headingY) * stepLen;
        state.y += Math.sin(state.headingY) * stepLen;
        state.z += Math.sin(state.headingXZ) * Math.cos(state.headingY) * stepLen;

        segments.push({
          x0,
          y0,
          z0,
          x1: state.x,
          y1: state.y,
          z1: state.z,
          depth: state.depth,
          isTip: false, // updated below
          glowSeed: Math.random(),
        });
      } else if (ch === "+") {
        state.headingXZ += angle;
        state.headingY -= angle * 0.3; // slight upward lean on right turn
      } else if (ch === "-") {
        state.headingXZ -= angle;
        state.headingY -= angle * 0.3;
      } else if (ch === "[") {
        stack.push({ ...state, depth: state.depth + 1 });
        state.depth += 1;
      } else if (ch === "]") {
        const prev = stack.pop();
        if (prev) {
          state.x = prev.x;
          state.y = prev.y;
          state.z = prev.z;
          state.headingXZ = prev.headingXZ;
          state.headingY = prev.headingY;
          state.depth = prev.depth;
        }
      }
    }

    // Proper tip detection: a segment is a tip if its end point is not
    // the start point of any other segment.
    const startPts = new Set(
      segments.map((s) => `${s.x0.toFixed(3)},${s.y0.toFixed(3)},${s.z0.toFixed(3)}`)
    );
    for (const seg of segments) {
      const endKey = `${seg.x1.toFixed(3)},${seg.y1.toFixed(3)},${seg.z1.toFixed(3)}`;
      seg.isTip = !startPts.has(endKey);
    }

    return segments;
  }
}

/** Angle (radians) driven by pitch: higher Hz → more upright (smaller spread angle) */
export function pitchToAngle(hz: number): number {
  // 80 Hz → ~40° spread; 900 Hz → ~15° spread
  const t = Math.min(1, Math.max(0, (Math.log(hz / 80) / Math.log(900 / 80))));
  return ((40 - t * 25) * Math.PI) / 180;
}

/** Branch radius driven by RMS */
export function rmsToRadius(rms: number, depth: number): number {
  const base = 0.02 + rms * 0.06; // 0.02–0.08
  return Math.max(0.005, base * Math.pow(0.62, depth));
}

/** Emissive glow intensity for call-and-response */
export function glowIntensity(rms: number, playing: boolean): number {
  return playing ? 0.4 + rms * 1.2 : 0.05 + rms * 0.15;
}

/** Tracks all plants, places them via golden-angle spiral */
export class GardenState {
  plants: Array<{
    params: PlantParams;
    segments: BranchSegment[];
    cx: number;
    cz: number;
    createdAt: number;
    glowing: boolean;
    glowStart: number;
  }> = [];

  private readonly goldenAngle = 137.5077640500378 * (Math.PI / 180);

  addPlant(params: PlantParams, segments: BranchSegment[]): void {
    const idx = this.plants.length;
    const r = idx === 0 ? 0 : 0.6 + idx * 0.35; // radius from centre
    const theta = idx * this.goldenAngle;
    const cx = r * Math.cos(theta);
    const cz = r * Math.sin(theta);
    this.plants.push({
      params,
      segments,
      cx,
      cz,
      createdAt: performance.now(),
      glowing: false,
      glowStart: 0,
    });
  }

  startGlow(plantIdx: number): void {
    if (plantIdx >= 0 && plantIdx < this.plants.length) {
      this.plants[plantIdx].glowing = true;
      this.plants[plantIdx].glowStart = performance.now();
    }
  }

  stopGlow(plantIdx: number): void {
    if (plantIdx >= 0 && plantIdx < this.plants.length) {
      this.plants[plantIdx].glowing = false;
    }
  }

  glowAll(): void {
    for (let i = 0; i < this.plants.length; i++) {
      this.startGlow(i);
    }
  }

  stopAllGlow(): void {
    for (let i = 0; i < this.plants.length; i++) {
      this.stopGlow(i);
    }
  }
}
