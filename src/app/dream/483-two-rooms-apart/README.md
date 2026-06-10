# Two Rooms Apart

**Cycle 2 of the Resonant Room spine**

> What if you played into TWO sympathetic rooms tuned a tritone apart — so every note beats against its own echo — and resolution meant collapsing the two rooms into agreement, an act only you can perform?

---

## How to Play

**MIDI keyboard:** Connect any USB/Bluetooth MIDI controller. The page will detect it via the Web MIDI API and route note-on/off messages to both rooms.

**On-screen keyboard:** Two octaves of piano keys (C4–B5) at the bottom of the page. Click or tap any key; touch-drag supported. The keys light violet when active.

**QWERTY keyboard:** The home row maps to a chromatic scale:
```
a  w  s  e  d  f  t  g  y  h  u  j  k  o  l  p  ;
C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5 C#5 D5 D#5 E5
```

**Detune slider:** Drag left (toward Unison) to collapse the two rooms toward agreement. At full right (600 ¢ = tritone), the rooms maximally disagree. Resolution is yours to perform — the rooms do not auto-resolve.

**Auto-demo:** Within ~3 seconds of pressing "Tap to Begin," a scripted phrase plays at full tritone detune so the beating is immediately audible. You can play over it or drag the detune slider while it sounds.

---

## Design

### Two Tritone-Detuned Rooms

The core idea: every played note feeds **two parallel rooms simultaneously**, each a bank of N=8 high-Q biquad bandpass resonators tuned to the harmonic series of the played note. Room A holds the reference spectrum; Room B holds the same spectrum shifted up by the current detune amount (continuously variable, 0–600 cents, default = 600 ¢ = tritone).

At 600 cents (an equal-temperament tritone), Room A's fundamental lands near but not on Room B's shifted fundamental, and every higher harmonic pair also misaligns. The result: dense, beating, suspended tension — every partial pair produces amplitude modulation at its difference frequency, which the ear hears as a slow throbbing roughness. The rooms are panned −35°/+35° left/right so the spatial disagreement is audible on headphones.

At 0 cents, Room A and Room B fuse to unison: the beating ceases, the two sets of partials lock phase, and the sound resolves. The canvas mirrors this — interference fringes stop and particles shift from warm violet/blue to emerald.

### Coupling and Beating

Each resonator is a Web Audio `BiquadFilterNode` (type `"bandpass"`, high Q≈60–130). A note-on injects a short filtered-noise excitation burst into both rooms. Because the two rooms never share identical frequencies at non-zero detune, they produce the classic interference beat: for two sinusoids f₁, f₂, amplitude modulation at |f₁−f₂| Hz. At 600 cents, a 440 Hz partial in Room A sits against a 622 Hz partial in Room B, beating at 182 Hz — too fast for the ear to resolve as rhythm, perceived instead as roughness. Closer intervals (say, 20 cents) produce slow 5 Hz "wah-wah" beating that is viscerally audible.

### Real-Time Roughness Engine (Plomp–Levelt / Sethares)

A roughness scalar is computed every 3 frames from all active partial pairs across both rooms. The Sethares dyad model:

```
roughness(f1,a1,f2,a2) = a1 * a2 * (exp(-b1 * s * Δf) - exp(-b2 * s * Δf))
```

where:
- `Δf = |f2 - f1|`
- `s = 0.24 / (0.0207 * min(f1,f2) + 18.96)` (Plomp-Levelt critical bandwidth estimate)
- `b1 = 3.5`, `b2 = 5.75` (model constants from Sethares 1993)

Cross-room partial pairs dominate at full tritone detune because they are near enough in frequency to be dissonant but not unison. As the detune slider moves toward 0, the cross-room Δf values collapse to 0, the roughness model outputs fall to 0, and the scalar (normalized 0–1) drops visibly in the tension readout.

This scalar:
- Drives the **Tension / Roughness** bar and label ("Resolved" → "Settling" → "Tense" → "Dissonant" → "Clashing")
- Controls the heat glow at the canvas center
- Modulates the agitation of the particle cloud
- Is encoded in the canvas top bar as a color-graded strip (green → amber → rose)

### Canvas Visualization

Two arcs of particles: violet = Room A (reference, panned left), sky-blue = Room B (detuned, panned right). Particle size and wobble scale with the partial's decaying amplitude. Arcs placed at opposite semicircles of the canvas so the two rooms read as spatially opposed — "the disagreement you must close."

Connective arcs are drawn between same-partial pairs across rooms, pulsing at the beat frequency (`|fA − fB|` Hz). At full tritone (fast beating) the arcs throb rapidly and are colored rose. As detune drops, the throb slows and the color shifts toward emerald. At unison, arcs go still — the visual literally shows resolution happening.

### Resolution is the Player's Action

The rooms do not auto-resolve. There is no timer, no cadence, no built-in release. The only path to resolution is the player dragging the detune slider to the left. This is the central design choice: **tension is the default state; consonance requires effort**. A few notes exist where two different pitches produce partial stacks that partially agree even at full detune (e.g., notes a tritone apart from each other — an ironic self-referential stability), but even those do not fully resolve the rooms.

### Signal Chain

```
Note-on → Excitation burst (40ms filtered noise)
        ↓
  Room A (N resonators, reference freq) → PannerNode (−35°) ─┐
  Room B (N resonators, detuned freq)   → PannerNode (+35°) ─┤
                                                               ↓
                                              Master GainNode (0.7)
                                                               ↓
                                           DynamicsCompressor (brick-wall limiter,
                                             threshold −3 dB, ratio 20:1, attack 1ms)
                                                               ↓
                                              AudioContext.destination
```

All feedback is biquad filter Q-bounded, and the limiter prevents any runaway buildup. NaN guards are implicit in the Web Audio biquad implementation.

### FDN Lineage

This prototype draws on the Feedback Delay Network reverb tradition:
- **Stautner & Puckette** (Computer Music Journal, 6(1), 1982) — original N×N FDN concept: multiple delay lines coupled through a unitary feedback matrix.
- **Jot & Chaigne** (AES 90th Convention, 1991) — the Jot FDN with per-line attenuation for frequency-dependent T60, and the observation that delay-line lengths tuned to musical intervals produce tonal resonances.

Two Rooms Apart reduces the FDN to its essential tonal-resonance idea — banks of tuned resonators — but splits it into two spatially and spectrally opposed banks, so the room's harmonic character is its central subject rather than an artifact.

### Sensory Dissonance / Roughness References

- **Plomp, R. & Levelt, W.J.M.** (1965). "Tonal consonance and critical bandwidth." *Journal of the Acoustical Society of America*, 38(4), 548–560. — The original dissonance curves from which the dyad model is derived.
- **Sethares, W.A.** (1993). "Local consonance and the relationship between timbre and scale." *Journal of the Acoustical Society of America*, 94(3), 1218–1228. — The parameterized roughness formula implemented here; demonstrates that timbre determines which scales sound consonant.
- **MacCallum, J. & Einbond, A.** (2008). "Real-time analysis of sensory dissonance." *Proceedings of CMMR 2008*. — Application of Sethares-style roughness to real-time spectral composition, closest analog to this prototype's use.

### Cycle 3 Idea

Add a third room tuned a **just fifth** (702 cents) above Room A. Room A and Room C share many harmonics (5th, 10th… partial of A align with 3rd, 6th… of C), creating partial consonance — but Room B remains the tritone interloper. The player must find the "pivot note" where all three rooms momentarily align, then choose which two to collapse first. The design question: can you negotiate a tritone into resolution by routing through the just-fifth room as an intermediary?

### Next-cycle deepening (folded in from this fire's sibling explorations)

This shipped as the winner of a 3-way DEEP exploration (cycle 379). The two sibling
approaches are banked as concrete cycle-3 directions:

- **Whole-tone single-room suspension + a dissonance-gradient suggestion engine** (sibling
  `481`): instead of two detuned rooms, a single room tuned to the whole-tone scale (no
  tonic, no leading tone) that piles up an ambiguous suspension. Its strongest idea: a
  *steepest-descent* hint layer that watches the live roughness curve and highlights, on
  the keyboard, the 2–3 notes that would most reduce total Plomp–Levelt roughness if played
  now — turning the room into a partner that whispers possible resolutions without forcing
  one. Port that hint layer onto Two Rooms Apart: show which note (or which detune nudge)
  most lowers cross-room roughness.
- **WebGPU dissonance field** (sibling `482`): render the beating not as Canvas2D arcs but
  as a GPU compute field where the measured roughness drives a vorticity term — the
  interference becomes visible turbulence that goes laminar as the rooms fuse. A cycle-3
  renderer upgrade (with a Canvas2D fallback), and the lab's starved WebGPU path.
