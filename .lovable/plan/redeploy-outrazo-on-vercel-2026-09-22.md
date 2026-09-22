# Redeploy Outrazo on Vercel

No code changes are needed — the Vercel build setup (`vercel.json`, build script, output bundle) is already in the repo from the earlier fix. The only reason the Vercel deployment won't work is missing/updated environment variables and sign-in settings. Everything below is done in dashboards, not code.

## What you need

Your own Supabase project is now the backend:

- **Project URL**: `https://ihydlkfmszqwrwryfztv.supabase.co`
- **Publishable key**: `sb_publishable_hXGyb6C1J2EYixc9qkk3zw_hldnXHKF`
- **Your Vercel site URL**: e.g. `https://your-app.vercel.app` (find it in the Vercel dashboard → your project → Domains)

## What to do

### 1. Vercel — Project Settings → General
- Framework Preset: **Other** (the repo's `vercel.json` already sets the build command and output)

### 2. Vercel — Project Settings → Environment Variables
Add these four (Production + Preview), replacing any old values from the previous backend:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://ihydlkfmszqwrwryfztv.supabase.co` |
| `SUPABASE_URL` | `https://ihydlkfmszqwrwryfztv.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_hXGyb6C1J2EYixc9qkk3zw_hldnXHKF` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_hXGyb6C1J2EYixc9qkk3zw_hldnXHKF` |

### 3. Redeploy
- Vercel dashboard → Deployments → ⋯ on the latest → **Redeploy** (env var changes do not apply until a redeploy)

### 4. Allow your Vercel URL for sign-in
Send me your Vercel URL once the site is up and I'll add it to your Supabase project's allowed redirect addresses with the access token you already saved. Without this, email confirmation links and Google sign-in will fail on the Vercel domain.

## Optional

- **Google sign-in on your project**: currently off. If you want it, enable the Google provider in your Supabase dashboard (Authentication → Providers → Google) with a Google OAuth client — tell me and I'll walk you through it.
- **Revoke the access token** at supabase.com/dashboard/account/tokens once everything is confirmed working.

## Verification after redeploy

1. Site loads (not blank) at your Vercel URL
2. Landing → Explore → Event Details → Organizer all work
3. Sign up with a real email at `/auth`, confirm the email, land in `/app`
4. Sign out and back in

If the site is still blank after redeploy, check Vercel's build log for errors and send it to me.
