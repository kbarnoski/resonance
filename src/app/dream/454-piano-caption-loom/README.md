# 454 — Piano Caption Loom

**The one question this prototype answers:**
What if the caption a latent image is dreamed from were not written in one shot, but *refined across visible rounds* — a draft proposed from a real piano's music, then a critic agent pushes back, the agents revise, and you watch the caption sharpen before the image regenerates?

---

## How it works

### The Caption Loom (core mechanic)

At every phrase boundary or onset cluster (minimum 7 seconds apart), the Loom runs a **3-round multi-agent refinement cycle**:

**Round 0 — Draft:** Four specialist proposers emit independent clauses from the current `MusicalFrame`:
- **SceneProposer** — setting/subject from modality + dynamics
- **PaletteProposer** — hue/color vocabulary from dominant pitch-class + valence
- **MotionProposer** — movement/energy descriptors from arousal + onset density
- **StyleProposer** — artistic framing from consonance + phrase context

**Round 1 — Critique:** A Critic Agent checks each clause against the emotion target (valence × arousal computed from the music). It produces concrete, specific critiques: _"palette too cool for this warm/major phrase"_, _"motion descriptor too calm for high arousal"_, _"scene too abstract — modality is tonal, use a concrete setting"_. Only actionable critiques are emitted; if a clause already aligns, no critique is produced.

**Round 2 — Revision + Final:** Each specialist revises its clause in response to the critique. A final emotion-anchor tag (`dynamics, valence +0.4, arousal -0.1`) is appended to the style clause for maximum image-generation alignment.

The viewer **watches the prompt improve** in real time: stacked rows, critic notes inline, changed clauses highlighted in violet, confidence score rising each round.

### Musical analysis (`analysis.ts`)

Per-frame from the AnalyserNode (FFT 2048):
- Smoothed RMS → dynamics label (ppp…fff)
- 12-bin chromagram (27.5–4200 Hz) → dominant pitch-class
- Dot-product vs major/minor triad templates over all 12 roots → best modality + consonance
- Spectral-flux onset detection (rectified positive bin diff, adaptive median threshold, ~80ms debounce) → `onsetNow`, `onsetsPerMin`
- Phrase-boundary: energy dip < 30% of recent peak, sustained ~18 frames
- **Valence** ∈ [-1,1]: derived from modality + consonance (major+consonant → +1, chromatic → -1)
- **Arousal** ∈ [-1,1]: derived from RMS + onset density (fff+dense → +1, ppp+sparse → -1)

Both valence and arousal follow the **Russell (1980) circumplex model of affect**, as operationalized for music-to-image generation in arXiv 2512.23320.

### Audio sources (in priority order)

1. **Karel's real piano** via `/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81` → `createMediaElementSource` → AnalyserNode → reverb/compressor chain
2. **File drop** — drop or select any audio file → same chain, no CORS needed
3. **Warm synth fallback** (resolves on purpose) — C–Am–F–G–G7–Cmaj9 progression with arpeggios; fires automatically on load failure, CORS taint (all-zero analyser after 350ms), or silence > 2.5s

### Image → audio loopback

On each new image: sample 8×6 canvas → avg R/G/B → `brightness` controls lowpass cutoff, `warmth` (R−B) controls reverb tail length. Cool-hue blues boost master shimmer slightly.

### No-key fallback (no FAL_KEY)

Route returns 501. UI switches to "synthesized (no image key)" amber status. The plasma/particle field (`field.ts`) renders continuously — pitch-class controls hue, valence shifts the hue warmth, arousal controls plasma animation speed. The loom still runs every cycle; captions improve and are displayed whether or not an image arrives. **Complete AV piece with no API key.**

---

## Controls

| Action | How |
|--------|-----|
| Begin | Click "Begin" — creates AudioContext (required for iOS) |
| Swap audio | Drop audio file onto the canvas, or use "Swap audio" button |
| Toggle HUD | "HUD" button top-right |
| Stop | "Stop" button top-right |
| Design notes | Scroll to bottom or click "Read the design notes" on idle screen |

---

## Named references

- **arXiv 2507.20536 "T2I-Copilot"** — training-free multi-agent prompt refinement with an iterative propose → evaluate → revise loop. The Critic/Reviser structure in `loom.ts` is directly inspired by this architecture.
- **arXiv 2511.11483 "ImAgent"** — iterative prompt improvement agent that incrementally refines image generation prompts based on feedback. Informs the multi-round loom structure and the "visible improvement" UX principle.
- **arXiv 2512.23320 "Multi-Agents Semantic Emotion Aligned Music to Image Generation with Music Derived Captions"** (Dec 2025) — music-derived captions + valence-arousal emotion alignment. Directly informs the emotion-target critic checks and the valence/arousal computation method.
- **Russell (1980) circumplex model of affect** (valence × arousal) — the 2D emotion space that the critic uses as its evaluation target.
- **Bello et al. (2005) spectral-flux onset detection** — "A Tutorial on Onset Detection in Music Signals", IEEE Trans. Speech Audio Processing 13(5). Informs the half-wave rectified flux detector with adaptive median threshold in `analysis.ts`.
- **Refik Anadol** (*Machine Hallucinations*) — generative AI art responding to data as material. Referenced in the "data-painting" style clause of the proposer.
- **Memo Akten** (*Learning to See*) — contemplative AI + camera work. Referenced in the minor/chromatic style proposer.

---

## Degradation notes

| Condition | Behavior |
|-----------|----------|
| Karel's recording unavailable | Warm synth (C–Am–F–G–C) plays immediately; amber status message |
| CORS taint on audio | Detected via all-zero analyser after 350ms; synth auto-activated |
| No FAL_KEY | Route returns 501; "synthesized (no image key)" amber badge; plasma field + loom run in full |
| FAL_KEY present, image fails | `imageStatus` stays `"synthesized"`; next loom cycle will retry |
| No WebGL | Canvas 2D path only — no WebGL used |
| iOS | AudioContext created inside button tap; `ctx.resume()` called immediately |

---

## What's unverified / honest caveats

- The **loom is fully deterministic** (no real LLM calls). The "critic" and "reviser" are hand-authored heuristics, not actual agents. The arXiv references describe LLM-based multi-agent loops; this prototype demonstrates the *UX concept* of watching iterative refinement, not the full ML pipeline.
- **Valence/arousal are approximate** — computed from spectral features, not from affective computing ground truth. A real system would use a trained emotion recognition model.
- **Caption-to-image alignment** is one-directional. A true T2I-Copilot loop would also sample the generated image, check it against the emotion target, and propose further revisions. That would require an image captioning/evaluation agent and is out of scope for a client-side prototype.
- The chromagram → key/modality detection is a simplified constant-Q approximation and will be less accurate on heavily percussive or poly-tonal material.
