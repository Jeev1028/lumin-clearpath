import { FileText, Loader2, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { downloadPdfDocument, preloadPdfAssets } from "@/lib/pdf-document";

type Props = { title: string; markdown: string; complete: boolean };

/** A PDF Lumin wrote, shown as a file card with a download button. */
export function PdfDocumentCard({ title, markdown, complete }: Props) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (complete) preloadPdfAssets();
  }, [complete]);

  async function download() {
    setBusy(true);
    try {
      await downloadPdfDocument(title, markdown);
    } catch (error) {
      console.error("[pdf] build failed", error);
      toast.error("Couldn't create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="my-3 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
        <FileText className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{title}.pdf</p>
        <p className="text-xs text-muted-foreground">
          {complete ? "PDF document ready" : "Lumin is writing this document…"}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void download()}
        disabled={!complete || busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
      >
        {busy || !complete ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden />
        )}
        {busy ? "Creating…" : complete ? "Download" : "Writing…"}
      </button>
    </div>
  );
}
