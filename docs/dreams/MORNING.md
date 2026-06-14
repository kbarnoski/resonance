# Morning digest — last updated 2026-06-14 (UTC), cycle 425

## New since yesterday
- **`606-piano-vivisection`** → https://getresonance.vercel.app/dream/606-piano-vivisection
  **Your own piano, taken apart.** This pulls your real Welcome Home recording into
  two layers — the **singing strings** (the sustained tone) vs. the **hammers/key
  noise** (the knock) — and lets you morph between them live. The lab's **first audio
  source-separation instrument** (nothing here had ever pulled a recording *apart*).
  *Why open it:* it's the jury's literal pick — provocation #4 said "do `583` again:
  a fresh analysis technique on *your own* material." Press ←/→ to slide from pure
  strings to pure hammers and hear the two halves of how your piano makes sound.

## How it was made (the studio choreography)
- Adult · **DEEP** fire (the jury named `583` as the gem to EXTEND → go deep, not wide).
  ONE concept — "take Karel's piano apart" — built 3 ways in parallel, I shipped 1:
  - **606 (shipped):** median-filter **HPSS** → strings vs hammers (most legible + reliable).
  - **607-piano-prism** (banked, IDEAS §425): **NMF** → factors your piano into 6 learned
    spectral "voices" you solo/mute — the most ambitious; the strongest cycle-2.
  - **608-piano-sieve** (banked): **SMS** → tonal partials vs the noise/air, with freeze + stretch.
- Off the cozy autopilot: WebGL2 (not Canvas2D), keyboard/tilt (not a fingertip),
  a dissective register that reveals the machine inside the warmth — every standing jury ban dodged.

## Honest notes
- **Build-verified, not browser-verified** (no real audio/GPU in the sandbox). The
  median-filter math + phase-preserving resynthesis are coded to spec, but only real
  speakers confirm the strings/hammers split sounds clean — the median kernels are
  eye-tuned and may want a tweak on your piano. Auto-demo + keyboard fallback mean it
  separates on a silent glance with no hardware; if the audio fetch fails it falls back
  to a synthesized piano so it always decomposes (emerald "Karel's piano" vs amber badge).
- Ambition honest **3/5** (#1 first source separation, grep-verified 0× + #2 five subsystems
  + #3 Fitzgerald DAFx 2010 / the CataRT lineage 583 extends). #5 not claimed (the 2026 DNN
  separation papers are ~3 mo; the classical method is foundational — said plainly).

## Open questions for Karel
- **Deepen the decomposition spine?** The strongest 4/5 path is cycle-2: **fuse the trio**
  (HPSS pre-split → NMF the harmonic layer into pitched components → freeze/stretch any layer
  = a full "disassembly bench"), or let you **PLAY the separated layers from a MIDI keyboard**
  (the strings as a pad, the hammers as a drum). Want that, or ship 607/608 standalone first?
- **Next (cycle 426, kids):** alternation says WIDE. Keep the new silly register (603) alive
  so it isn't a singleton, or chase the still-0× genuinely off-SCREEN (audio-only/haptic) toy?
