/**
 * grove.ts — recursive-branching grove state machine.
 * Each exhale grows the grove. All branches + blossoms are recorded
 * with the breath index that created them (enabling timelapse replay).
 *
 * Inspired by L-systems (Aristid Lindenmayer) for recursive branching grammar.
 */

export interface BreathRecord {
  index: number;
  duration: number;
  strength: number;
}

export interface Segment {
  id: number;
  breathIdx: number;     // which breath created this
  x1: number; y1: number;
  x2: number; y2: number;
  angle: number;         // radians, from parent
  depth: number;         // 0 = trunk, higher = thinner twigs
  length: number;
  thickness: number;
  color: string;         // css color
  glowColor: string;
  growT: number;         // 0..1 grow-in animation, ticks to 1
  treeId: number;        // which sapling
}

export interface Blossom {
  id: number;
  breathIdx: number;
  x: number; y: number;
  r: number;
  color: string;
  glowColor: string;
  alpha: number;         // fade in
  type: "leaf" | "flower" | "ember";
  treeId: number;
  angle: number;         // for leaf orientation
}

export interface Firefly {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  phase: number;
  color: string;
}

export interface GroveState {
  breathCount: number;
  stage: 1 | 2 | 3 | 4;
  segments: Segment[];
  blossoms: Blossom[];
  fireflies: Firefly[];
  breaths: BreathRecord[];
  /** tip points available for extending — (x,y,angle,depth,treeId,segId) */
  tips: TipPoint[];
  /** sapling base x positions */
  trees: TreeInfo[];
  seed: number;          // deterministic RNG seed per session
}

export interface TipPoint {
  x: number; y: number;
  angle: number;
  depth: number;
  treeId: number;
}

export interface TreeInfo {
  id: number;
  x: number;             // base x (0..1 fraction of canvas W)
  baseY: number;         // fraction of canvas H (0.75..0.95)
}

let _gid = 0;

// -- Deterministic RNG (xorshift32) --
function makeRng(seed: number) {
  let s = seed >>> 0 || 0xdeadbeef;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

// Pelog-warm color palette for branches + blossoms
const BRANCH_COLORS = [
  "#8b5e3c", "#a0714a", "#7a5230", "#c48a50", "#b37840",
];
const BLOSSOM_COLORS = [
  "#f9a8d4", "#c4b5fd", "#86efac", "#fde68a", "#99f6e4",
  "#fcd34d", "#a5b4fc", "#fbcfe8",
];
const EMBER_COLORS = [
  "#fdba74", "#fde68a", "#fca5a5", "#c4b5fd",
];
const GLOW_COLORS = [
  "#f59e0b", "#a78bfa", "#10b981", "#ec4899", "#67e8f9",
];

function stageFor(breathCount: number): 1 | 2 | 3 | 4 {
  if (breathCount < 5) return 1;
  if (breathCount < 10) return 2;
  if (breathCount < 15) return 3;
  return 4;
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function makeGroveState(seed: number): GroveState {
  return {
    breathCount: 0,
    stage: 1,
    segments: [],
    blossoms: [],
    fireflies: [],
    breaths: [],
    tips: [],
    trees: [],
    seed,
  };
}

/**
 * Apply one breath event to the grove, returning a new state (mutated copy).
 * canvasW / canvasH needed for absolute positioning.
 */
export function applyBreath(
  state: GroveState,
  breath: BreathRecord,
  canvasW: number,
  canvasH: number,
): GroveState {
  const rng = makeRng(state.seed + breath.index * 7919);
  const breathIdx = breath.index;
  const stage = stageFor(breath.index + 1);

  const newSegments: Segment[] = [...state.segments];
  const newBlossoms: Blossom[] = [...state.blossoms];
  let newTips: TipPoint[] = [...state.tips];
  let newTrees: TreeInfo[] = [...state.trees];
  const newFireflies: Firefly[] = [...state.fireflies];

  // ---- Stage 1: new sapling sprouts on first few breaths ----------------
  const treeIdx = state.trees.length;
  const shouldSprout =
    stage === 1 ||
    (stage === 2 && treeIdx < 5 && rng() < 0.55) ||
    (stage >= 3 && treeIdx < 7 && rng() < 0.35);

  if (shouldSprout && treeIdx < 8) {
    // Spread trees across the lower canvas
    const xFrac = 0.1 + rng() * 0.8;
    const baseFrac = 0.76 + rng() * 0.16;
    const tree: TreeInfo = {
      id: treeIdx,
      x: xFrac,
      baseY: baseFrac,
    };
    newTrees = [...newTrees, tree];

    // Trunk segment
    const baseX = canvasW * xFrac;
    const baseY = canvasH * baseFrac;
    const trunkLen = (30 + rng() * 40) * (0.6 + breath.strength * 0.8);
    const trunkAngle = -Math.PI / 2 + (rng() - 0.5) * 0.25;
    const tip2x = baseX + Math.cos(trunkAngle) * trunkLen;
    const tip2y = baseY + Math.sin(trunkAngle) * trunkLen;

    const trunk: Segment = {
      id: _gid++,
      breathIdx,
      x1: baseX, y1: baseY,
      x2: tip2x, y2: tip2y,
      angle: trunkAngle,
      depth: 0,
      length: trunkLen,
      thickness: 4 + rng() * 3,
      color: pick(BRANCH_COLORS, rng),
      glowColor: pick(GLOW_COLORS, rng),
      growT: 0,
      treeId: treeIdx,
    };
    newSegments.push(trunk);

    // Add this trunk tip for future extension
    newTips.push({ x: tip2x, y: tip2y, angle: trunkAngle, depth: 1, treeId: treeIdx });
  }

  // ---- Grow existing tips (extend or split) -----------------------------
  const maxNewSegs = 1 + Math.floor(breath.strength * 3) + (stage >= 3 ? 1 : 0);
  let grown = 0;

  // Prefer tips from the current tree variety for organic feel
  const shuffled = [...newTips].sort(() => rng() - 0.5);

  for (let i = 0; i < shuffled.length && grown < maxNewSegs; i++) {
    const tip = shuffled[i];
    if (tip.depth > 7) continue; // don't go too fine

    const tipIdx = newTips.indexOf(tip);
    if (tipIdx === -1) continue;

    // Remove this tip (it will be replaced by new tips)
    newTips = newTips.filter((_, j) => j !== newTips.indexOf(tip));

    const thicknessMult = Math.pow(0.72, tip.depth);
    const lengthMult = Math.pow(0.80, tip.depth);
    const baseLen = (20 + rng() * 30) * lengthMult * (0.5 + breath.strength * 0.9);

    // Decide: extend (1 branch) or split (2 branches), based on strength + stage
    const doSplit = (rng() < 0.4 + breath.strength * 0.3 + (stage >= 2 ? 0.15 : 0));

    const branches = doSplit ? 2 : 1;
    for (let b = 0; b < branches; b++) {
      const spreadBase = 0.28 + breath.strength * 0.18;
      const sway = doSplit
        ? (b === 0 ? -1 : 1) * (spreadBase + rng() * 0.2)
        : (rng() - 0.5) * 0.3;
      const angle = tip.angle + sway;
      const len = baseLen * (0.8 + rng() * 0.4);
      const x2 = tip.x + Math.cos(angle) * len;
      const y2 = tip.y + Math.sin(angle) * len;

      const seg: Segment = {
        id: _gid++,
        breathIdx,
        x1: tip.x, y1: tip.y,
        x2, y2,
        angle,
        depth: tip.depth + 1,
        length: len,
        thickness: Math.max(0.6, (3 + rng() * 2) * thicknessMult),
        color: tip.depth >= 3 ? pick(BRANCH_COLORS.slice(2), rng) : pick(BRANCH_COLORS, rng),
        glowColor: pick(GLOW_COLORS, rng),
        growT: 0,
        treeId: tip.treeId,
      };
      newSegments.push(seg);
      newTips.push({ x: x2, y: y2, angle, depth: tip.depth + 1, treeId: tip.treeId });
      grown++;

      // Add blossom on mature depth or by stage
      const blossomChance =
        (tip.depth >= 3 ? 0.6 : 0.15) * (1 + (stage - 1) * 0.25);
      if (rng() < blossomChance) {
        const bType: Blossom["type"] =
          stage >= 3 ? (rng() < 0.4 ? "ember" : "flower") :
          tip.depth >= 4 ? "flower" : "leaf";
        newBlossoms.push({
          id: _gid++,
          breathIdx,
          x: x2 + (rng() - 0.5) * 8,
          y: y2 + (rng() - 0.5) * 8,
          r: bType === "leaf" ? 3 + rng() * 4 : 4 + rng() * 6,
          color: bType === "ember"
            ? pick(EMBER_COLORS, rng)
            : bType === "flower"
              ? pick(BLOSSOM_COLORS.slice(0, 4), rng)
              : pick(BLOSSOM_COLORS.slice(4), rng),
          glowColor: pick(GLOW_COLORS, rng),
          alpha: 0,
          type: bType,
          treeId: tip.treeId,
          angle: rng() * Math.PI * 2,
        });
      }
    }
  }

  // ---- Stage 3+: fireflies ----------------------------------------------
  if (stage >= 3 && newFireflies.length < 20 && rng() < 0.7) {
    const numNew = 1 + Math.floor(rng() * 2);
    for (let f = 0; f < numNew; f++) {
      newFireflies.push({
        id: _gid++,
        x: canvasW * (0.05 + rng() * 0.9),
        y: canvasH * (0.3 + rng() * 0.55),
        vx: (rng() - 0.5) * 0.4,
        vy: (rng() - 0.5) * 0.3,
        phase: rng() * Math.PI * 2,
        color: pick(EMBER_COLORS, rng),
      });
    }
  }

  return {
    ...state,
    breathCount: breath.index + 1,
    stage,
    segments: newSegments,
    blossoms: newBlossoms,
    fireflies: newFireflies,
    breaths: [...state.breaths, breath],
    tips: newTips,
    trees: newTrees,
  };
}

/**
 * Build all grove states up to breathN for timelapse replay.
 * Returns array of partial states indexed by breath count.
 */
export function buildTimelapse(
  finalState: GroveState,
  canvasW: number,
  canvasH: number,
): GroveState[] {
  const frames: GroveState[] = [];
  let s = makeGroveState(finalState.seed);
  frames.push(s);

  for (const breath of finalState.breaths) {
    s = applyBreath(s, breath, canvasW, canvasH);
    frames.push(s);
  }
  return frames;
}
