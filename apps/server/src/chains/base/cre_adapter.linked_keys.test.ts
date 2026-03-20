/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
    hasVerifiedLinkedOwnerAddress,
    parseCreLinkedOwnerRecords,
} from './cre_linked_keys_parser';

const fixturesRoot = path.join(__dirname, '__fixtures__', 'linked-keys');

async function readFixture(name: string): Promise<string> {
    return fs.readFile(path.join(fixturesRoot, name), 'utf8');
}

describe('parseCreLinkedOwnerRecords', () => {
    it('parses owner addresses and statuses', async () => {
        const output = await readFixture('list-key-success.txt');
        const records = parseCreLinkedOwnerRecords(output);
        assert.equal(records.length, 2);
        assert.equal(records[0].address, '0x1111111111111111111111111111111111111111');
        assert.equal(records[0].status, 'VERIFICATION_STATUS_SUCCESSFULL');
        assert.equal(records[1].address, '0x2222222222222222222222222222222222222222');
        assert.equal(records[1].status, 'VERIFICATION_STATUS_PENDING');
    });

    it('accepts missing status for backward compatibility', async () => {
        const output = await readFixture('list-key-no-status.txt');
        const records = parseCreLinkedOwnerRecords(output);
        assert.equal(records.length, 1);
        assert.equal(records[0].address, '0x3333333333333333333333333333333333333333');
        assert.equal(records[0].status, null);
    });
});

describe('hasVerifiedLinkedOwnerAddress', () => {
    it('returns true when linked owner is marked successful', async () => {
        const output = await readFixture('list-key-success.txt');
        assert.equal(
            hasVerifiedLinkedOwnerAddress(output, '0x1111111111111111111111111111111111111111'),
            true,
        );
    });

    it('returns false when owner exists but is not successful', async () => {
        const output = await readFixture('list-key-success.txt');
        assert.equal(
            hasVerifiedLinkedOwnerAddress(output, '0x2222222222222222222222222222222222222222'),
            false,
        );
    });

    it('returns false when owner address is not linked', async () => {
        const output = await readFixture('list-key-empty.txt');
        assert.equal(
            hasVerifiedLinkedOwnerAddress(output, '0x3333333333333333333333333333333333333333'),
            false,
        );
    });
});
