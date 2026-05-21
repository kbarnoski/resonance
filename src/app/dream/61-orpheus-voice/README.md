# Orpheus Voice Lab — design notes

Route: `/dream/61-orpheus-voice`

## What it is

A three-way TTS comparison tool for the Ghost character voice. Extends `59-gemini-voice-lab` (A/B Gemini comparison) by adding Orpheus TTS as a third variant (C) with a fundamentally different control paradigm: phrase-level XML emotion tags rather than global style direction.

## The core insight

Gemini TTS `style_instructions` is a **sentence-level** direction: you describe the entire voice character as a prose string, and the model applies it uniformly across the whole utterance.

Orpheus TTS uses **word-level** emotional brackets embedded directly in the text:

```
The <reverent>resonance</reverent> here is ancient. Let yourself be <whispers>absorbed</whispers> by it.
```

Each tagged word or phrase gets a distinct emotional register. The untagged words use the model's default. This means a single sentence can have three different emotional colors — something global style_instructions fundamentally cannot do.

## Available Orpheus tags

`<reverent>` `<whispers>` `<sad>` `<fearful>` `<happy>` `<excited>` `<surprised>` `<disgusted>`

## Pre-loaded examples

Each scene's C-column is pre-loaded with an example that uses 1–2 tags chosen to match the Ghost character's emotional arc for that scene:

- **Stone Chamber**: `<reverent>` for the ancient resonance, `<whispers>` for "absorbed" — the word you surrender to
- **Root Portal**: `<fearful>` on "stirs" (the hidden thing), `<whispers>` on "silence" (the absence)
- **Underground Pool**: `<sad>` on "remembers" — the water holds grief
- **Tiny Planet**: `<surprised>` on "wraps" — the horizon's impossible geometry
- **Forest Dawn**: `<happy>` on "together" — the moment of simultaneous arrival
- **Cosmic Ascension**: `<excited>` on "rising" (you are not), `<sad>` on "receding" — the inversion

## API

Server route: `/dream/61-orpheus-voice/api`

- `engine: "gemini"` → `fal-ai/gemini-tts` with `style_instructions`
- `engine: "orpheus"` → `fal-ai/orpheus-tts` with tagged text, voice `leah`

Orpheus voice `leah` is calm and androgynous — chosen to match the Ghost character direction from `56-ghost-voice`. Other options: `dan`, `mia`, `zac`, `jess`, `leo`, `julia`, `will`.

## Interesting experiments

1. **Same line, different scope**: compare A (global "reverent") vs C (only `<reverent>resonance</reverent>`). The tagged version is more surgical — the reverence applies to one word, then the sentence returns to neutral.

2. **Cosmic Ascension B vs C**: B is "utterly flat, zero affect" — a deliberate choice to de-emotionalize the whole sentence. C uses `<excited>` on "rising" (ironic — you're not) and `<sad>` on "receding" — a more complex emotional arc within a single sentence.

3. **Whispers in context**: `<whispers>silence</whispers>` in Root Portal creates a moment of hush that global style can only approximate by making the whole sentence quieter.

## Polish ideas

- Add a fourth variant (D) using Inworld TTS for a three-engine comparison (Gemini, Orpheus, Inworld)
- Add a ConvolverNode post-processing step (same technique as `29-scene-spatial`) for room acoustics — Gemini's `style_instructions` can't add actual stone reverb, but a post-process convolution can
- Export winning style configurations as a JSON file per scene (build a Ghost voice character document over time)
- Add per-word tag highlighting in the C textarea: color the tag names to make the syntax more legible
