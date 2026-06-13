**For**: kids (4+)

Grab a luminous sheet of silk and pull it — the sheet's tension bends a warm choir/bowed-string chord, so pulling it taut makes the voices rise and brighten and letting it billow lets them sigh and fall.

## How it works

The sheet is a 2-D grid of point masses (34×24) connected by distance constraints, integrated with **verlet / position-based dynamics**: each node's velocity is implied by `position - previousPosition`, and a few relaxation passes per frame satisfy the structural (horizontal/vertical) and shear (diagonal) springs. The top edge is pinned so the silk hangs like a curtain and billows under a gentle gravity. When `navigator.gpu` exists, the whole solver runs in a **WebGPU compute shader (WGSL)** — one integrate pass plus several relaxation passes over storage buffers, copied back each frame to draw and to read tension; otherwise the identical maths runs on the CPU. Both paths render the same way: glowing additive filaments on a Canvas2D surface (`render.ts`), violet at rest and warming to gold where the silk is pulled taut.

Touch (or mouse) grabs the nearest node and drags it. The sheet is split into six vertical regions; for each, we measure the **mean stretch past rest length** — that 0..1 tension is the only control signal. Each region sustains one voice of a consonant just-intonation chord over A2 (ratios 1/1, 9/8, 5/4, 3/2, 2/1, 9/4 — a bright major-add9). The voices' pitch glides **continuously** with tension (up to ~5 semitones, via `setTargetAtTime` portamento) and a per-voice lowpass opens as you pull, so the chord physically *bends* under your hands and resolves home on release. There is no note-tapping anywhere. The master chain is kids-safe (`gain -> lowpass <= 8 kHz -> compressor -> out`) and the AudioContext is created inside the first tap. The sheet shimmers from frame one; after a few idle seconds an invisible **auto-demo** sweeps a grab across the silk so it audibly sings on a silent phone glance, and any real touch cancels it.

## Named references

- **Thomas Jakobsen, *Advanced Character Physics* (GDC 2001)** — the verlet + position-based distance-constraint cloth formulation this membrane is built on (velocity-free integration, iterative constraint relaxation, pinned points). The silk *is* a Jakobsen cloth.
- **Ondes Martenot / Theremin** — the continuous-expressive-pitch lineage. Like the Martenot's ribbon or the Theremin's field, pitch here is bent smoothly by the hand rather than chosen from discrete keys; the membrane's tension is the continuous controller, and that decision (no pentatonic taps, glide always) comes straight from this lineage.
