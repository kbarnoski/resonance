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
  /** Shared negative prompt passed straight through to fal. */
  negativePrompt?: string;
  /** Optional character-reference image. When present, the server
   *  routes to flux-pulid for identity-locked generation. */
  referenceImageUrl?: string;
}

type FrameCallback = (imageUrl: string) => void;

const STYLE_SUFFIX = "photorealistic, cinematic lighting, surreal, luminous, sacred, transcendent, ethereal";
const DEFAULT_COST_CAP = 10.0;

// ─── LRU Image Cache ───
const IMAGE_CACHE_MAX = 20;

class ImageCache {
  private cache = new Map<string, HTMLImageElement>();
  private order: string[] = [];

  /** Simple hash of prompt for cache key */
  private hash(prompt: string): string {
    let h = 0;
    for (let i = 0; i < prompt.length; i++) {
      h = ((h << 5) - h + prompt.charCodeAt(i)) | 0;
    }
    return String(h);
  }

  get(prompt: string): HTMLImageElement | undefined {
    return this.cache.get(this.hash(prompt));
  }

  set(prompt: string, img: HTMLImageElement): void {
    const key = this.hash(prompt);
    if (this.cache.has(key)) {
      // Move to end (most recent)
      this.order = this.order.filter((k) => k !== key);
    } else if (this.order.length >= IMAGE_CACHE_MAX) {
      // Evict oldest
      const evict = this.order.shift()!;
      this.cache.delete(evict);
    }
    this.cache.set(key, img);
    this.order.push(key);
  }

  clear(): void {
    this.cache.clear();
    this.order = [];
  }
}

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
  private restInFlight = 0; // number of concurrent REST requests
  private maxRestConcurrent = 2; // allow 2 parallel REST requests
  private imageCache = new ImageCache();
  private abortControllers = new Set<AbortController>();

  /** Check if AI image generation is available (5s timeout) */
  async checkAvailability(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("/api/ai-image/status", { signal: controller.signal });
      clearTimeout(timeout);
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

      // Fetch a short-lived JWT from our server. The endpoint mints
      // a token scoped to flux/schnell with a 5-min TTL — the master
      // FAL_KEY never reaches the client. The response indicates
      // which auth scheme to use ("Bearer" for JWTs, "Key" for the
      // legacy master-key path) so this code stays compatible if
      // the endpoint ever falls back.
      const tokenRes = await fetch("/api/ai-image/token");
      if (!tokenRes.ok) {
        throw new Error(`token endpoint returned ${tokenRes.status}`);
      }
      const tokenData = await tokenRes.json();
      const apiKey = tokenData.token;
      const scheme = tokenData.scheme === "Bearer" ? "Bearer" : "Key";

      if (!apiKey) {
        throw new Error("No token returned from /api/ai-image/token");
      }

      fal.config({
        credentials: `${scheme} ${apiKey}`,
        proxyUrl: "/api/ai-image/token",
      });

      this.connection = fal.realtime.connect("fal-ai/flux/schnell", {
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

  /** Clear the frame callback so a stale WebSocket response can't push into
   *  a previous mount's callback after a journey change. The next mount will
   *  re-register via onFrame(). */
  clearFrameCallback(): void {
    this.frameCallback = null;
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

  /** Generate frame via REST API (server-side proxy) — allows concurrent requests */
  async generateFrameREST(options: RealtimeImageOptions): Promise<string | null> {
    if (this.sessionCost >= this.costCap) return null;
    if (this.restInFlight >= this.maxRestConcurrent) return null;
    this.restInFlight++;

    const controller = new AbortController();
    this.abortControllers.add(controller);

    try {
      const timeout = setTimeout(() => controller.abort(), 45000);
      const res = await fetch("/api/ai-image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: options.prompt,
          denoisingStrength: options.denoisingStrength,
          previousFrame: options.previousFrameDataUrl,
          width: options.width ?? 768,
          height: options.height ?? 768,
          negativePrompt: options.negativePrompt,
          referenceImageUrl: options.referenceImageUrl,
        }),
      });
      clearTimeout(timeout);

      if (!res.ok) return null;

      const data = await res.json();
      this.sessionCost += data.cost ?? this.costPerFrame;
      return data.image ?? null;
    } catch {
      return null;
    } finally {
      this.restInFlight = Math.max(0, this.restInFlight - 1);
      this.abortControllers.delete(controller);
    }
  }

  isConnected(): boolean { return this.connected; }
  getSessionCost(): number { return this.sessionCost; }
  isCapped(): boolean { return this.sessionCost >= this.costCap; }
  setCostCap(cap: number): void { this.costCap = cap; }
  hasPendingCapacity(): boolean { return this.pendingFrames < this.maxPendingFrames; }

  /** Get cached image for a prompt */
  getCachedImage(prompt: string): HTMLImageElement | undefined {
    return this.imageCache.get(prompt);
  }

  /** Cache an image for a prompt */
  cacheImage(prompt: string, img: HTMLImageElement): void {
    this.imageCache.set(prompt, img);
  }

  /** Clear only the image cache (does not reset session cost or availability) */
  clearImageCache(): void {
    this.imageCache.clear();
  }

  /** Cancel all in-flight REST requests */
  cancelInFlight(): void {
    for (const c of this.abortControllers) {
      c.abort();
    }
    this.abortControllers.clear();
  }

  resetSession(): void {
    this.sessionCost = 0;
    this.pendingFrames = 0;
    this.available = null;
    this.restInFlight = 0;
    this.imageCache.clear();
    this.cancelInFlight();
    this.frameCallback = null;
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
