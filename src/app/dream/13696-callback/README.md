# 13696 · Callback

## The one question
**What if you could improvise a duet WITH one of Karel's own recordings — he plays a phrase, then it's your turn, and the keys you answer on are voiced entirely by grains of HIS OWN piano sound?**

This is a *playable instrument*, not a press-play visualizer. You actively answer back, and the answer is made of his sound.

## How it works

### The concatenative-grain instrument
On load we decode one of Karel's real recordings and scan it for a small **corpus of grains** — short (~240 ms) windows grabbed at moments of clear attack (a windowed-RMS positive-flux onset heuristic, with even-spacing fallback). Pressing a key triggers one of those grains, **pitch-shifted** to a scale degree via `AudioBufferSource.playbackRate` and windowed with a short fade-in/out so it never clicks. The keys are mapped to **C-major pentatonic** (`A S D F G H J K`) so any melody you play stays consonant. The result: you play melodies, but every note is *his* piano tone, re-voiced. `[` / `]` swap which grain of his sound the whole keyboard is built from.

### The call-and-response frame
A loose **8-beat clock** alternates:
- **His call** — 4 beats of the *actual* recording play through the master bus (a real 4-second phrase), advancing to the next segment of the track each cycle.
- **Your turn** — 4 beats of rest where the "YOUR TURN" lane lights violet and you answer on the keys.

A subtle, quieter **echo** trails each note a beat later so your answer sits inside his sound world. Nothing is hard-gated — you can jam over his call too — but the visual metronome and lane highlight make the turn structure clear.

### The visual (SVG only)
A horizontal call/response timeline: his phrase as a waveform lane up top, your answered notes as violet marks (pitch = height) under a sweeping playhead, an 8-dot metronome, and a key-row that lights on press. The shared `safeMaster` analyser amplitude pulses the active elements. Cool + paper-ink: near-black ground, off-white staff ink, violet for the "your turn" state. No Canvas2D.

## Named reference
Corpus-based concatenative synthesis lineage — IRCAM **CataRT** (Diemo Schwarz, corpus-based concatenative synthesis) and **"The Concatenator: A Bayesian Approach to Real-Time Concatenative Musaicing"** (arXiv:2411.04366). Callback borrows the "play an instrument built from a corpus of one recording's grains" idea and wraps a call-and-response duet frame around it.

## Controls
- **Begin the duet** — loads the recording and starts the clock.
- **`A S D F G H J K`** or tap the on-screen keys — play a grain, pitch-shifted to that pentatonic degree.
- **`[` / `]`** or the ◀ ▶ buttons — cycle the timbre grain (which slice of his sound the keys are voiced by).
- **His recording** — pick any track from Karel's verified catalog (Welcome Home + Snowflake); default *Interplay*. Changing it live rebuilds the grain corpus.
- **Output level** — final trim on the shared ear-safety master bus.

## Audio rule
Karel's verified catalog only (`REAL_TRACKS` = Welcome Home + Snowflake), loaded via `loadRealTrackBuffer`, every source routed through `createSafeMaster`. No synth or oscillator tones anywhere. Load failure surfaces a `text-destructive` notice and never crashes.

## Next-cycle deepening
- **Nearest-grain matching** by target pitch *and* loudness (true CataRT descriptor matching / the Concatenator's Bayesian selection) instead of one grain at a time.
- **Onset-aligned call phrases** so his half always begins on a note attack rather than mid-decay.
- **Harmonic memory** that transposes your answer back into the recording's detected key.
- **Two-hand / shadow mode** where the echo voice tracks a third above what you play.
