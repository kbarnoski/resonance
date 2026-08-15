# Blocked shaders

**The source of truth for shader blocklists is code, not this doc.** Edit the lists there; this file is only a pointer plus a point-in-time snapshot.

- `src/lib/journeys/journeys.ts` (~lines 145–188) — `GLOBAL_SHADER_BLOCKLIST`, `LOW_TIER_BLOCKED_SHADERS`, `REALM_SHADER_ALLOW`, `REALM_SHADER_BLOCKLIST`
- `src/lib/audio/device-tier.ts` — device-tier detection (high/medium/low) that drives whether the low-tier blocklist applies

## Snapshot 2026-08-14 — code is canonical

### GLOBAL_SHADER_BLOCKLIST (blocked from all realms unless allowed via REALM_SHADER_ALLOW)

- Realm-restricted: `snow` (winter only), `rain` (ocean/storm only)
- Too subtle over journey imagery: `abyss-light`, `terminus`, `onyx`, `estuary`, `hollow`, `dark-bloom`, `fog`
- Safety net — removed from the codebase entirely, listed to guard against re-addition: `aurora`, `cassini`, `chitin`, `entity`, `ethereal`, `lattice`, `oracle`, `prismatic`, `sacred`, `tesseract`
- Admin-deleted April 2026 — permanently removed from codebase: `waterfall`, `anamnesis`, `nimbus`, `crescent`, `eclipse`, `helios`, `magnetar`, `perihelion`, `wormhole`, `zodiac`, `alveoli`, `dendrite`, `filament`, `mitochondria`, `osmosis`, `photosynthesis`, `phylum`, `protoplasm`, `kaleidoscope`, `klein`, `pendulum`, `abyssal-zone`
- Removed from registry (safety net against stale caches): `nebula`

### LOW_TIER_BLOCKED_SHADERS (excluded on `low` device tier)

`dark-nebula`, `supernova`, `quasar`, `magma`, `inferno`

## Notes

- `depths` was fully removed from the codebase (it was the old journey-picker backdrop) — it needs no blocklist entry.
- `nebula` was removed from the shader registry; the global blocklist entry is a belt-and-suspenders guard.
