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
  callCancelPromotionRpc,
  callCreatePayoutRpc,
  callCreatePromotionRpc,
  callCreditPointsRpc,
  callGrantRoleRpc,
  callRevokeRoleRpc,
  callResolveReportRpc,
  callSetCommissionDefaultRpc,
  callSetPromotionPriceRpc,
  callSetRewardSettingRpc,
  callTransitionPayoutRpc,
  callTransitionWithdrawalRpc,
  getCallerRole,
  requirePermission,
  type AdminPhase1Db,
} from "./require-permission.server";
import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  REPORT_RESOLUTIONS,
  type ReportReason,
  type ReportStatus,
} from "@/showcase/moderation/report-reasons";
import {
  checkPromotionWindow,
  computePromotionStatus,
  PROMOTION_MAX_DAILY_KOBO,
  PROMOTION_MIN_DAILY_KOBO,
  type PromotionDisplayStatus,
} from "@/showcase/promotions/promotion-windows";
import { notifyEventCancelled } from "@/showcase/notifications/notify-fanout.server";
import { feeKobo, isPayoutStatus } from "@/showcase/finance/commission";
import { isWithdrawalStatus } from "@/showcase/rewards/reward-points";
import { nairaNumericToKobo } from "@/showcase/tickets/ticket-orders";
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
    if (data.cancelled) {
      // Genuine flip only (the guarded update above no-ops otherwise).
      const { data: cancelledEvent } = await db
        .from("events")
        .select("id,title")
        .eq("id", data.id)
        .maybeSingle();
      await notifyEventCancelled(db as unknown as SupabaseClient, {
        eventId: data.id,
        eventTitle: cancelledEvent?.title ?? "An event you were attending",
      });
    }
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

// ── Moderation reports (Phase 2C-1) ─────────────────────────────────────────
// Reads go through the service-role client (RLS denies direct report reads to
// everyone but the reporter's own rows); resolution goes through the
// resolve_event_report RPC on the caller's own client so the audit row carries
// the true staff actor and resolution + unpublish + audit stay atomic.

export interface AdminReportRow {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  eventId: string;
  eventTitle: string;
  eventPublished: boolean;
  reporterId: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
}

const reportListSchema = pageSchema.extend({
  offset: z.number().int().min(0).default(0),
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "pending", "dismissed", "actioned"]).default("pending"),
  reason: z.enum(REPORT_REASONS).optional(),
});

export const listAdminReports = createServerFn({ method: "GET" })
  .validator(reportListSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ reports: AdminReportRow[]; total: number }> => {
    const grant = await requirePermission(context, "reports.read");
    const db = asAdminDb(grant.supabase);
    const term = data.q ? sanitizeSearchTerm(data.q) : "";
    // Free-text search matches event titles first, then filters the queue to
    // those events. Capped at 200 ids; deeper matches need a narrower term.
    let eventIds: string[] | null = null;
    if (term) {
      const { data: matches, error: matchError } = await db
        .from("events")
        .select("id")
        .ilike("title", `%${term}%`)
        .limit(200);
      if (matchError) {
        console.error("[admin] listAdminReports event search failed:", matchError.message);
        throw new AdminBackendError("Could not load reports. Please try again.");
      }
      eventIds = (matches ?? []).map((match) => match.id);
      if (eventIds.length === 0) {
        return { reports: [], total: 0 };
      }
    }
    let query = db
      .from("event_reports")
      .select(
        "id, event_id, reporter_id, reason, details, status, created_at, resolved_at, resolved_by, resolution_note",
        { count: "exact" },
      );
    if (eventIds) query = query.in("event_id", eventIds);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.reason) query = query.eq("reason", data.reason);
    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) {
      console.error("[admin] listAdminReports failed:", error.message);
      throw new AdminBackendError("Could not load reports. Please try again.");
    }
    const list = rows ?? [];
    const reportEventIds = [...new Set(list.map((row) => row.event_id))];
    const personIds = [
      ...new Set(
        list.flatMap((row) => [row.reporter_id, row.resolved_by]).filter(Boolean) as string[],
      ),
    ];
    const [{ data: events }, { data: profiles }] = await Promise.all([
      reportEventIds.length > 0
        ? db.from("events").select("id, title, published").in("id", reportEventIds)
        : Promise.resolve({ data: [] as { id: string; title: string; published: boolean }[] }),
      personIds.length > 0
        ? db.from("profiles").select("id, name, email").in("id", personIds)
        : Promise.resolve({
            data: [] as { id: string; name: string | null; email: string | null }[],
          }),
    ]);
    const eventMap = new Map((events ?? []).map((event) => [event.id, event]));
    const people = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return {
      reports: list.map((row) => ({
        id: row.id,
        reason: row.reason as ReportReason,
        details: row.details,
        status: row.status as ReportStatus,
        createdAt: row.created_at,
        eventId: row.event_id,
        eventTitle: eventMap.get(row.event_id)?.title ?? "Unknown event",
        eventPublished: eventMap.get(row.event_id)?.published ?? false,
        reporterId: row.reporter_id,
        reporterName: row.reporter_id ? (people.get(row.reporter_id)?.name ?? null) : null,
        reporterEmail: row.reporter_id ? (people.get(row.reporter_id)?.email ?? null) : null,
        resolvedAt: row.resolved_at,
        resolvedByName: row.resolved_by ? (people.get(row.resolved_by)?.name ?? null) : null,
        resolutionNote: row.resolution_note,
      })),
      total: count ?? 0,
    };
  });

export interface AdminReportDetail {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  event: { id: string; title: string; published: boolean; status: string; startsAt: string } | null;
  reporter: { id: string | null; name: string | null; email: string | null };
  resolvedBy: { id: string; name: string | null } | null;
}

export const getAdminReport = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ report: AdminReportDetail }> => {
    const grant = await requirePermission(context, "reports.read");
    const db = asAdminDb(grant.supabase);
    const { data: row, error } = await db
      .from("event_reports")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      console.error("[admin] getAdminReport failed:", error.message);
      throw new AdminBackendError("Could not load the report. Please try again.");
    }
    if (!row) {
      throw new AdminBackendError("That report no longer exists.");
    }
    const [eventRes, reporterRes, resolverRes] = await Promise.all([
      db
        .from("events")
        .select("id, title, published, status, starts_at")
        .eq("id", row.event_id)
        .maybeSingle(),
      // Anonymous reports (reporter deleted, SET NULL) skip the profile lookup.
      row.reporter_id
        ? db.from("profiles").select("id, name, email").eq("id", row.reporter_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      row.resolved_by
        ? db.from("profiles").select("id, name").eq("id", row.resolved_by).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (eventRes.error || reporterRes.error || resolverRes.error) {
      console.error("[admin] getAdminReport related load failed");
      throw new AdminBackendError("Could not load the report. Please try again.");
    }
    return {
      report: {
        id: row.id,
        reason: row.reason as ReportReason,
        details: row.details,
        status: row.status as ReportStatus,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        resolutionNote: row.resolution_note,
        event: eventRes.data
          ? {
              id: eventRes.data.id,
              title: eventRes.data.title,
              published: eventRes.data.published,
              status: eventRes.data.status,
              startsAt: eventRes.data.starts_at,
            }
          : null,
        reporter: {
          id: row.reporter_id,
          name: reporterRes.data?.name ?? null,
          email: reporterRes.data?.email ?? null,
        },
        resolvedBy: resolverRes.data
          ? { id: resolverRes.data.id, name: resolverRes.data.name }
          : null,
      },
    };
  });

const resolveReportSchema = z.object({
  id: z.string().uuid(),
  resolution: z.enum(REPORT_RESOLUTIONS),
  unpublish: z.boolean().default(false),
  note: z.string().trim().max(REPORT_NOTE_MAX).optional(),
});

export const resolveAdminReport = createServerFn({ method: "POST" })
  .validator(resolveReportSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; status: ReportStatus }> => {
    const grant = await requirePermission(context, "reports.manage");
    const db = asAdminDb(grant.supabase);
    // Friendly pre-check so already-resolved reports explain themselves. The
    // RPC re-checks under a row lock, so a race between this read and the
    // write below still cannot double-resolve.
    const { data: current, error: readError } = await db
      .from("event_reports")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) {
      console.error("[admin] resolveAdminReport read failed:", readError.message);
      throw new AdminBackendError("Could not resolve the report. Please try again.");
    }
    if (!current) {
      throw new AdminBackendError("That report no longer exists.");
    }
    if (current.status !== "pending") {
      throw new AdminBackendError(
        "That report was already resolved. Refresh to see its current state.",
      );
    }
    await callResolveReportRpc(grant.userClient, {
      reportId: data.id,
      resolution: data.resolution,
      unpublish: data.unpublish,
      note: data.note?.trim() ? data.note.trim() : null,
    });
    return { ok: true, status: data.resolution };
  });

// ── Event promotions (Phase 2C-2) ───────────────────────────────────────────
// Reads go through the service-role client; scheduling and cancellation go
// through the promotion RPCs on the caller's own client so the audit rows
// carry the true staff actor and each mutation + audit stays atomic.

export interface AdminPromotionRow {
  id: string;
  eventId: string;
  eventTitle: string;
  eventPublished: boolean;
  startsAt: string;
  endsAt: string;
  displayStatus: PromotionDisplayStatus;
  createdAt: string;
  createdByName: string | null;
}

const promotionListSchema = pageSchema.extend({
  offset: z.number().int().min(0).default(0),
  status: z.enum(["all", "scheduled", "active", "expired", "cancelled"]).default("all"),
});

export const listAdminPromotions = createServerFn({ method: "GET" })
  .validator(promotionListSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ promotions: AdminPromotionRow[]; total: number }> => {
    const grant = await requirePermission(context, "promotions.read");
    const db = asAdminDb(grant.supabase);
    // Status filters compare against the app server clock. A few seconds of
    // skew versus database time is immaterial for admin display: windows span
    // hours or days, and the public boundary always uses database time.
    const nowIso = new Date().toISOString();
    let query = db
      .from("event_promotions")
      .select("id, event_id, starts_at, ends_at, status, created_at, created_by", { count: "exact" });
    if (data.status === "cancelled") {
      query = query.eq("status", "cancelled");
    } else if (data.status !== "all") {
      query = query.eq("status", "active");
      if (data.status === "scheduled") query = query.gt("starts_at", nowIso);
      if (data.status === "active") query = query.lte("starts_at", nowIso).gt("ends_at", nowIso);
      if (data.status === "expired") query = query.lte("ends_at", nowIso);
    }
    const { data: rows, error, count } = await query
      .order("starts_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) {
      console.error("[admin] listAdminPromotions failed:", error.message);
      throw new AdminBackendError("Could not load promotions. Please try again.");
    }
    const list = rows ?? [];
    const eventIds = [...new Set(list.map((row) => row.event_id))];
    const creatorIds = [...new Set(list.map((row) => row.created_by).filter(Boolean) as string[])];
    const [{ data: events }, { data: profiles }] = await Promise.all([
      eventIds.length > 0
        ? db.from("events").select("id, title, published").in("id", eventIds)
        : Promise.resolve({ data: [] as { id: string; title: string; published: boolean }[] }),
      creatorIds.length > 0
        ? db.from("profiles").select("id, name").in("id", creatorIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    ]);
    const eventMap = new Map((events ?? []).map((event) => [event.id, event]));
    const people = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return {
      promotions: list.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        eventTitle: eventMap.get(row.event_id)?.title ?? "Unknown event",
        eventPublished: eventMap.get(row.event_id)?.published ?? false,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        displayStatus: computePromotionStatus(
          { status: row.status, starts_at: row.starts_at, ends_at: row.ends_at },
          nowIso,
        ),
        createdAt: row.created_at,
        createdByName: row.created_by ? (people.get(row.created_by)?.name ?? null) : null,
      })),
      total: count ?? 0,
    };
  });

const createPromotionSchema = z.object({
  eventId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

export const createAdminPromotion = createServerFn({ method: "POST" })
  .validator(createPromotionSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; id: string }> => {
    const grant = await requirePermission(context, "promotions.manage");
    const windowError = checkPromotionWindow(data.startsAt, data.endsAt);
    if (windowError) {
      throw new AdminBackendError(windowError);
    }
    // Friendly pre-checks so common mistakes explain themselves. The RPC
    // re-validates everything, so a race between these reads and the write
    // below still cannot schedule an invalid or overlapping window.
    const db = asAdminDb(grant.supabase);
    const { data: event, error: eventError } = await db
      .from("events")
      .select("id, published, status")
      .eq("id", data.eventId)
      .maybeSingle();
    if (eventError) {
      console.error("[admin] createAdminPromotion event read failed:", eventError.message);
      throw new AdminBackendError("Could not save the promotion. Please try again.");
    }
    if (!event) {
      throw new AdminBackendError("That event no longer exists.");
    }
    if (!event.published || (event.status ?? "") === "cancelled") {
      throw new AdminBackendError("Only published, non-cancelled events can be promoted.");
    }
    const id = await callCreatePromotionRpc(grant.userClient, {
      eventId: data.eventId,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
    });
    return { ok: true, id };
  });

export const cancelAdminPromotion = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "promotions.manage");
    const db = asAdminDb(grant.supabase);
    const { data: current, error: readError } = await db
      .from("event_promotions")
      .select("id, status, ends_at")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) {
      console.error("[admin] cancelAdminPromotion read failed:", readError.message);
      throw new AdminBackendError("Could not cancel the promotion. Please try again.");
    }
    if (!current) {
      throw new AdminBackendError("That promotion no longer exists.");
    }
    if (current.status === "cancelled") {
      throw new AdminBackendError(
        "That promotion was already cancelled. Refresh to see its current state.",
      );
    }
    if (new Date(current.ends_at).getTime() <= Date.now()) {
      throw new AdminBackendError("That promotion already ended.");
    }
    await callCancelPromotionRpc(grant.userClient, data.id);
    return { ok: true };
  });

// ── Promotion pricing + paid orders ──────────────────────────────────────────
// Reads go through the service-role client after the promotions.read check;
// the price write goes through set_promotion_price() on the caller's own
// client so the RPC's internal super/finance gate sees the true actor and the
// pricing row + audit entry stay in one database transaction.

export interface AdminPricingRow {
  id: string;
  dailyKobo: number;
  currency: string;
  effectiveAt: string;
  createdAt: string;
  createdByName: string | null;
}

function toPricingRow(
  row: {
    id: string;
    daily_amount_kobo: number;
    currency: string;
    effective_at: string;
    created_by: string | null;
    created_at: string;
  },
  names: Map<string, string | null>,
): AdminPricingRow {
  return {
    id: row.id,
    dailyKobo: row.daily_amount_kobo,
    currency: row.currency,
    effectiveAt: row.effective_at,
    createdAt: row.created_at,
    createdByName: row.created_by ? (names.get(row.created_by) ?? null) : null,
  };
}

export const getPromotionPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ current: AdminPricingRow | null; history: AdminPricingRow[] }> => {
    const grant = await requirePermission(context, "promotions.read");
    const db = asAdminDb(grant.supabase);
    const { data: rows, error } = await db
      .from("promotion_pricing")
      .select("id, daily_amount_kobo, currency, effective_at, created_by, created_at")
      .order("effective_at", { ascending: false })
      .limit(6);
    if (error) {
      console.error("[admin] getPromotionPricing failed:", error.message);
      throw new AdminBackendError("Could not load promotion pricing. Please try again.");
    }
    const list = rows ?? [];
    const creatorIds = [...new Set(list.map((row) => row.created_by).filter(Boolean))] as string[];
    const { data: profiles } =
      creatorIds.length > 0
        ? await db.from("profiles").select("id, name").in("id", creatorIds)
        : { data: [] as { id: string; name: string | null }[] };
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
    const mapped = list.map((row) => toPricingRow(row, names));
    return { current: mapped[0] ?? null, history: mapped.slice(1) };
  });

const setPriceSchema = z.object({
  dailyKobo: z.number().int().min(PROMOTION_MIN_DAILY_KOBO).max(PROMOTION_MAX_DAILY_KOBO),
});

export const setPromotionPrice = createServerFn({ method: "POST" })
  .validator(setPriceSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; priceId: string }> => {
    const grant = await requirePermission(context, "promotions.pricing");
    const priceId = await callSetPromotionPriceRpc(grant.userClient, data.dailyKobo);
    return { ok: true, priceId };
  });

export interface AdminPromotionOrderRow {
  id: string;
  eventId: string;
  eventTitle: string;
  days: number;
  dailyKobo: number;
  totalKobo: number;
  currency: string;
  status: string;
  providerReference: string;
  paidAt: string | null;
  createdAt: string;
}

const promotionOrderListSchema = pageSchema.extend({
  offset: z.number().int().min(0).default(0),
});

export const listPromotionOrders = createServerFn({ method: "GET" })
  .validator(promotionOrderListSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{
    orders: AdminPromotionOrderRow[];
    total: number;
    paidTotalKobo: number;
    paidCount: number;
  }> => {
    const grant = await requirePermission(context, "promotions.read");
    const db = asAdminDb(grant.supabase);
    const { data: rows, error, count } = await db
      .from("promotion_orders")
      .select(
        "id, event_id, days, daily_amount_kobo, total_amount_kobo, currency, status, provider_reference, paid_at, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) {
      console.error("[admin] listPromotionOrders failed:", error.message);
      throw new AdminBackendError("Could not load promotion orders. Please try again.");
    }
    const list = rows ?? [];
    const eventIds = [...new Set(list.map((row) => row.event_id))];
    const { data: events } =
      eventIds.length > 0
        ? await db.from("events").select("id, title").in("id", eventIds)
        : { data: [] as { id: string; title: string }[] };
    const titles = new Map((events ?? []).map((event) => [event.id, event.title]));
    // Revenue is a simple sum over paid orders. Honest at this scale; if paid
    // volume ever outgrows one page, this needs a database-side aggregate.
    const { data: paidRows, error: paidError, count: paidCount } = await db
      .from("promotion_orders")
      .select("total_amount_kobo", { count: "exact" })
      .eq("status", "paid")
      .limit(10000);
    if (paidError) {
      console.error("[admin] listPromotionOrders revenue failed:", paidError.message);
      throw new AdminBackendError("Could not load promotion revenue. Please try again.");
    }
    const paidTotalKobo = (paidRows ?? []).reduce((sum, row) => sum + row.total_amount_kobo, 0);
    return {
      orders: list.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        eventTitle: titles.get(row.event_id) ?? "Unknown event",
        days: row.days,
        dailyKobo: row.daily_amount_kobo,
        totalKobo: row.total_amount_kobo,
        currency: row.currency,
        status: row.status,
        providerReference: row.provider_reference,
        paidAt: row.paid_at,
        createdAt: row.created_at,
      })),
      total: count ?? 0,
      paidTotalKobo,
      paidCount: paidCount ?? 0,
    };
  });

// ── Ticket finance (P5) ───────────────────────────────────────────────────
// Read-only money visibility plus audited manual-payout records. Fees always
// derive from each event's LOCKED commission_pct — never from the live
// default — so the numbers below cannot drift when the default changes.

export interface AdminCommissionRow {
  id: string;
  ratePct: number;
  effectiveAt: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

function toNumber(value: number | string | null, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const getCommissionDefault = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ current: AdminCommissionRow | null; history: AdminCommissionRow[] }> => {
    const grant = await requirePermission(context, "finance.read");
    const db = asAdminDb(grant.supabase);
    const { data: rows, error } = await db
      .from("commission_rates")
      .select("id, rate_pct, effective_at, created_by, created_at")
      .order("effective_at", { ascending: false })
      .limit(6);
    if (error) {
      console.error("[admin] getCommissionDefault failed:", error.message);
      throw new AdminBackendError("Could not load the commission default. Please try again.");
    }
    const list = rows ?? [];
    const creatorIds = [...new Set(list.map((row) => row.created_by).filter(Boolean))] as string[];
    const { data: profiles } =
      creatorIds.length > 0
        ? await db.from("profiles").select("id, name").in("id", creatorIds)
        : { data: [] as { id: string; name: string | null }[] };
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
    const mapped = list.map((row) => ({
      id: row.id,
      ratePct: toNumber(row.rate_pct, 0),
      effectiveAt: row.effective_at,
      createdBy: row.created_by,
      createdByName: row.created_by ? (names.get(row.created_by) ?? null) : null,
      createdAt: row.created_at,
    }));
    return { current: mapped[0] ?? null, history: mapped.slice(1) };
  });

const setCommissionSchema = z.object({
  ratePct: z.number().min(0).max(100),
});

export const setCommissionDefault = createServerFn({ method: "POST" })
  .validator(setCommissionSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; rateId: string }> => {
    const grant = await requirePermission(context, "finance.commission");
    const rateId = await callSetCommissionDefaultRpc(grant.userClient, data.ratePct);
    return { ok: true, rateId };
  });

export interface AdminTicketTransactionRow {
  id: string;
  reference: string;
  eventId: string;
  eventTitle: string;
  buyerId: string;
  buyerName: string | null;
  buyerEmail: string | null;
  totalKobo: number;
  feeKobo: number;
  netKobo: number;
  ratePct: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

const transactionListSchema = pageSchema.extend({
  offset: z.number().int().min(0).default(0),
  status: z.enum(["all", "paid", "pending", "failed", "expired"]).default("all"),
});

export const listTicketTransactions = createServerFn({ method: "GET" })
  .validator(transactionListSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{
    orders: AdminTicketTransactionRow[];
    total: number;
    paidCount: number;
    paidGrossKobo: number;
    paidFeeKobo: number;
    paidNetKobo: number;
  }> => {
    const grant = await requirePermission(context, "finance.read");
    const db = asAdminDb(grant.supabase);
    let query = db
      .from("ticket_orders")
      .select(
        "id, reference, event_id, user_id, status, total_amount, paid_at, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    if (data.status !== "all") {
      query = query.eq("status", data.status);
    }
    const { data: rows, error, count } = await query.range(
      data.offset,
      data.offset + data.limit - 1,
    );
    if (error) {
      console.error("[admin] listTicketTransactions failed:", error.message);
      throw new AdminBackendError("Could not load transactions. Please try again.");
    }
    const list = rows ?? [];
    const eventIds = [...new Set(list.map((row) => row.event_id))];
    const buyerIds = [...new Set(list.map((row) => row.user_id))];
    const [{ data: events }, { data: buyers }] = await Promise.all([
      eventIds.length > 0
        ? await db.from("events").select("id, title, commission_pct").in("id", eventIds)
        : { data: [] as { id: string; title: string; commission_pct: number | string | null }[] },
      buyerIds.length > 0
        ? await db.from("profiles").select("id, name, email").in("id", buyerIds)
        : { data: [] as { id: string; name: string | null; email: string | null }[] },
    ]);
    const eventById = new Map((events ?? []).map((event) => [event.id, event]));
    const buyerById = new Map((buyers ?? []).map((buyer) => [buyer.id, buyer]));
    // Platform-wide paid totals. Honest at this scale (one bounded scan);
    // needs database-side aggregates if paid volume ever outgrows it.
    const { data: paidRows, error: paidError, count: paidCount } = await db
      .from("ticket_orders")
      .select("event_id, total_amount", { count: "exact" })
      .eq("status", "paid")
      .limit(10000);
    if (paidError) {
      console.error("[admin] listTicketTransactions totals failed:", paidError.message);
      throw new AdminBackendError("Could not load finance totals. Please try again.");
    }
    const paidEventIds = [...new Set((paidRows ?? []).map((row) => row.event_id))];
    const { data: paidEvents } =
      paidEventIds.length > 0
        ? await db.from("events").select("id, commission_pct").in("id", paidEventIds)
        : { data: [] as { id: string; commission_pct: number | string | null }[] };
    const rateByEvent = new Map(
      (paidEvents ?? []).map((event) => [event.id, toNumber(event.commission_pct, 10)]),
    );
    let paidGrossKobo = 0;
    let paidFeeKobo = 0;
    for (const row of paidRows ?? []) {
      const gross = nairaNumericToKobo(row.total_amount);
      paidGrossKobo += gross;
      paidFeeKobo += feeKobo(gross, rateByEvent.get(row.event_id) ?? 10);
    }
    return {
      orders: list.map((row) => {
        const event = eventById.get(row.event_id);
        const buyer = buyerById.get(row.user_id);
        const total = nairaNumericToKobo(row.total_amount);
        const rate = toNumber(event?.commission_pct ?? null, 10);
        const fee = row.status === "paid" ? feeKobo(total, rate) : 0;
        return {
          id: row.id,
          reference: row.reference,
          eventId: row.event_id,
          eventTitle: event?.title ?? "Unknown event",
          buyerId: row.user_id,
          buyerName: buyer?.name ?? null,
          buyerEmail: buyer?.email ?? null,
          totalKobo: total,
          feeKobo: fee,
          netKobo: row.status === "paid" ? total - fee : 0,
          ratePct: rate,
          status: row.status,
          paidAt: row.paid_at,
          createdAt: row.created_at,
        };
      }),
      total: count ?? 0,
      paidCount: paidCount ?? 0,
      paidGrossKobo,
      paidFeeKobo,
      paidNetKobo: paidGrossKobo - paidFeeKobo,
    };
  });

export interface AdminPayoutRow {
  id: string;
  organizerId: string;
  organizerName: string | null;
  amountKobo: number;
  currency: string;
  status: string;
  statusReason: string | null;
  reference: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
}

const payoutListSchema = pageSchema.extend({
  offset: z.number().int().min(0).default(0),
  status: z.string().optional(),
});

export const listPayouts = createServerFn({ method: "GET" })
  .validator(payoutListSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ payouts: AdminPayoutRow[]; total: number }> => {
    const grant = await requirePermission(context, "finance.read");
    const db = asAdminDb(grant.supabase);
    let query = db
      .from("organizer_payouts")
      .select(
        "id, organizer_id, amount_kobo, currency, status, status_reason, reference, admin_note, created_at, updated_at, paid_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    if (data.status && isPayoutStatus(data.status)) {
      query = query.eq("status", data.status);
    }
    const { data: rows, error, count } = await query.range(
      data.offset,
      data.offset + data.limit - 1,
    );
    if (error) {
      console.error("[admin] listPayouts failed:", error.message);
      throw new AdminBackendError("Could not load payouts. Please try again.");
    }
    const list = rows ?? [];
    const organizerIds = [...new Set(list.map((row) => row.organizer_id))];
    const { data: profiles } =
      organizerIds.length > 0
        ? await db.from("profiles").select("id, name").in("id", organizerIds)
        : { data: [] as { id: string; name: string | null }[] };
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
    return {
      payouts: list.map((row) => ({
        id: row.id,
        organizerId: row.organizer_id,
        organizerName: names.get(row.organizer_id) ?? null,
        amountKobo: row.amount_kobo,
        currency: row.currency,
        status: row.status,
        statusReason: row.status_reason,
        reference: row.reference,
        adminNote: row.admin_note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paidAt: row.paid_at,
      })),
      total: count ?? 0,
    };
  });

export const getOrganizerBalance = createServerFn({ method: "GET" })
  .validator(z.object({ organizerId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{
    organizerName: string | null;
    netKobo: number;
    reservedKobo: number;
    availableKobo: number;
  }> => {
    const grant = await requirePermission(context, "finance.read");
    const db = asAdminDb(grant.supabase);
    const { data: profile } = await db
      .from("profiles")
      .select("id, name")
      .eq("id", data.organizerId)
      .maybeSingle();
    const { data: ownEvents } = await db
      .from("events")
      .select("id, commission_pct")
      .eq("created_by", data.organizerId)
      .limit(5000);
    const rateByEvent = new Map(
      (ownEvents ?? []).map((event) => [event.id, toNumber(event.commission_pct, 10)]),
    );
    const eventIds = [...rateByEvent.keys()];
    const { data: paidOrders, error: ordersError } =
      eventIds.length > 0
        ? await db
            .from("ticket_orders")
            .select("event_id, total_amount")
            .in("event_id", eventIds)
            .eq("status", "paid")
            .limit(10000)
        : { data: [] as { event_id: string; total_amount: number }[], error: null };
    if (ordersError) {
      console.error("[admin] getOrganizerBalance orders failed:", ordersError.message);
      throw new AdminBackendError("Could not load the balance. Please try again.");
    }
    let netKobo = 0;
    for (const row of paidOrders ?? []) {
      const gross = nairaNumericToKobo(row.total_amount);
      netKobo += gross - feeKobo(gross, rateByEvent.get(row.event_id) ?? 10);
    }
    const { data: payouts, error: payoutsError } = await db
      .from("organizer_payouts")
      .select("amount_kobo, status")
      .eq("organizer_id", data.organizerId)
      .neq("status", "failed")
      .limit(5000);
    if (payoutsError) {
      console.error("[admin] getOrganizerBalance payouts failed:", payoutsError.message);
      throw new AdminBackendError("Could not load the balance. Please try again.");
    }
    const reservedKobo = (payouts ?? []).reduce((sum, row) => sum + row.amount_kobo, 0);
    return {
      organizerName: profile?.name ?? null,
      netKobo,
      reservedKobo,
      availableKobo: Math.max(0, netKobo - reservedKobo),
    };
  });

export const listOrganizerBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    organizers: {
      organizerId: string;
      organizerName: string | null;
      netKobo: number;
      reservedKobo: number;
      availableKobo: number;
    }[];
  }> => {
    const grant = await requirePermission(context, "finance.read");
    const db = asAdminDb(grant.supabase);
    // One bounded scan over paid orders; needs database-side aggregates if
    // paid volume ever outgrows it.
    const { data: paidOrders, error: ordersError } = await db
      .from("ticket_orders")
      .select("event_id, total_amount")
      .eq("status", "paid")
      .limit(10000);
    if (ordersError) {
      console.error("[admin] listOrganizerBalances orders failed:", ordersError.message);
      throw new AdminBackendError("Could not load organizer balances. Please try again.");
    }
    const eventIds = [...new Set((paidOrders ?? []).map((row) => row.event_id))];
    const { data: events } =
      eventIds.length > 0
        ? await db.from("events").select("id, created_by, commission_pct").in("id", eventIds)
        : {
            data: [] as {
              id: string;
              created_by: string;
              commission_pct: number | string | null;
            }[],
          };
    const eventById = new Map((events ?? []).map((event) => [event.id, event]));
    const netByOrganizer = new Map<string, number>();
    for (const row of paidOrders ?? []) {
      const event = eventById.get(row.event_id);
      if (!event?.created_by) continue;
      const gross = nairaNumericToKobo(row.total_amount);
      const net = gross - feeKobo(gross, toNumber(event.commission_pct, 10));
      netByOrganizer.set(event.created_by, (netByOrganizer.get(event.created_by) ?? 0) + net);
    }
    const organizerIds = [...netByOrganizer.keys()];
    const [{ data: profiles }, { data: payouts }] = await Promise.all([
      organizerIds.length > 0
        ? await db.from("profiles").select("id, name").in("id", organizerIds)
        : { data: [] as { id: string; name: string | null }[] },
      organizerIds.length > 0
        ? await db
            .from("organizer_payouts")
            .select("organizer_id, amount_kobo")
            .in("organizer_id", organizerIds)
            .neq("status", "failed")
            .limit(5000)
        : { data: [] as { organizer_id: string; amount_kobo: number }[] },
    ]);
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
    const reservedByOrganizer = new Map<string, number>();
    for (const row of payouts ?? []) {
      reservedByOrganizer.set(
        row.organizer_id,
        (reservedByOrganizer.get(row.organizer_id) ?? 0) + row.amount_kobo,
      );
    }
    const organizers = organizerIds.map((organizerId) => {
      const netKobo = netByOrganizer.get(organizerId) ?? 0;
      const reservedKobo = reservedByOrganizer.get(organizerId) ?? 0;
      return {
        organizerId,
        organizerName: names.get(organizerId) ?? null,
        netKobo,
        reservedKobo,
        availableKobo: Math.max(0, netKobo - reservedKobo),
      };
    });
    organizers.sort((a, b) => b.availableKobo - a.availableKobo);
    return { organizers };
  });

const createPayoutSchema = z.object({
  organizerId: z.string().uuid(),
  amountKobo: z.number().int().min(1),
  adminNote: z.string().trim().max(500).optional(),
});

export const createPayout = createServerFn({ method: "POST" })
  .validator(createPayoutSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; payoutId: string }> => {
    const grant = await requirePermission(context, "finance.payouts");
    const payoutId = await callCreatePayoutRpc(
      grant.userClient,
      data.organizerId,
      data.amountKobo,
      data.adminNote?.trim() ? data.adminNote.trim() : null,
    );
    return { ok: true, payoutId };
  });

const transitionPayoutSchema = z.object({
  payoutId: z.string().uuid(),
  toStatus: z.string(),
  reference: z.string().trim().max(120).optional(),
  adminNote: z.string().trim().max(500).optional(),
});

export const transitionPayout = createServerFn({ method: "POST" })
  .validator(transitionPayoutSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "finance.payouts");
    if (!isPayoutStatus(data.toStatus)) {
      throw new AdminBackendError("That payout status is not valid.");
    }
    await callTransitionPayoutRpc(
      grant.userClient,
      data.payoutId,
      data.toStatus,
      data.reference?.trim() ? data.reference.trim() : null,
      data.adminNote?.trim() ? data.adminNote.trim() : null,
    );
    return { ok: true };
  });

// ── Points rewards (Points V1) ──────────────────────────────────────────────
// Manual-withdrawal staff tooling. Reads are permission-gated; every write
// goes through a gated RPC that re-checks the caller's admin role, locks
// the rows it touches, and writes the ledger + audit trail atomically.
// Full bank account numbers leave the server only through
// getWithdrawalDetail, which requires rewards.manage.

export interface RewardsOverview {
  totalIssuedPoints: number;
  totalOutstandingPoints: number;
  totalRedeemedPoints: number;
  pendingNairaKobo: number;
  pendingCount: number;
  completedCount: number;
  rejectedCount: number;
}

export const getRewardsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RewardsOverview> => {
    const grant = await requirePermission(context, "rewards.read");
    const db = asAdminDb(grant.supabase);
    // Bounded scans with honest scale notes; needs database-side aggregates
    // if the wallet population ever outgrows them.
    const [{ data: wallets, error: walletsError }, { data: requests, error: requestsError }] =
      await Promise.all([
        db.from("points_wallets").select("balance_points, lifetime_earned_points").limit(10000),
        db.from("withdrawal_requests").select("points, naira_amount_kobo, status").limit(10000),
      ]);
    if (walletsError) {
      console.error("[admin] rewards overview wallets failed:", walletsError.message);
      throw new AdminBackendError("Could not load the rewards overview. Please try again.");
    }
    if (requestsError) {
      console.error("[admin] rewards overview requests failed:", requestsError.message);
      throw new AdminBackendError("Could not load the rewards overview. Please try again.");
    }
    let totalIssuedPoints = 0;
    let totalOutstandingPoints = 0;
    for (const row of wallets ?? []) {
      totalIssuedPoints += row.lifetime_earned_points;
      totalOutstandingPoints += row.balance_points;
    }
    let totalRedeemedPoints = 0;
    let pendingNairaKobo = 0;
    let pendingCount = 0;
    let completedCount = 0;
    let rejectedCount = 0;
    for (const row of requests ?? []) {
      if (row.status === "paid") {
        totalRedeemedPoints += row.points;
        completedCount += 1;
      } else if (row.status === "pending" || row.status === "processing") {
        pendingNairaKobo += row.naira_amount_kobo;
        pendingCount += 1;
      } else if (row.status === "rejected") {
        rejectedCount += 1;
      }
    }
    return {
      totalIssuedPoints,
      totalOutstandingPoints,
      totalRedeemedPoints,
      pendingNairaKobo,
      pendingCount,
      completedCount,
      rejectedCount,
    };
  });

export interface AdminWithdrawalRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  points: number;
  nairaAmountKobo: number;
  bankName: string;
  accountName: string;
  accountLast4: string;
  status: string;
  paidReference: string | null;
  createdAt: string;
}

const withdrawalListSchema = pageSchema.extend({
  offset: z.number().int().min(0).default(0),
  status: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
});

export const listWithdrawals = createServerFn({ method: "GET" })
  .validator(withdrawalListSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ withdrawals: AdminWithdrawalRow[]; total: number }> => {
    const grant = await requirePermission(context, "rewards.read");
    const db = asAdminDb(grant.supabase);
    let userIds: string[] | null = null;
    const term = data.search?.trim() ?? "";
    if (term) {
      const { data: profiles, error: searchError } = await db
        .from("profiles")
        .select("id")
        .or(`name.ilike.%${term}%,email.ilike.%${term}%,id.eq.${term}`)
        .limit(200);
      if (searchError) {
        console.error("[admin] withdrawal search failed:", searchError.message);
        throw new AdminBackendError("Could not search withdrawals. Please try again.");
      }
      userIds = (profiles ?? []).map((profile) => profile.id);
      if (userIds.length === 0) return { withdrawals: [], total: 0 };
    }
    let query = db
      .from("withdrawal_requests")
      .select(
        "id, user_id, points, naira_amount_kobo, bank_name, account_name, account_last4, status, paid_reference, created_at",
        { count: "exact" },
      );
    if (userIds) query = query.in("user_id", userIds);
    if (data.status && isWithdrawalStatus(data.status)) query = query.eq("status", data.status);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", data.to);
    if (data.sort === "amount_desc") query = query.order("naira_amount_kobo", { ascending: false });
    else if (data.sort === "amount_asc") query = query.order("naira_amount_kobo", { ascending: true });
    else if (data.sort === "date_asc") query = query.order("created_at", { ascending: true });
    else query = query.order("created_at", { ascending: false });
    const { data: rows, error, count } = await query.range(data.offset, data.offset + data.limit - 1);
    if (error) {
      console.error("[admin] listWithdrawals failed:", error.message);
      throw new AdminBackendError("Could not load withdrawals. Please try again.");
    }
    const list = rows ?? [];
    const ids = [...new Set(list.map((row) => row.user_id))];
    const { data: profiles } =
      ids.length > 0
        ? await db.from("profiles").select("id, name, email").in("id", ids)
        : { data: [] as { id: string; name: string | null; email: string | null }[] };
    const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return {
      withdrawals: list.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: byId.get(row.user_id)?.name ?? null,
        userEmail: byId.get(row.user_id)?.email ?? null,
        points: row.points,
        nairaAmountKobo: row.naira_amount_kobo,
        bankName: row.bank_name,
        accountName: row.account_name,
        accountLast4: row.account_last4,
        status: row.status,
        paidReference: row.paid_reference,
        createdAt: row.created_at,
      })),
      total: count ?? 0,
    };
  });

export interface AdminWithdrawalDetail extends AdminWithdrawalRow {
  nairaPerPoint: number;
  statusReason: string | null;
  accountNumber: string;
  bankVerified: boolean;
  paidAmountKobo: number | null;
  paidByName: string | null;
  paidAt: string | null;
  updatedAt: string;
  ledger: { id: string; type: string; points: number; balanceAfter: number; description: string; createdAt: string }[];
}

export const getWithdrawalDetail = createServerFn({ method: "GET" })
  .validator(z.object({ requestId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AdminWithdrawalDetail> => {
    const grant = await requirePermission(context, "rewards.manage");
    const db = asAdminDb(grant.supabase);
    const { data: row, error } = await db
      .from("withdrawal_requests")
      .select("id, user_id, points, naira_per_point, naira_amount_kobo, bank_name, account_name, account_number, account_last4, status, status_reason, paid_amount_kobo, paid_reference, paid_by, paid_at, created_at, updated_at")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error) {
      console.error("[admin] withdrawal detail failed:", error.message);
      throw new AdminBackendError("Could not load the withdrawal. Please try again.");
    }
    if (!row) throw new AdminBackendError("Withdrawal request not found.");
    const [{ data: user }, { data: bank }, { data: ledger }, { data: payer }] = await Promise.all([
      db.from("profiles").select("id, name, email").eq("id", row.user_id).maybeSingle(),
      db.from("user_bank_details").select("verified").eq("user_id", row.user_id).maybeSingle(),
      db.from("points_ledger").select("id, type, points, balance_after, description, created_at").eq("ref_id", row.id).order("created_at", { ascending: true }).limit(20),
      row.paid_by ? db.from("profiles").select("id, name").eq("id", row.paid_by).maybeSingle() : Promise.resolve({ data: null as { id: string; name: string | null } | null }),
    ]);
    const rate = typeof row.naira_per_point === "number" ? row.naira_per_point : Number(row.naira_per_point);
    return {
      id: row.id,
      userId: row.user_id,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      points: row.points,
      nairaPerPoint: Number.isFinite(rate) ? rate : 0,
      nairaAmountKobo: row.naira_amount_kobo,
      bankName: row.bank_name,
      accountName: row.account_name,
      accountNumber: row.account_number,
      accountLast4: row.account_last4,
      bankVerified: bank?.verified ?? false,
      status: row.status,
      statusReason: row.status_reason,
      paidAmountKobo: row.paid_amount_kobo,
      paidReference: row.paid_reference,
      paidByName: payer?.name ?? null,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ledger: (ledger ?? []).map((entry) => ({
        id: entry.id,
        type: entry.type,
        points: entry.points,
        balanceAfter: entry.balance_after,
        description: entry.description,
        createdAt: entry.created_at,
      })),
    };
  });

const adminTransitionWithdrawalSchema = z.object({
  requestId: z.string().uuid(),
  toStatus: z.string(),
  reason: z.string().trim().max(500).optional(),
  reference: z.string().trim().max(120).optional(),
  paidAmountNaira: z.number().min(0).optional(),
});

export const adminTransitionWithdrawal = createServerFn({ method: "POST" })
  .validator(adminTransitionWithdrawalSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "rewards.manage");
    if (!isWithdrawalStatus(data.toStatus)) {
      throw new AdminBackendError("That withdrawal status is not valid.");
    }
    let paidAmountKobo: number | null = null;
    if (data.toStatus === "paid") {
      if (data.paidAmountNaira === undefined) {
        throw new AdminBackendError("Enter the amount actually paid.");
      }
      // Defense in depth: the server re-reads the approved snapshot and
      // compares before the RPC enforces the same match inside the lock.
      const db = asAdminDb(grant.supabase);
      const { data: row, error } = await db
        .from("withdrawal_requests")
        .select("naira_amount_kobo")
        .eq("id", data.requestId)
        .maybeSingle();
      if (error || !row) {
        throw new AdminBackendError("Withdrawal request not found.");
      }
      paidAmountKobo = Math.round(data.paidAmountNaira * 100);
      if (paidAmountKobo !== row.naira_amount_kobo) {
        throw new AdminBackendError("The recorded amount must match the approved withdrawal amount.");
      }
    }
    await callTransitionWithdrawalRpc(
      grant.userClient,
      data.requestId,
      data.toStatus,
      data.reason?.trim() ? data.reason.trim() : null,
      data.reference?.trim() ? data.reference.trim() : null,
      paidAmountKobo,
    );
    return { ok: true };
  });

export interface RewardSettingRow {
  key: string;
  value: number | boolean | null;
  updatedByName: string | null;
  updatedAt: string;
}

export const listRewardSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ settings: RewardSettingRow[] }> => {
    const grant = await requirePermission(context, "rewards.read");
    const db = asAdminDb(grant.supabase);
    const { data: rows, error } = await db.from("reward_settings").select("key, value, updated_by, updated_at");
    if (error) {
      console.error("[admin] reward settings failed:", error.message);
      throw new AdminBackendError("Could not load rewards settings. Please try again.");
    }
    const ids = [...new Set((rows ?? []).map((row) => row.updated_by).filter(Boolean))] as string[];
    const { data: profiles } =
      ids.length > 0
        ? await db.from("profiles").select("id, name").in("id", ids)
        : { data: [] as { id: string; name: string | null }[] };
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
    return {
      settings: (rows ?? []).map((row) => ({
        key: row.key,
        value: (typeof row.value === "number" || typeof row.value === "boolean" ? row.value : null) as number | boolean | null,
        updatedByName: row.updated_by ? (names.get(row.updated_by) ?? null) : null,
        updatedAt: row.updated_at,
      })),
    };
  });

const setRewardSettingSchema = z.object({
  key: z.enum(["naira_per_point", "min_withdrawal_naira", "max_withdrawal_naira", "rewards_enabled", "withdrawals_enabled", "daily_limit_naira", "monthly_limit_naira"]),
  value: z.union([z.number(), z.boolean(), z.null()]),
});

export const setRewardSetting = createServerFn({ method: "POST" })
  .validator(setRewardSettingSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "rewards.manage");
    await callSetRewardSettingRpc(grant.userClient, data.key, data.value);
    return { ok: true };
  });

const creditPointsSchema = z.object({
  userId: z.string().uuid(),
  points: z.number().int().refine((n) => n !== 0, "Credit amount must not be zero."),
  type: z.enum(["bonus", "adjust", "earn"]),
  description: z.string().trim().min(3).max(200),
});

export const creditUserPoints = createServerFn({ method: "POST" })
  .validator(creditPointsSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; entryId: string }> => {
    const grant = await requirePermission(context, "rewards.manage");
    const entryId = await callCreditPointsRpc(
      grant.userClient,
      data.userId,
      data.points,
      data.type,
      data.description,
    );
    return { ok: true, entryId };
  });

export const listUserLedger = createServerFn({ method: "GET" })
  .validator(z.object({ userId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(30) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{
    entries: { id: string; type: string; points: number; balanceAfter: number; description: string; createdAt: string }[];
  }> => {
    const grant = await requirePermission(context, "rewards.read");
    const db = asAdminDb(grant.supabase);
    const { data: rows, error } = await db
      .from("points_ledger")
      .select("id, type, points, balance_after, description, created_at")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) {
      console.error("[admin] user ledger failed:", error.message);
      throw new AdminBackendError("Could not load the ledger. Please try again.");
    }
    return {
      entries: (rows ?? []).map((row) => ({
        id: row.id,
        type: row.type,
        points: row.points,
        balanceAfter: row.balance_after,
        description: row.description,
        createdAt: row.created_at,
      })),
    };
  });

export type { AdminPermission };
