// Account server functions (P4). Thin bridge: proves WHO is calling,
// validates with the shared pure rules, then updates only the caller's own
// profile row on the caller's own RLS-scoped client.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateProfileUpdate } from "./profile-update";

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

const updateSchema = z.object({
  name: z.string(),
  location: z.string(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(updateSchema)
  .handler(async ({ data, context }): Promise<{ ok: true; name: string; location: string }> => {
    const ctx = context as { supabase?: SupabaseClient; userId?: unknown };
    if (!ctx.supabase || typeof ctx.userId !== "string" || ctx.userId.length === 0) {
      throw new AccountError("Sign in is required.");
    }
    const validated = validateProfileUpdate(data);
    if (!validated.ok) {
      throw new AccountError(validated.error);
    }
    try {
      const { error } = await ctx.supabase
        .from("profiles")
        .update({ name: validated.value.name, location: validated.value.location })
        .eq("id", ctx.userId);
      if (error) {
        console.error("[account] profile update failed", error);
        throw new AccountError("Could not save your profile. Please try again.");
      }
      return { ok: true, name: validated.value.name, location: validated.value.location };
    } catch (caught) {
      if (caught instanceof AccountError) throw caught;
      console.error("[account] unexpected failure", caught);
      throw new AccountError("Something went wrong. Please try again.");
    }
  });
