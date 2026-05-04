import { streamText } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { buildRecordingSystemPrompt } from "@/lib/ai/build-system-prompt";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages, recordingId, analysis } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    if (recordingId) {
      const { data: rec } = await supabase
        .from("recordings")
        .select("id")
        .eq("id", recordingId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!rec) {
        return Response.json({ error: "Recording not found" }, { status: 404 });
      }
    }

    const systemPrompt = buildRecordingSystemPrompt(analysis);

    const result = streamText({
      model: defaultModel,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage?.role === "user" && recordingId) {
      supabase
        .from("chat_messages")
        .insert({
          recording_id: recordingId,
          user_id: user.id,
          role: "user",
          content: lastUserMessage.content,
        })
        .then(({ error }) => {
          if (error) logger.error("chat", "message save failed:", error.message);
        });
    }

    return result.toDataStreamResponse();
  } catch (error) {
    logger.error("chat", "API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
