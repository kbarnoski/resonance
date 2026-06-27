**For**: kids (4+)

# 🌳 Happy / Sad Tree — one switch, two feelings

**The question:** *Can a 4-year-old FEEL the difference between major and minor by flipping one switch?*

A glowing musical tree stands under a living sky. The child **taps** big glowing
fruit to pluck melody notes. An always-on warm pad holds a gentle chord
progression underneath. A giant **☀️ / 🌙** button in the corner flips the whole
world between **bright happy (C major)** and **tender (C natural minor)** — and
the same tree, same fruit, same taps suddenly *feel* different.

No reading required. Color is the language: the sky melts from warm gold to cool
indigo, the fruit cool from candy-bright to dusk-soft, and the chord under
everything changes quality. A child never has to know the words "major" or
"minor" to feel them.

## How it works (the real idea, not a trick)

This is **real diatonic tonal harmony**, not a pentatonic "no wrong notes"
safety scale.

- **Always-on pad** holds a **I–vi–IV–V** progression (in minor: **i–VI–iv–v**).
  Same roman-numeral functions, same bass roots in both modes — only the chord
  *quality* changes, because the **lowered 3rd / 6th / 7th** scale degrees are
  exactly where the major-vs-minor feeling lives.
- **Parallel mode flip with voice-led re-voicing** (the core technique). Flipping
  the ☀️/🌙 switch does **not** restart the pad. Each held pad voice **glides**
  to its nearest chord tone in the new mode over ~400ms — true voice leading —
  so the world *melts* from happy to tender instead of cutting.
- **Sky crossfade** eases warm-gold ↔ cool-indigo over ~600ms (WebGL2 fragment
  shader; Canvas2D gradient fallback if WebGL2 is unavailable).
- **Every tap is valid.** Taps quantize to the **current** mode's diatonic
  7-note scale (the seven fruit = scale degrees 1–7), so there are no wrong
  notes — yet it is still honest tonal music, not a flattened pentatonic.
- **Idle auto-player.** After ~3s with no touch, a "ghost" taps a short phrase
  and breathes between major and minor every ~8s, so a silent glance demos the
  whole idea hands-free. Any real tap takes back control instantly.

## Kids-safe audio

Master chain: `gain (≤0.3) → lowpass (~6500 Hz) → DynamicsCompressor →
destination`. No sudden loud transients (plucks ramp in over ~12ms, decay like a
soft bell), no high ringing. Audio starts only on the first tap (browser
autoplay policy) behind a friendly **"Tap to begin"** 🌳 affordance. The session
gently fades after ~15 minutes (😴) so it never blares unattended.

## Why this should work — named references

- **Kate Hevner, mode/affect experiments (1935–1937).** Hevner showed listeners
  reliably hear **major as bright/happy** and **minor as tender/sad**,
  *independent of the melody* — isolating mode itself as the carrier of affect.
  This prototype leans entirely on that: same melody, same taps, only the mode
  changes.
- **Children specifically (2026).** A systematic review (MDPI *Int. J. Environ.
  Res. Public Health*, 2026) reports that children in their **first two
  primary-school years identify greater happiness in major than in minor mode** —
  i.e. the happy/sad-by-mode percept is already in place at exactly this age.
  Complementary evidence on key/mode→emotion mapping in performed piano appears
  in *"Parsing Emotion in Classical Music"* (*Applied Sciences*, 2026).

The bet: if a 4-year-old can already *perceive* major-happy vs minor-tender, then
putting that contrast under one big tactile switch lets them *cause* the feeling
and notice the cause — turning a passive percept into play.

## What I'd verify on a real device

- **Touch latency & target size on a phone/tablet.** Confirm a pluck fires
  <50ms after touch and that the ≥68px fruit are comfortably tappable by small
  fingers, with no accidental double-fires (the code uses a single nearest-fruit
  hit test per `pointerdown`).
- **The voice-leading glide actually reads as "melting," not "sliding out of
  tune."** Listen on real speakers/headphones during a ☀️↔🌙 flip mid-chord;
  tune the 400ms glide if the portamento feels queasy rather than tender.
- **WebGL2 → Canvas2D fallback** on a device that lacks WebGL2 (or with it
  disabled): confirm the gold↔indigo crossfade still clearly carries the mood.
- **Loudness safety** on a child's actual headphones — verify the compressor +
  lowpass keep peaks gentle and there's no high-frequency ring.
- **Does the idea land without words?** The real test: hand it to a 4-year-old
  and watch whether *they* discover the ☀️/🌙 switch and react to the change.

## Files

- `page.tsx` — React client component: tree + fruit Canvas2D overlay, tap
  handling, sun/moon toggle, idle ghost player, session cap.
- `audio.ts` — `TreeAudio`: pad progression, parallel-mode voice-led re-voicing,
  diatonic plucks, kids-safe master chain.
- `gl.ts` — `makeSky`: WebGL2 sky shader + Canvas2D fallback, gold↔indigo mode
  crossfade.
