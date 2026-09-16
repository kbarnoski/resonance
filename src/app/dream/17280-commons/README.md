# 17280-commons — Commons

**Status:** Demoable. Plays Karel's real take venue-scale on a raw-WebGPU compute particle field; ~9,200 particles are each owned by one present listener (synthetic, local, or a live peer) and woven into one figure of light by a room-coherence scalar; multi-user via peerSync (two-tab BroadcastChannel + remote WebRTC); deliberately-neutral palette inheriting the hall's; graceful Canvas2D / still fallbacks and reduced-motion in place.

## The question

_What if listening to Karel's take together — not two people but a whole ROOM of
present listeners — visibly wove everyone's attention into ONE collective figure
of light, venue-scale?_

`Commons` is the CYCLE-3 deepen of the shipped `17200-hall` (a projection wall
Karel loved), fused with the multi-user co-presence pieces (`16800-attune`,
`15920-duetlink`). Hall was one wall rippled by the room; Commons makes every
present listener a **body** of particles in the field and extends the banked
"commons" idea from two presences to a genuine **N-presence ensemble**. The whole
viewport is a projection wall. Karel's one real piano take plays in sync for
everyone. As the room's attention aligns, the separate clouds converge and turn as
a single woven figure.

## Design notes

- **N bodies, one figure (the technique).** ~9,216 particles live in a single GPU
  storage buffer. A WGSL `@compute` shader steps them each frame: each particle is
  OWNED by one presence (`owner = i % activeCount`) and pulled toward that
  presence's on-screen locus. A room **coherence** scalar in `[0,1]` — high when
  the presences are few, close and calm — LERPs every particle's target from its
  owner locus toward the shared **centroid**, and gates a **rotational
  curl-of-position flow** (a tangential swirl about the centroid) so the clouds
  visibly weave together and TURN as one. Coherence falls → they relax back to N
  distinct bodies. Coherence generalizes attune's `nearness × gentleness` to N:
  `closeness(spread) × mean gentleness × fewness`, smoothed (rises slowly, relaxes
  faster).
- **Presence = a live body per peer.** Self is the smoothed local pointer; each
  remote peer streams its normalized pointer + a smoothed gentleness at ~16 Hz via
  `ps.send(...)`, received in `onMessage` and given its own slice of particles.
  `onPeers` prunes bodies when a peer leaves.
- **Reads cold & solo (why Karel opens it).** Five synthetic present listeners
  (gently drifting Lissajous loci, calm/high-gentleness) are seeded into the field
  before frame 1, so a lone visitor on a muted phone immediately sees a living,
  many-body woven field — not an empty screen. Real joining peers augment and
  replace the synthetic ones; a minimum of synthetic bodies is always kept so the
  ensemble stays lush.
- **Deliberately-neutral palette.** Graphite → slate → stone → silver → bone, with
  violet (`vec3(0.560,0.360,0.960)`) ONLY at the brightest, densest peaks —
  inheriting the hall's ramp. Warmth-of-togetherness is encoded as **luminance /
  density**, never hue: when the room aligns, density at the centroid rises and the
  violet peaks appear. Not warm, not cool-luminous. Violet stays the only UI accent
  (`text-primary` / `bg-primary`); the neutral ramp lives only inside the shader.
- **Output = raw WebGPU compute (not WebGL2, not Canvas2D).** The lab hit a WebGL2
  rut; this is the rested substrate. One compute pass advances the particles; a
  render pass deposits them **additively** into a ping-pong `rgba16float`
  accumulation texture with slight per-frame decay (woven ribbon trails, not dots);
  a fullscreen pass tonemaps that through the neutral ramp with a Reinhard curve and
  a gentle vignette. **No film-grain / noise-overlay pass** — additive trails +
  tonemap only.
- **Audio drives energy, never hue.** Every path is `bufferSource → gentle lowpass
  → createSafeMaster` (never `ctx.destination`), and all visuals read
  `master.analyser`. Bass lifts overall drive/speed, mid opens body brightness,
  treble sparks the violet peaks, and energy adds turbulence. Default track is
  `REAL_TRACKS[0]`; a picker spans `COLLECTIONS` (studied from hall).
- **Sync.** peerSync's NTP-style clock makes `now()` the same millisecond on every
  peer; the host anchors the take to a synced instant `{S, O, trackId}` and
  re-broadcasts every ~2 s for late joiners, so Karel's one take starts sample-close
  for all. BroadcastChannel for two same-browser tabs, a real WebRTC data channel
  (copy-paste SDP, no server) for remote peers — exactly as attune/hearth wire it.
- **Installation framing.** Full-viewport dark aesthetic, a Fullscreen toggle, an
  Installation mode that hides chrome (wakes on mouse-move, Esc exits), an operator
  strip (Play the room, track picker, solo/invite with join code + peer count,
  re-anchor), and a coherence meter.

## Ambition criteria met

- **≥3 subsystems:** catalog loader/decoder + safe-master analyser bus + peerSync
  multi-user transport (BroadcastChannel + WebRTC + shared clock) + presence/coherence
  engine + WebGPU compute-and-trail renderer (five).
- **Named real reference:** Refik Anadol's data-wall aesthetic (a projected field
  fed by live signal; the audience's presence becomes the piece) and the
  installation lineage of hall.
- **Recent research:** "The Third Between Us: Multi-User Co-Presence through Shared
  Auditory-Haptic Vibroscapes" (Augmented Humans Intl Conf 2026, ACM) — one
  participant's action modulates the shared perceptual field — generalized here to N;
  grounded in Pauline Oliveros's _Deep Listening_.

## How it degrades

- **No WebGPU** (`!navigator.gpu`, or adapter/device request fails): a Canvas2D
  reduced weave of the same field (fewer particles, same owner→centroid convergence
  and rotation, same neutral palette), with an on-brand muted notice; the take keeps
  playing.
- **No Canvas either:** a still neutral CSS glow (radial graphite gradient) holds
  the wall; the take still plays.
- **Audio load fails:** a visible `text-destructive` error; never a synthesized
  stand-in.
- **No peers:** the five synthetic presences keep the field woven and alive; solo is
  a first-class state.
- **`prefers-reduced-motion`:** synthetic drift and audio tremor freeze to a calm
  still; convergence still reads, just without motion.
