import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { useAuth } from "@/showcase/auth/auth-context";

/**
 * Shown while nobody is signed in. The app stays fully usable on demo data —
 * this only makes the state explicit and offers the real sign-in path.
 */
export function DemoModeBanner() {
  const { isDemoMode, loading } = useAuth();
  if (loading || !isDemoMode) return null;

  return (
    <div className="flex flex-wrap items-center gap-sm border-b border-line bg-accent/10 px-md py-sm text-primary-text lg:px-xl">
      <Info aria-hidden className="size-4 shrink-0 text-accent" />
      <p className="type-caption">
        Demo mode — you&apos;re browsing sample events without an account.
      </p>
      <Link to="/auth" className="focus-ring type-caption ml-auto rounded-full font-semibold text-accent">
        Sign in
      </Link>
    </div>
  );
}
