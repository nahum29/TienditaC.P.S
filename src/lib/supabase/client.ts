import { createBrowserClient } from "@supabase/ssr";

let supabaseClient: any = null;

// UUID fijo para operador único (sin autenticación)
export const OPERATOR_ID = "00000000-0000-0000-0000-000000000000";

export const createClient = () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!supabaseUrl || !supabaseKey) {
      console.warn(
        "Missing Supabase environment variables. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }

    supabaseClient = createBrowserClient(supabaseUrl, supabaseKey);
  }

  return supabaseClient;
};
