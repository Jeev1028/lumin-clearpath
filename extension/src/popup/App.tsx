import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { supabase } from "../lib/supabase";
import { getOrCreateThreadId, loadThreadMessages } from "../lib/threads";
import { signInWithGoogle } from "../lib/google-auth";

const API_ORIGIN = (import.meta.env["VITE_API_ORIGIN"] as string) || "https://luminclearpath.ca";
const ICON_URL = chrome.runtime.getURL("icons/icon-128.png");

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/** Google Docs/Slides render the actual document through canvas, not
 * accessible DOM text, so plain innerText only ever grabs toolbar/menu
 * chrome there -- never the document itself. Google's own text-export
 * endpoint gives the real content instead. Returns null for anything that
 * isn't a Docs/Slides URL, so the caller can fall back to innerText. */
function googleExportUrl(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    if (url.hostname !== "docs.google.com") return null;
    const docMatch = /^\/document\/d\/([a-zA-Z0-9_-]+)/.exec(url.pathname);
    if (docMatch) return `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
    const slideMatch = /^\/presentation\/d\/([a-zA-Z0-9_-]+)/.exec(url.pathname);
    if (slideMatch) return `https://docs.google.com/presentation/d/${slideMatch[1]}/export/txt`;
    return null;
  } catch {
    return null;
  }
}

/** Grabs the active tab's best-effort readable text -- run only when the
 * student explicitly taps "Read this page" (never automatically). For
 * Google Docs/Slides, fetches the real document text via Google's export
 * endpoint (run *inside* the Docs/Slides tab itself via executeScript, so
 * the fetch is same-origin and rides along on the student's own logged-in
 * session -- no extra permissions or credentials needed beyond the
 * activeTab access already granted by opening the popup). Everything else
 * falls back to plain innerText, which works fine for normal articles/
 * pages. */
async function readActivePageText(): Promise<{ title: string; url: string; text: string } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;

  const exportUrl = googleExportUrl(tab.url ?? "");
  if (exportUrl) {
    const [exportResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (url: string) => {
        try {
          const res = await fetch(url, { credentials: "include" });
          return res.ok ? await res.text() : null;
        } catch {
          return null;
        }
      },
      args: [exportUrl],
    });
    const exported = ((exportResult?.result as string | null) ?? "").trim();
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    void sendMessage({ text: trimmed });
    setInput("");
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

  return (
    <>
      <div className="quick-actions">
        <button onClick={() => void handleReadPage()} disabled={pageActionBusy}>
          📄 Read this page
        </button>
        <button onClick={() => void handleCiteSource()} disabled={pageActionBusy || isBusy}>
          🔖 Cite this source (MLA)
        </button>
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="empty-state">
            Ask Lumin for help understanding something, finding sources, or figuring out how to
            cite what you're reading — Lumin will guide you, not do it for you.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            {textOf(m) || (m.role === "assistant" && isBusy ? "…" : "")}
          </div>
        ))}
      </div>

      <div className="composer">
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
        <button onClick={() => submit(input)} disabled={isBusy || !input.trim()} aria-label="Send">
          ↑
        </button>
      </div>
      <p className="footer-note">
        Full history at <a href="https://luminclearpath.ca/chat">luminclearpath.ca</a>
      </p>
    </>
  );
}
