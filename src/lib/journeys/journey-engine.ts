import type { Journey, JourneyPhase, JourneyPhaseId, JourneyFrame, AmbientLayers } from "./types";
import { getRealm } from "./realms";
import { regenerateJourneyShaders } from "./journeys";
import { createSeededRandom, seededShuffle } from "./seeded-random";
import { MODES_3D, MODE_META } from "@/lib/shaders";
import { getUserBlockedShaders, getUserDeletedShaders } from "@/lib/shader-preferences";
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

/** A scheduled tertiary-shader moment during the journey */
interface TertiaryMoment {
  startProgress: number;  // 0-1 progress when this moment begins
  endProgress: number;    // 0-1 progress when this moment ends
}

/** A record of a shader that was actually displayed during the journey */
export interface ShaderHistoryEntry {
  mode: string;
  role: "primary" | "dual" | "tertiary";
  phaseId: string;
  startMs: number;
  endMs: number;
}

/** Set of Geometry shader modes for priority dual-layer picks */
let _geometryModes: Set<string> | null = null;
function getGeometryModes(): Set<string> {
  if (!_geometryModes) {
    _geometryModes = new Set(
      MODE_META.filter(m => m.category === "Geometry").map(m => m.mode)
    );
  }
  return _geometryModes;
}

class JourneyEngine {
  private journey: Journey | null = null;
  private running = false;
  private currentPhaseId: JourneyPhaseId | null = null;
  private phaseChangeCallbacks: Set<PhaseChangeCallback> = new Set();
  private frameCallbacks: Set<(frame: JourneyFrame) => void> = new Set();

  // ─── Primary shader ───
  private currentShaderIndex = 0;
  private currentShaderMode = "";
  /** Wall-clock time when the current primary shader started */
  private shaderStartMs = 0;
  /** How long the current shader should last (randomized each switch) */
  private shaderDurationMs = 0;

  // ─── Dual shader (persistent second layer — always active) ───
  private dualShaderMode: string | null = null;
  /** Wall-clock time when the current dual shader started */
  private dualShaderStartMs = 0;
  /** How long the current dual shader should last */
  private dualShaderDurationMs = 0;
  /** Whether the dual shader has been initialized for this journey */
  private dualShaderInitialized = false;

  // ─── Shader history (actual display records for stats) ───
  private shaderHistory: ShaderHistoryEntry[] = [];

  // ─── Tertiary shader (occasional third layer — sprinkled in) ───
  private tertiaryShaderMode: string | null = null;
  private tertiaryMoments: TertiaryMoment[] = [];
  /** Pre-computed tertiary shader picks per moment index */
  private tertiaryPicks: Map<number, string> = new Map();
  private tertiaryActive = false;

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
  /** Phase transition grace — carry old AI prompt across boundary for smooth handoff */
  private phaseGraceEnd = 0; // progress at which grace period expires
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
  private static readonly SHADER_SWITCH_MIN_SECS = 10;
  private static readonly SHADER_SWITCH_MAX_SECS = 16;
  /** Extra time for the first shader to compensate for compile + fade-in delay */
  private static readonly FIRST_SHADER_BUFFER_MS = 5000;
  /** Dual shader switches on a different cadence — slightly longer for visual stability */
  private static readonly DUAL_SWITCH_MIN_SECS = 25;
  private static readonly DUAL_SWITCH_MAX_SECS = 45;
  /** Decay duration per event type (seconds) */
  private static readonly EVENT_DECAY: Record<string, number> = {
    bass_hit: 1.0,
    texture_change: 2.5,
    climax: 3.0,
    drop: 2.0,
    silence: 1.5,
    new_idea: 2.0,
  };

  /** Track duration in seconds — used to convert timing to progress fractions */
  private trackDuration = 300;
  /** Random function for this playback session (Math.random or seeded) */
  private random: () => number = Math.random;
  /** Event markers (auto-detected + manual cues, as progress fractions 0-1) */
  private eventMarkers: { progress: number; type: string; intensity: number }[] = [];
  private eventImpulse = 0;
  private eventType: string | null = null;
  private eventImpulseStartMs = 0;
  private firedEvents = new Set<number>();
  private lastProgress = 0;

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
    this.shaderDurationMs = this.randomDuration(random, JourneyEngine.SHADER_SWITCH_MIN_SECS, JourneyEngine.SHADER_SWITCH_MAX_SECS)
      + JourneyEngine.FIRST_SHADER_BUFFER_MS; // Extra time for compile + fade-in

    // Set initial shader from first phase
    if (this.journey.phases.length > 0) {
      const firstPhase = this.journey.phases[0];
      this.currentShaderMode = firstPhase.shaderModes[0] ?? "cosmos";
    }

    // Initialize shader history
    this.shaderHistory = [];

    // Initialize dual shader — pick from first phase, different from primary
    this.initDualShader(now, random);

    // Record initial shaders in history
    const firstPhaseId = this.journey.phases[0]?.id ?? "unknown";
    this.shaderHistory.push({
      mode: this.currentShaderMode,
      role: "primary",
      phaseId: firstPhaseId,
      startMs: now,
      endMs: 0,
    });
    if (this.dualShaderMode) {
      this.shaderHistory.push({
        mode: this.dualShaderMode,
        role: "dual",
        phaseId: firstPhaseId,
        startMs: now,
        endMs: 0,
      });
    }

    // Schedule tertiary shader moments (~every 60s)
    this.scheduleTertiaryMoments(random);
    this.precomputeTertiaryPicks(random);
    this.precomputeGuidancePhraseIndices(random);
  }

  /** Update track duration — regenerates shader budgets if duration differs significantly */
  updateTrackDuration(duration: number): void {
    if (duration <= 0 || !this.running || !this.journey) return;
    const needsRegen = Math.abs(duration - this.trackDuration) / this.trackDuration > 0.05;
    this.trackDuration = duration; // always store precise value
    if (needsRegen) {
      // Preserve current shaders across regeneration to prevent a visible mid-play switch.
      // The new pools may differ but the active shaders stay until the next timer expiry.
      const prevShader = this.currentShaderMode;
      const prevDual = this.dualShaderMode;
      this.journey = regenerateJourneyShaders(this.journey, this.random, duration);
      this.currentShaderMode = prevShader;
      this.dualShaderMode = prevDual;
    }
  }

  /** Stop the current journey */
  stop(): void {
    // Close all open shader history entries
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    for (const entry of this.shaderHistory) {
      if (entry.endMs === 0) entry.endMs = now;
    }
    this.journey = null;
    this.running = false;
    this.currentPhaseId = null;
    this.dualShaderMode = null;
    this.tertiaryShaderMode = null;
    this.dualShaderInitialized = false;
    this.tertiaryActive = false;
    this.tertiaryMoments = [];
    this.tertiaryPicks.clear();
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
    this.dualShaderStartMs = 0;
    this.dualShaderDurationMs = 0;
    this.random = Math.random;
    this.eventMarkers = [];
    this.eventImpulse = 0;
    this.eventType = null;
    this.firedEvents.clear();
    this.lastProgress = 0;
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

  /** Set typed events — converts time-based events to progress fractions */
  setEvents(events: { time: number; type: string; intensity: number }[], trackDuration: number): void {
    this.eventMarkers = events
      .map(e => ({ progress: e.time / trackDuration, type: e.type, intensity: e.intensity }))
      .sort((a, b) => a.progress - b.progress);
    this.firedEvents.clear();
  }

  /** Convenience wrapper — converts manual cue markers to events with type "bass_hit" */
  setCueMarkers(markers: { time: number }[], trackDuration: number): void {
    this.setEvents(
      markers.map(m => ({ time: m.time, type: "bass_hit", intensity: 0.8 })),
      trackDuration,
    );
  }

  /** Compute the current frame state given song progress (0-1) */
  getFrame(progress: number): JourneyFrame | null {
    if (!this.journey || !this.running) return null;

    const { phases } = this.journey;
    if (phases.length === 0) return null;

    const clamped = clamp(progress, 0, 1);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Event detection — seek backward clears fired events ahead of new position
    if (clamped < this.lastProgress - 0.01) {
      for (const p of this.firedEvents) {
        if (p > clamped) this.firedEvents.delete(p);
      }
    }
    this.lastProgress = clamped;

    // Check event markers
    for (const evt of this.eventMarkers) {
      if (!this.firedEvents.has(evt.progress) && clamped >= evt.progress && clamped <= evt.progress + 0.015) {
        this.firedEvents.add(evt.progress);
        this.eventImpulse = evt.intensity;
        this.eventType = evt.type;
        this.eventImpulseStartMs = now;
        break;
      }
    }

    // Decay impulse — hold at full intensity for 0.4s, then decay
    if (this.eventImpulse > 0) {
      const holdSeconds = 0.5;
      const decaySeconds = JourneyEngine.EVENT_DECAY[this.eventType ?? "bass_hit"] ?? 1.5;
      const elapsed = (now - this.eventImpulseStartMs) / 1000;
      if (elapsed <= holdSeconds) {
        // Hold at initial intensity — no decay yet
      } else {
        const decayElapsed = elapsed - holdSeconds;
        this.eventImpulse = Math.max(0, this.eventImpulse * (1.0 - (decayElapsed / decaySeconds)));
      }
      if (this.eventImpulse < 0.01) {
        this.eventImpulse = 0;
        this.eventType = null;
      }
    }

    // Approach ramp — builds up ~1.5s before the next bass_hit event.
    let eventApproach = 0;
    const approachWindow = this.trackDuration > 0 ? 1.5 / this.trackDuration : 0.007;
    for (const evt of this.eventMarkers) {
      if (this.firedEvents.has(evt.progress)) continue;
      if (evt.type !== "bass_hit") continue;
      const distance = evt.progress - clamped;
      if (distance > 0 && distance <= approachWindow) {
        eventApproach = Math.max(eventApproach, 1 - (distance / approachWindow));
      }
    }

    const { phaseIndex, nextPhaseIndex, blend } = getPhaseBlend(clamped, phases);
    const currentPhase = phases[phaseIndex];
    const phaseProgress = getPhaseProgress(clamped, currentPhase);

    // Detect phase change — start grace period for AI prompt bridging
    if (currentPhase.id !== this.currentPhaseId) {
      const prevPhase = this.currentPhaseId;

      // Grace only for AI prompts — shaders use the visualizer's crossfade
      if (prevPhase !== null) {
        this.graceAiPrompt = this.bridgeActive ? this.bridgePrompt : this.phaseAiPrompt;
        const phaseDurationSec = (currentPhase.end - currentPhase.start) * this.trackDuration;
        const maxGrace = phaseDurationSec * JourneyEngine.GRACE_MAX_PHASE_FRACTION;
        const graceSec = Math.min(JourneyEngine.GRACE_SECONDS, maxGrace);
        this.phaseGraceEnd = clamped + graceSec / this.trackDuration;
        this.graceActive = true;
        // DO NOT reset shader timers here. Shaders continue on their natural timer
        // and pick from the current phase's pool when the timer naturally fires.
        // Forced resets cause crossfades during phase title display, which the user
        // perceives as "flash" and "reset" — the new shader's WebGL context starts
        // u_time from 0 and the shader compilation causes frame drops.
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

      // Build and cache AI prompt for the NEW phase (once per phase, not per frame)
      this.phaseAiPrompt = this.buildPhaseAiPrompt(currentPhase, phaseIndex);
    }

    // Bridge prompt: when approaching a phase boundary (crossfade zone),
    // emit a transitional prompt that blends outgoing + incoming themes.
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

    // ─── Primary shader switching (wall-clock timer) ───
    const shaderLen = currentPhase.shaderModes.length;
    if (shaderLen > 1 && now - this.shaderStartMs > this.shaderDurationMs) {
      // Walk through pool, skipping blocked/deleted shaders
      let picked = false;
      for (let attempt = 0; attempt < shaderLen; attempt++) {
        this.currentShaderIndex = (this.currentShaderIndex + 1) % shaderLen;
        const candidate = currentPhase.shaderModes[this.currentShaderIndex];
        if (this.isShaderAllowed(candidate)) {
          this.currentShaderMode = candidate;
          picked = true;
          break;
        }
      }
      // If every shader in pool is blocked, keep current (don't flash)
      if (!picked) {
        this.currentShaderMode = currentPhase.shaderModes[this.currentShaderIndex] ?? "cosmos";
      }
      // Close previous primary history entry and start a new one
      this.closeHistoryEntry("primary", now);
      this.shaderHistory.push({
        mode: this.currentShaderMode,
        role: "primary",
        phaseId: currentPhase.id,
        startMs: now,
        endMs: 0,
      });
      this.shaderStartMs = now;
      this.shaderDurationMs = this.randomDuration(this.random, JourneyEngine.SHADER_SWITCH_MIN_SECS, JourneyEngine.SHADER_SWITCH_MAX_SECS);
    }
    // ─── Dual shader (persistent 2nd layer) ───
    // Switches on its own timer, independent of primary. Prefers Geometry shaders.
    // The visualizer's existing fade-in/out handles the visual transition.
    if (this.dualShaderInitialized && shaderLen >= 2) {
      if (now - this.dualShaderStartMs > this.dualShaderDurationMs) {
        this.closeHistoryEntry("dual", now);
        this.dualShaderMode = this.pickDualShader(currentPhase);
        this.shaderHistory.push({
          mode: this.dualShaderMode,
          role: "dual",
          phaseId: currentPhase.id,
          startMs: now,
          endMs: 0,
        });
        this.dualShaderStartMs = now;
        this.dualShaderDurationMs = this.randomDuration(this.random, JourneyEngine.DUAL_SWITCH_MIN_SECS, JourneyEngine.DUAL_SWITCH_MAX_SECS);
      }
    } else if (shaderLen < 2) {
      this.dualShaderMode = null;
    }

    // ─── Tertiary shader (sprinkled in every ~60s) ───
    let inTertiaryMoment = false;
    for (let i = 0; i < this.tertiaryMoments.length; i++) {
      const m = this.tertiaryMoments[i];
      if (clamped >= m.startProgress && clamped <= m.endProgress) {
        inTertiaryMoment = true;
        if (!this.tertiaryActive) {
          const tertiaryCandidate = this.tertiaryPicks.get(i) ?? null;
          // Skip if user blocked/deleted this shader since journey started
          this.tertiaryShaderMode = tertiaryCandidate && this.isShaderAllowed(tertiaryCandidate)
            ? tertiaryCandidate
            : null;
          this.tertiaryActive = true;
          if (this.tertiaryShaderMode) {
            this.shaderHistory.push({
              mode: this.tertiaryShaderMode,
              role: "tertiary",
              phaseId: currentPhase.id,
              startMs: now,
              endMs: 0,
            });
          }
        }
        break;
      }
    }
    if (!inTertiaryMoment && this.tertiaryActive) {
      this.closeHistoryEntry("tertiary", now);
      this.tertiaryShaderMode = null;
      this.tertiaryActive = false;
    }

    const effectiveShader = this.currentShaderMode;
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
      eventImpulse: this.eventImpulse,
      eventType: this.eventType as JourneyFrame["eventType"],
      eventApproach,
      cueImpulse: this.eventImpulse, // backward compat alias
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

  /** Get the current shader mode */
  getCurrentShaderMode(): string {
    return this.currentShaderMode || "cosmos";
  }

  /** Get the shader history for the current/last journey (for stats tracking) */
  getShaderHistory(): ShaderHistoryEntry[] {
    return this.shaderHistory;
  }

  /** Close the most recent open history entry for a given role */
  private closeHistoryEntry(role: "primary" | "dual" | "tertiary", endMs: number): void {
    for (let i = this.shaderHistory.length - 1; i >= 0; i--) {
      if (this.shaderHistory[i].role === role && this.shaderHistory[i].endMs === 0) {
        this.shaderHistory[i].endMs = endMs;
        return;
      }
    }
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
   */
  private buildBridgePrompt(outgoing: JourneyPhase, incoming: JourneyPhase): string {
    const extractCore = (prompt: string): string => {
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

  /** Generate a random duration in milliseconds between lo and hi seconds */
  private randomDuration(random: () => number, loSec: number, hiSec: number): number {
    return (loSec + random() * (hiSec - loSec)) * 1000;
  }

  /** Initialize the persistent dual shader from the first phase's pool */
  private initDualShader(now: number, random: () => number): void {
    if (!this.journey || this.journey.phases.length === 0) return;
    const firstPhase = this.journey.phases[0];
    if (firstPhase.shaderModes.length < 2) return;

    this.dualShaderMode = this.pickDualShader(firstPhase);
    this.dualShaderStartMs = now;
    this.dualShaderDurationMs = this.randomDuration(random, JourneyEngine.DUAL_SWITCH_MIN_SECS, JourneyEngine.DUAL_SWITCH_MAX_SECS);
    this.dualShaderInitialized = true;
  }

  /**
   * Pick a dual shader from the phase's pool.
   * Prefers Geometry shaders (~70% of the time) for visual impact.
   * Avoids picking the same shader as the primary.
   */
  /** Check live user preferences — blocked or deleted shaders should be skipped */
  private isShaderAllowed(mode: string): boolean {
    const blocked = getUserBlockedShaders();
    const deleted = getUserDeletedShaders();
    return !blocked.has(mode) && !deleted.has(mode);
  }

  private pickDualShader(phase: JourneyPhase): string {
    const candidates = phase.shaderModes.filter(
      m => m !== this.currentShaderMode && !MODES_3D.has(m) && this.isShaderAllowed(m)
    );
    if (candidates.length === 0) {
      // Fallback: skip preference filter — better to show something than nothing
      const fallback = phase.shaderModes.filter(m => !MODES_3D.has(m))[0] ?? phase.shaderModes[0] ?? "cosmos";
      return fallback;
    }

    const geoModes = getGeometryModes();
    const geoCandidates = candidates.filter(m => geoModes.has(m));

    // 70% chance to pick a geometry shader if available
    if (geoCandidates.length > 0 && this.random() < 0.7) {
      return geoCandidates[Math.floor(this.random() * geoCandidates.length)];
    }
    return candidates[Math.floor(this.random() * candidates.length)];
  }

  /**
   * Schedule tertiary shader moments — every ~60s, lasting 20-30s.
   * This creates the "sprinkled in" 3rd layer effect.
   */
  private scheduleTertiaryMoments(random: () => number): void {
    this.tertiaryMoments = [];

    // Convert 60s intervals to progress fractions
    const intervalProgress = this.trackDuration > 0 ? 60 / this.trackDuration : 0.20;
    const momentDuration = this.trackDuration > 0
      ? (20 + random() * 10) / this.trackDuration  // 20-30s in progress
      : 0.08;

    // Start first tertiary ~45s in (give the journey time to establish)
    let cursor = this.trackDuration > 0 ? 45 / this.trackDuration : 0.15;

    while (cursor < 0.92) {
      const duration = momentDuration + (random() - 0.5) * 0.02;
      const start = cursor;
      const end = Math.min(0.96, start + duration);
      this.tertiaryMoments.push({ startProgress: start, endProgress: end });
      // Next moment ~60s later (with some jitter)
      cursor = end + intervalProgress + (random() - 0.5) * 0.03;
    }
  }

  /** Pre-compute which shader to use for each tertiary moment */
  private precomputeTertiaryPicks(random: () => number): void {
    this.tertiaryPicks.clear();
    if (!this.journey) return;

    const { phases } = this.journey;

    for (let i = 0; i < this.tertiaryMoments.length; i++) {
      const moment = this.tertiaryMoments[i];
      const midPoint = (moment.startProgress + moment.endProgress) / 2;

      const phase = phases.find((p) => midPoint >= p.start && midPoint <= p.end);
      if (!phase || phase.shaderModes.length < 3) continue;

      // Pick a shader different from what primary and dual would likely be
      const candidates = phase.shaderModes.filter(m => !MODES_3D.has(m) && this.isShaderAllowed(m));
      if (candidates.length < 1) continue;

      const shuffled = seededShuffle(candidates, random);
      // Pick from the end of the shuffled list (least likely to be primary/dual)
      this.tertiaryPicks.set(i, shuffled[shuffled.length - 1]);
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
