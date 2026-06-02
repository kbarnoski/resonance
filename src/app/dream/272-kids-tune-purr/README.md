**For**: kids (3+)

# 272 · Kids Tune Purr

A contemplative, calming audio-visual toy for ages 3–5 (iPad/mobile, touch-only, no reading required) that teaches musical consonance and tension-release through embodied play. The core question: **what if a 4-year-old could FEEL when two notes lock into tune — by sliding a wobbly creature until its wobble stops?**

---

## Concept

A warm drone hums continuously (A2, 110 Hz). Three round, sleepy "hummer" creatures float on a matte deep-dusk background. Each creature hums a tone that starts slightly out of tune with a pure just-intonation interval against the drone — the child hears and sees audible "beating," a gentle rhythmic wobble. Dragging a creature up or down changes its pitch in real time. As the pitch approaches the pure ratio, the beat rate slows from a fast shimmer to a slow sway to nothing. At the moment of lock (within ±6 cents), the creature snaps into tune, stops shivering, opens its eyes, smiles, and begins a soft contented purr tone. When all three lock simultaneously, a gentle ring-wave celebration plays. If a child drags a creature out of tune, the wobble returns. No score, no failure, infinite play.

---

## Just-Intonation Ratio Table

| Creature | Color | Interval | Ratio | Target Hz (against 110 Hz drone) | Start Hz | Initial Beat |
|----------|-------|----------|-------|----------------------------------|----------|--------------|
| 0 | Dusty clay / terracotta (#c8a07a) | Unison | 1:1 | 110.000 Hz | 116.500 Hz | **6.5 Hz** (distinct tremolo) |
| 1 | Sage green (#8fb89a) | Major third | 5:4 | 137.500 Hz | 143.000 Hz | **5.5 Hz** (medium flutter) |
| 2 | Dusty blue (#8aabe0) | Perfect fifth | 3:2 | 165.000 Hz | 172.000 Hz | **7.0 Hz** (fastest roughness) |

**Beat frequency math**: when Creature 0 is at 116.5 Hz and the drone is at 110 Hz, the acoustic interference produces amplitude oscillation at Δf = |116.5 − 110| = **6.5 Hz**. This is a direct consequence of constructive/destructive interference between the two sinusoids. As the child drags the creature closer to 110 Hz, Δf decreases continuously. Within ±6 cents (~±0.38 Hz at 110 Hz), the creature locks. The three locked tones form a **pure just-intonation major triad**: 110 : 137.5 : 165 = **4:5:6** (an octave-equivalent voicing of the 1:5/4:3/2 triad).

The intervals were chosen deliberately: unison, major third, and perfect fifth together form the most consonant possible three-voice chord, exactly the overtone series ratios 4:5:6. They are **not** pentatonic scale degrees — they are just ratios against a drone.

---

## Sound Design

**NO pentatonic scale.** All tones are pure just-intonation intervals against the drone.

- **Drone** (A2 = 110 Hz): sine wave + soft octave partial at 28% gain. Fades in over ~2 seconds after first touch via `setTargetAtTime`. Never silent during play.
- **Creature tones**: each creature has a primary sine oscillator + a soft second partial (octave, 18% level) for warmth. The combination produces a soft, rounded timbre similar to a bowed glass rim or a distant horn.
- **Beat reinforcement AM**: a secondary LFO oscillator runs at the current beat frequency and modulates the creature's gain node via ±18% AM (amplitude modulation). This reinforces the perceptual beat without introducing any extra partials. The acoustic beating (interference between creature tone and drone) is the primary effect; the AM is a subtle psychoacoustic amplifier.
- **Lock behavior**: on lock, `lfoGain.gain` is faded to 0 via `setTargetAtTime` (time constant 0.12 s), silencing the AM. The creature oscillator snaps to the pure ratio frequency. A separate "purr" oscillator starts — a sine pitched at 1.5× the locked frequency + 1 Hz shimmer, fading in at 9% gain over 0.4 s.
- **All clicks avoided**: every parameter change uses `setTargetAtTime` (exponential approach). Attack envelope time constant ≥ 0.04 s.
- **Safe for toddlers**: peak gain ~0.22 per creature + 0.18 drone. No sharp transients. No frequencies above 350 Hz. Overall headphone-safe level.

---

## Visual Mapping

| Audio state | Visual state |
|-------------|-------------|
| Beat frequency 5–8 Hz (far from lock) | Creature jiters rapidly: ±10 px shiver at beat frequency, squiggly eye arcs wiggle |
| Beat frequency 1–3 Hz (near lock) | Slow, gentle sway; eyes still closed but calmer |
| Locked (0 Hz beat) | Creature perfectly still; eyes open (white sclera + dark pupil); smile arc; ↕ indicator hidden |
| All 3 locked | Four concentric matte rings expand from center at 0.4 Hz, max opacity 14%; "♪ in tune ♪" fades in |

**Palette** (all matte, no neon, no additive blending):
- Background: `#2a2018` (warm deep dusk brown)
- Creature 0: `#c8a07a` terracotta
- Creature 1: `#8fb89a` sage
- Creature 2: `#8aabe0` dusty blue
- Drop shadows: `darkColor + 55` (hex alpha), offset 4 px, blur 12 px — true shadow, not glow
- Celebration rings: `rgba(180,190,160,α)` — desaturated warm grey-green

All canvas shadow operations use `shadowBlur` and `shadowOffsetY`, never `globalCompositeOperation = "screen"` or `"lighter"`.

---

## Degradation Behavior

- If `AudioContext` constructor throws, a `text-rose-300` error notice appears on both idle and play screens.
- Audio must be started by a user gesture (tap-to-begin button) to satisfy browser autoplay policy. Before that tap, the idle screen shows all three creatures visually alive (breathing animation possible via CSS) with the start button prominent (min-height 64 px, `text-xl`).
- Touch-action is set to `none` on the canvas via both Tailwind `touch-none` and inline `style={{ touchAction: "none" }}` to prevent scroll-jank on mobile.
- Pointer Events API is used throughout (handles both mouse and touch; `setPointerCapture` ensures drag continues outside element bounds).
- On unmount, `cancelAnimationFrame` and `AudioContext.close()` are called to prevent leaks.

---

## Named References

1. **Hermann von Helmholtz**, *On the Sensations of Tone as a Physiological Basis for the Theory of Music* (1863/1877, trans. Ellis 1885). Foundational treatment of combination tones, beats, and roughness as the physical basis of dissonance. The "beating" mechanic here is exactly Helmholtz's interference model: two pure tones Δf Hz apart produce amplitude oscillations at Δf Hz.

2. **McBride & Tarnopolsky, 2025** — "Auditory roughness: a perceptual review" (arXiv:2510.14159, October 2025). A modern synthesis of the three-factor consonance model: (a) harmonicity — degree to which a chord's partials form a common harmonic series; (b) dislike of fast beats (roughness) — maximally aversive at ~70 Hz, already noticeable at 5–8 Hz; (c) liking of slow beats — rates below ~3 Hz are perceived as pleasant vibrato rather than roughness. This prototype exploits the roughness/pleasure transition directly: starting in the 5–8 Hz beat range (noticeable roughness, especially perceptible to young listeners) and resolving to 0 Hz (pure consonance).

3. **Parncutt & Hair (2011)**, "Consonance and dissonance in music theory and psychology," *Journal of Interdisciplinary Music Studies* — supporting context for just-intonation intervals as maximally consonant dyad/triad configurations.

---

## Honest Limitations

- **Beat detection is approximate**: the creature tone beats against the drone fundamental (110 Hz), but the drone's second partial (220 Hz) also beats against the creature's second partial — at the same Δf, reinforcing the percept. This is actually correct and beneficial, but the code does not explicitly model multi-partial beating, relying on natural acoustic interference.
- **LFO AM is additive to acoustic beating**: the gain modulation reinforces but doesn't precisely match the acoustic waveform phase. If the acoustic beat and the LFO drift out of phase, the modulation may momentarily cancel the percept. A more rigorous implementation would derive the AM from a difference-frequency filter bank.
- **Y-position clamp**: the drag range is ±18% around the target frequency (about ±170 cents). This is wide enough to produce clearly audible beats but constrained enough that children cannot drag creatures to wildly dissonant registers. A future version might sonify the full chromatic range and show multiple lock points.
- **No haptic feedback**: mobile haptic feedback on lock (via `navigator.vibrate`) would further reinforce the embodied "snap" and is a natural next step.
- **Monophonic purr**: the purr tone is a single sine at 1.5× the locked fundamental. A richer purr (multiple partials at low levels, slight inharmonicity like a cat's purr) would be more satisfying.
- **Static X positions**: creatures only move on Y (frequency). Allowing X movement too, with creatures gravitating together when locked, would reinforce the "harmony as closeness" metaphor.

---

## Next-Cycle Deepening

- Add haptic feedback (`navigator.vibrate([20])`) on lock event for mobile tactile reinforcement.
- Render a second drone partial circle (220 Hz) that breathes at twice the rate, making the drone's overtone structure tangible.
- Allow X-axis drag too, with magnetic attraction when two creatures are both locked (they drift together slowly).
- Add a fourth creature targeting the **perfect fourth** (4:3, 146.67 Hz) for a richer chord option.
- Replace the LFO AM with a proper **ring modulator** (true multiplicative AM) to ensure acoustic and modulation beats stay phase-coherent.
- Add a **visual waveform trace** below each creature showing the interference pattern — as two waves approach unison, the standing wave slows, giving a direct visual of the beat phenomenon.
- Explore **microtonality**: let children discover intervals between the pure ratios, experiencing the full roughness landscape rather than only targeting specific lock points.
