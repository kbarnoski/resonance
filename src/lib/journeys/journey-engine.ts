import type { Journey, JourneyPhase, JourneyPhaseId, JourneyFrame, AmbientLayers } from "./types";
import { isVideoActive } from "./video-activity";
import { getRealm } from "./realms";
import { glitchRecord } from "./glitch-recorder";
import { isKineticJourneyName } from "./kinetic";
import { TAKE_FINALE_SHADERS } from "./pinned-takes";
import { RECAST_SAFELIST, regenerateJourneyShaders, castJourneyShaders, getJourneyCast, PICKTIME_SHADER_BLOCKLIST, PICKTIME_REALM_BLOCKLIST } from "./journeys";
import type { TakeScriptEntry } from "./pinned-takes";
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
  // When true, primary shader picker excludes 3D modes (orb/galaxy/
  // crystal/cloud/wave/seabed/cage). Dual + tertiary already exclude
  // 3D unconditionally. Set by any route that runs multiple shader
  // layers simultaneously (installation, /journey/[token]) — R3F
  // Canvas creates a separate WebGL context, and 5 layers (A + B +
  // dual A + B + tertiary) plus a 3D primary pushes us over the
  // browser's ~8 context limit, causing repeated context-loss +
  // force-remount bursts mid-journey. Single-shader routes
  // (/room/[token], admin picker) leave this off and 3D works fine.
  private multiLayerMode = false;
  // When true, primary/dual/tertiary shader switches are skipped —
  // freezes whatever's on screen so the credits crossfade can hide
  // the visualizer over a static frame instead of competing with
  // dramatic ongoing motion.
  private frozen = false;
  // Playback-paused gate — orthogonal to `frozen` (which the installation
  // credits own). While the track is paused, the wall-clock shader timers
  // must not keep rotating: a long pause would silently exhaust the
  // journey-wide shader variety and fire an instant switch on resume.
  private playbackPaused = false;
  private pausedAtMs = 0;
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
  /** Index into the current phase's aiPromptSequence (if present).
   *  Recomputed per-frame; prompt rebuilt only when the index changes. */
  private phaseSequenceIdx = -1;
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
  private static readonly SHADER_SWITCH_MIN_SECS = 10; // Karel 2026-09-28/29: "~15s is enough" + "ensure variety"
  private static readonly SHADER_SWITCH_MAX_SECS = 15;
  /** Extra time for the first shader to compensate for compile + fade-in delay */
  private static readonly FIRST_SHADER_BUFFER_MS = 3000;
  /** Dual shader switches on a different cadence — offset from primary for variety */
  private static readonly DUAL_SWITCH_MIN_SECS = 14;
  private static readonly DUAL_SWITCH_MAX_SECS = 22;
  /** Decay duration per event type (seconds) — longer = softer event tail */
  private static readonly EVENT_DECAY: Record<string, number> = {
    bass_hit: 1.2,
    texture_change: 3.0,
    climax: 3.5,
    drop: 2.5,
    silence: 2.0,
    new_idea: 2.5,
  };
  /** Primary shaders that must run solo — never paired with a dual layer.
   *  These tend to be GPU-expensive enough that stacking a second shader on top
   *  drops framerate into the teens. The shader still runs happily as primary. */
  private static readonly NEVER_DUAL_PRIMARIES = new Set<string>(["thermal"]);

  /** ─── Composition conductor (2026-09-27, Karel/Johnny/Joseph review) ───
   *  The authored per-phase intensity arc (0.4 → 1.0 → 0.3) must shape HOW
   *  MUCH is on screen, not just three post-processing alphas. Layer count
   *  now follows the music: threshold/integration run a single shader,
   *  the dual layer joins in the build, and the tertiary layer is reserved
   *  for the climax. Interpolated intensity + hysteresis, so layers engage
   *  and release smoothly across phase crossfades (the renderer's existing
   *  dual fade handles the visual transition — same path as
   *  NEVER_DUAL_PRIMARIES). */
  private static readonly DUAL_ON_INTENSITY = 0.6;
  private static readonly DUAL_OFF_INTENSITY = 0.5;
  private static readonly TERTIARY_MIN_INTENSITY = 0.85; // raised 2026-09-28 — Karel: still too busy
  /** Opening ramp: every journey starts simple and builds (2026-09-28). */
  private static readonly OPENING_RAMP_SECS = 40;
  private static readonly OPENING_FLOOR = 0.3;
  /** The journey BREATHES (Karel 2026-09-28: "hitting viewers over the
   *  head without time to catch a breath"). Two seeded per-journey
   *  rhythms modulate the authored intensity so even long climax phases
   *  periodically relax — not deterministic rules, seeded weather:
   *  - a slow breath wave (BREATH_PERIOD_SECS cycle, dipping to
   *    BREATH_FLOOR of the authored value)
   *  - occasional stillness windows: one crisp static image, one
   *    shader, nothing else (intensity clamped to STILLNESS_LEVEL). */
  private static readonly BREATH_FLOOR = 0.5; // deepened 2026-09-28 — "don't be afraid of negative space"
  private static readonly STILLNESS_LEVEL = 0.3;
  /** Progress where the ending wind-down begins (mirror of the opening ramp). */
  private static readonly WIND_DOWN_START = 0.80;
  private breathPeriodSecs = 70;
  private breathPhase = 0;
  private stillnessMoments: TertiaryMoment[] = [];
  private wasInStillness = false;
  private inStillnessNow = false;
  /** Scripted take: recorded shader timeline replayed by progress. */
  private takeScript: TakeScriptEntry[] | null = null;
  /** Kinetic EQ journeys: dual locked on, tertiary continuous — all
   *  three band layers stay on screen (Karel 2026-09-30). */
  private kineticEq = false;
  private takeSeedValue: number | null = null;
  private dualStartMs = 0;
  private nudgeForce = false;
  /** Scripted dual that was rested — stays down until the script
   *  offers a DIFFERENT dual (2026-10-01: the script reasserted
   *  ghostribbons 4s after every rest — "persisting too long"). */
  private dualRestedMode: string | null = null;
  private scriptSubs = new Map<string, string | null>();
  /** Wall-clock of the last shader-layer switch on ANY layer — switches
   *  are spaced ≥4s apart so compile stalls never cluster (2026-09-28
   *  flight-recorder finding: 3 switches in 4s = visible frame-gap storm). */
  private lastAnySwitchMs = 0;
  private static readonly SWITCH_SPACING_MS = 4000;
  /** Phase-owned choreography: how soon after a boundary the outgoing
   *  phase's primary yields (clears the phase-title moment). */
  private static readonly OWNED_ENTRY_DELAY_MS = 3500;
  private ownedPhaseId: string | null = null;
  /** Hysteresis state: whether the dual layer is currently permitted. */
  private dualAllowed = false;

  /** Shaders that have already appeared (as primary or dual) in the current journey —
   *  used for journey-wide uniqueness: picks prefer unused modes first, fall back if exhausted. */
  private seenShaders = new Set<string>();

  /** Track duration in seconds — used to convert timing to progress fractions */
  private trackDuration = 300;
  /** Random function for this playback session (Math.random or seeded) */
  private random: () => number = Math.random;
  /** Event markers (auto-detected + manual cues, as progress fractions 0-1) */
  private eventMarkers: { progress: number; type: string; intensity: number }[] = [];
  private eventImpulse = 0;
  private eventType: string | null = null;
  private eventImpulseStartMs = 0;
  /** Intensity the current event fired at — decay is computed from this,
   *  not from the already-decayed value (which would compound per frame). */
  private eventInitialIntensity = 0;
  private firedEvents = new Set<number>();
  private lastProgress = 0;

  /** Start a journey. Pass a seed for deterministic (shared) playback. */
  start(journey: Journey, options?: { seed?: number; trackDuration?: number; script?: TakeScriptEntry[] }): void {
    this.stop();

    this.takeScript = options?.script?.length ? options.script : null;
    this.kineticEq = isKineticJourneyName(journey.name);
    this.scriptSubs = new Map();
    this.dualRestedMode = null;
    this.nudgeForce = false;
    this.takeSeedValue = options?.seed ?? null;
    const random = options?.seed != null
      ? createSeededRandom(options.seed)
      : Math.random;
    this.random = random;
    this.trackDuration = (options?.trackDuration && options.trackDuration > 0)
      ? options.trackDuration
      : 300;

    // Fresh shaders — seeded for shared, random for personal
    // Pass track duration so long tracks get more shaders per phase
    // Kinetic journeys keep their HAND-CURATED cast (2026-09-30: the
    // regeneration was silently discarding Chemi's particle cast every
    // run — the sparkler never played once).
    // Cast journeys (every non-mastered, non-kinetic journey since
    // 2026-10-05) play their deterministic, diversity-spaced cast.
    // Phase-owned journeys (JourneyPhase.shaderOwned) play their authored
    // per-phase pools as written — regeneration would scatter them.
    const authoredOwned = journey.phases.some((p) => p.shaderOwned === true);
    this.journey = this.kineticEq ? journey : (castJourneyShaders(journey) ?? (authoredOwned ? journey : regenerateJourneyShaders(journey, random, this.trackDuration)));
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

    // Reset journey-wide shader uniqueness tracker
    this.seenShaders = new Set<string>();

    // Set initial shader from first phase. Filter via isShaderAllowed so
    // installation-mode 3D-block (and user prefs) apply to the very first
    // shader too — without this, journey 0 could open on a 3D shader and
    // burn a Canvas remount immediately.
    if (this.journey.phases.length > 0) {
      const firstPhase = this.journey.phases[0];
      const scriptedInitial = this.takeScript
        ?.filter((e) => e.role === "primary" && this.isShaderAllowed(e.mode))[0]?.mode;
      const initial =
        scriptedInitial ??
        firstPhase.shaderModes.find((m) => this.isShaderAllowed(m)) ??
        firstPhase.shaderModes[0] ??
        "cosmos";
      this.currentShaderMode = initial;
      this.seenShaders.add(this.currentShaderMode);
      glitchRecord("shader-initial", initial);
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
    // Breath wave + stillness windows — seeded per journey.
    this.breathPeriodSecs = 55 + random() * 30;   // 55-85s cycle
    this.breathPhase = random() * Math.PI * 2;
    this.stillnessMoments = [];
    {
      // A ~20s stillness window every ~2.5-3.5 min, avoiding the first
      // minute (the opening ramp already holds that space).
      let cursor = (70 + random() * 40) / Math.max(1, this.trackDuration);
      const winFrac = (12 + random() * 4) / Math.max(1, this.trackDuration); // 12-16s — a held breath, not a parked shader
      while (cursor < 0.9) {
        this.stillnessMoments.push({ startProgress: cursor, endProgress: Math.min(0.93, cursor + winFrac) });
        cursor += (120 + random() * 60) / Math.max(1, this.trackDuration); // every 2-3 min
      }
    }
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
      // Deterministic under pinned takes (2026-09-29): the old path
      // consumed this.random at a WALL-CLOCK-dependent moment (audio
      // metadata arrival), so the same seed played different takes.
      const regenRandom = this.takeSeedValue != null
        ? createSeededRandom(this.takeSeedValue + Math.round(duration))
        : this.random;
      if (!this.kineticEq && !getJourneyCast(this.journey)) this.journey = regenerateJourneyShaders(this.journey, regenRandom, duration);
      this.currentShaderMode = prevShader;
      this.dualShaderMode = prevDual;
    }
  }

  /** Stop the current journey */
  stop(): void {
    this.ownedPhaseId = null;
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
    this.dualAllowed = false;
    this.lastAnySwitchMs = 0; // must reset — a stale value blocks all switch spacing (singleton engine)
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
    this.playbackPaused = false;
    this.pausedAtMs = 0;
    this.random = Math.random;
    this.eventMarkers = [];
    this.eventImpulse = 0;
    this.eventInitialIntensity = 0;
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
    // Visual lead (Karel 2026-10-01 note: the angel flash lands ~1/4s
    // after its bass cue): fire events 250ms EARLY so the flash's
    // mount+decode latency puts it ON the beat, not behind it.
    const leadFrac = this.trackDuration > 0 ? 0.25 / this.trackDuration : 0.001;
    for (const evt of this.eventMarkers) {
      if (!this.firedEvents.has(evt.progress) && clamped >= evt.progress - leadFrac && clamped <= evt.progress + 0.015) {
        this.firedEvents.add(evt.progress);
        this.eventImpulse = evt.intensity;
        this.eventInitialIntensity = evt.intensity;
        this.eventType = evt.type;
        this.eventImpulseStartMs = now;
        break;
      }
    }

    // Decay impulse — hold at full intensity, then linear fade over the
    // configured decaySeconds. Computed from the fired intensity each frame
    // (NOT the already-decayed value, which compounded per frame and made
    // every tail collapse far faster than configured).
    if (this.eventImpulse > 0) {
      const holdSeconds = 0.5;
      const decaySeconds = JourneyEngine.EVENT_DECAY[this.eventType ?? "bass_hit"] ?? 1.5;
      const elapsed = (now - this.eventImpulseStartMs) / 1000;
      if (elapsed <= holdSeconds) {
        // Hold at initial intensity — no decay yet
        this.eventImpulse = this.eventInitialIntensity;
      } else {
        const decayElapsed = elapsed - holdSeconds;
        this.eventImpulse = Math.max(0, this.eventInitialIntensity * (1.0 - decayElapsed / decaySeconds));
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
      this.phaseSequenceIdx = -1;
      this.phaseAiPrompt = this.buildPhaseAiPrompt(currentPhase, phaseIndex);
    }

    // Sequence support: if the current phase defines aiPromptSequence,
    // pick the element matching the current phase progress and rebuild
    // the cached prompt whenever the index changes. This gives storytelling
    // within a phase — each sequence entry is a distinct scene moment.
    if (currentPhase.aiPromptSequence && currentPhase.aiPromptSequence.length > 0) {
      const n = currentPhase.aiPromptSequence.length;
      const idx = Math.min(Math.floor(phaseProgress * n), n - 1);
      if (idx !== this.phaseSequenceIdx) {
        this.phaseSequenceIdx = idx;
        this.phaseAiPrompt = this.buildPhaseAiPrompt(currentPhase, phaseIndex);
      }
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

    // ─── Composition conductor: interpolated intensity drives layer count ───
    const rawIntensity = interpolateValue(phases, phaseIndex, nextPhaseIndex, blend, (p) => p.intensityMultiplier);
    // Opening ramp (Karel 2026-09-28: "each journey should start simple
    // and build" — Snowflake's authored threshold opens hot). For the
    // first OPENING_RAMP_SECS of every journey the effective intensity
    // is capped by a floor-to-1 ramp, so openings are a single quiet
    // voice with one asymmetric image and real negative space, no
    // matter what the authored arc says. Progress-based (pause-safe,
    // deterministic); every consumer (imagery cap, Ken Burns, cadence,
    // dual/tertiary gates, post alphas) inherits it through the frame.
    const elapsedSec = clamped * this.trackDuration;
    const openingCap = JourneyEngine.OPENING_FLOOR
      + (1 - JourneyEngine.OPENING_FLOOR) * Math.min(1, elapsedSec / JourneyEngine.OPENING_RAMP_SECS);
    let conducted = Math.min(Number.isFinite(rawIntensity) ? rawIntensity : 1, openingCap);
    // Ending wind-down — the mirror of the opening ramp (Karel
    // 2026-09-29: "you built up the most complexity as the song was
    // heading towards ending... that should be quieting down"). From
    // 80% progress conducted intensity glides to the quiet floor,
    // which by construction sheds the dual, blocks tertiary, drops
    // the imagery cap and stills all motion.
    let windDownShaderScale = 1;
    // Arc reflects the analysis (Karel 2026-09-29): a journey authored
    // to CREST at its end (final-phase intensity >= 0.6, e.g. The
    // Other Side 10 — the song builds to its last bar) is exempt from
    // the ending wind-down.
    const finalPhaseIntensity = phases[phases.length - 1]?.intensityMultiplier ?? 0.3;
    if (finalPhaseIntensity < 0.6 && clamped > JourneyEngine.WIND_DOWN_START) {
      const remain = Math.max(0, (1 - clamped) / (1 - JourneyEngine.WIND_DOWN_START));
      const endingCap = JourneyEngine.OPENING_FLOOR + (1 - JourneyEngine.OPENING_FLOOR) * remain;
      conducted = Math.min(conducted, endingCap);
      // The parked final shader must recede WITH the music (Karel
      // 2026-09-29: r3-lightrivers "two bright lit lines just sitting
      // there" for the frozen last 36s). Brightness eases toward 45%
      // across the wind-down; the rotation freeze can then hold safely.
      windDownShaderScale = 0.45 + 0.55 * remain;
    }
    // Breath wave: multiplies intensity by BREATH_FLOOR..1 on a slow
    // seeded cycle — climaxes still peak, but the grip releases in
    // rhythm and the dual layer/motion ease off in the valleys.
    const breath = JourneyEngine.BREATH_FLOOR
      + (1 - JourneyEngine.BREATH_FLOOR) * (0.5 + 0.5 * Math.sin(this.breathPhase + (elapsedSec * Math.PI * 2) / this.breathPeriodSecs));
    conducted *= breath;
    // Stillness windows: a held, sparse, crisp moment — one static
    // image, one shader. The rotation below also holds during these.
    let inStillnessWindow = false;
    for (const m of this.stillnessMoments) {
      if (clamped >= m.startProgress && clamped <= m.endProgress) {
        conducted = Math.min(conducted, JourneyEngine.STILLNESS_LEVEL);
        inStillnessWindow = true;
        break;
      }
    }
    const conductorIntensity = conducted;
    // Phase-owned choreography (opt-in, see JourneyPhase.shaderOwned).
    const owned = currentPhase.shaderOwned === true && !this.takeScript;
    if (owned && this.ownedPhaseId !== currentPhase.id) {
      this.ownedPhaseId = currentPhase.id;
      // The outgoing phase's shaders leave soon after the boundary (once
      // the phase title has settled) rather than riding a full timer.
      if (!currentPhase.shaderModes.includes(this.currentShaderMode)) {
        this.shaderStartMs = Math.min(this.shaderStartMs, now - this.shaderDurationMs + JourneyEngine.OWNED_ENTRY_DELAY_MS);
      }
      if (this.dualShaderMode && !currentPhase.shaderModes.includes(this.dualShaderMode)) {
        this.dualShaderStartMs = Math.min(this.dualShaderStartMs, now - this.dualShaderDurationMs + JourneyEngine.OWNED_ENTRY_DELAY_MS + 3000);
      }
    }
    if (this.kineticEq && !owned) this.dualAllowed = true; // EQ: the mid voice never drops out
    else if (!this.dualAllowed && conductorIntensity >= JourneyEngine.DUAL_ON_INTENSITY) this.dualAllowed = true;
    else if (this.dualAllowed && conductorIntensity < JourneyEngine.DUAL_OFF_INTENSITY) this.dualAllowed = false;

    // ─── Primary shader switching (wall-clock timer) ───
    const shaderLen = currentPhase.shaderModes.length;
    // Stillness = hold: a shader switch is itself an event, and the
    // stillness window's whole point is that nothing happens.
    // End-freeze (Karel 2026-09-28: a shader "loaded small and then just
    // dropped" right before the next journey): no new shader layers in
    // the final 4% — anything born there dies at the boundary.
    const endFreeze = clamped > 0.96;
    // Rotation freezes earlier than layer end-freeze: a fresh primary at
    // p0.926 was still mid-crossfade when the next journey loaded
    // (session oc9dr2 — "a shader glitched when realized loaded").
    const rotationFreeze = clamped > 0.90;
    // Stillness means a SCHEDULED window, not merely low intensity. The
    // old level-based test (conducted <= 0.32) fired at the start of
    // EVERY journey — the opening ramp caps intensity at exactly 0.3 —
    // so every boundary logged a phantom enter/exit and the exit hook
    // forced a fresh shader ~3s later, planting a compile + crossfade
    // directly under the title card (z2wg4u: dark-tide @186.8s = the
    // "brightness glitch as Realized titling came in"). Breath valleys
    // triggered the same whipsaw mid-journey.
    const inStillness = inStillnessWindow;
    this.inStillnessNow = inStillness;
    if (inStillness && !this.wasInStillness) glitchRecord("stillness-enter", `@p${clamped.toFixed(3)}`);
    if (this.wasInStillness && !inStillness) {
      glitchRecord("stillness-exit", `@p${clamped.toFixed(3)}`);
      // Coming out of a stillness hold: bring a fresh shader within ~3s
      // so the held one doesn't ALSO ride out a full rotation timer.
      this.shaderStartMs = Math.min(this.shaderStartMs, now - this.shaderDurationMs + 3000);
    }
    this.wasInStillness = inStillness;
    // Morph quiet window: a shader compile lands invisibly on held
    // stills but reads as a dropped frame under a playing morph — the
    // rotation simply waits the few seconds until the clip has faded.
    const morphOnScreen = isVideoActive();
    if (this.takeScript) this.applyTakeScript(clamped, now);
    const ownedStray = owned && !currentPhase.shaderModes.includes(this.currentShaderMode);
    if (!this.takeScript && (shaderLen > 1 || ownedStray) && !this.frozen && !this.playbackPaused && (!inStillness || this.nudgeForce) && (!rotationFreeze || this.nudgeForce) && !morphOnScreen && now - this.lastAnySwitchMs > JourneyEngine.SWITCH_SPACING_MS && now - this.shaderStartMs > this.shaderDurationMs) {
      // Walk the pool twice: first pass prefers shaders this journey hasn't used yet,
      // second pass falls back to any allowed shader if the pool is exhausted.
      // BOTH passes exclude whatever is live on the dual/tertiary layers —
      // the same shader must never render on two layers at once (2026-09-27
      // review: "the same shader appeared multiple times within Realized").
      let picked = false;
      // Pass order matters (session oc9dr2: roulette ran dual@p0.478
      // then PRIMARY again @p0.743): unseen-in-phase first, then the
      // journey-wide borrow below, and only as a last resort repeat a
      // seen shader (the seenPass after the borrow).
      for (let pass = 0; pass < 1 && !picked; pass++) {
        for (let attempt = 0; attempt < shaderLen; attempt++) {
          this.currentShaderIndex = (this.currentShaderIndex + 1) % shaderLen;
          const candidate = currentPhase.shaderModes[this.currentShaderIndex];
          if (!this.isShaderAllowed(candidate)) continue;
          if (candidate === this.dualShaderMode || candidate === this.tertiaryShaderMode) continue;
          if (pass === 0 && this.seenShaders.has(candidate)) continue;
          this.currentShaderMode = candidate;
          this.seenShaders.add(candidate);
          picked = true;
          break;
        }
      }
      // Phase pool exhausted: BORROW an unseen shader from the journey's
      // other phases before ever repeating (Karel 2026-09-28: "the same
      // shader used numerous times... have a big diverse set"). The
      // journey-wide program stays generative — this only widens the
      // pool the seeded pick draws from.
      if (!picked && this.journey && !owned) {
        const live = new Set([this.dualShaderMode, this.tertiaryShaderMode]);
        const borrow = this.journey.phases
          .flatMap((p) => p.shaderModes)
          .filter((m) => !this.seenShaders.has(m) && this.isShaderAllowed(m) && !live.has(m) && m !== this.currentShaderMode);
        if (borrow.length > 0) {
          this.currentShaderMode = borrow[Math.floor(this.random() * borrow.length)];
          this.seenShaders.add(this.currentShaderMode);
          picked = true;
        }
      }
      // Every unseen option exhausted: NOW allow repeating a seen shader.
      if (!picked) {
        for (let attempt = 0; attempt < shaderLen; attempt++) {
          this.currentShaderIndex = (this.currentShaderIndex + 1) % shaderLen;
          const candidate = currentPhase.shaderModes[this.currentShaderIndex];
          if (!this.isShaderAllowed(candidate)) continue;
          if (candidate === this.dualShaderMode || candidate === this.tertiaryShaderMode) continue;
          if (candidate === this.currentShaderMode) continue;
          this.currentShaderMode = candidate;
          picked = true;
          break;
        }
      }
      // If every shader everywhere is spent/blocked, keep current (don't flash)
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
      glitchRecord("shader-primary", `${this.currentShaderMode} @p${clamped.toFixed(3)}`);
      this.lastAnySwitchMs = now; this.nudgeForce = false;
    }
    // ─── Dual shader (persistent 2nd layer) ───
    // Switches on its own timer, independent of primary.
    // The visualizer's existing fade-in/out handles the visual transition.
    // Primary shaders in NEVER_DUAL_PRIMARIES run solo — no second layer stacked on top.
    // The conductor also holds the dual back while the music is quiet
    // (threshold / return / integration): a second layer is earned by the build.
    const primaryBansDual = !this.takeScript && (!this.kineticEq || owned) && (JourneyEngine.NEVER_DUAL_PRIMARIES.has(this.currentShaderMode) || !this.dualAllowed);
    if (this.takeScript) { /* dual driven by the script */ } else if (primaryBansDual) {
      if (this.dualShaderMode !== null) {
        this.closeHistoryEntry("dual", now);
        this.dualShaderMode = null;
      }
    } else if (owned && this.dualShaderInitialized && !endFreeze) {
      // Phase-owned dual: drawn only from this phase's pool, rests (null)
      // when the pool has no shader free of the other layers.
      const due = now - this.dualShaderStartMs > this.dualShaderDurationMs;
      const stray = !!this.dualShaderMode && !currentPhase.shaderModes.includes(this.dualShaderMode);
      if (!this.frozen && !this.playbackPaused && !morphOnScreen && !rotationFreeze && now - this.lastAnySwitchMs > JourneyEngine.SWITCH_SPACING_MS && (due || stray || this.dualShaderMode === null)) {
        const next = this.pickOwnedDual(currentPhase);
        if (next === this.dualShaderMode) {
          this.dualShaderStartMs = now; // still the right voice — hold it another cycle
        } else {
          this.closeHistoryEntry("dual", now);
          this.dualShaderMode = next;
          this.dualShaderStartMs = now;
          this.dualShaderDurationMs = this.randomDuration(this.random, JourneyEngine.DUAL_SWITCH_MIN_SECS, JourneyEngine.DUAL_SWITCH_MAX_SECS);
          if (next) {
            this.seenShaders.add(next);
            this.shaderHistory.push({ mode: next, role: "dual", phaseId: currentPhase.id, startMs: now, endMs: 0 });
            glitchRecord("shader-dual", `${next} @p${clamped.toFixed(3)}`);
            this.lastAnySwitchMs = now; this.nudgeForce = false;
          }
        }
      }
      // never mirror the primary (it may have rotated onto the dual's shader)
      if (this.dualShaderMode && this.dualShaderMode === this.currentShaderMode) { this.closeHistoryEntry("dual", now); this.dualShaderMode = null; }
    } else if (this.dualShaderInitialized && shaderLen >= 2 && !endFreeze) {
      if (!this.frozen && !this.playbackPaused && !morphOnScreen && !rotationFreeze && now - this.lastAnySwitchMs > JourneyEngine.SWITCH_SPACING_MS && now - this.dualShaderStartMs > this.dualShaderDurationMs) {
        this.closeHistoryEntry("dual", now);
        this.dualShaderMode = this.pickDualShader(currentPhase);
        this.seenShaders.add(this.dualShaderMode);
        this.shaderHistory.push({
          mode: this.dualShaderMode,
          role: "dual",
          phaseId: currentPhase.id,
          startMs: now,
          endMs: 0,
        });
        this.dualShaderStartMs = now;
        this.dualShaderDurationMs = this.randomDuration(this.random, JourneyEngine.DUAL_SWITCH_MIN_SECS, JourneyEngine.DUAL_SWITCH_MAX_SECS);
        glitchRecord("shader-dual", `${this.dualShaderMode} @p${clamped.toFixed(3)}`);
        this.lastAnySwitchMs = now; this.nudgeForce = false;
      } else if (this.dualShaderMode === null) {
        // Primary just rotated away from a banned shader — re-engage a dual now
        this.dualShaderMode = this.pickDualShader(currentPhase);
        this.seenShaders.add(this.dualShaderMode);
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
    let inTertiaryMoment = this.takeScript ? this.tertiaryActive : false;
    for (let i = 0; !this.takeScript && i < this.tertiaryMoments.length; i++) {
      const m = this.tertiaryMoments[i];
      if (clamped >= m.startProgress && clamped <= m.endProgress) {
        inTertiaryMoment = true;
        // Conductor: the third layer belongs to the climax. A moment that
        // falls in a quiet stretch simply doesn't fire — threshold and
        // integration stay spare instead of "always max layers".
        // Tertiary gets a SHORTER spacing slot (2.5s) — with primary+dual
        // averaging one switch per ~7s, a full 4s-clear window rarely
        // exists and the third layer would be starved out entirely.
        // Gate on the PHASE's intended intensity, not the instantaneous
        // breath-modulated value (2026-09-30: the ~70s breath wave dips
        // a flat-max journey to ~0.70 and could veto every moment).
        const phaseIntent = currentPhase.intensityMultiplier ?? conductorIntensity;
        if (((!this.kineticEq || owned) && phaseIntent < JourneyEngine.TERTIARY_MIN_INTENSITY) || endFreeze || morphOnScreen || now - this.lastAnySwitchMs <= 2500) break;
        if (!this.tertiaryActive && !this.frozen) {
          let tertiaryCandidate = this.tertiaryPicks.get(i) ?? null;
          // Skip if user blocked/deleted this shader since journey started
          if (tertiaryCandidate && !this.isShaderAllowed(tertiaryCandidate)) tertiaryCandidate = null;
          // Cross-layer exclusion: never mirror the live primary or dual.
          // The precomputed pick was chosen blind at journey start; resolve
          // collisions here against what is actually on screen right now.
          // Cross-ROLE reuse (session oc9dr2: zooid ran as primary at
          // p0.55 then AGAIN as tertiary at p0.72 — "overused"): a
          // pick the journey has already shown re-resolves too.
          if (tertiaryCandidate && this.seenShaders.has(tertiaryCandidate)) tertiaryCandidate = null;
          if (owned && tertiaryCandidate && !currentPhase.shaderModes.includes(tertiaryCandidate)) tertiaryCandidate = null;
          if (tertiaryCandidate == null || tertiaryCandidate === this.currentShaderMode || tertiaryCandidate === this.dualShaderMode) {
            const pool = currentPhase.shaderModes.filter(
              (m2) => !MODES_3D.has(m2) && this.isShaderAllowed(m2)
                && m2 !== this.currentShaderMode && m2 !== this.dualShaderMode,
            );
            const unseen = pool.filter((m2) => !this.seenShaders.has(m2));
            const alternates = unseen.length > 0 ? unseen : pool;
            tertiaryCandidate = alternates.length > 0
              ? alternates[Math.floor(this.random() * alternates.length)]
              : null; // no collision-free option — sit this moment out
          }
          this.tertiaryShaderMode = tertiaryCandidate;
          this.tertiaryActive = true;
          if (tertiaryCandidate) { glitchRecord("shader-tertiary-on", `${tertiaryCandidate} @p${clamped.toFixed(3)}`); this.lastAnySwitchMs = now; this.nudgeForce = false; }
          if (this.tertiaryShaderMode) {
            this.seenShaders.add(this.tertiaryShaderMode);
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
      if (this.tertiaryShaderMode) glitchRecord("shader-tertiary-off", `${this.tertiaryShaderMode} @p${clamped.toFixed(3)}`);
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

    // Interpolate palette. Custom/legacy journeys can have phases without a
    // palette; fall back so frame.palette is always a full object (downstream
    // consumers read palette.accent/glow without guarding).
    const FALLBACK_PALETTE = { primary: "#1a1a2e", secondary: "#16213e", accent: "#d0a070", glow: "#e0b890" };
    const palette =
      nextPhaseIndex !== null && blend > 0 && currentPhase.palette && phases[nextPhaseIndex].palette
        ? interpolatePalette(
            currentPhase.palette,
            phases[nextPhaseIndex].palette,
            blend
          )
        : currentPhase.palette ?? FALLBACK_PALETTE;

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
      shaderOpacity: (iv((p) => p.shaderOpacity)) * windDownShaderScale,
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
      intensityMultiplier: conductorIntensity,
      voice: currentPhase.voice,
      poetryMood: currentPhase.poetryMood,
      poetryIntervalSeconds: iv((p) => p.poetryIntervalSeconds),
      palette,
      ambientLayers,
      filmGrain: 0, // film grain banned globally (design law) — never interpolated
      particleDensity: iv((p) => p.particleDensity),
      halation: iv((p) => p.halation),
      dualShaderMode: this.dualShaderMode ?? undefined,
      tertiaryShaderMode: this.tertiaryShaderMode ?? undefined,
      eventImpulse: this.eventImpulse,
      eventType: this.eventType as JourneyFrame["eventType"],
      eventApproach,
      cueImpulse: this.eventImpulse, // backward compat alias
      aiOverlayPrompt: currentPhase.aiOverlayPrompt,
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
  /** Ms since the last primary/dual/tertiary shader switch. Imagery
   *  consults this so layer births stay out of shader-switch windows —
   *  the 2026-09-28 sqxfce session showed stills + evictions + parallax
   *  uploads landing in the same seconds as switches, stacking into
   *  130-190ms stalls on a moving image. One mover at a time. */
  /** True while a scheduled stillness window is active — imagery holds
   *  its breath too (session yqwy2e: pushes during stillness forced
   *  cap-1 evictions = "elements dropped after halfway"). */
  isInStillness(): boolean {
    return this.inStillnessNow;
  }

  /** Cosmic-sparse interlude (Karel 2026-09-30: "you go cosmic sparse
   *  with a couple shaders and you transition back into some imaging.
   *  it makes for a story or journey") — one seeded mid-journey window
   *  per take where imagery thins to a single small still and the two
   *  shader layers carry the frame. Hash-derived from journey+seed (no
   *  random-stream consumption, so take determinism stays intact). */
  sparseInterludeActive(): boolean {
    const j = this.journey;
    if (!j) return false;
    // Analysis-first (Karel 2026-09-30: "based on the analysis be
    // uniquely treated"): when the journey has a pronounced interior
    // valley — a low-intensity phase between 30% and 90% — the sparse
    // passage lives THERE, where the music actually thins. The hash
    // window is only the fallback for flat arcs. Both deterministic.
    let valley: { start: number; end: number } | null = null;
    let valleyInt = 0.56;
    for (const ph of j.phases) {
      if (ph.start < 0.3 || ph.end > 0.9) continue;
      const iv = ph.intensityMultiplier ?? 1;
      if (iv < valleyInt) { valleyInt = iv; valley = { start: ph.start, end: ph.end }; }
    }
    if (valley) {
      const mid = (valley.start + valley.end) / 2;
      const half = Math.min(valley.end - valley.start, 0.13) / 2;
      return this.lastProgress >= mid - half && this.lastProgress < mid + half;
    }
    let h = 2166136261 ^ ((this.takeSeedValue ?? 0) >>> 0);
    for (let i = 0; i < j.id.length; i++) h = Math.imul(h ^ j.id.charCodeAt(i), 16777619);
    const start = 0.46 + (((h >>> 0) % 1000) / 1000) * 0.14; // opens in 0.46-0.60
    const width = 0.08 + (((h >>> 10) % 100) / 100) * 0.05;  // 8-13% of the journey
    return this.lastProgress >= start && this.lastProgress < Math.min(start + width, 0.78);
  }

  /** Scripted take playback: recompute desired primary/dual/tertiary
   *  from the recorded timeline at this progress; banned entries are
   *  skipped (the previous shader holds). */
  /** Banned script entries are RECAST, not skipped (Karel 2026-09-29:
   *  holds compounded into 46s freezes as bans gutted the take) — a
   *  deterministic substitute keeps the take's switch rhythm intact. */
  private substituteFor(mode: string): string | null {
    const cached = this.scriptSubs.get(mode);
    if (cached !== undefined) return cached;
    const safelist = RECAST_SAFELIST[this.journey?.realmId ?? ""];
    const pool = (safelist
      ? [...safelist]
      : (this.journey?.phases ?? []).flatMap((p) => p.shaderModes)
    ).filter((m, i, arr) => arr.indexOf(m) === i && !MODES_3D.has(m) && this.isShaderAllowed(m));
    let sub: string | null = null;
    if (pool.length > 0) {
      let h = 0;
      for (let i = 0; i < mode.length; i++) h = (h * 31 + mode.charCodeAt(i)) >>> 0;
      // Collision-proof (session x89v52: the sub hashed onto the shader
      // already playing, so the recast was a silent no-op and credo
      // held 54s): walk until unused by other recasts AND different
      // from the scripted neighbors.
      const used = new Set(this.scriptSubs.values());
      const scripted = new Set((this.takeScript ?? []).map((e) => e.mode));
      for (let k = 0; k < pool.length; k++) {
        const cand = pool[(h + k) % pool.length];
        if (!used.has(cand) && !scripted.has(cand)) { sub = cand; break; }
      }
      if (!sub) sub = pool[h % pool.length];
    }
    this.scriptSubs.set(mode, sub);
    if (sub) glitchRecord("script-recast", `${mode} -> ${sub}`);
    return sub;
  }

  private applyTakeScript(clamped: number, now: number): void {
    if (!this.takeScript) return;
    // Tail release (Karel 2026-09-30: "sat like this for like a minute...
    // the entire last third is boring"): a recorded take's final entry can
    // land as early as p0.82, freezing rotation for the rest of the track
    // (scripts also ignore nudges). Past the last entry + a beat, hand the
    // journey back to procedural rotation so the ending keeps breathing.
    const lastP = this.takeScript[this.takeScript.length - 1]?.p ?? 1;
    if (clamped > lastP + 0.04) {
      this.takeScript = null;
      this.shaderDurationMs = 12_000 + this.random() * 6_000;
      this.shaderStartMs = now;
      glitchRecord("script-tail-release", `@p${clamped.toFixed(3)}`);
      return;
    }
    let prim: string | null = null;
    let dual: string | null = null;
    let tert: string | null = null;
    const resolve = (m: string) => (this.isShaderAllowed(m) ? m : this.substituteFor(m));
    for (const en of this.takeScript) {
      if (en.p > clamped) break;
      if (en.role === "primary") { const r = resolve(en.mode); if (r) prim = r; }
      else if (en.role === "dual") { const r = resolve(en.mode); if (r) dual = r; }
      else if (en.role === "tertiary-on") { tert = resolve(en.mode); }
      else if (en.role === "tertiary-off") { tert = null; }
    }
    if (prim && prim !== this.currentShaderMode) {
      this.closeHistoryEntry("primary", now);
      this.currentShaderMode = prim;
      this.seenShaders.add(prim);
      this.shaderHistory.push({ mode: prim, role: "primary", phaseId: this.currentPhaseId ?? "scripted", startMs: now, endMs: 0 });
      this.shaderStartMs = now;
      glitchRecord("shader-primary", `${prim} @p${clamped.toFixed(3)} (scripted)`);
      this.lastAnySwitchMs = now; this.nudgeForce = false;
    }
    // Dual REST (Karel 2026-10-01 note #4: ghostribbons rode a 70s
    // scripted dual slot — "they stay and stay"): a scripted dual that
    // has held 35s rests (layer breathes away) until the next entry.
    if (dual && this.dualRestedMode && dual === this.dualRestedMode) {
      dual = null; // rested — the script must offer something NEW
    } else if (dual && dual !== this.dualRestedMode) {
      this.dualRestedMode = null;
    }
    if (dual && dual === this.dualShaderMode && this.dualStartMs > 0 && now - this.dualStartMs > 35_000) {
      this.dualRestedMode = dual;
      dual = null;
    }
    if (dual !== this.dualShaderMode) {
      this.closeHistoryEntry("dual", now);
      this.dualShaderMode = dual;
      this.dualStartMs = dual ? now : 0;
      if (dual) {
        this.seenShaders.add(dual);
        this.shaderHistory.push({ mode: dual, role: "dual", phaseId: this.currentPhaseId ?? "scripted", startMs: now, endMs: 0 });
        glitchRecord("shader-dual", `${dual} @p${clamped.toFixed(3)} (scripted)`);
        this.lastAnySwitchMs = now; this.nudgeForce = false;
      }
    }
    if (tert !== this.tertiaryShaderMode) {
      if (this.tertiaryShaderMode) glitchRecord("shader-tertiary-off", `${this.tertiaryShaderMode} @p${clamped.toFixed(3)} (scripted)`);
      this.closeHistoryEntry("tertiary", now);
      this.tertiaryShaderMode = tert;
      this.tertiaryActive = tert != null;
      if (tert) {
        this.seenShaders.add(tert);
        this.shaderHistory.push({ mode: tert, role: "tertiary", phaseId: this.currentPhaseId ?? "scripted", startMs: now, endMs: 0 });
        glitchRecord("shader-tertiary-on", `${tert} @p${clamped.toFixed(3)} (scripted)`);
        this.lastAnySwitchMs = now; this.nudgeForce = false;
      }
    }
  }

  /** Pull the next primary switch to ~delayMs from now (never pushes it
   *  later). Used when a morph ends so fresh shader motion greets the
   *  departing clip (Karel 2026-09-29: the ending frame "just sits"). */
  nudgeShaderRotation(delayMs: number): void {
    if (!this.running) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.shaderStartMs = Math.min(this.shaderStartMs, now - this.shaderDurationMs + delayMs);
    // One forced switch even inside the >0.90 rotation freeze (Karel
    // 2026-10-01: the finale morph "comes to its end and sits there
    // and nothing happens" — the freeze was eating the finale nudge).
    this.nudgeForce = true;
  }

  /** IMMEDIATE primary switch, no gates (2026-10-01: the finale needs
   *  a guaranteed shader arrival — freeze, stillness, spacing and
   *  script all yield). Picks the next allowed unseen mode. */
  forceShaderSwitch(): void {
    if (!this.running || !this.journey) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const phases = this.journey.phases;
    const phase = phases.find((p) => this.lastProgress >= p.start && this.lastProgress <= p.end) ?? phases[phases.length - 1];
    const pool = (phase?.shaderModes ?? []).filter((m) => !MODES_3D.has(m) && this.isShaderAllowed(m) && m !== this.currentShaderMode && m !== this.dualShaderMode);
    // Pinned finale (Karel 2026-10-01): a mastered take names its
    // ending shader — no random draw at the most-watched moment.
    const pinnedFinale = TAKE_FINALE_SHADERS[this.journey.id];
    const pick = pinnedFinale && this.isShaderAllowed(pinnedFinale) && pinnedFinale !== this.currentShaderMode
      ? pinnedFinale
      : (() => {
          if (pool.length === 0) return null;
          const unseen = pool.filter((m) => !this.seenShaders.has(m));
          return (unseen.length ? unseen : pool)[Math.floor(this.random() * (unseen.length ? unseen.length : pool.length))];
        })();
    if (!pick) return;
    this.closeHistoryEntry("primary", now);
    this.currentShaderMode = pick;
    this.seenShaders.add(pick);
    this.shaderHistory.push({ mode: pick, role: "primary", phaseId: this.currentPhaseId ?? "forced", startMs: now, endMs: 0 });
    this.shaderStartMs = now;
    this.lastAnySwitchMs = now; this.nudgeForce = false;
    glitchRecord("shader-primary", `${pick} @p${this.lastProgress.toFixed(3)} (finale-forced)`);
  }

  getMsSinceAnySwitch(): number {
    return this.lastAnySwitchMs === 0 ? Number.POSITIVE_INFINITY : performance.now() - this.lastAnySwitchMs;
  }

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

  /** Build a stable AI prompt for a phase. Called on phase change AND
   *  whenever the sequence index advances (if the phase has aiPromptSequence). */
  private buildPhaseAiPrompt(phase: JourneyPhase, phaseIndex: number): string {
    if (!this.journey) return phase.aiPrompt;

    // If a sequence is defined, pick the prompt for the current index.
    // Fall back to the legacy single prompt if no sequence or index invalid.
    const basePrompt = phase.aiPromptSequence && this.phaseSequenceIdx >= 0
      ? phase.aiPromptSequence[this.phaseSequenceIdx] ?? phase.aiPrompt
      : phase.aiPrompt;

    // Check theme first (custom journeys), then fall back to realm (built-in journeys)
    const vocab = this.journey.theme?.visualVocabulary ?? getRealm(this.journey.realmId)?.visualVocabulary;
    let prompt = basePrompt;

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

    // Conductor: threshold opens with a single voice. If the first phase's
    // authored intensity sits below the dual threshold, start without a
    // second layer — it engages when the build crosses DUAL_ON_INTENSITY.
    const firstIntensity = Number.isFinite(firstPhase.intensityMultiplier) ? firstPhase.intensityMultiplier : 1;
    if (firstIntensity < JourneyEngine.DUAL_ON_INTENSITY) {
      this.dualShaderMode = null;
      this.dualShaderInitialized = true;
      return;
    }
    this.dualAllowed = true;

    // If the first primary bans duals, start without one — it will engage when primary rotates
    if (JourneyEngine.NEVER_DUAL_PRIMARIES.has(this.currentShaderMode)) {
      this.dualShaderMode = null;
      this.dualShaderInitialized = true;
      return;
    }

    this.dualShaderMode = this.pickDualShader(firstPhase);
    this.seenShaders.add(this.dualShaderMode);
    this.dualShaderStartMs = now;
    this.dualShaderDurationMs = this.randomDuration(random, JourneyEngine.DUAL_SWITCH_MIN_SECS, JourneyEngine.DUAL_SWITCH_MAX_SECS);
    this.dualShaderInitialized = true;
  }

  /**
   * Pick a dual shader from the phase's pool.
   * (Geometry pick-banned 2026-09-29 — the spider-web ejection.)
   * Avoids picking the same shader as the primary.
   */
  /** Check live user preferences — blocked or deleted shaders should be skipped.
   *  In multi-layer mode, also rejects 3D modes (R3F Canvas adds a
   *  WebGL context that pushes 5+ simultaneous canvases over the
   *  browser's context limit and triggers context-loss bursts). */
  private isShaderAllowed(mode: string): boolean {
    if (PICKTIME_SHADER_BLOCKLIST.has(mode)) return false;
    const realmBans = this.journey ? PICKTIME_REALM_BLOCKLIST[this.journey.realmId] : undefined;
    if (realmBans?.has(mode)) return false;
    // Karel 2026-09-29: "full screen web of colored lines... like an
    // animated cartoon spider web — ejected." The entire Geometry
    // curve-lattice family, banned at pick time (pin-safe).
    if (getGeometryModes().has(mode)) return false;
    if (this.multiLayerMode && MODES_3D.has(mode)) return false;
    const blocked = getUserBlockedShaders();
    const deleted = getUserDeletedShaders();
    return !blocked.has(mode) && !deleted.has(mode);
  }

  /** Toggle multi-layer mode — primary picker excludes 3D modes when on.
   *  Routes that mount layer A + B + dual A + B + tertiary should set
   *  this true on mount and false on unmount. */
  setMultiLayerMode(enabled: boolean): void {
    this.multiLayerMode = enabled;
  }

  /** Freeze/unfreeze shader switching. Used by installation-loop-client
   *  during the credits screen so the visualizer doesn't keep mutating
   *  underneath the 3s black fade-in. */
  setFrozen(f: boolean): void {
    this.frozen = f;
  }

  /** Gate shader switching on playback state. On resume, the shader timers
   *  are shifted by the paused duration so the pause neither burns through
   *  journey-wide shader variety nor triggers an instant switch. Separate
   *  from setFrozen so the installation credits flow is untouched. */
  setPlaybackPaused(paused: boolean): void {
    if (paused === this.playbackPaused) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.playbackPaused = paused;
    if (paused) {
      this.pausedAtMs = now;
    } else if (this.pausedAtMs > 0) {
      const pausedFor = now - this.pausedAtMs;
      this.shaderStartMs += pausedFor;
      this.dualShaderStartMs += pausedFor;
      this.pausedAtMs = 0;
    }
  }

  /** Phase-owned dual pick: this phase's pool only, never a shader live
   *  on another layer, unseen first; null = the dual layer rests. Draws
   *  from the seeded stream only when there is a real choice. */
  private pickOwnedDual(phase: JourneyPhase): string | null {
    const candidates = phase.shaderModes.filter(
      (m) => m !== this.currentShaderMode && m !== this.tertiaryShaderMode && !MODES_3D.has(m) && this.isShaderAllowed(m),
    );
    if (candidates.length === 0) return null;
    const unseen = candidates.filter((m) => !this.seenShaders.has(m));
    const pool = unseen.length > 0 ? unseen : candidates;
    if (pool.length === 1) return pool[0];
    // keep the current dual if it is still a valid member (no churn)
    if (this.dualShaderMode && pool.includes(this.dualShaderMode) && unseen.length === 0) return this.dualShaderMode;
    return pool[Math.floor(this.random() * pool.length)];
  }

  private pickDualShader(phase: JourneyPhase): string {
    const candidates = phase.shaderModes.filter(
      m => m !== this.currentShaderMode && m !== this.tertiaryShaderMode && !MODES_3D.has(m) && this.isShaderAllowed(m)
    );
    if (candidates.length === 0) {
      // Fallback: drop the preference filters, but still refuse to mirror
      // the live primary — a duplicated layer reads as a glitch (2026-09-27
      // review). Only when the phase genuinely has no second option does
      // the primary repeat.
      const nonPrimary = phase.shaderModes.filter(m => !MODES_3D.has(m) && m !== this.currentShaderMode);
      const fallback = nonPrimary[0] ?? phase.shaderModes.filter(m => !MODES_3D.has(m))[0] ?? phase.shaderModes[0] ?? "cosmos";
      return fallback;
    }

    // Journey-wide uniqueness: prefer shaders we haven't used yet in this journey.
    const unseenCandidates = candidates.filter(m => !this.seenShaders.has(m));
    // Phase pool exhausted: BORROW an unseen shader journey-wide before
    // repeating (session e7jidb: strophoid ran dual twice + primary once
    // — the dual picker lacked the borrow step the primary has).
    if (unseenCandidates.length === 0 && this.journey) {
      const live = new Set([this.currentShaderMode, this.tertiaryShaderMode]);
      const borrow = this.journey.phases
        .flatMap((p) => p.shaderModes)
        .filter((m) => !this.seenShaders.has(m) && !MODES_3D.has(m) && this.isShaderAllowed(m) && !live.has(m));
      if (borrow.length > 0) return borrow[Math.floor(this.random() * borrow.length)];
    }
    const pool = unseenCandidates.length > 0 ? unseenCandidates : candidates;

    // Geometry is pick-banned (2026-09-29) so geoCandidates is always
    // empty — but the random() draw below MUST stay: removing it would
    // shift the seeded stream and scramble every pinned take.
    const geoModes = getGeometryModes();
    const geoCandidates = pool.filter(m => geoModes.has(m));
    if (geoCandidates.length > 0 && this.random() < 0.7) {
      return geoCandidates[Math.floor(this.random() * geoCandidates.length)];
    }
    return pool[Math.floor(this.random() * pool.length)];
  }

  /**
   * Schedule tertiary shader moments — every ~60s, lasting 20-30s.
   * This creates the "sprinkled in" 3rd layer effect.
   */
  private scheduleTertiaryMoments(random: () => number): void {
    this.tertiaryMoments = [];
    if (this.kineticEq) {
      // EQ mode: many SHORT treble windows, each with a fresh pick
      // (2026-09-30: one continuous window held the sparkler for the
      // entire journey — "i was expecting diversity"). Small gaps
      // between windows double as breathing room.
      let cursor = 0.05;
      while (cursor < 0.94) {
        const end = Math.min(0.96, cursor + 0.10 + random() * 0.06);
        this.tertiaryMoments.push({ startProgress: cursor, endProgress: end });
        cursor = end + 0.015 + random() * 0.035;
      }
      return;
    }

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
