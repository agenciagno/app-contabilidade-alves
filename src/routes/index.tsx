import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — Build something people love" },
      {
        name: "description",
        content:
          "Lumen is a minimal starting point for your next idea. Fast, focused, and built to grow with you.",
      },
      { property: "og:title", content: "Lumen — Build something people love" },
      {
        property: "og:description",
        content:
          "A minimal starting point for your next idea. Fast, focused, and built to grow with you.",
      },
    ],
  }),
  component: Index,
});

type Status = { state: "checking" | "ok" | "error"; message: string };

function Index() {
  const [status, setStatus] = useState<Status>({
    state: "checking",
    message: "Checking Supabase connection…",
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) {
          setStatus({ state: "error", message: `Supabase error: ${error.message}` });
        } else {
          setStatus({
            state: "ok",
            message: `Connected to ${import.meta.env.VITE_SUPABASE_URL}`,
          });
        }
      } catch (e) {
        if (!active) return;
        setStatus({
          state: "error",
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const dotClass =
    status.state === "ok"
      ? "bg-green-500"
      : status.state === "error"
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary" />
          <span className="text-lg font-semibold tracking-tight">Lumen</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          <a href="#about" className="hover:text-foreground transition-colors">About</a>
        </nav>
        <Button size="sm">Get started</Button>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-28 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            New — now in public beta
          </div>
          <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight md:text-6xl">
            Build something people actually love.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            A clean, focused starting point for your next idea. Ship faster, iterate sooner, and keep your codebase tidy along the way.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button size="lg">Start building</Button>
            <Button size="lg" variant="outline">View demo</Button>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 pb-28">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { title: "Fast by default", body: "Sensible defaults so you can focus on what matters." },
              { title: "Composable", body: "Small primitives that fit together cleanly." },
              { title: "Ready to ship", body: "Production-ready foundations from day one." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 h-9 w-9 rounded-md bg-secondary" />
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Lumen</span>
          <span>Made with care</span>
        </div>
      </footer>
    </div>
  );
}
