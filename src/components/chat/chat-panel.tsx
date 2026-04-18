"use client";

import { useChat } from "ai/react";
import { useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { SuggestedPrompts } from "./suggested-prompts";
import { Send } from "lucide-react";
import { toast } from "sonner";

interface ChatPanelProps {
  recordingId: string;
  analysis: {
    key_signature: string | null;
    tempo: number | null;
    time_signature: string | null;
    chords: { chord: string; time: number; duration: number }[];
    notes: { midi: number; time: number; duration: number; velocity: number }[];
  };
  initialMessages?: {
    id: string;
    role: string;
    content: string;
    created_at: string;
  }[];
}

export function ChatPanel({ recordingId, analysis, initialMessages = [] }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, append } =
    useChat({
      api: "/api/chat",
      body: { recordingId, analysis },
      initialMessages: initialMessages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      onError: (error) => {
        toast.error(error.message || "Failed to get response. Please try again.");
      },
      onFinish: async (message) => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("chat_messages").insert({
            recording_id: recordingId,
            user_id: user.id,
            role: "assistant",
            content: message.content,
          });
        }
      },
    });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSuggestedPrompt(prompt: string) {
    append({ role: "user", content: prompt });
  }

  return (
    <div className="flex h-[350px] flex-col rounded-lg border sm:h-[500px]">
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <SuggestedPrompts onSelect={handleSuggestedPrompt} />
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role as "user" | "assistant"}
                content={message.content}
              />
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-end gap-0.5 h-4">
                  <div className="w-1 bg-primary rounded-full" style={{ animation: "waveform-bar 0.8s ease-in-out infinite", height: "100%" }} />
                  <div className="w-1 bg-primary rounded-full" style={{ animation: "waveform-bar 0.8s ease-in-out 0.2s infinite", height: "100%" }} />
                  <div className="w-1 bg-primary rounded-full" style={{ animation: "waveform-bar 0.8s ease-in-out 0.4s infinite", height: "100%" }} />
                </div>
                Thinking...
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            id="chat-message"
            name="message"
            autoComplete="off"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about your recording..."
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
