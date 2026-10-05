/**
 * Deep analysis v2 — Resonance's core reading of a piece (server-only).
 *
 * The measured MusicProfile (music-profile.ts: tempo, pulse, data-driven
 * sections, dynamics, register, mode balance, per-section chord timeline)
 * is handed to Claude, which interprets it the way a teacher + composer
 * would: section-by-section harmony and texture, mood, the emotional story,
 * and imagery cues that come FROM the music (theme law: imagery is never
 * title-only). All v1 fields are kept so the existing UI keeps working.
 *
 * Used by /api/analysis/summarize (every analyze / batch-analyze run) and
 * scripts/deep-analysis-backfill.ts (service-side backfill).
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import type { ChordEvent, MusicalEvent, NoteEvent } from "./types";
import { buildMusicProfile, fmtTime, type AudioFeatures, type MusicProfile } from "./music-profile";

export const DEEP_SUMMARY_VERSION = 2;
export const DEEP_SUMMARY_MODEL = "claude-opus-5-5";

const SectionOut = z.object({
  index: z.number().int().describe("Index of the measured section this describes (0-based, same order as given)"),
  name: z.string().describe("Evocative musical section name, 1-4 words, e.g. 'Opening Prayer', 'Rising Ostinato'"),
  description: z.string().describe("What happens musically: the actual chords/progressions with timestamps, melody shape, voicings, texture, how it connects to the previous section. 3-5 sentences, specific."),
  character: z.string().describe("One sentence on the expressive character of this passage"),
  mood_words: z.array(z.string()).describe("2-4 precise mood words for this section"),
  valence: z.number().describe("Emotional valence of the section, -1 (dark, grieving) to +1 (bright, joyful)"),
  arousal: z.number().describe("Energy/arousal of the section, 0 (still) to 1 (surging)"),
  dynamics: z.string().describe("Dynamic level and motion, e.g. 'pp, swelling to mf by 1:40'"),
  texture: z.string().describe("Texture: e.g. 'sparse single-line melody over held bass', 'dense rolling arpeggios'"),
  register: z.string().describe("Register in plain words with note names, e.g. 'low-middle, bass on F2, melody around A4'"),
  emotional_beat: z.string().describe("The story beat of this section in the piece's emotional narrative"),
  imagery: z.string().describe("A concrete visual image this passage evokes, derived from its tempo, harmony, register and dynamics (no people, no text)"),
});

export const DeepSummaryLLM = z.object({
  overview: z.string().describe("3-4 sentences: the piece's character, style, harmonic language and emotional core"),
  key_center: z.string().describe("Key center with modulations, tonicizations, modal colour and how certain it is"),
  tempo_description: z.string().describe("How fast/slow it FEELS and why (pulse, rubato, attack rate, harmonic rhythm), referencing the measured BPM"),
  mode_evidence: z.string().describe("Major vs minor vs modal reading with evidence (chord-quality shares, borrowed chords, modal colours)"),
  mood: z.object({
    overall: z.string().describe("One sentence on the overall mood"),
    words: z.array(z.string()).describe("3-6 precise mood words for the whole piece"),
    valence: z.number().describe("-1 (dark) to +1 (bright)"),
    arousal: z.number().describe("0 (still) to 1 (surging)"),
  }),
  sections: z.array(SectionOut).describe("Exactly one entry per measured section, in order"),
  dynamics_arc: z.object({
    description: z.string().describe("The shape of the whole dynamic journey, where it builds and recedes"),
    climax_description: z.string().describe("What happens musically at the climax (timestamped) and how it is prepared"),
  }),
  texture_and_register: z.string().describe("Overall texture and register use across the piece"),
  emotional_narrative: z.string().describe("The story the music tells, section by section with timestamps, 5-9 sentences"),
  imagery_cues: z.object({
    palette: z.array(z.string()).describe("4-6 colours/light qualities the harmony and register suggest"),
    light: z.string().describe("Quality of light (e.g. 'low amber side-light slowly brightening')"),
    motion: z.string().describe("Camera/world motion that matches the tempo feel and pulse"),
    scale: z.string().describe("Intimate / human / vast — and how scale changes over the arc"),
    materials: z.array(z.string()).describe("3-6 physical materials/textures the sound suggests (e.g. 'warm wood grain', 'still water')"),
    environments: z.array(z.string()).describe("3-5 candidate environments that fit the measured music (not just the title)"),
    atmosphere: z.string().describe("Weather/air/atmosphere"),
  }),
  chord_vocabulary: z.array(z.string()).describe("Unique chords in order of importance"),
  harmonic_highlights: z.string().describe("Notable harmonic moments with timestamps — cadences, substitutions, modal borrowing, pedal points"),
  rhythm_and_feel: z.string().describe("Rhythmic character, harmonic rhythm, pulse and rubato"),
  relearning_tips: z.string().describe("Practical advice for relearning: where to start, voicings, practice order"),
});
export type DeepSummaryLLMOut = z.infer<typeof DeepSummaryLLM>;

export interface DeepSummaryV2 extends Omit<DeepSummaryLLMOut, "sections" | "tempo_description" | "mode_evidence"> {
  version: 2;
  generated_at: string;
  model: string;
  title: string | null;
  sections: Array<
    DeepSummaryLLMOut["sections"][number] & {
      label: string;
      start: number;
      end: number;
      intensity: number;
      trend: string;
      local_bpm: number | null;
      local_key: string | null;
    }
  >;
  tempo: {
    bpm: number | null;
    alt_bpm: number | null;
    feel: string | null;
    pulse: string | null;
    steadiness: number | null;
    pulse_clarity: number | null;
    confidence: number | null;
    onset_rate: number | null;
    method: string | null;
    description: string;
  };
  mode_balance: MusicProfile["modeBalance"] & { evidence: string };
  dynamics_arc: DeepSummaryLLMOut["dynamics_arc"] & {
    shape: string;
    climax_time: number;
    quietest_time: number;
    curve: Array<{ t: number; intensity: number }>;
  };
  profile: Omit<MusicProfile, "sections" | "tempo"> & {
    sections: Array<Omit<MusicProfile["sections"][number], "chordTimeline">>;
    tempo_curve: Array<{ t: number; bpm: number }>;
  };
}

function buildPrompt(title: string | null, p: MusicProfile, events: MusicalEvent[]): string {
  const t = p.tempo;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const sec = p.sections
    .map((s) => {
      const share = Object.entries(s.chordShare).filter(([, v]) => v >= 0.05).map(([k, v]) => `${k} ${pct(v)}`).join(", ");
      return [
        `### Section ${s.index} (${fmtTime(s.start)}–${fmtTime(s.end)})`,
        `- intensity ${s.intensity} (0.1 quietest section → 1.0 peak of this piece), ${s.trend}`,
        `- loudness ${s.loudnessDb ?? "?"} dBFS (${s.loudnessRel !== null ? pct(s.loudnessRel) + " of the track's range" : "n/a"}), brightness ~${s.brightnessHz ?? "?"} Hz spectral centroid`,
        `- attacks ${s.onsetRate}/s, transcribed notes ${s.noteDensity}/s, mean velocity ${s.velocityMean}`,
        `- register ${s.register.low}–${s.register.high} (median ${s.register.median})`,
        `- local tempo ${s.localBpm ?? "?"} BPM; local key estimate ${s.localKey ?? "?"}`,
        `- chord families: ${share || "n/a"}; most-held chords: ${s.topChords.join(", ") || "n/a"}`,
        `- chord timeline: ${s.chordTimeline || "(none detected)"}`,
      ].join("\n");
    })
    .join("\n\n");
  const ev = events
    .filter((e) => e.intensity >= 0.4)
    .slice(0, 40)
    .map((e) => `${fmtTime(e.time)} ${e.type} (${e.label}, ${e.intensity.toFixed(2)})`)
    .join("; ");
  const curve = p.dynamics.curve.map((c) => `${fmtTime(c.t)} ${c.intensity}`).join(", ");

  return `You are analysing a solo recording by Karel Barnoski — pianist-composer (album "Welcome Home"; harmonic voice: pedal tones, extended 9th/11th/13th voicings, modal colour, suspension over resolution). Resonance is his listening/teaching workspace: this analysis is the CORE of the app — it teaches him his own piece and it drives the visual journey that accompanies it. Be deep, specific and musically literate. Every claim should be grounded in the measured data below (cite timestamps and chord names). The title is context only — never let it override what the music measurably does (a bright title on a slow minor piece is still a slow minor piece).

Transcription caveat: notes and chord names come from automatic transcription (Basic Pitch) of an audio recording, so individual chord labels can be noisy (overtones may add extensions, slash bass may be spurious). Read through the noise: weight long-held chords and recurring patterns, name the likely real harmony, and say when something is ambiguous.

# "${title ?? "Untitled"}" — measured profile
Duration ${fmtTime(p.duration)}.
Tempo: ${t ? `${t.bpm} BPM tactus (alternative metrical level ${t.altBpm}), pulse clarity ${t.pulseClarity}, steadiness ${t.steadiness}, ${t.pulse}; attack rate ${t.onsetRate}/s → felt speed "${t.feel}"` : "unknown"}.
Key (Krumhansl on pitch-class durations): ${p.key.detected ?? "?"} (runner-up ${p.key.runnerUp ?? "?"}, clarity ${p.key.clarity}).
Chord-quality shares (by held duration): major ${pct(p.modeBalance.major)}, minor ${pct(p.modeBalance.minor)}, dominant ${pct(p.modeBalance.dominant)}, suspended ${pct(p.modeBalance.suspended)}, diminished/augmented ${pct(p.modeBalance.diminished)}, unclassified ${pct(p.modeBalance.other)} → minor-weight ${p.modeBalance.minorWeight} (0 major … 1 minor), measured verdict: ${p.modeBalance.verdict}. Modal colours: ${p.modeBalance.modalColors.join(", ") || "none detected"}.
Register: ${p.register.low}–${p.register.high}, median ${p.register.median}. Density: ${p.density.label} (${p.density.onsetRate ?? "?"} attacks/s).
Dynamics: shape "${p.dynamics.shape}", climax at ${fmtTime(p.dynamics.climaxTime)}, quietest at ${fmtTime(p.dynamics.quietestTime)}, dynamic range ${p.dynamics.rangeDb ?? "?"} dB.
Intensity curve (every 5 s, 0–1 relative to this piece): ${curve}
Detected events: ${ev || "none"}

## Sections (boundaries are measured from changes in loudness, attack rate, register, brightness and harmony — keep them exactly; return one entry per section with the same index)
${sec}

# What to write
Return the JSON object. For each section give a real musical description (chords with timestamps, melodic/voicing behaviour, texture) plus character, mood, dynamics, texture, register, its beat in the emotional story, and an image it evokes. Valence/arousal must follow the data (minor/diminished share, intensity, attack rate, register), not the title. The imagery cues must be derivable from the music itself — tempo feel → motion, mode balance/register → light and palette, dynamics arc → scale changes — and must never include people, faces, figures, text or lettering.`;
}

/** Compact the profile for storage (drop the long chord strings). */
function compactProfile(p: MusicProfile): DeepSummaryV2["profile"] {
  const { sections, tempo, ...rest } = p;
  return {
    ...rest,
    sections: sections.map(({ chordTimeline: _ct, ...s }) => s),
    tempo_curve: tempo?.curve ?? [],
  };
}

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export interface DeepSummaryInput {
  title: string | null;
  notes: NoteEvent[];
  chords: ChordEvent[];
  events?: MusicalEvent[] | null;
  duration?: number | null;
  keySignature?: string | null;
  /** Precomputed profile (e.g. from the browser with audio features). */
  profile?: MusicProfile | null;
  audio?: AudioFeatures | null;
}

export interface DeepSummaryResult {
  summary: DeepSummaryV2;
  profile: MusicProfile;
  usage: { input_tokens: number; output_tokens: number };
}

export async function generateDeepSummary(input: DeepSummaryInput): Promise<DeepSummaryResult> {
  const profile =
    input.profile ??
    buildMusicProfile({ notes: input.notes, chords: input.chords, duration: input.duration, keySignature: input.keySignature, audio: input.audio });
  const prompt = buildPrompt(input.title, profile, input.events ?? []);
  const schema = z.toJSONSchema(DeepSummaryLLM, { target: "draft-7" }) as Record<string, unknown>;
  stripUnsupported(schema);

  // Opus 5.5 with server-side refusal fallback (default routing) — a music
  // analysis should never be declined, but if a classifier misfires the
  // request is rescued instead of silently losing the deep summary.
  const stream = client().beta.messages.stream({
    model: DEEP_SUMMARY_MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  } as unknown as Parameters<Anthropic["beta"]["messages"]["stream"]>[0]);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("deep summary refused by model");
  if (msg.stop_reason === "max_tokens") throw new Error("deep summary truncated (max_tokens)");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const llm = DeepSummaryLLM.parse(JSON.parse(text));

  const bySec = new Map(llm.sections.map((s) => [s.index, s]));
  const t = profile.tempo;
  const { tempo_description, mode_evidence, sections: _s, ...restLlm } = llm;
  const summary: DeepSummaryV2 = {
    ...restLlm,
    version: 2,
    generated_at: new Date().toISOString(),
    model: msg.model ?? DEEP_SUMMARY_MODEL,
    title: input.title,
    sections: profile.sections.map((ps, i) => {
      const s = bySec.get(ps.index) ?? llm.sections[i] ?? {
        index: ps.index, name: `Section ${i + 1}`, description: "", character: "", mood_words: [], valence: 0, arousal: ps.intensity,
        dynamics: "", texture: "", register: "", emotional_beat: "", imagery: "",
      };
      return {
        ...s,
        index: ps.index,
        label: `${s.name} (${fmtTime(ps.start)}-${fmtTime(ps.end)})`,
        start: ps.start,
        end: ps.end,
        intensity: ps.intensity,
        trend: ps.trend,
        local_bpm: ps.localBpm,
        local_key: ps.localKey,
      };
    }),
    tempo: {
      bpm: t ? Math.round(t.bpm) : null,
      alt_bpm: t ? Math.round(t.altBpm) : null,
      feel: t?.feel ?? null,
      pulse: t?.pulse ?? null,
      steadiness: t?.steadiness ?? null,
      pulse_clarity: t?.pulseClarity ?? null,
      confidence: t?.confidence ?? null,
      onset_rate: t?.onsetRate ?? null,
      method: t?.method ?? null,
      description: tempo_description,
    },
    key_center: llm.key_center,
    mode_balance: { ...profile.modeBalance, evidence: mode_evidence },
    dynamics_arc: {
      ...llm.dynamics_arc,
      shape: profile.dynamics.shape,
      climax_time: profile.dynamics.climaxTime,
      quietest_time: profile.dynamics.quietestTime,
      curve: profile.dynamics.curve,
    },
    profile: compactProfile(profile),
  };
  return { summary, profile, usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens } };
}

/** Structured outputs accept a subset of JSON Schema — drop numeric bounds etc. */
function stripUnsupported(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  for (const k of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minItems", "maxItems", "$schema"]) delete o[k];
  if (o.type === "object" && o.properties) o.additionalProperties = false;
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) v.forEach(stripUnsupported);
    else stripUnsupported(v);
  }
}

/** Is this stored summary a v2 deep analysis? */
export function isDeepSummaryV2(summary: unknown): summary is DeepSummaryV2 {
  const s = summary as Partial<DeepSummaryV2> | null;
  return !!s && s.version === 2 && Array.isArray(s.sections) && s.sections.length > 0 && !!s.emotional_narrative && !!s.tempo && !!s.mode_balance;
}
