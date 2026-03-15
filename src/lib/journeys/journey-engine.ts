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

class JourneyEngine {
  private journey: Journey | null = null;
  private running = false;
  private currentPhaseId: JourneyPhaseId | null = null;
  private phaseChangeCallbacks: Set<PhaseChangeCallback> = new Set();
  private frameCallbacks: Set<(frame: JourneyFrame) => void> = new Set();
  private shaderSwitchTimer: ReturnType<typeof setTimeout> | null = null;
  private currentShaderIndex = 0;
  private currentShaderMode = "";
  private audioFeatures: AudioFeatures = { bass: 0, mid: 0, treble: 0, amplitude: 0 };
  private currentPoetryLine = "";

  /** Start a journey */
  start(journey: Journey): void {
    this.stop();
    this.journey = journey;
    this.running = true;
    this.currentPhaseId = null;
    this.currentShaderIndex = 0;
    this.currentPoetryLine = "";

    // Set initial shader from first phase
    if (journey.phases.length > 0) {
      const firstPhase = journey.phases[0];
      this.currentShaderMode = firstPhase.shaderModes[0] ?? "mandala";
      this.scheduleShaderSwitch(firstPhase);
    }
  }

  /** Stop the current journey */
  stop(): void {
    this.journey = null;
    this.running = false;
    this.currentPhaseId = null;
    this.currentPoetryLine = "";
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
    }

    // Build AI prompt with realm context
    const realm = getRealm(this.journey.realmId);
    let aiPrompt = currentPhase.aiPrompt;
    if (realm) {
      const env =
        realm.visualVocabulary.environments[
          Math.floor(progress * realm.visualVocabulary.environments.length)
        ];
      const tex =
        realm.visualVocabulary.textures[
          Math.floor(phaseProgress * realm.visualVocabulary.textures.length)
        ];
      aiPrompt = `${aiPrompt}, ${env}, ${tex}`;
    }

    // Apply audio-reactive prompt modifiers
    const mods = currentPhase.aiPromptModifiers;
    if (this.audioFeatures.bass > 0.6 && mods.highBass) {
      aiPrompt += `, ${mods.highBass}`;
    }
    if (this.audioFeatures.treble > 0.5 && mods.highTreble) {
      aiPrompt += `, ${mods.highTreble}`;
    }
    if (this.audioFeatures.amplitude > 0.7 && mods.highAmplitude) {
      aiPrompt += `, ${mods.highAmplitude}`;
    }
    if (this.audioFeatures.amplitude < 0.15 && mods.lowAmplitude) {
      aiPrompt += `, ${mods.lowAmplitude}`;
    }

    // Text→image feedback: incorporate current poetry line
    if (this.currentPoetryLine) {
      aiPrompt += `, inspired by the phrase: '${this.currentPoetryLine}'`;
    }

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

  /** Schedule shader mode switching within a phase */
  private scheduleShaderSwitch(phase: JourneyPhase): void {
    if (this.shaderSwitchTimer) {
      clearTimeout(this.shaderSwitchTimer);
    }

    if (phase.shaderModes.length <= 1) return;

    // Switch shaders every 30-60 seconds within a phase
    const interval = 30000 + Math.random() * 30000;

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
}

// Singleton instance
let instance: JourneyEngine | null = null;

export function getJourneyEngine(): JourneyEngine {
  if (!instance) {
    instance = new JourneyEngine();
  }
  return instance;
}
