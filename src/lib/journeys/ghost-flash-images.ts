/**
 * Ghost flash-angel image pool.
 *
 * The Ghost journey's bass-hit flash shows an angelic figure on the beat.
 * Per the user's direction: the figure's FACE is visible here — the only
 * moment in the entire journey where she's seen directly. Everywhere else,
 * her face is hidden behind her white spiral hair.
 *
 * This module generates 3 face-visible variants once per Ghost session by
 * calling `/api/ai-image/generate` directly (bypassing the strict-camera
 * validation gate, which would reject visible faces). The results are
 * cached in module scope and consumed by `FlashAngel`.
 *
 * If generation fails or is slow, `FlashAngel` falls back to its static PNG.
 */

// These images are composited with mix-blend-mode: screen on the client, so
// the background MUST be pure mathematical black (0,0,0). Any atmospheric
// haze, particles, or gradient in the background will bleed through the
// composite. The subject is fully isolated — particles and wing mist are
// ON the figure only, never floating in the background.
const FLASH_PROMPTS = [
  "studio isolation shot photorealistic cinematic front view portrait of one ethereal angel woman perfectly isolated against absolute void, the background is SOLID RGB 0 0 0 PURE MATHEMATICAL BLACK with zero luminosity, zero color, zero gradient, zero haze, zero particles in the background, zero stars, zero atmosphere — the figure is the ONLY element visible, her face calmly visible with EYES CLOSED peaceful serene expression, BOTH ARMS RAISED high above her head reaching upward in a transcendent gesture, very long pure white fibonacci spiral curls cascading past her waist, pale luminous skin catching soft light, wearing a long flowing white dress, two LARGE transparent glowing white wings of pure light and mist fully spread behind her, swirling white particles ON HER BODY AND WINGS ONLY not in the surrounding darkness, strong rim light from above outlining her edges against the void, dramatic chiaroscuro, photographic product-shot isolation, not illustration, not concept art",
  "studio isolation shot photorealistic cinematic three-quarter front view of one ethereal angel woman perfectly isolated against absolute void, the background is SOLID RGB 0 0 0 PURE MATHEMATICAL BLACK with zero luminosity, zero color, zero gradient, zero haze, zero particles in background — subject is fully isolated cutout, her face softly visible with EYES CLOSED peaceful ecstatic expression, BOTH ARMS RAISED high above her head in a transcendent reach, very long pure white fibonacci spiral curls, pale luminous skin, wearing a long flowing white dress, two LARGE transparent glowing white wings fully unfurled, white particles ON HER BODY AND WINGS ONLY never in the background darkness, strong rim light from behind making the figure glow outward against total void, photographic clean subject isolation, not illustration",
  "studio isolation shot photorealistic cinematic medium shot front view of one ethereal angel woman perfectly isolated against absolute void, the background is SOLID RGB 0 0 0 PURE MATHEMATICAL BLACK with zero luminosity, zero color, zero gradient, zero haze, zero particles in background — only the bright figure visible against total void, her face visible with EYES CLOSED in serene peaceful expression, BOTH ARMS RAISED above her head hands stretching upward, very long pure white fibonacci spiral curls framing her face, pale luminous skin, wearing a long flowing white dress, two LARGE transparent white wings spread behind her, white particles ON HER BODY AND WINGS ONLY never in the surrounding darkness, strong backlight halo effect around her silhouette, photographic clean subject isolation, not illustration",
];

const flashUrls: (string | null)[] = [null, null, null];
let preparePromise: Promise<void> | null = null;
let currentJourneyId: string | null = null;

/**
 * Kick off (or reuse) a generation pass for the Ghost flash angel images.
 * Idempotent: if already generating or already populated for this journey,
 * returns the existing promise. Safe to call multiple times.
 */
export function prepareGhostFlashImages(journeyId: string): Promise<void> {
  if (currentJourneyId !== journeyId) {
    // Different journey (or first call) — reset and regenerate
    currentJourneyId = journeyId;
    for (let i = 0; i < flashUrls.length; i++) flashUrls[i] = null;
    preparePromise = null;
  }
  if (preparePromise) return preparePromise;

  preparePromise = (async () => {
    await Promise.all(
      FLASH_PROMPTS.map(async (prompt, idx) => {
        try {
          const res = await fetch("/api/ai-image/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              denoisingStrength: 0.5,
              width: 1024,
              height: 1024,
            }),
          });
          if (!res.ok) return;
          const data = await res.json();
          if (typeof data.image === "string") {
            flashUrls[idx] = data.image;
          }
        } catch {
          // Silent — FlashAngel will fall back to the static PNG
        }
      }),
    );
  })();

  return preparePromise;
}

/** Get the flash image URL for a variant index, or null if not ready. */
export function getGhostFlashUrl(variant: number): string | null {
  const idx = variant % flashUrls.length;
  return flashUrls[idx] ?? null;
}

/** Clear cached flash images — called on journey stop. */
export function clearGhostFlashImages() {
  currentJourneyId = null;
  preparePromise = null;
  for (let i = 0; i < flashUrls.length; i++) flashUrls[i] = null;
}
