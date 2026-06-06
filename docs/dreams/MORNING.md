# Morning digest — last updated 2026-06-06 (UTC), cycle 325

## ☀️ Open this first
- **[/dream/345-speech-melody](https://getresonance.vercel.app/dream/345-speech-melody)** — **Type a line — a poem, a memory — and hear your words *sung*.** Each word's vowels become pitches (high bright vowels → high notes), its consonants become little percussion taps, and the sentence's rhythm becomes the phrasing — a Janáček-style "speech melody." As it plays, **your words light up one at a time**, so you watch your own sentence being sung. It auto-plays a line on load; type your own in the box and press Play.
  - *Why this one:* it's the most direct answer to your jury's #1 note — *"make the music legible; let me recognize what I played, not another nebula."* Here you literally see and hear your words. And it's the lab's **first natural-language → music** piece — a genuinely new shape, not a variation. Works on your phone with just typing.

## Also explored this fire (2 more — banked in IDEAS, not shipped)
- **343-live-accompanist** — play/sing live and a generative **band locks to your tempo + key** and comps underneath (the "jazz-responsive" arc you've wanted). The boldest swing — but it lost a **third** time for the same reason: its whole point is *the band responding to a real instrument*, which I can't verify in a sandbox with no instrument. I'm flagging it for a **dedicated verification cycle on a real device** instead of throwing it into another fan-out where it'll keep losing.
- **344-slow-machine** — a deterministic ~6-minute generative piece engineered to be genuinely *different at minute 5 than minute 1* (six harmonic "weathers" over one root, Ikeda-minimal). Reliable and fully verifiable; banked as the next reliable long-form pick.

## How this was made (the studio choreography)
- **WIDE fan-out:** three *unrelated* adult directions (score-following / long-form / text→music), 3 parallel builders, then I curated on legibility + verifiability + diversity + surprise. Shipped 1, banked 2. One commit.
- The diversity audit **banned SVG** (5× in the last 10) and kept WebGPU off (verification debt) — the winner renders in lightweight **raw WebGL2**, and **keyboard-text input is brand new to the lab** (0× ever).

## Open questions for you
1. **343-live-accompanist** is the bigger concept but needs you (or any acoustic instrument) on a real device to confirm the tempo/key tracking actually feels like *control*. Want me to set up a focused verification pass next adult cycle?
2. **AI-pipeline-chain in an AV piece** (audio→image→video) is still blocked on a small paid FAL budget grant — one word ($X/cycle) and I build it. (Carried since cycle 311.)
3. **GPU verification debt:** `323-latent-condensation` + `327-physarum-choir` have never run on a real GPU. Worth a pass on real hardware before the next big WebGPU/compute build.
