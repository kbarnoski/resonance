/**
 * Ghost journey character references.
 *
 * On journey start we pre-generate TWO canonical portraits of the Ghost
 * angel — one WHITE variant, one BLACK (possessed) variant — and chain
 * them so they share the same face. Every subsequent journey gen uses
 * whichever reference matches the current flash-count theme, so PuLID
 * gets a reference that already matches the target wardrobe instead of
 * fighting it.
 *
 * Flow at journey start:
 *   1. Generate WHITE reference with plain flux/dev
 *   2. Use that as PuLID face-reference to generate BLACK reference —
 *      same face, black wardrobe
 *   3. Subsequent in-journey gens ask for either URL based on theme
 *
 * Without chained references every in-journey frame was a different
 * woman because flux has no identity memory, AND every black-variant
 * prompt got fought by a white-variant reference.
 */

import { getGhostAngelTheme } from "./ghost-flash-images";

const WHITE_REFERENCE_PROMPT =
  "photorealistic portrait close-up of one ethereal angel woman facing camera directly, " +
  "face fully visible and clearly lit with soft front key light, eyes open calm and serene looking at camera, " +
  "head and shoulders framing, neutral studio background soft grey, " +
  "pale luminous skin, very long snow white hair styled into fibonacci spiral braids pulled behind her shoulders so the face is completely unobstructed, " +
  "wearing a translucent white mist dress at the collarbone, " +
  "crisp clear facial features, sharp focus on the face, sharp eyes, symmetrical features";

const BLACK_REFERENCE_PROMPT =
  "photorealistic portrait close-up of one ethereal angel woman facing camera directly, " +
  "face fully visible and clearly lit with soft front key light, eyes wide open with pure jet black orbs (solid void black eyes, no whites, no pupils), " +
  "head and shoulders framing, neutral studio background soft grey, " +
  "pale luminous skin, very long jet black hair styled into fibonacci spiral braids pulled behind her shoulders so the face is completely unobstructed, " +
  "wearing a translucent jet black shadow-mist dress at the collarbone, " +
  "dark possessed shadowed character, mysterious devil-angel, " +
  "crisp clear facial features, sharp focus on the face, sharp eyes, symmetrical features";

const REFERENCE_NEGATIVE =
  "wings, butterfly wings, bird wings, feathers, " +
  "multiple figures, other people, background figures, " +
  "busy background, complex scene, blurry face, obscured face, hair over face";

let whiteReferenceUrl: string | null = null;
let blackReferenceUrl: string | null = null;
let preparePromise: Promise<void> | null = null;
let currentJourneyId: string | null = null;
let abortController: AbortController | null = null;

/**
 * Pre-generate both canonical Ghost angel portraits. Idempotent per
 * journey — subsequent calls return the existing promise.
 *
 * Step 1: plain flux/dev → white reference
 * Step 2: flux-pulid with white reference → black reference (same face)
 */
export function prepareGhostReference(journeyId: string): Promise<void> {
  if (currentJourneyId !== journeyId) {
    abortController?.abort();
    currentJourneyId = journeyId;
    whiteReferenceUrl = null;
    blackReferenceUrl = null;
    preparePromise = null;
  }
  if (preparePromise) return preparePromise;

  const controller = new AbortController();
  abortController = controller;

  preparePromise = (async () => {
    // Step 1 — white reference (plain flux/dev)
    try {
      const res = await fetch("/api/ai-image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: WHITE_REFERENCE_PROMPT,
          negativePrompt: REFERENCE_NEGATIVE,
          width: 768,
          height: 768,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.image === "string") {
        whiteReferenceUrl = data.image;
      }
    } catch {
      return; // abort or network failure — fall back to no-reference
    }

    if (!whiteReferenceUrl || controller.signal.aborted) return;

    // Step 2 — black reference using white as PuLID face reference.
    // Chained generation so both portraits share the same face.
    try {
      const res = await fetch("/api/ai-image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: BLACK_REFERENCE_PROMPT,
          negativePrompt: REFERENCE_NEGATIVE,
          referenceImageUrl: whiteReferenceUrl,
          width: 768,
          height: 768,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.image === "string") {
        blackReferenceUrl = data.image;
      }
    } catch {
      // Black ref failed — in-journey black frames will still try PuLID
      // against the white reference as a fallback.
    }
  })();

  return preparePromise;
}

/**
 * Get the reference URL that matches the current flash-count theme.
 * Returns null if the appropriate reference hasn't landed yet (caller
 * falls back to plain flux/dev without identity lock for that gen).
 */
export function getGhostReferenceUrl(): string | null {
  const theme = getGhostAngelTheme();
  if (theme === "black") {
    // Prefer the proper black reference; fall back to white if black
    // generation hasn't completed yet (better to get SOME identity
    // lock than none).
    return blackReferenceUrl ?? whiteReferenceUrl;
  }
  return whiteReferenceUrl;
}

/** Get the white reference directly — used to seed the first in-journey
 *  frame while real gens are still landing, avoids the cold-start dead
 *  zone at journey start. */
export function getGhostWhiteReferenceUrl(): string | null {
  return whiteReferenceUrl;
}

/** Clear both refs and abort any in-flight gen — journey stop. */
export function clearGhostReference() {
  abortController?.abort();
  abortController = null;
  currentJourneyId = null;
  preparePromise = null;
  whiteReferenceUrl = null;
  blackReferenceUrl = null;
}
