import { toast } from "sonner";

/** Shows a toast with an "Undo" action, delaying the actual delete for a
 * few seconds so it can be reversed. UI should already be updated
 * optimistically (item removed from view) before calling this — onUndo is
 * responsible for putting it back if the student changes their mind. */
export function undoableDelete(options: {
  label: string;
  onCommit: () => Promise<void>;
  onUndo: () => void;
  delayMs?: number;
}) {
  const { label, onCommit, onUndo, delayMs = 5000 } = options;
  let undone = false;
  const timeoutId = setTimeout(() => {
    if (!undone) void onCommit();
  }, delayMs);

  toast(label, {
    duration: delayMs,
    action: {
      label: "Undo",
      onClick: () => {
        undone = true;
        clearTimeout(timeoutId);
        onUndo();
      },
    },
  });
}
