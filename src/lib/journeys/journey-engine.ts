import type { Journey, JourneyPhase, JourneyPhaseId, JourneyFrame, AmbientLayers } from "./types";
import { getRealm } from "./realms";
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

class JourneyEngine {
  private journey: Journey | null = null;
  private running = false;
  private currentPhaseId: JourneyPhaseId | null = null;
  private phaseChangeCallbacks: Set<PhaseChangeCallback> = new Set();
  private frameCallbacks: Set<(frame: JourneyFrame) => void> = new Set();
  private shaderSwitchTimer: ReturnType<typeof setTimeout> | null = null;
  private currentShaderIndex = 0;
  private currentShaderMode = "";
  private dualShaderMode: string | null = null;
  private dualShaderActive = false;
  private dualShaderMoments: DualShaderMoment[] = [];
  private audioFeatures: AudioFeatures = { bass: 0, mid: 0, treble: 0, amplitude: 0 };
  private currentPoetryLine = "";
  private currentStoryImagePrompt = "";
  /** Track recent AI prompt themes to enforce variety */
  private recentPromptThemes: string[] = [];
  private static readonly MAX_RECENT_THEMES = 5;
  /** Cached AI prompt — stable within a phase, only recomputed on phase change */
  private phaseAiPrompt = "";

  /** Start a journey */
  start(journey: Journey): void {
    this.stop();
    this.journey = journey;
    this.running = true;
    this.currentPhaseId = null;
    this.currentShaderIndex = 0;
    this.currentPoetryLine = "";
    this.currentStoryImagePrompt = "";
    this.recentPromptThemes = [];
    this.phaseAiPrompt = "";

    // Set initial shader from first phase
    if (journey.phases.length > 0) {
      const firstPhase = journey.phases[0];
      this.currentShaderMode = firstPhase.shaderModes[0] ?? "mandala";
      this.scheduleShaderSwitch(firstPhase);
    }

    // Schedule random dual-shader moments throughout the journey
    this.scheduleDualShaderMoments();
  }

  /** Stop the current journey */
  stop(): void {
    this.journey = null;
    this.running = false;
    this.currentPhaseId = null;
    this.dualShaderMode = null;
    this.dualShaderActive = false;
    this.dualShaderMoments = [];
    this.currentPoetryLine = "";
    this.currentStoryImagePrompt = "";
    this.phaseAiPrompt = "";
    if (this.shaderSwitchTimer) {
      clearTimeout(this.shaderSwitchTimer);
      this.shaderSwitchTimer = null;
    }
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

    // Detect phase change
    if (currentPhase.id !== this.currentPhaseId) {
      const prevPhase = this.currentPhaseId;
      this.currentPhaseId = currentPhase.id;
      // Each phase already has rotated shaderModes arrays, so start at 0
      this.currentShaderIndex = 0;
      this.currentShaderMode = currentPhase.shaderModes[0] ?? "mandala";

      // Fire phase change callbacks
      if (prevPhase !== null) {
        const guidance =
          currentPhase.guidancePhrases.length > 0
            ? currentPhase.guidancePhrases[
                Math.floor(Math.random() * currentPhase.guidancePhrases.length)
              ]
            : null;

        for (const cb of this.phaseChangeCallbacks) {
          cb(currentPhase.id, guidance);
        }
      }

      // Reschedule shader switching for new phase
      this.scheduleShaderSwitch(currentPhase);

      // Build and cache AI prompt for this phase.
      // IMPORTANT: This is computed ONCE per phase, not per frame.
      // AiImageLayer debounces on prompt changes, so an unstable prompt
      // (e.g. using Date.now() or live audio levels) prevents generation entirely.
      this.phaseAiPrompt = this.buildPhaseAiPrompt(currentPhase, phaseIndex);
    }

    const aiPrompt = this.phaseAiPrompt;

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
    const inDualMoment = this.dualShaderMoments.some(
      (m) => clamped >= m.startProgress && clamped <= m.endProgress
    );

    if (inDualMoment && currentPhase.shaderModes.length >= 2) {
      if (!this.dualShaderActive) {
        // Activate — pick a different shader from the current phase pool
        const otherModes = currentPhase.shaderModes.filter((m) => m !== this.currentShaderMode);
        if (otherModes.length > 0) {
          this.dualShaderMode = otherModes[Math.floor(Math.random() * otherModes.length)];
          this.dualShaderActive = true;
        }
      }
    } else if (this.dualShaderActive) {
      this.dualShaderMode = null;
      this.dualShaderActive = false;
    }

    const frame: JourneyFrame = {
      phase: currentPhase.id,
      progress: clamped,
      phaseProgress,
      shaderMode: this.currentShaderMode,
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

  /** Build a stable AI prompt for a phase (called once per phase change) */
  private buildPhaseAiPrompt(phase: JourneyPhase, phaseIndex: number): string {
    if (!this.journey) return phase.aiPrompt;

    const realm = getRealm(this.journey.realmId);
    let prompt = phase.aiPrompt;

    if (realm) {
      const vocab = realm.visualVocabulary;
      // Use a random seed that's stable for this phase (not Date.now())
      const vocabSeed = Math.floor(Math.random() * 10000);
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
      const theme = prompt.slice(0, 50);
      this.recentPromptThemes.push(theme);
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

  /** Schedule shader mode switching within a phase */
  private scheduleShaderSwitch(phase: JourneyPhase): void {
    if (this.shaderSwitchTimer) {
      clearTimeout(this.shaderSwitchTimer);
    }

    if (phase.shaderModes.length <= 1) return;

    // Switch shaders every ~14 seconds within a phase (10-18s range)
    // Ensures things are almost always transitioning
    const interval = 10000 + Math.random() * 8000;

    this.shaderSwitchTimer = setTimeout(() => {
      if (!this.running) return;
      this.currentShaderIndex =
        (this.currentShaderIndex + 1) % phase.shaderModes.length;
      this.currentShaderMode =
        phase.shaderModes[this.currentShaderIndex] ?? "mandala";

      // Continue cycling
      this.scheduleShaderSwitch(phase);
    }, interval);
  }

  /**
   * Schedule 6-8 dual-shader moments across the journey.
   * Each moment lasts 20-40 seconds (expressed as progress fraction).
   * Dual shaders + AI images layered together create the richest visual experience.
   */
  private scheduleDualShaderMoments(): void {
    this.dualShaderMoments = [];

    // Longer moments: 0.06-0.12 of progress (~18-36s for a 5min track)
    const momentDuration = () => 0.06 + Math.random() * 0.06;

    // Distribute moments across the journey with some randomness
    const anchors = [0.05, 0.18, 0.30, 0.42, 0.55, 0.68, 0.78, 0.88];
    for (const anchor of anchors) {
      const jitter = (Math.random() - 0.5) * 0.06;
      const start = Math.max(0.02, Math.min(0.95, anchor + jitter));
      const duration = momentDuration();
      const end = Math.min(0.98, start + duration);

      // Check for overlap with existing moments
      const overlaps = this.dualShaderMoments.some(
        (m) => start < m.endProgress + 0.02 && end > m.startProgress - 0.02
      );
      if (!overlaps) {
        this.dualShaderMoments.push({ startProgress: start, endProgress: end });
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
