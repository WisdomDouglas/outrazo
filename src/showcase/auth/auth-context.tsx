import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  profileError: Error | null;
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
  const [profileError, setProfileError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const authUserId = useRef<string | null>(null);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = authUserId.current !== nextUserId;
      authUserId.current = nextUserId;
      setSession(nextSession);
      if (userChanged) {
        setProfile(null);
        setProfileError(null);
        setLoading(Boolean(nextSession));
      } else if (!nextSession) {
        setProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      setAuthInitialized(true);
      const nextSession = data.session;
      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = authUserId.current !== nextUserId;
      authUserId.current = nextUserId;
      setSession(nextSession);
      if (userChanged) {
        setProfile(null);
        setProfileError(null);
        setLoading(Boolean(nextSession));
      } else if (!nextSession) {
        setLoading(false);
      }
    }).catch((error: unknown) => {
      console.error("Unable to restore the Outrazo session.", error);
      setAuthInitialized(true);
      setLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    setProfileError(null);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, avatar_url, location, onboarding_completed")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (authUserId.current !== userId) return;
      setProfile((data as UserProfile | null) ?? null);
    } catch (error) {
      setProfileError(error instanceof Error ? error : new Error("Unable to load the Outrazo profile."));
      throw error;
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await loadProfile();
      } catch (error) {
        console.error("Unable to load the Outrazo profile.", error);
        if (active) {
          setProfile(null);
          setProfileError(error instanceof Error ? error : new Error("Unable to load the Outrazo profile."));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void refresh();
    return () => {
      active = false;
    };
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
      profileError,
      loading: loading || !authInitialized,
      isDemoMode: !session,
      displayName:
        profile?.name ??
        (user?.user_metadata?.["name"] as string | undefined) ??
        user?.email?.split("@")[0] ??
        "Demo User",
      signOut,
      refreshProfile: loadProfile,
    };
  }, [session, profile, profileError, loading, authInitialized, signOut, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
