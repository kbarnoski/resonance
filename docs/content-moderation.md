# Content moderation — design + open decisions

## What this is

Resonance accepts user-uploaded audio recordings. Today there is **no
moderation pipeline**: a recording is uploaded → analyzed → playable
immediately. For the creator's personal use this is correct
(zero-friction workflow). The moment recordings are shared (via the
`/share/` token flow or the public installation kiosk), three risks
appear:

1. **Copyrighted material.** Someone uploads a commercial track and
   shares it publicly via Resonance.
2. **Disturbing/illegal content.** Audio with violent, sexual, or
   hate speech that the listener wasn't expecting.
3. **CSAM.** US/EU operators have legal mandatory-reporting
   obligations for child sexual abuse material.

## Current state

| Feature | Moderation |
|---|---|
| Personal library (auth-only) | None — by design |
| `/share/{token}` (private link) | None |
| `/path/{token}` (public path) | None |
| `/journey/{token}` (public journey) | None |
| `/room/installation` (public kiosk) | None |
| AI image generation prompts | Built-in negative-prompt list (limited) |
| AI image OUTPUT | `enable_safety_checker: true` (P2 fix — fal's safety filter on by default for normal users) |

## Recommended pipeline

Two layers, with progressive depth:

### Layer 1 — Sharing gate (synchronous, fast)
Before a recording becomes accessible via a share token:
1. Check audio length against a cap (e.g. 30 min) — basic sanity.
2. Run a fast metadata/fingerprint check against AcoustID + the
   PRO copyright APIs (e.g. Pex, Audible Magic). Block matches.
3. If clean, mint the share token.

This is the "is this likely OK to share" gate. Cheap per call, runs
once at share time, blocks the obvious violations.

### Layer 2 — Asynchronous deep moderation
After share-mint, queue a background job that:
1. Transcribes the audio (Whisper / AssemblyAI — already a dep we
   could lean on).
2. Runs the transcript through a content classifier
   (OpenAI moderation API, or Anthropic's classifier).
3. If flagged, revokes the share token automatically and notifies
   the creator + (above a threshold) the operator.

Async because deep transcription is slow and we don't want to make
the share button hang.

### Layer 3 (legal-grade) — CSAM / illegal content
If Resonance ever reaches scale where general public uploads are
allowed, integration with NCMEC's PhotoDNA-equivalent for audio
(Google's AudioMatch, Microsoft's PhotoDNA Cloud) becomes mandatory.
Until then, the share-time gate + async transcript flag is the
correct posture.

## Stub interface

A first-pass interface that anyone implementing this can target:

```ts
// src/lib/moderation/types.ts (not shipped — sketch)
export interface ModerationVerdict {
  decision: "allow" | "block" | "review";
  reasons: string[];
  scores?: Record<string, number>;
}

export interface AudioModerator {
  /** Synchronous gate at share-mint time. Returns within a few seconds. */
  preMint(audioUrl: string, recordingId: string): Promise<ModerationVerdict>;

  /** Deep async pipeline. Fires-and-forgets a job that updates the
   *  recording row with the eventual verdict. */
  enqueueDeepReview(audioUrl: string, recordingId: string): Promise<void>;
}
```

## Open decisions (need product input)

1. **Vendor:** AcoustID + Pex? AssemblyAI's content-safety endpoint
   bundles transcribe + classify in one call — operationally simpler.
2. **Block-vs-warn:** Should a flagged recording be hard-blocked
   from sharing, or shown with a content warning?
3. **Appeal flow:** False positives need a review path. Manual
   admin review queue? Email creator + offer 24h auto-clear?
4. **Cost:** AssemblyAI content-safety is ~$0.001/sec. A 5-min
   recording is $0.30. At what user volume does this become a
   meaningful line item?

These are product decisions, not security decisions. **None of this
ships in this audit.** The doc exists so the next engagement on
moderation has a starting point.

## What ships now (this branch)

Nothing in the moderation pipeline itself ships. What ships:

- This document (`docs/content-moderation.md`).
- The fal.ai `enable_safety_checker` default flipped from OFF to ON
  for non-admin users (separate commit in this branch). That's the
  closest thing to "moderation" we ship today — it's an output-side
  filter for AI-generated imagery, not user-uploaded audio.
