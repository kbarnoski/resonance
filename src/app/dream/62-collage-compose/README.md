# collage-compose — design notes

Route: `/dream/62-collage-compose`  
Cycle: 77  
Status: demoable

## What question does this answer?

"What if Resonance could compose from three things at once — where you are (the scene), how you feel (the mood), and what you're playing (your melody)?"

Most generation prototypes give the model one input: a text prompt (`6-compose`), a melody (`44-vocal-bgm`), or a scene image (`57-sound-to-image`). This prototype treats all three as separate creative channels and combines them into a single ACE-Step prompt. The result should be more precise than any one input alone — the scene sets the *place*, the mood sets the *arc*, the melody sets the *melodic seed*.

## Inspired by

**Mozualization** (CHI 2025) — the paper demonstrated that multimodal music generation from image + audio + keyword produces outputs with higher semantic alignment than text-only prompting. The specific finding: keyword narrows the broad semantic space that images and audio alone can't constrain. This prototype is a browser-native interpretation: instead of sending image data to the model (ACE-Step is audio-only), we extract semantic information from each channel and compose it into a rich text prompt.

## How the three inputs combine

| Input | What it contributes | Extraction method |
|---|---|---|
| Ghost scene | Sonic environment: reverb type, instruments, spatial character | Hardcoded per-scene tag string (Stone Chamber → long stone reverb, sparse piano) |
| Mood word | Emotional arc: tempo, tension, brightness | Direct string injection |
| Hum (optional) | Melodic contour: amplitude + spectral character | Amplitude + spectral brightness ratio from raw sample analysis |

The contour descriptor uses spectral brightness (ratio of high-frequency differential energy to total energy) as a proxy for tonal character. It produces strings like "soft bass-warm melodic reference" or "expressive bright-treble melodic reference" — rough but meaningful constraints for ACE-Step.

## Two generation paths

- **With hum**: `fal-ai/ace-step/audio-to-audio` — ACE-Step hears the actual melody contour in the audio, not just its text description. The melodic contour from the hum is literally inside the model's input. This is qualitatively different from text-only.
- **Without hum**: `fal-ai/ace-step` — text-to-audio with a rich multi-part prompt. Still better than a single-line description because scene + mood together constrain the semantic space more than either alone.

The footer shows which path was used (it updates live based on whether a hum was captured).

## What to try

1. **Scene only**: pick Cosmic Ascension + vast → Compose. Should produce orchestral, transcendent music.
2. **Mood flip**: same scene (Forest Dawn), switch mood from meditative to tense. The generated pieces should feel structurally different despite the same environment.
3. **With hum**: record yourself humming a slow descending melody (like a falling phrase), then pick Stone Chamber + melancholic. ACE-Step should reflect the descending contour in the output.
4. **Hum into the wrong mood**: record a fast bright ascending phrase, then pick calm + meditative. Hear how the model resolves the tension between an energetic input and a relaxed prompt.

## Limitations / polish ideas

- The hum contour descriptor is coarse (amplitude + spectral brightness only, no pitch tracking). Adding autocorrelation pitch detection would give "descending melody around C4" instead of "soft balanced melodic reference" — more precise melodic seed. Deferred to avoid a complex build.
- No download button for the generated track. Straightforward to add (same pattern as `48-arc-compose`).
- The scene tags are static. A future version could let Karel edit the scene tags directly (treating them as a `textarea` like `48-arc-compose`'s arc input), making this a fully freeform three-channel collage editor.
- ACE-Step endpoint: `fal-ai/ace-step/audio-to-audio` is based on naming conventions from the ACE-Step 1.5 release. If it returns an error, paste the raw error text and the agent fixes it next cycle.
