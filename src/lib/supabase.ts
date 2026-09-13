import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

/**
 * Normalizes the Supabase URL by trimming any extra path segments,
 * trailing slashes, or accidental subpaths (e.g. /rest/v1 or /dashboard).
 * Supabase client expects the origin root: https://<project-ref>.supabase.co
 */
function normalizeSupabaseUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    // Extract only protocol + host (origin), stripping any accidental /rest/v1 or /table paths
    return parsed.origin;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

const supabaseUrl = normalizeSupabaseUrl(rawUrl);
const supabaseAnonKey = rawKey;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http')
);

// Gracefully handle unconfigured credentials without throwing errors at import time
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;
