/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Chain } from '@lighthouse/types';
import env from '../configs/config.env';

function parseFlag(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export function resolveRequestedChain(chain?: Chain): Chain {
    return chain ?? Chain.SOLANA;
}

export function isChainEnabled(chain: Chain): boolean {
    if (chain === Chain.BASE) {
        return parseFlag(env.SERVER_CHAIN_BASE_ENABLED);
    }

    // DISABLED - Solana chain (see /chains/solana).
    return parseFlag(env.SERVER_CHAIN_SOLANA_ENABLED);
}

export function assertChainEnabled(chain: Chain): void {
    if (!isChainEnabled(chain)) {
        throw new Error(`Chain ${chain} is currently disabled`);
    }
}

export function getChainRuntime(chain: Chain): Chain {
    assertChainEnabled(chain);
    return chain;
}
