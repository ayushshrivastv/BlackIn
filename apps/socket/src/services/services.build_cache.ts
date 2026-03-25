/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Contract } from '@lighthouse/database';
import crypto from 'crypto';

export default class BuildCache {
    static check_build_cache(contract: Contract) {
        if (contract.lastBuildStatus !== 'SUCCESS') return false;
        if (!contract.code || !contract.code.trim()) return false;
        const old_contract_hash = contract.codeHash;
        if (!old_contract_hash) return false;
        const current_state_hash = this.create_hash(contract.code);
        if (!current_state_hash) return false;
        return old_contract_hash === current_state_hash;
    }

    static create_hash(current_state: string | null): string | null {
        if (!current_state) {
            return null;
        }

        return crypto.createHash('md5').update(current_state).digest('hex');
    }
}
