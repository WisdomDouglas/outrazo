// Pure rewards math + validation (Points V1). Shared by the wallet UI and
// the server functions so both enforce the same rules. The database RPCs
// re-check everything — these only shape friendly client behavior.
// Money: 1 point = ₦10 at the opening rate (100 points = ₦1,000).

export const OPENING_NAIRA_PER_POINT = 10;
export const OPENING_MIN_WITHDRAWAL_NAIRA = 3000;

/** Whole-kobo value of a points amount at the given rate. */
export function pointsToKobo(points: number, nairaPerPoint: number): number {
  if (!Number.isFinite(points) || !Number.isFinite(nairaPerPoint)) return 0;
  if (points <= 0 || nairaPerPoint <= 0) return 0;
  return Math.round(points * nairaPerPoint * 100);
}

/** Whole points affordable by a kobo amount (rounds down, never overpays). */
export function koboToPoints(kobo: number, nairaPerPoint: number): number {
  if (!Number.isFinite(kobo) || !Number.isFinite(nairaPerPoint)) return 0;
  if (kobo <= 0 || nairaPerPoint <= 0) return 0;
  return Math.floor(kobo / (nairaPerPoint * 100));
}

/** Minimum-withdrawal threshold expressed in points (rounds up, never under). */
export function minPointsForNaira(minNaira: number, nairaPerPoint: number): number {
  if (!Number.isFinite(minNaira) || !Number.isFinite(nairaPerPoint)) return 0;
  if (minNaira <= 0 || nairaPerPoint <= 0) return 0;
  return Math.ceil(minNaira / nairaPerPoint);
}

/** Last-four masking for ordinary UI views: "•••• 1234". */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/[^0-9]/g, "");
  if (digits.length < 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}

export type WithdrawalValidation =
  | { ok: true; value: { points: number } }
  | { ok: false; error: string };

/** Client-side withdrawal input check. The RPC enforces the same limits. */
export function validateWithdrawalInput(input: {
  points: number;
  balancePoints: number;
  minPoints: number;
  maxPoints: number | null;
}): WithdrawalValidation {
  const { points, balancePoints, minPoints, maxPoints } = input;
  if (!Number.isInteger(points) || points <= 0) {
    return { ok: false, error: "Enter a whole points amount above zero." };
  }
  if (points < minPoints) {
    return { ok: false, error: `The minimum withdrawal is ${minPoints.toLocaleString()} points.` };
  }
  if (maxPoints !== null && points > maxPoints) {
    return { ok: false, error: `The maximum withdrawal is ${maxPoints.toLocaleString()} points.` };
  }
  if (points > balancePoints) {
    return { ok: false, error: "That exceeds your available balance." };
  }
  return { ok: true, value: { points } };
}

// ── Withdrawal workflow (mirrors the SQL transition map) ───────────────────
// pending -> processing -> paid, with rejected and cancelled as exits.
// paid, rejected, and cancelled are terminal. The RPC enforces this; the UI
// uses this map only to decide which buttons to show.

export const WITHDRAWAL_STATUSES = [
  "pending",
  "processing",
  "paid",
  "rejected",
  "cancelled",
] as const;

export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

const WITHDRAWAL_TRANSITIONS: Record<WithdrawalStatus, readonly WithdrawalStatus[]> = {
  pending: ["processing", "rejected", "cancelled"],
  processing: ["paid", "rejected", "cancelled"],
  paid: [],
  rejected: [],
  cancelled: [],
};

export function isWithdrawalStatus(value: unknown): value is WithdrawalStatus {
  return (
    typeof value === "string" && (WITHDRAWAL_STATUSES as readonly string[]).includes(value)
  );
}

export function canTransitionWithdrawal(from: WithdrawalStatus, to: WithdrawalStatus): boolean {
  return (WITHDRAWAL_TRANSITIONS[from] ?? []).includes(to);
}

export function nextWithdrawalStatuses(from: WithdrawalStatus): WithdrawalStatus[] {
  return [...(WITHDRAWAL_TRANSITIONS[from] ?? [])];
}

// ── Nigerian bank list (withdrawal destination picker) ─────────────────────
// Curated major banks plus an escape hatch. Names are display labels only —
// the stored bank_name is free text validated for length, so a missing bank
// never blocks a withdrawal.

export const NIGERIAN_BANKS = [
  "Access Bank",
  "Citibank Nigeria",
  "Ecobank Nigeria",
  "Fidelity Bank",
  "First Bank of Nigeria",
  "First City Monument Bank",
  "Globus Bank",
  "Guaranty Trust Bank",
  "Heritage Bank",
  "Jaiz Bank",
  "Keystone Bank",
  "Kuda Bank",
  "Moniepoint MFB",
  "OPay Digital Services",
  "Palmpay",
  "Parallex Bank",
  "Polaris Bank",
  "Providus Bank",
  "Stanbic IBTC Bank",
  "Standard Chartered Bank",
  "Sterling Bank",
  "SunTrust Bank",
  "Titan Trust Bank",
  "Union Bank of Nigeria",
  "United Bank for Africa",
  "Unity Bank",
  "Wema Bank",
  "Zenith Bank",
] as const;

export const OTHER_BANK_OPTION = "Other (specify below)";
