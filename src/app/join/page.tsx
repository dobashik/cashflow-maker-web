import { redirect } from 'next/navigation';
import { JoinCommunityForm } from '@/components/JoinCommunityForm';
import { getAccessContext } from '@/lib/communityAccess';

export default async function JoinPage() {
    const access = await getAccessContext();
    if (access.hasAccess) redirect('/');
    return (
        <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 px-4 py-12">
            <JoinCommunityForm />
        </main>
    );
}
