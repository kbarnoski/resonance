import { NextResponse } from "next/server";
import { isOfflinePack, getLocalImagesMap } from "@/lib/offline/pack";

// Offline kiosk only — maps journey ids (built-in ids + DB uuids) to
// pre-harvested pack image URLs. Online this 404s and the AI image
// layer falls through to live fal generation.
export async function GET() {
  if (!isOfflinePack()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(getLocalImagesMap());
}
