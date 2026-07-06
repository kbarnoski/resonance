# Morning digest — last updated 2026-07-06 ~02:xx UTC (cycle 675, adult · WIDE)

**Open the lab:** https://getresonance.vercel.app/dream

## New since yesterday
- **⭐ `/dream/1213-splatsong` — strike a cloud of light and hear its material.**
  A sculpture made of **thousands of soft glowing 3D Gaussians** (a "resonant
  cairn") floats in a neutral studio light-box. **Drag** to orbit it; **tap** a
  cluster to strike it — and each cluster *sounds like what it's made of*: the
  small bright cool one rings like **glass**, the big dark one thuds like
  **stone**, the long metallic one sings like a struck **metal bar**, the warm
  one knocks like **wood**. **Why open it:** it's a whole new medium for the lab —
  **real 3D Gaussian splatting** (the photoreal-capture rendering everyone's
  doing in 2026, here procedural + playable), and the material isn't hand-labelled
  — it's *inferred from the splats' own shape/color* (à la the SonicGauss paper).
  Fresh surface, fresh palette (a product-photography vitrine, not another glow),
  fresh voice (struck-material modal, not a pad). ⚠ Wants your **GPU + speakers** —
  I can't see the volumetric look or hear the strikes headless.

## Why this one (the diversity story)
- The ambition mandate said *massively bigger, stop shipping near-variants* — and
  the audit showed **5 of the last 10 went chromatic-chiaroscuro** + three straight
  cycles were "a physics-sim you play." So I raced **3 genuinely different big
  concepts** (below) and shipped the biggest swing: a rendering medium the lab has
  **never** truly done, directly built on **this cycle's** freshest research
  (WebSplatter, Feb 2026). See RESEARCH.md §675.

## Also explored this fire (WIDE — 3 built, 1 shipped, 2 banked) — both are worth a look-later
- **⭐ `1215-consort`** (banked, resurrect-first) — **a duet partner that follows
  you.** Sing / hum / tap into the mic and a warm **Rhodes-piano + bass consort
  answers you in time**, harmonising your notes and locking to your tempo (real
  YIN pitch-tracking + key-finding + a look-ahead beat clock; full keyboard
  fallback if you don't want to use the mic). **This is your own "jazz responsive"
  idea** — I held it only because its lead-sheet visual is quieter on a cold glance
  and I can't test a mic headless. **Say the word and I ship it next.**
- **`1214-reef`** (banked) — **grow an instrument over ten minutes.** A coral grows
  by space-colonization as you feed + prune it; a slow tide rings the whole
  structure, so it's **sparse and high early, thick and low late** — genuinely
  different at minute 8 than minute 1. Two-color blue+vermilion print.

## Open questions for Karel
- **`1215-consort` is your "jazz responsive" ask, fully built and banked** — one
  word and it's the next ship.
- **Multi-user / WebRTC** still needs your **signaling-store call** (1206's protocol
  is ready to drop onto it).
- **Near-black-glow soft-ban** lifts ~07-11 — one word and `1174-magnetosphere-song`
  + `1166-ear-tone-field` can resurrect.
