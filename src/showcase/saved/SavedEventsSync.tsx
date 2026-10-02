import { useEffect } from "react";

import { useAuth } from "@/showcase/auth/auth-context";
import { loadSavedEvents, useSavedEventsState } from "./saved-events-store";

/** Keeps saved events in step with the signed-in account and shows quiet feedback. */
export function SavedEventsSync() {
  const { user, loading } = useAuth();
  const { toast } = useSavedEventsState();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!loading) void loadSavedEvents(userId);
  }, [userId, loading]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[88px] z-50 flex justify-center px-md md:bottom-xl">
      {toast ? (
        <p key={toast.id} className="type-body rounded-full border border-line bg-card px-lg py-sm font-medium text-primary-text shadow-card">
          {toast.message}
        </p>
      ) : null}
    </div>
  );
}
