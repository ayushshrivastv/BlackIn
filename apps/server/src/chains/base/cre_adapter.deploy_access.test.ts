/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseCreDeployAccessStatus } from './cre_deploy_access_parser';

const fixturesRoot = path.join(__dirname, '__fixtures__', 'deploy-access');

async function readFixture(name: string): Promise<string> {
    return fs.readFile(path.join(fixturesRoot, name), 'utf8');
}

describe('parseCreDeployAccessStatus', () => {
    it('parses whoami enabled output', async () => {
        const output = await readFixture('whoami-enabled.txt');
        assert.equal(parseCreDeployAccessStatus(output), 'enabled');
    });

    it('parses whoami disabled output', async () => {
        const output = await readFixture('whoami-disabled.txt');
        assert.equal(parseCreDeployAccessStatus(output), 'disabled');
    });

    it('parses account access enabled output', async () => {
        const output = await readFixture('account-access-enabled.txt');
        assert.equal(parseCreDeployAccessStatus(output), 'enabled');
    });

    it('parses account access disabled output', async () => {
        const output = await readFixture('account-access-disabled.txt');
        assert.equal(parseCreDeployAccessStatus(output), 'disabled');
    });

    it('returns unknown for non-matching output', async () => {
        const output = await readFixture('unknown.txt');
        assert.equal(parseCreDeployAccessStatus(output), 'unknown');
    });
});
