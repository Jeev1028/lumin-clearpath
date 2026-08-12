import { createClient, type SupportedStorage } from "@supabase/supabase-js";

// Reuses the main project's generated Supabase types directly (a type-only
// import that crosses the package boundary -- fine at compile time since
// it's erased entirely, no runtime dependency on the root project).
import type { Database } from "../../../src/integrations/supabase/types";

const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string;
const SUPABASE_KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;

/**
 * Supabase persists its session via a "storage" interface that defaults to
 * window.localStorage -- which technically exists on an extension popup
 * page, but popups are torn down and recreated on every open/close (not a
 * long-lived tab), so relying on it is riskier than it looks. chrome.storage.local
 * is the standard, explicitly-designed-for-this mechanism for extensions:
 * it persists independently of any specific page's lifecycle.
 */
const chromeStorage: SupportedStorage = {
  async getItem(key: string) {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  },
  async setItem(key: string, value: string) {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string) {
    await chrome.storage.local.remove(key);
  },
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: chromeStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
