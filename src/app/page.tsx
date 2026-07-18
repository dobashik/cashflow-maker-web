import { createClient } from "@/utils/supabase/server";
import { Dashboard } from "@/components/Dashboard";
import { SampleDashboard } from "@/components/SampleDashboard";
import { AccessPending } from "@/components/AccessPending";
import { getAccessContext } from "@/lib/communityAccess";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;

  // 権限がない状態でも、実データに触れない公開サンプル画面には戻れるようにする。
  if (params.preview === '1') {
    return <SampleDashboard />;
  }

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
