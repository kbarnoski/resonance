// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — the convolution cross-synthesis engine for 16160-roomtone.
//
// The one idea: take TWO of Karel's real piano takes. Trim a few seconds of the
// "room" take and drop that raw waveform straight into a ConvolverNode as its
// impulse response — his recording literally becomes the acoustic space. Then
// play the OTHER take *through* it. A wet/dry crossfade morphs between the dry
// voice take and the voice take convolved with (heard inside) the room take.
//
// Every audible node terminates in the shared safeMaster bus — never
// ctx.destination — so the summed convolution can never slam the speakers.
// ─────────────────────────────────────────────────────────────────────────────

import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

/** Downsampled vector data the SVG cross-section draws from. */
export interface Strata {
  /** Voice-take waveform peaks, 0..1 (the take heard through the room). */
  voice: number[];
  /** Room-take waveform peaks, 0..1 (the take used as the IR). */
  room: number[];
  /** Impulse-response decay envelope, 0..1 (left = onset, right = tail). */
  envelope: number[];
}

export interface RoomtoneEngine {
  /** Begin playback; resolves once audio is running. */
  start(): Promise<void>;
  /** Stop the voice source but keep the graph + context alive. */
  stop(): void;
  /** Full teardown: stop, disconnect, close the AudioContext. */
  destroy(): void;
  /** 0 = fully dry voice take, 1 = fully wet (voice heard inside the room). */
  setBlend(wet: number): void;
  /** Swap which take is the room (IR) and which is the voice. */
  swapRoles(): Promise<void>;
  /** Load a new pair of takes by REAL_TRACKS id. */
  loadTakes(voiceId: string, roomId: string): Promise<void>;
  getStrata(): Strata;
  /** Live output level 0..1, sampled from the safeMaster analyser. */
  getRms(): number;
  /** Voice-take playback position 0..1 (loops). */
  getPlayheadPct(): number;
  isPlaying(): boolean;
  voiceId(): string;
  roomId(): string;
}

/** Seconds of the room take used as the raw impulse response. */
const IR_SECONDS = 3;
const STRATA_COLS = 132;
const ENVELOPE_COLS = 72;
/** Attenuation on the wet path — convolving two loud takes can bloom hard. */
const WET_MAKEUP = 0.55;

function peaksOf(buf: AudioBuffer, cols: number): number[] {
  const data = buf.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / cols));
  const out: number[] = [];
  let max = 0;
  for (let i = 0; i < cols; i++) {
    let p = 0;
    const s = i * block;
    for (let j = 0; j < block; j++) {
      const v = Math.abs(data[s + j] ?? 0);
      if (v > p) p = v;
    }
    out.push(p);
    if (p > max) max = p;
  }
  return max > 0 ? out.map((v) => v / max) : out;
}

function envelopeOf(irBuf: AudioBuffer, cols: number): number[] {
  const data = irBuf.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / cols));
  const out: number[] = [];
  let max = 0;
  for (let i = 0; i < cols; i++) {
    let sum = 0;
    const s = i * block;
    for (let j = 0; j < block; j++) {
      const v = data[s + j] ?? 0;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / block);
    out.push(rms);
    if (rms > max) max = rms;
  }
  return max > 0 ? out.map((v) => v / max) : out;
}

/**
 * Trim a few seconds of the room take into a fresh AudioBuffer for use as the
 * ConvolverNode's impulse response. The samples are copied RAW — only short
 * edge fades are applied so the onset/tail don't click. That rawness is the
 * point: the room take's real notes and decay become the reverberant space.
 */
function buildImpulse(ctx: AudioContext, roomBuf: AudioBuffer): AudioBuffer {
  const rate = roomBuf.sampleRate;
  const startSec = Math.min(2, roomBuf.duration * 0.15);
  const start = Math.floor(startSec * rate);
  const len = Math.min(
    Math.floor(IR_SECONDS * rate),
    Math.max(1, roomBuf.length - start),
  );
  const channels = Math.min(2, roomBuf.numberOfChannels);
  const ir = ctx.createBuffer(channels, len, rate);
  const fadeIn = Math.max(1, Math.floor(0.005 * rate));
  const fadeOut = Math.max(1, Math.floor(0.15 * rate));
  for (let c = 0; c < channels; c++) {
    const srcCh = Math.min(c, roomBuf.numberOfChannels - 1);
    const src = roomBuf.getChannelData(srcCh);
    const dst = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      let g = 1;
      if (i < fadeIn) g = i / fadeIn;
      else if (i > len - fadeOut) g = (len - i) / fadeOut;
      dst[i] = (src[start + i] ?? 0) * g;
    }
  }
  return ir;
}

export interface EngineDefaults {
  voiceId: string;
  roomId: string;
}

/**
 * Build the engine. Owns its own AudioContext (created lazily on first start so
 * it lands inside a user gesture) and the whole audio graph. Buffers are
 * fetched from Karel's real catalog only.
 */
export function createEngine(defaults: EngineDefaults): RoomtoneEngine {
  let ctx: AudioContext | null = null;
  let master: SafeMaster | null = null;
  let convolver: ConvolverNode | null = null;
  let wetGain: GainNode | null = null;
  let dryGain: GainNode | null = null;
  let source: AudioBufferSourceNode | null = null;

  let voiceBuf: AudioBuffer | null = null;
  let roomBuf: AudioBuffer | null = null;
  let curVoiceId = defaults.voiceId;
  let curRoomId = defaults.roomId;

  let blend = 0.5;
  let playing = false;
  let startedAt = 0;
  let strata: Strata = { voice: [], room: [], envelope: [] };
  const analyserBytes = new Uint8Array(1024);

  function ensureContext(): AudioContext {
    if (ctx) return ctx;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
    master = createSafeMaster(ctx);
    convolver = ctx.createConvolver();
    convolver.normalize = true;
    wetGain = ctx.createGain();
    dryGain = ctx.createGain();
    // Static graph: convolver → wetGain → master, and dryGain → master. Only
    // the source and the convolver's IR buffer change over the piece's life.
    convolver.connect(wetGain);
    wetGain.connect(master.input);
    dryGain.connect(master.input);
    applyBlend();
    return ctx;
  }

  function applyBlend() {
    if (!ctx || !wetGain || !dryGain) return;
    const w = Math.min(1, Math.max(0, blend));
    // Equal-power crossfade; wet is additionally attenuated to tame the bloom.
    const wetLevel = Math.sin((w * Math.PI) / 2) * WET_MAKEUP;
    const dryLevel = Math.cos((w * Math.PI) / 2);
    const t = ctx.currentTime;
    wetGain.gain.setTargetAtTime(wetLevel, t, 0.04);
    dryGain.gain.setTargetAtTime(dryLevel, t, 0.04);
  }

  function recomputeStrata() {
    if (!voiceBuf || !roomBuf || !ctx) return;
    const ir = buildImpulse(ctx, roomBuf);
    strata = {
      voice: peaksOf(voiceBuf, STRATA_COLS),
      room: peaksOf(roomBuf, STRATA_COLS),
      envelope: envelopeOf(ir, ENVELOPE_COLS),
    };
  }

  function rebuildImpulse() {
    if (!ctx || !convolver || !roomBuf) return;
    convolver.buffer = buildImpulse(ctx, roomBuf);
  }

  function startSource() {
    if (!ctx || !convolver || !dryGain || !voiceBuf) return;
    stopSource();
    source = ctx.createBufferSource();
    source.buffer = voiceBuf;
    source.loop = true;
    source.connect(dryGain); // dry path
    source.connect(convolver); // wet path (into the room IR)
    source.start(0);
    startedAt = ctx.currentTime;
  }

  function stopSource() {
    if (!source) return;
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    try {
      source.disconnect();
    } catch {
      /* graph gone */
    }
    source = null;
  }

  async function ensureBuffers() {
    const c = ensureContext();
    if (!voiceBuf) voiceBuf = (await loadRealTrackBuffer(c, curVoiceId)).buffer;
    if (!roomBuf) roomBuf = (await loadRealTrackBuffer(c, curRoomId)).buffer;
    rebuildImpulse();
    recomputeStrata();
  }

  return {
    async start() {
      const c = ensureContext();
      await ensureBuffers();
      if (c.state === "suspended") await c.resume();
      startSource();
      playing = true;
    },
    stop() {
      stopSource();
      playing = false;
    },
    destroy() {
      stopSource();
      try {
        master?.disconnect();
      } catch {
        /* closing */
      }
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
      ctx = null;
      master = null;
      convolver = null;
      playing = false;
    },
    setBlend(wet: number) {
      blend = Math.min(1, Math.max(0, wet));
      applyBlend();
    },
    async swapRoles() {
      const nextVoice = curRoomId;
      const nextRoom = curVoiceId;
      const nextVoiceBuf = roomBuf;
      const nextRoomBuf = voiceBuf;
      curVoiceId = nextVoice;
      curRoomId = nextRoom;
      voiceBuf = nextVoiceBuf;
      roomBuf = nextRoomBuf;
      rebuildImpulse();
      recomputeStrata();
      if (playing) startSource();
    },
    async loadTakes(voiceIdNext: string, roomIdNext: string) {
      const c = ensureContext();
      const voiceChanged = voiceIdNext !== curVoiceId;
      const roomChanged = roomIdNext !== curRoomId;
      curVoiceId = voiceIdNext;
      curRoomId = roomIdNext;
      if (voiceChanged || !voiceBuf)
        voiceBuf = (await loadRealTrackBuffer(c, voiceIdNext)).buffer;
      if (roomChanged || !roomBuf)
        roomBuf = (await loadRealTrackBuffer(c, roomIdNext)).buffer;
      rebuildImpulse();
      recomputeStrata();
      if (playing) startSource();
    },
    getStrata() {
      return strata;
    },
    getRms() {
      if (!master) return 0;
      master.analyser.getByteTimeDomainData(analyserBytes);
      let sum = 0;
      for (let i = 0; i < analyserBytes.length; i++) {
        const v = (analyserBytes[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / analyserBytes.length) * 3);
    },
    getPlayheadPct() {
      if (!ctx || !voiceBuf || !playing) return 0;
      const dur = voiceBuf.duration || 1;
      return ((ctx.currentTime - startedAt) % dur) / dur;
    },
    isPlaying() {
      return playing;
    },
    voiceId() {
      return curVoiceId;
    },
    roomId() {
      return curRoomId;
    },
  };
}
