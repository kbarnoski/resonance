# Morning digest — last updated 2026-06-27 (~12:25 UTC)

Cycle 573 · **adult** · WIDE (3 orthogonal explorers, orchestrated). Shipped 1, banked 2.

## New since yesterday
- **[/dream/986-empty-words](https://getresonance.vercel.app/dream/986-empty-words)** — *Empty Words.* **Paste any text — a poem, an email, Thoreau — and a transparent engine *sets it to music*.** Vowels pick scale degrees of a real mode, stressed syllables land downbeats, punctuation breathes and cadences, capitals get louder — and a live "now singing" readout names the exact letter that caused every note. **Try it on your laptop right now: type your own sentence and hear it compose** (no mic/camera/hardware — just type).
  - *Why it's different:* the explainable, **deterministic** inverse of 2026's neural text→music black boxes (Text2midi / MeloTrans / diffusion). No model, fully offline, **the same text always makes the same piece** — and you can read *why*. The lab's **first-ever text-as-score input** (0× before). Engraved ink-on-charcoal manuscript, not a cosmic nebula. Named ref: **John Cage's _Empty Words_ (1974)**.
  - *Verification — the best dent in a while:* the composition is **headless-proven deterministic** (Node dry-run was byte-identical across runs, even on empty/all-punctuation/400-word/unicode edge cases) AND fully **hand-verifiable by typing**. Direct hit on the jury's #1 standing liability.

## Also explored (banked, not shipped — IDEAS §573)
- **985-quake-choir** ⭐ RESURRECT-FIRST — **hear the planet's last 24h of earthquakes**: the live USGS feed → a slow choir of inharmonic modal bells over a drone, plotted on a WebGL2 seismographic map. The builder fetched the **real feed end-to-end (202/202 quakes parsed, live)**, with a seeded offline fallback — so it's genuinely near-shippable and verifiable. De-selected only because 986 was the freshest input + the research-chained flagship.
- **987-tilt-spectra** — tilt the device to **sculpt a sound's spectrum directly** (brightness × inharmonicity), drawn as a CRT-phosphor oscilloscope where the scope *is* the literal waveform. The embodied sound-as-object twin; needs a real tilt device to feel right.

## Research finding worth a look (RESEARCH §573)
- The 2026 text/prosody→music frontier is **uniformly opaque neural** (prosodic-dynamics arXiv:2606.25369 Jun 25 · VoiceTTA 2606.26534 Jun 26 · Text2midi · MeloTrans · diffusion-symbolic). The on-mandate inversion — and what 986 is — is a **deterministic, *authored*** text-setting engine where every note carries a stated reason. Fourth dive in a row to invert an opaque-neural frontier (counterpoint→Fux, full-song→tension, streaming→physical-bells, now text→Cage).

## Open questions for Karel
- **986 is keyboard-free and hand-verifiable — please type a sentence and tell me how the setting *reads* musically.** The vowel→degree map and stress heuristic are reasoned choices; one real read would let me tune them (a pronunciation dictionary could replace the heuristic later).
- Two real infra fixes still need you: (a) raise the container ~4096-fd ceiling so Next static-gen runs locally, or (b) a hand-verify pass on a device. Everything else builds green + Vercel-deploys.
