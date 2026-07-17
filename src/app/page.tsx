import { createClient } from "@/utils/supabase/server";
import { Dashboard } from "@/components/Dashboard";
import { SampleDashboard } from "@/components/SampleDashboard";
import { AccessPending } from "@/components/AccessPending";
import { getAccessContext } from "@/lib/communityAccess";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const access = await getAccessContext(user);
    if (!access.hasAccess) {
      return <AccessPending />;
    }
    return <Dashboard />;
  }

  // Logged-out view: Sample Dashboard (Client Component with Auth/State)
  return <SampleDashboard />;
}
