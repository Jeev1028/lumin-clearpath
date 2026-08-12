import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Gamepad2, ListChecks, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  createCard,
  deleteCard,
  getDeck,
  listCards,
  recordReview,
  updateCard,
  type Flashcard,
  type FlashcardDeck,
} from "@/lib/flashcards";
import { undoableDelete } from "@/lib/undoable-delete";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/flashcards/$deckId")({
  head: () => ({
    meta: [{ title: "Deck — ClearPath by Lumin AI" }],
  }),
  component: DeckPage,
});

type Mode = "manage" | "study" | "match";

function DeckPage() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading, needsMfa } = useAuth();
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [mode, setMode] = useState<Mode>("manage");

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
    Promise.all([getDeck(deckId), listCards(deckId)])
      .then(([deckData, cardData]) => {
        if (!deckData) {
          toast.error("That deck couldn't be found.");
          void navigate({ to: "/flashcards" });
          return;
        }
        setDeck(deckData);
        setCards(cardData);
      })
      .catch(() => toast.error("Could not load that deck."));
  }, [loading, user, needsMfa, navigate, deckId]);

  if (!deck) {
    return (
      <div className="min-h-screen bg-deep">
        <SiteHeader />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-6 pb-24">
        <Link
          to="/flashcards"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All decks
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{deck.title}</h1>
        {deck.description && <p className="mt-1 text-sm text-muted-foreground">{deck.description}</p>}

        <div className="mt-4 flex flex-wrap gap-1 rounded-full border border-border/60 bg-card/40 p-1">
          {(
            [
              { key: "manage", label: "Cards", icon: ListChecks },
              { key: "study", label: "Study", icon: Sparkles },
              { key: "match", label: "Match game", icon: Gamepad2 },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                mode === tab.key
                  ? "bg-secondary/70 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="h-3.5 w-3.5" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {mode === "manage" && (
            <ManageCards deckId={deckId} cards={cards} setCards={setCards} />
          )}
          {mode === "study" && <StudyMode cards={cards} setCards={setCards} />}
          {mode === "match" && <MatchGame cards={cards} />}
        </div>
      </main>
    </div>
  );
}

function ManageCards({
  deckId,
  cards,
  setCards,
}: {
  deckId: string;
  cards: Flashcard[];
  setCards: React.Dispatch<React.SetStateAction<Flashcard[]>>;
}) {
  const { user } = useAuth();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !front.trim() || !back.trim()) return;
    setBusy(true);
    try {
      const card = await createCard(user.id, { deck_id: deckId, front: front.trim(), back: back.trim() });
      setCards((prev) => [...prev, card]);
      setFront("");
      setBack("");
    } catch {
      toast.error("Could not add that card.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(card: Flashcard) {
    setEditingId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
  }

  async function saveEdit(id: string) {
    if (!editFront.trim() || !editBack.trim()) return;
    try {
      await updateCard(id, { front: editFront.trim(), back: editBack.trim() });
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, front: editFront.trim(), back: editBack.trim() } : c)),
      );
      setEditingId(null);
    } catch {
      toast.error("Could not save that card.");
    }
  }

  function handleDeleteCard(id: string) {
    const item = cards.find((c) => c.id === id);
    if (!item) return;
    setCards((prev) => prev.filter((c) => c.id !== id));
    undoableDelete({
      label: "Card deleted",
      onCommit: async () => {
        try {
          await deleteCard(id);
        } catch {
          toast.error("Could not remove that card.");
        }
      },
      onUndo: () => setCards((prev) => [...prev, item]),
    });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleAdd}
        className="grid gap-3 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel sm:grid-cols-2"
      >
        <div>
          <Label htmlFor="card-front">Front</Label>
          <Textarea
            id="card-front"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="Term or question"
            className="mt-1 min-h-16"
          />
        </div>
        <div>
          <Label htmlFor="card-back">Back</Label>
          <Textarea
            id="card-back"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="Definition or answer"
            className="mt-1 min-h-16"
          />
        </div>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            disabled={busy || !front.trim() || !back.trim()}
            className="gap-1.5 bg-gradient-lumin text-primary-foreground shadow-glow"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add card
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        {cards.map((card) => (
          <div key={card.id} className="rounded-xl border border-border/60 bg-card/60 p-4">
            {editingId === card.id ? (
              <div className="space-y-2">
                <Textarea value={editFront} onChange={(e) => setEditFront(e.target.value)} className="min-h-14" />
                <Textarea value={editBack} onChange={(e) => setEditBack(e.target.value)} className="min-h-14" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void saveEdit(card.id)} className="bg-gradient-lumin text-primary-foreground">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => startEdit(card)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium">{card.front}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.back}</p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete card"
                  onClick={() => handleDeleteCard(card.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
        {cards.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            No cards yet — add one above.
          </p>
        )}
      </div>
    </div>
  );
}

function StudyMode({
  cards,
  setCards,
}: {
  cards: Flashcard[];
  setCards: React.Dispatch<React.SetStateAction<Flashcard[]>>;
}) {
  const queue = useMemo(() => {
    const now = Date.now();
    return [...cards]
      .filter((c) => new Date(c.due_at).getTime() <= now)
      .sort((a, b) => a.box - b.box || a.due_at.localeCompare(b.due_at));
  }, [cards]);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const { playTone } = useSoundSettings();

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
    setReviewedCount(0);
  }, [cards.length]);

  const current = queue[index];

  async function handleAnswer(knew: boolean) {
    if (!current) return;
    if (knew) playTone("success");
    try {
      await recordReview(current, knew);
      setCards((prev) =>
        prev.map((c) =>
          c.id === current.id
            ? { ...c, box: knew ? Math.min(c.box + 1, 5) : 1, due_at: new Date().toISOString() }
            : c,
        ),
      );
    } catch {
      toast.error("Could not save that review.");
    }
    setReviewedCount((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  if (cards.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
        Add some cards first.
      </p>
    );
  }

  if (!current) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/70 p-8 text-center shadow-panel">
        <p className="text-lg font-semibold">
          {reviewedCount > 0 ? "All caught up! 🎉" : "Nothing due for review right now."}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {reviewedCount > 0
            ? `Reviewed ${reviewedCount} card${reviewedCount === 1 ? "" : "s"} this session.`
            : "Cards you've marked \"knew it\" come back later — check back soon, or add more cards."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {index + 1} of {queue.length} due
      </p>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="mt-3 flex min-h-48 w-full items-center justify-center rounded-2xl border border-border/70 bg-card/70 p-8 text-center shadow-panel transition-colors hover:border-accent/40"
      >
        <p className="text-lg font-medium">{flipped ? current.back : current.front}</p>
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {flipped ? "Showing the back — tap to flip" : "Tap the card to reveal the answer"}
      </p>

      {flipped && (
        <div className="mt-4 flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => void handleAnswer(false)}
            className="border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
          >
            Didn't know it
          </Button>
          <Button
            onClick={() => void handleAnswer(true)}
            className="bg-gradient-lumin text-primary-foreground shadow-glow"
          >
            Knew it
          </Button>
        </div>
      )}
    </div>
  );
}

type Tile = { key: string; cardId: string; text: string; side: "front" | "back" };

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const MATCH_ROUND_SIZE = 6;

function MatchGame({ cards }: { cards: Flashcard[] }) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedMs, setFinishedMs] = useState<number | null>(null);
  const { playTone } = useSoundSettings();

  function startRound() {
    const round = shuffle(cards).slice(0, MATCH_ROUND_SIZE);
    const nextTiles = shuffle(
      round.flatMap((c) => [
        { key: `${c.id}-front`, cardId: c.id, text: c.front, side: "front" as const },
        { key: `${c.id}-back`, cardId: c.id, text: c.back, side: "back" as const },
      ]),
    );
    setTiles(nextTiles);
    setSelected([]);
    setMatched(new Set());
    setMistakes(0);
    setStartedAt(Date.now());
    setFinishedMs(null);
  }

  useEffect(() => {
    if (cards.length >= 2) startRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length]);

  function handleTileClick(tile: Tile) {
    if (matched.has(tile.cardId) || selected.includes(tile.key) || selected.length === 2) return;
    const next = [...selected, tile.key];
    setSelected(next);
    if (next.length === 2) {
      const [firstKey, secondKey] = next;
      const first = tiles.find((t) => t.key === firstKey)!;
      const second = tiles.find((t) => t.key === secondKey)!;
      if (first.cardId === second.cardId) {
        playTone("success");
        const nextMatched = new Set(matched).add(first.cardId);
        setTimeout(() => {
          setMatched(nextMatched);
          setSelected([]);
          if (nextMatched.size === MATCH_ROUND_SIZE || nextMatched.size === new Set(tiles.map((t) => t.cardId)).size) {
            setFinishedMs(startedAt ? Date.now() - startedAt : 0);
          }
        }, 400);
      } else {
        playTone("error");
        setMistakes((m) => m + 1);
        setTimeout(() => setSelected([]), 700);
      }
    }
  }

  if (cards.length < 2) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
        Add at least 2 cards to play the matching game.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Mistakes: {mistakes}</span>
        <Button variant="ghost" size="sm" onClick={startRound}>
          New round
        </Button>
      </div>

      {finishedMs !== null && (
        <div className="mt-3 rounded-xl border border-accent/40 bg-accent/5 p-4 text-center">
          <p className="text-sm font-semibold text-accent">
            Matched in {(finishedMs / 1000).toFixed(1)}s with {mistakes} mistake{mistakes === 1 ? "" : "s"}!
          </p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => {
          const isMatched = matched.has(tile.cardId);
          const isSelected = selected.includes(tile.key);
          return (
            <button
              key={tile.key}
              type="button"
              disabled={isMatched}
              onClick={() => handleTileClick(tile)}
              className={cn(
                "flex min-h-20 items-center justify-center rounded-xl border p-2 text-center text-xs font-medium transition-colors",
                isMatched
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400 opacity-60"
                  : isSelected
                    ? "border-accent bg-accent/10"
                    : "border-border/60 bg-card/60 hover:border-accent/40",
              )}
            >
              {tile.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
