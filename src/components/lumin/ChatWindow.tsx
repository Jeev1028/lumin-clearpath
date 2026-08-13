import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { ArrowUp, Mic, Paperclip, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { LuminMark } from "@/components/lumin/LuminMark";
import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isSpeechToTextSupported, useSpeechToText } from "@/hooks/useSpeechToText";
import { ACCEPTED_ATTACHMENT_TYPES, filesToAttachmentParts } from "@/lib/file-attachments";
import { cn } from "@/lib/utils";

type Props = {
  threadId: string;
  initialMessages: UIMessage[];
  accessToken: string;
  onActivity: () => void;
  initialInput?: string | undefined;
};

const suggestions = [
  "Help me understand how photosynthesis works",
  "Find me credible sources on the causes of WWI",
  "Quiz me on my chemistry unit",
];

export function ChatWindow({
  threadId,
  initialMessages,
  accessToken,
  onActivity,
  initialInput,
}: Props) {
  const [input, setInput] = useState(initialInput ?? "");
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastAutoSpokenIdRef = useRef<string | null>(null);
  const { speak, stopSpeaking } = useSoundSettings();

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

  // Voice-to-text: dictate into the composer instead of typing. Only
  // rendered/enabled where the browser actually supports it (see
  // isSpeechToTextSupported) -- Chrome/Edge everywhere, Safari 14.5+
  // (including iOS/iPadOS).
  const { listening, toggle: toggleListening } = useSpeechToText({
    onFinalResult: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setInput((prev) => (prev && !/\s$/.test(prev) ? `${prev} ${trimmed}` : prev + trimmed));
    },
    onInterimResult: setInterimTranscript,
    onError: (message) => toast.error(message),
  });

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    if (!isBusy) textareaRef.current?.focus();
  }, [isBusy]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // Auto-read: when "Read Lumin's messages aloud" is on (see Sound
  // settings), speak each new assistant reply once it finishes streaming.
  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (lastAutoSpokenIdRef.current === last.id) return;
    const text = last.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
    if (!text) return;
    lastAutoSpokenIdRef.current = last.id;
    speak(text, {
      auto: true,
      onStart: () => setSpeakingId(last.id),
      onEnd: () => setSpeakingId((current) => (current === last.id ? null : current)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status]);

  useEffect(() => {
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleReadAloud(id: string, text: string) {
    if (speakingId === id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    speak(text, {
      onStart: () => setSpeakingId(id),
      onEnd: () => setSpeakingId((current) => (current === id ? null : current)),
    });
  }

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const { parts, errors } = await filesToAttachmentParts(fileList);
    if (parts.length > 0) setAttachments((prev) => [...prev, ...parts]);
    for (const message of errors) toast.error(message);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isBusy) return;
    if (listening) toggleListening();
    setInput("");
    setAttachments([]);
    void sendMessage(attachments.length > 0 ? { text, files: attachments } : { text });
    onActivity();
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-deep">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
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
            const files = message.parts.filter(
              (part): part is FileUIPart => part.type === "file",
            );
            if (!text && files.length === 0) return null;
            return (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div className={cn("max-w-[85%]", message.role === "user" ? "" : "w-full")}>
                  {message.role === "assistant" && (
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="animate-badge-glow inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-amber-300 uppercase">
                        <Sparkles className="h-3 w-3" aria-hidden />
                        Generative AI · Verify before relying on this
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReadAloud(message.id, text)}
                        aria-label={speakingId === message.id ? "Stop reading aloud" : "Read this message aloud"}
                        title={speakingId === message.id ? "Stop reading aloud" : "Read aloud"}
                        className={cn(
                          "shrink-0 rounded-full border p-1.5 transition-colors",
                          speakingId === message.id
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {speakingId === message.id ? (
                          <VolumeX className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-5 py-3 text-sm leading-relaxed",
                      message.role === "user"
                        ? "bg-primary/15 text-foreground"
                        : "border border-border/60 bg-card/70 shadow-panel",
                    )}
                  >
                    {files.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {files.map((file, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground"
                          >
                            <Paperclip className="h-3 w-3" aria-hidden />
                            {file.filename ?? "Attached file"}
                          </span>
                        ))}
                      </div>
                    )}
                    {text && (
                      <div className="lumin-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                      </div>
                    )}
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
        </div>
      </div>

      <div className="safe-bottom border-t border-border/60 bg-background/60 p-4">
        <div className="mx-auto w-full max-w-3xl">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((file, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 py-1 pr-1.5 pl-2.5 text-[11px] text-muted-foreground"
                >
                  <Paperclip className="h-3 w-3" aria-hidden />
                  {file.filename ?? "Attached file"}
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    aria-label={`Remove ${file.filename ?? "attachment"}`}
                    className="rounded-full p-0.5 hover:bg-background/60 hover:text-foreground"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
          {listening && (
            <div className="mb-2 flex items-center gap-2 rounded-full border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-xs text-red-300">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-400" />
              <span className="truncate">{interimTranscript || "Listening…"}</span>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-border/70 bg-card/70 p-2 shadow-panel">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_ATTACHMENT_TYPES}
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Attach a file"
              title="Attach a PDF, image, .txt, or .json file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            {isSpeechToTextSupported && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={toggleListening}
                disabled={isBusy}
                className={
                  listening
                    ? "shrink-0 text-red-400 hover:text-red-300"
                    : "shrink-0 text-muted-foreground hover:text-foreground"
                }
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                title={listening ? "Stop voice input" : "Speak instead of typing"}
              >
                {listening ? (
                  <Square className="h-4 w-4 fill-current" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            )}
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
              disabled={isBusy || (!input.trim() && attachments.length === 0)}
              className="bg-gradient-lumin text-primary-foreground"
              aria-label="Send message"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mx-auto mt-3 max-w-3xl text-center text-xs text-muted-foreground">
          Lumin guides your learning and never completes assignments for you. Cite every source in
          MLA format.
        </p>
      </div>
    </div>
  );
}
