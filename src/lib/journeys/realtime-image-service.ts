/**
 * Real-time AI image service using fal.ai.
 *
 * Tries WebSocket for ~250ms latency per frame.
 * Falls back to REST via /api/ai-image/generate if WS fails.
 */

interface RealtimeImageOptions {
  prompt: string;
  denoisingStrength: number;
  previousFrameDataUrl?: string;
  width?: number;
  height?: number;
}

type FrameCallback = (imageUrl: string) => void;

const STYLE_SUFFIX = "mystical art, luminous, sacred, transcendent, visionary, otherworldly beauty";
const DEFAULT_COST_CAP = 5.0;

class RealtimeImageService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;
  private connected = false;
  private connecting = false;
  private available: boolean | null = null;
  private frameCallback: FrameCallback | null = null;
  private sessionCost = 0;
  private costCap = DEFAULT_COST_CAP;
  private costPerFrame = 0.002;
  private pendingFrames = 0;
  private maxPendingFrames = 2;
  private restInFlight = false;

  /** Check if AI image generation is available */
  async checkAvailability(): Promise<boolean> {
    try {
      const res = await fetch("/api/ai-image/status");
      if (!res.ok) {
        this.available = false;
        return false;
      }
      const data = await res.json();
      this.available = !!data.enabled;
      return this.available!;
    } catch {
      this.available = false;
      return false;
    }
  }

  /** Connect via WebSocket for real-time generation */
  async connect(): Promise<boolean> {
    if (this.connected) return true;
    if (this.connecting) return false;

    this.connecting = true;

    try {
      const { fal } = await import("@fal-ai/client");

      // Fetch token from server, then configure credentials
      const tokenRes = await fetch("/api/ai-image/token");
      const tokenData = await tokenRes.json();
      const apiKey = tokenData.token;

      if (!apiKey) {
        throw new Error("No token returned from /api/ai-image/token");
      }

      fal.config({
        credentials: `Key ${apiKey}`,
        proxyUrl: "/api/ai-image/token",
      });

      this.connection = fal.realtime.connect("fal-ai/fast-lcm-diffusion", {
        connectionKey: "resonance-journey",
        clientOnly: true,
        onResult: (result: unknown) => {
          this.pendingFrames = Math.max(0, this.pendingFrames - 1);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imageUrl = (result as any)?.images?.[0]?.url;
          if (imageUrl && this.frameCallback) {
            this.sessionCost += this.costPerFrame;
            this.frameCallback(imageUrl);
          }
        },
        onError: (error: unknown) => {
          void error;
          this.connected = false;
          this.pendingFrames = 0;
        },
      });

      this.connected = true;
      this.connecting = false;
      return true;
    } catch {
      this.connecting = false;
      return false;
    }
  }

  disconnect(): void {
    if (this.connection) {
      try { this.connection.close(); } catch {}
      this.connection = null;
    }
    this.connected = false;
    this.connecting = false;
    this.pendingFrames = 0;
  }

  onFrame(callback: FrameCallback): void {
    this.frameCallback = callback;
  }

  /** Send frame via WebSocket */
  sendFrame(options: RealtimeImageOptions): boolean {
    if (!this.connection || !this.connected) return false;
    if (this.sessionCost >= this.costCap) return false;
    if (this.pendingFrames >= this.maxPendingFrames) return false;

    const fullPrompt = `${options.prompt}, ${STYLE_SUFFIX}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: Record<string, any> = {
      prompt: fullPrompt,
      num_inference_steps: 4,
      guidance_scale: 1.0,
      strength: Math.max(0.1, Math.min(0.9, options.denoisingStrength)),
      image_size: {
        width: options.width ?? 768,
        height: options.height ?? 768,
      },
      enable_safety_checker: false,
    };

    if (options.previousFrameDataUrl) {
      input.image_url = options.previousFrameDataUrl;
    }

    try {
      this.connection.send(input);
      this.pendingFrames++;
      return true;
    } catch {
      return false;
    }
  }

  /** Generate frame via REST API (server-side proxy) */
  async generateFrameREST(options: RealtimeImageOptions): Promise<string | null> {
    if (this.sessionCost >= this.costCap) return null;
    if (this.restInFlight) return null; // Only one REST request at a time
    this.restInFlight = true;

    try {
      const res = await fetch("/api/ai-image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: options.prompt,
          denoisingStrength: options.denoisingStrength,
          previousFrame: options.previousFrameDataUrl,
          width: options.width ?? 768,
          height: options.height ?? 768,
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      this.sessionCost += data.cost ?? this.costPerFrame;
      return data.image ?? null;
    } catch {
      return null;
    } finally {
      this.restInFlight = false;
    }
  }

  isConnected(): boolean { return this.connected; }
  getSessionCost(): number { return this.sessionCost; }
  isCapped(): boolean { return this.sessionCost >= this.costCap; }
  setCostCap(cap: number): void { this.costCap = cap; }
  hasPendingCapacity(): boolean { return this.pendingFrames < this.maxPendingFrames; }

  resetSession(): void {
    this.sessionCost = 0;
    this.pendingFrames = 0;
    this.available = null;
    this.restInFlight = false;
  }
}

// Singleton
let instance: RealtimeImageService | null = null;

export function getRealtimeImageService(): RealtimeImageService {
  if (!instance) {
    instance = new RealtimeImageService();
  }
  return instance;
}
