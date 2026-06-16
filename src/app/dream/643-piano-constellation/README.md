# 643 · Piano Constellation

**One question:** *What if Karel's solo piano could be taken apart down to its 12 individual notes — each pitch class isolated from the recording — and then PLAYED BACK as an instrument made of his own touch, where tapping a note re-fires that note's isolated material?*

This is the **cycle-3 deepening** of a three-prototype arc that vivisects Karel's real solo-piano recording:

1. **`606-piano-vivisection`** split the piano into HARMONIC (sustained strings) vs PERCUSSIVE (hammers) via median-filter HPSS.
2. **`630-piano-refract`** fanned the harmonic layer by NMF into FOUR register bands you solo / mute / re-mix.
3. **`643-piano-constellation` (this one)** goes *finer than register bands*: it isolates the **12 PITCH CLASSES** (C, C#, … B) of his playing — and makes them **playable**. The signature cycle-3 move is **REPLAY**: tapping a note-orb or pressing a key re-fires that pitch class's own isolated material back as new sound. The recording becomes an instrument.

## The salience-mask method (how the 12 notes are isolated)

We keep the proven HPSS ground (Fitzgerald 2010) so the isolation runs on a clean **harmonic** layer (the strings), free of hammer transients. Then, on the harmonic complex STFT:

1. **Salience (Klapuri).** For each frame and each candidate fundamental across the piano range (MIDI 33–96, one per semitone), compute a salience = the **sum of harmonic-comb amplitudes**: `Σ_h w_h · mag[bin(h·f0)]` over the first 6 partials, with partial weights decaying as `0.78^(h-1)`. A note that is really sounding lights up its whole comb; spurious single bins do not.

2. **Per-pitch-class support (Fujishima chroma).** Each candidate's salience is splatted back onto its own comb bins and **folded by octave into its pitch class** (MIDI mod 12). This yields, per frame, 12 dense per-bin "support" spectra `S_c[bin]` — a chroma profile that remembers *which bins* belong to each class, not just a 12-number histogram.

3. **Soft mask = partition of unity.** `M_c[bin] = S_c[bin] / (Σ_j S_j[bin] + ε)`. Because the 12 masks sum to 1 at every bin (with a tiny flat floor keeping it well-conditioned), they **repartition the original complex STFT exactly** — applying all 12 and summing reconstructs the harmonic layer, and each mask scales real & imaginary parts together so **phase is preserved**.

4. **ISTFT × 12.** Each masked complex spectrum is inverted (overlap-add) into a mono PCM buffer → **12 isolated pitch-class buffers**, plus the **Hammers** buffer straight from HPSS. A single common gain scales all 12 so their *sum* peaks at ~0.9, preserving the partition-of-unity balance.

The whole pipeline is **chunked with `await` yields** (HPSS = first 40% of the bar, chroma isolation = last 60%) so the tab never freezes; a progress bar tracks it.

## The REPLAY / granular layer (the cycle-3 distinguishing feature)

Every isolated buffer also feeds a **replay bus**. Tapping a note-orb, or pressing its key, plucks a **short ~0.34s grain** from a random salient region of that pitch class's buffer, wraps it in a click-free attack/hold/release envelope, gives it a tiny random playback-rate shimmer (so layered taps don't phase-cancel), and fires it through the replay bus → master compressor. **Multiple taps layer** — you can re-perform Karel's recording as chords and rhythms built from his own note material. Each replay also drives a visual **flare** on that note's constellation. (Granular building blocks per Roads.)

The 13 base voices (12 chromas + hammers) **always loop, sample-aligned**; solo / mute / gain only ramp GainNodes (`setTargetAtTime`, ~20ms), so toggling is instant and click-free. The replay grains ride on top of whatever is currently looping.

## The three.js constellations

Twelve **star clusters** (one per pitch class) orbit a central glowing core, evenly spaced on a tilted ring; the hammers form a 13th cluster close in and low. Each cluster:

- **brightens + expands** with its live level from a per-voice `AnalyserNode`,
- **FLARES** (a fast white pulse + star jitter + size burst) when you replay/grain it,
- is **pulled forward and glows** when soloed; **dimmed and faded** when muted or soloed-out.

On mount the scene **orbits gently and the core breathes immediately**, so a silent glance already looks alive. After ~2.5s idle an **auto-demo** cycles the soloed note *and replays it as a grain* (showing off the REPLAY layer); any interaction preempts it instantly. Geometries, materials, textures, and the renderer are all disposed on unmount.

## Controls

- **Replay (primary):** tap any note-orb, or press `A W S E D F T G Y H U J` → the 12 chromas (C..B), `X` → hammers. Layers stack.
- `←/→` select a voice · `Enter` solo selected · `m` mute selected · `0` reset (all on) · `space` play/pause.
- **On-screen:** 13 note-orbs (tap = replay, ≥44px), each with solo / mute sub-buttons, plus reset / play-pause.

## Fallbacks (degrade gracefully)

- Karel's recording fetch fails → synthesized piano fallback (amber notice "synthesized piano — recording unavailable"); the chroma pipeline still runs on real harmonic + percussive content.
- WebGL unavailable → a rose notice ("WebGL unavailable — visuals disabled, audio still fully playable"); audio stays fully interactive.
- Audio is gated behind the **Begin** gesture, which builds and resumes the `AudioContext` (iOS-safe). Heavy DSP is chunked with `await` and a progress bar.

## Subsystems

- `audio.ts` — fetch Karel's real solo-piano recording (`/api/audio/<id>`) + synthesized fallback. Copied verbatim from 630.
- `hpss.ts` — STFT / ISTFT, median-filter HPSS `decompose()`. Copied verbatim from 630.
- `chroma.ts` — salience tracking + per-pitch-class harmonic-comb partition-of-unity masks → 12 isolated PCM buffers (+ activation envelope / mean-chroma for viz).
- `scene.ts` — three.js renderer: 12 + 1 orbiting star-constellations with level/flare reactivity, idle animation, full disposal.
- `page.tsx` — client component: Begin → HPSS → re-STFT strings → chroma isolation → 13 looping voices + the granular **replay** layer, controls, render loop, auto-demo.

## Next-cycle deepening

A cycle-4 could let replay grains be **re-pitched** (so one isolated note becomes a whole keyboard via playback-rate), add a **looper/sequencer** that records your taps into a phrase made of Karel's notes, run **iterative comb refinement** (EM-style re-estimation of which partials belong to which fundamental to sharpen octave/fifth confusions), or expand isolation from 12 pitch classes to **per-octave notes** so the constellations become a full 88-key field. The salience function could also drive a live transcription overlay.

## References

- T. Fujishima, "Realtime Chord Recognition of Musical Sound: A System Using Common Lisp Music," *ICMC*, 1999. (Pitch Class Profile / chroma: fold spectral energy into 12 octave-invariant pitch classes.)
- A. Klapuri, "Multiple Fundamental Frequency Estimation by Summing Harmonic Amplitudes," *ISMIR*, 2006. (Salience as the sum of partial amplitudes at integer multiples of each candidate F0.)
- D. Fitzgerald, "Harmonic/Percussive Separation using Median Filtering," *DAFx*, 2010. (The HPSS ground: per-bin median across time → strings; per-frame median across frequency → hammers.)
- C. Roads, *Microsound*, MIT Press, 2001. (Granular synthesis — the enveloped-grain replay layer.)
