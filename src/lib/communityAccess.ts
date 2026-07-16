import type { User } from '@supabase/supabase-js';

import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';
import { normalizeEmail } from '@/lib/inviteCodes';

export type CommunityRole = 'admin' | 'member';

export type MembershipSummary = {
    id: string;
    communityId: string;
    communityName: string;
    communityStatus: 'trial' | 'poc' | 'active' | 'suspended' | 'ended';
    role: CommunityRole;
    status: 'invited' | 'active' | 'revoked' | 'expired';
    accessExpiresAt: string | null;
};

export type AppAccessContext = {
    authenticated: boolean;
    hasAccess: boolean;
    isPlatformOwner: boolean;
    memberships: MembershipSummary[];
};

function configuredOwnerEmails(): Set<string> {
    return new Set(
        (process.env.PLATFORM_OWNER_EMAILS ?? '')
            .split(',')
            .map(normalizeEmail)
            .filter(Boolean),
    );
}

export async function getCurrentUser(): Promise<User | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function bootstrapConfiguredOwner(user: User): Promise<boolean> {
    const email = normalizeEmail(user.email ?? '');
    if (!email || !configuredOwnerEmails().has(email)) return false;

    const admin = createServiceRoleClient();
    const { error } = await admin
        .from('profiles')
        .update({ platform_role: 'owner', is_vip: true, last_seen_at: new Date().toISOString() })
        .eq('id', user.id);

    if (error) throw new Error(`オーナー権限の初期化に失敗しました: ${error.message}`);
    return true;
}

export async function getAccessContext(userOverride?: User | null): Promise<AppAccessContext> {
    const user = userOverride === undefined ? await getCurrentUser() : userOverride;
    if (!user) {
        return { authenticated: false, hasAccess: false, isPlatformOwner: false, memberships: [] };
    }

    await bootstrapConfiguredOwner(user);
    const admin = createServiceRoleClient();
    await admin.rpc('purge_expired_community_accounts');
    const [{ data: profile }, { data: rows, error }] = await Promise.all([
        admin.from('profiles').select('platform_role').eq('id', user.id).maybeSingle(),
        admin
            .from('community_members')
            .select('id, community_id, role, status, access_expires_at, communities(name, status, access_expires_at)')
            .eq('user_id', user.id),
    ]);

    if (error) throw new Error(`コミュニティ権限の取得に失敗しました: ${error.message}`);

    const now = Date.now();
    const memberships: MembershipSummary[] = (rows ?? []).map((row) => {
        const communityValue = row.communities as unknown;
        const community = (Array.isArray(communityValue) ? communityValue[0] : communityValue) as {
            name?: string;
            status?: MembershipSummary['communityStatus'];
            access_expires_at?: string | null;
        } | null;

        return {
            id: row.id,
            communityId: row.community_id,
            communityName: community?.name ?? 'コミュニティ',
            communityStatus: community?.status ?? 'ended',
            role: row.role as CommunityRole,
            status: row.status as MembershipSummary['status'],
            accessExpiresAt: row.access_expires_at,
        };
    });

    const hasActiveMembership = (rows ?? []).some((row) => {
        const communityValue = row.communities as unknown;
        const community = (Array.isArray(communityValue) ? communityValue[0] : communityValue) as {
            status?: string;
            access_expires_at?: string | null;
        } | null;
        const memberExpiry = row.access_expires_at ? new Date(row.access_expires_at).getTime() : Infinity;
        const communityExpiry = community?.access_expires_at
            ? new Date(community.access_expires_at).getTime()
            : Infinity;
        return row.status === 'active'
            && ['trial', 'poc', 'active'].includes(community?.status ?? '')
            && memberExpiry > now
            && communityExpiry > now;
    });

    const isPlatformOwner = profile?.platform_role === 'owner';
    await Promise.all([
        admin.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id),
        admin.from('community_members').update({ last_seen_at: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'active'),
    ]);
    return {
        authenticated: true,
        hasAccess: isPlatformOwner || hasActiveMembership,
        isPlatformOwner,
        memberships,
    };
}

export async function requirePlatformOwner(): Promise<{ user: User; context: AppAccessContext }> {
    const user = await getCurrentUser();
    if (!user) throw new Error('ログインが必要です');
    const context = await getAccessContext(user);
    if (!context.isPlatformOwner) throw new Error('プラットフォームオーナー権限が必要です');
    return { user, context };
}

export async function requireCommunityManager(communityId: string): Promise<{
    user: User;
    context: AppAccessContext;
    isPlatformOwner: boolean;
}> {
    const user = await getCurrentUser();
    if (!user) throw new Error('ログインが必要です');
    const context = await getAccessContext(user);
    const isCommunityAdmin = context.memberships.some(
        (membership) => membership.communityId === communityId
            && membership.role === 'admin'
            && membership.status === 'active',
    );
    if (!context.isPlatformOwner && !isCommunityAdmin) {
        throw new Error('このコミュニティを管理する権限がありません');
    }
    return { user, context, isPlatformOwner: context.isPlatformOwner };
}
