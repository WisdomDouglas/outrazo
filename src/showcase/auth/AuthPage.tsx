import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarDays, Eye, EyeOff, Lock, Mail, MapPin, Music2, Users, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/design-system/components/Button";
import { BrandLogo } from "@/design-system/components/BrandLogo";
import { Input } from "@/design-system/components/Input";
import { supabase } from "@/integrations/supabase/external-client";
import explorer from "@/assets/auth-explorer.png";
import { useAuth } from "./auth-context";

export type AuthMode = "signin" | "signup";

export function AuthPage({ initialMode }: { initialMode: AuthMode }) {
  const navigate = useNavigate();
  const { session, profile, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && session) void navigate({ to: profile?.onboarding_completed ? "/app" : "/onboarding", replace: true });
  }, [authLoading, navigate, profile?.onboarding_completed, session]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (initialMode === "signup") {
      if (!name.trim()) return setError("Enter your name.");
      if (password !== confirmPassword) return setError("Passwords do not match.");
    }
    setBusy(true);
    try {
      if (initialMode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/login`, data: { name: name.trim() } },
        });
        if (signUpError) throw signUpError;
        if (data.session && data.user) {
          const { error: profileError } = await supabase.from("profiles").upsert({ id: data.user.id, name: name.trim(), email: email.trim(), avatar_url: null, onboarding_completed: false });
          if (profileError) throw profileError;
          await navigate({ to: "/onboarding", replace: true });
        } else setNotice("Account created. Check your email to confirm it, then sign in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      }
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || !email.includes("@")) return setError("Enter your email first so we know where to send the reset link.");
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
    setBusy(false);
    if (resetError) setError(authErrorMessage(resetError));
    else setNotice("Check your email for a password reset link.");
  };

  const isSignup = initialMode === "signup";
  return (
    <main className="auth-page bg-canvas text-primary-text">
      <div className="auth-layout mx-auto grid w-full max-w-[1440px] gap-md p-sm sm:p-md lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-lg">
        <section className="auth-scene relative flex min-w-0 flex-col overflow-hidden rounded-lg p-lg sm:p-xl lg:p-2xl">
          <Link to="/" className="focus-ring relative z-20 w-fit rounded-sm" aria-label="Otrazo home"><BrandLogo /></Link>
          <div className="auth-scene__copy relative z-10 mt-lg max-w-[560px] lg:mt-2xl">
            <p className="type-caption font-semibold text-accent">{isSignup ? "MAKE ROOM FOR MORE" : "GOOD TO HAVE YOU BACK"}</p>
            <h1 className="type-h1 mt-sm text-balance">Find your people.<br /><span className="text-accent">Show up for more.</span></h1>
            <p className="type-body-lg mt-md max-w-[440px] text-muted-text">The best moments aren't on your feed. They're happening around you.</p>
          </div>
          <div className="auth-art-stage relative mt-md min-h-0 flex-1" aria-hidden="true">
            <div className="auth-orbit" />
            <div className="auth-float auth-float--music"><Music2 className="size-5 text-accent" /><span>Live music</span></div>
            <div className="auth-float auth-float--place"><MapPin className="size-5 text-accent" /><span>Lagos</span></div>
            <div className="auth-float auth-float--people"><Users className="size-5 text-accent" /><span>Your people</span></div>
            <div className="auth-float auth-float--date"><CalendarDays className="size-5 text-accent" /><span>This weekend</span></div>
            <img src={explorer} alt="" width={1024} height={1024} className="auth-explorer" />
          </div>
          <div className="auth-scene__foot relative z-10 inline-flex w-fit items-center gap-sm rounded-full bg-canvas/70 px-md py-sm type-caption text-primary-text"><span className="size-sm rounded-full bg-accent" />Discover with intention</div>
        </section>

        <section className="auth-form-panel flex min-w-0 flex-col justify-center rounded-lg bg-card px-lg py-xl sm:px-2xl lg:px-3xl">
          <div className="flex items-center justify-between gap-md">
            <Link to="/" className="focus-ring type-caption inline-flex min-h-11 items-center gap-sm rounded-full text-muted-text hover:text-primary-text"><ArrowLeft aria-hidden className="size-4" /> Back to Outrazo</Link>
            <span className="type-caption text-muted-text">{isSignup ? "01 / JOIN" : "01 / RETURN"}</span>
          </div>
          <div className="auth-form-card mx-auto my-auto w-full max-w-[520px] py-lg">
            <p className="type-caption font-semibold text-accent">{isSignup ? "JOIN OUTRAZO" : "SIGN IN TO OUTRAZO"}</p>
            <h2 className="type-h2 mt-sm">{isSignup ? "Create your account" : "Welcome back"}</h2>
            <p className="type-body-lg mt-sm text-muted-text">{isSignup ? "Save events and make discovery feel like yours." : "Your next great moment is waiting."}</p>
            <form onSubmit={submit} className="mt-xl flex flex-col gap-md" noValidate>
              {isSignup ? <Input compact label="Full name" required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" leadingIcon={<UserRound aria-hidden className="size-4" />} placeholder="Your name" /> : null}
              <Input compact label="Email address" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" leadingIcon={<Mail aria-hidden className="size-4" />} placeholder="you@example.com" />
              <Input compact label="Password" type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignup ? "new-password" : "current-password"} leadingIcon={<Lock aria-hidden className="size-4" />} placeholder="At least 6 characters" />
              {isSignup ? <Input compact label="Confirm password" type={showPassword ? "text" : "password"} required minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" leadingIcon={<Lock aria-hidden className="size-4" />} placeholder="Repeat your password" /> : null}
              <Button type="button" variant="ghost" size="sm" className="self-start px-sm" onClick={() => setShowPassword((visible) => !visible)} leadingIcon={showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}>{showPassword ? "Hide password" : "Show password"}</Button>
              {error ? <p role="alert" className="type-caption text-transactional">{error}</p> : null}
              {notice ? <p role="status" className="type-caption text-accent">{notice}</p> : null}
              <Button type="submit" loading={busy} size="lg" className="w-full">{isSignup ? "Create account" : "Log in"}<ArrowRight aria-hidden className="size-4" /></Button>
            </form>
            {!isSignup ? <Button type="button" variant="ghost" size="sm" className="mt-sm px-sm text-accent" onClick={resetPassword} disabled={busy}>Forgot password?</Button> : null}
            <div className="mt-xl border-t border-line pt-lg text-center"><p className="type-body text-muted-text">{isSignup ? "Already have an account?" : "New to Outrazo?"}{" "}<Link className="focus-ring rounded-sm font-semibold text-accent" to={isSignup ? "/login" : "/signup"}>{isSignup ? "Log in" : "Create an account"}</Link></p></div>
          </div>
          <p className="text-center type-caption text-subtle-text">You can browse public events without an account.</p>
        </section>
      </div>
    </main>
  );
}

function authErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("already registered") || message.includes("already exists")) return "An account with this email already exists. Try logging in.";
  if (message.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (message.includes("password") && (message.includes("weak") || message.includes("short"))) return "Choose a stronger password with at least 6 characters.";
  if (message.includes("network") || message.includes("fetch")) return "We could not reach authentication right now. Check your connection and try again.";
  return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
}