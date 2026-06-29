# PSYCHEDELIC.md — Altered-States Direction & Research

**Set by Karel, 2026-06-28.** This is now the **primary creative direction** for the dream lab. Read it every cycle alongside AGENT.md.

> Karel's directive, verbatim: *"let's go into very psychedelic and trippy territory where the immersive experiments transport users to psychedelic states without taking the drug. this can include cosmic ambient states too not just super intense. do deep research on dmt, lsd, mushroom, ketamine, meditative, near death, dream like states and draw inspiration from them."*

## What we're building

Drug-free immersive AV experiences that evoke the **phenomenology** of altered states — the visuals, the sound, the felt sense — using only WebGL/WebGPU + Web Audio in the browser. The user takes nothing. The screen and speakers do the work.

Two poles, both wanted — pick across the whole spectrum, don't camp on one:

- **INTENSE** — DMT breakthrough geometry, peak-LSD fractal melt, ego-dissolution. High entropy, high saturation, overwhelming.
- **COSMIC / AMBIENT** — meditative boundlessness, the NDE tunnel-toward-light, dissolution into a calm void, hypnagogic drift. Slow, weightless, luminous.

Every prototype should be able to answer: *which altered state is this, and which pole?* Tag it in STATE.md (e.g. `state: DMT-breakthrough · pole: intense` or `state: meditative-boundless · pole: cosmic-ambient`).

This direction **supersedes** the "spread across journeys / use real Paths music / pull back on voice gen" emphasis from 2026-05-21 as the *theme* driver — but all the **hard rules still hold** (Ambition & Diversity Mandate, scope fence, build-before-commit, immutability). Use Karel's real Path music as the audio source whenever it fits a state (it's a natural carrier wave — see §Audio). The Ambition & Diversity Mandate is fully compatible: these states demand never-used techniques (4D raymarching, log-polar warps, reaction-diffusion, convolution-reverb voids) and multi-subsystem builds.

---

## The single most load-bearing finding

**All psychedelic geometry is one stripe/hexagon pattern seen through a log-polar warp.** (Bressloff–Cowan, building on Klüver's four "form constants.") The retina→V1 cortical map is a complex-logarithm transform: concentric circles ↔ vertical cortical stripes, radial spokes ↔ horizontal stripes, spirals ↔ diagonals, lattices ↔ hexagons.

**So:** generate plane-wave stripes or a hexagonal Turing pattern in cortical space, apply an **inverse log-polar warp (`exp()`)** to screen space, and you get **tunnels, funnels, spirals, and honeycomb lattices from one shader.** This is the foundational psychedelic-geometry engine. Build it once into `_shared/`, drive it everywhere.

Klüver's four form constants: **(1) lattices/gratings/honeycombs, (2) cobwebs, (3) tunnels/funnels/cones, (4) spirals.** They recur across DMT, LSD, psilocybin, migraine, hypnagogia, *and flicker* — because they're a property of visual cortex, not any drug.

---

## Cluster 1 — Classic serotonergic psychedelics (DMT · LSD · psilocybin)

**Phenomenology.**
- **DMT** — the extreme. Threshold → **chrysanthemum** (dense unfolding fractal "flower") → "waiting room" shimmering architecture → **breakthrough** into a fully-realized space with "more axes than physical reality allows." Hyperbolic / negatively-curved **saddle surfaces** everywhere ("hyperdimensional bedsheets blowing in the wind"), all wallpaper symmetry groups, ultra-saturated **neon/iridescent jeweled** color, "more real than real," ~45% entity contact.
- **LSD** — slower, drifting. Surfaces **breathing** and drifting, **fractal recursion**, moiré, **color trails/tracers** (positive afterimages lagging motion), persistent **visual snow**. Gradual arc: onset ~30–60 min, long plateau, 8–12 h total.
- **Psilocybin** — organic, emotionally-toned. Speckles bloom into morphing kaleidoscopic fractals; open-eye it *enhances* natural fractal structure (foliage, bark, clouds); patterns shift **with the user's affect**, arriving in warm waves.

**Neuroscience → parameters.**
- **Entropic brain / REBUS** (Carhart-Harris, Friston): psychedelics raise cortical entropy and relax high-level priors. → Over a session, *increase noise amplitude/octaves, flow speed, and rate of pattern reorganization*; loosen symmetry at peak.
- **DMN suppression + global connectivity ↑** → dissolve boundaries between separate "objects/UI" into a unified field; melt edges, merge layers, blur figure/ground.
- **Neural gain ↑ on V1, cortical traveling waves** → push saturation/contrast; add a slow traveling-wave phase modulation sweeping the field.

**Web AV translation (named techniques).**
- Hyperdimensional geometry → **raymarch a 4D polytope** (tesseract / 120-cell) rotating in 4D, projected to 3D.
- Negatively-curved space → **Poincaré-disk hyperbolic tiling** ({7,3}) + saddle-curvature SDFs.
- Breathing fractals → **Gray-Scott reaction-diffusion** + **fBm domain warping**, LFO on the warp = "breathing."
- Form constants → **inverse log-polar warp** of stripes/hex (see above).
- Color trails → **ping-pong feedback buffer** with decay.
- Jeweled color → **thin-film iridescence shader** + **chromatic aberration** + saturation/gain boost + palette cycling.
- Visual snow → animated **blue-noise grain** overlay at low alpha.
- Chrysanthemum / wallpaper symmetry → **N-fold kaleidoscope UV folds**, animate fold count to "bloom."

---

## Cluster 2 — Dissociative + near-death (ketamine · NDE)

This cluster anchors the **cosmic-ambient / void** pole. Differentiator from Cluster 1: **less ornate-fractal, more spatial/architectural** — vast voids, tunnels, sparse luminous structures, drifting through dark space, receding depth.

**Phenomenology.**
- **Ketamine "K-hole"** — depersonalization, derealization, dissolution of body schema, floating/OOB, ego dissolution, severe **time dilation**, "melting into the surrounding," cosmic oneness. Quieter and more internal than psychedelics.
- **NDE** (Moody / Greyson / van Lommel / Parnia AWARE) — leaving the body → **tunnel/darkness** → **being of light** → life review → boundary → return. Peace/oneness, altered time, **hyper-lucidity ("realer than real")**, ineffability.
- **Tunnel-toward-light** candidate mechanism: retinal/cortical hypoxia constricting the field to a bright center (the literal "tunnel vision" of ischemia). **Gamma surge at death** (Borjigin, PNAS 2013 rat / 2023 human) — a ~30s surge of high-frequency gamma resembling conscious/dreaming states. *(DMT/endogenous-tryptamine theories of NDE remain speculative — do not present as fact.)*

**Neuroscience → parameters.**
- Ketamine = **NMDA antagonist** → thalamocortical disconnection / sensory-gating breakdown. → **Decouple the audio envelope from visual motion** (desync the two streams the brain normally binds); **thin sensory density** (sparse geometry); **slow time** (stretch every curve).
- **Gamma surge** → a brief **hyper-lucid clarity snap**: everything snaps to impossibly sharp, high-contrast, high-coherence focus before the return.

**Web AV translation.**
- NDE tunnel → **raymarched infinite wormhole** (sin/cos camera path through domain-repeated SDF space).
- Being of light → **center-out radial bloom**, additive glow growing on approach.
- Hypoxic tunnel vision → animated **vignette / peripheral darkening** constricting to a bright center.
- Spatial vastness → **exponential depth fog** + parallax over sparse drifting luminous structures.
- Dissociation → **audio-visual desync engine** (lag/offset audio envelope vs visual motion).
- Time dilation → one global `timeScale` uniform driving all animation + DSP rate.
- Body-schema melt → vertex-displacement / domain-warp shear on flat planes.
- OOB camera → gyroscope/scroll-driven untethered float, no fixed up-vector.

---

## Cluster 3 — Endogenous states (meditation · hypnagogia · dreams)

Especially relevant because the brain produces these **with no drug at all** — the closest existing proof that screens/sound can move consciousness.

**Phenomenology.**
- **Deep meditation** (jhāna, non-dual) — awareness becomes "expansive, boundless, subtle," spacious emptiness, luminosity ("clear light"), timelessness, witnessing/pure-awareness, self/other collapse. Long-term meditators self-induce **high-amplitude gamma synchrony** (Lutz/Davidson, PNAS 2004). Maps to the **"Oceanic Boundlessness"** dimension of altered-states scales.
- **Hypnagogia** (sleep threshold) — drifting geometric/organic forms, faces, landscapes, the "Tetris effect," warped autobiographical scenes.
- **REM / lucid dreams** — narrative incoherence, scene morphing/teleportation, impossible architecture, dream logic, heightened emotion. (MIT **Dormio** / targeted dream incubation, Adam Haar Horowitz.)

**The flicker payload (KEY).** Stroboscopic light on closed eyes reliably evokes the **Klüver form constants with no drug** — most intense around **~10 Hz**. Lineage: Purkinje → Grey Walter → Brion Gysin's **Dreamachine** (1959) → Collective Act's **Dreamachine** (2022). The **Ganzfeld** (uniform unstructured field → brain amplifies neural noise into imagery) and **Ganzflicker** (uniform field pulsed at alpha 8–12 Hz) are directly screen-implementable.

> **⚠ SAFETY — PHOTOSENSITIVE EPILEPSY. NON-NEGOTIABLE.** Flicker in **3–30 Hz** can trigger seizures; **~15–20 Hz is highest risk.** Any flicker/strobe feature MUST: (a) show a pre-experience warning + explicit opt-in; (b) **default to ≤3 flashes/sec** or a non-flicker mode; (c) restrict higher-rate modes to small, low-contrast, soft-edged regions — **never full-screen high-contrast**; (d) offer an instant stop/kill. Validate against Harding-style criteria. When in doubt, don't flicker — use slow luminance drift instead.

**Entrainment — calibrate honesty.** Binaural/monaural/isochronic beats: evidence is **mixed/weak** — use for *atmosphere*, never promise a neuro-effect. 40 Hz light+sound (MIT GENUS / Tsai lab) is a *clinical/coherence* tool (Alzheimer's), safe and well-tolerated, **not** a hallucination driver — frame as "coherence/luminous finale," not "trip." Flicker-induced geometry, by contrast, **is** robustly documented.

**Audio for trance.** Sustained drones (La Monte Young), **Deep Listening** (Pauline Oliveros, ~45s reverb), Eno ambient. **Shepard / Shepard–Risset glissando** for endless ascent (octave-spaced sine partials under a Gaussian amplitude window, looped imperceptibly). Breath-paced macro-tempo ~0.1 Hz (~5.5 breaths/min).

**Web AV translation.**
- **Ganzfeld field** — full-viewport uniform color with imperceptibly slow perlin color-drift.
- **Safe photic-pulse engine** — luminance modulation clocked off `requestAnimationFrame` + AudioContext, ≤3 Hz default, warning gate, instant kill.
- **Form-constant overlay** synced to the (safe) pulse — morph grids→spirals→tunnels→targets.
- **Breath-paced luminous mandala** — radial bloom expand/contract at ~0.1 Hz.
- **Particle "dissolution into light"** — cloud whose boundaries fade to white (non-dual self-boundary dissolution).
- **Shepard–Risset generator** — Web Audio oscillator bank, octave-spaced partials, Gaussian window.
- **Generative drone bank** — detuned oscillator/sample layers, long cross-fades, convolution reverb (cistern-style IR).

---

## Audio direction (all clusters)

- **Music is the carrier wave, not background.** Kaelen's *The hidden therapist* (Imperial, 2018): in psychedelic therapy the *music* guides the journey; outcome tracked liking + resonance + openness, **not** drug intensity. → The soundtrack is the structural spine; slave visuals to it via FFT; place the emotional peak of the music at the visual breakthrough.
- **Use Karel's real Path piano** as the carrier whenever a state fits (read audio URLs via `/api/audio/[id]`; `journey_paths` groups the Welcome Home album). Synesthesia mapping: FFT bands → palette + domain-warp amplitude (bass→global flow, highs→fine detail, loudness→saturation/gain — mirrors the neural-gain finding).
- DSP for "drift/melt": **granular synthesis** + **phase-vocoder pitch-bend**, slow detune LFOs.
- DSP for "void/underwater": **convolution reverb** (`ConvolverNode`, long IR) + **granular time-stretch** + a low-pass that opens at the light moment; binaural/ambisonic panning for vastness.

---

## The journey arc (slave visuals + audio to ONE timeline)

Mirror the clinical psychedelic-playlist phases. The same skeleton serves both poles — intense pushes entropy/saturation hard at peak; cosmic-ambient stays slow, weightless, luminous.

1. **Onset (0–15%)** — stillness, low entropy, faint breathing, subtle grain. Drone/ambient.
2. **Come-up (15–35%)** — drift and trails begin; form constants emerge faintly; warmth + saturation rise.
3. **Peak / breakthrough (35–60%)** — entropy max (intense) OR boundless/void (cosmic): 4D geometry / chrysanthemum bloom / hyperbolic lattices / center-out light; edges fully melted; most evocative music here.
4. **Plateau (60–80%)** — sustained but slower morphing; emotionally-toned waves.
5. **Return (80–100%)** — symmetry re-forms, entropy/saturation decay, grain fades to calm — soft landing (honor Resonance's "transitions must never feel abrupt" rule).

---

## Diversity within the new theme

Don't let "psychedelic" collapse into one look. Rotate deliberately across:
- **State**: DMT · LSD · psilocybin · ketamine · NDE · jhāna/meditation · hypnagogia · lucid-dream.
- **Pole**: intense ↔ cosmic-ambient.
- **Core technique**: log-polar warp · 4D raymarch · reaction-diffusion · hyperbolic tiling · feedback trails · Ganzfeld · convolution-void · Shepard ascent · particle dissolution.
- **Palette**: neon-iridescent (DMT) · pastel-drift (LSD) · warm-organic (psilo) · dark-void-luminous (ketamine/NDE) · soft-white-boundless (meditation) · dim-warped (hypnagogia).

The diversity audit (last-10, ban tags ≥4×) still applies — now run it over these state/pole/technique/palette tags.

---

## Shared infrastructure to build (multi-cycle, high-ambition)

Seed these into `_shared/` so later cycles compose fast — each clears the Ambition Floor:
1. **`logPolarWarp.glsl`** — the form-constant engine (stripes/hex → exp() warp).
2. **`feedbackBuffer.ts`** — ping-pong trail accumulator.
3. **`raymarch4D.glsl`** — 4D polytope + hyperbolic SDF helpers.
4. **`entropyController.ts`** — one global parameter ramping noise octaves / flow speed / reorganization across the arc.
5. **`safeFlicker.ts`** — the gated, ≤3 Hz-default photic engine with warning + kill (gate EVERYTHING flicker through this).
6. **`shepard.ts`** + **`droneBank.ts`** + **`convolutionVoid.ts`** — the ambient/void audio kit.

---

## Sources

Classic psychedelics: [Form constant (Wikipedia)](https://en.wikipedia.org/wiki/Form_constant) · [Bressloff–Cowan, plus.maths "Uncoiling the spiral"](https://plus.maths.org/content/uncoiling-spiral-maths-and-hallucinations) · [Quanta: math of hallucination](https://www.quantamagazine.org/a-math-theory-for-why-people-hallucinate-20180730/) · [DMT phenomenology, Sci Reports](https://www.nature.com/articles/s41598-022-11999-8) · [QRI hyperbolic geometry of DMT](https://qualiacomputing.com/2016/12/12/the-hyperbolic-geometry-of-dmt-experiences/) · [REBUS (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6588209/) · [Entropic brain (Frontiers)](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2014.00020/full) · [LSD neuroimaging, PNAS](https://www.pnas.org/doi/10.1073/pnas.1518377113) · [Kaelen "hidden therapist" (Beckley)](https://www.beckleyfoundation.org/2018/02/08/new-evidence-for-a-central-role-of-music-in-psychedelic-therapy/)

Dissociative/NDE: [Moody, Life After Life (Wikipedia)](https://en.wikipedia.org/wiki/Life_After_Life_(Moody_book)) · [AWARE study (Psi Encyclopedia)](https://psi-encyclopedia.spr.ac.uk/articles/aware-nde-study/) · [Gamma surge at death, PNAS 2013](https://www.pnas.org/doi/10.1073/pnas.1308285110) · [Human gamma surge, PNAS 2023](https://www.pnas.org/doi/10.1073/pnas.2216268120) · [Ketamine ego dissolution (Frontiers)](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2017.00245/full)

Endogenous: [Jhāna gamma synchrony, Lutz/Davidson PNAS 2004](https://www.pnas.org/doi/10.1073/pnas.0407401101) · [Flicker frequency/form-constants, PLOS One](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0284271) · [Dreamachine 2022 (Dezeen)](https://www.dezeen.com/2022/02/21/dreamachine-art-visual-experience-unboxed-creativity-uk/) · [Ganzflicker, Nature Sci Reports](https://www.nature.com/articles/s41598-024-52372-1) · [MIT 40 Hz GENUS safety](https://news.mit.edu/2022/small-studies-40hz-sensory-stimulation-confirm-safety-suggest-alzheimers-benefits-1213) · [MIT Dormio dream incubation](https://news.mit.edu/2020/targeted-dream-incubation-dormio-mit-media-lab-0721) · [Photosensitive epilepsy (Epilepsy Society)](https://epilepsysociety.org.uk/about-epilepsy/epileptic-seizures/seizure-triggers/photosensitive-epilepsy) · [Shepard tone (Wikipedia)](https://en.wikipedia.org/wiki/Shepard_tone)

**Accuracy caveats:** QRI essay is analytical, not peer-reviewed. DMT-as-NDE-mechanism is speculative. Binaural/isochronic entrainment evidence is mixed/weak. Jhāna neuroimaging is small-N. 40 Hz benefits are clinical (Alzheimer's), not consciousness-altering. Flicker-induced geometry and the log-polar/form-constant result, by contrast, are robustly established. **Do not overstate the science in prototype copy — evoke the phenomenology, don't make medical claims.**
