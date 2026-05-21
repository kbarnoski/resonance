# 66 · Chatterbox Ghost

**Route**: `/dream/66-chatterbox-ghost`  
**Cycle**: 83 · 2026-05-21  
**Status**: `demoable`

## What it does

Six Ghost narrative scenes, each narrated in a voice you clone from a 5–10 second recording.
Chatterbox Turbo (Resemble AI, open-source) on fal.ai renders each Ghost line with **paralinguistic
action tags** embedded in the text: `[sigh]`, `[gasp]`, `[softly]`, `[slowly]`, `[flatly]`, `[long pause]`.
These are physical vocal actions — not emotional states — that happen mid-sentence, giving the narration
a character-driven texture that global style directions (Gemini TTS) and per-word emotion tags (Orpheus)
can't produce the same way.

## The voice-clone feature

Record any 5–10s audio clip via the browser mic — Karel reading one sentence, an actor doing a line,
a synthesized tone. Chatterbox Turbo uses it as a speaker reference to render all six Ghost scenes
in that voice. This is the **first prototype in the sandbox where the Ghost can speak in a specific
human voice**. Prior voice prototypes use model-defined voices or style descriptions.

Without a reference clip, Chatterbox uses its default voice.

## Four TTS paradigms in the sandbox

| Prototype | Paradigm | Control granularity |
|---|---|---|
| `56-ghost-voice` | Gemini TTS | Global style instruction per scene |
| `61-orpheus-voice` | Orpheus TTS | Per-word XML emotion tags |
| `64-eleven-dialogue` | ElevenLabs V3 | Per-phrase acting direction |
| **`66-chatterbox-ghost`** | **Chatterbox Turbo** | **Voice clone + physical action tags** |

The exaggeration slider (0.0–1.0) controls how dramatically the model expresses the action tags across
all six scenes simultaneously.

## Editable lines

Each scene's text is editable — change the narrative line or experiment with different action tags.
Any tag in `[brackets]` that Chatterbox recognizes as a paralinguistic cue will be treated as a vocal
action rather than spoken text.

## Known unknowns

- API parameter names are naming-convention best guesses:
  - `text` → the line to speak
  - `audio_prompt_url` → the voice-clone reference URL
  - `exaggeration_factor` → 0.0–1.0 emotional intensity
- If the endpoint returns an error, paste the raw error text in the Claude Code session and the agent
  will fix the parameter names in the next cycle.

## Waveform interaction

After generating, click **▶ play** on any scene card. The waveform draws when the audio decodes —
it's not pre-loaded. The card border highlights the active scene. Click play on another scene to
switch; the current scene stops automatically.

## Cost

`$0.025 / 1000 chars`. A full six-scene generation at ~60 chars/scene ≈ `$0.009` total.
Voice reference upload to fal storage: effectively free (small audio blob).

## Polish ideas for future cycles

- Bundled reference clips: include a short synthesized reference voice as a public asset so the
  prototype has a compelling default demo without requiring mic permissions
- Side-by-side comparison mode: render the same scene with/without voice clone and let Karel vote
- Download all six scenes as a ZIP
- HRTF spatialization: route each generated clip through a PannerNode (same as `56-ghost-voice`)
  for the "voice floating directly ahead" effect
