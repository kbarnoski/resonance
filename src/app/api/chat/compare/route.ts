import { streamText } from "ai";
import { enforceLlmLimit, readCappedJson } from "@/lib/api/llm-guard";
import { defaultModel } from "@/lib/ai/providers";
import { buildCompareSystemPrompt } from "@/lib/ai/build-system-prompt";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await enforceLlmLimit(request, user.id, "chat-compare");
  if (limited) return limited;
  const body = await readCappedJson(request);
  if (body instanceof Response) return body;
  const { messages, analysisA, analysisB, titleA, titleB } = body;
  if (!Array.isArray(messages)) return Response.json({ error: "messages must be an array" }, { status: 400 });

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
