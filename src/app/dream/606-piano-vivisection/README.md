# 606 · Piano Vivisection

**Take Karel's own recorded piano apart into the singing strings (harmonic) vs. the hammer / key noise (percussive) — and remix the two layers live.**

This is the lab's first audio *source-separation* instrument. It performs surgery on a real solo-piano recording, splitting it into two re-synthesized layers you can morph between with off-glass controls while a WebGL2 field shows the machine inside the warm piano.

## How it works — median-filter HPSS (in plain language)

A piano note is two things at once: a **sustained, pitched tone** (the strings ringing) and a **sharp, brief click** (the hammer hitting and the key/action noise). On a spectrogram — frequency over time — those look different:

- The strings draw **long horizontal trails**: the same pitch held over many time-frames.
- The hammer strikes draw **short vertical lines**: a burst of energy spread across many frequencies in a single instant.

Median filtering exploits exactly that geometry:

1. **Slice & prep.** Downmix to mono, downsample to ~22 kHz, and take a ~9s slice starting where the music actually begins (so compute stays fast).
2. **STFT.** Slide a Hann window (FFT size 1024, hop 256) across the slice to build the magnitude spectrogram, keeping the original complex values (magnitude **and** phase).
3. **Harmonic estimate (H).** Run a median filter **across time** for each frequency bin (~17 frames). Sustained trails survive; transient spikes get smoothed away.
4. **Percussive estimate (P).** Run a median filter **across frequency** within each frame (~17 bins). Vertical strikes survive; steady tones get smoothed away.
5. **Soft Wiener masks.** With power *p = 2*: `maskH = H² / (H² + P² + ε)` and `maskP = P² / (H² + P² + ε)`. These are gentle, energy-preserving masks rather than hard cuts.
6. **Re-synthesis.** Apply each mask to the **original** complex STFT (scaling magnitude, **keeping the original phase**), then inverse-STFT with overlap-add to get two audio buffers: a **strings-only** layer and a **hammers-only** layer.

The decomposition runs once on load, chunked across event-loop ticks with a visible progress bar so the UI never hard-freezes.

## Reference

Derry Fitzgerald — **"Harmonic/Percussive Separation using Median Filtering"**, *Proc. DAFx 2010*. This simple, elegant median-filter formulation is the technique implemented here.

It is the classical ancestor of modern deep-neural-network source separation (e.g. the 2026 DNN separators, *arXiv 2603.04032*) which learn far finer masks — but the median-filter method needs no training data and runs entirely in the browser.

## Controls

Off-glass control is the point.

**Keyboard (primary)**
- `1` — solo / mute the strings layer
- `2` — solo / mute the hammers layer
- `←` / `→` — shift the balance continuously (strings ↔ hammers)
- `↑` / `↓` — overall gain
- `space` — play / pause

**Device tilt (mobile)** — lean left/right to morph the balance (`deviceorientation`; iOS 13+ asks permission on the Start gesture). Falls back silently to keyboard if unavailable.

**On-screen faders** — a secondary fallback only.

After ~2.5s of no interaction the instrument auto-starts and gently sweeps the balance back and forth, so even a silent glance shows the field alive and hears the two layers separate. Any real input preempts the demo instantly; it resumes after ~5s idle.

## Visual

A WebGL2 (hand-written GLSL ES 3.00) spectral field. Harmonic energy renders as glowing **horizontal** cyan/steel streaks; percussive energy as sharp **vertical** magenta/white strikes. The balance visibly tilts which layer dominates, and a bright playhead sweeps in time with playback. Clinical, surgical palette — a vivisection of the warm piano sound.

## Honest limitations

- Median-filter HPSS is **not** a perfect "strings vs. hammers" split — it separates *harmonic* from *percussive* energy. The sustained body of a note is mostly harmonic and the attack is mostly percussive, so the metaphor holds, but expect bleed: reverb tails leak into "strings", and sustained noise can leak into "hammers".
- It's a single fixed window/kernel choice; very fast trills or heavy pedal blur the geometry the filter relies on.
- The slice is short (~9s) and downsampled to ~22 kHz to keep the in-browser compute fast, so the very top octave is dimmer than the original.
- If Karel's recording can't be fetched within 4s, a synthesized solo-piano fallback is decomposed instead (shown in amber in the UI) so the technique always has real harmonic + percussive content to split.
