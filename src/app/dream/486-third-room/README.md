# Third Room

**Cycle 3 of the Resonant Room spine — prototype 486**

> Can you negotiate a tritone into rest — not by collapsing it, but by routing it through a THIRD room a just-fifth above that shares its harmonics — finding the pivot note where all three rooms momentarily agree?

---

## How to Play

**MIDI keyboard:** Connect any USB/Bluetooth MIDI controller; the page detects it via Web MIDI and routes note-on/off messages into all three rooms simultaneously. Hot-plug is supported.

**On-screen keyboard:** Two octaves (C4–C6) at the bottom of the page. Click, tap, or touch-drag. Active keys glow violet. Pivot-note suggestions glow emerald with a "↓" marker.

**QWERTY keyboard:**
```
a  w  s  e  d  f  t  g  y  h  u  j  k  o  l  p  ;
C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5 C#5 D5 D#5 E5
```

**Room B Detune slider:** Continuously moves Room B from unison (0 ¢) to tritone (600 ¢). Default = 600 ¢ (maximum dissonance). Drag left to collapse the tritone, but consider using Room C first.

**Room C Blend slider:** Brings the just-fifth room (702 ¢ above Room A) in from silence (0 %) to full presence (100 %). Room C shares harmonics with Room A, making it a consonant anchor. The resolution mechanic is to blend C in, find a pivot note where all three rooms align, then collapse the detune.

**Auto-demo:** Within ~3 s of pressing Begin, a scripted phrase plays at full tritone detune, then gradually blends Room C in so the just-fifth bridge is audible and visible before you touch anything. Any interaction cancels the demo.

---

## Design

### The Three Rooms

Every played note feeds three parallel resonator banks simultaneously:

| Room | Tuning | Pan | Color |
|------|--------|-----|-------|
| **A** — reference | Harmonic series of played note | −20° L | Violet |
| **B** — tritone interloper | Same, shifted +detune (0–600 ¢) | +35° R | Rose |
| **C** — just-fifth bridge | Same, shifted +702 ¢ (ratio 3:2) | −35° L | Emerald |

Room A and Room C share many harmonics: the 3rd partial of A (3·f₀) equals the 2nd partial of C (2·f₀ × 1.5), the 6th partial of A equals the 4th of C, and so on. This makes A↔C partially consonant — the "bridge." Room A↔B remains dissonant at any non-zero detune.

Each room = N=8 high-Q biquad bandpass resonators (`BiquadFilterNode`, type `"bandpass"`, Q ≈ 60–130) tuned to the harmonic series of the played note. A note-on injects a short (~40 ms) filtered-noise excitation burst. Room C amplitude is additionally scaled by the C-blend control (0–1), affecting both the audio level and its weight in roughness computation.

### Signal Chain

```
Note-on → excitation burst (per room)
        ↓         ↓         ↓
    [Room A]  [Room B]  [Room C × blend]
    StereoPan StereoPan StereoPan
    (−20° L)  (+35° R)  (−35° L)
        ↓         ↓         ↓
              masterGain (×0.65)
                   ↓
            DynamicsCompressor
         (threshold −3 dB, ratio 20:1,
          attack 1 ms, knee 0 dB)
                   ↓
              destination
```

### Pivot Note Mechanic

A steepest-descent hint layer runs analytically every ~18 frames (≈3×/sec). For every MIDI pitch 48–84, it predicts total roughness given the current Room C blend and Room B detune, using the same Plomp–Levelt dyad model applied to the computed partial frequencies — without synthesizing any audio. The three pitches that minimise predicted total roughness are highlighted as "pivot notes" on the on-screen keyboard (emerald glow, "↓" marker) and listed above the keyboard with a roughness-reduction estimate.

These pivot notes are the harmonic "crossroads" where all three rooms momentarily agree in their partial relationships. The player's act: blend Room C in, find a pivot note, play it, then drag the detune slider toward unison to resolve.

### Roughness Engine (Plomp–Levelt / Sethares)

Real-time computation every 3 frames over all active partial pairs across all three rooms:

```
roughness(f1,a1,f2,a2) = a1 * a2 * (exp(−b1 * s * Δf) − exp(−b2 * s * Δf))

Δf = |f2 − f1|
s  = 0.24 / (0.0207 * min(f1, f2) + 18.96)
b1 = 3.5,  b2 = 5.75
```

Summed over all pairs, normalised 0–1. Room C amplitudes are weighted by the C-blend scalar, so blending C in can either raise or lower total roughness depending on which note is played — the pivot notes are exactly where C's added harmonics reduce the sum.

Drives: Tension/Roughness bar, five-level label (Resolved → Settling → Tense → Dissonant → Clashing), and the vorticity field intensity.

### WebGPU Vorticity Field

The background visualisation is a compute-shader particle simulation (WGSL, ping-pong storage buffers). Approximately 4,000 particles are dispatched in workgroups of 64.

Each particle belongs to one of the three room attractors. The flow field combines:
- **Attraction** toward the room's center (proportional to inverse distance)
- **Vorticity** — a perpendicular (curl) component scaled by roughness: high roughness = chaotic swirl; low roughness = laminar inward flow
- **Room-specific scaling**: Room B vorticity is gated by `detuneFrac`; Room C vorticity is gated by `cBlend`, so Room C emerges as a stabilising (smooth, laminar) attractor as the player blends it in
- **Sine-cosine noise** for organic motion, scaled by roughness

Particles render as point sprites (6-vertex quad, additive alpha blending). Colors: violet (Room A), rose/amber (Room B, shifts with detune), emerald (Room C, brightens with cBlend). WebGPU is detected via `navigator.gpu` + `requestAdapter()`. If unavailable, an equivalent Canvas2D flow-field with the same three-attractor / roughness-vorticity logic runs instead — fully functional, same visual metaphor.

### Three-Room Geometry Legibility

The canvas always shows:
- Three attractor glow-points in violet (A), rose (B), emerald (C)
- A connecting arc between A and C (emerald, opacity = cBlend) — the consonant bridge
- A connecting arc between A and B (rose, width scales with roughness) — the tritone tension
- Room labels at each attractor center

---

## References

- Plomp, R. & Levelt, W. J. M. (1965). "Tonal consonance and critical bandwidth." *Journal of the Acoustical Society of America*, 38(4), 548–560.
- Sethares, W. A. (1993). "Local consonance and the relationship between timbre and scale." *Journal of the Acoustical Society of America*, 94(3), 1218–1228.
- MacCallum, J. & Einbond, A. (2008). "Real-time analysis of sensory dissonance." *Computer Music Modelling and Retrieval (CMMR 2008)*.
- Stautner, J. & Puckette, M. (1982). "Designing multi-channel reverberators." *Computer Music Journal*, 6(1), 52–65. (FDN lineage)
- Jot, J.-M. & Chaigne, A. (1991). "Digital delay networks for designing artificial reverberators." *AES 90th Convention*. (FDN lineage)
- Just intonation: the 3:2 ratio (702 cents) — the Pythagorean perfect fifth.

---

## Next-cycle deepening (folded in from this fire's sibling explorations)

This shipped as the winner of a 3-way DEEP exploration (cycle 381). The two sibling
approaches are banked as concrete cycle-4 directions:

- **The whisper panel** (sibling `485-resolving-room`): the cleanest realization of the
  steepest-descent *partner* — a fixed "Notes that ease the tension →" panel naming the
  top 2–3 resolving notes with a predicted %-improvement, plus a derived (not hardcoded)
  gradient arrow on the detune slider itself. Port that explicit hint-panel UX onto Third
  Room so the pivot suggestions read at a 06:30 phone glance, and add the detune-slider
  gradient arrow alongside the C-blend control.
- **The roughness landscape + shared-control autopilot** (sibling `487-guided-descent`):
  render the live Plomp–Levelt roughness as a 1-D *landscape* across the detune axis (120
  analytic samples) with the current position as a ball on the curve, and offer an optional
  "Descend toward rest" autopilot that walks −∇roughness at ±15 ¢/step — which the player
  can grab and override at any moment (shared control, never taken). Adding this as a
  *second* axis to Third Room would let the player feel the slope of the tritone→fifth
  negotiation, not just hear it. (Design caution: keep it opt-in and overridable so it never
  becomes a pre-baked release — tension must stay the resting default.)
