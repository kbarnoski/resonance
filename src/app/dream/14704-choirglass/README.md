# 14704 · Choir Glass

> "What if I could HUM a harmony, and the moments in my whole catalog that
> consonate with it lit up and swelled — a stained-glass rose window of my own
> recordings, tuned live to my voice?"

Choir Glass turns sixteen of Karel's real piano takes into the sixteen panes of
a Gothic rose window. You hum a note; the takes whose harmony consonates with
your voice light up and swell in gain; dissonant takes recede to dark glass.
Sustain a note and the lit panes become a chord of his own recordings — the
glass *is* the choir.

## What it is

- **Input** — your voice / humming, as *control only*. A dedicated microphone
  `AnalyserNode` extracts the pitch class you sing (autocorrelation → pitch →
  pitch class 0–11). The mic is **never** connected to the catalog audio graph,
  never to `createSafeMaster`, never to `ctx.destination`. You never hear your
  own voice through the app.
- **Output** — an inline **SVG** stained-glass rose window (no Canvas2D, no
  three.js, no WebGL). Sixteen radial Gothic-lancet petals, each a track, lit by
  its live gain, colored across the **full chromatic spectrum** (`hue = i/16`),
  with a soft SVG glow filter pulsing to `safe.analyser`.
- **Technique** — real-time pitch-class detection of the voice, matched against
  each track's live harmony from `loadTrackAnalysis` (the chord under the
  playhead → root / third / fifth). The panes whose chord tones consonate with
  the sung note **swell as whole takes** (not grains); the sung pitch class and
  the lit tracks are shown.

## How it works

1. **Hum into the glass** requests the mic via `getUserMedia`. A separate
   `AnalyserNode` (2048-pt FFT, low smoothing) taps the mic. Every animation
   frame, `detectSungPitch` runs a normalized autocorrelation over the
   time-domain frame, folds the fundamental to a pitch class, and reports a
   loudness × periodicity clarity.
2. **Each pane loops one real take.** Buffers are lazy-loaded (analysis first,
   so the glass animates within ~1s; audio streams in behind it). A pane's
   `BufferSource` (`loop = true`) → its `GainNode` → the one shared
   `createSafeMaster` input. The pane's gain **is** its swell.
3. **Consonance drives the swell.** For each pane, the playhead position picks
   the active chord from `loadTrackAnalysis().chords`; `chordRoot` /
   `chordIsMinor` give its root/third/fifth. `paneConsonance` scores the sung
   pitch class against those tones (unison/fifth/fourth/third/sixth ring;
   second/seventh/tritone clash). The score, gated and scaled by voice clarity,
   is the pane's target gain and brightness. Swells rise faster than they fade,
   so lit takes bloom and linger.
4. **Visuals** ride `safe.analyser`: a central rosette and the glow filter pulse
   to the tamed master RMS. A chromatic ring of twelve ticks plus a radial
   pointer show the detected sung pitch class; the legend lists which take is
   which pane and which are lit.

## Graceful fallback (demoable headless, no mic)

If the mic is denied or unavailable, the piece **still runs**: an autonomous
demo walks a synthetic sung pitch class around the circle by consonant steps, so
panes light and swell on their own — a `text-destructive` line explains the
fallback but the window keeps singing. A keyboard fallback is always live: hold
`A W S E D F T G Y H U J` (tracker-style piano row) as the twelve pitch classes;
held keys override whatever else is driving the glass. Only a true engine
failure (extremely unlikely for SVG + Web Audio) surfaces a fatal
`text-destructive` notice.

## References

- **Medieval rose window / Gothic light** — the visual metaphor: a wheel of
  colored glass that only comes alive when lit from behind. Here the "light" is
  your voice, and consonance is what lets it through.
- **Pauline Oliveros — _Deep Listening_** — the harmonic-listening lineage:
  listening as an active, whole-body, participatory practice rather than passive
  hearing. Choir Glass listens to you and answers with the artist's own takes.
- **arXiv:2608.04378** (co-creation agents that "listen" via hierarchical world
  models, Aug 2026) — the current-research tie: this is a co-creation
  instrument that listens to your voice and responds harmonically.

## Honest limitations

- Autocorrelation pitch detection is monophonic and best with a clear sustained
  hum; a noisy room, vibrato, or a whispered tone lowers clarity and the swell
  softens accordingly (by design, rather than snapping).
- Harmony resolution is only as good as each track's analysis. Tracks with no
  public `chords` fall back to a base pitch class (spread around the circle of
  fifths) so they still participate; the chord-tone model uses root/third/fifth,
  not full extended voicings.
- Sixteen simultaneous loopers pass through one `createSafeMaster` limiter, so a
  huge sustained cluster is tamed (never harsh) but can crowd; the consonance
  gate keeps only genuinely-fitting panes audible.
- All sixteen panes are Karel's verified recordings (Welcome Home + Snowflake).
  No oscillators or synths are ever routed to output. The quarantined
  17th St / Folsom St / Sketches material is not referenced.
