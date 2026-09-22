# Connect Outrazo to Your Own Supabase (Manual Keys, Email/Password Only, New Project)

## Goal
Replace the current built-in backend with your own Supabase project, keeping every existing screen and behavior identical.

## What I need from you (in this order)

1. **In chat** (safe to paste):
   - Project URL — `https://xxxxxxxx.supabase.co`
   - Publishable (anon) key — starts with `sb_publishable_` or `eyJ...`
2. **Via a secure form I'll open** (never paste in chat):
   - Service role key — starts with `sb_secret_` or `eyJ...`

## Build steps (after you provide the keys)

1. **Store the service role key** in the project's encrypted secret store via the secure form.
2. **Point the app at your project** — update the Supabase environment variables (URL + publishable key for the browser, URL + publishable key + service role for server code) so all pages read from your project instead of the built-in backend. If the auto-managed variables refuse a manual override, I'll fall back to the one-click Connect Supabase authorization, which achieves the same result.
3. **Create the tables on your project** — I'll generate one ready-to-paste SQL file containing the full schema (profiles, organizers, events, event_attendees, saved_events, ticket_orders, ticket_items), the auto-create-profile trigger, row-security rules, and access grants. You run it once in your project's SQL Editor (Dashboard → SQL Editor → paste → Run). Your project is yours, so you have full dashboard access there.
4. **Turn on email/password sign-in** on your project (Authentication → Providers) — quick toggle, I'll give exact steps. Google sign-in is skipped per your choice; it can be added later.
5. **Set the site/redirect URLs** on your project so sign-in and sign-up return to the app: your Lovable preview/published domains (I'll list the exact values).
6. **Verify end to end** — sign up a fresh test account on your project, confirm the profile row is created automatically, exercise Explore → Event Details → Organizer → app pages, confirm public pages and saves still work, then delete the test account.
7. **Update Vercel** — give you the four environment variables to replace (URL + publishable key, browser and server) so the deployed site uses your backend too, then you redeploy.

## Notes

- Test accounts from the old built-in backend won't transfer; users sign up fresh on your project.
- All event/organizer content is demo data in the code — nothing to migrate.
- The current built-in backend stays in place until your project is verified, so nothing breaks mid-switch.

## Technical details

- Tables and policies mirror the existing schema exactly (same columns, same row-security: private records owner-only, events/organizers publicly readable when published).
- Client code is unchanged — only the project URL/keys it points at change.
- The `handle_new_user` trigger recreates the auto-profile behavior on your project.
