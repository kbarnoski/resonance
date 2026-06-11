# Accord Call — 508

**"What if two people in different places had to negotiate their way out of dissonance together — the harmony resolving only when both move toward agreement over a real peer-to-peer connection?"**

Cycle 2 of the lab's *Together* spine. An adult piece about synchrony, cooperation, and the physics of shared sound.

---

## What It Is

Two browsers. Two voices. A harmony that neither player can resolve alone.

Each participant drags their pointer vertically on their half of the screen to control their voice's continuous pitch within a just-intonation range (~130–520 Hz, two octaves). Both voices are synthesised locally using harmonic oscillators. The **Plomp–Levelt / Sethares sensory roughness model** computes the dissonance in real time from the beating of overlapping partials.

When both players sit far from a consonant interval (unison, fifth, fourth, third, octave), the tension cord connecting the two orbs is **jagged, red, and rough** and the audio beats harshly. When both cooperate — both moving toward a consonant ratio — the roughness drops, the cord becomes a **smooth golden arc**, and a shimmer pad blooms. Neither player can resolve it alone.

---

## Subsystems

### `roughness.ts` — Plomp–Levelt sensory roughness
Implements the Sethares formulation of the Plomp–Levelt 1965 model. For each pair of partials across the two harmonic series:

```
r = a1 * a2 * (exp(−b1 * s * df) − exp(−b2 * s * df))
s = 0.24 / (0.0207 * fMin + 18.96)   (critical bandwidth)
```

Returns a 0..1 roughness scalar. The function `makePartials()` generates a harmonic series for a fundamental frequency.

### `audio.ts` — Web Audio synthesis engine
- Each voice: 5 harmonic oscillators (fundamental + overtones at 1/k amplitude) with stereo panning and a slow organic tremolo.
- Master chain ends with a `DynamicsCompressor` brick-wall limiter at ≈ −6 dB.
- A shimmer pad (four detuned sines) blooms via `shimmerGain` as consonance rises.
- `setVoicePitch()` smoothly ramps all harmonic oscillators using `setTargetAtTime`.
- `applyConsonance()` controls the shimmer level and voice presence.
- `createAccordAudio()` must be called inside a user-gesture handler (iOS requirement).

### `webrtc.ts` — Manual copy/paste signaling
Pure `RTCPeerConnection`, no server.

**Caller flow:**
1. `createRoom()` — creates `RTCPeerConnection` + `RTCDataChannel` (unreliable, ordered=false, no retransmit), calls `createOffer()`, sets local description, waits for ICE gathering to complete (or 8s timeout).
2. Caller copies the full SDP offer blob and sends it out-of-band.
3. `receiveAnswer(rtc, answerSDP)` — calls `setRemoteDescription()` to complete handshake.

**Joiner flow:**
1. `joinRoom(offerSDP)` — creates `RTCPeerConnection`, sets remote description, `createAnswer()`, waits for ICE gathering, exposes answer blob.
2. Joiner copies answer blob back to caller.

**Data messages:** `JSON { pitch: number }` (normalised 0..1), throttled to ~20 Hz. Channel is unreliable (UDP-like) to drop stale frames without queue buildup.

ICE: `stun:stun.l.google.com:19302`.

### `page.tsx` — React UI + SVG animation loop
- **SVG stage** with two orbs (warm-gold = yours, cool-teal = theirs), a tension cord that morphs between a jagged dissonant path and a smooth consonant arc, and ambient glow filters.
- **requestAnimationFrame loop** updates SVG attributes directly (no re-render) for smooth 60fps animation.
- **Bot / practice partner**: when no peer is connected, a simulated voice wanders in pitch, periodically drifting toward consonant intervals relative to your position (60% probability), so a solo visitor hears and sees the full arc.
- **Signaling panel** (right side): clean step-by-step UI for caller/joiner flow with copy buttons and paste areas.
- Drag interaction: vertical pointer drag on your half sets your normalised pitch. Pointer capture ensures drag stays active outside the element.

---

## WebRTC Signaling Flow (step by step)

```
Caller                          Joiner
──────                          ──────
createRoom()
  └→ RTCPeerConnection
  └→ RTCDataChannel("accord")
  └→ createOffer()
  └→ setLocalDescription(offer)
  └→ wait for ICE complete
  └→ SHOW offer blob ────────copy/paste────► paste into "Join room"
                                              joinRoom(offerSDP)
                                                └→ RTCPeerConnection
                                                └→ setRemoteDescription(offer)
                                                └→ createAnswer()
                                                └→ setLocalDescription(answer)
                                                └→ wait for ICE complete
                                                └→ SHOW answer blob
paste into "Complete"  ◄───copy/paste──── answer blob
receiveAnswer(answerSDP)
  └→ setRemoteDescription(answer)
  ─── ICE negotiation (STUN-assisted) ───
          RTCDataChannel opens ("connected ✓")
```

---

## Auto-demo (practice partner)

On load, a bot voice activates immediately. It wanders between pitches and periodically targets a consonant interval relative to your voice, producing the dissonance→consonance arc for any solo visitor. Labelled "practice partner — no one's connected yet". When a real peer connects, `hasPeerRef` flips true and the bot's output is replaced by the remote pitch.

---

## References

- **Plomp, R. & Levelt, W. J. M.** (1965). Tonal consonance and critical bandwidth. *Journal of the Acoustical Society of America*, 38(4), 548–560.
- **Sethares, W. A.** (1998). *Tuning, Timbre, Spectrum, Scale*. Springer. (Chapter 5 — the computeRoughness() formula is his formulation of Plomp–Levelt.)
- **Oliveros, Pauline** (1988/2005). *Deep Listening: A Composer's Sound Practice*. iUniverse. The concept of mutual, attentive sonic negotiation between players across space is the conceptual spine of this piece.

---

## Ambition Claims

- Real WebRTC peer-to-peer audio coordination with no server, no relay, no WebSocket — just two browsers and a copy/paste.
- Physics-grounded dissonance model (not aesthetic heuristics): the visual and audio response is derived from the actual partial structure of the tones.
- Cooperation gate: the resolution is literally inaccessible to a single player. Two wills, one harmony.

## Unverified Surface

- STUN traversal succeeds on most home networks and mobile hotspots but will fail on strict symmetric NAT. In those cases the manual copy/paste flow completes but the data channel never opens. A TURN server would fix this but requires a server.
- The shimmer pad frequencies (262, 330, 392, 523 Hz) are fixed rather than tracking the current consonant ratio, which can produce mild beating when the voices settle on intervals far from C major.
- iOS AudioContext autoplay policy: the `createAccordAudio()` call is inside the Start button's `onPointerDown` handler, which should satisfy the gesture requirement, but some older iOS versions may still suppress until a second interaction.
- The SVG `viewBox="0 0 400 500"` with `preserveAspectRatio="none"` stretches the stage to fill the container, which distorts the orb circular shape slightly on very wide or very narrow screens. A fixed-ratio container would prevent this at the cost of empty space.
