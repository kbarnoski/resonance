# 59-gemini-voice-lab — Ghost Voice A/B Style Lab

**Route**: `/dream/59-gemini-voice-lab`  
**Status**: `demoable`  
**Cycle shipped**: 73

## What it does

An A/B comparison tool for Gemini TTS `style_instructions` — the same API used to fix `56-ghost-voice` in Cycle 70. Six Ghost scenes, each with a pre-loaded pair of contrasting style prompts. Edit either textarea, hit Generate, listen, compare, vote.

Votes are stored per scene in localStorage and accumulate across sessions — after a few rounds Karel has an opinion trail.

## Why this is useful

The Ghost's voice is currently Charon + "calm, androgynous, very slow, low pitch" per scene. That's a starting point, not a final answer. The right voice character should be:

- Recognizable across all six scenes (same "person" in different spaces)
- Tonally matched to each scene's emotional register without being melodramatic
- Interesting to listen to repeatedly (like a good audiobook narrator, not a digital assistant)

A/B testing surfaces the **axis that matters most per scene**: for Stone Chamber that might be pace (slow vs. very slow) or affect (measured vs. reverent). For Cosmic Ascension it might be distance (intimate vs. infinite). A slider doesn't tell you which axis matters; side-by-side comparison does.

## Design notes

### The test pairs

Each scene's B variant is deliberately opposite to A along one salient axis:

| Scene | A axis | B axis |
|-------|--------|--------|
| Stone Chamber | formal/solemn | whispered/intimate |
| Root Portal | mysterious/slow | weighted/deliberate pauses |
| Underground Pool | meditative/clear | ethereal/dissolving |
| Tiny Planet | vast/breathy | small/wondering |
| Forest Dawn | peaceful/grateful | reverent/unhurried |
| Cosmic Ascension | transcendent/vast | zero-affect/infinite distance |

### The voice (Charon)

Both variants use "Charon" — a calm, measured voice. The style_instructions change the affect, pace, and implied space, but not the underlying voice model. If Karel wants to test voice names (Zephyr, Puck, etc.), the API route accepts an optional `voice` parameter.

### What style_instructions actually controls

Based on testing in 56-ghost-voice: Gemini TTS honors tempo descriptors ("very slow", "measured", "breathy"), affect words ("reverent", "wondering", "flat"), and spatial/reverb language ("stone chamber", "vast space") as speaking style rather than acoustic space — you get the voice quality of someone who sounds like they're in that space, not actual room acoustics. To add true room reverb, apply a ConvolverNode with a per-scene impulse response after playback (same technique as `29-scene-spatial`).

### Waveform display

The per-variant waveform is drawn by peak-sampling the decoded `AudioBuffer` channel 0 across canvas columns. Duration is shown in the header. The waveform gives a quick visual check that the generation was audible (flat waveform = TTS failed or was nearly silent). Gemini TTS typically generates 3–7 second clips for these line lengths.

## Polish ideas

1. **A/B replay race**: one button that plays A, then immediately plays B after A ends — easier to compare closely.
2. **Export winning style**: show the winning `style_instructions` as a copyable string formatted as a Go constant.
3. **Voice selector**: add a small dropdown per variant to test different Gemini voices (Zephyr, Puck, Charon, etc.) side by side.
4. **Add room acoustics**: after the vote result, show a "version with reverb" button that runs the winning audio through a ConvolverNode impulse response matched to the scene.
5. **Blind mode**: hide the style_instructions textareas during listening so Karel evaluates purely by sound.
