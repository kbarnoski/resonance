export interface NoteEvent {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
}

export interface ChordEvent {
  chord: string;
  time: number;
  duration: number;
}

export interface MusicalEvent {
  time: number;
  type: "bass_hit" | "texture_change" | "climax" | "drop" | "silence" | "new_idea";
  intensity: number;    // 0-1
  label: string;        // "Deep bass impact", "New melodic idea"
}

export interface AnalysisResult {
  status: "completed" | "error";
  key_signature: string | null;
  key_confidence?: number;
  tempo: number | null;
  time_signature: string | null;
  chords: ChordEvent[];
  notes: NoteEvent[];
  melody?: NoteEvent[];
  bass_line?: NoteEvent[];
  harmonic_rhythm?: string;
  progressions?: string[];
  events?: MusicalEvent[];
  midi_data: object | null;
  error?: string;
}
