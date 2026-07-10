# 1412 · Time Smear

**What if you could play TIME itself — perform in front of your webcam and watch your
motion get smeared into a flowing chronophotographic ribbon that sings?**

Route: `/dream/1412-time-smear`

## What it is

A live-camera **slit-scan** instrument (a.k.a. chronophotography / time-smear). Instead of
showing you the live camera frame, each animation tick samples only a single **thin slice**
of the current frame and scrolls the accumulated slices across the screen. One screen axis
therefore stops being *space* and becomes **time**: the right edge is "now", and everything
to the left is the recent past. A person standing still becomes smooth vertical streaks; a
person moving is stretched into eerie, liquid time-ribbons.

It is not a mirror, not a kaleidoscope, and not a "wave-your-hand-to-trigger-a-note" toy.
The fresh idea is that **time is the visible and audible axis**.

## How to use it

1. Press **Start camera** (grant the webcam permission) — or **No camera — use pointer**.
   Either one creates the (gesture-gated) AudioContext and begins immediately. Sound and
   visuals are never blank and never silent.
2. Move. Slow gestures paint calm bands; fast gestures tear bright streaks across the ribbon.
3. In pointer mode, drag across the ribbon — your pointer injects a bright blob into the
   slice, so you can "play" the time-axis by hand.
4. Live controls (top-left):
   - **Scroll speed** — how fast the time-axis flows.
   - **Scan orientation** — horizontal (time ↔) or vertical (time ↕). Changing it wipes the
     history buffer so the two axes never smear together.
   - **flicker** — an *opt-in*, photosensitive-safe slow luminance drift (≤ 3 Hz, soft sine,
     never a hard strobe). Tap again to stop it the same frame. Disabled under
     `prefers-reduced-motion`.

## How it works

### Visual (WebGL2)

- The camera frame is uploaded to a texture each frame.
- A **ring buffer** texture holds the scrolling history. Each tick the "head" advances by
  `scrollSpeed` columns; for each new column a 1-pixel-wide viewport is set on the ring's
  framebuffer and a fragment shader stamps the current slit (the camera's centre column,
  sampled top-to-bottom) into it. Old columns are never touched — they just age.
- The display shader unwraps the ring with a `fract(head - 1 + uv)` remap so the newest
  column sits at the leading edge and time flows away from it. Luminance is mapped through a
  cosine palette (dark violet → magenta → amber) with a vignette and a dark-violet floor, so
  there is never a pure-black frame.
- Everything renders through WebGL2 framebuffers — no Canvas2D, no SVG.

### Sound (Web Audio)

- A tiny analysis pass renders the current vertical slit into a `1 × 16` framebuffer (one
  averaged luminance per band) and `readPixels` pulls the 16 values back each frame.
- Each band drives the amplitude of one voice in an **additive bank of 16 partials**. The
  partials are deliberately **inharmonic / spectral**: a stretched series (Railsback-like
  octave stretch plus per-partial detune and jitter), anchored by a low sine drone — *not* a
  pentatonic "always-consonant scale index". A bright shape moving through a band swells that
  partial, so your motion paints an evolving drone-timbre.
- Frame-to-frame luminance difference (**motion energy**) opens a lowpass on the whole bank,
  so movement brings brightness and teeth.
- Master gain ramps from silence to **0.18** (≤ 0.20) and passes through a
  `DynamicsCompressor` limiter before `destination`.

### Idle self-demo / degradation

- If the camera is denied or unavailable, a clear `text-rose-300` message appears and the
  piece keeps running on a **synthetic drifting blob** fed into the exact same slit-scan
  pipeline — never blank, never silent.
- In camera mode, if there is no motion for ~3 seconds, the synthetic blob fades back in so
  the ribbon keeps flowing and singing.
- In pointer mode, the pointer position injects the bright blob.
- If WebGL2 is unavailable, a short notice is shown.

## References

- **Golan Levin** — slit-scan works and *The Manual Input Sessions*; a long body of
  interactive slit-scan / time-based imaging.
- **Zbigniew Rybczyński** — *The Fourth Dimension* (1988), a landmark of slit-scan / temporal
  smearing in film.

## What's rough / next-cycle deepening

- The audible slit is always the camera's centre **vertical** column, even in vertical-scan
  mode; decoupling the analysis axis from the visual scan axis would make vertical scan feel
  more distinct sonically.
- `readPixels` every frame is a small GPU→CPU sync stall. At 16 pixels it is cheap, but a PBO
  or async readback would be cleaner.
- The synthetic idle blob is intentionally simple (one moving gaussian + a band glow). A
  richer synthetic performer (multiple limbs / flowing noise field) would make the cold-open
  more mesmerising.
- Slit sampling is a single centre column; an option to average a wider slice, or to pick the
  slit position, would open up more chronophotographic textures.
- Colour grading currently leans on luminance; carrying more of the camera's real chroma
  through the ring (at higher precision than RGBA8) would deepen the palette.
