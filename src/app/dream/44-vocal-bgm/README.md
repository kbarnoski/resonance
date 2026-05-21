# vocal-bgm — design notes

**Route**: `/dream/44-vocal-bgm`  
**Cycle**: 52  
**Question**: What if you could hum a melody and have a full band play it back?

---

## What it does

Record 5–15 seconds of humming, singing, or piano via mic. Choose an arrangement
style (jazz trio / ambient / cinematic / rock / folk). Click "Arrange →". ACE-Step 1.5
on fal.ai receives your audio and generates a 30-second full-band arrangement where
your melodic contour is the lead motif.

**Cost**: $0.006/generation. **FAL_KEY already in use** from `43-stable-extend`.

---

## How it differs from other audio-AI prototypes

| Prototype | What AI does |
|-----------|--------------|
| `6-compose` | Text prompt → music from scratch |
| `14-reference-compose` | Your recording → style-matched continuation |
| `43-stable-extend` | Your recording → seamless forward continuation |
| **`44-vocal-bgm`** | **Your melody → full band arrangement around it** |

The key difference from `stable-extend`: the AI doesn't add more audio *after* your
recording ends. It treats your melodic phrase as the lead voice and constructs drums,
bass, chords, and accompaniment *underneath* it. Your hummed melody is preserved as
the primary line.

---

## API

**Endpoint**: `fal-ai/ace-step/audio-to-audio`  
**Model**: ACE-Step 1.5 (April 2026)  
**Parameters**:
- `audio_url`: your uploaded recording (fal.storage)
- `lyrics`: `"[inst]"` — instrumental mode (no AI vocal generation)
- `tags`: genre/style description (e.g. "jazz piano trio, warm, acoustic, 70 BPM")
- `duration`: 30 seconds

The `[inst]` lyrics tag tells ACE-Step to treat the input audio as the melodic/vocal
line and construct only instrumental accompaniment. Without it, the model may try to
add lyrics on top of your recording.

---

## Architecture

```
MediaRecorder (mic) → Blob → FormData → POST /dream/44-vocal-bgm/api
                                                ↓
                                    fal.storage.upload → public URL
                                                ↓
                                  fal-ai/ace-step/audio-to-audio
                                         (lyrics=[inst], tags=genre)
                                                ↓
                                          30s MP3 URL
                                                ↓
                         AudioBufferSourceNode → AnalyserNode → destination
                                                         ↓
                                              6-band radial bloom (1-live palette)
```

The server route (`/dream/44-vocal-bgm/api`) handles:
1. Uploading the audio blob to fal.storage
2. Calling ACE-Step with the storage URL
3. Returning the output URL to the client

The FAL_KEY is never exposed to the browser.

---

## Visual design

- **Waveform strip**: amber bars (your melody, left) | blue bars (arrangement, right)
  separated by a faint white divider. Same peak-amplitude encoding as `43-stable-extend`.
- **Bloom visualizer**: the 6-band radial visualizer from `1-live` drives playback
  visualization. Sub-bass (violet/indigo) through high-freq (magenta). The arrangement
  plays through the same visual system you'd see with live mic input.

---

## Polish ideas (future cycles)

1. **Waveform alignment**: overlay your recording on the left third of the arrangement
   waveform (the arrangement starts before the AI adds its parts). Currently shown
   separately.
2. **Key/mode selector**: hint to ACE-Step whether the melody is major/minor. Currently
   inferred from the audio — minor melodies sometimes get major arrangements.
3. **Regenerate variation**: keep your recording, re-call the API with a different seed
   for a different arrangement of the same melody.
4. **Download both**: separate download buttons for your original melody and the full
   arrangement WAV.
5. **Genre blend**: two genres with a slider (60% jazz + 40% cinematic) — maps to the
   embedding arithmetic insight from Composer Vector (RESEARCH.md §79).
