# 729 · Piano Portal Jam

**The question:** What if you could open a PORTAL to Karel's real *Welcome Home*
piano and send it to a friend's phone with a single shareable link — and then
the two of you actually play it together, peer-to-peer, across the room or
across the world?

This is the lab's first **real cross-device, multi-user** piece. All prior
"multiplayer" was same-browser `BroadcastChannel` fakery; this uses genuine
WebRTC between two devices. Its distinct angle among siblings is a **friendly
shareable-link handshake** instead of raw code-pasting.

## What it is

Karel's whole recording is loaded as a corpus of short grains. Tap and drag the
field to re-sound it concatenatively: screen-x maps to time-through-the-piece,
screen-y to brightness/register; the nearest matching ~80–140 ms Hann-windowed
grain plays, panned and colored by who triggered it. A three.js `Points`
starfield blooms a star per grain — **warm amber/rose for you, cool
cyan/violet for them** — so the duet is visible as two constellations
interleaving.

When a second player connects via the portal, each tap sends a tiny note-event
`{p,x,y,t}` over a single RTCDataChannel named `portal`. Because **both peers
already hold the same recording**, the receiver renders the other player's grain
*locally* from the identical corpus — so only triggers travel, not audio.
Near-zero bandwidth, low latency, full fidelity.

## The shareable-link handshake (zero-server)

No API route, no backend, no npm deps. The signaling channel **is a URL**:

1. **Host** taps *Open a portal* → builds a WebRTC offer, then awaits ICE
   gathering complete (**non-trickle** — one finished SDP blob).
2. That blob is gzip-compressed with the native `CompressionStream` and
   base64url-encoded into a token inside a link: `…/dream/729-piano-portal-jam#o=<token>`.
3. **Guest** opens the link → the page detects the `#o=` hash, auto-builds the
   answer (again awaiting ICE-complete), and shows a short **return code**.
4. Guest sends the return code back (any channel); **host** pastes it →
   `setRemoteDescription` → connected.

STUN: public Google servers (`stun.l.google.com:19302`, `stun1…`).

## How to use

**Solo (the 06:30 one-phone glance):** tap *Enter the field*, then tap/drag to
play. Leave it idle ~2.5 s and a **ghost** remote player auto-drifts a path
through his recording in the cool color — so the screen is always sounding,
moving, and visibly a duet with zero setup.

**With a second phone:**
1. On phone A, tap *Open a portal* → *Copy / share the link* (uses
   `navigator.share` if available, else clipboard).
2. Open that link on phone B → tap *Join the duet* (this also starts audio) →
   *Copy return code* and send it to phone A.
3. On phone A, paste the return code → *Connect*. Status turns
   `text-emerald-300` "portal open — duet live". Now both of you play the same
   piano together; the ghost steps aside.

## Tags

- **INPUT:** touch/drag note-trigger + a remote PEER over WebRTC.
- **OUTPUT:** three.js `Points` shared starfield (two constellation colors).
- **TECHNIQUE:** WebRTC `RTCDataChannel` P2P + concatenative grains of his real
  recording (event-only transport from a shared corpus).
- **VIBE:** adult, cosmic, "two constellations meeting".

## Named references

- **JackTrip** — WebRTC-based networked music performance.
- AES paper: *"Web-Based Networked Music Performances via WebRTC: A Low-Latency
  PCM Audio Solution"* (RTCDataChannel + Web Audio). The twist here is that we
  send **note events, not PCM** — both peers reconstruct from the same corpus.
- Corpus loader + concatenative grain engine reuse the lab's proven piano
  pattern from `720-paths-grainfield`.

## Constraints honored

- Audio **and** visuals; never a static page (ghost keeps it alive).
- Self-contained; only shared import would be `_shared/` (none needed here).
- Web Audio + `three` (existing dep); native WebRTC + `CompressionStream` — **no
  new npm deps**. `package.json` untouched.
- iOS: AudioContext created/resumed only inside the first user tap.
- Master chain: `gain 0.28 → lowpass 6800 Hz → DynamicsCompressor(-10 dB, 20:1)`
  → destination.
- Degrades: no WebGL → Canvas2D starfield (audio fine); no WebRTC/Compression →
  solo+ghost with a rose notice; recording fetch fails → offline fallback
  arpeggio (rose notice).
- Full teardown on unmount: closes `RTCPeerConnection` + data channel, stops the
  audio graph, cancels rAF, disposes three.js geometries/materials/renderer.

## Honest caveats

- The cross-device link is **build-verified and correct-by-construction**, but
  **not link-tested between two real devices in this sandbox.** Treat the
  two-phone flow as the stretch demo.
- Only public STUN is configured. **Symmetric / strict NATs** (some cellular
  carriers) may fail to connect without a TURN relay, which is intentionally
  out of scope (zero-server). Same-Wi-Fi or one device on Wi-Fi usually works.
- The handshake is two manual steps by design (no signaling server). It's made
  as forgiving as possible, but it is a copy/paste round-trip.
