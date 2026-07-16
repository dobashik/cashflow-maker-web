import { createHash, randomBytes } from 'node:crypto';

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
    const randomPart = randomBytes(10).toString('hex').toUpperCase();
    return `CFM-${prefix}-${kind === 'admin' ? 'ADMIN' : 'MEMBER'}-${randomPart}`;
}

export function hashInviteCode(code: string): string {
    return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
