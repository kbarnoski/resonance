// ─────────────────────────────────────────────────────────────────────────────
// webcodecs.ts — minimal, module-local WebCodecs type shims + a safe accessor.
//
// The repo's bundled TypeScript DOM lib does not (yet) declare the WebCodecs
// globals (VideoFrame / VideoEncoder / VideoDecoder). Rather than edit any shared
// or global d.ts, we declare just-enough interfaces HERE and fetch the runtime
// constructors off globalThis with a cast. This has two nice properties:
//   • no `declare global` → zero risk of a duplicate-identifier clash if a newer
//     lib.dom.d.ts DOES ship these names;
//   • no dependency on the ambient types existing → compiles either way.
// ─────────────────────────────────────────────────────────────────────────────

export interface WcVideoFrameInit {
  timestamp: number; // microseconds, non-decreasing
  duration?: number;
}

export interface WcVideoFrame {
  readonly timestamp: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  close(): void;
}

export interface WcVideoFrameCtor {
  new (source: CanvasImageSource, init: WcVideoFrameInit): WcVideoFrame;
}

export interface WcEncodedVideoChunk {
  readonly type: "key" | "delta";
  readonly timestamp: number;
  readonly byteLength: number;
}

export interface WcEncodeOptions {
  keyFrame?: boolean;
}

export interface WcVideoEncoderConfig {
  codec: string;
  width: number;
  height: number;
  bitrate?: number;
  framerate?: number;
  latencyMode?: "quality" | "realtime";
  bitrateMode?: "constant" | "variable";
}

export interface WcVideoEncoderInit {
  output: (chunk: WcEncodedVideoChunk, meta?: unknown) => void;
  error: (e: DOMException) => void;
}

export interface WcVideoEncoder {
  readonly state: string;
  readonly encodeQueueSize: number;
  configure(config: WcVideoEncoderConfig): void;
  encode(frame: WcVideoFrame, options?: WcEncodeOptions): void;
  flush(): Promise<void>;
  close(): void;
}

export interface WcConfigSupport {
  supported?: boolean;
  config?: WcVideoEncoderConfig;
}

export interface WcVideoEncoderCtor {
  new (init: WcVideoEncoderInit): WcVideoEncoder;
  isConfigSupported(config: WcVideoEncoderConfig): Promise<WcConfigSupport>;
}

export interface WcVideoDecoderConfig {
  codec: string;
  codedWidth?: number;
  codedHeight?: number;
}

export interface WcVideoDecoderInit {
  output: (frame: WcVideoFrame) => void;
  error: (e: DOMException) => void;
}

export interface WcVideoDecoder {
  readonly state: string;
  readonly decodeQueueSize: number;
  configure(config: WcVideoDecoderConfig): void;
  decode(chunk: WcEncodedVideoChunk): void;
  flush(): Promise<void>;
  close(): void;
}

export interface WcVideoDecoderCtor {
  new (init: WcVideoDecoderInit): WcVideoDecoder;
}

export interface WebCodecsHandles {
  VideoFrame: WcVideoFrameCtor;
  VideoEncoder: WcVideoEncoderCtor;
  VideoDecoder: WcVideoDecoderCtor;
}

/** Grab the WebCodecs constructors off globalThis, or null if unavailable. */
export function getWebCodecs(): WebCodecsHandles | null {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as unknown as {
    VideoFrame?: WcVideoFrameCtor;
    VideoEncoder?: WcVideoEncoderCtor;
    VideoDecoder?: WcVideoDecoderCtor;
  };
  if (!g.VideoFrame || !g.VideoEncoder || !g.VideoDecoder) return null;
  return { VideoFrame: g.VideoFrame, VideoEncoder: g.VideoEncoder, VideoDecoder: g.VideoDecoder };
}
