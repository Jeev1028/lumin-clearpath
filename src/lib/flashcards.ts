import { supabase } from "@/integrations/supabase/client";

export type FlashcardDeck = {
  id: string;
  title: string;
  description: string | null;
  course: string | null;
  created_at: string;
  updated_at: string;
};

export type Flashcard = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  box: number;
  due_at: string;
  created_at: string;
};

const DECK_FIELDS = "id, title, description, course, created_at, updated_at";
const CARD_FIELDS = "id, deck_id, front, back, box, due_at, created_at";

export async function listDecks(): Promise<FlashcardDeck[]> {
  const { data, error } = await supabase
    .from("flashcard_decks")
    .select(DECK_FIELDS)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getDeck(id: string): Promise<FlashcardDeck | null> {
  const { data, error } = await supabase
    .from("flashcard_decks")
    .select(DECK_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createDeck(
  userId: string,
  input: { title: string; description?: string | null; course?: string | null },
): Promise<FlashcardDeck> {
  const { data, error } = await supabase
    .from("flashcard_decks")
    .insert({ ...input, user_id: userId })
    .select(DECK_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDeck(id: string): Promise<void> {
  const { error } = await supabase.from("flashcard_decks").delete().eq("id", id);
  if (error) throw error;
}

export async function listCards(deckId: string): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from("flashcards")
    .select(CARD_FIELDS)
    .eq("deck_id", deckId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCard(
  userId: string,
  input: { deck_id: string; front: string; back: string },
): Promise<Flashcard> {
  const { data, error } = await supabase
    .from("flashcards")
    .insert({ ...input, user_id: userId })
    .select(CARD_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateCard(
  id: string,
  input: { front: string; back: string },
): Promise<void> {
  const { error } = await supabase
    .from("flashcards")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from("flashcards").delete().eq("id", id);
  if (error) throw error;
}

// Leitner-system interval per box (days until next review). Box 1 stays
// due immediately (review again the same session); higher boxes get
// reviewed less often as the student demonstrates they know a card.
const BOX_INTERVAL_DAYS = [0, 0, 1, 3, 7, 14];

/** Records a Study-mode review: "knew it" advances the card to the next
 * box (reviewed less often), "didn't know" resets it to box 1 (reviewed
 * again soon). */
export async function recordReview(card: Flashcard, knew: boolean): Promise<void> {
  const nextBox = knew ? Math.min(card.box + 1, 5) : 1;
  const days = BOX_INTERVAL_DAYS[nextBox] ?? 0;
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + days);
  const { error } = await supabase
    .from("flashcards")
    .update({ box: nextBox, due_at: dueAt.toISOString(), updated_at: new Date().toISOString() })
    .eq("id", card.id);
  if (error) throw error;
}
