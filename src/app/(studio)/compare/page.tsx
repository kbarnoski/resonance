"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { AnalysisDisplay } from "@/components/analysis/analysis-display";
import { ChatMessage } from "@/components/chat/chat-message";
import { useChat } from "ai/react";
import { Send } from "lucide-react";

type FullAnalysis = {
  key_signature: string | null;
  tempo: number | null;
  time_signature: string | null;
  chords: { chord: string; time: number; duration: number }[] | null;
  notes: { midi: number; time: number; duration: number; velocity: number }[] | null;
  summary: unknown | null;
  status: string | null;
};

type Recording = {
  id: string;
  title: string;
  duration: number | null;
  analyses: FullAnalysis | null;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function noteRange(notes: { midi: number }[] | null): string {
  if (!notes || notes.length === 0) return "--";
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const sorted = [...notes].sort((a, b) => a.midi - b.midi);
  const lo = sorted[0].midi;
  const hi = sorted[sorted.length - 1].midi;
  const loName = `${NOTE_NAMES[lo % 12]}${Math.floor(lo / 12) - 1}`;
  const hiName = `${NOTE_NAMES[hi % 12]}${Math.floor(hi / 12) - 1}`;
  return `${loName} -- ${hiName}`;
}

function ComparisonRow({
  label,
  valueA,
  valueB,
}: {
  label: string;
  valueA: string;
  valueB: string;
}) {
  const match = valueA === valueB && valueA !== "--";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border py-3 last:border-0">
      <span className="text-right font-mono text-sm">{valueA}</span>
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {valueA !== "--" && valueB !== "--" && (
          <Badge
            variant={match ? "default" : "outline"}
            className={
              match
                ? "bg-neutral-800 text-neutral-100 dark:bg-neutral-200 dark:text-neutral-900"
                : ""
            }
          >
            {match ? "Match" : "Differs"}
          </Badge>
        )}
      </div>
      <span className="font-mono text-sm">{valueB}</span>
    </div>
  );
}

const COMPARE_SUGGESTIONS = [
  "What do these have in common?",
  "Could these be sections of the same song?",
  "How do their harmonic languages differ?",
];

function CompareChat({
  titleA,
  titleB,
  analysisA,
  analysisB,
}: {
  titleA: string;
  titleB: string;
  analysisA: FullAnalysis;
  analysisB: FullAnalysis;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatKey = `${titleA}-${titleB}`;

  const { messages, input, handleInputChange, handleSubmit, isLoading, append } =
    useChat({
      api: "/api/chat/compare",
      body: { analysisA, analysisB, titleA, titleB },
      id: chatKey,
    });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex h-[400px] flex-col rounded-lg border sm:h-[500px]">
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-muted-foreground">
              Compare &ldquo;{titleA}&rdquo; and &ldquo;{titleB}&rdquo;
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {COMPARE_SUGGESTIONS.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  className="text-xs"
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
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Thinking...
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            id="compare-chat-message"
            name="message"
            autoComplete="off"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about these recordings..."
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

type AnalysisDisplaySummary = {
  overview: string;
  key_center: string;
  sections: { label: string; description: string }[];
  chord_vocabulary: string[];
  harmonic_highlights: string;
  rhythm_and_feel: string;
  relearning_tips: string;
};

export default function ComparePage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [idA, setIdA] = useState<string>("");
  const [idB, setIdB] = useState<string>("");

  useEffect(() => {
    async function fetchRecordings() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("recordings")
        .select(
          "id, title, duration, analyses(key_signature, tempo, time_signature, chords, notes, summary, status)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (data) {
        const mapped: Recording[] = data.map((r) => ({
          id: r.id,
          title: r.title,
          duration: r.duration,
          analyses: Array.isArray(r.analyses)
            ? r.analyses[0] ?? null
            : r.analyses,
        }));
        setRecordings(mapped);
      }
      setLoading(false);
    }
    fetchRecordings();
  }, []);

  const recA = recordings.find((r) => r.id === idA) ?? null;
  const recB = recordings.find((r) => r.id === idB) ?? null;

  const analysisA = recA?.analyses ?? null;
  const analysisB = recB?.analyses ?? null;

  const bothAnalyzed =
    analysisA?.status === "completed" && analysisB?.status === "completed";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extralight tracking-tight">Compare</h1>
        <p className="text-sm text-muted-foreground">
          Select two recordings to view their analyses side by side.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading recordings...</p>
      ) : recordings.length < 2 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              You need at least two recordings to compare.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Recording A
              </label>
              <select
                value={idA}
                onChange={(e) => setIdA(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select recording</option>
                {recordings.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.id === idB}>
                    {r.title}
                    {r.duration ? ` (${formatDuration(r.duration)})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Recording B
              </label>
              <select
                value={idB}
                onChange={(e) => setIdB(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select recording</option>
                {recordings.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.id === idA}>
                    {r.title}
                    {r.duration ? ` (${formatDuration(r.duration)})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {recA && recB && (
            <>
              {/* Metrics comparison */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium tracking-tight">
                    Analysis Comparison
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {recA.title} vs. {recB.title}
                  </p>
                </CardHeader>
                <CardContent>
                  {!analysisA && !analysisB ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Neither recording has been analyzed yet.
                    </p>
                  ) : (
                    <div className="divide-y-0">
                      <ComparisonRow
                        label="Key"
                        valueA={analysisA?.key_signature ?? "--"}
                        valueB={analysisB?.key_signature ?? "--"}
                      />
                      <ComparisonRow
                        label="Tempo"
                        valueA={
                          analysisA?.tempo != null
                            ? `${Math.round(analysisA.tempo)} BPM`
                            : "--"
                        }
                        valueB={
                          analysisB?.tempo != null
                            ? `${Math.round(analysisB.tempo)} BPM`
                            : "--"
                        }
                      />
                      <ComparisonRow
                        label="Time Sig."
                        valueA={analysisA?.time_signature ?? "--"}
                        valueB={analysisB?.time_signature ?? "--"}
                      />
                      <ComparisonRow
                        label="Note Range"
                        valueA={noteRange(analysisA?.notes ?? null)}
                        valueB={noteRange(analysisB?.notes ?? null)}
                      />
                      <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 sm:gap-6">
                        <div>
                          <p className="mb-2 text-center text-xs uppercase tracking-widest text-muted-foreground">
                            {recA.title} — Chords
                          </p>
                          <div className="flex flex-wrap justify-center gap-1">
                            {analysisA?.chords && analysisA.chords.length > 0 ? (
                              [...new Set(analysisA.chords.map((c) => c.chord))].map((chord, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="font-mono text-xs"
                                >
                                  {chord}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                --
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-center text-xs uppercase tracking-widest text-muted-foreground">
                            {recB.title} — Chords
                          </p>
                          <div className="flex flex-wrap justify-center gap-1">
                            {analysisB?.chords && analysisB.chords.length > 0 ? (
                              [...new Set(analysisB.chords.map((c) => c.chord))].map((chord, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="font-mono text-xs"
                                >
                                  {chord}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                --
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tabs: Analysis | Chat */}
              {bothAnalyzed && analysisA && analysisB && (
                <Tabs defaultValue="analysis">
                  <TabsList>
                    <TabsTrigger value="analysis">Analysis</TabsTrigger>
                    <TabsTrigger value="chat">Chat</TabsTrigger>
                  </TabsList>

                  <TabsContent value="analysis">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
                      <div className="min-w-0">
                        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
                          {recA.title}
                        </p>
                        <AnalysisDisplay
                          analysis={{
                            key_signature: analysisA.key_signature,
                            tempo: analysisA.tempo,
                            time_signature: analysisA.time_signature,
                            chords: analysisA.chords ?? [],
                            notes: analysisA.notes ?? [],
                            summary: analysisA.summary as AnalysisDisplaySummary | null,
                          }}
                          compact
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
                          {recB.title}
                        </p>
                        <AnalysisDisplay
                          analysis={{
                            key_signature: analysisB.key_signature,
                            tempo: analysisB.tempo,
                            time_signature: analysisB.time_signature,
                            chords: analysisB.chords ?? [],
                            notes: analysisB.notes ?? [],
                            summary: analysisB.summary as AnalysisDisplaySummary | null,
                          }}
                          compact
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="chat">
                    <CompareChat
                      titleA={recA.title}
                      titleB={recB.title}
                      analysisA={analysisA}
                      analysisB={analysisB}
                    />
                  </TabsContent>
                </Tabs>
              )}
            </>
          )}

          {(!recA || !recB) && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Pick two recordings above to begin comparison.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
