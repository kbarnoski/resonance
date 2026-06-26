**For**: kids (4+)

# Coral Garden

**Pitch:** Tilt the tablet and a glowing bioluminescent reef grows itself across the screen — and the coral *sings* the slow, warm melody it traces as it grows. A calm, never-silent, never-wrong bedtime toy.

## How it works (no reading required for the child)

1. Tap the big glowing **Start** button (≥88px). This unlocks sound and asks for the tilt sensor (iOS).
2. **Tilt the tablet.** A gentle gravity/light vector follows the tilt and the coral tips lean toward it within about half a second — immediate cause → effect.
3. As the coral lengthens and folds, it plays a soft mallet/bell note for the most-active growing tip. Higher on the screen = higher note. It is always a C-major pentatonic note, so there are **no wrong notes** and nothing is ever silent (a low drone always hums underneath).
4. **Tap the water** to plant a brand-new coral seed there, with a soft chime (a garnish — tilt is the headline).
5. Leave it alone and an **auto-demo** gently sways the gravity vector on its own, so a hands-free glance both sees coral blooming and hears the melody within ~1 second.

The reef looks like a real coral after ~30–60s and is denser and different after 3 minutes (genuine long-form growth + memory). After ~12 minutes it slowly fades toward a soft "goodnight."

## The technique — differential growth (the whole point)

Each coral strand is a polyline of nodes. Every simulation step (a calm ~380–520ms clock) applies, for real:

1. **Attraction** to its two connected neighbors toward a rest length (keeps the line continuous).
2. **Repulsion** from all nearby nodes within a radius across every strand — using a **uniform-grid spatial hash** so it is O(n), not O(n²). This is what makes the line wrinkle, avoid itself, and produce organic brain-coral folds.
3. **Smoothing** toward the midpoint of neighbors (curvature smoothing).
4. **Growth** — when an edge grows longer than a threshold, a new node is inserted at its midpoint; extra nodes are also inserted at high-curvature kinks. The line steadily lengthens and must fold into the available space — the signature of differential growth.
5. **Branching** — a growing tip occasionally splits into a new strand at a rotated heading.

Total nodes are capped (~2200) for performance; when capped, growth slows and the reef shimmers instead.

**References:** Anders Hoff / Inconvergent (differential line essays); Entagma (differential growth in TouchDesigner / Houdini); arXiv:2504.18040 "Cabbage" (2025), which formalizes differential growth.

## Audio brain

- Web Audio only — **no mic, no samples, no harmony engine, no granular synthesis**.
- Always-on soft drone (low C + G pad) so it is never silent.
- A gentle clock maps the most-active tip's vertical position to a C-major pentatonic note (C D E G A across octaves), played with a soft sine/triangle bell (attack ≥35ms, gentle decay).
- Branch events play a brighter bell one octave up; planting a seed plays a chime.
- Polyphony is normalized (per-voice gain ∝ 1/√activeVoices) so **loudness does not grow with the garden**.
- Kids-safe master chain: `masterGain (≤0.26) → lowpass ~6.5kHz → DynamicsCompressor(threshold −10, ratio 20:1) → destination`. No harsh or high-pitched transients.

## Output

- **Pure Canvas2D** (no three.js / WebGL / WebGPU) — bulletproof everywhere-render. Glow via layered `shadowBlur` strokes (bloom + mid + bright core) and radial-gradient seed/tip nodes, over an indigo → violet → teal underwater gradient with trailing-alpha persistence.
- If a 2D context is somehow unavailable, a `text-rose-300` notice appears **and the audio keeps playing** — never a blank/broken screen.

## Input

- **Primary: tilt** via `DeviceOrientationEvent` (iOS permission requested inside the Start tap). Beta/gamma map to the gravity/light vector.
- **Secondary:** tap empty water → new seed + chime.
- **Desktop / no sensor:** pointer drag tips the gravity vector, and an idle auto-demo oscillates it so it grows and sings hands-free.

## Tags

- **Input:** tilt (primary), touch/pointer, auto-demo
- **Output:** Canvas2D bioluminescent glow + Web Audio melody
- **Technique:** differential growth (spatial-hash repulsion, midpoint/curvature insertion, tip branching)
- **Vibe:** calm, underwater, bedtime, never-wrong

## Kids-safety notes

- No reading required; all affordances are color/glow/motion.
- Big Start ≥88px; tap targets generous; immediate (<50ms) tap response; tilt visible within ~0.5s.
- No "wrong," no fail state, no scary or loud sounds; always-on quiet drone; master ≤0.26 behind a lowpass + heavy compressor; gentle 12-minute goodnight fade.
- Fully offline and private: no mic, camera, network, AI, or persistence.

## Honest warts

- Tilt mapping (gamma/beta) assumes a roughly portrait device; landscape or an upside-down hold will bias the gravity vector differently. It still grows and sings, just leaning a different way.
- The melody follows whichever tip moved most this step, so on a very dense reef the tune can wander between distant strands rather than stay on one voice — pleasant and ambient, but not a fixed motif.
- Heavy `shadowBlur` is the main cost; on low-end devices very large gardens may dip below 60fps before the node cap fully kicks in.
