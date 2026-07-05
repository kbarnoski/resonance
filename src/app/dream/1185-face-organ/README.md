# 1185 · Face Organ

**Sing a shimmering choir with your face — hands-free, no keys.** Open your mouth and a formant vocal synth sings; your expressions shape the vowels, pitch and dynamics.

## How to use it

1. Press **Start camera · sing** and allow the webcam (everything runs locally in your browser — nothing is recorded or sent anywhere). Use headphones.
2. **Open your mouth** — the choir sings. Mouth closed = silence.
3. **Smile or pucker** to morph the vowel from /u/ → /o/ → /a/ → /e/ → /i/.
4. **Raise your brows** to climb a bright pentatonic scale (about an octave).
5. **Tilt your head** to pan the choir left/right and bend the pitch.
6. **Blink** (both eyes) for a soft accent + vibrato swell.

No camera? Press **No camera — use vowel pads** (or let the graceful fallback kick in): hold a vowel pad (U O A E I) to sing, drag the **pitch** slider, and tap **Shimmer** for the accent. It drives the *same* formant engine.

## Mapping: blendshape → sound

| Facial signal (MediaPipe blendshape / geometry) | Musical parameter |
| --- | --- |
| `jawOpen` | Master gate + loudness, and vowel openness (raises formant F1) |
| `mouthSmileLeft` + `mouthSmileRight` ↔ `mouthPucker` | Vowel front/back axis (formant F2): /u/ ↔ /o/ ↔ /a/ ↔ /e/ ↔ /i/ |
| `browInnerUp` + `browOuterUpLeft` + `browOuterUpRight` | Pitch, quantised to a major-pentatonic scale (~1 octave) |
| Head roll (from outer eye-corner landmarks 33 / 263) | Stereo pan + gentle pitch bend |
| `eyeBlinkLeft` + `eyeBlinkRight` (a real, both-eye blink) | Soft percussive accent + vibrato-depth swell |

## Technique — formant vocal synthesis

Each choir voice is a glottal source — a `sawtooth` oscillator (rich in harmonics) plus a whisper of breath noise — fed through **three parallel `BiquadFilterNode` bandpasses** tuned to the first three formant frequencies F1/F2/F3. Sweeping those centre frequencies (`setTargetAtTime`) between vowel targets turns the raw buzz into recognisable sung vowels. Vowel targets use the classic **Peterson & Barney (1952)** vowel-formant measurements, e.g. /u/ ≈ (300, 870, 2240), /o/ ≈ (500, 1000, 2500), /a/ ≈ (730, 1090, 2440), /e/ ≈ (530, 1840, 2480), /i/ ≈ (270, 2290, 3010) Hz.

A small unison stack of slightly detuned voices plus a shared vibrato LFO gives the choral shimmer. A `DynamicsCompressor` limiter and a conservative, ramped master gain sit before the destination.

**Reference:** G. E. Peterson & H. L. Barney, "Control Methods Used in a Study of the Vowels," *JASA* 24(2), 1952.
**Inspiration:** the facial-performance instruments of **Zach Lieberman** and **Daito Manabe**.

## Fallback behaviour

If the camera is denied, unavailable, or MediaPipe fails to load, the prototype shows the failure reason in rose text and switches to on-screen **vowel pads + pitch slider + shimmer** that drive the identical formant engine, with a stylised glowing face that opens its mouth to the gate. It always makes both sound and visuals — never a blank page.

## Safety & lifecycle

Audio is gesture-gated (starts only on a button press). All luminance motion is slow / expression-driven (≤3 Hz, no strobe). On unmount everything is torn down: rAF cancelled, oscillators stopped, FaceLandmarker closed, MediaStream tracks stopped, AudioContext closed.

## Tags

- **INPUT:** camera face-blendshape-tracking (MediaPipe FaceLandmarker, CDN, VIDEO mode)
- **OUTPUT:** canvas luminous face-mask
- **TECHNIQUE:** formant vocal synthesis driven by facial blendshapes
- **PALETTE:** bright high-key (ivory / gold / rose)
- **VIBE:** performative
