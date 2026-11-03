// Official-organizer rule (pure: no secrets, no network, no database).
//
// The organizer named exactly "Outrazo" is the platform's own organizer and
// earns the verification check everywhere its name renders. The rule is
// evaluated at render time from the live name, so renaming the organizer to
// anything else drops the badge automatically — no flag to update, no
// migration needed.
//
// NOTE: this intentionally does not use the admin-managed `verified` column
// (a separate platform-verification system with its own UI). The tradeoff is
// that any organizer renamed to exactly "Outrazo" also earns the check; gate
// this on the verified flag too if impersonation ever becomes a concern.
export const OUTRAZO_OFFICIAL_NAME = "Outrazo";

export function isOfficialOrganizerName(name: string | null | undefined): boolean {
  return (name ?? "").trim() === OUTRAZO_OFFICIAL_NAME;
}

/**
 * Organizer slug mirroring the create-event convention (name slug + owner
 * suffix), because organizers.slug is NOT NULL UNIQUE with no default.
 */
export function organizerSlug(name: string, ownerId: string): string {
  const stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "organizer";
  return `${stem}-${ownerId.slice(0, 8)}`;
}
