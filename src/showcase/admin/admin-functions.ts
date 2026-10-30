// Admin Console Phase 1 server functions. Every function below first passes
// through requireSupabaseAuth (proves WHO is calling) and requirePermission
// (proves the caller may do THIS). UI gating is a courtesy; these checks are
// the real security boundary.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACTIVE_STATUS,
  CANCELLED_STATUS,
  describeStalledMutation,
  sanitizeSearchTerm,
  type EventMutationKind,
} from "./event-transitions";
import {
  checkSuspensionTransition,
  CLEAR_BAN_DURATION,
  INDEFINITE_BAN_DURATION,
} from "./user-moderation";
import {
  ADMIN_ROLES,
  canSeeMetric,
  type AdminPermission,
  type AdminRole,
} from "./permissions";
import {
  AdminBackendError,
  AdminForbiddenError,
  asAdminDb,
  callGrantRoleRpc,
  callRevokeRoleRpc,
  getCallerRole,
  requirePermission,
  type AdminPhase1Db,
} from "./require-permission.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

// ── Dashboard metrics (per-metric permission gating) ─────────────────────────

export interface AdminDashboardMetrics {
  users: number | null;
  organizers: number | null;
  eventsTotal: number | null;
  eventsPublished: number | null;
  eventsUpcoming: number | null;
  rsvps: number | null;
}

async function takeCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label: string,
): Promise<number> {
  const { count, error } = await query;
  if (error) {
    console.error(`[admin] dashboard ${label} count failed:`, error.message);
    throw new AdminBackendError("Could not load dashboard metrics. Please try again.");
  }
  return count ?? 0;
}

export const getAdminDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDashboardMetrics> => {
    const ctx = context as { supabase?: unknown };
    if (!ctx.supabase) {
      throw new AdminForbiddenError("Sign in is required.");
    }
    const role = await getCallerRole(
      ctx.supabase as Parameters<typeof getCallerRole>[number],
    );
    if (!role) {
      throw new AdminForbiddenError(
        "You do not have permission to access the admin console.",
      );
    }
    const db = asAdminDb(supabaseAdmin);
    const now = new Date().toISOString();
    const [users, organizers, eventsTotal, eventsPublished, eventsUpcoming, rsvps] =
      await Promise.all([
        canSeeMetric(role, "users")
          ? takeCount(db.from("profiles").select("id", { count: "exact", head: true }), "users")
          : null,
        canSeeMetric(role, "organizers")
          ? takeCount(db.from("organizers").select("id", { count: "exact", head: true }), "organizers")
          : null,
        canSeeMetric(role, "events")
          ? takeCount(db.from("events").select("id", { count: "exact", head: true }), "events")
          : null,
        canSeeMetric(role, "events")
          ? takeCount(
              db.from("events").select("id", { count: "exact", head: true }).eq("published", true),
              "published events",
            )
          : null,
        canSeeMetric(role, "events")
          ? takeCount(
              db.from("events").select("id", { count: "exact", head: true }).gt("starts_at", now),
              "upcoming events",
            )
          : null,
        canSeeMetric(role, "rsvps")
          ? takeCount(db.from("event_attendees").select("id", { count: "exact", head: true }), "rsvps")
          : null,
      ]);
    return { users, organizers, eventsTotal, eventsPublished, eventsUpcoming, rsvps };
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

const userListSchema = pageSchema.extend({
  offset: z.number().int().min(0).default(0),
  q: z.string().trim().max(120).optional(),
  onboarding: z.enum(["all", "complete", "incomplete"]).default("all"),
});

export const listAdminUsers = createServerFn({ method: "GET" })
  .validator(userListSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ users: AdminUserRow[]; total: number }> => {
    const grant = await requirePermission(context, "users.read");
    const db = asAdminDb(grant.supabase);
    const term = data.q ? sanitizeSearchTerm(data.q) : "";
    let query = db
      .from("profiles")
      .select("id, name, email, avatar_url, location, onboarding_completed, created_at", {
        count: "exact",
      });
    if (term) {
      query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,location.ilike.%${term}%`);
    }
    if (data.onboarding !== "all") {
      query = query.eq("onboarding_completed", data.onboarding === "complete");
    }
    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
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
      total: count ?? 0,
    };
  });

export interface AdminUserEventSample {
  id: string;
  title: string;
  published: boolean;
  status: string;
  startsAt: string;
}

export interface AdminUserRsvpSample {
  eventId: string;
  eventTitle: string;
  status: string;
  createdAt: string;
}

export interface AdminUserOrganizer {
  id: string;
  name: string;
  verified: boolean;
}

export interface AdminUserDetail extends AdminUserRow {
  // Suspension state comes from Supabase Auth, not profiles: true/false when
  // known, null when the login account is missing or unreachable.
  suspended: boolean | null;
  bannedUntil: string | null;
  eventCount: number;
  rsvpCount: number;
  createdEvents: AdminUserEventSample[];
  rsvps: AdminUserRsvpSample[];
  organizers: AdminUserOrganizer[];
}

export const getAdminUser = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ user: AdminUserDetail }> => {
    const grant = await requirePermission(context, "users.read");
    const db = asAdminDb(grant.supabase);
    const { data: profile, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      console.error("[admin] getAdminUser failed:", error.message);
      throw new AdminBackendError("Could not load the user. Please try again.");
    }
    if (!profile) {
      throw new AdminBackendError("That user no longer exists.");
    }
    const [eventsRes, eventCountRes, rsvpsRes, rsvpCountRes, orgsRes] = await Promise.all([
      db
        .from("events")
        .select("id, title, published, status, starts_at")
        .eq("created_by", profile.id)
        .order("created_at", { ascending: false })
        .limit(10),
      db.from("events").select("id", { count: "exact", head: true }).eq("created_by", profile.id),
      db
        .from("event_attendees")
        .select("event_id, status, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(10),
      db.from("event_attendees").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
      db
        .from("organizers")
        .select("id, name, verified")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: true }),
    ]);
    if (eventsRes.error || eventCountRes.error || rsvpsRes.error || rsvpCountRes.error || orgsRes.error) {
      console.error("[admin] getAdminUser related load failed");
      throw new AdminBackendError("Could not load the user. Please try again.");
    }
    const rsvpRows = rsvpsRes.data ?? [];
    const rsvpEventIds = [...new Set(rsvpRows.map((rsvp) => rsvp.event_id))];
    const { data: rsvpEvents } =
      rsvpEventIds.length > 0
        ? await db.from("events").select("id, title").in("id", rsvpEventIds)
        : { data: [] as { id: string; title: string }[] };
    const titles = new Map((rsvpEvents ?? []).map((event) => [event.id, event.title]));
    let suspended: boolean | null = null;
    let bannedUntil: string | null = null;
    try {
      const { data: authUser, error: authError } = await grant.supabase.auth.admin.getUserById(
        profile.id,
      );
      if (!authError && authUser?.user) {
        bannedUntil = authUser.user.banned_until ?? null;
        suspended = bannedUntil ? new Date(bannedUntil).getTime() > Date.now() : false;
      }
    } catch (caught) {
      console.error("[admin] getAdminUser auth lookup failed:", caught);
    }
    return {
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatar_url,
        location: profile.location,
        onboardingCompleted: profile.onboarding_completed,
        createdAt: profile.created_at,
        suspended,
        bannedUntil,
        eventCount: eventCountRes.count ?? 0,
        rsvpCount: rsvpCountRes.count ?? 0,
        createdEvents: (eventsRes.data ?? []).map((event) => ({
          id: event.id,
          title: event.title,
          published: event.published,
          status: event.status,
          startsAt: event.starts_at,
        })),
        rsvps: rsvpRows.map((rsvp) => ({
          eventId: rsvp.event_id,
          eventTitle: titles.get(rsvp.event_id) ?? "Unknown event",
          status: rsvp.status,
          createdAt: rsvp.created_at,
        })),
        organizers: (orgsRes.data ?? []).map((organizer) => ({
          id: organizer.id,
          name: organizer.name,
          verified: organizer.verified,
        })),
      },
    };
  });

export const setAdminUserSuspended = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), suspended: z.boolean() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; suspended: boolean }> => {
    const grant = await requirePermission(context, "users.manage");
    if (data.id === grant.userId) {
      throw new AdminForbiddenError("You cannot suspend your own account.");
    }
    const db = asAdminDb(grant.supabase);
    const { data: staffRow, error: staffError } = await db
      .from("admin_roles")
      .select("user_id")
      .eq("user_id", data.id)
      .maybeSingle();
    if (staffError) {
      console.error("[admin] suspend staff check failed:", staffError.message);
      throw new AdminBackendError("Could not verify the account. Please try again.");
    }
    if (staffRow) {
      throw new AdminForbiddenError(
        "Staff accounts cannot be suspended here. Manage their access from the Roles page.",
      );
    }
    const { data: authUser, error: authError } = await grant.supabase.auth.admin.getUserById(
      data.id,
    );
    if (authError || !authUser?.user) {
      console.error("[admin] suspend target lookup failed:", authError?.message ?? "no auth user");
      throw new AdminBackendError("No login account exists for that user.");
    }
    const bannedUntil = authUser.user.banned_until ?? null;
    const banned = bannedUntil ? new Date(bannedUntil).getTime() > Date.now() : false;
    const blocked = checkSuspensionTransition(data.suspended, banned);
    if (blocked) {
      throw new AdminBackendError(blocked);
    }
    const { error: banError } = await grant.supabase.auth.admin.updateUserById(data.id, {
      ban_duration: data.suspended ? INDEFINITE_BAN_DURATION : CLEAR_BAN_DURATION,
    });
    if (banError) {
      console.error("[admin] set ban failed:", banError.message);
      throw new AdminBackendError("Could not update the account. Please try again.");
    }
    await insertAuditAction(db, {
      actorId: grant.userId,
      action: data.suspended ? "admin.user.suspend" : "admin.user.restore",
      entityType: "profiles",
      entityId: data.id,
      metadata: data.suspended
        ? { from: "active", to: "suspended", ban_duration: INDEFINITE_BAN_DURATION }
        : { from: "suspended", to: "active" },
    });
    return { ok: true, suspended: data.suspended };
  });

export interface AdminOrganizerRow {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  verified: boolean;
  ownerId: string | null;
  ownerName: string | null;
  eventCount: number;
  publishedCount: number;
  draftCount: number;
  cancelledCount: number;
  createdAt: string;
}

const organizerListSchema = pageSchema.extend({
  offset: z.number().int().min(0).default(0),
  q: z.string().trim().max(120).optional(),
  verified: z.enum(["all", "verified", "unverified"]).default("all"),
});

export const listAdminOrganizers = createServerFn({ method: "GET" })
  .validator(organizerListSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ organizers: AdminOrganizerRow[]; total: number }> => {
    const grant = await requirePermission(context, "events.read");
    const db = asAdminDb(grant.supabase);
    const term = data.q ? sanitizeSearchTerm(data.q) : "";
    let query = db
      .from("organizers")
      .select("id, name, slug, location, verified, owner_id, created_at", { count: "exact" });
    if (term) {
      query = query.or(`name.ilike.%${term}%,location.ilike.%${term}%,slug.ilike.%${term}%`);
    }
    if (data.verified !== "all") {
      query = query.eq("verified", data.verified === "verified");
    }
    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) {
      console.error("[admin] listAdminOrganizers failed:", error.message);
      throw new AdminBackendError("Could not load organizers. Please try again.");
    }
    const list = rows ?? [];
    const ownerIds = [...new Set(list.map((row) => row.owner_id).filter(Boolean))] as string[];
    const organizerIds = list.map((row) => row.id);
    const [{ data: owners }, { data: events }] = await Promise.all([
      ownerIds.length > 0
        ? db.from("profiles").select("id, name").in("id", ownerIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
      // One query for the whole page; grouped below. Fine at current scale.
      organizerIds.length > 0
        ? db.from("events").select("id, organizer_id, published, status").in("organizer_id", organizerIds)
        : Promise.resolve({
            data: [] as { id: string; organizer_id: string; published: boolean; status: string }[],
          }),
    ]);
    const names = new Map((owners ?? []).map((owner) => [owner.id, owner.name]));
    const counts = new Map<string, { total: number; published: number; drafts: number; cancelled: number }>();
    for (const event of events ?? []) {
      const entry = counts.get(event.organizer_id) ?? { total: 0, published: 0, drafts: 0, cancelled: 0 };
      entry.total += 1;
      if (event.status === CANCELLED_STATUS) entry.cancelled += 1;
      else if (event.published) entry.published += 1;
      else entry.drafts += 1;
      counts.set(event.organizer_id, entry);
    }
    return {
      organizers: list.map((row) => {
        const entry = counts.get(row.id) ?? { total: 0, published: 0, drafts: 0, cancelled: 0 };
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          location: row.location,
          verified: row.verified,
          ownerId: row.owner_id,
          ownerName: row.owner_id ? (names.get(row.owner_id) ?? null) : null,
          eventCount: entry.total,
          publishedCount: entry.published,
          draftCount: entry.drafts,
          cancelledCount: entry.cancelled,
          createdAt: row.created_at,
        };
      }),
      total: count ?? 0,
    };
  });

export interface AdminOrganizerEventSample {
  id: string;
  title: string;
  published: boolean;
  status: string;
  startsAt: string;
}

export interface AdminOrganizerDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  community: string | null;
  location: string | null;
  website: string | null;
  avatarUrl: string | null;
  verified: boolean;
  createdAt: string;
  owner: { id: string; name: string | null; email: string | null } | null;
  ownerSuspended: boolean | null;
  counts: { total: number; published: number; drafts: number; cancelled: number };
  publishedEvents: AdminOrganizerEventSample[];
  draftEvents: AdminOrganizerEventSample[];
  cancelledEvents: AdminOrganizerEventSample[];
}

export const getAdminOrganizer = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ organizer: AdminOrganizerDetail }> => {
    const grant = await requirePermission(context, "events.read");
    const db = asAdminDb(grant.supabase);
    const { data: row, error } = await db
      .from("organizers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      console.error("[admin] getAdminOrganizer failed:", error.message);
      throw new AdminBackendError("Could not load the organizer. Please try again.");
    }
    if (!row) {
      throw new AdminBackendError("That organizer no longer exists.");
    }
    const [ownerRes, totalRes, publishedRes, draftsRes, cancelledRes, eventsRes] = await Promise.all([
      row.owner_id
        ? db.from("profiles").select("id, name, email").eq("id", row.owner_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from("events").select("id", { count: "exact", head: true }).eq("organizer_id", row.id),
      db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", row.id)
        .eq("published", true),
      db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", row.id)
        .eq("published", false)
        .neq("status", CANCELLED_STATUS),
      db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", row.id)
        .eq("status", CANCELLED_STATUS),
      db
        .from("events")
        .select("id, title, published, status, starts_at")
        .eq("organizer_id", row.id)
        .order("starts_at", { ascending: false })
        .limit(100),
    ]);
    if (
      ownerRes.error ||
      totalRes.error ||
      publishedRes.error ||
      draftsRes.error ||
      cancelledRes.error ||
      eventsRes.error
    ) {
      console.error("[admin] getAdminOrganizer related load failed");
      throw new AdminBackendError("Could not load the organizer. Please try again.");
    }
    let ownerSuspended: boolean | null = null;
    if (row.owner_id) {
      try {
        const { data: authUser, error: authError } = await grant.supabase.auth.admin.getUserById(
          row.owner_id,
        );
        if (!authError && authUser?.user) {
          const bannedUntil = authUser.user.banned_until ?? null;
          ownerSuspended = bannedUntil ? new Date(bannedUntil).getTime() > Date.now() : false;
        }
      } catch (caught) {
        console.error("[admin] getAdminOrganizer auth lookup failed:", caught);
      }
    }
    const publishedEvents: AdminOrganizerEventSample[] = [];
    const draftEvents: AdminOrganizerEventSample[] = [];
    const cancelledEvents: AdminOrganizerEventSample[] = [];
    for (const event of eventsRes.data ?? []) {
      const sample = {
        id: event.id,
        title: event.title,
        published: event.published,
        status: event.status,
        startsAt: event.starts_at,
      };
      if (event.status === CANCELLED_STATUS) cancelledEvents.push(sample);
      else if (event.published) publishedEvents.push(sample);
      else draftEvents.push(sample);
    }
    return {
      organizer: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        community: row.community,
        location: row.location,
        website: row.website,
        avatarUrl: row.avatar_url,
        verified: row.verified,
        createdAt: row.created_at,
        owner: ownerRes.data
          ? { id: ownerRes.data.id, name: ownerRes.data.name, email: ownerRes.data.email }
          : null,
        ownerSuspended,
        counts: {
          total: totalRes.count ?? 0,
          published: publishedRes.count ?? 0,
          drafts: draftsRes.count ?? 0,
          cancelled: cancelledRes.count ?? 0,
        },
        publishedEvents,
        draftEvents,
        cancelledEvents,
      },
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

const eventListSchema = pageSchema.extend({
  offset: z.number().int().min(0).default(0),
  q: z.string().trim().max(120).optional(),
  published: z.enum(["all", "published", "draft"]).default("all"),
  status: z.string().trim().max(32).optional(),
  category: z.string().trim().max(64).optional(),
});

export const listAdminEvents = createServerFn({ method: "GET" })
  .validator(eventListSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ events: AdminEventRow[]; total: number }> => {
    const grant = await requirePermission(context, "events.read");
    const db = asAdminDb(grant.supabase);
    const term = data.q ? sanitizeSearchTerm(data.q) : "";
    let query = db
      .from("events")
      .select(
        "id, title, category, city, starts_at, published, status, attendee_count, created_by, created_at",
        { count: "exact" },
      );
    if (term) {
      query = query.or(`title.ilike.%${term}%,city.ilike.%${term}%,venue_name.ilike.%${term}%`);
    }
    if (data.published !== "all") {
      query = query.eq("published", data.published === "published");
    }
    if (data.status) query = query.eq("status", data.status);
    if (data.category) query = query.eq("category", data.category);
    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
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
      total: count ?? 0,
    };
  });

export interface AdminEventTier {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface AdminEventAttendeeSample {
  userId: string;
  name: string | null;
  email: string | null;
  status: string;
  createdAt: string;
}

export interface AdminEventDetail {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  imageUrl: string | null;
  category: string;
  eventType: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  priceFrom: number | null;
  currency: string;
  capacity: number;
  status: string;
  published: boolean;
  attendeeCount: number;
  createdAt: string;
  organizer: { id: string; name: string; verified: boolean } | null;
  creator: { id: string; name: string | null; email: string | null } | null;
  tiers: AdminEventTier[];
  recentAttendees: AdminEventAttendeeSample[];
}

export const getAdminEvent = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ event: AdminEventDetail }> => {
    const grant = await requirePermission(context, "events.read");
    const db = asAdminDb(grant.supabase);
    const { data: row, error } = await db
      .from("events")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      console.error("[admin] getAdminEvent failed:", error.message);
      throw new AdminBackendError("Could not load the event. Please try again.");
    }
    if (!row) {
      throw new AdminBackendError("That event no longer exists.");
    }
    const [organizerRes, creatorRes, tiersRes, attendeesRes] = await Promise.all([
      db.from("organizers").select("id, name, verified").eq("id", row.organizer_id).maybeSingle(),
      row.created_by
        ? db.from("profiles").select("id, name, email").eq("id", row.created_by).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db
        .from("event_ticket_tiers")
        .select("id, name, price, quantity")
        .eq("event_id", row.id)
        .order("created_at", { ascending: true }),
      db
        .from("event_attendees")
        .select("user_id, status, created_at")
        .eq("event_id", row.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (organizerRes.error || creatorRes.error || tiersRes.error || attendeesRes.error) {
      console.error("[admin] getAdminEvent related load failed");
      throw new AdminBackendError("Could not load the event. Please try again.");
    }
    const attendeeRows = attendeesRes.data ?? [];
    const attendeeIds = [...new Set(attendeeRows.map((attendee) => attendee.user_id))];
    const { data: attendeeProfiles } =
      attendeeIds.length > 0
        ? await db.from("profiles").select("id, name, email").in("id", attendeeIds)
        : { data: [] as { id: string; name: string | null; email: string | null }[] };
    const people = new Map((attendeeProfiles ?? []).map((profile) => [profile.id, profile]));
    return {
      event: {
        id: row.id,
        title: row.title,
        slug: row.slug,
        summary: row.summary,
        description: row.description,
        imageUrl: row.image_url,
        category: row.category,
        eventType: row.event_type,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        venueName: row.venue_name,
        address: row.address,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
        priceFrom: row.price_from,
        currency: row.currency,
        capacity: row.capacity,
        status: row.status,
        published: row.published,
        attendeeCount: row.attendee_count ?? 0,
        createdAt: row.created_at,
        organizer: organizerRes.data
          ? { id: organizerRes.data.id, name: organizerRes.data.name, verified: organizerRes.data.verified }
          : null,
        creator: creatorRes.data
          ? { id: creatorRes.data.id, name: creatorRes.data.name, email: creatorRes.data.email }
          : null,
        tiers: (tiersRes.data ?? []).map((tier) => ({
          id: tier.id,
          name: tier.name,
          price: tier.price,
          quantity: tier.quantity,
        })),
        recentAttendees: attendeeRows.map((attendee) => ({
          userId: attendee.user_id,
          name: people.get(attendee.user_id)?.name ?? null,
          email: people.get(attendee.user_id)?.email ?? null,
          status: attendee.status,
          createdAt: attendee.created_at,
        })),
      },
    };
  });

// Appends to the existing audit_log table through the service-role client,
// which is the only writer the Phase 1 grants allow. Callers run their state
// change first: the audit row must describe something that already happened.
// A failed audit insert throws a distinct message so a silent gap is never
// mistaken for success.
async function insertAuditAction(
  db: SupabaseClient<AdminPhase1Db>,
  input: { actorId: string; action: string; entityType: string; entityId: string; metadata: AuditMetadata },
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: input.metadata,
  });
  if (error) {
    console.error(`[admin] ${input.action} audit insert failed:`, error.message);
    throw new AdminBackendError(
      "The change was applied, but the audit record could not be written. Refresh to confirm the current state, then report this.",
    );
  }
}

export const setAdminEventPublished = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), published: z.boolean() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; published: boolean }> => {
    const grant = await requirePermission(context, "events.manage");
    const db = asAdminDb(grant.supabase);
    const kind: EventMutationKind = data.published ? "publish" : "unpublish";
    // Conditional update: matches only when a real transition is still needed,
    // so concurrent publishers cannot double-apply or double-audit.
    const { data: updated, error } = await db
      .from("events")
      .update({ published: data.published })
      .eq("id", data.id)
      .eq("published", !data.published)
      .select("id");
    if (error) {
      console.error("[admin] setAdminEventPublished failed:", error.message);
      throw new AdminBackendError("Could not update the event. Please try again.");
    }
    if (!updated || updated.length === 0) {
      const { data: current } = await db
        .from("events")
        .select("id, published, status")
        .eq("id", data.id)
        .maybeSingle();
      throw new AdminBackendError(
        describeStalledMutation(
          kind,
          current ? { published: current.published, status: current.status } : null,
        ),
      );
    }
    await insertAuditAction(db, {
      actorId: grant.userId,
      action: data.published ? "admin.event.publish" : "admin.event.unpublish",
      entityType: "events",
      entityId: data.id,
      metadata: data.published
        ? { from: "draft", to: "published" }
        : { from: "published", to: "draft" },
    });
    return { ok: true, published: data.published };
  });

export const setAdminEventCancelled = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), cancelled: z.boolean() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; status: string }> => {
    const grant = await requirePermission(context, "events.manage");
    const db = asAdminDb(grant.supabase);
    const kind: EventMutationKind = data.cancelled ? "cancel" : "reopen";
    // Cancel hides the event from discovery (published=false) and stamps the
    // terminal status label. RSVPs, tiers, and orders are never touched.
    // Reopen only clears a cancellation and leaves publication alone, so the
    // organizer deliberately republishes.
    const { data: updated, error } = data.cancelled
      ? await db
          .from("events")
          .update({ published: false, status: CANCELLED_STATUS })
          .eq("id", data.id)
          .neq("status", CANCELLED_STATUS)
          .select("id")
      : await db
          .from("events")
          .update({ status: ACTIVE_STATUS })
          .eq("id", data.id)
          .eq("status", CANCELLED_STATUS)
          .select("id");
    if (error) {
      console.error("[admin] setAdminEventCancelled failed:", error.message);
      throw new AdminBackendError("Could not update the event. Please try again.");
    }
    if (!updated || updated.length === 0) {
      const { data: current } = await db
        .from("events")
        .select("id, published, status")
        .eq("id", data.id)
        .maybeSingle();
      throw new AdminBackendError(
        describeStalledMutation(
          kind,
          current ? { published: current.published, status: current.status } : null,
        ),
      );
    }
    await insertAuditAction(db, {
      actorId: grant.userId,
      action: data.cancelled ? "admin.event.cancel" : "admin.event.reopen",
      entityType: "events",
      entityId: data.id,
      metadata: data.cancelled
        ? { from: "active", to: CANCELLED_STATUS }
        : { from: CANCELLED_STATUS, to: ACTIVE_STATUS },
    });
    return { ok: true, status: data.cancelled ? CANCELLED_STATUS : ACTIVE_STATUS };
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
