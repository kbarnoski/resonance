# 645 · Kids Piano Creatures

**Route:** `/dream/645-kids-piano-creatures`

## The one question
**What if a 4-year-old could PLAY a real keyboard and instantly sound like a
musician — every note they press blooms a living creature, and an invisible band
plays along in real time so there are no wrong notes?**

The child performs. They are not tapping toys — they press a keyboard (MIDI or
the computer's letter keys) and a full band materialises behind them. Nothing
they play can sound bad, because every incoming note is snapped to a friendly
scale and an accompaniment agent keeps the harmony, bass, and groove consonant
underneath.

## Tags
- **INPUT** — Web MIDI keyboard (primary) + computer keyboard (fallback) +
  last-resort on-screen pads. This is the lab's **first kids MIDI piece**.
- **OUTPUT** — three.js (WebGL) glowing note-creatures orbiting a dark 3D garden.
- **TECHNIQUE** — real-time generative accompaniment "agent": scale-snapping
  (no wrong notes) + auto-harmony pad + walking bass + a groove bed that grows
  with the child's activity, all driven by a look-ahead scheduler.
- **VIBE** — active-wonder, musical, joyful. The child is performing.

## How it works
### Input
1. **Web MIDI** — `navigator.requestMIDIAccess()` wrapped in try/catch and
   feature-detected. We listen to `noteon` on every input, handle hot-plug via
   `onstatechange`, and map MIDI note number → pitch.
2. **Computer keyboard fallback** — `A W S E D F T G Y H U J K` is an upper
   octave, `Z X C V B N M` a lower octave, both mapped onto the pentatonic. A
   4-year-old can bash these. If MIDI is unavailable a friendly `text-rose-300`
   line says so and play continues on the keyboard.
3. **On-screen pads** — only shown as a final accessibility fallback on touch
   devices: a row of 64px colored note-pads.

### No-wrong-notes engine
Every incoming note is snapped to **C major pentatonic** (`snapToPenta`), which
is always consonant against the accompaniment. Each note triggers a warm
two-partial bell/marimba voice (triangle + octave sine, soft 12ms attack) in
Web Audio.

### Real-time accompaniment agent (≥3 subsystems)
A **look-ahead scheduler** (Chris Wilson pattern: ~25ms poll, ~120ms schedule
horizon) reads the child's recent activity (`energyRef`, raised on each played
note, decaying when they rest) and drives:
- **(a) Auto-harmony PAD** — a slow diatonic chord progression
  (`C Am F G C F Am G`) that advances one chord per bar; soft saw + lowpass
  swells under the melody.
- **(b) Walking BASS** — root → fifth → octave → fifth per chord, one note per
  beat, sine.
- **(c) Groove BED** — kick + soft noise hats that thin out when the child rests
  and grow livelier (extra kicks, busier hats) as energy rises.

Because the chord progression advances and the texture builds with energy,
**minute 2 sounds different from minute 0** — multi-cycle evolution, not a loop.

### Visual
Each played note blooms or re-pulses a glowing creature in a three.js garden:
emissive core + additive glow sphere + a point light, color mapped to pitch
class, orbiting at a radius/height set by register. Creatures pulse on strike,
drift on idle, and the scene breathes (camera bob + orbit speed scale with band
energy). DPR-aware, resize listener, and full geometry/material/renderer
disposal on unmount.

### Idle auto-demo (ghost player)
After ~2.5s with no input a ghost player plays a gentle evolving pentatonic
melody — creatures bloom and the band plays a full song — so a silent review
glance with no MIDI hardware still SEES and (if unmuted) HEARS music. The first
real note hands control to the child.

### Kid-safe audio chain
`masterGain (≤0.55) → lowpass (7500 Hz) → DynamicsCompressor(-18, 6:1, knee 12)
→ destination`. Soft attacks, capped per-voice gains, and a quiet low drone bed
so it is never harsh and never fully silent once started.

## Named references
- **Toshio Iwai — *Electroplankton* (2005)** and the **Yamaha TENORI-ON**:
  performative, no-fail instruments where any input is musical and visual.
- **"A Design Space for Live Music Agents"** (arXiv 2602.05064, Feb 2026):
  framing the accompaniment as a live agent that responds to the performer.
- **"Towards Real-Time Human–AI Musical Co-Performance"** (arXiv 2604.07612,
  Apr 2026): the look-ahead real-time accompaniment idea. This piece implements
  the browser-feasible **rule-based** ancestor of that approach.

## Ambition self-assessment
- **#1 Never-used technique (first kids MIDI):** YES — the lab's first piece
  built around a Web MIDI keyboard as the primary input, with hot-plug handling.
- **#2 ≥3 subsystems:** YES — scheduler-driven pad, bass, and adaptive groove
  bed, plus the scale-snap voice engine.
- **#3 Named reference:** YES — Electroplankton/TENORI-ON and two 2026 arXiv
  live-music-agent papers, grounding the rule-based real-time accompaniment.
- **#4 Multi-cycle:** YES — chord progression advances per bar and groove
  texture builds/thins with energy, so minute 2 differs from minute 0.
- **#5 <14-day research finding:** PARTIAL — the conceptual grounding cites
  recent (Feb/Apr 2026) work, but the implementation is the well-understood
  rule-based version rather than a brand-new algorithm.

Honest weak spots: the accompaniment is rule-based (it does not truly *predict*
the child's next phrase), and harmony "support" of the child's exact note is
implicit via pentatonic-over-diatonic consonance rather than active re-voicing.
