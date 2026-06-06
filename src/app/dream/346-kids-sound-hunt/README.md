# 346 · Kids Sound Hunt

**What if a young child could play music with their EARS instead of their eyes — turning their body or phone to *find* singing animals hidden around them in 3-D space, and collecting them into a song?**

This is the lab's **first non-screen / audio-first KIDS piece**. The screen is a dim compass and a soft glow. The experience lives in the ears.

---

## How to play

1. **Put on headphones** (highly recommended — HRTF spatial audio is the whole experience; on speakers it degrades to a softer stereo image, which still works but is less magical).
2. **Tap "▸ Listen for the animals."** On iOS 13+ this is where device-orientation permission is requested and the `AudioContext` is created (both must happen inside the gesture).
3. **Turn your phone / turn your body slowly.** Six animals are hidden around you — owl, frog, bird, whale, cricket, firefly — each singing their own note in D-Dorian. When you face one it gets louder and the compass glows.
4. **Hold still facing it** for about 1.2 seconds. The animal swoops toward you with a happy chime, a sparkle, and a tiny haptic buzz. Or tap the glowing center dot to catch it immediately.
5. When all six are collected, a short D-Dorian melody plays made of their voices, then they bloom together as a chord. No score, no timer, no fail — pure listening adventure.

---

## Technical design

### Audio-first — the screen is secondary

The visual is intentionally **dim**: a warm amber ring, tiny dots for the animals, a soft glow when one is near. All the real information comes through the ears. The screen exists to orient a lost child, not to compete with the audio.

### HRTF spatial engine (`audio.ts`)

Each animal is a `PannerNode { panningModel: "HRTF" }` placed at a fixed world-space position (azimuth + elevation). The listener's heading rotates the `AudioListener` forward vector each frame via `AudioParam` (`forwardX/Z` with legacy `setOrientation` fallback). This means "turning the phone" sweeps the spatial field past the listener's ears.

All audio routes through a **`DynamicsCompressor` brick-wall limiter** (threshold −6 dB, ratio 20:1, attack 1 ms). This is mandatory for a kids piece — it can never blast.

**Animal timbres** (D-Dorian scale, not C-major-pentatonic):
- 🦉 Owl — sine + slow tremolo LFO, lowpass, C4
- 🐸 Frog — triangle with rhythmic AM at 2 Hz, bandpass, G3
- 🐦 Bird — sine with fast warble LFO, lowpass ~2.8 kHz, A4
- 🐋 Whale — sine with very slow FM "moan", deep lowpass, D3
- 🦗 Cricket — triangle with fast square tremolo ~14 Hz, bandpass, D4
- ✨ Firefly — sine + octave + slow pulse AM, lowpass, A3

A quiet always-on **D-Dorian drone** (D2 + A2 fifth) grounds the soundscape.

### Heading / collect state machine (`hunt.ts`)

Each animal has a fixed `azimuthRad` and `elevationRad`. `computeFacing(animal, listenerYaw)` returns a 0–1 "cone" strength within a ±24° half-width. `facingDwell` accumulates while the animal is in cone, bleeds off when not. At 1.2 s dwell, `collectAnimal()` fires: `flyIn()` animates the panner from `PANNER_DIST=3.5 m` to `0.3 m` center over 600 ms, `playCatchChime()` fires a 3-note D5-A4-D5 sparkle, and `vibrate(30)` gives a soft haptic.

### Visual compass (DOM/CSS — no Canvas2D, no SVG)

Per the renderer ban, the compass is built entirely from **divs with CSS transforms, box-shadow, and conic-gradient**:
- The outer ring is a `border-radius:50%` div with a warm amber border.
- Animal dots are positioned with `left`/`top` percentages computed from their azimuth.
- The heading needle is a thin bar inside a rotating div.
- The center dwell arc is a conic-gradient clipped by a radial mask — no canvas required.

### Graceful degradation (all three fallbacks)

| Condition | Behaviour |
|---|---|
| No `deviceorientation` / desktop | Pointer-drag left/right + gentle auto-demo sweeps the heading at one full rotation per 24 s, auto-catching each animal in turn |
| iOS permission denied | `text-rose-300` notice + pointer/auto-demo fallback continues |
| No headphones | Still works — HRTF degrades to stereo image, animals are still spatially distinguishable |
| No Web Audio | `text-rose-300` notice |

The auto-demo feeds the **identical audio path** — the same `applyHeading` → `computeFacing` → `collectAnimal` loop, not a scripted shortcut.

---

## Named references

- **Janet Cardiff — audio walks** (e.g. *Her Long Black Hair*, 2004; *The Forty Part Motet*, 2001). Cardiff's walks demonstrate that sound alone can place you fully in a scene. The animal positions here are "Cardiff animals" — they exist in space, not on screen.

- **Papa Sangre / Audio Defence** (Somethin' Else, 2010–2013). The eyes-free iOS audio games that proved a child-friendly spatial audio game was possible: you navigated a world of pure sound, turning your phone to locate targets. Sound Hunt is in direct lineage — the same "turn to find" mechanic, stripped to its gentlest, most wonder-oriented form.

- **Pauline Oliveros — *Deep Listening*** (1988–). Oliveros' practice asks for attentional, whole-body, ritual listening — hearing the sounds you usually filter out. Sound Hunt asks children for exactly this: to listen *into* the space around them rather than watch a screen. The auto-demo is even called a "listening adventure" internally.

- **308 · Orbit Choir** (this lab, HRTF lineage). Orbit Choir established the HRTF spatial engine pattern (`PannerNode{HRTF}` + `AudioListener` forward-vector rotation + pointer-drag + auto-tour fallback) used here. Sound Hunt inherits and simplifies it, removing the 6-minute arc and the networked audio loading in favour of pure synthesis and an eyes-free collect mechanic. Orbit Choir is an adult piece; Sound Hunt is the first kids non-screen piece in the lab.

---

## Ambition criteria

- **#1 First non-screen / audio-first KIDS piece in the lab.** ✓ The visual is intentionally dim (a compass, not a game screen). All meaningful information is audio. Eyes closed is the ideal play mode.
- **#2 ≥3 subsystems.** ✓ Device-orientation listener + HRTF spatial voice bank (6 animals, each with individual synthesis) + Audio synthesis + brick-wall limiter + DOM/CSS dim compass + dwell/collect state machine + auto-demo fallback. That is 6+ subsystems.
- **#3 Named references cited.** ✓ Cardiff, Papa Sangre/Audio Defence, Oliveros, Orbit Choir (308).

---

## Unverified surface

This prototype was built and reviewed in a sandbox. The following were **not** verified with real hardware, a real child, or real perceptual testing:

- **Actual HRTF localisation quality.** The browser's built-in HRTF (a generic KEMAR dataset) varies significantly by listener head shape. Front/back confusions are common without head movement. Real HRTF perception on a 4-year-old's head with small earphones is unknown.
- **Real device orientation on iOS.** The `DeviceOrientationEvent.requestPermission()` path was written to the spec and the Orbit Choir precedent but not tested on a physical iPhone.
- **A real 4-year-old.** Children this age vary enormously in headphone tolerance, attention span, abstract spatial reasoning, and willingness to "turn to find" something invisible. The 1.2 s dwell time and 24° cone width are design guesses; real playtesting would calibrate both.
- **Haptics.** `navigator.vibrate(30)` is guarded and will silently no-op on iOS (where the Vibration API is not supported) and on devices without vibration motors.
- **Speaker HRTF fallback.** On speakers, the panning will produce audible left/right differences but the elevation and distance cues that make HRTF compelling will not be present.
