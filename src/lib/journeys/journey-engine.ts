import type { Journey, JourneyPhase, JourneyPhaseId, JourneyFrame, AmbientLayers } from "./types";
import { getRealm } from "./realms";
import { regenerateJourneyShaders } from "./journeys";
import { createSeededRandom, seededShuffle } from "./seeded-random";
import { MODES_3D } from "@/lib/shaders";
import {
  getPhaseBlend,
  getPhaseProgress,
  interpolateValue,
  interpolatePalette,
  mapAudioToDenoising,
  clamp,
} from "./phase-interpolation";

type PhaseChangeCallback = (
  phase: JourneyPhaseId,
  guidancePhrase: string | null
) => void;

interface AudioFeatures {
  bass: number;
  mid: number;
  treble: number;
  amplitude: number;
}

/** A scheduled dual-shader moment during the journey */
interface DualShaderMoment {
  startProgress: number;  // 0-1 progress when this moment begins
  endProgress: number;    // 0-1 progress when this moment ends
}

/** Pre-computed shader picks for a dual-shader moment */
interface DualShaderPick {
  dual: string;
  tertiary: string | null;
}

class JourneyEngine {
  private journey: Journey | null = null;
  private running = false;
  private currentPhaseId: JourneyPhaseId | null = null;
  private phaseChangeCallbacks: Set<PhaseChangeCallback> = new Set();
  private frameCallbacks: Set<(frame: JourneyFrame) => void> = new Set();
  private currentShaderIndex = 0;
  private currentShaderMode = "";
  private dualShaderMode: string | null = null;
  private tertiaryShaderMode: string | null = null;
  private dualShaderActive = false;
  private dualShaderMoments: DualShaderMoment[] = [];
  /** Pre-computed dual-shader picks per moment index */
  private dualShaderPicks: Map<number, DualShaderPick> = new Map();
  /** Pre-computed guidance phrase index per phase */
  private guidancePhraseIndices: Map<string, number> = new Map();
  private audioFeatures: AudioFeatures = { bass: 0, mid: 0, treble: 0, amplitude: 0 };
  private currentPoetryLine = "";
  private currentStoryImagePrompt = "";
  /** Track recent AI prompt themes to enforce variety */
  private recentPromptThemes: string[] = [];
  private static readonly MAX_RECENT_THEMES = 5;
  /** Cached AI prompt — stable within a phase, only recomputed on phase change */
  private phaseAiPrompt = "";
  /** Phase transition grace — carry old shader/prompt across boundary for smooth handoff */
  private phaseGraceEnd = 0; // progress at which grace period expires
  private graceShader = ""; // shader to hold during grace
  private graceAiPrompt = ""; // AI prompt to hold during grace
  private graceActive = false;
  /** Bridge prompt — blends outgoing + incoming phase themes for seamless transition */
  private bridgePrompt = "";
  private bridgeActive = false;
  private bridgeEmitted = false; // only emit bridge once per phase boundary
  /** Shader timing constants (in seconds) */
  private static readonly GRACE_SECONDS = 8;
  /** Grace period will never exceed this fraction of the phase's total duration */
  private static readonly GRACE_MAX_PHASE_FRACTION = 0.4;
  /** Wall-clock shader switch timer — simple, reliable, no schedule drift */
  private static readonly SHADER_SWITCH_MIN_SECS = 18;
  private static readonly SHADER_SWITCH_MAX_SECS = 35;
  /** Absolute maximum — no shader may exceed this, period */
  private static readonly SHADER_MAX_SECS_ABSOLUTE = 55;
  /** Wall-clock time when the current primary shader started */
  private shaderStartMs = 0;
  /** How long the current shader should last (randomized each switch) */
  private shaderDurationMs = 0;
  /** Track duration in seconds — used to convert timing to progress fractions */
  private trackDuration = 300;
  /** Random function for this playback session (Math.random or seeded) */
  private random: () => number = Math.random;

  /** Start a journey. Pass a seed for deterministic (shared) playback. */
  start(journey: Journey, options?: { seed?: number; trackDuration?: number }): void {
    this.stop();

    const random = options?.seed != null
      ? createSeededRandom(options.seed)
      : Math.random;
    this.random = random;
    this.trackDuration = (options?.trackDuration && options.trackDuration > 0)
      ? options.trackDuration
      : 300;

    // Fresh shaders — seeded for shared, random for personal
    // Pass track duration so long tracks get more shaders per phase
    this.journey = regenerateJourneyShaders(journey, random, this.trackDuration);
    this.running = true;
    this.currentPhaseId = null;
    this.currentShaderIndex = 0;
    this.currentPoetryLine = "";
    this.currentStoryImagePrompt = "";
    this.recentPromptThemes = [];
    this.phaseAiPrompt = "";
    this.graceActive = false;
    this.phaseGraceEnd = 0;
    this.bridgePrompt = "";
    this.bridgeActive = false;
    this.bridgeEmitted = false;

    // Initialize wall-clock shader timer
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.shaderStartMs = now;
    this.shaderDurationMs = this.randomShaderDuration(random);

    // Set initial shader from first phase
    if (this.journey.phases.length > 0) {
      const firstPhase = this.journey.phases[0];
      this.currentShaderMode = firstPhase.shaderModes[0] ?? "cosmos";
    }

    // Pre-compute all scheduling from the random function
    this.scheduleDualShaderMoments(random);
    this.precomputeDualShaderPicks(random);
    this.precomputeGuidancePhraseIndices(random);
  }

  /** Update track duration — regenerates shader budgets if duration differs significantly */
  updateTrackDuration(duration: number): void {
    if (duration <= 0 || !this.running || !this.journey) return;
    // Only recompute if >20% different from current assumption
    if (Math.abs(duration - this.trackDuration) / this.trackDuration > 0.2) {
      this.trackDuration = duration;
      // Regenerate shader lists with updated budgets for the new duration
      this.journey = regenerateJourneyShaders(this.journey, this.random, duration);
    }
  }

  /** Stop the current journey */
  stop(): void {
    this.journey = null;
    this.running = false;
    this.currentPhaseId = null;
    this.dualShaderMode = null;
    this.tertiaryShaderMode = null;
    this.dualShaderActive = false;
    this.dualShaderMoments = [];
    this.dualShaderPicks.clear();
    this.guidancePhraseIndices.clear();
    this.currentPoetryLine = "";
    this.currentStoryImagePrompt = "";
    this.phaseAiPrompt = "";
    this.graceActive = false;
    this.phaseGraceEnd = 0;
    this.bridgePrompt = "";
    this.bridgeActive = false;
    this.bridgeEmitted = false;
    this.shaderStartMs = 0;
    this.shaderDurationMs = 0;
    this.random = Math.random;
  }

  /** Update audio features from the visualizer's analyser */
  updateAudioFeatures(features: AudioFeatures): void {
    this.audioFeatures = features;
  }

  /** Set the current poetry line for text→image feedback */
  setCurrentPoetryLine(line: string): void {
    this.currentPoetryLine = line;
  }

  /** Get the current poetry line */
  getCurrentPoetryLine(): string {
    return this.currentPoetryLine;
  }

  /** Set the current story image prompt for story→image feedback */
  setCurrentStoryImagePrompt(prompt: string): void {
    this.currentStoryImagePrompt = prompt;
  }

  /** Get the current story image prompt */
  getCurrentStoryImagePrompt(): string {
    return this.currentStoryImagePrompt;
  }

  /** Compute the current frame state given song progress (0-1) */
  getFrame(progress: number): JourneyFrame | null {
    if (!this.journey || !this.running) return null;

    const { phases } = this.journey;
    if (phases.length === 0) return null;

    const clamped = clamp(progress, 0, 1);
    const { phaseIndex, nextPhaseIndex, blend } = getPhaseBlend(clamped, phases);
    const currentPhase = phases[phaseIndex];
    const phaseProgress = getPhaseProgress(clamped, currentPhase);

    // Detect phase change — start grace period with bridge prompt for seamless transition
    if (currentPhase.id !== this.currentPhaseId) {
      const prevPhase = this.currentPhaseId;

      // Capture current visuals before switching — bridge prompt persists during grace
      if (prevPhase !== null) {
        this.graceShader = this.currentShaderMode;
        // Use bridge prompt if one was built during the crossfade zone, else fall back to old prompt
        this.graceAiPrompt = this.bridgeActive ? this.bridgePrompt : this.phaseAiPrompt;
        // Adaptive grace: cap at 40% of the new phase's duration so short phases aren't consumed
        const phaseDurationSec = (currentPhase.end - currentPhase.start) * this.trackDuration;
        const maxGrace = phaseDurationSec * JourneyEngine.GRACE_MAX_PHASE_FRACTION;
        const graceSec = Math.min(JourneyEngine.GRACE_SECONDS, maxGrace);
        this.phaseGraceEnd = clamped + graceSec / this.trackDuration;
        this.graceActive = true;
        // Reset shader timer so we don't get an immediate shader swap right after phase change
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        this.shaderStartMs = now;
      }

      // Reset bridge state for next boundary
      this.bridgeActive = false;
      this.bridgeEmitted = false;
      this.bridgePrompt = "";
      this.currentPhaseId = currentPhase.id;

      // Fire phase change callbacks (guidance text, phase indicator)
      if (prevPhase !== null) {
        const guidanceIdx = this.guidancePhraseIndices.get(currentPhase.id) ?? 0;
        const guidance =
          currentPhase.guidancePhrases.length > 0
            ? currentPhase.guidancePhrases[guidanceIdx % currentPhase.guidancePhrases.length]
            : null;

        for (const cb of this.phaseChangeCallbacks) {
          cb(currentPhase.id, guidance);
        }
      }

      // Build and cache AI prompt for the NEW phase.
      // IMPORTANT: This is computed ONCE per phase, not per frame.
      // AiImageLayer debounces on prompt changes, so an unstable prompt
      // (e.g. using Date.now() or live audio levels) prevents generation entirely.
      this.phaseAiPrompt = this.buildPhaseAiPrompt(currentPhase, phaseIndex);
    }

    // Bridge prompt: when approaching a phase boundary (crossfade zone),
    // emit a transitional prompt that blends outgoing + incoming themes.
    // This creates: pure old → bridge → pure new (instead of abrupt switch).
    if (nextPhaseIndex !== null && blend > 0 && !this.bridgeEmitted) {
      this.bridgeEmitted = true;
      const nextPhase = phases[nextPhaseIndex];
      this.bridgePrompt = this.buildBridgePrompt(currentPhase, nextPhase);
      this.bridgeActive = true;
    }

    // End grace period once time is up
    if (this.graceActive && clamped >= this.phaseGraceEnd) {
      this.graceActive = false;
    }

    // Wall-clock shader switching: advance to next shader when timer expires.
    // Simple and reliable — no pre-computed schedules that can drift or fail.
    const shaderLen = currentPhase.shaderModes.length;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (shaderLen > 1 && now - this.shaderStartMs > this.shaderDurationMs) {
      this.currentShaderIndex = (this.currentShaderIndex + 1) % shaderLen;
      this.currentShaderMode = currentPhase.shaderModes[this.currentShaderIndex] ?? "cosmos";
      this.shaderStartMs = now;
      this.shaderDurationMs = this.randomShaderDuration(this.random);
    }
    // Ensure current mode is valid for this phase (e.g. after phase change)
    if (shaderLen > 0 && !currentPhase.shaderModes.includes(this.currentShaderMode)) {
      this.currentShaderIndex = 0;
      this.currentShaderMode = currentPhase.shaderModes[0] ?? "cosmos";
      this.shaderStartMs = now;
      this.shaderDurationMs = this.randomShaderDuration(this.random);
    }

    // AI prompt progression at phase boundaries:
    //   1. In crossfade zone (end of phase): switch to bridge prompt
    //   2. During grace (start of new phase): hold bridge prompt
    //   3. After grace: use new phase's pure prompt
    const effectiveShader = this.graceActive ? this.graceShader : this.currentShaderMode;
    const aiPrompt = this.graceActive
      ? this.graceAiPrompt
      : this.bridgeActive
        ? this.bridgePrompt
        : this.phaseAiPrompt;

    // Interpolate numeric values during crossfade
    const iv = (getter: (p: JourneyPhase) => number) =>
      interpolateValue(phases, phaseIndex, nextPhaseIndex, blend, getter);

    // Interpolate palette
    const palette =
      nextPhaseIndex !== null && blend > 0
        ? interpolatePalette(
            currentPhase.palette,
            phases[nextPhaseIndex].palette,
            blend
          )
        : currentPhase.palette;

    // Interpolate ambient layers
    const ambientLayers: AmbientLayers = {
      wind: iv((p) => p.ambientLayers.wind),
      rain: iv((p) => p.ambientLayers.rain),
      drone: iv((p) => p.ambientLayers.drone),
      chime: iv((p) => p.ambientLayers.chime),
      fire: iv((p) => p.ambientLayers.fire),
    };

    // Dual-shader logic: check if we're inside a scheduled dual-shader moment
    let momentIdx = -1;
    for (let i = 0; i < this.dualShaderMoments.length; i++) {
      const m = this.dualShaderMoments[i];
      if (clamped >= m.startProgress && clamped <= m.endProgress) {
        momentIdx = i;
        break;
      }
    }
    const inDualMoment = momentIdx >= 0;

    if (inDualMoment && currentPhase.shaderModes.length >= 2) {
      if (!this.dualShaderActive) {
        // Use pre-computed picks for this moment
        const pick = this.dualShaderPicks.get(momentIdx);
        if (pick) {
          this.dualShaderMode = pick.dual;
          this.tertiaryShaderMode = pick.tertiary;
          this.dualShaderActive = true;
        }
      }
    } else if (this.dualShaderActive) {
      this.dualShaderMode = null;
      this.tertiaryShaderMode = null;
      this.dualShaderActive = false;
    }

    const frame: JourneyFrame = {
      phase: currentPhase.id,
      progress: clamped,
      phaseProgress,
      shaderMode: effectiveShader,
      shaderOpacity: iv((p) => p.shaderOpacity),
      aiPrompt,
      denoisingStrength: mapAudioToDenoising(
        this.audioFeatures.bass,
        currentPhase.denoisingRange
      ),
      targetFps: iv((p) => p.targetFps),
      bloomIntensity: iv((p) => p.bloomIntensity),
      chromaticAberration: iv((p) => p.chromaticAberration),
      colorTemperature: iv((p) => p.colorTemperature),
      vignette: iv((p) => p.vignette),
      intensityMultiplier: iv((p) => p.intensityMultiplier),
      voice: currentPhase.voice,
      poetryMood: currentPhase.poetryMood,
      poetryIntervalSeconds: iv((p) => p.poetryIntervalSeconds),
      palette,
      ambientLayers,
      filmGrain: iv((p) => p.filmGrain),
      particleDensity: iv((p) => p.particleDensity),
      halation: iv((p) => p.halation),
      dualShaderMode: this.dualShaderMode ?? undefined,
      tertiaryShaderMode: this.tertiaryShaderMode ?? undefined,
    };

    // Notify frame subscribers
    for (const cb of this.frameCallbacks) {
      cb(frame);
    }

    return frame;
  }

  /** Subscribe to phase changes */
  onPhaseChange(callback: PhaseChangeCallback): () => void {
    this.phaseChangeCallbacks.add(callback);
    return () => {
      this.phaseChangeCallbacks.delete(callback);
    };
  }

  /** Subscribe to frame updates */
  onFrame(callback: (frame: JourneyFrame) => void): () => void {
    this.frameCallbacks.add(callback);
    return () => {
      this.frameCallbacks.delete(callback);
    };
  }

  /** Is a journey currently active? */
  isActive(): boolean {
    return this.running && this.journey !== null;
  }

  /** Get the active journey */
  getJourney(): Journey | null {
    return this.journey;
  }

  /** Get current phase ID */
  getCurrentPhase(): JourneyPhaseId | null {
    return this.currentPhaseId;
  }

  /** Get the current shader mode (respects phase transition grace period) */
  getCurrentShaderMode(): string {
    if (this.graceActive) return this.graceShader || "cosmos";
    return this.currentShaderMode || "cosmos";
  }

  /** Build a stable AI prompt for a phase (called once per phase change) */
  private buildPhaseAiPrompt(phase: JourneyPhase, phaseIndex: number): string {
    if (!this.journey) return phase.aiPrompt;

    // Check theme first (custom journeys), then fall back to realm (built-in journeys)
    const vocab = this.journey.theme?.visualVocabulary ?? getRealm(this.journey.realmId)?.visualVocabulary;
    let prompt = phase.aiPrompt;

    if (vocab) {
      // Use the session random function for deterministic vocab selection
      const vocabSeed = Math.floor(this.random() * 10000);
      const envIdx = (phaseIndex * 3 + vocabSeed) % vocab.environments.length;
      const texIdx = (phaseIndex * 7 + vocabSeed) % vocab.textures.length;
      const entIdx = (phaseIndex * 5 + vocabSeed) % vocab.entities.length;
      const atmIdx = (phaseIndex * 11 + vocabSeed) % vocab.atmospheres.length;

      // Rotate vocabulary variant per phase for variety
      const vocabVariant = vocabSeed % 3;
      if (vocabVariant === 0) {
        prompt = `${prompt}, ${vocab.environments[envIdx]}, ${vocab.textures[texIdx]}`;
      } else if (vocabVariant === 1) {
        prompt = `${prompt}, ${vocab.entities[entIdx]}, ${vocab.atmospheres[atmIdx]}`;
      } else {
        prompt = `${prompt}, ${vocab.environments[envIdx]}, ${vocab.entities[entIdx]}`;
      }

      // Anti-repetition: tell the model to avoid recent themes
      if (this.recentPromptThemes.length > 0) {
        const avoidList = this.recentPromptThemes.slice(-3).join("; ");
        prompt += `, completely different composition from: ${avoidList}`;
      }

      // Track this theme (use first 50 chars as fingerprint)
      const themeFingerprint = prompt.slice(0, 50);
      this.recentPromptThemes.push(themeFingerprint);
      if (this.recentPromptThemes.length > JourneyEngine.MAX_RECENT_THEMES) {
        this.recentPromptThemes.shift();
      }
    }

    // Apply audio-reactive modifiers based on current audio state at phase change
    const mods = phase.aiPromptModifiers;
    if (this.audioFeatures.bass > 0.6 && mods.highBass) {
      prompt += `, ${mods.highBass}`;
    }
    if (this.audioFeatures.treble > 0.5 && mods.highTreble) {
      prompt += `, ${mods.highTreble}`;
    }
    if (this.audioFeatures.amplitude > 0.7 && mods.highAmplitude) {
      prompt += `, ${mods.highAmplitude}`;
    }
    if (this.audioFeatures.amplitude < 0.15 && mods.lowAmplitude) {
      prompt += `, ${mods.lowAmplitude}`;
    }

    // Text→image feedback
    if (this.currentStoryImagePrompt) {
      prompt += `, ${this.currentStoryImagePrompt}`;
    } else if (this.currentPoetryLine) {
      prompt += `, inspired by the phrase: '${this.currentPoetryLine}'`;
    }

    return prompt;
  }

  /**
   * Build a bridge prompt that blends the outgoing and incoming phase themes.
   * Creates imagery that visually connects both phases — earthly elements
   * gaining cosmic qualities, or cosmic scenes with grounded anchors emerging.
   */
  private buildBridgePrompt(outgoing: JourneyPhase, incoming: JourneyPhase): string {
    // Extract the core visual concept from each prompt (first ~120 chars before modifiers)
    const extractCore = (prompt: string): string => {
      // Take up to the first major comma break or 150 chars
      const parts = prompt.split(",");
      let core = "";
      for (const part of parts) {
        if (core.length + part.length > 150) break;
        core += (core ? "," : "") + part;
      }
      return core || prompt.slice(0, 150);
    };

    const outCore = extractCore(outgoing.aiPrompt);
    const inCore = extractCore(incoming.aiPrompt);

    return `transitional scene bridging two visual worlds — elements of [${outCore}] beginning to dissolve and transform into [${inCore}], the forms from the first scene still partially visible but fragmenting into particles and light that reform into hints of the next scene, a liminal moment where both realities coexist in the same frame, shared particles and light connecting both visual languages, asymmetric composition with the dissolving forms anchored on one side and emerging forms materializing on the other, generous negative space between them filled with luminous particles traveling from old to new, no text no signatures no watermarks no letters no writing`;
  }

  /** Generate a random shader duration in milliseconds */
  private randomShaderDuration(random: () => number): number {
    const lo = JourneyEngine.SHADER_SWITCH_MIN_SECS;
    const hi = JourneyEngine.SHADER_SWITCH_MAX_SECS;
    return (lo + random() * (hi - lo)) * 1000;
  }

  /**
   * Schedule dense dual-shader moments across the journey.
   * Goal: ~60-70% of the journey has overlapping shaders for visual richness.
   * Each moment lasts 24-42 seconds (expressed as progress fraction).
   */
  private scheduleDualShaderMoments(random: () => number): void {
    this.dualShaderMoments = [];

    // Moment duration: 0.10-0.16 of progress (~30-48s for a 5min track)
    // Minimum 30s ensures dual/tertiary shaders have time to fully fade in (~3s)
    // and hold for a meaningful period before fading out (~2s) — no jarring flashes
    const momentDuration = () => 0.10 + random() * 0.06;

    // 16 anchors every ~6% — dense coverage across the journey
    const anchors = [
      0.03, 0.09, 0.15, 0.21, 0.27, 0.33, 0.39, 0.45,
      0.51, 0.57, 0.63, 0.69, 0.75, 0.81, 0.87, 0.93,
    ];
    for (const anchor of anchors) {
      const jitter = (random() - 0.5) * 0.04;
      const start = Math.max(0.02, Math.min(0.95, anchor + jitter));
      const duration = momentDuration();
      const end = Math.min(0.98, start + duration);

      // Only reject if moments would directly overlap (no buffer)
      const overlaps = this.dualShaderMoments.some(
        (m) => start < m.endProgress && end > m.startProgress
      );
      if (!overlaps) {
        this.dualShaderMoments.push({ startProgress: start, endProgress: end });
      }
    }
  }

  /**
   * Pre-compute which shaders to use for each dual-shader moment.
   * For each moment, finds which phase it falls in, shuffles that phase's pool
   * with the seeded random, and stores the picks.
   */
  private precomputeDualShaderPicks(random: () => number): void {
    this.dualShaderPicks.clear();
    if (!this.journey) return;

    const { phases } = this.journey;

    for (let i = 0; i < this.dualShaderMoments.length; i++) {
      const moment = this.dualShaderMoments[i];
      const midPoint = (moment.startProgress + moment.endProgress) / 2;

      // Find which phase this moment falls in
      const phase = phases.find((p) => midPoint >= p.start && midPoint <= p.end);
      if (!phase || phase.shaderModes.length < 2) continue;

      // Filter out heavy 3D modes from dual shader candidates
      const candidates = phase.shaderModes.filter(m => !MODES_3D.has(m));
      if (candidates.length < 1) continue;

      // Shuffle the filtered pool and pick dual + tertiary shaders
      const shuffled = seededShuffle(candidates, random);
      this.dualShaderPicks.set(i, {
        dual: shuffled[0],
        tertiary: shuffled.length > 2 ? shuffled[1] : null,
      });
    }
  }

  /** Pre-compute which guidance phrase index to use for each phase */
  private precomputeGuidancePhraseIndices(random: () => number): void {
    this.guidancePhraseIndices.clear();
    if (!this.journey) return;

    for (const phase of this.journey.phases) {
      if (phase.guidancePhrases.length > 0) {
        const idx = Math.floor(random() * phase.guidancePhrases.length);
        this.guidancePhraseIndices.set(phase.id, idx);
      }
    }
  }
}

// Singleton instance
let instance: JourneyEngine | null = null;

export function getJourneyEngine(): JourneyEngine {
  if (!instance) {
    instance = new JourneyEngine();
  }
  return instance;
}
