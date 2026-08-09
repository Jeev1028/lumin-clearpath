import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { LuminMark } from "@/components/lumin/LuminMark";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  threadId: string;
  initialMessages: UIMessage[];
  accessToken: string;
  onActivity: () => void;
};

const suggestions = [
  "Help me understand how photosynthesis works",
  "Find me credible sources on the causes of WWI",
  "Quiz me on my chemistry unit",
];

export function ChatWindow({ threadId, initialMessages, accessToken, onActivity }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { threadId },
    }),
    onError: (error) => toast.error(error.message || "Lumin could not respond right now."),
    onFinish: () => onActivity(),
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    if (!isBusy) textareaRef.current?.focus();
  }, [isBusy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function submit() {
    const text = input.trim();
    if (!text || isBusy) return;
    setInput("");
    void sendMessage({ text });
    onActivity();
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-deep">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
          {messages.length === 0 && (
            <div className="pt-16 text-center">
              <LuminMark className="mx-auto mb-6 h-16 w-16" />
              <h1 className="text-2xl font-semibold">How can I help you learn today?</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                I&apos;ll research, explain and summarize — but the work stays yours.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="rounded-full border border-border/70 bg-card/60 px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => {
            const text = message.parts
              .map((part) => (part.type === "text" ? part.text : ""))
              .join("");
            if (!text) return null;
            return (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed",
                    message.role === "user"
                      ? "bg-primary/15 text-foreground"
                      : "border border-border/60 bg-card/70 shadow-panel",
                  )}
                >
                  <div className="prose prose-sm prose-invert max-w-none prose-a:text-accent">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              Lumin is thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border/60 bg-background/60 p-4">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border/70 bg-card/70 p-2 shadow-panel">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask Lumin about your studies…"
            rows={1}
            className="max-h-40 min-h-11 resize-none border-0 bg-transparent focus-visible:ring-0"
          />
          <Button
            size="icon"
            onClick={submit}
            disabled={isBusy || !input.trim()}
            className="bg-gradient-lumin text-primary-foreground"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
        <p className="mx-auto mt-3 max-w-3xl text-center text-xs text-muted-foreground">
          Lumin guides your learning and never completes assignments for you. Cite every source in
          MLA format.
        </p>
      </div>
    </div>
  );
}