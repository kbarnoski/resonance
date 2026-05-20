# GPU Audio FX — design notes

**Route**: `/dream/55-webgpu-audio-fx`  
**Cycle**: 68  
**Status**: demoable

## What it does

Synthesizes a C-major chord (C4 + E4 + G4 + C5) in JavaScript, then processes it through two WebGPU WGSL compute shader passes before playback:

1. **Pitch-shift pass** (srcBuf → midBuf): speed-adjusted linear interpolation resampling. Each output sample i reads from input position `i × speed`. speed < 1 = lower pitch; speed > 1 = higher pitch. At speed 0.5 the chord sounds an octave lower; at speed 2.0 an octave higher (with the second half of the 2.5s buffer silence, since the source runs out at i=N/2). This is whole-note pitch shift, not PSOLA — tempo changes with pitch.

2. **Reverb pass** (midBuf → outBuf): 6-tap FIR feedforward comb filter. Each output sample adds delayed copies of the pitch-shifted audio at 1009, 1777, 2477, 3089, 4013, and 5021 samples (~21–105 ms at 48kHz) with decreasing gain coefficients (0.40 → 0.07). Not a true convolution reverb — no tail buildup — but sounds like a stone chamber echo at high mix values.

Both shaders share the same `BindGroupLayout` (read-only-storage, storage, uniform). Passes run sequentially: submit pass 1, `await device.queue.onSubmittedWorkDone()`, then submit pass 2 with readback copy.

## Why this is different from other prototypes

All 54 prior prototypes process audio on the CPU (Web Audio API nodes, AudioWorklet, or AnalyserNode reads). This is the first prototype where the audio signal itself — not just the analysis — is computed on the GPU. The processed audio samples come back to the CPU only once: at the end, for playback. During the GPU passes there is no CPU involvement.

The timing display (GPU: X ms) is the total round-trip including two `onSubmittedWorkDone()` awaits and one `mapAsync`. Typical: 30–80ms for 120,000 samples. A CPU JS implementation of the same two effects takes ~8ms. The GPU is slower in absolute time at this sample count because of PCIe transfer overhead, not shader execution. At larger buffers (recording a full 5-minute piece at full quality) the GPU path would win. The demo is honest about this in the timing display.

## Architecture

```
navigator.gpu → adapter → device
Float32Array (JS, CPU) → writeBuffer → srcBuf (GPU)
  Pitch pass: srcBuf → midBuf (WGSL, 1 dispatch)
  Reverb pass: midBuf → outBuf (WGSL, 1 dispatch)
outBuf → copyBufferToBuffer → readBuf
readBuf.mapAsync → Float32Array (JS, CPU)
AudioContext.createBuffer() → AudioBufferSourceNode → AnalyserNode → speakers
```

## Polish ideas

- **PSOLA pitch shift** (preserve tempo): requires overlap-add in the shader — much more complex but eliminates the silence at high speed values
- **IIR comb reverb** (actual reverberant tail): needs two buffers and iterative passes — would require a different architecture than single-dispatch FIR
- **File upload / mic capture**: record 3 seconds of mic audio, then process it through the GPU — same pipeline, user-provided source
- **Latency profiling**: GPU timestamp queries (WebGPU `timestamp-query` feature) would measure actual shader execution time vs. transfer overhead separately
- **Resolution comparison**: run the same effects at float32 vs. float16 precision — GPUs are often faster at float16, and the perceptual difference in audio is subtle
- **Multi-channel stereo**: extend both shaders to process 2 channels, applying slight pitch detuning between L/R for a stereo width effect
