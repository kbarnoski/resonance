/**
 * Returns the build identity of the running app.
 *
 * Used by the in-app version footer and by anyone debugging "which build
 * am I actually on?". Pulls values baked at build time via next.config.ts.
 */
export const dynamic = "force-static";

export async function GET() {
  return Response.json({
    commit: process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev",
    builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
    appVersion: "0.1.0",
  });
}
