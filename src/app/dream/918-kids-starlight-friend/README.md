# 918 · Starlight Friend

**What if two 4-year-olds, each on their own iPad, shared ONE magical night sky — and a star one child makes lights up and chimes in the OTHER child's sky too, so they build a constellation song together?**

The lab's first multi-user / WebRTC kids piece. **Shake the iPad to fling a shooting star.** It streaks across a deep-indigo→violet GPU sky, lands, blooms into a glowing star, and chimes. That same tiny star-event is sent peer-to-peer, so it lights up and sings in your friend's sky too. The compositional logic is **latency-tolerant social co-play, not pitch theory** — there is no tempo clock. Stars twinkle and chime *whenever* they arrive on each device. The reward is "we made this together." Every chime is drawn from one warm C-major pentatonic, so nothing two children fling can ever clash.

## Tags

- **INPUT — device shake (`devicemotion`) + WebRTC.** Shake (accelerometer magnitude > 18 with a 360 ms refractory) is the headline gesture: a shake flings a warm gold/rose shooting star into the child's (left) half of the sky. The full-screen **"✨ make a star" tap-pad is the always-present fallback** — it drives the *identical* fling→bloom→chime→send pipeline, so a device with no motion sensor (or a denied permission) is never a dead end. Touch is deliberately the fallback, not the instrument.
- **OUTPUT — three.js.** A 900-point GPU twinkle field, a shader gradient backdrop (deep indigo→violet, slow breathing shimmer), a pool of additive-blended shooting stars with trails, and a pool of persistent twinkling "placed" stars. Renders well on phones (`powerPreference: 'low-power'`, capped pixel ratio 2). No Canvas2D/SVG for the sky.
- **TECHNIQUE — serverless peer-to-peer co-play.** An `RTCPeerConnection` data channel carries tiny `{x, y, hue, t, vx, vy}` star-events (`ordered:false`, `maxRetransmits:0` — drops are fine, co-play is loose). **Both peers synthesize the chime + render the star locally** — near-zero bandwidth, no shared scheduler, no strict sync.
- **VIBE — calm-joyful twinkling night sky:** deep indigo→violet, warm gold/rose stars for "me," cool cyan/violet for the friend, soft additive glow.

## The WebRTC handshake (no signaling server)

1. **Host** taps 👋 → `createOffer()`, waits for ICE gathering to complete (≤2.5 s cap) so the SDP is self-contained, then **gzips the offer SDP via `CompressionStream('gzip')` → base64url** and embeds it in a shareable link as a `#join=…` hash fragment.
2. **Guest** opens the link → the page reads the hash, `gunzip`s the offer, `setRemoteDescription`, `createAnswer()`, and **shows a short gzipped+base64url answer code** (auto-answer, no extra taps to start their sky).
3. **Host** pastes the guest's code back → `setRemoteDescription(answer)` → data channel opens.
4. On `channel.onopen`, both sides flip to "friend here" and the **ghost friend bows out**.

If `RTCPeerConnection` **or** `CompressionStream`/`DecompressionStream` is unavailable, `netSupported()` returns false and the 👋 invite UI is hidden entirely — the piece runs solo with the ghost friend. **Networking is purely additive; solo is the full experience.**

## The ghost friend (solo / unattended glance)

When no real peer is connected, a gentle simulated second player auto-joins. Within **~800 ms of Start**, it begins flinging its *own* shooting stars every 2.6–5.2 s into the **right** half of the sky with **cooler cyan/violet hues** and a **softer chime** (`self:false`), so a single phone, hands-free, shows living two-player co-play and sound within ~1 s of Start with zero interaction. The moment a real data channel opens, `ghost.stop()` is called and it vanishes gracefully.

## How it degrades (no dead ends, never blank)

- **No motion / permission denied** → `text-rose-300` notice ("Shake is off — tap the sky to make a star") + the tap-pad drives the identical pipeline.
- **No WebGL** → `makeScene` returns `{ ok:false }`, a `text-rose-300` notice shows, audio + ghost still run (you can still *hear* the stars). No crash.
- **No audio** (`AudioContext` unavailable) → `text-rose-300` notice; visuals stay alive.
- **No WebRTC / no CompressionStream** → invite UI hidden; solo + ghost is the whole piece.

## Kids-safety & audio chain

All audio is routed through a master chain: **`gain (0.24 ≤ 0.26) → lowpass (~6.5 kHz) → DynamicsCompressor(−10 dB / 20:1) → destination`**. Chimes use ≥50 ms soft attacks (sine carrier + a quiet triangle a fifth above); the fling "whoosh" is a short band-passed noise burst that fades in over 60 ms — no sudden loud transients, no harsh highs. An always-on ambient pad (two soft sine drones C2+G2 with a breathing LFO, plus a faint high shimmer) fades in over 1.2 s so it never feels broken or silent. The `AudioContext` is created **and** `DeviceMotionEvent.requestPermission()` is called **inside the same Start tap** (iOS requirement). No "wrong" notes — color is the language, tap-targets are ≥64–72 px, no reading is required to play.

## Teardown

On unmount: cancel rAF; remove `resize`, `devicemotion`, and `pointerdown` listeners; stop the ghost timer; close the `RTCPeerConnection` + data channel; dispose every three.js geometry/material/texture and `renderer.dispose()` (+ detach the canvas); stop all audio oscillators, disconnect all nodes, and `audioCtx.close()`.

## Named references

- **The Hub / League of Automatic Music Composers** — historic networked ensembles where tiny messages travel between nodes and **each node renders locally**. That is exactly this piece's model: a `{x,y,hue,t}` event is the whole message; both skies synthesize and draw independently, loosely.
- **Kirschner & Tomasello (2010), "Joint music making promotes prosocial behavior in 4-year-old children."** — the empirical grounding for why dyadic music-making (not a metronome) is the point.
- **"Actions and feelings in sync: synchrony and empathy in children's dyadic musical interactions" (PMC12063534, 2025)** — dyadic child music-making promotes empathy, and **loose synchrony still works** — so latency tolerance is the feature, not a bug.

## Files

- `page.tsx` — Start gate (audio + motion-permission gesture-gate), shake & tap input, ghost friend, invite UI, full teardown.
- `audio.ts` — Web Audio engine: master safety chain, ambient pad, per-star chime, fling whoosh, pentatonic hue→freq.
- `scene.ts` — three.js starfield: gradient backdrop, GPU twinkle field, shooting-star + placed-star pools, hue→color.
- `net.ts` — serverless WebRTC (gzip+base64url SDP, `#join` link, auto-answer guest code), `StarEvent`, ghost friend.

## Ambition self-assessment

Hits all four tags as the primary mechanics (shake-as-headline, three.js sky, real P2P data-channel co-play, indigo/violet vibe) and the hard robustness bar: the ghost friend makes a single unattended phone read as *two-player co-play, alive and sounding within ~1 s of Start*, while real peering is genuinely serverless (no STUN-dependence for the handshake payload itself — ICE candidates are baked into the gzipped SDP). The honest frontier: serverless WebRTC over the public internet still depends on the bundled STUN candidates traversing NATs (works great same-LAN / hotspot, which is the actual two-iPads-side-by-side use case; symmetric-NAT pairs across networks may not connect — but that path is purely additive and failure simply leaves you in the full solo+ghost experience). The piece is deliberately *small and warm* rather than feature-maximal — the bet is that "loose, consonant, we-made-this" beats any cleverness.

## Could not verify in this environment

No browser, audio device, motion sensor, or second peer was available here. Verified statically: `npx tsc --noEmit` (0 errors in this folder and project-wide) and `npx eslint` (0 errors). `next build` reached **"✓ Compiled successfully"** (bundler accepted the route); the subsequent `EMFILE: too many open files` is a sandbox file-descriptor ceiling (4096, non-raisable) hit while Next collects page data across 500+ dream routes — not a fault in this code. **Unverified by runtime:** actual chime/pad timbre & loudness on a real device, shake threshold feel on a physical iPad, iOS motion-permission prompt flow, three.js render on mobile GPU, and a live two-device WebRTC connect/ghost-bow-out.
