/**
 * Ghost journey character reference.
 *
 * On journey start we pre-generate ONE canonical portrait of the Ghost
 * angel — a clean front-facing face shot, neutral scene, good lighting.
 * Every subsequent journey image uses this portrait as a PuLID
 * identity reference via `fal-ai/flux-pulid`, which locks the angel's
 * face and body across every scene. Without this, each gen produced
 * a different random woman because flux has no identity memory.
 *
 * The canonical portrait is the WHITE angel variant — PuLID preserves
 * the face, but the scene prompt drives wardrobe (white vs black),
 * pose, and everything else.
 */

const CANONICAL_PORTRAIT_PROMPT =
  "photorealistic portrait of one ethereal angel woman facing camera, soft front lighting, calm neutral studio background, head and shoulders framing, " +
  "pale luminous skin, eyes closed peaceful serene expression, " +
  "very long snow white hair woven into fibonacci spiral braids cascading over her shoulders, " +
  "wearing a translucent white mist dress, " +
  "clean clear facial features visible, focus on the face";

const CANONICAL_NEGATIVE =
  "wings, butterfly wings, bird wings, feathers, " +
  "multiple figures, other people, background figures, " +
  "busy background, complex scene, dramatic lighting, " +
  "blonde hair, yellow hair, gold hair, dark hair, black hair";

let referenceUrl: string | null = null;
let preparePromise: Promise<void> | null = null;
let currentJourneyId: string | null = null;
let abortController: AbortController | null = null;

/**
 * Kick off (or reuse) generation of the canonical Ghost angel portrait.
 * Idempotent per journey — if already generating or populated for this
 * journey id, returns the existing promise. Safe to call multiple times.
 */
export function prepareGhostReference(journeyId: string): Promise<void> {
  if (currentJourneyId !== journeyId) {
    abortController?.abort();
    currentJourneyId = journeyId;
    referenceUrl = null;
    preparePromise = null;
  }
  if (preparePromise) return preparePromise;

  const controller = new AbortController();
  abortController = controller;

  preparePromise = (async () => {
    try {
      const res = await fetch("/api/ai-image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: CANONICAL_PORTRAIT_PROMPT,
          negativePrompt: CANONICAL_NEGATIVE,
          width: 768,
          height: 768,
          // No referenceImageUrl — this call uses plain flux/dev to
          // produce the canonical starting face.
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.image === "string") {
        referenceUrl = data.image;
      }
    } catch {
      // Silent — ai-image-layer will fall back to no-reference flux/dev
      // for subsequent gens if the reference never landed.
    }
  })();

  return preparePromise;
}

/** Get the cached reference portrait URL, or null if not ready yet. */
export function getGhostReferenceUrl(): string | null {
  return referenceUrl;
}

/** Clear the cached reference and abort any in-flight gen — journey stop. */
export function clearGhostReference() {
  abortController?.abort();
  abortController = null;
  currentJourneyId = null;
  preparePromise = null;
  referenceUrl = null;
}
