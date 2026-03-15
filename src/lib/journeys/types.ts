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
  voice: "shimmer" | "nova" | "fable" | "alloy" | "echo" | "onyx";
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
  defaultVoice: "shimmer" | "nova" | "fable" | "alloy" | "echo" | "onyx";
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
  voice: "shimmer" | "nova" | "fable" | "alloy" | "echo" | "onyx";
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
}
