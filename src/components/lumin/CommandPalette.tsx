import { useNavigate } from "@tanstack/react-router";
import {
  Brain,
  CalendarDays,
  ClipboardList,
  Compass,
  GraduationCap,
  HelpCircle,
  Layers,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTutorial } from "@/components/lumin/WelcomeTutorial";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { listTasks, type Task } from "@/lib/clearpath";

const PAGES = [
  { to: "/tasks", label: "Tasks", icon: ClipboardList },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/classroom", label: "Classroom", icon: GraduationCap },
  { to: "/grades", label: "Grades", icon: GraduationCap },
  { to: "/knowledge", label: "Knowledge Graph", icon: Compass },
  { to: "/practice", label: "Adaptive practice", icon: Brain },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/chat", label: "Lumin AI", icon: Sparkles },
  { to: "/account", label: "Account settings", icon: Settings },
] as const;

/** Global Cmd/Ctrl+K quick-jump — page navigation plus a fuzzy search over
 * the signed-in user's own tasks. Tasks are fetched lazily on first open
 * and cached for the rest of the session. */
export function CommandPalette() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { open: openTutorial } = useTutorial();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function handleOpenEvent() {
      setOpen(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("clearpath:open-command-palette", handleOpenEvent);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("clearpath:open-command-palette", handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open || !user || tasks !== null) return;
    void listTasks()
      .then(setTasks)
      .catch(() => setTasks([]));
  }, [open, user, tasks]);

  if (!user) return null;

  function go(to: string) {
    setOpen(false);
    void navigate({ to });
  }

  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page, search your tasks…" />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {PAGES.map((page) => (
            <CommandItem key={page.to} value={page.label} onSelect={() => go(page.to)}>
              <page.icon className="h-4 w-4" aria-hidden />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {tasks && tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {tasks.slice(0, 50).map((task) => (
                <CommandItem
                  key={task.id}
                  value={`${task.title} ${task.course ?? ""}`}
                  onSelect={() => go("/tasks")}
                >
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  <span className="truncate">{task.title}</span>
                  {task.course && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {task.course}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="take the tour help"
            onSelect={() => {
              setOpen(false);
              openTutorial();
            }}
          >
            <HelpCircle className="h-4 w-4" aria-hidden />
            Take the tour
          </CommandItem>
          <CommandItem value="sign out" onSelect={() => void handleSignOut()}>
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
