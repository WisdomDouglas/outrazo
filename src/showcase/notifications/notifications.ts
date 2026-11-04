// Notifications server functions (P4). Thin bridge: every function below
// first passes through requireSupabaseAuth (proves WHO is calling), then
// touches only the caller's own rows on the caller's own RLS-scoped
// client. Inserts happen in the ticket core, the cancel paths, and the
// RSVP trigger — never here, never from the browser.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export class NotificationsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationsError";
  }
}

function authedUser(context: unknown): { supabase: SupabaseClient; userId: string } {
  const ctx = context as { supabase?: SupabaseClient; userId?: unknown };
  if (!ctx.supabase || typeof ctx.userId !== "string" || ctx.userId.length === 0) {
    throw new NotificationsError("Sign in is required.");
  }
  return { supabase: ctx.supabase, userId: ctx.userId };
}

function passNotificationsError(caught: unknown): never {
  if (caught instanceof NotificationsError) throw caught;
  console.error("[notifications] unexpected failure", caught);
  throw new NotificationsError("Something went wrong. Please try again.");
}

const idSchema = z.object({ id: z.string().uuid() });

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ limit: z.number().int().min(1).max(100).default(30) }))
  .handler(async ({ data, context }): Promise<{ notifications: NotificationRow[]; unread: number }> => {
    const { supabase, userId } = authedUser(context);
    try {
      const { data: rows, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,read_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (error) {
        console.error("[notifications] list failed", error);
        throw new NotificationsError("Could not load notifications. Please try again.");
      }
      const list = ((rows ?? []) as {
        id: string; type: string; title: string; body: string;
        link: string | null; read_at: string | null; created_at: string;
      }[]).map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        link: row.link,
        readAt: row.read_at,
        createdAt: row.created_at,
      }));
      return { notifications: list, unread: list.filter((row) => !row.readAt).length };
    } catch (caught) {
      passNotificationsError(caught);
    }
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(idSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = authedUser(context);
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) {
        console.error("[notifications] mark-read failed", error);
        throw new NotificationsError("Could not update that notification. Please try again.");
      }
      return { ok: true };
    } catch (caught) {
      passNotificationsError(caught);
    }
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { supabase, userId } = authedUser(context);
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) {
        console.error("[notifications] mark-all-read failed", error);
        throw new NotificationsError("Could not update notifications. Please try again.");
      }
      return { ok: true };
    } catch (caught) {
      passNotificationsError(caught);
    }
  });
