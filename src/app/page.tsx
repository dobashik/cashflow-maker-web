import { createClient } from "@/utils/supabase/server";
import { Dashboard } from "@/components/Dashboard";
import { SampleDashboard } from "@/components/SampleDashboard";

export const runtime = "edge";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Logged-in view: Render Dashboard directly (includes Header and state)
    return <Dashboard />;
  }

  // Logged-out view: Sample Dashboard (Client Component with Auth/State)
  return <SampleDashboard />;
}
