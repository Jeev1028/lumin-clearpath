import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Layers, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  createCard,
  createDeck,
  deleteDeck,
  listDecks,
  type FlashcardDeck,
} from "@/lib/flashcards";
import { undoableDelete } from "@/lib/undoable-delete";

export const Route = createFileRoute("/flashcards/")({
  head: () => ({
    meta: [
      { title: "Flashcards — ClearPath by Lumin AI" },
      {
        name: "description",
        content: "Build flashcard decks and study them with spaced repetition or a matching game.",
      },
    ],
  }),
  component: FlashcardsPage,
});

function FlashcardsPage() {
  const navigate = useNavigate();
  const { session, user, loading, needsMfa } = useAuth();
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (needsMfa) {
      void navigate({ to: "/mfa-challenge" });
      return;
    }
    void reload();
  }, [loading, user, needsMfa, navigate]);

  async function reload() {
    try {
      const [deckData, { data: cardRows }] = await Promise.all([
        listDecks(),
        supabase.from("flashcards").select("deck_id"),
      ]);
      setDecks(deckData);
      const grouped: Record<string, number> = {};
      for (const row of cardRows ?? []) {
        grouped[row.deck_id] = (grouped[row.deck_id] ?? 0) + 1;
      }
      setCounts(grouped);
    } catch {
      toast.error("Could not load your flashcard decks.");
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !title.trim()) return;
    setBusy(true);
    try {
      const deck = await createDeck(user.id, {
        title: title.trim(),
        description: description.trim() || null,
        course: course.trim() || null,
      });
      setDecks((prev) => [deck, ...prev]);
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setCourse("");
      await navigate({ to: "/flashcards/$deckId", params: { deckId: deck.id } });
    } catch {
      toast.error("Could not create that deck.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !session || !genTopic.trim()) return;
    setGenerating(true);
    try {
      const deck = await createDeck(user.id, { title: genTopic.trim() });
      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic: genTopic.trim() }),
      });
      if (!res.ok) throw new Error("Could not generate flashcards right now.");
      const { cards } = (await res.json()) as { cards: { front: string; back: string }[] };
      for (const card of cards) {
        await createCard(user.id, { deck_id: deck.id, front: card.front, back: card.back });
      }
      setGenerateOpen(false);
      setGenTopic("");
      toast.success(`Generated ${cards.length} flashcards.`);
      await navigate({ to: "/flashcards/$deckId", params: { deckId: deck.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate flashcards right now.");
    } finally {
      setGenerating(false);
    }
  }

  function handleDeleteDeck(id: string) {
    const deck = decks.find((d) => d.id === id);
    if (!deck) return;
    setDecks((prev) => prev.filter((d) => d.id !== id));
    undoableDelete({
      label: `Deleted "${deck.title}"`,
      onCommit: async () => {
        try {
          await deleteDeck(id);
        } catch {
          toast.error("Could not delete that deck.");
        }
      },
      onUndo: () => setDecks((prev) => [deck, ...prev]),
    });
  }

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-4xl px-6 pb-24">
        <h1 className="text-3xl font-bold">Flashcards</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Build your own decks, or have Lumin generate a starter set — then study with spaced
          repetition or a quick matching game.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 bg-gradient-lumin text-primary-foreground shadow-glow"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New deck
          </Button>
          <Button
            variant="outline"
            onClick={() => setGenerateOpen(true)}
            className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Generate with Lumin
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="group relative rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel transition-colors hover:border-accent/40"
            >
              <Link to="/flashcards/$deckId" params={{ deckId: deck.id }} className="block">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-accent" aria-hidden />
                  <h2 className="font-semibold">{deck.title}</h2>
                </div>
                {deck.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{deck.description}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {counts[deck.id] ?? 0} card{(counts[deck.id] ?? 0) === 1 ? "" : "s"}
                  {deck.course ? ` · ${deck.course}` : ""}
                </p>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${deck.title}`}
                onClick={() => handleDeleteDeck(deck.id)}
                className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {decks.length === 0 && (
            <p className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground sm:col-span-2">
              No decks yet — create one or generate a starter set with Lumin.
            </p>
          )}
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-border/70 bg-card/95 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>New deck</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deck-title">Title</Label>
              <Input
                id="deck-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Unit 3 vocabulary"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deck-course">Course (optional)</Label>
              <Input
                id="deck-course"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="SBI3U"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deck-description">Description (optional)</Label>
              <Textarea
                id="deck-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-16"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={busy || !title.trim()}
                className="bg-gradient-lumin text-primary-foreground shadow-glow"
              >
                {busy ? "Creating…" : "Create deck"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="border-border/70 bg-card/95 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Generate a deck with Lumin</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gen-topic">Topic</Label>
              <Input
                id="gen-topic"
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder="Cell organelles, French irregular verbs, WWI causes…"
                required
              />
              <p className="text-xs text-muted-foreground">
                Creates a new 10-card deck you can edit afterward.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={generating || !genTopic.trim()}
                className="gap-1.5 bg-gradient-lumin text-primary-foreground shadow-glow"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {generating ? "Generating…" : "Generate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
