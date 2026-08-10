import { Megaphone, X } from "lucide-react";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type Notice = { id: string; message: string };

const DISMISSED_KEY = "clearpath:dismissed-notices";

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore (private browsing, storage full, etc.)
  }
}

export function NoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(readDismissed());
    void (async () => {
      const { data, error } = await supabase
        .from("notices")
        .select("id, message")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (!error && data) setNotices(data);
    })();
  }, []);

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    persistDismissed(next);
  }

  const visible = notices.filter((n) => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  return (
    <div className="relative z-[60] space-y-px">
      {visible.map((notice) => (
        <div
          key={notice.id}
          className="flex items-center justify-center gap-3 bg-gradient-lumin px-4 py-2 text-center text-sm font-medium text-primary-foreground"
        >
          <Megaphone className="h-4 w-4 shrink-0" aria-hidden />
          <span className="max-w-3xl">{notice.message}</span>
          <button
            type="button"
            onClick={() => dismiss(notice.id)}
            aria-label="Dismiss notice"
            className="shrink-0 rounded-full p-1 opacity-80 transition-opacity hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
