/**
 * Client-side probe for the Tramokyo offline pack.
 *
 * /api/pack/local-images 404s unless the server runs with OFFLINE_PACK=1,
 * so one fetch tells the client both (a) whether it's on the offline kiosk
 * and (b) the harvested journey-image map. Shared by the AI image layer
 * (imagery source) and device-tier (installation profile forcing) so the
 * probe happens at most once per session.
 */

let packLocalImagesPromise: Promise<Record<string, string[]> | null> | null =
  null;
let packActive = false;

export function fetchPackLocalImages(): Promise<Record<
  string,
  string[]
> | null> {
  if (!packLocalImagesPromise) {
    packLocalImagesPromise = fetch("/api/pack/local-images")
      .then((res) => (res.ok ? res.json() : null))
      .then((map: Record<string, string[]> | null) => {
        if (map) packActive = true;
        return map;
      })
      .catch(() => null);
  }
  return packLocalImagesPromise;
}

/** True once the probe has confirmed the offline pack is being served.
 *  Synchronous — false until the fetch resolves. */
export function isPackActive(): boolean {
  return packActive;
}

/** Kick off the probe without awaiting it. Safe to call from sync code. */
export function probePack(): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  void fetchPackLocalImages();
}
