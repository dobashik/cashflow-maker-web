'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { createServiceRoleClient } from '@/utils/supabase/service-role';
import {
    generateInviteCode,
    hashInviteCode,
    isValidEmail,
    makeCodePrefix,
    normalizeEmail,
    parseEmailList,
} from '@/lib/inviteCodes';
import {
    getAccessContext,
    getCurrentUser,
    requireCommunityManager,
    requirePlatformOwner,
} from '@/lib/communityAccess';

const INVITE_COOKIE = 'cfm_invite_hash';

export type ActionResult<T = undefined> = {
    success: boolean;
    message: string;
    data?: T;
};

export type ManagedMember = {
    id: string;
    email: string;
    role: 'admin' | 'member';
    status: 'invited' | 'active' | 'revoked' | 'expired';
    accessExpiresAt: string | null;
    joinedAt: string | null;
    lastSeenAt: string | null;
    deleteAfter: string | null;
};

export type ManagedCommunity = {
    id: string;
    name: string;
    codePrefix: string;
    status: 'trial' | 'poc' | 'active' | 'suspended' | 'ended';
    maxMembers: number;
    accessStartsAt: string | null;
    accessExpiresAt: string | null;
    purgeAfter: string | null;
    activeCount: number;
    invitedCount: number;
    representativeEmail: string | null;
    memberInviteCode: string | null;
    memberInviteActive: boolean;
    members?: ManagedMember[];
};

function addMonths(base: Date, months: number): Date {
    const result = new Date(base);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
}

function audit(
    admin: ReturnType<typeof createServiceRoleClient>,
    actorUserId: string,
    communityId: string,
    action: string,
    targetEmail?: string,
    details: Record<string, unknown> = {},
) {
    return admin.from('community_admin_audit_logs').insert({
        actor_user_id: actorUserId,
        community_id: communityId,
        action,
        target_email: targetEmail ?? null,
        details,
    });
}

export async function getMyAccessContext() {
    return getAccessContext();
}

export async function beginInvitationRegistration(code: string): Promise<ActionResult<{
    communityName: string;
    kind: 'admin' | 'member';
}>> {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length < 20 || normalizedCode.length > 160) {
        return { success: false, message: '招待コードの形式が正しくありません' };
    }

    const admin = createServiceRoleClient();
    const codeHash = hashInviteCode(normalizedCode);
    const { data, error } = await admin
        .from('community_invite_codes')
        .select('kind, is_active, expires_at, max_uses, use_count, communities(name, status)')
        .eq('code_hash', codeHash)
        .maybeSingle();

    if (error || !data) return { success: false, message: '招待コードが見つかりません' };
    const communityValue = data.communities as unknown;
    const community = (Array.isArray(communityValue) ? communityValue[0] : communityValue) as {
        name?: string;
        status?: string;
    } | null;

    if (!data.is_active || ['suspended', 'ended'].includes(community?.status ?? '')) {
        return { success: false, message: 'この招待コードは現在利用できません' };
    }
    if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
        return { success: false, message: '招待コードの有効期限が切れています' };
    }
    if (data.use_count >= data.max_uses) {
        return { success: false, message: '招待コードの利用上限に達しています' };
    }

    const cookieStore = await cookies();
    cookieStore.set(INVITE_COOKIE, codeHash, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60,
    });

    return {
        success: true,
        message: `${community?.name ?? 'コミュニティ'}の招待コードを確認しました`,
        data: { communityName: community?.name ?? 'コミュニティ', kind: data.kind },
    };
}

export async function claimPendingInvitation(userId: string, email: string): Promise<ActionResult> {
    const cookieStore = await cookies();
    const invitationHash = cookieStore.get(INVITE_COOKIE)?.value;
    if (!invitationHash) return { success: false, message: '招待情報がありません' };

    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc('claim_community_invitation', {
        invitation_hash: invitationHash,
        claiming_user_id: userId,
        claiming_email: normalizeEmail(email),
    });
    cookieStore.delete(INVITE_COOKIE);

    if (error) return { success: false, message: `招待の登録に失敗しました: ${error.message}` };
    const result = data as { success?: boolean; message?: string } | null;
    return {
        success: result?.success === true,
        message: result?.message ?? '招待の登録結果を確認できませんでした',
    };
}

export async function createCommunity(input: {
    name: string;
    representativeEmail: string;
    maxMembers: number;
}): Promise<ActionResult<{ adminInviteCode: string; memberInviteCode: string }>> {
    const { user } = await requirePlatformOwner();
    const name = input.name.trim();
    const representativeEmail = normalizeEmail(input.representativeEmail);
    const maxMembers = Math.max(2, Math.min(200, Math.trunc(input.maxMembers || 100)));
    if (name.length < 2 || name.length > 100) return { success: false, message: 'コミュニティ名は2〜100文字で入力してください' };
    if (!isValidEmail(representativeEmail)) return { success: false, message: '代表者のメールアドレスが正しくありません' };

    const admin = createServiceRoleClient();
    const prefix = makeCodePrefix(name);
    const { data: community, error: communityError } = await admin
        .from('communities')
        .insert({ name, code_prefix: prefix, max_members: maxMembers, created_by: user.id })
        .select('id')
        .single();
    if (communityError || !community) return { success: false, message: `コミュニティの作成に失敗しました: ${communityError?.message ?? ''}` };

    const adminInviteCode = generateInviteCode(prefix, 'admin');
    const memberInviteCode = generateInviteCode(prefix, 'member');
    const inviteExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error: setupError } = await admin.from('community_members').insert({
        community_id: community.id,
        email: representativeEmail,
        role: 'admin',
        status: 'invited',
        invited_by: user.id,
    });
    if (!setupError) {
        const { error: inviteError } = await admin.from('community_invite_codes').insert([
            {
                community_id: community.id,
                kind: 'admin',
                code_value: adminInviteCode,
                code_hash: hashInviteCode(adminInviteCode),
                target_email: representativeEmail,
                max_uses: 1,
                expires_at: inviteExpiresAt,
                is_active: true,
                created_by: user.id,
            },
            {
                community_id: community.id,
                kind: 'member',
                code_value: memberInviteCode,
                code_hash: hashInviteCode(memberInviteCode),
                max_uses: maxMembers - 1,
                is_active: false,
                created_by: user.id,
            },
        ]);
        if (!inviteError) {
            await audit(admin, user.id, community.id, 'community_created', representativeEmail, { maxMembers });
            revalidatePath('/admin');
            return {
                success: true,
                message: 'コミュニティと招待コードを作成しました',
                data: { adminInviteCode, memberInviteCode },
            };
        }
    }

    await admin.from('communities').delete().eq('id', community.id);
    return { success: false, message: `コミュニティの初期設定に失敗しました: ${setupError?.message ?? ''}` };
}

async function loadManagedCommunities(communityIds?: string[]): Promise<ManagedCommunity[]> {
    const admin = createServiceRoleClient();
    let query = admin
        .from('communities')
        .select('id, name, code_prefix, status, max_members, access_starts_at, access_expires_at, purge_after')
        .order('created_at', { ascending: false });
    if (communityIds) {
        if (communityIds.length === 0) return [];
        query = query.in('id', communityIds);
    }
    const { data: communities, error } = await query;
    if (error) throw new Error(error.message);

    return Promise.all((communities ?? []).map(async (community) => {
        const [{ data: members }, { data: code }] = await Promise.all([
            admin
                .from('community_members')
                .select('id, email, role, status, access_expires_at, joined_at, last_seen_at, delete_after')
                .eq('community_id', community.id)
                .order('role')
                .order('email'),
            admin
                .from('community_invite_codes')
                .select('code_value, is_active')
                .eq('community_id', community.id)
                .eq('kind', 'member')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
        ]);
        const mappedMembers: ManagedMember[] = (members ?? []).map((member) => ({
            id: member.id,
            email: member.email,
            role: member.role,
            status: member.status,
            accessExpiresAt: member.access_expires_at,
            joinedAt: member.joined_at,
            lastSeenAt: member.last_seen_at,
            deleteAfter: member.delete_after,
        }));
        return {
            id: community.id,
            name: community.name,
            codePrefix: community.code_prefix,
            status: community.status,
            maxMembers: community.max_members,
            accessStartsAt: community.access_starts_at,
            accessExpiresAt: community.access_expires_at,
            purgeAfter: community.purge_after,
            activeCount: mappedMembers.filter((member) => member.status === 'active').length,
            invitedCount: mappedMembers.filter((member) => member.status === 'invited').length,
            representativeEmail: mappedMembers.find((member) => member.role === 'admin')?.email ?? null,
            memberInviteCode: code?.code_value ?? null,
            memberInviteActive: code?.is_active ?? false,
            members: mappedMembers,
        } satisfies ManagedCommunity;
    }));
}

export async function getOwnerCommunities(): Promise<ManagedCommunity[]> {
    await requirePlatformOwner();
    return loadManagedCommunities();
}

export async function getMyManagedCommunities(): Promise<ManagedCommunity[]> {
    const user = await getCurrentUser();
    if (!user) throw new Error('ログインが必要です');
    const context = await getAccessContext(user);
    if (context.isPlatformOwner) return loadManagedCommunities();
    const ids = context.memberships
        .filter((membership) => membership.role === 'admin' && membership.status === 'active')
        .map((membership) => membership.communityId);
    return loadManagedCommunities(ids);
}

export async function activateCommunityPoc(communityId: string): Promise<ActionResult> {
    const { user } = await requirePlatformOwner();
    return setCommunityPeriod(communityId, 3, 'poc', user.id, 'poc_activated');
}

export async function extendCommunityAccess(
    communityId: string,
    months: 1 | 3 | 12,
): Promise<ActionResult> {
    const { user } = await requirePlatformOwner();
    return setCommunityPeriod(communityId, months, 'active', user.id, 'contract_extended');
}

async function setCommunityPeriod(
    communityId: string,
    months: number,
    status: 'poc' | 'active',
    actorUserId: string,
    action: string,
): Promise<ActionResult> {
    const admin = createServiceRoleClient();
    const [{ data: community }, { data: allActiveRows }, { data: communityRows }] = await Promise.all([
        admin.from('communities').select('access_expires_at').eq('id', communityId).maybeSingle(),
        admin.from('community_members').select('user_id').eq('status', 'active').not('user_id', 'is', null),
        admin.from('community_members').select('user_id, status').eq('community_id', communityId),
    ]);
    if (!community) return { success: false, message: 'コミュニティが見つかりません' };
    const activeUsers = new Set((allActiveRows ?? []).map((row) => row.user_id).filter(Boolean));
    (communityRows ?? []).forEach((row) => {
        if (row.user_id && row.status === 'expired') activeUsers.add(row.user_id);
    });
    if (activeUsers.size > 200) {
        return { success: false, message: 'サービス全体の200ユーザー上限を超えるため延長できません' };
    }
    const currentExpiry = community.access_expires_at ? new Date(community.access_expires_at) : new Date();
    const base = currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
    const nextExpiry = addMonths(base, months).toISOString();
    const now = new Date().toISOString();

    const { error } = await admin
        .from('communities')
        .update({ status, access_starts_at: now, access_expires_at: nextExpiry, ended_at: null, purge_after: null })
        .eq('id', communityId);
    if (error) return { success: false, message: `利用期間の更新に失敗しました: ${error.message}` };

    await Promise.all([
        admin.from('community_members').update({ access_expires_at: nextExpiry, delete_after: null }).eq('community_id', communityId).in('status', ['invited', 'active']),
        admin.from('community_members').update({ status: 'active', access_expires_at: nextExpiry, delete_after: null }).eq('community_id', communityId).eq('status', 'expired').not('user_id', 'is', null),
        admin.from('community_members').update({ status: 'invited', access_expires_at: nextExpiry, delete_after: null }).eq('community_id', communityId).eq('status', 'expired').is('user_id', null),
        admin.from('community_invite_codes').update({ is_active: true, expires_at: nextExpiry }).eq('community_id', communityId).eq('kind', 'member'),
        audit(admin, actorUserId, communityId, action, undefined, { months, nextExpiry }),
    ]);
    revalidatePath('/admin');
    revalidatePath('/community-admin');
    return { success: true, message: `${months}か月分の利用期限を設定しました` };
}

export async function endCommunityAccess(communityId: string): Promise<ActionResult> {
    const { user } = await requirePlatformOwner();
    const admin = createServiceRoleClient();
    const now = new Date();
    const deleteAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await admin.from('communities').update({
        status: 'ended', ended_at: now.toISOString(), purge_after: deleteAfter,
    }).eq('id', communityId);
    if (error) return { success: false, message: error.message };
    await Promise.all([
        admin.from('community_invite_codes').update({ is_active: false }).eq('community_id', communityId),
        admin.from('community_members').update({ status: 'expired', delete_after: deleteAfter }).eq('community_id', communityId),
        audit(admin, user.id, communityId, 'community_ended', undefined, { deleteAfter }),
    ]);
    revalidatePath('/admin');
    return { success: true, message: 'コミュニティ全体を停止しました。データは30日後に削除対象になります。' };
}

export async function addCommunityMembers(communityId: string, rawInput: string): Promise<ActionResult<{
    added: number;
    skipped: number;
}>> {
    const { user } = await requireCommunityManager(communityId);
    const emails = parseEmailList(rawInput);
    if (emails.length === 0) return { success: false, message: '有効なメールアドレスが見つかりません' };
    if (emails.length > 200) return { success: false, message: '一度に登録できるのは200件までです' };

    const admin = createServiceRoleClient();
    const [{ data: community }, { data: existing }] = await Promise.all([
        admin.from('communities').select('max_members, access_expires_at').eq('id', communityId).single(),
        admin.from('community_members').select('id, email, role, status').eq('community_id', communityId),
    ]);
    if (!community) return { success: false, message: 'コミュニティが見つかりません' };
    const existingRows = existing ?? [];
    const existingByEmail = new Map(existingRows.map((row) => [row.email, row]));
    const newEmails = emails.filter((email) => !existingByEmail.has(email));
    const occupied = existingRows.filter((row) => row.status !== 'revoked' && row.status !== 'expired').length;
    if (occupied + newEmails.length > community.max_members) {
        return {
            success: false,
            message: `定員${community.max_members}名を超えます。現在${occupied}名、追加予定${newEmails.length}名です。`,
        };
    }

    if (newEmails.length > 0) {
        const { error } = await admin.from('community_members').insert(newEmails.map((email) => ({
            community_id: communityId,
            email,
            role: 'member',
            status: 'invited',
            access_expires_at: community.access_expires_at,
            invited_by: user.id,
        })));
        if (error) return { success: false, message: `会員の一括登録に失敗しました: ${error.message}` };
    }

    const restorable = emails.filter((email) => {
        const row = existingByEmail.get(email);
        return row?.role === 'member' && ['revoked', 'expired'].includes(row.status);
    });
    if (restorable.length > 0) {
        await admin.from('community_members').update({
            status: 'invited',
            access_expires_at: community.access_expires_at,
            revoked_at: null,
            delete_after: null,
        }).eq('community_id', communityId).in('email', restorable);
    }

    await audit(admin, user.id, communityId, 'members_bulk_added', undefined, {
        requested: emails.length,
        added: newEmails.length + restorable.length,
    });
    revalidatePath('/community-admin');
    revalidatePath('/admin');
    return {
        success: true,
        message: `${newEmails.length + restorable.length}名を登録しました`,
        data: { added: newEmails.length + restorable.length, skipped: emails.length - newEmails.length - restorable.length },
    };
}

export async function revokeCommunityMember(communityId: string, memberId: string): Promise<ActionResult> {
    const { user } = await requireCommunityManager(communityId);
    const admin = createServiceRoleClient();
    const { data: member } = await admin
        .from('community_members')
        .select('email, role')
        .eq('id', memberId)
        .eq('community_id', communityId)
        .maybeSingle();
    if (!member) return { success: false, message: '会員が見つかりません' };
    if (member.role === 'admin') return { success: false, message: '代表者はこの画面から停止できません' };
    const now = new Date();
    const deleteAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await admin.from('community_members').update({
        status: 'revoked', revoked_at: now.toISOString(), delete_after: deleteAfter,
    }).eq('id', memberId).eq('community_id', communityId);
    if (error) return { success: false, message: error.message };
    await audit(admin, user.id, communityId, 'member_revoked', member.email, { deleteAfter });
    revalidatePath('/community-admin');
    revalidatePath('/admin');
    return { success: true, message: '会員の利用権限を停止しました' };
}

export async function restoreCommunityMember(communityId: string, memberId: string): Promise<ActionResult> {
    const { user } = await requireCommunityManager(communityId);
    const admin = createServiceRoleClient();
    const [{ data: member }, { data: community }] = await Promise.all([
        admin.from('community_members').select('email, user_id, role').eq('id', memberId).eq('community_id', communityId).maybeSingle(),
        admin.from('communities').select('access_expires_at').eq('id', communityId).single(),
    ]);
    if (!member || member.role === 'admin') return { success: false, message: '対象の会員が見つかりません' };
    if (!community) return { success: false, message: 'コミュニティが見つかりません' };
    const status = member.user_id ? 'active' : 'invited';
    const { error } = await admin.from('community_members').update({
        status,
        access_expires_at: community.access_expires_at,
        revoked_at: null,
        delete_after: null,
    }).eq('id', memberId);
    if (error) return { success: false, message: error.message };
    await audit(admin, user.id, communityId, 'member_restored', member.email);
    revalidatePath('/community-admin');
    revalidatePath('/admin');
    return { success: true, message: '会員の利用権限を復旧しました' };
}

export async function rotateMemberInviteCode(communityId: string): Promise<ActionResult<{ code: string }>> {
    const { user } = await requireCommunityManager(communityId);
    const admin = createServiceRoleClient();
    const { data: community } = await admin.from('communities')
        .select('code_prefix, max_members, access_expires_at, status')
        .eq('id', communityId)
        .single();
    if (!community) return { success: false, message: 'コミュニティが見つかりません' };
    const code = generateInviteCode(community.code_prefix, 'member');
    await admin.from('community_invite_codes').update({ is_active: false })
        .eq('community_id', communityId).eq('kind', 'member');
    const { error } = await admin.from('community_invite_codes').insert({
        community_id: communityId,
        kind: 'member',
        code_value: code,
        code_hash: hashInviteCode(code),
        max_uses: Math.max(1, community.max_members - 1),
        expires_at: community.access_expires_at,
        is_active: ['poc', 'active'].includes(community.status),
        created_by: user.id,
    });
    if (error) return { success: false, message: error.message };
    await audit(admin, user.id, communityId, 'member_code_rotated');
    revalidatePath('/community-admin');
    revalidatePath('/admin');
    return { success: true, message: '会員用の共通コードを再発行しました', data: { code } };
}
