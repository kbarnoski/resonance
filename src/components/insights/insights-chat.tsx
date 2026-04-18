"use client";

import { useChat } from "ai/react";
import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "@/components/chat/chat-message";
import { Send } from "lucide-react";

interface InsightsChatProps {
  analyses: {
    id: string;
    title: string;
    key_signature: string | null;
    tempo: number | null;
    chords: { chord: string; time: number; duration: number }[];
  }[];
}

const SUGGESTED = [
  "Which recordings should I develop into songs?",
  "What are my most common harmonic tendencies?",
  "Do you see any stylistic patterns across my recordings?",
  "Which recordings would work well combined?",
];

export function InsightsChat({ analyses }: InsightsChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, append } =
    useChat({
      api: "/api/chat/insights",
      body: { analyses },
    });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex h-[350px] flex-col rounded-lg border sm:h-[500px]">
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-muted-foreground">
              Ask about patterns across your {analyses.length} recordings
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  className="text-xs hover:border-primary/30"
                  onClick={() => append({ role: "user", content: prompt })}
                >
                  {prompt}
                </Button>
              ))}
            </div>
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
            id="insights-chat-message"
            name="message"
            autoComplete="off"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about your library patterns..."
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
