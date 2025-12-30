"use server";


import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";



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
