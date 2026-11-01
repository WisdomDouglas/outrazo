// Public active-promotion lookup for the homepage spotlight (Phase 2C-2).
//
// Minimum-field design: this query selects only the four scheduling columns.
// Row-Level Security re-checks the active window with database time, so even a
// skewed client clock can never reveal a scheduled or expired promotion — and
// creator identities are not granted to public roles at all. Event content
// arrives through the existing published-only event path, which hides drafts
// and cancelled events on its own.
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/external-client";
import { fetchPublishedEventDetails } from "@/showcase/event-data";
import type { EventDetails } from "@/showcase/sample-data";

export interface ActivePromotion {
  promotionId: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
  event: EventDetails;
}

interface PromotionRow {
  id: string;
  event_id: string;
  starts_at: string;
  ends_at: string;
}

async function fetchActivePromotionRow(): Promise<PromotionRow | null> {
  // Local supabase-js types do not include event_promotions yet, so this one
  // public read is structurally typed instead of editing generated files.
  const client = supabase as unknown as {
    from(table: "event_promotions"): {
      select(columns: string): {
        eq(column: string, value: string): {
          lte(column: string, value: string): {
            gt(column: string, value: string): {
              maybeSingle(): Promise<{ data: PromotionRow | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("event_promotions")
    .select("id, event_id, starts_at, ends_at")
    .eq("status", "active")
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Loads the homepage spotlight promotion, if one is live. Resolves to null
 * while loading, when no promotion is active, when its event is no longer
 * published, or when anything fails — the homepage must never break because
 * of the spotlight, so failures stay silent apart from a console entry.
 */
export function useActivePromotion(): ActivePromotion | null {
  const [promotion, setPromotion] = useState<ActivePromotion | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const row = await fetchActivePromotionRow();
        if (!active || !row) return;
        const event = await fetchPublishedEventDetails(row.event_id);
        if (!active) return;
        if (!event) return;
        setPromotion({
          promotionId: row.id,
          eventId: row.event_id,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          event,
        });
      } catch (caught) {
        if (!active) return;
        console.error(
          "[promotions] spotlight lookup failed:",
          caught instanceof Error ? caught.message : caught,
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return promotion;
}
