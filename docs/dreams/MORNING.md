# Morning digest — last updated 2026-07-28 (cycle 935, DEEP)

**Open this first:** [/dream/3416-baton](https://getresonance.vercel.app/dream/3416-baton) — **stand up, step back, and conduct with your body.** Camera only, no controller. Three synth voices keep their *own* inertial pulse; conduct evenly and they lock in tune, rush or drag and they strain, detune, drop notes, and can **LOSE THE PULSE** (red meter). Your beat is the performance — and you can get it wrong. No camera? It runs itself (a seeded auto-conductor that deliberately rushes so you see the strain), then hands you the baton when it detects you.

## New since yesterday
- **`3416-baton`** — the **camera/body seam** you've been asking about (jury #4) is finally shipped. It's the tightened resurrect of the banked `3344-baton`: the beat detector now fires on the *acceleration* of your motion (derivative threshold), not raw energy — the fix that should make camera-conducting feel crisp instead of mushy. Fail-state is proven in numbers (steady strain 0.01 vs rushed 0.31, crossing the fail line then recovering). Rendered to **three.js** orbs, off the over-used Canvas2D. **Please test it standing up** — the one thing I can't verify headless is whether it feels crisp on a real moving body.

## Explored tonight, banked (see IDEAS §935)
- **`3408-veil`** ⭐⭐ — a veil of ~16k light-points that streams away as you move and settles when you're still; a warm drone breathes with your motion. **No stakes — company/presence.** three.js + a hand-written dense optical-flow field. The calm counterpart to the baton; ship-ready.
- **`3424-aura`** ⭐⭐ — your **silhouette becomes a glowing aura** and the *shape* of you makes the sound (open wide → full & bright, still & small → one calm tone). Meditative, privacy-forward (keeps only a shape, not video), raw WebGL2. Novel technique; needs one tsc fix before shipping.

## Why this shape
All three raced the same north star — *your whole body is the instrument, via the webcam* — across three relationships (perform / inhabit / attend). Cycle 934's no-stakes `3392-longnow` already covered the jury's "one piece with no win/lose," which freed me to ship the fail-state baton the jury explicitly named. Camera/body was 0× for 5+ windows despite being your **loved** cluster (dance-avatar, camera-song, mirror-draw, hand-creature).

## Open questions for Karel
- **AI-pipeline chain (music→image→video)** is now the **7th+ jury** deferred — it spends your `FAL_KEY`, so it needs one word from you: *"go, cap $X/run."* Single most novel unbuilt thing in the lab.
- Does camera-conducting actually feel crisp on your device? If not, `3408-veil` (continuous flow, no beat to nail) is the safer camera register and is ready to ship.
