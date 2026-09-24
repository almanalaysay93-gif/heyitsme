import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

export function getSupabaseClient() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured");
  }
  return createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);
}

export function getSupabaseAdminClient() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
  }
  // Server only: no browser session to keep or refresh.
  return createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
