/**
 * Proxy endpoint for client-side fal.ai access.
 *
 * The fal SDK sends requests here (via proxyUrl config) with
 * the real fal.ai URL in the `x-fal-target-url` header.
 * We forward them with our API key attached server-side.
 *
 * For GET requests (token fetch), returns the API key directly.
 */

export async function GET() {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "Missing FAL_KEY" }, { status: 501 });
  }
  // Return token for WebSocket auth
  return Response.json({ token: process.env.FAL_KEY });
}

export async function POST(request: Request) {
  if (!process.env.FAL_KEY) {
    return Response.json({ error: "Missing FAL_KEY" }, { status: 501 });
  }

  try {
    // The fal SDK proxy sends the real URL in x-fal-target-url header
    const targetUrl = request.headers.get("x-fal-target-url");

    if (!targetUrl) {
      // No target URL — just return the API key as token
      return Response.json({ token: process.env.FAL_KEY });
    }

    // Read the request body
    const body = await request.text();

    // Forward to fal.ai with our API key
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        Authorization: `Key ${process.env.FAL_KEY}`,
      },
      body,
    });

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await res.json();
      return Response.json(data, { status: res.status });
    }

    // Non-JSON response (e.g., binary data)
    const blob = await res.blob();
    return new Response(blob, {
      status: res.status,
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    console.error("[AI Proxy] Error:", error);
    return Response.json({ error: "Proxy request failed" }, { status: 500 });
  }
}
