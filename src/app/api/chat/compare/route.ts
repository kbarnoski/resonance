import { streamText } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { buildCompareSystemPrompt } from "@/lib/ai/build-system-prompt";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, analysisA, analysisB, titleA, titleB } = await request.json();

  const systemPrompt = buildCompareSystemPrompt(
    titleA,
    analysisA,
    titleB,
    analysisB
  );

  const result = streamText({
    model: defaultModel,
    system: systemPrompt,
    messages,
  });

  return result.toDataStreamResponse();
}
