# 6664 · Cohere

**What if a chord could only exist when TWO people made it together — where
neither of you plays notes, but the sound is a function of BOTH of your
positions in a shared harmonic space, so the music literally cannot be authored
alone?**

The lab's first genuine two-person shared instrument. Its concept is true
co-authorship: the sounding harmony is jointly determined by two presences.

## How it works

- **The chord is a function of both positions.** A Canvas2D *harmonic field* — a
  2-D tonal space where left↔right chooses the root (along a lydian scale) and
  up↔down sets register/brightness. Your orb (lower) sets the fundamental and
  the lower dyad; the partner orb (upper) sets the upper voice, register and
  timbre; the **interval between the two orbs** slides the whole chord from
  consonance to tension. Draw together and it blooms; drift apart and it
  strains. One pure function, `computeChord(a, b)` in `audio.ts`, is evaluated
  identically on both machines.
- **Control-signals-not-audio.** Nothing sends audio over the wire — only tiny
  `{type:'orb', x, y, t}` control frames. Each side synthesizes its own warm,
  sustained Web Audio pad (detuned saws → lowpass → generated-impulse reverb,
  all glided so nothing clicks) from both orb positions. That is what makes a
  serverless browser duet feasible (Band-app-v2, 2026).
- **The ghost is a musician.** Solo, a synthetic `GhostPeer` drives the second
  orb. It is not a random mover: it watches your orb and steers toward
  musically meaningful positions — mostly nestling into consonance, occasionally
  leaning into tension and then resolving. Seeded with a mulberry32 PRNG (no
  `Math.random`); timing via `performance.now()`. So there is gorgeous evolving
  harmony before you touch anything.
- **Serverless copy-paste WebRTC.** "Invite a second player" opens a
  peer-to-peer data channel with no server and no API route (`net.ts`): the host
  generates an offer code (waits for ICE gathering to complete, then base64s the
  local description), the guest pastes it and returns an answer code, and the
  channel opens. When a real partner connects, the `RtcPeer` replaces the ghost
  and drives the second orb. If anything fails or is ignored, the ghost stays
  forever — networking never throws into the render loop.

## Interaction

- Drag your orb through the field (pointer + touch). The partner's orb moves
  under ghost or remote control; received positions are interpolated for
  smoothness.
- The chord sustains continuously and morphs as either orb moves — evolving
  harmony is present on load before you touch anything.
- Controls strip: **Start** (resumes the AudioContext on a gesture), **Invite**
  (the copy-paste panel), connection/partner status, and a live readout of the
  current root · interval.

## The point

Music that needs two. Solo you play against an intelligent ghost, but the piece
is *about* needing another presence to complete the harmony.

## Cycle 1 of a multi-cycle commitment

This is the first cycle. Next: clock synchronization between peers, and a richer
harmonic space (just-intonation lattice, more voices, shared tempo).

## Files

- `page.tsx` — the client component: canvas, pointer input, audio lifecycle,
  the animation/audio loop, invite UI.
- `audio.ts` — `computeChord(a, b)` (the shared harmonic function) + `PadEngine`.
- `renderer.ts` — Canvas2D rendering of the field, orbs and the bond/tension.
- `net.ts` — `Peer` interface, `GhostPeer` (ghost musician), `RtcPeer`
  (serverless copy-paste WebRTC), and the `mulberry32` PRNG.
- `notes.ts` — the in-page design notes.
