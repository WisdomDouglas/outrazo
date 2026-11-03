// SERVER ONLY. Never import this module (or client.server) from UI code; the
// ESLint boundary in eslint.config.js rejects such imports.
//
// Every protected admin server function calls requirePermission() first. It
// verifies the caller through the existing requireSupabaseAuth context, reads
// the caller's own role via the SECURITY DEFINER my_admin_role() RPC (which
// reveals nothing about other users), and throws unless the role carries the
// required permission. Only after that check passes do we hand out the
// service-role client for least-privilege reads.
//
// Role changes go through the grant/revoke RPCs on the CALLER's own user
// client so auth.uid() attributes the audit row to the true actor and the
// grant + audit insert stay in one database transaction.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  friendlyPromotionError,
  PROMOTION_UNKNOWN_ERROR,
} from "@/showcase/promotions/promotion-windows";
import {
  isAdminRole,
  roleHasPermission,
  type AdminPermission,
  type AdminRole,
} from "./permissions";

export class AdminAuthError extends Error {}
export class AdminForbiddenError extends Error {}
export class AdminBackendError extends Error {}

interface AuthedContext {
  supabase: SupabaseClient;
  userId: string;
}

function asAuthedContext(context: unknown): AuthedContext {
  if (typeof context !== "object" || context === null) {
    throw new AdminAuthError("Sign in is required to use the admin console.");
  }
  const { supabase, userId } = context as Record<string, unknown>;
  if (!supabase || typeof userId !== "string" || userId.length === 0) {
    throw new AdminAuthError("Sign in is required to use the admin console.");
  }
  return { supabase: supabase as SupabaseClient, userId };
}

type ProfilesTable = Database["public"]["Tables"]["profiles"];
type EventsTable = Database["public"]["Tables"]["events"];
type AttendeesTable = Database["public"]["Tables"]["event_attendees"];
type OrganizersTable = Database["public"]["Tables"]["organizers"];
type EventTiersTable = Database["public"]["Tables"]["event_ticket_tiers"];
type SavedEventsTable = Database["public"]["Tables"]["saved_events"];
type TicketOrdersTable = Database["public"]["Tables"]["ticket_orders"];
type TicketItemsTable = Database["public"]["Tables"]["ticket_items"];

type AdminRolesRow = {
  user_id: string;
  role: string;
  granted_by: string | null;
  granted_at: string;
  note: string | null;
};

type AuditLogDbRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
};

type EventPromotionRow = {
  id: string;
  event_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
  created_by: string | null;
};

type EventReportRow = {
  id: string;
  event_id: string;
  reporter_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

// Local shape for the admin tables plus the tables we read. The generated
// Database types do not include admin_roles/audit_log/event_reports yet, so we
// extend the generated shape here instead of editing generated files. Every
// table keeps the full Row/Insert/Update/Relationships shape supabase-js needs
// to infer select() results. (The interface keeps its Phase 1 name to avoid
// churning every importer; it now also covers Phase 2 tables.)
export interface AdminPhase1Db {
  public: {
    Tables: {
      admin_roles: {
        Row: AdminRolesRow;
        Insert: {
          user_id: string;
          role: string;
          granted_by?: string | null;
          granted_at?: string;
          note?: string | null;
        };
        Update: {
          user_id?: string;
          role?: string;
          granted_by?: string | null;
          granted_at?: string;
          note?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogDbRow;
        Insert: {
          id?: string;
          created_at?: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Record<string, unknown>;
        };
        Update: {
          id?: string;
          created_at?: string;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          metadata?: Record<string, unknown>;
        };
        Relationships: [];
      };
      profiles: ProfilesTable;
      events: EventsTable;
      event_attendees: AttendeesTable;
      organizers: OrganizersTable;
      event_ticket_tiers: EventTiersTable;
      saved_events: SavedEventsTable;
      ticket_orders: TicketOrdersTable;
      ticket_items: TicketItemsTable;
      event_promotions: {
        Row: EventPromotionRow;
        Insert: {
          id?: string;
          event_id: string;
          starts_at: string;
          ends_at: string;
          status?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          starts_at?: string;
          ends_at?: string;
          status?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      event_reports: {
        Row: EventReportRow;
        Insert: {
          id?: string;
          event_id: string;
          reporter_id: string;
          reason: string;
          details?: string | null;
          status?: string;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          resolution_note?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          reporter_id?: string | null;
          reason?: string;
          details?: string | null;
          status?: string;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          resolution_note?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Database["public"]["Views"];
    Enums: Database["public"]["Enums"];
    CompositeTypes: Database["public"]["CompositeTypes"];
    Functions: {
      my_admin_role: { Args: Record<string, never>; Returns: string | null };
      grant_admin_role: {
        Args: { p_user_id: string; p_role: string; p_note?: string | null };
        Returns: null;
      };
      revoke_admin_role: { Args: { p_user_id: string }; Returns: null };
      resolve_event_report: {
        Args: {
          p_report_id: string;
          p_resolution: string;
          p_unpublish?: boolean;
          p_note?: string | null;
        };
        Returns: null;
      };
      create_event_promotion: {
        Args: { p_event_id: string; p_starts_at: string; p_ends_at: string };
        Returns: string;
      };
      cancel_event_promotion: {
        Args: { p_promotion_id: string };
        Returns: null;
      };
    };
  };
}

export function asAdminDb(client: SupabaseClient): SupabaseClient<AdminPhase1Db> {
  return client as unknown as SupabaseClient<AdminPhase1Db>;
}

// Reads the caller's OWN role. Returns null for ordinary users. Throws
// AdminBackendError when the RPC itself fails (for example the Phase 1
// migration has not been applied yet): that is a backend problem, not a
// silent denial, and the UI reports it honestly.
export async function getCallerRole(
  userClient: SupabaseClient,
): Promise<AdminRole | null> {
  const { data, error } = await asAdminDb(userClient).rpc("my_admin_role");
  if (error) {
    console.error("[admin] my_admin_role RPC failed:", error.message);
    throw new AdminBackendError(
      "The admin backend is not available yet. Apply the pending migration, then try again.",
    );
  }
  if (data === null || data === undefined) return null;
  if (!isAdminRole(data)) {
    console.error("[admin] my_admin_role returned an unknown role.");
    throw new AdminBackendError(
      "The admin backend returned an unexpected role. Please try again later.",
    );
  }
  return data;
}

export interface PermissionGrant {
  supabase: typeof supabaseAdmin;
  userClient: SupabaseClient;
  userId: string;
  role: AdminRole;
}

export async function requirePermission(
  context: unknown,
  permission: AdminPermission,
): Promise<PermissionGrant> {
  const ctx = asAuthedContext(context);
  const role = await getCallerRole(ctx.supabase);
  if (!role) {
    throw new AdminForbiddenError(
      "You do not have permission to access the admin console.",
    );
  }
  if (!roleHasPermission(role, permission)) {
    throw new AdminForbiddenError(
      `This action requires the ${permission} permission.`,
    );
  }
  return { supabase: supabaseAdmin, userClient: ctx.supabase, userId: ctx.userId, role };
}

function mapGrantRpcError(message: string): Error {
  if (message.includes("Only a super_admin")) {
    return new AdminForbiddenError("Only a super admin can manage roles.");
  }
  if (message.includes("own role")) {
    return new AdminForbiddenError("Administrators cannot change their own role.");
  }
  if (message.includes("last super_admin")) {
    return new AdminForbiddenError(
      "This is the last super admin account, so it cannot be removed.",
    );
  }
  if (message.includes("No such user")) {
    return new AdminAuthError("No user with that id or email exists.");
  }
  if (message.includes("not an administrator")) {
    return new AdminAuthError("That user is not an administrator.");
  }
  if (message.includes("Unknown admin role")) {
    return new AdminAuthError("Unknown admin role.");
  }
  console.error("[admin] role RPC failed:", message);
  return new AdminBackendError("Could not update the role. Please try again.");
}

export async function callGrantRoleRpc(
  userClient: SupabaseClient,
  input: { userId: string; role: AdminRole; note?: string | null },
): Promise<void> {
  const { error } = await asAdminDb(userClient).rpc("grant_admin_role", {
    p_user_id: input.userId,
    p_role: input.role,
    p_note: input.note ?? null,
  });
  if (error) throw mapGrantRpcError(error.message);
}

export async function callRevokeRoleRpc(
  userClient: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await asAdminDb(userClient).rpc("revoke_admin_role", {
    p_user_id: userId,
  });
  if (error) throw mapGrantRpcError(error.message);
}

function mapResolveRpcError(message: string): Error {
  if (message.includes("may resolve reports")) {
    return new AdminForbiddenError("Only moderation staff may resolve reports.");
  }
  if (message.includes("already resolved")) {
    return new AdminBackendError(
      "That report was already resolved. Refresh to see its current state.",
    );
  }
  if (message.includes("no longer exists")) {
    return new AdminBackendError("That report no longer exists.");
  }
  if (message.includes("too long")) {
    return new AdminBackendError(
      "The resolution note is too long (500 characters maximum).",
    );
  }
  if (message.includes("Unknown resolution")) {
    return new AdminBackendError("Unknown resolution.");
  }
  if (message.includes("cannot unpublish")) {
    return new AdminBackendError(
      "A dismissed report cannot unpublish an event. Resolve it as actioned instead.",
    );
  }
  console.error("[admin] resolve report RPC failed:", message);
  return new AdminBackendError("Could not resolve the report. Please try again.");
}

// Runs on the CALLER's own user client so auth.uid() attributes the audit row
// to the true staff actor and the resolution + unpublish + audit stay in one
// database transaction inside the RPC.
export async function callResolveReportRpc(
  userClient: SupabaseClient,
  input: { reportId: string; resolution: string; unpublish: boolean; note?: string | null },
): Promise<void> {
  const { error } = await asAdminDb(userClient).rpc("resolve_event_report", {
    p_report_id: input.reportId,
    p_resolution: input.resolution,
    p_unpublish: input.unpublish,
    p_note: input.note ?? null,
  });
  if (error) throw mapResolveRpcError(error.message);
}

function mapPromotionRpcError(message: string): Error {
  if (message.includes("may manage promotions")) {
    return new AdminForbiddenError("Only moderation staff may manage promotions.");
  }
  const friendly = friendlyPromotionError(message);
  if (friendly === PROMOTION_UNKNOWN_ERROR) {
    console.error("[admin] promotion RPC failed:", message);
  }
  return new AdminBackendError(friendly);
}

// Runs on the CALLER's own user client so auth.uid() attributes the audit row
// to the true staff actor and the schedule + audit stay in one database
// transaction inside the RPC.
export async function callCreatePromotionRpc(
  userClient: SupabaseClient,
  input: { eventId: string; startsAt: string; endsAt: string },
): Promise<string> {
  const { data, error } = await asAdminDb(userClient).rpc("create_event_promotion", {
    p_event_id: input.eventId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
  });
  if (error || !data) {
    if (error) throw mapPromotionRpcError(error.message);
    throw new AdminBackendError(PROMOTION_UNKNOWN_ERROR);
  }
  return data;
}

// Runs on the CALLER's own user client for the same attribution and atomicity
// reasons as creation.
export async function callCancelPromotionRpc(
  userClient: SupabaseClient,
  promotionId: string,
): Promise<void> {
  const { error } = await asAdminDb(userClient).rpc("cancel_event_promotion", {
    p_promotion_id: promotionId,
  });
  if (error) throw mapPromotionRpcError(error.message);
}
