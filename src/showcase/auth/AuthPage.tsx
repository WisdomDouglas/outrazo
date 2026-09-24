import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/design-system/components/Button";
import { BrandLogo } from "@/design-system/components/BrandLogo";
import { Input } from "@/design-system/components/Input";
import { supabase } from "@/integrations/supabase/external-client";
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
  const [focusField, setFocusField] = useState<"email" | "password" | "visible" | "idle">("idle");

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

  const continueWithGoogle = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (googleError) {
      setError(authErrorMessage(googleError));
      setBusy(false);
    }
  };

  const isSignup = initialMode === "signup";
  const characterState = [
    focusField === "email" ? "is-email" : "",
    focusField === "password" ? "is-password" : "",
    focusField === "visible" ? "is-visible" : "",
    busy ? "is-loading" : "",
  ].filter(Boolean).join(" ");
  return (
    <main className="auth-page bg-canvas p-3 text-primary-text sm:p-4 lg:p-6">
      <div className="mx-auto grid h-full w-full max-w-[1280px] gap-3 sm:gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(400px,1.08fr)] lg:gap-6">
        <section className="auth-scene relative flex min-h-0 flex-col justify-between overflow-hidden rounded-[20px] border border-line p-4 sm:p-5 lg:p-8">
          <div className="auth-mobile-brand absolute left-4 top-1/2 z-20 -translate-y-1/2">
            <BrandLogo compact />
          </div>
          <div className="auth-scene__copy relative z-10 max-w-[560px]">
            <p className="type-caption text-accent">{isSignup ? "MAKE ROOM FOR MORE" : "WELCOME BACK"}</p>
            <h1 className="type-h1 mt-2 max-w-[540px] text-balance">Find the people, places and moments worth showing up for.</h1>
            <p className="type-body-lg mt-3 max-w-[440px] text-muted-text">Your city is full of stories. Start with the ones that feel like yours.</p>
          </div>
          <CharacterScene state={characterState} />
          <div className="auth-scene__copy relative z-10 hidden items-center gap-sm text-muted-text lg:flex">
            <span className="size-2 rounded-full bg-accent" /> <span className="type-caption">Discover with intention</span>
          </div>
        </section>

        <section className="flex min-h-0 flex-col justify-center overflow-hidden rounded-[20px] border border-line bg-card px-4 py-3 sm:px-8 sm:py-5 lg:px-12 lg:py-8">
          <div className="flex items-center justify-between gap-md">
            <Link to="/" className="focus-ring type-caption inline-flex min-h-9 items-center gap-xs rounded-full text-muted-text"><ArrowLeft aria-hidden className="size-4" /> Back</Link>
            <span className="type-caption text-muted-text">{isSignup ? "01 / JOIN" : "01 / RETURN"}</span>
          </div>
          <div className="auth-form-card mt-3 sm:mt-5">
            <p className="type-caption text-accent">{isSignup ? "JOIN OUTRAZO" : "SIGN IN TO OUTRAZO"}</p>
            <h2 className="type-h2 mt-1">{isSignup ? "Create your account" : "Welcome back"}</h2>
            <p className="type-body mt-1 text-muted-text">{isSignup ? "Save events and make discovery feel like yours." : "Pick up where you left off."}</p>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:mt-5 sm:gap-3" noValidate>
              {isSignup ? <Input compact label="Full name" required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" leadingIcon={<UserRound aria-hidden className="size-4" />} placeholder="Your name" /> : null}
              <Input compact label="Email address" type="email" required value={email} onFocus={() => setFocusField("email")} onChange={(event) => setEmail(event.target.value)} autoComplete="email" leadingIcon={<Mail aria-hidden className="size-4" />} placeholder="you@example.com" />
              <Input compact label="Password" type={showPassword ? "text" : "password"} required minLength={6} value={password} onFocus={() => setFocusField(showPassword ? "visible" : "password")} onChange={(event) => { setPassword(event.target.value); setFocusField(showPassword ? "visible" : "password"); }} autoComplete={isSignup ? "new-password" : "current-password"} leadingIcon={<Lock aria-hidden className="size-4" />} placeholder="At least 6 characters" />
              {isSignup ? <Input compact label="Confirm password" type={showPassword ? "text" : "password"} required minLength={6} value={confirmPassword} onFocus={() => setFocusField(showPassword ? "visible" : "password")} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" leadingIcon={<Lock aria-hidden className="size-4" />} placeholder="Repeat your password" /> : null}
              <button type="button" className="focus-ring inline-flex min-h-8 items-center gap-xs self-start rounded-sm type-caption text-muted-text hover:text-primary-text" onClick={() => { setShowPassword((visible) => !visible); setFocusField(showPassword ? "password" : "visible"); }}><span className="grid size-4 place-items-center rounded-[4px] border border-line-strong">{showPassword ? <EyeOff aria-hidden className="size-3" /> : <Eye aria-hidden className="size-3" />}</span>{showPassword ? "Hide password" : "Show password"}</button>
              {error ? <p role="alert" className="type-caption text-transactional">{error}</p> : null}
              {notice ? <p role="status" className="type-caption text-accent">{notice}</p> : null}
              <Button type="submit" loading={busy} size="md" className="w-full">{isSignup ? "Create account" : "Log in"}</Button>
            </form>
            {!isSignup ? <button type="button" className="focus-ring mt-2 rounded-sm type-caption text-accent" onClick={resetPassword} disabled={busy}>Forgot password?</button> : null}
            <div className="my-3 flex items-center gap-sm sm:my-4">
              <span className="h-px flex-1 bg-line" />
              <span className="type-caption text-muted-text">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <Button type="button" variant="outline" size="md" className="w-full" onClick={() => void continueWithGoogle()} disabled={busy}>
              Continue with Google
            </Button>
            <p className="type-caption mt-3 text-center text-muted-text sm:mt-5">{isSignup ? "Already have an account?" : "New to Outrazo?"}{" "}<Link className="focus-ring rounded-sm font-semibold text-accent" to={isSignup ? "/login" : "/signup"}>{isSignup ? "Log in" : "Sign up"}</Link></p>
          </div>
          <p className="mt-3 text-center type-caption text-subtle-text">You can browse public events without an account.</p>
        </section>
      </div>
    </main>
  );
}

function CharacterScene({ state }: { state: string }) {
  return (
    <div className="auth-scene__art relative mx-auto flex min-h-0 w-full flex-1 items-center justify-center" aria-label="Animated event discovery character">
      <span className="auth-particle absolute left-[16%] top-[18%] size-2 rounded-full bg-accent" />
      <span className="auth-particle absolute right-[18%] top-[28%] size-1.5 rounded-full bg-transactional" />
      <span className="auth-particle absolute bottom-[25%] left-[22%] size-1.5 rounded-full bg-primary-text/60" />
      <span className="auth-tag auth-tag--live absolute left-[12%] top-[34%] rounded-md border border-line bg-card px-2 py-1 type-caption text-accent">LIVE</span>
      <span className="auth-tag auth-tag--location absolute right-[13%] top-[42%] rounded-md border border-line bg-card px-2 py-1 type-caption text-primary-text">LAGOS</span>
      <span className="auth-tag auth-tag--time absolute bottom-[24%] right-[22%] rounded-md border border-line bg-card px-2 py-1 type-caption text-transactional">8 PM</span>
      <svg className={`auth-character relative z-10 h-full max-h-[380px] w-full max-w-[480px] ${state}`} viewBox="0 0 480 380" role="img" aria-label="A character discovering events">
        <g className="auth-character__head" transform="translate(0 0)">
          <path d="M180 102c0-57 39-82 78-82s78 25 78 82v59c0 48-35 80-78 80s-78-32-78-80v-59Z" fill="var(--outrazo-accent-primary)" opacity=".92" />
          <path d="M185 99c13-58 118-70 151-3-28-15-54-19-80-12-21 6-45 16-71 15Z" fill="var(--outrazo-bg-card)" />
          <ellipse className="auth-character__eye" cx="229" cy="132" rx="7" ry="9" fill="var(--outrazo-bg-canvas)" />
          <ellipse className="auth-character__eye" cx="287" cy="132" rx="7" ry="9" fill="var(--outrazo-bg-canvas)" />
          <path d="M244 169c12 10 24 10 36 0" fill="none" stroke="var(--outrazo-bg-canvas)" strokeLinecap="round" strokeWidth="6" />
        </g>
        <path d="M184 236c28-19 118-19 146 0l25 112H159l25-112Z" fill="var(--outrazo-accent-secondary)" />
        <path d="M191 243c-38 14-48 56-63 83" fill="none" stroke="var(--outrazo-accent-primary)" strokeLinecap="round" strokeWidth="22" />
        <path className="auth-character__arm" d="M320 243c35 13 43 45 53 74" fill="none" stroke="var(--outrazo-accent-primary)" strokeLinecap="round" strokeWidth="22" />
        <rect x="215" y="245" width="72" height="104" rx="12" fill="var(--outrazo-bg-card)" stroke="var(--outrazo-text-primary)" strokeWidth="5" />
        <rect x="225" y="260" width="52" height="65" rx="5" fill="var(--outrazo-accent-primary)" opacity=".2" />
        <path d="M237 280h28M237 292h18" stroke="var(--outrazo-accent-primary)" strokeLinecap="round" strokeWidth="5" />
        <circle cx="251" cy="336" r="4" fill="var(--outrazo-text-primary)" />
        <path d="M161 348h194" stroke="var(--outrazo-text-primary)" strokeLinecap="round" strokeOpacity=".18" strokeWidth="4" />
      </svg>
    </div>
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