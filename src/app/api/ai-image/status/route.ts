import { checkOrigin } from "../origin-check";

let lastWarmTime = 0;
const WARM_INTERVAL_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  // Origin allowlist FIRST — the background pre-warm below spends fal
  // credits, so third-party origins can't trigger it.
  const forbidden = checkOrigin(request);
  if (forbidden) return forbidden;

  // Kiosk (OFFLINE_PACK) default: the downloaded image library IS the
  // show — live fal is opt-in via TRAMOKYO_LIVE_FAL=1 in the kiosk env,
  // so a home test with internet + dev FAL_KEY behaves exactly like the
  // desert. Production (non-pack) behavior is unchanged.
  const packOnly =
    process.env.OFFLINE_PACK === "1" &&
    process.env.TRAMOKYO_LIVE_FAL !== "1";
  const enabled = !packOnly && !!process.env.FAL_KEY;

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
