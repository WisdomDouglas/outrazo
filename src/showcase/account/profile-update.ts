// Pure profile-update validation (P4). The profile form and the server
// function share this so both enforce the same rules before touching the
// database (RLS still enforces self-only writes underneath).
import { z } from "zod";

import { isKnownStateName } from "@/showcase/discovery/locations";

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  location: z.string().trim().min(1),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export type ValidatedProfileUpdate =
  | { ok: true; value: ProfileUpdateInput }
  | { ok: false; error: string };

/** Validates raw form input into friendly, field-specific messages. */
export function validateProfileUpdate(input: { name: string; location: string }): ValidatedProfileUpdate {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "name") {
      return { ok: false, error: "Enter your name (2–60 characters)." };
    }
    return { ok: false, error: "Choose your state from the list." };
  }
  if (!isKnownStateName(parsed.data.location)) {
    return { ok: false, error: "Choose your state from the list." };
  }
  return { ok: true, value: parsed.data };
}
