import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const suggestions = [
  "What does ClearPath actually do?",
  "How does Lumin AI keep me honest?",
  "Can this replace Google Classroom?",
];

export function SiteChatWidget() {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/site-chat" }),
    onError: () => toast.error("Our site assistant couldn't respond — please try again."),
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function submit(text?: string) {
    const content = (text ?? input).trim();
    if (!content || isBusy) return;
    setInput("");
    void sendMessage({ text: content });
  }

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-border/70 bg-card/70 p-6 shadow-panel backdrop-blur-sm sm:p-8">
      <div className="flex h-80 flex-col gap-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Sparkles className="mb-3 h-6 w-6 text-accent" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Ask anything about what ClearPath offers and how it works.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  message.role === "user"
                    ? "bg-primary/15 text-foreground"
                    : "border border-border/60 bg-background/50",
                )}
              >
                <div className="lumin-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}

        {status === "submitted" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex items-end gap-2 rounded-2xl border border-border/70 bg-background/40 p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about ClearPath…"
          rows={1}
          maxLength={600}
          className="max-h-32 min-h-10 resize-none border-0 bg-transparent focus-visible:ring-0"
        />
        <Button
          size="icon"
          onClick={() => submit()}
          disabled={isBusy || !input.trim()}
          className="bg-gradient-lumin text-primary-foreground"
          aria-label="Send message"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        This is a generative AI assistant for questions about the site — sign in to work with the
        real Lumin AI tutor.
      </p>
    </div>
  );
}
