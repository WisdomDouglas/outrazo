// Pure payout-details validation (P2). Shared by the organizer form and
// the save server function so both enforce the same rules. Nigerian bank
// accounts use 10-digit NUBAN numbers.
import { z } from "zod";

export const payoutDetailsSchema = z.object({
  organizerId: z.string().uuid(),
  bankName: z.string().trim().min(2).max(80),
  accountNumber: z.string().trim().regex(/^[0-9]{10}$/),
  accountName: z.string().trim().min(2).max(100),
});

export type PayoutDetailsInput = z.infer<typeof payoutDetailsSchema>;

export type ValidatedPayoutDetails =
  | { ok: true; value: PayoutDetailsInput }
  | { ok: false; error: string };

/** Validates raw form input into friendly, field-specific messages. */
export function validatePayoutDetails(input: {
  organizerId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}): ValidatedPayoutDetails {
  const parsed = payoutDetailsSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const first = parsed.error.issues[0];
  const field = first?.path[0];
  if (field === "organizerId") {
    return { ok: false, error: "Choose which organizer profile these details belong to." };
  }
  if (field === "bankName") {
    return { ok: false, error: "Enter your bank's name." };
  }
  if (field === "accountNumber") {
    return { ok: false, error: "Enter your 10-digit account number." };
  }
  if (field === "accountName") {
    return { ok: false, error: "Enter the name on the account." };
  }
  return { ok: false, error: "Those details need a second look." };
}

/** Masks all but the last two digits for display outside the edit form. */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••••${digits.slice(-2)}`;
}
