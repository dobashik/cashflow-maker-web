import { AccessPending } from '@/components/AccessPending';

export const runtime = 'edge';

export default async function AccessPendingPage({
    searchParams,
}: {
    searchParams: Promise<{ message?: string }>;
}) {
    const params = await searchParams;
    return <AccessPending message={params.message} />;
}
