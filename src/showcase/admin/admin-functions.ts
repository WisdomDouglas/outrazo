// Admin Console Phase 1 server functions. Every function below first passes
// through requireSupabaseAuth (proves WHO is calling) and requirePermission
// (proves the caller may do THIS). UI gating is a courtesy; these checks are
// the real security boundary.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ADMIN_ROLES,
  type AdminPermission,
  type AdminRole,
} from "./permissions";
import {
  AdminBackendError,
  asAdminDb,
  callGrantRoleRpc,
  callRevokeRoleRpc,
  getCallerRole,
  requirePermission,
} from "./require-permission.server";

const pageSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

// ── Who am I (for the UI gate; returns null for ordinary users) ────────────

export const getMyAdminRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ role: AdminRole | null }> => {
    const ctx = context as { supabase?: unknown };
    if (!ctx.supabase) {
      throw new AdminBackendError("Sign in is required.");
    }
    const role = await getCallerRole(
      ctx.supabase as Parameters<typeof getCallerRole>[number],
    );
    return { role };
  });

// ── Read-only least-privilege views ──────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  location: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .validator(pageSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ users: AdminUserRow[] }> => {
    const grant = await requirePermission(context, "users.read");
    const { data: rows, error } = await asAdminDb(grant.supabase)
      .from("profiles")
      .select("id, name, email, avatar_url, location, onboarding_completed, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) {
      console.error("[admin] listAdminUsers failed:", error.message);
      throw new AdminBackendError("Could not load users. Please try again.");
    }
    return {
      users: (rows ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        avatarUrl: row.avatar_url,
        location: row.location,
        onboardingCompleted: row.onboarding_completed,
        createdAt: row.created_at,
      })),
    };
  });

export interface AdminEventRow {
  id: string;
  title: string;
  category: string | null;
  city: string | null;
  startsAt: string;
  published: boolean;
  status: string | null;
  attendeeCount: number;
  createdBy: string | null;
  createdAt: string;
}

export const listAdminEvents = createServerFn({ method: "GET" })
  .validator(pageSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ events: AdminEventRow[] }> => {
    const grant = await requirePermission(context, "events.read");
    const { data: rows, error } = await asAdminDb(grant.supabase)
      .from("events")
      .select(
        "id, title, category, city, starts_at, published, status, attendee_count, created_by, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) {
      console.error("[admin] listAdminEvents failed:", error.message);
      throw new AdminBackendError("Could not load events. Please try again.");
    }
    return {
      events: (rows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        city: row.city,
        startsAt: row.starts_at,
        published: row.published,
        status: row.status,
        attendeeCount: row.attendee_count ?? 0,
        createdBy: row.created_by,
        createdAt: row.created_at,
      })),
    };
  });

export interface AdminAttendeeRow {
  id: string;
  eventId: string;
  eventTitle: string;
  userId: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  status: string;
  createdAt: string;
}

const attendeesSchema = pageSchema.extend({
  eventId: z.string().uuid().optional(),
});

export const listAdminAttendees = createServerFn({ method: "GET" })
  .validator(attendeesSchema)
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ data, context }): Promise<{ attendees: AdminAttendeeRow[] }> => {
      const grant = await requirePermission(context, "attendees.read");
      const db = asAdminDb(grant.supabase);
      let query = db
        .from("event_attendees")
        .select("id, event_id, user_id, status, created_at")
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.eventId) query = query.eq("event_id", data.eventId);
      const { data: rows, error } = await query;
      if (error) {
        console.error("[admin] listAdminAttendees failed:", error.message);
        throw new AdminBackendError("Could not load RSVPs. Please try again.");
      }
      const list = rows ?? [];
      const eventIds = [...new Set(list.map((row) => row.event_id))];
      const userIds = [...new Set(list.map((row) => row.user_id))];
      const [{ data: events }, { data: profiles }] = await Promise.all([
        eventIds.length > 0
          ? db.from("events").select("id, title").in("id", eventIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
        userIds.length > 0
          ? db.from("profiles").select("id, name, email").in("id", userIds)
          : Promise.resolve({
              data: [] as { id: string; name: string | null; email: string | null }[],
            }),
      ]);
      const titles = new Map((events ?? []).map((event) => [event.id, event.title]));
      const people = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return {
        attendees: list.map((row) => ({
          id: row.id,
          eventId: row.event_id,
          eventTitle: titles.get(row.event_id) ?? "Unknown event",
          userId: row.user_id,
          attendeeName: people.get(row.user_id)?.name ?? null,
          attendeeEmail: people.get(row.user_id)?.email ?? null,
          status: row.status,
          createdAt: row.created_at,
        })),
      };
    },
  );

export interface AdminRoleRow {
  userId: string;
  role: AdminRole;
  name: string | null;
  email: string | null;
  grantedAt: string;
  note: string | null;
}

export const listAdminRoles = createServerFn({ method: "GET" })
  .validator(pageSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ roles: AdminRoleRow[] }> => {
    const grant = await requirePermission(context, "roles.read");
    const db = asAdminDb(grant.supabase);
    const { data: rows, error } = await db
      .from("admin_roles")
      .select("user_id, role, granted_at, note")
      .order("granted_at", { ascending: false })
      .limit(data.limit);
    if (error) {
      console.error("[admin] listAdminRoles failed:", error.message);
      throw new AdminBackendError("Could not load roles. Please try again.");
    }
    const list = rows ?? [];
    const userIds = [...new Set(list.map((row) => row.user_id))];
    const { data: profiles } =
      userIds.length > 0
        ? await db.from("profiles").select("id, name, email").in("id", userIds)
        : { data: [] as { id: string; name: string | null; email: string | null }[] };
    const people = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return {
      roles: list.map((row) => ({
        userId: row.user_id,
        role: row.role as AdminRole,
        name: people.get(row.user_id)?.name ?? null,
        email: people.get(row.user_id)?.email ?? null,
        grantedAt: row.granted_at,
        note: row.note,
      })),
    };
  });

// Metadata values we write today are role-name strings; the narrow type keeps
// the server-function return provably serializable.
export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface AuditLogRow {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: AuditMetadata;
}

export const listAuditLog = createServerFn({ method: "GET" })
  .validator(pageSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ entries: AuditLogRow[] }> => {
    const grant = await requirePermission(context, "audit.read");
    const db = asAdminDb(grant.supabase);
    const { data: rows, error } = await db
      .from("audit_log")
      .select("id, created_at, actor_id, action, entity_type, entity_id, metadata")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) {
      console.error("[admin] listAuditLog failed:", error.message);
      throw new AdminBackendError("Could not load the audit log. Please try again.");
    }
    const list = rows ?? [];
    const actorIds = [...new Set(list.map((row) => row.actor_id).filter(Boolean))] as string[];
    const { data: profiles } =
      actorIds.length > 0
        ? await db.from("profiles").select("id, name").in("id", actorIds)
        : { data: [] as { id: string; name: string | null }[] };
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
    return {
      entries: list.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        actorId: row.actor_id,
        actorName: row.actor_id ? (names.get(row.actor_id) ?? null) : null,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: (row.metadata ?? {}) as AuditMetadata,
      })),
    };
  });

// ── Role grants (audited, atomic, super-admin-only) ──────────────────────────

const grantSchema = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    role: z.enum(ADMIN_ROLES),
    note: z.string().max(280).optional(),
  })
  .refine((value) => value.userId ?? value.email, {
    message: "Provide a user id or an email address.",
  });

export const grantAdminRole = createServerFn({ method: "POST" })
  .validator(grantSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; userId: string }> => {
    const grant = await requirePermission(context, "roles.manage");
    let userId = data.userId ?? null;
    if (!userId && data.email) {
      const { data: profile, error } = await asAdminDb(grant.supabase)
        .from("profiles")
        .select("id")
        .eq("email", data.email)
        .maybeSingle();
      if (error) {
        console.error("[admin] grantAdminRole lookup failed:", error.message);
        throw new AdminBackendError("Could not look up that user. Please try again.");
      }
      userId = profile?.id ?? null;
    }
    if (!userId) {
      throw new AdminBackendError("No user with that id or email exists.");
    }
    await callGrantRoleRpc(grant.userClient, {
      userId,
      role: data.role,
      note: data.note ?? null,
    });
    return { ok: true, userId };
  });

export const revokeAdminRole = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "roles.manage");
    await callRevokeRoleRpc(grant.userClient, data.userId);
    return { ok: true };
  });

export type { AdminPermission };
