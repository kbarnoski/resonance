import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalRedirect } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` comes from a query param, so it's attacker-controlled.
  // Without sanitization, `?next=//evil.com` becomes
  // `https://getresonance.vercel.app//evil.com` which the redirect
  // handler resolves to `https://evil.com` — open redirect.
  const next = safeInternalRedirect(searchParams.get("next"), "/room");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If code exchange fails, redirect to login with error
  return NextResponse.redirect(`${origin}/login`);
}
