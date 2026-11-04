// Server-only notification fan-out (P4). Called from the organizer and
// admin cancel paths AFTER a genuine active → cancelled flip, so each call
// means "tell everyone once". Best-effort by design: telling buyers must
// never break (or roll back) the cancellation itself.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CancelFanoutInput {
  eventId: string;
  eventTitle: string;
}

const FANOUT_BATCH = 200;

export async function notifyEventCancelled(
  db: SupabaseClient,
  input: CancelFanoutInput,
): Promise<void> {
  try {
    const [ordersResult, attendeesResult] = await Promise.all([
      db
        .from("ticket_orders")
        .select("user_id")
        .eq("event_id", input.eventId)
        .eq("status", "paid")
        .limit(2000),
      db.from("event_attendees").select("user_id").eq("event_id", input.eventId).limit(2000),
    ]);
    if (ordersResult.error) throw ordersResult.error;
    if (attendeesResult.error) throw attendeesResult.error;
    const recipients = new Set<string>();
    for (const row of (ordersResult.data ?? []) as { user_id: string }[]) {
      recipients.add(row.user_id);
    }
    for (const row of (attendeesResult.data ?? []) as { user_id: string }[]) {
      recipients.add(row.user_id);
    }
    if (recipients.size === 0) return;
    const rows = [...recipients].map((userId) => ({
      user_id: userId,
      type: "event_cancelled",
      title: "Event cancelled",
      body: `"${input.eventTitle}" was cancelled. If you paid for a ticket, please contact the organizer about a refund.`,
      link: `/events/${input.eventId}`,
    }));
    for (let i = 0; i < rows.length; i += FANOUT_BATCH) {
      const { error } = await db.from("notifications").insert(rows.slice(i, i + FANOUT_BATCH));
      if (error) throw error;
    }
  } catch (fanoutError) {
    console.error("[notifications] cancel fan-out failed", fanoutError);
  }
}
