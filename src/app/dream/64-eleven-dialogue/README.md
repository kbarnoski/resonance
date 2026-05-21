# Eleven Dialogue — design notes

Route: `/dream/64-eleven-dialogue` · Cycle 80 · 2026-05-21

## What question this answers

"What if the Ghost had someone to speak to?"

Every prior Ghost voice prototype is a monologue: one line, one voice, one character. This one
writes a scene. Ghost + Visitor — two distinct voices in a three-line dramatic exchange, each
shaped by ElevenLabs V3's inline audio tag system.

## The ElevenLabs V3 difference

V3 introduces bracketed inline tags inserted mid-sentence as emotional beats:

```
[slowly, reverently] The resonance here [pauses] is ancient.
[whispers] Everything that ever sounded here — still does. [pauses] If you know how to listen.
```

This is different from:
- **Gemini TTS** (`56-ghost-voice`): global `style_instructions` (whole-passage direction)
- **Orpheus TTS** (`61-orpheus-voice`): per-word XML `<tag>word</tag>` syntax
- **Eleven V3**: per-phrase inline tags that work as structural beats mid-sentence

The within-sentence arc — "The resonance here [pause] is ancient" — is qualitatively different
from applying a global "slow and reverential" style. The pause IS the acting.

## Architecture

Three separate API calls (one per speaker turn), sequential playback.

- Ghost voice: Adam (deep, measured narrator quality)
- Visitor voice: Alice (lighter, questioning quality)
- Each call hits `fal-ai/elevenlabs/tts/eleven-v3` with the line text

The multi-speaker Text-to-Dialogue API (single call for all three lines) would be
more elegant, but separate calls are more debuggable and let the visual show each
line arriving one by one.

## The visual

Two speaker orbs on a shared canvas — Ghost (warm amber, left) and Visitor (cool blue, right).
The inactive speaker breathes softly; the active speaker pulses with amplitude data and sends
out an expanding ring. A subtle vertical divider separates the two characters.

The orb design is deliberately low-information: you're meant to be listening. The visual
tells you who's speaking, not what they're saying.

## What to try

1. **Stone Chamber** is the most dramatic — "if you know how to listen" as a [whispers] line
   with a [pauses] before it is the most effective combination of V3 tag + subject matter.

2. **Cosmic Ascension** is the most minimal — two very short lines followed by one oracular line.
   "You never left. [long pause] That is the secret." The long pause is real.

3. **Edit the script** (the ✏ toggle): try removing the tags entirely (just text) vs. dense tags.
   Hear the difference. Then try the same line spoken by the Visitor instead of the Ghost.

4. Common V3 tags that work well: `[whispers]`, `[pauses]`, `[softly]`, `[slowly]`, `[awed]`,
   `[sighs]`, `[resigned tone]`, `[flatly]`, `[breathless]`, `[nervous]`.

## API endpoint note

Endpoint `fal-ai/elevenlabs/tts/eleven-v3` is from RESEARCH.md §127 (naming-convention
best-guess). If the endpoint is wrong, the UI shows the raw API error. Fix: update the
endpoint string in `api/route.ts` per Karel's report and try again.

## Polish ideas for future cycles

- Try the single-call multi-speaker Text-to-Dialogue API when it's confirmed on fal.ai
- HRTF spatial positioning: Ghost from front-center, Visitor slightly off-angle (same
  approach as `56-ghost-voice`'s PannerNode)
- A "write your own scene" textarea that generates new dialogue from a topic prompt
- Ghost journal entry mode: Ghost monologue + Visitor reaction in the same canvas
