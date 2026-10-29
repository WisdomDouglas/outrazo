// Client-safe admin helpers. These only call server functions and format
// errors; every authorization decision happens server-side.
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/showcase/auth/auth-context";
import { getMyAdminRole } from "./admin-functions";
import type { AdminRole } from "./permissions";

export function useAccessToken(): string | null {
  const { session } = useAuth();
  return session?.access_token ?? null;
}

export function friendlyAdminError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : "";
  if (/failed to fetch|network|load failed/i.test(message)) {
    return "Could not reach the server. Check your connection and try again.";
  }
  return message || "Something went wrong. Please try again.";
}

export function useMyAdminRole() {
  const { loading: authLoading, session } = useAuth();
  const token = session?.access_token ?? null;
  const [role, setRole] = useState<AdminRole | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setChecked(true);
      return;
    }
    setError(null);
    try {
      const result = await getMyAdminRole({
        headers: { Authorization: `Bearer ${token}` },
      });
      setRole(result.role);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setChecked(true);
    }
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setChecked(true);
      return;
    }
    void refresh();
  }, [authLoading, session, refresh]);

  return { role, loading: authLoading || !checked, error, refresh };
}
