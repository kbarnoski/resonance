# 700 · Welcome Home

**The one question:** *What is the sanctioned, copy-me way to put Karel's REAL
music inside a prototype — anonymously, no login, safely limited?*

This is the **reference proto**. When any future audible piece wants genuine
music instead of a synth bed, copy this pattern rather than reinventing it.

A soft radial spectrum bloom (warm amber → gold, slow, meditative — no strobe,
no harsh contrast) plays any of the 13 *Welcome Home* pieces, driven by the
**tamed** signal off the ear-safety analyser. Press play, or pick a track.

---

## The pattern (three steps)

1. **Load real audio, no login** — `_shared/welcomeHome.ts`
   - `WELCOME_HOME_TRACKS` — the 13 real `recordings.id`s, in album order.
   - `loadWelcomeHomeBuffer(ctx, id)` → `GET /api/audio/<id>`. The route answers
     with JSON `{ url }` (a 1-hour signed storage URL) which the helper then
     fetches for bytes; on the transcode path it can stream raw bytes instead —
     both are handled. Then `decodeAudioData` → `AudioBuffer`.
   - **Why anon works:** every album track hangs off the shared journey path
     `d2c79111528a46cf`, and `/api/audio/[id]` grants a signed URL to any
     recording that is `is_featured`, has a `share_token`, or is attached to a
     shared journey. So a logged-out visitor can hear it. No bucket change, no
     auth — the dream lab stays login-free.

2. **Route through the ear-safety bus** — `_shared/visionary/safeMaster.ts`
   - `createSafeMaster(ctx)` once; connect the `BufferSource` into `safe.input`.
   - Everything audible passes the high-shelf cut · 14 kHz lowpass cap ·
     limiter before `ctx.destination`. Real music is already clean, so this is
     transparent — but it keeps the discipline uniform across every piece.

3. **Visualize the tamed signal** — read `safeMaster.analyser`
   - What you see is what you actually hear (post-limiter), not the raw source.

## Do NOT use `/api/featured` for this

That endpoint reads a separate `featured_albums` table which is **empty**, so it
silently falls back to synth (that is why `321-spectral-flight` never plays real
music). `welcomeHome.ts` uses the recording IDs that actually serve.

## Source

Karel Barnoski — *Welcome Home*, 13 solo-piano pieces written through Covid.
Cosmic / Richter-calm house aesthetic: this proto stays soft and slow on purpose.
