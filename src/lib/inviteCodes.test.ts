import { describe, expect, it } from 'vitest';

import { generateInviteCode, hashInviteCode, makeCodePrefix, parseEmailList } from './inviteCodes';

describe('parseEmailList', () => {
    it('extracts, normalizes and deduplicates emails from pasted text', () => {
        const input = 'Taro@Example.com, hanako@example.com\n"taro@example.com"\nnot-an-email';

        expect(parseEmailList(input)).toEqual(['taro@example.com', 'hanako@example.com']);
    });
});

describe('makeCodePrefix', () => {
    it('uses the ASCII part of the community name', () => {
        expect(makeCodePrefix('Dividend Club 2026')).toBe('DIVIDEND-CLUB-2026');
    });

    it('falls back when the name has no ASCII characters', () => {
        expect(makeCodePrefix('高配当株の会')).toBe('COMMUNITY');
    });
});

describe('generateInviteCode', () => {
    it('includes the prefix and kind and is not reused', () => {
        const code = generateInviteCode('CLUB', 'admin');

        expect(code).toMatch(/^CFM-CLUB-ADMIN-[0-9A-F]{20}$/);
        expect(generateInviteCode('CLUB', 'admin')).not.toBe(code);
    });
});

describe('hashInviteCode', () => {
    it('ignores case and surrounding spaces so users can type codes loosely', async () => {
        expect(await hashInviteCode(' cfm-club-member-abc ')).toBe(await hashInviteCode('CFM-CLUB-MEMBER-ABC'));
    });
});
