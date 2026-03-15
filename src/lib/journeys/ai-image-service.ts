/** Client-side service for AI image generation via fal.ai proxy */

interface GenerateFrameOptions {
  prompt: string;
  denoisingStrength: number;
  previousFrame?: string;
  width?: number;
  height?: number;
}

interface GenerateResult {
  image: string; // URL
  cost: number;
}

interface AiImageStatus {
  enabled: boolean;
  estimatedCostPerImage: number;
}

const DEFAULT_COST_CAP = 5.0; // $5 per session

class AiImageService {
  private available: boolean | null = null;
  private costPerImage = 0.003;
  private sessionCost = 0;
  private costCap = DEFAULT_COST_CAP;
  private generating = false;

  /** Check if the AI image service is available */
  async checkAvailability(): Promise<boolean> {
    if (this.available !== null) return this.available;

    try {
      const res = await fetch("/api/ai-image/status");
      if (!res.ok) {
        this.available = false;
        return false;
      }
      const data: AiImageStatus = await res.json();
      this.available = data.enabled;
      this.costPerImage = data.estimatedCostPerImage;
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  /** Generate a single frame */
  async generateFrame(options: GenerateFrameOptions): Promise<GenerateResult | null> {
    if (this.available === false) return null;
    if (this.sessionCost >= this.costCap) return null;
    if (this.generating) return null;

    this.generating = true;

    try {
      const res = await fetch("/api/ai-image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: options.prompt,
          denoisingStrength: options.denoisingStrength,
          previousFrame: options.previousFrame,
          width: options.width ?? 512,
          height: options.height ?? 512,
        }),
      });

      if (!res.ok) {
        if (res.status === 501) {
          this.available = false;
        }
        return null;
      }

      const data: GenerateResult = await res.json();
      this.sessionCost += data.cost;
      return data;
    } catch {
      return null;
    } finally {
      this.generating = false;
    }
  }

  /** Get current session cost */
  getSessionCost(): number {
    return this.sessionCost;
  }

  /** Get the cost cap */
  getCostCap(): number {
    return this.costCap;
  }

  /** Set a custom cost cap */
  setCostCap(cap: number): void {
    this.costCap = cap;
  }

  /** Reset session cost tracking */
  resetSession(): void {
    this.sessionCost = 0;
  }

  /** Is the service currently generating? */
  isGenerating(): boolean {
    return this.generating;
  }

  /** Has the cost cap been reached? */
  isCapped(): boolean {
    return this.sessionCost >= this.costCap;
  }

  /** Estimate cost for a track duration */
  estimateCost(durationSeconds: number, fps: number): number {
    const totalFrames = Math.ceil(durationSeconds * fps);
    return totalFrames * this.costPerImage;
  }
}

// Singleton
let instance: AiImageService | null = null;

export function getAiImageService(): AiImageService {
  if (!instance) {
    instance = new AiImageService();
  }
  return instance;
}
