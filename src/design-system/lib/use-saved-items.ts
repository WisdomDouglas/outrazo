import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import {
  rememberReturnTo,
  toggleSavedEvent,
  useSavedEventsState,
} from "@/showcase/saved/saved-events-store";

const EVENTS_KEY = "outrazo-saved-events";

/**
 * Saved item ids. Events are stored on the signed-in account (logged-out
 * visitors are sent to Login); other keys (e.g. follows) stay local.
 */
export function useSavedItems(storageKey = EVENTS_KEY) {
  const remote = useSavedEventsState();
  const navigate = useNavigate();
  const [local, setLocal] = useState<string[]>([]);
  const isEvents = storageKey === EVENTS_KEY;

  useEffect(() => {
    if (isEvents) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setLocal(JSON.parse(raw) as string[]);
    } catch {
      /* ignore malformed storage */
    }
  }, [storageKey, isEvents]);

  const persist = useCallback(
    (next: string[]) => {
      setLocal(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
    },
    [storageKey],
  );

  const toggle = useCallback(
    (id: string) => {
      if (isEvents) {
        void toggleSavedEvent(id).then((ok) => {
          if (!ok) {
            rememberReturnTo(window.location.pathname + window.location.search);
            void navigate({ to: "/login" });
          }
        });
        return;
      }
      setLocal((current) => {
        const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
        return next;
      });
    },
    [isEvents, navigate, storageKey],
  );

  const saved = isEvents ? remote.keys : local;
  const isSaved = useCallback((id: string) => saved.includes(id), [saved]);

  return { saved, isSaved, toggle, setSaved: persist, status: isEvents ? remote.status : ("ready" as const) };
}
