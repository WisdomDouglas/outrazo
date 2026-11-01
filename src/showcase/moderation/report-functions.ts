// Public moderation-report filing (Phase 2C-1). Any signed-in user may file;
// staff-only queue and resolution live in the admin server functions.
//
// The filing RPC runs on the CALLER's own user client, so auth.uid() inside
// the database is the true reporter and the daily limit, duplicate check, and
// insert stay in one database transaction. No service-role import here: this
// module must never touch privileged clients.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  friendlyFilingError,
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
} from "./report-reasons";

const fileSchema = z.object({
  eventId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(REPORT_DETAILS_MAX).optional(),
});

// Minimal structural type for the filing RPC. The generated Database types do
// not include file_event_report yet, so we type only the rpc call we make
// instead of editing generated files.
interface FilingRpcClient {
  rpc(
    name: "file_event_report",
    args: { p_event_id: string; p_reason: string; p_details: string | null },
  ): Promise<{ data: string | null; error: { message: string } | null }>;
}

export const fileEventReport = createServerFn({ method: "POST" })
  .validator(fileSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; reportId: string }> => {
    const ctx = context as { supabase?: unknown };
    if (!ctx.supabase) {
      throw new Error("Sign in to report an event.");
    }
    const client = ctx.supabase as unknown as FilingRpcClient;
    const details = data.details?.trim() ? data.details.trim() : null;
    const { data: reportId, error } = await client.rpc("file_event_report", {
      p_event_id: data.eventId,
      p_reason: data.reason,
      p_details: details,
    });
    if (error || !reportId) {
      if (error) {
        console.error("[moderation] fileEventReport failed:", error.message);
      }
      throw new Error(friendlyFilingError(error?.message ?? ""));
    }
    return { ok: true, reportId };
  });
