import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/external-client";

/**
 * Single source of truth for the signed-in session.
 *
 * The app still runs without a session (demo mode) so every existing screen
 * keeps working while backend-backed features are added incrementally.
 */
export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  location: string | null;
  onboarding_completed: boolean;
  preferences: Record<string, unknown> | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /** True when nobody is signed in — the app stays usable with demo data. */
  isDemoMode: boolean;
  displayName: string;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true);
      setSession(nextSession);
      if (!nextSession) setProfile(null);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, name, email, avatar_url, location, onboarding_completed, preferences")
      .eq("id", userId)
      .maybeSingle();
    setProfile((data as UserProfile | null) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null;
    return {
      session,
      user,
      profile,
      loading,
      isDemoMode: !session,
      displayName:
        profile?.name ??
        (user?.user_metadata?.["name"] as string | undefined) ??
        user?.email?.split("@")[0] ??
        "Demo User",
      signOut,
      refreshProfile: loadProfile,
    };
  }, [session, profile, loading, signOut, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
