# Foreshadow

**Status**: demoable

*What if Karel's piano's next harmony arrived as felt WEATHER, not a readout?*

Foreshadow is the lab's PREDICTION / anticipation verb rendered on the warm,
cosmic-ambient, non-analytical pole. There is no circle-of-fifths grid, no
numeric surprisal meter, no datamatics. Instead the chords his piano is most
likely to reach **pre-bloom ahead of the playhead** as soft warm density fronts
rolling in from the horizon. The chord that actually arrives is where the fronts
**converge and settle into warmth**. When his real harmony **defies** the
forecast, the gathered bloom softly **ruptures** into shards of light — surprise
shown as a felt rupture, never a number. It is something to stand inside for ten
minutes, not analyse for ten seconds.

## How it works

### The model (`model.ts`)
Karel's chord progression is read as a Markov process over functional scale
degrees. A key is detected (from an explicit key string if the analysis provides
one, else a duration-weighted root histogram with a minor/major vote). Each chord
is mapped to a diatonic degree in that key via `chordRoot` / `chordIsMinor`. The
transition prior comes from standard functional-harmony tables — one for major,
one for minor — **blended** with the take's own chord bigrams (α = 0.5). From the
current chord the blended matrix Markov-propagates the next likely chords **one to
four steps ahead** (the prediction horizon). On each real arrival we score
**surprisal = −log₂ p(actual)** from the one-step matrix; it is used *only* to
drive the visual rupture intensity and a subtle audible settle-bloom.

### The audio (`audio.ts`)
Every sound is Karel's own recording; no oscillator, synth, or noise, and every
node terminates at `createSafeMaster(ctx).input`.

- **Ground truth** — one decoded take loops at ~0.9 gain: the harmony that
  actually arrives.
- **Ghost pre-echo** — ~0.46 s before each chord boundary, a quiet warm ghost of
  the *predicted* chord plays: another instance of that same chord symbol, sliced
  from elsewhere in his decoded buffer, long raised-cosine windowed and low-pass
  warmed (~0.55 gain). You hear the harmony arriving before it does.
- **Settle bloom** — on arrival, a soft warm swell of the chord that actually
  came, its brightness scaled by surprisal (gentle resolution, or a brighter
  rupture when the forecast was defied).

**Honest ghost-fallback caveat:** the ghost is built from *his own buffer* by
replaying another instance of the predicted chord symbol. Most predicted chords
recur elsewhere in a take, so the self-foreshadow slice plays almost always. Only
when a predicted symbol never recurs does the fallback engage: a two-`DelayNode`,
raised-cosine-crossfaded pitch-nudge of the current slice toward the predicted
root, driven entirely by `AudioParam` automation (no oscillator). Its tuning is
approximate — a felt warm nudge, not a precise transposition — and it is rare.

### The field (`gl.ts`)
A single full-screen **WebGL2** fragment shader accumulates a warm fbm density
along a view ray (a cheap raymarch), domain-warped so it reads as rolling organic
weather rather than a grid — the Refik Anadol warm-volumetric register, not an
Ikeda grid. Forecast fronts seed glowing density lobes ahead of the read head
(higher probability = closer and denser; a raised horizon pushes the whole front
deeper toward the horizon). Convergence pulls the lobes into a warm core on
arrival; rupture scatters that core into turbulent shards. Turbulence and
brightness are driven by the `safeMaster` analyser (bass, overall energy).
Palette: deep plum → ember → dusk-rose → warm gold on a near-black warm
background (`#0b0705`); minor chords cool the warmth toward dusk-rose.

## Interaction
Camera-driven (MediaPipe pose, gated only on shoulders + wrists — never
hips/ankles, since this is a seated laptop webcam) with a complete pointer +
keyboard fallback driving the identical control struct:

- **slow arm raise** → prediction horizon 1–4 (pointer Y; ArrowUp/Down)
- **arm spread / lateral reach** → lean the gathering toward the 2nd/3rd-likely
  counterfactual branch (pointer X; ArrowLeft/Right)
- **stillness** lets the field settle warm; every mapped parameter is smoothed
  ~0.12 s.

The pointer path is fully playable with a mouse alone (no webcam required).

## Degrade
- analysis null / < 6 chords → audio keeps playing; the field falls back to an
  energy-driven ambient gather with a visible note.
- no WebGL2 → a designed `text-destructive` notice, nothing started.
- no camera / denied / model fail → pointer fallback + visible notice.
- audio fail → a designed `text-destructive` notice, no synth fallback.
- Full teardown on unmount: all audio nodes stopped/disconnected, `ctx.close()`,
  camera tracks stopped, pose tracker closed, animation frame cancelled, GL
  program/VAO deleted and context lost.

## References
- HookTheory next-chord transition statistics (the functional-harmony prior).
- David Huron, *Sweet Anticipation: Music and the Psychology of Expectation* —
  expectation and the surprise (ITPRA) response.
- Refik Anadol's warm volumetric register — the aesthetic reference for the
  weather field.
- Information-theoretic surprisal (−log₂ p) used as a *felt rupture of light*,
  never a readout.
