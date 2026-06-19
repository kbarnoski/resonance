**For**: kids (4+)

## Hook

Say any word out loud — "banana," "sunshine," "hello" — and watch the rainbow xylophone come alive. Each letter in your word lights up a coloured bar, plays a note, and bounces onto the screen as a big colourful letter. The word becomes a looping musical riff that joins a gentle groove. Say more words and build a little band.

## How to use

1. Tap **START** — this creates the AudioContext (required for iOS Safari) and begins listening.
2. **Say a word** — the Web Speech API recognises it, maps each letter to a xylophone bar, and plays the riff immediately.
3. Watch the rainbow bars light up in sequence, and the word's letters tumble in as big bouncing coloured type.
4. Say another word — it joins the groove. Up to 4 word-loops play simultaneously (the oldest drops when a fifth arrives).
5. A white sparkle dot tracks the playhead position across the loop.
6. If you go quiet for ~3 seconds the **auto-demo** takes over, cycling through happy words (banana → sunshine → hello → rainbow → happy → music → butterfly → orange) every 2.5 seconds so the piece is always showing and sounding. Real input stops it; 5 seconds of silence restarts it.

## Letter → Note mapping table

The xylophone has 8 bars covering C-major pentatonic across two octaves:

| Bar | Colour   | Note | MIDI |
|-----|----------|------|------|
| 1   | Red      | C4   | 60   |
| 2   | Orange   | D4   | 62   |
| 3   | Yellow   | E4   | 64   |
| 4   | Green    | G4   | 67   |
| 5   | Cyan     | A4   | 69   |
| 6   | Blue     | C5   | 72   |
| 7   | Violet   | D5   | 74   |
| 8   | Pink     | E5   | 76   |

Letter assignments (stable, so the same word always plays the same riff):

- **Vowels** are spread across the scale for melodic variety: a→C4, e→E4, i→A4, o→C5, u→G4
- **Consonants** fill the remaining degrees with a stable alphabetic spread

Because every note is pentatonic, nothing can sound wrong — every combination of letters makes a pleasant riff.

## Fallback / tap keyboard

If speech recognition is unavailable (Firefox, incognito, mic denied) a large tap keyboard appears showing all 26 letters, each tinted in its bar's colour. Tap letters to spell a word, then hit **PLAY ▶** to hear the exact same riff. Fully musical with zero microphone. A friendly `text-rose-300` notice tells the child "Tap the letters to play!" — never a dead end.

## Auto-demo

If no input arrives within ~3 seconds of pressing START, a ghost voice cycles through eight seeded happy words every 2.5 seconds so a hands-off glance both sees the bouncing letters and hears the riffs building into a groove. The demo cancels the moment real input (speech or tap) arrives, and resumes after 5 seconds of silence.

## Audio design

- **Chain**: voices → masterGain (0.28, ≤ 0.3) → BiquadFilter lowpass (7000 Hz, ≤ 7500) → DynamicsCompressor (−10 dB threshold, 20:1 ratio, brick-wall limiter) → destination
- **Timbre**: triangle fundamental + soft 2× sine partial + very soft 4× sine partial, percussive envelope (12 ms attack, exponential decay) — warm mallet/marimba feel
- **Ambient pad**: C2 + G2 sine drones at gain 0.018, fade in over 2 s from first gesture
- **Scheduler**: 25 ms interval, 120 ms lookahead (Chris Wilson pattern). Each loop tracks `nextSchedTime` to prevent double-scheduling — the first pass is immediate, every repeat is pump-scheduled

## SVG/DOM-only rendering (the deliberate constraint)

No `<canvas>`. No WebGL. No WebGPU. Every visual — the rainbow xylophone bars, the bouncing letter clouds, the playhead sparkle, the bar highlights and drop-shadows — is a plain SVG element or a CSS-animated DOM node. The deliberate point: the idea carries with zero GPU renderer. This makes it maximally portable (works in any browser, including minimal webviews, screen readers can overlay the SVG), and proves that the phonetic-riff concept is strong enough to not need visual fireworks.

## Named references

- **Incredibox** — the "build a band by adding elements" groove mechanic
- **Xylophone / marimba kids-music apps** (Toca Band, Sago Mini Music Box) — the bigger-bar-means-lower-note visual convention; child-safe pentatonic-only palette
- **Web Speech API** — the headline interaction; continuous recognition with auto-restart
- **Chris Wilson look-ahead scheduler** (2013 Web Audio articles) — the `nextSchedTime` pump pattern for glitch-free scheduling

## Lineage note

Speech recognition appears in two adult lab pieces: **570-spoken-spell** (phoneme → pitch mapping in a dark fluid visual) and **189-voice-scene** (spoken words trigger ambient scenes). Neither is a kids piece, and neither uses the letter → xylophone-bar → melodic-riff mapping. **752-kids-word-band** is the first kids speech piece in the lab, and the first anywhere to turn a spelled-out word directly into a bouncing pentatonic xylophone riff with matching coloured type.
