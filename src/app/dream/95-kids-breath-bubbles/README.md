# 95 — Breath Bubbles

**For**: kids (4+)
**Cycle**: 110
**Status**: demoable

## The question

What if Resonance could turn a child's breath into music?

## Interaction

Blow into the mic → colorful soap bubbles appear at the bottom of the screen, drift upward while
gently wobbling left and right, and pop with a soft pentatonic ding when they reach the top.
Louder breath = bigger bubbles, faster rate. Demo mode auto-animates a gentle breathing wave.
Tap anywhere in active state to drop a manual bubble at that position.

## Design notes

### Breath detection
Uses RMS amplitude from `AnalyserNode.getFloatTimeDomainData`. The threshold (0.028) is low enough
to fire on gentle blowing but above typical room noise floor. Loudness maps to bubble size:
`r = 8 + min((rms - threshold) * 150, 24)` → radius range ~8–32px.

### Physics
- Small bubbles rise faster (multiply by `18/r`), large bubbles slower — matches real soap bubbles.
- Horizontal wobble via `sin(t * 0.92 + wobPhase) * wobAmp` with unique phase per bubble so
  bubbles drift independently rather than all swaying together.
- Max 40 bubbles on screen; old ones naturally pop before the cap is hit during normal blowing.

### Visual
- Soap bubble appearance: translucent fill (hex+"38"), colored rim (hex+"bb"), highlight ellipse,
  specular dot. glow via `ctx.shadowColor` + `ctx.shadowBlur`.
- Pop: expanding ring + 8 radial dots over ~280ms.
- Background: deep indigo gradient `#040918 → #0a1230`.

### Audio
- Pop sound: sine with chirp from `freq * 1.5 → freq * 0.82` over 180ms, gain 0.13 → 0.
- Each bubble gets a random pentatonic note (C-major, 2 octaves). Small bubbles happen to get
  whichever note chance assigns — no pitch-from-size rule, to avoid determinism.
- Soft ambient pad: C3/E3/G3 with slow LFO at gain 0.010. Barely audible but eliminates
  the "broken / silent" feel between bubbles popping.

### Kids rules compliance
- No reading: "blow to make bubbles" text is instructional, not gating. Start button is 160px circle.
- No fail state: if mic unavailable, demo mode auto-plays and tap works.
- No sudden loud transients: all sounds are soft sine waves.
- Tap target: Start button 160×160px (>> 64px minimum). Demo button has `minHeight: 44px`.
- Immediate response: first bubble from the stream appears within one animation frame (~16ms).
- No permissions collected / stored. Mic stream is live only — not recorded.

### Relation to the Kids collection
- Same "breath → art" modality as `88-kids-hum-to-paint` but without pitch detection —
  humming, blowing, and singing all trigger bubbles. Simpler interaction for younger children.
- Uses the same pentatonic note set as `82-kids-color-piano`, `90-kids-puddle-jumper`, etc.
  The pop sounds form spontaneous chords with the ambient pad.
- Zero permissions required for demo mode → usable in airplane mode, shared devices, locked-down
  school iPads.
