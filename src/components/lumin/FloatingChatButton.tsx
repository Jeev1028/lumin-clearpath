import { MessageCircle } from "lucide-react";

export function FloatingChatButton({ targetId = "site-chat" }: { targetId?: string }) {
  function scrollToChat() {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button
      type="button"
      onClick={scrollToChat}
      aria-label="Ask our chatbot about this site"
      className="fixed right-4 bottom-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-lumin text-primary-foreground shadow-glow transition-transform duration-200 hover:scale-105 sm:right-8 sm:bottom-8 sm:h-auto sm:w-auto sm:gap-2 sm:py-3 sm:pr-4 sm:pl-3"
    >
      <span aria-hidden className="glow-orb animate-glow-pulse absolute inset-0 -z-10 rounded-full opacity-70" />
      <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
      <span className="hidden text-sm font-medium whitespace-nowrap sm:inline">
        Ask our chatbot about this site
      </span>
    </button>
  );
}
