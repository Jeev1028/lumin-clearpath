import {
  BellRing,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Tasks",
    body: "Track tests, assignments, projects and readings in one calm list. Anything imported from Google Classroom is tagged \"via Classroom\" and stays in sync automatically.",
  },
  {
    icon: CalendarDays,
    title: "Schedule",
    body: "Your weekly classes and one-off events, with optional two-way Google Calendar sync and a downloadable .ics export for any other calendar app.",
  },
  {
    icon: GraduationCap,
    title: "Classroom & Grades",
    body: "Connect Google Classroom to pull in courses, coursework, announcements and materials. Grades show on their own page, and you can message a teacher privately right from an assignment.",
  },
  {
    icon: Sparkles,
    title: "Lumin AI & the study planner",
    body: "Lumin explains, researches and quizzes you — it never does the work for you. On Tasks and Schedule, the study planner turns your week into a concrete, research-backed plan.",
  },
  {
    icon: BellRing,
    title: "Stay in the loop",
    body: "The bell in the header shows tasks due soon, and school-wide notices show as a banner (with an optional email). Turn on a daily email digest anytime in Account settings.",
  },
  {
    icon: ShieldCheck,
    title: "Keep your account secure",
    body: "Add two-factor authentication and backup codes in Account settings for extra protection. You can replay this tour anytime from the account menu.",
  },
] as const;

type TutorialContextValue = { open: () => void };
const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used within a TutorialProvider");
  return ctx;
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const autoCheckedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    if (autoCheckedFor.current === user.id) return;
    autoCheckedFor.current = user.id;
    if (meta["onboarding_completed"] !== true) {
      setStep(0);
      setIsOpen(true);
    }
  }, [loading, user]);

  async function markCompleted() {
    try {
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });
    } catch {
      // non-fatal — worst case the tour reappears next sign-in
    }
  }

  function handleOpenChange(next: boolean) {
    setIsOpen(next);
    if (!next) void markCompleted();
  }

  function openManually() {
    setStep(0);
    setIsOpen(true);
  }

  const current = STEPS[step]!;
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <TutorialContext.Provider value={{ open: openManually }}>
      {children}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md border-border/70 bg-card/95 backdrop-blur-sm">
          <DialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <Icon className="h-5 w-5 text-accent" aria-hidden />
            </div>
            <DialogTitle className="mt-2">{current.title}</DialogTitle>
            <DialogDescription>{current.body}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-5 bg-accent" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>

          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              Skip
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                  className="border-border/70 bg-background/40 text-foreground hover:text-foreground"
                >
                  Back
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => (isLast ? handleOpenChange(false) : setStep((s) => s + 1))}
                className="bg-gradient-lumin text-primary-foreground shadow-glow"
              >
                {isLast ? "Done" : "Next"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TutorialContext.Provider>
  );
}
