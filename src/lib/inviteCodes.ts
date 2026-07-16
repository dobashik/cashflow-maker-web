export type InviteKind = 'admin' | 'member';

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function parseEmailList(input: string): string[] {
    const matches = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    return [...new Set(matches.map(normalizeEmail))].filter(isValidEmail);
}

export function makeCodePrefix(communityName: string): string {
    const ascii = communityName
        .normalize('NFKD')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toUpperCase()
        .slice(0, 18);

    return ascii || 'COMMUNITY';
}

export function generateInviteCode(prefix: string, kind: InviteKind): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(10));
    const randomPart = Array.from(randomBytes, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `CFM-${prefix}-${kind === 'admin' ? 'ADMIN' : 'MEMBER'}-${randomPart}`;
}

export async function hashInviteCode(code: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(code.trim().toUpperCase()),
    );
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
