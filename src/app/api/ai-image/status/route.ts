let lastWarmTime = 0;
const WARM_INTERVAL_MS = 5 * 60 * 1000;

export async function GET() {
  const enabled = !!process.env.FAL_KEY;

  // Return immediately — don't let fal import or warm-up block the response
  const response = Response.json({
    enabled,
    estimatedCostPerImage: 0.003,
  });

  // Pre-warm in background (dynamic import so fal module load doesn't block)
  if (enabled && Date.now() - lastWarmTime > WARM_INTERVAL_MS) {
    lastWarmTime = Date.now();
    import("@fal-ai/client")
      .then(({ fal }) => {
        fal.config({ credentials: process.env.FAL_KEY! });
        return fal.subscribe("fal-ai/flux/schnell", {
          input: {
            prompt: "black",
            num_inference_steps: 1,
            image_size: { width: 128, height: 128 },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      })
      .catch(() => {});
  }

  return response;
}
