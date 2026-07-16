import { redirect } from 'next/navigation';
import { CommunityManagerPanel } from '@/components/CommunityManagerPanel';
import { getMyManagedCommunities } from '@/app/actions/communityActions';
import { getAccessContext } from '@/lib/communityAccess';

export const runtime = 'nodejs';

export default async function CommunityAdminPage({
    searchParams,
}: {
    searchParams: Promise<{ community?: string }>;
}) {
    const access = await getAccessContext();
    if (!access.authenticated || !access.hasAccess) redirect('/');
    const canManage = access.isPlatformOwner || access.memberships.some((membership) => membership.role === 'admin' && membership.status === 'active');
    if (!canManage) redirect('/');
    const params = await searchParams;
    return <CommunityManagerPanel communities={await getMyManagedCommunities()} selectedCommunityId={params.community} isPlatformOwner={access.isPlatformOwner} />;
}
