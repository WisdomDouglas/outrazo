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

// Local shape for the Phase 1 tables plus the tables we read. The generated
// Database types do not include admin_roles/audit_log yet, so we extend the
// generated shape here instead of editing generated files. Every table keeps
// the full Row/Insert/Update/Relationships shape supabase-js needs to infer
// select() results.
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
