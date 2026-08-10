import { MessageCircle } from "lucide-react";

export function FloatingChatButton({ targetId = "site-chat" }: { targetId?: string }) {
  function scrollToChat() {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button
      type="button"
      onClick={scrollToChat}
      aria-label="Ask our chatbot"
      className="group fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full bg-gradient-lumin py-3 pr-4 pl-3 text-primary-foreground shadow-glow transition-transform duration-200 hover:scale-105 sm:right-8 sm:bottom-8"
    >
      <span aria-hidden className="glow-orb animate-glow-pulse absolute inset-0 -z-10 rounded-full opacity-70" />
      <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
      <span className="max-w-0 overflow-hidden text-sm font-medium whitespace-nowrap opacity-0 transition-all duration-300 group-hover:max-w-[10rem] group-hover:opacity-100">
        Ask our chatbot
      </span>
    </button>
  );
}
