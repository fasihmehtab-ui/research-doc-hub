import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { deleteDocument, ingestDocument, listDocuments } from "@/lib/rag.functions";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — R for Research" },
      { name: "description", content: "Upload PDFs, DOCX, TXT, or Markdown to build your private research library." },
    ],
  }),
  component: DocumentsPage,
});

type Doc = {
  id: string;
  filename: string;
  mime_type: string;
  char_count: number;
  created_at: string;
};

function DocumentsPage() {
  const router = useRouter();
  const list = useServerFn(listDocuments);
  const ingest = useServerFn(ingestDocument);
  const del = useServerFn(deleteDocument);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const rows = (await list()) as Doc[];
      setDocs(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const { extractText } = await import("@/lib/extract-text.client");
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const text = await extractText(file);
        if (!text.trim()) throw new Error("No extractable text (scanned PDF?)");
        await ingest({
          data: {
            filename: file.name,
            mime_type: file.type || "application/octet-stream",
            text,
          },
        });
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
    await refresh();
    router.invalidate();
  }

  async function remove(id: string) {
    await del({ data: { id } });
    setDocs((d) => d.filter((x) => x.id !== id));
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary/80">Library</p>
        <h1 className="mt-1 font-serif text-3xl">Your documents</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload PDFs, DOCX, TXT, or Markdown. Text is extracted, chunked, and indexed for retrieval.
        </p>
      </div>

      <label
        htmlFor="upload"
        className="mt-8 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/40 p-10 text-center transition hover:border-primary/60"
      >
        <span className="font-serif text-xl">Drop files or click to upload</span>
        <span className="text-xs text-muted-foreground">PDF · DOCX · TXT · MD</span>
        <input
          id="upload"
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        {uploading && (
          <span className="mt-2 font-mono text-xs text-primary">Indexing {uploading}…</span>
        )}
      </label>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-8">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {loading ? "Loading…" : `${docs.length} document${docs.length === 1 ? "" : "s"}`}
        </p>
        <ul className="mt-3 space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{d.filename}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {(d.char_count / 1000).toFixed(1)}k chars · {new Date(d.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => remove(d.id)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"
              >
                Delete
              </button>
            </li>
          ))}
          {!loading && docs.length === 0 && (
            <li className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No documents yet. Upload something to get started.
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}