# Morning digest — last updated 2026-07-27 (cycle 921, WIDE)

**Open this first:** https://getresonance.vercel.app/dream/3056-clearlight
*(best on a phone, with headphones, in a quiet spot — let it hear your breath)*

## New since yesterday
- **`3056-clearlight`** (WIDE-winner) — *breathe a boundless clear light into being.*
  A **Ganzfeld** field (soft, edge-free light) where your **breath is the only
  instrument**: the mic reads it as a slow ~5.5-bpm envelope, and calm, steady
  breathing **brightens** the field + swells a drone until faint hallucinatory
  form-constants (rings + a soft spiral) surface from it. Breathe with the pacer
  ring. *Why open it:* the lab's **first Ganzfeld** and the **most
  product-relevant** piece to Resonance's core (breath/meditation) — the calm
  cosmic-ambient pole you asked about, and the **first real use of the shared
  psych kit** (the safe-flicker / drone / void / Shepard engines that had been
  sitting unused). No mic? It breathes a seeded synthetic breath so it self-demos.

## Explored but not shipped (both built + banked — IDEAS §921)
- **`3040-tunnel`** ⭐⭐ — **pilot the near-death tunnel-toward-the-light yourself:**
  a WebGL2 raymarched infinite wormhole you steer (drag/tilt/keys), holding to
  commit toward a being-of-light or hanging back in the dark void; stop and time
  dilates. The biggest "whoa" of the three — held only for a cycle where a live
  **GPU can verify the shader** (compile + look) before it ships.
- **`3088-khole`** ⭐⭐ — a **K-hole dissociation** instrument: you play it, and the
  bind between what your hand does and what you see/hear **comes apart** (the
  light lags the sound, time stretches, your locus melts) — then a lucid snap
  re-binds it. Freshest *technique* in the lab (first audio-visual desync engine);
  held for a real-device pass to confirm the desync *reads* as dissociation.

## Research worth a look (RESEARCH §921)
- **Ganzflicker is a robustly-documented, drug-free psychedelic lever** — a uniform
  field the viewer's *own brain* fills, whose brightness tracks alpha
  (relaxation/eye-closure) and whose *content* tracks individual imagery capacity
  (*"From dots to faces"*, Neuroscience of Consciousness 2026). Unlike binaural
  beats, this one replicates — and it inverts our whole recent posture: the
  instrument supplies a near-empty field and *you* are the content. Directly drove
  tonight's `3056-clearlight`.

## Open questions for Karel
- **AI-pipeline chain (music→image→video) is still 0× — ~11 juries overdue.** It
  spends your FAL_KEY image budget, so I won't start it alone. **One word —
  "go, cap it at $X/run" — unblocks the single most novel unbuilt thing in the lab.**
- **Which calm-pole sibling next?** `3040-tunnel` (biggest whoa, needs a GPU-verify
  cycle) or `3088-khole` (freshest technique, needs a device-tuning pass)? Both are
  built and banked — say the word and I'll ship one next cosmic-ambient slot.
- Infra (minor, standing): the cron container's fd cap still trips the *full* local
  `npm run build` across ~880 routes, so I validate via lint + the compile pass
  (green) — deploys fine on Vercel. Raising `ulimit -n` restores full local builds.
