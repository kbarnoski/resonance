# 17664-strand — A take that remembers itself

**Status:** demoable.
One of Karel's takes is cut into short motifs, held in a memory of five, and slowly re-composed over 5+ minutes so the piece is audibly different at minute five than at minute one — with a visible SVG memory ribbon and zero interaction after Begin.

## Concept

The brief: _what if one of Karel's takes could REMEMBER itself and slowly re-compose over 5+ minutes — motifs recurring with controllable variation, so the piece is audibly different at minute 5 than at minute 1 — and you could WATCH the memory work?_

One decoded real take (default **"Bath"**) is loaded via `loadRealTrackBuffer` and its analysis via `loadTrackAnalysis`. `makeMotifs()` carves the take into short segments (~1.5–5s):

- **harmonic** — around the chord changes in `analysis.chords[]` (preferred),
- **clusters** — at note-cluster boundaries (gaps in `analysis.notes[]`) if there are no chords,
- **windows** — fixed ~2.6s windows if analysis is null.

A **motif MEMORY of five** is held at all times. A self-rescheduling recall loop plays the **least-recently-heard** motif as an `AudioBufferSourceNode` slice of the SAME decoded buffer, through **six variation axes**:

1. register-LFO-biased transpose via `playbackRate` (±5 semitones),
2. a cached reverse of the whole take,
3. light granular scatter (2–4 overlapping grains),
4. `StereoPanner` placement (biased by position in the take),
5. a gain attack/release swell,
6. a convolver-reverb send (IR = a runtime decaying-noise `AudioBuffer` — an allowed effect).

Voice cap ~6 (oldest voice stolen). Every **8–22s a turnover** retires the oldest motif and admits the next one further down the take. That **admission frontier** advances by `step = round(N/18)`, so it traverses the whole take (then wraps into a long return) by roughly minute five — guaranteeing minute 5 holds later material than minute 1. Slow **form LFOs** breathe density (recall gap 0.9–3.4s), register bias, reverb-send and filter opening **sparse→dense→sparse**.

Nothing is synthesized: every sounding note is a slice of his recording; the only generated signal is the reverb impulse. Every audio path terminates at `createSafeMaster(ctx).input`; visuals are driven off `safeMaster.analyser`.

### Visual — SVG memory ribbon (not Canvas2D, not WebGL2)
The take's **waveform** runs along the hem; the five in-memory motifs are **strands** converging at a **loom**; a recurring motif **blooms** at its source point in the SAME cool hue and its strand brightens; a **crawling admission frontier** marker shows how far down the take we've reached; a status line reads **elapsed · form-phase · voices · motifs-in-memory**. Cool palette (cyan→violet by depth-in-take), slow luminance only — no strobe, no grain. `prefers-reduced-motion` disables the bloom animation and pins the luminance.

Graceful degradation: audio/decode failure → `text-destructive` notice; null analysis → fixed windows (status line states which cutting mode is active).

## Tags
input: none/autonomous · output: **long-form + minimal SVG** · technique: motif memory-retrieval recomposition + turnover + form LFOs · palette: cool.

## Ambition
Hits **both** target axes:
- **≥3 subsystems (5):** catalog loader + trackAnalysis motif-cutter + memory/turnover scheduler + 6-axis variation voice engine + SVG memory ribbon.
- **Named reference:** motif memory-retrieval / recombination and long-form generative music literature (below).

## References
- **David Cope, _Experiments in Musical Intelligence_ (EMI)** — recomposition by recombining recalled musical "signatures" from a corpus; the direct ancestor of this memory-retrieval-and-recombine loop.
- **Brian Eno — long-form generative music** (_Music for Airports_, _Reflection_): looping fragments of differing lengths drift out of phase so the piece is never the same twice, and evolves over very long spans.
- The "musical motif memory retrieval" framing: motifs as retrievable, variably-recalled units of a remembered piece.
