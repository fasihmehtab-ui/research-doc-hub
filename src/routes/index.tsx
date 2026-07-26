import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "R for Research — grounded answers from your own documents" },
      {
        name: "description",
        content:
          "R for Research is an agentic RAG workspace. Upload PDFs and papers, then ask questions grounded in your private library.",
      },
      { property: "og:title", content: "R for Research" },
      { property: "og:description", content: "Agentic RAG over your own research library." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
      else setChecking(false);
    });
  }, [navigate]);

  if (checking) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 font-serif text-xl text-primary">
            R
          </span>
          <span className="font-serif text-lg">R for Research</span>
        </div>
        <Link
          to="/auth"
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary/80">Agentic RAG · Private library</p>
        <h1 className="mt-4 font-serif text-5xl leading-tight md:text-6xl">
          Grounded answers from <em className="text-primary">your</em> documents.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground">
          Upload PDFs, DOCX, and notes. R for Research retrieves, grades, rewrites, and verifies —
          citing only sources from your private library.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:brightness-110"
          >
            Start your library
          </Link>
          <Link
            to="/auth"
            className="rounded-xl border border-border px-5 py-3 text-sm font-medium transition hover:bg-accent"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-24 grid gap-6 text-left md:grid-cols-3">
          {[
            { k: "01", t: "Retrieve", d: "Top-k semantic search over your embedded chunks." },
            { k: "02", t: "Grade & rewrite", d: "Discard irrelevant snippets; rewrite the query when needed." },
            { k: "03", t: "Verify", d: "Reject ungrounded answers before they reach you." },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl border border-border bg-card p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-primary/70">{s.k}</p>
              <p className="mt-2 font-serif text-xl">{s.t}</p>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}