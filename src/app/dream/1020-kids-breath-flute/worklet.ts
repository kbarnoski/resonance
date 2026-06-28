// ─────────────────────────────────────────────────────────────────────────
// worklet.ts — runs the jet-drive waveguide flute inside an AudioWorklet for
// clean, low-latency audio, with a ScriptProcessorNode fallback.
//
// AudioWorklets cannot `import`, so the DSP is provided as a self-contained
// source string (mirroring flute.ts) and loaded via a Blob URL. The same
// source string drives the ScriptProcessor fallback.
//
// Messages from the main thread:
//   { type: "breath", value }   — breath envelope 0..1 (mic RMS or tap-puff)
//   { type: "midi",   value }   — set the bore pitch (a tapped recorder-hole)
//   { type: "gate",   value }   — 1 = sounding, 0 = release
//
// Message to the main thread (for the visualizer):
//   { type: "level",  rms, bright } — output RMS and brightness, ~60×/s
// ─────────────────────────────────────────────────────────────────────────

/** The DSP, written as a plain string so it can be injected into both the
 *  AudioWorkletProcessor and the ScriptProcessor. Kept faithful to flute.ts. */
const DSP_SOURCE = /* js */ `
function midiToHz(m){ return 440 * Math.pow(2,(m-69)/12); }

class FracDelay {
  constructor(maxDelay, initial){
    this.size = Math.max(4, Math.ceil(maxDelay)+4);
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.delay = Math.min(initial, this.size-2);
  }
  setDelay(d){ this.delay = Math.max(1, Math.min(d, this.size-2)); }
  tick(x){
    this.buf[this.w] = x;
    let rp = this.w - this.delay; if (rp < 0) rp += this.size;
    const i0 = Math.floor(rp), fr = rp - i0, i1 = (i0+1)%this.size;
    const o = this.buf[i0]*(1-fr) + this.buf[i1]*fr;
    this.w = (this.w+1)%this.size;
    return o;
  }
  reset(){ this.buf.fill(0); this.w = 0; }
}

class ReflectionFilter {
  constructor(pole, gain){ this.gain = gain; this.a1 = 0; this.b0 = 1; this.y1 = 0; this.setPole(pole); }
  setPole(p){ p = Math.max(-0.999, Math.min(0.999, p)); this.a1 = -p; this.b0 = (1-Math.abs(p))*this.gain; }
  process(x){ const y = this.b0*x - this.a1*this.y1; this.y1 = y; return y; }
  reset(){ this.y1 = 0; }
}

class DcBlocker {
  constructor(R){ this.R = R; this.x1 = 0; this.y1 = 0; }
  process(x){ const y = x - this.x1 + this.R*this.y1; this.x1 = x; this.y1 = y; return y; }
  reset(){ this.x1 = 0; this.y1 = 0; }
}

const PRESSURE_GATE = 0.04, PRESSURE_MIN = 0.8, PRESSURE_MAX = 0.95;

class FluteVoice {
  constructor(sr, midi){
    this.sr = sr; this.midi = midi;
    this.jetReflection = 0.5; this.endReflection = 0.5; this.jetRatio = 0.36;
    this.noiseGain = 0.02; this.outScale = 1.6; this.filterComp = 2.0; this.reflectMult = 5;
    this.rngState = 0x2545f491; this.lastBore = 0; this.breathSmooth = 0;
    const d = this._bore(midi);
    this.targetBore = d; this.curBore = d;
    const maxBore = this._bore(67) + 8;
    const maxJet = (maxBore*this.jetRatio)/(1-this.jetRatio) + 8;
    this.bore = new FracDelay(maxBore, d);
    this.jetDelay = new FracDelay(maxJet, (d*this.jetRatio)/(1-this.jetRatio));
    this.reflect = new ReflectionFilter(this._pole(midi), 1.0);
    this.dc = new DcBlocker(0.996);
  }
  _bore(m){ const period = this.sr/midiToHz(m) - this.filterComp; return period*(1-this.jetRatio); }
  _pole(m){ const fc = midiToHz(m)*this.reflectMult; return Math.exp(-2*Math.PI*Math.min(fc, this.sr*0.45)/this.sr); }
  setMidi(m){ this.midi = m; this.targetBore = this._bore(m); this.reflect.setPole(this._pole(m)); }
  reset(){ this.bore.reset(); this.jetDelay.reset(); this.reflect.reset(); this.dc.reset();
    this.breathSmooth = 0; this.curBore = this.targetBore; this.lastBore = 0; }
  _noise(){ let x = this.rngState; x ^= x<<13; x ^= x>>>17; x ^= x<<5; this.rngState = x>>>0;
    return (this.rngState/0xffffffff)*2 - 1; }
  process(breath){
    this.curBore += (this.targetBore - this.curBore)*0.004;
    this.bore.setDelay(this.curBore);
    this.jetDelay.setDelay((this.curBore*this.jetRatio)/(1-this.jetRatio));
    const b = Math.max(0, Math.min(1, breath));
    const ac = 1 - Math.exp(-1/(0.025*this.sr));
    this.breathSmooth += (b - this.breathSmooth)*ac;
    const env = this.breathSmooth;
    const gate = env < PRESSURE_GATE ? env/PRESSURE_GATE : 1;
    const pressure = env < PRESSURE_GATE
      ? PRESSURE_MIN*gate
      : PRESSURE_MIN + (PRESSURE_MAX-PRESSURE_MIN)*((env-PRESSURE_GATE)/(1-PRESSURE_GATE));
    const randP = this.noiseGain*this._noise()*pressure;
    const temp = -this.reflect.process(this.lastBore);
    let jin = pressure + randP - this.jetReflection*temp;
    jin = this.jetDelay.tick(jin);
    const xc = Math.max(-1, Math.min(1, jin));
    const jetOut = xc*(xc*xc - 1);
    const boreIn = jetOut + this.endReflection*temp;
    this.lastBore = this.bore.tick(boreIn);
    return this.dc.process(this.lastBore*this.outScale) * (env < PRESSURE_GATE ? gate : 1);
  }
}
`;

/** AudioWorkletProcessor source (uses the DSP above). */
const PROCESSOR_SOURCE = /* js */ `
${DSP_SOURCE}
class FluteProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.voice = new FluteVoice(sampleRate, 67);
    this.breath = 0;
    this.gate = 1;
    this.rmsAcc = 0; this.rmsN = 0; this.peak = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === "breath") this.breath = d.value;
      else if (d.type === "midi") this.voice.setMidi(d.value);
      else if (d.type === "gate") this.gate = d.value;
    };
  }
  process(_inputs, outputs){
    const out = outputs[0];
    const ch0 = out[0];
    const eff = this.gate ? this.breath : 0;
    for (let i = 0; i < ch0.length; i++){
      const s = this.voice.process(eff);
      ch0[i] = s;
      this.rmsAcc += s*s; this.rmsN++;
      const a = Math.abs(s); if (a > this.peak) this.peak = a;
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    // Report level ~every 512 samples for the visualizer.
    if (this.rmsN >= 512){
      const rms = Math.sqrt(this.rmsAcc/this.rmsN);
      this.port.postMessage({ type: "level", rms, bright: this.peak });
      this.rmsAcc = 0; this.rmsN = 0; this.peak = 0;
    }
    return true;
  }
}
registerProcessor("flute-processor", FluteProcessor);
`;

export interface FluteEngine {
  setBreath(v: number): void;
  setMidi(midi: number): void;
  setGate(on: boolean): void;
  onLevel(cb: (rms: number, bright: number) => void): void;
  readonly usingWorklet: boolean;
  stop(): void;
}

/** Build the flute engine on top of an AudioContext, preferring an
 *  AudioWorklet and falling back to a ScriptProcessorNode. */
export async function createFluteEngine(
  ctx: AudioContext,
  destination: AudioNode
): Promise<FluteEngine> {
  let levelCb: ((rms: number, bright: number) => void) | null = null;

  // ── Try AudioWorklet ─────────────────────────────────────────────────
  if (ctx.audioWorklet) {
    try {
      const blob = new Blob([PROCESSOR_SOURCE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "flute-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (e) => {
        if (e.data?.type === "level") levelCb?.(e.data.rms, e.data.bright);
      };
      node.connect(destination);
      return {
        usingWorklet: true,
        setBreath: (v) => node.port.postMessage({ type: "breath", value: v }),
        setMidi: (m) => node.port.postMessage({ type: "midi", value: m }),
        setGate: (on) => node.port.postMessage({ type: "gate", value: on ? 1 : 0 }),
        onLevel: (cb) => { levelCb = cb; },
        stop: () => { try { node.disconnect(); } catch { /* noop */ } },
      };
    } catch {
      // fall through to ScriptProcessor
    }
  }

  // ── ScriptProcessorNode fallback ─────────────────────────────────────
  // Instantiate the DSP in this scope by evaluating the source.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const makeVoice = new Function(
    "sampleRate",
    `${DSP_SOURCE}; return new FluteVoice(sampleRate, 67);`
  ) as (sr: number) => {
    setMidi(m: number): void;
    process(b: number): number;
  };
  const voice = makeVoice(ctx.sampleRate);
  let breath = 0;
  let gate = true;
  let rmsAcc = 0;
  let rmsN = 0;
  let peak = 0;

  const bufSize = 1024;
  const sp = ctx.createScriptProcessor(bufSize, 0, 1);
  sp.onaudioprocess = (e: AudioProcessingEvent) => {
    const ch = e.outputBuffer.getChannelData(0);
    const eff = gate ? breath : 0;
    for (let i = 0; i < ch.length; i++) {
      const s = voice.process(eff);
      ch[i] = s;
      rmsAcc += s * s;
      rmsN++;
      const a = Math.abs(s);
      if (a > peak) peak = a;
    }
    if (rmsN >= 512) {
      levelCb?.(Math.sqrt(rmsAcc / rmsN), peak);
      rmsAcc = 0;
      rmsN = 0;
      peak = 0;
    }
  };
  sp.connect(destination);

  return {
    usingWorklet: false,
    setBreath: (v) => { breath = v; },
    setMidi: (m) => voice.setMidi(m),
    setGate: (on) => { gate = on; },
    onLevel: (cb) => { levelCb = cb; },
    stop: () => { try { sp.disconnect(); } catch { /* noop */ } },
  };
}
