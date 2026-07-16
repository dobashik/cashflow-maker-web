import { redirect } from 'next/navigation';
import { OwnerAdminPanel } from '@/components/OwnerAdminPanel';
import { getOwnerCommunities } from '@/app/actions/communityActions';
import { getAccessContext } from '@/lib/communityAccess';

export const runtime = 'nodejs';

export default async function AdminPage() {
    const access = await getAccessContext();
    if (!access.authenticated) redirect('/');
    if (!access.isPlatformOwner) redirect('/');
    return <OwnerAdminPanel communities={await getOwnerCommunities()} />;
}
