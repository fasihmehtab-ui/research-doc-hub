import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/chat" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 font-serif text-lg text-primary">R</span>
            <span className="font-serif text-lg">R for Research</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              to="/chat"
              className={`rounded-lg px-3 py-1.5 transition ${path === "/chat" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Chat
            </Link>
            <Link
              to="/documents"
              className={`rounded-lg px-3 py-1.5 transition ${path === "/documents" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Documents
            </Link>
            <span className="mx-2 hidden text-xs text-muted-foreground md:inline">{user.email}</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}