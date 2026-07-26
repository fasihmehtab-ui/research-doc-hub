import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { queryDocuments } from "@/lib/rag.functions";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat — R for Research" },
      { name: "description", content: "Ask questions grounded in your own uploaded research documents." },
    ],
  }),
  component: ChatPage,
});

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  rewritten?: string;
};

function ChatPage() {
  const ask = useServerFn(queryDocuments);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = (await ask({ data: { query: q } })) as {
        answer: string;
        sources: string[];
        final_query: string;
      };
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.answer,
          sources: res.sources,
          rewritten: res.final_query !== q ? res.final_query : undefined,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "unknown"}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-57px)] max-w-4xl flex-col px-6 py-6">
      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="mt-16 text-center">
            <p className="font-mono text-[11px] uppercase tracking-widest text-primary/80">Agentic RAG</p>
            <h1 className="mt-2 font-serif text-3xl">Ask your library</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Retrieve → grade → rewrite → generate → verify. Answers cite only your uploaded sources.
            </p>
            <p className="mt-6 text-xs text-muted-foreground">
              No documents yet?{" "}
              <Link to="/documents" className="text-primary underline underline-offset-4">
                Upload some
              </Link>
              .
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                  : "max-w-[85%] space-y-3"
              }
            >
              {m.role === "user" ? (
                m.content
              ) : (
                <>
                  {m.rewritten && (
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Rewrote query → {m.rewritten}
                    </p>
                  )}
                  <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm leading-relaxed">
                    {m.content}
                  </div>
                  {m.sources && m.sources.length > 0 && (
                    <details className="rounded-xl border border-border bg-card/60 px-3 py-2 text-xs">
                      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-primary/80">
                        {m.sources.length} source{m.sources.length === 1 ? "" : "s"}
                      </summary>
                      <ol className="mt-2 space-y-2 pl-4">
                        {m.sources.map((s, j) => (
                          <li key={j} className="list-decimal text-muted-foreground">
                            {s}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="font-mono uppercase tracking-widest">Retrieving · grading · generating…</span>
          </div>
        )}
      </div>

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your documents…"
          disabled={busy}
          className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary/60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition disabled:opacity-40 hover:brightness-110"
        >
          Ask
        </button>
      </form>
    </main>
  );
}