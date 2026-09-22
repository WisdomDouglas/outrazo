import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, Mail, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/design-system/components/Button";
import { Input } from "@/design-system/components/Input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/showcase/auth/auth-context";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Outrazo" },
      { name: "description", content: "Sign in or create your Outrazo account to save events and get tickets." },
      { property: "og:title", content: "Sign in — Outrazo" },
      { property: "og:description", content: "Sign in or create your Outrazo account to save events and get tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) void navigate({ to: "/app", replace: true });
  }, [session, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/app`, data: { name } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const googleSignIn = async () => {
    setError(null);
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      setError("Unable to continue with Google right now.");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    setBusy(false);
  };

  return (
    <main className="min-h-dvh bg-canvas px-md py-xl text-primary-text">
      <div className="mx-auto w-full max-w-[440px]">
        <Link to="/" className="focus-ring type-caption inline-flex min-h-11 items-center gap-xs rounded-full text-muted-text">
          <ArrowLeft aria-hidden className="size-4" /> Back to Outrazo
        </Link>

        <div className="mt-lg rounded-lg border border-line bg-card p-lg">
          <h1 className="type-h2">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="type-body mt-xs text-muted-text">
            {mode === "signin"
              ? "Sign in to save events, RSVP, and keep your tickets."
              : "Join Outrazo to discover events, people, and communities."}
          </p>

          <form onSubmit={submit} className="mt-lg flex flex-col gap-md">
            {mode === "signup" ? (
              <Input
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                leadingIcon={<UserRound aria-hidden className="size-4" />}
                placeholder="Your name"
              />
            ) : null}
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              leadingIcon={<Mail aria-hidden className="size-4" />}
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              leadingIcon={<Lock aria-hidden className="size-4" />}
              placeholder="••••••••"
            />

            {error ? <p role="alert" className="type-caption text-transactional">{error}</p> : null}
            {notice ? <p role="status" className="type-caption text-accent">{notice}</p> : null}

            <Button type="submit" loading={busy} className="w-full">
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-lg flex items-center gap-sm">
            <span className="h-px flex-1 bg-line" />
            <span className="type-caption text-muted-text">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={googleSignIn} disabled={busy}>
            Continue with Google
          </Button>

          <p className="type-caption mt-lg text-center text-muted-text">
            {mode === "signin" ? "New to Outrazo?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="focus-ring rounded-sm font-semibold text-accent"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="type-caption mt-md text-center text-muted-text">
          You can keep browsing Outrazo without an account — the app runs in demo mode until you sign in.
        </p>
      </div>
    </main>
  );
}
