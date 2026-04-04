/**
 * Adaptive Engine — learns from live journey feedback.
 *
 * Philosophy:
 *   - Never block a shader outright — it's always about COMBINATIONS and CONDITIONS
 *   - A shader alone is fine; a shader + dual shader + high bloom on mobile might not be
 *   - Love feedback is a gentle bias, not a hard favorite — variation is sacred
 *   - Patterns emerge from multiple data points, not single flags
 *
 * How it works:
 *   1. Each button press captures a rich Snapshot of everything happening
 *   2. After a journey ends, analyzeAndAdapt() scans all snapshots for patterns
 *   3. Patterns become soft Rules stored in the adaptive profile
 *   4. Rules are consulted by the compositor (effect scaling) and shader picker (selection bias)
 *   5. Rules have confidence — they strengthen with repeated evidence, fade without it
 */

// ─── Snapshot: everything captured at the moment of a button press ───

export interface Snapshot {
  type: "performance" | "love" | "dislike" | "glitch";
  ts: string;
  journeyId: string | null;
  journeyName: string | null;
  realmId: string | null;
  currentTime: number;
  duration: number;
  progress: number;
  phase: string | null;
  phaseLabel: string | null;
  phaseProgress: number;
  shader: string | null;
  dualShader: string | null;
  shaderOpacity: number;
  aiPromptSnippet: string | null;
  isLightBg: boolean;
  bloom: number;
  halation: number;
  vignette: number;
  particleDensity: number;
  chromaticAberration: number;
  fps: number | null;
  ua: string;
  mobile: boolean;
}

// ─── Rules: learned conditions and adjustments ───

interface Rule {
  id: string;
  /** What condition triggers this rule */
  condition: RuleCondition;
  /** What adjustment to make */
  action: RuleAction;
  /** How many snapshots support this rule (strengthens with evidence) */
  evidence: number;
  /** Confidence 0-1 — rules below 0.3 are ignored */
  confidence: number;
  /** When this rule was last reinforced */
  lastReinforced: string;
}

interface RuleCondition {
  /** Match when these conditions are ALL true */
  hasDualShader?: boolean;
  isLightBg?: boolean;
  isMobile?: boolean;
  bloomAbove?: number;
  fpsBelow?: number;
  /** Match specific shader (primary) */
  shader?: string;
  /** Match specific shader pair (primary + dual) */
  shaderPair?: [string, string];
  /** Match specific phase */
  phase?: string;
}

interface RuleAction {
  /** Multiply effect intensity by this (0.1 - 1.0) */
  effectScale?: number;
  /** Reduce bloom specifically */
  bloomScale?: number;
  /** Avoid this shader as dual (don't block as primary) */
  avoidAsDual?: string;
}

// ─── Profile: all learned state ───

interface AdaptiveProfile {
  rules: Rule[];
  /** Shaders that have been loved — soft bias toward them (count, not hard weight) */
  lovedConditions: LovedCondition[];
  /** Conditions that were disliked — soft bias away from them */
  dislikedConditions: DislikedCondition[];
  totalProcessed: number;
  lastAnalysis: string;
}

interface LovedCondition {
  shader: string;
  phase: string | null;
  realmId: string | null;
  count: number;
  lastSeen: string;
}

interface DislikedCondition {
  shader: string;
  dualShader: string | null;
  phase: string | null;
  realmId: string | null;
  isLightBg: boolean;
  count: number;
  lastSeen: string;
}

const PROFILE_KEY = "resonance-adaptive-profile-v2";
const FEEDBACK_KEY = "resonance-journey-feedback";

// ─── Storage ───

const EMPTY_PROFILE: AdaptiveProfile = {
  rules: [],
  lovedConditions: [],
  dislikedConditions: [],
  totalProcessed: 0,
  lastAnalysis: "",
};

function loadProfile(): AdaptiveProfile {
  if (typeof localStorage === "undefined") return { ...EMPTY_PROFILE, rules: [], lovedConditions: [], dislikedConditions: [] };
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Backward compat: ensure new fields exist on old profiles
      if (!parsed.dislikedConditions) parsed.dislikedConditions = [];
      return parsed;
    }
  } catch { /* corrupt */ }
  return { ...EMPTY_PROFILE, rules: [], lovedConditions: [], dislikedConditions: [] };
}

function saveProfile(profile: AdaptiveProfile) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch { /* full */ }
}

// ─── Pattern detection ───

function detectPatterns(perfSnapshots: Snapshot[]): Rule[] {
  if (perfSnapshots.length < 2) return [];
  const rules: Rule[] = [];

  // Pattern: dual shader active during perf issues
  const withDual = perfSnapshots.filter((s) => s.dualShader);
  if (withDual.length >= 2 && withDual.length / perfSnapshots.length > 0.5) {
    rules.push({
      id: "dual-shader-load",
      condition: { hasDualShader: true },
      action: { effectScale: 0.6 },
      evidence: withDual.length,
      confidence: Math.min(1, withDual.length / 4),
      lastReinforced: new Date().toISOString(),
    });
  }

  // Pattern: light backgrounds correlate with perf issues
  const lightBg = perfSnapshots.filter((s) => s.isLightBg);
  if (lightBg.length >= 2 && lightBg.length / perfSnapshots.length > 0.4) {
    rules.push({
      id: "light-bg-load",
      condition: { isLightBg: true },
      action: { effectScale: 0.5, bloomScale: 0.2 },
      evidence: lightBg.length,
      confidence: Math.min(1, lightBg.length / 3),
      lastReinforced: new Date().toISOString(),
    });
  }

  // Pattern: high bloom correlates with perf issues
  const highBloom = perfSnapshots.filter((s) => s.bloom > 0.4);
  if (highBloom.length >= 2 && highBloom.length / perfSnapshots.length > 0.4) {
    rules.push({
      id: "high-bloom-load",
      condition: { bloomAbove: 0.4 },
      action: { bloomScale: 0.5 },
      evidence: highBloom.length,
      confidence: Math.min(1, highBloom.length / 4),
      lastReinforced: new Date().toISOString(),
    });
  }

  // Pattern: mobile device perf issues (general scaling)
  const mobile = perfSnapshots.filter((s) => s.mobile);
  if (mobile.length >= 2) {
    const avgFps = mobile.reduce((sum, s) => sum + (s.fps ?? 60), 0) / mobile.length;
    if (avgFps < 35) {
      rules.push({
        id: "mobile-low-fps",
        condition: { isMobile: true, fpsBelow: 35 },
        action: { effectScale: 0.4 },
        evidence: mobile.length,
        confidence: Math.min(1, mobile.length / 3),
        lastReinforced: new Date().toISOString(),
      });
    }
  }

  // Pattern: specific shader pairs that cause issues
  const pairCounts = new Map<string, number>();
  for (const s of perfSnapshots) {
    if (s.shader && s.dualShader) {
      const key = [s.shader, s.dualShader].sort().join("+");
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
  }
  for (const [pair, count] of pairCounts) {
    if (count >= 2) {
      const [a, b] = pair.split("+");
      rules.push({
        id: `pair-${pair}`,
        condition: { shaderPair: [a, b] },
        action: { avoidAsDual: b }, // avoid the second as dual
        evidence: count,
        confidence: Math.min(1, count / 3),
        lastReinforced: new Date().toISOString(),
      });
    }
  }

  // Pattern: specific shader consistently flagged regardless of conditions
  const shaderCounts = new Map<string, number>();
  for (const s of perfSnapshots) {
    if (s.shader) shaderCounts.set(s.shader, (shaderCounts.get(s.shader) ?? 0) + 1);
  }
  for (const [shader, count] of shaderCounts) {
    // Only if flagged 3+ times AND > 40% of all flags — it's really the shader
    if (count >= 3 && count / perfSnapshots.length > 0.4) {
      rules.push({
        id: `shader-heavy-${shader}`,
        condition: { shader },
        action: { effectScale: 0.5 },
        evidence: count,
        confidence: Math.min(1, count / 5),
        lastReinforced: new Date().toISOString(),
      });
    }
  }

  return rules;
}

// ─── Core: analyze and adapt ───

export function analyzeAndAdapt(): AdaptiveProfile {
  const profile = loadProfile();
  if (typeof localStorage === "undefined") return profile;

  let allSnapshots: Snapshot[] = [];
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    allSnapshots = raw ? JSON.parse(raw) : [];
  } catch {
    return profile;
  }

  const newSnapshots = allSnapshots.slice(profile.totalProcessed);
  if (newSnapshots.length === 0) return profile;

  // Separate by type — glitches are auto-detected and feed into perf patterns
  const perfSnapshots = allSnapshots.filter((s) => s.type === "performance" || s.type === "glitch");
  const loveSnapshots = newSnapshots.filter((s) => s.type === "love");
  const dislikeSnapshots = newSnapshots.filter((s) => s.type === "dislike");

  // Detect patterns from ALL perf snapshots (not just new — patterns need full history)
  const newRules = detectPatterns(perfSnapshots);

  // Merge new rules with existing — reinforce or add
  for (const newRule of newRules) {
    const existing = profile.rules.find((r) => r.id === newRule.id);
    if (existing) {
      // Reinforce — increase evidence and confidence
      existing.evidence = newRule.evidence;
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.lastReinforced = newRule.lastReinforced;
    } else if (newRule.confidence >= 0.3) {
      // Only add rules with minimum confidence
      profile.rules.push(newRule);
    }
  }

  // Decay rules that weren't reinforced — remove stale ones
  const now = Date.now();
  profile.rules = profile.rules.filter((rule) => {
    const age = now - new Date(rule.lastReinforced).getTime();
    const staleMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (age > staleMs) {
      rule.confidence -= 0.1;
    }
    return rule.confidence > 0.1;
  });

  // Process love snapshots — record what conditions were loved
  for (const snap of loveSnapshots) {
    if (!snap.shader) continue;
    const existing = profile.lovedConditions.find(
      (lc) => lc.shader === snap.shader && lc.phase === snap.phase && lc.realmId === snap.realmId,
    );
    if (existing) {
      existing.count++;
      existing.lastSeen = snap.ts;
    } else {
      profile.lovedConditions.push({
        shader: snap.shader,
        phase: snap.phase,
        realmId: snap.realmId,
        count: 1,
        lastSeen: snap.ts,
      });
    }
  }

  // Process dislike snapshots — record what conditions were disliked
  for (const snap of dislikeSnapshots) {
    if (!snap.shader) continue;
    const existing = profile.dislikedConditions.find(
      (dc) =>
        dc.shader === snap.shader &&
        dc.dualShader === (snap.dualShader ?? null) &&
        dc.phase === snap.phase &&
        dc.realmId === snap.realmId &&
        dc.isLightBg === snap.isLightBg,
    );
    if (existing) {
      existing.count++;
      existing.lastSeen = snap.ts;
    } else {
      profile.dislikedConditions.push({
        shader: snap.shader,
        dualShader: snap.dualShader ?? null,
        phase: snap.phase,
        realmId: snap.realmId,
        isLightBg: snap.isLightBg,
        count: 1,
        lastSeen: snap.ts,
      });
    }
  }

  // Cap disliked conditions — keep top 30
  profile.dislikedConditions.sort((a, b) => b.count - a.count);
  if (profile.dislikedConditions.length > 30) {
    profile.dislikedConditions = profile.dislikedConditions.slice(0, 30);
  }

  // Cap loved conditions to prevent runaway bias
  // Keep top 30 by count, trim old ones
  profile.lovedConditions.sort((a, b) => b.count - a.count);
  if (profile.lovedConditions.length > 30) {
    profile.lovedConditions = profile.lovedConditions.slice(0, 30);
  }

  profile.totalProcessed = allSnapshots.length;
  profile.lastAnalysis = new Date().toISOString();
  saveProfile(profile);

  // Dev logging
  console.log(
    `[Adaptive] Processed ${newSnapshots.length} new entries ` +
    `(${loveSnapshots.length} love, ${dislikeSnapshots.length} dislike, ` +
    `${perfSnapshots.length - allSnapshots.filter(s => s.type === "performance").length} glitch). ` +
    `Active rules: ${profile.rules.length}. ` +
    `Loved: ${profile.lovedConditions.length}. Disliked: ${profile.dislikedConditions.length}.`,
  );
  for (const rule of profile.rules) {
    console.log(
      `  Rule "${rule.id}" — confidence ${rule.confidence.toFixed(2)}, ` +
      `evidence ${rule.evidence}, action: ${JSON.stringify(rule.action)}`,
    );
  }

  return profile;
}

// ─── Query functions ───

let _cached: AdaptiveProfile | null = null;

function getProfile(): AdaptiveProfile {
  if (!_cached) _cached = loadProfile();
  return _cached;
}

export function refreshAdaptiveProfile(): AdaptiveProfile {
  _cached = loadProfile();
  return _cached;
}

/**
 * Get effect scaling for current conditions.
 * Returns multipliers based on matching rules.
 */
export function getEffectScale(conditions?: {
  hasDualShader?: boolean;
  isLightBg?: boolean;
  isMobile?: boolean;
  bloom?: number;
  fps?: number;
  shader?: string;
  dualShader?: string;
}): number {
  const profile = getProfile();
  let scale = 1.0;

  for (const rule of profile.rules) {
    if (rule.confidence < 0.3) continue;
    if (!matchesCondition(rule.condition, conditions)) continue;
    if (rule.action.effectScale) {
      scale = Math.min(scale, rule.action.effectScale);
    }
  }

  return scale;
}

/**
 * Get bloom-specific scaling.
 */
export function getBloomScale(conditions?: {
  hasDualShader?: boolean;
  isLightBg?: boolean;
  bloom?: number;
}): number {
  const profile = getProfile();
  let scale = 1.0;

  for (const rule of profile.rules) {
    if (rule.confidence < 0.3) continue;
    if (!matchesCondition(rule.condition, conditions)) continue;
    if (rule.action.bloomScale) {
      scale = Math.min(scale, rule.action.bloomScale);
    }
  }

  return scale;
}

/**
 * Get shaders to avoid as dual for a given primary shader.
 */
export function getShadersToAvoidAsDual(primaryShader: string): Set<string> {
  const profile = getProfile();
  const avoid = new Set<string>();

  for (const rule of profile.rules) {
    if (rule.confidence < 0.3) continue;
    if (rule.condition.shaderPair) {
      const [a, b] = rule.condition.shaderPair;
      if (a === primaryShader && rule.action.avoidAsDual) avoid.add(rule.action.avoidAsDual);
      if (b === primaryShader && rule.action.avoidAsDual) avoid.add(a);
    }
  }

  return avoid;
}

/**
 * Apply soft preferences to a shader pool.
 * Loved shaders get a gentle boost (appear slightly earlier in the pool)
 * but never dominate — variation is preserved.
 */
export function applyShaderPreferences(pool: string[], realmId?: string, phase?: string): string[] {
  const profile = getProfile();
  if (profile.lovedConditions.length === 0 && profile.dislikedConditions.length === 0) return pool;

  // Build a soft score for each shader: loves boost, dislikes penalize
  const scores = new Map<string, number>();

  // Loved conditions — gentle positive bias
  for (const lc of profile.lovedConditions) {
    let relevance = lc.count * 0.1; // Base: each love = 0.1 boost
    // Extra relevance if same realm or phase
    if (realmId && lc.realmId === realmId) relevance *= 1.5;
    if (phase && lc.phase === phase) relevance *= 1.3;
    // Cap individual shader boost at 0.5 — never let one shader dominate
    const current = scores.get(lc.shader) ?? 0;
    scores.set(lc.shader, Math.min(0.5, current + relevance));
  }

  // Disliked conditions — gentle negative bias (doesn't remove, just pushes back)
  for (const dc of profile.dislikedConditions) {
    let penalty = dc.count * -0.12; // Base: each dislike = -0.12
    // More penalty if same realm or phase
    if (realmId && dc.realmId === realmId) penalty *= 1.5;
    if (phase && dc.phase === phase) penalty *= 1.3;
    // Cap penalty at -0.6 — never fully block a shader
    const current = scores.get(dc.shader) ?? 0;
    scores.set(dc.shader, Math.max(-0.6, current + penalty));
  }

  // Sort with gentle bias — loved shaders float toward front, disliked toward back
  // but randomness still dominates (shuffle already happened before this)
  const result = [...pool];
  result.sort((a, b) => {
    const sa = scores.get(a) ?? 0;
    const sb = scores.get(b) ?? 0;
    // Only move if score difference is meaningful
    if (Math.abs(sa - sb) < 0.15) return 0; // preserve existing random order
    return sb - sa;
  });

  return result;
}

/** Reset everything */
export function resetAdaptiveProfile() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(PROFILE_KEY);
  _cached = null;
}

// ─── Internal helpers ───

function matchesCondition(
  cond: RuleCondition,
  ctx?: Record<string, unknown>,
): boolean {
  if (!ctx) return true; // No context provided — apply rule unconditionally

  if (cond.hasDualShader !== undefined && cond.hasDualShader !== !!ctx.hasDualShader) return false;
  if (cond.isLightBg !== undefined && cond.isLightBg !== !!ctx.isLightBg) return false;
  if (cond.isMobile !== undefined && cond.isMobile !== !!ctx.isMobile) return false;
  if (cond.bloomAbove !== undefined && (typeof ctx.bloom !== "number" || ctx.bloom <= cond.bloomAbove)) return false;
  if (cond.fpsBelow !== undefined && (typeof ctx.fps !== "number" || ctx.fps >= cond.fpsBelow)) return false;
  if (cond.shader && ctx.shader !== cond.shader) return false;
  if (cond.shaderPair) {
    const pair = new Set(cond.shaderPair);
    if (!pair.has(ctx.shader as string) || !pair.has(ctx.dualShader as string)) return false;
  }

  return true;
}
