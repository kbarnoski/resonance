import { NextResponse } from "next/server";
import { loadPrototypes } from "../_scan";

// Static slug manifest, prerendered at build from the shared scan and served
// from the CDN. The dream layout's client-side prev/next nav fetches this on
// prototype pages — proto routes render dynamically in a lambda where the
// source tree (and therefore any fs readdir) is unavailable, so the ordered
// slug list has to arrive as build-time data.
export const dynamic = "force-static";

export async function GET() {
  const prototypes = await loadPrototypes();
  return NextResponse.json({
    slugs: prototypes.map((p) => p.slug),
  });
}
