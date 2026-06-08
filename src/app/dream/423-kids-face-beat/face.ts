// face.ts — blendshape → drum trigger logic for 423-kids-face-beat.
//
// Reads the 52 MediaPipe FaceLandmarker blendshape scores each frame, applies
// an EMA smoother to remove jitter, then detects RISING EDGES above a per-voice
// threshold. Per-voice cooldown prevents machine-gunning from a held expression.
//
// Five drum voices:
//   jawOpen                        → KICK   (boom)
//   browInnerUp / browOuterUpLeft/R → HAT    (tick)
//   mouthSmileLeft+Right (mean)    → SHAKER (sparkle)
//   cheekPuff                      → TOM    (low boom)
//   eyeBlinkLeft+Right (both high) → RIM    (tick) — high threshold so blinks don't fire
//
// The ghost-face (auto-demo) emits a fun pre-programmed beat pattern through
// the same FaceDetector API so fallback behaviour is identical to live tracking.

import type { DrumKind } from "./audio";

// ── Blendshape category (subset we care about) ───────────────────────────────

export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

// ── EMA smoother ─────────────────────────────────────────────────────────────
// α=0.25 → heavy smoothing (feels alive, not jittery over ~4 frames).
const EMA_ALPHA = 0.25;

// ── Per-voice config ─────────────────────────────────────────────────────────

interface VoiceConfig {
  kind: DrumKind;
  /** Blendshape names to average (score = mean of all listed). */
  blendshapes: string[];
  /** Rising-edge threshold (0..1). Score must cross above this. */
  threshold: number;
  /** Minimum ms between two triggers on the same voice. */
  cooldownMs: number;
  /** Velocity (0..1) sent to the groove on trigger. */
  velocity: number;
  /** Face-region anchor for burst fx: normalised (0..1) relative to face bbox. */
  anchor: { x: number; y: number };
}

const VOICE_CONFIGS: VoiceConfig[] = [
  {
    kind: "kick",
    blendshapes: ["jawOpen"],
    threshold: 0.42,
    cooldownMs: 220,
    velocity: 0.9,
    anchor: { x: 0.5, y: 0.72 }, // mouth center
  },
  {
    kind: "hat",
    blendshapes: ["browInnerUp", "browOuterUpLeft", "browOuterUpRight"],
    threshold: 0.38,
    cooldownMs: 180,
    velocity: 0.75,
    anchor: { x: 0.5, y: 0.28 }, // brow area
  },
  {
    kind: "shaker",
    blendshapes: ["mouthSmileLeft", "mouthSmileRight"],
    threshold: 0.44,
    cooldownMs: 240,
    velocity: 0.8,
    anchor: { x: 0.5, y: 0.65 }, // cheeks
  },
  {
    kind: "tom",
    blendshapes: ["cheekPuff"],
    threshold: 0.40,
    cooldownMs: 300,
    velocity: 0.85,
    anchor: { x: 0.5, y: 0.5 }, // cheek center
  },
  {
    kind: "rim",
    // Both eyes must blink simultaneously for a deliberate wink trigger.
    // The composite score = min(left, right) — both must be high together.
    blendshapes: ["eyeBlinkLeft", "eyeBlinkRight"],
    threshold: 0.55, // higher — ignores normal blinks
    cooldownMs: 350,
    velocity: 0.7,
    anchor: { x: 0.5, y: 0.38 }, // eye area
  },
];

// ── FaceDetector class ────────────────────────────────────────────────────────

export interface DrumEvent {
  kind: DrumKind;
  velocity: number;
  anchor: { x: number; y: number };
}

export class FaceDetector {
  // EMA-smoothed scores, keyed by blendshape name
  private smoothed: Map<string, number> = new Map();
  // Previous EMA value (used for rising-edge detection)
  private prev: Map<string, number> = new Map();
  // Last trigger timestamp per voice
  private lastTrigger: Map<DrumKind, number> = new Map();

  // Energy 0..1 (used to fill the groove backbone)
  energy = 0;

  /** Call once per frame with the raw blendshape array from MediaPipe. */
  update(
    categories: BlendshapeCategory[],
    nowMs: number,
  ): DrumEvent[] {
    // Update EMA for each blendshape we track.
    const catMap = new Map<string, number>();
    for (const c of categories) catMap.set(c.categoryName, c.score);

    const allNames = new Set<string>();
    for (const cfg of VOICE_CONFIGS) cfg.blendshapes.forEach((n) => allNames.add(n));

    for (const name of allNames) {
      const raw = catMap.get(name) ?? 0;
      const prev = this.smoothed.get(name) ?? 0;
      this.smoothed.set(name, prev + EMA_ALPHA * (raw - prev));
    }

    // Estimate overall face energy (mean of all smoothed scores).
    let sumE = 0;
    let countE = 0;
    for (const v of this.smoothed.values()) { sumE += v; countE++; }
    this.energy = countE > 0 ? Math.min(1, (sumE / countE) * 6) : 0;

    const events: DrumEvent[] = [];

    for (const cfg of VOICE_CONFIGS) {
      // Composite score: for blink use min(left, right); for others use mean.
      let score: number;
      if (cfg.kind === "rim") {
        const l = this.smoothed.get("eyeBlinkLeft") ?? 0;
        const r = this.smoothed.get("eyeBlinkRight") ?? 0;
        score = Math.min(l, r);
      } else {
        const vals = cfg.blendshapes.map((n) => this.smoothed.get(n) ?? 0);
        score = vals.reduce((a, b) => a + b, 0) / vals.length;
      }

      // Build a single composite key for rising-edge tracking.
      const key = cfg.kind + "_composite";
      const prevScore = this.prev.get(key) ?? 0;
      this.prev.set(key, score);

      const lastT = this.lastTrigger.get(cfg.kind) ?? 0;
      const cooldownOk = nowMs - lastT > cfg.cooldownMs;

      // Rising edge: was below threshold, now above.
      if (prevScore < cfg.threshold && score >= cfg.threshold && cooldownOk) {
        this.lastTrigger.set(cfg.kind, nowMs);
        events.push({
          kind: cfg.kind,
          velocity: cfg.velocity * Math.min(1, 0.6 + score * 0.8),
          anchor: cfg.anchor,
        });
      }
    }

    return events;
  }

  reset(): void {
    this.smoothed.clear();
    this.prev.clear();
    this.lastTrigger.clear();
    this.energy = 0;
  }
}

// ── Ghost face (auto-demo) ────────────────────────────────────────────────────
// Emits a fun beat pattern by returning synthetic blendshape arrays.
// Pattern is 2-bar (128 16th-notes at ~100 BPM ≈ 4.8s loop).

// Map: step (0..31) → which drum fires at that step.
// Each entry is a partial blendshape map with a score well above threshold.
const GHOST_PATTERN: Array<Partial<Record<string, number>>> = Array.from(
  { length: 32 },
  () => ({}),
);

// Helper to inject a blendshape into the pattern.
function setGhost(step: number, shapes: Partial<Record<string, number>>): void {
  Object.assign(GHOST_PATTERN[step], shapes);
}

// Bar 1 (steps 0..15):
setGhost(0,  { jawOpen: 0.9 });                                  // kick beat 1
setGhost(2,  { browInnerUp: 0.8, browOuterUpLeft: 0.7 });        // hat
setGhost(4,  { mouthSmileLeft: 0.85, mouthSmileRight: 0.82 });   // shaker beat 2
setGhost(6,  { browInnerUp: 0.75 });                             // hat
setGhost(8,  { jawOpen: 0.85 });                                 // kick beat 3
setGhost(9,  { browInnerUp: 0.7 });                              // hat 16th
setGhost(10, { browInnerUp: 0.78 });                             // hat
setGhost(12, { mouthSmileLeft: 0.9, mouthSmileRight: 0.88 });    // shaker beat 4
setGhost(14, { browInnerUp: 0.72 });                             // hat
setGhost(15, { cheekPuff: 0.75 });                               // tom fill

// Bar 2 (steps 16..31):
setGhost(16, { jawOpen: 0.92 });                                  // kick beat 1
setGhost(18, { browInnerUp: 0.8, browOuterUpRight: 0.7 });        // hat
setGhost(20, { mouthSmileLeft: 0.88, mouthSmileRight: 0.86 });    // shaker beat 2
setGhost(21, { eyeBlinkLeft: 0.8, eyeBlinkRight: 0.75 });         // rim blink accent
setGhost(22, { browInnerUp: 0.76 });                              // hat
setGhost(24, { jawOpen: 0.88 });                                  // kick beat 3
setGhost(26, { browInnerUp: 0.82 });                              // hat
setGhost(27, { cheekPuff: 0.8 });                                 // tom
setGhost(28, { mouthSmileLeft: 0.9, mouthSmileRight: 0.9 });      // shaker beat 4
setGhost(30, { browInnerUp: 0.74, browOuterUpLeft: 0.68 });       // hat
setGhost(31, { cheekPuff: 0.72 });                                // tom fill

// 16th-note duration at 100 BPM
const STEP_DURATION_MS = (60 / 100 / 4) * 1000; // 150 ms per 16th
const GHOST_LOOP_MS = 32 * STEP_DURATION_MS;      // ~4.8s

/**
 * Returns synthetic blendshape categories for the current time.
 * tMs is time in ms since the ghost started.
 */
export function ghostBlendshapes(tMs: number): BlendshapeCategory[] {
  const loopT = ((tMs % GHOST_LOOP_MS) + GHOST_LOOP_MS) % GHOST_LOOP_MS;
  const step = Math.floor(loopT / STEP_DURATION_MS) % 32;

  // Build a full array of blendshape categories with zeroes for most.
  const allNames = [
    "jawOpen",
    "browInnerUp",
    "browOuterUpLeft",
    "browOuterUpRight",
    "mouthSmileLeft",
    "mouthSmileRight",
    "cheekPuff",
    "eyeBlinkLeft",
    "eyeBlinkRight",
  ];

  const pattern = GHOST_PATTERN[step] ?? {};
  // Only "fire" during the first half of the step; rest is silence
  // so EMA has time to drop below threshold before the next hit.
  const pulse = (loopT % STEP_DURATION_MS) < STEP_DURATION_MS * 0.45 ? 1 : 0;

  return allNames.map((name) => ({
    categoryName: name,
    score: ((pattern[name] ?? 0) as number) * pulse,
  }));
}
