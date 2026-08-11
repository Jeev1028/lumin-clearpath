import { useNavigate } from "@tanstack/react-router";
import {
  Brain,
  CalendarDays,
  ClipboardList,
  Compass,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
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
import {
  listClassroomCourses,
  listClassroomCoursework,
  listClassroomMaterials,
  listTasks,
  type ClassroomCoursework,
  type ClassroomMaterial,
  type Task,
} from "@/lib/clearpath";
import { listDecks, type FlashcardDeck } from "@/lib/flashcards";

const PAGES = [
  { to: "/home", label: "Today", icon: Home },
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

type SearchData = {
  tasks: Task[];
  decks: FlashcardDeck[];
  coursework: ClassroomCoursework[];
  materials: ClassroomMaterial[];
  courseNames: Record<string, string>;
};

const EMPTY_DATA: SearchData = {
  tasks: [],
  decks: [],
  coursework: [],
  materials: [],
  courseNames: {},
};

/** Global Cmd/Ctrl+K quick-jump — page navigation plus a fuzzy search over
 * the signed-in user's own tasks, flashcard decks, grades and Classroom
 * materials. Everything is fetched lazily on first open and cached for
 * the rest of the session. */
export function CommandPalette() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { open: openTutorial } = useTutorial();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SearchData | null>(null);

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
    if (!open || !user || data !== null) return;
    Promise.all([
      listTasks(),
      listDecks(),
      listClassroomCoursework(),
      listClassroomMaterials(),
      listClassroomCourses(),
    ])
      .then(([tasks, decks, coursework, materials, courses]) => {
        const courseNames = Object.fromEntries(courses.map((c) => [c.id, c.name]));
        setData({ tasks, decks, coursework, materials, courseNames });
      })
      .catch(() => setData(EMPTY_DATA));
  }, [open, user, data]);

  if (!user) return null;

  const { tasks, decks, coursework, materials, courseNames } = data ?? EMPTY_DATA;
  const gradedWork = coursework.filter(
    (cw) => typeof cw.assigned_grade === "number" && typeof cw.max_points === "number",
  );

  function go(to: string) {
    setOpen(false);
    void navigate({ to });
  }

  function goDeck(deckId: string) {
    setOpen(false);
    void navigate({ to: "/flashcards/$deckId", params: { deckId } });
  }

  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page, search tasks, grades, decks, materials…" />
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

        {tasks.length > 0 && (
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

        {decks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Flashcard decks">
              {decks.slice(0, 30).map((deck) => (
                <CommandItem
                  key={deck.id}
                  value={`${deck.title} ${deck.course ?? ""} flashcards`}
                  onSelect={() => goDeck(deck.id)}
                >
                  <Layers className="h-4 w-4" aria-hidden />
                  <span className="truncate">{deck.title}</span>
                  {deck.course && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {deck.course}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {gradedWork.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Grades">
              {gradedWork.slice(0, 30).map((cw) => (
                <CommandItem
                  key={cw.id}
                  value={`${cw.title} ${courseNames[cw.course_id] ?? ""} grade`}
                  onSelect={() => go("/grades")}
                >
                  <GraduationCap className="h-4 w-4" aria-hidden />
                  <span className="truncate">{cw.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {cw.assigned_grade}/{cw.max_points}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {materials.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Classroom materials">
              {materials.slice(0, 30).map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.title} ${courseNames[m.course_id] ?? ""} material`}
                  onSelect={() => go("/classroom")}
                >
                  <FileText className="h-4 w-4" aria-hidden />
                  <span className="truncate">{m.title}</span>
                  {courseNames[m.course_id] && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {courseNames[m.course_id]}
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
