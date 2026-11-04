// Pure event-identity helpers. Safe to import anywhere — UI, server
// functions, matching logic, and node tests — because this module touches
// no Supabase client, no browser APIs, and no environment variables.
const DATABASE_EVENT_ID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

/** True for real database rows (UUIDs); demo events use short string slugs. */
export const isDatabaseEventId = (id: string) => DATABASE_EVENT_ID.test(id);
