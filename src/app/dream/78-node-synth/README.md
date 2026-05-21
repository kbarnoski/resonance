# 78 — Node Synth

**Route**: `/dream/78-node-synth`  
**Status**: `demoable`  
**Built**: Cycle 93  
**Deps**: zero  
**API**: none  

## What it is

A visual modular synthesizer patch bay — the Web Audio API made visible. Oscillators, gain stages, filters, and delay effects appear as draggable node cards connected by bezier wire curves. Connect any output port to any input port; audio flows in real time.

## How it works

- **Graph state** managed by `useReducer` — a pure list of node definitions + wire connections, no imperative state.
- **Audio engine** mirrors the visual graph: when a wire is added, `AudioNode.connect()` fires; when removed, nodes re-wire from scratch (disconnect-all + reconnect from wire list). Oscillators start on the first `ADD_NODE`; parameters update via `setTargetAtTime` for glitch-free live tweaking.
- **Wire canvas**: a `<canvas>` overlay covers the board at full size. Every render redraws all bezier curves (fast — Canvas2D, not WebGL). Pending wire (mid-draw) shows as a dashed line following the mouse.
- **Drag**: `setPointerCapture` on the node card's `onPointerDown`, position deltas applied to the reducer.
- **Port hit test**: ports are small SVG circles with `onClick` — output port starts a "pending" wire, input port completes it.

## Starter patch

Loaded on first mount: `Oscillator (220 Hz sine) → Gain (0.4) → Destination`. Press ▶ Start audio to hear it. Typical exploration:
1. Add a Filter — connect it between Oscillator and Gain
2. Sweep filter frequency — hear the lowpass sweep
3. Add a Delay — tap its output to Gain as well (wet blend)
4. Set Delay feedback to 0.6 for echo trails

## Node types

| Node | Params |
|------|--------|
| Oscillator | freq (40–2000 Hz, log), detune (±1200 ¢), wave type |
| Gain | gain (0–1) |
| Filter | freq (80–18k Hz, log), Q (0.1–20), type (lowpass/highpass/bandpass/notch/peaking) |
| Delay | time (0.01–2s), feedback (0–0.95) |
| Destination | speakers — audio output |

## Polish ideas

- **Mic input node** — `getUserMedia` → `MediaStreamSourceNode` — live signal as patch source
- **LFO node** — an oscillator hard-wired as a modulator (frequency output mapped to another node's AudioParam via `connect(param)`)
- **Analyser node** — shows a live mini-waveform or spectrum on the card itself
- **Envelope node** — ADSR gate that triggers on click
- **Save/load patch** — `localStorage` serialization of graph state (pure JSON)
- **Multiple outputs** — nodes can connect to more than one destination (the Web Audio graph supports this; the visual needs multi-wire drawing)
