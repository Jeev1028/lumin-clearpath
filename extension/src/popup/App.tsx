import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { supabase } from "../lib/supabase";
import { getOrCreateThreadId, loadThreadMessages } from "../lib/threads";
import { signInWithGoogle } from "../lib/google-auth";
import { ACCEPTED_ATTACHMENT_TYPES, filesToAttachmentParts } from "../lib/attachments";

const API_ORIGIN = (import.meta.env["VITE_API_ORIGIN"] as string) || "https://luminclearpath.ca";
const ICON_URL = chrome.runtime.getURL("icons/icon-128.png");

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/** Identifies a Google Docs/Slides URL and pulls out its document id.
 * Multi-account browsers add an account-index segment (e.g.
 * /document/u/0/d/ID/edit), so that part is optional. Returns null for
 * anything else, so callers can fall back to normal page handling. */
function googleDocInfo(
  pageUrl: string,
): { kind: "document" | "presentation"; id: string } | null {
  try {
    const url = new URL(pageUrl);
    if (url.hostname !== "docs.google.com") return null;
    const docMatch = /^\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/.exec(url.pathname);
    if (docMatch?.[1]) return { kind: "document", id: docMatch[1] };
    const slideMatch = /^\/presentation\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/.exec(url.pathname);
    if (slideMatch?.[1]) return { kind: "presentation", id: slideMatch[1] };
    return null;
  } catch {
    return null;
  }
}

function googleTextExportUrl(info: { kind: "document" | "presentation"; id: string }): string {
  return info.kind === "document"
    ? `https://docs.google.com/document/d/${info.id}/export?format=txt`
    : `https://docs.google.com/presentation/d/${info.id}/export/txt`;
}

function googlePdfExportUrl(info: { kind: "document" | "presentation"; id: string }): string {
  return info.kind === "document"
    ? `https://docs.google.com/document/d/${info.id}/export?format=pdf`
    : `https://docs.google.com/presentation/d/${info.id}/export/pdf`;
}

/** Fetches a Google export URL directly from the extension's own context
 * (not injected into the tab) -- this matters specifically because export
 * downloads sometimes redirect through a different Google host to stream
 * the file, and a page-context fetch() enforces CORS on that redirect
 * target the same as any other cross-origin sub-request (causing an
 * opaque "Failed to fetch"). Extension pages with docs.google.com in
 * host_permissions are exempt from that -- and still send the student's
 * real session cookies via credentials: "include", since cookies aren't
 * scoped to a particular execution context, just the browser profile. */
async function fetchWithGoogleSession(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      console.warn("[extension] Google export failed: http", res.status, url);
      return null;
    }
    return res;
  } catch (err) {
    console.warn("[extension] Google export failed:", err, url);
    return null;
  }
}

async function fetchGoogleDocText(exportUrl: string): Promise<string | null> {
  const res = await fetchWithGoogleSession(exportUrl);
  if (!res) return null;
  const text = (await res.text()).trim();
  return text || null;
}

async function fetchGoogleDocAsPdfDataUrl(exportUrl: string): Promise<string | null> {
  const res = await fetchWithGoogleSession(exportUrl);
  if (!res) return null;
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the exported file."));
    reader.readAsDataURL(blob);
  });
}

/** Grabs the active tab's best-effort readable text -- run only when the
 * student explicitly taps "Read this page" (never automatically). For
 * Google Docs/Slides, fetches the real document text via Google's export
 * endpoint directly (see fetchWithGoogleSession above for why that's not
 * injected into the tab). Everything else falls back to plain innerText
 * (which does need to run inside the tab, via executeScript), which works
 * fine for normal articles/pages. */
async function readActivePageText(): Promise<{ title: string; url: string; text: string } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;

  const docInfo = googleDocInfo(tab.url ?? "");
  if (docInfo) {
    const exported = await fetchGoogleDocText(googleTextExportUrl(docInfo));
    if (exported) {
      return { title: tab.title ?? "", url: tab.url ?? "", text: exported.slice(0, 6000) };
    }
    // Export failed (e.g. not actually signed in on that tab) -- fall
    // through to the innerText fallback below rather than returning nothing.
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body?.innerText ?? "",
  });

  const text = ((result?.result as string) ?? "").trim().slice(0, 6000);
  return { title: tab.title ?? "", url: tab.url ?? "", text };
}

async function getActiveTabInfo(): Promise<{ title: string; url: string } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  return { title: tab.title ?? "", url: tab.url ?? "" };
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = still loading
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [pageActionBusy, setPageActionBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setThreadId(null);
      setInitialMessages([]);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    (async () => {
      try {
        const id = await getOrCreateThreadId(session.user.id);
        const messages = await loadThreadMessages(id);
        if (cancelled) return;
        setThreadId(id);
        setInitialMessages(messages);
      } catch (err) {
        console.error("[extension] failed to load conversation", err);
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  if (session === undefined) {
    return (
      <div className="app">
        <Header signedIn={false} />
        <div className="center-fill">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app">
        <Header signedIn={false} />
        <SignInView />
      </div>
    );
  }

  if (threadLoading || !threadId) {
    return (
      <div className="app">
        <Header signedIn />
        <div className="center-fill">
          <p>Loading your conversation…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header signedIn />
      <ChatView
        threadId={threadId}
        initialMessages={initialMessages}
        accessToken={session.access_token}
        pageActionBusy={pageActionBusy}
        setPageActionBusy={setPageActionBusy}
      />
    </div>
  );
}

function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="header">
      <img src={ICON_URL} alt="" />
      <div className="header-titles">
        <div className="name">Lumin AI</div>
        <div className="tagline">by ClearPath</div>
      </div>
      {signedIn && (
        <button className="icon-button" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      )}
    </div>
  );
}

function SignInView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setBusy(false);
  }

  async function handleGoogleSignIn() {
    setGoogleBusy(true);
    setError(null);
    try {
      const { idToken, nonce } = await signInWithGoogle();
      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        nonce,
      });
      if (signInError) throw new Error(signInError.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed.";
      if (message !== "cancelled") setError(message);
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="center-fill">
      <img src={ICON_URL} alt="" />
      <h1>Sign in to Lumin AI</h1>
      <p>
        Use your ClearPath account to get guided help right in your browser — on Google Docs,
        Slides, research sources, and more.
      </p>

      <button
        type="button"
        className="primary-button"
        style={{ width: "100%" }}
        onClick={() => void handleGoogleSignIn()}
        disabled={googleBusy || busy}
      >
        {googleBusy ? "Opening Google sign-in…" : "Continue with Google"}
      </button>

      <div className="auth-divider">or</div>

      <form className="auth-form" onSubmit={(e) => void handleSubmit(e)}>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="primary-button" disabled={busy || googleBusy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button
        type="button"
        className="link-button"
        onClick={() => chrome.tabs.create({ url: "https://luminclearpath.ca/auth" })}
      >
        New to ClearPath? Create an account on the website
      </button>
    </div>
  );
}

function ChatView({
  threadId,
  initialMessages,
  accessToken,
  pageActionBusy,
  setPageActionBusy,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  accessToken: string;
  pageActionBusy: boolean;
  setPageActionBusy: (busy: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `${API_ORIGIN}/api/chat`,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { threadId },
    }),
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const { parts, errors } = await filesToAttachmentParts(fileList);
    if (parts.length > 0) setAttachments((prev) => [...prev, ...parts]);
    for (const message of errors) console.warn("[extension]", message);
    if (errors.length > 0) {
      setInput((prev) => `${prev}${prev ? " " : ""}(${errors.join(" ")})`);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function submit(text: string) {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isBusy) return;
    void sendMessage(attachments.length > 0 ? { text: trimmed, files: attachments } : { text: trimmed });
    setInput("");
    setAttachments([]);
  }

  async function handleReadPage() {
    setPageActionBusy(true);
    try {
      const page = await readActivePageText();
      if (!page) return;
      const quoted = page.text
        ? `Here's the text from the page I'm looking at ("${page.title}"):\n\n"""\n${page.text}\n"""\n\n`
        : `I'm looking at "${page.title}" (${page.url}), but couldn't grab readable text from it automatically -- `;
      setInput((prev) => `${quoted}${prev}`);
      textareaRef.current?.focus();
    } catch (err) {
      console.error("[extension] could not read page", err);
    } finally {
      setPageActionBusy(false);
    }
  }

  async function handleCiteSource() {
    setPageActionBusy(true);
    try {
      const tab = await getActiveTabInfo();
      if (!tab) return;
      const prompt = `I want to cite this source in MLA format: "${tab.title}" (${tab.url}). Can you walk me through how to figure out the right MLA citation format for it myself?`;
      submit(prompt);
    } catch (err) {
      console.error("[extension] could not read tab info", err);
    } finally {
      setPageActionBusy(false);
    }
  }

  async function handleAttachDocument() {
    if (isBusy) return;
    setPageActionBusy(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const docInfo = googleDocInfo(tab?.url ?? "");
      if (!tab?.id || !docInfo) {
        setInput(
          (prev) =>
            `${prev}${prev ? " " : ""}(This only works while you have a Google Doc or Slides file open in your active tab.)`,
        );
        return;
      }

      const pdfUrl = googlePdfExportUrl(docInfo);
      const dataUrl = await fetchGoogleDocAsPdfDataUrl(pdfUrl);
      if (!dataUrl) {
        setInput(
          (prev) =>
            `${prev}${prev ? " " : ""}(Couldn't export that ${docInfo.kind === "document" ? "doc" : "deck"} as a PDF -- make sure you're signed in to it, then check the popup's console (right-click the popup > Inspect) for details.)`,
        );
        return;
      }

      const filename = `${(tab.title ?? "document").replace(/\s*-\s*Google (Docs|Slides)\s*$/i, "")}.pdf`;
      const kindLabel = docInfo.kind === "document" ? "Google Doc" : "Slides deck";
      void sendMessage({
        text: `I just shared my ${kindLabel} ("${filename}") as a PDF. Can you help me understand and improve it without doing the work for me?`,
        files: [
          {
            type: "file",
            mediaType: "application/pdf",
            url: dataUrl,
            filename,
          },
        ],
      });
    } catch (err) {
      console.error("[extension] could not attach document", err);
    } finally {
      setPageActionBusy(false);
    }
  }

  return (
    <>
      <div className="quick-actions">
        <button onClick={() => void handleReadPage()} disabled={pageActionBusy}>
          📄 Read this page
        </button>
        <button onClick={() => void handleAttachDocument()} disabled={pageActionBusy || isBusy}>
          📎 Attach as PDF
        </button>
        <button onClick={() => void handleCiteSource()} disabled={pageActionBusy || isBusy}>
          🔖 Cite (MLA)
        </button>
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="empty-state">
            Ask Lumin for help understanding something, finding sources, or figuring out how to
            cite what you're reading — Lumin will guide you, not do it for you.
          </p>
        )}
        {messages.map((m) => {
          const text = textOf(m);
          const files = m.parts.filter((part): part is FileUIPart => part.type === "file");
          return (
            <div key={m.id} className={`message ${m.role}`}>
              {files.length > 0 && (
                <div className="message-files">
                  {files.map((f, i) => (
                    <span key={i} className="file-chip">
                      📎 {f.filename ?? "file"}
                    </span>
                  ))}
                </div>
              )}
              {text || (m.role === "assistant" && isBusy ? "…" : "")}
            </div>
          );
        })}
      </div>

      {attachments.length > 0 && (
        <div className="attachments-preview">
          {attachments.map((f, i) => (
            <span key={i} className="attachment-chip">
              📎 {f.filename ?? "file"}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                aria-label={`Remove ${f.filename ?? "attachment"}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="composer">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_ATTACHMENT_TYPES}
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          aria-label="Attach a file"
          title="Attach a PDF, image, .txt, or .json file"
        >
          📎
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="Ask Lumin anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          disabled={isBusy}
        />
        <button
          onClick={() => submit(input)}
          disabled={isBusy || (!input.trim() && attachments.length === 0)}
          aria-label="Send"
        >
          ↑
        </button>
      </div>
      <p className="footer-note">
        Full history at <a href="https://luminclearpath.ca/chat">luminclearpath.ca</a>
      </p>
    </>
  );
}
