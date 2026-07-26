import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

type Stage = "idle" | "retrieve" | "grade" | "transform" | "generate" | "verify" | "done";

interface QAEntry {
  id: string;
  query: string;
  finalQuery: string;
  answer: string;
  sources: string[];
  stages: Stage[];
}

const STAGE_ORDER: { key: Stage; label: string; note: string }[] = [
  { key: "retrieve", label: "Retrieve", note: "pull top-k documents" },
  { key: "grade", label: "Grade", note: "keep only relevant context" },
  { key: "transform", label: "Rewrite", note: "sharpen the query (if needed)" },
  { key: "generate", label: "Generate", note: "compose grounded answer" },
  { key: "verify", label: "Verify", note: "check for hallucination" },
];

const API_URL_KEY = "rfr:api-url";

function Index() {
  const [apiUrl, setApiUrl] = useState<string>("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeStage, setActiveStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<QAEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(API_URL_KEY) : "";
    if (stored) setApiUrl(stored);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, busy]);

  async function runQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    setError(null);
    const q = query.trim();
    setQuery("");
    setBusy(true);

    // Choreograph stage progression (visual only; the backend runs the real graph)
    const stageTimers: number[] = [];
    const stages: Stage[] = ["retrieve", "grade", "generate", "verify"];
    stages.forEach((s, i) => {
      stageTimers.push(window.setTimeout(() => setActiveStage(s), i * 550));
    });

    try {
      if (!apiUrl.trim()) {
        throw new Error("Set your backend URL (e.g. http://localhost:8000) using the endpoint field above.");
      }
      const endpoint = apiUrl.replace(/\/$/, "") + "/api/chat";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = (await res.json()) as { answer: string; sources: string[]; final_query: string };

      setHistory((h) => [
        ...h,
        {
          id: crypto.randomUUID(),
          query: q,
          finalQuery: data.final_query,
          answer: data.answer,
          sources: data.sources ?? [],
          stages,
        },
      ]);
      setActiveStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setActiveStage("idle");
    } finally {
      stageTimers.forEach((t) => clearTimeout(t));
      setBusy(false);
      setTimeout(() => setActiveStage("idle"), 900);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grain absolute inset-0 pointer-events-none opacity-60" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 md:px-10">
        <Header apiUrl={apiUrl} setApiUrl={(v) => { setApiUrl(v); localStorage.setItem(API_URL_KEY, v); }} />

        <main className="mt-10 grid flex-1 gap-8 lg:grid-cols-[1fr_320px]">
          <section className="flex min-h-0 flex-col">
            <Hero />

            <div
              ref={scrollRef}
              className="mt-8 flex-1 space-y-6 overflow-y-auto pr-2"
              style={{ maxHeight: "calc(100vh - 360px)" }}
            >
              {history.length === 0 && !busy && <EmptyState onPick={setQuery} />}
              {history.map((h) => (
                <QACard key={h.id} entry={h} />
              ))}
              {busy && <ThinkingCard stage={activeStage} />}
              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <form onSubmit={runQuery} className="mt-6">
              <div className="group flex items-end gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg shadow-black/20 focus-within:border-primary/60">
                <span className="ml-2 mb-2 font-serif text-2xl leading-none text-primary">R.</span>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      runQuery(e as unknown as React.FormEvent);
                    }
                  }}
                  rows={1}
                  placeholder="Ask a research question — sources will be verified…"
                  className="min-h-[44px] max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={busy || !query.trim()}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-40 hover:brightness-110"
                >
                  {busy ? "Reasoning…" : "Ask"}
                </button>
              </div>
              <p className="mt-2 px-2 text-xs text-muted-foreground">
                Enter to send · Shift+Enter for newline
              </p>
            </form>
          </section>

          <aside className="flex flex-col gap-6">
            <GraphPanel activeStage={activeStage} />
            <AboutPanel />
          </aside>
        </main>

        <footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          <span className="font-mono">R for Research</span> · Agentic RAG · self-correcting retrieval loop
        </footer>
      </div>
    </div>
  );
}

function Header({ apiUrl, setApiUrl }: { apiUrl: string; setApiUrl: (v: string) => void }) {
  return (
    <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/10">
          <span className="font-serif text-2xl text-primary">R</span>
        </div>
        <div>
          <h1 className="font-serif text-2xl leading-tight">R for Research</h1>
          <p className="text-xs text-muted-foreground">Agentic RAG workspace · self-correcting citations</p>
        </div>
      </div>
      <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs">
        <span className="text-muted-foreground">Backend</span>
        <input
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="http://localhost:8000"
          className="w-56 bg-transparent font-mono text-[12px] outline-none placeholder:text-muted-foreground/70"
        />
      </label>
    </header>
  );
}

function Hero() {
  return (
    <div className="rounded-3xl border border-border bg-gradient-to-br from-card to-secondary/40 p-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">retrieve · grade · rewrite · generate · verify</p>
      <h2 className="mt-3 font-serif text-4xl leading-[1.05] md:text-5xl">
        Ask deeply.<span className="text-primary"> Ground</span> every answer.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
        R runs a LangGraph agentic pipeline against your document store — retrieving, grading, and re-writing until
        every claim is anchored in retrieved context. No confident hallucinations.
      </p>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const samples = [
    "How does Agentic RAG differ from standard RAG?",
    "What is ContextMind designed to solve?",
    "Why do RAG systems produce hallucinations?",
  ];
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6">
      <p className="font-serif text-xl">Start with a question</p>
      <p className="mt-1 text-sm text-muted-foreground">Try one of these — or type your own below.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {samples.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs text-secondary-foreground transition hover:border-primary/50 hover:text-primary"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function QACard({ entry }: { entry: QAEntry }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Q</span>
        <p className="font-serif text-xl leading-snug">{entry.query}</p>
      </div>
      {entry.finalQuery && entry.finalQuery !== entry.query && (
        <p className="mt-2 pl-6 font-mono text-[11px] text-accent">
          ↻ rewritten: {entry.finalQuery}
        </p>
      )}
      <div className="mt-5 flex items-start gap-3 border-t border-border pt-5">
        <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-primary">A</span>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{entry.answer}</p>
      </div>
      {entry.sources.length > 0 && (
        <div className="mt-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Sources · {entry.sources.length}</p>
          <ul className="mt-2 space-y-2">
            {entry.sources.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border-l-2 border-primary/60 bg-secondary/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
              >
                <span className="mr-2 font-mono text-primary">[{i + 1}]</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function ThinkingCard({ stage }: { stage: Stage }) {
  const current = STAGE_ORDER.find((s) => s.key === stage);
  return (
    <div className="rounded-2xl border border-primary/30 bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary">
          {current ? current.label : "Working"}
        </p>
      </div>
      <p className="mt-3 font-serif text-lg text-muted-foreground">
        {current ? current.note : "Coordinating the agentic loop…"}
      </p>
    </div>
  );
}

function GraphPanel({ activeStage }: { activeStage: Stage }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Workflow</p>
      <h3 className="mt-1 font-serif text-xl">The self-correcting loop</h3>
      <ol className="mt-4 space-y-3">
        {STAGE_ORDER.map((s, i) => {
          const active = activeStage === s.key;
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span
                className={
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] transition " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_oklch(0.78_0.14_65/0.2)]"
                    : "border-border bg-secondary text-muted-foreground")
                }
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className={"text-sm " + (active ? "text-foreground" : "text-foreground/80")}>{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.note}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary/50 to-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-accent">About</p>
      <p className="mt-2 font-serif text-lg leading-snug">
        R connects to a LangGraph + FastAPI agent, hitting <span className="font-mono text-[13px] text-primary">POST /api/chat</span>.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Enter your backend URL in the header. Every answer includes the exact retrieved passages the agent grounded on.
      </p>
    </div>
  );
}
