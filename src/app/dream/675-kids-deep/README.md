# 675 · Deep Drum

## The one question
**"What if the ground under a kid's drumming slowly changed key — so the same beat felt brave, then mysterious, then home?"**

## How to play
1. Tap **Start** (creates + resumes the AudioContext — required by iOS).
2. A gentle ~2-second auto-demo taps a couple of stones so a silent glance shows it alive.
3. Tap the six big glowing stones to play notes. Multi-touch is fine.
4. Desktop fallback: keys **A S D F G H** play the six stones.
5. Just listen: the deep hum keeps sliding underneath, never silent.

There is no "wrong", no fail state, no scary transient. Tense moments are gentle and beautiful.

## The harmonic mechanism — pedal/drone migration + functional recontextualization
The six stones play **fixed pitches** that never change (A2, C3, E3, A3, C4, E4).

Underneath them, a sustained **drone/pedal voice migrates its tonal center** through a heroic-modal cycle — **i → ♭VI → ♭VII → i** over a low pedal — gliding to a new root roughly every **18 seconds** (smoothstep glide, no jump).

Because the stones stay fixed while the root moves, **each stone's relationship to the drone changes over time**. A tap that sounded *home* (e.g. a unison/fifth against the current root) becomes *tense* (a 2nd or tritone) as the floor slides, then *resolves* back. This is the harmonic event: the child hears the harmony move under a **constant action**. This is **functional recontextualization** — the same note, re-heard against a new root, takes on a new function.

This deliberately **does not** use a pentatonic / "no-wrong-notes" scale-snap. The whole point is that the function of the same fixed note changes as the floor shifts.

The visuals make the current key legible: the deep's color and motion shift with the drone's root (bioluminescent blues/teals/violets, drifting toward **warm amber only at the home resolution**). Each stone tints from teal toward violet as its current tension rises, so the child also *sees* the same pad change meaning.

## Named reference
The Indian classical **tanpura** drone: a constant sustained pedal (typically the tonic and its fifth) over which every melodic note gains its meaning. In Hindustani and Carnatic music the tanpura's unchanging drone is the reference against which a raga's notes are felt as stable or leaning — exactly the relationship this prototype animates, except here we move the drone instead of the melody.

## Tags
- **INPUT:** touch — big glowing stone pads (generously spaced, ≥64px targets). Pointer + keyboard fallback (A S D F G H).
- **OUTPUT:** raw WebGL2 (GLSL ES 3.00 full-screen fragment shader) — a glowing deep ocean abyss whose color/motion shift with the drone's key. NOT Canvas2D.
- **CORE TECHNIQUE:** pedal/drone migration + functional recontextualization (fixed pads, moving root). Slow drone-voice synth + struck mallet/pad synth.
- **PALETTE / VIBE:** deep oceanic / cavernous mystery — bioluminescent blues/teals/violets, warm amber only at "home". Adventurous / awe.

## WebGL2 fallback note
If `webgl2` context creation (or shader compile/link) fails, the renderer returns `null` and the page shows a `text-rose-300` notice. **The audio still works** — the drone keeps migrating and the stones still sound; play with keys A S D F G H.

## Files
- `page.tsx` — UI, pad layout, input (pointer + keyboard), auto-demo, rAF loop driving drone migration + GL, fallback notice.
- `audio.ts` — Web Audio engine: migrating drone voice + struck mallet voice, kid-safe master chain (lowpass 7.5kHz → compressor → destination), rate-limiting, cleanup.
- `harmony.ts` — fixed pad pitches, the i–♭VI–♭VII–i drone cycle, root interpolation, and the functional-tension map.
- `gl.ts` — raw WebGL2 setup + GLSL ES 3.00 fragment shader for the deep + glowing stones.

## Kid-safe audio chain
`masterGain → BiquadFilter lowpass ~7.5kHz → DynamicsCompressor(threshold −16, knee 6, ratio 12, attack 3ms) → destination`. Gains capped, triggers rate-limited (~40ms global), context created/resumed on the Start gesture.
