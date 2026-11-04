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
  friendlyPricingError,
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

type PromotionPricingRow = {
  id: string;
  daily_amount_kobo: number;
  currency: string;
  effective_at: string;
  created_by: string | null;
  created_at: string;
};

type CommissionRateRow = {
  id: string;
  rate_pct: number | string;
  effective_at: string;
  created_by: string | null;
  created_at: string;
};

type OrganizerPayoutRow = {
  id: string;
  organizer_id: string;
  amount_kobo: number;
  currency: string;
  status: string;
  status_reason: string | null;
  reference: string | null;
  admin_note: string | null;
  created_by: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

type RewardSettingRow = {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
};

type PointsWalletRow = {
  user_id: string;
  balance_points: number;
  lifetime_earned_points: number;
  updated_at: string;
};

type PointsLedgerRow = {
  id: string;
  user_id: string;
  type: string;
  points: number;
  balance_after: number;
  ref_type: string | null;
  ref_id: string | null;
  description: string;
  naira_per_point: number | string | null;
  naira_amount_kobo: number | null;
  actor_id: string | null;
  created_at: string;
};

type UserBankDetailsRow = {
  user_id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  verified: boolean;
  updated_at: string;
};

type WithdrawalRequestRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  points: number;
  naira_per_point: number | string;
  naira_amount_kobo: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  account_last4: string;
  status: string;
  status_reason: string | null;
  paid_amount_kobo: number | null;
  paid_reference: string | null;
  paid_by: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

// Generated types predate finance: events lacks commission_pct and
// ticket_orders lacks the newer lifecycle columns, so both Rows are
// extended here (reads only; writes keep the generated shapes).
type EventsTableWithFinance = Omit<EventsTable, "Row"> & {
  Row: EventsTable["Row"] & { commission_pct: number | string | null };
};

type TicketOrdersTableWithFinance = Omit<TicketOrdersTable, "Row"> & {
  Row: TicketOrdersTable["Row"] & { paid_at: string | null; status_reason: string | null };
};

type PromotionOrderRow = {
  id: string;
  event_id: string;
  organizer_id: string;
  days: number;
  daily_amount_kobo: number;
  total_amount_kobo: number;
  currency: string;
  status: string;
  status_reason: string | null;
  provider: string;
  provider_reference: string;
  promotion_id: string | null;
  paid_at: string | null;
  created_at: string;
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
      events: EventsTableWithFinance;
      event_attendees: AttendeesTable;
      organizers: OrganizersTable;
      event_ticket_tiers: EventTiersTable;
      saved_events: SavedEventsTable;
      ticket_orders: TicketOrdersTableWithFinance;
      ticket_items: TicketItemsTable;
      commission_rates: {
        Row: CommissionRateRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      organizer_payouts: {
        Row: OrganizerPayoutRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      reward_settings: {
        Row: RewardSettingRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      points_wallets: {
        Row: PointsWalletRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      points_ledger: {
        Row: PointsLedgerRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_bank_details: {
        Row: UserBankDetailsRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      withdrawal_requests: {
        Row: WithdrawalRequestRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
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
      promotion_pricing: {
        Row: PromotionPricingRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      promotion_orders: {
        Row: PromotionOrderRow;
        Insert: never;
        Update: never;
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
      set_promotion_price: {
        Args: { p_daily_amount_kobo: number };
        Returns: string;
      };
      set_default_commission_pct: {
        Args: { p_rate_pct: number };
        Returns: string;
      };
      create_organizer_payout: {
        Args: { p_organizer_id: string; p_amount_kobo: number; p_admin_note?: string | null };
        Returns: string;
      };
      transition_organizer_payout: {
        Args: {
          p_payout_id: string;
          p_to_status: string;
          p_reference?: string | null;
          p_admin_note?: string | null;
        };
        Returns: null;
      };
      set_reward_setting: {
        Args: { p_key: string; p_value: unknown };
        Returns: null;
      };
      credit_points: {
        Args: {
          p_user_id: string;
          p_points: number;
          p_type: string;
          p_description?: string | null;
          p_naira_per_point?: number | null;
        };
        Returns: string;
      };
      transition_withdrawal: {
        Args: {
          p_request_id: string;
          p_to_status: string;
          p_reason?: string | null;
          p_reference?: string | null;
          p_paid_amount_kobo?: number | null;
        };
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

// Runs on the CALLER's own user client so auth.uid() attributes the pricing
// row and the audit entry to the true staff actor, and the internal RPC gate
// (super_admin/finance_admin) sees the real caller. The server function
// re-checks the promotions.pricing permission first; this RPC is the second,
// database-side lock on the same door.
export async function callSetPromotionPriceRpc(
  userClient: SupabaseClient,
  dailyKobo: number,
): Promise<string> {
  const { data, error } = await asAdminDb(userClient).rpc("set_promotion_price", {
    p_daily_amount_kobo: dailyKobo,
  });
  if (error || !data) {
    if (error) {
      if (error.message.includes("may manage promotion pricing")) {
        throw new AdminForbiddenError(
          "Only a super admin or finance admin may change promotion pricing.",
        );
      }
      const friendly = friendlyPricingError(error.message);
      if (friendly === "Could not save the new price. Please try again.") {
        console.error("[admin] set promotion price RPC failed:", error.message);
      }
      throw new AdminBackendError(friendly);
    }
    throw new AdminBackendError("Could not save the new price. Please try again.");
  }
  return data;
}

function mapFinanceGateError(message: string, fallback: string): Error {
  if (message.includes("may manage the commission default")) {
    return new AdminForbiddenError(
      "Only a super admin or finance admin may change the commission default.",
    );
  }
  if (message.includes("may record payouts") || message.includes("may move payouts")) {
    return new AdminForbiddenError(
      "Only a super admin or finance admin may record or move payouts.",
    );
  }
  if (message.includes("Sign in is required")) {
    return new AdminAuthError("Sign in is required to use the admin console.");
  }
  return new AdminBackendError(fallback);
}

export async function callSetCommissionDefaultRpc(
  userClient: SupabaseClient,
  ratePct: number,
): Promise<string> {
  const { data, error } = await asAdminDb(userClient).rpc("set_default_commission_pct", {
    p_rate_pct: ratePct,
  });
  if (error || !data) {
    if (error) {
      if (/commission default|super_admin or finance_admin|Sign in is required/i.test(error.message)) {
        if (error.message.includes("between 0 and 100")) {
          throw new AdminBackendError("Commission default must be between 0 and 100 percent.");
        }
        throw mapFinanceGateError(error.message, "Could not save the new default. Please try again.");
      }
      console.error("[admin] set commission default RPC failed:", error.message);
    }
    throw new AdminBackendError("Could not save the new default. Please try again.");
  }
  return data;
}

export async function callCreatePayoutRpc(
  userClient: SupabaseClient,
  organizerId: string,
  amountKobo: number,
  adminNote: string | null,
): Promise<string> {
  const { data, error } = await asAdminDb(userClient).rpc("create_organizer_payout", {
    p_organizer_id: organizerId,
    p_amount_kobo: amountKobo,
    p_admin_note: adminNote,
  });
  if (error || !data) {
    if (error) {
      if (error.message.includes("exceeds the available balance")) {
        throw new AdminBackendError("That payout exceeds the organizer's available balance.");
      }
      if (error.message.includes("Organizer not found")) {
        throw new AdminBackendError("Organizer not found.");
      }
      if (error.message.includes("above zero")) {
        throw new AdminBackendError("Payout amount must be above zero.");
      }
      if (/record payouts|Sign in is required/i.test(error.message)) {
        throw mapFinanceGateError(error.message, "Could not record the payout. Please try again.");
      }
      console.error("[admin] create payout RPC failed:", error.message);
    }
    throw new AdminBackendError("Could not record the payout. Please try again.");
  }
  return data;
}

export async function callTransitionPayoutRpc(
  userClient: SupabaseClient,
  payoutId: string,
  toStatus: string,
  reference: string | null,
  adminNote: string | null,
): Promise<void> {
  const { error } = await asAdminDb(userClient).rpc("transition_organizer_payout", {
    p_payout_id: payoutId,
    p_to_status: toStatus,
    p_reference: reference,
    p_admin_note: adminNote,
  });
  if (error) {
    if (error.message.includes("Payout not found")) {
      throw new AdminBackendError("Payout not found.");
    }
    if (error.message.includes("terminal and cannot move")) {
      throw new AdminBackendError("Paid and failed payouts cannot move.");
    }
    if (error.message.includes("transition is not allowed")) {
      throw new AdminBackendError("That payout transition is not allowed.");
    }
    if (error.message.includes("transfer reference")) {
      throw new AdminBackendError("Record the bank transfer reference before marking paid.");
    }
    if (error.message.includes("why the payout failed")) {
      throw new AdminBackendError("Record why the payout failed.");
    }
    if (/move payouts|Sign in is required/i.test(error.message)) {
      throw mapFinanceGateError(error.message, "Could not move the payout. Please try again.");
    }
    console.error("[admin] transition payout RPC failed:", error.message);
    throw new AdminBackendError("Could not move the payout. Please try again.");
  }
}

function mapRewardsGateError(message: string, fallback: string): Error {
  if (
    message.includes("may manage rewards settings") ||
    message.includes("may credit points") ||
    message.includes("may move withdrawals")
  ) {
    return new AdminForbiddenError(
      "Only a super admin or finance admin may manage rewards.",
    );
  }
  if (message.includes("Sign in is required")) {
    return new AdminAuthError("Sign in is required to use the admin console.");
  }
  return new AdminBackendError(fallback);
}

export async function callSetRewardSettingRpc(
  userClient: SupabaseClient,
  key: string,
  value: unknown,
): Promise<void> {
  const { error } = await asAdminDb(userClient).rpc("set_reward_setting", {
    p_key: key,
    p_value: value,
  });
  if (error) {
    if (error.message.includes("Unknown rewards setting")) {
      throw new AdminBackendError("Unknown rewards setting.");
    }
    if (/number above zero|true or false|number or empty/i.test(error.message)) {
      throw new AdminBackendError(error.message.replace("ERROR: ", ""));
    }
    if (/manage rewards settings|Sign in is required/i.test(error.message)) {
      throw mapRewardsGateError(error.message, "Could not save the setting. Please try again.");
    }
    console.error("[admin] set reward setting RPC failed:", error.message);
    throw new AdminBackendError("Could not save the setting. Please try again.");
  }
}

export async function callCreditPointsRpc(
  userClient: SupabaseClient,
  userId: string,
  points: number,
  type: string,
  description: string | null,
): Promise<string> {
  const { data, error } = await asAdminDb(userClient).rpc("credit_points", {
    p_user_id: userId,
    p_points: points,
    p_type: type,
    p_description: description,
  });
  if (error || !data) {
    if (error) {
      if (error.message.includes("User not found")) {
        throw new AdminBackendError("User not found.");
      }
      if (error.message.includes("exceeds the available balance")) {
        throw new AdminBackendError("That adjustment exceeds the available balance.");
      }
      if (error.message.includes("must not be zero")) {
        throw new AdminBackendError("Credit amount must not be zero.");
      }
      if (/credit points|Sign in is required/i.test(error.message)) {
        throw mapRewardsGateError(error.message, "Could not credit points. Please try again.");
      }
      console.error("[admin] credit points RPC failed:", error.message);
    }
    throw new AdminBackendError("Could not credit points. Please try again.");
  }
  return data;
}

export async function callTransitionWithdrawalRpc(
  userClient: SupabaseClient,
  requestId: string,
  toStatus: string,
  reason: string | null,
  reference: string | null,
  paidAmountKobo: number | null,
): Promise<void> {
  const { error } = await asAdminDb(userClient).rpc("transition_withdrawal", {
    p_request_id: requestId,
    p_to_status: toStatus,
    p_reason: reason,
    p_reference: reference,
    p_paid_amount_kobo: paidAmountKobo,
  });
  if (error) {
    if (error.message.includes("Withdrawal request not found")) {
      throw new AdminBackendError("Withdrawal request not found.");
    }
    if (error.message.includes("terminal and cannot move")) {
      throw new AdminBackendError("Paid, rejected, and cancelled withdrawals cannot move.");
    }
    if (error.message.includes("transition is not allowed")) {
      throw new AdminBackendError("That withdrawal transition is not allowed.");
    }
    if (error.message.includes("transfer reference")) {
      throw new AdminBackendError("Record the bank transfer reference before marking paid.");
    }
    if (error.message.includes("must match the approved withdrawal amount")) {
      throw new AdminBackendError("The recorded amount must match the approved withdrawal amount.");
    }
    if (error.message.includes("why the withdrawal was not paid")) {
      throw new AdminBackendError("Record why the withdrawal was not paid.");
    }
    if (/move withdrawals|Sign in is required/i.test(error.message)) {
      throw mapRewardsGateError(error.message, "Could not move the withdrawal. Please try again.");
    }
    console.error("[admin] transition withdrawal RPC failed:", error.message);
    throw new AdminBackendError("Could not move the withdrawal. Please try again.");
  }
}
