// Design-notes prose for the in-app modal. Kept in sync with README.md.
export const README_TEXT = `Morphosong — hum a living organism into being.

THE QUESTION
What if you could HUM an organism into being — where your pitch breeds a
different psychedelic Turing-pattern morphology, and the pattern you SEE is
exactly the shimmer you HEAR?

STATE / POLE
Psilocybin morphing-fractal bloom · pole: INTENSE.

THE LOOP (and it closes)
1. YOU HUM. The microphone is pitch-tracked by time-domain autocorrelation
   (more stable than FFT for a sustained tone) plus RMS energy. The analyser is
   a dead-end — the mic is never wired onward, so feedback is impossible.
2. PITCH BREEDS MORPHOLOGY. Your pitch steers the feed/kill parameters of a real
   Gray–Scott reaction-diffusion simulation running in a WGSL COMPUTE shader
   (two ping-ponged storage buffers of [U,V] concentrations, 9-point Laplacian,
   eight sub-steps a frame). Low hums grow mazes and stripes; higher ones bloom
   honeycomb, then coral worms, then dividing spots. RMS drives growth rate and
   bloom brightness.
3. YOU SEE FORM CONSTANTS. A render pass warps the field through a log-polar /
   cortical map, so the flat petri pattern reads as tunnels, spirals and
   honeycomb — the Klüver form constants — in a warm amber→magenta→violet
   psilocybin palette.
4. IT RE-VOICES ITSELF. A compute reduction reads the field's spatial statistics
   back to the CPU each few frames — mean V, variance (spottiness), gradient
   (edge density). Those scalars set the amplitudes of a bank of inharmonic
   partials over a low root. What swells on screen swells in your ears. That is
   the weld: SEE ≈ HEAR.

REFERENCES (real ones)
• Alan Turing, "The Chemical Basis of Morphogenesis" (1952) — reaction-diffusion
  as the origin of biological pattern.
• Gray & Scott — the autocatalytic U + 2V → 3V system whose feed/kill plane holds
  the whole morphology zoo.
• Bressloff & Cowan (2001–02) — the retina→V1 complex-logarithm map under which
  all the Klüver form constants are one geometry seen in cortical coordinates.
The fresh axis is not any one technique but their COMBINATION: GPU-compute
reaction-diffusion rendered in cortical space, its morphology bred by a hum, and
its field statistics re-voicing the drone.

SUBSTRATE
WebGPU compute (WGSL) is the primary renderer. If navigator.gpu is missing, the
piece degrades to a small Canvas2D reaction-diffusion fallback so it is never
blank, and the audio stays coupled to the (CPU-computed) field statistics.

SAFETY
No strobe. Luminance only drifts slowly (~0.05 Hz breathing); reaction-diffusion
morphs are inherently slow and kept so. prefers-reduced-motion is honored. The
mic analyser is a dead-end and the output drone never routes into it.

HONEST KNOCKS
• The pitch→(feed,kill) path is a curated diagonal through Gray–Scott space, not
  an exhaustive atlas — it visits four regimes rather than every morphology.
• Autocorrelation on a breathy or noisy hum can octave-jump; a gate and heavy
  smoothing hide most of it but not all.
• Reaction-diffusion has latency: a new pitch takes a second or two to re-grow
  the field, so the pattern lags the voice on purpose (it is growing, not
  cutting). The re-voicing therefore trails the hum by that same beat.
• The stats readback is one frame stale by design (async map), so the audio
  coupling is ~16 ms behind the pixels. Inaudible, but real.`;
