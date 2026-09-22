// External (customer-owned) Supabase project.
// Publishable/anon keys are public by design, so they are safe in the codebase.
// This file is NOT auto-generated — edit it to point the app at a different project.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

export const EXTERNAL_SUPABASE_URL =
  (import.meta.env['VITE_EXTERNAL_SUPABASE_URL'] as string | undefined) ??
  'https://ihydlkfmszqwrwryfztv.supabase.co';

export const EXTERNAL_SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env['VITE_EXTERNAL_SUPABASE_PUBLISHABLE_KEY'] as string | undefined) ??
  'sb_publishable_hXGyb6C1J2EYixc9qkk3zw_hldnXHKF';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New-format Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createExternalSupabaseClient() {
  return createClient<Database>(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(EXTERNAL_SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _client: ReturnType<typeof createExternalSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createExternalSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createExternalSupabaseClient();
    return Reflect.get(_client, prop, receiver);
  },
});
