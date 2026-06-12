// audio.ts — Zone-based spatial pentatonic synthesiser
// C-major pentatonic: C4 D4 E4 G4 A4 + octave extensions

export type ZoneTimbre = "bell" | "string" | "chime" | "marimba";

// C4 pentatonic: C4=261.63, D4=293.66, E4=329.63, G4=392.00, A4=440.00
// plus low and high octaves for variety
const PENTA: number[] = [
  130.81, // C3
  164.81, // E3
  196.00, // G3
  220.00, // A3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.00, // G4
  440.00, // A4
  523.25, // C5
];

// Map horizontal position (0..1) inside a zone → nearest pentatonic note
export function hzForPosition(xNorm: number, zoneIdx: number): number {
  // Each zone occupies 2-3 notes in PENTA
  const offsets = [0, 2, 4, 6, 8];
  const base = offsets[zoneIdx % offsets.length];
  const noteRange = 3;
  const idx = base + Math.round(xNorm * (noteRange - 1));
  return PENTA[Math.min(idx, PENTA.length - 1)];
}

// Per-zone last-trigger timestamps, for voice-rate-limiting
const lastTrig: number[] = new Array(8).fill(-999);
const MIN_RETRIG = 0.05; // seconds

// Brick-wall limiter + lowpass shared chain
let limiter: DynamicsCompressorNode | null = null;
let lpf: BiquadFilterNode | null = null;
let masterGain: GainNode | null = null;

export function buildChain(actx: AudioContext): AudioNode {
  if (masterGain) return masterGain;

  masterGain = actx.createGain();
  masterGain.gain.value = 0.75;

  lpf = actx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 8000;
  lpf.Q.value = 0.5;

  limiter = actx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-10, actx.currentTime);
  limiter.knee.setValueAtTime(3, actx.currentTime);
  limiter.ratio.setValueAtTime(20, actx.currentTime);
  limiter.attack.setValueAtTime(0.001, actx.currentTime);
  limiter.release.setValueAtTime(0.08, actx.currentTime);

  masterGain.connect(lpf);
  lpf.connect(limiter);
  limiter.connect(actx.destination);

  return masterGain;
}

export function resetChain(): void {
  limiter = null;
  lpf = null;
  masterGain = null;
  lastTrig.fill(-999);
}

// Bell timbre: sine fundamental + 2 partials, fast attack, medium decay
function triggerBell(
  actx: AudioContext,
  chain: AudioNode,
  hz: number,
  vol: number
): void {
  const now = actx.currentTime;
  const dur = 1.4;
  const partials: [number, number][] = [
    [hz, vol * 0.6],
    [hz * 2.76, vol * 0.18],
    [hz * 5.4, vol * 0.07],
  ];
  for (const [f, a] of partials) {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(a, now + 0.006);
    g.gain.setTargetAtTime(0.001, now + 0.02, dur * 0.35);
    osc.connect(g).connect(chain);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }
}

// Plucked string: Karplus-ish via noise burst + resonant filter
function triggerString(
  actx: AudioContext,
  chain: AudioNode,
  hz: number,
  vol: number
): void {
  const now = actx.currentTime;
  const bufLen = Math.floor(actx.sampleRate * 0.06);
  const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);

  const src = actx.createBufferSource();
  src.buffer = buf;

  const filt = actx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = hz;
  filt.Q.value = 25;

  const g = actx.createGain();
  g.gain.setValueAtTime(vol * 1.1, now);
  g.gain.setTargetAtTime(0.001, now + 0.04, 0.28);

  src.connect(filt);
  filt.connect(g);
  g.connect(chain);
  src.start(now);
}

// Chime: triangle wave + high harmonics, very fast attack, slow decay
function triggerChime(
  actx: AudioContext,
  chain: AudioNode,
  hz: number,
  vol: number
): void {
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = hz * 1.5; // chimes ring higher

  const osc2 = actx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = hz * 3.1;

  const g = actx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(vol * 0.65, now + 0.004);
  g.gain.setTargetAtTime(0.001, now + 0.01, 0.55);

  const g2 = actx.createGain();
  g2.gain.value = 0.25;

  osc.connect(g).connect(chain);
  osc2.connect(g2).connect(chain);
  osc.start(now);
  osc2.start(now);
  osc.stop(now + 2.5);
  osc2.stop(now + 2.5);
}

// Marimba: square-ish tone, fast sharp attack, medium decay
function triggerMarimba(
  actx: AudioContext,
  chain: AudioNode,
  hz: number,
  vol: number
): void {
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  osc.type = "square";
  osc.frequency.value = hz;

  // Strong lowpass to soften square wave into marimba-ish tone
  const filt = actx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = hz * 3.5;
  filt.Q.value = 1.2;

  const g = actx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(vol * 0.5, now + 0.008);
  g.gain.setTargetAtTime(0.001, now + 0.03, 0.22);

  osc.connect(filt);
  filt.connect(g);
  g.connect(chain);
  osc.start(now);
  osc.stop(now + 1.2);
}

export interface ZoneTriggerParams {
  actx: AudioContext;
  chain: AudioNode;
  zoneIdx: number;
  timbre: ZoneTimbre;
  xNorm: number; // 0..1 position within zone
  volume?: number;
}

export function triggerZone(params: ZoneTriggerParams): void {
  const { actx, chain, zoneIdx, timbre, xNorm, volume = 0.35 } = params;
  const now = actx.currentTime;

  // Rate-limit per zone
  if (now - lastTrig[zoneIdx] < MIN_RETRIG) return;
  lastTrig[zoneIdx] = now;

  const hz = hzForPosition(xNorm, zoneIdx);

  switch (timbre) {
    case "bell":
      triggerBell(actx, chain, hz, volume);
      break;
    case "string":
      triggerString(actx, chain, hz, volume);
      break;
    case "chime":
      triggerChime(actx, chain, hz, volume);
      break;
    case "marimba":
      triggerMarimba(actx, chain, hz, volume);
      break;
  }
}
