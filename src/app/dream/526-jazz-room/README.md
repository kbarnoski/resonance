# 526 — Jazz Room

**The ONE question it answers:** What if Resonance had a journey-engine in the language of a late-night jazz trio — an autonomous generative combo that plays a real arc (head → trading solos → return), with you free to sit in?

---

## What It Is

A living, self-playing jazz trio — walking upright bass, rootless piano comping, and brushed drums — that performs a complete jazz arc over an F Jazz Blues 12-bar form. The trio plays autonomously from the moment you press Start; no interaction required. You can optionally "sit in" by tapping keys from the F Blues scale on-screen.

The prototype is **Resonance's first jazz piece** and presents an alternate dramatic arc to the existing psychedelic 6-phase engine: warm, swinging, intimate, noir.

---

## How to Use

1. Press **"Start the Trio"** — the trio begins within ~1 second
2. Watch the three glowing presences pulse as the bass, piano, and drums play
3. The chord name and current phase are displayed on the canvas and in the header
4. **Sit in**: tap any key in the "F Blues Scale" pad — your notes play as a flute-ish melody voice on top
5. The arc runs: **Head → Piano Solo → Bass Solo → Trading Fours → Head Out** — approximately 5–7 minutes total
6. The tempo subtly shifts per phase (trading fours plays hotter; bass solo breathes more)

---

## The Arc (State Machine)

| Phase       | Choruses | What Happens                                           |
|-------------|----------|--------------------------------------------------------|
| Head        | 1        | Full trio + bebop head melody; establishing groove     |
| Piano Solo  | 2        | Piano takes over with bebop motifs; bass/drums support |
| Bass Solo   | 1        | Bass arpeggios the changes; piano drops to light comp  |
| Trade Fours | 2        | Piano + drums alternate 4-bar phrases; full energy     |
| Head Out    | 1        | Return to head melody; full trio; final resolution     |

---

## Subsystems

### `jazz.ts` — Theory Engine
- **F Jazz Blues chord form** (12 bars): F7–Bb7–F7–F7–Bb7–Bb7–F7–D7–Gm7–C7–F7–C7
- **Bill Evans Type A/B rootless voicings**: Type A = 3–7–9 (3rd on bottom); Type B = 7–9–3 (7th on bottom). Smooth voice-leading between consecutive voicings minimises total voice motion.
- **Walking bass generator**: beat 1 = root; beat 2 = 5th; beat 3 = 3rd; beat 4 = chromatic approach to next bar's root (±1 semitone)
- **Swing timing**: `swingTime(beat, eighth, bpm)` — long eighth ≈ 2/3 of beat, short eighth ≈ 1/3 (ratio 2:1)
- **Head melody**: hand-crafted 12-bar bebop head outlining the changes
- **Piano solo motifs**: 5 pre-composed bebop patterns (ascending phrase, call-response, upper-structure run, sparse blues, chromatic sneak) transposed to each bar's root

### `audio.ts` — Web Audio Synthesis
- **Lookahead scheduler**: `setInterval(25ms)` schedules ahead by `audioCtx.currentTime + 0.12s` — tight, drift-free timing
- **Walking bass**: triangle + sawtooth blend → lowpass filter → plucked-string envelope (fast attack, exponential decay)
- **Piano comping**: FM synthesis (carrier + modulator at 7× frequency for Rhodes bell partial) → bell envelope with sustain tail
- **Brushed drums**: noise buffer → highpass (hi-hat) / bandpass (snare brush) → fast decay envelope; soft kick = sine sweep 120→45 Hz; ride = decaying noise burst → highpass
- **Melody voice**: stacked sines (fundamental + 2nd harmonic) → lowpass → smooth envelope
- **User "sit-in"**: triangle oscillator → lowpass → breathy envelope
- **DynamicsCompressor** brick-wall limiter on master: threshold −6 dB, ratio 20:1, attack 1ms

### `page.tsx` — Visual + UI
- **Canvas2D** renders: deep brown-black radial gradient background, warm amber/sepia spotlight from above, perspective floor lines, three glowing presences (bass/piano/drums) that pulse on note onsets with ring radiations, drifting smoke/particle system (ambient + note-triggered), chord/phase HUD, beat flash border
- Visual runs from first paint; hands-free view at any time shows a swinging, glowing scene
- Phase arc indicator shows which phase is active
- Sit-in keyboard: 9 keys covering F blues scale + guide tones across two octaves

---

## Named References

**Bill Evans' rootless left-hand voicings** — the "Type A / Type B" shell voicings pioneered by Bill Evans (and documented by theorists including Mark Levine in *The Jazz Piano Book*) form the backbone of the piano comping. Type A places the 3rd on the bottom (3–7–9); Type B places the 7th on the bottom (7–9–3). These voicings create smooth contrary motion between successive chords because moving from A to B on any chord moves all voices by small intervals, and the bass player's root note fills in the harmonic foundation.

**Jamey Aebersold play-along tradition** — the idea of a recorded rhythm section that plays the changes autonomously while you practice soloing. This prototype is the digital equivalent: a generative Aebersold track that never repeats exactly, plays a full performance arc, and invites you to sit in at any moment.

---

## Design Notes

- **Palette**: warm amber `#d4a855`, deep sepia, brown-black `#080504` — smoky late-night jazz club
- **No npm dependencies** beyond the Next.js project itself
- **No API routes, no mic/camera/network** — pure client-side Web Audio + Canvas2D
- **iOS compatibility**: `AudioContext` created inside the Start button click handler for browser unlock
- **Temporal density shifts per phase**: piano activity, bass activity, and drums activity are parameterised per phase so minute 3 ≠ minute 1

---

## Unverified Surface (cannot run a browser)

- The FM synthesis ratio for the Rhodes-ish piano may need tuning; 7× frequency modulation is a reasonable starting point but the exact timbre depends on the `modGain` depth parameter
- The swing timing ratio of 2:1 is mathematically correct but the "feel" at 132 BPM may need micro-adjustment (jazz swing is approximately 2:1 but players often shade it)
- iOS Safari AudioContext unlock: the click handler approach is correct per spec, but some older iOS Safari versions require `ctx.resume()` explicitly after creation
- The `chooseSmoothVoicing` voice-leading distance metric uses note index rather than actual voice assignment — a strict voice-leading implementation would track soprano/alto/tenor across bars
- Particle count cap (120) may still cause jank on low-powered devices; reducing to 60 is a safe fallback
- The `DynamicsCompressor` parameters (threshold −6 dB, ratio 20:1) prevent clipping but may colour the sound; a gentler limiter (ratio 10:1, threshold −3 dB) might sound more natural
- `canvas.getContext("2d")` scaled by `devicePixelRatio` — the `ctx2d.scale()` call after resize may compound on repeated resize events (should `ctx2d.resetTransform()` first)
