# Morning digest — last updated 2026-06-18 (UTC), cycle 472

> **A kid gets the scarce renderer — and the whole room becomes the instrument.** Yesterday's jury banned the kids side's Canvas2D monoculture (9×) and its loop-groove reflex, and asked: "give a kid the scarce renderer too; let a kids piece be about texture and cause-and-effect, not a backbeat — and vary the emotional register off silly." This kids fire answers all three: WebGPU, no groove, wonder not zaniness. See `docs/dreams/JURY.md`.

## New since yesterday
- **`727-kids-color-hunt`** ("Color Hunt") — **point the tablet at the colors in your room and PAINT MUSIC with what you see.** Red things sing warm and low, sky-blue shimmers bright and high, greens settle in the middle — the rear camera reads the color you aim at and a soft consonant chord follows, while a **WebGPU particle bloom** fills with that exact color. No reading, no buttons, no wrong notes, nothing to fail; if there's no camera it slowly walks the rainbow on its own. Cross-modal color→harmony (Scriabin's color-organ / Kandinsky) on the lab's scarcest+best renderer.
  - *Why open it:* it's the jury's kids #1 + #2 in one toy — a 4-year-old on the *scarce* renderer (WebGPU, not the banned Canvas2D), with the **world itself as the instrument** (move the tablet, the music changes) instead of a tap-a-loop groove. It also deepens one you ❤️'d — `317-kids-color-bells` (camera color → bells) grows up into a WebGPU chord bloom.

## ⚠️ One honest caveat (please glance)
- The build **compiled, type-checked, and ESLint-passed cleanly** — but this container was launched with a tiny file-descriptor limit (4096) that killed Next's static-generation step (`EMFILE`) before it could run. **It is NOT the prototype:** I proved it by building *pristine main* (the exact code live on Vercel right now) — it failed identically. So it's an infra quirk of tonight's sandbox, not the code; Color Hunt is a self-contained client page with no API route, and Vercel (which builds this same app fine) should deploy it normally. If you got a failed-deploy email, the thing to check is the infra, not this page. Full reasoning in `STATE.md` cycle 472.

## How this cycle ran
- **Kids WIDE fire** (the jury-mandated mode for the kids lane — diversify, don't deepen): 3 parallel builders, each on a *different* scarce renderer × off-glass input × non-silly vibe — **camera-color → WebGPU** (won), **bare hands → three.js star-scoop**, **tilt → WebGL2 aurora-sail**. The fan-out itself is the diversity attack on the Canvas2D/loop-groove/touch/silly monoculture.
- Research → build chain (RESEARCH §472): the live-2026 GPU-particle creative-coding frontier (webgpu.com, June 2026) is **almost entirely adult/installation** — nobody's putting a 4-year-old on the scarce renderer. That's an unoccupied corner; Color Hunt walks into it.

## Banked, ready to resurrect (IDEAS §472)
- **`726-kids-star-scoop`** ⭐ — reach UP into a 3D night sky with bare hands and scoop handfuls of stars that chime (MediaPipe hands → three.js). The most embodied / off-glass swing; resurrect first.
- **`725-kids-aurora-sail`** — tilt to sail a glowing boat across an aurora that sings as you drift through it (WebGL2). The bulletproof, zero-CDN, iOS-safe sibling.

## Open questions for Karel
- On a real iPad: does pointing at colors read as *painting music* by ear, and does WebGPU run (or does it fall back to the Canvas2D bloom)? Compile-verified only — not device-verified (no GPU/camera in the sandbox); the Canvas2D fallback + zero-permission ghost demo guarantee a sounding, blooming glance regardless.
- Next is **adult** (473). Strong resurrect candidates: the whole-body `723-presence-tide` ⭐ / `722-presence-paths` ⭐ (extend last night's 724), the Xenakis-UPIC `722-paths-spectral-cloud` ⭐, or the first-WebMIDI `713-shadow-duet` ⭐. Preference?
