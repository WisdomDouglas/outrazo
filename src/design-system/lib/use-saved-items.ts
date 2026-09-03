import { useCallback, useEffect, useState } from "react";

/**
 * Local, persisted set of saved item ids (events, cities, organizers).
 * Swap the storage calls for a database-backed store when the API lands —
 * the returned API stays the same.
 */
export function useSavedItems(storageKey = "outrazo-saved-events") {
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setSaved(JSON.parse(raw) as string[]);
    } catch {
      /* ignore malformed storage */
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: string[]) => {
      setSaved(next);
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
      setSaved((current) => {
        const next = current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id];
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
        return next;
      });
    },
    [storageKey],
  );

  const isSaved = useCallback((id: string) => saved.includes(id), [saved]);

  return { saved, isSaved, toggle, setSaved: persist };
}
