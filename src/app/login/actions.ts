"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

export const runtime = "edge";

export async function login(email: string) {
  const supabase = await createClient();

  // Use the environment variable if available (e.g. for Vercel preview URLs usually not needed if configured correctly in Supabase, but good for manual overrides)
  // Or simply use the current origin if available from headers, but in Server Actions headers() might be needed for dynamic origin.
  // The user requested: NEXT_PUBLIC_BASE_URL (or origin) + /auth/callback

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  // Trim trailing slash if present to avoid double slashes
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${cleanBaseUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout error:", error);
    // You might want to handle this error, but usually for logout we just redirect
  }

  revalidatePath("/", "layout");
  redirect("/");
}
