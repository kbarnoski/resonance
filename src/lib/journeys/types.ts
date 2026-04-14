import type { Mood } from "@/lib/audio/vibe-detection";

export type JourneyPhaseId =
  | "threshold"
  | "expansion"
  | "transcendence"
  | "illumination"
  | "return"
  | "integration";

export interface AmbientLayers {
  wind: number;   // 0-1
  rain: number;   // 0-1
  drone: number;  // 0-1
  chime: number;  // 0-1
  fire: number;   // 0-1
}

export interface JourneyPhase {
  id: JourneyPhaseId;
  /** Normalized start position (0-1) of track */
  start: number;
  /** Normalized end position (0-1) of track */
  end: number;
  /** Shader pool for this phase */
  shaderModes: string[];
  /** 0-1, allows AI layer to show through when < 1 */
  shaderOpacity: number;
  /** Base prompt for AI image generation */
  aiPrompt: string;
  /** Audio-reactive prompt modifiers */
  aiPromptModifiers: {
    highBass?: string;
    highTreble?: string;
    highAmplitude?: string;
    lowAmplitude?: string;
  };
  /** Bass maps denoising within this range */
  denoisingRange: [number, number];
  /** AI generation rate in FPS (0.5-2) */
  targetFps: number;
  /** Post-processing: bloom intensity 0-1 */
  bloomIntensity: number;
  /** Post-processing: chromatic aberration 0-1 */
  chromaticAberration: number;
  /** Post-processing: warm (+) or cool (-) shift */
  colorTemperature: number;
  /** Post-processing: vignette darkness 0-1 */
  vignette: number;
  /** TTS voice for this phase */
  voice: "shimmer" | "nova" | "fable" | "alloy" | "echo" | "onyx" | "ash" | "ballad" | "coral" | "sage" | "verse" | "marin" | "cedar";
  /** Poetry mood for text generation */
  poetryMood: Mood;
  /** Spoken at phase boundaries */
  guidancePhrases: string[];
  /** Seconds between poetry lines */
  poetryIntervalSeconds: number;
  /** Multiplier for audio-reactive intensity */
  intensityMultiplier: number;
  /** Phase color palette */
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    glow: string;
  };
  /** Ambient sound layer intensities */
  ambientLayers: AmbientLayers;
  /** Post-processing: film grain intensity 0-1 */
  filmGrain: number;
  /** Post-processing: floating particle density 0-1 */
  particleDensity: number;
  /** Post-processing: halation glow 0-1 */
  halation: number;
  /** Optional prompt for small floating overlay elements (screen blend on black bg) */
  aiOverlayPrompt?: string;
}

export type VoiceId = "shimmer" | "nova" | "fable" | "alloy" | "echo" | "onyx" | "ash" | "ballad" | "coral" | "sage" | "verse" | "marin" | "cedar";

export interface JourneyTheme {
  visualVocabulary: {
    environments: string[];
    entities: string[];
    textures: string[];
    atmospheres: string[];
  };
  shaderCategories: string[]; // e.g. ["Cosmic", "Organic", "Elemental"]
  palette: { primary: string; secondary: string; accent: string; glow: string };
  voice: VoiceId;
  poetryImagery: string;
  poetryMood: Mood;
  ambientTheme: string; // maps to REALM_THEME_MAP keys or "default"
}

export interface Realm {
  id: string;
  name: string;
  subtitle: string;
  visualVocabulary: {
    environments: string[];
    entities: string[];
    textures: string[];
    atmospheres: string[];
  };
  shaderModes: string[];
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    glow: string;
  };
  defaultVoice: "shimmer" | "nova" | "fable" | "alloy" | "echo" | "onyx" | "ash" | "ballad" | "coral" | "sage" | "verse" | "marin" | "cedar";
  poetryMood: Mood;
  poetryImagery: string;
}

export interface Journey {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  realmId: string;
  phases: JourneyPhase[];
  aiEnabled: boolean;
  /** Per-journey phase display names (overrides generic "Threshold", "Expansion", etc.) */
  phaseLabels?: Partial<Record<JourneyPhaseId, string>>;
  storyText?: string | null;
  recordingId?: string | null;
  /** AI-generated theme for custom journeys (replaces realm lookup) */
  theme?: JourneyTheme;
  /** Owner user ID — set on custom journeys loaded from DB */
  userId?: string;
  /** Opt-in: enable bass-hit white flash + pre-activation glow (default false) */
  enableBassFlash?: boolean;
  /** When true, shaders react to audio frequencies instead of smooth sine waves */
  audioReactive?: boolean;
  /** Seconds before track end to trigger "Journey Complete" (default 0.5).
   *  Use for tracks with silence at the end so completion aligns with the music. */
  completionOffset?: number;
  /** When present, playback cycles through these image URLs instead of generating AI imagery.
   *  Used for journeys built from a user's own photos (e.g. photographer collab). */
  localImageUrls?: string[];
  /** Shader modes that must never appear in this journey, regardless of realm/theme pool.
   *  Applied at journey-start before phase shader assignment. */
  blockedShaders?: string[];
  /** When true, the AI image generator skips the random cinematic POV / interpretation /
   *  mood decoration so the journey's per-phase camera instructions aren't overridden by
   *  random perspective variation. Use for journeys with strict camera requirements (e.g. Ghost). */
  strictCameraPrompt?: boolean;
}

/** A user-created journey stored in Supabase */
export interface CustomJourney extends Journey {
  userId: string;
  recordingId: string | null;
  storyText: string | null;
  shareToken: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Output from the journey engine each frame */
export interface JourneyFrame {
  phase: JourneyPhaseId;
  progress: number;
  phaseProgress: number;
  shaderMode: string;
  shaderOpacity: number;
  aiPrompt: string;
  denoisingStrength: number;
  targetFps: number;
  bloomIntensity: number;
  chromaticAberration: number;
  colorTemperature: number;
  vignette: number;
  intensityMultiplier: number;
  voice: "shimmer" | "nova" | "fable" | "alloy" | "echo" | "onyx" | "ash" | "ballad" | "coral" | "sage" | "verse" | "marin" | "cedar";
  poetryMood: Mood;
  poetryIntervalSeconds: number;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    glow: string;
  };
  /** Ambient sound layer intensities */
  ambientLayers: AmbientLayers;
  /** Film grain intensity 0-1 */
  filmGrain: number;
  /** Particle density 0-1 */
  particleDensity: number;
  /** Halation glow 0-1 */
  halation: number;
  /** Optional second shader to layer underneath during peak moments */
  dualShaderMode?: string;
  /** Optional third shader for even richer layering */
  tertiaryShaderMode?: string;
  /** Event impulse 0-1 (1 = just triggered, decays over ~1-3s depending on type) */
  eventImpulse?: number;
  /** Type of the current event impulse */
  eventType?: "bass_hit" | "texture_change" | "climax" | "drop" | "silence" | "new_idea";
  /** Approach ramp 0-1 — builds up ~1.5s before the next bass_hit event fires */
  eventApproach?: number;
  /** @deprecated Use eventImpulse — kept for backward compat */
  cueImpulse?: number;
  /** Optional prompt for small floating overlay elements (screen blend on black bg) */
  aiOverlayPrompt?: string;
}
